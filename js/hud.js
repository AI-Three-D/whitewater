// In-run HUD: loot counters, transient messages, stamina bar, balance marker, debug readout.
import { KAYAK, SIM, STAMINA, ITEMS, COLLECTIBLES } from './config/index.js';
import { clamp } from './math.js';
import { character, itemCount } from './progression.js';
import { S } from './state.js';
import { $, isMobile, gyro } from './platform.js';
import { kayak, traits } from './kayak.js';
import { waterAt } from './sampling.js';
import { W, L, dx } from './quality.js';

const el = {
  hud: $('hud'), gl: $('gl'), mk: $('mk'), dbg: $('dbg'), clock: $('clock'),
  stamFill: $('stamfill'), stamTxt: $('stamtxt'),
  pcount: $('pcount'), ccount: $('ccount'), scount: $('scount'), dcount: $('dcount'),
  mEat: $('mEat'), mDrink: $('mDrink'),
};
const lootEls = { paddle: el.pcount, coin: el.ccount, snack: el.scount, energyDrink: el.dcount };
const DBG_VIEWS = ['off', 'speed', 'foam', 'turbulence k', 'Froude'];

// one-shot bump animation on a loot counter (CSS `.pop`); ignored while one is already running
export function popLoot(kind) {
  const e = lootEls[kind];
  if (!e || e.classList.contains('pop')) return;
  e.classList.add('pop');
  const done = () => {
    e.classList.remove('pop');
    e.removeEventListener('animationend', done);
    clearTimeout(fallback);
  };
  const fallback = setTimeout(done, 700);
  e.addEventListener('animationend', done, { once: true });
}

const totalOfType = type => S.river.pickupKinds
  .filter(k => COLLECTIBLES[k].type === type)
  .reduce((s, k) => s + S.river.pickups[k].length, 0);

function renderCounters() {
  const prof = S.profile, loot = S.runLoot;
  el.pcount.innerHTML = `🛶 <b>${loot.paddles}</b>/${totalOfType('xp')}`;
  el.ccount.innerHTML = `🪙 <b>${loot.coins}</b>/${totalOfType('currency')}`;
  const consumable = (countEl, btnEl, icon, n, key) => {
    countEl.innerHTML = `${icon} <b>${n}</b>${isMobile ? '' : ` <kbd style="font-size:11px">${key}</kbd>`}`;
    countEl.style.opacity = n ? 1 : 0.45;
    btnEl.textContent = `${icon} ${n}`;
    btnEl.style.opacity = n ? 1 : 0.45;
  };
  consumable(el.scount, el.mEat, '🥜', itemCount(prof, 'snack'), 'E');
  consumable(el.dcount, el.mDrink, '⚡', itemCount(prof, 'energyDrink'), 'Q');
}

function transientLines() {
  const t = S.simTime;
  const map = t < S.mapFoundUntil ? '<br><b style="color:#ffe08a">🗺 Hidden map found!</b>' : '';
  const snack = t < S.snackMsgUntil ? `<br><b style="color:#9f7">🥜 Snack! +${ITEMS.snack.stamina} stamina</b>` : '';
  const drink = t < S.drinkBuffUntil
    ? `<br><b style="color:#ffe860">⚡ Focused! +${ITEMS.energyDrink.buffSkill} skill for ${(S.drinkBuffUntil - t).toFixed(1)}s</b>`
    : t < S.drinkMsgUntil ? '<br><b style="color:#ffe860">⚡ Energy booster!</b>' : '';
  return map + snack + drink;
}

