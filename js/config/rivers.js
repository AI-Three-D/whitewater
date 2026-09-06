// Tiers, river packs and the river list. Every river is built by river(tier, def) which derives
// `cls` and defaults `ledges` to [], so an entry only states what is specific to it.
export const PUTIN = 30;              // length of the calm put-in pool [m]
export const RIVER_SIDE_MARGIN = 4;   // [m]

// ---------- tiers ----------
// tier-to-tier scale factor — everything (finish xp, pickup counts) grows by this ratio
export const TIER_SCALE = { easy: 1, medium: 2, hard: 4 };
const TIER_CLASS = { easy: 'Class II', medium: 'Class III', hard: 'Class IV' };

export const TIERS = Object.keys(TIER_SCALE).map(id => ({
  id,
  label: `${TIER_CLASS[id]} — ${id}`,
  points: 2 * TIER_SCALE[id],
}));
export const TIER_POINTS = Object.fromEntries(TIERS.map(t => [t.id, t.points]));

// each tier has 5 regular rivers (plus its one hidden/map-locked one, in RIVERS_HIDDEN). A river
// with no `pack` is free; the rest are gated behind that tier's single purchasable pack. Bought
// once, like a craft — see profile.riverPacks / ownsPack / canBuyPack / buyPack in progression.js.
export const RIVER_PACKS = {
  easyPack: { tier: 'easy', label: 'Pack', price: 10 },
  mediumPack: { tier: 'medium', label: 'Pack', price: 20 },
  hardPack: { tier: 'hard', label: 'Pack', price: 40 },
};

const river = (tier, def) => ({
  cls: `${TIER_CLASS[tier]} · ${def.hidden ? 'secret' : tier}`,
  tier,
  ledges: [],
  ...def,
});

