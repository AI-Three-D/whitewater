// Run lifecycle (start / warm-up / end screens) and the in-run player actions.
import { PARTS, ITEMS, STAMINA } from './config/index.js';
import { clamp } from './math.js';
import { generateRiver } from './river.js';
import { craftOf, itemCount, useItem, awardRun, applyInjury, ownsUpgrade, pointsForLevel, isSecretSpent, markSecretSpent } from './progression.js';
import { S, resetRunCounters } from './state.js';
import { $, isMobile, gyro, enterFullscreen } from './platform.js';
import { gpu, fillTerrainIndex } from './gpu.js';
import { band } from './sampling.js';
import { kayak, craftKayakParams } from './kayak.js';
import { cam } from './render.js';
import { placeVegetation, buildBridgeScenery } from './props.js';
import { placePickups, resetPickupsForAttempt, placeMapItem } from './pickups.js';
import { placeObstacles } from './obstacles.js';
import { placeLandslides } from './landslides.js';
import { writeSimUniforms, runWarmup } from './sim.js';
import { showMenu, showLevelUp, isOpen, plural } from './ui.js';
import { popLoot } from './hud.js';

export function cycleCamera() {
  S.camMode = (S.camMode + 1) % 3;
}

export function toggleDbg() {
  S.dbgMode = (S.dbgMode + 1) % 5;
  $('dbg').style.display = S.dbgMode ? 'block' : 'none';
}

export function toggleNoCapsize() {
  S.debugNoCapsize = !S.debugNoCapsize;
  $('mGod').classList.toggle('on', S.debugNoCapsize);
}

export function togglePause() {
  if (S.gameState !== 'run') return;
  S.paused = !S.paused;
  const msg = $('msg');
  if (S.paused) {
    msg.style.display = 'flex';
    msg.innerHTML = `⏸️ Paused<br>
      <div class="mbtns"><button id="btnResume">▶ Resume</button><button id="btnPauseMenu">${S.testExit ? '← Back to editor' : 'River menu'}</button></div>
      <small class="desktop-only">P — resume · Esc — ${S.testExit ? 'back to editor' : 'river menu'}</small>`;
    $('btnResume').onclick = togglePause;
    $('btnPauseMenu').onclick = () => { S.paused = false; (S.testExit || showMenu)(); };
  } else {
    msg.style.display = 'none';
  }
}

export function eatSnack() {
  if (S.gameState !== 'run' || !S.profile) return;
  if (itemCount(S.profile, 'snack') <= 0 || kayak.stamina >= STAMINA.max - 2) return;
  useItem(S.profile, 'snack');
  kayak.stamina = clamp(kayak.stamina + ITEMS.snack.stamina, 0, STAMINA.max);
  kayak.tired = kayak.stamina < STAMINA.max * STAMINA.tiredFrac;
  S.snackMsgUntil = S.simTime + 2.5;
  popLoot('snack');
}

// unlike eatSnack, no "already full" guard — the buff always refreshes to a full window
export function drinkEnergy() {
  if (S.gameState !== 'run' || !S.profile) return;
  if (itemCount(S.profile, 'energyDrink') <= 0) return;
  useItem(S.profile, 'energyDrink');
  S.drinkBuffUntil = S.simTime + ITEMS.energyDrink.buffDuration;
  S.drinkMsgUntil = S.simTime + 2.5;
  popLoot('energyDrink');
}

export function retryRun() {
  if (S.gameState === 'testWarmup') return;
  if (S.testRetry) return S.testRetry();
  if (S.river && S.gameState !== 'menu' && !S.warmingUp && !isOpen('lvl')) startRun(S.river.R);
}

// ---------- start ----------
// only called when the river changes — restarts are instant
export function loadRiver(R) {
  const river = generateRiver(R);
  S.river = river;
  fillTerrainIndex(river.b);
  gpu.device.queue.writeBuffer(gpu.terrainBuf, 0, river.b);
  gpu.device.queue.writeBuffer(gpu.maskBuf, 0, river.mask);
  placeVegetation();
  placePickups();
  buildBridgeScenery();
}

