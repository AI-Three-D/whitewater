// Position-dependent river features the editor places by clicking: one descriptor per kind mapping
// the config's arrays/objects onto a uniform interface — storage (items/insert/remove), marker
// position (z/setZ, span for stretch features), a factory (make) and the parameter sliders shown
// in the panel when selected. Shared by editor.js (markers, placement, drag) and editorPanel.js.
import { LAND_BRIDGE, BUILT_BRIDGE, BRIDGE_MATERIALS } from './config/index.js';

// control-spec helpers, also used by editorPanel for the global sections
export const sld = (label, get, set, min, max, step, fmt, log = false) =>
  ({ kind: 'slider', label, get, set, min, max, step: step ?? (max - min) / 100, fmt, log });
export const sel = (label, get, set, options) => ({ kind: 'select', label, get, set, options });
export const chk = (label, get, set) => ({ kind: 'check', label, get, set });

// storage adapters: a config array (ledges, forks, …) or a single optional object (pond, vortex, …)
const arr = key => ({
  items: cfg => cfg[key] || [],
  insert: (cfg, it) => { (cfg[key] = cfg[key] || []).push(it); },
  remove: (cfg, i) => { cfg[key].splice(i, 1); if (!cfg[key].length) delete cfg[key]; },
});
const single = key => ({
  items: cfg => (cfg[key] ? [cfg[key]] : []),
  insert: (cfg, it) => { cfg[key] = it; },
  remove: cfg => { delete cfg[key]; },
  max1: true,
});

const rz = z => Math.round(z);

