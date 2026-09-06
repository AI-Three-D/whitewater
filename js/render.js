// Camera, per-frame uniform uploads (camera, kayak pose, spray emitters) and the render pass.
import { GRID, SIM, RENDER, PARTS, KAYAK, BIOME_SKY, TIME_OF_DAY, BIOME_IDS } from './config.js';
import { v3, qMul, qRotate, qAxisAngle, mat4Perspective, mat4LookAt, mat4Mul, mat4Invert, mat4Compose, mat4Transform, clamp } from './math.js';
import { MeshBuilder, addCylinder } from './meshes.js';
import { Q } from './quality.js';
import { isMobile } from './platform.js';
import { G } from './state.js';
import { gpu, VTX_BYTES } from './gpu.js';
import { meshes, obstInstBufs } from './assets.js';
import { terrainH, waterAt } from './sampling.js';
import { kayak } from './kayak.js';
import { instBufs, instRange, bridges } from './scenery.js';
import { sparks, pickupInstBufs } from './pickups.js';

const { W, L, dx } = GRID;
const MAT_I = mat4Compose([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);

// ---------- camera ----------
export const cam = {
  pos: [0, 5, 0], look: [0, 0, 10], dir: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0],

  reset() {
    const p = kayak.p, cs = isMobile ? 0.5 : 1;
    this.dir = v3.norm(qRotate(kayak.q, [0, 0, 1]));
    this.pos = [p[0], p[1] + 3.5 * cs, p[2] - 8 * cs];
    this.look = [p[0], p[1], p[2] + 5];
  },

  wantedDir() {
    if (G.camMode === 1) return [0, 0, 1];
    const f = qRotate(kayak.q, [0, 0, 1]);
    let d = v3.norm([f[0], 0, f[2]]);
    // chase cam: don't swing fully around when the boat points back upstream
    if (G.camMode === 0 && v3.dot(d, [0, 0, 1]) < -0.2) d = v3.norm(v3.add(d, [0, 0, 1.3]));
    return d;
  },

  update(dt) {
    const p = kayak.p, mode = G.camMode, cs = isMobile ? 0.5 : 1;
    const k = 1 - Math.exp(-dt * (mode === 1 ? 6 : 1.8));
    this.dir = v3.norm(v3.add(this.dir, v3.scale(v3.sub(this.wantedDir(), this.dir), k)));
    const back = (mode === 2 ? 16 : 8.5) * cs, up = (mode === 2 ? 11 : 3.4) * cs;
    const want = v3.add(v3.sub(p, v3.scale(this.dir, back)), [0, up, 0]);
    want[1] = Math.max(want[1], terrainH(want[0], want[2]) + 1.5);
    // passing under a land bridge: keep the camera below the arch instead of inside the rock
    for (const br of G.river.bridges) {
      const d = br.at(want[0], want[2]);
      if (d && want[1] > d.bottom - 0.4 && want[1] < d.top + 1.0) want[1] = d.bottom - 0.4;
    }
    const kp = 1 - Math.exp(-dt * 5);
    this.pos = v3.add(this.pos, v3.scale(v3.sub(want, this.pos), kp));
    const wantLook = v3.add(p, v3.add(v3.scale(this.dir, mode === 2 ? 8 : 5), [0, 0.4, 0]));
    this.look = v3.add(this.look, v3.scale(v3.sub(wantLook, this.look), kp));
  },
};

export function currentSky() {
  const R = G.river && G.river.R;
  const biome = (R && BIOME_SKY[R.biome]) || { sunDir: RENDER.sunDir, fogColor: RENDER.fogColor, fogMul: 1 };
  const tod = TIME_OF_DAY[(R && R.timeOfDay) || 'day'] || TIME_OF_DAY.day;
  return {
    sunDir: tod.sunDir || biome.sunDir,
    fogColor: [biome.fogColor[0] * tod.fogTint[0], biome.fogColor[1] * tod.fogTint[1], biome.fogColor[2] * tod.fogTint[2]],
    fogMul: (biome.fogMul ?? 1) * tod.fogMul,
    skyHorizon: tod.skyHorizon, skyZenith: tod.skyZenith, exposure: tod.exposure,
  };
}

