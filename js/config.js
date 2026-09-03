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

export const VEG = { caps: { tree: 900, bush: 700, rock: 500, grass: 3500 }, attempts: 26000 };

export const BIOME_IDS = { alpine: 0, canyon: 1, desert: 2, deciduous: 3, icy: 4, barren: 5 };
const neutralBiome = { vegTint: { tree: [1, 1, 1], bush: [1, 1, 1], rock: [1, 1, 1], grass: [1, 1, 1] }, vegDensity: { tree: 1, bush: 1, rock: 1, grass: 1 } };
export const BIOMES = {
  alpine: neutralBiome,
  // dry canyon: sparse olive/dusty scrub, redder rock, far fewer trees, more exposed boulders
  canyon: {
    vegTint: { tree: [1.05, 0.92, 0.72], bush: [1.12, 0.9, 0.55], rock: [1.2, 0.82, 0.68], grass: [1.2, 1.0, 0.5] },
    vegDensity: { tree: 0.32, bush: 0.7, rock: 1.7, grass: 0.45 },
  },
  // hot, sparse desert: sandy scrub, almost no trees, pale sun-bleached rock
  desert: {
    vegTint: { tree: [1.1, 0.85, 0.5], bush: [1.15, 0.85, 0.45], rock: [1.15, 0.95, 0.75], grass: [1.3, 1.05, 0.4] },
    vegDensity: { tree: 0.08, bush: 0.5, rock: 1.4, grass: 0.2 },
  },
  // lush deciduous woodland: dense leafy trees and undergrowth, warm greens
  deciduous: {
    vegTint: { tree: [0.85, 1.08, 0.65], bush: [0.9, 1.1, 0.6], rock: [0.95, 1.0, 0.85], grass: [0.85, 1.15, 0.55] },
    vegDensity: { tree: 1.6, bush: 1.5, rock: 0.8, grass: 1.3 },
  },
  // icy alpine: bare rock and snow, vegetation nearly gone, cold blue-white tint
  icy: {
    vegTint: { tree: [0.8, 0.9, 1.05], bush: [0.8, 0.9, 1.05], rock: [0.9, 0.95, 1.08], grass: [0.85, 0.95, 1.05] },
    vegDensity: { tree: 0.04, bush: 0.1, rock: 1.6, grass: 0.05 },
  },
  // barren rock: scoured, dusty grey-brown, almost nothing growing
  barren: {
    vegTint: { tree: [0.9, 0.85, 0.78], bush: [0.9, 0.85, 0.78], rock: [0.85, 0.83, 0.8], grass: [0.95, 0.88, 0.7] },
    vegDensity: { tree: 0.02, bush: 0.15, rock: 1.8, grass: 0.08 },
  },
};

