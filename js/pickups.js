// Collectibles: scattered paddles/coins, live-spawned drifting rucksacks, the hidden-map item,
// and the spark burst shown when something is collected.
import { GRID, PICKUPS, COLLECTIBLES, SPECIAL_ITEMS, MAP_ITEM, RUCKSACK, ITEMS } from './config.js';
import { mulberry32, mat4TRS, clamp } from './math.js';
import { nearestChan } from './river.js';
import { unlockHidden } from './progression.js';
import { G } from './state.js';
import { gpu } from './gpu.js';
import { waterAt, rowOf, clampX } from './sampling.js';
import { kayak } from './kayak.js';
import { popLoot } from './hud.js';

const { W, L, dx } = GRID;
const TAU = 6.2832;

// ---------- sparks ----------
export const sparks = { list: [], buf: null, max: 160 };

export function initPickups() {
  sparks.buf = gpu.instBuf(sparks.max);
  // the map pickup is at most one instance ever, on any river, so its buffer never needs
  // resizing — allocate it once here instead of in placePickups()'s per-river rebuild
  pickupInstBufs.map = gpu.instBuf(1);
}

export function spawnBurst(x, y, z, col) {
  for (let n = 0; n < PICKUPS.burstCount; n++) {
    const a = Math.random() * TAU, spd = 1.2 + Math.random() * 2.2;
    sparks.list.push({
      x, y, z,
      vx: Math.cos(a) * spd, vy: 1.5 + Math.random() * 2.0, vz: Math.sin(a) * spd,
      life: PICKUPS.burstLife, maxLife: PICKUPS.burstLife, col,
    });
  }
  if (sparks.list.length > sparks.max) sparks.list.splice(0, sparks.list.length - sparks.max);
}

export function updateSparks(dt) {
  if (!sparks.list.length) return;
  for (const sp of sparks.list) {
    sp.vy -= 9.81 * dt;
    sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.z += sp.vz * dt;
    sp.life -= dt;
  }
  sparks.list = sparks.list.filter(sp => sp.life > 0);
  if (!sparks.list.length) return;
  const data = new Float32Array(sparks.list.length * 20);
  sparks.list.forEach((sp, n) => {
    const t = sp.life / sp.maxLife, sc = 0.12 * (0.4 + 0.6 * t);
    data.set(mat4TRS([sp.x, sp.y, sp.z], 0, [sc, sc, sc]), n * 20);
    data.set([sp.col[0], sp.col[1], sp.col[2], clamp(t * 1.4, 0, 1)], n * 20 + 16);
  });
  gpu.write(sparks.buf, 0, data);
}

// ---------- placement ----------
export const pickupInstBufs = { paddle: null, coin: null, diamond: null, rucksack: null, map: null };

// a pickup spot that would sit inside a land bridge (under the arch where the hovering/bobbing
// item would poke into the rock, or inside a pillar) — placement re-rolls such spots
function bridgeBlocked(x, z) {
  for (const br of G.river.bridges) {
    if (Math.abs(z - br.z) > br.reach) continue;
    if (br.at(x, z) || br.at(x, z - 1.5) || br.at(x, z + 1.5)) return true;
    for (const pl of br.pillars) if (br.pillarHit(pl, x, z, 1.2)) return true;
  }
  return false;
}

// random spot inside a navigable channel, avoiding bridges; zOf(tries) picks the downstream position
function channelSpot(rng, zOf) {
  let x = 0, z = 0;
  for (let tries = 0; tries < 12; tries++) {
    z = zOf(tries);
    const chans = G.river.rows[rowOf(z)], chan = chans[Math.floor(rng() * chans.length)];
    x = clampX(chan.c + (rng() * 1.4 - 0.7) * chan.hw);
    if (!bridgeBlocked(x, z)) break;
  }
  return { x, z };
}

const freshItem = (x, z, rng, floating = false) =>
  ({ x, z, floating, spinPh: rng() * TAU, bobPh: rng() * TAU, alive: true, collected: false, seenT: -1 });

