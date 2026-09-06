// Collectibles: seeded paddle/coin(/diamond) placement, the live-spawned drifting rucksacks, the
// once-per-tier hidden map, and per-frame fade/collection.
import { PICKUPS, RUCKSACK, MAP_ITEM, COLLECTIBLES, SPECIAL_ITEMS, ITEMS } from './config/index.js';
import { clamp, mulberry32, mat4TRS } from './math.js';
import { nearestChan } from './river.js';
import { unlockHidden } from './progression.js';
import { S } from './state.js';
import { gpu, ensureInstBuf } from './gpu.js';
import { waterAt, rowOf, randomChannelSpot } from './sampling.js';
import { kayak } from './kayak.js';
import { spawnBurst } from './effects.js';
import { popLoot } from './hud.js';
import { W, dx } from './quality.js';

const TWO_PI = 2 * Math.PI;
export const pickupInstBufs = {};   // kind → instance buffer (grow-only)

// every kind that gets updated/drawn, in draw order
export const allPickupKinds = () => [...S.river.pickupKinds, 'map'];

// per-kind tuning tables; the plain scattered pickups share PICKUPS
const kindParams = kind => (kind === 'map' ? MAP_ITEM : kind === 'rucksack' ? RUCKSACK : PICKUPS);
const kindScale = kind => {
  if (kind === 'map') return MAP_ITEM.scale;
  if (kind === 'rucksack') return RUCKSACK.scale;
  return kind === 'paddle' ? PICKUPS.paddleScale : 1;
};

const newPickup = (x, z, rng) => ({
  x, z, floating: false, spinPh: rng() * TWO_PI, bobPh: rng() * TWO_PI, alive: true, collected: false, seenT: -1,
});

// ---- placement ----
function seededList(seedOff, total, floatCount) {
  const river = S.river;
  const rng = mulberry32(river.seed + seedOff), flagRng = mulberry32(river.seed + seedOff + 1);
  const zOf = () => 45 + rng() * (river.finishZ - 65);
  const list = [];
  for (let n = 0; n < total; n++) {
    const { x, z } = randomChannelSpot(rng, zOf);
    list.push(newPickup(x, z, rng));
  }
  // exactly floatCount of them float (bob out of reach part of the time), chosen by a shuffle
  const flags = Array.from({ length: total }, (_, i) => i < floatCount);
  for (let i = flags.length - 1; i > 0; i--) {
    const j = Math.floor(flagRng() * (i + 1));
    [flags[i], flags[j]] = [flags[j], flags[i]];
  }
  list.forEach((it, i) => { it.floating = flags[i]; });
  return list;
}

// rucksacks aren't pre-placed — they spawn live as the run goes (see spawnRucksacks). This just
// reserves RUCKSACK.count inactive slots so the instance buffer never needs resizing.
const rucksackSlots = () => Array.from({ length: RUCKSACK.count }, () => ({
  x: 0, z: 0, vx: 0, vz: 0, boostDist: 0, floating: true,
  spinPh: Math.random() * TWO_PI, bobPh: Math.random() * TWO_PI,
  alive: false, collected: false, seenT: -1, checkT: 0, checkX: 0, checkZ: 0, nudging: false,
}));

export function placePickups() {
  const river = S.river;
  const total = PICKUPS.countForTier(river.R.tier);
  const floatCount = Math.round(Math.max(0, total - PICKUPS.perTierBase) * PICKUPS.floatFracOfExtra);
  river.pickupKinds = ['paddle', 'coin', 'rucksack', ...(river.R.extraKind ? [river.R.extraKind] : [])];
  river.pickups = {
    paddle: seededList(201, total, floatCount),
    coin: seededList(301, total, floatCount),
    rucksack: rucksackSlots(),
  };
  river.rucksackSpawnT = 0;
  if (river.R.extraKind) river.pickups[river.R.extraKind] = seededList(401, total, floatCount);
  for (const kind of river.pickupKinds) ensureInstBuf(pickupInstBufs, kind, river.pickups[kind].length);
  ensureInstBuf(pickupInstBufs, 'map', 1);   // at most one map ever, so this allocates once
}

// every attempt: revive the scattered pickups, deactivate every rucksack slot (the spawner will
// place fresh ones relative to wherever the kayak starts)
export function resetPickupsForAttempt() {
  const river = S.river;
  for (const kind of river.pickupKinds) {
    if (kind === 'rucksack') continue;
    for (const it of river.pickups[kind]) Object.assign(it, { alive: true, collected: false, seenT: -1 });
  }
  for (const it of river.pickups.rucksack) Object.assign(it, { alive: false, collected: false, vx: 0, vz: 0, nudging: false });
  river.rucksackSpawnT = 0;
}

// the hidden map rides on one non-hidden river per tier until that tier's secret is unlocked
export function placeMapItem() {
  const river = S.river, prof = S.profile, tier = river.R.tier;
  const isCarrier = !river.R.hidden && prof.mapCarrier[tier] === river.R.name && !prof.unlockedHidden[tier];
  if (!isCarrier) {
    river.pickups.map = [];
    return;
  }
  const { x, z } = randomChannelSpot(Math.random, () => 45 + Math.random() * (river.finishZ - 65));
  river.pickups.map = [newPickup(x, z, Math.random)];
}

