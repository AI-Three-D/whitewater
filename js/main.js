'use strict';
import { INPUT, GRID, SIM, RENDER, PARTS, VEG, QUALITY, QUALITY_LEVELS, KAYAK, RIVERS, TIERS, PICKUPS, CHARACTERS, STAMINA, SKILL, BIOMES, BIOME_IDS } from './config.js';
import { WGSL_SIM, WGSL_PART_SIM, WGSL_SKY, WGSL_TERRAIN, WGSL_WATER, WGSL_MESH, WGSL_PART_DRAW } from './shaders.js';
import { v3, qMul, qConj, qNorm, qRotate, qAxisAngle, qFromRotVec,
         mat4Perspective, mat4LookAt, mat4Mul, mat4Invert, mat4Compose, mat4TRS, mat4Transform,
         mulberry32, clamp } from './math.js';
import { generateRiver, nearestChan } from './river.js';
import { MeshBuilder, addCylinder, buildKayakParts, buildVegetationMeshes, buildCoinMesh, buildSparkMesh } from './meshes.js';
import { loadProfile, newProfile, clearProfile, character, canRaise, anyRaisable,
         awardRun, spendPoint, discardPending, pointsForLevel } from './progression.js';

const showErr = t => { const el = document.getElementById('err'); el.style.display = 'flex'; el.textContent = t; };
addEventListener('error', e => showErr('Script error: ' + e.message + ' (line ' + e.lineno + ')'));
addEventListener('unhandledrejection', e => showErr('Promise error: ' + ((e.reason && e.reason.stack) || e.reason)));
const $ = id => document.getElementById(id);
// bumped by hand on every edit — lets a stale/cached page or a not-yet-reloaded tab be spotted
// on sight instead of chasing "am I even testing the current code" through several rounds
const BUILD = 'build 23';
{ const v = document.getElementById('ver'); if (v) v.textContent = BUILD; }
// mobile = a touch-first device: coarse primary pointer plus an actual touch digitizer.
// (navigator.userAgentData.mobile exists only in Chromium and calls tablets "not mobile";
// for controls what matters is touch + gyro, so the pointer media query is the right signal.)
const MOBILE = INPUT.forceMobile ||
  (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches);
// ---------- detail level ----------

