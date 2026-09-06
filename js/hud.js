// In-run HUD, the loot-counter pop animation, and the end-of-run message cards.
import { GRID, SIM, KAYAK, STAMINA, ITEMS, COLLECTIBLES } from './config.js';
import { clamp } from './math.js';
import { character, itemCount, ownsUpgrade, pointsForLevel } from './progression.js';
import { $, isMobile, gyro } from './platform.js';
import { G } from './state.js';
import { waterAt } from './sampling.js';
import { kayak, traits } from './kayak.js';
import { plural } from './ui.js';

const { W, L, dx } = GRID;

const els = {
  hud: $('hud'), gl: $('gl'), mk: $('mk'), dbg: $('dbg'), stamFill: $('stamfill'), stamTxt: $('stamtxt'),
  pcount: $('pcount'), ccount: $('ccount'), scount: $('scount'), dcount: $('dcount'), mEat: $('mEat'), mDrink: $('mDrink'),
};
const lootEls = { paddle: els.pcount, coin: els.ccount, snack: els.scount, energyDrink: els.dcount };

export function popLoot(kind) {
  const el = lootEls[kind];
  if (!el || el.classList.contains('pop')) return;
  el.classList.add('pop');
  const done = () => { el.classList.remove('pop'); el.removeEventListener('animationend', done); clearTimeout(fallback); };
  const fallback = setTimeout(done, 700);
  el.addEventListener('animationend', done, { once: true });
}

// a consumable's counter: the HUD line (with its key on desktop) and the mobile button
function setConsumable(el, mEl, icon, count, key) {
  el.innerHTML = `${icon} <b>${count}</b>${isMobile ? '' : ` <kbd style="font-size:11px">${key}</kbd>`}`;
  el.style.opacity = count ? 1 : 0.45;
  mEl.textContent = `${icon} ${count}`;
  mEl.style.opacity = count ? 1 : 0.45;
}

function updateLootCounters(river, profile) {
  const totalOf = type => river.pickupKinds.filter(k => COLLECTIBLES[k].type === type).reduce((s, k) => s + river.pickups[k].length, 0);
  els.pcount.innerHTML = `🛶 <b>${G.runLoot.paddles}</b>/${totalOf('xp')}`;
  els.ccount.innerHTML = `🪙 <b>${G.runLoot.coins}</b>/${totalOf('currency')}`;
  setConsumable(els.scount, els.mEat, '🥜', itemCount(profile, 'snack'), 'E');
  setConsumable(els.dcount, els.mDrink, '⚡', itemCount(profile, 'energyDrink'), 'Q');
}

function statusLine(river, profile) {
  const c = character(profile), t = G.simTime;
  const dist = Math.max(0, kayak.p[2] - 15), total = river.finishZ - 15;
  const mapMsg = t < G.mapFoundUntil ? '<br><b style="color:#ffe08a">🗺 Hidden map found!</b>' : '';
  const snackMsg = t < G.snackMsgUntil ? `<br><b style="color:#9f7">🥜 Snack! +${ITEMS.snack.stamina} stamina</b>` : '';
  const drinkMsg = t < G.drinkBuffUntil
    ? `<br><b style="color:#ffe860">⚡ Focused! +${ITEMS.energyDrink.buffSkill} skill for ${(G.drinkBuffUntil - t).toFixed(1)}s</b>`
    : t < G.drinkMsgUntil ? '<br><b style="color:#ffe860">⚡ Energy booster!</b>' : '';
  const injuryMsg = profile.injury > 0 ? ` · <span style="color:#ff9a80">injury ${profile.injury}/${profile.health}</span>` : '';
  return `<b>${river.R.name}</b> · ${river.R.cls} · <b>${c.name}</b> lv ${profile.level} · ${G.runCraft.name}${injuryMsg}<br>`
       + `speed <b>${kayak.speed.toFixed(1)}</b> m/s · distance <b>${dist.toFixed(0)}</b> / ${total.toFixed(0)} m · time <b>${G.runTime.toFixed(1)}</b> s`
       + mapMsg + snackMsg + drinkMsg;
}

function updateStaminaBar() {
  els.stamFill.style.width = (100 * kayak.stamina / STAMINA.max) + '%';
  els.stamFill.className = kayak.tired ? 'tired' : '';
  els.stamTxt.textContent = kayak.tired ? 'TIRED — weak strokes' : 'stamina';
}

function updateBalanceBar() {
  const tilt = clamp(-kayak.roll / KAYAK.capsize, -1, 1), a = Math.abs(tilt);
  els.mk.style.left = (50 + tilt * 50) + '%';
  els.mk.style.background = a > 0.7 ? '#ff5040' : a > 0.35 ? '#ffb040' : '#ffe08a';
  const tiltCtl = isMobile && gyro.live();
  if (a > 0.35) {
    const key = tiltCtl ? '' : tilt > 0 ? ' (D)' : ' (A)';
    els.gl.innerHTML = `<span style="color:#ff8060;font-weight:700">LEAN ${tilt > 0 ? 'RIGHT' : 'LEFT'}${key}</span>`;
  } else {
    els.gl.innerHTML = tiltCtl ? 'torso balance — tilt the phone'
      : isMobile ? 'torso balance — no tilt data, lean with A / D' : 'torso balance — lean with A / D';
  }
}

