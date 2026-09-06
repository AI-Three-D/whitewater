export const GRID = { W: 256, L: 1024, dx: 0.5 };

export const SIM = {
  dt: 1 / 120, substeps: 2, g: 9.81, hmin: 0.02, umax: 12.0,
  turbA: 0.7,           // stochastic forcing amplitude [m/s²]  (1.5 = too much backflow)
  turbL: 3.0, turbT: 0.8,
  foamDecay: 0.35, kDecay: 0.8, macCormack: 1, kGen: 1.0, foamGen: 1.0,
  warmupSteps: 400, waterFrac: 0.75,
};

export const RENDER = { sunDir: [0.35, 0.55, 0.75], fogColor: [0.72, 0.80, 0.90], fogDensity: 0.0024 };
export const BIOME_SKY = {
  alpine:     { sunDir: [0.35, 0.55, 0.75], fogColor: [0.72, 0.80, 0.90], fogMul: 1.0 },
  canyon:     { sunDir: [0.55, 0.35, 0.65], fogColor: [0.80, 0.72, 0.60], fogMul: 0.9 },
  desert:     { sunDir: [0.50, 0.65, 0.55], fogColor: [0.85, 0.80, 0.65], fogMul: 1.1 },
  deciduous:  { sunDir: [0.30, 0.60, 0.70], fogColor: [0.75, 0.82, 0.78], fogMul: 1.0 },
  icy:        { sunDir: [0.25, 0.50, 0.80], fogColor: [0.80, 0.87, 0.95], fogMul: 1.1 },
  barren:     { sunDir: [0.30, 0.45, 0.75], fogColor: [0.68, 0.66, 0.62], fogMul: 1.15 },
  rainforest: { sunDir: [0.25, 0.55, 0.75], fogColor: [0.70, 0.80, 0.72], fogMul: 1.3 },
  savannah:   { sunDir: [0.55, 0.60, 0.60], fogColor: [0.85, 0.78, 0.55], fogMul: 0.85 },
  glacier:    { sunDir: [0.30, 0.60, 0.75], fogColor: [0.85, 0.90, 0.97], fogMul: 1.2 },
  // ominous, hazier and darker-lit than anything else — a low sun through thick smoky air
  volcanic:   { sunDir: [0.40, 0.30, 0.70], fogColor: [0.55, 0.42, 0.38], fogMul: 1.6 },
  // warm golden-hour light for a fall-foliage river
  autumn:     { sunDir: [0.50, 0.42, 0.65], fogColor: [0.85, 0.72, 0.58], fogMul: 1.0 },
};

export const PARTS = { count: 24000, kayakShare: 4000, ambient: 0.055 };

export const VEG = { caps: { tree: 900, bush: 700, rock: 500, grass: 3500, boulder: 70 }, attempts: 26000 };

export const BIOME_IDS = { alpine: 0, canyon: 1, desert: 2, deciduous: 3, icy: 4, barren: 5, rainforest: 6, savannah: 7, glacier: 8, volcanic: 9, autumn: 10 };

export const TIME_OF_DAY = {
  day:   { sunDir: null, skyHorizon: [0.70, 0.80, 0.92], skyZenith: [0.20, 0.42, 0.80], fogTint: [1.00, 1.00, 1.00], fogMul: 1.00, exposure: 1.00 },
  dawn:  { sunDir: [0.85, 0.16, 0.30], skyHorizon: [0.96, 0.64, 0.48], skyZenith: [0.24, 0.32, 0.58], fogTint: [1.15, 0.78, 0.58], fogMul: 1.15, exposure: 0.75 },
  dusk:  { sunDir: [-0.82, 0.14, 0.42], skyHorizon: [0.85, 0.38, 0.28], skyZenith: [0.16, 0.13, 0.34], fogTint: [1.20, 0.72, 0.62], fogMul: 1.20, exposure: 0.62 },
  night: { sunDir: [0.30, -0.30, 0.60], skyHorizon: [0.05, 0.07, 0.15], skyZenith: [0.01, 0.015, 0.05], fogTint: [0.14, 0.16, 0.30], fogMul: 1.35, exposure: 0.16 },

  misty: { sunDir: [0.40, 0.45, 0.72], skyHorizon: [0.80, 0.82, 0.84], skyZenith: [0.55, 0.58, 0.63], fogTint: [0.95, 0.97, 1.00], fogMul: 2.0, exposure: 0.85 },
};

