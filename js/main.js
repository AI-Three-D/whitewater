'use strict';
import { GRID, SIM, RENDER, BIOME_SKY, PARTS, VEG, QUALITY, QUALITY_LEVELS, KAYAK, RIVERS, RIVERS_HIDDEN, TIERS, PICKUPS, COLLECTIBLES, SPECIAL_ITEMS, MAP_ITEM, RUCKSACK, OBSTACLES, CHARACTERS, CRAFTS, ITEMS, UPGRADES, RIVER_PACKS, STORE_LISTING, STAMINA, SKILL, BIOMES, BIOME_IDS, MOBILE } from './config.js';


import { WGSL_SIM, WGSL_PART_SIM, WGSL_SKY, WGSL_TERRAIN, WGSL_WATER, WGSL_MESH, WGSL_PART_DRAW } from './shaders.js';
import { v3, qMul, qConj, qNorm, qRotate, qAxisAngle, qFromRotVec,
  mat4Perspective, mat4LookAt, mat4Mul, mat4Invert, mat4Compose, mat4TRS, mat4Transform,
  mulberry32, clamp, smoothstep } from './math.js';
import { generateRiver, nearestChan } from './river.js';
import { MeshBuilder, addCylinder, buildKayakParts, buildVegetationMeshes, buildCoinMesh, buildSparkMesh, buildDiamondMesh, buildMapMesh, buildRucksackMesh, buildObstacleMeshes } from './meshes.js';
import { loadProfile, newProfile, clearProfile, character, canRaise, anyRaisable,
  awardRun, spendPoint, discardPending, pointsForLevel, unlockHidden,
  craftOf, itemCount, canBuyItem, canBuyCraft, buyItem, buyCraft, selectCraft, useItem,
  ownsUpgrade, canBuyUpgrade, buyUpgrade, canHeal, healInjury, applyInjury,
  ownsPack, canBuyPack, buyPack, riverUnlocked } from './progression.js';

const showErr = t => { const el = document.getElementById('err'); el.style.display = 'flex'; el.textContent = t; };
addEventListener('error', e => showErr('Script error: ' + e.message + ' (line ' + e.lineno + ')'));
addEventListener('unhandledrejection', e => showErr('Promise error: ' + ((e.reason && e.reason.stack) || e.reason)));
const $ = id => document.getElementById(id);
// bumped by hand on every edit — lets a stale/cached page or a not-yet-reloaded tab be spotted
// on sight instead of chasing "am I even testing the current code" through several rounds
const BUILD = 'build 28';
{ const v = document.getElementById('ver'); if (v) v.textContent = BUILD; }
// ---------- platform ----------
// modern-browser signals only: a touch screen (maxTouchPoints) whose primary pointer is coarse
// (a finger) or that cannot hover. A touch-screen laptop driven by a mouse/trackpad reports a
// fine, hovering primary pointer and stays in desktop mode. MOBILE.force (config.js) overrides
// the detection so the touch/tilt controls can be developed on a desktop.
const isMobile = MOBILE.force || (navigator.maxTouchPoints > 0 &&
  (matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches));
document.body.classList.add(isMobile ? 'mobile' : 'desktop');

// ---------- device tilt → lean (mobile) ----------
// deviceorientation reports beta/gamma in the device's natural (portrait) frame. Reading gamma
// (portrait) or beta (landscape) directly is unreliable near the gimbal singularity at
// gamma = ±90° — exactly where a phone held up in landscape sits. So: rebuild the world "up"
// vector in device coordinates (alpha/compass drops out), rotate it into the screen's frame with
// screen.orientation.angle and take the roll about the viewing axis. Stable in any orientation,
// flat on a table or held upright.
const gyro = {
  supported: typeof DeviceOrientationEvent !== 'undefined',
  active: false, requesting: false, rollRaw: 0, offset: 0, lastEvent: -1e9,
  request() {                // call synchronously from inside a user gesture — iOS shows a permission prompt
    if (!this.supported || this.active || this.requesting) return;
    const start = () => { addEventListener('deviceorientation', e => this.onOrient(e)); this.active = true; this.requesting = false; };
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      this.requesting = true;
      DeviceOrientationEvent.requestPermission()
        .then(r => { if (r === 'granted') start(); else this.requesting = false; })
        .catch(() => { this.requesting = false; });
    } else start();
  },
  onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    const b = e.beta * Math.PI / 180, c = e.gamma * Math.PI / 180;
    // world up in device coords = third row of Rz(α)·Rx(β)·Ry(γ); α cancels out
    const ux = -Math.cos(b) * Math.sin(c), uy = Math.sin(b), uz = Math.cos(b) * Math.cos(c);
    const deg = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;   // screen rotated CCW from natural
    const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const sx = ux * ca - uy * sa, sy = ux * sa + uy * ca;   // up, in screen coords (x right, y up)
    this.rollRaw = Math.atan2(sx, Math.hypot(sy, uz));      // > 0: the screen's left edge is lower
    this.lastEvent = performance.now();
  },
  live() { return this.active && performance.now() - this.lastEvent < 2000; },
  calibrate() { this.offset = MOBILE.calibrateOnStart ? this.rollRaw : 0; },
  lean() {                   // -1 … 1, +1 = lean left (same sign as the A key)
    if (!this.live()) return 0;
    const d = (this.rollRaw - this.offset) * 180 / Math.PI * (MOBILE.tiltInvert ? -1 : 1);
    const m = (Math.abs(d) - MOBILE.tiltDead) / Math.max(1e-3, MOBILE.tiltMax - MOBILE.tiltDead);
    return clamp(m, 0, 1) * Math.sign(d);
  },
};
// ---------- detail level ----------

const QKEY = 'whitewater.quality';
const loadQuality = () => { const q = localStorage.getItem(QKEY); return QUALITY_LEVELS.includes(q) ? q : null; };
const saveQuality = q => localStorage.setItem(QKEY, q);
let quality = loadQuality() || 'high';
function applyQuality(q) {
  const Q = QUALITY[q];
  Object.assign(GRID, Q.grid);
  PARTS.count = Q.particles; PARTS.kayakShare = Q.kayakShare;
  VEG.caps = Q.veg.caps; VEG.attempts = Q.veg.attempts;
  SIM.warmupSteps = Q.warmupSteps; SIM.macCormack = Q.macCormack; SIM.turbA = Q.turbA; SIM.substeps = Q.substeps;
  RENDER.viewAhead = Q.viewAhead ?? RENDER.viewAhead;
  RENDER.viewBehind = Q.viewBehind ?? RENDER.viewBehind;
  RENDER.computeAhead = Q.computeAhead ?? RENDER.computeAhead;
  RENDER.computeBehind = Q.computeBehind ?? RENDER.computeBehind;
  RENDER.fogDensity = Q.fogDensity ?? RENDER.fogDensity;
  RENDER.lod = Q.lod ?? { near: 1e9, mid: 1e9 };
}
applyQuality(quality);

