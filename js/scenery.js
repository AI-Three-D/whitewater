// Per-river static dressing: vegetation/rock instances, finish poles and the bridge meshes.
import { GRID, VEG, BIOMES, RENDER } from './config.js';
import { mulberry32, mat4TRS, clamp } from './math.js';
import { nearestChan } from './river.js';
import { buildLandBridgeMesh, buildBuiltBridgeMesh } from './meshes.js';
import { G } from './state.js';
import { gpu } from './gpu.js';
import { meshes } from './assets.js';
import { terrainH, terrainN, rowOf } from './sampling.js';

const { W, L, dx } = GRID;
const TAU = 6.2832;

// ---------- instance buffers ----------
export const instBufs = {};   // per vegetation mesh: { buf, count, zs } — sorted by z, see writeInstances

function writeInstances(name, list) {
  list.sort((a, b) => a.z - b.z);   // by downstream position, so a Z window is one contiguous run
  const d = new Float32Array(list.length * 20), zs = new Float32Array(list.length);
  list.forEach((inst, n) => {
    d.set(inst.m, n * 20);
    d.set(inst.tint, n * 20 + 16);
    zs[n] = inst.z;
  });
  if (instBufs[name]) instBufs[name].buf.destroy();
  const buf = gpu.instBuf(list.length);
  if (d.length) gpu.write(buf, 0, d);
  instBufs[name] = { buf, count: list.length, zs };
}

// first index whose z >= value (zs is sorted)
function lowerBound(zs, v) {
  let lo = 0, hi = zs.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (zs[m] < v) lo = m + 1; else hi = m;
  }
  return lo;
}

// [first, count] of the instances standing on terrain that's drawn this frame (same window as lodSlices)
export function instRange(ib, zk) {
  const first = lowerBound(ib.zs, zk - RENDER.viewBehind);
  const end = lowerBound(ib.zs, zk + RENDER.viewAhead - 0.5);   // small inset so nothing sits on the last seam
  return [first, end - first];
}

// ---------- vegetation ----------
const ROLE_SIZE = { tree: [0.8, 1.7], bush: [0.6, 1.4], rock: [0.4, 1.4], grass: [0.6, 1.4], boulder: [1.6, 3.0] };
const ROLE_TINT = {
  tree: g => [g * 0.9, g, g * 0.9],
  bush: g => [g, g * 1.05, g * 0.9],
  rock: g => [g, g, g],
  boulder: g => [g * 0.95, g * 0.93, g * 0.9],
  grass: g => [g, 1, 0.9 * g],
};

// weighted pick among a mix table's roles; weights need not sum to 1 — the remainder is "place nothing"
function pickRole(mix, r) {
  let acc = 0;
  for (const role in mix) {
    acc += mix[role];
    if (r < acc) return role;
  }
  return null;
}

export function placeVegetation() {
  const river = G.river;
  const rng = mulberry32(river.seed + 99);
  const biome = BIOMES[river.R.biome || 'alpine'];
  const lists = Object.fromEntries(Object.keys(meshes.veg).filter(k => k !== 'pole').map(k => [k, []]));
  const caps = Object.fromEntries(Object.entries(VEG.caps).map(([k, v]) => [k, Math.round(v * biome.vegDensity[k])]));

  // yOverride: a prop standing on a land bridge's deck rather than on the terrain heightfield
  const push = (role, x, z, yOverride) => {
    const spec = biome.props[role];
    const meshName = Array.isArray(spec) ? spec[Math.floor(rng() * spec.length)] : spec;
    if (!meshName || lists[meshName].length >= caps[role]) return;
    const [lo, hi] = ROLE_SIZE[role], sc = lo + rng() * (hi - lo);
    const g = 0.8 + 0.4 * rng(), tint = ROLE_TINT[role](g), bt = biome.vegTint[role];
    const y = (yOverride ?? terrainH(x, z)) - 0.05;
    lists[meshName].push({
      z,
      m: mat4TRS([x, y, z], rng() * TAU, [sc, sc * (0.85 + 0.3 * rng()), sc]),
      tint: [tint[0] * bt[0], tint[1] * bt[1], tint[2] * bt[2], 1],
    });
  };

  placeBridgeProps(river, biome, rng, push);   // first, before the open-ground pass can exhaust a role's cap
  placeOpenProps(river, biome, rng, push);
  for (const [k, v] of Object.entries(lists)) writeInstances(k, v);
  placeFinishPoles(river);
}

