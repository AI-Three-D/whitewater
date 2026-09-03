import { v3, vnoise3, mulberry32 } from './math.js';

export class MeshBuilder {
  constructor() { this.d = []; }
  tri(a, b, c, col) {
    const n = v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a)));
    for (const p of [a, b, c]) this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2]);
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  get count() { return this.d.length / 9; }
  data() { return new Float32Array(this.d); }
}
export function addSphere(mb, c, rad, nlat, nlon, col, disp) {
  const P = (t, p) => {
    const st = Math.sin(t), d = [st * Math.cos(p), Math.cos(t), st * Math.sin(p)];
    const k = disp ? disp(d) : 1;
    return [c[0] + d[0] * rad[0] * k, c[1] + d[1] * rad[1] * k, c[2] + d[2] * rad[2] * k];
  };
  for (let i = 0; i < nlat; i++) for (let j = 0; j < nlon; j++) {
    const t0 = Math.PI * i / nlat, t1 = Math.PI * (i + 1) / nlat, p0 = 6.2832 * j / nlon, p1 = 6.2832 * (j + 1) / nlon;
    const cc = typeof col === 'function' ? col(i / nlat) : col;
    mb.quad(P(t0, p0), P(t1, p0), P(t1, p1), P(t0, p1), cc);
  }
}
export function addCylinder(mb, p0, p1, r0, r1, n, col) {
  const ax = v3.norm(v3.sub(p1, p0));
  const ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = v3.norm(v3.cross(ax, ref)), w = v3.cross(ax, u);
  const ring = (p, r, a) => v3.add(p, v3.add(v3.scale(u, r * Math.cos(a)), v3.scale(w, r * Math.sin(a))));
  for (let i = 0; i < n; i++) {
    const a0 = 6.2832 * i / n, a1 = 6.2832 * (i + 1) / n;
    if (r1 > 1e-4) mb.quad(ring(p0, r0, a0), ring(p0, r0, a1), ring(p1, r1, a1), ring(p1, r1, a0), col);
    else mb.tri(ring(p0, r0, a0), ring(p0, r0, a1), p1, col);
    if (r0 > 1e-4) mb.tri(p0, ring(p0, r0, a1), ring(p0, r0, a0), col);
    if (r1 > 1e-4) mb.tri(p1, ring(p1, r1, a0), ring(p1, r1, a1), col);
  }
}
export function addRingTube(mb, c, rx, rz, tr, n, m, col) {
  const P = (a, b) => [c[0] + (rx + tr * Math.cos(b)) * Math.cos(a), c[1] + tr * Math.sin(b), c[2] + (rz + tr * Math.cos(b)) * Math.sin(a)];
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a0 = 6.2832 * i / n, a1 = 6.2832 * (i + 1) / n, b0 = 6.2832 * j / m, b1 = 6.2832 * (j + 1) / m;
    mb.quad(P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1), col);
  }
}
function buildHull() {
  const mb = new MeshBuilder(), ns = 28, m = 18, Lk = 3.3, beam = 0.62;
  const sec = (k, ai) => {
    const t = k / ns, s = Math.sin(Math.PI * t);
    const w = (beam / 2) * Math.pow(s, 0.55) + 0.008, deck = 0.17 * Math.pow(s, 0.4), hull = 0.13 * Math.pow(s, 0.7);
    const rocker = 0.12 * (2 * t - 1) ** 2, a = 6.2832 * ai / m, cx = Math.cos(a), sy = Math.sin(a);
    const y = sy >= 0 ? deck * Math.pow(sy, 0.8) * (1 - 0.25 * cx * cx) : -hull * Math.pow(-sy, 0.9);
    return [w * cx, rocker + y, (t - 0.5) * Lk];
  };
  for (let k = 0; k < ns; k++) for (let ai = 0; ai < m; ai++) {
    // white deck / grey underside: the real colour comes from the per-craft instance tint
    const a = 6.2832 * (ai + 0.5) / m, col = Math.sin(a) >= 0 ? [1, 1, 1] : [0.58, 0.45, 0.45];

    mb.quad(sec(k, ai), sec(k + 1, ai), sec(k + 1, ai + 1), sec(k, ai + 1), col);
  }
  return mb;
}
export function buildKayakParts() {
  const parts = {};
  parts.hull = buildHull();
  const ck = new MeshBuilder();
  addSphere(ck, [0, 0.13, 0.05], [0.25, 0.02, 0.44], 3, 16, [0.05, 0.05, 0.06]);
  addRingTube(ck, [0, 0.15, 0.05], 0.27, 0.46, 0.025, 20, 6, [0.15, 0.15, 0.16]);
  parts.cockpit = ck;
  const torso = new MeshBuilder(); addSphere(torso, [0, 0, 0], [0.18, 0.29, 0.13], 8, 12, t => t < 0.25 ? [0.95, 0.8, 0.65] : [0.12, 0.32, 0.82]);
  parts.torso = torso;
  const head = new MeshBuilder(); addSphere(head, [0, 0, 0], [0.11, 0.11, 0.11], 6, 10, t => t < 0.55 ? [0.95, 0.45, 0.1] : [0.9, 0.75, 0.6]);
  parts.head = head;
  const paddle = new MeshBuilder();
  addCylinder(paddle, [-1.05, 0, 0], [1.05, 0, 0], 0.017, 0.017, 8, [0.15, 0.15, 0.15]);
  addSphere(paddle, [-0.98, 0, 0], [0.24, 0.095, 0.014], 4, 10, [0.95, 0.82, 0.1]);
  addSphere(paddle, [0.98, 0, 0], [0.24, 0.095, 0.014], 4, 10, [0.95, 0.82, 0.1]);
  parts.paddle = paddle;
  return parts;
}
// a solid gold coin standing upright, face toward +/-Z — spinning it around the vertical axis
// makes it flip between face-on and edge-on, the classic "spinning coin" look
export function buildCoinMesh() {
  const mb = new MeshBuilder(), gold = [1.0, 0.86, 0.3];
  addCylinder(mb, [0, 0, -0.09], [0, 0, 0.09], 0.48, 0.48, 22, gold);
  return mb;
}
// tiny bright sphere used for the pickup-collection spark burst — tinted per-instance
export function buildSparkMesh() {
  const mb = new MeshBuilder();
  addSphere(mb, [0, 0, 0], [1, 1, 1], 4, 6, [1, 1, 1]);
  return mb;
}
// small faceted gem — a bipyramid (two stacked pyramid caps) around the vertical axis
export function buildDiamondMesh() {
  const mb = new MeshBuilder(), n = 6, col = [0.65, 0.92, 1.0];
  const ring = a => [Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22];
  for (let i = 0; i < n; i++) {
    const a0 = 6.2832 * i / n, a1 = 6.2832 * (i + 1) / n, p0 = ring(a0), p1 = ring(a1);
    mb.tri([0, 0.32, 0], p0, p1, col);
    mb.tri([0, -0.18, 0], p1, p0, col);
  }
  return mb;
}
// a dropped canvas rucksack — lumpy rounded body, a smaller flap on top, two thin straps
export function buildRucksackMesh() {
  const mb = new MeshBuilder(), sackCol = [0.45, 0.34, 0.20], strapCol = [0.30, 0.22, 0.12];
  addSphere(mb, [0, 0.16, 0], [0.26, 0.22, 0.18], 6, 8, sackCol, d => 0.85 + 0.3 * vnoise3(d[0] * 3, d[1] * 3 + 4, d[2] * 3, 20));
  addSphere(mb, [0, 0.34, -0.02], [0.16, 0.10, 0.14], 5, 7, sackCol, d => 0.85 + 0.25 * vnoise3(d[0] * 4, d[1] * 4 + 2, d[2] * 4, 21));
  addCylinder(mb, [-0.20, 0.08, -0.16], [-0.13, 0.40, -0.12], 0.025, 0.02, 5, strapCol);
  addCylinder(mb, [0.20, 0.08, -0.16], [0.13, 0.40, -0.12], 0.025, 0.02, 5, strapCol);
  return mb;
}
// rolled scroll/map — a short parchment-tinted cylinder with a darker ribbon band round the middle
export function buildMapMesh() {
  const mb = new MeshBuilder(), parchment = [0.85, 0.72, 0.45], ribbon = [0.55, 0.32, 0.18];
  addCylinder(mb, [-0.32, 0, 0], [0.32, 0, 0], 0.16, 0.16, 12, parchment);
  addCylinder(mb, [-0.04, 0, 0], [0.04, 0, 0], 0.175, 0.175, 12, ribbon);
  return mb;
}
export function buildVegetationMeshes() {
  const M = {};
  // conifer — default alpine/canyon tree
  const tree = new MeshBuilder();
  addCylinder(tree, [0, 0, 0], [0, 1.5, 0], 0.14, 0.1, 7, [0.36, 0.24, 0.13]);
  addCylinder(tree, [0, 0.9, 0], [0, 3.3, 0], 1.25, 0.0, 9, [0.08, 0.30, 0.12]);
  addCylinder(tree, [0, 1.9, 0], [0, 4.1, 0], 0.95, 0.0, 9, [0.10, 0.34, 0.13]);
  addCylinder(tree, [0, 2.8, 0], [0, 4.9, 0], 0.6, 0.0, 8, [0.12, 0.38, 0.15]);
  M.tree = tree;
  const bush = new MeshBuilder();
  addSphere(bush, [0, 0.35, 0], [0.75, 0.5, 0.75], 6, 9, [0.18, 0.40, 0.14], d => 0.85 + 0.35 * vnoise3(d[0] * 2 + 5, d[1] * 2, d[2] * 2, 3));
  M.bush = bush;
  const rock = new MeshBuilder();
  addSphere(rock, [0, 0.1, 0], [0.85, 0.55, 0.7], 6, 9, [0.5, 0.49, 0.47], d => 0.8 + 0.45 * vnoise3(d[0] * 1.7 + 2, d[1] * 1.7, d[2] * 1.7, 7));
  M.rock = rock;
  const grass = new MeshBuilder();
  for (let k = 0; k < 3; k++) {
    const a = Math.PI * k / 3, dxx = Math.cos(a) * 0.3, dzz = Math.sin(a) * 0.3;
    grass.quad([-dxx, 0, -dzz], [dxx, 0, dzz], [dxx * 0.3, 0.5, dzz * 0.3], [-dxx * 0.3, 0.5, -dzz * 0.3], [0.35, 0.55, 0.15]);
  }
  M.grass = grass;
  const pole = new MeshBuilder();
  addCylinder(pole, [0, 0, 0], [0, 3.2, 0], 0.07, 0.05, 8, [0.9, 0.15, 0.1]);
  addSphere(pole, [0, 3.35, 0], [0.22, 0.22, 0.22], 5, 8, [1.0, 0.9, 0.2]);
  pole.quad([0, 3.1, 0], [0, 2.5, 0], [1.1, 2.7, 0], [1.1, 3.0, 0], [1.0, 1.0, 1.0]);
  M.pole = pole;

  // deciduous — round broadleaf canopy on a trunk (temperate woodland)
  const treeDeciduous = new MeshBuilder();
  addCylinder(treeDeciduous, [0, 0, 0], [0, 1.3, 0], 0.13, 0.09, 7, [0.32, 0.22, 0.12]);
  addSphere(treeDeciduous, [0, 2.1, 0], [1.15, 1.05, 1.15], 7, 10, [0.22, 0.5, 0.16], d => 0.85 + 0.35 * vnoise3(d[0] * 2, d[1] * 2 + 3, d[2] * 2, 4));
  M.treeDeciduous = treeDeciduous;

  // saguaro cactus (desert) — fluted trunk with two upturned arms
  const cactus = new MeshBuilder(); const cactusCol = [0.27, 0.52, 0.30];
  addCylinder(cactus, [0, 0, 0], [0, 2.6, 0], 0.16, 0.13, 8, cactusCol);
  addCylinder(cactus, [0, 1.1, 0], [0.5, 1.1, 0], 0.09, 0.08, 6, cactusCol);
  addCylinder(cactus, [0.5, 1.1, 0], [0.5, 1.9, 0], 0.08, 0.06, 6, cactusCol);
  addCylinder(cactus, [0, 1.5, 0], [-0.45, 1.5, 0], 0.08, 0.07, 6, cactusCol);
  addCylinder(cactus, [-0.45, 1.5, 0], [-0.45, 2.1, 0], 0.07, 0.05, 6, cactusCol);
  M.cactus = cactus;

  // rainforest — tall trunk, tiered broad canopy
  const treeRainforest = new MeshBuilder();
  addCylinder(treeRainforest, [0, 0, 0], [0, 3.4, 0], 0.16, 0.12, 7, [0.30, 0.20, 0.11]);
  addSphere(treeRainforest, [0, 3.6, 0], [1.6, 1.0, 1.6], 7, 11, [0.10, 0.42, 0.14], d => 0.85 + 0.35 * vnoise3(d[0] * 1.6, d[1] * 1.6 + 8, d[2] * 1.6, 5));
  addSphere(treeRainforest, [0.4, 4.3, 0.3], [1.1, 0.8, 1.1], 6, 9, [0.14, 0.48, 0.17], d => 0.85 + 0.3 * vnoise3(d[0] * 2, d[1] * 2 + 2, d[2] * 2, 6));
  M.treeRainforest = treeRainforest;

  // acacia (savannah) — long thin trunk, flat but lumpy/irregular umbrella canopy (a noise-
  // displaced flattened blob, not a smooth geometric disc — a perfectly even cone reads as a
  // flying saucer rather than foliage)
  const treeSavannah = new MeshBuilder(); const acaciaCol = [0.32, 0.42, 0.14];
  addCylinder(treeSavannah, [0, 0, 0], [0, 2.5, 0], 0.10, 0.06, 7, [0.34, 0.24, 0.14]);
  addSphere(treeSavannah, [0, 2.62, 0], [1.5, 0.32, 1.5], 6, 11, acaciaCol,
    d => 0.7 + 0.45 * vnoise3(d[0] * 1.8, d[1] * 1.8 + 9, d[2] * 1.8, 12) + 0.15 * vnoise3(d[0] * 5 + 3, d[1] * 5, d[2] * 5 + 6, 17));
  M.treeSavannah = treeSavannah;

  // withered/dead tree (icy, barren) — bare trunk and a few thin bare branches, no canopy
  const treeWithered = new MeshBuilder(); const witherCol = [0.35, 0.30, 0.26];
  addCylinder(treeWithered, [0, 0, 0], [0, 2.2, 0], 0.10, 0.04, 6, witherCol);
  addCylinder(treeWithered, [0, 1.3, 0], [0.5, 2.0, 0], 0.04, 0.015, 5, witherCol);
  addCylinder(treeWithered, [0, 1.6, 0], [-0.4, 2.3, 0], 0.035, 0.01, 5, witherCol);
  addCylinder(treeWithered, [0, 1.9, 0], [0.15, 2.6, 0], 0.03, 0.01, 5, witherCol);
  M.treeWithered = treeWithered;

  // boulder — a single large rock. Two noise octaves: a broad low-frequency one for the
  // overall lumpy/asymmetric shape (not a round ball) plus a finer high-frequency one for
  // surface roughness — kept subtle so it reads as rock, not a spiky mess
  const boulder = new MeshBuilder();
  addSphere(boulder, [0, 0.5, 0], [1.6, 1.2, 1.5], 7, 10, [0.42, 0.41, 0.39],
    d => 0.68 + 0.45 * vnoise3(d[0] * 1.3 + 11, d[1] * 1.3, d[2] * 1.3 + 4, 9) + 0.14 * vnoise3(d[0] * 4.5 + 2, d[1] * 4.5, d[2] * 4.5 + 7, 15));
  M.boulder = boulder;

  // ice formation (glacier) — a cluster of angular faceted shards, no noise displacement —
  // sharp flat facets read as ice, where rock/boulder's organic lumpiness reads as stone
  const iceFormation = new MeshBuilder();
  addCylinder(iceFormation, [0.02, 0, 0.02], [0.08, 1.35, 0.06], 0.36, 0.02, 5, [0.80, 0.90, 0.98]);
  addCylinder(iceFormation, [-0.32, 0, 0.12], [-0.38, 0.85, 0.08], 0.20, 0.015, 5, [0.75, 0.87, 0.96]);
  addCylinder(iceFormation, [0.30, 0, -0.20], [0.35, 0.6, -0.24], 0.18, 0.015, 5, [0.85, 0.93, 1.0]);
  addCylinder(iceFormation, [-0.05, 0, -0.28], [-0.08, 0.45, -0.34], 0.14, 0.01, 5, [0.78, 0.89, 0.97]);
  M.iceFormation = iceFormation;

  return M;
}
// ---------- floating obstacles ----------
// Modelled in metres: long axis along local Z (centred), y = 0 at the waterline. Instances are
// scaled *uniformly* to their chosen length and never stretched, so branch stubs and tapers keep
// their shape. Each builder returns the mesh plus the nominal numbers the physics needs:
// len, rad (collision capsule radius), draft (depth below the waterline) and vol (m³, for mass).
const OBST_BARK = [0.34, 0.25, 0.16], OBST_DARK = [0.24, 0.17, 0.11], OBST_CUT = [0.66, 0.52, 0.33];
const ICE_UP = [0.88, 0.94, 1.0], ICE_DOWN = [0.48, 0.66, 0.78];

