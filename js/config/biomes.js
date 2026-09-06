// What grows where. For each biome: which mesh each prop *role* uses (a role may pick from a list),
// the placement mix per terrain type (weights needn't sum to 1 — the remainder is "nothing"; a
// role left out of every mix table is never rolled at all), a colour tint per role, and a density
// multiplier per role applied to VEG.caps.
import { QUALITY } from './quality.js';

export const VEG = {
  caps: { ...QUALITY.high.veg.caps },
  attempts: QUALITY.high.veg.attempts,
};

const DEFAULT_PROPS = { tree: 'tree', bush: 'bush', rock: 'rock', grass: 'grass', boulder: 'boulder' };
const NO_TINT = { tree: [1, 1, 1], bush: [1, 1, 1], rock: [1, 1, 1], grass: [1, 1, 1], boulder: [1, 1, 1] };

// the deciduous woodland and its fall coat share everything but the canopy mesh and colours
const DECIDUOUS_MIX = {
  steep: { rock: 0.22 },
  bank: { grass: 0.45, bush: 0.35, rock: 0.10 },
  open: { tree: 0.48, bush: 0.30, rock: 0.05, grass: 0.17 },
};
const DECIDUOUS_DENSITY = { tree: 1.8, bush: 1.6, rock: 0.7, grass: 1.3, boulder: 0.3 };

