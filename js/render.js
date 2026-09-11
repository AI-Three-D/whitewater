// Everything that draws: chase camera, camera/sky uniforms, terrain LOD slices, the paddler's
// pose, and the render pass itself.
import { RENDER, SIM, KAYAK, BIOME_SKY, TIME_OF_DAY, BIOME_IDS, PARTS } from './config/index.js';
import { v3, qMul, qRotate, qAxisAngle, mat4Perspective, mat4LookAt, mat4Mul, mat4Invert, mat4Compose, mat4Transform, clamp } from './math.js';
import { MeshBuilder, addCylinder } from './meshes.js';
import { S } from './state.js';
import { isMobile } from './platform.js';
import { gpu, ARM_VERT_COUNT } from './gpu.js';
import { terrainH } from './sampling.js';
import { kayak } from './kayak.js';
import { instBufs, instRange, scenery } from './props.js';
import { pickupInstBufs, allPickupKinds } from './pickups.js';
import { sparks } from './effects.js';
import { W, L, dx, Q } from './quality.js';

// ---------- camera ----------
const IDENTITY = mat4Compose([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
const camScale = () => (isMobile ? 0.5 : 1);   // mobile sits closer to the boat

export const cam = {
  pos: [0, 5, 0], look: [0, 0, 10], dir: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0],

  reset() {
    const p = kayak.p, cs = camScale();
    this.dir = v3.norm(qRotate(kayak.q, [0, 0, 1]));
    this.pos = [p[0], p[1] + 3.5 * cs, p[2] - 8 * cs];
    this.look = [p[0], p[1], p[2] + 5];
  },

  // camMode 0: follow heading (biased downstream when the boat points back up, but only where
  // there's actual current to justify it — a dead-flat pond/lake has no "downstream" to keep
  // watch on, so the bias there just fights the player for no reason), 1: fixed downstream,
  // 2: high and far
  wantedDir() {
    if (S.camMode === 1) return [0, 0, 1];
    const f = qRotate(kayak.q, [0, 0, 1]);
    let d = v3.norm([f[0], 0, f[2]]);
    if (S.camMode === 0 && S.river.R.slope > 0 && v3.dot(d, [0, 0, 1]) < -0.2) d = v3.norm(v3.add(d, [0, 0, 1.3]));
    return d;
  },

  // orbit the crash/finish spot on drag input (S.freeCam, driven by controls.js) instead of
  // chasing the boat — the chase cam can't be steered, so a drop right at the take-out or a
  // capsize next to a waterfall is otherwise impossible to actually look at afterward
  updateFree(dt) {
    const { yaw, pitch, dist } = S.freeCam, anchor = kayak.p;
    const cp = Math.cos(pitch);
    const offset = [dist * cp * Math.sin(yaw), dist * Math.sin(pitch) + 1.2, dist * cp * Math.cos(yaw)];
    const want = v3.add(anchor, offset);
    want[1] = Math.max(want[1], terrainH(want[0], want[2]) + 1.0);
    const kp = 1 - Math.exp(-dt * 5);
    this.pos = v3.add(this.pos, v3.scale(v3.sub(want, this.pos), kp));
    const wantLook = v3.add(anchor, [0, 1, 0]);
    this.look = v3.add(this.look, v3.scale(v3.sub(wantLook, this.look), kp));
  },

  update(dt) {
    if (S.gameState === 'over') return this.updateFree(dt);
    const p = kayak.p, cs = camScale(), far = S.camMode === 2;
    const k = 1 - Math.exp(-dt * (S.camMode === 1 ? 6 : 1.8));
    this.dir = v3.norm(v3.add(this.dir, v3.scale(v3.sub(this.wantedDir(), this.dir), k)));
    const back = (far ? 16 : 8.5) * cs, up = (far ? 11 : 3.4) * cs;
    const want = v3.add(v3.sub(p, v3.scale(this.dir, back)), [0, up, 0]);
    want[1] = Math.max(want[1], terrainH(want[0], want[2]) + 1.5);
    // passing under a land bridge: keep the camera below the arch instead of inside the rock
    for (const br of S.river.bridges) {
      const d = br.at(want[0], want[2]);
      if (d && want[1] > d.bottom - 0.4 && want[1] < d.top + 1.0) want[1] = d.bottom - 0.4;
    }
    const kp = 1 - Math.exp(-dt * 5);
    this.pos = v3.add(this.pos, v3.scale(v3.sub(want, this.pos), kp));
    const wantLook = v3.add(p, v3.add(v3.scale(this.dir, far ? 8 : 5), [0, 0.4, 0]));
    this.look = v3.add(this.look, v3.scale(v3.sub(wantLook, this.look), kp));
  },
};

// ---------- sky / camera uniforms ----------
export function currentSky() {
  const R = S.river && S.river.R;
  const biome = (R && BIOME_SKY[R.biome]) || { sunDir: RENDER.sunDir, fogColor: RENDER.fogColor, fogMul: 1 };
  const tod = TIME_OF_DAY[(R && R.timeOfDay) || 'day'] || TIME_OF_DAY.day;
  return {
    sunDir: tod.sunDir || biome.sunDir,
    fogColor: [0, 1, 2].map(i => biome.fogColor[i] * tod.fogTint[i]),
    fogMul: (biome.fogMul ?? 1) * tod.fogMul,
    skyHorizon: tod.skyHorizon,
    skyZenith: tod.skyZenith,
    exposure: tod.exposure,
    moon: tod.moon ?? 0,
  };
}

const camBuf = new Float32Array(76);   // 304 B — must match the Cam struct in shaders.js; reused
                                        // every frame by writeCam instead of reallocated
export function writeCam() {
  const { canvas } = gpu, R = S.river && S.river.R;
  const proj = mat4Perspective(60 * Math.PI / 180, canvas.width / canvas.height, 0.3, 900);
  const view = mat4LookAt(cam.pos, cam.look, [0, 1, 0]);
  const vp = mat4Mul(proj, view), ivp = mat4Invert(vp);
  cam.right = [view[0], view[4], view[8]];
  cam.up = [view[1], view[5], view[9]];
  const sky = currentSky(), sunDir = v3.norm(sky.sunDir);
  const wt = (R && R.waterTint) || [0.02, 0.10, 0.09];   // the original deep-water colour
  const f = camBuf;
  f.set(vp, 0);
  f.set(ivp, 16);
  f.set([...cam.pos, 1], 32);
  f.set([...sunDir, 0], 36);
  f.set([S.simTime, W, L, dx], 40);
  f.set([...sky.fogColor, RENDER.fogDensity * (sky.fogMul ?? 1)], 44);
  f.set([S.dbgMode, SIM.hmin, Q.simpleShading ? 1 : 0, RENDER.lod.near], 48);
  f.set([...cam.right, 0], 52);
  f.set([...cam.up, 0], 56);
  f.set([...wt, (R && R.waterClarity) || 1], 60);
  f.set([BIOME_IDS[(R && R.biome) || 'alpine'] ?? 0, sky.exposure ?? 1, sky.moon ?? 0, 0], 64);
  f.set([...sky.skyHorizon, 0], 68);
  f.set([...sky.skyZenith, 0], 72);
  gpu.device.queue.writeBuffer(gpu.camUBuf, 0, f);
}

// ---------- terrain/water LOD ----------
// the window [viewBehind, viewAhead] around the boat split into three density bands; `overlap`
// extends the coarser bands one row back so the terrain has no cracks at the seams
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
    const lo = gpu.lods[k], s = lo.s;
    const r0 = clamp(Math.floor(seams[k] / s) - (k && overlap ? 1 : 0), 0, lo.rows - 2);
    const r1 = clamp(Math.ceil(seams[k + 1] / s), 0, lo.rows - 1);
    if (r1 > r0) out.push({ buf: lo.buf, first: r0 * lo.rowIdx, count: (r1 - r0) * lo.rowIdx });
  }
  return out;
}

