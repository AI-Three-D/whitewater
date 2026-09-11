import { v3, vnoise3, mulberry32, clamp } from './math.js';
export class MeshBuilder {
  constructor() { this.d = []; }
  tri(a, b, c, col) {
    const n = v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a)));
    for (const p of [a, b, c]) this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2]);
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  // one vertex with an explicit (smooth) normal — for swept surfaces that compute their own normals
  vert(p, n, col) { this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2]); }
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
// upright coin, face toward +/-Z, so spinning around Y flips face-on/edge-on
export function buildCoinMesh() {
  const mb = new MeshBuilder(), gold = [1.0, 0.86, 0.3];
  addCylinder(mb, [0, 0, -0.09], [0, 0, 0.09], 0.48, 0.48, 22, gold);
  return mb;
}
export function buildSparkMesh() {
  const mb = new MeshBuilder();
  addSphere(mb, [0, 0, 0], [1, 1, 1], 4, 6, [1, 1, 1]);
  return mb;
}
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
export function buildRucksackMesh() {
  const mb = new MeshBuilder(), sackCol = [0.45, 0.34, 0.20], strapCol = [0.30, 0.22, 0.12];
  addSphere(mb, [0, 0.16, 0], [0.26, 0.22, 0.18], 6, 8, sackCol, d => 0.85 + 0.3 * vnoise3(d[0] * 3, d[1] * 3 + 4, d[2] * 3, 20));
  addSphere(mb, [0, 0.34, -0.02], [0.16, 0.10, 0.14], 5, 7, sackCol, d => 0.85 + 0.25 * vnoise3(d[0] * 4, d[1] * 4 + 2, d[2] * 4, 21));
  addCylinder(mb, [-0.20, 0.08, -0.16], [-0.13, 0.40, -0.12], 0.025, 0.02, 5, strapCol);
  addCylinder(mb, [0.20, 0.08, -0.16], [0.13, 0.40, -0.12], 0.025, 0.02, 5, strapCol);
  return mb;
}
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
  // snow-dusted conifer variant (icy biome)
  const treeSnowy = new MeshBuilder(), snowCol = [0.92, 0.95, 1.0];
  const dust = (col, t) => [col[0] + (snowCol[0] - col[0]) * t, col[1] + (snowCol[1] - col[1]) * t, col[2] + (snowCol[2] - col[2]) * t];
  addCylinder(treeSnowy, [0, 0, 0], [0, 1.5, 0], 0.14, 0.1, 7, [0.36, 0.24, 0.13]);
  addCylinder(treeSnowy, [0, 0.9, 0], [0, 3.3, 0], 1.25, 0.0, 9, dust([0.08, 0.30, 0.12], 0.2));
  addCylinder(treeSnowy, [0, 1.9, 0], [0, 4.1, 0], 0.95, 0.0, 9, dust([0.10, 0.34, 0.13], 0.45));
  addCylinder(treeSnowy, [0, 2.8, 0], [0, 4.9, 0], 0.6, 0.0, 8, dust([0.12, 0.38, 0.15], 0.75));
  M.treeSnowy = treeSnowy;
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

  // saguaro cactus (desert)
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

  // acacia (savannah) — flat noise-displaced umbrella canopy
  const treeSavannah = new MeshBuilder(); const acaciaCol = [0.32, 0.42, 0.14];
  addCylinder(treeSavannah, [0, 0, 0], [0, 2.5, 0], 0.10, 0.06, 7, [0.34, 0.24, 0.14]);
  addSphere(treeSavannah, [0, 2.62, 0], [1.5, 0.32, 1.5], 6, 11, acaciaCol,
    d => 0.7 + 0.45 * vnoise3(d[0] * 1.8, d[1] * 1.8 + 9, d[2] * 1.8, 12) + 0.15 * vnoise3(d[0] * 5 + 3, d[1] * 5, d[2] * 5 + 6, 17));
  M.treeSavannah = treeSavannah;

  // withered/dead tree (icy, barren)
  const treeWithered = new MeshBuilder(); const witherCol = [0.35, 0.30, 0.26];
  addCylinder(treeWithered, [0, 0, 0], [0, 2.2, 0], 0.10, 0.04, 6, witherCol);
  addCylinder(treeWithered, [0, 1.3, 0], [0.5, 2.0, 0], 0.04, 0.015, 5, witherCol);
  addCylinder(treeWithered, [0, 1.6, 0], [-0.4, 2.3, 0], 0.035, 0.01, 5, witherCol);
  addCylinder(treeWithered, [0, 1.9, 0], [0.15, 2.6, 0], 0.03, 0.01, 5, witherCol);
  M.treeWithered = treeWithered;

  // boulder: low-freq noise for lumpy shape, high-freq for surface roughness
  const boulder = new MeshBuilder();
  addSphere(boulder, [0, 0.5, 0], [1.6, 1.2, 1.5], 7, 10, [0.42, 0.41, 0.39],
    d => 0.68 + 0.45 * vnoise3(d[0] * 1.3 + 11, d[1] * 1.3, d[2] * 1.3 + 4, 9) + 0.14 * vnoise3(d[0] * 4.5 + 2, d[1] * 4.5, d[2] * 4.5 + 7, 15));
  M.boulder = boulder;

  // ice formation (glacier): angular faceted shards, no noise displacement
  const iceFormation = new MeshBuilder();
  addCylinder(iceFormation, [0.02, 0, 0.02], [0.08, 1.35, 0.06], 0.36, 0.02, 5, [0.80, 0.90, 0.98]);
  addCylinder(iceFormation, [-0.32, 0, 0.12], [-0.38, 0.85, 0.08], 0.20, 0.015, 5, [0.75, 0.87, 0.96]);
  addCylinder(iceFormation, [0.30, 0, -0.20], [0.35, 0.6, -0.24], 0.18, 0.015, 5, [0.85, 0.93, 1.0]);
  addCylinder(iceFormation, [-0.05, 0, -0.28], [-0.08, 0.45, -0.34], 0.14, 0.01, 5, [0.78, 0.89, 0.97]);
  M.iceFormation = iceFormation;

  // ---------- variant props: alternate meshes for the same biome "role" (BIOMES[x].props in config.js picks one at random) ----------

  const rockSlab = new MeshBuilder();
  addSphere(rockSlab, [0, 0.22, 0], [1.15, 0.28, 0.85], 5, 8, [0.48, 0.46, 0.43],
    d => 0.75 + 0.4 * vnoise3(d[0] * 2.2 + 6, d[1] * 2.2, d[2] * 2.2 + 3, 13));
  M.rockSlab = rockSlab;

  const boulderJagged = new MeshBuilder();
  addSphere(boulderJagged, [0, 0.65, 0], [1.35, 1.7, 1.3], 6, 10, [0.40, 0.38, 0.37],
    d => 0.6 + 0.3 * vnoise3(d[0] * 1.1 + 8, d[1] * 1.1, d[2] * 1.1 + 5, 19) + 0.35 * vnoise3(d[0] * 5 + 1, d[1] * 5, d[2] * 5 + 9, 23));
  M.boulderJagged = boulderJagged;

  const bushBerry = new MeshBuilder();
  addSphere(bushBerry, [0, 0.32, 0], [0.68, 0.46, 0.68], 6, 9, [0.16, 0.38, 0.13], d => 0.85 + 0.35 * vnoise3(d[0] * 2 + 5, d[1] * 2, d[2] * 2, 3));
  const berryCol = [0.75, 0.1, 0.18];
  for (const [bx, by, bz] of [[0.35, 0.5, 0.1], [-0.3, 0.4, 0.25], [0.1, 0.6, -0.32], [-0.2, 0.55, -0.15], [0.3, 0.3, -0.3]]) addSphere(bushBerry, [bx, by, bz], [0.07, 0.07, 0.07], 3, 5, berryCol);
  M.bushBerry = bushBerry;

  const flowerTuft = new MeshBuilder();
  for (let k = 0; k < 3; k++) {
    const a = Math.PI * k / 3, dxx = Math.cos(a) * 0.3, dzz = Math.sin(a) * 0.3;
    flowerTuft.quad([-dxx, 0, -dzz], [dxx, 0, dzz], [dxx * 0.3, 0.5, dzz * 0.3], [-dxx * 0.3, 0.5, -dzz * 0.3], [0.35, 0.55, 0.15]);
  }
  addSphere(flowerTuft, [0, 0.5, 0], [0.13, 0.1, 0.13], 4, 6, [0.95, 0.85, 0.25]);
  M.flowerTuft = flowerTuft;

  const treeBirch = new MeshBuilder();
  addCylinder(treeBirch, [0, 0, 0], [0, 2.4, 0], 0.11, 0.06, 7, [0.82, 0.80, 0.76]);
  addSphere(treeBirch, [0, 2.9, 0], [0.85, 0.9, 0.85], 6, 9, [0.62, 0.72, 0.42], d => 0.8 + 0.4 * vnoise3(d[0] * 2.3 + 7, d[1] * 2.3, d[2] * 2.3, 11));
  M.treeBirch = treeBirch;

  const treeAutumn = new MeshBuilder();
  addCylinder(treeAutumn, [0, 0, 0], [0, 1.3, 0], 0.13, 0.09, 7, [0.32, 0.22, 0.12]);
  addSphere(treeAutumn, [0, 2.1, 0], [1.15, 1.05, 1.15], 7, 10,
    t => t < 0.35 ? [0.82, 0.22, 0.10] : t < 0.65 ? [0.88, 0.52, 0.08] : [0.85, 0.72, 0.15],
    d => 0.85 + 0.35 * vnoise3(d[0] * 2, d[1] * 2 + 3, d[2] * 2, 4));
  M.treeAutumn = treeAutumn;

  // charred dead tree (volcanic), with ember-glow spots standing in for lighting the game doesn't have
  const treeCharred = new MeshBuilder(); const charCol = [0.08, 0.07, 0.07];
  addCylinder(treeCharred, [0, 0, 0], [0, 2.0, 0], 0.11, 0.04, 6, charCol);
  addCylinder(treeCharred, [0, 1.2, 0], [0.45, 1.8, 0], 0.04, 0.015, 5, charCol);
  addCylinder(treeCharred, [0, 1.5, 0], [-0.35, 2.1, 0], 0.035, 0.01, 5, charCol);
  addSphere(treeCharred, [0.06, 0.15, 0.05], [0.05, 0.05, 0.05], 3, 5, [0.95, 0.45, 0.1]);
  addSphere(treeCharred, [-0.08, 0.08, -0.04], [0.04, 0.04, 0.04], 3, 5, [0.9, 0.35, 0.05]);
  M.treeCharred = treeCharred;

  const lavaRock = new MeshBuilder();
  addSphere(lavaRock, [0, 0.45, 0], [1.1, 0.9, 1.05], 6, 9, [0.10, 0.09, 0.09],
    d => 0.7 + 0.4 * vnoise3(d[0] * 1.6 + 14, d[1] * 1.6, d[2] * 1.6 + 6, 27));
  const emberCol = [0.95, 0.4, 0.05];
  addCylinder(lavaRock, [-0.5, 0.35, 0.1], [0.35, 0.55, -0.2], 0.05, 0.03, 5, emberCol);
  addSphere(lavaRock, [0.4, 0.65, 0.15], [0.09, 0.06, 0.09], 3, 5, emberCol);
  M.lavaRock = lavaRock;

  return M;
}
// ---------- floating obstacles ----------
// Metres, long axis along local Z, y = 0 at waterline. Each builder returns the mesh plus the
// nominal numbers the physics needs: len, rad (collision capsule radius), draft, vol (m³, for mass).
const OBST_BARK = [0.34, 0.25, 0.16], OBST_DARK = [0.24, 0.17, 0.11], OBST_CUT = [0.66, 0.52, 0.33];
const ICE_UP = [0.88, 0.94, 1.0], ICE_DOWN = [0.48, 0.66, 0.78];

