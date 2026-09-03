export const GRID = { W: 256, L: 1024, dx: 0.5 };

export const SIM = {
  dt: 1 / 120, substeps: 2, g: 9.81, hmin: 0.02, umax: 12.0,
  turbA: 0.7,           // stochastic forcing amplitude [m/s²]  (1.5 = too much backflow)
  turbL: 3.0, turbT: 0.8,
  foamDecay: 0.35, kDecay: 0.8, macCormack: 1, kGen: 1.0, foamGen: 1.0,
  warmupSteps: 400, waterFrac: 0.75,
};

export const RENDER = { sunDir: [0.35, 0.55, 0.75], fogColor: [0.72, 0.80, 0.90], fogDensity: 0.0024 };

export const PARTS = { count: 24000, kayakShare: 4000, ambient: 0.055 };

export const VEG = { caps: { tree: 900, bush: 700, rock: 500, grass: 3500, boulder: 70 }, attempts: 26000 };

export const BIOME_IDS = { alpine: 0, canyon: 1, desert: 2, deciduous: 3, icy: 4, barren: 5, rainforest: 6, savannah: 7, glacier: 8 };

// each biome maps the 5 abstract placement "roles" (tree/bush/rock/grass/boulder) to a concrete
// prop mesh (see buildVegetationMeshes in meshes.js), and gives each of the 3 terrain contexts
// (steep ground, right at the water's edge, open ground) a weighted mix of roles to place —
// weights don't need to sum to 1; whatever's left over is "place nothing here". This is what
// actually varies which props show up and how densely, not just their tint.
const DEFAULT_PROPS = { tree: 'tree', bush: 'bush', rock: 'rock', grass: 'grass', boulder: 'boulder' };
export const BIOMES = {
  alpine: {
    props: DEFAULT_PROPS,
    mix: { steep: { rock: 0.25 }, bank: { grass: 0.55, bush: 0.25, rock: 0.20 }, open: { tree: 0.36, bush: 0.19, rock: 0.09, grass: 0.36 } },
    vegTint: { tree: [1, 1, 1], bush: [1, 1, 1], rock: [1, 1, 1], grass: [1, 1, 1], boulder: [1, 1, 1] },
    vegDensity: { tree: 1, bush: 1, rock: 1, grass: 1, boulder: 0.4 },
  },
  // dry canyon: sparse olive/dusty scrub, cactuses instead of conifers, redder rock, exposed boulders
  canyon: {
    props: { ...DEFAULT_PROPS, tree: 'cactus' },
    mix: { steep: { rock: 0.3, boulder: 0.05 }, bank: { grass: 0.25, bush: 0.35, rock: 0.2 }, open: { tree: 0.12, bush: 0.30, rock: 0.20, grass: 0.15 } },
    vegTint: { tree: [1.05, 0.92, 0.72], bush: [1.12, 0.9, 0.55], rock: [1.2, 0.82, 0.68], grass: [1.2, 1.0, 0.5], boulder: [1.15, 0.85, 0.65] },
    vegDensity: { tree: 0.5, bush: 0.7, rock: 1.7, grass: 0.45, boulder: 0.6 },
  },
  // hot, sparse desert: scattered saguaros, sandy scrub, pale sun-bleached rock, mostly bare ground
  desert: {
    props: { ...DEFAULT_PROPS, tree: 'cactus' },
    mix: { steep: { rock: 0.3, boulder: 0.08 }, bank: { grass: 0.20, bush: 0.35, rock: 0.20 }, open: { tree: 0.16, bush: 0.30, rock: 0.22, grass: 0.08 } },
    vegTint: { tree: [0.85, 1.0, 0.7], bush: [1.15, 0.85, 0.45], rock: [1.15, 0.95, 0.75], grass: [1.3, 1.05, 0.4], boulder: [1.1, 0.9, 0.7] },
    vegDensity: { tree: 0.55, bush: 0.6, rock: 1.3, grass: 0.2, boulder: 0.7 },
  },
  // lush deciduous woodland: dense round-canopy broadleaf trees and undergrowth, warm greens
  deciduous: {
    props: { ...DEFAULT_PROPS, tree: 'treeDeciduous' },
    mix: { steep: { rock: 0.22 }, bank: { grass: 0.45, bush: 0.35, rock: 0.10 }, open: { tree: 0.48, bush: 0.30, rock: 0.05, grass: 0.17 } },
    vegTint: { tree: [0.85, 1.08, 0.65], bush: [0.9, 1.1, 0.6], rock: [0.95, 1.0, 0.85], grass: [0.85, 1.15, 0.55], boulder: [0.95, 1.0, 0.9] },
    vegDensity: { tree: 1.8, bush: 1.6, rock: 0.7, grass: 1.3, boulder: 0.3 },
  },
  // icy alpine: mostly bare rock, snow and boulders, a few gaunt withered trees near the treeline
  icy: {
    props: { ...DEFAULT_PROPS, tree: 'treeWithered' },
    mix: { steep: { rock: 0.25, boulder: 0.35 }, bank: { grass: 0.15, rock: 0.35, boulder: 0.15 }, open: { tree: 0.05, rock: 0.30, boulder: 0.22, grass: 0.08, bush: 0.03 } },
    vegTint: { tree: [0.8, 0.85, 0.9], bush: [0.8, 0.9, 1.05], rock: [0.9, 0.95, 1.08], grass: [0.85, 0.95, 1.05], boulder: [0.92, 0.95, 1.05] },
    vegDensity: { tree: 0.18, bush: 0.1, rock: 1.6, grass: 0.2, boulder: 1.6 },
  },
  // barren rock: huge boulders and dense rough scree, scoured grey-brown, almost nothing growing
  barren: {
    props: { ...DEFAULT_PROPS, tree: 'treeWithered' },
    mix: { steep: { rock: 0.35, boulder: 0.45 }, bank: { rock: 0.5, boulder: 0.2, grass: 0.08 }, open: { boulder: 0.35, rock: 0.42, tree: 0.02, grass: 0.04, bush: 0.02 } },
    vegTint: { tree: [0.75, 0.68, 0.6], bush: [0.9, 0.85, 0.78], rock: [0.85, 0.83, 0.8], grass: [0.95, 0.88, 0.7], boulder: [0.82, 0.80, 0.77] },
    vegDensity: { tree: 0.05, bush: 0.12, rock: 1.9, grass: 0.12, boulder: 1.9 },
  },
  // tropical rainforest: tall tiered-canopy trees packed dense, thick undergrowth, canopy shades out grass
  rainforest: {
    props: { ...DEFAULT_PROPS, tree: 'treeRainforest' },
    mix: { steep: { rock: 0.2, boulder: 0.08 }, bank: { bush: 0.5, grass: 0.25, rock: 0.08 }, open: { tree: 0.55, bush: 0.35, rock: 0.03, grass: 0.06 } },
    vegTint: { tree: [0.85, 1.05, 0.7], bush: [0.8, 1.1, 0.65], rock: [0.85, 0.95, 0.85], grass: [0.8, 1.15, 0.6], boulder: [0.85, 0.95, 0.85] },
    vegDensity: { tree: 2.2, bush: 2.0, rock: 0.5, grass: 0.5, boulder: 0.25 },
  },
  // savannah: rolling open grassland, rare flat-topped acacias, occasional scrub and rock
  savannah: {
    props: { ...DEFAULT_PROPS, tree: 'treeSavannah' },
    mix: { steep: { rock: 0.3 }, bank: { grass: 0.65, bush: 0.15, rock: 0.1 }, open: { tree: 0.05, bush: 0.12, rock: 0.04, grass: 0.62 } },
    vegTint: { tree: [1.0, 0.92, 0.55], bush: [1.05, 0.95, 0.55], rock: [1.1, 0.95, 0.7], grass: [1.15, 1.0, 0.45], boulder: [1.05, 0.95, 0.75] },
    vegDensity: { tree: 0.22, bush: 0.55, rock: 0.6, grass: 2.2, boulder: 0.4 },
  },
  // glacier: nothing grows here at all — bare ice and snow, jagged ice-shard formations and
  // ice-sheathed boulders, cold white-blue cast throughout. `tree`/`bush`/`grass` are left out
  // of every mix table below (not just given low weight), so no vegetation is ever rolled.
  glacier: {
    props: { ...DEFAULT_PROPS, rock: 'iceFormation' },
    mix: { steep: { rock: 0.4, boulder: 0.35 }, bank: { rock: 0.35, boulder: 0.15 }, open: { rock: 0.38, boulder: 0.22 } },
    vegTint: { tree: [1, 1, 1], bush: [1, 1, 1], rock: [0.95, 0.97, 1.05], grass: [1, 1, 1], boulder: [0.85, 0.92, 1.05] },
    vegDensity: { tree: 0, bush: 0, rock: 1.8, grass: 0, boulder: 1.3 },
  },
};