const DEFAULT_PROPS = { tree: 'tree', bush: 'bush', rock: 'rock', grass: 'grass', boulder: 'boulder' };
export const BIOMES = {
  alpine: {
    props: { ...DEFAULT_PROPS, rock: ['rock', 'rock', 'rockSlab'], grass: ['grass', 'grass', 'flowerTuft'] },
    mix: { steep: { rock: 0.25 }, bank: { grass: 0.55, bush: 0.25, rock: 0.20 }, open: { tree: 0.36, bush: 0.19, rock: 0.09, grass: 0.36 } },
    vegTint: { tree: [1, 1, 1], bush: [1, 1, 1], rock: [1, 1, 1], grass: [1, 1, 1], boulder: [1, 1, 1] },
    vegDensity: { tree: 1, bush: 1, rock: 1, grass: 1, boulder: 0.4 },
  },
  // dry canyon: sparse olive/dusty scrub, cactuses instead of conifers, redder rock, exposed boulders
  canyon: {
    props: { ...DEFAULT_PROPS, tree: 'cactus', rock: ['rock', 'rockSlab'], boulder: ['boulder', 'boulderJagged'] },
    mix: { steep: { rock: 0.3, boulder: 0.05 }, bank: { grass: 0.25, bush: 0.35, rock: 0.2 }, open: { tree: 0.12, bush: 0.30, rock: 0.20, grass: 0.15 } },
    vegTint: { tree: [1.05, 0.92, 0.72], bush: [1.12, 0.9, 0.55], rock: [1.2, 0.82, 0.68], grass: [1.2, 1.0, 0.5], boulder: [1.15, 0.85, 0.65] },
    vegDensity: { tree: 0.5, bush: 0.7, rock: 1.7, grass: 0.45, boulder: 0.6 },
  },
  // hot, sparse desert: scattered saguaros, sandy scrub, pale sun-bleached rock, mostly bare ground
  desert: {
    props: { ...DEFAULT_PROPS, tree: 'cactus', rock: ['rock', 'rockSlab'] },
    mix: { steep: { rock: 0.3, boulder: 0.08 }, bank: { grass: 0.20, bush: 0.35, rock: 0.20 }, open: { tree: 0.16, bush: 0.30, rock: 0.22, grass: 0.08 } },
    vegTint: { tree: [0.85, 1.0, 0.7], bush: [1.15, 0.85, 0.45], rock: [1.15, 0.95, 0.75], grass: [1.3, 1.05, 0.4], boulder: [1.1, 0.9, 0.7] },
    vegDensity: { tree: 0.55, bush: 0.6, rock: 1.3, grass: 0.2, boulder: 0.7 },
  },
  // lush deciduous woodland: dense round-canopy broadleaf trees and undergrowth, warm greens
  deciduous: {
    props: { ...DEFAULT_PROPS, tree: 'treeDeciduous', bush: ['bush', 'bush', 'bushBerry'], grass: ['grass', 'grass', 'flowerTuft'] },
    mix: { steep: { rock: 0.22 }, bank: { grass: 0.45, bush: 0.35, rock: 0.10 }, open: { tree: 0.48, bush: 0.30, rock: 0.05, grass: 0.17 } },
    vegTint: { tree: [0.85, 1.08, 0.65], bush: [0.9, 1.1, 0.6], rock: [0.95, 1.0, 0.85], grass: [0.85, 1.15, 0.55], boulder: [0.95, 1.0, 0.9] },
    vegDensity: { tree: 1.8, bush: 1.6, rock: 0.7, grass: 1.3, boulder: 0.3 },
  },
  // icy alpine: mostly bare rock, snow and boulders, a few snow-dusted conifers near the treeline
  icy: {
    props: { ...DEFAULT_PROPS, tree: ['treeSnowy', 'treeSnowy', 'treeWithered'], rock: ['rock', 'rock', 'iceFormation'] },
    mix: { steep: { rock: 0.25, boulder: 0.35 }, bank: { grass: 0.15, rock: 0.35, boulder: 0.15 }, open: { tree: 0.05, rock: 0.30, boulder: 0.22, grass: 0.08, bush: 0.03 } },
    vegTint: { tree: [0.8, 0.85, 0.9], bush: [0.8, 0.9, 1.05], rock: [0.9, 0.95, 1.08], grass: [0.85, 0.95, 1.05], boulder: [0.92, 0.95, 1.05] },
    vegDensity: { tree: 0.18, bush: 0.1, rock: 1.6, grass: 0.2, boulder: 1.6 },
  },
  // barren rock: huge boulders and dense rough scree, scoured grey-brown, almost nothing growing
  barren: {
    props: { ...DEFAULT_PROPS, tree: 'treeWithered', rock: ['rock', 'rockSlab'], boulder: ['boulder', 'boulderJagged'] },
    mix: { steep: { rock: 0.35, boulder: 0.45 }, bank: { rock: 0.5, boulder: 0.2, grass: 0.08 }, open: { boulder: 0.35, rock: 0.42, tree: 0.02, grass: 0.04, bush: 0.02 } },
    vegTint: { tree: [0.75, 0.68, 0.6], bush: [0.9, 0.85, 0.78], rock: [0.85, 0.83, 0.8], grass: [0.95, 0.88, 0.7], boulder: [0.82, 0.80, 0.77] },
    vegDensity: { tree: 0.05, bush: 0.12, rock: 1.9, grass: 0.12, boulder: 1.9 },
  },
  // tropical rainforest: tall tiered-canopy trees packed dense, thick undergrowth, canopy shades out grass
  rainforest: {
    props: { ...DEFAULT_PROPS, tree: 'treeRainforest', bush: ['bush', 'bush', 'bushBerry'] },
    mix: { steep: { rock: 0.2, boulder: 0.08 }, bank: { bush: 0.5, grass: 0.25, rock: 0.08 }, open: { tree: 0.55, bush: 0.35, rock: 0.03, grass: 0.06 } },
    vegTint: { tree: [0.85, 1.05, 0.7], bush: [0.8, 1.1, 0.65], rock: [0.85, 0.95, 0.85], grass: [0.8, 1.15, 0.6], boulder: [0.85, 0.95, 0.85] },
    vegDensity: { tree: 2.2, bush: 2.0, rock: 0.5, grass: 0.5, boulder: 0.25 },
  },
  // savannah: rolling open grassland, rare flat-topped acacias, occasional scrub and rock
  savannah: {
    props: { ...DEFAULT_PROPS, tree: 'treeSavannah', grass: ['grass', 'grass', 'flowerTuft'] },
    mix: { steep: { rock: 0.3 }, bank: { grass: 0.65, bush: 0.15, rock: 0.1 }, open: { tree: 0.05, bush: 0.12, rock: 0.04, grass: 0.62 } },
    vegTint: { tree: [1.0, 0.92, 0.55], bush: [1.05, 0.95, 0.55], rock: [1.1, 0.95, 0.7], grass: [1.15, 1.0, 0.45], boulder: [1.05, 0.95, 0.75] },
    vegDensity: { tree: 0.22, bush: 0.55, rock: 0.6, grass: 2.2, boulder: 0.4 },
  },
  // glacier: nothing grows here at all — bare ice and snow, jagged ice-shard formations and
  // ice-sheathed boulders, cold white-blue cast throughout. `tree`/`bush`/`grass` are left out
  // of every mix table below (not just given low weight), so no vegetation is ever rolled.
  glacier: {
    props: { ...DEFAULT_PROPS, rock: 'iceFormation', boulder: ['boulder', 'iceFormation'] },
    mix: { steep: { rock: 0.4, boulder: 0.35 }, bank: { rock: 0.35, boulder: 0.15 }, open: { rock: 0.38, boulder: 0.22 } },
    vegTint: { tree: [1, 1, 1], bush: [1, 1, 1], rock: [0.95, 0.97, 1.05], grass: [1, 1, 1], boulder: [0.85, 0.92, 1.05] },
    vegDensity: { tree: 0, bush: 0, rock: 1.8, grass: 0, boulder: 1.3 },
  },
  // volcanic: black basalt scree and glowing lava-cracked rock, charred dead trees, nothing green.
  // Same "leave the role out of every mix" trick as glacier keeps grass from ever rolling.
  volcanic: {
    props: { ...DEFAULT_PROPS, tree: 'treeCharred', rock: ['lavaRock', 'rockSlab', 'rockSlab'], boulder: ['boulder', 'lavaRock'] },
    mix: { steep: { rock: 0.35, boulder: 0.3 }, bank: { rock: 0.4, boulder: 0.25, bush: 0.05 }, open: { rock: 0.32, boulder: 0.28, tree: 0.06, bush: 0.04 } },
    vegTint: { tree: [1, 1, 1], bush: [0.55, 0.5, 0.48], rock: [1, 1, 1], grass: [1, 1, 1], boulder: [1, 1, 1] },
    vegDensity: { tree: 0.3, bush: 0.15, rock: 1.7, grass: 0, boulder: 1.5 },
  },
  // autumn: the deciduous woodland's fall coat — a warm red/orange/gold canopy (treeAutumn, a
  // distinct mesh, not just a tint: multiplying a green canopy by any one colour can't turn it
  // red) over the same lush undergrowth, golden late-day grass
  autumn: {
    props: { ...DEFAULT_PROPS, tree: 'treeAutumn', bush: ['bush', 'bush', 'bushBerry'], grass: ['grass', 'grass', 'flowerTuft'] },
    mix: { steep: { rock: 0.22 }, bank: { grass: 0.45, bush: 0.35, rock: 0.10 }, open: { tree: 0.48, bush: 0.30, rock: 0.05, grass: 0.17 } },
    vegTint: { tree: [1, 1, 1], bush: [1.1, 0.85, 0.5], rock: [1.0, 0.95, 0.85], grass: [1.25, 1.0, 0.5], boulder: [1.0, 0.95, 0.85] },
    vegDensity: { tree: 1.8, bush: 1.6, rock: 0.7, grass: 1.3, boulder: 0.3 },
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
  { name: 'Meadow Run', cls: 'Class II · easy', tier: 'easy', slope: 0.0018, manning: 0.032, halfW: 12, widthVar: 0.25, art: 'img/Meadow.png',
    meander: [[18, 170], [6, 61]], depth: 1.6, rocks: 10, rockR: [0.8, 2.0], emergent: 0.3, ledges: [],
    constrictions: 0, valleyH: 12, valleyScale: 70, seed: 11, len: 320,
    waterTint: [0.02, 0.17, 0.06], waterClarity: 1.0,   // emerald
    landBridges: [{ z: 200, width: 7, widthVar: 0.35, height: 3.2, pillars: 2 }],

    forks: [{ startZ: 70, mergeZ: 83, splitLen: 22, mergeLen: 22, separation: 20, widthScale: 0.75, shares: [0.55, 0.45] }],
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 31 } },

    { name: 'Frost Creek', cls: 'Class II · easy', tier: 'easy', slope: 0.0021, manning: 0.033, halfW: 8, widthVar: 0.22, art: 'img/Frost.png',
      meander: [[15, 155], [6, 55]], depth: 1.4, rocks: 16, rockR: [0.8, 2.1], emergent: 0.3, ledges: [],
      constrictions: 1, valleyH: 14, valleyScale: 55, seed: 15, len: 290,
      biome: 'icy', waterTint: [0.06, 0.15, 0.24], waterClarity: 2.2,   // pale blue meltwater
      timeOfDay: 'dawn',
      lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 41 } },
      
  { name: 'Willow Bend', cls: 'Class II · easy', tier: 'easy', slope: 0.0017, manning: 0.031, halfW: 11, widthVar: 0.3,art: 'img/Willow.png',
    meander: [[24, 190], [5, 48]], depth: 1.5, rocks: 10, rockR: [0.8, 1.9], emergent: 0.3, ledges: [],
    pond: { z: 150, len: 15 },
    builtBridges: [{ z: 95, material: 'wood', width: 5, height: 3.2, thickness: 0.8, pylons: 2, color: [1.0, 0.95, 0.88] }],

    constrictions: 1, valleyH: 10, valleyScale: 60, seed: 12, len: 230,
    waterTint: [0.03, 0.12, 0.18], waterClarity: 2.4,   // crystal clear
    pack: 'easyPack',
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 34 } },

  { name: 'Sandy Riffle', cls: 'Class II · easy', tier: 'easy', slope: 0.0019, manning: 0.032, halfW: 12, widthVar: 0.38, art: 'img/Sandy.png',
    meander: [[16, 165], [7, 64]], depth: 1.5, rocks: 14, rockR: [0.8, 2.0], emergent: 0.35, ledges: [],
    constrictions: 1, valleyH: 9, valleyScale: 65, seed: 14, len: 300,
    biome: 'desert', waterTint: [0.15, 0.12, 0.06], waterClarity: 0.6,
    pack: 'easyPack',
    landBridges: [{ z: 120, width: 10, widthVar: 0.25, height: 4, roughness: 1.2, pillars: [
      { along: 0.3, across: -0.7, radius: 1.1, irregular: 1.4, flare: 0.8, flareFrom: 0.45 },
      { along: 0.32, across: 0.75, radius: 0.8, sizeAcross: 0.6, irregular: 1.8, flare: 1.2, flareFrom: 0.7 },
      { along: 0.72, across: 0.1, radius: 1.3, sizeAlong: 0.7, sizeAcross: 3.2, yaw: 8, irregular: 0.8, flare: 0.3, waist: 0.05 },
    ] },
    { z: 230, width: 4.5, widthVar: 0.5, height: 2.6, pillars: 0, rise: 0.9 }],

    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 40 } },

    { name: 'Snake Creek', cls: 'Class II · easy', tier: 'easy', slope: 0.002, manning: 0.033, halfW: 6, widthVar: 0.2,art: 'img/Snake.png',
      meander: [[14, 150], [8, 70]], depth: 1.4, rocks: 20, rockR: [1.0, 2.4], emergent: 0.4, ledges: [],
      constrictions: 1, valleyH: 8, valleyScale: 90, seed: 13, len: 260,
      biome: 'canyon', waterTint: [0.16, 0.10, 0.04], waterClarity: 0.35,   // muddy
      pack: 'easyPack',
      lanes: { count: 3, amp: 0.1, wander: 3, seedOffset: 35 } },    
  // ---------- medium ----------
  { name: 'Boulder garden', cls: 'Class III · medium', tier: 'medium', slope: 0.004, manning: 0.034, halfW: 7, widthVar: 0.4,
    meander: [[20, 120], [6, 50]], depth: 1.0, rocks: 165, rockR: [0.9, 2.4], emergent: 0.45,
    ledges: [], constrictions: 0, valleyH: 24, valleyScale: 48, seed: 24, len: 240,
    biome: 'deciduous', waterTint: [0.03, 0.14, 0.05], waterClarity: 1.1,   // leafy green, dappled, enclosed hills
    timeOfDay: 'misty',
    lanes: { count: 2, amp: 0.18, wander: 3, seedOffset: 36 } },
 
  { name: 'Kopje Run', cls: 'Class III · medium', tier: 'medium', slope: 0.009, manning: 0.035, halfW: 8, widthVar: 0.35,
    meander: [[22, 140], [7, 55]], depth: 1.1, rocks: 26, rockR: [0.9, 2.6], emergent: 0.5,
    ledges: [[300, 0.6]], constrictions: 2, valleyH: 9, valleyScale: 95, seed: 23, len: 300,
    biome: 'savannah', waterTint: [0.08, 0.13, 0.06], waterClarity: 1.3,   // open grassland, flat and broad
    timeOfDay: 'dawn',
    landBridges: [{ z: 120, width: 8, widthVar: 0.3, height: 3.5, pillars: 1 }],
    boulderIslands: [{ z: 200, len: 8, widthFrac: 0.55 }],
    pack: 'mediumPack',
    lanes: { count: 3, amp: 0.15, wander: 3, seedOffset: 32 } },
  { name: 'Pine Hollow', cls: 'Class III · medium', tier: 'medium', slope: 0.0047, manning: 0.031, halfW: 10, widthVar: 0.26, art:'img/Pine.png',
    meander: [[19, 175], [6, 58]], depth: 1.6, rocks: 11, rockR: [0.8, 1.9], emergent: 0.3,
    constrictions: 0, valleyH: 11, valleyScale: 68, seed: 16, len: 320,
    waterTint: [0.03, 0.16, 0.09], waterClarity: 1.3,
    ledges: [[150, 0.2]],
  obstacles: { log: { medium: 18, large: 1} },
    pack: 'mediumPack',
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 42 } },
  { name: 'Rocky Narrows', cls: 'Class III · medium', tier: 'medium', slope: 0.013, manning: 0.035, halfW: 7.5, widthVar: 0.35,
    meander: [[19, 135], [7, 52]], depth: 1.5, rocks: 60, rockR: [0.9, 2.5], emergent: 0.5,
    ledges: [[110, 0.6], [240, 0.7], [360, 0.6]], constrictions: 3, valleyH: 20, valleyScale: 55, seed: 26, len: 400,
    biome: 'canyon', waterTint: [0.14, 0.10, 0.05], waterClarity: 0.6,
    timeOfDay: 'misty',
    pack: 'mediumPack',
    lanes: { count: 3, amp: 0.15, wander: 3, seedOffset: 43 } },
  { name: 'Scree Bends', cls: 'Class III · medium', tier: 'medium', slope: 0.002, manning: 0.033, halfW: 7, widthVar: 0.15,
    meander: [[20, 150], [6, 55]], depth: 2.3, rocks: 3, rockR: [0.9, 2.2], emergent: 0.4, ledges: [],
    constrictions: 0, valleyH: 34, valleyScale: 50, seed: 99, len: 380,
    biome: 'barren', waterTint: [0.08, 0.09, 0.08], waterClarity: 0.8,
    landslideZone: { from: 60, to: 350, count: 36, activeChance: 0.32 },
    pack: 'mediumPack',
    lanes: { count: 3, amp: 0.1, wander: 2, seedOffset: 99 } },
    
  // ---------- hard ----------
  { name: 'The Gorge', cls: 'Class IV · hard', tier: 'hard', slope: 0.03, manning: 0.04, halfW: 5.5, widthVar: 0.4,
    meander: [[26, 110], [8, 45]], depth: 1.4, rocks: 120, rockR: [0.9, 2.8], emergent: 0.55,
    ledges: [[120, 0.8], [210, 1.0], [330, 1.2], [440, 0.9]], constrictions: 4, valleyH: 42, valleyScale: 60, seed: 37, len: 475,
    biome: 'glacier', waterTint: [0.10, 0.20, 0.28], waterClarity: 3.0,   // pale, near-white glacial melt, steep peaks
    timeOfDay: 'misty',

    boulderIslands: [{ z: 250, len: 10, widthFrac: 0.65, bias: -0.15 }],
    waterfalls: [{ z: 320, drop: 4.0, len: 5 }],
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 33 } },
  { name: "Devil's Staircase", cls: 'Class IV · hard', tier: 'hard', slope: 0.028, manning: 0.04, halfW: 6, widthVar: 0.35,
    meander: [[20, 130], [7, 40]], depth: 1.4, rocks: 100, rockR: [0.9, 2.6], emergent: 0.5,
    ledges: [[100, 0.9], [160, 0.9], [220, 1.0], [280, 1.0], [340, 1.1], [400, 0.9]], constrictions: 3, valleyH: 36, valleyScale: 55, seed: 38, len: 485,
    biome: 'rainforest', waterTint: [0.03, 0.16, 0.10], waterClarity: 0.9,   // deep jungle green, steep ravine
    timeOfDay: 'dusk',
    waterfalls: [{ z: 460, drop: 3.0, len: 4 }],
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 38 } },
  { name: 'Thunder Gap', cls: 'Class IV · hard', tier: 'hard', slope: 0.035, manning: 0.041, halfW: 5, widthVar: 0.45,
    meander: [[28, 100], [9, 42]], depth: 1.5, rocks: 130, rockR: [1.0, 3.0], emergent: 0.6,
    ledges: [[140, 1.0], [260, 1.2], [400, 1.0]], constrictions: 5, valleyH: 46, valleyScale: 58, seed: 39, len: 440,
    biome: 'barren', waterTint: [0.09, 0.09, 0.08], waterClarity: 0.7,   // scoured grey-brown, jagged peaks
    timeOfDay: 'dusk',
    forks: [{ startZ: 190, mergeZ: 230, splitLen: 20, mergeLen: 20, separation: 18, widthScale: 0.7, shares: [0.45, 0.55] }],
    boulderIslands: [{ z: 330, len: 12, widthFrac: 0.7, bias: 0.1 }],
    waterfalls: [{ z: 370, drop: 5.0, len: 6 }],
    pack: 'hardPack',
    lanes: { count: 3, amp: 0.22, wander: 4, seedOffset: 39 } },
  { name: 'Widowmaker', cls: 'Class IV · hard', tier: 'hard', slope: 0.029, manning: 0.04, halfW: 5.5, widthVar: 0.4,
    meander: [[23, 115], [8, 42]], depth: 1.4, rocks: 105, rockR: [0.9, 2.7], emergent: 0.55,
    ledges: [[110, 0.9], [190, 0.9], [270, 1.0], [350, 1.0], [420, 0.9]], constrictions: 4, valleyH: 38, valleyScale: 58, seed: 40, len: 460,
    biome: 'canyon', waterTint: [0.13, 0.09, 0.05], waterClarity: 0.55,
    timeOfDay: 'night',
    waterfalls: [{ z: 400, drop: 3.5, len: 5 }],
    pack: 'hardPack',
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 46 } },

  { name: 'Last Rites', cls: 'Class IV · hard', tier: 'hard', slope: 0.033, manning: 0.041, halfW: 5, widthVar: 0.42,
    meander: [[27, 102], [9, 40]], depth: 1.5, rocks: 125, rockR: [1.0, 2.9], emergent: 0.6,
    ledges: [[130, 1.0], [250, 1.1], [380, 1.0]], constrictions: 5, valleyH: 44, valleyScale: 56, seed: 42, len: 470,
    biome: 'volcanic', waterTint: [0.10, 0.05, 0.03], waterClarity: 0.4,   // dark, ash-choked water through a smoky hellscape
    timeOfDay: 'night',
    waterfalls: [{ z: 300, drop: 4.5, len: 5 }],
    pack: 'hardPack',
    lanes: { count: 3, amp: 0.22, wander: 4, seedOffset: 48 } },
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
    timeOfDay: 'dawn',
    constrictions: 3, valleyH: 22, valleyScale: 48, seed: 92, len: 400, hidden: true,
    lanes: { count: 3, amp: 0.16, wander: 3, seedOffset: 92 } },
  { name: 'Obsidian Falls', cls: 'Class IV · secret', tier: 'hard', slope: 0.032, manning: 0.04, halfW: 5.5, widthVar: 0.4,
    meander: [[24, 105], [8, 44]], depth: 1.5, rocks: 110, rockR: [0.9, 2.8], emergent: 0.55,
    ledges: [[130, 0.9], [250, 1.1], [380, 1.0]], biome: 'barren', waterTint: [0.08, 0.08, 0.08], waterClarity: 0.6,
    timeOfDay: 'night',
    constrictions: 4, valleyH: 44, valleyScale: 58, seed: 93, len: 460, hidden: true,
    waterfalls: [{ z: 300, drop: 4.5, len: 5 }],
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 93 } },
];