// branch stubs: purely cosmetic (physics treats the log as a plain capsule), kept under ~0.45m so the boat never visibly passes through one
function addStubs(mb, rng, len, rad, count, col) {
  for (let k = 0; k < count; k++) {
    const z = (rng() - 0.5) * len * 0.8, a = rng() * 6.2832;
    const out = [Math.cos(a), Math.sin(a), 0];
    const dir = v3.norm([out[0], out[1], (rng() - 0.5) * 1.2]);
    const base = v3.scale(out, rad * 0.8); base[2] = z;
    const tip = v3.add(base, v3.scale(dir, rad * 0.2 + 0.15 + rng() * 0.27));
    addCylinder(mb, base, tip, Math.min(0.06, rad * 0.3), 0.012, 5, col);
  }
}
// trunk section: `flare` = root flare at the butt (m), `snap` = splintered top (m), `stubs` = branch count
function buildLog(seed, len, r0, r1, sides, o = {}) {
  const mb = new MeshBuilder(), rng = mulberry32(seed), h = len / 2;
  let zb = -h, rb = r0;

  const ze = o.snap ? h - o.snap : h;
  addCylinder(mb, [0, 0, zb], [0, 0, ze], r0, r1, sides, OBST_BARK);
  if (o.snap) addCylinder(mb, [0, 0, ze], [0, 0, h], r1, r1 * 0.35, sides, OBST_CUT);
  // cut faces sit a hair proud of the barrel ends to win the depth test
  addCylinder(mb, [0, 0, -h - 0.012], [0, 0, -h + 0.02], rb * 0.97, rb * 0.97, sides, OBST_CUT);
  if (!o.snap) addCylinder(mb, [0, 0, h - 0.02], [0, 0, h + 0.012], r1 * 0.97, r1 * 0.97, sides, OBST_CUT);
  addStubs(mb, rng, len, (r0 + r1) / 2, o.stubs || 0, OBST_DARK);
  const rm = (r0 + r1) / 2;
  return { mb, len, rad: r0, draft: r0, vol: Math.PI * rm * rm * len };
}
// extrude a 2-D cross-section polygon along Z through a list of stations ([zFrac, sx, sy])
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
// convex slab cross-section: `hw` half-width (m), spanning y = bot..top (m)
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
// landslide boulders, in the {mb, len, rad, draft, vol} shape the obstacle physics needs (sized
// round, len ≈ diameter). draft is set deep (see OBSTACLES kinds.boulder, config.js) to keep
// stepObstacle in its grounded/rolling regime rather than ever floating.
const ROCK_OBST = [0.44, 0.41, 0.37], ROCK_OBST_DARK = [0.30, 0.27, 0.23];
function buildBoulder(seed, r) {
  const mb = new MeshBuilder(), rng = mulberry32(seed);
  const rx = r * (0.82 + 0.3 * rng()), ry = r * (0.65 + 0.18 * rng()), rz = r * (0.82 + 0.3 * rng());
  addSphere(mb, [0, 0, 0], [rx, ry, rz], 7, 10, i => (i < 0.25 || i > 0.8 ? ROCK_OBST_DARK : ROCK_OBST),
    d => 0.72 + 0.32 * vnoise3(d[0] * 1.7 + seed, d[1] * 1.7 - seed, d[2] * 1.7 + seed * 2, seed + 60)
       + 0.12 * vnoise3(d[0] * 4.5 + seed, d[1] * 4.5, d[2] * 4.5 + seed, seed + 61));
  const rMax = Math.max(rx, rz);
  // vrad (vertical semi-axis, distinct from draft) is what main.js uses to rest the rendered boulder's centre one radius above the terrain
  return { mb, len: 2 * rMax, rad: rMax, draft: ry * 2.2, vrad: ry, vol: (4 / 3) * Math.PI * rx * ry * rz };
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
    // landslide boulders — see OBSTACLES.kinds.boulder in config.js
    boulderMedium: buildBoulder(9, 1.1),
    boulderLarge:  buildBoulder(10, 1.9),
  };
}

