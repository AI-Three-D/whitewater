// Floating obstacles (logs etc.): spawning ahead of the boat, per-sample drag/grounding,
// capsule-capsule contacts, retirement, instancing. Landslide boulders share the list and instance
// buffers but are driven by landslides.js.
import { OBSTACLES } from './config/index.js';
import { clamp, mulberry32, qMul, qAxisAngle, mat4Compose } from './math.js';
import { S } from './state.js';
import { gpu, ensureInstBuf, ensureScratch } from './gpu.js';
import { waterAt, terrainH, terrainN, surfaceAt, rowOf } from './sampling.js';
import { kayak } from './kayak.js';
import { triggerLandslides, replayLandslides } from './landslides.js';
import { W, dx } from './quality.js';
import { viewWindow } from './view.js';
const TWO_PI = 2 * Math.PI;

// a landslide boulder is always exactly one of dormant / replaying / settled — never live-stepped
const isFrozen = ob => ob.dormant || ob.replaying || ob.settled;

export function placeObstacles() {
  const river = S.river;
  river.obstacles = [];
  river.obstNear = [];
  river.obstSpawn = [];
  river.obstDraw = [];
  river.obstCap = 0;
  const cfg = river.R.obstacles;
  if (!cfg || !OBSTACLES.enabled) return;
  river.obstCap = cfg.max ?? OBSTACLES.maxActive;
  river.obstAhead = cfg.spawnAhead ?? OBSTACLES.spawnAhead;
  river.obstRng = mulberry32(river.seed + 501);
  river.obstLastZ = kayak.p[2];
  for (const [kindName, kindCfg] of Object.entries(cfg)) {
    const kind = OBSTACLES.kinds[kindName];
    if (!kind) continue;   // `max`, `spawnAhead` … aren't kinds
    for (const clsName of Object.keys(OBSTACLES.classes)) {
      const entry = kindCfg[clsName];
      if (entry == null || !kind[clsName]) continue;
      const spec = typeof entry === 'number' ? { per100m: entry } : entry;
      river.obstSpawn.push({ kindName, clsName, kind, cls: OBSTACLES.classes[clsName], base: kind[clsName], spec, acc: 0 });
    }
  }
  for (const name of Object.keys(gpu.obstMeshes)) ensureInstBuf(gpu.obstInstBufs, name, river.obstCap);
  // seed the stretch ahead of the start so it isn't empty on the first spawn window
  const z0 = kayak.p[2] + OBSTACLES.seedAheadFrom, z1 = kayak.p[2] + river.obstAhead[1];
  for (const e of river.obstSpawn) {
    const n = Math.floor((e.spec.per100m ?? 0) * (z1 - z0) / 100 + river.obstRng());
    for (let k = 0; k < n; k++) spawnObstacle(e, z0 + river.obstRng() * (z1 - z0));
  }
}

function spawnObstacle(e, z) {
  const river = S.river, list = river.obstacles, rng = river.obstRng;
  if (list.length >= river.obstCap || z > river.finishZ - 5) return false;
  const pond = river.R.pond;
  if (pond && Math.abs(z - pond.z) < pond.len / 2 + 5) return false;
  const lenR = e.spec.len ?? e.base.len, len = lenR[0] + rng() * (lenR[1] - lenR[0]);
  const mesh = e.base.meshes[Math.floor(rng() * e.base.meshes.length)], V = gpu.obstMeshes[mesh];
  const sc = len / V.len, rad = V.rad * sc;
  const chans = river.rows[rowOf(z)];
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
    x, z, y: surfaceAt(x, z), yaw: rng() * TWO_PI, roll: e.kind.roll ? rng() * TWO_PI : 0,
    vx: w.u, vz: w.v, w: (rng() - 0.5) * 0.2, bobPh: rng() * TWO_PI,
    fx: 0, fz: 0, tq: 0, grounded: false, sinking: false, sinkT: 0, y0: 0, alpha: 1,
    tint: [g, g, g, 1],
  });
  return true;
}