// the deck top is sampled with the biome's open-ground mix at about the same density as the rest
// of the world (0.6 tries/m²), kept a little inside the rim so nothing overhangs the edge
function placeBridgeProps(river, biome, rng, push) {
  for (const br of river.bridges) {
    if (br.noProps) continue;
    const C = br.cfg, open = biome.mix.open;
    const mixTable = biome.mix.bridge || {
      ...open,
      tree: (open.tree || 0) * C.treeScale,
      rock: (open.rock || 0) * C.rockScale,
      grass: (open.grass || 0) * C.grassScale,
    };
    const tries = Math.round(br.span * C.width * (1 + C.flare * 0.3) * C.propDensity);
    for (let n = 0; n < tries; n++) {
      const s = 0.03 + rng() * 0.94, u = (rng() * 2 - 1) * 0.85;
      const x = br.xa + s * br.span, z = br.zc(s) + u * br.hwB(s);
      const role = pickRole(mixTable, rng());
      if (role) push(role, x, z, br.topAt(s, u, x, z));
    }
  }
}

function placeOpenProps(river, biome, rng, push) {
  for (let n = 0; n < VEG.attempts; n++) {
    const x = rng() * W * dx, z = rng() * L * dx, row = nearestChan(river.rows[rowOf(z)], x);
    const ad = Math.abs((x - row.c) / row.hw);
    if (ad < 1.25) continue;
    const y = terrainH(x, z);
    if (y < row.eta + 0.35) continue;
    // nothing under a bridge deck, and nothing on a road bridge's graded road corridor
    if (river.bridges.some(br => (br.roadBlock && br.roadBlock(x, z)) || (Math.abs(z - br.z) <= br.reach && br.at(x, z)))) continue;
    const nrm = terrainN(x, z), m = (ad - 1) * row.hw, r = rng();
    const mixTable = nrm[1] < 0.72 ? biome.mix.steep : m < 3 ? biome.mix.bank : biome.mix.open;
    const role = pickRole(mixTable, r);
    if (role) push(role, x, z);
  }
}

function placeFinishPoles(river) {
  const rowf = river.rows[rowOf(river.finishZ)][0], z = river.finishZ, poles = [];
  for (const s of [-1, 1]) {
    const x = rowf.c + s * (rowf.hw + 1.5);
    poles.push({ z, m: mat4TRS([x, terrainH(x, z), z], s > 0 ? Math.PI : 0, [1, 1, 1]), tint: [1, 1, 1, 1] });
  }
  writeInstances('pole', poles);
}

// ---------- bridges ----------
export const bridges = {
  land: [],    // { vbuf, count, zMin, zMax } per land bridge of the current river
  built: [],   // { vbuf, count, inst, zMin, zMax } per road bridge
};

export function buildBridgeGpu(river) {
  for (const bm of bridges.land) bm.vbuf.destroy();
  for (const bm of bridges.built) { bm.vbuf.destroy(); bm.inst.destroy(); }
  bridges.land = river.bridges.filter(br => !br.built)
    .map(br => ({ ...gpu.gpuMesh(buildLandBridgeMesh(br)), zMin: br.zMin, zMax: br.zMax }));
  bridges.built = river.bridges.filter(br => br.built).map(br => {
    const inst = gpu.instBuf(1), d = new Float32Array(20);
    d.set(mat4TRS([0, 0, 0], 0, [1, 1, 1]), 0);
    d.set([br.tint[0], br.tint[1], br.tint[2], 1], 16);
    gpu.write(inst, 0, d);
    return { ...gpu.gpuMesh(buildBuiltBridgeMesh(br)), inst, zMin: br.zMin, zMax: br.zMax };
  });
}