// each tier has 5 regular rivers (plus its one hidden/map-locked one, in RIVERS_HIDDEN): the first
// 2 listed in RIVERS for that tier are free, the other 3 are gated behind that tier's single
// purchasable pack (see each RIVERS entry's `pack` field — a river with no `pack` is one of the
// free two). Bought once, like a craft — see profile.riverPacks / ownsPack/canBuyPack/buyPack in
// progression.js.
export const RIVER_PACKS = {
  easyPack: { tier: 'easy', label: 'Pack', price: 10 },
  mediumPack: { tier: 'medium', label: 'Pack', price: 20 },
  hardPack: { tier: 'hard', label: 'Pack', price: 40 },
};

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
  diamond: { mesh: 'diamond', type: 'currency', value: 5, color: [0.65, 0.92, 1.0] },

  rucksack: { mesh: 'rucksack', type: 'random', roll: [
    { kind: 'empty', weight: 0.2 },
    { kind: 'coin', weight: 0.3 },
    { kind: 'snack', weight: 0.2 },
    { kind: 'bandaid', weight: 0.2 },
    { kind: 'special', weight: 0.1 },
  ], color: [0.55, 0.42, 0.28] },
};

// second-stage roll for a rucksack's 'special' outcome — equal chance each. `raft` and `helmet`
// are globally one-off (see CRAFTS.raft / UPGRADES.helmet): once a profile already has one, that
// slot resolves to empty instead of a duplicate.
export const SPECIAL_ITEMS = {
  diamond: { color: [0.65, 0.92, 1.0] },
  medikit: { color: [0.9, 0.2, 0.25] },
  book: { color: [0.55, 0.35, 0.85] },
  raft: { color: [0.85, 0.78, 0.15] },
  helmet: { color: [0.75, 0.78, 0.82] },
};


