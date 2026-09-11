// WebGPU resource ownership: device, fixed-size buffers, pipelines, bind groups and uploaded meshes.
import { PARTS } from './config/index.js';
import { WGSL_SIM, WGSL_PART_SIM, WGSL_SKY, WGSL_TERRAIN, WGSL_WATER, WGSL_MESH, WGSL_PART_DRAW, WGSL_BRIDGE } from './shaders.js';
import { buildKayakParts, buildVegetationMeshes, buildCoinMesh, buildSparkMesh, buildDiamondMesh, buildMapMesh, buildRucksackMesh, buildObstacleMeshes } from './meshes.js';
import { W, L, N, Q } from './quality.js';

export const gpu = {};   // filled by initGpu()

export const INST_BYTES = 80;                // one instance: mat4 (64 B) + tint vec4 (16 B)
export const BAND_ROWS = 32;                 // rows of water state read back to the CPU each frame
export const SPARK_MAX = 160;
export const ARM_VERT_COUNT = 2 * 8 * 12;
export const KAYAK_PARTS = ['hull', 'cockpit', 'torso', 'head', 'paddle', 'arms'];
export const DEPTH_FMT = 'depth24plus';

export const mkBuf = (size, usage) => gpu.device.createBuffer({ size, usage });

const vertexUsage = () => GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;

export const instBuf = count => mkBuf(Math.max(1, count) * INST_BYTES, vertexUsage());

export function gpuMesh(mb) {
  const d = mb.data();
  const vbuf = mkBuf(d.byteLength, vertexUsage());
  gpu.device.queue.writeBuffer(vbuf, 0, d);
  return { vbuf, count: mb.count };
}

// grow-only registry of instance buffers keyed by mesh name
export function ensureInstBuf(registry, name, count) {
  const need = Math.max(1, count) * INST_BYTES;
  const cur = registry[name];
  if (cur && cur.size >= need) return cur;
  if (cur) cur.destroy();
  registry[name] = mkBuf(need, vertexUsage());
  return registry[name];
}

// grow-only Float32Array registry; callers must pass the live element count to writeBuffer's size
// since the returned array can be longer than what's filled this frame
const scratchPools = {};
export function ensureScratch(pool, name, floats) {
  const reg = scratchPools[pool] || (scratchPools[pool] = {});
  const cur = reg[name];
  if (cur && cur.length >= floats) return cur;
  return (reg[name] = new Float32Array(floats));
}

const mapValues = (obj, f) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, f(v)]));

export async function initGpu(canvas) {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not available.\nUse Chrome/Edge 113+ (chrome://flags/#enable-unsafe-webgpu on Linux).');
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter found.');
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });
  Object.assign(gpu, { device, canvas, ctx, format });

  createBuffers();
  createLods();
  createSimPipelines();
  createParticlePipeline();
  createRenderPipelines();
  uploadMeshes();
  return gpu;
}

function createBuffers() {
  const STORAGE = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  const UNIFORM = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
  gpu.terrainBuf = mkBuf(N * 4, STORAGE);
  gpu.maskBuf = mkBuf(N * 4, STORAGE);
  gpu.stateBufs = [0, 1, 2].map(() => mkBuf(N * 16, STORAGE));
  gpu.kBufs = [0, 1, 2].map(() => mkBuf(N * 4, STORAGE));
  gpu.simUBuf = mkBuf(112, UNIFORM);
  gpu.camUBuf = mkBuf(304, UNIFORM);   // see the Cam struct in shaders.js
  gpu.partUBuf = mkBuf(112, UNIFORM);
  gpu.partBuf = mkBuf(PARTS.count * 32, STORAGE);
  gpu.bandBytes = BAND_ROWS * W * 16;
  gpu.staging = [0, 1].map(() => ({
    buf: mkBuf(gpu.bandBytes, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST),
    busy: false,
  }));
  gpu.sparkBuf = instBuf(SPARK_MAX);
  gpu.armBuf = mkBuf(ARM_VERT_COUNT * 36, vertexUsage());
  gpu.kayakInst = Object.fromEntries(KAYAK_PARTS.map(k => [k, instBuf(1)]));
  gpu.obstInstBufs = {};   // per obstacle mesh name, grown by obstacles.js / landslides.js
}

