import { GRID, SIM, PUTIN, RIVER_SIDE_MARGIN, LAND_BRIDGE } from './config.js';
import { mulberry32, vnoise2, fbm2, clamp, smoothstep, softClamp } from './math.js';

function thermalErode(b, mask, W, L, iters, talus, rate) {
  // classic thermal erosion: material above the talus angle slides to lower neighbours.
  const d = new Float32Array(b.length);
  const nbo = [-1, 1, -W, W];
  for (let it = 0; it < iters; it++) {
    d.fill(0);
    for (let j = 1; j < L - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        const c = j * W + i;
        if (mask[c] > 0.15) continue;              // leave the channel and its banks alone
        const hc = b[c];
        let total = 0;
        let d0 = 0, d1 = 0, d2 = 0, d3 = 0;
        let df = hc - b[c + nbo[0]] - talus; if (df > 0) { d0 = df; total += df; }
        df = hc - b[c + nbo[1]] - talus; if (df > 0) { d1 = df; total += df; }
        df = hc - b[c + nbo[2]] - talus; if (df > 0) { d2 = df; total += df; }
        df = hc - b[c + nbo[3]] - talus; if (df > 0) { d3 = df; total += df; }
        if (total <= 0) continue;
        const amt = rate * 0.25 * total;
        d[c] -= amt;
        if (d0 > 0) d[c + nbo[0]] += amt * d0 / total;
        if (d1 > 0) d[c + nbo[1]] += amt * d1 / total;
        if (d2 > 0) d[c + nbo[2]] += amt * d2 / total;
        if (d3 > 0) d[c + nbo[3]] += amt * d3 / total;
      }
    }
    for (let n = 0; n < b.length; n++) b[n] += d[n];
  }
}

// pick, among an array of channel descriptors active at some z, the one whose bank a given
// x is nearest to — used wherever code needs "the" channel at a point during a fork.
export function nearestChan(chans, x) {
  let best = chans[0], bestAd = Math.abs((x - chans[0].c) / chans[0].hw);
  for (let k = 1; k < chans.length; k++) {
    const ad = Math.abs((x - chans[k].c) / chans[k].hw);
    if (ad < bestAd) { bestAd = ad; best = chans[k]; }
  }
  return best;
}
// Startup validation of a river's land-bridge config (see LAND_BRIDGE in config.js). Throws with a
// message naming the river and field, so a bad level definition is caught on load, not mid-run.
export function validateRiverConfig(R) {
  const bridges = R.landBridges;
  if (bridges == null) return;
  if (!Array.isArray(bridges)) throw new Error(`River "${R.name}": landBridges must be an array`);
  if (!bridges.length) return;
  if (R.obstacles) throw new Error(`River "${R.name}": landBridges cannot be combined with floating obstacles (R.obstacles) — drifting logs and ice would jam the passages under the bridge. Remove one of the two.`);
  const Lw = GRID.L * GRID.dx, finishZ = Math.min(R.len ?? (Lw - 25), Lw - 25);
  bridges.forEach((cfg, k) => {
    const tag = `River "${R.name}": landBridges[${k}]`;
    const num = (key, lo, hi) => {
      const v = cfg[key] ?? LAND_BRIDGE[key];
      if (typeof v !== 'number' || !(v >= lo && v <= hi)) throw new Error(`${tag}: ${key} must be a number in [${lo}, ${hi}] (got ${v})`);
      return v;
    };
    const z = num('z', PUTIN + 25, finishZ - 10);
    const width = num('width', 1.5, 40);
    num('widthVar', 0, 1); num('height', LAND_BRIDGE.minHeight, 30); num('thickness', 0.4, 8);
    num('rise', 0, 5); num('roughness', 0, 2.5); num('wander', 0, 3); num('flare', 0, 2);
    const pillars = cfg.pillars ?? LAND_BRIDGE.pillars;
    if (!Number.isInteger(pillars) || pillars < 0 || pillars > LAND_BRIDGE.maxPillars)
      throw new Error(`${tag}: pillars must be an integer from 0 to ${LAND_BRIDGE.maxPillars} (got ${pillars})`);
    for (const fk of R.forks || []) if (z > fk.startZ - (fk.splitLen ?? 25) - 10 && z < fk.mergeZ + (fk.mergeLen ?? 25) + 10)
      throw new Error(`${tag}: z=${z} overlaps a fork (${fk.startZ}–${fk.mergeZ} m) — a land bridge needs a single channel`);
    if (R.pond && Math.abs(z - R.pond.z) < R.pond.len / 2 + 20) throw new Error(`${tag}: z=${z} is too close to the pond at ${R.pond.z} m`);
    for (const wf of R.waterfalls || []) if (Math.abs(z - wf.z) < 15) throw new Error(`${tag}: z=${z} is too close to the waterfall at ${wf.z} m`);
    bridges.forEach((o, k2) => {
      if (k2 > k && Math.abs((o.z ?? 0) - z) < width / 2 + (o.width ?? LAND_BRIDGE.width) / 2 + 14)
        throw new Error(`${tag} and landBridges[${k2}] overlap — keep their z at least ${(width / 2 + (o.width ?? LAND_BRIDGE.width) / 2 + 14).toFixed(0)} m apart`);
    });
  });
}