export const MAP_ITEM = {
  mesh: 'map', color: [0.85, 0.72, 0.45], scale: 1.3, spinSpeed: 0.9,
  hover: 0.7, collectRadius: 1.8,
};
export const RUCKSACK = {
  count: 10, spinSpeed: 0.5, scale: 2, hover: 0.12, fadeTime: 99,   // fadeTime = 10x the base PICKUPS.fadeTime
  collectRadius: 2.2,  
  spawnInterval: 6, spawnBehindMin: 12, spawnBehindMax: 28,

  aheadFrac: 0.5, spawnAheadMin: 190, spawnAheadMax: 260,


  spawnBoost: 3, spawnBoostMin: 2,   
  spawnBoostDist: 42, 
  baseFactor: 1.7, 
  drag: 2.2, checkInterval: 4, stuckDist: 0.6, nudgeSpeed: 0.8,
};

export const OBSTACLES = {
  enabled: true,
  maxActive: 40,                 // hard cap on obstacles existing at once (a river's `max` overrides)
  spawnAhead: [190, 260],        // [m] downstream of the kayak where new ones are dropped in
  seedAheadFrom: 50,             // at run start the reach from here to spawnAhead[1] is pre-populated
                                 // at the same density, so the first stretch isn't empty
  despawnBehind: 70,             // [m] upstream of the kayak before one retires
  sinkTime: 4.0, sinkDepth: 1.6, // the retirement animation
  substeps: 2,                   // physics substeps per rendered frame
  dragAxial: 0.5, dragLat: 2.2,  // [1/s] velocity relaxation toward the current along / across the axis
  yawDrag: 0.9,                  // [1/s] spin damping
  groundPush: 45, groundFric: 6, // grounded-out behaviour (see above)
  pairK: 70, pairDamp: 10,       // obstacle-vs-obstacle contact — this is what builds log jams
  vmax: 8, wmax: 2.5,            // sanity clamps [m/s], [rad/s]
  hullR: 0.34,                   // kayak hull radius used by the contact test [m]
  bob: 0.04, bobSpeed: 1.6,      // gentle vertical bob while afloat
  ySmooth: 4,                    // [1/s] low-pass on the floating height (see surfaceAt in main.js)
  classes: {
    medium: { hitK: 0.16, lift: 0.45, samples: 4 },
    large:  { hitK: 1.0,  lift: 0.05, samples: 6 },
  },

  kinds: {
    log: { label: 'driftwood', density: 650, roll: true,
      medium: { meshes: ['logMedium', 'logMediumB'], len: [3.5, 6.0] },
      large:  { meshes: ['logLarge', 'logLargeB'],   len: [7.0, 11.0] } },
    ice: { label: 'drift ice', density: 900, roll: false,
      medium: { meshes: ['iceMedium', 'iceMediumB'], len: [1.8, 3.4] },
      large:  { meshes: ['iceberg', 'icebergB'],     len: [4.0, 8.0] } },
  },
};