// ---------- natural land bridges ----------
// Geometry for one bridge descriptor from generateRiver() (river.js), sampled directly from the
// descriptor's analytic surface so the rendered deck matches what props stand on and the collision
// code tests against. Vertex "colour" isn't a colour: .x is a rock mask, .y is baked AO — consumed
// by fsBridge (shaders.js).
function emitTube(mb, rings, cols, cens, caps) {
  const nS = rings.length - 1, M = rings[0].length, N = [];
  for (let si = 0; si <= nS; si++) {
    const row = [];
    for (let k = 0; k < M; k++) {
      const a = rings[Math.min(si + 1, nS)][k], b = rings[Math.max(si - 1, 0)][k];
      const c = rings[si][(k + 1) % M], d = rings[si][(k - 1 + M) % M];
      let n = v3.norm(v3.cross(v3.sub(a, b), v3.sub(c, d)));
      if (v3.dot(n, v3.sub(rings[si][k], cens[si])) < 0) n = v3.scale(n, -1);
      row.push(n);
    }
    N.push(row);
  }
  const V = (si, k) => mb.vert(rings[si][k], N[si][k], cols[si][k]);
  for (let si = 0; si < nS; si++) for (let k = 0; k < M; k++) {
    const k2 = (k + 1) % M;
    V(si, k); V(si, k2); V(si + 1, k2);
    V(si, k); V(si + 1, k2); V(si + 1, k);
  }
  if (caps) {
    const axis = v3.norm(v3.sub(cens[nS], cens[0]));
    for (const [si, sg] of [[0, -1], [nS, 1]]) {
      const n = v3.scale(axis, sg), c = cens[si], col = [1, 0.3, 0];
      for (let k = 0; k < M; k++) { mb.vert(c, n, col); mb.vert(rings[si][k], n, col); mb.vert(rings[si][(k + 1) % M], n, col); }
    }
  }
}
export function buildLandBridgeMesh(br) {
  const mb = new MeshBuilder(), rough = br.cfg.roughness, M = 30;
  const nS = clamp(Math.ceil(br.span / 0.5), 24, 160);
  const rings = [], cols = [], cens = [];
  for (let si = 0; si <= nS; si++) {
    const s = si / nS, x = br.xa + s * br.span, zc = br.zc(s), hw = br.hwB(s), th = br.thick(s);
    const cen = [x, br.topAt(s, 0, x, zc) - th * 0.35, zc];
    const ring = [], col = [];
    for (let k = 0; k < M; k++) {
      const a = 2 * Math.PI * k / M, ca = Math.cos(a), sa = Math.sin(a);
      if (sa >= -1e-9) {
        const u = ca, z = zc + u * hw;
        ring.push([x, br.topAt(s, u, x, z), z]);
        col.push([clamp((Math.abs(u) - 0.7) / 0.3, 0, 1), 0, 0]);
      } else {
        const e = 2 / 2.6, u = Math.sign(ca) * Math.pow(Math.abs(ca), e), v = Math.pow(-sa, e);
        const z0 = zc + u * hw, y0 = br.topAt(s, u, x, z0) - v * th;
        const nz = vnoise3(x * 0.45, y0 * 0.45, z0 * 0.45, br.seed + 7) * 2 - 1;
        const nf = vnoise3(x * 1.7 + 3, y0 * 1.7, z0 * 1.7 + 9, br.seed + 8) * 2 - 1;
        const disp = rough * (0.18 + 0.06 * th) * (0.7 * nz + 0.4 * nf) * Math.min(1, 0.15 + 2.5 * v);
        const dz = z0 - cen[2], dy = y0 - cen[1], dl = Math.hypot(dz, dy) || 1;
        ring.push([x, y0 + disp * dy / dl, z0 + disp * dz / dl]);
        col.push([1, 0.9 * v * v, 0]);
      }
    }
    rings.push(ring); cols.push(col); cens.push(cen);
  }
  emitTube(mb, rings, cols, cens, true);
  // pillars: stacked elliptical rings from below the bed to inside the arch, roughened by noise and slightly twisted/leaning
  for (const pl of br.pillars) {
    const nL = clamp(Math.ceil(pl.h / 0.35), 6, 70);
    const Mp = clamp(Math.round(Math.max(pl.rx, pl.rz) * 12), 16, 48), pr = [], pc = [], pcen = [];
    for (let li = 0; li <= nL; li++) {
      const fy = li / nL, y = pl.yBase + fy * pl.h;
      const cx = pl.x + pl.lean[0] * fy * pl.h, cz = pl.z + pl.lean[1] * fy * pl.h, k0 = br.pillarK(pl, fy);
      const ring = [], col = [];
      for (let k = 0; k < Mp; k++) {
        const a = 2 * Math.PI * k / Mp + pl.twist * fy, ca = Math.cos(a), sa = Math.sin(a);
        const nl = vnoise3(ca * 0.8 + 3, y * 0.25, sa * 0.8, pl.seed + 2) * 2 - 1;
        const nr = vnoise3(ca * 1.3 + 7, y * 0.7, sa * 1.3, pl.seed) * 2 - 1;
        const nf = vnoise3(ca * 3.5, y * 2.2, sa * 3.5 + 5, pl.seed + 1) * 2 - 1;
        const kk = k0 * (1 + pl.irregular * (0.12 * nl + 0.16 * nr + 0.07 * nf));
        const lx = pl.rx * kk * ca, lz = pl.rz * kk * sa;   // pillar frame → world
        ring.push([cx + lx * pl.cy - lz * pl.sy, y, cz + lx * pl.sy + lz * pl.cy]);
        col.push([1, 0.55 * fy * fy, 0]);
      }
      pr.push(ring); pc.push(col); pcen.push([cx, y, cz]);
    }
    emitTube(mb, pr, pc, pcen, true);
  }
  return mb;
}

