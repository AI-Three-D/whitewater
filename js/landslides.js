// Landslide boulders: a trajectory is baked once at placement (deterministic per spot) and
// replayed when the paddler comes within trigger distance; on arrival in the water it splashes
// the sim and is carved into the bed so the river flows around it for the rest of the run.
import { LANDSLIDE } from './config.js';
import { clamp, mulberry32 } from './math.js';
import { S } from './state.js';
import { gpu, ensureInstBuf } from './gpu.js';
import { terrainH, terrainN, waterAt, rowOf } from './sampling.js';
import { kayak } from './kayak.js';
import { spawnBurst } from './effects.js';
import { W, L, dx } from './quality.js';

const TWO_PI = 2 * Math.PI;
// trajectory rows: t, x, y, z, yaw, roll, speed — speed is carried so the splash at the water
// crossing can scale with how fast the boulder actually got there
const STRIDE = 7;

function bakeBoulderTrajectory(x0, z0, vrad, seed, downBias) {
  const rng = mulberry32(seed), fdt = LANDSLIDE.bakeDt;
  const rows = [[0, x0, terrainH(x0, z0) + vrad, z0, rng() * TWO_PI, 0, 0]];
  let x = x0, z = z0, vx = 0, vz = 0, roll = 0, settleT = 0, endedWet = false;
  for (let i = 1; i <= LANDSLIDE.bakeMaxSteps; i++) {
    const n = terrainN(x, z), slope = Math.hypot(n[0], n[2]);
    const dirx = slope > 1e-4 ? n[0] / slope : 0, dirz = slope > 1e-4 ? n[2] / slope : 0;
    const wob = (rng() - 0.5) * LANDSLIDE.rollWobble;   // perpendicular to the downhill direction
    const ax = dirx * LANDSLIDE.rollAccel * slope - dirz * wob;
    const az = dirz * LANDSLIDE.rollAccel * slope + dirx * wob + downBias;
    const fric = LANDSLIDE.rollFric * (0.6 + 0.4 * slope);   // less friction the steeper it is
    vx += (ax - fric * vx) * fdt;
    vz += (az - fric * vz) * fdt;
    const sp = Math.hypot(vx, vz);
    if (sp > LANDSLIDE.rollVmax) {
      vx *= LANDSLIDE.rollVmax / sp;
      vz *= LANDSLIDE.rollVmax / sp;
    }
    x += vx * fdt;
    z += vz * fdt;
    const speed = Math.hypot(vx, vz);
    roll += (speed / Math.max(vrad, 0.2)) * fdt;
    const yaw = (vx || vz) ? Math.atan2(vx, vz) : rows[rows.length - 1][4];
    rows.push([i * fdt, x, terrainH(x, z) + vrad, z, yaw, roll, speed]);
    if (waterAt(x, z).h > LANDSLIDE.deepWater) {
      endedWet = true;
      break;
    }
    if (speed < LANDSLIDE.settleSpeed) {
      settleT += fdt;
      if (settleT > LANDSLIDE.settleTime) break;
    } else {
      settleT = 0;
    }
  }
  const traj = new Float32Array(rows.length * STRIDE);
  rows.forEach((r, i) => traj.set(r, i * STRIDE));
  return { traj, dur: rows[rows.length - 1][0], endedWet };
}

export function placeLandslides() {
  const river = S.river, zone = river.R.landslideZone;
  if (!zone) return;
  for (const spec of [LANDSLIDE.medium, LANDSLIDE.large]) {
    for (const name of spec.meshes) ensureInstBuf(gpu.obstInstBufs, name, zone.count);
  }
  const span = (zone.to - zone.from) / zone.count;
  for (let spotIdx = 0; spotIdx < zone.count; spotIdx++) {
    if (Math.random() >= zone.activeChance) continue;   // not live this attempt — never placed at all
    const z = clamp(zone.from + (spotIdx + 0.15 + 0.7 * Math.random()) * span, zone.from, zone.to);
    const side = Math.random() < 0.5 ? -1 : 1;
    const chan = river.rows[rowOf(z)][0];   // landslide zones are kept clear of forks, so [0] is right
    const spec = Math.random() < 0.5 ? LANDSLIDE.medium : LANDSLIDE.large;
    const cls = spec === LANDSLIDE.large ? 'large' : 'medium';
    const mesh = spec.meshes[Math.floor(Math.random() * spec.meshes.length)], V = gpu.obstMeshes[mesh];
    const len = spec.len[0] + Math.random() * (spec.len[1] - spec.len[0]), sc = len / V.len;
    const off = chan.hw + LANDSLIDE.bankOffset[0] + Math.random() * (LANDSLIDE.bankOffset[1] - LANDSLIDE.bankOffset[0]);
    const x = clamp(chan.c + side * off, 1, W * dx - 1);
    const g = 0.85 + 0.25 * Math.random(), vrad = V.vrad * sc;
    const downBias = Math.random() * LANDSLIDE.downstreamBias;
    const { traj, dur, endedWet } = bakeBoulderTrajectory(x, z, vrad, river.seed + 800 + spotIdx, downBias);
    // timed against this boulder's own fall duration by default (see LANDSLIDE.assumedSpeed) so
    // it can be watched coming down rather than always finishing before the player gets there;
    // nearChance skips that for a close-range surprise instead
    const triggerDist = Math.random() < LANDSLIDE.nearChance
      ? LANDSLIDE.nearTriggerZ
      : clamp(LANDSLIDE.assumedSpeed * (dur + LANDSLIDE.leadTime), LANDSLIDE.minTriggerZ, LANDSLIDE.maxTriggerZ);
    river.obstacles.push({
      kind: 'boulder', cls, mesh, len, rad: V.rad * sc, sc, vrad,
      draft: V.draft * sc, mass: Math.max(20, spec.density * V.vol * sc * sc * sc),
      samples: spec.samples, hitK: spec.hitK, lift: spec.lift,
      x, z, y: terrainH(x, z) + vrad, yaw: Math.random() * TWO_PI, roll: 0,
      vx: 0, vz: 0, w: 0, bobPh: Math.random() * TWO_PI,
      fx: 0, fz: 0, tq: 0, grounded: true, sinking: false, sinkT: 0, y0: 0, alpha: 1,
      tint: [g, g, g, 1],
      dormant: true, triggerRolled: false, splashed: false, settled: false, triggerDist, dustT: 0,
      traj, trajDur: dur, trajEndedWet: endedWet, replaying: false, replayT: 0,
    });
  }
}

