import { v3, vnoise3 } from './math.js';

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
    const a = 6.2832 * (ai + 0.5) / m, col = Math.sin(a) >= 0 ? [0.92, 0.22, 0.12] : [0.55, 0.09, 0.06];
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
// rolled scroll/map — a short parchment-tinted cylinder with a darker ribbon band round the middle
export function buildMapMesh() {
  const mb = new MeshBuilder(), parchment = [0.85, 0.72, 0.45], ribbon = [0.55, 0.32, 0.18];
  addCylinder(mb, [-0.32, 0, 0], [0.32, 0, 0], 0.16, 0.16, 12, parchment);
  addCylinder(mb, [-0.04, 0, 0], [0.04, 0, 0], 0.175, 0.175, 12, ribbon);
  return mb;
}
export function buildVegetationMeshes() {
  const M = {};
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
  return M;
}