// ---------- the list ----------
// Field groups, in this order: identity · channel (slope/manning/halfW/widthVar/meander/depth) ·
// rocks & ledges · valley · features (forks/pond/bridges/islands/waterfalls/obstacles/landslides)
// · look (biome/waterTint/waterClarity/timeOfDay/art) · lanes · pack
export const RIVERS = [
  // ---------- easy ----------
  river('easy', {
    name: 'Meadow Run', seed: 11, len: 320,
    slope: 0.0018, manning: 0.032, halfW: 12, widthVar: 0.25, meander: [[18, 170], [6, 61]], depth: 1.6,
    rocks: 10, rockR: [0.8, 2.0], emergent: 0.3,
    constrictions: 0, valleyH: 12, valleyScale: 70,
    forks: [{ startZ: 70, mergeZ: 83, splitLen: 22, mergeLen: 22, separation: 20, widthScale: 0.75, shares: [0.55, 0.45] }],
    landBridges: [{ z: 200, width: 7, widthVar: 0.35, height: 3.2, pillars: 2 }],
    waterTint: [0.02, 0.17, 0.06], waterClarity: 1.0,   // emerald
    art: 'img/Meadow.png',
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 31 },
  }),
  river('easy', {
    name: 'Frost Creek', seed: 15, len: 290,
    slope: 0.0021, manning: 0.033, halfW: 8, widthVar: 0.22, meander: [[15, 155], [6, 55]], depth: 1.4,
    rocks: 16, rockR: [0.8, 2.1], emergent: 0.3,
    constrictions: 1, valleyH: 14, valleyScale: 55,
    biome: 'icy', waterTint: [0.06, 0.15, 0.24], waterClarity: 2.2, timeOfDay: 'dawn',   // pale blue meltwater
    art: 'img/Frost.png',
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 41 },
  }),
  river('easy', {
    name: 'Willow Bend', seed: 12, len: 230,
    slope: 0.0017, manning: 0.031, halfW: 11, widthVar: 0.3, meander: [[24, 190], [5, 48]], depth: 1.5,
    rocks: 10, rockR: [0.8, 1.9], emergent: 0.3,
    constrictions: 1, valleyH: 10, valleyScale: 60,
    pond: { z: 150, len: 15 },
    builtBridges: [{ z: 95, material: 'wood', width: 5, height: 3.2, thickness: 0.8, pylons: 2, color: [1.0, 0.95, 0.88] }],
    waterTint: [0.03, 0.12, 0.18], waterClarity: 2.4,   // crystal clear
    art: 'img/Willow.png',
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 34 },
    pack: 'easyPack',
  }),
  river('easy', {
    name: 'Sandy Riffle', seed: 14, len: 300,
    slope: 0.0019, manning: 0.032, halfW: 12, widthVar: 0.38, meander: [[16, 165], [7, 64]], depth: 1.5,
    rocks: 14, rockR: [0.8, 2.0], emergent: 0.35,
    constrictions: 1, valleyH: 9, valleyScale: 65,
    landBridges: [
      { z: 120, width: 10, widthVar: 0.25, height: 4, roughness: 1.2, pillars: [
        { along: 0.3, across: -0.7, radius: 1.1, irregular: 1.4, flare: 0.8, flareFrom: 0.45 },
        { along: 0.32, across: 0.75, radius: 0.8, sizeAcross: 0.6, irregular: 1.8, flare: 1.2, flareFrom: 0.7 },
        { along: 0.72, across: 0.1, radius: 1.3, sizeAlong: 0.7, sizeAcross: 3.2, yaw: 8, irregular: 0.8, flare: 0.3, waist: 0.05 },
      ] },
      { z: 230, width: 4.5, widthVar: 0.5, height: 2.6, pillars: 0, rise: 0.9 },
    ],
    biome: 'desert', waterTint: [0.15, 0.12, 0.06], waterClarity: 0.6,
    art: 'img/Sandy.png',
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 40 },
    pack: 'easyPack',
  }),
  river('easy', {
    name: 'Snake Creek', seed: 13, len: 260,
    slope: 0.002, manning: 0.033, halfW: 6, widthVar: 0.2, meander: [[14, 150], [8, 70]], depth: 1.4,
    rocks: 20, rockR: [1.0, 2.4], emergent: 0.4,
    constrictions: 1, valleyH: 8, valleyScale: 90,
    biome: 'canyon', waterTint: [0.16, 0.10, 0.04], waterClarity: 0.35,   // muddy
    art: 'img/Snake.png',
    lanes: { count: 3, amp: 0.1, wander: 3, seedOffset: 35 },
    pack: 'easyPack',
  }),

  // ---------- medium ----------
  river('medium', {
    name: 'Boulder garden', seed: 24, len: 240,
    slope: 0.004, manning: 0.034, halfW: 7, widthVar: 0.4, meander: [[20, 120], [6, 50]], depth: 1.0,
    rocks: 165, rockR: [0.9, 2.4], emergent: 0.45,
    constrictions: 0, valleyH: 24, valleyScale: 48,
    biome: 'deciduous', waterTint: [0.03, 0.14, 0.05], waterClarity: 1.1, timeOfDay: 'misty',   // leafy green, dappled, enclosed hills
    lanes: { count: 2, amp: 0.18, wander: 3, seedOffset: 36 },
  }),
  river('medium', {
    name: 'Kopje Run', seed: 23, len: 300,
    slope: 0.009, manning: 0.035, halfW: 8, widthVar: 0.35, meander: [[22, 140], [7, 55]], depth: 1.1,
    rocks: 26, rockR: [0.9, 2.6], emergent: 0.5, ledges: [[300, 0.6]],
    constrictions: 2, valleyH: 9, valleyScale: 95,
    landBridges: [{ z: 120, width: 8, widthVar: 0.3, height: 3.5, pillars: 1 }],
    boulderIslands: [{ z: 200, len: 8, widthFrac: 0.55 }],
    biome: 'savannah', waterTint: [0.08, 0.13, 0.06], waterClarity: 1.3, timeOfDay: 'dawn',   // open grassland, flat and broad
    lanes: { count: 3, amp: 0.15, wander: 3, seedOffset: 32 },
    pack: 'mediumPack',
  }),
  river('medium', {
    name: 'Pine Hollow', seed: 16, len: 320,
    slope: 0.0047, manning: 0.031, halfW: 10, widthVar: 0.26, meander: [[19, 175], [6, 58]], depth: 1.6,
    rocks: 11, rockR: [0.8, 1.9], emergent: 0.3, ledges: [[150, 0.2]],
    constrictions: 0, valleyH: 11, valleyScale: 68,
    obstacles: { log: { medium: 18, large: 1 } },
    waterTint: [0.03, 0.16, 0.09], waterClarity: 1.3,
    art: 'img/Pine.png',
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 42 },
    pack: 'mediumPack',
  }),
  river('medium', {
    name: 'Rocky Narrows', seed: 26, len: 400,
    slope: 0.013, manning: 0.035, halfW: 7.5, widthVar: 0.35, meander: [[19, 135], [7, 52]], depth: 1.5,
    rocks: 60, rockR: [0.9, 2.5], emergent: 0.5, ledges: [[110, 0.6], [240, 0.7], [360, 0.6]],
    constrictions: 3, valleyH: 20, valleyScale: 55,
    biome: 'canyon', waterTint: [0.14, 0.10, 0.05], waterClarity: 0.6, timeOfDay: 'misty',
    lanes: { count: 3, amp: 0.15, wander: 3, seedOffset: 43 },
    pack: 'mediumPack',
  }),
  river('medium', {
    name: 'Scree Bends', seed: 99, len: 380,
    slope: 0.002, manning: 0.033, halfW: 7, widthVar: 0.15, meander: [[20, 150], [6, 55]], depth: 2.3,
    rocks: 3, rockR: [0.9, 2.2], emergent: 0.4,
    constrictions: 0, valleyH: 34, valleyScale: 50,
    landslideZone: { from: 60, to: 350, count: 36, activeChance: 0.32 },
    biome: 'barren', waterTint: [0.08, 0.09, 0.08], waterClarity: 0.8,
    lanes: { count: 3, amp: 0.1, wander: 2, seedOffset: 99 },
    pack: 'mediumPack',
  }),

  // ---------- hard ----------
  river('hard', {
    name: 'The Gorge', seed: 37, len: 475,
    slope: 0.03, manning: 0.04, halfW: 5.5, widthVar: 0.4, meander: [[26, 110], [8, 45]], depth: 1.4,
    rocks: 120, rockR: [0.9, 2.8], emergent: 0.55, ledges: [[120, 0.8], [210, 1.0], [330, 1.2], [440, 0.9]],
    constrictions: 4, valleyH: 42, valleyScale: 60,
    boulderIslands: [{ z: 250, len: 10, widthFrac: 0.65, bias: -0.15 }],
    waterfalls: [{ z: 320, drop: 4.0, len: 5 }],
    biome: 'glacier', waterTint: [0.10, 0.20, 0.28], waterClarity: 3.0, timeOfDay: 'misty',   // pale, near-white glacial melt, steep peaks
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 33 },
  }),
  river('hard', {
    name: "Devil's Staircase", seed: 38, len: 485,
    slope: 0.028, manning: 0.04, halfW: 6, widthVar: 0.35, meander: [[20, 130], [7, 40]], depth: 1.4,
    rocks: 100, rockR: [0.9, 2.6], emergent: 0.5,
    ledges: [[100, 0.9], [160, 0.9], [220, 1.0], [280, 1.0], [340, 1.1], [400, 0.9]],
    constrictions: 3, valleyH: 36, valleyScale: 55,
    waterfalls: [{ z: 460, drop: 3.0, len: 4 }],
    biome: 'rainforest', waterTint: [0.03, 0.16, 0.10], waterClarity: 0.9, timeOfDay: 'dusk',   // deep jungle green, steep ravine
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 38 },
  }),
  river('hard', {
    name: 'Thunder Gap', seed: 39, len: 440,
    slope: 0.035, manning: 0.041, halfW: 5, widthVar: 0.45, meander: [[28, 100], [9, 42]], depth: 1.5,
    rocks: 130, rockR: [1.0, 3.0], emergent: 0.6, ledges: [[140, 1.0], [260, 1.2], [400, 1.0]],
    constrictions: 5, valleyH: 46, valleyScale: 58,
    forks: [{ startZ: 190, mergeZ: 230, splitLen: 20, mergeLen: 20, separation: 18, widthScale: 0.7, shares: [0.45, 0.55] }],
    boulderIslands: [{ z: 330, len: 12, widthFrac: 0.7, bias: 0.1 }],
    waterfalls: [{ z: 370, drop: 5.0, len: 6 }],
    biome: 'barren', waterTint: [0.09, 0.09, 0.08], waterClarity: 0.7, timeOfDay: 'dusk',   // scoured grey-brown, jagged peaks
    lanes: { count: 3, amp: 0.22, wander: 4, seedOffset: 39 },
    pack: 'hardPack',
  }),
  river('hard', {
    name: 'Widowmaker', seed: 40, len: 460,
    slope: 0.029, manning: 0.04, halfW: 5.5, widthVar: 0.4, meander: [[23, 115], [8, 42]], depth: 1.4,
    rocks: 105, rockR: [0.9, 2.7], emergent: 0.55, ledges: [[110, 0.9], [190, 0.9], [270, 1.0], [350, 1.0], [420, 0.9]],
    constrictions: 4, valleyH: 38, valleyScale: 58,
    waterfalls: [{ z: 400, drop: 3.5, len: 5 }],
    biome: 'canyon', waterTint: [0.13, 0.09, 0.05], waterClarity: 0.55, timeOfDay: 'night',
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 46 },
    pack: 'hardPack',
  }),
  river('hard', {
    name: 'Last Rites', seed: 42, len: 470,
    slope: 0.033, manning: 0.041, halfW: 5, widthVar: 0.42, meander: [[27, 102], [9, 40]], depth: 1.5,
    rocks: 125, rockR: [1.0, 2.9], emergent: 0.6, ledges: [[130, 1.0], [250, 1.1], [380, 1.0]],
    constrictions: 5, valleyH: 44, valleyScale: 56,
    waterfalls: [{ z: 300, drop: 4.5, len: 5 }],
    biome: 'volcanic', waterTint: [0.10, 0.05, 0.03], waterClarity: 0.4, timeOfDay: 'night',   // dark, ash-choked water through a smoky hellscape
    lanes: { count: 3, amp: 0.22, wander: 4, seedOffset: 48 },
    pack: 'hardPack',
  }),
];