function debugText(river) {
  const w = waterAt(kayak.p[0], kayak.p[2]), K = KAYAK, tr = traits();
  const instab = tr.instabK - K.formStab;
  const lam = (-K.rollDamp + Math.sqrt(K.rollDamp ** 2 + 4 * K.inertia[2] * instab)) / (2 * K.inertia[2]);
  return `fps ${G.fps.toFixed(0)}  debug view ${['off', 'speed', 'foam', 'turbulence k', 'Froude'][G.dbgMode]}\n`
    + `cells ${W}x${L}  dx ${dx}  dt ${SIM.dt.toFixed(4)} x${SIM.substeps}  turbA ${SIM.turbA}\n`
    + `Q ${river.Q.toFixed(1)} m³/s  inVelScale ${river.inVelScale.toFixed(3)}\n`
    + `water here: h ${w.h.toFixed(2)} m  |u| ${Math.hypot(w.u, w.v).toFixed(2)} m/s\n`
    + `boat: roll ${(-kayak.roll * 57.3).toFixed(0)}°  pitch ${(kayak.pitch * 57.3).toFixed(0)}°  v ${kayak.speed.toFixed(2)} m/s\n`
    + `traits: skill ${tr.skill}  stamina ${tr.stamina}  drain ${tr.drain.toFixed(1)}/s  pool ${kayak.stamina.toFixed(0)}\n`
    + `roll: instabK ${tr.instabK.toFixed(0)} N·m/rad  λ ${lam.toFixed(2)} /s  max recover ${(Math.asin(Math.min(1, tr.leanTorque / tr.instabK)) * 57.3).toFixed(0)}°`;
}

export function hud() {
  const { river, profile } = G;
  if (!river || !profile) return;
  if (river.pickups) updateLootCounters(river, profile);
  els.hud.innerHTML = statusLine(river, profile);
  updateStaminaBar();
  updateBalanceBar();
  if (G.dbgMode) els.dbg.textContent = debugText(river);
}

// ---------- end-of-run cards ----------
export function showEndMessage(body, { retry, menu }) {
  const msg = $('msg');
  msg.style.display = 'flex';
  msg.innerHTML = `${body}
    <div class="mbtns"><button id="btnRetry">↻ Run again</button><button id="btnMenu">River menu</button></div>
    <small class="desktop-only">R — run again · Esc — river menu</small>`;
  $('btnRetry').onclick = retry;
  $('btnMenu').onclick = menu;
}

const progressText = () => `${(kayak.p[2] - 15).toFixed(0)} m of ${(G.river.finishZ - 15).toFixed(0)} m`;

export function finishSummary(a) {
  const profile = G.profile, river = G.river;
  const best = profile.best[river.R.name] === G.runTime ? ' · new best!' : '';
  const finds = [];
  if (a.snacks) finds.push(plural(a.snacks, 'snack'));
  if (a.bandaids) finds.push(plural(a.bandaids, 'bandaid'));
  if (a.medikits) finds.push(plural(a.medikits, 'medikit'));
  if (a.bookBoost) finds.push(`a book — +${a.bookBoost} skill boost`);
  if (a.raftFound) finds.push('an inflatable raft!');
  if (a.helmetFound) finds.push('a better helmet!');
  const levelNote = a.ups ? ` — LEVEL UP${a.ups > 1 ? ' ×' + a.ups : ''}!`
    : ` · ${profile.points}/${pointsForLevel(profile.level)} to level ${profile.level + 1}`;
  return `🏁 Take-out reached!<br>${river.R.name} in ${G.runTime.toFixed(1)} s${best}<br>
    <span style="color:#ffe08a">+${a.basePts} finish${a.paddleXp ? ` +${a.paddleXp} paddle` : ''} = +${a.pts} xp${a.coins ? ` · +${plural(a.coins, 'coin')}` : ''}${levelNote}</span>
    ${finds.length ? `<br><small style="color:#9be0ff">found ${finds.join(', ')}</small>` : ''}
    ${ownsUpgrade(profile, 'sponsor') ? `<br><small style="color:#ffd35c">📣 sponsor payout: +${plural(a.sponsorCoins, 'coin')}</small>` : ''}
    ${a.healed ? `<br><small style="color:#9f7">3 clean runs in a row — injury recovers by ${a.healed} (${profile.injury}/${profile.health})</small>` : ''}`;
}

export function capsizeSummary({ gain, recovered, injury, cap, levelsLost }) {
  if (recovered) {
    return `🏥 Badly hurt — time for a long recovery.<br>${progressText()}
      <br><small style="color:#ff9a80">${levelsLost ? `Lost ${plural(levelsLost, 'level')}, ` : ''}every coin, and the whole pack — but the rest is healed up (injury 0/${cap}).</small>`;
  }
  const l = G.runLoot, lost = [];
  if (l.paddles) lost.push(plural(l.paddles, 'paddle'));
  if (l.coins) lost.push(plural(l.coins, 'coin'));
  if (l.snacks) lost.push(plural(l.snacks, 'snack'));
  if (l.bandaids) lost.push(plural(l.bandaids, 'bandaid'));
  if (l.medikits) lost.push(plural(l.medikits, 'medikit'));
  if (l.books) lost.push('a skill boost');
  if (l.raftFound) lost.push('the raft');
  if (l.helmetFound) lost.push('the helmet');
  return `🌊 Capsized! You're swimming.<br>${progressText()}
    <br><small style="color:#ff9a80">+${gain} injury (${injury}/${cap})</small>
    ${lost.length ? `<br><small style="color:#ff9a80">lost ${lost.join(', ')} — loot only banks on a finish</small>` : ''}`;
}