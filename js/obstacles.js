// Floating obstacles (logs etc.) spawned ahead of the boat and drifting with the current, plus
// landslide boulders: pre-baked roll-down trajectories replayed when the boat gets close.
import { GRID, OBSTACLES, LANDSLIDE, RENDER } from './config.js';
import { mulberry32, clamp, qMul, qAxisAngle, mat4Compose } from './math.js';
import { G } from './state.js';
import { gpu } from './gpu.js';
import { meshes, obstInstBufs, ensureObstInstBufs } from './assets.js';
import { terrainH, terrainN, waterAt, surfaceAt, rowOf, clampX } from './sampling.js';
import { kayak } from './kayak.js';
import { spawnBurst } from './pickups.js';

const { W, L, dx } = GRID;
const TAU = 6.2832;
const TRAJ_STRIDE = 7;   // baked boulder row: t, x, y, z, yaw, roll, speed

// a landslide boulder is always exactly one of dormant (still hanging) / replaying / settled
// (frozen for good) — never live-stepped
const isLive = ob => !(ob.dormant || ob.replaying || ob.settled);

// ---------- floating obstacles: placement & spawning ----------
function spawnTable(cfg) {
  const table = [];
  for (const [kindName, kindCfg] of Object.entries(cfg)) {
    const kind = OBSTACLES.kinds[kindName];
    if (!kind) continue;   // `max`, `spawnAhead` … aren't kinds
    for (const clsName of Object.keys(OBSTACLES.classes)) {
      const entry = kindCfg[clsName];
      if (entry == null || !kind[clsName]) continue;
      const spec = typeof entry === 'number' ? { per100m: entry } : entry;
      table.push({ kindName, clsName, kind, cls: OBSTACLES.classes[clsName], base: kind[clsName], spec, acc: 0 });
    }
  }
  return table;
}

export function placeObstacles() {
  const river = G.river;
  Object.assign(river, { obstacles: [], obstNear: [], obstSpawn: [], obstDraw: [], obstCap: 0 });
  const cfg = river.R.obstacles;
  if (!cfg || !OBSTACLES.enabled) return;
  river.obstCap = cfg.max ?? OBSTACLES.maxActive;
  river.obstAhead = cfg.spawnAhead ?? OBSTACLES.spawnAhead;
  river.obstRng = mulberry32(river.seed + 501);
  river.obstLastZ = kayak.p[2];
  river.obstSpawn = spawnTable(cfg);
  ensureObstInstBufs(Object.keys(meshes.obst), river.obstCap);
  // seed the first stretch ahead of the boat
  const z0 = kayak.p[2] + OBSTACLES.seedAheadFrom, z1 = kayak.p[2] + river.obstAhead[1];
  for (const e of river.obstSpawn) {
    const n = Math.floor((e.spec.per100m ?? 0) * (z1 - z0) / 100 + river.obstRng());
    for (let k = 0; k < n; k++) spawnObstacle(e, z0 + river.obstRng() * (z1 - z0));
  }
}

function spawnObstacle(e, z) {
  const river = G.river, list = river.obstacles, rng = river.obstRng;
  if (list.length >= river.obstCap || z > river.finishZ - 5) return false;
  const pond = river.R.pond;
  if (pond && Math.abs(z - pond.z) < pond.len / 2 + 5) return false;
  const lenR = e.spec.len ?? e.base.len, len = lenR[0] + rng() * (lenR[1] - lenR[0]);
  const mesh = e.base.meshes[Math.floor(rng() * e.base.meshes.length)], V = meshes.obst[mesh];
  const sc = len / V.len, rad = V.rad * sc;
  const chans = river.rows[rowOf(z)], chan = chans[Math.floor(rng() * chans.length)];
  let x = 0, ok = false;
  for (let tries = 0; tries < 8 && !ok; tries++) {
    x = clampX(chan.c + (rng() * 1.3 - 0.65) * chan.hw);
    ok = list.every(o => Math.hypot(o.x - x, o.z - z) > (o.len + len) * 0.5 + 1);
  }
  if (!ok) return false;
  const g = 0.85 + 0.3 * rng(), w = waterAt(x, z);
  list.push({
    kind: e.kindName, cls: e.clsName, mesh, len, rad, sc,
    draft: V.draft * sc, mass: Math.max(20, e.kind.density * V.vol * sc * sc * sc),
    samples: e.cls.samples, hitK: e.cls.hitK, lift: e.cls.lift,
    x, z, y: surfaceAt(x, z), yaw: rng() * TAU, roll: e.kind.roll ? rng() * TAU : 0,
    vx: w.u, vz: w.v, w: (rng() - 0.5) * 0.2, bobPh: rng() * TAU,   // born already moving with the current
    fx: 0, fz: 0, tq: 0, grounded: false, sinking: false, sinkT: 0, y0: 0, alpha: 1,
    tint: [g, g, g, 1],
  });
  return true;
}

