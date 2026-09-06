// Cross-table sanity checks. The config is full of string references between tables; a typo in
// one would otherwise surface as a black sky or an undefined read deep in a frame. Run once at
// boot (main.js), before validateRiverConfig.
import { QUALITY, QUALITY_LEVELS } from './simulation.js';
import { BIOMES, BIOME_SKY, BIOME_IDS, TIME_OF_DAY } from './environment.js';
import { TIERS, RIVERS, RIVERS_HIDDEN, RIVER_PACKS } from './rivers.js';
import { OBSTACLES } from './hazards.js';
import { BRIDGE_MATERIALS } from './bridges.js';
import { COLLECTIBLES, SPECIAL_ITEMS } from './loot.js';
import { CRAFTS, ITEMS, UPGRADES, TRAINING, STORE_LISTING } from './store.js';

const STORE_TABLES = {
  item: id => ITEMS[id],
  training: id => TRAINING.find(t => t.id === id),
  upgrade: id => UPGRADES[id],
  craft: id => CRAFTS[id],
  pack: id => RIVER_PACKS[id],
};
const RUCKSACK_KINDS = new Set(['empty', 'coin', 'snack', 'bandaid', 'special']);

export function validateConfig() {
  const errors = [];
  const check = (ok, msg) => { if (!ok) errors.push(msg); };

  // quality tiers
  for (const q of QUALITY_LEVELS) {
    check(QUALITY[q], `QUALITY: level "${q}" is listed but not defined`);
    for (const f of ['grid', 'particles', 'veg', 'dprCap', 'viewAhead', 'computeAhead', 'lod']) {
      check(QUALITY[q] && QUALITY[q][f] !== undefined, `QUALITY.${q}: missing "${f}"`);
    }
  }

  // biomes: sky, ids and the role tables must all agree
  for (const b of Object.keys(BIOMES)) {
    check(BIOME_SKY[b], `BIOME_SKY: no entry for biome "${b}"`);
    const { props, vegTint, vegDensity } = BIOMES[b];
    for (const role of Object.keys(props)) {
      check(vegTint[role], `BIOMES.${b}.vegTint: missing role "${role}"`);
      check(vegDensity[role] !== undefined, `BIOMES.${b}.vegDensity: missing role "${role}"`);
    }
  }
  for (const b of Object.keys(BIOME_SKY)) check(BIOMES[b], `BIOME_SKY: "${b}" has no BIOMES entry`);
  check(Object.keys(BIOME_IDS).length === Object.keys(BIOMES).length, 'BIOME_IDS out of sync with BIOMES');

  // rivers
  const tierIds = TIERS.map(t => t.id);
  const names = new Set();
  for (const R of [...RIVERS, ...RIVERS_HIDDEN]) {
    const at = `river "${R.name}"`;
    check(!names.has(R.name), `${at}: duplicate name (names key profile.best)`);
    names.add(R.name);
    check(tierIds.includes(R.tier), `${at}: unknown tier "${R.tier}"`);
    check(!R.biome || BIOMES[R.biome], `${at}: unknown biome "${R.biome}"`);
    check(!R.timeOfDay || TIME_OF_DAY[R.timeOfDay], `${at}: unknown timeOfDay "${R.timeOfDay}"`);
    check(!R.extraKind || COLLECTIBLES[R.extraKind], `${at}: unknown extraKind "${R.extraKind}"`);
    if (R.pack) {
      check(RIVER_PACKS[R.pack], `${at}: unknown pack "${R.pack}"`);
      check(!RIVER_PACKS[R.pack] || RIVER_PACKS[R.pack].tier === R.tier, `${at}: pack "${R.pack}" belongs to another tier`);
    }
    for (const k of Object.keys(R.obstacles || {})) {
      check(k === 'max' || k === 'spawnAhead' || OBSTACLES.kinds[k], `${at}: unknown obstacle kind "${k}"`);
    }
    for (const bb of R.builtBridges || []) {
      check(!bb.material || BRIDGE_MATERIALS[bb.material], `${at}: unknown bridge material "${bb.material}"`);
    }
  }
  for (const t of tierIds) {
    check(RIVERS_HIDDEN.filter(r => r.tier === t).length === 1, `tier "${t}": expected exactly one hidden river`);
    check(Object.values(RIVER_PACKS).some(p => p.tier === t), `tier "${t}": no river pack`);
  }

  // loot
  for (const r of COLLECTIBLES.rucksack.roll) check(RUCKSACK_KINDS.has(r.kind), `rucksack roll: unknown kind "${r.kind}"`);
  check(CRAFTS.raft && UPGRADES.helmet, 'SPECIAL_ITEMS raft/helmet need CRAFTS.raft and UPGRADES.helmet');
  for (const k of Object.keys(SPECIAL_ITEMS)) {
    check(['diamond', 'medikit', 'book', 'raft', 'helmet'].includes(k), `SPECIAL_ITEMS: "${k}" has no reward handler (pickups.js)`);
  }

  // store
  for (const e of STORE_LISTING) {
    const lookup = STORE_TABLES[e.type];
    check(lookup, `STORE_LISTING: unknown type "${e.type}"`);
    check(lookup && lookup(e.id), `STORE_LISTING: ${e.type} "${e.id}" does not exist`);
    check(!lookup || !lookup(e.id) || lookup(e.id).price !== undefined, `STORE_LISTING: ${e.type} "${e.id}" has no price`);
  }

  if (errors.length) throw new Error(errors.join('\n'));
}