export function uploadInitialWater() {
  const { device } = gpu, river = S.river;
  device.queue.writeBuffer(gpu.stateBufs[0], 0, river.state);
  device.queue.writeBuffer(gpu.kBufs[0], 0, river.kArr);
  device.queue.writeBuffer(gpu.partBuf, 0, new Float32Array(PARTS.count * 8));
}

// reuses #msg like the pause prompt (safe: nothing else shows it in 'menu'); cancel just hides it, nothing touched until Start
export function confirmStart(R) {
  if (!S.profile) return showMenu();
  if (isSecretSpent(S.profile, R)) return showMenu();
  const msg = $('msg');
  msg.style.display = 'flex';
  msg.innerHTML = `⏱️ ${R.name}<br>
    <span style="color:#ffe08a">You'll have <b>${R.timeLimit}s</b> to reach the take-out.</span>
    ${R.singleAttempt ? '<br><small style="color:#ff9a80">One shot — there\'s no retry once you start.</small>' : ''}
    <div class="mbtns"><button id="btnStart">▶ Start</button><button id="btnCancel">Not yet</button></div>
    <small class="desktop-only">the clock begins the moment you press Start</small>`;
  $('btnStart').onclick = () => { msg.style.display = 'none'; startRun(R); };
  $('btnCancel').onclick = () => { msg.style.display = 'none'; };
}

export async function startRun(R) {
  if (S.warmingUp) return;
  if (!S.profile) return showMenu();
  // a single-attempt (secret) river is spent the instant it launches, win/capsize/timeout alike
  if (isSecretSpent(S.profile, R)) return showMenu();
  markSecretSpent(S.profile, R);
  S.runCraft = craftOf(S.profile);
  S.effK = craftKayakParams(S.runCraft, S.profile);
  if (isMobile) {   // must run inside the tap that brought us here
    gyro.request();
    enterFullscreen();
  }
  S.warmingUp = true;
  $('menu').style.display = 'none';
  $('lvl').style.display = 'none';
  $('stam').style.display = 'block';
  $('loot').style.display = 'flex';
  $('msg').style.display = 'flex';
  $('msg').innerHTML = 'Loading river…';

  if (!S.river || S.river.R !== R) loadRiver(R);
  resetPickupsForAttempt();
  placeMapItem();   // re-rolled every attempt
  resetRunCounters();
  uploadInitialWater();
  writeSimUniforms(0, 1);
  await runWarmup();
  band.ready = false;
  kayak.reset();
  cam.reset();
  placeObstacles();   // seeded relative to the boat, so after reset
  placeLandslides();
  if (isMobile) gyro.calibrate();   // current phone tilt counts as level
  document.body.classList.add('inrun');
  S.simTime = 0;
  S.runTime = 0;
  S.paused = false;
  $('msg').style.display = 'none';
  S.warmingUp = false;
  S.gameState = 'run';
}

// ---------- end ----------
// a spent single-attempt river drops the retry button entirely and says so
const actionsHtml = R => R.singleAttempt
  ? `<div class="mbtns"><button id="btnMenu">River menu</button></div>
    <small class="desktop-only">Esc — river menu</small>
    <br><small style="color:#ff9a80">one shot spent — this secret run is gone for good</small>`
  : `<div class="mbtns"><button id="btnRetry">↻ Run again</button><button id="btnMenu">River menu</button></div>
    <small class="desktop-only">R — run again · Esc — river menu</small>`;

const progressLine = () => `${(kayak.p[2] - 15).toFixed(0)} m of ${(S.river.finishZ - 15).toFixed(0)} m`;

// shared between lossMessage and timeoutMessage — neither banks any loot
const lostLootLine = loot => {
  const lost = [];
  if (loot.paddles) lost.push(plural(loot.paddles, 'paddle'));
  if (loot.coins) lost.push(plural(loot.coins, 'coin'));
  if (loot.snacks) lost.push(plural(loot.snacks, 'snack'));
  if (loot.bandaids) lost.push(plural(loot.bandaids, 'bandaid'));
  if (loot.medikits) lost.push(plural(loot.medikits, 'medikit'));
  if (loot.books) lost.push('a skill boost');
  if (loot.raftFound) lost.push('the raft');
  if (loot.helmetFound) lost.push('the helmet');
  return lost.length ? `<br><small style="color:#ff9a80">lost ${lost.join(', ')} — loot only banks on a finish</small>` : '';
};

