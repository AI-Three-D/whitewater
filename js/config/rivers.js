// Difficulty tiers, river packs and every river definition.
//
// Each tier has 5 regular rivers plus one hidden one (RIVERS_HIDDEN). A river with no `pack` is
// free; the rest are gated behind that tier's single purchasable pack (bought once, like a craft —
// see ownsPack/canBuyPack/buyPack in progression.js). The hidden river is unlocked by finding the
// tier's map item (see MAP_ITEM / profile.mapCarrier).
//
// NOTE: the medium tier currently has only ONE free river (Boulder garden); easy and hard have
// two each. Kopje Run's `pack: 'mediumPack'` may be unintended — left as is.

// tier-to-tier scale factor — everything (finish xp, pickup counts) grows by this ratio
export const TIER_SCALE = { easy: 1, medium: 2, hard: 4 };

export const TIERS = [
  { id: 'easy',   label: 'Class II — easy',    points: 2 * TIER_SCALE.easy },
  { id: 'medium', label: 'Class III — medium', points: 2 * TIER_SCALE.medium },
  { id: 'hard',   label: 'Class IV — hard',    points: 2 * TIER_SCALE.hard },
];
export const TIER_POINTS = Object.fromEntries(TIERS.map(t => [t.id, t.points]));

export const RIVER_PACKS = {
  easyPack:   { tier: 'easy',   label: 'Pack', price: 10 },
  mediumPack: { tier: 'medium', label: 'Pack', price: 20 },
  hardPack:   { tier: 'hard',   label: 'Pack', price: 40 },
};

export const PUTIN = 30;              // [m] length of the calm put-in pool
export const RIVER_SIDE_MARGIN = 4;   // [m]

// ---- river factory: fills the derivable fields so entries only carry what makes them different ----
const CLASS_OF_TIER = { easy: 'Class II', medium: 'Class III', hard: 'Class IV' };
const river = (tier, fields) => ({ tier, cls: `${CLASS_OF_TIER[tier]} · ${tier}`, ledges: [], bands: [], ...fields });
const secret = (tier, fields) => ({ ...river(tier, fields), cls: `${CLASS_OF_TIER[tier]} · secret`, hidden: true });

// Field groups, in the order used below:
//   identity    name, art, pack
//   hydraulics  slope, manning, depth, len, seed
//   geometry    halfW, widthVar, meander [[amp, wavelength] …], constrictions, valleyH, valleyScale
//   rocks       rocks, rockR [min, max], emergent, ledges [[z, drop] …]
//   look        biome (default alpine), timeOfDay (default day), waterTint, waterClarity
//   features    forks, pond, boulderIslands, waterfalls, landBridges, builtBridges, obstacles,
//               landslideZone, extraKind, bands [{ z0, z1, drop } …] — see dropAt in river.js
//   lanes       the channel's lateral wander