// one seeded list of `total` items, `floatCount` of them marked floating (shuffled with its own rng)
function scatterList(river, total, floatCount, seedOff) {
  const rng = mulberry32(river.seed + seedOff), flagRng = mulberry32(river.seed + seedOff + 1);
  const list = [];
  for (let n = 0; n < total; n++) {
    const { x, z } = channelSpot(rng, () => 45 + rng() * (river.finishZ - 65));
    list.push(freshItem(x, z, rng));
  }
  const flags = Array.from({ length: total }, (_, i) => i < floatCount);
  for (let i = flags.length - 1; i > 0; i--) {
    const j = Math.floor(flagRng() * (i + 1));
    [flags[i], flags[j]] = [flags[j], flags[i]];
  }
  list.forEach((it, i) => { it.floating = flags[i]; });
  return list;
}

// dropped rucksacks aren't pre-placed like the rest — they spawn live, behind the kayak, as the
// run goes (see spawnRucksacks). This just reserves RUCKSACK.count inactive slots up front so the
// instance buffer never needs resizing; each slot only becomes real once the spawner activates it.
const rucksackSlots = () => Array.from({ length: RUCKSACK.count }, () => ({
  x: 0, z: 0, vx: 0, vz: 0, boostDist: 0, floating: true,
  spinPh: Math.random() * TAU, bobPh: Math.random() * TAU,
  alive: false, collected: false, seenT: -1, checkT: 0, checkX: 0, checkZ: 0, nudging: false,
}));

// spinning paddle (xp) and coin pickups, scattered along the navigable channel
export function placePickups() {
  const river = G.river;
  const total = PICKUPS.countForTier(river.R.tier);
  const floatCount = Math.round(Math.max(0, total - PICKUPS.perTierBase) * PICKUPS.floatFracOfExtra);
  const extra = river.R.extraKind;
  river.pickupKinds = ['paddle', 'coin', 'rucksack', ...(extra ? [extra] : [])];
  river.pickups = {
    paddle: scatterList(river, total, floatCount, 201),
    coin: scatterList(river, total, floatCount, 301),
    rucksack: rucksackSlots(),
  };
  if (extra) river.pickups[extra] = scatterList(river, total, floatCount, 401);
  river.rucksackSpawnT = 0;
  for (const kind of river.pickupKinds) {
    if (pickupInstBufs[kind]) pickupInstBufs[kind].destroy();
    pickupInstBufs[kind] = gpu.instBuf(river.pickups[kind].length);
  }
}

// revive the scattered items for another attempt; rucksacks aren't pre-placed, so a restart
// deactivates every slot instead — spawnRucksacks() places fresh ones relative to the new start
export function resetPickups() {
  const river = G.river;
  for (const kind of river.pickupKinds) {
    if (kind === 'rucksack') continue;
    for (const it of river.pickups[kind]) { it.alive = true; it.collected = false; it.seenT = -1; }
  }
  for (const it of river.pickups.rucksack) {
    it.alive = false; it.collected = false; it.vx = 0; it.vz = 0; it.nudging = false;
  }
  river.rucksackSpawnT = 0;
}

// the hidden-tier map: one per run on the tier's carrier river, only until that tier is unlocked
export function placeMapItem() {
  const river = G.river, prof = G.profile, tier = river.R.tier;
  const isCarrier = !river.R.hidden && prof.mapCarrier[tier] === river.R.name && !prof.unlockedHidden[tier];
  if (!isCarrier) { river.pickups.map = []; return; }
  const { x, z } = channelSpot(Math.random, () => 45 + Math.random() * (river.finishZ - 65));
  river.pickups.map = [freshItem(x, z, Math.random)];
}

// ---------- rucksacks ----------
export function spawnRucksacks(dtReal) {
  const river = G.river, list = river.pickups && river.pickups.rucksack;
  if (!list) return;
  river.rucksackSpawnT += dtReal;
  if (river.rucksackSpawnT < RUCKSACK.spawnInterval) return;
  const slot = list.find(it => !it.alive && !it.collected);
  if (!slot) return;
  river.rucksackSpawnT = 0;

  const ahead = Math.random() < RUCKSACK.aheadFrac;
  const [dMin, dMax] = ahead ? [RUCKSACK.spawnAheadMin, RUCKSACK.spawnAheadMax] : [RUCKSACK.spawnBehindMin, RUCKSACK.spawnBehindMax];
  const dist = (ahead ? 1 : -1) * (dMin + Math.random() * (dMax - dMin));
  const { x, z } = channelSpot(Math.random, tries =>
    clamp(kayak.p[2] + dist + (tries ? (Math.random() - 0.5) * 6 : 0), 20, river.finishZ - 10));
  const w = waterAt(x, z);
  Object.assign(slot, {
    x, z, vx: w.u,
    vz: ahead ? w.v : w.v * RUCKSACK.spawnBoost,
    boostDist: ahead ? 0 : RUCKSACK.spawnBoostDist,
    spinPh: Math.random() * TAU, bobPh: Math.random() * TAU,
    alive: true, collected: false, seenT: -1, checkT: 0, checkX: x, checkZ: z, nudging: false,
  });
}