export const QUALITY = {
  high: {
    grid: { W: 256, L: 1024, dx: 0.5 },
    particles: 24000, kayakShare: 4000,
    veg: { caps: { tree: 900, bush: 700, rock: 500, grass: 3500, boulder: 70 }, attempts: 26000 },
    dprCap: 1.5, warmupSteps: 400, macCormack: 1, turbA: 0.6, simpleShading: false, substeps: 2,
    lod: { near: 80, mid: 140 }, viewAhead: 170, viewBehind: 30, computeAhead: 220, computeBehind: 60, fogDensity: 0.0024
  },
  medium: {
    grid: { W: 216, L: 864, dx: 128 / 216 },
    particles: 3000, kayakShare: 1000,
    veg: { caps: { tree: 400, bush: 300, rock: 250, grass: 2500, boulder: 35 }, attempts: 12000 },
    dprCap: 1.0, warmupSteps: 300, macCormack: 1, turbA: 0.6, simpleShading: false, substeps: 2,
    // computeAhead/Behind stay a healthy margin past viewAhead/Behind: rows beyond the compute
    // window only hold the one-time load warmup state (no live turbulence/foam) until the moving
    // window reaches them, so a view range that outruns compute reads as dead, frozen water.
    lod: { near: 60, mid: 110 }, viewAhead: 150, viewBehind: 25, computeAhead: 180, computeBehind: 45, fogDensity: 0.0028,
  },
  low: {
    grid: { W: 216, L: 864, dx: 128 / 216 },
    particles: 800, kayakShare: 400,
    veg: { caps: { tree: 100, bush: 80, rock: 80, grass: 500, boulder: 15 }, attempts: 12000 },
    dprCap: 0.75, warmupSteps: 300, macCormack: 1, turbA: 0.6, simpleShading: false, substeps: 2,
    lod: { near: 40, mid:  80 }, viewAhead: 120, viewBehind: 20, computeAhead: 140, computeBehind: 35, fogDensity: 0.0040
  },
};
export const QUALITY_LEVELS = ['high', 'medium', 'low'];

