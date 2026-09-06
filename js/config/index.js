// Public surface of the config folder. Game code imports from here only.
export * from './quality.js';
export * from './sim.js';
export * from './render.js';
export * from './biomes.js';
export * from './bridges.js';
export * from './rivers.js';
export * from './hazards.js';
export * from './loot.js';
export * from './economy.js';
export * from './kayak.js';
export * from './controls.js';

import { BIOMES } from './biomes.js';
import { BIOME_SKY, BIOME_ORDER, TIME_OF_DAY } from './render.js';
import { BRIDGE_MATERIALS } from './bridges.js';
import { RIVERS, RIVERS_HIDDEN, RIVER_PACKS, TIER_SCALE } from './rivers.js';
import { OBSTACLES } from './hazards.js';
import { COLLECTIBLES, SPECIAL_ITEMS } from './loot.js';
import { CRAFTS, ITEMS, UPGRADES, TRAINING, STORE_LISTING } from './economy.js';

// Cross-reference checks. Geometry is checked by river.validateRiverConfig; this catches the
// dangling-name class of mistake (a typo'd biome, a pack on the wrong tier, a store id that
// doesn't exist) at start-up instead of as an undefined-property crash mid-run.
export function validateConfig() {
  const problems = [];
  const check = (ok, msg) => { if (!ok) problems.push(msg); };
  const OBST_META_KEYS = new Set(['max', 'spawnAhead']);
  const RUCKSACK_KINDS = new Set(['empty', 'special', ...Object.keys(COLLECTIBLES), ...Object.keys(ITEMS)]);

  // biomes: every biome needs a shader id and a sky, and vice versa
  for (const id of Object.keys(BIOMES)) {
    check(BIOME_ORDER.includes(id), `BIOMES.${id} is missing from BIOME_ORDER`);
    check(id in BIOME_SKY, `BIOMES.${id} has no BIOME_SKY entry`);
  }
  for (const id of BIOME_ORDER) check(id in BIOMES, `BIOME_ORDER lists unknown biome "${id}"`);

  // rivers
  const names = new Set();
  for (const R of [...RIVERS, ...RIVERS_HIDDEN]) {
    const where = `river "${R.name}"`;
    check(!names.has(R.name), `${where}: duplicate name`);
    names.add(R.name);
    check(R.tier in TIER_SCALE, `${where}: unknown tier "${R.tier}"`);
    check(!R.biome || R.biome in BIOMES, `${where}: unknown biome "${R.biome}"`);
    check(!R.timeOfDay || R.timeOfDay in TIME_OF_DAY, `${where}: unknown timeOfDay "${R.timeOfDay}"`);
    check(!R.extraKind || R.extraKind in COLLECTIBLES, `${where}: unknown extraKind "${R.extraKind}"`);
    if (R.pack) {
      check(R.pack in RIVER_PACKS, `${where}: unknown pack "${R.pack}"`);
      check(!R.hidden, `${where}: hidden rivers are unlocked by the map item, not a pack`);
      check(RIVER_PACKS[R.pack] && RIVER_PACKS[R.pack].tier === R.tier, `${where}: pack "${R.pack}" belongs to another tier`);
    }
    for (const k of Object.keys(R.obstacles || {})) {
      check(OBST_META_KEYS.has(k) || k in OBSTACLES.kinds, `${where}: unknown obstacle kind "${k}"`);
    }
    for (const b of R.builtBridges || []) {
      check(!b.material || b.material in BRIDGE_MATERIALS, `${where}: unknown bridge material "${b.material}"`);
    }
  }
  for (const tier of Object.keys(TIER_SCALE)) {
    const hidden = RIVERS_HIDDEN.filter(r => r.tier === tier).length;
    check(hidden === 1, `tier "${tier}" has ${hidden} hidden rivers (the menu expects exactly one)`);
    check(Object.values(RIVER_PACKS).some(p => p.tier === tier), `tier "${tier}" has no river pack`);
  }

  // loot
  for (const r of COLLECTIBLES.rucksack.roll) check(RUCKSACK_KINDS.has(r.kind), `rucksack roll: unknown kind "${r.kind}"`);
  for (const id of Object.keys(SPECIAL_ITEMS)) {
    check(id in COLLECTIBLES || id in ITEMS || id in CRAFTS || id in UPGRADES || id === 'book',
      `SPECIAL_ITEMS.${id} doesn't resolve to a collectible, item, craft or upgrade`);
  }

  // store
  const TABLES = { item: ITEMS, craft: CRAFTS, upgrade: UPGRADES, pack: RIVER_PACKS };
  for (const e of STORE_LISTING) {
    const ok = e.type === 'training' ? TRAINING.some(t => t.id === e.id) : TABLES[e.type] && e.id in TABLES[e.type];
    check(ok, `STORE_LISTING: unknown ${e.type} "${e.id}"`);
    if (e.type !== 'training' && ok) check(TABLES[e.type][e.id].price != null, `STORE_LISTING: ${e.type} "${e.id}" has no price`);
  }

  if (problems.length) throw new Error(problems.join('\n'));
}