// hidden rivers — exactly one per tier, not shown in the normal list until that tier's map item
// has been found (see loot.MAP_ITEM / profile.mapCarrier / unlockHidden)
export const RIVERS_HIDDEN = [
  river('easy', {
    name: 'Silver Cache', hidden: true, seed: 91, len: 300,
    slope: 0.002, manning: 0.032, halfW: 9, widthVar: 0.25, meander: [[16, 160], [6, 58]], depth: 1.5,
    rocks: 14, rockR: [0.8, 2.0], emergent: 0.3,
    constrictions: 1, valleyH: 18, valleyScale: 50,
    biome: 'icy', waterTint: [0.05, 0.14, 0.22], waterClarity: 2.6,
    lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 91 },
  }),
  river('medium', {
    name: 'Emerald Hollow', hidden: true, seed: 92, len: 400,
    slope: 0.013, manning: 0.034, halfW: 8, widthVar: 0.35, meander: [[20, 130], [7, 52]], depth: 1.5,
    rocks: 60, rockR: [0.9, 2.5], emergent: 0.5, ledges: [[160, 0.6], [320, 0.7]],
    constrictions: 3, valleyH: 22, valleyScale: 48,
    biome: 'deciduous', waterTint: [0.03, 0.15, 0.06], waterClarity: 1.2, timeOfDay: 'dawn',
    lanes: { count: 3, amp: 0.16, wander: 3, seedOffset: 92 },
  }),
  river('hard', {
    name: 'Obsidian Falls', hidden: true, seed: 93, len: 460,
    slope: 0.032, manning: 0.04, halfW: 5.5, widthVar: 0.4, meander: [[24, 105], [8, 44]], depth: 1.5,
    rocks: 110, rockR: [0.9, 2.8], emergent: 0.55, ledges: [[130, 0.9], [250, 1.1], [380, 1.0]],
    constrictions: 4, valleyH: 44, valleyScale: 58,
    waterfalls: [{ z: 300, drop: 4.5, len: 5 }],
    biome: 'barren', waterTint: [0.08, 0.08, 0.08], waterClarity: 0.6, timeOfDay: 'night',
    lanes: { count: 3, amp: 0.2, wander: 4, seedOffset: 93 },
  }),
];