export function writeCam() {
  const { canvas } = gpu, R = G.river && G.river.R;
  const proj = mat4Perspective(60 * Math.PI / 180, canvas.width / canvas.height, 0.3, 900);
  const view = mat4LookAt(cam.pos, cam.look, [0, 1, 0]);
  const vp = mat4Mul(proj, view), ivp = mat4Invert(vp);
  cam.right = [view[0], view[4], view[8]];
  cam.up = [view[1], view[5], view[9]];
  const sky = currentSky(), sunDir = v3.norm(sky.sunDir);
  const wt = (R && R.waterTint) || [0.02, 0.10, 0.09];   // the original deep-water colour
  const f = new Float32Array(76);
  f.set(vp, 0);
  f.set(ivp, 16);
  f.set([cam.pos[0], cam.pos[1], cam.pos[2], 1], 32);
  f.set([sunDir[0], sunDir[1], sunDir[2], 0], 36);
  f.set([G.simTime, W, L, dx], 40);
  f.set([sky.fogColor[0], sky.fogColor[1], sky.fogColor[2], RENDER.fogDensity * (sky.fogMul ?? 1)], 44);
  f.set([G.dbgMode, SIM.hmin, Q.simpleShading ? 1 : 0, RENDER.lod.near], 48);
  f.set([cam.right[0], cam.right[1], cam.right[2], 0], 52);
  f.set([cam.up[0], cam.up[1], cam.up[2], 0], 56);
  f.set([wt[0], wt[1], wt[2], (R && R.waterClarity) || 1], 60);
  f.set([BIOME_IDS[(R && R.biome) || 'alpine'] ?? 0, sky.exposure ?? 1, 0, 0], 64);
  f.set([sky.skyHorizon[0], sky.skyHorizon[1], sky.skyHorizon[2], 0], 68);
  f.set([sky.skyZenith[0], sky.skyZenith[1], sky.skyZenith[2], 0], 72);
  gpu.write(gpu.camUBuf, 0, f);
}