// terrain/water index buffers at three mesh densities (a coarser mesh just skips vertices)
function createLods() {
  gpu.lods = [1, 2, 4].map(s => {
    const cols = Math.floor((W - 1) / s) + 1, rows = Math.floor((L - 1) / s) + 1;
    const idx = new Uint32Array((cols - 1) * (rows - 1) * 6);
    const buf = mkBuf(idx.byteLength, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST);
    return { s, cols, rows, idx, rowIdx: (cols - 1) * 6, buf };
  });
}

// triangulate each quad along its flatter diagonal for the given heightfield
export function fillTerrainIndex(b) {
  for (const lod of gpu.lods) {
    const { s, cols, rows, idx } = lod;
    let qi = 0;
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * s * W + c * s, bi = a + s, cc = a + s * W, d = cc + s;
        const tris = Math.abs(b[a] - b[d]) <= Math.abs(b[bi] - b[cc])
          ? [a, cc, bi, bi, cc, d]
          : [a, cc, d, a, d, bi];
        idx.set(tris, qi);
        qi += 6;
      }
    }
    gpu.device.queue.writeBuffer(lod.buf, 0, idx);
  }
}

function createSimPipelines() {
  const { device } = gpu;
  const C = GPUShaderStage.COMPUTE;
  const simBGL = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: C, buffer: { type: 'uniform' } },
    { binding: 1, visibility: C, buffer: { type: 'read-only-storage' } },
    { binding: 2, visibility: C, buffer: { type: 'read-only-storage' } },
    { binding: 3, visibility: C, buffer: { type: 'storage' } },
    { binding: 4, visibility: C, buffer: { type: 'read-only-storage' } },
    { binding: 5, visibility: C, buffer: { type: 'storage' } },
  ] });
  const module = device.createShaderModule({ code: WGSL_SIM });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [simBGL] });
  gpu.simPipes = ['advect', 'height', 'momentum'].map(entryPoint =>
    device.createComputePipeline({ layout, compute: { module, entryPoint } }));
  // three ping-pong bind groups: state a → b, with the k buffers alongside
  gpu.simBGs = [[0, 1], [1, 2], [2, 0]].map(([a, b]) => device.createBindGroup({ layout: simBGL, entries: [
    { binding: 0, resource: { buffer: gpu.simUBuf } },
    { binding: 1, resource: { buffer: gpu.terrainBuf } },
    { binding: 2, resource: { buffer: gpu.stateBufs[a] } },
    { binding: 3, resource: { buffer: gpu.stateBufs[b] } },
    { binding: 4, resource: { buffer: gpu.kBufs[a] } },
    { binding: 5, resource: { buffer: gpu.kBufs[b] } },
  ] }));
}

function createParticlePipeline() {
  const { device } = gpu;
  const C = GPUShaderStage.COMPUTE;
  const partBGL = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: C, buffer: { type: 'uniform' } },
    { binding: 1, visibility: C, buffer: { type: 'read-only-storage' } },
    { binding: 2, visibility: C, buffer: { type: 'read-only-storage' } },
    { binding: 3, visibility: C, buffer: { type: 'storage' } },
  ] });
  gpu.partPipe = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [partBGL] }),
    compute: { module: device.createShaderModule({ code: WGSL_PART_SIM }), entryPoint: 'psim' },
  });
  gpu.partBG = device.createBindGroup({ layout: partBGL, entries: [
    { binding: 0, resource: { buffer: gpu.partUBuf } },
    { binding: 1, resource: { buffer: gpu.terrainBuf } },
    { binding: 2, resource: { buffer: gpu.stateBufs[0] } },
    { binding: 3, resource: { buffer: gpu.partBuf } },
  ] });
}