function winMessage() {
  const prof = S.profile, R = S.river.R;
  const { pts, basePts, paddleXp, coins, sponsorCoins, ups, bandaids, medikits, snacks, bookBoost, raftFound, helmetFound, healed } =
    awardRun(prof, R, S.runTime, S.runLoot);
  const best = prof.best[R.name] === S.runTime ? ' · new best!' : '';
  const finds = [];
  if (snacks) finds.push(plural(snacks, 'snack'));
  if (bandaids) finds.push(plural(bandaids, 'bandaid'));
  if (medikits) finds.push(plural(medikits, 'medikit'));
  if (bookBoost) finds.push(`a book — +${bookBoost} skill boost`);
  if (raftFound) finds.push('an inflatable raft!');
  if (helmetFound) finds.push('a better helmet!');
  const levelLine = ups
    ? ` — LEVEL UP${ups > 1 ? ' ×' + ups : ''}!`
    : ` · ${prof.points}/${pointsForLevel(prof.level)} to level ${prof.level + 1}`;
  const html = `🏁 Take-out reached!<br>${R.name} in ${S.runTime.toFixed(1)} s${best}<br>
    <span style="color:#ffe08a">+${basePts} finish${paddleXp ? ` +${paddleXp} paddle` : ''} = +${pts} xp${coins ? ` · +${plural(coins, 'coin')}` : ''}${levelLine}</span>
    ${finds.length ? `<br><small style="color:#9be0ff">found ${finds.join(', ')}</small>` : ''}
    ${ownsUpgrade(prof, 'sponsor') ? `<br><small style="color:#ffd35c">📣 sponsor payout: +${plural(sponsorCoins, 'coin')}</small>` : ''}
    ${healed ? `<br><small style="color:#9f7">3 clean runs in a row — injury recovers by ${healed} (${prof.injury}/${prof.health})</small>` : ''}
    ${actionsHtml(R)}`;
  if (ups || bookBoost) setTimeout(showLevelUp, 900);
  return html;
}

function lossMessage() {
  const R = S.river.R, loot = S.runLoot;
  const { gain, recovered, injury, cap, levelsLost } = applyInjury(S.profile, R.tier);
  if (recovered) {
    return `🏥 Badly hurt — time for a long recovery.<br>${progressLine()}
      <br><small style="color:#ff9a80">${levelsLost ? `Lost ${plural(levelsLost, 'level')}, ` : ''}every coin, and the whole pack — but the rest is healed up (injury 0/${cap}).</small>
      ${actionsHtml(R)}`;
  }
  return `🌊 Capsized! You're swimming.<br>${progressLine()}
    <br><small style="color:#ff9a80">+${gain} injury (${injury}/${cap})</small>
    ${lostLootLine(loot)}
    ${actionsHtml(R)}`;
}

function timeoutMessage() {
  const R = S.river.R;
  return `⏱️ Time's up!<br>${progressLine()}
    ${lostLootLine(S.runLoot)}
    ${actionsHtml(R)}`;
}

export function endRun(outcome) {
  if (S.gameState !== 'run') return;
  S.gameState = 'over';
  // seed free-look from the chase cam's angle so the switch to orbiting doesn't jump
  S.freeCam.yaw = Math.atan2(-cam.dir[0], -cam.dir[2]);
  S.freeCam.pitch = 0.28;
  S.freeCam.dist = 9;
  const msg = $('msg');
  msg.style.display = 'flex';
  msg.innerHTML = outcome === 'finished' ? winMessage() : outcome === 'timeout' ? timeoutMessage() : lossMessage();
  if ($('btnRetry')) $('btnRetry').onclick = retryRun;   // absent on a spent single-attempt river
  $('btnMenu').onclick = () => showMenu();
  if (S.onRunOver) S.onRunOver(outcome);   // level editor: relabel/rewire the screen's buttons
}