export const LANDSLIDE = {
 
  bankOffset: [2, 16],     
  assumedSpeed: 3.2, leadTime: 1.5, minTriggerZ: 15, maxTriggerZ: 90, nearTriggerZ: 14, nearChance: 0.4,
  splashRefSpeed: 6, splashRadius: 1.5, splashHeight: 0.34, splashMinScale: 0.35, splashMaxScale: 1.6,

  splashCol: [0.85, 0.92, 0.98], dustCol: [0.5, 0.4, 0.27], dustInterval: 0.22,
  deepWater: 0.9,          // [m] water depth beyond which a boulder stops rolling and settles —

  rollAccel: 9.0, rollFric: 0.8, rollWobble: 1.3, rollVmax: 9, downstreamBias: 1.4,
  bakeDt: 1 / 60, bakeMaxSteps: 900, settleSpeed: 0.05, settleTime: 1.2,
  // len ranges overlap a bit at the medium/large boundary on purpose — a continuous-feeling size
  // spread rather than two visibly-clustered clumps, while hitK/mass still step up with the class
  medium: { meshes: ['boulderMedium'], len: [1.3, 2.6], density: 2600, hitK: 1.6, lift: 0.03, samples: 3 },
  large:  { meshes: ['boulderLarge'],  len: [2.6, 4.8], density: 2700, hitK: 2.6, lift: 0.02, samples: 4 },
};