export function updateRucksackDrift(dtReal) {
  const river = G.river, list = river.pickups && river.pickups.rucksack;
  if (!list || !list.length) return;
  const k = 1 - Math.exp(-RUCKSACK.drag * dtReal);   // frame-rate-independent ease toward the current
  for (const it of list) {
    if (!it.alive) continue;
    const w = waterAt(it.x, it.z);
    it.checkT += dtReal;
    if (it.checkT >= RUCKSACK.checkInterval) {
      it.nudging = Math.hypot(it.x - it.checkX, it.z - it.checkZ) < RUCKSACK.stuckDist;
      it.checkT = 0; it.checkX = it.x; it.checkZ = it.z;
    }
    let targU = w.u * RUCKSACK.baseFactor, targV = w.v * RUCKSACK.baseFactor;
    if (it.boostDist > 0) {
      // held at the boosted target for a distance, not a duration — a fast stretch and a slow
      // one both get the same few extra metres of "shooting past the player" before tapering
      it.boostDist -= Math.abs(it.vz) * dtReal;
      targV = Math.sign(w.v || 1) * Math.max(Math.abs(w.v) * RUCKSACK.spawnBoost, RUCKSACK.spawnBoostMin);
    } else if (it.nudging) {
      const chan = nearestChan(river.rows[rowOf(it.z)], it.x);
      targU += clamp(chan.c - it.x, -RUCKSACK.nudgeSpeed, RUCKSACK.nudgeSpeed);
      targV += RUCKSACK.nudgeSpeed * 0.5;   // plus a little push back downstream
    }
    // real inertia, like everything else afloat in this sim — it visibly spins up to speed
    it.vx += (targU - it.vx) * k;
    it.vz += (targV - it.vz) * k;
    it.x = clampX(it.x + it.vx * dtReal);
    it.z = clamp(it.z + it.vz * dtReal, 0, river.finishZ + 15);
    slideAroundPillars(it, river);
  }
}

function slideAroundPillars(it, river) {
  for (const br of river.bridges) {
    if (Math.abs(it.z - br.z) > br.reach) continue;
    for (const pl of br.pillars) {
      const hit = br.pillarHit(pl, it.x, it.z, 0.35);
      if (!hit) continue;
      it.x += hit.nx * hit.pen; it.z += hit.nz * hit.pen;
      const vn = it.vx * hit.nx + it.vz * hit.nz;
      if (vn < 0) { it.vx -= vn * hit.nx; it.vz -= vn * hit.nz; }
    }
  }
}

// ---------- per-frame: transforms, fade, collection ----------
function kindStyle(kind) {
  if (kind === 'map') return { hover: MAP_ITEM.hover, spin: MAP_ITEM.spinSpeed, scale: MAP_ITEM.scale, collectR: MAP_ITEM.collectRadius, fade: null };
  if (kind === 'rucksack') return { hover: RUCKSACK.hover, spin: RUCKSACK.spinSpeed, scale: RUCKSACK.scale, collectR: RUCKSACK.collectRadius, fade: RUCKSACK.fadeTime };
  return { hover: PICKUPS.hover, spin: PICKUPS.spinSpeed, scale: kind === 'paddle' ? PICKUPS.paddleScale : 1, collectR: PICKUPS.collectRadius, fade: PICKUPS.fadeTime };
}

export function updatePickups() {
  const river = G.river;
  if (!river.pickups) return;
  for (const kind of [...river.pickupKinds, 'map']) {
    const list = river.pickups[kind], buf = pickupInstBufs[kind];
    if (!list || !list.length || !buf) continue;
    const st = kindStyle(kind), data = new Float32Array(list.length * 20);
    list.forEach((it, n) => writePickupInstance(kind, st, it, data, n * 20));
    gpu.write(buf, 0, data);
  }
}

