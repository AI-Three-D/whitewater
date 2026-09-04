import { CHARACTERS, TIER_POINTS, PICKUPS, RIVERS, TIERS, CRAFTS, ITEMS, UPGRADES, INJURY, RIVER_PACKS } from './config.js';

const KEY = 'whitewater.save.v1';

/** Points needed to go from `level` to `level + 1`: 5, 10, 20, 40, …
 *  (5x the old 1,2,4,8… curve — runs now earn up to ~10x as much thanks to pickups,
 *  but not everyone harvests every pickup, so the curve only scales 5x to compensate.) */
export const pointsForLevel = level => 5 * 2 ** level;

// one river per tier, randomly chosen to carry that tier's hidden-map pickup — decided once,
// at profile creation, and kept for the life of the save (see profile.mapCarrier).
function pickCarriers() {
  const carriers = {};
  for (const tier of TIERS) {
    const pool = RIVERS.filter(r => r.tier === tier.id && !r.hidden);
    carriers[tier.id] = pool[Math.floor(Math.random() * pool.length)].name;
  }
  return carriers;
}
const freshUnlocks = () => Object.fromEntries(TIERS.map(t => [t.id, false]));

export function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p && CHARACTERS[p.charId] && typeof p.level === 'number') {
      if (typeof p.coins !== 'number') p.coins = 0;   // upgrade older saves
      if (!p.mapCarrier) p.mapCarrier = pickCarriers();
      if (!p.unlockedHidden) p.unlockedHidden = freshUnlocks();
      if (!p.inventory) p.inventory = {};
      if (!p.crafts) p.crafts = ['classic'];
      if (!p.craft || !CRAFTS[p.craft]) p.craft = 'classic';
      if (!p.upgrades) p.upgrades = [];
      if (typeof p.injury !== 'number') p.injury = 0;
      if (typeof p.health !== 'number') p.health = CHARACTERS[p.charId].start.health;
      if (!p.riverPacks) p.riverPacks = [];

      return p;
    }
  } catch (_) { /* corrupt save → ignore */ }
  return null;
}
export function saveProfile(p) { localStorage.setItem(KEY, JSON.stringify(p)); }
export function clearProfile() { localStorage.removeItem(KEY); }

export function newProfile(charId) {
  const c = CHARACTERS[charId];
  const p = { charId, level: 0, points: 0, pending: 0, coins: 0, skill: c.start.skill, stamina: c.start.stamina,
    health: c.start.health, injury: 0, runs: 0, best: {},
    mapCarrier: pickCarriers(), unlockedHidden: freshUnlocks(),
    inventory: {}, crafts: ['classic'], craft: 'classic', upgrades: [], riverPacks: [] };
  saveProfile(p);
  return p;
}
/** Called when the tier's map item is collected. Permanent — the hidden river stays unlocked. */
export function unlockHidden(p, tier) { p.unlockedHidden[tier] = true; saveProfile(p); }

export const character = p => CHARACTERS[p.charId];
export const canRaise = (p, trait) => p[trait] < character(p).caps[trait];
export const anyRaisable = p => canRaise(p, 'skill') || canRaise(p, 'stamina') || canRaise(p, 'health');

/** Called on a completed run. `loot` is only ever counted here — a capsize discards it, rucksack
 *  finds (bandaids, snacks, medikits, the raft/helmet special items, book skill boosts) included,
 *  same as coins and paddle xp always have been.
 *  Returns { pts, basePts, paddleXp, coins, ups, bandaids, medikits, snacks, bookBoost, raftFound, helmetFound }. */
export function awardRun(p, river, time, loot = { paddles: 0, coins: 0, coinValue: 0 }) {
  const basePts = TIER_POINTS[river.tier] ?? 1;
  const paddleXp = loot.paddles * PICKUPS.paddleXp;
  // coinValue is the value-weighted sum across every currency-type collectible kind collected
  // (plain coins plus any river-specific extras like diamonds); falls back to a plain coin
  // count for callers that don't pass it.
  const coins = (loot.coinValue ?? loot.coins) * PICKUPS.coinValue;
  const pts = basePts + paddleXp;
  p.points += pts; p.coins += coins; p.runs++;
  if (!p.best[river.name] || time < p.best[river.name]) p.best[river.name] = time;
  for (const id of ['snack', 'bandaid', 'medikit']) {
    const n = loot[id + 's'] || 0;
    if (n) p.inventory[id] = Math.min(ITEMS[id].maxStack, itemCount(p, id) + n);
  }
  const bookBoost = loot.books || 0;
  if (bookBoost) p.pending += bookBoost;
  const raftFound = !!loot.raftFound && !p.crafts.includes('raft');
  if (raftFound) p.crafts.push('raft');
  const helmetFound = !!loot.helmetFound && !p.upgrades.includes('helmet');
  if (helmetFound) p.upgrades.push('helmet');
  let ups = 0;
  while (p.points >= pointsForLevel(p.level)) { p.points -= pointsForLevel(p.level); p.level++; p.pending++; ups++; }
  saveProfile(p);
  return { pts, basePts, paddleXp, coins, ups, bandaids: loot.bandaids || 0, medikits: loot.medikits || 0,
    snacks: loot.snacks || 0, bookBoost, raftFound, helmetFound };
}

