import { GRID, SIM, PUTIN } from './config.js';
import { mulberry32, vnoise2, fbm2, clamp, smoothstep } from './math.js';

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
  const centerAt = z => Wd / 2 + smoothstep(PUTIN, PUTIN + 80, z) * (mdev(z) - dev0);
  // an optional calm, wide, current-free "pond" partway down the river — same treatment as the
  // put-in pool (see `calm` below), just centred elsewhere. R.pond = { z, len } in world metres.
  const pond0 = R.pond ? R.pond.z - R.pond.len / 2 : 0, pond1 = R.pond ? R.pond.z + R.pond.len / 2 : 0;
  const channelsAt = z => {
    const calmPutin = 1 - smoothstep(PUTIN * 0.35, PUTIN, z);      // 1 in the pool → 0 in the rapid
    const calmPond = R.pond ? smoothstep(pond0 - 15, pond0, z) * (1 - smoothstep(pond1, pond1 + 15, z)) : 0;
    const calm = Math.max(calmPutin, calmPond);
    const c = centerAt(z);
    let hw = R.halfW * (1 + R.widthVar * (vnoise2(z * 0.012, 3.7, seed) * 2 - 1));
    for (const k of constr) hw *= 1 - k.s * Math.exp(-(((z - k.z) / 18) ** 2));
    for (const wf of waterfalls) if (wf.branch == null) hw *= 1 - (wf.pinch ?? clamp(wf.drop / 14, 0, 0.3)) * Math.exp(-(((z - wf.z) / ((wf.len ?? 5) * 1.4)) ** 2));
    // the put-in pool only ever needs to read as "calm", but a pond is a real destination and
    // should be unmistakably a pond, not a wide spot in the river — so it gets its own, much
    // bigger width multiplier on top of the put-in pool's, independently configurable per river
    // (R.pond.widthMult, default 4x) rather than sharing the pool's 2x.
    hw = Math.max(hw, 2.5) * (1 + 1.0 * calmPutin + ((R.pond && R.pond.widthMult) ?? 4.0) * calmPond);
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
        const bc = clamp(base.c + off, bhw + 2, Wd - bhw - 2);
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
  return { R, rows, b, mask, state, kArr, centerAt, inEta: rows[0][0].eta, inVelScale, Q, finishZ, seed };
}