// ---------- paddler pose ----------
const kayakInstBuf = new Float32Array(20);   // reused for every part; writeBuffer copies out
                                              // synchronously so it's safe to overwrite right after
function writeKayakInst(name, m, tint = [1, 1, 1, 1]) {
  const d = kayakInstBuf;
  d.set(m, 0);
  d.set(tint, 16);
  gpu.device.queue.writeBuffer(gpu.kayakInst[name], 0, d);
}

export function updateKayakInstances(dtReal) {
  const k = kayak, M = mat4Compose(k.p, k.q, [1, 1, 1]);
  const flash = 1 + 0.6 * k.hitFlash, hc = S.runCraft.color;
  writeKayakInst('hull', M, [hc[0] * flash, hc[1] * flash, hc[2] * flash, 1]);
  writeKayakInst('cockpit', M);

  // smoothed copies of the stroke state so the mesh never snaps
  const vk = Math.min(1, dtReal * 9);
  k.visSide += (k.side - k.visSide) * vk;
  k.visAmp += ((k.mode === 'sweep' ? 1.0 : 0.6) - k.visAmp) * vk;
  k.visDirn += ((k.mode === 'back' ? -1 : 1) - k.visDirn) * vk;
  k.visEnv += ((k.paddling ? 1 : 0) - k.visEnv) * vk;
  k.visBack += ((k.mode === 'back' ? -0.5 : 1) - k.visBack) * vk;

  // torso: leans with the hips, rocks with the stroke; a tired paddler slumps forward a little
  const slump = k.tired ? 0.12 : 0;
  const leanQ = qMul(qAxisAngle([0, 0, 1], -k.lean * 0.45), qAxisAngle([1, 0, 0], 0.18 * k.env * k.visBack + slump));
  const torsoL = mat4Mul(mat4Compose([0, 0.30, 0.05], leanQ, [1, 1, 1]), mat4Compose([0, 0.25, 0], [0, 0, 0, 1], [1, 1, 1]));
  writeKayakInst('torso', mat4Mul(M, torsoL));
  writeKayakInst('head', mat4Mul(M, mat4Mul(torsoL, mat4Compose([0, 0.37, 0.02], [0, 0, 0, 1], [1, 1, 1]))));

  // paddle: visSide glides the roll and the blade emitter across; yaw swing is rate-limited
  const s = k.visSide, env = k.visEnv;
  const yawTarget = -k.side * k.visAmp * Math.cos(Math.PI * k.strokeT) * k.visDirn;
  const maxSwing = KAYAK.paddleSwingRate * dtReal;   // NOTE: base table, see traits()
  k.visYaw += clamp(yawTarget - k.visYaw, -maxSwing, maxSwing);
  const paddleQ = qMul(qAxisAngle([0, 0, 1], -s * 0.55 * env), qAxisAngle([0, 1, 0], k.visYaw * env));
  const paddleL = mat4Mul(torsoL, mat4Compose([0, 0.12, 0.28], paddleQ, [1, 1, 1]));
  const paddleW = mat4Mul(M, paddleL);
  writeKayakInst('paddle', paddleW);

  // arms are rebuilt every frame as two cylinders from shoulder to hand
  const mb = new MeshBuilder();
  for (const sd of [-1, 1]) {
    const shoulder = mat4Transform(torsoL, [sd * 0.19, 0.2, 0.03]), hand = mat4Transform(paddleL, [sd * 0.33, 0, 0]);
    addCylinder(mb, shoulder, hand, 0.04, 0.03, 8, [0.12, 0.32, 0.82]);
  }
  gpu.device.queue.writeBuffer(gpu.armBuf, 0, mb.data());
  writeKayakInst('arms', M);

  // blade position/velocity feed the spray emitter
  k.bladePrev = k.blade;
  k.blade = mat4Transform(paddleW, [s * 0.98, 0, 0]);
  if (dtReal > 1e-4) k.bladeVel = v3.scale(v3.sub(k.blade, k.bladePrev), 1 / dtReal);
}

