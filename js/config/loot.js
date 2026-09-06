// Everything you can pick up on the water.
import { TIER_SCALE } from './rivers.js';

export const PICKUPS = {
  perTierBase: 8,
  paddleXp: 1,
  coinValue: 1,
  floatFracOfExtra: 0.5,     // of the pickups above perTierBase, this fraction bob out of reach
  countForTier: tier => PICKUPS.perTierBase * TIER_SCALE[tier],
  hover: 0.55,               // metres above the water surface at rest
  paddleScale: 1.1,          // pickup paddle size multiplier
  spinSpeed: 0.6,            // rad/s — slow spin around the vertical axis
  bobAmp: 0.45,              // metres of vertical travel for the floating ones
  bobSpeed: 0.5,             // rad/s
  reachBob: -0.3,            // floating ones are only reachable while sin(bob phase) is below this
  collectRadius: 1.6,        // metres (xz) from the paddler needed to pick one up
  proximityRadius: 14,       // metres — passing this close starts the fade-out clock
  fadeTime: 9.9,             // seconds from "seen up close" to gone — a brief harvesting window
  burstCount: 10,            // sparks spawned on pickup
  burstLife: 0.5,            // seconds a burst spark lives
};

// `type` picks which loot tally a pickup feeds when collected: 'xp' → runLoot.paddles,
// 'currency' → runLoot.coins (scaled by `value`), 'random' → a roll (see pickups.rollRucksack).
// A river can add one extra kind on top of the default paddle/coin via RIVERS[].extraKind.
export const COLLECTIBLES = {
  paddle: { mesh: 'paddle', type: 'xp', value: 1, color: [0.95, 0.82, 0.1] },
  coin: { mesh: 'coin', type: 'currency', value: 1, color: [1.0, 0.86, 0.3] },
  diamond: { mesh: 'diamond', type: 'currency', value: 5, color: [0.65, 0.92, 1.0] },
  rucksack: {
    mesh: 'rucksack', type: 'random', color: [0.55, 0.42, 0.28],
    roll: [
      { kind: 'empty', weight: 0.2 },
      { kind: 'coin', weight: 0.3 },
      { kind: 'snack', weight: 0.2 },
      { kind: 'bandaid', weight: 0.2 },
      { kind: 'special', weight: 0.1 },
    ],
  },
};

// second-stage roll for a rucksack's 'special' outcome — equal chance each. `raft` and `helmet`
// are globally one-off (see economy.CRAFTS.raft / UPGRADES.helmet): once a profile already has
// one, that slot resolves to empty instead of a duplicate.
export const SPECIAL_ITEMS = {
  diamond: { color: COLLECTIBLES.diamond.color },
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
  count: 10,                                   // slots; spawned live, not pre-placed
  spinSpeed: 0.5, scale: 2, hover: 0.12,
  fadeTime: 99,                                // 10× PICKUPS.fadeTime — they're meant to be caught
  collectRadius: 2.2,
  spawnInterval: 6,                            // [s]
  spawnBehindMin: 12, spawnBehindMax: 28,      // [m] upstream — drift past the player
  aheadFrac: 0.5, spawnAheadMin: 190, spawnAheadMax: 260,
  spawnBoost: 3, spawnBoostMin: 2, spawnBoostDist: 42,   // behind-spawns shoot past for this many metres
  baseFactor: 1.7,                             // drift speed relative to the current
  drag: 2.2,                                   // [1/s] inertia easing toward the target velocity
  checkInterval: 4, stuckDist: 0.6, nudgeSpeed: 0.8,     // stuck detection and the nudge back to mid-channel
};