// ---------- injury ----------
/** Called on a capsize. Adds this tier's injury (minus any owned reduction) to the profile.
 *  Returns { gain, dead, injury, cap }. On death (injury reaches the health cap) this is
 *  permadeath: the save is wiped outright, same as starting a new character — the caller still
 *  has to null out its own in-memory `profile`/`river` and send the player back to character
 *  select, saveProfile is not called in that case since there is nothing left to save. */
export function applyInjury(p, tier) {
  let reduction = p.upgrades.includes('lifevest') ? (UPGRADES.lifevest.injuryReduction || 0) : 0;
  if ((tier === 'medium' || tier === 'hard') && p.upgrades.includes('helmet')) reduction += UPGRADES.helmet.medHardReduction || 0;
  const gain = Math.max(0, (INJURY.perTier[tier] || 0) - reduction);
  p.injury = (p.injury || 0) + gain;
  const dead = p.injury >= p.health;
  if (dead) clearProfile(); else saveProfile(p);
  return { gain, dead, injury: p.injury, cap: p.health };
}
export const canHeal = (p, id) => !!ITEMS[id] && ITEMS[id].heal > 0 && itemCount(p, id) > 0 && p.injury > 0;
/** Spend one bandaid/medikit to reverse some injury. Not time-pressured — usable any time outside a run. */
export function healInjury(p, id) {
  if (!canHeal(p, id)) return false;
  p.inventory[id]--; p.injury = Math.max(0, p.injury - ITEMS[id].heal); saveProfile(p);
  return true;
}

/** Spend one pending level-up point on a trait. */
export function spendPoint(p, trait) {
  if (p.pending <= 0 || !canRaise(p, trait)) return false;
  p[trait]++; p.pending--; saveProfile(p);
  return true;
}
/** Both traits capped — a pending point can't be used; throw it away so the dialog doesn't loop. */
export function discardPending(p) { p.pending = 0; saveProfile(p); }

// ---------- store / inventory ----------
export const craftOf = p => CRAFTS[p.craft] || CRAFTS.classic;
export const itemCount = (p, id) => p.inventory[id] || 0;
export const canBuyItem = (p, id) => !!ITEMS[id] && p.coins >= ITEMS[id].price && itemCount(p, id) < ITEMS[id].maxStack;
export const canBuyCraft = (p, id) => !!CRAFTS[id] && !p.crafts.includes(id) && p.coins >= CRAFTS[id].price;
export function buyItem(p, id) {
if (!canBuyItem(p, id)) return false;
p.coins -= ITEMS[id].price; p.inventory[id] = itemCount(p, id) + 1; saveProfile(p);
return true;
}
/** Buying a boat also makes it the selected one — that's what you bought it for. */
export function buyCraft(p, id) {
if (!canBuyCraft(p, id)) return false;
p.coins -= CRAFTS[id].price; p.crafts.push(id); p.craft = id; saveProfile(p);
return true;
}
export function selectCraft(p, id) { if (p.crafts.includes(id)) { p.craft = id; saveProfile(p); } }
// upgrades (life vest, better paddle) are bought once and apply forever, regardless of the
// selected craft — unlike crafts there's nothing to "select", just own or not. The better helmet
// is the same shape but found rather than bought (no `price`, so canBuyUpgrade always rejects it).
export const ownsUpgrade = (p, id) => p.upgrades.includes(id);
export const canBuyUpgrade = (p, id) => !!UPGRADES[id] && UPGRADES[id].price > 0 && !ownsUpgrade(p, id) && p.coins >= UPGRADES[id].price;
export function buyUpgrade(p, id) {
  if (!canBuyUpgrade(p, id)) return false;
  p.coins -= UPGRADES[id].price; p.upgrades.push(id); saveProfile(p);
  return true;
}
// river packs: each tier's first 2 RIVERS entries are free (no `pack` field); the other 4 are
// split into 2 purchasable packs of 2 (see RIVER_PACKS / each river's `pack` field). Bought once,
// like a craft — nothing to select, a river in an owned pack is just playable from then on.
export const ownsPack = (p, id) => p.riverPacks.includes(id);
export const canBuyPack = (p, id) => !!RIVER_PACKS[id] && !ownsPack(p, id) && p.coins >= RIVER_PACKS[id].price;
export function buyPack(p, id) {
  if (!canBuyPack(p, id)) return false;
  p.coins -= RIVER_PACKS[id].price; p.riverPacks.push(id); saveProfile(p);
  return true;
}
/** Free rivers have no `pack`; a packed one needs its pack owned. Unrelated to the separate
 *  hidden/map-item river lock (see unlockHidden/profile.unlockedHidden). */
export const riverUnlocked = (p, river) => !river.pack || ownsPack(p, river.pack);
/** Consume one of an item. Saved immediately — eating isn't undone by a capsize. */
export function useItem(p, id) {
if (itemCount(p, id) <= 0) return false;
p.inventory[id]--; saveProfile(p);
return true;
}