export const KAYAK = {
  mass: 95,
  inertia: [70, 70, 14],
  buoyK: 1300, buoyDamp: 140,
  buoySide: 0.20,
  dragPts: [[0, -0.1, 0.9], [0, -0.1, -0.9]],
  dragAlong: 18, dragLat: 140, dragLatLin: 60,
  yawDamp: 45, rollDamp: 16, pitchDamp: 60,
  leanTorque: 85,
  leanRate: 1,
  rollInstab: 6,
  capsize: 1.45,
  startGrace: 2.5, graceStab: 90,
  paddleFwd: 120, paddleBack: 80, sweepTorque: 85, sweepFwd: 45, strokePeriod: 0.8,
  collK: 8000, collDamp: 300, collFric: 60,
  paddleSwingRate: 7,     // rad/s cap on the drawn paddle's yaw — turns any jump in the stroke angle into a short swing
};

KAYAK.buoyPts = [[0, -0.05, 1.4], [0, -0.05, -1.4],
  [-KAYAK.buoySide, -0.08, 0.5], [KAYAK.buoySide, -0.08, 0.5],
  [-KAYAK.buoySide, -0.08, -0.5], [KAYAK.buoySide, -0.08, -0.5]];
KAYAK.collPts = KAYAK.buoyPts.concat([[0, -0.14, 0], [0, -0.12, 0.8], [0, -0.12, -0.8]]);
KAYAK.formStab = 2 * KAYAK.buoyK * KAYAK.buoySide * KAYAK.buoySide;

