import { CHARACTERS, TIER_POINTS, PICKUPS } from './config.js';

const KEY = 'whitewater.save.v1';

/** Points needed to go from `level` to `level + 1`: 5, 10, 20, 40, …
 *  (5x the old 1,2,4,8… curve — runs now earn up to ~10x as much thanks to pickups,
 *  but not everyone harvests every pickup, so the curve only scales 5x to compensate.) */
export const pointsForLevel = level => 5 * 2 ** level;

export function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p && CHARACTERS[p.charId] && typeof p.level === 'number') {
      if (typeof p.coins !== 'number') p.coins = 0;   // upgrade older saves
      return p;
    }
  } catch (_) { /* corrupt save → ignore */ }
  return null;
}
export function saveProfile(p) { localStorage.setItem(KEY, JSON.stringify(p)); }
export function clearProfile() { localStorage.removeItem(KEY); }

export function newProfile(charId) {
  const c = CHARACTERS[charId];
  const p = { charId, level: 0, points: 0, pending: 0, coins: 0, skill: c.start.skill, stamina: c.start.stamina, runs: 0, best: {} };
  saveProfile(p);
  return p;
}

export const character = p => CHARACTERS[p.charId];
export const canRaise = (p, trait) => p[trait] < character(p).caps[trait];
export const anyRaisable = p => canRaise(p, 'skill') || canRaise(p, 'stamina');

/** Called on a completed run. `loot` is only ever counted here — a capsize discards it.
 *  Returns { pts, basePts, paddleXp, coins, ups }. */
export function awardRun(p, river, time, loot = { paddles: 0, coins: 0 }) {
  const basePts = TIER_POINTS[river.tier] ?? 1;
  const paddleXp = loot.paddles * PICKUPS.paddleXp;
  const coins = loot.coins * PICKUPS.coinValue;
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