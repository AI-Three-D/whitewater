// Run lifecycle (start / warm-up / end screens) and the in-run player actions.
import { PARTS, ITEMS, STAMINA } from './config/index.js';
import { clamp } from './math.js';
import { generateRiver } from './river.js';
import { craftOf, itemCount, useItem, awardRun, applyInjury, ownsUpgrade, pointsForLevel } from './progression.js';
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

// ---------- in-run actions ----------
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

// only mid-run, only if there's one, and not when the bar is already (nearly) full
export function eatSnack() {
  if (S.gameState !== 'run' || !S.profile) return;
  if (itemCount(S.profile, 'snack') <= 0 || kayak.stamina >= STAMINA.max - 2) return;
  useItem(S.profile, 'snack');
  kayak.stamina = clamp(kayak.stamina + ITEMS.snack.stamina, 0, STAMINA.max);
  kayak.tired = kayak.stamina < STAMINA.max * STAMINA.tiredFrac;
  S.snackMsgUntil = S.simTime + 2.5;
  popLoot('snack');
}

// unlike the snack there's no "already full" guard: the buff always refreshes to a full window
export function drinkEnergy() {
  if (S.gameState !== 'run' || !S.profile) return;
  if (itemCount(S.profile, 'energyDrink') <= 0) return;
  useItem(S.profile, 'energyDrink');
  S.drinkBuffUntil = S.simTime + ITEMS.energyDrink.buffDuration;
  S.drinkMsgUntil = S.simTime + 2.5;
  popLoot('energyDrink');
}

// R key and the Retry button share the same guard
export function retryRun() {
  if (S.river && S.gameState !== 'menu' && !S.warmingUp && !isOpen('lvl')) startRun(S.river.R);
}

// ---------- start ----------
// regenerate terrain, scenery and pickups — only when the river changes (restarts are instant)
function loadRiver(R) {
  const river = generateRiver(R);
  S.river = river;
  fillTerrainIndex(river.b);
  gpu.device.queue.writeBuffer(gpu.terrainBuf, 0, river.b);
  gpu.device.queue.writeBuffer(gpu.maskBuf, 0, river.mask);
  placeVegetation();
  placePickups();
  buildBridgeScenery();
}

function uploadInitialWater() {
  const { device } = gpu, river = S.river;
  device.queue.writeBuffer(gpu.stateBufs[0], 0, river.state);
  device.queue.writeBuffer(gpu.kBufs[0], 0, river.kArr);
  device.queue.writeBuffer(gpu.partBuf, 0, new Float32Array(PARTS.count * 8));
}

export async function startRun(R) {
  if (S.warmingUp) return;
  if (!S.profile) return showMenu();
  S.runCraft = craftOf(S.profile);
  S.effK = craftKayakParams(S.runCraft, S.profile);
  if (isMobile) {   // both must run inside the tap that brought us here
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
  placeMapItem();   // re-rolled every attempt, not just on river regeneration
  resetRunCounters();
  uploadInitialWater();
  writeSimUniforms(0, 1);
  await runWarmup();
  band.ready = false;
  kayak.reset();
  cam.reset();
  placeObstacles();   // seeded relative to the boat, so after reset; redone every attempt
  placeLandslides();
  if (isMobile) gyro.calibrate();   // however the phone is held right now counts as level
  document.body.classList.add('inrun');
  S.simTime = 0;
  S.runTime = 0;
  $('msg').style.display = 'none';
  S.warmingUp = false;
  S.gameState = 'run';
}

// ---------- end ----------
const ACTIONS = `<div class="mbtns"><button id="btnRetry">↻ Run again</button><button id="btnMenu">River menu</button></div>
  <small class="desktop-only">R — run again · Esc — river menu</small>`;

const progressLine = () => `${(kayak.p[2] - 15).toFixed(0)} m of ${(S.river.finishZ - 15).toFixed(0)} m`;

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
    ${ACTIONS}`;
  if (ups || bookBoost) setTimeout(showLevelUp, 900);
  return html;
}

function lossMessage() {
  const loot = S.runLoot;
  const { gain, recovered, injury, cap, levelsLost } = applyInjury(S.profile, S.river.R.tier);
  if (recovered) {
    return `🏥 Badly hurt — time for a long recovery.<br>${progressLine()}
      <br><small style="color:#ff9a80">${levelsLost ? `Lost ${plural(levelsLost, 'level')}, ` : ''}every coin, and the whole pack — but the rest is healed up (injury 0/${cap}).</small>
      ${ACTIONS}`;
  }
  const lost = [];
  if (loot.paddles) lost.push(plural(loot.paddles, 'paddle'));
  if (loot.coins) lost.push(plural(loot.coins, 'coin'));
  if (loot.snacks) lost.push(plural(loot.snacks, 'snack'));
  if (loot.bandaids) lost.push(plural(loot.bandaids, 'bandaid'));
  if (loot.medikits) lost.push(plural(loot.medikits, 'medikit'));
  if (loot.books) lost.push('a skill boost');
  if (loot.raftFound) lost.push('the raft');
  if (loot.helmetFound) lost.push('the helmet');
  return `🌊 Capsized! You're swimming.<br>${progressLine()}
    <br><small style="color:#ff9a80">+${gain} injury (${injury}/${cap})</small>
    ${lost.length ? `<br><small style="color:#ff9a80">lost ${lost.join(', ')} — loot only banks on a finish</small>` : ''}
    ${ACTIONS}`;
}

export function endRun(won) {
  if (S.gameState !== 'run') return;
  S.gameState = 'over';
  // seed free-look from the chase cam's current angle so the switch to orbiting doesn't jump —
  // it's still roughly "behind the boat", just now draggable (see cam.update in render.js)
  S.freeCam.yaw = Math.atan2(-cam.dir[0], -cam.dir[2]);
  S.freeCam.pitch = 0.28;
  S.freeCam.dist = 9;
  const msg = $('msg');
  msg.style.display = 'flex';
  msg.innerHTML = won ? winMessage() : lossMessage();
  $('btnRetry').onclick = retryRun;
  $('btnMenu').onclick = () => showMenu();
}