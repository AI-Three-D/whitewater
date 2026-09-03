import { CHARACTERS, TIER_POINTS, PICKUPS, RIVERS, TIERS, BOATS, DEFAULT_BOAT } from './config.js';

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
      if (!p.inventory) p.inventory = {};
      if (!Array.isArray(p.boats) || !p.boats.length) p.boats = [DEFAULT_BOAT];
      p.boats = p.boats.filter(b => BOATS[b]);        // drop boats a config change removed
      if (!p.boats.length) p.boats = [DEFAULT_BOAT];
      if (!BOATS[p.boat]) p.boat = p.boats[0];
      
      if (!p.mapCarrier) p.mapCarrier = pickCarriers();
      if (!p.unlockedHidden) p.unlockedHidden = freshUnlocks();
      return p;
    }
  } catch (_) { /* corrupt save → ignore */ }
  return null;
}
export function saveProfile(p) { localStorage.setItem(KEY, JSON.stringify(p)); }
export function clearProfile() { localStorage.removeItem(KEY); }

export function newProfile(charId) {
  const c = CHARACTERS[charId];
  const p = { charId, level: 0, points: 0, pending: 0, coins: 0, skill: c.start.skill, stamina: c.start.stamina, runs: 0, best: {},
    inventory: {}, boats: [DEFAULT_BOAT], boat: DEFAULT_BOAT,
    mapCarrier: pickCarriers(), unlockedHidden: freshUnlocks() };

  saveProfile(p);
  return p;
}
/** Called when the tier's map item is collected. Permanent — the hidden river stays unlocked. */
export function unlockHidden(p, tier) { p.unlockedHidden[tier] = true; saveProfile(p); }

export const character = p => CHARACTERS[p.charId];
export const canRaise = (p, trait) => p[trait] < character(p).caps[trait];
export const anyRaisable = p => canRaise(p, 'skill') || canRaise(p, 'stamina');

/** Called on a completed run. `loot` is only ever counted here — a capsize discards it.
 *  Returns { pts, basePts, paddleXp, coins, ups }. */
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
  let ups = 0;
  while (p.points >= pointsForLevel(p.level)) { p.points -= pointsForLevel(p.level); p.level++; p.pending++; ups++; }
  saveProfile(p);
  return { pts, basePts, paddleXp, coins, ups };
}

/** Spend one pending level-up point on a trait. */
export function spendPoint(p, trait) {
  if (p.pending <= 0 || !canRaise(p, trait)) return false;
  p[trait]++; p.pending--; saveProfile(p);
  return true;
}
/** Both traits capped — a pending point can't be used; throw it away so the dialog doesn't loop. */
export function discardPending(p) { p.pending = 0; saveProfile(p); }
// ---------- inventory, store and boat selection ----------
export const itemCount = (p, id) => (p.inventory && p.inventory[id]) || 0;
export const ownsBoat = (p, id) => p.boats.includes(id);

/** Can this store item be bought right now? Covers price, already-owned boats and stack caps. */
export function canBuy(p, item) {
  if ((p.coins || 0) < item.price) return false;
  if (item.kind === 'boat') return !ownsBoat(p, item.boat);
  if (item.stackMax && itemCount(p, item.id) >= item.stackMax) return false;
  return true;
}
export function buyItem(p, item) {
  if (!canBuy(p, item)) return false;
  p.coins -= item.price;
  if (item.kind === 'boat') p.boats.push(item.boat);
  else p.inventory[item.id] = itemCount(p, item.id) + 1;
  saveProfile(p);
  return true;
}
export function selectBoat(p, id) {
  if (!ownsBoat(p, id)) return false;
  p.boat = id; saveProfile(p);
  return true;
}
/** Spend one of an inventory item. Banked immediately, so a capsize doesn't refund it. */
export function consumeItem(p, id) {
  if (itemCount(p, id) <= 0) return false;
  p.inventory[id]--; saveProfile(p);
  return true;
}