export const QUALITY = {
  high: {
    grid: { W: 256, L: 1024, dx: 0.5 },
    particles: 24000, kayakShare: 4000,
    veg: { caps: { tree: 900, bush: 700, rock: 500, grass: 3500 }, attempts: 26000 },
    dprCap: 1.5, warmupSteps: 400, macCormack: 1, turbA: 0.6, simpleShading: false, substeps: 2,
    lod: { near: 80, mid: 140 }, viewAhead: 170, viewBehind: 30, computeAhead: 220, computeBehind: 60, fogDensity: 0.0024
  },
  medium: {
    grid: { W: 216, L: 864, dx: 128 / 216 },
    particles: 3000, kayakShare: 1000,
    veg: { caps: { tree: 400, bush: 300, rock: 250, grass: 2500 }, attempts: 12000 },
    dprCap: 1.0, warmupSteps: 300, macCormack: 1, turbA: 0.6, simpleShading: false, substeps: 2,
    // computeAhead/Behind stay a healthy margin past viewAhead/Behind: rows beyond the compute
    // window only hold the one-time load warmup state (no live turbulence/foam) until the moving
    // window reaches them, so a view range that outruns compute reads as dead, frozen water.
    lod: { near: 60, mid: 110 }, viewAhead: 150, viewBehind: 25, computeAhead: 180, computeBehind: 45, fogDensity: 0.0028,
  },
  low: {
    grid: { W: 216, L: 864, dx: 128 / 216 },
    particles: 800, kayakShare: 400,
    veg: { caps: { tree: 100, bush: 80, rock: 80, grass: 500 }, attempts: 12000 },
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
    forks: [{ startZ: 70, mergeZ: 83, splitLen: 22, mergeLen: 22, separation: 20, widthScale: 0.75, shares: [0.55, 0.45] }],
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 31 } },
  { name: 'Willow Bend', cls: 'Class II · easy', tier: 'easy', slope: 0.002, manning: 0.031, halfW: 11, widthVar: 0.3,
    meander: [[24, 190], [5, 48]], depth: 1.5, rocks: 12, rockR: [0.8, 1.9], emergent: 0.3, ledges: [],
    pond: { z: 120, len: 30 },
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
    ledges: [[150, 0.5], [300, 0.7], [420, 0.5]], constrictions: 3, valleyH: 18, valleyScale: 55, seed: 23, len: 470,
    boulderIslands: [{ z: 200, len: 8, widthFrac: 0.55 }],
    lanes: { count: 3, amp: 0.15, wander: 3, seedOffset: 32 } },
  { name: 'Cedar Chute', cls: 'Class III · medium', tier: 'medium', slope: 0.012, manning: 0.034, halfW: 7, widthVar: 0.4,
    meander: [[20, 120], [6, 50]], depth: 1.5, rocks: 55, rockR: [0.9, 2.4], emergent: 0.45,
    ledges: [[70, 0.6], [130, 0.6], [190, 0.8]], constrictions: 4, valleyH: 20, valleyScale: 50, seed: 24, len: 240,
    biome: 'deciduous', waterTint: [0.03, 0.14, 0.05], waterClarity: 1.1,   // leafy green, dappled
    lanes: { count: 2, amp: 0.18, wander: 3, seedOffset: 36 } },
  { name: 'Split Rock', cls: 'Class III · medium', tier: 'medium', slope: 0.014, manning: 0.036, halfW: 9, widthVar: 0.3,
    meander: [[18, 160], [9, 62]], depth: 1.6, rocks: 60, rockR: [1.0, 2.8], emergent: 0.55,
    ledges: [[200, 0.6], [360, 0.7]], constrictions: 2, valleyH: 16, valleyScale: 60, seed: 25, len: 410,
    biome: 'desert', waterTint: [0.14, 0.11, 0.05], waterClarity: 0.5, extraKind: 'diamond',   // murky sandy
    forks: [{ startZ: 150, mergeZ: 200, splitLen: 25, mergeLen: 25, separation: 22, widthScale: 0.7, shares: [0.6, 0.4] }],
    boulderIslands: [{ z: 300, len: 9, widthFrac: 0.6, bias: 0.2 }],
    lanes: { count: 3, amp: 0.15, wander: 3, seedOffset: 37 } },
  // ---------- hard ----------
  { name: 'The Gorge', cls: 'Class IV · hard', tier: 'hard', slope: 0.03, manning: 0.04, halfW: 5.5, widthVar: 0.4,
    meander: [[26, 110], [8, 45]], depth: 1.4, rocks: 120, rockR: [0.9, 2.8], emergent: 0.55,
    ledges: [[120, 0.8], [210, 1.0], [330, 1.2], [440, 0.9]], constrictions: 4, valleyH: 30, valleyScale: 75, seed: 37, len: 475,
    biome: 'icy', waterTint: [0.05, 0.12, 0.20], waterClarity: 2.8,   // pale glacial blue, very clear
    boulderIslands: [{ z: 250, len: 10, widthFrac: 0.65, bias: -0.15 }],
    waterfalls: [{ z: 320, drop: 4.0, len: 5 }],
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 33 } },
  { name: "Devil's Staircase", cls: 'Class IV · hard', tier: 'hard', slope: 0.028, manning: 0.04, halfW: 6, widthVar: 0.35,
    meander: [[20, 130], [7, 40]], depth: 1.4, rocks: 100, rockR: [0.9, 2.6], emergent: 0.5,
    ledges: [[100, 0.9], [160, 0.9], [220, 1.0], [280, 1.0], [340, 1.1], [400, 0.9]], constrictions: 3, valleyH: 34, valleyScale: 65, seed: 38, len: 485,
    waterfalls: [{ z: 460, drop: 3.0, len: 4 }],
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 38 } },
  { name: 'Thunder Gap', cls: 'Class IV · hard', tier: 'hard', slope: 0.035, manning: 0.041, halfW: 5, widthVar: 0.45,
    meander: [[28, 100], [9, 42]], depth: 1.5, rocks: 130, rockR: [1.0, 3.0], emergent: 0.6,
    ledges: [[140, 1.0], [260, 1.2], [400, 1.0]], constrictions: 5, valleyH: 38, valleyScale: 70, seed: 39, len: 440,
    biome: 'barren', waterTint: [0.09, 0.09, 0.08], waterClarity: 0.7,   // scoured grey-brown
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
    constrictions: 1, valleyH: 10, valleyScale: 65, seed: 91, len: 300, hidden: true,
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 91 } },
  { name: 'Emerald Hollow', cls: 'Class III · secret', tier: 'medium', slope: 0.013, manning: 0.034, halfW: 8, widthVar: 0.35,
    meander: [[20, 130], [7, 52]], depth: 1.5, rocks: 60, rockR: [0.9, 2.5], emergent: 0.5,
    ledges: [[160, 0.6], [320, 0.7]], biome: 'deciduous', waterTint: [0.03, 0.15, 0.06], waterClarity: 1.2,
    constrictions: 3, valleyH: 18, valleyScale: 55, seed: 92, len: 400, hidden: true,
    lanes: { count: 3, amp: 0.16, wander: 3, seedOffset: 92 } },
  { name: 'Obsidian Falls', cls: 'Class IV · secret', tier: 'hard', slope: 0.032, manning: 0.04, halfW: 5.5, widthVar: 0.4,
    meander: [[24, 105], [8, 44]], depth: 1.5, rocks: 110, rockR: [0.9, 2.8], emergent: 0.55,
    ledges: [[130, 0.9], [250, 1.1], [380, 1.0]], biome: 'barren', waterTint: [0.08, 0.08, 0.08], waterClarity: 0.6,
    constrictions: 4, valleyH: 32, valleyScale: 70, seed: 93, len: 460, hidden: true,
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
};

// the one-of-a-kind, per-tier "hidden map" pickup. One tier river is chosen at profile creation
// (profile.mapCarrier[tier]) to carry it; it respawns at a fresh random spot on that river every
// attempt until found, then never spawns again and unlocks that tier's RIVERS_HIDDEN entry.
export const MAP_ITEM = {
  mesh: 'map', color: [0.85, 0.72, 0.45], scale: 1.3, spinSpeed: 0.9,
  hover: 0.7, collectRadius: 1.8,
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
