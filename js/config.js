export const GRID = { W: 256, L: 1024, dx: 0.5 };

export const SIM = {
  dt: 1 / 120, substeps: 2, g: 9.81, hmin: 0.02, umax: 12.0,
  turbA: 0.7,           // stochastic forcing amplitude [m/s²]  (1.5 = too much backflow)
  turbL: 3.0, turbT: 0.8,
  foamDecay: 0.35, kDecay: 0.8, macCormack: 1, kGen: 1.0, foamGen: 1.0,
  warmupSteps: 400, waterFrac: 0.75,
};

export const RENDER = { sunDir: [0.35, 0.55, 0.75], fogColor: [0.72, 0.80, 0.90], fogDensity: 0.0024 };
// per-biome atmosphere: RENDER above is the fallback for a biome with no `sky` override. sunDir
// shifts the light's angle (a low grazing direction reads as golden hour, a high one as midday);
// fogColor tints the horizon/haze/distance fog, which is what actually gives each river its mood
// since the terrain/water shaders don't otherwise know about time of day; fogMul scales the
// current quality tier's fogDensity (already 0.0024–0.0040 across high/medium/low) so a biome can
// be hazier or clearer at any detail setting without hardcoding an absolute density. Read live
// each frame in writeCam() (main.js) off the current river's biome — see BIOME_SKY below.
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