function spawnObstacles() {
  const river = S.river;
  if (!river.obstSpawn.length) return;
  const kz = kayak.p[2], prog = Math.max(0, kz - river.obstLastZ);
  river.obstLastZ = Math.max(river.obstLastZ, kz);
  const [a0, a1] = river.obstAhead;
  for (const e of river.obstSpawn) {
    e.acc += prog * (e.spec.per100m ?? 0) / 100;
    while (e.acc >= 1) {
      e.acc -= 1;
      spawnObstacle(e, kz + a0 + river.obstRng() * (a1 - a0));
    }
  }
}

function stepObstacle(ob, dt) {
  const dirx = Math.sin(ob.yaw), dirz = Math.cos(ob.yaw), half = ob.len / 2, n = ob.samples;
  let Fx = ob.fx, Fz = ob.fz, T = ob.tq, grounded = false;
  for (let s = 0; s < n; s++) {
    const t = (n > 1 ? (s / (n - 1)) * 2 - 1 : 0) * half;
    const rx = dirx * t, rz = dirz * t;
    const px = ob.x + rx, pz = ob.z + rz;
    const w = waterAt(px, pz);
    const pvx = ob.vx + ob.w * rz, pvz = ob.vz - ob.w * rx;
    const relx = pvx - w.u, relz = pvz - w.v;
    const al = relx * dirx + relz * dirz;
    const latx = relx - al * dirx, latz = relz - al * dirz;
    const wet = clamp(w.h / ob.draft, 0, 1);
    const cA = ob.mass * OBSTACLES.dragAxial / n * wet, cL = ob.mass * OBSTACLES.dragLat / n * wet;
    let fx = -(cA * al * dirx + cL * latx), fz = -(cA * al * dirz + cL * latz);
    if (w.h < ob.draft) {
      // grounded: bed slope pushes it back toward deeper water; on a flat bar friction simply strands it
      const pen = ob.draft - w.h, nrm = terrainN(px, pz), sc = ob.mass / n;
      fx += sc * OBSTACLES.groundPush * pen * nrm[0];
      fz += sc * OBSTACLES.groundPush * pen * nrm[2];
      const fr = sc * OBSTACLES.groundFric * clamp(pen / ob.draft, 0, 1);
      fx -= fr * pvx;
      fz -= fr * pvz;
      grounded = true;
    }
    Fx += fx;
    Fz += fz;
    T += rz * fx - rx * fz;
  }
  const I = Math.max(ob.mass * ob.len * ob.len / 12, 1);
  ob.vx += Fx / ob.mass * dt;
  ob.vz += Fz / ob.mass * dt;
  ob.w = (ob.w + T / I * dt) * Math.exp(-OBSTACLES.yawDrag * dt);
  const sp = Math.hypot(ob.vx, ob.vz);
  if (sp > OBSTACLES.vmax) {
    ob.vx *= OBSTACLES.vmax / sp;
    ob.vz *= OBSTACLES.vmax / sp;
  }
  ob.w = clamp(ob.w, -OBSTACLES.wmax, OBSTACLES.wmax);
  ob.x = clamp(ob.x + ob.vx * dt, 1, W * dx - 1);
  ob.z += ob.vz * dt;
  ob.yaw += ob.w * dt;
  ob.grounded = grounded;
}

// A's axis sampled against B's axis, pushing the pair apart where they overlap; called both ways
// round per pair, which is what lets logs pile up behind a jammed one instead of passing through.
function contactSegs(A, B, dt) {
  const adx = Math.sin(A.yaw), adz = Math.cos(A.yaw);
  const bdx = Math.sin(B.yaw), bdz = Math.cos(B.yaw), bh = B.len / 2;
  const mEff = 2 * A.mass * B.mass / (A.mass + B.mass), Rr = A.rad + B.rad;
  const IA = A.mass * A.len * A.len / 12, IB = B.mass * B.len * B.len / 12;
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
    A.vx += fx / A.mass * dt;
    A.vz += fz / A.mass * dt;
    A.w += ((adz * ta) * fx - (adx * ta) * fz) / IA * dt;
    B.vx -= fx / B.mass * dt;
    B.vz -= fz / B.mass * dt;
    B.w -= ((bdz * tb) * fx - (bdx * tb) * fz) / IB * dt;
  }
}

