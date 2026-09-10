import { CHARACTERS, TIER_POINTS, PICKUPS, RIVERS, TIERS, CRAFTS, ITEMS, UPGRADES, TRAINING, INJURY, RIVER_PACKS, SKILL, STAMINA, BASE_SPONSOR_INCOME } from './config/index.js';

const KEY = 'whitewater.save.v1';

/** Points needed to go from `level` to `level + 1`: 5, 8, 11, 17, 25, 38, …
 *  (50% more per level rather than 100% — the old doubling curve made levels past ~7
 *  take too long to reach, so it's been eased off.) */
export const pointsForLevel = level => Math.round(5 * 1.5 ** level);

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
      if (!p.secretDone) p.secretDone = {};
      if (!p.inventory) p.inventory = {};
      if (!p.crafts) p.crafts = ['classic'];
      if (!p.craft || !CRAFTS[p.craft]) p.craft = 'classic';
      if (!p.upgrades) p.upgrades = [];
      if (typeof p.injury !== 'number') p.injury = 0;
      if (typeof p.health !== 'number') p.health = CHARACTERS[p.charId].start.health;
      if (!p.riverPacks) p.riverPacks = [];
      if (typeof p.cleanStreak !== 'number') p.cleanStreak = 0;
      // one entry per level gained, so a recovery (see applyInjury) can strip the most recent
      // ones exactly instead of guessing. Saves from before this existed get placeholder entries
      // (spent: 'legacy') — their true skill/stamina/spend history isn't recoverable, but the
      // count still lines up with p.level so levelsLost is accurate for old characters too.
      if (!Array.isArray(p.levelHistory)) p.levelHistory = Array.from({ length: p.level }, () => ({ skillGain: 0, staminaGain: 0, spent: 'legacy' }));

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
    health: c.start.health, injury: 0, runs: 0, best: {}, cleanStreak: 0, levelHistory: [],
    mapCarrier: pickCarriers(), unlockedHidden: freshUnlocks(), secretDone: {},
    inventory: {}, crafts: ['classic'], craft: 'classic', upgrades: [], riverPacks: [] };
  saveProfile(p);
  return p;
}
/** Called when the tier's map item is collected. Permanent — the hidden river stays unlocked. */
export function unlockHidden(p, tier) { p.unlockedHidden[tier] = true; saveProfile(p); }

/** A `singleAttempt` river (currently just the secrets) is spent forever once its one launch has
 *  happened — win, capsize or time out, it doesn't matter (see markSecretSpent in startRun). */
export const isSecretSpent = (p, R) => !!(R.singleAttempt && p.secretDone[R.name]);
export function markSecretSpent(p, R) { if (R.singleAttempt) { p.secretDone[R.name] = true; saveProfile(p); } }

export const character = p => CHARACTERS[p.charId];
export const canRaise = (p, trait) => p[trait] < character(p).caps[trait];
export const anyRaisable = p => canRaise(p, 'skill') || canRaise(p, 'stamina') || canRaise(p, 'health');

/** Banks xp and rolls it into as many level-ups as it covers, applying the same passive
 *  skill/stamina growth (see SKILL/STAMINA.passivePerLevel) each one gets from a run. Shared by
 *  awardRun (run finish xp) and buyTraining (bought xp) so both level up the same way.
 *  Each level-up pushes a levelHistory entry recording exactly how much it grew skill/stamina
 *  (the actual delta applied, already capped — so undoing it later is exact, not a guess) and
 *  leaves `spent: null` until spendPoint (or discardPending) resolves it — see applyInjury. */
function addPoints(p, pts) {
  p.points += pts;
  let ups = 0;
  while (p.points >= pointsForLevel(p.level)) {
    p.points -= pointsForLevel(p.level); p.level++; p.pending++; ups++;
    const c = character(p);
    const skillGain = Math.min(c.caps.skill, p.skill + SKILL.passivePerLevel) - p.skill;
    const staminaGain = Math.min(c.caps.stamina, p.stamina + STAMINA.passivePerLevel) - p.stamina;
    p.skill += skillGain; p.stamina += staminaGain;
    p.levelHistory.push({ skillGain, staminaGain, spent: null });
  }
  return ups;
}

/** Called on a completed run. `loot` is only ever counted here — a capsize discards it, rucksack
 *  finds (bandaids, snacks, medikits, the raft/helmet special items, book skill boosts) included,
 *  same as coins and paddle xp always have been.
 *  Returns { pts, basePts, paddleXp, coins, sponsorCoins, ups, bandaids, medikits, snacks, bookBoost, raftFound, helmetFound, healed }. */