function createRenderPipelines() {
  const { device, format } = gpu;
  const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
  const renBGL = device.createBindGroupLayout({ entries: [0, 1, 2, 3, 4, 5].map(b => (
    { binding: b, visibility: VF, buffer: { type: b === 0 ? 'uniform' : 'read-only-storage' } })) });
  gpu.renBG = device.createBindGroup({ layout: renBGL, entries: [
    { binding: 0, resource: { buffer: gpu.camUBuf } },
    { binding: 1, resource: { buffer: gpu.terrainBuf } },
    { binding: 2, resource: { buffer: gpu.stateBufs[0] } },
    { binding: 3, resource: { buffer: gpu.kBufs[0] } },
    { binding: 4, resource: { buffer: gpu.maskBuf } },
    { binding: 5, resource: { buffer: gpu.partBuf } },
  ] });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [renBGL] });

  const alphaBlend = {
    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  };
  const sprayBlend = {
    color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
  };
  const meshBuffers = [
    { arrayStride: 36, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
      { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32x3' },
    ] },
    { arrayStride: INST_BYTES, stepMode: 'instance',
      attributes: [3, 4, 5, 6, 7].map((loc, k) => ({ shaderLocation: loc, offset: k * 16, format: 'float32x4' })) },
  ];

  const mkRender = (code, vs, fs, opts = {}) => {
    const module = device.createShaderModule({ code });
    return device.createRenderPipeline({
      layout,
      vertex: { module, entryPoint: vs, buffers: opts.buffers || [] },
      fragment: { module, entryPoint: fs, targets: [{ format, blend: opts.blend }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        format: DEPTH_FMT,
        depthWriteEnabled: opts.depthWrite !== false,
        depthCompare: opts.depthCompare || 'less',
      },
    });
  };

  gpu.skyPipe = mkRender(WGSL_SKY, 'vsSky', 'fsSky', { depthWrite: false, depthCompare: 'always' });
  gpu.terrainPipe = mkRender(WGSL_TERRAIN, 'vsTerrain', 'fsTerrain');
  gpu.waterPipe = mkRender(WGSL_WATER, 'vsWater', 'fsWater', { blend: alphaBlend });
  gpu.sprayPipe = mkRender(WGSL_PART_DRAW, 'vsPart', 'fsPart', { blend: sprayBlend, depthWrite: false });
  gpu.meshPipe = mkRender(WGSL_MESH, 'vsMesh', 'fsMesh', { buffers: meshBuffers });
  gpu.pickupPipe = mkRender(WGSL_MESH, 'vsMesh', 'fsMeshFade', { buffers: meshBuffers, blend: alphaBlend, depthWrite: false });
  // floating obstacles: opaque lighting, depth-written, but alpha-blended so they can fade out
  gpu.obstPipe = mkRender(WGSL_MESH, 'vsMesh', 'fsMeshAlpha', { buffers: meshBuffers, blend: alphaBlend });
  gpu.bridgePipe = mkRender(WGSL_BRIDGE, 'vsBridge', 'fsBridge', { buffers: [meshBuffers[0]] });
}

function uploadMeshes() {
  gpu.vegMeshes = mapValues(buildVegetationMeshes(), gpuMesh);
  gpu.kayakMeshes = mapValues(buildKayakParts(), gpuMesh);
  gpu.pickupMeshes = {
    paddle: gpu.kayakMeshes.paddle,
    coin: gpuMesh(buildCoinMesh()),
    diamond: gpuMesh(buildDiamondMesh()),
    map: gpuMesh(buildMapMesh()),
    rucksack: gpuMesh(buildRucksackMesh()),
  };
  // keeps each mesh's nominal metres so an instance can be uniformly scaled and get physics numbers from that
  gpu.obstMeshes = mapValues(buildObstacleMeshes(), v =>
    ({ ...gpuMesh(v.mb), len: v.len, rad: v.rad, draft: v.draft, vrad: v.vrad, vol: v.vol }));
  gpu.sparkMesh = gpuMesh(buildSparkMesh());
}

export function resize() {
  const { canvas, device } = gpu;
  const dpr = Math.min(devicePixelRatio || 1, Q.dprCap);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  if (gpu.depthTex) gpu.depthTex.destroy();
  gpu.depthTex = device.createTexture({
    size: [canvas.width, canvas.height], format: DEPTH_FMT, usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  gpu.depthView = gpu.depthTex.createView();
}