// broken-off branch stubs poking out at random angles. Purely cosmetic — the physics treats the
// log as a plain capsule — so they're kept under half a metre so the boat never visibly passes
// through one. Whichever ones land on the underside are simply hidden by the water.
function addStubs(mb, rng, len, rad, count, col) {
  for (let k = 0; k < count; k++) {
    const z = (rng() - 0.5) * len * 0.8, a = rng() * 6.2832;
    const out = [Math.cos(a), Math.sin(a), 0];
    const dir = v3.norm([out[0], out[1], (rng() - 0.5) * 1.2]);     // leans fore/aft a little
    const base = v3.scale(out, rad * 0.8); base[2] = z;
    const tip = v3.add(base, v3.scale(dir, rad * 0.2 + 0.15 + rng() * 0.27));   // ≤ ~0.45 m proud of the bark
    addCylinder(mb, base, tip, Math.min(0.06, rad * 0.3), 0.012, 5, col);
  }
}
// one trunk section: tapered barrel, pale cut faces, optional root flare at the butt (`flare` m)
// or a splintered snapped-off top (`snap` m), and `stubs` branch stubs
function buildLog(seed, len, r0, r1, sides, o = {}) {
  const mb = new MeshBuilder(), rng = mulberry32(seed), h = len / 2;
  let zb = -h, rb = r0;
  if (o.flare) { rb = r0 * 1.35; addCylinder(mb, [0, 0, -h], [0, 0, -h + o.flare], rb, r0, sides, OBST_DARK); zb = -h + o.flare; }
  const ze = o.snap ? h - o.snap : h;
  addCylinder(mb, [0, 0, zb], [0, 0, ze], r0, r1, sides, OBST_BARK);
  if (o.snap) addCylinder(mb, [0, 0, ze], [0, 0, h], r1, r1 * 0.35, sides, OBST_CUT);
  // cut faces: thin discs a hair proud of the ends, so they win the depth test against the barrel caps
  addCylinder(mb, [0, 0, -h - 0.012], [0, 0, -h + 0.02], rb * 0.97, rb * 0.97, sides, OBST_CUT);
  if (!o.snap) addCylinder(mb, [0, 0, h - 0.02], [0, 0, h + 0.012], r1 * 0.97, r1 * 0.97, sides, OBST_CUT);
  addStubs(mb, rng, len, (r0 + r1) / 2, o.stubs || 0, OBST_DARK);
  const rm = (r0 + r1) / 2;
  return { mb, len, rad: r0, draft: r0, vol: Math.PI * rm * rm * len };
}
// extrude a 2-D cross-section polygon along Z through a list of stations ([zFrac, sx, sy]) —
// flat facets and hard edges read as ice where the noise-displaced spheres used for rock read as
// stone. Quads above the waterline get the bright colour, submerged ones the darker blue-green.
function addStack(mb, poly, stations, colUp, colDown) {
  const n = poly.length;
  const pt = (st, k) => [poly[k][0] * st.sx, poly[k][1] * st.sy, st.z];
  for (let s = 0; s < stations.length - 1; s++) {
    const A = stations[s], B = stations[s + 1];
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n, a = pt(A, k), b = pt(A, k2), c = pt(B, k2), d = pt(B, k);
      mb.quad(a, b, c, d, (a[1] + c[1]) * 0.5 > 0 ? colUp : colDown);
    }
  }
  for (const [st, flip] of [[stations[0], true], [stations[stations.length - 1], false]]) {
    for (let k = 1; k < n - 1; k++) {
      const p0 = pt(st, 0), p1 = pt(st, k), p2 = pt(st, k + 1);
      if (flip) mb.tri(p0, p2, p1, colDown); else mb.tri(p0, p1, p2, colDown);
    }
  }
}
// irregular convex slab cross-section: `hw` half-width [m], spanning y = bot … top [m]
function icePoly(n, hw, top, bot, sd) {
  return Array.from({ length: n }, (_, k) => {
    const a = 6.2832 * (k + 0.18 * vnoise3(k * 0.9, sd, 0.5, 31)) / n;
    const r = 0.78 + 0.26 * vnoise3(k * 0.7 + 1.3, sd, 2.1, 30);
    return [Math.cos(a) * r * hw, bot + (Math.sin(a) * r + 1) * 0.5 * (top - bot)];
  });
}
function buildIce(seed, sides, len, hw, top, bot, stations) {
  const mb = new MeshBuilder();
  addStack(mb, icePoly(sides, hw, top, bot, seed), stations.map(([zf, sx, sy]) => ({ z: zf * len, sx, sy })), ICE_UP, ICE_DOWN);
  return { mb, len, rad: hw, draft: -bot, vol: 1.3 * hw * (top - bot) * len };
}
export function buildObstacleMeshes() {
  return {
    logMedium:  buildLog(1, 4.6,  0.28, 0.22, 10, { stubs: 3 }),
    logMediumB: buildLog(2, 5.4,  0.24, 0.20, 9,  { snap: 0.35, stubs: 2 }),
    logLarge:   buildLog(3, 9.0,  0.52, 0.42, 12, { flare: 0.9, stubs: 4 }),
    logLargeB:  buildLog(4, 10.5, 0.46, 0.40, 12, { snap: 0.6, stubs: 5 }),
    // floes: thin wide slabs, ~10 % freeboard
    iceMedium:  buildIce(5, 7, 2.6, 1.1, 0.35, -0.75, [[-0.5, 0.55, 0.70], [-0.2, 0.95, 1], [0.22, 1, 1], [0.5, 0.60, 0.75]]),
    iceMediumB: buildIce(6, 7, 3.0, 0.9, 0.30, -0.70, [[-0.5, 0.50, 0.65], [-0.25, 0.9, 0.95], [0.1, 1, 1], [0.34, 0.85, 0.9], [0.5, 0.45, 0.6]]),
    // small icebergs: a jagged mass standing clear of the water with most of the bulk below it
    iceberg:    buildIce(7, 8, 6.0, 2.2, 1.6, -1.8, [[-0.5, 0.45, 0.45], [-0.28, 0.85, 0.80], [-0.05, 1, 1], [0.18, 0.92, 0.85], [0.36, 0.70, 0.95], [0.5, 0.40, 0.50]]),
    icebergB:   buildIce(8, 8, 7.0, 1.9, 2.0, -1.6, [[-0.5, 0.55, 0.60], [-0.2, 0.95, 0.85], [0.02, 0.80, 1], [0.24, 1, 0.75], [0.5, 0.50, 0.55]]),
  };
}