export const LAND_BRIDGE = {
  width: 6, widthVar: 0.3, height: 3, pillars: 1, thickness: 1.3, rise: 0.5, roughness: 1, wander: 1, flare: 0.8,
  minExt: 4, maxExt: 22,    
  maxPillars: 8, minHeight: 1.5,
  propDensity: 0.3, treeScale: 0.4, rockScale: 1.6, grassScale: 1.2,
  pillar: { along: 0.5, across: 0, radius: null, sizeAlong: 1, sizeAcross: 1.15, yaw: 0, irregular: 1,
    baseFlare: 0.55, waist: 0.12, flare: 0.35, flareFrom: 0.6, flareCurve: 1.5 },
};

export const BRIDGE_MATERIALS = {
  concrete: { deck: [0.62, 0.62, 0.60], side: [0.54, 0.54, 0.52], soffit: [0.46, 0.46, 0.45], pylon: [0.58, 0.58, 0.56],
              rail: [0.72, 0.72, 0.70], road: [0.20, 0.20, 0.21], line: [0.92, 0.90, 0.70],
              railStyle: 'parapet', girders: 3, planks: 0, blockVar: 0.03 },
  stone:    { deck: [0.60, 0.56, 0.50], side: [0.55, 0.51, 0.45], soffit: [0.42, 0.39, 0.35], pylon: [0.56, 0.52, 0.46],
              rail: [0.62, 0.58, 0.52], road: [0.38, 0.34, 0.29], line: [0, 0, 0],
              railStyle: 'parapet', girders: 0, planks: 0, blockVar: 0.10 },
  wood:     { deck: [0.45, 0.32, 0.19], side: [0.38, 0.27, 0.16], soffit: [0.33, 0.23, 0.14], pylon: [0.36, 0.25, 0.15],
              rail: [0.42, 0.30, 0.18], road: [0.45, 0.32, 0.19], line: [0, 0, 0],
              railStyle: 'posts', girders: 4, planks: 1, blockVar: 0.06 },
  steel:    { deck: [0.55, 0.56, 0.58], side: [0.30, 0.33, 0.36], soffit: [0.26, 0.29, 0.32], pylon: [0.34, 0.37, 0.40],
              rail: [0.40, 0.44, 0.48], road: [0.20, 0.20, 0.21], line: [0.92, 0.90, 0.70],
              railStyle: 'posts', girders: 5, planks: 0, blockVar: 0.04 },
};
export const BUILT_BRIDGE = {
  material: 'concrete', color: [1, 1, 1],
  width: 7, height: 4, thickness: 1.0, slab: 0.35, rail: 0.9, railThick: 0.25,
  pylons: 2, abutExt: 5, shoulder: 7, roadLine: 1,
  minHeight: 1.5, maxPylons: 8,
  pylon: { along: 0.5, across: 0, sizeAlong: 1.2, sizeAcross: 2.6, yaw: 0, taper: 0.08, footing: 0.35, cap: 0.3 },
};

