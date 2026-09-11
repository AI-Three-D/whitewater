import { CHARACTERS, TIER_POINTS, PICKUPS, RIVERS, TIERS, CRAFTS, ITEMS, UPGRADES, TRAINING, INJURY, RIVER_PACKS, SKILL, STAMINA, BASE_SPONSOR_INCOME } from './config/index.js';

const KEY = 'whitewater.save.v1';

export const pointsForLevel = level => Math.round(5 * 1.5 ** level);

// decided once at profile creation and kept for the life of the save (see profile.mapCarrier)
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
      // pre-existing saves get placeholder 'legacy' entries so levelsLost still lines up with p.level (see applyInjury)
      if (!Array.isArray(p.levelHistory)) p.levelHistory = Array.from({ length: p.level }, () => ({ skillGain: 0, staminaGain: 0, spent: 'legacy' }));

      return p;
    }
  } catch (_) { /* corrupt save → ignore */ }
  return null;
}
// held while the level editor's test run uses a synthetic, throwaway profile (editor.js) — every
// write in this file funnels through saveProfile, so this one flag keeps a test run from ever
// clobbering the player's real save, no matter how deep the call (useItem, awardRun, applyInjury, …)
let saveSuspended = false;
export const suspendSave = v => { saveSuspended = v; };
export function saveProfile(p) { if (!saveSuspended) localStorage.setItem(KEY, JSON.stringify(p)); }
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
export function unlockHidden(p, tier) { p.unlockedHidden[tier] = true; saveProfile(p); }

export const isSecretSpent = (p, R) => !!(R.singleAttempt && p.secretDone[R.name]);
export function markSecretSpent(p, R) { if (R.singleAttempt) { p.secretDone[R.name] = true; saveProfile(p); } }

export const character = p => CHARACTERS[p.charId];
export const canRaise = (p, trait) => p[trait] < character(p).caps[trait];
export const anyRaisable = p => canRaise(p, 'skill') || canRaise(p, 'stamina') || canRaise(p, 'health');

// each level-up pushes a levelHistory entry (exact skill/stamina delta, spent: null) so applyInjury can undo it exactly later
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

// returns { pts, basePts, paddleXp, coins, sponsorCoins, ups, bandaids, medikits, snacks, bookBoost, raftFound, helmetFound, healed }
export function awardRun(p, river, time, loot = { paddles: 0, coins: 0, coinValue: 0 }) {
  const basePts = TIER_POINTS[river.tier] ?? 1;
  const paddleXp = loot.paddles * PICKUPS.paddleXp;
  // coinValue is value-weighted across all currency kinds (coins + extras like diamonds); falls back to a plain coin count
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
  // 3 finishes in a row without a capsize heals a point of injury; a capsize resets the streak (see applyInjury)
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
// returns { gain, recovered, injury, cap, levelsLost }; hitting the health cap unwinds up to 2 levels via
// levelHistory, empties coins/inventory (crafts/upgrades/packs survive), and clears injury
export function applyInjury(p, tier) {
  let reduction = p.upgrades.includes('lifevest') ? (UPGRADES.lifevest.injuryReduction || 0) : 0;
  if ((tier === 'medium' || tier === 'hard') && p.upgrades.includes('helmet')) reduction += UPGRADES.helmet.medHardReduction || 0;
  // floors at 1 — reduction gear can blunt a fall but never make it free
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
      if (entry.spent === null) p.pending = Math.max(0, p.pending - 1);   // never spent — drop it from the pool too
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
export function healInjury(p, id) {
  if (!canHeal(p, id)) return false;
  p.inventory[id]--; p.injury = Math.max(0, p.injury - ITEMS[id].heal); saveProfile(p);
  return true;
}

// resolves the oldest open levelHistory entry to this trait, so applyInjury knows what to undo later
export function spendPoint(p, trait) {
  if (p.pending <= 0 || !canRaise(p, trait)) return false;
  p[trait]++; p.pending--;
  const entry = p.levelHistory.find(e => e.spent === null);
  if (entry) entry.spent = trait;
  saveProfile(p);
  return true;
}
// marks open levelHistory entries spent: 'none' so applyInjury has nothing to double-subtract later
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
// buying a boat also selects it
export function buyCraft(p, id) {
if (!canBuyCraft(p, id)) return false;
p.coins -= CRAFTS[id].price; p.crafts.push(id); p.craft = id; saveProfile(p);
return true;
}
export function selectCraft(p, id) { if (p.crafts.includes(id)) { p.craft = id; saveProfile(p); } }
// the helmet is found, not bought — it has no `price`, so canBuyUpgrade always rejects it
export const ownsUpgrade = (p, id) => p.upgrades.includes(id);
export const canBuyUpgrade = (p, id) => !!UPGRADES[id] && UPGRADES[id].price > 0 && !ownsUpgrade(p, id) && p.coins >= UPGRADES[id].price;
export function buyUpgrade(p, id) {
  if (!canBuyUpgrade(p, id)) return false;
  p.coins -= UPGRADES[id].price; p.upgrades.push(id); saveProfile(p);
  return true;
}
export const canBuyTraining = (p, id) => { const t = TRAINING.find(x => x.id === id); return !!t && p.coins >= t.price; };
// returns { ups } on success, falsy on failure
export function buyTraining(p, id) {
  const t = TRAINING.find(x => x.id === id);
  if (!t || !canBuyTraining(p, id)) return false;
  p.coins -= t.price;
  const ups = addPoints(p, t.xp);
  saveProfile(p);
  return { ups };
}
export const ownsPack = (p, id) => p.riverPacks.includes(id);
export const canBuyPack = (p, id) => !!RIVER_PACKS[id] && !ownsPack(p, id) && p.coins >= RIVER_PACKS[id].price;
export function buyPack(p, id) {
  if (!canBuyPack(p, id)) return false;
  p.coins -= RIVER_PACKS[id].price; p.riverPacks.push(id); saveProfile(p);
  return true;
}
// unrelated to the hidden/map-item river lock — see unlockHidden/profile.unlockedHidden
export const riverUnlocked = (p, river) => !river.pack || ownsPack(p, river.pack);
// saved immediately — eating isn't undone by a capsize
export function useItem(p, id) {
if (itemCount(p, id) <= 0) return false;
p.inventory[id]--; saveProfile(p);
return true;
}