// ---------- render pass ----------
const drawSlices = (pass, slices) => {
  for (const sl of slices) {
    pass.setIndexBuffer(sl.buf, 'uint32');
    pass.drawIndexed(sl.count, 1, sl.first);
  }
};

const drawInstanced = (pass, mesh, inst, count = 1, first = 0) => {
  pass.setVertexBuffer(0, mesh.vbuf);
  pass.setVertexBuffer(1, inst);
  pass.draw(mesh.count, count, 0, first);
};

function drawBridges(pass, zk) {
  const visible = bm => !(bm.zMax < zk - RENDER.viewBehind || bm.zMin > zk + RENDER.viewAhead);
  if (scenery.bridgeGpu.length) {
    pass.setPipeline(gpu.bridgePipe);
    for (const bm of scenery.bridgeGpu) {
      if (!visible(bm)) continue;
      pass.setVertexBuffer(0, bm.vbuf);
      pass.draw(bm.count);
    }
  }
  if (scenery.builtGpu.length) {
    pass.setPipeline(gpu.meshPipe);
    for (const bm of scenery.builtGpu) if (visible(bm)) drawInstanced(pass, bm, bm.inst);
  }
}

function drawVegetation(pass, zk) {
  for (const name of Object.keys(gpu.vegMeshes)) {
    const ib = instBufs[name];
    if (!ib || !ib.count) continue;
    const [first, n] = instRange(ib, zk);
    if (n) drawInstanced(pass, gpu.vegMeshes[name], ib.buf, n, first);   // firstInstance offsets into the buffer
  }
}

