// Static scenery: vegetation/rock/grass instancing (sorted by Z so the draw window is one
// contiguous run), finish poles, and the per-river bridge meshes.
import { VEG, BIOMES, RENDER } from './config.js';
import { mat4TRS, mulberry32, clamp } from './math.js';
import { nearestChan } from './river.js';
import { buildLandBridgeMesh, buildBuiltBridgeMesh } from './meshes.js';
import { S } from './state.js';
import { gpu, gpuMesh, instBuf } from './gpu.js';
import { terrainH, terrainN, rowOf } from './sampling.js';
import { W, L, dx } from './quality.js';

const TWO_PI = 2 * Math.PI;

export const instBufs = {};   // mesh name → { buf, count, zs }

export function writeInstances(name, list) {
  list.sort((a, b) => a.z - b.z);   // by downstream position, so a Z window is one contiguous run
  const d = new Float32Array(list.length * 20), zs = new Float32Array(list.length);
  list.forEach((inst, n) => {
    d.set(inst.m, n * 20);
    d.set(inst.tint, n * 20 + 16);
    zs[n] = inst.z;
  });
  if (instBufs[name]) instBufs[name].buf.destroy();
  const buf = instBuf(list.length);
  if (d.length) gpu.device.queue.writeBuffer(buf, 0, d);
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

// [first, count] of the instances standing on terrain that's drawn this frame (same window as
// render.lodSlices); the small inset keeps nothing sitting on the last seam
export function instRange(ib, zk) {
  const first = lowerBound(ib.zs, zk - RENDER.viewBehind);
  const end = lowerBound(ib.zs, zk + RENDER.viewAhead - 0.5);
  return [first, end - first];
}

const ROLE_SIZE = { tree: [0.8, 1.7], bush: [0.6, 1.4], rock: [0.4, 1.4], grass: [0.6, 1.4], boulder: [1.6, 3.0] };
const ROLE_TINT = {
  tree: g => [g * 0.9, g, g * 0.9],
  bush: g => [g, g * 1.05, g * 0.9],
  rock: g => [g, g, g],
  boulder: g => [g * 0.95, g * 0.93, g * 0.9],
  grass: g => [g, 1, 0.9 * g],
};

// weighted pick among a mix table's roles; weights need not sum to 1 — the remainder is "nothing"
function pickRole(mix, r) {
  let acc = 0;
  for (const role in mix) {
    acc += mix[role];
    if (r < acc) return role;
  }
  return null;
}

// collects prop instances per mesh name, honouring the biome's per-role caps
function makePropPlacer(rng, biome) {
  const lists = Object.fromEntries(Object.keys(gpu.vegMeshes).filter(k => k !== 'pole').map(k => [k, []]));
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
      m: mat4TRS([x, y, z], rng() * TWO_PI, [sc, sc * (0.85 + 0.3 * rng()), sc]),
      tint: [tint[0] * bt[0], tint[1] * bt[1], tint[2] * bt[2], 1],
    });
  };
  return { lists, push };
}

// land bridges are seeded first, before the open-ground pass can exhaust a role's cap: the deck
// top gets the biome's open-ground mix at about the same density as the rest of the world
// (0.6 tries/m²), kept a little inside the rim so nothing overhangs the edge
function placeBridgeProps(rng, biome, push) {
  for (const br of S.river.bridges) {
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

function placeOpenGround(rng, biome, push) {
  const river = S.river;
  for (let n = 0; n < VEG.attempts; n++) {
    const x = rng() * W * dx, z = rng() * L * dx;
    const row = nearestChan(river.rows[rowOf(z)], x);
    const ad = Math.abs((x - row.c) / row.hw);
    if (ad < 1.25) continue;                                   // in or too near the channel
    const y = terrainH(x, z);
    if (y < row.eta + 0.35) continue;                          // would stand in the water
    // nothing under a bridge deck, and nothing on a road bridge's graded road corridor
    if (river.bridges.some(br => (br.roadBlock && br.roadBlock(x, z)) ||
      (Math.abs(z - br.z) <= br.reach && br.at(x, z)))) continue;
    const nrm = terrainN(x, z), m = (ad - 1) * row.hw, r = rng();
    const mixTable = nrm[1] < 0.72 ? biome.mix.steep : m < 3 ? biome.mix.bank : biome.mix.open;
    const role = pickRole(mixTable, r);
    if (role) push(role, x, z);
  }
}

function placeFinishPoles() {
  const river = S.river;
  const rowf = river.rows[rowOf(river.finishZ)][0], z = river.finishZ;
  const poles = [-1, 1].map(s => {
    const x = rowf.c + s * (rowf.hw + 1.5);
    return { z, m: mat4TRS([x, terrainH(x, z), z], s > 0 ? Math.PI : 0, [1, 1, 1]), tint: [1, 1, 1, 1] };
  });
  writeInstances('pole', poles);
}

export function placeVegetation() {
  const river = S.river;
  const rng = mulberry32(river.seed + 99);
  const biome = BIOMES[river.R.biome || 'alpine'];
  const { lists, push } = makePropPlacer(rng, biome);
  placeBridgeProps(rng, biome, push);
  placeOpenGround(rng, biome, push);
  for (const [k, v] of Object.entries(lists)) writeInstances(k, v);
  placeFinishPoles();
}

// ---- bridges: one vertex buffer per land bridge, one mesh + single instance per road bridge ----
export const scenery = { bridgeGpu: [], builtGpu: [] };

export function buildBridgeScenery() {
  for (const bm of scenery.bridgeGpu) bm.vbuf.destroy();
  for (const bm of scenery.builtGpu) {
    bm.vbuf.destroy();
    bm.inst.destroy();
  }
  const bridges = S.river.bridges;
  scenery.bridgeGpu = bridges.filter(br => !br.built)
    .map(br => ({ ...gpuMesh(buildLandBridgeMesh(br)), zMin: br.zMin, zMax: br.zMax }));
  scenery.builtGpu = bridges.filter(br => br.built).map(br => {
    const inst = instBuf(1);
    const d = new Float32Array(20);
    d.set(mat4TRS([0, 0, 0], 0, [1, 1, 1]), 0);
    d.set([br.tint[0], br.tint[1], br.tint[2], 1], 16);
    gpu.device.queue.writeBuffer(inst, 0, d);
    return { ...gpuMesh(buildBuiltBridgeMesh(br)), inst, zMin: br.zMin, zMax: br.zMax };
  });
}