export const CHARACTERS = {
  ronja: { name: 'Ronja', title: 'the Technician',
    desc: 'Grew up slalom racing. Reads water like a book and has hips of steel — but she tires quickly.',
    caps: { skill: 10, stamina: 6, health: 20 }, start: { skill: 1, stamina: 0, health: 10 }, talent: 'skill' },
  bram:  { name: 'Bram', title: 'the Engine',
    desc: 'Ex-rower. Can paddle all day without slowing down, but the boat still surprises him now and then.',
    caps: { skill: 6, stamina: 10, health: 20 }, start: { skill: 0, stamina: 1, health: 10 }, talent: 'stamina' },
};
// ---------- watercraft ----------
// Every boat the player can own. `mods` multiply the matching KAYAK physics numbers for a run in
// that craft (see craftKayakParams in main.js), so a new hull is a config entry, not code. `color`
// is the deck colour (the hull mesh is white/grey and takes it as tint). Non-kayak craft (a raft,
// say) fit the same shape — they'd mod mass/drag/stability and, once they have their own mesh,
// pick it via an extra field. price 0 = owned from the start.
export const CRAFTS = {
  classic: { name: 'River Runner', type: 'kayak', price: 0, color: [0.92, 0.22, 0.12],
    desc: 'The all-rounder you started in. Forgiving, steady, no surprises.', mods: {} },
  slalom: { name: 'Slalom Blade', type: 'kayak', price: 20, color: [0.15, 0.55, 0.95],
    desc: 'Shorter, harder-edged hull: sweep strokes bite and swing the boat round noticeably faster.',
    mods: { sweepTorque: 1.45, sweepFwd: 1.15 } },
  // a tube ring: barely steerable and weak on the paddle, but very hard to flip and forgiving of
  // rocks. Fine for cruising an easy river for a little xp, but its tiny reach and short window
  // near loot (lootMod scales PICKUPS.collectRadius/RUCKSACK.collectRadius) means it rarely grabs
  // much on the way down.
  tubering: { name: 'Tube Ring', type: 'tube', price: 15, color: [0.95, 0.55, 0.1],
    desc: 'An inflatable ring. Almost impossible to flip, almost impossible to steer — just float and enjoy the ride.',
    mods: { sweepTorque: 0.25, sweepFwd: 0.3, paddleFwd: 0.5, paddleBack: 0.5, rollInstab: 0.3, capsize: 1.6 },
    lootMod: 0.4 },
  // not sold in the store — found once, globally, as a rucksack special item (see COLLECTIBLES /
  // SPECIAL_ITEMS and awardRun's raftFound handling). Slower and even harder to steer than the
  // tube ring, but tougher still against flipping — a real "just survive it" craft for easy/medium
  // water. Lane-picking on hard rapids (waterfalls/vortices flipping or grounding it) is future
  // calibration work, not modelled yet beyond the blanket stability/steering mods below.
  raft: { name: 'Inflatable Raft', type: 'raft', price: 0, color: [0.85, 0.78, 0.15],
    desc: 'A found inflatable raft. Slow and clumsy to steer, but very hard to flip — cruises easy water almost on its own.',
    mods: { sweepTorque: 0.15, sweepFwd: 0.2, paddleFwd: 0.35, paddleBack: 0.35, rollInstab: 0.15, capsize: 2.0 },
    lootMod: 0.3 },
};
// ---------- consumables ----------
export const ITEMS = {
  snack: { name: 'Trail snack', icon: '🥜', price: 2, stamina: 45, maxStack: 9, color: [0.85, 0.65, 0.25],
    desc: 'Eat it mid-run to get 45 stamina back. Up to 9 fit in your pack.' },
  bandaid: { name: 'Bandaid', icon: '🩹', price: 4, heal: 1, maxStack: 9, color: [0.95, 0.95, 0.9],
    desc: 'Patches up one point of injury. Use it from the character sheet whenever — no rush.' },
  medikit: { name: 'Medikit', icon: '💉', price: 10, heal: 3, maxStack: 5, color: [0.9, 0.2, 0.25],
    desc: 'A proper kit: reverses three points of injury. Use it from the character sheet whenever — no rush.' },
  // temporary mid-run buff rather than a permanent stock effect: for buffDuration seconds after
  // drinking, traits() treats skill as buffSkill points higher, sharpening both passive stability
  // (instabK) and lean power/response (leanTorque, leanRate) — see drinkEnergy in main.js.
  energyDrink: { name: 'Energy booster', icon: '⚡', price: 5, buffSkill: 3, buffDuration: 4, maxStack: 5, color: [0.95, 0.85, 0.15],
    desc: 'Mostly used for increasing focus during workouts, but it helps with kayaking too: 4 seconds of +3 skill for keeping the boat up, keys and all. Up to 5 fit in your pack.' },
};
// every paddler already has a small equipment deal that pays out 1 coin per finished run;
// buying UPGRADES.sponsor is a step up from that starter deal, paying an extra coin on top.
export const BASE_SPONSOR_INCOME = 1;
// ---------- permanent upgrades (bought once, or found once, then always in effect) ----------
export const UPGRADES = {
  lifevest: { name: 'Life vest', icon: '🦺', price: 20, injuryReduction: 1,
    desc: 'Padded flotation vest. Takes one point of sting out of every fall, on any river.' },
  paddle: { name: 'Carbon paddle', icon: '🛶', price: 30,
    mods: { paddleFwd: 1.2, paddleBack: 1.2, sweepTorque: 1.15, sweepFwd: 1.15 },
    desc: 'Stiffer blade, better catch — every stroke hits harder and turns the boat faster.' },
  // found only, as a rucksack special item — never listed in the store (no `price`), see
  // awardRun's helmetFound handling. Only one can ever be found.
  helmet: { name: 'Better helmet', icon: '⛑️', medHardReduction: 1,
    desc: 'A sturdier helmet. Takes one extra point off every fall on medium and hard water.' },
  // a bigger gear maker offers a step up from the starter deal every paddler already has
  // (BASE_SPONSOR_INCOME) in exchange for more exposure — content, ads, the usual — paying
  // one extra coin on top of the base payout on every finish. See awardRun's sponsorCoins.
  sponsor: { name: 'Promotion program', icon: '📣', price: 10, runIncome: 1,
    desc: 'A bigger equipment sponsor backs you — more content, more ads. Pays 1 extra coin on top of your starter deal for every run you finish.' },
};
// ---------- training (repeatable coin-for-xp purchase) ----------
// unlike upgrades/crafts these aren't owned — buy as many sessions as coins allow, any time,
// straight into the same xp pool a run's finish/paddle points feed. See buyTraining.
export const TRAINING = [
  { id: 'basic', name: 'Basic training', icon: '📘', price: 5, xp: 2,
    desc: 'A short coaching session with a local guide — a quick nudge toward your next level.' },
  { id: 'intensive', name: 'Intensive training', icon: '📗', price: 10, xp: 5,
    desc: 'A full day on the water with a pro. Costs more, but banks noticeably more xp.' },
];
// the store shelf, top to bottom. Crafts/upgrades you already own show as owned rather than disappearing.
export const STORE_LISTING = [
  { type: 'item', id: 'snack' },
  { type: 'item', id: 'bandaid' },
  { type: 'item', id: 'medikit' },
  { type: 'item', id: 'energyDrink' },
  { type: 'training', id: 'basic' },
  { type: 'training', id: 'intensive' },
  { type: 'upgrade', id: 'sponsor' },
  { type: 'upgrade', id: 'lifevest' },
  { type: 'upgrade', id: 'paddle' },
  { type: 'craft', id: 'slalom' },
  { type: 'craft', id: 'tubering' },
  { type: 'pack', id: 'easyPack' },
  { type: 'pack', id: 'mediumPack' },
  { type: 'pack', id: 'hardPack' },
];

// ---------- injury ----------
export const INJURY = { perTier: { easy: 1, medium: 2, hard: 4 } };

export const STAMINA = {
  max: 100,
  regenTime: 10,        // seconds from empty to full
  drain: 22,            // units/s while paddling (before stamina-trait reduction)
  drainPerPt: 0.083,    // each stamina point removes 8.3 % of the drain (~18% more per point than before)
  tiredFrac: 1 / 3,     // below this fraction the paddler is "tired"
  tiredPower: 0.5,      // stroke force multiplier when tired
  tiredStroke: 1.7,     // stroke period multiplier when tired (visually slower)
  passivePerLevel: 0.25, // small automatic gain on every level-up, on top of spent points
};
export const SKILL = {
  instabPerPt: 0.95,    // N·m/rad removed from roll instability per skill point (~19% more per point than before)
  leanPerPt: 1.8,       // N·m added to hip/lean torque per skill point (20% more per point than before)
  leanRatePerPt: 0.015, // small speedup to how fast A/D leaning reaches its target, per skill point
  passivePerLevel: 0.25, // small automatic gain on every level-up, on top of spent points
};

export const PUTIN = 30;   // length of the calm put-in pool [m]

export const RIVER_SIDE_MARGIN = 4;   // [m]

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