function writePickupInstance(kind, st, it, data, off) {
  if (!it.alive) {
    data.set(mat4TRS([it.x, -1000, it.z], 0, [1, 1, 1]), off);
    data.set([1, 1, 1, 0], off + 16);
    return;
  }
  const t = G.simTime, bobPhase = t * PICKUPS.bobSpeed + it.bobPh;
  const bob = it.floating ? PICKUPS.bobAmp * Math.sin(bobPhase) : 0;
  const y = nearestChan(G.river.rows[rowOf(it.z)], it.x).eta + st.hover + bob;
  const dist = Math.hypot(kayak.p[0] - it.x, kayak.p[2] - it.z);
  let alpha = fadeAlpha(it, st, dist);

  const reachable = kind === 'rucksack' || !it.floating || Math.sin(bobPhase) <= PICKUPS.reachBob;
  const lootMod = kind === 'map' ? 1 : (G.runCraft.lootMod ?? 1);
  if (it.alive && dist < st.collectR * lootMod && reachable) {
    collect(kind, it, y);
    alpha = 0;
  }
  const sc = st.scale;
  data.set(mat4TRS([it.x, y, it.z], t * st.spin + it.spinPh, [sc, sc, sc]), off);
  data.set([1, 1, 1, alpha], off + 16);
}

// regular pickups fade out once the paddler has come close and moved on; the map item is a rare
// key item and stays fully visible/collectible for the whole run
function fadeAlpha(it, st, dist) {
  if (st.fade == null) return 1;
  if (it.seenT < 0 && dist < PICKUPS.proximityRadius) it.seenT = G.simTime;
  if (it.seenT < 0) return 1;
  const fadeT = G.simTime - it.seenT;
  if (fadeT >= st.fade) it.alive = false;
  return clamp(1 - fadeT / st.fade, 0, 1);
}

function collect(kind, it, y) {
  it.alive = false;
  it.collected = true;
  if (kind === 'map') {
    unlockHidden(G.profile, G.river.R.tier);
    G.mapFoundUntil = G.simTime + 3.5;
    spawnBurst(it.x, y, it.z, MAP_ITEM.color);
    return;
  }
  const C = COLLECTIBLES[kind];
  const { color, popAs } = C.type === 'random' ? openRucksack(C) : bankCollectible(C);
  spawnBurst(it.x, y, it.z, color);
  if (popAs) popLoot(popAs);
}

function bankCollectible(C) {
  const loot = G.runLoot;
  if (C.type === 'xp') { loot.paddles++; return { color: C.color, popAs: 'paddle' }; }
  loot.coins++;
  loot.coinValue += C.value;
  return { color: C.color, popAs: 'coin' };
}

// weighted roll of what's in a rucksack; 'special' resolves to a random special item, except that
// raft/helmet are one-off globally — a repeat roll resolves to 'empty' instead of a duplicate
function rollRucksack(C) {
  const totalW = C.roll.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * totalW, picked = null;
  for (const r of C.roll) { roll -= r.weight; if (roll <= 0) { picked = r.kind; break; } }
  picked = picked || C.roll[C.roll.length - 1].kind;
  if (picked !== 'special') return picked;
  const keys = Object.keys(SPECIAL_ITEMS);
  picked = keys[Math.floor(Math.random() * keys.length)];
  if (picked === 'raft' && G.profile.crafts.includes('raft')) return 'empty';
  if (picked === 'helmet' && G.profile.upgrades.includes('helmet')) return 'empty';
  return picked;
}

function openRucksack(C) {
  const loot = G.runLoot, picked = rollRucksack(C);
  switch (picked) {
    case 'coin':
    case 'diamond': {
      const cc = COLLECTIBLES[picked];
      loot.coins++; loot.coinValue += cc.value;
      return { color: cc.color, popAs: 'coin' };
    }
    case 'snack': loot.snacks++; return { color: ITEMS.snack.color, popAs: 'snack' };
    case 'bandaid': loot.bandaids++; return { color: ITEMS.bandaid.color };
    case 'medikit': loot.medikits++; return { color: ITEMS.medikit.color };
    case 'book': loot.books++; return { color: SPECIAL_ITEMS.book.color };
    case 'raft': loot.raftFound = true; return { color: SPECIAL_ITEMS.raft.color };
    case 'helmet': loot.helmetFound = true; return { color: SPECIAL_ITEMS.helmet.color };
    default: return { color: COLLECTIBLES.rucksack.color };   // 'empty': no reward
  }
}