export const RIVERS = [
  // ---------- easy ----------
  { name: 'Meadow Run', cls: 'Class II · easy', tier: 'easy', slope: 0.0018, manning: 0.032, halfW: 12, widthVar: 0.25,
    meander: [[18, 170], [6, 61]], depth: 1.6, rocks: 10, rockR: [0.8, 2.0], emergent: 0.3, ledges: [],
    constrictions: 0, valleyH: 12, valleyScale: 70, seed: 11, len: 350,
    waterTint: [0.02, 0.17, 0.06], waterClarity: 1.0,   // emerald
    // wide (24 m), slow and shallow-graded — the one river roomy enough for full-length trunks, so
    // it's the test bed. Counts are per 100 m of river swept by the spawn horizon.
    obstacles: { log: { medium: 4, large: 2 } },
    forks: [{ startZ: 70, mergeZ: 83, splitLen: 22, mergeLen: 22, separation: 20, widthScale: 0.75, shares: [0.55, 0.45] }],
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 31 } },


  { name: 'Willow Bend', cls: 'Class II · easy', tier: 'easy', slope: 0.002, manning: 0.031, halfW: 11, widthVar: 0.3,
    meander: [[24, 190], [5, 48]], depth: 1.5, rocks: 12, rockR: [0.8, 1.9], emergent: 0.3, ledges: [],
    pond: { z: 70, len: 80 },
    // a placeable whirlpool: x/z is world position (metres), strength sets both spin speed and
    // direction (+CCW/-CW, roughly the peak tangential m/s at the core edge — clamped hard by
    // SIM.umax=12, so don't push strength/radius far enough that peak = strength/(radius*0.3)
    // blows past that or it just saturates into a flat clipped disc instead of a real gradient),
    // radius is where its effect fades to zero. x must track the river's actual meandering
    // centerline at that z (it is NOT constant down the river) — verify with generateRiver()
    // before moving z, a channel-center x that was right at one z can land on dry land at another.
    // z=110 sits right at the pond's tail edge (pond1, where it's already narrowing back toward a
    // normal rapid) rather than its widest/calmest middle (z=70) — fine as "an obstacle near the
    // exit" but reposition to z:70/x:64 instead if you want it more centrally in the open pond.
    vortex: { x: 24, z: 110, strength: 25, radius: 24 },
    constrictions: 1, valleyH: 10, valleyScale: 60, seed: 12, len: 170,
    waterTint: [0.03, 0.12, 0.18], waterClarity: 2.4,   // crystal clear
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 34 } },
  { name: 'Tame snake', cls: 'Class II · easy', tier: 'easy', slope: 0.002, manning: 0.033, halfW: 6, widthVar: 0.2,
    meander: [[14, 150], [8, 70]], depth: 1.4, rocks: 20, rockR: [1.0, 2.4], emergent: 0.4, ledges: [],
    constrictions: 1, valleyH: 8, valleyScale: 90, seed: 13, len: 260,
    biome: 'canyon', waterTint: [0.16, 0.10, 0.04], waterClarity: 0.35,   // muddy
    lanes: { count: 3, amp: 0.1, wander: 3, seedOffset: 35 } },
  // ---------- medium ----------
  { name: 'Boulder Garden', cls: 'Class III · medium', tier: 'medium', slope: 0.015, manning: 0.035, halfW: 8, widthVar: 0.35,
    meander: [[22, 140], [7, 55]], depth: 1.5, rocks: 70, rockR: [0.9, 2.6], emergent: 0.5,
    ledges: [[150, 0.5], [300, 0.7], [420, 0.5]], constrictions: 3, valleyH: 9, valleyScale: 95, seed: 23, len: 470,
    biome: 'savannah', waterTint: [0.08, 0.13, 0.06], waterClarity: 1.3,   // open grassland, flat and broad
    boulderIslands: [{ z: 200, len: 8, widthFrac: 0.55 }],
    lanes: { count: 3, amp: 0.15, wander: 3, seedOffset: 32 } },
  { name: 'Cedar Chute', cls: 'Class III · medium', tier: 'medium', slope: 0.012, manning: 0.034, halfW: 7, widthVar: 0.4,
    meander: [[20, 120], [6, 50]], depth: 1.5, rocks: 55, rockR: [0.9, 2.4], emergent: 0.45,
    ledges: [[70, 0.6], [130, 0.6], [190, 0.8]], constrictions: 4, valleyH: 24, valleyScale: 48, seed: 24, len: 240,
    biome: 'deciduous', waterTint: [0.03, 0.14, 0.05], waterClarity: 1.1,   // leafy green, dappled, enclosed hills
    lanes: { count: 2, amp: 0.18, wander: 3, seedOffset: 36 } },
  { name: 'Split Rock', cls: 'Class III · medium', tier: 'medium', slope: 0.014, manning: 0.036, halfW: 9, widthVar: 0.3,
    meander: [[18, 160], [9, 62]], depth: 1.6, rocks: 60, rockR: [1.0, 2.8], emergent: 0.55,
    ledges: [[200, 0.6], [360, 0.7]], constrictions: 2, valleyH: 8, valleyScale: 95, seed: 25, len: 410,
    biome: 'desert', waterTint: [0.14, 0.11, 0.05], waterClarity: 0.5, extraKind: 'diamond',   // murky sandy, flat desert basin
    forks: [{ startZ: 150, mergeZ: 200, splitLen: 25, mergeLen: 25, separation: 22, widthScale: 0.7, shares: [0.6, 0.4] }],
    boulderIslands: [{ z: 300, len: 9, widthFrac: 0.6, bias: 0.2 }],
    lanes: { count: 3, amp: 0.15, wander: 3, seedOffset: 37 } },
  // ---------- hard ----------
  { name: 'The Gorge', cls: 'Class IV · hard', tier: 'hard', slope: 0.03, manning: 0.04, halfW: 5.5, widthVar: 0.4,
    meander: [[26, 110], [8, 45]], depth: 1.4, rocks: 120, rockR: [0.9, 2.8], emergent: 0.55,
    ledges: [[120, 0.8], [210, 1.0], [330, 1.2], [440, 0.9]], constrictions: 4, valleyH: 42, valleyScale: 60, seed: 37, len: 475,
    biome: 'glacier', waterTint: [0.10, 0.20, 0.28], waterClarity: 3.0,   // pale, near-white glacial melt, steep peaks
// glacier theme, but only 11 m wide with 120 boulders — a default 4-8 m berg will very likely
// wedge and close the channel. Try floes alone first, or shrink `large` per river:
//   obstacles: { ice: { medium: 6, large: { per100m: 1, len: [3, 4.5], rad: [1.0, 1.4] } }, max: 10 },
// obstacles: { ice: { medium: 6 } },
    boulderIslands: [{ z: 250, len: 10, widthFrac: 0.65, bias: -0.15 }],
    waterfalls: [{ z: 320, drop: 4.0, len: 5 }],
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 33 } },
  { name: "Devil's Staircase", cls: 'Class IV · hard', tier: 'hard', slope: 0.028, manning: 0.04, halfW: 6, widthVar: 0.35,
    meander: [[20, 130], [7, 40]], depth: 1.4, rocks: 100, rockR: [0.9, 2.6], emergent: 0.5,
    ledges: [[100, 0.9], [160, 0.9], [220, 1.0], [280, 1.0], [340, 1.1], [400, 0.9]], constrictions: 3, valleyH: 36, valleyScale: 55, seed: 38, len: 485,
    biome: 'rainforest', waterTint: [0.03, 0.16, 0.10], waterClarity: 0.9,   // deep jungle green, steep ravine
    waterfalls: [{ z: 460, drop: 3.0, len: 4 }],
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 38 } },
  { name: 'Thunder Gap', cls: 'Class IV · hard', tier: 'hard', slope: 0.035, manning: 0.041, halfW: 5, widthVar: 0.45,
    meander: [[28, 100], [9, 42]], depth: 1.5, rocks: 130, rockR: [1.0, 3.0], emergent: 0.6,
    ledges: [[140, 1.0], [260, 1.2], [400, 1.0]], constrictions: 5, valleyH: 46, valleyScale: 58, seed: 39, len: 440,
    biome: 'barren', waterTint: [0.09, 0.09, 0.08], waterClarity: 0.7,   // scoured grey-brown, jagged peaks
    forks: [{ startZ: 190, mergeZ: 230, splitLen: 20, mergeLen: 20, separation: 18, widthScale: 0.7, shares: [0.45, 0.55] }],
    boulderIslands: [{ z: 330, len: 12, widthFrac: 0.7, bias: 0.1 }],
    waterfalls: [{ z: 370, drop: 5.0, len: 6 }],
    lanes: { count: 3, amp: 0.22, wander: 4, seedOffset: 39 } },
];