function renderBalance() {
  // NOTE: base KAYAK.capsize, not S.effK.capsize — see traits() in kayak.js
  const tilt = clamp(-kayak.roll / KAYAK.capsize, -1, 1), a = Math.abs(tilt);
  el.mk.style.left = (50 + tilt * 50) + '%';
  el.mk.style.background = a > 0.7 ? '#ff5040' : a > 0.35 ? '#ffb040' : '#ffe08a';
  const tiltCtl = isMobile && gyro.live();
  if (a > 0.35) {
    const key = tiltCtl ? '' : tilt > 0 ? ' (D)' : ' (A)';
    el.gl.innerHTML = `<span style="color:#ff8060;font-weight:700">LEAN ${tilt > 0 ? 'RIGHT' : 'LEFT'}${key}</span>`;
  } else {
    el.gl.innerHTML = tiltCtl ? 'torso balance — tilt the phone'
      : isMobile ? 'torso balance — no tilt data, lean with A / D' : 'torso balance — lean with A / D';
  }
}

function renderDebug() {
  const river = S.river, w = waterAt(kayak.p[0], kayak.p[2]), K = KAYAK, tr = traits();
  const instab = tr.instabK - K.formStab;
  const lam = (-K.rollDamp + Math.sqrt(K.rollDamp ** 2 + 4 * K.inertia[2] * instab)) / (2 * K.inertia[2]);
  el.dbg.textContent =
    `fps ${S.fps.toFixed(0)}  debug view ${DBG_VIEWS[S.dbgMode]}\n` +
    `cells ${W}x${L}  dx ${dx}  dt ${SIM.dt.toFixed(4)} x${SIM.substeps}  turbA ${SIM.turbA}\n` +
    `Q ${river.Q.toFixed(1)} m³/s  inVelScale ${river.inVelScale.toFixed(3)}\n` +
    `water here: h ${w.h.toFixed(2)} m  |u| ${Math.hypot(w.u, w.v).toFixed(2)} m/s\n` +
    `boat: roll ${(-kayak.roll * 57.3).toFixed(0)}°  pitch ${(kayak.pitch * 57.3).toFixed(0)}°  v ${kayak.speed.toFixed(2)} m/s\n` +
    `traits: skill ${tr.skill}  stamina ${tr.stamina}  drain ${tr.drain.toFixed(1)}/s  pool ${kayak.stamina.toFixed(0)}\n` +
    `roll: instabK ${tr.instabK.toFixed(0)} N·m/rad  λ ${lam.toFixed(2)} /s  max recover ${(Math.asin(Math.min(1, tr.leanTorque / tr.instabK)) * 57.3).toFixed(0)}°`;
}

export function hud() {
  const river = S.river, prof = S.profile;
  if (!river || !prof) return;
  const c = character(prof);
  const dist = Math.max(0, kayak.p[2] - 15), total = river.finishZ - 15;
  if (river.pickups) renderCounters();
  const injury = prof.injury > 0 ? ` · <span style="color:#ff9a80">injury ${prof.injury}/${prof.health}</span>` : '';
  el.hud.innerHTML =
    `<b>${river.R.name}</b> · ${river.R.cls} · <b>${c.name}</b> lv ${prof.level} · ${S.runCraft.name}${injury}<br>` +
    `speed <b>${kayak.speed.toFixed(1)}</b> m/s · distance <b>${dist.toFixed(0)}</b> / ${total.toFixed(0)} m · ` +
    `time <b>${S.runTime.toFixed(1)}</b> s${transientLines()}`;
  // a single-attempt river's countdown is the whole point — put it front and centre instead of
  // making the player glance at the corner, with its own urgency colour/pulse as it runs low
  const limit = river.R.timeLimit;
  if (limit) {
    const timeLeft = Math.max(0, limit - S.runTime), urgent = timeLeft < 15;
    el.clock.textContent = timeLeft.toFixed(1);
    el.clock.className = urgent ? 'urgent' : '';
    el.clock.style.display = 'block';
  } else if (el.clock.style.display !== 'none') {
    el.clock.style.display = 'none';
  }
  el.stamFill.style.width = (100 * kayak.stamina / STAMINA.max) + '%';
  el.stamFill.className = kayak.tired ? 'tired' : '';
  el.stamTxt.textContent = kayak.tired ? 'TIRED — weak strokes' : 'stamina';
  renderBalance();
  if (S.dbgMode) renderDebug();
}