// ---------- built (road) bridges ----------
// Rectangular prism between two cross-sections (cx, cz, hx, hz) at y0/y1, rotated by yaw — the one
// primitive every part of a built bridge is made of. Winding doesn't matter: fsMesh flips normals toward the viewer.
function addPrism(mb, y0, y1, s0, s1, yaw, colSide, colTop, colBot) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const pt = (s, y, sx, sz) => { const lx = sx * s.hx, lz = sz * s.hz; return [s.cx + lx * cy - lz * sy, y, s.cz + lx * sy + lz * cy]; };
  const cr = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let k = 0; k < 4; k++) {
    const a = cr[k], b = cr[(k + 1) % 4];
    mb.quad(pt(s0, y0, a[0], a[1]), pt(s0, y0, b[0], b[1]), pt(s1, y1, b[0], b[1]), pt(s1, y1, a[0], a[1]), colSide);
  }
  if (colTop) mb.quad(pt(s1, y1, -1, -1), pt(s1, y1, 1, -1), pt(s1, y1, 1, 1), pt(s1, y1, -1, 1), colTop);
  if (colBot) mb.quad(pt(s0, y0, -1, 1), pt(s0, y0, 1, 1), pt(s0, y0, 1, -1), pt(s0, y0, -1, -1), colBot);
}
const addBox = (mb, cx, cz, hx, hz, y0, y1, colSide, colTop, colBot, yaw = 0) =>
  addPrism(mb, y0, y1, { cx, cz, hx, hz }, { cx, cz, hx, hz }, yaw, colSide, colTop, colBot);