// spawn in proportion to the distance the boat has progressed since last frame
function spawnObstacles() {
  const river = G.river;
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

// ---------- floating obstacles: dynamics ----------
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
    const wet = clamp(w.h / ob.draft, 0, 1);   // a beached log barely feels the flow
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
  ob.vx += Fx / ob.mass * dt;
  ob.vz += Fz / ob.mass * dt;
  ob.w = (ob.w + T / I * dt) * Math.exp(-OBSTACLES.yawDrag * dt);
  const sp = Math.hypot(ob.vx, ob.vz);
  if (sp > OBSTACLES.vmax) { ob.vx *= OBSTACLES.vmax / sp; ob.vz *= OBSTACLES.vmax / sp; }
  ob.w = clamp(ob.w, -OBSTACLES.wmax, OBSTACLES.wmax);
  ob.x = clampX(ob.x + ob.vx * dt);
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

// ---------- landslides ----------
function bakeBoulderTrajectory(x0, z0, vrad, seed, downBias) {
  const rng = mulberry32(seed), fdt = LANDSLIDE.bakeDt;
  // speed is carried through so the splash at the water crossing can scale with how fast the
  // boulder actually got there (see injectSplash / replayLandslides)
  const rows = [[0, x0, terrainH(x0, z0) + vrad, z0, rng() * TAU, 0, 0]];
  let x = x0, z = z0, vx = 0, vz = 0, roll = 0, settleT = 0, endedWet = false;
  for (let i = 1; i <= LANDSLIDE.bakeMaxSteps; i++) {
    const n = terrainN(x, z), slope = Math.hypot(n[0], n[2]);
    const dirx = slope > 1e-4 ? n[0] / slope : 0, dirz = slope > 1e-4 ? n[2] / slope : 0;
    const wob = (rng() - 0.5) * LANDSLIDE.rollWobble;   // perpendicular to the downhill direction
    const ax = dirx * LANDSLIDE.rollAccel * slope - dirz * wob;
    const az = dirz * LANDSLIDE.rollAccel * slope + dirx * wob + downBias;
    const fric = LANDSLIDE.rollFric * (0.6 + 0.4 * slope);   // less friction the steeper it is
    vx += (ax - fric * vx) * fdt; vz += (az - fric * vz) * fdt;
    const sp = Math.hypot(vx, vz);
    if (sp > LANDSLIDE.rollVmax) { vx *= LANDSLIDE.rollVmax / sp; vz *= LANDSLIDE.rollVmax / sp; }
    x += vx * fdt; z += vz * fdt;
    const speed = Math.hypot(vx, vz);
    roll += (speed / Math.max(vrad, 0.2)) * fdt;
    const yaw = (vx || vz) ? Math.atan2(vx, vz) : rows[rows.length - 1][4];
    rows.push([i * fdt, x, terrainH(x, z) + vrad, z, yaw, roll, speed]);
    if (waterAt(x, z).h > LANDSLIDE.deepWater) { endedWet = true; break; }
    if (speed < LANDSLIDE.settleSpeed) {
      settleT += fdt;
      if (settleT > LANDSLIDE.settleTime) break;
    } else {
      settleT = 0;
    }
  }
  const traj = new Float32Array(rows.length * TRAJ_STRIDE);
  rows.forEach((r, i) => traj.set(r, i * TRAJ_STRIDE));
  return { traj, dur: rows[rows.length - 1][0], endedWet };
}

export function placeLandslides() {
  const river = G.river, zone = river.R.landslideZone;
  if (!zone) return;
  for (const spec of [LANDSLIDE.medium, LANDSLIDE.large]) ensureObstInstBufs(spec.meshes, zone.count);
  const span = (zone.to - zone.from) / zone.count;
  for (let spotIdx = 0; spotIdx < zone.count; spotIdx++) {
    if (Math.random() >= zone.activeChance) continue;   // not live this attempt — never placed at all
    const z = clamp(zone.from + (spotIdx + 0.15 + 0.7 * Math.random()) * span, zone.from, zone.to);
    const side = Math.random() < 0.5 ? -1 : 1;
    const chan = river.rows[rowOf(z)][0];   // landslide zones are kept clear of forks, so [0] is always right
    const spec = Math.random() < 0.5 ? LANDSLIDE.medium : LANDSLIDE.large;
    const cls = spec === LANDSLIDE.large ? 'large' : 'medium';
    const mesh = spec.meshes[Math.floor(Math.random() * spec.meshes.length)], V = meshes.obst[mesh];
    const len = spec.len[0] + Math.random() * (spec.len[1] - spec.len[0]), sc = len / V.len;
    const off = chan.hw + LANDSLIDE.bankOffset[0] + Math.random() * (LANDSLIDE.bankOffset[1] - LANDSLIDE.bankOffset[0]);
    const x = clampX(chan.c + side * off);
    const g = 0.85 + 0.25 * Math.random(), vrad = V.vrad * sc;
    const downBias = Math.random() * LANDSLIDE.downstreamBias;
    const { traj, dur, endedWet } = bakeBoulderTrajectory(x, z, vrad, river.seed + 800 + spotIdx, downBias);
    // timed against this boulder's own fall duration by default — see LANDSLIDE.assumedSpeed —
    // so it's triggered to be watched coming down rather than always finishing before the player
    // gets there; nearChance skips that for a close-range surprise instead
    const triggerDist = Math.random() < LANDSLIDE.nearChance ? LANDSLIDE.nearTriggerZ
      : clamp(LANDSLIDE.assumedSpeed * (dur + LANDSLIDE.leadTime), LANDSLIDE.minTriggerZ, LANDSLIDE.maxTriggerZ);
    river.obstacles.push({
      kind: 'boulder', cls, mesh, len, rad: V.rad * sc, sc, vrad,
      draft: V.draft * sc, mass: Math.max(20, spec.density * V.vol * sc * sc * sc),
      samples: spec.samples, hitK: spec.hitK, lift: spec.lift,
      x, z, y: terrainH(x, z) + vrad, yaw: Math.random() * TAU, roll: 0,
      vx: 0, vz: 0, w: 0, bobPh: Math.random() * TAU,
      fx: 0, fz: 0, tq: 0, grounded: true, sinking: false, sinkT: 0, y0: 0, alpha: 1,
      tint: [g, g, g, 1],
      dormant: true, triggerRolled: false, splashed: false, settled: false, triggerDist, dustT: 0,
      traj, trajDur: dur, trajEndedWet: endedWet, replaying: false, replayT: 0,
    });
  }
}

function triggerLandslides() {
  const river = G.river;
  if (!river.R.landslideZone) return;
  const kz = kayak.p[2];
  for (const ob of river.obstacles) {
    if (ob.kind !== 'boulder' || !ob.dormant || ob.triggerRolled) continue;
    if (ob.z - kz > ob.triggerDist) continue;
    ob.triggerRolled = true;
    ob.dormant = false;
    ob.replaying = true;
    ob.replayT = 0;
  }
}

// a boulder entering the water: raise the surface and push water outward in a disc around it
function injectSplash(cx, cz, speed) {
  const scale = clamp(speed / LANDSLIDE.splashRefSpeed, LANDSLIDE.splashMinScale, LANDSLIDE.splashMaxScale);
  const R = LANDSLIDE.splashRadius * scale, height = LANDSLIDE.splashHeight * scale, cells = Math.ceil(R / dx);
  const i0 = Math.round(cx / dx), j0 = Math.round(cz / dx);
  const cell = new Float32Array(4);
  for (let dj = -cells; dj <= cells; dj++) {
    for (let di = -cells; di <= cells; di++) {
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || i >= W || j < 0 || j >= L) continue;
      const d = Math.hypot(di * dx, dj * dx);
      if (d > R) continue;
      const w = waterAt((i + 0.5) * dx, (j + 0.5) * dx);
      const bump = height * (1 - d / R), outward = d > 0.01 ? bump * 1.6 : 0, dd = Math.max(d, 0.01);
      cell[0] = w.h + bump;
      cell[1] = w.u + outward * (di * dx) / dd;
      cell[2] = w.v + outward * (dj * dx) / dd;
      cell[3] = w.h > 0.05 ? 1 : 0;
      gpu.write(gpu.stateBufs[0], (j * W + i) * 16, cell);
    }
  }
}