export function awardRun(p, river, time, loot = { paddles: 0, coins: 0, coinValue: 0 }) {
  const basePts = TIER_POINTS[river.tier] ?? 1;
  const paddleXp = loot.paddles * PICKUPS.paddleXp;
  // coinValue is the value-weighted sum across every currency-type collectible kind collected
  // (plain coins plus any river-specific extras like diamonds); falls back to a plain coin
  // count for callers that don't pass it.
  const sponsorCoins = BASE_SPONSOR_INCOME + (p.upgrades.includes('sponsor') ? (UPGRADES.sponsor.runIncome || 0) : 0);
  const coins = (loot.coinValue ?? loot.coins) * PICKUPS.coinValue + sponsorCoins;
  const pts = basePts + paddleXp;
  p.coins += coins; p.runs++;
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
  const ups = addPoints(p, pts);
  // three finishes in a row without a capsize between them earns a point of injury recovery —
  // a capsize (applyInjury) resets the streak back to zero.
  p.cleanStreak = (p.cleanStreak || 0) + 1;
  let healed = 0;
  if (p.cleanStreak >= 3) {
    p.cleanStreak = 0;
    if (p.injury > 0) { p.injury--; healed = 1; }
  }
  saveProfile(p);
  return { pts, basePts, paddleXp, coins, sponsorCoins, ups, bandaids: loot.bandaids || 0, medikits: loot.medikits || 0,
    snacks: loot.snacks || 0, bookBoost, raftFound, helmetFound, healed };
}

// ---------- injury ----------
/** Called on a capsize. Adds this tier's injury (minus any owned reduction) to the profile, and
 *  resets the clean-run streak (see awardRun) since a capsize breaks it.
 *  Reaching the health cap is no longer permadeath — it benches the paddler for a long recovery
 *  instead: the last up-to-2 levels are unwound one by one using their levelHistory entries (the
 *  exact skill/stamina gain that level gave, and whichever trait its point was spent on, if any —
 *  see addPoints/spendPoint), every coin is spent on care, and the consumable pack is emptied.
 *  Owned crafts/upgrades/river packs survive (they're gear, not consumed), and the time off fully
 *  clears the injury that caused this.
 *  Returns { gain, recovered, injury, cap, levelsLost }. */
export function applyInjury(p, tier) {
  let reduction = p.upgrades.includes('lifevest') ? (UPGRADES.lifevest.injuryReduction || 0) : 0;
  if ((tier === 'medium' || tier === 'hard') && p.upgrades.includes('helmet')) reduction += UPGRADES.helmet.medHardReduction || 0;
  // a capsize always costs at least 1 injury — stacked reduction gear can blunt a fall but never
  // make it free, so this floors at 1 rather than letting lifevest+helmet zero it out.
  const base = INJURY.perTier[tier] || 0;
  const gain = base > 0 ? Math.max(1, base - reduction) : 0;
  p.injury = (p.injury || 0) + gain;
  p.cleanStreak = 0;
  const recovered = p.injury >= p.health;
  let levelsLost = 0;
  if (recovered) {
    levelsLost = Math.min(2, p.level, p.levelHistory.length);
    for (let i = 0; i < levelsLost; i++) {
      const entry = p.levelHistory.pop();
      p.skill -= entry.skillGain;
      p.stamina -= entry.staminaGain;
      if (entry.spent === null) p.pending = Math.max(0, p.pending - 1);         // never spent — drop it from the pool too
      else if (entry.spent !== 'none' && entry.spent !== 'legacy') p[entry.spent] = Math.max(0, p[entry.spent] - 1);
    }
    p.level -= levelsLost;
    p.points = 0;
    const c = character(p);
    p.skill = Math.max(c.start.skill, p.skill);
    p.stamina = Math.max(c.start.stamina, p.stamina);
    p.coins = 0;
    p.inventory = {};
    p.injury = 0;
  }
  saveProfile(p);
  return { gain, recovered, injury: p.injury, cap: p.health, levelsLost };
}
export const canHeal = (p, id) => !!ITEMS[id] && ITEMS[id].heal > 0 && itemCount(p, id) > 0 && p.injury > 0;
/** Spend one bandaid/medikit to reverse some injury. Not time-pressured — usable any time outside a run. */
export function healInjury(p, id) {
  if (!canHeal(p, id)) return false;
  p.inventory[id]--; p.injury = Math.max(0, p.injury - ITEMS[id].heal); saveProfile(p);
  return true;
}

/** Spend one pending level-up point on a trait. Resolves the oldest still-open levelHistory entry
 *  (spent: null) to this trait, so a later recovery (applyInjury) knows what to undo if that
 *  specific level ends up being one of the ones stripped. */
export function spendPoint(p, trait) {
  if (p.pending <= 0 || !canRaise(p, trait)) return false;
  p[trait]++; p.pending--;
  const entry = p.levelHistory.find(e => e.spent === null);
  if (entry) entry.spent = trait;
  saveProfile(p);
  return true;
}
/** Both traits capped — a pending point can't be used; throw it away so the dialog doesn't loop.
 *  Marks every still-open levelHistory entry as spent: 'none' (nothing to undo, and nothing left
 *  in `pending` to double-subtract if that level is later stripped). */
export function discardPending(p) {
  for (const e of p.levelHistory) if (e.spent === null) e.spent = 'none';
  p.pending = 0; saveProfile(p);
}

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
// training: repeatable, not owned — buy as many sessions as coins allow, any time, and the xp
// banks the same way a run's finish/paddle points do (see addPoints).
export const canBuyTraining = (p, id) => { const t = TRAINING.find(x => x.id === id); return !!t && p.coins >= t.price; };
/** Returns { ups } on success (falsy on failure), so a level-up dialog can be shown like a run's. */
export function buyTraining(p, id) {
  const t = TRAINING.find(x => x.id === id);
  if (!t || !canBuyTraining(p, id)) return false;
  p.coins -= t.price;
  const ups = addPoints(p, t.xp);
  saveProfile(p);
  return { ups };
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