// Geometry for one built-bridge descriptor from generateRiver(). Colours come from BRIDGE_MATERIALS;
// drawn with the ordinary prop shader since a road bridge doesn't take the biome's rock/grass shading.
export function buildBuiltBridgeMesh(br) {
  const mb = new MeshBuilder(), C = br.cfg, M = br.mat;
  const hw = br.halfW, zb = br.z, yD = br.yDeck, sB = br.slabBottom, yU = br.yUnder;
  const cw = Math.max(hw - C.railThick, hw * 0.5);   // carriageway half-width, inside the parapets
  const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
  const hash = n => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
  // ---- road surface ----
  const step = M.planks ? 0.45 : 2.0;
  let n = 0;
  for (let x = br.roadX0; x < br.roadX1 - 1e-6; x += step, n++) {
    const x1 = Math.min(x + step, br.roadX1);
    const f = M.planks ? (n % 2 ? 0.9 : 1.08) * (0.96 + 0.08 * hash(n)) : 1 + (hash(n) - 0.5) * 0.06;
    mb.quad([x, yD, zb - cw], [x1, yD, zb - cw], [x1, yD, zb + cw], [x, yD, zb + cw], shade(M.road, f));
  }
  for (const s of [-1, 1])   // skirts hide the seam where road meets graded shoulder
    mb.quad([br.roadX0, yD, zb + s * hw], [br.roadX1, yD, zb + s * hw],
            [br.roadX1, yD - 0.35, zb + s * hw], [br.roadX0, yD - 0.35, zb + s * hw], shade(M.side, 0.95));
  if (C.roadLine && M.line[0] + M.line[1] + M.line[2] > 0.05)
    for (let x = br.roadX0; x < br.roadX1; x += 5) {
      const x1 = Math.min(x + 2, br.roadX1);
      mb.quad([x, yD + 0.02, zb - 0.08], [x1, yD + 0.02, zb - 0.08], [x1, yD + 0.02, zb + 0.08], [x, yD + 0.02, zb + 0.08], M.line);
    }
  // ---- the span itself ----
  const cxm = (br.xa + br.xb) / 2, hxm = br.span / 2;
  addBox(mb, cxm, zb, hxm, hw, sB, yD - 0.015, M.side, null, M.soffit);         // deck slab + fascia
  if (br.yUnder < sB - 1e-3 && M.girders > 0) {                                  // girders in the remaining depth
    const G = M.girders;
    for (let g = 0; g < G; g++) {
      const cz = zb + (G > 1 ? (g / (G - 1) * 2 - 1) : 0) * (hw - 0.5);
      addBox(mb, cxm, cz, hxm, 0.12, yU, sB, shade(M.soffit, 1.08), null, shade(M.soffit, 0.92));
    }
    if (M.planks) for (let x = br.xa + 1.2; x < br.xb; x += 2.5)                 // timber cross beams
      addBox(mb, x, zb, 0.09, hw - 0.4, yU + 0.02, yU + 0.2, shade(M.soffit, 1.04), null, shade(M.soffit, 0.9));
  }
  // abutments
  for (const ab of br.abuts) {
    if (ab.x1 - ab.x0 < 0.2) continue;
    addBox(mb, (ab.x0 + ab.x1) / 2, zb, (ab.x1 - ab.x0) / 2, hw, ab.yBase, sB, M.pylon, null, null);
  }
  // parapets / railings, carried a short way onto the approaches
  const rx0 = Math.max(br.roadX0, br.xa - 4), rx1 = Math.min(br.roadX1, br.xb + 4), rt = C.railThick / 2;
  if (C.rail > 0.01) for (const s of [-1, 1]) {
    const cz = zb + s * (hw - rt);
    if (M.railStyle === 'parapet') {
      for (let x = rx0; x < rx1 - 1e-6; x += 1.5) {                               // segmented, so stone reads as blocks
        const x1 = Math.min(x + 1.5, rx1), v = 1 + (hash(x * 3.7 + s) - 0.5) * 2 * M.blockVar;
        addBox(mb, (x + x1) / 2, cz, (x1 - x) / 2, rt, yD, yD + C.rail, shade(M.rail, v), shade(M.rail, v * 1.1), null);
      }
    } else {
      for (let x = rx0; x < rx1; x += 2.2) addBox(mb, x, cz, 0.09, 0.09, yD, yD + C.rail, M.rail, shade(M.rail, 1.1), null);
      for (const hy of [C.rail - 0.07, C.rail * 0.55])
        addBox(mb, (rx0 + rx1) / 2, cz, (rx1 - rx0) / 2, 0.06, yD + hy - 0.06, yD + hy, M.rail, shade(M.rail, 1.1), null);
    }
  }
  // pylons: straight rectangular piers — widened footing at the bed, a slight batter up the shaft,
  // a pier cap under the deck
  for (const pl of br.pillars) {
    addBox(mb, pl.cx, pl.cz, pl.hxFoot, pl.hzFoot, pl.yBase, pl.footTop, shade(M.pylon, 0.92), null, null, pl.yaw);
    const capBot = Math.max(pl.footTop, pl.yTop - pl.cap);
    addPrism(mb, pl.footTop, capBot,
      { cx: pl.cx, cz: pl.cz, hx: pl.hx, hz: pl.hz },
      { cx: pl.cx, cz: pl.cz, hx: pl.hx * (1 - pl.taper), hz: pl.hz * (1 - pl.taper) },
      pl.yaw, M.pylon, null, null);
    if (pl.cap > 0.01) addBox(mb, pl.cx, pl.cz, pl.hx + 0.25, pl.hz + 0.25, capBot, pl.yTop, shade(M.pylon, 1.06), null, shade(M.pylon, 0.9), pl.yaw);
  }
  return mb;
}