// ---- rucksacks ----
export function spawnRucksacks(dtReal) {
  const river = S.river, list = river.pickups && river.pickups.rucksack;
  if (!list) return;
  river.rucksackSpawnT += dtReal;
  if (river.rucksackSpawnT < RUCKSACK.spawnInterval) return;
  const slot = list.find(it => !it.alive && !it.collected);
  if (!slot) return;
  river.rucksackSpawnT = 0;
  const ahead = Math.random() < RUCKSACK.aheadFrac;
  const [lo, hi] = ahead ? [RUCKSACK.spawnAheadMin, RUCKSACK.spawnAheadMax] : [RUCKSACK.spawnBehindMin, RUCKSACK.spawnBehindMax];
  const dist = lo + Math.random() * (hi - lo);
  const kz = kayak.p[2];
  const zOf = tries => clamp(kz + (ahead ? dist : -dist) + (tries ? (Math.random() - 0.5) * 6 : 0), 20, river.finishZ - 10);
  const { x, z } = randomChannelSpot(Math.random, zOf);
  const w = waterAt(x, z);
  Object.assign(slot, {
    x, z, vx: w.u,
    vz: ahead ? w.v : w.v * RUCKSACK.spawnBoost,
    boostDist: ahead ? 0 : RUCKSACK.spawnBoostDist,
    spinPh: Math.random() * TWO_PI, bobPh: Math.random() * TWO_PI,
    alive: true, collected: false, seenT: -1, checkT: 0, checkX: x, checkZ: z, nudging: false,
  });
}

// target velocity for a drifting rucksack: the current, boosted right after a behind-spawn, or
// nudged back to mid-channel when it's found itself stuck
function rucksackTarget(it, w, dtReal) {
  let targU = w.u * RUCKSACK.baseFactor, targV = w.v * RUCKSACK.baseFactor;
  if (it.boostDist > 0) {
    // held at the boosted target for a distance, not a duration — a fast stretch and a slow
    // one both get the same few extra metres of "shooting past the player" before tapering
    it.boostDist -= Math.abs(it.vz) * dtReal;
    targV = Math.sign(w.v || 1) * Math.max(Math.abs(w.v) * RUCKSACK.spawnBoost, RUCKSACK.spawnBoostMin);
  } else if (it.nudging) {
    const chan = nearestChan(S.river.rows[rowOf(it.z)], it.x);
    targU += clamp(chan.c - it.x, -RUCKSACK.nudgeSpeed, RUCKSACK.nudgeSpeed);
    targV += RUCKSACK.nudgeSpeed * 0.5;   // plus a little push back downstream
  }
  return [targU, targV];
}

function pushOutOfPillars(it) {
  for (const br of S.river.bridges) {
    if (Math.abs(it.z - br.z) > br.reach) continue;
    for (const pl of br.pillars) {
      const hit = br.pillarHit(pl, it.x, it.z, 0.35);
      if (!hit) continue;
      it.x += hit.nx * hit.pen;
      it.z += hit.nz * hit.pen;
      const vn = it.vx * hit.nx + it.vz * hit.nz;
      if (vn < 0) {
        it.vx -= vn * hit.nx;
        it.vz -= vn * hit.nz;
      }
    }
  }
}

export function updateRucksackDrift(dtReal) {
  const river = S.river, list = river.pickups && river.pickups.rucksack;
  if (!list || !list.length) return;
  const k = 1 - Math.exp(-RUCKSACK.drag * dtReal);   // frame-rate-independent ease toward the current
  for (const it of list) {
    if (!it.alive) continue;
    const w = waterAt(it.x, it.z);
    // stuck detection: barely moved since the last check → nudge
    it.checkT += dtReal;
    if (it.checkT >= RUCKSACK.checkInterval) {
      it.nudging = Math.hypot(it.x - it.checkX, it.z - it.checkZ) < RUCKSACK.stuckDist;
      it.checkT = 0;
      it.checkX = it.x;
      it.checkZ = it.z;
    }
    const [targU, targV] = rucksackTarget(it, w, dtReal);
    // real inertia, like everything else afloat here — it visibly spins up as the current catches it
    it.vx += (targU - it.vx) * k;
    it.vz += (targV - it.vz) * k;
    it.x = clamp(it.x + it.vx * dtReal, 1, W * dx - 1);
    it.z = clamp(it.z + it.vz * dtReal, 0, river.finishZ + 15);
    pushOutOfPillars(it);
  }
}

// ---- collection ----
function rollRucksack(profile) {
  const C = COLLECTIBLES.rucksack;
  const totalW = C.roll.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * totalW, picked = null;
  for (const r of C.roll) {
    roll -= r.weight;
    if (roll <= 0) { picked = r.kind; break; }
  }
  picked = picked || C.roll[C.roll.length - 1].kind;
  if (picked !== 'special') return picked;
  const keys = Object.keys(SPECIAL_ITEMS);
  picked = keys[Math.floor(Math.random() * keys.length)];
  // raft/helmet are one-off, globally — a repeat roll resolves to empty instead of a duplicate
  if (picked === 'raft' && profile.crafts.includes('raft')) return 'empty';
  if (picked === 'helmet' && profile.upgrades.includes('helmet')) return 'empty';
  return picked;
}