// raise the bed under a settled boulder so the water flows around it, on the CPU copy and the GPU
function carveBoulderIntoBed(x, z, rad, topY) {
  const river = G.river, local = terrainH(x, z), top = Math.max(topY, local + 0.1);
  const i0 = clamp(Math.floor((x - rad) / dx), 0, W - 1), i1 = clamp(Math.ceil((x + rad) / dx), 0, W - 1);
  const j0 = clamp(Math.floor((z - rad) / dx), 0, L - 1), j1 = clamp(Math.ceil((z + rad) / dx), 0, L - 1);
  for (let jj = j0; jj <= j1; jj++) {
    const row = new Float32Array(i1 - i0 + 1);
    for (let ii = i0; ii <= i1; ii++) {
      const idx = jj * W + ii, dist = Math.hypot((ii + 0.5) * dx - x, (jj + 0.5) * dx - z);
      let v = river.b[idx];
      if (dist < rad) v = Math.max(v, top - (top - local) * Math.pow(dist / rad, 6));
      river.b[idx] = v;
      row[ii - i0] = v;
    }
    gpu.write(gpu.terrainBuf, (jj * W + i0) * 4, row);
  }
}

// advance every replaying boulder along its baked trajectory, with splash/dust effects
function replayLandslides(list, dtReal) {
  for (const ob of list) {
    if (!ob.replaying) continue;
    ob.replayT += dtReal;
    const traj = ob.traj, n = traj.length / TRAJ_STRIDE, tEnd = traj[(n - 1) * TRAJ_STRIDE];
    const fi = Math.min(ob.replayT, tEnd) / LANDSLIDE.bakeDt;
    const i0 = clamp(Math.floor(fi), 0, n - 1), i1 = Math.min(i0 + 1, n - 1), ft = fi - i0;
    const at = k => traj[i0 * TRAJ_STRIDE + k] + (traj[i1 * TRAJ_STRIDE + k] - traj[i0 * TRAJ_STRIDE + k]) * ft;
    ob.x = at(1); ob.y = at(2); ob.z = at(3); ob.yaw = at(4); ob.roll = at(5);

    const wh = waterAt(ob.x, ob.z).h;
    if (!ob.splashed && wh > 0.12) {
      ob.splashed = true;
      injectSplash(ob.x, ob.z, at(6));
      spawnBurst(ob.x, ob.y + ob.vrad * 0.5, ob.z, LANDSLIDE.splashCol);   // reuses the pickup burst's count/life
    } else if (wh <= 0.05) {
      // brief dust while it's still rolling on dry ground — throttled, not every frame
      ob.dustT -= dtReal;
      if (ob.dustT <= 0) { ob.dustT = LANDSLIDE.dustInterval; spawnBurst(ob.x, ob.y, ob.z, LANDSLIDE.dustCol); }
    }
    if (ob.replayT >= tEnd) {
      ob.replaying = false;
      ob.settled = true;   // frozen for good from here
      const emergeTop = waterAt(ob.x, ob.z).eta + 0.35;
      carveBoulderIntoBed(ob.x, ob.z, ob.rad, Math.min(emergeTop, ob.y + ob.vrad));
    }
  }
}