// hidden, lockable rivers — one per tier, not shown in the normal list (see RIVERS_HIDDEN below).
// Unlocked by finding that tier's map item (see COLLECTIBLES / profile.mapCarrier).
export const RIVERS_HIDDEN = [
  { name: 'Silver Cache', cls: 'Class II · secret', tier: 'easy', slope: 0.002, manning: 0.032, halfW: 9, widthVar: 0.25,
    meander: [[16, 160], [6, 58]], depth: 1.5, rocks: 14, rockR: [0.8, 2.0], emergent: 0.3, ledges: [],
    biome: 'icy', waterTint: [0.05, 0.14, 0.22], waterClarity: 2.6,
    constrictions: 1, valleyH: 18, valleyScale: 50, seed: 91, len: 300, hidden: true,
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 91 } },
  { name: 'Emerald Hollow', cls: 'Class III · secret', tier: 'medium', slope: 0.013, manning: 0.034, halfW: 8, widthVar: 0.35,
    meander: [[20, 130], [7, 52]], depth: 1.5, rocks: 60, rockR: [0.9, 2.5], emergent: 0.5,
    ledges: [[160, 0.6], [320, 0.7]], biome: 'deciduous', waterTint: [0.03, 0.15, 0.06], waterClarity: 1.2,
    constrictions: 3, valleyH: 22, valleyScale: 48, seed: 92, len: 400, hidden: true,
    lanes: { count: 3, amp: 0.16, wander: 3, seedOffset: 92 } },
  { name: 'Obsidian Falls', cls: 'Class IV · secret', tier: 'hard', slope: 0.032, manning: 0.04, halfW: 5.5, widthVar: 0.4,
    meander: [[24, 105], [8, 44]], depth: 1.5, rocks: 110, rockR: [0.9, 2.8], emergent: 0.55,
    ledges: [[130, 0.9], [250, 1.1], [380, 1.0]], biome: 'barren', waterTint: [0.08, 0.08, 0.08], waterClarity: 0.6,
    constrictions: 4, valleyH: 44, valleyScale: 58, seed: 93, len: 460, hidden: true,
    waterfalls: [{ z: 300, drop: 4.5, len: 5 }],
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 93 } },
];