export function generateRiver(R) {
  const { W, L, dx } = GRID, N = W * L, Lw = L * dx, Wd = W * dx;
  // the playable length (put-in to take-out) varies per river now instead of always using the
  // whole grid — clamp defensively in case a river's `len` were ever set longer than the grid.
  const finishZ = Math.min(R.len ?? (Lw - 25), Lw - 25);
  const rng = mulberry32(R.seed);
  const meander = R.meander.map(([A, lam]) => [A, lam, rng() * 6.2832]);
  // constrictions and (further down) boulders are scoped to finishZ, not the full grid — otherwise
  // a short river would end up sparser than a long one, with most of its obstacles landing past
  // the take-out where the player never sees them
  const constrLo = 50, constrHi = Math.max(constrLo + 20, finishZ - 30);
  const constr = [];
  for (let k = 0; k < R.constrictions; k++) constr.push({ z: constrLo + rng() * (constrHi - constrLo), s: 0.3 + 0.3 * rng() });
  const forks = R.forks || [], waterfalls = R.waterfalls || [];
  const seed = R.seed;
  const mdev = z => { let s = 0; for (const [A, lam, ph] of meander) s += A * Math.sin(6.2832 * z / lam + ph); return s; };
  const dev0 = mdev(0);
  // an optional calm, wide, current-free "pond" partway down the river — same treatment as the
  // put-in pool (see `calm` below), just centred elsewhere. R.pond = { z, len } in world metres.
  const pond0 = R.pond ? R.pond.z - R.pond.len / 2 : 0, pond1 = R.pond ? R.pond.z + R.pond.len / 2 : 0;
  // the channel's half-width at a given z — pulled out so centerAt (below) can size its side margin
  // off the *actual* local width instead of a single worst-case number for the whole river. A static
  // per-river estimate that assumed the put-in pool's widening and the pond's could both be maxed
  // out at once was wildly pessimistic for a river whose pond sits well past the put-in (they never
  // actually overlap), enough that the "safe" center band could collapse to nothing and flatten the
  // whole river's meander — not just the one wide spot that actually needed reining in.
  const hwAt = z => {
    const calmPutin = 1 - smoothstep(PUTIN * 0.35, PUTIN, z);
    const calmPond = R.pond ? smoothstep(pond0 - 15, pond0, z) * (1 - smoothstep(pond1, pond1 + 15, z)) : 0;
    let hw = R.halfW * (1 + R.widthVar * (vnoise2(z * 0.012, 3.7, seed) * 2 - 1));
    for (const k of constr) hw *= 1 - k.s * Math.exp(-(((z - k.z) / 18) ** 2));
    for (const wf of waterfalls) if (wf.branch == null) hw *= 1 - (wf.pinch ?? clamp(wf.drop / 14, 0, 0.3)) * Math.exp(-(((z - wf.z) / ((wf.len ?? 5) * 1.4)) ** 2));
    // the put-in pool only ever needs to read as "calm", but a pond is a real destination and
    // should be unmistakably a pond, not a wide spot in the river — so it gets its own, much
    // bigger width multiplier on top of the put-in pool's, independently configurable per river
    // (R.pond.widthMult, default 4x) rather than sharing the pool's 2x.
    return Math.max(hw, 2.5) * (1 + 1.0 * calmPutin + ((R.pond && R.pond.widthMult) ?? 4.0) * calmPond);
  };
  // the raw meander, eased toward the centerline as it nears a world edge (softClamp — see math.js)
  // instead of being flattened against one by a hard clamp; only x is bounded, so the put-in/take-out
  // ends are untouched. The margin is sized off this z's own width, so a narrow stretch keeps its
  // full natural meander while only a genuinely wide one (a pond, say) gets pulled in.
  const centerAt = z => {
    const hw = hwAt(z), lo = hw + RIVER_SIDE_MARGIN, hi = Wd - hw - RIVER_SIDE_MARGIN;
    return softClamp(Wd / 2 + smoothstep(PUTIN, PUTIN + 80, z) * (mdev(z) - dev0), lo, hi);
  };
  const channelsAt = z => {
    const calmPutin = 1 - smoothstep(PUTIN * 0.35, PUTIN, z);      // 1 in the pool → 0 in the rapid
    const calmPond = R.pond ? smoothstep(pond0 - 15, pond0, z) * (1 - smoothstep(pond1, pond1 + 15, z)) : 0;
    const calm = Math.max(calmPutin, calmPond);
    const c = centerAt(z);
    const hw = hwAt(z);
    // the pond flattens the bed's downhill slope through its span, then resumes it afterward from
    // the same elevation as if the pond's length had simply been skipped — no slope discontinuity
    const zEff = R.pond ? z - clamp(z - pond0, 0, pond1 - pond0) : z;
    let T = -R.slope * Math.max(0, zEff - PUTIN * 0.4)         // flat bed for the first 12 m
          + 0.12 * (vnoise2(z * 0.05, 9.1, seed + 1) * 2 - 1) * (1 - calm);
    for (const [zl, d] of R.ledges) T -= d * smoothstep(zl - 2, zl + 2, z);
    for (const wf of waterfalls) if (wf.branch == null) T -= wf.drop * smoothstep(wf.z - (wf.len ?? 5) / 2, wf.z + (wf.len ?? 5) / 2, z);
    const D = R.depth * (1 + 0.25 * (vnoise2(z * 0.03, 5.5, seed + 2) * 2 - 1))
            * clamp(Math.pow(R.halfW / hw, 0.4), 0.7, 1.8) * (1 + 0.8 * calm);   // and deeper
    const curv = (centerAt(z + 2) - 2 * c + centerAt(z - 2)) / 4;
    const d0 = -clamp(8 * curv, -0.35, 0.35);
    const base = { c, hw, T, D, d0, eta: T + SIM.waterFrac * D, side: 0, t: 0 };
    for (const fk of forks) {
      const splitLen = fk.splitLen ?? 25, mergeLen = fk.mergeLen ?? 25;
      const t = Math.min(smoothstep(fk.startZ - splitLen, fk.startZ, z), 1 - smoothstep(fk.mergeZ, fk.mergeZ + mergeLen, z));
      if (t <= 0.001) continue;
      const shares = fk.shares || [0.5, 0.5], shareSum = shares[0] + shares[1];
      const sh = [shares[0] / shareSum, shares[1] / shareSum];
      const separation = fk.separation ?? 20, widthScale = fk.widthScale ?? 0.72;
      const islandH = fk.islandHeight ?? Math.min(R.valleyH * 0.35, 7);
      const islandScale = fk.islandScale ?? Math.min(R.valleyScale, 30);
      const branches = [0, 1].map(kk => {
        const side = kk === 0 ? -1 : 1;
        const off = t * (separation / 2) * side + t * (separation * 0.12) * (vnoise2(z * 0.015, seed + 40 + kk) * 2 - 1);
        const hwFull = base.hw * widthScale * sh[kk] * 2;
        let bhw = base.hw + t * (hwFull - base.hw);
        let bT = base.T;
        for (const wf of waterfalls) if (wf.branch === kk) {
          bT -= wf.drop * smoothstep(wf.z - (wf.len ?? 5) / 2, wf.z + (wf.len ?? 5) / 2, z);
          bhw *= 1 - (wf.pinch ?? clamp(wf.drop / 14, 0, 0.3)) * Math.exp(-(((z - wf.z) / ((wf.len ?? 5) * 1.4)) ** 2));
        }
        bhw = Math.max(bhw, 2);
        const bD = Math.max(base.D + t * base.D * (sh[kk] - 0.5) * 0.6, 0.4);
        // softClamp, not clamp: eases the branch back toward its sibling as it nears the world
        // edge instead of snapping flat against it (see centerAt above for the same treatment).
        const bc = softClamp(base.c + off, bhw + RIVER_SIDE_MARGIN, Wd - bhw - RIVER_SIDE_MARGIN);
        return { c: bc, hw: bhw, T: bT, D: bD, d0: base.d0, eta: bT + SIM.waterFrac * bD, side, islandH, islandScale, t };
      });
      // each branch needs the sibling's centre so "island" shaping is bounded to the actual
      // gap between the two channels — without this it would wrongly keep using the low
      // island height all the way out past the sibling, into that sibling's own outer valley.
      branches[0].otherC = branches[1].c; branches[1].otherC = branches[0].c;
      return branches;
    }
    return [base];
  };
  const rows = new Array(L);
  for (let j = 0; j < L; j++) rows[j] = channelsAt((j + 0.5) * dx);
  const bedBase = (x, z, chan) => {
    const d = (x - chan.c) / chan.hw, ad = Math.abs(d);
    if (ad < 1) {
      const de = d < chan.d0 ? (d - chan.d0) / (1 + chan.d0) : (d - chan.d0) / (1 - chan.d0);
      let h = chan.T + chan.D * (1 - Math.pow(Math.max(0, 1 - de * de), 1.5))
            + 0.08 * (vnoise2(x * 1.1, z * 1.1, seed + 5) * 2 - 1) * (1 - ad ** 4);
      if (R.lanes && R.lanes.count > 1) {
        const Ln = R.lanes, wander = (Ln.wander ?? 2) / chan.hw;
        const dEff = d + wander * (vnoise2(z * 0.02, seed + (Ln.seedOffset ?? 21)) * 2 - 1);
        h += (Ln.amp ?? 0.15) * Math.sin(Ln.count * Math.PI * dEff) * (1 - ad * ad);
      }
      return h;
    }
    const m = (ad - 1) * chan.hw;                              // metres beyond the bank edge
    const bank = 1.8 * (1 - Math.exp(-m / 2.5)) + 0.06 * m;   // steep little bank at the water
    // "island" shaping only inside the actual gap between this branch and its sibling — past
    // the sibling's own centre you're in that sibling's outer valley, not the divider anymore.
    const useIsland = chan.side !== 0 && Math.sign(d) === -chan.side
      && x > Math.min(chan.c, chan.otherC) && x < Math.max(chan.c, chan.otherC);
    const vH = useIsland ? R.valleyH + chan.t * (chan.islandH - R.valleyH) : R.valleyH;
    const vS = useIsland ? R.valleyScale + chan.t * (chan.islandScale - R.valleyScale) : R.valleyScale;
    const valley = vH * (1 - Math.exp(-m / vS));   // asymptotic hills, no parabola
    const wx = x + 14 * (fbm2(x * 0.006, z * 0.006, 2, seed + 11) - 0.5);    // domain warp → ridges
    const wz = z + 14 * (fbm2(x * 0.006 + 5, z * 0.006 + 5, 2, seed + 12) - 0.5);

    const relief = (fbm2(wx * 0.011, wz * 0.011, 5, seed + 3) - 0.5) * Math.min(vH, 14) * 0.8 * smoothstep(0, 25, m)
                 + (fbm2(x * 0.05, z * 0.05, 3, seed + 4) - 0.5) * 1.4 * smoothstep(0, 5, m);
    return chan.T + chan.D + bank + valley + relief;
  };
  const bedHeight = (x, z, chans) => { let m = Infinity; for (const chan of chans) m = Math.min(m, bedBase(x, z, chan)); return m; };
  const channelMask = (x, chans) => { let m = 0; for (const chan of chans) m = Math.max(m, 1 - smoothstep(1.0, 1.3, Math.abs((x - chan.c) / chan.hw))); return m; };
  const b = new Float32Array(N), mask = new Float32Array(N);
  for (let j = 0; j < L; j++) {
    const chans = rows[j], z = (j + 0.5) * dx;
    for (let i = 0; i < W; i++) {
      const x = (i + 0.5) * dx;
      b[j * W + i] = bedHeight(x, z, chans);
      mask[j * W + i] = channelMask(x, chans);
    }
  }
  thermalErode(b, mask, W, L, 10, 0.45, 0.6);   // talus 0.45 m per 0.5 m cell ≈ 42°
  // reference discharge of a normal reach (before boulders) and the matching inflow velocity scale
  const jref = Math.floor(Math.min(80, finishZ * 0.5) / dx);
  let Q = 0;
  for (let i = 0; i < W; i++) {
    const x = (i + 0.5) * dx, eta = nearestChan(rows[jref], x).eta;
    const h = Math.max(0, eta - b[jref * W + i]);
    if (h > 0.05) Q += Math.pow(h, 5 / 3) * Math.sqrt(R.slope) / R.manning * dx;
  }
  let sum53 = 0;
  for (let i = 0; i < W; i++) {
    const x = (i + 0.5) * dx, eta = nearestChan(rows[0], x).eta;
    const h = Math.max(0, eta - b[i]);
    if (h > 0.05) sum53 += Math.pow(h, 5 / 3) * dx;
  }
  const inVelScale = Q / Math.max(sum53, 1e-3);   // v_in(i) = inQ · inVelScale · h_i^(2/3)
  // boulders (start well below the put-in pool, scoped to the actual playable length)
  const rockLo = 45, rockHi = Math.max(rockLo + 20, finishZ - 30);
  for (let k = 0; k < R.rocks; k++) {
    const z = rockLo + rng() * (rockHi - rockLo);
    if (R.pond && z > pond0 - 5 && z < pond1 + 5) continue;   // keep the pond clear of boulders
    const j = clamp(Math.floor(z / dx), 0, L - 1), chans = rows[j];
    const chan = chans[chans.length > 1 && rng() < 0.5 ? 1 : 0];
    const x = chan.c + chan.hw * (rng() * 1.7 - 0.85);
    const r = R.rockR[0] + rng() * (R.rockR[1] - R.rockR[0]);
    const emergent = rng() < R.emergent;
    const local = bedHeight(x, z, chans);
    let top = emergent ? chan.eta + 0.25 + rng() * 0.7 : chan.eta - (0.1 + rng() * 0.4);
    top = Math.max(top, local + 0.25);
    const i0 = clamp(Math.floor((x - r) / dx), 0, W - 1), i1 = clamp(Math.ceil((x + r) / dx), 0, W - 1);
    const j0 = clamp(Math.floor((z - r) / dx), 0, L - 1), j1 = clamp(Math.ceil((z + r) / dx), 0, L - 1);
    for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
      const cx = (ii + 0.5) * dx, cz = (jj + 0.5) * dx, dist = Math.hypot(cx - x, cz - z);
      if (dist >= r) continue;
      const shape = Math.pow(dist / r, 1.6) * (0.85 + 0.4 * vnoise2(cx * 2, cz * 2, seed + 8));
      const rz = top - (top - local) * shape;
      if (rz > b[jj * W + ii]) b[jj * W + ii] = rz;
    }
  }
  for (const bi of R.boulderIslands || []) {
    const j = clamp(Math.floor(bi.z / dx), 0, L - 1), chan = rows[j][0];
    const rx = clamp(bi.widthFrac ?? 0.55, 0.2, 0.8) * chan.hw;
    const rz = (bi.len ?? 8) / 2;
    const maxOff = Math.max(0, chan.hw - rx - 0.5);
    const cx = chan.c + clamp(bi.bias ?? 0, -1, 1) * maxOff, cz = bi.z;
    const top = bi.top ?? chan.eta + 0.5;
    const i0 = clamp(Math.floor((cx - rx) / dx), 0, W - 1), i1 = clamp(Math.ceil((cx + rx) / dx), 0, W - 1);
    const j0 = clamp(Math.floor((cz - rz) / dx), 0, L - 1), j1 = clamp(Math.ceil((cz + rz) / dx), 0, L - 1);
    for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
      const px = (ii + 0.5) * dx, pz = (jj + 0.5) * dx;
      const dist = Math.hypot((px - cx) / rx, (pz - cz) / rz);
      if (dist >= 1) continue;
      const local = bedHeight(px, pz, rows[jj]);
      const shape = Math.pow(dist, 1.6) * (0.85 + 0.4 * vnoise2(px * 2, pz * 2, seed + 8));
      const rzv = top - (top - local) * shape;
      if (rzv > b[jj * W + ii]) b[jj * W + ii] = rzv;
    }
  }
    // ---------- natural land bridges (R.landBridges — see LAND_BRIDGE in config.js) ----------
  // Each bridge is a descriptor of *functions* (deck top/underside, centreline, width, pillar
  // radius profile) shared by the mesh builder (meshes.js), vegetation placement, pickups and the
  // kayak/rucksack collision code (main.js) — one definition, no two pieces of code disagreeing
  // about where the rock is. The terrain is touched here in two ways: pillar footprints are carved
  // into the bed above the water surface so the shallow-water sim flows round them, and each
  // abutment is reshaped into a plateau at deck level so the deck meets the bank flush.
  const bAt = (x, z) => {
    const gx = x / dx - 0.5, gz = z / dx - 0.5, x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0;
    const f = (i, jj) => b[clamp(jj, 0, L - 1) * W + clamp(i, 0, W - 1)];
    return (f(x0, z0) * (1 - fx) + f(x0 + 1, z0) * fx) * (1 - fz) + (f(x0, z0 + 1) * (1 - fx) + f(x0 + 1, z0 + 1) * fx) * fz;
  };
  // steep-walled plateau (pow 6, like main.js's carveBoulderIntoBed) — most of the footprint reads
  // as genuinely dry to the sim's `rock` term, not just a pinprick at the centre
  const carveFoot = (x, z, r, top) => {
    const local = bAt(x, z), t = Math.max(top, local + 0.1);
    const i0 = clamp(Math.floor((x - r) / dx), 0, W - 1), i1 = clamp(Math.ceil((x + r) / dx), 0, W - 1);
    const j0 = clamp(Math.floor((z - r) / dx), 0, L - 1), j1 = clamp(Math.ceil((z + r) / dx), 0, L - 1);
    for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
      const cx = (ii + 0.5) * dx, cz = (jj + 0.5) * dx, dist = Math.hypot(cx - x, cz - z);
      if (dist >= r) continue;
      const idx = jj * W + ii;
      b[idx] = Math.max(b[idx], t - (t - local) * Math.pow(dist / r, 6));
    }
  };
  // natural column: flared base, slight waist, flared capital where it meets the arch. fy = 0 at
  // the bed, 1 at the deck underside. Shared by the mesh and the collision radius at water level.
  const pillarR = (pl, fy) => pl.rMid * (1 + 0.55 * Math.pow(1 - fy, 3) + 0.3 * Math.pow(fy, 5) - 0.12 * Math.sin(Math.PI * fy));
  const bridges = [];
  (R.landBridges || []).forEach((cfg0, bk) => {
    const cfg = { ...LAND_BRIDGE, ...cfg0 };
    const bseed = seed + 700 + bk * 37 + (cfg.seed ?? 0);
    const brng = mulberry32(bseed);
    const zb = cfg.z, chan = rows[clamp(Math.floor(zb / dx), 0, L - 1)][0];
    const eta = chan.eta, xL = chan.c - chan.hw, xR = chan.c + chan.hw;
    const rough = cfg.roughness, thickMid = cfg.thickness, yDeck = eta + cfg.height + thickMid;
    // abutments: walk out from the water's edge until the bank is about level with the deck
    const findEnd = (x0, dir) => { let ext = cfg.minExt; while (ext < cfg.maxExt && bAt(x0 + dir * ext, zb) < yDeck - 0.3) ext += dx; return ext; };
    const xa = Math.max(2, xL - findEnd(xL, -1)), xb = Math.min(Wd - 2, xR + findEnd(xR, 1)), span = xb - xa;
    // s = 0 … 1 along the span (left abutment → right), u = -1 … 1 across the deck
    const hump = s => cfg.rise * Math.pow(Math.sin(Math.PI * s), 1.6);
    const zc = s => zb + cfg.wander * span * 0.04 * (vnoise2(s * 2.1 + 0.3, 2.5, bseed) * 2 - 1);
    const flare = s => 1 + cfg.flare * (Math.pow(1 - smoothstep(0, 0.3, s), 1.5) + Math.pow(smoothstep(0.7, 1, s), 1.5));
    const hwB = s => (cfg.width / 2) * Math.max(0.35, 1 + cfg.widthVar * (vnoise2(s * 3.3 + 5.2, 0.7, bseed + 1) * 2 - 1)) * flare(s)
                   * (1 + 0.07 * rough * (vnoise2(s * 13 + 1, 4.4, bseed + 9) * 2 - 1));      // craggy edge
    const detail = s => smoothstep(0, 0.12, s) * (1 - smoothstep(0.88, 1, s));                 // surface detail fades into the plateaus
    const topAt = (s, u, x, z) => yDeck + hump(s) - 0.08 * u * u
      + detail(s) * rough * (0.22 * (fbm2(x * 0.35, z * 0.35, 3, bseed + 2) - 0.5) * 2 + 0.06 * (vnoise2(x * 0.9, z * 0.9, bseed + 3) * 2 - 1));
    // arch: thin at mid-span, thickening toward the banks until the underside sinks below the
    // water level into the abutments — the classic natural-arch springing
    const thickEnd = thickMid + cfg.height + 1.5;
    const thick = s => thickMid + (thickEnd - thickMid) * Math.pow(Math.abs(2 * s - 1), 2.4);
    const bottomAt = s => yDeck + hump(s) - thick(s);
    const clearAt = s => bottomAt(s) - 0.05 - rough * (0.22 + 0.07 * thick(s));   // noise hangs this far below the nominal underside
    const at = (x, z) => {
      const s = (x - xa) / span; if (s < 0 || s > 1) return null;
      const u = (z - zc(s)) / hwB(s); if (Math.abs(u) > 1) return null;
      return { s, u, top: topAt(s, u, x, z), bottom: clearAt(s) };
    };
    // pillars, spread across the wet span with jitter, trimmed if the passages would get too tight
    const wet = xR - xL;
    let nP = cfg.pillars;
    while (nP > 0 && wet / (nP + 1) < 4.7) nP--;
    if (nP < cfg.pillars) console.warn(`River "${R.name}": land bridge at z=${zb} — channel only ${wet.toFixed(1)} m wide, pillars reduced from ${cfg.pillars} to ${nP} to keep the passages open`);
    const pillars = [], gap = wet / (nP + 1);
    for (let k = 0; k < nP; k++) {
      const frac = (k + 1) / (nP + 1) + (brng() - 0.5) * 0.45 / (nP + 1);
      const px = xL + frac * wet, s = (px - xa) / span;
      const pz = zc(s) + (brng() - 0.5) * 0.8 * hwB(s);
      const yBase = bAt(px, pz) - 0.4, yTop = bottomAt(s) + 0.6, h = yTop - yBase;   // sunk into the bed, poked into the arch
      const rMid = clamp(0.16 * h + 0.35, 0.5, Math.min(2.0, 0.17 * gap)) * (0.85 + 0.3 * brng());
      const lean = [(brng() - 0.5) * 0.1, (brng() - 0.5) * 0.1], ell = brng() * 0.25;   // slight lean; elongated along the flow
      const pl = { x: px, z: pz, yBase, yTop, h, rMid, ell, lean, twist: (brng() - 0.5) * 1.2, seed: bseed + 50 + k };
      const hW = clamp(eta - yBase, 0, h);
      pl.cx = px + lean[0] * hW; pl.cz = pz + lean[1] * hW;                          // centre at the water surface
      pl.rWater = pillarR(pl, hW / Math.max(h, 0.1)) * (1 + ell) * (1 + 0.18 * rough) + 0.1;   // collision radius at water level
      pillars.push(pl);
    }
    for (const pl of pillars) carveFoot(pl.cx, pl.cz, pl.rWater * 0.9, eta + 0.6);
    // abutment plateaus: terrain eased to deck level around each end — raised fully where it's
    // lower, cut only partly where a hill is higher (the deck then merges into the slope). Kept
    // off the channel via the bank distance m, so it never dams the river.
    for (const [xe, s] of [[xa, 0], [xb, 1]]) {
      const ze = zc(s), Rm = hwB(s) * 1.5 + 5;
      const i0 = clamp(Math.floor((xe - Rm) / dx), 0, W - 1), i1 = clamp(Math.ceil((xe + Rm) / dx), 0, W - 1);
      const j0 = clamp(Math.floor((ze - Rm) / dx), 0, L - 1), j1 = clamp(Math.ceil((ze + Rm) / dx), 0, L - 1);
      for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
        const cx = (ii + 0.5) * dx, cz = (jj + 0.5) * dx, d = Math.hypot(cx - xe, cz - ze);
        if (d >= Rm) continue;
        const ch = nearestChan(rows[jj], cx), m = (Math.abs((cx - ch.c) / ch.hw) - 1) * ch.hw;
        const w = (1 - smoothstep(0.45 * Rm, Rm, d)) * smoothstep(0.3, 2.5, m);
        if (w <= 0) continue;
        const idx = jj * W + ii, target = yDeck - 0.03 + 0.06 * (vnoise2(cx * 1.3, cz * 1.3, bseed + 4) - 0.5);
        const dh = target - b[idx];
        b[idx] += dh * w * (dh > 0 ? 1 : 0.7);
      }
    }
    const maxHw = (cfg.width / 2) * (1 + cfg.widthVar) * (1 + cfg.flare) * 1.07 + cfg.wander * span * 0.04;
    bridges.push({ cfg, z: zb, xa, xb, span, eta, yDeck, zc, hwB, topAt, bottomAt, thick, clearAt, at, pillars, pillarR, seed: bseed,
      reach: maxHw + 2.5, zMin: zb - maxHw - 1, zMax: zb + maxHw + 1 });
  });
  const state = new Float32Array(N * 4), kArr = new Float32Array(N);
  for (let j = 0; j < L; j++) {
    const chans = rows[j];
    for (let i = 0; i < W; i++) {
      const id = j * W + i, x = (i + 0.5) * dx, eta = nearestChan(chans, x).eta;
      let h = eta - b[id]; if (h < 0.05) h = 0;
      state[id * 4] = h;
      state[id * 4 + 2] = h > 0 ? Math.min(0.8 * Math.pow(h, 0.6667) * Math.sqrt(R.slope) / R.manning, 4) : 0;
    }
  }
  return { R, rows, b, mask, state, kArr, centerAt, inEta: rows[0][0].eta, inVelScale, Q, finishZ, seed, bridges };
}