(async function main() {
  const fail = t => { showErr(t); $('menu').style.display = 'none'; };
  if (!navigator.gpu) return fail('WebGPU is not available.\nUse Chrome/Edge 113+ (chrome://flags/#enable-unsafe-webgpu on Linux).');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return fail('No WebGPU adapter found.');
  const device = await adapter.requestDevice();
  device.onuncapturederror = e => showErr('WebGPU error: ' + e.error.message);
  device.lost.then(i => fail('WebGPU device lost: ' + i.message));
  const canvas = $('c');
  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });
  const { W, L, dx } = GRID, N = W * L;
  const mkBuf = (size, usage) => device.createBuffer({ size, usage });
  const STOR = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  const terrainBuf = mkBuf(N * 4, STOR), maskBuf = mkBuf(N * 4, STOR);
  const stateBufs = [0, 1, 2].map(() => mkBuf(N * 16, STOR));
  const kBufs = [0, 1, 2].map(() => mkBuf(N * 4, STOR));
  const simUBuf = mkBuf(112, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const camUBuf = mkBuf(272, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const partUBuf = mkBuf(112, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const partBuf = mkBuf(PARTS.count * 32, STOR);
  const BAND_ROWS = 32, BAND_BYTES = BAND_ROWS * W * 16;
  const staging = [0, 1].map(() => ({ buf: mkBuf(BAND_BYTES, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST), busy: false }));
  const band = { ready: false, j0: 0, data: new Float32Array(BAND_ROWS * W * 4) };
  // terrain/water index buffers at three mesh densities. The grid vertex shaders derive (i, j)
  // from the vertex index over the full grid, so a coarser mesh is simply an index buffer that
  // skips vertices. Each is laid out one row of quads at a time, so a Z-range is a contiguous slice.
  const lods = [1, 2, 4].map(s => {
    const cols = Math.floor((W - 1) / s) + 1, rows = Math.floor((L - 1) / s) + 1;   // vertices per row / vertex rows
    const idx = new Uint32Array((cols - 1) * (rows - 1) * 6);
    return { s, cols, rows, idx, rowIdx: (cols - 1) * 6, buf: mkBuf(idx.byteLength, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST) };
  });
  function fillTerrainIndex(b) {
    for (const lod of lods) {
      const { s, cols, rows, idx } = lod; let qi = 0;
      for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
        const a = r * s * W + c * s, bi = a + s, cc = a + s * W, d = cc + s;
        if (Math.abs(b[a] - b[d]) <= Math.abs(b[bi] - b[cc])) { idx[qi++] = a; idx[qi++] = cc; idx[qi++] = bi; idx[qi++] = bi; idx[qi++] = cc; idx[qi++] = d; }
        else { idx[qi++] = a; idx[qi++] = cc; idx[qi++] = d; idx[qi++] = a; idx[qi++] = d; idx[qi++] = bi; }
      }
      device.queue.writeBuffer(lod.buf, 0, idx);
    }
  }
  // ---------- simulation pipelines ----------
  const simBGL = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
  ]});
  const simModule = device.createShaderModule({ code: WGSL_SIM });
  const simLayout = device.createPipelineLayout({ bindGroupLayouts: [simBGL] });
  const simPipes = ['advect', 'height', 'momentum'].map(ep => device.createComputePipeline({ layout: simLayout, compute: { module: simModule, entryPoint: ep } }));
  const simBGs = [[0, 1], [1, 2], [2, 0]].map(([a, b]) => device.createBindGroup({ layout: simBGL, entries: [
    { binding: 0, resource: { buffer: simUBuf } }, { binding: 1, resource: { buffer: terrainBuf } },
    { binding: 2, resource: { buffer: stateBufs[a] } }, { binding: 3, resource: { buffer: stateBufs[b] } },
    { binding: 4, resource: { buffer: kBufs[a] } }, { binding: 5, resource: { buffer: kBufs[b] } },
  ]}));
  // ---------- particle compute ----------
  const partBGL = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
  ]});
  const partPipe = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [partBGL] }),
    compute: { module: device.createShaderModule({ code: WGSL_PART_SIM }), entryPoint: 'psim' } });
  const partBG = device.createBindGroup({ layout: partBGL, entries: [
    { binding: 0, resource: { buffer: partUBuf } }, { binding: 1, resource: { buffer: terrainBuf } },
    { binding: 2, resource: { buffer: stateBufs[0] } }, { binding: 3, resource: { buffer: partBuf } },
  ]});
  // ---------- render pipelines ----------
  const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
  const renBGL = device.createBindGroupLayout({ entries: [0, 1, 2, 3, 4, 5].map(b => (
    { binding: b, visibility: VF, buffer: { type: b === 0 ? 'uniform' : 'read-only-storage' } })) });
  const renBG = device.createBindGroup({ layout: renBGL, entries: [
    { binding: 0, resource: { buffer: camUBuf } }, { binding: 1, resource: { buffer: terrainBuf } },
    { binding: 2, resource: { buffer: stateBufs[0] } }, { binding: 3, resource: { buffer: kBufs[0] } },
    { binding: 4, resource: { buffer: maskBuf } }, { binding: 5, resource: { buffer: partBuf } },
  ]});
  const renLayout = device.createPipelineLayout({ bindGroupLayouts: [renBGL] });
  const depthFmt = 'depth24plus';
  const alphaBlend = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                       alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } };
  const sprayBlend = { color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
                       alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' } };
  const mkRender = (code, vs, fs, opts) => {
    const mod = device.createShaderModule({ code });
    return device.createRenderPipeline({
      layout: renLayout,
      vertex: { module: mod, entryPoint: vs, buffers: opts.buffers || [] },
      fragment: { module: mod, entryPoint: fs, targets: [{ format, blend: opts.blend }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: depthFmt, depthWriteEnabled: opts.depthWrite !== false, depthCompare: opts.depthCompare || 'less' },
    });
  };
  const skyPipe = mkRender(WGSL_SKY, 'vsSky', 'fsSky', { depthWrite: false, depthCompare: 'always' });
  const terrainPipe = mkRender(WGSL_TERRAIN, 'vsTerrain', 'fsTerrain', {});
  const waterPipe = mkRender(WGSL_WATER, 'vsWater', 'fsWater', { blend: alphaBlend });
  const sprayPipe = mkRender(WGSL_PART_DRAW, 'vsPart', 'fsPart', { blend: sprayBlend, depthWrite: false });
  const meshBuffers = [
    { arrayStride: 36, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x3' }] },
    { arrayStride: 80, stepMode: 'instance', attributes: [3, 4, 5, 6, 7].map((loc, k) => ({ shaderLocation: loc, offset: k * 16, format: 'float32x4' })) },
  ];
  const meshPipe = mkRender(WGSL_MESH, 'vsMesh', 'fsMesh', { buffers: meshBuffers });
  const pickupPipe = mkRender(WGSL_MESH, 'vsMesh', 'fsMeshFade', { buffers: meshBuffers, blend: alphaBlend, depthWrite: false });
  // floating obstacles: opaque lighting, depth-written, but alpha-blended so they can fade out
  const obstPipe = mkRender(WGSL_MESH, 'vsMesh', 'fsMeshAlpha', { buffers: meshBuffers, blend: alphaBlend });
  
  // ---------- GPU meshes ----------
  const gpuMesh = mb => { const d = mb.data(); const vbuf = mkBuf(d.byteLength, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST); 
    device.queue.writeBuffer(vbuf, 0, d); 
    return { vbuf, count: mb.count }; };
  const vegMeshes = {}; for (const [k, mb] of Object.entries(buildVegetationMeshes())) vegMeshes[k] = gpuMesh(mb);
  const kayakMeshes = {}; for (const [k, mb] of Object.entries(buildKayakParts())) kayakMeshes[k] = gpuMesh(mb);
  const pickupMeshes = { paddle: kayakMeshes.paddle, coin: gpuMesh(buildCoinMesh()), diamond: gpuMesh(buildDiamondMesh()), map: gpuMesh(buildMapMesh()), rucksack: gpuMesh(buildRucksackMesh()) };
  const pickupInstBufs = { paddle: null, coin: null, diamond: null, rucksack: null };
  // the map pickup is at most one instance ever, on any river, so its buffer never needs
  // resizing — allocate it once here instead of in placePickups()'s per-river rebuild
  pickupInstBufs.map = mkBuf(80, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
  // floating obstacles: each GPU mesh keeps its builder's nominal metres (len/rad/draft/vol) so an
  // instance can be scaled uniformly to a chosen length and get its physics numbers from that
  const obstMeshes = {};
  for (const [k, v] of Object.entries(buildObstacleMeshes())) obstMeshes[k] = { ...gpuMesh(v.mb), len: v.len, rad: v.rad, draft: v.draft, vol: v.vol };
  const obstInstBufs = {};   // per mesh name, sized to the active quota in placeObstacles()

  // small spark burst shown when a paddle/coin is collected
  const sparkMesh = gpuMesh(buildSparkMesh());
  const SPARK_MAX = 160;
  const sparkBuf = mkBuf(SPARK_MAX * 80, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
  let sparks = [];
  function spawnBurst(x, y, z, col) {
    for (let n = 0; n < PICKUPS.burstCount; n++) {
      const a = Math.random() * 6.2832, spd = 1.2 + Math.random() * 2.2;
      sparks.push({
        x, y, z,
        vx: Math.cos(a) * spd, vy: 1.5 + Math.random() * 2.0, vz: Math.sin(a) * spd,
        life: PICKUPS.burstLife, maxLife: PICKUPS.burstLife, col,
      });
    }
    if (sparks.length > SPARK_MAX) sparks.splice(0, sparks.length - SPARK_MAX);
  }
  function updateSparks(dt) {
    if (sparks.length) {
      for (const sp of sparks) {
        sp.vy -= 9.81 * dt;
        sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.z += sp.vz * dt;
        sp.life -= dt;
      }
      sparks = sparks.filter(sp => sp.life > 0);
    }
    const data = new Float32Array(sparks.length * 20);
    sparks.forEach((sp, n) => {
      const t = sp.life / sp.maxLife, sc = 0.12 * (0.4 + 0.6 * t);
      data.set(mat4TRS([sp.x, sp.y, sp.z], 0, [sc, sc, sc]), n * 20);
      data.set([sp.col[0], sp.col[1], sp.col[2], clamp(t * 1.4, 0, 1)], n * 20 + 16);
    });
    if (sparks.length) device.queue.writeBuffer(sparkBuf, 0, data);
  }
  const armVertCount = 2 * 8 * 12;
  const armBuf = mkBuf(armVertCount * 36, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
  const kayakInst = {}; for (const k of ['hull', 'cockpit', 'torso', 'head', 'paddle', 'arms']) kayakInst[k] = mkBuf(80, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
  const instBufs = {};
  const writeInstances = (name, list) => {
    const d = new Float32Array(list.length * 20);
    list.forEach((inst, n) => { d.set(inst.m, n * 20); d.set(inst.tint, n * 20 + 16); });
    if (instBufs[name]) instBufs[name].buf.destroy();
    const buf = mkBuf(Math.max(80, d.byteLength), GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
    if (d.length) device.queue.writeBuffer(buf, 0, d);
    instBufs[name] = { buf, count: list.length };
  };
  let depthTex = null, depthView = null;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, QUALITY[quality].dprCap);
    canvas.width = Math.floor(innerWidth * dpr); canvas.height = Math.floor(innerHeight * dpr);
    if (depthTex) depthTex.destroy();
    depthTex = device.createTexture({ size: [canvas.width, canvas.height], format: depthFmt, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    depthView = depthTex.createView();
  }
  resize(); addEventListener('resize', resize);

  // ============================================================================
  //  STATE & PROGRESSION
  // ============================================================================
  let river = null, simTime = 0, gameState = 'menu', runTime = 0, camMode = 0, dbgMode = 0, fps = 60, warmingUp = false;
  // fixed-timestep physics: frame() below advances simTime/kayak.step by however many SIM.dt
  // ticks are owed against real elapsed time, not a hardcoded count per rendered frame — see the
  // accumulator there. frameTicks is how many actually ran *this* frame; kayak.step's obstacle
  // force accumulation (search `kf =`) divides by it, since that force is built up once per tick
  // but only consumed once per frame, and how many ticks make up "this frame" now varies.
  let frameTicks = 2;
  const MAX_PHYS_TICKS = 8;  // hard cap on ticks replayed in one frame — after a big stall (tab
                              // backgrounded, a long GC pause) sim time falls behind real time
                              // instead of the frame trying to replay all of it at once and spiralling
  
  let runLoot = { paddles: 0, coins: 0, coinValue: 0, snacks: 0, bandaids: 0, medikits: 0, books: 0, raftFound: false, helmetFound: false };
  let snackMsgUntil = 0;   // simTime until which the "snack eaten" HUD line shows
  // the boat for the current run: its KAYAK parameters with the craft's (and, if owned, the
  // better-paddle upgrade's) mods applied (see craftKayakParams) and the craft itself for the
  // hull colour / lootMod. Set in startRun.
  let effK = KAYAK, runCraft = CRAFTS.classic;
  function craftKayakParams(craft, prof) {
    const K = Object.assign({}, KAYAK);
    for (const [k, m] of Object.entries(craft.mods || {})) if (typeof K[k] === 'number') K[k] *= m;
    if (prof && ownsUpgrade(prof, 'paddle')) for (const [k, m] of Object.entries(UPGRADES.paddle.mods || {})) if (typeof K[k] === 'number') K[k] *= m;
    return K;
  }

  let mapFoundUntil = 0;   // simTime until which the "hidden map found" HUD line shows
  let profile = loadProfile();           // null → character selection
  const input = { fwd: false, back: false, left: false, right: false, leanL: false, leanR: false };
  const keymap = { ArrowUp: 'fwd', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right', KeyA: 'leanL', KeyD: 'leanR', KeyW: 'fwd', KeyS: 'back' };
  // in mobile mode the arrow keys drive the two pads (handy when developing with MOBILE.force)
  const padKeys = { ArrowLeft: [1], ArrowRight: [-1], ArrowUp: [1, -1] };
  addEventListener('keydown', e => {
    if (isMobile && padKeys[e.code]) { if (!e.repeat) for (const s of padKeys[e.code]) padDown(s); e.preventDefault(); return; }
    if (keymap[e.code] !== undefined) { input[keymap[e.code]] = true; e.preventDefault(); }
    if (e.code === 'KeyC') camMode = (camMode + 1) % 3;
    if (e.code === 'KeyE') eatSnack();
    if (e.code === 'F1') { toggleDbg(); e.preventDefault(); }
    if (e.code === 'KeyR') retryRun();
    
    if (e.code === 'KeyF' && gameState === 'run') endRun(true);
    if (e.code === 'Escape') { if ($('charsheet').style.display === 'flex') hideCharSheet(); else if ($('store').style.display === 'flex') hideStore(); else if ($('lvl').style.display !== 'flex') showMenu(); }
    
  });
  
  addEventListener('keyup', e => {
    if (isMobile && padKeys[e.code]) { for (const s of padKeys[e.code]) padUp(s); return; }
    if (keymap[e.code] !== undefined) input[keymap[e.code]] = false;
  });

  // ---------- mobile paddle pads ----------
  // side follows kayak.side: +1 = blade on the LEFT of the boat (the boat turns right),
  // -1 = blade on the right (turns left). A press queues one stroke; a pad still held when a
  // stroke ends starts the next one on that side; both held alternates sides like the desktop ↑.
  const pad = { held: { 1: false, '-1': false }, queue: [] };
  const padEls = { 1: $('padL'), '-1': $('padR') };
  function padDown(side) {
    pad.held[side] = true; padEls[side].classList.add('down');
    if (gameState === 'run' && pad.queue.length < MOBILE.strokeQueue) pad.queue.push(side);
  }
  function padUp(side) { pad.held[side] = false; padEls[side].classList.remove('down'); }
  // side of the next stroke (0 = none). `poised` is the side the paddle is already lifted toward,
  // i.e. the one an alternating (both-held) rhythm naturally continues with
  function nextPadSide(poised) {
    if (pad.queue.length) return pad.queue.shift();
    const l = pad.held[1], r = pad.held[-1];
    return l && r ? poised : l ? 1 : r ? -1 : 0;
  }
  for (const side of [1, -1]) {
    const el = padEls[side], ids = new Set();          // several fingers on one pad: released when the last one lifts
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* some pointer types can't be captured */ }
      ids.add(e.pointerId); padDown(side);
    });
    const release = e => { ids.delete(e.pointerId); if (!ids.size) padUp(side); };
    el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release);
    el.addEventListener('contextmenu', e => e.preventDefault());   // no long-press menu
  }
  $('mExit').onclick = () => { if (gameState !== 'menu' && $('lvl').style.display !== 'flex') showMenu(); };
  $('mCam').onclick = () => { camMode = (camMode + 1) % 3; };
  function toggleDbg() { dbgMode = (dbgMode + 1) % 5; $('dbg').style.display = dbgMode ? 'block' : 'none'; }
  $('mDbg').onclick = toggleDbg;
  $('mEat').onclick = eatSnack;
  // best effort: fullscreen hides the browser chrome and (Android) allows a landscape lock.
  // iPhone Safari has no requestFullscreen and lock() rejects — both are simply skipped.
  function enterFullscreen() {
    if (!MOBILE.fullscreen || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation && screen.orientation.lock ? screen.orientation.lock('landscape') : null)
      .catch(() => {});
  }
    // eat one snack from the pack: only mid-run, only if there's one, and not when the stamina bar is
  // already (nearly) full — it'd just be thrown away
  function eatSnack() {
    if (gameState !== 'run' || !profile) return;
    if (itemCount(profile, 'snack') <= 0 || kayak.stamina >= STAMINA.max - 2) return;
    useItem(profile, 'snack');
    kayak.stamina = clamp(kayak.stamina + ITEMS.snack.stamina, 0, STAMINA.max);
    kayak.tired = kayak.stamina < STAMINA.max * STAMINA.tiredFrac;
    snackMsgUntil = simTime + 2.5;
    popLoot('snack');
  }

  // R key and the Retry button share the same guard
  function retryRun() { if (river && gameState !== 'menu' && !warmingUp && $('lvl').style.display !== 'flex') startRun(river.R); }



  // effective kayak parameters derived from the character's traits
  const traits = () => ({
    skill: profile ? profile.skill : 0,
    stamina: profile ? profile.stamina : 0,
    instabK: KAYAK.formStab + Math.max(0, KAYAK.rollInstab - SKILL.instabPerPt * (profile ? profile.skill : 0)),
    leanTorque: KAYAK.leanTorque + SKILL.leanPerPt * (profile ? profile.skill : 0),
    drain: STAMINA.drain * (1 - STAMINA.drainPerPt * (profile ? profile.stamina : 0)),
  });
  const pips = (val, cap, max = 10) => `<div class="bar">${Array.from({ length: max }, (_, i) =>
    `<i class="${i < val ? 'on' : ''}${i >= cap ? ' cap' : ''}"></i>`).join('')}</div>`;
  // a slim proportional bar (reuses the xp-bar look) for stats whose range is too wide for
  // individual pips to read well — health's cap goes up to 20, injury tracks against it
  const statBar = (val, cap, color) => `<div class="xpbar"><div class="xpfill" style="width:${clamp(100 * val / Math.max(cap, 1), 0, 100)}%;background:${color}"></div></div>`;
  // stand-in for art that isn't in yet — swap the label for a real <img> or background-image later
  const artSlot = (cls, label) => `<div class="art-slot ${cls}">${label}</div>`;
  const swatch = c => `<i class="swatch" style="background:rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})"></i>`;

  // ---------- menu ----------
  function showMenu() {
    gameState = 'menu';
    document.body.classList.remove('inrun'); pad.queue.length = 0;
    $('menu').style.display = 'flex'; 
    $('msg').style.display = 'none'; $('stam').style.display = 'none'; $('loot').style.display = 'none';
    renderMenu();
    if (profile && profile.pending > 0) showLevelUp();
  }
  function renderQuality() {
    const el = $('quality');
    const labels = { high: 'High', medium: 'Medium', low: 'Low' };
    el.innerHTML = `<span>detail</span>` + QUALITY_LEVELS.map(q =>
      `<button data-q="${q}" class="${q === quality ? 'on' : ''}">${labels[q]}</button>`).join('');
    for (const btn of el.querySelectorAll('button')) {
      btn.onclick = () => {
        const q = btn.dataset.q;
        if (q === quality) return;
        saveQuality(q);
        location.reload();   // grid/particle/prop buffers are sized once at load — simplest safe way to apply a new tier
      };
    }
  }
  function renderMenu() {
    renderQuality();
    const cs = $('charsel'), tb = $('topbar'), rl = $('riverlist');
    if (!profile) {
      
      cs.innerHTML = `<p style="width:100%;margin:0 0 6px">Choose your paddler</p>`;
      cs.style.display = 'flex'; 
      tb.style.display = 'none'; 
      rl.style.display = 'none'; 
      $('craftbar').style.display = 'none';

      for (const [id, c] of Object.entries(CHARACTERS)) {
        const d = document.createElement('div'); d.className = 'chr';
        d.innerHTML = `${artSlot('chr-portrait', c.name + ' art')}
          <h3>${c.name}</h3><small>${c.title}</small><p>${c.desc}</p>
          <small>skill ${c.start.skill}/${c.caps.skill}</small>${pips(c.start.skill, c.caps.skill)}
          <small>stamina ${c.start.stamina}/${c.caps.stamina}</small>${pips(c.start.stamina, c.caps.stamina)}
          <small>health ${c.start.health}/${c.caps.health}</small>${statBar(c.start.health, c.caps.health, '#7fd6ff')}`;
        d.onclick = () => { profile = newProfile(id); renderMenu(); };
        cs.appendChild(d);
      }
      return;
    }
    cs.style.display = 'none'; tb.style.display = 'flex'; rl.style.display = 'flex';
    const c = character(profile), need = pointsForLevel(profile.level), pct = clamp(100 * profile.points / need, 0, 100);
    tb.innerHTML = `${artSlot('topbar-portrait', 'portrait')}
      <div class="topbar-info">
        <div><b style="color:#ffe08a">${c.name}</b> ${c.title} · level <b>${profile.level}</b>
          · <b style="color:#ffd35c">${profile.coins || 0}</b> coin${profile.coins === 1 ? '' : 's'}</div>
        <div class="xpbar"><div class="xpfill" style="width:${pct}%"></div></div>
        <small style="color:#9bc">${profile.points} / ${need} xp to next level · ${profile.runs} run${profile.runs === 1 ? '' : 's'}</small>
      </div>
      <div class="topbar-btns"><button id="openCharSheet">Character</button><button id="openStoreBtn">Store</button></div>`;
    $('openCharSheet').onclick = showCharSheet;
    $('openStoreBtn').onclick = showStore;
        // boat picker: one toggle per owned craft, the selected one highlighted. Selection persists
    // in the profile and is read by startRun.
    const cb = $('craftbar');
    cb.style.display = 'flex';
    // only count crafts actually sold in the store — the raft is found, not bought, so it
    // shouldn't inflate "X more in the store" before it's even been found
    const unowned = STORE_LISTING.filter(e => e.type === 'craft' && !profile.crafts.includes(e.id)).length;
    cb.innerHTML = `<span>boat</span>` + profile.crafts.map(id => {
      const c = CRAFTS[id];
      return `<button class="craftbtn ${id === profile.craft ? 'on' : ''}" data-craft="${id}" title="${c.desc}">${swatch(c.color)}${c.name}</button>`;
    }).join('') + (unowned ? `<span>· ${unowned} more in the store</span>` : '');
    for (const btn of cb.querySelectorAll('button')) btn.onclick = () => { selectCraft(profile, btn.dataset.craft); renderMenu(); };
    rl.innerHTML = '';
    for (const tier of TIERS) {
      const tierRivers = RIVERS.filter(r => r.tier === tier.id);
      const lockedCount = tierRivers.filter(r => !riverUnlocked(profile, r)).length;
      const h = document.createElement('div'); h.className = 'tier';
      h.textContent = `${tier.label} · ${tier.points} pt${lockedCount ? ` · ${lockedCount} more in the store` : ''}`;
      rl.appendChild(h);
      const row = document.createElement('div'); row.className = 'rivers';
      for (const R of tierRivers) {
        const unlocked = riverUnlocked(profile, R);
        const d = document.createElement('div'); d.className = unlocked ? 'riv' : 'riv locked';
        if (unlocked) {
          const extra = (R.forks && R.forks.length ? ` · ${R.forks.length} fork${R.forks.length > 1 ? 's' : ''}` : '')
                      + (R.waterfalls && R.waterfalls.length ? ' · waterfall' : '')
                      + (R.obstacles ? ' · ' + Object.keys(R.obstacles).map(k => (OBSTACLES.kinds[k] || {}).label || k).join(' + ') : '');
          const best = profile.best[R.name];
          d.innerHTML = `${artSlot('riv-thumb', R.name + ' art')}
            <h3>${R.name}</h3><small>gradient ${(R.slope * 100).toFixed(1)} % · ${R.rocks} boulders · ${R.ledges.length} ledges${extra}</small>
            ${best ? `<br><span class="best">best ${best.toFixed(1)} s</span>` : ''}`;
          d.onclick = () => startRun(R);
        } else {
          const pk = RIVER_PACKS[R.pack];
          d.innerHTML = `${artSlot('riv-thumb', R.name + ' art')}
            <h3>${R.name}</h3><small>🔒 buy "${pk.label}" in the store to unlock</small>`;
        }
        row.appendChild(d);
      }
      // hidden per-tier secret river — greyed out and unclickable until its map item is found
      const hiddenR = RIVERS_HIDDEN.find(r => r.tier === tier.id);
      if (hiddenR) {
        const unlocked = profile.unlockedHidden[tier.id];
        const d = document.createElement('div'); d.className = unlocked ? 'riv' : 'riv locked';
        if (unlocked) {
          const best = profile.best[hiddenR.name];
          d.innerHTML = `${artSlot('riv-thumb', hiddenR.name + ' art')}
            <h3>${hiddenR.name}</h3><small>gradient ${(hiddenR.slope * 100).toFixed(1)} % · ${hiddenR.rocks} boulders · ${hiddenR.ledges.length} ledges</small>
            ${best ? `<br><span class="best">best ${best.toFixed(1)} s</span>` : ''}`;
          d.onclick = () => startRun(hiddenR);
        } else {
          d.innerHTML = `${artSlot('riv-thumb', '?')}<h3>???</h3><small>find the hidden map on this tier to unlock</small>`;
        }
        row.appendChild(d);
      }
      rl.appendChild(row);
    }
  }
  function showLevelUp() {
    const el = $('lvl');
    if (!profile || profile.pending <= 0) { el.style.display = 'none'; if (gameState === 'menu') renderMenu(); return; }
    if (!anyRaisable(profile)) { discardPending(profile); el.style.display = 'none'; if (gameState === 'menu') renderMenu(); return; }
    const c = character(profile);
    el.style.display = 'flex';
    el.innerHTML = `<h2>Level ${profile.level}!</h2><div>${c.name} has ${profile.pending} point${profile.pending > 1 ? 's' : ''} to spend</div>
      <div class="opts">
        <div class="opt"><h3>Skill</h3>${pips(profile.skill, c.caps.skill)}<p>Better edge control: the boat is harder to flip and easier to right.</p>
          <button id="lvSkill" ${canRaise(profile, 'skill') ? '' : 'disabled'}>${canRaise(profile, 'skill') ? 'Raise skill' : 'At cap'}</button></div>
        <div class="opt"><h3>Stamina</h3>${pips(profile.stamina, c.caps.stamina)}<p>Paddling drains stamina more slowly, so you stay strong for longer.</p>
          <button id="lvStam" ${canRaise(profile, 'stamina') ? '' : 'disabled'}>${canRaise(profile, 'stamina') ? 'Raise stamina' : 'At cap'}</button></div>
        <div class="opt"><h3>Health</h3><small>${profile.health}/${c.caps.health}</small>${statBar(profile.health, c.caps.health, '#7fd6ff')}<p>Raises how much injury you can sustain before it's game over.</p>
          <button id="lvHealth" ${canRaise(profile, 'health') ? '' : 'disabled'}>${canRaise(profile, 'health') ? 'Raise health' : 'At cap'}</button></div>
      </div>`;
    $('lvSkill').onclick = () => { spendPoint(profile, 'skill'); showLevelUp(); };
    $('lvStam').onclick = () => { spendPoint(profile, 'stamina'); showLevelUp(); };
    $('lvHealth').onclick = () => { spendPoint(profile, 'health'); showLevelUp(); };
  }
  function showStore() {
    if (!profile) return;
    const el = $('store');
    el.style.display = 'flex';
    const row = entry => {
      if (entry.type === 'item') {
        const it = ITEMS[entry.id], have = itemCount(profile, entry.id), ok = canBuyItem(profile, entry.id);
        return `<div class="item">${artSlot('', it.icon)}
          <div class="info"><h3>${it.name}</h3><p>${it.desc}</p></div>
          <div class="buy"><span class="price">${it.price} 🪙</span><span class="have">${have} in pack${have >= it.maxStack ? ' (full)' : ''}</span>
            <button data-item="${entry.id}" ${ok ? '' : 'disabled'}>Buy</button></div></div>`;
      }
      if (entry.type === 'pack') {
        const pk = RIVER_PACKS[entry.id], owned = ownsPack(profile, entry.id), ok = canBuyPack(profile, entry.id);
        const included = RIVERS.filter(r => r.pack === entry.id);
        const tierLabel = (TIERS.find(t => t.id === pk.tier) || {}).label || pk.tier;
        return `<div class="item ${owned ? 'owned' : ''}">${artSlot('', '🗺️')}
          <div class="info"><h3>${tierLabel} — ${pk.label}</h3><p>Unlocks ${included.map(r => r.name).join(' & ')}.</p></div>
          <div class="buy"><span class="price">${owned ? 'owned' : pk.price + ' 🪙'}</span>
            ${owned ? '' : `<button data-pack="${entry.id}" ${ok ? '' : 'disabled'}>Buy</button>`}</div></div>`;
      }
      if (entry.type === 'upgrade') {
        const u = UPGRADES[entry.id], owned = ownsUpgrade(profile, entry.id), ok = canBuyUpgrade(profile, entry.id);
        return `<div class="item ${owned ? 'owned' : ''}">${artSlot('', u.icon)}
          <div class="info"><h3>${u.name}</h3><p>${u.desc}</p></div>
          <div class="buy"><span class="price">${owned ? 'owned' : u.price + ' 🪙'}</span>
            ${owned ? '' : `<button data-upgrade="${entry.id}" ${ok ? '' : 'disabled'}>Buy</button>`}</div></div>`;
      }
      const c = CRAFTS[entry.id], owned = profile.crafts.includes(entry.id), ok = canBuyCraft(profile, entry.id);
      return `<div class="item ${owned ? 'owned' : ''}">${artSlot('', c.name + ' art')}
        <div class="info"><h3>${swatch(c.color)} ${c.name}</h3><p>${c.desc}</p></div>
        <div class="buy"><span class="price">${owned ? 'owned' : c.price + ' 🪙'}</span>
          ${owned ? `<span class="have">${profile.craft === entry.id ? 'in use' : 'pick it on the main screen'}</span>`
                  : `<button data-craft="${entry.id}" ${ok ? '' : 'disabled'}>Buy</button>`}</div></div>`;
    };
    el.innerHTML = `<h2>Store</h2>
      ${artSlot('store-banner', 'store banner art')}
      <div><b style="color:#ffd35c">${profile.coins || 0}</b> coin${profile.coins === 1 ? '' : 's'} collected on the water</div>
      <div class="shelf">${STORE_LISTING.map(row).join('')}</div>
      <button id="storeClose">Close</button>`;
    for (const b of el.querySelectorAll('button[data-item]')) b.onclick = () => { if (buyItem(profile, b.dataset.item)) { showStore(); renderMenu(); } };
    for (const b of el.querySelectorAll('button[data-craft]')) b.onclick = () => { if (buyCraft(profile, b.dataset.craft)) { showStore(); renderMenu(); } };
    for (const b of el.querySelectorAll('button[data-upgrade]')) b.onclick = () => { if (buyUpgrade(profile, b.dataset.upgrade)) { showStore(); renderMenu(); } };
    for (const b of el.querySelectorAll('button[data-pack]')) b.onclick = () => { if (buyPack(profile, b.dataset.pack)) { showStore(); renderMenu(); } };
    $('storeClose').onclick = hideStore;
  }
  function hideStore() { $('store').style.display = 'none'; }
  function showCharSheet() {
    if (!profile) return;
    const el = $('charsheet'), c = character(profile), need = pointsForLevel(profile.level), pct = clamp(100 * profile.points / need, 0, 100);
    el.style.display = 'flex';
    el.innerHTML = `<div class="charsheet-card">
        ${artSlot('charsheet-portrait', c.name + ' art')}
        <div class="charsheet-info">
          <h2>${c.name} <small>${c.title}</small></h2>
          <p>${c.desc}</p>
          <div>level <b style="color:#ffe08a">${profile.level}</b></div>
          <div class="xpbar"><div class="xpfill" style="width:${pct}%"></div></div>
          <small style="color:#9bc">${profile.points} / ${need} xp to next level</small>
          <div class="stat-row"><small>skill ${profile.skill}/${c.caps.skill}</small>${pips(profile.skill, c.caps.skill)}</div>
          <div class="stat-row"><small>stamina ${profile.stamina}/${c.caps.stamina}</small>${pips(profile.stamina, c.caps.stamina)}</div>
          <div class="stat-row"><small>health ${profile.health}/${c.caps.health}</small>${statBar(profile.health, c.caps.health, '#7fd6ff')}</div>
          <div class="stat-row"><small style="color:${profile.injury > 0 ? '#ff9a80' : '#9bc'}">injury ${profile.injury}/${profile.health}${profile.injury >= profile.health ? ' — GAME OVER!' : ''}</small>${statBar(profile.injury, profile.health, '#ff5040')}</div>
          <div style="margin-top:8px">${profile.runs} run${profile.runs === 1 ? '' : 's'} · <b style="color:#ffd35c">${profile.coins || 0}</b> coin${profile.coins === 1 ? '' : 's'}</div>
          <div class="inv"><h4>Pack</h4>
            ${Object.entries(ITEMS).filter(([id]) => itemCount(profile, id) > 0).map(([id, it]) =>
              `<div class="row">${it.icon} ${it.name} × <b>${itemCount(profile, id)}</b>${it.heal ? ` <button data-heal="${id}" ${canHeal(profile, id) ? '' : 'disabled'}>Use (-${it.heal} injury)</button>` : ''}</div>`).join('') || '<div class="row">empty — visit the store</div>'}
          </div>
          <div class="inv"><h4>Upgrades</h4>
            ${Object.entries(UPGRADES).filter(([id]) => ownsUpgrade(profile, id)).map(([id, u]) =>
              `<div class="row">${u.icon} ${u.name}</div>`).join('') || '<div class="row">none yet — visit the store, or get lucky in a rucksack</div>'}
          </div>
          <div class="inv"><h4>Boathouse</h4>
            ${profile.crafts.map(id => `<div class="row">${swatch(CRAFTS[id].color)} ${CRAFTS[id].name}${id === profile.craft ? ' <small style="color:#ffe08a">· in use</small>' : ''}</div>`).join('')}
          </div>
        </div>
      </div>
      <div class="charsheet-actions">
        <button id="charNewBtn">New character</button>
        <button id="charCloseBtn">Close</button>
      </div>`;
    for (const b of el.querySelectorAll('button[data-heal]')) b.onclick = () => { if (healInjury(profile, b.dataset.heal)) showCharSheet(); };
    $('charNewBtn').onclick = () => { if (confirm('Discard this paddler and all progress?')) { clearProfile(); profile = null; river = null; hideCharSheet(); renderMenu(); } };
    $('charCloseBtn').onclick = hideCharSheet;
  }
  function hideCharSheet() { $('charsheet').style.display = 'none'; }

  // ---------- sampling ----------
  function terrainH(x, z) {
    const gx = x / dx - 0.5, gz = z / dx - 0.5, x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0;
    const f = (i, j) => river.b[clamp(j, 0, L - 1) * W + clamp(i, 0, W - 1)];
    return (f(x0, z0) * (1 - fx) + f(x0 + 1, z0) * fx) * (1 - fz) + (f(x0, z0 + 1) * (1 - fx) + f(x0 + 1, z0 + 1) * fx) * fz;
  }
  function terrainN(x, z) { const e = 0.3; return v3.norm([terrainH(x - e, z) - terrainH(x + e, z), 2 * e, terrainH(x, z - e) - terrainH(x, z + e)]); }
  function bandVal(ch, i, j) { return band.data[(clamp(j - band.j0, 0, BAND_ROWS - 1) * W + clamp(i, 0, W - 1)) * 4 + ch]; }
  function bilinBand(ch, gx, gz) {
    const x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0;
    return (bandVal(ch, x0, z0) * (1 - fx) + bandVal(ch, x0 + 1, z0) * fx) * (1 - fz) + (bandVal(ch, x0, z0 + 1) * (1 - fx) + bandVal(ch, x0 + 1, z0 + 1) * fx) * fz;
  }
  function waterAt(x, z) {
    const bed = terrainH(x, z);
    const jrow = clamp(Math.floor(z / dx), 0, L - 1), row = nearestChan(river.rows[jrow], x);
    if (!band.ready || Math.abs(z / dx - (band.j0 + BAND_ROWS / 2)) > BAND_ROWS / 2 - 3) {
      const h = Math.max(0, row.eta - bed);
      return { eta: Math.max(row.eta, bed), h, u: 0, v: h > 0 ? Math.min(0.8 * Math.pow(h, 0.6667) * Math.sqrt(river.R.slope) / river.R.manning, 4) : 0 };
    }
    const gx = x / dx - 0.5, gz = z / dx - 0.5, x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0;
    let wsum = 0, esum = 0;
    for (const [di, dj, wgt] of [[0, 0, (1 - fx) * (1 - fz)], [1, 0, fx * (1 - fz)], [0, 1, (1 - fx) * fz], [1, 1, fx * fz]]) {
      const i = clamp(x0 + di, 0, W - 1), j = clamp(z0 + dj, 0, L - 1), h = bandVal(0, i, j);
      if (h > SIM.hmin) { wsum += wgt; esum += wgt * (h + river.b[j * W + i]); }
    }
    const h = bilinBand(0, gx, gz);
    return { eta: wsum > 0.05 ? Math.max(esum / wsum, bed) : bed, h, u: bilinBand(1, x / dx, gz), v: bilinBand(2, gx, z / dx) };
  }

    // three points along the hull used for obstacle contact — a 3.3 m boat hitting a 9 m trunk has
  // to be tested at bow/centre/stern or the ends visibly sink into it, and it's what lets a hit
  // swing the boat parallel to the log instead of stopping it dead
  const OBST_HULL_PTS = [[0, -0.06, 1.3], [0, -0.06, 0], [0, -0.06, -1.3]];
  // ============================================================================
  //  KAYAK
  // ============================================================================
  const kayak = {
    p: [0, 0, 0], v: [0, 0, 0], q: [0, 0, 0, 1], wl: [0, 0, 0], roll: 0, pitch: 0, lean: 0,
    strokeT: 0, side: 1, paddling: false, env: 0, mode: 'fwd', hitFlash: 0, speed: 0,
    stamina: STAMINA.max, tired: false,
    blade: [0, 0, 0], bladePrev: [0, 0, 0], bladeVel: [0, 0, 0],
    reset() {
      const j = 30, z = (j + 0.5) * dx, row = river.rows[j][0];
      const dcdz = (river.centerAt(z + 1) - river.centerAt(z - 1)) / 2;
      const yaw = Math.atan2(dcdz, 1);
      this.p = [row.c, row.eta + 0.06, z];
      this.q = qAxisAngle([0, 1, 0], yaw);
      this.v = v3.scale(qRotate(this.q, [0, 0, 1]), 1.0);
      this.wl = [0, 0, 0]; this.roll = 0; this.pitch = 0; this.lean = 0;
      this.strokeT = 0; this.side = 1; 
      this.paddling = false; 
      this.env = 0; 
      this.hitFlash = 0;
      this.stamina = STAMINA.max; 
      this.tired = false;
      this.strokeActive = false;
      this.lastSide = 0;
      pad.queue.length = 0;   // mobile stroke state
      this.visYaw = 0;                                                        // drawn paddle swing angle
      // smoothed copies used only for the mesh pose (see updateKayakInstances)
      this.visSide = 1; this.visAmp = 0.6; this.visDirn = 1; this.visEnv = 0; this.visBack = 1;
      this.blade = this.p.slice(); this.bladePrev = this.p.slice(); this.bladeVel = [0, 0, 0];
    },
        // mobile: start one stroke on side s. Repeating the previous side makes it a turning sweep,
    // alternating makes it a forward pull — so L R L R runs straight and L L L spins the boat.
    beginStroke(s) {
      this.mode = s === this.lastSide ? 'sweep' : 'fwd';
      this.lastSide = s; this.side = s; this.strokeT = 0; this.strokeActive = true;
    },
    step(dt) {
      const K = effK, m = K.mass, q = this.q, p = this.p, tr = traits();
      const R = v => qRotate(q, v);
      const fwd = R([0, 0, 1]);
      const fwdH = v3.norm([fwd[0], 0, fwd[2]]), rightH = [fwdH[2], 0, -fwdH[0]];
      const wWorld = R(this.wl);
      let F = [0, -m * SIM.g, 0], T = [0, 0, 0];
      const addForceAt = (pw, f) => { F = v3.add(F, f); T = v3.add(T, v3.cross(v3.sub(pw, p), f)); };
      const pointVel = pw => v3.add(this.v, v3.cross(wWorld, v3.sub(pw, p)));
      const ul = qRotate(qConj(q), [0, 1, 0]);
      this.roll = Math.atan2(ul[0], ul[1]); this.pitch = Math.atan2(ul[2], ul[1]);
      // buoyancy
      let nwet = 0;
      for (const lp of K.buoyPts) {
        const pw = v3.add(p, R(lp)), w = waterAt(pw[0], pw[2]), s = w.eta - pw[1];
        if (s > 0) { const vp = pointVel(pw); addForceAt(pw, [0, Math.max(0, K.buoyK * s - K.buoyDamp * vp[1]), 0]); nwet++; }
      }
      const subFac = clamp(nwet / 4, 0, 1);
      // hydrodynamic drag relative to the local current
      for (const lp of K.dragPts) {
        const pw = v3.add(p, R(lp)), w = waterAt(pw[0], pw[2]), vp = pointVel(pw);
        const rel = [vp[0] - w.u, 0, vp[2] - w.v];
        const va = v3.dot(rel, fwdH), vl = v3.dot(rel, rightH);
        const fac = clamp(w.h / 0.15, 0, 1) * clamp((w.eta - pw[1] + 0.15) / 0.15, 0, 1);
        let fd = v3.add(v3.scale(fwdH, -K.dragAlong * 0.5 * va * Math.abs(va)),
                        v3.scale(rightH, -(K.dragLat * 0.5 * vl * Math.abs(vl) + K.dragLatLin * 0.5 * vl)));
        fd = v3.scale(fd, fac); fd[1] = -25 * vp[1] * fac;
        addForceAt(pw, fd);
      }
      // ---- paddle input: desktop keys → continuous strokes, mobile pads → one stroke per tap ----
      let active, turn = 0;
      if (isMobile) {
        if (!this.strokeActive) { const nx = nextPadSide(this.side); if (nx !== 0) this.beginStroke(nx); }
        active = this.strokeActive;
      } else {
        turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        active = input.fwd || input.back || turn !== 0;
      }
      // ---- stamina ----
      this.stamina += dt * STAMINA.max / STAMINA.regenTime;       // regenerates 0→full in regenTime
      if (active) this.stamina -= dt * tr.drain;
      this.stamina = clamp(this.stamina, 0, STAMINA.max);
      this.tired = this.stamina < STAMINA.max * STAMINA.tiredFrac;
      const power = this.tired ? STAMINA.tiredPower : 1;
      const period = K.strokePeriod * (this.tired ? STAMINA.tiredStroke : 1);
      // ---- paddle ----
      let paddleYaw = 0;
      if (active && isMobile) {
        this.paddling = true;
        this.strokeT += dt / period;
        this.env = Math.sin(Math.PI * Math.min(this.strokeT, 1));
        const s = this.side, at = v3.add(p, R([s * 0.25, 0, 0.3]));
        if (this.mode === 'sweep') {     // same side again: a turning stroke (see beginStroke)
          paddleYaw = -s * K.sweepTorque * MOBILE.repeatYaw * power * (0.5 + 0.5 * this.env);
          addForceAt(at, v3.scale(fwdH, K.paddleFwd * MOBILE.repeatFwd * power * this.env));
        } else addForceAt(at, v3.scale(fwdH, K.paddleFwd * power * this.env));
        // stroke finished: the paddle is now poised over the other side (the same flip the desktop
        // loop does — it keeps the drawn paddle angle continuous); next tick decides what follows
        if (this.strokeT >= 1) { this.strokeT = 0; this.strokeActive = false; this.side = -s; }
      } else if (active) {
        if (!this.paddling) this.strokeT = 0;          // keys just came back → a fresh stroke
        this.paddling = true;
        this.strokeT += dt / period;
        if (this.strokeT >= 1) { this.strokeT -= 1; this.side = turn !== 0 ? -turn : -this.side; }
        if (turn !== 0 && this.strokeT < 0.05) this.side = -turn;
        this.env = Math.sin(Math.PI * this.strokeT);
        this.mode = input.back && !input.fwd ? 'back' : turn !== 0 ? 'sweep' : 'fwd';
        if (input.fwd) addForceAt(v3.add(p, R([this.side * 0.25, 0, 0.3])), v3.scale(fwdH, K.paddleFwd * power * this.env));
        else if (input.back) addForceAt(v3.add(p, R([this.side * 0.25, 0, -0.3])), v3.scale(fwdH, -K.paddleBack * power * this.env));
        if (turn !== 0) {
          paddleYaw = turn * K.sweepTorque * power * (0.5 + 0.5 * this.env) * (input.fwd ? 0.7 : 1);
          if (!input.fwd && !input.back) F = v3.add(F, v3.scale(fwdH, K.sweepFwd * power * this.env * 0.5));
        }
      } else {
        // idle: strokeT deliberately stays put — zeroing it here flipped cos(πt) and snapped the
        // drawn paddle; the stroke is restarted from 0 when input comes back instead (env is ~0 by then)
        this.paddling = false; this.env *= Math.exp(-dt * 8);
      }
      // ---- lean: A/D give a binary target, the device tilt an analog one. Keys win while
      // pressed, so a forced-mobile desktop session (or a phone without a sensor) can still lean ----
      const keyLean = (input.leanL ? 1 : 0) - (input.leanR ? 1 : 0);
      const useTilt = isMobile && keyLean === 0 && gyro.live();
      const leanTarget = useTilt ? gyro.lean() : keyLean;
      this.lean += (leanTarget - this.lean) * Math.min(1, dt * (useTilt ? MOBILE.leanRate : K.leanRate));


      // terrain contact
      this.hitFlash *= Math.exp(-dt * 4);
      for (const lp of K.collPts) {
        const pw = v3.add(p, R(lp)), tb = terrainH(pw[0], pw[2]);
        if (pw[1] < tb) {
          const pen = tb - pw[1], n = terrainN(pw[0], pw[2]), vp = pointVel(pw), vn = v3.dot(vp, n);
          let fc = v3.scale(n, K.collK * pen - K.collDamp * Math.min(vn, 0));
          fc = v3.sub(fc, v3.scale(v3.sub(vp, v3.scale(n, vn)), K.collFric));
          addForceAt(pw, fc);
          if (-vn > 0.8) this.hitFlash = 1;
        }
      }
            // ---- floating obstacles ----
      if (river.obstNear) for (const ob of river.obstNear) {
        const dirx = Math.sin(ob.yaw), dirz = Math.cos(ob.yaw), half = ob.len / 2;
        for (const lp of OBST_HULL_PTS) {
          const pw = v3.add(p, R(lp));
          const tt = clamp((pw[0] - ob.x) * dirx + (pw[2] - ob.z) * dirz, -half, half);
          const cx = ob.x + dirx * tt, cz = ob.z + dirz * tt;
          let ddx = pw[0] - cx, ddz = pw[2] - cz, d = Math.hypot(ddx, ddz);
          const Rr = ob.rad + OBSTACLES.hullR;
          if (d >= Rr) continue;
          if (d < 1e-4) { ddx = 1; ddz = 0; d = 1e-4; }
          const nx = ddx / d, nz = ddz / d, pen = Rr - d;
          const vp = pointVel(pw);
          const vn = (vp[0] - ob.vx) * nx + (vp[2] - ob.vz) * nz;
          const fn = Math.max(0, ob.hitK * (K.collK * pen - K.collDamp * Math.min(vn, 0)));
          const f = [nx * fn, ob.lift * fn, nz * fn];
          addForceAt(pw, f);
          // equal and opposite on the obstacle, at the contact point so it yaws too. Divided by
          // frameTicks because this runs once per kayak tick but is consumed once per frame.
          const kf = 1 / frameTicks;
          ob.fx -= f[0] * kf; ob.fz -= f[2] * kf;
          ob.tq -= ((cz - ob.z) * f[0] - (cx - ob.x) * f[2]) * kf;
          if (-vn > 0.8 && ob.hitK > 0.5) this.hitFlash = 1;
        }
      }
      // ---- roll: inverted pendulum; skill lowers instability and raises hip torque ----
      const Tl = qRotate(qConj(q), T);
      const grace = runTime < K.startGrace ? (1 - runTime / K.startGrace) : 0;
      Tl[2] += tr.instabK * Math.sin(this.roll) * subFac
             - K.rollDamp * this.wl[2]
             - this.lean * tr.leanTorque
             - grace * K.graceStab * this.roll;
      Tl[1] += paddleYaw - K.yawDamp * this.wl[1];
      Tl[0] += -K.pitchDamp * this.wl[0];
      for (let a = 0; a < 3; a++) this.wl[a] += Tl[a] / K.inertia[a] * dt;
      this.v = v3.add(this.v, v3.scale(F, dt / m));
      const sp = v3.len(this.v); if (sp > 15) this.v = v3.scale(this.v, 15 / sp);
      this.p = v3.add(p, v3.scale(this.v, dt));
      this.p[0] = clamp(this.p[0], 1, W * dx - 1); this.p[2] = clamp(this.p[2], 1, L * dx - 1);
      this.q = qNorm(qMul(q, qFromRotVec(v3.scale(this.wl, dt))));
      this.speed = Math.hypot(this.v[0], this.v[2]);
      if (Math.abs(this.roll) > K.capsize || Math.abs(this.pitch) > 1.35) endRun(false);
      if (this.p[2] > river.finishZ) endRun(true);
    },
  };

  // ============================================================================
  //  RUN CONTROL
  // ============================================================================
  function writeSimUniforms(time, inQ, jOffset = 0) {
    const ab = new ArrayBuffer(112), f = new Float32Array(ab), u = new Uint32Array(ab);
    u[0] = W; u[1] = L; f[2] = dx; f[3] = SIM.dt; f[4] = SIM.g; f[5] = river.R.manning; f[6] = SIM.hmin; f[7] = SIM.umax;
    f[8] = time; f[9] = river.inEta; f[10] = inQ; f[11] = river.inVelScale;
    f[12] = SIM.turbA; f[13] = SIM.turbL; f[14] = SIM.turbT; f[15] = SIM.foamDecay;
    f[16] = SIM.kDecay; f[17] = SIM.macCormack; f[18] = SIM.kGen; f[19] = SIM.foamGen;
    f[20] = jOffset;
    const vx = river.R.vortex;
    f[21] = vx ? vx.x : 0; f[22] = vx ? vx.z : 0; f[23] = vx ? vx.strength : 0;
    f[24] = vx ? vx.radius : 0;
    device.queue.writeBuffer(simUBuf, 0, ab);
  }

  function encodeSubstep(enc, rows = L) {
    const pass = enc.beginComputePass();
    for (let k = 0; k < 3; k++) { pass.setPipeline(simPipes[k]); pass.setBindGroup(0, simBGs[k]); pass.dispatchWorkgroups(W / 8, Math.ceil(rows / 8)); }
    pass.end();
  }
  // per-role size range and base-tint formula, shared by every biome — what actually varies per
  // biome is which concrete mesh a role resolves to (biome.props) and how often each role is
  // picked in a given terrain context (biome.mix), not these numbers
  const ROLE_SIZE = { tree: [0.8, 1.7], bush: [0.6, 1.4], rock: [0.4, 1.4], grass: [0.6, 1.4], boulder: [1.6, 3.0] };
  const ROLE_TINT = { tree: g => [g * 0.9, g, g * 0.9], bush: g => [g, g * 1.05, g * 0.9], rock: g => [g, g, g], boulder: g => [g * 0.95, g * 0.93, g * 0.9], grass: g => [g, 1, 0.9 * g] };
  // weighted pick among a mix table's roles; weights need not sum to 1 — the remainder is "place nothing"
  function pickRole(mix, r) {
    let acc = 0;
    for (const role in mix) { acc += mix[role]; if (r < acc) return role; }
    return null;
  }
  function placeVegetation() {
    const rng = mulberry32(river.seed + 99);
    const biome = BIOMES[river.R.biome || 'alpine'];
    // every prop mesh gets a (possibly empty) list so switching biomes always clears out
    // whatever the previous river's biome placed, not just the roles this biome still uses
    const lists = Object.fromEntries(Object.keys(vegMeshes).filter(k => k !== 'pole').map(k => [k, []]));
    const caps = Object.fromEntries(Object.entries(VEG.caps).map(([k, v]) => [k, Math.round(v * biome.vegDensity[k])]));
    const push = (role, x, z) => {
      // a biome's role can name one mesh or (for visual variety within that role — see the
      // rockSlab/boulderJagged/bushBerry/flowerTuft/treeBirch variants in meshes.js) a pool of
      // several, one of which is picked per placement so a patch of "rock" isn't the same lump
      // copy-pasted everywhere
      const spec = biome.props[role];
      const meshName = Array.isArray(spec) ? spec[Math.floor(rng() * spec.length)] : spec;
      if (!meshName || lists[meshName].length >= caps[role]) return;
      const [lo, hi] = ROLE_SIZE[role], sc = lo + rng() * (hi - lo);
      const g = 0.8 + 0.4 * rng(), tint = ROLE_TINT[role](g), bt = biome.vegTint[role];
      const y = terrainH(x, z) - 0.05;
      lists[meshName].push({ m: mat4TRS([x, y, z], rng() * 6.2832, [sc, sc * (0.85 + 0.3 * rng()), sc]), tint: [tint[0] * bt[0], tint[1] * bt[1], tint[2] * bt[2], 1] });
    };
    for (let n = 0; n < VEG.attempts; n++) {
      const x = rng() * W * dx, z = rng() * L * dx, j = clamp(Math.floor(z / dx), 0, L - 1), row = nearestChan(river.rows[j], x);
      const ad = Math.abs((x - row.c) / row.hw);
      if (ad < 1.25) continue;
      const y = terrainH(x, z); if (y < row.eta + 0.35) continue;
      const nrm = terrainN(x, z), m = (ad - 1) * row.hw, r = rng();
      const mixTable = nrm[1] < 0.72 ? biome.mix.steep : m < 3 ? biome.mix.bank : biome.mix.open;
      const role = pickRole(mixTable, r);
      if (role) push(role, x, z);
    }
    for (const [k, v] of Object.entries(lists)) writeInstances(k, v);
    const jf = clamp(Math.floor(river.finishZ / dx), 0, L - 1), rowf = river.rows[jf][0], poles = [];
    for (const s of [-1, 1]) { const x = rowf.c + s * (rowf.hw + 1.5), z = river.finishZ; poles.push({ m: mat4TRS([x, terrainH(x, z), z], s > 0 ? Math.PI : 0, [1, 1, 1]), tint: [1, 1, 1, 1] }); }
    writeInstances('pole', poles);
  }
  // spinning paddle (xp) and coin pickups, scattered along the navigable channel
  function placePickups() {
    const total = PICKUPS.countForTier(river.R.tier);
    const extra = total - PICKUPS.perTierBase;
    const floatCount = Math.round(Math.max(0, extra) * PICKUPS.floatFracOfExtra);
    const mkList = seedOff => {
      const rng = mulberry32(river.seed + seedOff), flagRng = mulberry32(river.seed + seedOff + 1);
      const list = [];
      for (let n = 0; n < total; n++) {
        const z = 45 + rng() * (river.finishZ - 65);
        const j = clamp(Math.floor(z / dx), 0, L - 1), chans = river.rows[j];
        const chan = chans[Math.floor(rng() * chans.length)];
        const x = clamp(chan.c + (rng() * 1.4 - 0.7) * chan.hw, 1, W * dx - 1);
        list.push({ x, z, floating: false, spinPh: rng() * 6.2832, bobPh: rng() * 6.2832, alive: true, collected: false, seenT: -1 });
      }
      const flags = Array.from({ length: total }, (_, i) => i < floatCount);
      for (let i = flags.length - 1; i > 0; i--) { const j = Math.floor(flagRng() * (i + 1)); [flags[i], flags[j]] = [flags[j], flags[i]]; }
      list.forEach((it, i) => { it.floating = flags[i]; });
      return list;
    };
    // dropped rucksacks aren't pre-placed like the rest — they spawn live, behind the kayak, as
    // the run goes (see spawnRucksacks). This just reserves RUCKSACK.count inactive slots up
    // front so the instance buffer never needs resizing; each slot only becomes real (a position,
    // floating, driftable) once the spawner activates it.
    const mkRucksackSlots = () => Array.from({ length: RUCKSACK.count }, () => (
      { x: 0, z: 0, vx: 0, vz: 0, boostDist: 0, floating: true, spinPh: Math.random() * 6.2832, bobPh: Math.random() * 6.2832,
        alive: false, collected: false, seenT: -1, checkT: 0, checkX: 0, checkZ: 0, nudging: false }));
    river.pickupKinds = ['paddle', 'coin', 'rucksack', ...(river.R.extraKind ? [river.R.extraKind] : [])];
    river.pickups = { paddle: mkList(201), coin: mkList(301), rucksack: mkRucksackSlots() };
    river.rucksackSpawnT = 0;
    if (river.R.extraKind) river.pickups[river.R.extraKind] = mkList(401);
    for (const kind of river.pickupKinds) {
      if (pickupInstBufs[kind]) pickupInstBufs[kind].destroy();
      pickupInstBufs[kind] = mkBuf(Math.max(80, river.pickups[kind].length * 80), GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
    }
  }
  // pushes each alive rucksack with the locally-sampled water velocity (waterAt is already the
  // right tool: real simulated flow — eddies, recirculation — near the boat, a Manning's-equation
  // downstream estimate further out). A dry/near-still cell naturally gives ~0 velocity, which is
  // exactly "washed up on the bank" with no extra logic. Every RUCKSACK.checkInterval seconds we
  // check how far it's actually moved; if it's under RUCKSACK.stuckDist (beached, or stuck in a
  // dead eddy) we blend in a small nudge back toward mid-channel — not a random direction, since
  // a random push near the bank is as likely to shove it further onto the shore as off it.
  function updateRucksackDrift(dtReal) {
    const list = river.pickups && river.pickups.rucksack;
    if (!list || !list.length) return;
    const k = 1 - Math.exp(-RUCKSACK.drag * dtReal);   // frame-rate-independent ease toward the current
    for (const it of list) {
      if (!it.alive) continue;
      const w = waterAt(it.x, it.z);
      it.checkT += dtReal;
      if (it.checkT >= RUCKSACK.checkInterval) {
        const moved = Math.hypot(it.x - it.checkX, it.z - it.checkZ);
        it.nudging = moved < RUCKSACK.stuckDist;
        it.checkT = 0; it.checkX = it.x; it.checkZ = it.z;
      }
      let targU = w.u * RUCKSACK.baseFactor, targV = w.v * RUCKSACK.baseFactor;
      if (it.boostDist > 0) {
        // held at the boosted target for a distance, not a duration — a fast stretch and a slow
        // one both get the same few extra metres of "shooting past the player" before tapering
        it.boostDist -= Math.abs(it.vz) * dtReal;
        targV = Math.sign(w.v || 1) * Math.max(Math.abs(w.v) * RUCKSACK.spawnBoost, RUCKSACK.spawnBoostMin);
      } else if (it.nudging) {
        const jrow = clamp(Math.floor(it.z / dx), 0, L - 1), chan = nearestChan(river.rows[jrow], it.x);
        const toCenter = clamp(chan.c - it.x, -RUCKSACK.nudgeSpeed, RUCKSACK.nudgeSpeed);
        targU += toCenter; targV += RUCKSACK.nudgeSpeed * 0.5;   // plus a little push back downstream
      }
      // real inertia, like everything else afloat in this sim, instead of snapping straight to
      // the water velocity — it visibly spins up to speed as the current catches it
      it.vx += (targU - it.vx) * k;
      it.vz += (targV - it.vz) * k;
      it.x = clamp(it.x + it.vx * dtReal, 1, W * dx - 1);
      it.z = clamp(it.z + it.vz * dtReal, 0, river.finishZ + 15);
    }
  }
  // dropped rucksacks aren't laid out along the river up front — up to RUCKSACK.count of them
  // spawn live, one every RUCKSACK.spawnInterval seconds, just upstream of the kayak's current
  // position. That way, if the player slows or stops paddling, the current is likely to carry
  // one right past them instead of it always being somewhere already behind on the map.
  function spawnRucksacks(dtReal) {
    const list = river.pickups && river.pickups.rucksack;
    if (!list) return;
    river.rucksackSpawnT += dtReal;
    if (river.rucksackSpawnT < RUCKSACK.spawnInterval) return;
    const slot = list.find(it => !it.alive && !it.collected);
    if (!slot) return;
    river.rucksackSpawnT = 0;
    // half spawn downstream, in front of the player — far enough out to be beyond render
    // distance, so it just quietly comes into view rather than popping in. It gets no speed
    // boost (unlike a behind-spawn): it drifts at the current's own pace, so actually reaching it
    // before it drifts on down to the take-out takes real paddling, not just holding a line.
    const ahead = Math.random() < RUCKSACK.aheadFrac;
    const dist = ahead ? RUCKSACK.spawnAheadMin + Math.random() * (RUCKSACK.spawnAheadMax - RUCKSACK.spawnAheadMin)
                        : RUCKSACK.spawnBehindMin + Math.random() * (RUCKSACK.spawnBehindMax - RUCKSACK.spawnBehindMin);
    const z = clamp(kayak.p[2] + (ahead ? dist : -dist), 20, river.finishZ - 10);
    const j = clamp(Math.floor(z / dx), 0, L - 1), chans = river.rows[j];
    const chan = chans[Math.floor(Math.random() * chans.length)];
    const x = clamp(chan.c + (Math.random() * 1.4 - 0.7) * chan.hw, 1, W * dx - 1);
    // launched downstream faster than the current, held there for RUCKSACK.spawnBoostDist metres
    // of actual travel, then eased back down to normal floating speed by the same drag relaxation
    // in updateRucksackDrift — so it visibly overtakes and pulls ahead of a slowed-down player
    // for a stretch before settling, instead of just gently appearing nearby. An ahead-spawn skips
    // the boost entirely — it's already out front, so goosing it further downstream would only
    // make it harder to catch.
    const w = waterAt(x, z);
    Object.assign(slot, { x, z, vx: w.u, vz: ahead ? w.v : w.v * RUCKSACK.spawnBoost, boostDist: ahead ? 0 : RUCKSACK.spawnBoostDist,
      spinPh: Math.random() * 6.2832, bobPh: Math.random() * 6.2832,
      alive: true, collected: false, seenT: -1, checkT: 0, checkX: x, checkZ: z, nudging: false });
  }
  // the tier's one-of-a-kind hidden-map pickup: only exists on that tier's predetermined carrier
  // river (profile.mapCarrier), and re-rolls to a fresh random spot — via Math.random(), not the
  // river's seed — every time this function runs, i.e. every attempt, until it's found for good.
  function placeMapItem() {
    const tier = river.R.tier;
    const isCarrier = !river.R.hidden && profile.mapCarrier[tier] === river.R.name && !profile.unlockedHidden[tier];
    if (!isCarrier) { river.pickups.map = []; return; }
    const z = 45 + Math.random() * (river.finishZ - 65);
    const j = clamp(Math.floor(z / dx), 0, L - 1), chans = river.rows[j];
    const chan = chans[Math.floor(Math.random() * chans.length)];
    const x = clamp(chan.c + (Math.random() * 1.4 - 0.7) * chan.hw, 1, W * dx - 1);
    river.pickups.map = [{ x, z, floating: false, spinPh: Math.random() * 6.2832, bobPh: Math.random() * 6.2832, alive: true, collected: false, seenT: -1 }];
  }
  // ---------- floating obstacles ----------
  // The floating-height reference. waterAt() switches hard between the live simulated surface
  // (inside the 16 m readback band around the boat) and the channel's nominal level outside it,
  // and in a riffle the two differ by tens of centimetres — fine for forces, but a log riding
  // that step visibly jumped, and a thin one jumped under the water and flickered out of sight.
  // Blend across the band edge instead; the caller additionally low-passes the result.
  function surfaceAt(x, z) {
    const jr = clamp(Math.floor(z / dx), 0, L - 1);
    const nominal = Math.max(nearestChan(river.rows[jr], x).eta, terrainH(x, z));
    if (!band.ready) return nominal;
    const dj = Math.abs(z / dx - (band.j0 + BAND_ROWS / 2));
    const wgt = 1 - smoothstep(BAND_ROWS / 2 - 8, BAND_ROWS / 2 - 3.5, dj);
    return wgt <= 0 ? nominal : nominal + (waterAt(x, z).eta - nominal) * wgt;
  }
  // per-run setup: parses RIVERS[].obstacles into spawn entries, sizes the instance buffers to the
  // quota, and pre-populates the reach ahead so the run doesn't start on an empty river.
  // Must run after kayak.reset() — the seeding is relative to the boat.
  function placeObstacles() {
    river.obstacles = []; river.obstNear = []; river.obstSpawn = []; river.obstDraw = [];
    river.obstCap = 0;
    const cfg = river.R.obstacles;
    if (!cfg || !OBSTACLES.enabled) return;
    river.obstCap = cfg.max ?? OBSTACLES.maxActive;
    river.obstAhead = cfg.spawnAhead ?? OBSTACLES.spawnAhead;
    river.obstRng = mulberry32(river.seed + 501);
    river.obstLastZ = kayak.p[2];
    for (const [kindName, kindCfg] of Object.entries(cfg)) {
      const kind = OBSTACLES.kinds[kindName];
      if (!kind) continue;                                   // `max`, `spawnAhead` … aren't kinds
      for (const clsName of Object.keys(OBSTACLES.classes)) {
        const entry = kindCfg[clsName];
        if (entry == null || !kind[clsName]) continue;
        const spec = typeof entry === 'number' ? { per100m: entry } : entry;
        river.obstSpawn.push({ kindName, clsName, kind, cls: OBSTACLES.classes[clsName], base: kind[clsName], spec, acc: 0 });
      }
    }
    const need = Math.max(80, river.obstCap * 80);
    for (const name of Object.keys(obstMeshes)) {
      if (obstInstBufs[name] && obstInstBufs[name].size >= need) continue;
      if (obstInstBufs[name]) obstInstBufs[name].destroy();
      obstInstBufs[name] = mkBuf(need, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
    }
    const z0 = kayak.p[2] + OBSTACLES.seedAheadFrom, z1 = kayak.p[2] + river.obstAhead[1];
    for (const e of river.obstSpawn) {
      const n = Math.floor((e.spec.per100m ?? 0) * (z1 - z0) / 100 + river.obstRng());
      for (let k = 0; k < n; k++) spawnObstacle(e, z0 + river.obstRng() * (z1 - z0));
    }
  }
  // one obstacle of spawn entry `e`, somewhere in the channel at z. Returns false if the quota is
  // full or the spot is unusable (past the take-out, in a pond, on top of another obstacle).
  function spawnObstacle(e, z) {
    const list = river.obstacles, rng = river.obstRng;
    if (list.length >= river.obstCap || z > river.finishZ - 5) return false;
    const pond = river.R.pond;
    if (pond && Math.abs(z - pond.z) < pond.len / 2 + 5) return false;
    const lenR = e.spec.len ?? e.base.len, len = lenR[0] + rng() * (lenR[1] - lenR[0]);
    const mesh = e.base.meshes[Math.floor(rng() * e.base.meshes.length)], V = obstMeshes[mesh];
    const sc = len / V.len, rad = V.rad * sc;
    const j = clamp(Math.floor(z / dx), 0, L - 1), chans = river.rows[j];
    const chan = chans[Math.floor(rng() * chans.length)];
    let x = 0, ok = false;
    for (let tries = 0; tries < 8 && !ok; tries++) {
      x = clamp(chan.c + (rng() * 1.3 - 0.65) * chan.hw, 1, W * dx - 1);
      ok = list.every(o => Math.hypot(o.x - x, o.z - z) > (o.len + len) * 0.5 + 1);
    }
    if (!ok) return false;
    const g = 0.85 + 0.3 * rng(), w = waterAt(x, z);
    list.push({
      kind: e.kindName, cls: e.clsName, mesh, len, rad, sc,
      draft: V.draft * sc, mass: Math.max(20, e.kind.density * V.vol * sc * sc * sc),
      samples: e.cls.samples, hitK: e.cls.hitK, lift: e.cls.lift,
      x, z, y: surfaceAt(x, z), yaw: rng() * 6.2832, roll: e.kind.roll ? rng() * 6.2832 : 0,
      vx: w.u, vz: w.v, w: (rng() - 0.5) * 0.2, bobPh: rng() * 6.2832,   // born already moving with the current
      fx: 0, fz: 0, tq: 0, grounded: false, sinking: false, sinkT: 0, y0: 0, alpha: 1,
      tint: [g, g, g, 1],
    });
    return true;
  }
  // density-based: per100m spawns accrue per metre of downstream progress (not per second — an
  // idle boat doesn't fill the river up), dropped in `spawnAhead` metres downstream
  function spawnObstacles() {
    if (!river.obstSpawn.length) return;
    const kz = kayak.p[2], prog = Math.max(0, kz - river.obstLastZ);
    river.obstLastZ = Math.max(river.obstLastZ, kz);
    const [a0, a1] = river.obstAhead;
    for (const e of river.obstSpawn) {
      e.acc += prog * (e.spec.per100m ?? 0) / 100;
      while (e.acc >= 1) { e.acc -= 1; spawnObstacle(e, kz + a0 + river.obstRng() * (a1 - a0)); }
    }
  }
  // one body, one substep (see OBSTACLES in config.js for the model)
  function stepObstacle(ob, dt) {
    const dirx = Math.sin(ob.yaw), dirz = Math.cos(ob.yaw), half = ob.len / 2, S = ob.samples;
    let Fx = ob.fx, Fz = ob.fz, T = ob.tq, grounded = false;
    for (let s = 0; s < S; s++) {
      const t = (S > 1 ? (s / (S - 1)) * 2 - 1 : 0) * half;
      const rx = dirx * t, rz = dirz * t;
      const px = ob.x + rx, pz = ob.z + rz;
      const w = waterAt(px, pz);
      const pvx = ob.vx + ob.w * rz, pvz = ob.vz - ob.w * rx;   // point velocity (ω about +Y)
      const relx = pvx - w.u, relz = pvz - w.v;
      const al = relx * dirx + relz * dirz;
      const latx = relx - al * dirx, latz = relz - al * dirz;
      const wet = clamp(w.h / ob.draft, 0, 1);                  // a beached log barely feels the flow
      const cA = ob.mass * OBSTACLES.dragAxial / S * wet, cL = ob.mass * OBSTACLES.dragLat / S * wet;
      let fx = -(cA * al * dirx + cL * latx), fz = -(cA * al * dirz + cL * latz);
      if (w.h < ob.draft) {
        // grounded: the bed slope pushes it back toward deeper water (so a log in a shallow riffle
        // shuffles off), but on a flat bar the slope is ~0 and friction simply strands it
        const pen = ob.draft - w.h, nrm = terrainN(px, pz), sc = ob.mass / S;
        fx += sc * OBSTACLES.groundPush * pen * nrm[0];
        fz += sc * OBSTACLES.groundPush * pen * nrm[2];
        const fr = sc * OBSTACLES.groundFric * clamp(pen / ob.draft, 0, 1);
        fx -= fr * pvx; fz -= fr * pvz;
        grounded = true;
      }
      Fx += fx; Fz += fz; T += rz * fx - rx * fz;
    }
    const I = Math.max(ob.mass * ob.len * ob.len / 12, 1);
    ob.vx += Fx / ob.mass * dt; ob.vz += Fz / ob.mass * dt;
    ob.w = (ob.w + T / I * dt) * Math.exp(-OBSTACLES.yawDrag * dt);
    const sp = Math.hypot(ob.vx, ob.vz);
    if (sp > OBSTACLES.vmax) { ob.vx *= OBSTACLES.vmax / sp; ob.vz *= OBSTACLES.vmax / sp; }
    ob.w = clamp(ob.w, -OBSTACLES.wmax, OBSTACLES.wmax);
    ob.x = clamp(ob.x + ob.vx * dt, 1, W * dx - 1);
    ob.z += ob.vz * dt;
    ob.yaw += ob.w * dt;
    ob.grounded = grounded;
  }
  // A's axis sampled against B's axis, pushing the pair apart where the capsules overlap. Called
  // both ways round per pair — what lets logs pile up behind a jammed one instead of passing through.
  function contactSegs(A, B, dt) {
    const adx = Math.sin(A.yaw), adz = Math.cos(A.yaw);
    const bdx = Math.sin(B.yaw), bdz = Math.cos(B.yaw), bh = B.len / 2;
    const mEff = 2 * A.mass * B.mass / (A.mass + B.mass), Rr = A.rad + B.rad;
    for (let s = 0; s < 3; s++) {
      const ta = (s - 1) * A.len / 2;
      const ax = A.x + adx * ta, az = A.z + adz * ta;
      const tb = clamp((ax - B.x) * bdx + (az - B.z) * bdz, -bh, bh);
      const bx = B.x + bdx * tb, bz = B.z + bdz * tb;
      let ddx = ax - bx, ddz = az - bz, d = Math.hypot(ddx, ddz);
      if (d >= Rr) continue;
      if (d < 1e-4) { ddx = 1; ddz = 0; d = 1e-4; }
      const nx = ddx / d, nz = ddz / d, pen = Rr - d;
      const avx = A.vx + A.w * adz * ta, avz = A.vz - A.w * adx * ta;
      const bvx = B.vx + B.w * bdz * tb, bvz = B.vz - B.w * bdx * tb;
      const vn = (avx - bvx) * nx + (avz - bvz) * nz;
      const f = mEff * (OBSTACLES.pairK * pen - OBSTACLES.pairDamp * Math.min(vn, 0)) / 3;
      if (f <= 0) continue;
      const fx = nx * f, fz = nz * f;
      A.vx += fx / A.mass * dt; A.vz += fz / A.mass * dt;
      A.w += ((adz * ta) * fx - (adx * ta) * fz) / (A.mass * A.len * A.len / 12) * dt;
      B.vx -= fx / B.mass * dt; B.vz -= fz / B.mass * dt;
      B.w -= ((bdz * tb) * fx - (bdx * tb) * fz) / (B.mass * B.len * B.len / 12) * dt;
    }
  }
  function updateObstacles(dtReal) {
    spawnObstacles();
    const list = river.obstacles;
    if (!list.length) return;
    const kz = kayak.p[2], steps = OBSTACLES.substeps, dt = dtReal / steps;
    const active = [];
    for (const ob of list) {
      if (!ob.sinking && (ob.z < kz - OBSTACLES.despawnBehind || ob.z > river.finishZ + 15)) { ob.sinking = true; ob.sinkT = 0; ob.y0 = ob.y; }
      if (ob.sinking) {      // retiring: frozen, sinks on an ease-in while fading, then leaves the list
        ob.sinkT += dtReal;
        const s = clamp(ob.sinkT / OBSTACLES.sinkTime, 0, 1);
        ob.alpha = 1 - s; ob.y = ob.y0 - OBSTACLES.sinkDepth * s * s;
        ob.fx = 0; ob.fz = 0; ob.tq = 0;
        continue;
      }
      active.push(ob);
    }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].sinking && list[i].sinkT >= OBSTACLES.sinkTime) list.splice(i, 1);
    for (let s = 0; s < steps; s++) {
      for (const ob of active) stepObstacle(ob, dt);
      for (let a = 0; a < active.length; a++) for (let b = a + 1; b < active.length; b++) {
        const A = active[a], B = active[b], reach = (A.len + B.len) / 2 + A.rad + B.rad;
        if (Math.abs(A.z - B.z) > reach || Math.abs(A.x - B.x) > reach) continue;
        contactSegs(A, B, dt); contactSegs(B, A, dt);
      }
    }
    // floating height: blended surface reference (surfaceAt) plus a low-pass, so neither the
    // readback-band edge nor a grounding transition can make one jump
    const ky = 1 - Math.exp(-dtReal * OBSTACLES.ySmooth);
    for (const ob of active) {
      ob.fx = 0; ob.fz = 0; ob.tq = 0;
      const target = surfaceAt(ob.x, ob.z) + (ob.grounded ? 0 : OBSTACLES.bob * Math.sin(simTime * OBSTACLES.bobSpeed + ob.bobPh));
      ob.y += (target - ob.y) * ky;
    }
    // broad phase for the kayak contact test, consumed by kayak.step next frame
    river.obstNear = active.filter(ob => ob.hitK > 0 &&
      Math.hypot(ob.x - kayak.p[0], ob.z - kayak.p[2]) < ob.len / 2 + ob.rad + 4);
  }
  function writeObstacleInstances() {
    const groups = {};
    for (const ob of river.obstacles || []) (groups[ob.mesh] || (groups[ob.mesh] = [])).push(ob);
    river.obstDraw = [];
    for (const [name, list] of Object.entries(groups)) {
      const data = new Float32Array(list.length * 20);
      list.forEach((ob, n) => {
        const q = qMul(qAxisAngle([0, 1, 0], ob.yaw), qAxisAngle([0, 0, 1], ob.roll));
        data.set(mat4Compose([ob.x, ob.y, ob.z], q, [ob.sc, ob.sc, ob.sc]), n * 20);
        data.set([ob.tint[0], ob.tint[1], ob.tint[2], ob.alpha], n * 20 + 16);
      });
      device.queue.writeBuffer(obstInstBufs[name], 0, data);
      river.obstDraw.push({ name, count: list.length });
    }
  }
  // recompute pickup transforms/fade each frame and resolve collection against the paddler
  function updatePickups() {
    if (!river.pickups) return;
    for (const kind of [...river.pickupKinds, 'map']) {
      const isMap = kind === 'map', isRucksack = kind === 'rucksack';
      const list = river.pickups[kind], buf = pickupInstBufs[kind];
      if (!list || !list.length || !buf) continue;
      const data = new Float32Array(list.length * 20);
      list.forEach((it, n) => {
        let alpha = 0;
        if (it.alive) {
          const bobPhase = simTime * PICKUPS.bobSpeed + it.bobPh;
          const bob = it.floating ? PICKUPS.bobAmp * Math.sin(bobPhase) : 0;

          const jrow = clamp(Math.floor(it.z / dx), 0, L - 1);
          const y = nearestChan(river.rows[jrow], it.x).eta + (isMap ? MAP_ITEM.hover : isRucksack ? RUCKSACK.hover : PICKUPS.hover) + bob;
          const dist = Math.hypot(kayak.p[0] - it.x, kayak.p[2] - it.z);
          // the map item is a rare key item — it stays fully visible/collectible for the whole
          // run rather than fading like the regular scattered pickups do
          if (isMap) alpha = 1;
          else {
            const fadeTime = isRucksack ? RUCKSACK.fadeTime : PICKUPS.fadeTime;
            if (it.seenT < 0 && dist < PICKUPS.proximityRadius) it.seenT = simTime;
            if (it.seenT >= 0) {
              const fadeT = simTime - it.seenT;
              alpha = clamp(1 - fadeT / fadeTime, 0, 1);
              if (fadeT >= fadeTime) it.alive = false;
            } else alpha = 1;
          }
          // the bob-phase collection gate exists so the small scattered floaters don't feel like
          // they can be grabbed "through" their bob arc — but the rucksack is a large, deliberate
          // target you're actively chasing down, so it shouldn't have a hidden window where
          // paddling right up to it still whiffs; always reachable while in range instead
          const reachable = isRucksack || !it.floating || Math.sin(bobPhase) <= PICKUPS.reachBob;
          // a raft/tube ring's lootMod shrinks the reach for anything but the key-item map pickup —
          // "unlikely to catch much loot with it" is modelled as a much smaller collect window
          const lootMod = isMap ? 1 : (runCraft.lootMod ?? 1);
          const collectR = (isMap ? MAP_ITEM.collectRadius : isRucksack ? RUCKSACK.collectRadius : PICKUPS.collectRadius) * lootMod;
          if (it.alive && dist < collectR && reachable) {
            it.alive = false; it.collected = true; alpha = 0;
            if (isMap) {
              unlockHidden(profile, river.R.tier);
              mapFoundUntil = simTime + 3.5;
              spawnBurst(it.x, y, it.z, MAP_ITEM.color);
            } else {
              const C = COLLECTIBLES[kind];
              if (C.type === 'random') {   // rucksack: roll what's actually inside
                const totalW = C.roll.reduce((s, r) => s + r.weight, 0);
                let roll = Math.random() * totalW, picked = null;
                for (const r of C.roll) { roll -= r.weight; if (roll <= 0) { picked = r.kind; break; } }
                picked = picked || C.roll[C.roll.length - 1].kind;
                if (picked === 'special') {
                  const keys = Object.keys(SPECIAL_ITEMS);
                  picked = keys[Math.floor(Math.random() * keys.length)];
                  // raft/helmet are one-off, globally — once a profile already has one, a repeat
                  // roll just resolves to empty instead of a duplicate
                  if (picked === 'raft' && profile.crafts.includes('raft')) picked = 'empty';
                  if (picked === 'helmet' && profile.upgrades.includes('helmet')) picked = 'empty';
                }
                let color = COLLECTIBLES.rucksack.color, popAs = null;
                if (picked === 'coin' || picked === 'diamond') {
                  const cc = COLLECTIBLES[picked]; runLoot.coins++; runLoot.coinValue += cc.value; color = cc.color; popAs = 'coin';
                } else if (picked === 'snack') { runLoot.snacks++; color = ITEMS.snack.color; popAs = 'snack'; }
                else if (picked === 'bandaid') { runLoot.bandaids++; color = ITEMS.bandaid.color; }
                else if (picked === 'medikit') { runLoot.medikits++; color = ITEMS.medikit.color; }
                else if (picked === 'book') { runLoot.books++; color = SPECIAL_ITEMS.book.color; }
                else if (picked === 'raft') { runLoot.raftFound = true; color = SPECIAL_ITEMS.raft.color; }
                else if (picked === 'helmet') { runLoot.helmetFound = true; color = SPECIAL_ITEMS.helmet.color; }
                // 'empty' just falls through with the rucksack's own colour and no reward
                spawnBurst(it.x, y, it.z, color);
                if (popAs) popLoot(popAs);
              } else {
                const popAs = C.type === 'xp' ? 'paddle' : 'coin';
                if (C.type === 'xp') runLoot.paddles++;
                else { runLoot.coins++; runLoot.coinValue += C.value; }
                spawnBurst(it.x, y, it.z, C.color);
                popLoot(popAs);
              }
            }
          }
          const spin = simTime * (isMap ? MAP_ITEM.spinSpeed : isRucksack ? RUCKSACK.spinSpeed : PICKUPS.spinSpeed) + it.spinPh;
          const sc = isMap ? MAP_ITEM.scale : isRucksack ? RUCKSACK.scale : kind === 'paddle' ? PICKUPS.paddleScale : 1;
          data.set(mat4TRS([it.x, y, it.z], spin, [sc, sc, sc]), n * 20);
        } else {
          data.set(mat4TRS([it.x, -1000, it.z], 0, [1, 1, 1]), n * 20);
        }
        data.set([1, 1, 1, alpha], n * 20 + 16);
      });
      device.queue.writeBuffer(buf, 0, data);
    }
  }

  async function runWarmup() {
    const chunk = 30;
    for (let s = 0; s < SIM.warmupSteps; s += chunk) {
      const enc = device.createCommandEncoder();
      const n = Math.min(chunk, SIM.warmupSteps - s);
      for (let k = 0; k < n; k++) encodeSubstep(enc);
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
    }
  }
  async function startRun(R) {
    if (warmingUp) return;
    if (!profile) return showMenu();
    runCraft = craftOf(profile); effK = craftKayakParams(runCraft, profile);

    if (isMobile) { gyro.request(); enterFullscreen(); }   // both must run inside the tap that brought us here
    warmingUp = true;
    $('menu').style.display = 'none'; $('lvl').style.display = 'none'; $('stam').style.display = 'block'; $('loot').style.display = 'flex';
    $('msg').style.display = 'flex'; $('msg').innerHTML = 'Loading river…';
    if (!river || river.R !== R) {          // regenerate only when the river changes (R restarts are instant)
      river = generateRiver(R);
      fillTerrainIndex(river.b);
  
      device.queue.writeBuffer(terrainBuf, 0, river.b); device.queue.writeBuffer(maskBuf, 0, river.mask);
      placeVegetation();
      placePickups();
    }
    for (const kind of river.pickupKinds) if (kind !== 'rucksack') for (const it of river.pickups[kind]) { it.alive = true; it.collected = false; it.seenT = -1; }
    // rucksacks aren't pre-placed, so a restart deactivates every slot instead of reviving it in
    // place — spawnRucksacks() will place fresh ones behind wherever the kayak starts this attempt
    for (const it of river.pickups.rucksack) { it.alive = false; it.collected = false; it.vx = 0; it.vz = 0; it.nudging = false; }
    river.rucksackSpawnT = 0;
    placeMapItem();   // re-rolled every attempt, not just on river regeneration
    

    runLoot = { paddles: 0, coins: 0, coinValue: 0, snacks: 0, bandaids: 0, medikits: 0, books: 0, raftFound: false, helmetFound: false };
    device.queue.writeBuffer(stateBufs[0], 0, river.state); device.queue.writeBuffer(kBufs[0], 0, river.kArr);
    device.queue.writeBuffer(partBuf, 0, new Float32Array(PARTS.count * 8));
    writeSimUniforms(0, 1);
    await runWarmup();
    band.ready = false;
    kayak.reset(); 
    cam.reset();
    placeObstacles();   // seeded relative to the boat, so after reset; redone every attempt
    if (isMobile) gyro.calibrate();          // however the phone is held right now counts as level
    document.body.classList.add('inrun');
    simTime = 0; runTime = 0;

    $('msg').style.display = 'none';
    warmingUp = false; gameState = 'run';
  }
  function endRun(won) {
    if (gameState !== 'run') return;
    gameState = 'over';
    const msg = $('msg');
    msg.style.display = 'flex';
    const actions = `<div class="mbtns"><button id="btnRetry">↻ Run again</button><button id="btnMenu">River menu</button></div>
        <small class="desktop-only">R — run again · Esc — river menu</small>`;
    if (won) {
      const { pts, basePts, paddleXp, coins, ups, bandaids, medikits, snacks, bookBoost, raftFound, helmetFound } = awardRun(profile, river.R, runTime, runLoot);
      const best = profile.best[river.R.name] === runTime ? ' · new best!' : '';
      const finds = [];
      if (snacks) finds.push(`${snacks} snack${snacks > 1 ? 's' : ''}`);
      if (bandaids) finds.push(`${bandaids} bandaid${bandaids > 1 ? 's' : ''}`);
      if (medikits) finds.push(`${medikits} medikit${medikits > 1 ? 's' : ''}`);
      if (bookBoost) finds.push(`a book — +${bookBoost} skill boost`);
      if (raftFound) finds.push('an inflatable raft!');
      if (helmetFound) finds.push('a better helmet!');
      msg.innerHTML = `🏁 Take-out reached!<br>${river.R.name} in ${runTime.toFixed(1)} s${best}<br>
        <span style="color:#ffe08a">+${basePts} finish${paddleXp ? ` +${paddleXp} paddle` : ''} = +${pts} xp${coins ? ` · +${coins} coin${coins > 1 ? 's' : ''}` : ''}${ups ? ` — LEVEL UP${ups > 1 ? ' ×' + ups : ''}!` : ` · ${profile.points}/${pointsForLevel(profile.level)} to level ${profile.level + 1}`}</span>
        ${finds.length ? `<br><small style="color:#9be0ff">found ${finds.join(', ')}</small>` : ''}
        ${actions}`;
      if (ups || bookBoost) setTimeout(showLevelUp, 900);
    } else {
      const { gain, dead, injury, cap } = applyInjury(profile, river.R.tier);
      if (dead) {
        // permadeath: applyInjury has already wiped the save. Drop the in-memory profile/river
        // too and send the player back to character select — there is no run/menu state left
        // that still makes sense to offer (no Retry, no River menu).
        profile = null; river = null;
        msg.innerHTML = `💀 GAME OVER<br><small style="color:#ff9a80">Your injuries finally caught up with you — this paddler's story ends here.</small>
          <br><small>+${gain} injury (${injury}/${cap})</small>
          <div class="mbtns"><button id="btnNewPaddler">New paddler</button></div>`;
        $('btnNewPaddler').onclick = () => showMenu();
        return;
      }
      const lostParts = [];
      if (runLoot.paddles) lostParts.push(`${runLoot.paddles} paddle${runLoot.paddles === 1 ? '' : 's'}`);
      if (runLoot.coins) lostParts.push(`${runLoot.coins} coin${runLoot.coins === 1 ? '' : 's'}`);
      if (runLoot.snacks) lostParts.push(`${runLoot.snacks} snack${runLoot.snacks === 1 ? '' : 's'}`);
      if (runLoot.bandaids) lostParts.push(`${runLoot.bandaids} bandaid${runLoot.bandaids === 1 ? '' : 's'}`);
      if (runLoot.medikits) lostParts.push(`${runLoot.medikits} medikit${runLoot.medikits === 1 ? '' : 's'}`);
      if (runLoot.books) lostParts.push('a skill boost');
      if (runLoot.raftFound) lostParts.push('the raft');
      if (runLoot.helmetFound) lostParts.push('the helmet');
      msg.innerHTML = `🌊 Capsized! You're swimming.<br>${(kayak.p[2] - 15).toFixed(0)} m of ${(river.finishZ - 15).toFixed(0)} m
        <br><small style="color:#ff9a80">+${gain} injury (${injury}/${cap})</small>
        ${lostParts.length ? `<br><small style="color:#ff9a80">lost ${lostParts.join(', ')} — loot only banks on a finish</small>` : ''}
        ${actions}`;
    }
    $('btnRetry').onclick = retryRun;
    $('btnMenu').onclick = () => showMenu();
  }

  // ---------- camera ----------
  const cam = {
    pos: [0, 5, 0], look: [0, 0, 10], dir: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0],
    // mobile screens are small and mostly held at arm's length, so the usual desktop framing
    // leaves the boat/water too tiny to read — pull the rig in to half distance on mobile only
    reset() { this.dir = v3.norm(qRotate(kayak.q, [0, 0, 1])); const p = kayak.p; const cs = isMobile ? 0.5 : 1; this.pos = [p[0], p[1] + 3.5 * cs, p[2] - 8 * cs]; this.look = [p[0], p[1], p[2] + 5]; },
    update(dt) {
      const p = kayak.p, cs = isMobile ? 0.5 : 1;
      let wantDir;
      if (camMode === 1) wantDir = [0, 0, 1];
      else { const f = qRotate(kayak.q, [0, 0, 1]); wantDir = v3.norm([f[0], 0, f[2]]); if (v3.dot(wantDir, [0, 0, 1]) < -0.2 && camMode === 0) wantDir = v3.norm(v3.add(wantDir, [0, 0, 1.3])); }
      const k = 1 - Math.exp(-dt * (camMode === 1 ? 6 : 1.8));
      this.dir = v3.norm(v3.add(this.dir, v3.scale(v3.sub(wantDir, this.dir), k)));
      const back = (camMode === 2 ? 16 : 8.5) * cs, up = (camMode === 2 ? 11 : 3.4) * cs;
      const want = v3.add(v3.sub(p, v3.scale(this.dir, back)), [0, up, 0]);
      want[1] = Math.max(want[1], terrainH(want[0], want[2]) + 1.5);
      const kp = 1 - Math.exp(-dt * 5);
      this.pos = v3.add(this.pos, v3.scale(v3.sub(want, this.pos), kp));
      const wantLook = v3.add(p, v3.add(v3.scale(this.dir, camMode === 2 ? 8 : 5), [0, 0.4, 0]));
      this.look = v3.add(this.look, v3.scale(v3.sub(wantLook, this.look), kp));
    },
  };
  // per-biome atmosphere (see BIOME_SKY in config.js) — recomputed per frame rather than once at
  // load, since which river/biome is current changes at runtime; falls back to the plain RENDER
  // defaults with no river loaded yet (menu) or for a biome with no override.
  function currentSky() {
    return (river && BIOME_SKY[river.R.biome]) || { sunDir: RENDER.sunDir, fogColor: RENDER.fogColor, fogMul: 1 };
  }
  function writeCam() {
    const proj = mat4Perspective(60 * Math.PI / 180, canvas.width / canvas.height, 0.3, 900);
    const view = mat4LookAt(cam.pos, cam.look, [0, 1, 0]);
    const vp = mat4Mul(proj, view), ivp = mat4Invert(vp);
    cam.right = [view[0], view[4], view[8]]; cam.up = [view[1], view[5], view[9]];
    const sky = currentSky(), sunDir = v3.norm(sky.sunDir);
    const f = new Float32Array(68);
    f.set(vp, 0); f.set(ivp, 16);
    f.set([cam.pos[0], cam.pos[1], cam.pos[2], 1], 32); f.set([sunDir[0], sunDir[1], sunDir[2], 0], 36);
    f.set([simTime, W, L, dx], 40);
    f.set([sky.fogColor[0], sky.fogColor[1], sky.fogColor[2], RENDER.fogDensity * (sky.fogMul ?? 1)], 44);
    f.set([dbgMode, SIM.hmin, QUALITY[quality].simpleShading ? 1 : 0, 0], 48);
    f.set([cam.right[0], cam.right[1], cam.right[2], 0], 52);
    f.set([cam.up[0], cam.up[1], cam.up[2], 0], 56);
    const wt = (river && river.R.waterTint) || [0.02, 0.10, 0.09];   // the original deep-water colour
    f.set([wt[0], wt[1], wt[2], (river && river.R.waterClarity) || 1], 60);
    f.set([BIOME_IDS[(river && river.R.biome) || 'alpine'] ?? 0, 0, 0, 0], 64);
    f.set([dbgMode, SIM.hmin, QUALITY[quality].simpleShading ? 1 : 0, RENDER.lod.near], 48);
    device.queue.writeBuffer(camUBuf, 0, f);
  }

  function lodSlices(overlap) {
    const zk = kayak.p[2], lod = RENDER.lod;
    const near = Math.min(lod.near, RENDER.viewAhead), mid = Math.min(Math.max(lod.mid, near), RENDER.viewAhead);
    const up = (j, s) => Math.ceil(j / s) * s;
    const jB = clamp(Math.floor((zk - RENDER.viewBehind) / dx), 0, L - 2);
    const jN = clamp(up(Math.ceil((zk + near) / dx), 2), jB + 1, L - 1);
    const jM = clamp(up(Math.ceil((zk + mid) / dx), 4), jN, L - 1);
    const jA = clamp(Math.ceil((zk + RENDER.viewAhead) / dx), jM, L - 1);
    const seams = [jB, jN, jM, jA], out = [];
    for (let k = 0; k < 3; k++) {
      const lo = lods[k], s = lo.s;
      const r0 = clamp(Math.floor(seams[k] / s) - (k && overlap ? 1 : 0), 0, lo.rows - 2);
      const r1 = clamp(Math.ceil(seams[k + 1] / s), 0, lo.rows - 1);
      if (r1 > r0) out.push({ buf: lo.buf, first: r0 * lo.rowIdx, count: (r1 - r0) * lo.rowIdx });
    }
    return out;
  }

  // ---------- kayak instances ----------
  function updateKayakInstances(dtReal) {
    const k = kayak, M = mat4Compose(k.p, k.q, [1, 1, 1]);
    const I = mat4Compose([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
    const inst = (name, local, tint = [1, 1, 1, 1]) => { const m = mat4Mul(M, local), d = new Float32Array(20); d.set(m, 0); d.set(tint, 16); device.queue.writeBuffer(kayakInst[name], 0, d); return m; };
        const flash = 1 + 0.6 * k.hitFlash, hc = runCraft.color;
    inst('hull', I, [hc[0] * flash, hc[1] * flash, hc[2] * flash, 1]); inst('cockpit', I);
    const vk = Math.min(1, dtReal * 9);
    k.visSide += (k.side - k.visSide) * vk;
    k.visAmp += ((k.mode === 'sweep' ? 1.0 : 0.6) - k.visAmp) * vk;
    k.visDirn += ((k.mode === 'back' ? -1 : 1) - k.visDirn) * vk;
    k.visEnv += ((k.paddling ? 1 : 0) - k.visEnv) * vk;
    k.visBack += ((k.mode === 'back' ? -0.5 : 1) - k.visBack) * vk;
    // a tired paddler slumps forward a little
    const slump = k.tired ? 0.12 : 0;
    const leanQ = qMul(qAxisAngle([0, 0, 1], -k.lean * 0.45), qAxisAngle([1, 0, 0], 0.18 * k.env * k.visBack + slump));
    const torsoL = mat4Mul(mat4Compose([0, 0.30, 0.05], leanQ, [1, 1, 1]), mat4Compose([0, 0.25, 0], [0, 0, 0, 1], [1, 1, 1]));
    inst('torso', torsoL);
    inst('head', mat4Mul(torsoL, mat4Compose([0, 0.37, 0.02], [0, 0, 0, 1], [1, 1, 1])));
    const s = k.visSide, env = k.visEnv;     // visSide: paddle roll and the blade emitter position glide across
    const yawTarget = -k.side * k.visAmp * Math.cos(Math.PI * k.strokeT) * k.visDirn;
    const maxSwing = KAYAK.paddleSwingRate * dtReal;
    k.visYaw += clamp(yawTarget - k.visYaw, -maxSwing, maxSwing);
    const paddleQ = qMul(qAxisAngle([0, 0, 1], -s * 0.55 * env), qAxisAngle([0, 1, 0], k.visYaw * env));

    const paddleL = mat4Mul(torsoL, mat4Compose([0, 0.12, 0.28], paddleQ, [1, 1, 1]));
    const paddleW = inst('paddle', paddleL);
    const mb = new MeshBuilder();
    for (const sd of [-1, 1]) {
      const sh = mat4Transform(torsoL, [sd * 0.19, 0.2, 0.03]), hd = mat4Transform(paddleL, [sd * 0.33, 0, 0]);
      addCylinder(mb, sh, hd, 0.04, 0.03, 8, [0.12, 0.32, 0.82]);
    }
    device.queue.writeBuffer(armBuf, 0, mb.data());
    inst('arms', I);
    k.bladePrev = k.blade;
    k.blade = mat4Transform(paddleW, [s * 0.98, 0, 0]);
    if (dtReal > 1e-4) k.bladeVel = v3.scale(v3.sub(k.blade, k.bladePrev), 1 / dtReal);
  }
  // ---------- HUD ----------
  const hudEl = $('hud'), glEl = $('gl'), mkEl = $('mk'), dbgEl = $('dbg'), stamFill = $('stamfill'), stamTxt = $('stamtxt');
  const pcountEl = $('pcount'), ccountEl = $('ccount'), scountEl = $('scount'), mEatEl = $('mEat');
  const lootEls = { paddle: pcountEl, coin: ccountEl, snack: scountEl };
  function popLoot(kind) {
    const el = lootEls[kind];
    if (!el || el.classList.contains('pop')) return;
    el.classList.add('pop');
    const done = () => { el.classList.remove('pop'); el.removeEventListener('animationend', done); clearTimeout(fallback); };
    const fallback = setTimeout(done, 700);
    el.addEventListener('animationend', done, { once: true });
  }
  function hud() {
    if (!river || !profile) return;
    const c = character(profile);
    const dist = Math.max(0, kayak.p[2] - 15), total = river.finishZ - 15;
    if (river.pickups) {
      const xpTotal = river.pickupKinds.filter(k => COLLECTIBLES[k].type === 'xp').reduce((s, k) => s + river.pickups[k].length, 0);
      const currencyTotal = river.pickupKinds.filter(k => COLLECTIBLES[k].type === 'currency').reduce((s, k) => s + river.pickups[k].length, 0);
      pcountEl.innerHTML = `🛶 <b>${runLoot.paddles}</b>/${xpTotal}`;
      ccountEl.innerHTML = `🪙 <b>${runLoot.coins}</b>/${currencyTotal}`;
      const snacks = itemCount(profile, 'snack');
      scountEl.innerHTML = `🥜 <b>${snacks}</b>${isMobile ? '' : ' <kbd style="font-size:11px">E</kbd>'}`;
      scountEl.style.opacity = snacks ? 1 : 0.45;
      mEatEl.textContent = `🥜 ${snacks}`;
      mEatEl.style.opacity = snacks ? 1 : 0.45;

    }
    const mapMsg = simTime < mapFoundUntil ? '<br><b style="color:#ffe08a">🗺 Hidden map found!</b>' : '';
    const snackMsg = simTime < snackMsgUntil ? `<br><b style="color:#9f7">🥜 Snack! +${ITEMS.snack.stamina} stamina</b>` : '';
    const injuryMsg = profile.injury > 0 ? ` · <span style="color:#ff9a80">injury ${profile.injury}/${profile.health}</span>` : '';
    hudEl.innerHTML = `<b>${river.R.name}</b> · ${river.R.cls} · <b>${c.name}</b> lv ${profile.level} · ${runCraft.name}${injuryMsg}<br>speed <b>${kayak.speed.toFixed(1)}</b> m/s · distance <b>${dist.toFixed(0)}</b> / ${total.toFixed(0)} m · time <b>${runTime.toFixed(1)}</b> s${mapMsg}${snackMsg}`;
    
    stamFill.style.width = (100 * kayak.stamina / STAMINA.max) + '%';
    stamFill.className = kayak.tired ? 'tired' : '';
    stamTxt.textContent = kayak.tired ? 'TIRED — weak strokes' : 'stamina';
    const tilt = clamp(-kayak.roll / KAYAK.capsize, -1, 1);
    mkEl.style.left = (50 + tilt * 50) + '%';
    mkEl.style.background = Math.abs(tilt) > 0.7 ? '#ff5040' : Math.abs(tilt) > 0.35 ? '#ffb040' : '#ffe08a';
    const tiltCtl = isMobile && gyro.live();
    glEl.innerHTML = Math.abs(tilt) > 0.35
      ? `<span style="color:#ff8060;font-weight:700">LEAN ${tilt > 0 ? 'RIGHT' : 'LEFT'}${tiltCtl ? '' : tilt > 0 ? ' (D)' : ' (A)'}</span>`
      : tiltCtl ? 'torso balance — tilt the phone' : isMobile ? 'torso balance — no tilt data, lean with A / D' : 'torso balance — lean with A / D';
    if (dbgMode) {
      const w = waterAt(kayak.p[0], kayak.p[2]), K = KAYAK, tr = traits();
      const instab = tr.instabK - K.formStab;
      const lam = (-K.rollDamp + Math.sqrt(K.rollDamp ** 2 + 4 * K.inertia[2] * instab)) / (2 * K.inertia[2]);
      dbgEl.textContent = `fps ${fps.toFixed(0)}  debug view ${['off', 'speed', 'foam', 'turbulence k', 'Froude'][dbgMode]}\n` +
        `cells ${W}x${L}  dx ${dx}  dt ${SIM.dt.toFixed(4)} x${SIM.substeps}  turbA ${SIM.turbA}\n` +
        `Q ${river.Q.toFixed(1)} m³/s  inVelScale ${river.inVelScale.toFixed(3)}\n` +
        `water here: h ${w.h.toFixed(2)} m  |u| ${Math.hypot(w.u, w.v).toFixed(2)} m/s\n` +
        `boat: roll ${(-kayak.roll * 57.3).toFixed(0)}°  pitch ${(kayak.pitch * 57.3).toFixed(0)}°  v ${kayak.speed.toFixed(2)} m/s\n` +
        `traits: skill ${tr.skill}  stamina ${tr.stamina}  drain ${tr.drain.toFixed(1)}/s  pool ${kayak.stamina.toFixed(0)}\n` +
        `roll: instabK ${tr.instabK.toFixed(0)} N·m/rad  λ ${lam.toFixed(2)} /s  max recover ${(Math.asin(Math.min(1, tr.leanTorque / tr.instabK)) * 57.3).toFixed(0)}°`;
    }
  }
  // ---------- frame ----------
  let lastT = performance.now();
  let physAccum = 0;   // real seconds of physics owed, carried frame to frame (see frameTicks above)
  function frame(now) {
    requestAnimationFrame(frame);
    const dtRaw = (now - lastT) / 1000; lastT = now;
    // the fps readout is deliberately based on the raw, unclamped delta — clamping it here (as the
    // physics step below must, to keep one huge step from blowing up the sim) would silently floor
    // a real stall at whatever the clamp is and hide exactly the slowdown this counter is for.
    if (dtRaw > 0) fps += (1 / dtRaw - fps) * 0.1;
    if (!river || gameState === 'menu' || warmingUp) return;
    const running = gameState === 'run';
    const dtReal = Math.min(0.05, Math.max(0, dtRaw));
    // advance sim/kayak time by however much real time actually elapsed, not by a fixed tick count
    // per rendered frame — the old code always ran exactly 2 ticks/frame regardless of how long the
    // frame took, so simTime (and every bit of gameplay riding on it: paddling, current, obstacles)
    // advanced 2×SIM.dt of sim-time per *frame* rather than per *second* — correct only at the 60fps
    // it was tuned for, and visibly half-speed at 30fps, double-speed at 120fps.
    physAccum = Math.min(physAccum + dtReal, SIM.dt * MAX_PHYS_TICKS);
    frameTicks = Math.min(Math.floor(physAccum / SIM.dt), MAX_PHYS_TICKS);
    for (let s = 0; s < frameTicks; s++) {
      simTime += SIM.dt;
      if (running) { runTime += SIM.dt; kayak.step(SIM.dt); }
    }
    physAccum -= frameTicks * SIM.dt;
    const t = simTime;
    const inQ = 1 + 0.06 * Math.sin(0.21 * t) + 0.04 * Math.sin(0.53 * t + 1) + 0.025 * Math.sin(1.3 * t + 2);

    const cj0 = clamp(Math.floor((kayak.p[2] - RENDER.computeBehind) / dx), 0, L - 1);
    const cj1 = clamp(Math.ceil((kayak.p[2] + RENDER.computeAhead) / dx), cj0 + 1, L);
    const computeRows = cj1 - cj0;
    writeSimUniforms(t, inQ, cj0);
    cam.update(dtReal); writeCam(); updateKayakInstances(dtReal);
    if (running) { 
       spawnRucksacks(dtReal); 
       updateRucksackDrift(dtReal);
       updatePickups();
       updateObstacles(dtReal); 
    }
    writeObstacleInstances();   // also while 'over', so the wreck scene isn't missing its logs
    
    updateSparks(dtReal);
    // particle emitters
    const wB = waterAt(kayak.p[0], kayak.p[2]);
    const fwdH = v3.norm((() => { const f = qRotate(kayak.q, [0, 0, 1]); return [f[0], 0.001, f[2]]; })());
    const relSpd = Math.hypot(kayak.v[0] - wB.u, kayak.v[2] - wB.v);
    const bowP = v3.add(kayak.p, v3.scale(fwdH, 1.45));
    const wBow = waterAt(bowP[0], bowP[2]);
    const bowProb = clamp((relSpd - 1.4) * 0.02, 0, 0.07) * (wBow.h > 0.1 ? 1 : 0) + kayak.hitFlash * 0.12;
    const bl = kayak.blade, wBl = waterAt(bl[0], bl[2]);
    const padProb = (kayak.paddling && bl[1] < wBl.eta + 0.05 && wBl.h > 0.1) ? 0.05 * kayak.env * (kayak.tired ? 0.5 : 1) : 0;
    const pu = new Float32Array(28);
    pu.set([W, L, dx, dtReal], 0);
    pu.set([t, SIM.hmin, PARTS.kayakShare, PARTS.ambient], 4);
    pu.set([kayak.p[0], kayak.p[1], kayak.p[2], PARTS.ambient], 8);
    pu.set([bowP[0], wBow.eta + 0.05, bowP[2], bowProb], 12);
    pu.set([kayak.v[0] * 0.35, 0.2, kayak.v[2] * 0.35, 0], 16);
    pu.set([bl[0], Math.min(bl[1], wBl.eta), bl[2], padProb], 20);
    pu.set([kayak.bladeVel[0] * 0.25, 0.25, kayak.bladeVel[2] * 0.25, 0], 24);
    device.queue.writeBuffer(partUBuf, 0, pu);
    const enc = device.createCommandEncoder();
    for (let s = 0; s < SIM.substeps; s++) encodeSubstep(enc, computeRows);
    {
      const pass = enc.beginComputePass();
      pass.setPipeline(partPipe); pass.setBindGroup(0, partBG);
      pass.dispatchWorkgroups(Math.ceil(PARTS.count / 64));
      pass.end();
    }
    let stg = staging.find(s => !s.busy), j0 = 0;
    if (stg) {
      j0 = clamp(Math.floor(kayak.p[2] / dx) - BAND_ROWS / 2, 0, L - BAND_ROWS);
      enc.copyBufferToBuffer(stateBufs[0], j0 * W * 16, stg.buf, 0, BAND_BYTES);
      stg.busy = true;
    }

    const terrainSlices = lodSlices(true), waterSlices = lodSlices(false);

    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: ctx.getCurrentTexture().createView(), clearValue: { r: currentSky().fogColor[0], g: currentSky().fogColor[1], b: currentSky().fogColor[2], a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    pass.setBindGroup(0, renBG);
    pass.setPipeline(skyPipe); pass.draw(3);
    pass.setPipeline(terrainPipe);
    for (const sl of terrainSlices) { 
      pass.setIndexBuffer(sl.buf, 'uint32');
      pass.drawIndexed(sl.count, 1, sl.first); }
 

   
    pass.setPipeline(meshPipe);
    for (const name of Object.keys(vegMeshes)) {
      const ib = instBufs[name]; if (!ib || !ib.count) continue;
      pass.setVertexBuffer(0, vegMeshes[name].vbuf);
      pass.setVertexBuffer(1, ib.buf);
      pass.draw(vegMeshes[name].count, ib.count);
    }


    for (const name of ['hull', 'cockpit', 'torso', 'head', 'paddle']) {
       pass.setVertexBuffer(0, kayakMeshes[name].vbuf); 
       pass.setVertexBuffer(1, kayakInst[name]); 
       pass.draw(kayakMeshes[name].count, 1); }
    pass.setVertexBuffer(0, armBuf); pass.setVertexBuffer(1, kayakInst.arms); 
    pass.draw(armVertCount, 1);
    // floating obstacles — drawn last among the solids, with their own alpha-capable pipeline
    if (river.obstDraw && river.obstDraw.length) {
      pass.setPipeline(obstPipe);
      for (const d of river.obstDraw) {
        pass.setVertexBuffer(0, obstMeshes[d.name].vbuf); pass.setVertexBuffer(1, obstInstBufs[d.name]);
        pass.draw(obstMeshes[d.name].count, d.count);
      }
    }
    pass.setPipeline(waterPipe);
    for (const sl of waterSlices) { 
      pass.setIndexBuffer(sl.buf, 'uint32'); 
      pass.drawIndexed(sl.count, 1, sl.first); }

    if (river.pickups) {
      pass.setPipeline(pickupPipe);
      for (const kind of [...river.pickupKinds, 'map']) {
        const list = river.pickups[kind], mesh = pickupMeshes[kind], ib = pickupInstBufs[kind];
        if (!list || !list.length || !ib) continue;
        pass.setVertexBuffer(0, mesh.vbuf); pass.setVertexBuffer(1, ib); pass.draw(mesh.count, list.length);
      }
      if (sparks.length) { pass.setVertexBuffer(0, sparkMesh.vbuf); pass.setVertexBuffer(1, sparkBuf); pass.draw(sparkMesh.count, sparks.length); }
    }
    pass.setPipeline(sprayPipe); pass.draw(6, PARTS.count);
    pass.end();
    device.queue.submit([enc.finish()]);
    if (stg) {
      const S = stg, jj = j0;
      S.buf.mapAsync(GPUMapMode.READ).then(() => {
        band.data.set(new Float32Array(S.buf.getMappedRange())); band.j0 = jj; band.ready = true;
        S.buf.unmap(); S.busy = false;
      }).catch(() => { S.busy = false; });
    }
    hud();
  }
  showMenu();
  requestAnimationFrame(frame);
})().catch(e => showErr('Error: ' + (e.stack || e)));