// tier-to-tier scale factor — everything (finish xp, pickup counts) grows by this ratio
export const TIER_SCALE = { easy: 1, medium: 2, hard: 4 };
export const TIERS = [
  { id: 'easy',   label: 'Class II — easy',    points: 2 * TIER_SCALE.easy },
  { id: 'medium', label: 'Class III — medium', points: 2 * TIER_SCALE.medium },
  { id: 'hard',   label: 'Class IV — hard',    points: 2 * TIER_SCALE.hard },
];
export const TIER_POINTS = Object.fromEntries(TIERS.map(t => [t.id, t.points]));


export const PICKUPS = {
  perTierBase: 8,
  paddleXp: 1,
  coinValue: 1,
  floatFracOfExtra: 0.5,
  countForTier: tier => PICKUPS.perTierBase * TIER_SCALE[tier],
  hover: 0.55,          // metres above the water surface at rest
  paddleScale: 1.1,      // pickup paddle size multiplier (twice the original)
  spinSpeed: 0.6,        // rad/s — slow spin around the vertical axis
  bobAmp: 0.45,          // metres of vertical travel for the floating ones
  bobSpeed: 0.5,          // rad/s
  reachBob: -0.3,          // floating ones are only reachable while sin(bob phase) is below this
  collectRadius: 1.6,       // metres (xz) from the paddler needed to pick one up
  proximityRadius: 14,       // metres — passing this close starts the fade-out clock
  fadeTime: 9.9,               // seconds from "seen up close" to gone — a brief harvesting window
  burstCount: 10,               // sparks spawned on pickup
  burstLife: 0.5,                 // seconds a burst spark lives
};

// varying collectible kinds. `type` picks which loot tally a pickup feeds when collected:
// 'xp' → runLoot.paddles, 'currency' → runLoot.coins (scaled by `value`). A river can add one
// extra kind on top of the default paddle/coin via RIVERS[].extraKind (see Split Rock).
export const COLLECTIBLES = {
  paddle: { mesh: 'paddle', type: 'xp', value: 1, color: [0.95, 0.82, 0.1] },
  coin: { mesh: 'coin', type: 'currency', value: 1, color: [1.0, 0.86, 0.3] },
  diamond: { mesh: 'diamond', type: 'currency', value: 3, color: [0.65, 0.92, 1.0] },
  // opening one doesn't give a fixed reward — on pickup a kind is rolled from `roll` (weights
  // need not sum to 1; a roll past the end just falls through to the last entry) and that
  // kind's own type/value/color is used, so a rucksack is really a wrapper around the others.
  rucksack: { mesh: 'rucksack', type: 'random', roll: [
    { kind: 'coin', weight: 0.5 },
    { kind: 'paddle', weight: 0.3 },
    { kind: 'diamond', weight: 0.2 },
  ], color: [0.55, 0.42, 0.28] },
};