function drawKayak(pass) {
  for (const name of ['hull', 'cockpit', 'torso', 'head', 'paddle']) {
    drawInstanced(pass, gpu.kayakMeshes[name], gpu.kayakInst[name]);
  }
  pass.setVertexBuffer(0, gpu.armBuf);
  pass.setVertexBuffer(1, gpu.kayakInst.arms);
  pass.draw(ARM_VERT_COUNT, 1);
}

function drawObstacles(pass) {
  const draws = S.river.obstDraw;
  if (!draws || !draws.length) return;
  pass.setPipeline(gpu.obstPipe);
  for (const d of draws) drawInstanced(pass, gpu.obstMeshes[d.name], gpu.obstInstBufs[d.name], d.count);
}

function drawPickups(pass) {
  if (!S.river.pickups) return;
  pass.setPipeline(gpu.pickupPipe);
  for (const kind of allPickupKinds()) {
    const list = S.river.pickups[kind], ib = pickupInstBufs[kind];
    if (!list || !list.length || !ib) continue;
    drawInstanced(pass, gpu.pickupMeshes[kind], ib, list.length);
  }
  if (sparks.length) drawInstanced(pass, gpu.sparkMesh, gpu.sparkBuf, sparks.length);
}

// draw order: sky, opaque terrain + scenery + boat, obstacles (alpha-capable), then the
// transparent water, pickups/sparks and spray on top
export function encodeRenderPass(enc) {
  const zk = kayak.p[2], fog = currentSky().fogColor;
  const pass = enc.beginRenderPass({
    colorAttachments: [{
      view: gpu.ctx.getCurrentTexture().createView(),
      clearValue: { r: fog[0], g: fog[1], b: fog[2], a: 1 }, loadOp: 'clear', storeOp: 'store',
    }],
    depthStencilAttachment: { view: gpu.depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
  });
  pass.setBindGroup(0, gpu.renBG);
  pass.setPipeline(gpu.skyPipe);
  pass.draw(3);
  pass.setPipeline(gpu.terrainPipe);
  drawSlices(pass, lodSlices(true));
  drawBridges(pass, zk);
  pass.setPipeline(gpu.meshPipe);
  drawVegetation(pass, zk);   
  drawKayak(pass);
  drawObstacles(pass);
  pass.setPipeline(gpu.waterPipe);
  drawSlices(pass, lodSlices(false));
  drawPickups(pass);
  pass.setPipeline(gpu.sprayPipe);
  pass.draw(6, PARTS.count);
  pass.end();
}