export function triggerLandslides() {
  if (!S.river.R.landslideZone) return;
  const kz = kayak.p[2];
  for (const ob of S.river.obstacles) {
    if (ob.kind !== 'boulder' || !ob.dormant || ob.triggerRolled) continue;
    if (ob.z - kz > ob.triggerDist) continue;
    ob.triggerRolled = true;
    ob.dormant = false;
    ob.replaying = true;
    ob.replayT = 0;
  }
}

// interpolated trajectory row at ob.replayT → function k => value of column k
function trajectorySampler(ob) {
  const traj = ob.traj, n = traj.length / STRIDE;
  const tEnd = traj[(n - 1) * STRIDE];
  const fi = Math.min(ob.replayT, tEnd) / LANDSLIDE.bakeDt;
  const i0 = clamp(Math.floor(fi), 0, n - 1), i1 = Math.min(i0 + 1, n - 1), ft = fi - i0;
  const at = k => traj[i0 * STRIDE + k] + (traj[i1 * STRIDE + k] - traj[i0 * STRIDE + k]) * ft;
  return { at, tEnd };
}

// advance every rolling boulder along its baked path; splash/dust effects and final settling
export function replayLandslides(dtReal) {
  for (const ob of S.river.obstacles) {
    if (!ob.replaying) continue;
    ob.replayT += dtReal;
    const { at, tEnd } = trajectorySampler(ob);
    ob.x = at(1);
    ob.y = at(2);
    ob.z = at(3);
    ob.yaw = at(4);
    ob.roll = at(5);
    const wh = waterAt(ob.x, ob.z).h;
    if (!ob.splashed && wh > 0.12) {
      ob.splashed = true;
      injectSplash(ob.x, ob.z, at(6));
      spawnBurst(ob.x, ob.y + ob.vrad * 0.5, ob.z, LANDSLIDE.splashCol);   // reuses the pickup burst's count/life
    } else if (wh <= 0.05) {
      // brief dust while it's still rolling on dry ground — throttled, not every frame
      ob.dustT -= dtReal;
      if (ob.dustT <= 0) {
        ob.dustT = LANDSLIDE.dustInterval;
        spawnBurst(ob.x, ob.y, ob.z, LANDSLIDE.dustCol);
      }
    }
    if (ob.replayT >= tEnd) {
      ob.replaying = false;
      ob.settled = true;   // frozen for good from here
      const emergeTop = waterAt(ob.x, ob.z).eta + 0.35;
      carveBoulderIntoBed(ob.x, ob.z, ob.rad, Math.min(emergeTop, ob.y + ob.vrad));
    }
  }
}

// a radial bump in water height with outward velocity, written straight into the live state
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
      const bump = height * (1 - d / R);
      const outward = d > 0.01 ? bump * 1.6 / Math.max(d, 0.01) : 0;
      cell[0] = w.h + bump;
      cell[1] = w.u + outward * di * dx;
      cell[2] = w.v + outward * dj * dx;
      cell[3] = w.h > 0.05 ? 1 : 0;
      gpu.device.queue.writeBuffer(gpu.stateBufs[0], (j * W + i) * 16, cell);
    }
  }
}

// raise the bed under a settled boulder (a smooth dome up to topY) in both CPU and GPU copies
function carveBoulderIntoBed(x, z, rad, topY) {
  const b = S.river.b;
  const local = terrainH(x, z), top = Math.max(topY, local + 0.1);
  const i0 = clamp(Math.floor((x - rad) / dx), 0, W - 1), i1 = clamp(Math.ceil((x + rad) / dx), 0, W - 1);
  const j0 = clamp(Math.floor((z - rad) / dx), 0, L - 1), j1 = clamp(Math.ceil((z + rad) / dx), 0, L - 1);
  for (let jj = j0; jj <= j1; jj++) {
    const row = new Float32Array(i1 - i0 + 1);
    for (let ii = i0; ii <= i1; ii++) {
      const idx = jj * W + ii;
      const dist = Math.hypot((ii + 0.5) * dx - x, (jj + 0.5) * dx - z);
      if (dist < rad) b[idx] = Math.max(b[idx], top - (top - local) * Math.pow(dist / rad, 6));
      row[ii - i0] = b[idx];
    }
    gpu.device.queue.writeBuffer(gpu.terrainBuf, (jj * W + i0) * 4, row);
  }
}