export const BIOMES = {
  alpine: {
    props: { ...DEFAULT_PROPS, rock: ['rock', 'rock', 'rockSlab'], grass: ['grass', 'grass', 'flowerTuft'] },
    mix: {
      steep: { rock: 0.25 },
      bank: { grass: 0.55, bush: 0.25, rock: 0.20 },
      open: { tree: 0.36, bush: 0.19, rock: 0.09, grass: 0.36 },
    },
    vegTint: NO_TINT,
    vegDensity: { tree: 1, bush: 1, rock: 1, grass: 1, boulder: 0.4 },
  },

  // dry canyon: sparse olive/dusty scrub, cactuses instead of conifers, redder rock, exposed boulders
  canyon: {
    props: { ...DEFAULT_PROPS, tree: 'cactus', rock: ['rock', 'rockSlab'], boulder: ['boulder', 'boulderJagged'] },
    mix: {
      steep: { rock: 0.3, boulder: 0.05 },
      bank: { grass: 0.25, bush: 0.35, rock: 0.2 },
      open: { tree: 0.12, bush: 0.30, rock: 0.20, grass: 0.15 },
    },
    vegTint: { tree: [1.05, 0.92, 0.72], bush: [1.12, 0.9, 0.55], rock: [1.2, 0.82, 0.68], grass: [1.2, 1.0, 0.5], boulder: [1.15, 0.85, 0.65] },
    vegDensity: { tree: 0.5, bush: 0.7, rock: 1.7, grass: 0.45, boulder: 0.6 },
  },

  // hot, sparse desert: scattered saguaros, sandy scrub, pale sun-bleached rock, mostly bare ground
  desert: {
    props: { ...DEFAULT_PROPS, tree: 'cactus', rock: ['rock', 'rockSlab'] },
    mix: {
      steep: { rock: 0.3, boulder: 0.08 },
      bank: { grass: 0.20, bush: 0.35, rock: 0.20 },
      open: { tree: 0.16, bush: 0.30, rock: 0.22, grass: 0.08 },
    },
    vegTint: { tree: [0.85, 1.0, 0.7], bush: [1.15, 0.85, 0.45], rock: [1.15, 0.95, 0.75], grass: [1.3, 1.05, 0.4], boulder: [1.1, 0.9, 0.7] },
    vegDensity: { tree: 0.55, bush: 0.6, rock: 1.3, grass: 0.2, boulder: 0.7 },
  },

  // lush deciduous woodland: dense round-canopy broadleaf trees and undergrowth, warm greens
  deciduous: {
    props: { ...DEFAULT_PROPS, tree: 'treeDeciduous', bush: ['bush', 'bush', 'bushBerry'], grass: ['grass', 'grass', 'flowerTuft'] },
    mix: DECIDUOUS_MIX,
    vegTint: { tree: [0.85, 1.08, 0.65], bush: [0.9, 1.1, 0.6], rock: [0.95, 1.0, 0.85], grass: [0.85, 1.15, 0.55], boulder: [0.95, 1.0, 0.9] },
    vegDensity: DECIDUOUS_DENSITY,
  },

  // icy alpine: mostly bare rock, snow and boulders, a few snow-dusted conifers near the treeline
  icy: {
    props: { ...DEFAULT_PROPS, tree: ['treeSnowy', 'treeSnowy', 'treeWithered'], rock: ['rock', 'rock', 'iceFormation'] },
    mix: {
      steep: { rock: 0.25, boulder: 0.35 },
      bank: { grass: 0.15, rock: 0.35, boulder: 0.15 },
      open: { tree: 0.05, rock: 0.30, boulder: 0.22, grass: 0.08, bush: 0.03 },
    },
    vegTint: { tree: [0.8, 0.85, 0.9], bush: [0.8, 0.9, 1.05], rock: [0.9, 0.95, 1.08], grass: [0.85, 0.95, 1.05], boulder: [0.92, 0.95, 1.05] },
    vegDensity: { tree: 0.18, bush: 0.1, rock: 1.6, grass: 0.2, boulder: 1.6 },
  },

  // barren rock: huge boulders and dense rough scree, scoured grey-brown, almost nothing growing
  barren: {
    props: { ...DEFAULT_PROPS, tree: 'treeWithered', rock: ['rock', 'rockSlab'], boulder: ['boulder', 'boulderJagged'] },
    mix: {
      steep: { rock: 0.35, boulder: 0.45 },
      bank: { rock: 0.5, boulder: 0.2, grass: 0.08 },
      open: { boulder: 0.35, rock: 0.42, tree: 0.02, grass: 0.04, bush: 0.02 },
    },
    vegTint: { tree: [0.75, 0.68, 0.6], bush: [0.9, 0.85, 0.78], rock: [0.85, 0.83, 0.8], grass: [0.95, 0.88, 0.7], boulder: [0.82, 0.80, 0.77] },
    vegDensity: { tree: 0.05, bush: 0.12, rock: 1.9, grass: 0.12, boulder: 1.9 },
  },

  // tropical rainforest: tall tiered-canopy trees packed dense, thick undergrowth, canopy shades out grass
  rainforest: {
    props: { ...DEFAULT_PROPS, tree: 'treeRainforest', bush: ['bush', 'bush', 'bushBerry'] },
    mix: {
      steep: { rock: 0.2, boulder: 0.08 },
      bank: { bush: 0.5, grass: 0.25, rock: 0.08 },
      open: { tree: 0.55, bush: 0.35, rock: 0.03, grass: 0.06 },
    },
    vegTint: { tree: [0.85, 1.05, 0.7], bush: [0.8, 1.1, 0.65], rock: [0.85, 0.95, 0.85], grass: [0.8, 1.15, 0.6], boulder: [0.85, 0.95, 0.85] },
    vegDensity: { tree: 2.2, bush: 2.0, rock: 0.5, grass: 0.5, boulder: 0.25 },
  },

  // savannah: rolling open grassland, rare flat-topped acacias, occasional scrub and rock
  savannah: {
    props: { ...DEFAULT_PROPS, tree: 'treeSavannah', grass: ['grass', 'grass', 'flowerTuft'] },
    mix: {
      steep: { rock: 0.3 },
      bank: { grass: 0.65, bush: 0.15, rock: 0.1 },
      open: { tree: 0.05, bush: 0.12, rock: 0.04, grass: 0.62 },
    },
    vegTint: { tree: [1.0, 0.92, 0.55], bush: [1.05, 0.95, 0.55], rock: [1.1, 0.95, 0.7], grass: [1.15, 1.0, 0.45], boulder: [1.05, 0.95, 0.75] },
    vegDensity: { tree: 0.22, bush: 0.55, rock: 0.6, grass: 2.2, boulder: 0.4 },
  },

  // glacier: nothing grows here at all — bare ice and snow, jagged ice-shard formations and
  // ice-sheathed boulders, cold white-blue cast throughout. tree/bush/grass are left out of every
  // mix table (not just given low weight), so no vegetation is ever rolled.
  glacier: {
    props: { ...DEFAULT_PROPS, rock: 'iceFormation', boulder: ['boulder', 'iceFormation'] },
    mix: {
      steep: { rock: 0.4, boulder: 0.35 },
      bank: { rock: 0.35, boulder: 0.15 },
      open: { rock: 0.38, boulder: 0.22 },
    },
    vegTint: { ...NO_TINT, rock: [0.95, 0.97, 1.05], boulder: [0.85, 0.92, 1.05] },
    vegDensity: { tree: 0, bush: 0, rock: 1.8, grass: 0, boulder: 1.3 },
  },

  // volcanic: black basalt scree and glowing lava-cracked rock, charred dead trees, nothing green.
  // Same "leave the role out of every mix" trick as glacier keeps grass from ever rolling.
  volcanic: {
    props: { ...DEFAULT_PROPS, tree: 'treeCharred', rock: ['lavaRock', 'rockSlab', 'rockSlab'], boulder: ['boulder', 'lavaRock'] },
    mix: {
      steep: { rock: 0.35, boulder: 0.3 },
      bank: { rock: 0.4, boulder: 0.25, bush: 0.05 },
      open: { rock: 0.32, boulder: 0.28, tree: 0.06, bush: 0.04 },
    },
    vegTint: { ...NO_TINT, bush: [0.55, 0.5, 0.48] },
    vegDensity: { tree: 0.3, bush: 0.15, rock: 1.7, grass: 0, boulder: 1.5 },
  },

  // autumn: the deciduous woodland's fall coat — a warm red/orange/gold canopy (treeAutumn, a
  // distinct mesh, not just a tint: multiplying a green canopy by any one colour can't turn it
  // red) over the same lush undergrowth, golden late-day grass
  autumn: {
    props: { ...DEFAULT_PROPS, tree: 'treeAutumn', bush: ['bush', 'bush', 'bushBerry'], grass: ['grass', 'grass', 'flowerTuft'] },
    mix: DECIDUOUS_MIX,
    vegTint: { tree: [1, 1, 1], bush: [1.1, 0.85, 0.5], rock: [1.0, 0.95, 0.85], grass: [1.25, 1.0, 0.5], boulder: [1.0, 0.95, 0.85] },
    vegDensity: DECIDUOUS_DENSITY,
  },
};