export const RIVERS = [
  // ---------- easy ----------
  river('easy', {
    name: 'Meadow Run', art: 'img/Meadow.png',
    slope: 0.0018, manning: 0.032, depth: 1.6, len: 320, seed: 11,
    halfW: 12, widthVar: 0.25, meander: [[18, 170], [6, 61]], constrictions: 0, valleyH: 12, valleyScale: 70,
    rocks: 10, rockR: [0.8, 2.0], emergent: 0.3,
    waterTint: [0.02, 0.17, 0.06], waterClarity: 1.0,   // emerald
    landBridges: [{ z: 200, width: 7, widthVar: 0.35, height: 3.2, pillars: 2 }],
    forks: [{ startZ: 70, mergeZ: 83, splitLen: 22, mergeLen: 22, separation: 20, widthScale: 0.75, shares: [0.55, 0.45] }],
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 31 },
  }),
  river('easy', {
    name: 'Frost Creek', art: 'img/Frost.png',
    slope: 0.0021, manning: 0.033, depth: 1.4, len: 290, seed: 15,
    halfW: 8, widthVar: 0.22, meander: [[15, 155], [6, 55]], constrictions: 1, valleyH: 14, valleyScale: 55,
    rocks: 16, rockR: [0.8, 2.1], emergent: 0.3,
    biome: 'icy', timeOfDay: 'dawn', waterTint: [0.06, 0.15, 0.24], waterClarity: 2.2,   // pale blue meltwater
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 41 },
  }),
  river('easy', {
    name: 'Willow Bend', art: 'img/Willow.png', pack: 'easyPack',
    slope: 0.0017, manning: 0.031, depth: 1.5, len: 230, seed: 12,
    halfW: 11, widthVar: 0.3, meander: [[24, 190], [5, 48]], constrictions: 1, valleyH: 10, valleyScale: 60,
    rocks: 10, rockR: [0.8, 1.9], emergent: 0.3,
    waterTint: [0.03, 0.12, 0.18], waterClarity: 2.4,   // crystal clear
    pond: { z: 150, len: 15 },
    builtBridges: [{ z: 95, material: 'wood', width: 5, height: 3.2, thickness: 0.8, pylons: 2, color: [1.0, 0.95, 0.88] }],
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 34 },
  }),
  river('easy', {
    name: 'Sandy Riffle', art: 'img/Sandy.png', pack: 'easyPack',
    slope: 0.0019, manning: 0.032, depth: 1.5, len: 300, seed: 14,
    halfW: 12, widthVar: 0.38, meander: [[16, 165], [7, 64]], constrictions: 1, valleyH: 9, valleyScale: 65,
    rocks: 14, rockR: [0.8, 2.0], emergent: 0.35,
    biome: 'desert', waterTint: [0.15, 0.12, 0.06], waterClarity: 0.6,
    landBridges: [
      { z: 120, width: 10, widthVar: 0.25, height: 4, roughness: 1.2, pillars: [
        { along: 0.3, across: -0.7, radius: 1.1, irregular: 1.4, flare: 0.8, flareFrom: 0.45 },
        { along: 0.32, across: 0.75, radius: 0.8, sizeAcross: 0.6, irregular: 1.8, flare: 1.2, flareFrom: 0.7 },
        { along: 0.72, across: 0.1, radius: 1.3, sizeAlong: 0.7, sizeAcross: 3.2, yaw: 8, irregular: 0.8, flare: 0.3, waist: 0.05 },
      ] },
      { z: 230, width: 4.5, widthVar: 0.5, height: 2.6, pillars: 0, rise: 0.9 },
    ],
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 40 },
  }),
  river('easy', {
    name: 'Snake Creek', art: 'img/Snake.png', pack: 'easyPack',
    slope: 0.002, manning: 0.033, depth: 1.4, len: 260, seed: 13,
    halfW: 6, widthVar: 0.2, meander: [[14, 150], [8, 70]], constrictions: 1, valleyH: 8, valleyScale: 90,
    rocks: 20, rockR: [1.0, 2.4], emergent: 0.4,
    biome: 'canyon', waterTint: [0.16, 0.10, 0.04], waterClarity: 0.35,   // muddy
    lanes: { count: 3, amp: 0.1, wander: 3, seedOffset: 35 },
  }),

  // ---------- medium ----------
  river('medium', {
    name: 'Boulder garden', art: 'img/Boulder.png',
    slope: 0.004, manning: 0.034, depth: 1.0, len: 240, seed: 24,
    halfW: 7, widthVar: 0.4, meander: [[20, 120], [6, 50]], constrictions: 0, valleyH: 24, valleyScale: 48,
    rocks: 165, rockR: [0.9, 2.4], emergent: 0.45,
    biome: 'deciduous', timeOfDay: 'misty', waterTint: [0.03, 0.14, 0.05], waterClarity: 1.1,   // leafy green, enclosed hills
    lanes: { count: 2, amp: 0.18, wander: 3, seedOffset: 36 },
  }),
  river('medium', {
    name: 'Kopje Run', art: 'img/Kopje.png', pack: 'mediumPack',
    slope: 0.009, manning: 0.035, depth: 1.1, len: 300, seed: 23,
    halfW: 8, widthVar: 0.35, meander: [[22, 140], [7, 55]], constrictions: 2, valleyH: 9, valleyScale: 95,
    rocks: 26, rockR: [0.9, 2.6], emergent: 0.5, ledges: [[300, 0.6]],
    biome: 'savannah', timeOfDay: 'dawn', waterTint: [0.08, 0.13, 0.06], waterClarity: 1.3,   // open grassland, flat and broad
    landBridges: [{ z: 120, width: 8, widthVar: 0.3, height: 3.5, pillars: 1 }],
    boulderIslands: [{ z: 200, len: 8, widthFrac: 0.55 }],
    lanes: { count: 3, amp: 0.15, wander: 3, seedOffset: 32 },
  }),
  river('medium', {
    name: 'Pine Hollow', art: 'img/Pine.png', pack: 'mediumPack',
    slope: 0.0047, manning: 0.031, depth: 1.6, len: 320, seed: 16,
    halfW: 10, widthVar: 0.26, meander: [[19, 175], [6, 58]], constrictions: 0, valleyH: 11, valleyScale: 68,
    rocks: 11, rockR: [0.8, 1.9], emergent: 0.3, ledges: [[150, 0.2]],
    waterTint: [0.03, 0.16, 0.09], waterClarity: 1.3,
    obstacles: { log: { medium: 18, large: 1 } },
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 42 },
  }),
  river('medium', {
    name: 'Silver Falls',
    slope: 0.0014, manning: 0.032, depth: 1.7, len: 300, seed: 91,
    halfW: 9, widthVar: 0.12, meander: [[6, 240]], constrictions: 0, valleyH: 26, valleyScale: 55,
    rocks: 0, emergent: 0.2,
    //ledges: [[65, 0.4], [82, 0.5]],
    bands: [{ z0: 100, z1: 150, drop: 11 }],   // must match the fork's span (startZ/mergeZ) and both branches' actual totals
    forks: [{ startZ: 100, mergeZ: 160, islandHeight: 10.0, splitLen: 30, mergeLen: 25, separation: 24, widthScale: 0.7, shares: [0.5, 0.5] }],
    waterfalls: [
      { z: 110, drop: 8, len: 8, branch: 1, pinch: 0.55 },                    // branch 1: one big plunge — spends the whole band
    ],
    biome: 'icy', waterTint: [0.05, 0.14, 0.22], waterClarity: 1.0,
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 91 },
  }),
  river('medium', {
    name: 'Scree Bends', pack: 'mediumPack',
    slope: 0.002, manning: 0.033, depth: 2.3, len: 380, seed: 99,
    halfW: 7, widthVar: 0.15, meander: [[20, 150], [6, 55]], constrictions: 0, valleyH: 34, valleyScale: 50,
    rocks: 3, rockR: [0.9, 2.2], emergent: 0.4,
    biome: 'barren', waterTint: [0.08, 0.09, 0.08], waterClarity: 0.8,
    landslideZone: { from: 60, to: 350, count: 36, activeChance: 0.32 },
    lanes: { count: 3, amp: 0.1, wander: 2, seedOffset: 99 },
  }),

  // ---------- hard ----------
  river('hard', {
    name: 'The Gorge',
    slope: 0.03, manning: 0.04, depth: 1.4, len: 475, seed: 37,
    halfW: 5.5, widthVar: 0.4, meander: [[26, 110], [8, 45]], constrictions: 4, valleyH: 42, valleyScale: 60,
    rocks: 120, rockR: [0.9, 2.8], emergent: 0.55, ledges: [[120, 0.8], [210, 1.0], [330, 1.2], [440, 0.9]],
    biome: 'glacier', timeOfDay: 'misty', waterTint: [0.10, 0.20, 0.28], waterClarity: 3.0,   // pale glacial melt, steep peaks
    boulderIslands: [{ z: 250, len: 10, widthFrac: 0.65, bias: -0.15 }],
    waterfalls: [{ z: 320, drop: 4.0, len: 5 }],
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 33 },
  }),
  river('hard', {
    name: "Devil's Staircase",
    slope: 0.028, manning: 0.04, depth: 1.4, len: 485, seed: 38,
    halfW: 6, widthVar: 0.35, meander: [[20, 130], [7, 40]], constrictions: 3, valleyH: 36, valleyScale: 55,
    rocks: 100, rockR: [0.9, 2.6], emergent: 0.5,
    ledges: [[100, 0.9], [160, 0.9], [220, 1.0], [280, 1.0], [340, 1.1], [400, 0.9]],
    biome: 'rainforest', timeOfDay: 'dusk', waterTint: [0.03, 0.16, 0.10], waterClarity: 0.9,   // deep jungle green, steep ravine
    waterfalls: [{ z: 460, drop: 3.0, len: 4 }],
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 38 },
  }),
  river('hard', {
    name: 'Thunder Gap', pack: 'hardPack',
    slope: 0.035, manning: 0.041, depth: 1.5, len: 440, seed: 39,
    halfW: 5, widthVar: 0.45, meander: [[28, 100], [9, 42]], constrictions: 5, valleyH: 46, valleyScale: 58,
    rocks: 130, rockR: [1.0, 3.0], emergent: 0.6, ledges: [[140, 1.0], [260, 1.2], [400, 1.0]],
    biome: 'barren', timeOfDay: 'dusk', waterTint: [0.09, 0.09, 0.08], waterClarity: 0.7,   // scoured grey-brown, jagged peaks
    forks: [{ startZ: 190, mergeZ: 230, splitLen: 20, mergeLen: 20, separation: 18, widthScale: 0.7, shares: [0.45, 0.55] }],
    boulderIslands: [{ z: 330, len: 12, widthFrac: 0.7, bias: 0.1 }],
    waterfalls: [{ z: 370, drop: 5.0, len: 6 }],
    lanes: { count: 3, amp: 0.22, wander: 4, seedOffset: 39 },
  }),
  river('hard', {
    name: 'Widowmaker', pack: 'hardPack',
    slope: 0.029, manning: 0.04, depth: 1.4, len: 460, seed: 40,
    halfW: 5.5, widthVar: 0.4, meander: [[23, 115], [8, 42]], constrictions: 4, valleyH: 38, valleyScale: 58,
    rocks: 105, rockR: [0.9, 2.7], emergent: 0.55, ledges: [[110, 0.9], [190, 0.9], [270, 1.0], [350, 1.0], [420, 0.9]],
    biome: 'canyon', timeOfDay: 'night', waterTint: [0.13, 0.09, 0.05], waterClarity: 0.55,
    waterfalls: [{ z: 400, drop: 3.5, len: 5 }],
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 46 },
  }),
  river('hard', {
    name: 'Last Rites', pack: 'hardPack',
    slope: 0.033, manning: 0.041, depth: 1.5, len: 470, seed: 42,
    halfW: 5, widthVar: 0.42, meander: [[27, 102], [9, 40]], constrictions: 5, valleyH: 44, valleyScale: 56,
    rocks: 125, rockR: [1.0, 2.9], emergent: 0.6, ledges: [[130, 1.0], [250, 1.1], [380, 1.0]],
    biome: 'volcanic', timeOfDay: 'night', waterTint: [0.10, 0.05, 0.03], waterClarity: 0.4,   // ash-choked water through a smoky hellscape
    waterfalls: [{ z: 300, drop: 4.5, len: 5 }],
    lanes: { count: 3, amp: 0.22, wander: 4, seedOffset: 48 },
  }),
];