// ---------- per-frame update ----------
// obstacles far behind (or past the finish) sink and fade, then leave the list; returns the rest
function retireObstacles(list, dtReal) {
  const river = G.river, kz = kayak.p[2], active = [];
  for (const ob of list) {
    if (!ob.sinking && (ob.z < kz - OBSTACLES.despawnBehind || ob.z > river.finishZ + 15)) {
      ob.sinking = true; ob.sinkT = 0; ob.y0 = ob.y;
    }
    if (!ob.sinking) { active.push(ob); continue; }
    ob.sinkT += dtReal;
    const s = clamp(ob.sinkT / OBSTACLES.sinkTime, 0, 1);
    ob.alpha = 1 - s;
    ob.y = ob.y0 - OBSTACLES.sinkDepth * s * s;
    ob.fx = 0; ob.fz = 0; ob.tq = 0;
  }
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].sinking && list[i].sinkT >= OBSTACLES.sinkTime) list.splice(i, 1);
  }
  return active;
}

function simulateActive(active, dtReal) {
  const steps = OBSTACLES.substeps, dt = dtReal / steps;
  for (let s = 0; s < steps; s++) {
    for (const ob of active) if (isLive(ob)) stepObstacle(ob, dt);
    for (let a = 0; a < active.length; a++) {
      for (let b = a + 1; b < active.length; b++) {
        const A = active[a], B = active[b];
        if (!isLive(A) || !isLive(B)) continue;
        const reach = (A.len + B.len) / 2 + A.rad + B.rad;
        if (Math.abs(A.z - B.z) > reach || Math.abs(A.x - B.x) > reach) continue;
        contactSegs(A, B, dt);
        contactSegs(B, A, dt);
      }
    }
  }
}