export const MAP_ITEM = {
  mesh: 'map', color: [0.85, 0.72, 0.45], scale: 1.3, spinSpeed: 0.9,
  hover: 0.7, collectRadius: 1.8,
};
export const RUCKSACK = {
  count: 10, spinSpeed: 0.5, scale: 2, hover: 0.12, fadeTime: 99,   // fadeTime = 10x the base PICKUPS.fadeTime
  collectRadius: 2.2,   // bigger than the default PICKUPS.collectRadius (1.6) to match its size
  spawnInterval: 6, spawnBehindMin: 12, spawnBehindMax: 28,
  // 4.5x/8m wasn't enough to actually pass a paddling player — a lazy stretch of river can be
  // only ~1.3 m/s, so even a big multiplier stays slower than a paddling kayak's cruise speed.
  // spawnBoostMin is an absolute floor (m/s) on top of the multiplier so the launch is always
  // fast in absolute terms too, not just relative to whatever the local current happens to be.
  spawnBoost: 3, spawnBoostMin: 2,   // downstream speed at launch = max(local current × 9, 7 m/s)
  spawnBoostDist: 42,  // …held at that boosted target for about this many metres of actual
                        // travel (not seconds — a fast river and a slow one hold it the same
                        // distance) before tapering back to normal floating speed via the drag
                        // relaxation below
  baseFactor: 1.7,   // even its "settled" baseline speed (after the boost tapers off, or once
                      // nudged free of a stuck spot) is this many times the raw local current —
                      // a light bag genuinely does drift a bit faster than the bulk flow, and it
                      // keeps the rucksack from exactly pacing an idle kayak forever
  drag: 2.2, checkInterval: 4, stuckDist: 0.6, nudgeSpeed: 0.8,
};
// ---------- floating obstacles: drifting logs and ice ----------
// A "size class" decides only how an obstacle behaves against the kayak; a "kind" (log / ice)
// decides what it looks like, how big it is and what it weighs. Any river can carry any subset
// of kinds and classes — see RIVERS[].obstacles.
//
//   medium — a fraction of a rock's contact stiffness plus some upward lift, so a paddler rides
//            over it or shoves it aside with a bump instead of being stopped
//   large  — full KAYAK.collK stiffness, i.e. exactly as solid as the bed: a real wall
//
// Population: obstacles are never placed where the player could watch them appear. A spawn
// horizon is swept `spawnAhead` metres downstream of the boat and every new metre of river it
// uncovers is seeded at the river's configured density, so by the time anything comes into view
// it has been floating there for a while. They leave the same way — well behind the boat, by
// sinking under the surface while fading out, never by blinking off.
//
// Physics: every obstacle is a floating capsule sampled at `samples` points along its length.
// Each sample is dragged toward the locally simulated water velocity, with much more drag across
// the axis than along it — that anisotropy in a sheared river is what swings a trunk round until
// it points downstream, and what makes one pinned on a boulder pivot instead of sliding off.
// Where the local depth is less than the obstacle's draft it grounds: pushed downhill by the bed
// slope and heavily damped, so logs beach on bars and jam on emergent rocks.
export const OBSTACLES = {
  enabled: true,
  // ---- population ----
  maxAlive: 18,        // hard cap on obstacles in existence at once (per river: obstacles.max)
  spawnAhead: 210,     // metres downstream of the boat where new ones are created. Keep this
                       // above every QUALITY[*].viewAhead (170 / 150 / 120) or they pop into view.
  despawnBehind: 60,   // metres behind the boat at which one starts its sink-and-fade exit.
                       // Drop to ~20 if you want to watch the sink happen on screen.
  sinkTime: 2.5,       // seconds the exit takes
  sinkDepth: 3.0,      // how far under it slides while fading, in multiples of its own radius
  drawFade: 40,        // metres of alpha ramp at the edge of the terrain draw range, so nothing
                       // ever blinks on at the fog wall (obstacles past it aren't drawn at all —
                       // there is no water under them out there)
  // ---- physics ----
  substeps: 2,
  dragAxial: 0.5, dragLat: 2.2,     // [1/s] velocity relaxation toward the current along / across
  yawDrag: 0.9,                     // [1/s] spin damping
  groundPush: 45, groundFric: 6,    // grounded-out behaviour (see above)
  pairK: 70, pairDamp: 10,          // obstacle-vs-obstacle contact — this is what builds log jams
  vmax: 8, wmax: 2.5,               // sanity clamps [m/s], [rad/s]
  hullR: 0.34,                      // kayak hull radius used by the contact test [m]
  // ---- presentation ----
  ySmooth: 6,          // [1/s] low-pass on the drawn waterline height (see writeObstacleInstances)
  bob: 0.04, bobSpeed: 1.6,
  stubsMax: 3,         // broken branch stubs per log. Purely visual: they are not in the collision
  stubLen: [0.15, 0.5],// shape at all, so they stay short enough that that can't look wrong.
  classes: {
    medium: { hitK: 0.16, bumpLift: 0.45, samples: 4 },
    large:  { hitK: 1.0,  bumpLift: 0.05, samples: 6 },
  },
  // Per kind: `density` kg/m³, `volFactor` the mesh's cross-section area in units of rad² (mass =
  // density · volFactor · rad² · radY · len — a 9 m × 1 m trunk lands at ~3.5 t, a 6 m berg at
  // ~39 t). `draftFrac` is how deep it floats as a fraction of its half-thickness, and therefore
  // how shallow the water must get before it grounds; `freeboardFrac` lifts the drawn mesh so the
  // right amount of it stands clear of the water (the ice meshes already sit low in their own
  // local frame, the log meshes are centred, hence the different values).
  kinds: {
    log: {
      label: 'driftwood', density: 650, volFactor: 2.6, draftFrac: 0.7, freeboardFrac: 0.3,
      roll: true, stubs: true, tint: [1, 1, 1],
      medium: { meshes: ['logMedium', 'logMediumB'], len: [3.5, 6.0], rad: [0.20, 0.32] },
      large:  { meshes: ['logLarge', 'logLargeB'],   len: [7.0, 11.0], rad: [0.38, 0.62] },
    },
    ice: {
      label: 'drift ice', density: 900, volFactor: 1.35, draftFrac: 0.7, freeboardFrac: 0.0,
      roll: false, stubs: false, tint: [1, 1, 1],
      medium: { meshes: ['iceMedium', 'iceMediumB'], len: [1.8, 3.2], rad: [0.80, 1.4], radY: [0.45, 0.7] },
      large:  { meshes: ['iceberg', 'icebergB'],     len: [4.0, 8.0], rad: [1.60, 2.6], radY: [0.80, 1.4] },
    },
  },
};