const QKEY = 'whitewater.quality';
const loadQuality = () => { const q = localStorage.getItem(QKEY); return QUALITY_LEVELS.includes(q) ? q : null; };
const saveQuality = q => localStorage.setItem(QKEY, q);
let quality = loadQuality() || (MOBILE ? 'medium' : 'high');
function applyQuality(q) {
  const Q = QUALITY[q];
  Object.assign(GRID, Q.grid);
  PARTS.count = Q.particles; PARTS.kayakShare = Q.kayakShare;
  VEG.caps = Q.veg.caps; VEG.attempts = Q.veg.attempts;
  SIM.warmupSteps = Q.warmupSteps; SIM.macCormack = Q.macCormack; SIM.turbA = Q.turbA; SIM.substeps = Q.substeps;
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
  const simUBuf = mkBuf(96, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const camUBuf = mkBuf(272, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const partUBuf = mkBuf(112, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const partBuf = mkBuf(PARTS.count * 32, STOR);
  const BAND_ROWS = 32, BAND_BYTES = BAND_ROWS * W * 16;
  const staging = [0, 1].map(() => ({ buf: mkBuf(BAND_BYTES, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST), busy: false }));
  const band = { ready: false, j0: 0, data: new Float32Array(BAND_ROWS * W * 4) };
  const idx = new Uint32Array((W - 1) * (L - 1) * 6);
  function fillTerrainIndex(b) {
    let qi = 0;
    for (let j = 0; j < L - 1; j++) for (let i = 0; i < W - 1; i++) {
      const a = j * W + i, bi = a + 1, c = a + W, d = c + 1;
      if (Math.abs(b[a] - b[d]) <= Math.abs(b[bi] - b[c])) {
        idx[qi++] = a; idx[qi++] = c; idx[qi++] = bi; idx[qi++] = bi; idx[qi++] = c; idx[qi++] = d;
      } else {
        idx[qi++] = a; idx[qi++] = c; idx[qi++] = d; idx[qi++] = a; idx[qi++] = d; idx[qi++] = bi;
      }
    }
  }
  const idxBuf = mkBuf(idx.byteLength, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST);
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
  // ---------- GPU meshes ----------
  const gpuMesh = mb => { const d = mb.data(); const vbuf = mkBuf(d.byteLength, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST); device.queue.writeBuffer(vbuf, 0, d); return { vbuf, count: mb.count }; };
  const vegMeshes = {}; for (const [k, mb] of Object.entries(buildVegetationMeshes())) vegMeshes[k] = gpuMesh(mb);
  const kayakMeshes = {}; for (const [k, mb] of Object.entries(buildKayakParts())) kayakMeshes[k] = gpuMesh(mb);
  const pickupMeshes = { paddle: kayakMeshes.paddle, coin: gpuMesh(buildCoinMesh()) };
  const pickupInstBufs = { paddle: null, coin: null };
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
  let runLoot = { paddles: 0, coins: 0 };
  let profile = loadProfile();           // null → character selection
  const input = { fwd: false, back: false, left: false, right: false, leanL: false, leanR: false, leanAnalog: 0 };
  const keymap = { ArrowUp: 'fwd', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right', KeyA: 'leanL', KeyD: 'leanR', KeyW: 'fwd', KeyS: 'back' };
  addEventListener('keydown', e => {
    if (keymap[e.code] !== undefined) { input[keymap[e.code]] = true; e.preventDefault(); }
    if (e.code === 'KeyC') camMode = (camMode + 1) % 3;
    if (e.code === 'F1') { dbgMode = (dbgMode + 1) % 5; $('dbg').style.display = dbgMode ? 'block' : 'none'; e.preventDefault(); }
    if (e.code === 'KeyR' && river && gameState !== 'menu' && $('lvl').style.display !== 'flex') startRun(river.R);
    if (e.code === 'KeyF' && gameState === 'run') endRun(true);
    if (e.code === 'Escape') { if ($('charsheet').style.display === 'flex') hideCharSheet(); else if ($('store').style.display === 'flex') hideStore(); else if ($('lvl').style.display !== 'flex') showMenu(); }
  });
  addEventListener('keyup', e => { if (keymap[e.code] !== undefined) input[keymap[e.code]] = false; });
// ---------- touch controls (mobile) ----------
const padL = $('padL'), padR = $('padR');
const pad = { L: false, R: false };
// one button held = a stroke on that side (same flags as ↑ + ←/→: forward force plus a
// sweep); alternating taps or holding both = plain forward paddling. The kayak's existing
// stroke machinery handles all of it, so there are no new animation states to pop.
const syncPad = () => { input.left = pad.L; input.right = pad.R; input.fwd = pad.L || pad.R; };
function bindPad(el, key) {
  const down = e => { e.preventDefault(); if (el.setPointerCapture) el.setPointerCapture(e.pointerId); pad[key] = true; el.classList.add('held'); syncPad(); };
  const up = e => { e.preventDefault(); pad[key] = false; el.classList.remove('held'); syncPad(); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('contextmenu', e => e.preventDefault());
}
function showPads(on) { const d = on && MOBILE ? 'flex' : 'none'; padL.style.display = d; padR.style.display = d; }
if (MOBILE) { bindPad(padL, 'L'); bindPad(padR, 'R'); }

// gyro lean: device roll maps to the same lean target A/D produce (tilt left → lean left).
// iOS only exposes the sensor after requestPermission() from inside a user gesture, so the
// listener is armed on the first tap; browsers without the permission gate start immediately.
if (MOBILE) {
  const onOrient = e => {
    if (e.beta == null || e.gamma == null) return;
    const a = (screen.orientation && screen.orientation.angle) || 0;
    // pick the axis that is "roll" for the current screen rotation; positive = tilted right
    const tilt = a === 90 ? e.beta : a === 270 ? -e.beta : a === 180 ? -e.gamma : e.gamma;
    input.leanAnalog = clamp(-tilt / INPUT.gyroMaxDeg, -1, 1);
  };
  const start = () => addEventListener('deviceorientation', onOrient);
  addEventListener('pointerdown', () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission)
      DeviceOrientationEvent.requestPermission().then(s => { if (s === 'granted') start(); }).catch(() => {});
    else start();
  }, { once: true });
}

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
  // stand-in for art that isn't in yet — swap the label for a real <img> or background-image later
  const artSlot = (cls, label) => `<div class="art-slot ${cls}">${label}</div>`;

  // ---------- menu ----------
  function showMenu() {
    gameState = 'menu';
    $('menu').style.display = 'flex'; $('msg').style.display = 'none'; $('stam').style.display = 'none'; $('loot').style.display = 'none';
    showPads(false);
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
      cs.style.display = 'flex'; tb.style.display = 'none'; rl.style.display = 'none';
      cs.innerHTML = `<p style="width:100%;margin:0 0 6px">Choose your paddler</p>`;
      for (const [id, c] of Object.entries(CHARACTERS)) {
        const d = document.createElement('div'); d.className = 'chr';
        d.innerHTML = `${artSlot('chr-portrait', c.name + ' art')}
          <h3>${c.name}</h3><small>${c.title}</small><p>${c.desc}</p>
          <small>skill ${c.start.skill}/${c.caps.skill}</small>${pips(c.start.skill, c.caps.skill)}
          <small>stamina ${c.start.stamina}/${c.caps.stamina}</small>${pips(c.start.stamina, c.caps.stamina)}`;
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
    rl.innerHTML = '';
    for (const tier of TIERS) {
      const h = document.createElement('div'); h.className = 'tier'; h.textContent = `${tier.label} · ${tier.points} pt`; rl.appendChild(h);
      const row = document.createElement('div'); row.className = 'rivers';
      for (const R of RIVERS.filter(r => r.tier === tier.id)) {
        const d = document.createElement('div'); d.className = 'riv';
        const extra = (R.forks && R.forks.length ? ` · ${R.forks.length} fork${R.forks.length > 1 ? 's' : ''}` : '')
                    + (R.waterfalls && R.waterfalls.length ? ' · waterfall' : '');
        const best = profile.best[R.name];
        d.innerHTML = `${artSlot('riv-thumb', R.name + ' art')}
          <h3>${R.name}</h3><small>gradient ${(R.slope * 100).toFixed(1)} % · ${R.rocks} boulders · ${R.ledges.length} ledges${extra}</small>
          ${best ? `<br><span class="best">best ${best.toFixed(1)} s</span>` : ''}`;
        d.onclick = () => startRun(R);
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
      </div>`;
    $('lvSkill').onclick = () => { spendPoint(profile, 'skill'); showLevelUp(); };
    $('lvStam').onclick = () => { spendPoint(profile, 'stamina'); showLevelUp(); };
  }
  function showStore() {
    if (!profile) return;
    const el = $('store');
    el.style.display = 'flex';
    el.innerHTML = `<h2>Store</h2>
      ${artSlot('store-banner', 'store banner art')}
      <div><b style="color:#ffd35c">${profile.coins || 0}</b> coin${profile.coins === 1 ? '' : 's'} collected on the water</div>
      <div class="opts">
        <div class="opt">${artSlot('opt-icon', 'paddle art')}<h3>Paddles</h3><p>Higher-grade blades for faster, more efficient strokes.</p><button disabled>Coming soon</button></div>
        <div class="opt">${artSlot('opt-icon', 'kayak art')}<h3>Kayaks</h3><p>New hulls with their own handling and looks.</p><button disabled>Coming soon</button></div>
        <div class="opt">${artSlot('opt-icon', 'gear art')}<h3>River access</h3><p>Further upgrades are on their way.</p><button disabled>Coming soon</button></div>
      </div>
      <button id="storeClose" style="margin-top:16px">Close</button>`;
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
          <div style="margin-top:8px">${profile.runs} run${profile.runs === 1 ? '' : 's'} · <b style="color:#ffd35c">${profile.coins || 0}</b> coin${profile.coins === 1 ? '' : 's'}</div>
        </div>
      </div>
      <div class="charsheet-actions">
        <button id="charNewBtn">New character</button>
        <button id="charCloseBtn">Close</button>
      </div>`;
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
      this.strokeT = 0; this.side = 1; this.paddling = false; this.env = 0; this.hitFlash = 0;
      this.stamina = STAMINA.max; this.tired = false;
      // smoothed copies used only for the mesh pose (see updateKayakInstances)
      this.visSide = 1; this.visAmp = 0.6; this.visDirn = 1; this.visEnv = 0; this.visBack = 1;
      this.blade = this.p.slice(); this.bladePrev = this.p.slice(); this.bladeVel = [0, 0, 0];
    },
    step(dt) {
      const K = KAYAK, m = K.mass, q = this.q, p = this.p, tr = traits();
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
      // ---- stamina ----
      const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const active = input.fwd || input.back || turn !== 0;
      this.stamina += dt * STAMINA.max / STAMINA.regenTime;       // regenerates 0→full in regenTime
      if (active) this.stamina -= dt * tr.drain;
      this.stamina = clamp(this.stamina, 0, STAMINA.max);
      this.tired = this.stamina < STAMINA.max * STAMINA.tiredFrac;
      const power = this.tired ? STAMINA.tiredPower : 1;
      const period = K.strokePeriod * (this.tired ? STAMINA.tiredStroke : 1);
      // ---- paddle ----
      let paddleYaw = 0;
      if (active) {
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
      } else { this.paddling = false; this.env *= Math.exp(-dt * 8); this.strokeT = 0; }
      const leanTarget = clamp((input.leanL ? 1 : 0) - (input.leanR ? 1 : 0) + input.leanAnalog, -1, 1);
      this.lean += (leanTarget - this.lean) * Math.min(1, dt * K.leanRate);
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
    const ab = new ArrayBuffer(96), f = new Float32Array(ab), u = new Uint32Array(ab);
    u[0] = W; u[1] = L; f[2] = dx; f[3] = SIM.dt; f[4] = SIM.g; f[5] = river.R.manning; f[6] = SIM.hmin; f[7] = SIM.umax;
    f[8] = time; f[9] = river.inEta; f[10] = inQ; f[11] = river.inVelScale;
    f[12] = SIM.turbA; f[13] = SIM.turbL; f[14] = SIM.turbT; f[15] = SIM.foamDecay;
    f[16] = SIM.kDecay; f[17] = SIM.macCormack; f[18] = SIM.kGen; f[19] = SIM.foamGen;
    f[20] = jOffset;
    device.queue.writeBuffer(simUBuf, 0, ab);
  }

  function encodeSubstep(enc, rows = L) {
    const pass = enc.beginComputePass();
    for (let k = 0; k < 3; k++) { pass.setPipeline(simPipes[k]); pass.setBindGroup(0, simBGs[k]); pass.dispatchWorkgroups(W / 8, Math.ceil(rows / 8)); }
    pass.end();
  }
  function placeVegetation() {
    const rng = mulberry32(river.seed + 99), lists = { tree: [], bush: [], rock: [], grass: [] };
    const biome = BIOMES[river.R.biome || 'alpine'];
    const caps = Object.fromEntries(Object.entries(VEG.caps).map(([k, v]) => [k, Math.round(v * biome.vegDensity[k])]));
    const push = (name, x, z, sc, tint) => {
      if (lists[name].length >= caps[name]) return;
      const y = terrainH(x, z) - 0.05;
      const bt = biome.vegTint[name];
      lists[name].push({ m: mat4TRS([x, y, z], rng() * 6.2832, [sc, sc * (0.85 + 0.3 * rng()), sc]), tint: [tint[0] * bt[0], tint[1] * bt[1], tint[2] * bt[2], 1] });
    };
    for (let n = 0; n < VEG.attempts; n++) {
      const x = rng() * W * dx, z = rng() * L * dx, j = clamp(Math.floor(z / dx), 0, L - 1), row = nearestChan(river.rows[j], x);
      const ad = Math.abs((x - row.c) / row.hw);
      if (ad < 1.25) continue;
      const y = terrainH(x, z); if (y < row.eta + 0.35) continue;
      const nrm = terrainN(x, z), m = (ad - 1) * row.hw, r = rng(), g = 0.8 + 0.4 * rng();
      if (nrm[1] < 0.72) { if (r < 0.25) push('rock', x, z, 0.5 + rng() * 1.2, [g, g, g]); continue; }
      if (m < 3) { if (r < 0.55) push('grass', x, z, 0.6 + rng() * 0.8, [g, 1, 0.9 * g]); else if (r < 0.8) push('bush', x, z, 0.6 + rng() * 0.8, [g, g * 1.05, g * 0.9]); else push('rock', x, z, 0.4 + rng() * 1.0, [g, g, g]); }
      else { if (r < 0.36) push('tree', x, z, 0.8 + rng() * 0.9, [g * 0.9, g, g * 0.9]); else if (r < 0.55) push('bush', x, z, 0.7 + rng() * 0.9, [g, g * 1.05, g * 0.9]); else if (r < 0.64) push('rock', x, z, 0.5 + rng() * 1.3, [g, g, g]); else push('grass', x, z, 0.7 + rng() * 0.9, [g, 1, 0.9 * g]); }
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
    river.pickups = { paddle: mkList(201), coin: mkList(301) };
    for (const kind of ['paddle', 'coin']) {
      if (pickupInstBufs[kind]) pickupInstBufs[kind].destroy();
      pickupInstBufs[kind] = mkBuf(Math.max(80, river.pickups[kind].length * 80), GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
    }
  }
  // recompute pickup transforms/fade each frame and resolve collection against the paddler
  function updatePickups() {
    if (!river.pickups) return;
    for (const kind of ['paddle', 'coin']) {
      const list = river.pickups[kind], buf = pickupInstBufs[kind];
      if (!list.length || !buf) continue;
      const data = new Float32Array(list.length * 20);
      list.forEach((it, n) => {
        let alpha = 0;
        if (it.alive) {
          const bobPhase = simTime * PICKUPS.bobSpeed + it.bobPh;
          const bob = it.floating ? PICKUPS.bobAmp * Math.sin(bobPhase) : 0;

          const jrow = clamp(Math.floor(it.z / dx), 0, L - 1);
          const y = nearestChan(river.rows[jrow], it.x).eta + PICKUPS.hover + bob;
          const dist = Math.hypot(kayak.p[0] - it.x, kayak.p[2] - it.z);
          if (it.seenT < 0 && dist < PICKUPS.proximityRadius) it.seenT = simTime;
          if (it.seenT >= 0) {
            const fadeT = simTime - it.seenT;
            alpha = clamp(1 - fadeT / PICKUPS.fadeTime, 0, 1);
            if (fadeT >= PICKUPS.fadeTime) it.alive = false;
          } else alpha = 1;
          const reachable = !it.floating || Math.sin(bobPhase) <= PICKUPS.reachBob;
          if (it.alive && dist < PICKUPS.collectRadius && reachable) {
            it.alive = false; it.collected = true; alpha = 0;
            runLoot[kind === 'paddle' ? 'paddles' : 'coins']++;
            spawnBurst(it.x, y, it.z, kind === 'paddle' ? [0.95, 0.82, 0.1] : [1.0, 0.86, 0.3]);
            popLoot(kind);
          }
          const spin = simTime * PICKUPS.spinSpeed + it.spinPh;
          const sc = kind === 'paddle' ? PICKUPS.paddleScale : 1;
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
    warmingUp = true;
    $('menu').style.display = 'none'; 
    $('lvl').style.display = 'none'; 
    $('stam').style.display = 'block'; 
    $('loot').style.display = 'flex';
    $('msg').style.display = 'flex'; 
    $('msg').innerHTML = 'Loading river…';
    showPads(true);
    if (!river || river.R !== R) {          // regenerate only when the river changes (R restarts are instant)
      river = generateRiver(R);
      fillTerrainIndex(river.b);
      device.queue.writeBuffer(idxBuf, 0, idx);
      device.queue.writeBuffer(terrainBuf, 0, river.b); device.queue.writeBuffer(maskBuf, 0, river.mask);
      placeVegetation();
      placePickups();
    }
    for (const kind of ['paddle', 'coin']) for (const it of river.pickups[kind]) { it.alive = true; it.collected = false; it.seenT = -1; }
    runLoot = { paddles: 0, coins: 0 };
    device.queue.writeBuffer(stateBufs[0], 0, river.state); device.queue.writeBuffer(kBufs[0], 0, river.kArr);
    device.queue.writeBuffer(partBuf, 0, new Float32Array(PARTS.count * 8));
    writeSimUniforms(0, 1);
    await runWarmup();
    band.ready = false;
    kayak.reset(); cam.reset();
    simTime = 0; runTime = 0;
    $('msg').style.display = 'none';
    warmingUp = false; gameState = 'run';
  }
  function endRun(won) {
    if (gameState !== 'run') return;
    gameState = 'over';
    showPads(false);
    const msg = $('msg');
    msg.style.display = 'flex';
    const hint = MOBILE ? '' : `<small>R — run again · Esc — river menu</small>`;
    if (won) {
      const { pts, basePts, paddleXp, coins, ups } = awardRun(profile, river.R, runTime, runLoot);
      const best = profile.best[river.R.name] === runTime ? ' · new best!' : '';
      msg.innerHTML = `🏁 Take-out reached!<br>${river.R.name} in ${runTime.toFixed(1)} s${best}<br>
        <span style="color:#ffe08a">+${basePts} finish${paddleXp ? ` +${paddleXp} paddle` : ''} = +${pts} xp${coins ? ` · +${coins} coin${coins > 1 ? 's' : ''}` : ''}${ups ? ` — LEVEL UP${ups > 1 ? ' ×' + ups : ''}!` : ` · ${profile.points}/${pointsForLevel(profile.level)} to level ${profile.level + 1}`}</span>
        ${hint}`;
      if (ups) setTimeout(showLevelUp, 900);
    } else {
      const lost = runLoot.paddles || runLoot.coins;
      msg.innerHTML = `🌊 Capsized! You're swimming.<br>${(kayak.p[2] - 15).toFixed(0)} m of ${(river.finishZ - 15).toFixed(0)} m
        ${lost ? `<br><small style="color:#ff9a80">lost ${runLoot.paddles} paddle${runLoot.paddles === 1 ? '' : 's'} &amp; ${runLoot.coins} coin${runLoot.coins === 1 ? '' : 's'} — loot only banks on a finish</small>` : ''}
        ${hint}`;
    }
    if (MOBILE) {
      msg.insertAdjacentHTML('beforeend',
        `<div class="endbtns"><button id="btnRetry">↻ Retry</button><button id="btnMenu">Menu</button></div>`);
      $('btnRetry').onclick = () => startRun(river.R);
      $('btnMenu').onclick = () => { msg.style.display = 'none'; showMenu(); };
    }
  }

  // ---------- camera ----------
  const cam = {
    pos: [0, 5, 0], look: [0, 0, 10], dir: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0],
    reset() { this.dir = v3.norm(qRotate(kayak.q, [0, 0, 1])); const p = kayak.p; this.pos = [p[0], p[1] + 3.5, p[2] - 8]; this.look = [p[0], p[1], p[2] + 5]; },
    update(dt) {
      const p = kayak.p;
      let wantDir;
      if (camMode === 1) wantDir = [0, 0, 1];
      else { const f = qRotate(kayak.q, [0, 0, 1]); wantDir = v3.norm([f[0], 0, f[2]]); if (v3.dot(wantDir, [0, 0, 1]) < -0.2 && camMode === 0) wantDir = v3.norm(v3.add(wantDir, [0, 0, 1.3])); }
      const k = 1 - Math.exp(-dt * (camMode === 1 ? 6 : 1.8));
      this.dir = v3.norm(v3.add(this.dir, v3.scale(v3.sub(wantDir, this.dir), k)));
      const back = camMode === 2 ? 16 : 8.5, up = camMode === 2 ? 11 : 3.4;
      const want = v3.add(v3.sub(p, v3.scale(this.dir, back)), [0, up, 0]);
      want[1] = Math.max(want[1], terrainH(want[0], want[2]) + 1.5);
      const kp = 1 - Math.exp(-dt * 5);
      this.pos = v3.add(this.pos, v3.scale(v3.sub(want, this.pos), kp));
      const wantLook = v3.add(p, v3.add(v3.scale(this.dir, camMode === 2 ? 8 : 5), [0, 0.4, 0]));
      this.look = v3.add(this.look, v3.scale(v3.sub(wantLook, this.look), kp));
    },
  };
  const sunDir = v3.norm(RENDER.sunDir);
  function writeCam() {
    const proj = mat4Perspective(60 * Math.PI / 180, canvas.width / canvas.height, 0.3, 900);
    const view = mat4LookAt(cam.pos, cam.look, [0, 1, 0]);
    const vp = mat4Mul(proj, view), ivp = mat4Invert(vp);
    cam.right = [view[0], view[4], view[8]]; cam.up = [view[1], view[5], view[9]];
    const f = new Float32Array(68);
    f.set(vp, 0); f.set(ivp, 16);
    f.set([cam.pos[0], cam.pos[1], cam.pos[2], 1], 32); f.set([sunDir[0], sunDir[1], sunDir[2], 0], 36);
    f.set([simTime, W, L, dx], 40);
    f.set([RENDER.fogColor[0], RENDER.fogColor[1], RENDER.fogColor[2], RENDER.fogDensity], 44);
    f.set([dbgMode, SIM.hmin, QUALITY[quality].simpleShading ? 1 : 0, 0], 48);
    f.set([cam.right[0], cam.right[1], cam.right[2], 0], 52);
    f.set([cam.up[0], cam.up[1], cam.up[2], 0], 56);
    const wt = (river && river.R.waterTint) || [0.02, 0.10, 0.09];   // the original deep-water colour
    f.set([wt[0], wt[1], wt[2], (river && river.R.waterClarity) || 1], 60);
    f.set([BIOME_IDS[(river && river.R.biome) || 'alpine'] ?? 0, 0, 0, 0], 64);
    device.queue.writeBuffer(camUBuf, 0, f);
  }
  // ---------- kayak instances ----------
  function updateKayakInstances(dtReal) {
    const k = kayak, M = mat4Compose(k.p, k.q, [1, 1, 1]);
    const I = mat4Compose([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
    const inst = (name, local, tint = [1, 1, 1, 1]) => { const m = mat4Mul(M, local), d = new Float32Array(20); d.set(m, 0); d.set(tint, 16); device.queue.writeBuffer(kayakInst[name], 0, d); return m; };
    const flash = 1 + 0.6 * k.hitFlash;
    inst('hull', I, [flash, flash, flash, 1]); inst('cockpit', I);
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
    const s = k.visSide, t = k.strokeT, env = k.visEnv;
    const amp = k.visAmp, dirn = k.visDirn;
    const paddleQ = qMul(qAxisAngle([0, 0, 1], -s * 0.55 * env), qAxisAngle([0, 1, 0], -s * amp * Math.cos(Math.PI * t) * dirn * env));
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
  const pcountEl = $('pcount'), ccountEl = $('ccount');
  // brief "pop" flash on the paddle/coin counter to draw the eye when one is collected.
  // if a pop is already mid-flight, let it finish rather than restarting it — yanking the
  // class off and back on while it's mid-shrink makes the scale jump discontinuously.
  function popLoot(kind) {
    const el = kind === 'paddle' ? pcountEl : ccountEl;
    if (el.classList.contains('pop')) return;
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
      pcountEl.innerHTML = `🛶 <b>${runLoot.paddles}</b>/${river.pickups.paddle.length}`;
      ccountEl.innerHTML = `🪙 <b>${runLoot.coins}</b>/${river.pickups.coin.length}`;
    }
    hudEl.innerHTML = `<b>${river.R.name}</b> · ${river.R.cls} · <b>${c.name}</b> lv ${profile.level}<br>speed <b>${kayak.speed.toFixed(1)}</b> m/s · distance <b>${dist.toFixed(0)}</b> / ${total.toFixed(0)} m · time <b>${runTime.toFixed(1)}</b> s`;
    stamFill.style.width = (100 * kayak.stamina / STAMINA.max) + '%';
    stamFill.className = kayak.tired ? 'tired' : '';
    stamTxt.textContent = kayak.tired ? 'TIRED — weak strokes' : 'stamina';
    const tilt = clamp(-kayak.roll / KAYAK.capsize, -1, 1);
    mkEl.style.left = (50 + tilt * 50) + '%';
    mkEl.style.background = Math.abs(tilt) > 0.7 ? '#ff5040' : Math.abs(tilt) > 0.35 ? '#ffb040' : '#ffe08a';
    glEl.innerHTML = Math.abs(tilt) > 0.35
      ? `<span style="color:#ff8060;font-weight:700">LEAN ${tilt > 0 ? 'RIGHT' : 'LEFT'}${MOBILE ? ' — tilt device' : tilt > 0 ? ' (D)' : ' (A)'}</span>`
      : (MOBILE ? 'torso balance — tilt your device' : 'torso balance — lean with A / D');
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
  function frame(now) {
    requestAnimationFrame(frame);
    const dtReal = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    fps += (1 / Math.max(dtReal, 1e-3) - fps) * 0.05;
    if (!river || gameState === 'menu' || warmingUp) return;
    const running = gameState === 'run';
    const KAYAK_TICKS = 2;
    for (let s = 0; s < KAYAK_TICKS; s++) {
      simTime += SIM.dt;
      if (running) { runTime += SIM.dt; kayak.step(SIM.dt); }
    }
    const t = simTime;
    const inQ = 1 + 0.06 * Math.sin(0.21 * t) + 0.04 * Math.sin(0.53 * t + 1) + 0.025 * Math.sin(1.3 * t + 2);

    const cj0 = clamp(Math.floor((kayak.p[2] - RENDER.computeBehind) / dx), 0, L - 1);
    const cj1 = clamp(Math.ceil((kayak.p[2] + RENDER.computeAhead) / dx), cj0 + 1, L);
    const computeRows = cj1 - cj0;
    writeSimUniforms(t, inQ, cj0);
    cam.update(dtReal); writeCam(); updateKayakInstances(dtReal);
    if (running) updatePickups();
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
    // only rasterize the stretch of river actually near the paddler — the index buffer is laid
    // out one row of quads at a time, so a contiguous slice of it is exactly a Z-range of terrain
    const rowIdx = (W - 1) * 6;
    const rj0 = clamp(Math.floor((kayak.p[2] - RENDER.viewBehind) / dx), 0, L - 2);
    const rj1 = clamp(Math.ceil((kayak.p[2] + RENDER.viewAhead) / dx), rj0 + 1, L - 1);
    const viewFirst = rj0 * rowIdx, viewCount = (rj1 - rj0) * rowIdx;
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: ctx.getCurrentTexture().createView(), clearValue: { r: RENDER.fogColor[0], g: RENDER.fogColor[1], b: RENDER.fogColor[2], a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    pass.setBindGroup(0, renBG);
    pass.setPipeline(skyPipe); pass.draw(3);
    pass.setPipeline(terrainPipe); pass.setIndexBuffer(idxBuf, 'uint32'); pass.drawIndexed(viewCount, 1, viewFirst);
    pass.setPipeline(meshPipe);
    for (const name of ['tree', 'bush', 'rock', 'grass', 'pole']) {
      const ib = instBufs[name]; if (!ib || !ib.count) continue;
      pass.setVertexBuffer(0, vegMeshes[name].vbuf); pass.setVertexBuffer(1, ib.buf); pass.draw(vegMeshes[name].count, ib.count);
    }
    for (const name of ['hull', 'cockpit', 'torso', 'head', 'paddle']) { pass.setVertexBuffer(0, kayakMeshes[name].vbuf); pass.setVertexBuffer(1, kayakInst[name]); pass.draw(kayakMeshes[name].count, 1); }
    pass.setVertexBuffer(0, armBuf); pass.setVertexBuffer(1, kayakInst.arms); pass.draw(armVertCount, 1);
    pass.setPipeline(waterPipe); pass.setIndexBuffer(idxBuf, 'uint32'); pass.drawIndexed(viewCount, 1, viewFirst);
    if (river.pickups) {
      pass.setPipeline(pickupPipe);
      for (const kind of ['paddle', 'coin']) {
        const list = river.pickups[kind], mesh = pickupMeshes[kind], ib = pickupInstBufs[kind];
        if (!list.length || !ib) continue;
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