// ease each obstacle's height toward the water surface (or the ground, for boulders)
function settleHeights(active, dtReal) {
  const ky = 1 - Math.exp(-dtReal * OBSTACLES.ySmooth);
  for (const ob of active) {
    ob.fx = 0; ob.fz = 0; ob.tq = 0;
    if (ob.kind === 'boulder' && ob.settled) continue;
    const target = ob.kind === 'boulder'
      ? terrainH(ob.x, ob.z) + ob.vrad
      : surfaceAt(ob.x, ob.z) + (ob.grounded ? 0 : OBSTACLES.bob * Math.sin(G.simTime * OBSTACLES.bobSpeed + ob.bobPh));
    ob.y += (target - ob.y) * ky;
  }
}

export function updateObstacles(dtReal) {
  spawnObstacles();
  const list = G.river.obstacles;
  if (!list.length) return;
  triggerLandslides();
  replayLandslides(list, dtReal);
  const active = retireObstacles(list, dtReal);
  simulateActive(active, dtReal);
  settleHeights(active, dtReal);
  // broad phase for the kayak contact test, consumed by kayak.step next frame
  G.river.obstNear = active.filter(ob => ob.hitK > 0 &&
    Math.hypot(ob.x - kayak.p[0], ob.z - kayak.p[2]) < ob.len / 2 + ob.rad + 4);
}

// upload the instances inside the view window, grouped per mesh; river.obstDraw lists what to draw
export function writeObstacleInstances() {
  const river = G.river, zk = kayak.p[2];
  const zLo = zk - RENDER.viewBehind - 4, zHi = zk + RENDER.viewAhead + 4;
  const groups = {};
  for (const ob of river.obstacles || []) {
    if (ob.z < zLo || ob.z > zHi) continue;
    (groups[ob.mesh] || (groups[ob.mesh] = [])).push(ob);
  }
  river.obstDraw = [];
  for (const [name, list] of Object.entries(groups)) {
    const data = new Float32Array(list.length * 20);
    list.forEach((ob, n) => {
      const q = qMul(qAxisAngle([0, 1, 0], ob.yaw), qAxisAngle([0, 0, 1], ob.roll));
      data.set(mat4Compose([ob.x, ob.y, ob.z], q, [ob.sc, ob.sc, ob.sc]), n * 20);
      data.set([ob.tint[0], ob.tint[1], ob.tint[2], ob.alpha], n * 20 + 16);
    });
    gpu.write(obstInstBufs[name], 0, data);
    river.obstDraw.push({ name, count: list.length });
  }
}