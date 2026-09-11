import { GRID, SIM, PUTIN, RIVER_SIDE_MARGIN, LAND_BRIDGE, BUILT_BRIDGE, BRIDGE_MATERIALS } from './config/index.js';
import { mulberry32, vnoise2, fbm2, clamp, smoothstep, softClamp } from './math.js';

function thermalErode(b, mask, W, L, iters, talus, rate) {
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

// nearest channel descriptor to x among those active at this z (used during a fork)
export function nearestChan(chans, x) {
  let best = chans[0], bestAd = Math.abs((x - chans[0].c) / chans[0].hw);
  for (let k = 1; k < chans.length; k++) {
    const ad = Math.abs((x - chans[k].c) / chans[k].hw);
    if (ad < bestAd) { bestAd = ad; best = chans[k]; }
  }
  return best;
}
// validates a river's bridge config at load time (see LAND_BRIDGE / BUILT_BRIDGE in config.js)
export function validateRiverConfig(R) {
  const natArr = R.landBridges ?? [], builtArr = R.builtBridges ?? [];
  if (!Array.isArray(natArr) || !Array.isArray(builtArr)) throw new Error(`River "${R.name}": landBridges / builtBridges must be arrays`);
  if (!natArr.length && !builtArr.length) return;
  if (R.obstacles) throw new Error(`River "${R.name}": bridges (landBridges / builtBridges) cannot be combined with floating obstacles (R.obstacles) — drifting logs and ice would jam the passages under the bridge. Remove one of the two.`);
  const Lw = GRID.L * GRID.dx, finishZ = Math.min(R.len ?? (Lw - 25), Lw - 25);
  const num = (tag, cfg, defs, key, lo, hi, nullable) => {
    const v = cfg[key] ?? defs[key];
    if (nullable && v == null) return v;
    if (typeof v !== 'number' || !(v >= lo && v <= hi)) throw new Error(`${tag}: ${key} must be a number in [${lo}, ${hi}] (got ${v})`);
    return v;
  };
  const placement = (tag, z) => {
    if (!(typeof z === 'number' && z >= PUTIN + 25 && z <= finishZ - 10)) throw new Error(`${tag}: z must be a number in [${PUTIN + 25}, ${finishZ - 10}] (got ${z})`);
    for (const fk of R.forks || []) if (z > fk.startZ - (fk.splitLen ?? 25) - 10 && z < fk.mergeZ + (fk.mergeLen ?? 25) + 10)
      throw new Error(`${tag}: z=${z} overlaps a fork (${fk.startZ}–${fk.mergeZ} m) — a bridge needs a single channel`);
    if (R.pond && Math.abs(z - R.pond.z) < R.pond.len / 2 + 20) throw new Error(`${tag}: z=${z} is too close to the pond at ${R.pond.z} m`);
    for (const wf of R.waterfalls || []) if (Math.abs(z - wf.z) < 15) throw new Error(`${tag}: z=${z} is too close to the waterfall at ${wf.z} m`);
  };
  const extents = [];   // [z, half-extent, label] over both kinds, for the mutual spacing check
  natArr.forEach((cfg, k) => {
    const tag = `River "${R.name}": landBridges[${k}]`;
    placement(tag, cfg.z);
    const width = num(tag, cfg, LAND_BRIDGE, 'width', 1.5, 40);
    num(tag, cfg, LAND_BRIDGE, 'widthVar', 0, 1); num(tag, cfg, LAND_BRIDGE, 'height', LAND_BRIDGE.minHeight, 30);
    num(tag, cfg, LAND_BRIDGE, 'thickness', 0.4, 8); num(tag, cfg, LAND_BRIDGE, 'rise', 0, 5);
    num(tag, cfg, LAND_BRIDGE, 'roughness', 0, 2.5); num(tag, cfg, LAND_BRIDGE, 'wander', 0, 3);
    const flare = num(tag, cfg, LAND_BRIDGE, 'flare', 0, 2);
    const pillars = cfg.pillars ?? LAND_BRIDGE.pillars;
    if (Array.isArray(pillars)) {
      if (pillars.length > LAND_BRIDGE.maxPillars) throw new Error(`${tag}: at most ${LAND_BRIDGE.maxPillars} pillars (got ${pillars.length})`);
      pillars.forEach((p, i) => {
        const ptag = `${tag}.pillars[${i}]`, d = LAND_BRIDGE.pillar;
        num(ptag, p, d, 'along', -0.2, 1.2); num(ptag, p, d, 'across', -1.5, 1.5); num(ptag, p, d, 'radius', 0.2, 25, true);
        num(ptag, p, d, 'sizeAlong', 0.1, 12); num(ptag, p, d, 'sizeAcross', 0.1, 12); num(ptag, p, d, 'yaw', -360, 360);
        num(ptag, p, d, 'irregular', 0, 3); num(ptag, p, d, 'baseFlare', 0, 3); num(ptag, p, d, 'waist', 0, 0.7);
        num(ptag, p, d, 'flare', 0, 4); num(ptag, p, d, 'flareFrom', 0, 0.98); num(ptag, p, d, 'flareCurve', 0.3, 6);
      });
    } else if (!Number.isInteger(pillars) || pillars < 0 || pillars > LAND_BRIDGE.maxPillars)
      throw new Error(`${tag}: pillars must be an integer from 0 to ${LAND_BRIDGE.maxPillars}, or an array of pillar specs (got ${pillars})`);
    extents.push([cfg.z, width / 2 * (1 + flare) + 7, `landBridges[${k}]`]);
  });
  builtArr.forEach((cfg, k) => {
    const tag = `River "${R.name}": builtBridges[${k}]`;
    placement(tag, cfg.z);
    const mat = cfg.material ?? BUILT_BRIDGE.material;
    if (!BRIDGE_MATERIALS[mat]) throw new Error(`${tag}: material must be one of ${Object.keys(BRIDGE_MATERIALS).join(', ')} (got ${mat})`);
    const col = cfg.color ?? BUILT_BRIDGE.color;
    if (!Array.isArray(col) || col.length !== 3 || col.some(v => typeof v !== 'number' || v < 0 || v > 4))
      throw new Error(`${tag}: color must be an [r, g, b] array of numbers in [0, 4]`);
    const width = num(tag, cfg, BUILT_BRIDGE, 'width', 2, 40);
    num(tag, cfg, BUILT_BRIDGE, 'height', BUILT_BRIDGE.minHeight, 40);
    const thickness = num(tag, cfg, BUILT_BRIDGE, 'thickness', 0.2, 6);
    const slab = num(tag, cfg, BUILT_BRIDGE, 'slab', 0.1, 6);
    if (slab > thickness + 1e-6) throw new Error(`${tag}: slab (${slab}) cannot exceed thickness (${thickness})`);
    num(tag, cfg, BUILT_BRIDGE, 'rail', 0, 4); num(tag, cfg, BUILT_BRIDGE, 'railThick', 0.05, 2);
    const shoulder = num(tag, cfg, BUILT_BRIDGE, 'shoulder', 0.5, 30);
    num(tag, cfg, BUILT_BRIDGE, 'abutExt', 0, 30);
    const pylons = cfg.pylons ?? BUILT_BRIDGE.pylons;
    if (Array.isArray(pylons)) {
      if (pylons.length > BUILT_BRIDGE.maxPylons) throw new Error(`${tag}: at most ${BUILT_BRIDGE.maxPylons} pylons (got ${pylons.length})`);
      pylons.forEach((p, i) => {
        const ptag = `${tag}.pylons[${i}]`, d = BUILT_BRIDGE.pylon;
        num(ptag, p, d, 'along', -0.2, 1.2); num(ptag, p, d, 'across', -1.5, 1.5);
        num(ptag, p, d, 'sizeAlong', 0.2, 12); num(ptag, p, d, 'sizeAcross', 0.2, 20); num(ptag, p, d, 'yaw', -360, 360);
        num(ptag, p, d, 'taper', 0, 0.6); num(ptag, p, d, 'footing', 0, 2); num(ptag, p, d, 'cap', 0, 2);
      });
    } else if (!Number.isInteger(pylons) || pylons < 0 || pylons > BUILT_BRIDGE.maxPylons)
      throw new Error(`${tag}: pylons must be an integer from 0 to ${BUILT_BRIDGE.maxPylons}, or an array of pylon specs (got ${pylons})`);
    extents.push([cfg.z, width / 2 + shoulder + 6, `builtBridges[${k}]`]);
  });
  for (let a = 0; a < extents.length; a++) for (let c = a + 1; c < extents.length; c++) {
    const need = extents[a][1] + extents[c][1];
    if (Math.abs(extents[a][0] - extents[c][0]) < need)
      throw new Error(`River "${R.name}": ${extents[a][2]} and ${extents[c][2]} overlap — keep their z at least ${need.toFixed(0)} m apart`);
  }
}
// Channel centreline / width profile for R — extracted from generateRiver so the level editor can
// preview bank lines and the centreline for an edited config without a full rebuild. It consumes
// the first draws of R.seed's rng stream (meander phases, constriction placement); generateRiver
// keeps using the returned rng, so everything downstream (rock placement) stays bit-identical.
export function channelProfile(R) {
  const { W, L, dx } = GRID, Lw = L * dx, Wd = W * dx;
  const finishZ = Math.min(R.len ?? (Lw - 25), Lw - 25);
  const rng = mulberry32(R.seed);
  const meander = R.meander.map(([A, lam]) => [A, lam, rng() * 6.2832]);
  // constrictions/boulders are scoped to finishZ, not the full grid, so a short river isn't sparser than a long one
  const constrLo = 50, constrHi = Math.max(constrLo + 20, finishZ - 30);
  const constr = [];
  for (let k = 0; k < R.constrictions; k++) constr.push({ z: constrLo + rng() * (constrHi - constrLo), s: 0.3 + 0.3 * rng() });
  const waterfalls = R.waterfalls || [];
  const seed = R.seed;
  // width narrowing from nearby waterfalls must not compound — take the single hardest pinch, not the product (multiplying caused a jagged sawtooth bank)
  const pinchAt = (z, wfPool) => {
    let m = 0;
    for (const wf of wfPool) {
      const p = (wf.pinch ?? clamp(wf.drop / 14, 0, 0.3)) * Math.exp(-(((z - wf.z) / ((wf.len ?? 5) * 1.4)) ** 2));
      if (p > m) m = p;
    }
    return m;
  };
  const mdev = z => { let s = 0; for (const [A, lam, ph] of meander) s += A * Math.sin(6.2832 * z / lam + ph); return s; };
  const dev0 = mdev(0);
  // R.pond = { z, len } in world metres: an optional calm pond partway down the river
  const pond0 = R.pond ? R.pond.z - R.pond.len / 2 : 0, pond1 = R.pond ? R.pond.z + R.pond.len / 2 : 0;
  // must match bedBase's calmPond fade (same pondTail), or thermalErode carves washboard notches at the mismatched boundary
  const pondTail = R.pond?.exitTail ?? 15;
  // channel half-width at z, used by centerAt to size its margin off the actual local width
  const hwAt = z => {
    const calmPutin = 1 - smoothstep(PUTIN * 0.35, PUTIN, z);
    const calmPond = R.pond ? smoothstep(pond0 - 15, pond0, z) * (1 - smoothstep(pond1, pond1 + pondTail, z)) : 0;
    let hw = R.halfW * (1 + R.widthVar * (vnoise2(z * 0.012, 3.7, seed) * 2 - 1));
    for (const k of constr) hw *= 1 - k.s * Math.exp(-(((z - k.z) / 18) ** 2));
    hw *= 1 - pinchAt(z, waterfalls.filter(wf => wf.branch == null));
    // pond gets its own width multiplier (R.pond.widthMult, default 4x), separate from the put-in pool's 2x
    return Math.max(hw, 2.5) * (1 + 1.0 * calmPutin + ((R.pond && R.pond.widthMult) ?? 4.0) * calmPond);
  };
  const centerAt = z => {
    const hw = hwAt(z), lo = hw + RIVER_SIDE_MARGIN, hi = Wd - hw - RIVER_SIDE_MARGIN;
    return softClamp(Wd / 2 + smoothstep(PUTIN, PUTIN + 80, z) * (mdev(z) - dev0), lo, hi);
  };
  return { rng, finishZ, Wd, pinchAt, pond0, pond1, pondTail, hwAt, centerAt };
}

export function generateRiver(R) {
  const { W, L, dx } = GRID, N = W * L, Lw = L * dx, Wd = W * dx;
  const { rng, finishZ, pinchAt, pond0, pond1, pondTail, hwAt, centerAt } = channelProfile(R);
  const forks = R.forks || [], waterfalls = R.waterfalls || [], bands = R.bands || [];
  const seed = R.seed;
  // non-fatal generation notices (e.g. a land bridge's pillar count trimmed to fit) — the level
  // editor surfaces these; console.warn alone would go unseen there
  const warnings = [];
  // shared by base.T and every fork branch so their elevations agree exactly where z-ranges overlap (esp. fork merges)
  const dropAt = (z, wfPool) => {
    let d = 0;
    for (const [zl, dl] of R.ledges) d += dl * smoothstep(zl - 2, zl + 2, z);
    for (const wf of wfPool) d += wf.drop * smoothstep(wf.z - (wf.len ?? 5) / 2, wf.z + (wf.len ?? 5) / 2, z);
    for (const bd of bands) {
      const used = R.ledges.reduce((s, [zl, dl]) => s + (zl >= bd.z0 && zl <= bd.z1 ? dl : 0), 0)
        + wfPool.reduce((s, wf) => s + (wf.z >= bd.z0 && wf.z <= bd.z1 ? wf.drop : 0), 0);
      d += Math.max(0, bd.drop - used) * smoothstep(bd.z0, bd.z1, z);
    }
    return d;
  };
  const channelsAt = z => {
    const calmPutin = 1 - smoothstep(PUTIN * 0.35, PUTIN, z);      // 1 in the pool → 0 in the rapid
    const calmPond = R.pond ? smoothstep(pond0 - 15, pond0, z) * (1 - smoothstep(pond1, pond1 + pondTail, z)) : 0;
    const calm = Math.max(calmPutin, calmPond);
    const c = centerAt(z);
    const hw = hwAt(z);
    // zEff skips the pond's span, so the slope resumes at the elevation it would've reached without the pond
    const zEff = R.pond ? z - clamp(z - pond0, 0, pond1 - pond0) : z;
    const T0 = -R.slope * Math.max(0, zEff - PUTIN * 0.4)       // flat bed for the first 12 m
          + 0.12 * (vnoise2(z * 0.05, 9.1, seed + 1) * 2 - 1) * (1 - calm);
    const D = R.depth * (1 + 0.25 * (vnoise2(z * 0.03, 5.5, seed + 2) * 2 - 1) * (1 - calm))
            * clamp(Math.pow(R.halfW / hw, 0.4), 0.7, 1.8) * (1 + 0.8 * calm);
    const T = T0 - dropAt(z, waterfalls.filter(wf => wf.branch == null));
    const curv = (centerAt(z + 2) - 2 * c + centerAt(z - 2)) / 4;
    const d0 = -clamp(8 * curv, -0.35, 0.35);
    const base = { c, hw, T, D, d0, eta: T + SIM.waterFrac * D, side: 0, t: 0, calm };
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
        const bT = T0 - dropAt(z, waterfalls.filter(wf => wf.branch == null || wf.branch === kk));
        bhw *= 1 - pinchAt(z, waterfalls.filter(wf => wf.branch == null || wf.branch === kk));
        bhw = Math.max(bhw, 2);
        const bD = Math.max(base.D + t * base.D * (sh[kk] - 0.5) * 0.6, 0.4);
        const bc = softClamp(base.c + off, bhw + RIVER_SIDE_MARGIN, Wd - bhw - RIVER_SIDE_MARGIN);
        return { c: bc, hw: bhw, T: bT, D: bD, d0: base.d0, eta: bT + SIM.waterFrac * bD, side, islandH, islandScale, t, calm };
      });
      // otherC bounds "island" shaping to the actual gap between siblings, not past it
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
    const bank = 1.8 * (1 - Math.exp(-m / 2.5)) + 0.06 * m;
    // island shaping only inside the gap between this branch and its sibling, not past it
    const useIsland = chan.side !== 0 && Math.sign(d) === -chan.side
      && x > Math.min(chan.c, chan.otherC) && x < Math.max(chan.c, chan.otherC);
    const vH = useIsland ? R.valleyH + chan.t * (chan.islandH - R.valleyH) : R.valleyH;
    const vS = useIsland ? R.valleyScale + chan.t * (chan.islandScale - R.valleyScale) : R.valleyScale;
    const valley = vH * (1 - Math.exp(-m / vS));   // asymptotic hills, no parabola
    const wx = x + 14 * (fbm2(x * 0.006, z * 0.006, 2, seed + 11) - 0.5);    // domain warp → ridges
    const wz = z + 14 * (fbm2(x * 0.006 + 5, z * 0.006 + 5, 2, seed + 12) - 0.5);
    // damped in calm zones (see T0) so relief noise doesn't dip the bank below the waterline
    const relief = ((fbm2(wx * 0.011, wz * 0.011, 5, seed + 3) - 0.5) * Math.min(vH, 14) * 0.8 * smoothstep(0, 25, m)
                 + (fbm2(x * 0.05, z * 0.05, 3, seed + 4) - 0.5) * 1.4 * smoothstep(0, 5, m)) * (1 - (chan.calm ?? 0));
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
    if (R.pond && z > pond0 - 5 && z < pond1 + 5) continue;
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
  // land bridges: one shared descriptor (deck/pillars/centreline) used by meshes.js, vegetation, pickups and kayak collision in main.js
  const bAt = (x, z) => {
    const gx = x / dx - 0.5, gz = z / dx - 0.5, x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0;
    const f = (i, jj) => b[clamp(jj, 0, L - 1) * W + clamp(i, 0, W - 1)];
    return (f(x0, z0) * (1 - fx) + f(x0 + 1, z0) * fx) * (1 - fz) + (f(x0, z0 + 1) * (1 - fx) + f(x0 + 1, z0 + 1) * fx) * fz;
  };
  // steep-walled elliptical plateau (pow 6, like main.js's carveBoulderIntoBed) so most of the footprint reads as dry to the sim, not just a pinprick at the centre
  const carveFoot = (x, z, ax, az, cy, sy, top) => {
    const local = bAt(x, z), t = Math.max(top, local + 0.1), r = Math.max(ax, az);
    const i0 = clamp(Math.floor((x - r) / dx), 0, W - 1), i1 = clamp(Math.ceil((x + r) / dx), 0, W - 1);
    const j0 = clamp(Math.floor((z - r) / dx), 0, L - 1), j1 = clamp(Math.ceil((z + r) / dx), 0, L - 1);
    for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
      const dx0 = (ii + 0.5) * dx - x, dz0 = (jj + 0.5) * dx - z;
      const lx = dx0 * cy + dz0 * sy, lz = -dx0 * sy + dz0 * cy;
      const rho = Math.hypot(lx / ax, lz / az);
      if (rho >= 1) continue;
      const idx = jj * W + ii;
      b[idx] = Math.max(b[idx], t - (t - local) * Math.pow(rho, 6));
    }
  };
  const carveFootBox = (pl, top) => {
    const ax = pl.hxFoot, az = pl.hzFoot, local = bAt(pl.cx, pl.cz), t = Math.max(top, local + 0.1), r = Math.hypot(ax, az);
    const i0 = clamp(Math.floor((pl.cx - r) / dx), 0, W - 1), i1 = clamp(Math.ceil((pl.cx + r) / dx), 0, W - 1);
    const j0 = clamp(Math.floor((pl.cz - r) / dx), 0, L - 1), j1 = clamp(Math.ceil((pl.cz + r) / dx), 0, L - 1);
    for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
      const dx0 = (ii + 0.5) * dx - pl.cx, dz0 = (jj + 0.5) * dx - pl.cz;
      const lx = dx0 * pl.cy + dz0 * pl.sy, lz = -dx0 * pl.sy + dz0 * pl.cy;
      const rho = Math.max(Math.abs(lx) / ax, Math.abs(lz) / az);
      if (rho >= 1) continue;
      const idx = jj * W + ii;
      b[idx] = Math.max(b[idx], t - (t - local) * Math.pow(rho, 8));
    }
  };
  // radius multiplier at height fraction fy (0 bed → 1 deck underside); shared by the mesh and collision code
  const pillarK = (pl, fy) => (1 + pl.baseFlare * Math.pow(1 - fy, 3)) * (1 - pl.waist * Math.sin(Math.PI * fy))
    * (1 + pl.flare * Math.pow(smoothstep(pl.flareFrom, 1, fy), pl.flareCurve));
  // contact test against pillar pl grown by margin metres: {nx, nz, pen} or null — used by kayak, rucksacks and pickup placement
  const pillarHit = (pl, x, z, margin) => {
    const ax = pl.rx * pl.kWater + margin, az = pl.rz * pl.kWater + margin;
    const dx0 = x - pl.cx, dz0 = z - pl.cz;
    const lx = dx0 * pl.cy + dz0 * pl.sy, lz = -dx0 * pl.sy + dz0 * pl.cy;
    const ex = lx / ax, ez = lz / az, rho = Math.hypot(ex, ez);
    if (rho >= 1) return null;
    if (rho < 1e-4) return { nx: pl.cy, nz: pl.sy, pen: Math.min(ax, az) };
    let gx = ex / ax, gz = ez / az; const gl = Math.hypot(gx, gz); gx /= gl; gz /= gl;
    return { nx: gx * pl.cy - gz * pl.sy, nz: gx * pl.sy + gz * pl.cy, pen: (1 - rho) * rho / gl };
  };
  const bridges = [];
  (R.landBridges || []).forEach((cfg0, bk) => {
    const cfg = { ...LAND_BRIDGE, ...cfg0 };
    const bseed = seed + 700 + bk * 37 + (cfg.seed ?? 0);
    const brng = mulberry32(bseed);
    const zb = cfg.z, chan = rows[clamp(Math.floor(zb / dx), 0, L - 1)][0];
    const eta = chan.eta, xL = chan.c - chan.hw, xR = chan.c + chan.hw;
    const rough = cfg.roughness, thickMid = cfg.thickness, yDeck = eta + cfg.height + thickMid;
    // walk out from the water's edge until the bank is about level with the deck
    const findEnd = (x0, dir) => { let ext = cfg.minExt; while (ext < cfg.maxExt && bAt(x0 + dir * ext, zb) < yDeck - 0.3) ext += dx; return ext; };
    const xa = Math.max(2, xL - findEnd(xL, -1)), xb = Math.min(Wd - 2, xR + findEnd(xR, 1)), span = xb - xa;
    // s = 0…1 along the span (left abutment → right), u = -1…1 across the deck
    const hump = s => cfg.rise * Math.pow(Math.sin(Math.PI * s), 1.6);
    const zc = s => zb + cfg.wander * span * 0.04 * (vnoise2(s * 2.1 + 0.3, 2.5, bseed) * 2 - 1);
    const flare = s => 1 + cfg.flare * (Math.pow(1 - smoothstep(0, 0.3, s), 1.5) + Math.pow(smoothstep(0.7, 1, s), 1.5));
    const hwB = s => (cfg.width / 2) * Math.max(0.35, 1 + cfg.widthVar * (vnoise2(s * 3.3 + 5.2, 0.7, bseed + 1) * 2 - 1)) * flare(s)
                   * (1 + 0.07 * rough * (vnoise2(s * 13 + 1, 4.4, bseed + 9) * 2 - 1));
    const detail = s => smoothstep(0, 0.12, s) * (1 - smoothstep(0.88, 1, s));
    const topAt = (s, u, x, z) => yDeck + hump(s) - 0.08 * u * u
      + detail(s) * rough * (0.22 * (fbm2(x * 0.35, z * 0.35, 3, bseed + 2) - 0.5) * 2 + 0.06 * (vnoise2(x * 0.9, z * 0.9, bseed + 3) * 2 - 1));
    const thickEnd = thickMid + cfg.height + 1.5;
    const thick = s => thickMid + (thickEnd - thickMid) * Math.pow(Math.abs(2 * s - 1), 2.4);
    const bottomAt = s => yDeck + hump(s) - thick(s);
    const clearAt = s => bottomAt(s) - 0.05 - rough * (0.22 + 0.07 * thick(s));
    const at = (x, z) => {
      const s = (x - xa) / span; if (s < 0 || s > 1) return null;
      const u = (z - zc(s)) / hwB(s); if (Math.abs(u) > 1) return null;
      return { s, u, top: topAt(s, u, x, z), bottom: clearAt(s) };
    };
    // cfg.pillars: a count = auto-spread columns (trimmed if passages get too tight), or an array of hand-placed specs (see LAND_BRIDGE.pillar)
    const wet = xR - xL;
    let specs;
    if (Array.isArray(cfg.pillars)) specs = cfg.pillars.map(p => ({ ...LAND_BRIDGE.pillar, ...p }));
    else {
      let nP = cfg.pillars;
      while (nP > 0 && wet / (nP + 1) < 4.7) nP--;
      if (nP < cfg.pillars) {
        const msg = `land bridge at z=${zb} — channel only ${wet.toFixed(1)} m wide, pillars reduced from ${cfg.pillars} to ${nP} to keep the passages open`;
        console.warn(`River "${R.name}": ${msg}`);
        warnings.push(msg);
      }
      specs = Array.from({ length: nP }, (_, k) => ({ ...LAND_BRIDGE.pillar,
        along: (k + 1) / (nP + 1) + (brng() - 0.5) * 0.45 / (nP + 1), across: (brng() - 0.5) * 0.8 }));
    }
    const gapAuto = wet / (specs.length + 1);
    const pillars = specs.map((sp, k) => {
      const s = clamp((xL + sp.along * wet - xa) / span, 0.02, 0.98), px = xa + s * span;
      const pz = zc(s) + sp.across * hwB(s);
      const yBase = bAt(px, pz) - 0.4, yTop = bottomAt(s) + 0.6, h = Math.max(yTop - yBase, 0.5);
      const r = sp.radius ?? clamp(0.16 * h + 0.35, 0.5, Math.min(2.0, 0.17 * gapAuto)) * (0.85 + 0.3 * brng());
      const yaw = sp.yaw * Math.PI / 180;
      const lean = sp.lean ?? [(brng() - 0.5) * 0.1, (brng() - 0.5) * 0.1];
      const pl = { x: px, z: pz, yBase, yTop, h, rx: r * sp.sizeAlong, rz: r * sp.sizeAcross, yaw, cy: Math.cos(yaw), sy: Math.sin(yaw),
        lean, twist: sp.twist ?? (brng() - 0.5) * 1.2, irregular: sp.irregular, baseFlare: sp.baseFlare, waist: sp.waist,
        flare: sp.flare, flareFrom: sp.flareFrom, flareCurve: sp.flareCurve, seed: bseed + 50 + k };
      const hW = clamp(eta - yBase, 0, h);
      pl.cx = px + lean[0] * hW; pl.cz = pz + lean[1] * hW;
      pl.kWater = pillarK(pl, hW / h) * (1 + 0.2 * pl.irregular) + 0.05;
      return pl;
    });
    for (const pl of pillars) carveFoot(pl.cx, pl.cz, pl.rx * pl.kWater * 0.9, pl.rz * pl.kWater * 0.9, pl.cy, pl.sy, eta + 0.6);
    // hand-placed columns that run into each other are the designer's call — just warn
    for (let a = 0; a < pillars.length; a++) for (let c = a + 1; c < pillars.length; c++) {
      const A = pillars[a], Bp = pillars[c];
      const ra = Math.max(A.rx, A.rz) * A.kWater, rb = Math.max(Bp.rx, Bp.rz) * Bp.kWater;
      const d = Math.hypot(A.cx - Bp.cx, A.cz - Bp.cz);
      if (d < ra + rb + 1.0) {
        const msg = `land bridge at z=${zb} — pillars ${a} and ${c} are ${d.toFixed(1)} m apart (radii ~${ra.toFixed(1)} + ${rb.toFixed(1)} m); they overlap or leave no passage`;
        console.warn(`River "${R.name}": ${msg}`);
        warnings.push(msg);
      }
    }


    // abutment plateaus ease to deck level: raised fully where lower, cut only partly where higher, staying off the channel so they never dam the river
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
    bridges.push({ cfg, z: zb, xa, xb, span, eta, yDeck, zc, hwB, topAt, bottomAt, thick, clearAt, at, pillars, pillarK, pillarHit, seed: bseed,
      reach: maxHw + 2.5, zMin: zb - maxHw - 1, zMax: zb + maxHw + 1 });
  });
  // built (road) bridges: same descriptor interface as a land bridge (at/pillars/pillarHit/reach/zMin/zMax) so main.js's collision, pickups and camera clamp work on it unchanged
  const builtBridges = [];
  (R.builtBridges || []).forEach(cfg0 => {
    const cfg = { ...BUILT_BRIDGE, ...cfg0 };
    const mat = BRIDGE_MATERIALS[cfg.material];
    const zb = cfg.z, jb = clamp(Math.floor(zb / dx), 0, L - 1), chan = rows[jb][0];
    const eta = chan.eta, xL = chan.c - chan.hw, xR = chan.c + chan.hw, wet = xR - xL;
    const halfW = cfg.width / 2, corridor = halfW + cfg.shoulder;
    const yUnder = eta + cfg.height, yDeck = yUnder + cfg.thickness;
    const slabT = Math.min(cfg.slab, cfg.thickness), slabBottom = yDeck - slabT;
    // the span must clear the channel across the whole road corridor, not just at zb — a meandering river can cut through the embankment up-/downstream
    let lo = xL, hi = xR;
    const j0c = clamp(Math.floor((zb - corridor) / dx), 0, L - 1), j1c = clamp(Math.ceil((zb + corridor) / dx), 0, L - 1);
    for (let jj = j0c; jj <= j1c; jj++) { const ch = rows[jj][0]; lo = Math.min(lo, ch.c - ch.hw); hi = Math.max(hi, ch.c + ch.hw); }
    const xa = Math.max(1.5, lo - cfg.abutExt), xb = Math.min(Wd - 1.5, hi + cfg.abutExt), span = xb - xa;
    const specs = Array.isArray(cfg.pylons) ? cfg.pylons.map(p => ({ ...BUILT_BRIDGE.pylon, ...p }))
      : Array.from({ length: cfg.pylons }, (_, k) => ({ ...BUILT_BRIDGE.pylon, along: (k + 1) / (cfg.pylons + 1) }));
    const pylons = specs.map(sp => {
      const cx = xL + sp.along * wet, cz = zb + sp.across * halfW, yaw = sp.yaw * Math.PI / 180;
      const hx = sp.sizeAlong / 2, hz = sp.sizeAcross / 2;
      return { cx, cz, x: cx, z: cz, yaw, cy: Math.cos(yaw), sy: Math.sin(yaw),
        hx, hz, hxFoot: hx + sp.footing, hzFoot: hz + sp.footing, taper: sp.taper, cap: sp.cap,
        yBase: bAt(cx, cz) - 0.6, yTop: slabBottom, footTop: Math.min(eta + 0.35, slabBottom - 0.3) };
    });
    const pylonHit = (pl, x, z, margin) => {
      const ax = pl.hxFoot + margin, az = pl.hzFoot + margin;
      const dx0 = x - pl.cx, dz0 = z - pl.cz;
      const lx = dx0 * pl.cy + dz0 * pl.sy, lz = -dx0 * pl.sy + dz0 * pl.cy;
      const px = ax - Math.abs(lx), pz = az - Math.abs(lz);
      if (px <= 0 || pz <= 0) return null;
      if (px < pz) { const s = Math.sign(lx) || 1; return { nx: s * pl.cy, nz: s * pl.sy, pen: px }; }
      const s = Math.sign(lz) || 1; return { nx: -s * pl.sy, nz: s * pl.cy, pen: pz };
    };
    for (const pl of pylons) carveFootBox(pl, eta + 0.6);
    const roadY = yDeck - 0.06;
    for (let jj = j0c; jj <= j1c; jj++) {
      const cz = (jj + 0.5) * dx, wz = 1 - smoothstep(halfW, corridor, Math.abs(cz - zb));
      if (wz <= 0) continue;
      for (let ii = 0; ii < W; ii++) {
        const cx = (ii + 0.5) * dx;
        const wx = smoothstep(0, 4, Math.max(xa - cx, cx - xb));
        if (wx <= 0) continue;
        const ch = nearestChan(rows[jj], cx), m = (Math.abs((cx - ch.c) / ch.hw) - 1) * ch.hw;
        const w = wz * wx * smoothstep(0.2, 2, m);
        if (w <= 0) continue;
        const idx = jj * W + ii;
        b[idx] += (roadY - b[idx]) * w;
      }
    }
    const abutBase = (x0, x1) => {
      let m = Infinity;
      for (let x = x0; x <= x1 + 1e-6; x += dx) for (let z = zb - halfW; z <= zb + halfW + 1e-6; z += dx) m = Math.min(m, bAt(x, z));
      return m - 0.6;
    };
    const aL1 = Math.min(lo + 0.5, xb), aR0 = Math.max(hi - 0.5, xa);
    const abuts = [{ x0: xa, x1: aL1, yBase: abutBase(xa, aL1) }, { x0: aR0, x1: xb, yBase: abutBase(aR0, xb) }];
    const maxHz = pylons.reduce((s, p) => Math.max(s, Math.abs(p.cz - zb) + p.hzFoot), halfW);
    builtBridges.push({ built: true, noProps: true, cfg, mat, tint: cfg.color,
      z: zb, xa, xb, span, lo, hi, eta, halfW, corridor, yUnder, yDeck, slabBottom, slabT,
      roadX0: 0, roadX1: Wd, roadY,
      at: (x, z) => Math.abs(z - zb) > halfW ? null
        : { s: clamp((x - xa) / span, 0, 1), u: (z - zb) / halfW, top: yDeck, bottom: yUnder },
      pillars: pylons, pillarHit: pylonHit, abuts,
      roadBlock: (x, z) => Math.abs(z - zb) < halfW + cfg.shoulder * 0.6,
      reach: maxHz + 3, zMin: zb - corridor - 1, zMax: zb + corridor + 1 });
  });
  const state = new Float32Array(N * 4), kArr = new Float32Array(N);
  for (let j = 0; j < L; j++) {
    const chans = rows[j];
    // per-row discharge matching (not just the river average) keeps the initial state mass-consistent — otherwise bends/pinches start with the wrong flux and launch a "tidal wave" downstream
    let rowSum53 = 0;
    for (let i = 0; i < W; i++) {
      const x = (i + 0.5) * dx, eta = nearestChan(chans, x).eta;
      const h = eta - b[j * W + i];
      if (h >= 0.05) rowSum53 += Math.pow(h, 5 / 3) * dx;
    }
    const rowVelScale = Q / Math.max(rowSum53, 1e-3);
    for (let i = 0; i < W; i++) {
      const id = j * W + i, x = (i + 0.5) * dx, eta = nearestChan(chans, x).eta;
      let h = eta - b[id]; if (h < 0.05) h = 0;
      state[id * 4] = h;
      state[id * 4 + 2] = h > 0 ? Math.min(rowVelScale * Math.pow(h, 0.6667), 4) : 0;
    }
  }
  // natural and built bridges share one descriptor interface; `built` tells them apart
  return { R, rows, b, mask, state, kArr, centerAt, inEta: rows[0][0].eta, inVelScale, Q, finishZ, seed,
    bridges: bridges.concat(builtBridges), warnings };
}