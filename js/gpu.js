// WebGPU device, the core simulation/render buffers, all pipelines, and the LOD index buffers.
// Everything is attached to the `gpu` namespace object by initGpu(); modules use it at runtime only.
import { GRID, PARTS } from './config.js';
import { WGSL_SIM, WGSL_PART_SIM, WGSL_SKY, WGSL_TERRAIN, WGSL_WATER, WGSL_MESH, WGSL_PART_DRAW, WGSL_BRIDGE } from './shaders.js';
import { Q } from './quality.js';
import { showErr } from './platform.js';

export const INST_BYTES = 80;          // one mesh instance: mat4 (64 B) + rgba tint (16 B)
export const VTX_BYTES = 36;           // MeshBuilder vertex: position, normal, colour (3 × f32 each)
export const BAND_ROWS = 32;           // rows of water state copied back to the CPU each frame
export const BAND_BYTES = BAND_ROWS * GRID.W * 16;
export const DEPTH_FMT = 'depth24plus';

export const gpu = {};

export async function initGpu(canvas) {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not available.\nUse Chrome/Edge 113+ (chrome://flags/#enable-unsafe-webgpu on Linux).');
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter found.');
  const device = await adapter.requestDevice();
  device.onuncapturederror = e => showErr('WebGPU error: ' + e.error.message);

  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  const { W, L } = GRID, N = W * L;
  const STOR = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  const UNI = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
  const VTX = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;

  const mkBuf = (size, usage) => device.createBuffer({ size, usage });
  const write = (buf, offset, data) => device.queue.writeBuffer(buf, offset, data);
  const instBuf = n => mkBuf(Math.max(INST_BYTES, n * INST_BYTES), VTX);
  const gpuMesh = mb => {
    const d = mb.data(), vbuf = mkBuf(d.byteLength, VTX);
    write(vbuf, 0, d);
    return { vbuf, count: mb.count };
  };

  // ---------- core buffers ----------
  const terrainBuf = mkBuf(N * 4, STOR), maskBuf = mkBuf(N * 4, STOR);
  const stateBufs = [0, 1, 2].map(() => mkBuf(N * 16, STOR));
  const kBufs = [0, 1, 2].map(() => mkBuf(N * 4, STOR));
  const simUBuf = mkBuf(112, UNI);
  const camUBuf = mkBuf(304, UNI);   // see the Cam struct in shaders.js
  const partUBuf = mkBuf(112, UNI);
  const partBuf = mkBuf(PARTS.count * 32, STOR);
  const staging = [0, 1].map(() => ({ buf: mkBuf(BAND_BYTES, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST), busy: false }));

  // terrain/water index buffers at three mesh densities. The grid vertex shaders derive (i, j)
  // from the vertex index over the full grid, so a coarser mesh is simply an index buffer that
  // skips vertices. Each is laid out one row of quads at a time, so a Z-range is a contiguous slice.
  const lods = [1, 2, 4].map(s => {
    const cols = Math.floor((W - 1) / s) + 1, rows = Math.floor((L - 1) / s) + 1;   // vertices per row / vertex rows
    const idx = new Uint32Array((cols - 1) * (rows - 1) * 6);
    return { s, cols, rows, idx, rowIdx: (cols - 1) * 6, buf: mkBuf(idx.byteLength, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST) };
  });

  // ---------- simulation pipelines ----------
  const simBGL = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
  ] });
  const simModule = device.createShaderModule({ code: WGSL_SIM });
  const simLayout = device.createPipelineLayout({ bindGroupLayouts: [simBGL] });
  const simPipes = ['advect', 'height', 'momentum'].map(ep =>
    device.createComputePipeline({ layout: simLayout, compute: { module: simModule, entryPoint: ep } }));
  const simBGs = [[0, 1], [1, 2], [2, 0]].map(([a, b]) => device.createBindGroup({ layout: simBGL, entries: [
    { binding: 0, resource: { buffer: simUBuf } },
    { binding: 1, resource: { buffer: terrainBuf } },
    { binding: 2, resource: { buffer: stateBufs[a] } },
    { binding: 3, resource: { buffer: stateBufs[b] } },
    { binding: 4, resource: { buffer: kBufs[a] } },
    { binding: 5, resource: { buffer: kBufs[b] } },
  ] }));

  // ---------- particle compute ----------
  const partBGL = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
  ] });
  const partPipe = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [partBGL] }),
    compute: { module: device.createShaderModule({ code: WGSL_PART_SIM }), entryPoint: 'psim' },
  });
  const partBG = device.createBindGroup({ layout: partBGL, entries: [
    { binding: 0, resource: { buffer: partUBuf } },
    { binding: 1, resource: { buffer: terrainBuf } },
    { binding: 2, resource: { buffer: stateBufs[0] } },
    { binding: 3, resource: { buffer: partBuf } },
  ] });

  // ---------- render pipelines ----------
  const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
  const renBGL = device.createBindGroupLayout({ entries: [0, 1, 2, 3, 4, 5].map(b => (
    { binding: b, visibility: VF, buffer: { type: b === 0 ? 'uniform' : 'read-only-storage' } })) });
  const renBG = device.createBindGroup({ layout: renBGL, entries: [
    { binding: 0, resource: { buffer: camUBuf } },
    { binding: 1, resource: { buffer: terrainBuf } },
    { binding: 2, resource: { buffer: stateBufs[0] } },
    { binding: 3, resource: { buffer: kBufs[0] } },
    { binding: 4, resource: { buffer: maskBuf } },
    { binding: 5, resource: { buffer: partBuf } },
  ] });
  const renLayout = device.createPipelineLayout({ bindGroupLayouts: [renBGL] });

  const alphaBlend = {
    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  };
  const sprayBlend = {
    color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
  };
  const mkRender = (code, vs, fs, opts = {}) => {
    const mod = device.createShaderModule({ code });
    return device.createRenderPipeline({
      layout: renLayout,
      vertex: { module: mod, entryPoint: vs, buffers: opts.buffers || [] },
      fragment: { module: mod, entryPoint: fs, targets: [{ format, blend: opts.blend }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: DEPTH_FMT, depthWriteEnabled: opts.depthWrite !== false, depthCompare: opts.depthCompare || 'less' },
    });
  };
  const meshBuffers = [
    { arrayStride: VTX_BYTES, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
      { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32x3' },
    ] },
    { arrayStride: INST_BYTES, stepMode: 'instance', attributes: [3, 4, 5, 6, 7].map((loc, k) =>
      ({ shaderLocation: loc, offset: k * 16, format: 'float32x4' })) },
  ];
  const pipes = {
    sky: mkRender(WGSL_SKY, 'vsSky', 'fsSky', { depthWrite: false, depthCompare: 'always' }),
    terrain: mkRender(WGSL_TERRAIN, 'vsTerrain', 'fsTerrain'),
    water: mkRender(WGSL_WATER, 'vsWater', 'fsWater', { blend: alphaBlend }),
    spray: mkRender(WGSL_PART_DRAW, 'vsPart', 'fsPart', { blend: sprayBlend, depthWrite: false }),
    mesh: mkRender(WGSL_MESH, 'vsMesh', 'fsMesh', { buffers: meshBuffers }),
    pickup: mkRender(WGSL_MESH, 'vsMesh', 'fsMeshFade', { buffers: meshBuffers, blend: alphaBlend, depthWrite: false }),
    // floating obstacles: opaque lighting, depth-written, but alpha-blended so they can fade out
    obst: mkRender(WGSL_MESH, 'vsMesh', 'fsMeshAlpha', { buffers: meshBuffers, blend: alphaBlend }),
    bridge: mkRender(WGSL_BRIDGE, 'vsBridge', 'fsBridge', { buffers: [meshBuffers[0]] }),
  };

  // ---------- canvas / depth ----------
  let depthTex = null;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, Q.dprCap);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    if (depthTex) depthTex.destroy();
    depthTex = device.createTexture({ size: [canvas.width, canvas.height], format: DEPTH_FMT, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    gpu.depthView = depthTex.createView();
  };

  Object.assign(gpu, {
    device, ctx, format, canvas,
    mkBuf, write, instBuf, gpuMesh,
    terrainBuf, maskBuf, stateBufs, kBufs, simUBuf, camUBuf, partUBuf, partBuf, staging, lods,
    simPipes, simBGs, partPipe, partBG, renBG, pipes,
    resize,
  });
  resize();
  addEventListener('resize', resize);
}

// pick the diagonal with the smaller height difference so ridges don't get a saw-tooth edge
export function fillTerrainIndex(b) {
  const { W } = GRID;
  for (const lod of gpu.lods) {
    const { s, cols, rows, idx } = lod;
    let qi = 0;
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * s * W + c * s, bi = a + s, cc = a + s * W, d = cc + s;
        if (Math.abs(b[a] - b[d]) <= Math.abs(b[bi] - b[cc])) idx.set([a, cc, bi, bi, cc, d], qi);
        else idx.set([a, cc, d, a, d, bi], qi);
        qi += 6;
      }
    }
    gpu.write(lod.buf, 0, idx);
  }
}