// what a rucksack roll does to runLoot → [burst colour, HUD counter to pop]
const RUCKSACK_REWARDS = {
  coin: loot => { loot.coins++; loot.coinValue += COLLECTIBLES.coin.value; return [COLLECTIBLES.coin.color, 'coin']; },
  diamond: loot => { loot.coins++; loot.coinValue += COLLECTIBLES.diamond.value; return [COLLECTIBLES.diamond.color, 'coin']; },
  snack: loot => { loot.snacks++; return [ITEMS.snack.color, 'snack']; },
  bandaid: loot => { loot.bandaids++; return [ITEMS.bandaid.color, null]; },
  medikit: loot => { loot.medikits++; return [ITEMS.medikit.color, null]; },
  book: loot => { loot.books++; return [SPECIAL_ITEMS.book.color, null]; },
  raft: loot => { loot.raftFound = true; return [SPECIAL_ITEMS.raft.color, null]; },
  helmet: loot => { loot.helmetFound = true; return [SPECIAL_ITEMS.helmet.color, null]; },
  // 'empty' falls through with the rucksack's own colour and no reward
};

function collect(kind, it, y) {
  it.alive = false;
  it.collected = true;
  if (kind === 'map') {
    unlockHidden(S.profile, S.river.R.tier);
    S.mapFoundUntil = S.simTime + 3.5;
    spawnBurst(it.x, y, it.z, MAP_ITEM.color);
    return;
  }
  if (kind === 'rucksack') {
    const reward = RUCKSACK_REWARDS[rollRucksack(S.profile)];
    const [color, popAs] = reward ? reward(S.runLoot) : [COLLECTIBLES.rucksack.color, null];
    spawnBurst(it.x, y, it.z, color);
    if (popAs) popLoot(popAs);
    return;
  }
  const C = COLLECTIBLES[kind];
  if (C.type === 'xp') {
    S.runLoot.paddles++;
  } else {
    S.runLoot.coins++;
    S.runLoot.coinValue += C.value;
  }
  spawnBurst(it.x, y, it.z, C.color);
  popLoot(C.type === 'xp' ? 'paddle' : 'coin');
}

// proximity fade: regular pickups vanish a few seconds after the paddler first gets close;
// the map is a rare key item and stays fully visible for the whole run
function fadeAlpha(kind, it, dist) {
  if (kind === 'map') return 1;
  const fadeTime = kind === 'rucksack' ? RUCKSACK.fadeTime : PICKUPS.fadeTime;
  if (it.seenT < 0 && dist < PICKUPS.proximityRadius) it.seenT = S.simTime;
  if (it.seenT < 0) return 1;
  const fadeT = S.simTime - it.seenT;
  if (fadeT >= fadeTime) it.alive = false;
  return clamp(1 - fadeT / fadeTime, 0, 1);
}

// one pickup's transform/tint for this frame, plus collection against the paddler
function updatePickup(kind, it, data, n) {
  if (!it.alive) {
    data.set(mat4TRS([it.x, -1000, it.z], 0, [1, 1, 1]), n * 20);
    data.set([1, 1, 1, 0], n * 20 + 16);
    return;
  }
  const P = kindParams(kind);
  const bobPhase = S.simTime * PICKUPS.bobSpeed + it.bobPh;
  const bob = it.floating ? PICKUPS.bobAmp * Math.sin(bobPhase) : 0;
  const y = nearestChan(S.river.rows[rowOf(it.z)], it.x).eta + P.hover + bob;
  const dist = Math.hypot(kayak.p[0] - it.x, kayak.p[2] - it.z);
  let alpha = fadeAlpha(kind, it, dist);

  const reachable = kind === 'rucksack' || !it.floating || Math.sin(bobPhase) <= PICKUPS.reachBob;
  const lootMod = kind === 'map' ? 1 : (S.runCraft.lootMod ?? 1);
  if (it.alive && reachable && dist < P.collectRadius * lootMod) {
    collect(kind, it, y);
    alpha = 0;
  }

  const spin = S.simTime * P.spinSpeed + it.spinPh, sc = kindScale(kind);
  data.set(mat4TRS([it.x, y, it.z], spin, [sc, sc, sc]), n * 20);
  data.set([1, 1, 1, alpha], n * 20 + 16);
}

export function updatePickups() {
  if (!S.river.pickups) return;
  for (const kind of allPickupKinds()) {
    const list = S.river.pickups[kind], buf = pickupInstBufs[kind];
    if (!list || !list.length || !buf) continue;
    const data = new Float32Array(list.length * 20);
    list.forEach((it, n) => updatePickup(kind, it, data, n));
    gpu.device.queue.writeBuffer(buf, 0, data);
  }
}