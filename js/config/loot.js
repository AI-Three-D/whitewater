// Things collected on the water: scattered pickups, the drifting rucksacks and the hidden map.
import { TIER_SCALE } from './rivers.js';

const PER_TIER_BASE = 8;

export const PICKUPS = {
  perTierBase: PER_TIER_BASE,
  paddleXp: 1,
  coinValue: 1,
  floatFracOfExtra: 0.5,
  countForTier: tier => PER_TIER_BASE * TIER_SCALE[tier],
  hover: 0.55,
  paddleScale: 1.1,
  spinSpeed: 0.6,
  bobAmp: 0.45,
  bobSpeed: 0.5,
  reachBob: -0.3,
  evasiveBobAmp: 3,         // "evasive" coins bob much higher/faster than the regular float above
  evasiveBobSpeed: 1.8,
  collectRadius: 1.6,
  proximityRadius: 14,      // [m] passing this close starts the fade-out clock
  fadeTime: 9.9,
  burstCount: 10,
  burstLife: 0.5,
};

// `type` picks the loot tally a pickup feeds: 'xp', 'currency' (scaled by value), or 'random'
// (weighted roll, see rollRucksack in pickups.js). RIVERS[].extraKind/extraCount add one extra kind.
export const COLLECTIBLES = {
  paddle:  { mesh: 'paddle',  type: 'xp',       value: 1, color: [0.95, 0.82, 0.1] },
  coin:    { mesh: 'coin',    type: 'currency', value: 1, color: [1.0, 0.86, 0.3] },
  diamond: { mesh: 'diamond', type: 'currency', value: 5, color: [0.65, 0.92, 1.0] },
  rucksack: {
    mesh: 'rucksack', type: 'random', color: [0.55, 0.42, 0.28],
    roll: [
      { kind: 'empty',   weight: 0.2 },
      { kind: 'coin',    weight: 0.3 },
      { kind: 'snack',   weight: 0.2 },
      { kind: 'bandaid', weight: 0.2 },
      { kind: 'special', weight: 0.1 },
    ],
  },
};

// second-stage roll for a rucksack's 'special' outcome; raft/helmet are one-off (see CRAFTS.raft /
// UPGRADES.helmet) and resolve to empty once already owned
export const SPECIAL_ITEMS = {
  diamond: { color: COLLECTIBLES.diamond.color },
  medikit: { color: [0.9, 0.2, 0.25] },
  book:    { color: [0.55, 0.35, 0.85] },
  raft:    { color: [0.85, 0.78, 0.15] },
  helmet:  { color: [0.75, 0.78, 0.82] },
};

export const MAP_ITEM = {
  mesh: 'map', color: [0.85, 0.72, 0.45], scale: 1.3, spinSpeed: 0.9,
  hover: 0.7, collectRadius: 1.8,
};

export const RUCKSACK = {
  count: 10,                         // slots reserved per river (max alive + collected at once)
  spinSpeed: 0.5, scale: 2, hover: 0.12,
  fadeTime: 99,
  finishFadeTime: 3,                 // faster fade past the take-out, so they don't pile up at the z-clamp
  collectRadius: 2.2,
  spawnInterval: 6,                  // seconds between spawns, alternating ahead of / behind the boat
  aheadFrac: 0.5, spawnAheadMin: 190, spawnAheadMax: 260,
  spawnBehindMin: 12, spawnBehindMax: 28,
  spawnBoost: 3, spawnBoostMin: 2, spawnBoostDist: 42,   // behind-spawns launch faster than the current to catch up
  baseFactor: 1.7, drag: 2.2, checkInterval: 4, stuckDist: 0.6, nudgeSpeed: 0.8,
};