// the three LOD index slices covering [zk - viewBehind, zk + viewAhead]
function lodSlices(overlap) {
  const zk = kayak.p[2], lod = RENDER.lod, lods = gpu.lods;
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

// ---------- kayak pose ----------
const KAYAK_PARTS = ['hull', 'cockpit', 'torso', 'head', 'paddle'];
const ARM_VERTS = 2 * 8 * 12;
const kayakInst = {};
let armBuf = null;

export function initRender() {
  for (const k of [...KAYAK_PARTS, 'arms']) kayakInst[k] = gpu.instBuf(1);
  armBuf = gpu.mkBuf(ARM_VERTS * VTX_BYTES, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
}

// ease the drawn pose toward the physics state so strokes read smoothly
function smoothPose(k, dtReal) {
  const vk = Math.min(1, dtReal * 9);
  k.visSide += (k.side - k.visSide) * vk;
  k.visAmp += ((k.mode === 'sweep' ? 1.0 : 0.6) - k.visAmp) * vk;
  k.visDirn += ((k.mode === 'back' ? -1 : 1) - k.visDirn) * vk;
  k.visEnv += ((k.paddling ? 1 : 0) - k.visEnv) * vk;
  k.visBack += ((k.mode === 'back' ? -0.5 : 1) - k.visBack) * vk;
  const yawTarget = -k.side * k.visAmp * Math.cos(Math.PI * k.strokeT) * k.visDirn;
  const maxSwing = KAYAK.paddleSwingRate * dtReal;
  k.visYaw += clamp(yawTarget - k.visYaw, -maxSwing, maxSwing);
}

export function updateKayakInstances(dtReal) {
  const k = kayak, M = mat4Compose(k.p, k.q, [1, 1, 1]);
  const inst = (name, local, tint = [1, 1, 1, 1]) => {
    const m = mat4Mul(M, local), d = new Float32Array(20);
    d.set(m, 0);
    d.set(tint, 16);
    gpu.write(kayakInst[name], 0, d);
    return m;
  };
  const flash = 1 + 0.6 * k.hitFlash, hc = G.runCraft.color;
  inst('hull', MAT_I, [hc[0] * flash, hc[1] * flash, hc[2] * flash, 1]);
  inst('cockpit', MAT_I);

  smoothPose(k, dtReal);
  const slump = k.tired ? 0.12 : 0;   // a tired paddler slumps forward a little
  const leanQ = qMul(qAxisAngle([0, 0, 1], -k.lean * 0.45), qAxisAngle([1, 0, 0], 0.18 * k.env * k.visBack + slump));
  const torsoL = mat4Mul(mat4Compose([0, 0.30, 0.05], leanQ, [1, 1, 1]), mat4Compose([0, 0.25, 0], [0, 0, 0, 1], [1, 1, 1]));
  inst('torso', torsoL);
  inst('head', mat4Mul(torsoL, mat4Compose([0, 0.37, 0.02], [0, 0, 0, 1], [1, 1, 1])));

  const s = k.visSide, env = k.visEnv;   // visSide: paddle roll and the blade emitter position glide across
  const paddleQ = qMul(qAxisAngle([0, 0, 1], -s * 0.55 * env), qAxisAngle([0, 1, 0], k.visYaw * env));
  const paddleL = mat4Mul(torsoL, mat4Compose([0, 0.12, 0.28], paddleQ, [1, 1, 1]));
  const paddleW = inst('paddle', paddleL);

  // arms are rebuilt each frame as two cylinders shoulder → hand
  const mb = new MeshBuilder();
  for (const sd of [-1, 1]) {
    const sh = mat4Transform(torsoL, [sd * 0.19, 0.2, 0.03]), hd = mat4Transform(paddleL, [sd * 0.33, 0, 0]);
    addCylinder(mb, sh, hd, 0.04, 0.03, 8, [0.12, 0.32, 0.82]);
  }
  gpu.write(armBuf, 0, mb.data());
  inst('arms', MAT_I);

  k.bladePrev = k.blade;
  k.blade = mat4Transform(paddleW, [s * 0.98, 0, 0]);
  if (dtReal > 1e-4) k.bladeVel = v3.scale(v3.sub(k.blade, k.bladePrev), 1 / dtReal);
}

// ---------- spray particles ----------
export function writeParticleUniforms(dtReal) {
  const k = kayak, t = G.simTime;
  const wB = waterAt(k.p[0], k.p[2]);
  const f = qRotate(k.q, [0, 0, 1]), fwdH = v3.norm([f[0], 0.001, f[2]]);
  const relSpd = Math.hypot(k.v[0] - wB.u, k.v[2] - wB.v);
  const bowP = v3.add(k.p, v3.scale(fwdH, 1.45)), wBow = waterAt(bowP[0], bowP[2]);
  const bowProb = clamp((relSpd - 1.4) * 0.02, 0, 0.07) * (wBow.h > 0.1 ? 1 : 0) + k.hitFlash * 0.12;
  const bl = k.blade, wBl = waterAt(bl[0], bl[2]);
  const padProb = (k.paddling && bl[1] < wBl.eta + 0.05 && wBl.h > 0.1) ? 0.05 * k.env * (k.tired ? 0.5 : 1) : 0;
  const pu = new Float32Array(28);
  pu.set([W, L, dx, dtReal], 0);
  pu.set([t, SIM.hmin, PARTS.kayakShare, PARTS.ambient], 4);
  pu.set([k.p[0], k.p[1], k.p[2], PARTS.ambient], 8);
  pu.set([bowP[0], wBow.eta + 0.05, bowP[2], bowProb], 12);
  pu.set([k.v[0] * 0.35, 0.2, k.v[2] * 0.35, 0], 16);
  pu.set([bl[0], Math.min(bl[1], wBl.eta), bl[2], padProb], 20);
  pu.set([k.bladeVel[0] * 0.25, 0.25, k.bladeVel[2] * 0.25, 0], 24);
  gpu.write(gpu.partUBuf, 0, pu);
}

export function encodeParticleStep(enc) {
  const pass = enc.beginComputePass();
  pass.setPipeline(gpu.partPipe);
  pass.setBindGroup(0, gpu.partBG);
  pass.dispatchWorkgroups(Math.ceil(PARTS.count / 64));
  pass.end();
}

// ---------- render pass ----------
function drawGridSlices(pass, pipe, slices) {
  pass.setPipeline(pipe);
  for (const sl of slices) {
    pass.setIndexBuffer(sl.buf, 'uint32');
    pass.drawIndexed(sl.count, 1, sl.first);
  }
}

function drawBridges(pass, zk) {
  const visible = bm => !(bm.zMax < zk - RENDER.viewBehind || bm.zMin > zk + RENDER.viewAhead);
  if (bridges.land.length) {
    pass.setPipeline(gpu.pipes.bridge);
    for (const bm of bridges.land) {
      if (!visible(bm)) continue;
      pass.setVertexBuffer(0, bm.vbuf);
      pass.draw(bm.count);
    }
  }
  if (bridges.built.length) {
    pass.setPipeline(gpu.pipes.mesh);
    for (const bm of bridges.built) {
      if (!visible(bm)) continue;
      pass.setVertexBuffer(0, bm.vbuf);
      pass.setVertexBuffer(1, bm.inst);
      pass.draw(bm.count, 1);
    }
  }
}

function drawVegetation(pass, zk) {
  for (const name of Object.keys(meshes.veg)) {
    const ib = instBufs[name];
    if (!ib || !ib.count) continue;
    const [first, n] = instRange(ib, zk);
    if (!n) continue;
    pass.setVertexBuffer(0, meshes.veg[name].vbuf);
    pass.setVertexBuffer(1, ib.buf);
    pass.draw(meshes.veg[name].count, n, 0, first);   // firstInstance offsets into the instance buffer
  }
}

function drawKayak(pass) {
  for (const name of KAYAK_PARTS) {
    pass.setVertexBuffer(0, meshes.kayak[name].vbuf);
    pass.setVertexBuffer(1, kayakInst[name]);
    pass.draw(meshes.kayak[name].count, 1);
  }
  pass.setVertexBuffer(0, armBuf);
  pass.setVertexBuffer(1, kayakInst.arms);
  pass.draw(ARM_VERTS, 1);
}

function drawObstacles(pass, river) {
  if (!river.obstDraw || !river.obstDraw.length) return;
  pass.setPipeline(gpu.pipes.obst);
  for (const d of river.obstDraw) {
    pass.setVertexBuffer(0, meshes.obst[d.name].vbuf);
    pass.setVertexBuffer(1, obstInstBufs[d.name]);
    pass.draw(meshes.obst[d.name].count, d.count);
  }
}

function drawPickups(pass, river) {
  if (!river.pickups) return;
  pass.setPipeline(gpu.pipes.pickup);
  for (const kind of [...river.pickupKinds, 'map']) {
    const list = river.pickups[kind], mesh = meshes.pickup[kind], ib = pickupInstBufs[kind];
    if (!list || !list.length || !ib) continue;
    pass.setVertexBuffer(0, mesh.vbuf);
    pass.setVertexBuffer(1, ib);
    pass.draw(mesh.count, list.length);
  }
  if (sparks.list.length) {
    pass.setVertexBuffer(0, meshes.spark.vbuf);
    pass.setVertexBuffer(1, sparks.buf);
    pass.draw(meshes.spark.count, sparks.list.length);
  }
}

export function encodeRenderPass(enc) {
  const river = G.river, zk = kayak.p[2], fog = currentSky().fogColor;
  const pass = enc.beginRenderPass({
    colorAttachments: [{
      view: gpu.ctx.getCurrentTexture().createView(),
      clearValue: { r: fog[0], g: fog[1], b: fog[2], a: 1 }, loadOp: 'clear', storeOp: 'store',
    }],
    depthStencilAttachment: { view: gpu.depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
  });
  pass.setBindGroup(0, gpu.renBG);
  pass.setPipeline(gpu.pipes.sky);
  pass.draw(3);
  drawGridSlices(pass, gpu.pipes.terrain, lodSlices(true));
  drawBridges(pass, zk);
  pass.setPipeline(gpu.pipes.mesh);
  drawVegetation(pass, zk);
  drawKayak(pass);
  drawObstacles(pass, river);   // last among the solids, with their own alpha-capable pipeline
  drawGridSlices(pass, gpu.pipes.water, lodSlices(false));
  drawPickups(pass, river);
  pass.setPipeline(gpu.pipes.spray);
  pass.draw(6, PARTS.count);
  pass.end();
}