export const CHARACTERS = {
  ronja: { name: 'Ronja', title: 'the Technician',
    desc: 'Grew up slalom racing. Reads water like a book and has hips of steel — but she tires quickly.',
    caps: { skill: 10, stamina: 6 }, start: { skill: 1, stamina: 0 }, talent: 'skill' },
  bram:  { name: 'Bram', title: 'the Engine',
    desc: 'Ex-rower. Can paddle all day without slowing down, but the boat still surprises him now and then.',
    caps: { skill: 6, stamina: 10 }, start: { skill: 0, stamina: 1 }, talent: 'stamina' },
};

export const STAMINA = {
  max: 100,
  regenTime: 10,        // seconds from empty to full
  drain: 22,            // units/s while paddling (before stamina-trait reduction)
  drainPerPt: 0.07,     // each stamina point removes 7 % of the drain
  tiredFrac: 1 / 3,     // below this fraction the paddler is "tired"
  tiredPower: 0.5,      // stroke force multiplier when tired
  tiredStroke: 1.7,     // stroke period multiplier when tired (visually slower)
};
export const SKILL = {
  instabPerPt: 0.8,     // N·m/rad removed from roll instability per skill point
  leanPerPt: 1.5,       // N·m added to hip/lean torque per skill point
};

export const PUTIN = 30;   // length of the calm put-in pool [m]

// ---------- mobile build ----------
export const MOBILE = {
  force: false,             // true → touch pads + tilt even on a desktop browser (for development)
  tiltMax: 22,              // device roll [deg] that gives a full lean
  tiltDead: 2.5,            // roll [deg] around neutral that is ignored
  tiltInvert: false,        // flip the tilt direction (only needed if a device reports it mirrored)
  calibrateOnStart: true,   // how the phone is held when a run starts counts as "level"
  leanRate: 3,              // lean response for the analog tilt (KAYAK.leanRate is for the binary keys)
  strokeQueue: 2,           // taps remembered while a stroke is still in progress
  repeatFwd: 0.45,          // forward push of a same-side (turning) stroke, as a fraction of paddleFwd
  repeatYaw: 1.0,           // turning torque of a same-side stroke, as a fraction of sweepTorque
  fullscreen: true,         // ask for fullscreen + landscape lock when a run starts (best effort, Android)
};