// one per tier, shown as "???" until the tier's map item has been found
export const RIVERS_HIDDEN = [
  secret('easy', {
    name: 'Rocky Narrows',
    slope: 0.013, manning: 0.035, depth: 1.5, len: 400, seed: 26,
    halfW: 7.5, widthVar: 0.35, meander: [[19, 135], [7, 52]], constrictions: 3, valleyH: 20, valleyScale: 55,
    rocks: 60, rockR: [0.9, 2.5], emergent: 0.5, ledges: [[110, 0.6], [240, 0.7], [360, 0.6]],
    biome: 'canyon', timeOfDay: 'misty', waterTint: [0.14, 0.10, 0.05], waterClarity: 0.6,
    lanes: { count: 3, amp: 0.15, wander: 3, seedOffset: 43 },
  }),
  secret('medium', {
    name: 'Emerald Hollow',
    slope: 0.013, manning: 0.034, depth: 1.5, len: 400, seed: 92,
    halfW: 8, widthVar: 0.35, meander: [[20, 130], [7, 52]], constrictions: 3, valleyH: 22, valleyScale: 48,
    rocks: 60, rockR: [0.9, 2.5], emergent: 0.5, ledges: [[160, 0.6], [320, 0.7]],
    biome: 'deciduous', timeOfDay: 'dawn', waterTint: [0.03, 0.15, 0.06], waterClarity: 1.2,
    lanes: { count: 3, amp: 0.16, wander: 3, seedOffset: 92 },
  }),
  secret('hard', {
    name: 'Obsidian Falls',
    slope: 0.032, manning: 0.04, depth: 1.5, len: 460, seed: 93,
    halfW: 5.5, widthVar: 0.4, meander: [[24, 105], [8, 44]], constrictions: 4, valleyH: 44, valleyScale: 58,
    rocks: 110, rockR: [0.9, 2.8], emergent: 0.55, ledges: [[130, 0.9], [250, 1.1], [380, 1.0]],
    biome: 'barren', timeOfDay: 'night', waterTint: [0.08, 0.08, 0.08], waterClarity: 0.6,
    waterfalls: [{ z: 300, drop: 4.5, len: 5 }],
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 93 },
  }),
];