// each biome maps the 5 abstract placement "roles" (tree/bush/rock/grass/boulder) to a concrete
// prop mesh (see buildVegetationMeshes in meshes.js), and gives each of the 3 terrain contexts
// (steep ground, right at the water's edge, open ground) a weighted mix of roles to place —
// weights don't need to sum to 1; whatever's left over is "place nothing here". This is what
// actually varies which props show up and how densely, not just their tint.
const DEFAULT_PROPS = { tree: 'tree', bush: 'bush', rock: 'rock', grass: 'grass', boulder: 'boulder' };
export const BIOMES = {
  alpine: {
    // a role can name one mesh or a pool of several (see push() in main.js) — most entries below
    // repeat the plain mesh 2-3x against one variant so the variant reads as an occasional accent
    // rather than showing up in half of every patch
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
  // icy alpine: mostly bare rock, snow and boulders, a few gaunt withered trees near the treeline
  // — plus the odd birch that's held on, and a stray ice formation mixed in with the plain rock
  icy: {
    props: { ...DEFAULT_PROPS, tree: ['treeWithered', 'treeWithered', 'treeBirch'], rock: ['rock', 'rock', 'iceFormation'] },
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
  { name: 'Meadow Run', cls: 'Class II · easy', tier: 'easy', slope: 0.0018, manning: 0.032, halfW: 12, widthVar: 0.25,
    meander: [[18, 170], [6, 61]], depth: 1.6, rocks: 10, rockR: [0.8, 2.0], emergent: 0.3, ledges: [],
    constrictions: 0, valleyH: 12, valleyScale: 70, seed: 11, len: 350,
    waterTint: [0.02, 0.17, 0.06], waterClarity: 1.0,   // emerald

obstacles: { log: { medium: 5, large: 2.5 } },
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
    pack: 'easyPack1',
    lanes: { count: 3, amp: 0.1, wander: 3, seedOffset: 35 } },
  { name: 'Sandy Riffle', cls: 'Class II · easy', tier: 'easy', slope: 0.0019, manning: 0.032, halfW: 9, widthVar: 0.28,
    meander: [[16, 165], [7, 64]], depth: 1.5, rocks: 14, rockR: [0.8, 2.0], emergent: 0.35, ledges: [],
    constrictions: 1, valleyH: 9, valleyScale: 65, seed: 14, len: 300,
    biome: 'desert', waterTint: [0.15, 0.12, 0.06], waterClarity: 0.6,
    pack: 'easyPack1',
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 40 } },
  { name: 'Frost Creek', cls: 'Class II · easy', tier: 'easy', slope: 0.0021, manning: 0.033, halfW: 8, widthVar: 0.22,
    meander: [[15, 155], [6, 55]], depth: 1.4, rocks: 16, rockR: [0.8, 2.1], emergent: 0.3, ledges: [],
    constrictions: 1, valleyH: 14, valleyScale: 55, seed: 15, len: 290,
    biome: 'icy', waterTint: [0.06, 0.15, 0.24], waterClarity: 2.2,   // pale blue meltwater
    pack: 'easyPack2',
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 41 } },
  { name: 'Pine Hollow', cls: 'Class II · easy', tier: 'easy', slope: 0.0017, manning: 0.031, halfW: 10, widthVar: 0.26,
    meander: [[19, 175], [6, 58]], depth: 1.6, rocks: 11, rockR: [0.8, 1.9], emergent: 0.3, ledges: [],
    constrictions: 0, valleyH: 11, valleyScale: 68, seed: 16, len: 320,
    waterTint: [0.03, 0.16, 0.09], waterClarity: 1.3,
    pack: 'easyPack2',
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 42 } },
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
    pack: 'mediumPack1',
    lanes: { count: 3, amp: 0.15, wander: 3, seedOffset: 37 } },
  { name: 'Rocky Narrows', cls: 'Class III · medium', tier: 'medium', slope: 0.013, manning: 0.035, halfW: 7.5, widthVar: 0.35,
    meander: [[19, 135], [7, 52]], depth: 1.5, rocks: 60, rockR: [0.9, 2.5], emergent: 0.5,
    ledges: [[110, 0.6], [240, 0.7], [360, 0.6]], constrictions: 3, valleyH: 20, valleyScale: 55, seed: 26, len: 400,
    biome: 'canyon', waterTint: [0.14, 0.10, 0.05], waterClarity: 0.6,
    pack: 'mediumPack1',
    lanes: { count: 3, amp: 0.15, wander: 3, seedOffset: 43 } },
  { name: 'Silver Rapids', cls: 'Class III · medium', tier: 'medium', slope: 0.0135, manning: 0.034, halfW: 8, widthVar: 0.3,
    meander: [[21, 125], [7, 48]], depth: 1.5, rocks: 58, rockR: [0.9, 2.4], emergent: 0.45,
    ledges: [[90, 0.5], [200, 0.6], [330, 0.7]], constrictions: 2, valleyH: 16, valleyScale: 60, seed: 27, len: 380,
    biome: 'autumn', waterTint: [0.06, 0.13, 0.08], waterClarity: 1.4,   // fall foliage, golden-hour water
    pack: 'mediumPack2',
    lanes: { count: 3, amp: 0.15, wander: 3, seedOffset: 44 } },
  { name: 'Frozen Chute', cls: 'Class III · medium', tier: 'medium', slope: 0.0145, manning: 0.036, halfW: 7, widthVar: 0.4,
    meander: [[17, 115], [8, 45]], depth: 1.6, rocks: 65, rockR: [1.0, 2.6], emergent: 0.55,
    ledges: [[130, 0.7], [260, 0.8], [350, 0.6]], constrictions: 3, valleyH: 26, valleyScale: 45, seed: 28, len: 420,
    biome: 'icy', waterTint: [0.07, 0.16, 0.23], waterClarity: 2.0,
    pack: 'mediumPack2',
    lanes: { count: 3, amp: 0.18, wander: 3, seedOffset: 45 } },
  // ---------- hard ----------
  { name: 'The Gorge', cls: 'Class IV · hard', tier: 'hard', slope: 0.03, manning: 0.04, halfW: 5.5, widthVar: 0.4,
    meander: [[26, 110], [8, 45]], depth: 1.4, rocks: 120, rockR: [0.9, 2.8], emergent: 0.55,
    ledges: [[120, 0.8], [210, 1.0], [330, 1.2], [440, 0.9]], constrictions: 4, valleyH: 42, valleyScale: 60, seed: 37, len: 475,
    biome: 'glacier', waterTint: [0.10, 0.20, 0.28], waterClarity: 3.0,   // pale, near-white glacial melt, steep peaks

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
    pack: 'hardPack1',
    lanes: { count: 3, amp: 0.22, wander: 4, seedOffset: 39 } },
  { name: 'Widowmaker', cls: 'Class IV · hard', tier: 'hard', slope: 0.029, manning: 0.04, halfW: 5.5, widthVar: 0.4,
    meander: [[23, 115], [8, 42]], depth: 1.4, rocks: 105, rockR: [0.9, 2.7], emergent: 0.55,
    ledges: [[110, 0.9], [190, 0.9], [270, 1.0], [350, 1.0], [420, 0.9]], constrictions: 4, valleyH: 38, valleyScale: 58, seed: 40, len: 460,
    biome: 'canyon', waterTint: [0.13, 0.09, 0.05], waterClarity: 0.55,
    waterfalls: [{ z: 400, drop: 3.5, len: 5 }],
    pack: 'hardPack1',
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 46 } },
  { name: 'Ice Fang', cls: 'Class IV · hard', tier: 'hard', slope: 0.031, manning: 0.04, halfW: 5.5, widthVar: 0.38,
    meander: [[25, 108], [8, 44]], depth: 1.4, rocks: 112, rockR: [0.9, 2.8], emergent: 0.55,
    ledges: [[120, 0.9], [220, 1.0], [320, 1.1], [410, 0.9]], constrictions: 4, valleyH: 40, valleyScale: 56, seed: 41, len: 465,
    biome: 'icy', waterTint: [0.08, 0.18, 0.26], waterClarity: 2.4,
    waterfalls: [{ z: 350, drop: 4.0, len: 5 }],
    pack: 'hardPack2',
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 47 } },
  { name: 'Last Rites', cls: 'Class IV · hard', tier: 'hard', slope: 0.033, manning: 0.041, halfW: 5, widthVar: 0.42,
    meander: [[27, 102], [9, 40]], depth: 1.5, rocks: 125, rockR: [1.0, 2.9], emergent: 0.6,
    ledges: [[130, 1.0], [250, 1.1], [380, 1.0]], constrictions: 5, valleyH: 44, valleyScale: 56, seed: 42, len: 470,
    biome: 'volcanic', waterTint: [0.10, 0.05, 0.03], waterClarity: 0.4,   // dark, ash-choked water through a smoky hellscape
    waterfalls: [{ z: 300, drop: 4.5, len: 5 }],
    pack: 'hardPack2',
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
    constrictions: 3, valleyH: 22, valleyScale: 48, seed: 92, len: 400, hidden: true,
    lanes: { count: 3, amp: 0.16, wander: 3, seedOffset: 92 } },
  { name: 'Obsidian Falls', cls: 'Class IV · secret', tier: 'hard', slope: 0.032, manning: 0.04, halfW: 5.5, widthVar: 0.4,
    meander: [[24, 105], [8, 44]], depth: 1.5, rocks: 110, rockR: [0.9, 2.8], emergent: 0.55,
    ledges: [[130, 0.9], [250, 1.1], [380, 1.0]], biome: 'barren', waterTint: [0.08, 0.08, 0.08], waterClarity: 0.6,
    constrictions: 4, valleyH: 44, valleyScale: 58, seed: 93, len: 460, hidden: true,
    waterfalls: [{ z: 300, drop: 4.5, len: 5 }],
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 93 } },
];