export const FEATURES = {
  ledge: {
    label: 'Ledge', icon: '⬇', color: [1, 0.8, 0.2],
    storage: arr('ledges'),
    make: z => [rz(z), 0.6],
    z: it => it[0], setZ: (it, z) => { it[0] = rz(z); },
    params: it => [sld('drop (m)', () => it[1], v => { it[1] = v; }, 0.1, 2, 0.05)],
  },
  waterfall: {
    label: 'Waterfall', icon: '💧', color: [0.3, 0.85, 1],
    storage: arr('waterfalls'),
    make: z => ({ z: rz(z), drop: 3, len: 5 }),
    z: it => it.z, setZ: (it, z) => { it.z = rz(z); },
    params: it => [
      sld('drop (m)', () => it.drop, v => { it.drop = v; }, 0.5, 10, 0.25),
      sld('run length (m)', () => it.len ?? 5, v => { it.len = v; }, 2, 14, 0.5),
      sld('pinch', () => it.pinch ?? Math.min(0.3, it.drop / 14), v => { it.pinch = v; }, 0, 0.7, 0.02),
    ],
  },
  band: {
    label: 'Drop band', icon: '📉', color: [0.7, 0.5, 1],
    storage: arr('bands'),
    make: z => ({ z0: rz(z), z1: rz(z) + 50, drop: 5 }),
    z: it => it.z0, setZ: (it, z) => { const len = it.z1 - it.z0; it.z0 = rz(z); it.z1 = it.z0 + len; },
    span: it => [it.z0, it.z1],
    params: it => [
      sld('length (m)', () => it.z1 - it.z0, v => { it.z1 = it.z0 + Math.round(v); }, 10, 150, 5, v => v.toFixed(0)),
      sld('total drop (m)', () => it.drop, v => { it.drop = v; }, 1, 20, 0.5),
    ],
  },
  fork: {
    label: 'Fork', icon: '🔀', color: [0.35, 0.9, 0.4],
    storage: arr('forks'),
    make: z => ({ startZ: rz(z), mergeZ: rz(z) + 70, splitLen: 25, mergeLen: 25, separation: 20, widthScale: 0.72, shares: [0.5, 0.5] }),
    z: it => it.startZ, setZ: (it, z) => { const len = it.mergeZ - it.startZ; it.startZ = rz(z); it.mergeZ = it.startZ + len; },
    span: it => [it.startZ, it.mergeZ],
    params: it => [
      sld('length (m)', () => it.mergeZ - it.startZ, v => { it.mergeZ = it.startZ + Math.round(v); }, 30, 220, 5, v => v.toFixed(0)),
      sld('separation (m)', () => it.separation ?? 20, v => { it.separation = v; }, 8, 40, 1),
      sld('branch width scale', () => it.widthScale ?? 0.72, v => { it.widthScale = v; }, 0.4, 1, 0.02),
      sld('left share', () => (it.shares ?? [0.5, 0.5])[0], v => { it.shares = [v, +(1 - v).toFixed(2)]; }, 0.2, 0.8, 0.05),
      sld('split length (m)', () => it.splitLen ?? 25, v => { it.splitLen = v; }, 10, 40, 1),
      sld('merge length (m)', () => it.mergeLen ?? 25, v => { it.mergeLen = v; }, 10, 40, 1),
    ],
  },
  pond: {
    label: 'Pond', icon: '🫧', color: [0.3, 0.55, 1],
    storage: single('pond'),
    make: z => ({ z: rz(z), len: 30 }),
    z: it => it.z, setZ: (it, z) => { it.z = rz(z); },
    span: it => [it.z - it.len / 2, it.z + it.len / 2],
    params: it => [
      sld('length (m)', () => it.len, v => { it.len = v; }, 10, 120, 5, v => v.toFixed(0)),
      sld('width multiplier', () => it.widthMult ?? 4, v => { it.widthMult = v; }, 1, 8, 0.25),
      sld('exit tail (m)', () => it.exitTail ?? 15, v => { it.exitTail = v; }, 5, 60, 1),
    ],
  },
  island: {
    label: 'Boulder island', icon: '⛰', color: [0.7, 0.55, 0.35],
    storage: arr('boulderIslands'),
    make: z => ({ z: rz(z), len: 8, widthFrac: 0.55, bias: 0 }),
    z: it => it.z, setZ: (it, z) => { it.z = rz(z); },
    params: it => [
      sld('length (m)', () => it.len ?? 8, v => { it.len = v; }, 4, 20, 1),
      sld('width fraction', () => it.widthFrac ?? 0.55, v => { it.widthFrac = v; }, 0.2, 0.8, 0.02),
      sld('side bias', () => it.bias ?? 0, v => { it.bias = v; }, -1, 1, 0.05),
    ],
  },
  landBridge: {
    label: 'Land bridge', icon: '🌉', color: [0.75, 0.75, 0.7],
    storage: arr('landBridges'),
    make: z => ({ z: rz(z), width: 7, height: 3.5, pillars: 1 }),
    z: it => it.z, setZ: (it, z) => { it.z = rz(z); },
    // count = auto-spread columns (generateRiver may trim it if the channel's too narrow — the
    // editor surfaces that as a build warning); array = hand-placed, edited via the panel's column list
    columns: { key: 'pillars', label: 'pillar', max: LAND_BRIDGE.maxPillars, template: LAND_BRIDGE.pillar, fields: ['along', 'across', 'radius', 'yaw'] },
    params: it => [
      sld('width (m)', () => it.width ?? LAND_BRIDGE.width, v => { it.width = v; }, 2, 20, 0.5),
      sld('clearance (m)', () => it.height ?? LAND_BRIDGE.height, v => { it.height = v; }, 1.5, 12, 0.25),
      sld('width variation', () => it.widthVar ?? LAND_BRIDGE.widthVar, v => { it.widthVar = v; }, 0, 1, 0.05),
      sld('thickness (m)', () => it.thickness ?? LAND_BRIDGE.thickness, v => { it.thickness = v; }, 0.4, 5, 0.1),
      sld('rise (m)', () => it.rise ?? LAND_BRIDGE.rise, v => { it.rise = v; }, 0, 3, 0.1),
      sld('roughness', () => it.roughness ?? LAND_BRIDGE.roughness, v => { it.roughness = v; }, 0, 2.5, 0.1),
      sld('wander', () => it.wander ?? LAND_BRIDGE.wander, v => { it.wander = v; }, 0, 3, 0.1),
      sld('flare', () => it.flare ?? LAND_BRIDGE.flare, v => { it.flare = v; }, 0, 2, 0.05),
    ],
  },
  builtBridge: {
    label: 'Road bridge', icon: '🛣', color: [0.55, 0.6, 0.68],
    storage: arr('builtBridges'),
    make: z => ({ z: rz(z), material: 'concrete', width: 7, height: 4, pylons: 2 }),
    z: it => it.z, setZ: (it, z) => { it.z = rz(z); },
    columns: { key: 'pylons', label: 'pylon', max: BUILT_BRIDGE.maxPylons, template: BUILT_BRIDGE.pylon, fields: ['along', 'across', 'sizeAlong', 'sizeAcross', 'yaw'] },
    params: it => [
      sel('material', () => it.material ?? BUILT_BRIDGE.material, v => { it.material = v; }, Object.keys(BRIDGE_MATERIALS)),
      sld('width (m)', () => it.width ?? BUILT_BRIDGE.width, v => { it.width = v; }, 2, 20, 0.5),
      sld('clearance (m)', () => it.height ?? BUILT_BRIDGE.height, v => { it.height = v; }, 1.5, 15, 0.25),
      sld('deck thickness (m)', () => it.thickness ?? BUILT_BRIDGE.thickness, v => {
        it.thickness = v;
        if ((it.slab ?? BUILT_BRIDGE.slab) > v) it.slab = v;
      }, 0.2, 4, 0.1),
      sld('slab (m)', () => Math.min(it.slab ?? BUILT_BRIDGE.slab, it.thickness ?? BUILT_BRIDGE.thickness),
        v => { it.slab = Math.min(v, it.thickness ?? BUILT_BRIDGE.thickness); }, 0.1, 4, 0.05),
      sld('railing (m)', () => it.rail ?? BUILT_BRIDGE.rail, v => { it.rail = v; }, 0, 2.5, 0.05),
      sld('shoulder (m)', () => it.shoulder ?? BUILT_BRIDGE.shoulder, v => { it.shoulder = v; }, 1, 20, 0.5),
      sld('abutment ext. (m)', () => it.abutExt ?? BUILT_BRIDGE.abutExt, v => { it.abutExt = v; }, 0, 20, 0.5),
    ],
  },
  vortex: {
    label: 'Vortex', icon: '🌀', color: [1, 0.4, 0.9],
    storage: single('vortex'),
    make: (z, pick) => ({ x: +pick.x.toFixed(1), z: rz(z), strength: 3, radius: 8 }),
    z: it => it.z,
    setZ: (it, z, pick) => { it.z = rz(z); if (pick) it.x = +pick.x.toFixed(1); },   // the one marker that also moves in x
    params: it => [
      sld('strength', () => it.strength, v => { it.strength = v; }, 0.5, 12, 0.25),
      sld('radius (m)', () => it.radius, v => { it.radius = v; }, 2, 25, 0.5),
    ],
  },
  landslideZone: {
    label: 'Landslide zone', icon: '🪨', color: [1, 0.45, 0.3],
    storage: single('landslideZone'),
    make: z => ({ from: rz(z), to: rz(z) + 120, count: 20, activeChance: 0.35 }),
    z: it => it.from, setZ: (it, z) => { const len = it.to - it.from; it.from = rz(z); it.to = it.from + len; },
    span: it => [it.from, it.to],
    params: it => [
      sld('length (m)', () => it.to - it.from, v => { it.to = it.from + Math.round(v); }, 30, 350, 10, v => v.toFixed(0)),
      sld('spots', () => it.count, v => { it.count = v; }, 2, 60, 1),
      sld('active chance', () => it.activeChance, v => { it.activeChance = v; }, 0, 1, 0.05),
    ],
  },
};
export const FEATURE_ORDER = Object.keys(FEATURES);