// obstacles far behind the boat (or past the finish) sink while fading, then leave the list
function retireObstacles(list, dtReal) {
  const kz = kayak.p[2], active = [];
  for (const ob of list) {
    if (!ob.sinking && (ob.z < kz - OBSTACLES.despawnBehind || ob.z > S.river.finishZ + 15)) {
      ob.sinking = true;
      ob.sinkT = 0;
      ob.y0 = ob.y;
    }
    if (!ob.sinking) {
      active.push(ob);
      continue;
    }
    ob.sinkT += dtReal;
    const s = clamp(ob.sinkT / OBSTACLES.sinkTime, 0, 1);
    ob.alpha = 1 - s;
    ob.y = ob.y0 - OBSTACLES.sinkDepth * s * s;
    ob.fx = 0;
    ob.fz = 0;
    ob.tq = 0;
  }
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].sinking && list[i].sinkT >= OBSTACLES.sinkTime) list.splice(i, 1);
  }
  return active;
}

function stepActive(active, dtReal) {
  const steps = OBSTACLES.substeps, dt = dtReal / steps;
  for (let s = 0; s < steps; s++) {
    for (const ob of active) if (!isFrozen(ob)) stepObstacle(ob, dt);
    for (let a = 0; a < active.length; a++) {
      for (let b = a + 1; b < active.length; b++) {
        const A = active[a], B = active[b];
        if (isFrozen(A) || isFrozen(B)) continue;
        const reach = (A.len + B.len) / 2 + A.rad + B.rad;
        if (Math.abs(A.z - B.z) > reach || Math.abs(A.x - B.x) > reach) continue;
        contactSegs(A, B, dt);
        contactSegs(B, A, dt);
      }
    }
  }
}

// smooth Y toward the water surface (bobbing) or, for boulders, the terrain
function settleHeights(active, dtReal) {
  const ky = 1 - Math.exp(-dtReal * OBSTACLES.ySmooth);
  for (const ob of active) {
    ob.fx = 0;
    ob.fz = 0;
    ob.tq = 0;
    if (ob.kind === 'boulder' && ob.settled) continue;
    const target = ob.kind === 'boulder'
      ? terrainH(ob.x, ob.z) + ob.vrad
      : surfaceAt(ob.x, ob.z) + (ob.grounded ? 0 : ob.rad * OBSTACLES.freeboard
          + OBSTACLES.bob * Math.sin(S.simTime * OBSTACLES.bobSpeed + ob.bobPh));
    ob.y += (target - ob.y) * ky;
  }
}

export function updateObstacles(dtReal) {
  spawnObstacles();
  const list = S.river.obstacles;
  if (!list.length) return;
  triggerLandslides();
  replayLandslides(dtReal);
  const active = retireObstacles(list, dtReal);
  stepActive(active, dtReal);
  settleHeights(active, dtReal);
  // broad phase for the kayak contact test, consumed by kayak.step next frame
  S.river.obstNear = active.filter(ob => ob.hitK > 0 &&
    Math.hypot(ob.x - kayak.p[0], ob.z - kayak.p[2]) < ob.len / 2 + ob.rad + 4);
}

export function writeObstacleInstances() {
  const river = S.river;
  const { zc, back, ahead } = viewWindow(), zLo = zc - back - 4, zHi = zc + ahead + 4;
  
  const groups = {};
  for (const ob of river.obstacles || []) {
    if (ob.z < zLo || ob.z > zHi) continue;
    (groups[ob.mesh] || (groups[ob.mesh] = [])).push(ob);
  }
  river.obstDraw = [];
  for (const [name, list] of Object.entries(groups)) {
    const data = ensureScratch('obst', name, list.length * 20);
    list.forEach((ob, n) => {
      const q = qMul(qAxisAngle([0, 1, 0], ob.yaw), qAxisAngle([0, 0, 1], ob.roll));
      data.set(mat4Compose([ob.x, ob.y, ob.z], q, [ob.sc, ob.sc, ob.sc]), n * 20);
      data.set([ob.tint[0], ob.tint[1], ob.tint[2], ob.alpha], n * 20 + 16);
    });
    gpu.device.queue.writeBuffer(gpu.obstInstBufs[name], 0, data, 0, list.length * 20);
    river.obstDraw.push({ name, count: list.length });
  }
}