// each tier has 6 regular rivers (plus its one hidden/map-locked one): the first 2 listed in
// RIVERS for that tier are free, the other 4 are split into two purchasable packs of 2 (see each
// RIVERS entry's `pack` field — a river with no `pack` is one of the free two). Bought once, like
// a craft — see profile.riverPacks / ownsPack/canBuyPack/buyPack in progression.js.
export const RIVER_PACKS = {
  easyPack1: { tier: 'easy', label: 'Pack I', price: 10 },
  easyPack2: { tier: 'easy', label: 'Pack II', price: 16 },
  mediumPack1: { tier: 'medium', label: 'Pack I', price: 18 },
  mediumPack2: { tier: 'medium', label: 'Pack II', price: 26 },
  hardPack1: { tier: 'hard', label: 'Pack I', price: 28 },
  hardPack2: { tier: 'hard', label: 'Pack II', price: 38 },
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
  // opening one doesn't give a fixed reward — on pickup a kind is rolled from `roll` (weights
  // need not sum to 1; a roll past the end just falls through to the last entry). 'special' is a
  // second-stage roll across SPECIAL_ITEMS (equal chance each); the resolution and payoff for
  // every kind lives in main.js's rucksack-opening code, not here, since half the kinds (coin,
  // snack, bandaid, medikit) just reuse another table's entry and the rest (empty, book, raft,
  // helmet) have no other pickup to borrow from.
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
  collectRadius: 2.2,   // bigger than the default PICKUPS.collectRadius (1.6) to match its size
  spawnInterval: 6, spawnBehindMin: 12, spawnBehindMax: 28,
  // half of all spawns (see spawnRucksacks) place downstream of the kayak instead of behind it —
  // far enough out that it's beyond render distance at every quality tier (RENDER.viewAhead tops
  // out at 170 m on high) plus fog, so nothing pops into view. It's not boosted like the
  // behind-spawns (already moving away downstream at the current's own pace), so catching one
  // takes real paddling rather than just holding a line and waiting for the current to deliver it.
  aheadFrac: 0.5, spawnAheadMin: 190, spawnAheadMax: 260,
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
// A size class decides how an obstacle behaves against the kayak; a kind (log / ice) decides what
// it looks like, how big it is and what it weighs. Any river can carry any subset of kinds and
// classes — see RIVERS[].obstacles.
//   medium — a fraction of a rock's contact stiffness plus some upward lift, so a paddler rides
//            over it or shoves it aside with a noticeable bump instead of being stopped.
//   large  — full KAYAK.collK stiffness, i.e. exactly as solid as the bed: a real wall.
//
// Spawning is live, like the rucksacks, not pre-placed. As the kayak makes downstream progress
// each configured kind/class accrues `per100m` spawns per 100 m travelled; each one is dropped
// into the channel `spawnAhead` metres downstream of the boat — the default lower bound sits past
// RENDER.viewAhead (170 m on high) plus fog, so nothing is ever seen popping into existence — and
// the current then carries it back toward the paddler. Once the boat has left one `despawnBehind`
// metres upstream (or it has drifted past the take-out) it retires: it sinks `sinkDepth` metres
// while fading out over `sinkTime` seconds, then its slot in the quota is freed.
//
// Physics: a floating capsule sampled at `samples` points along its length. Each sample is
// dragged toward the locally simulated water velocity, with far more drag across the axis than
// along it — in a sheared river that asymmetry is a real torque, which is what swings a trunk
// round until it points downstream and makes one pinned on a boulder pivot about the contact.
// Where the depth drops below its draft it grounds: pushed downhill by the bed slope, heavily
// damped, so logs beach on bars and jam on emergent rocks. Obstacles also collide with each other.
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
  // Each class lists mesh variants (built in metres, see buildObstacleMeshes) and the length
  // range instances are drawn from. An instance picks a variant and a length, and is scaled
  // uniformly to that length — thickness, draft and mass (density × the variant's volume × scale³)
  // all follow, so shape variation comes from the variants and the scale, never from stretching.
  kinds: {
    log: { label: 'driftwood', density: 650, roll: true,
      medium: { meshes: ['logMedium', 'logMediumB'], len: [3.5, 6.0] },
      large:  { meshes: ['logLarge', 'logLargeB'],   len: [7.0, 11.0] } },
    ice: { label: 'drift ice', density: 900, roll: false,
      medium: { meshes: ['iceMedium', 'iceMediumB'], len: [1.8, 3.4] },
      large:  { meshes: ['iceberg', 'icebergB'],     len: [4.0, 8.0] } },
  },
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
  snack: { name: 'Trail snack', icon: '🥜', price: 3, stamina: 45, maxStack: 9, color: [0.85, 0.65, 0.25],
    desc: 'Eat it mid-run to get 45 stamina back. Up to 9 fit in your pack.' },
  bandaid: { name: 'Bandaid', icon: '🩹', price: 4, heal: 1, maxStack: 9, color: [0.95, 0.95, 0.9],
    desc: 'Patches up one point of injury. Use it from the character sheet whenever — no rush.' },
  medikit: { name: 'Medikit', icon: '💉', price: 14, heal: 3, maxStack: 5, color: [0.9, 0.2, 0.25],
    desc: 'A proper kit: reverses three points of injury. Use it from the character sheet whenever — no rush.' },
};
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
};
// the store shelf, top to bottom. Crafts/upgrades you already own show as owned rather than disappearing.
export const STORE_LISTING = [
  { type: 'item', id: 'snack' },
  { type: 'item', id: 'bandaid' },
  { type: 'item', id: 'medikit' },
  { type: 'upgrade', id: 'lifevest' },
  { type: 'upgrade', id: 'paddle' },
  { type: 'craft', id: 'slalom' },
  { type: 'craft', id: 'tubering' },
  { type: 'pack', id: 'easyPack1' },
  { type: 'pack', id: 'easyPack2' },
  { type: 'pack', id: 'mediumPack1' },
  { type: 'pack', id: 'mediumPack2' },
  { type: 'pack', id: 'hardPack1' },
  { type: 'pack', id: 'hardPack2' },
];

// ---------- injury ----------
// injury is a persistent, cross-run wound count (see profile.injury): a capsize on a given tier
// adds that many points, minus any owned reduction (life vest always, better helmet on medium/hard
// only — see applyInjury in progression.js). Reaching profile.health (the trainable trait above)
// is fatal — see the `dead` flag applyInjury returns.
export const INJURY = { perTier: { easy: 2, medium: 4, hard: 8 } };

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
