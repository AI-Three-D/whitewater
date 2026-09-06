// Entry point: boot sequence, key/button wiring and the per-frame loop. Game logic lives in the
// modules this file calls — it should read as a table of contents.
import { SIM, RIVERS, RIVERS_HIDDEN , validateConfig} from './config/index.js';
import { clamp } from './math.js';
import { validateRiverConfig } from './river.js';
import { loadProfile } from './progression.js';
import { $, showErr, installErrorHandlers, isMobile } from './platform.js';
import { S, TIME_SCALE, MAX_PHYS_TICKS } from './state.js';
import { gpu, initGpu, resize } from './gpu.js';
import { input, KEYMAP, PAD_KEYS, padDown, padUp, initPads } from './controls.js';
import { kayak } from './kayak.js';
import { encodeBandCopy, finishBandCopy } from './sampling.js';
import { computeWindow, inflowQ, writeSimUniforms, writeParticleUniforms, encodeWaterSim, encodeParticleSim } from './sim.js';
import { cam, writeCam, updateKayakInstances, encodeRenderPass } from './render.js';
import { updateSparks } from './effects.js';
import { spawnRucksacks, updateRucksackDrift, updatePickups } from './pickups.js';
import { updateObstacles, writeObstacleInstances } from './obstacles.js';
import { hud } from './hud.js';
import { initUi, showMenu, hideStore, hideCharSheet, isOpen } from './ui.js';
import { startRun, endRun, retryRun, eatSnack, drinkEnergy, cycleCamera, toggleDbg, toggleNoCapsize } from './run.js';

const BUILD = 'build 33';

installErrorHandlers();
{
  const v = $('ver');
  if (v) v.textContent = BUILD;
}
document.body.classList.add(isMobile ? 'mobile' : 'desktop');

// ---------- input wiring ----------
const KEY_ACTIONS = {
  KeyC: cycleCamera,
  KeyE: eatSnack,
  KeyQ: drinkEnergy,
  KeyG: toggleNoCapsize,
  KeyR: retryRun,
  F1: e => { toggleDbg(); e.preventDefault(); },
  KeyF: () => { if (S.gameState === 'run') endRun(true); },
  Escape: () => {
    if (isOpen('charsheet')) hideCharSheet();
    else if (isOpen('store')) hideStore();
    else if (!isOpen('lvl')) showMenu();
  },
};

function bindKeys() {
  addEventListener('keydown', e => {
    if (isMobile && PAD_KEYS[e.code]) {
      if (!e.repeat) for (const s of PAD_KEYS[e.code]) padDown(s);
      e.preventDefault();
      return;
    }
    if (KEYMAP[e.code]) {
      input[KEYMAP[e.code]] = true;
      e.preventDefault();
    }
    const action = KEY_ACTIONS[e.code];
    if (action) action(e);
  });
  addEventListener('keyup', e => {
    if (isMobile && PAD_KEYS[e.code]) {
      for (const s of PAD_KEYS[e.code]) padUp(s);
      return;
    }
    if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false;
  });
}

function bindMobileButtons() {
  $('mExit').onclick = () => { if (S.gameState !== 'menu' && !isOpen('lvl')) showMenu(); };
  $('mCam').onclick = cycleCamera;
  $('mDbg').onclick = toggleDbg;
  $('mEat').onclick = eatSnack;
  $('mDrink').onclick = drinkEnergy;
  $('mGod').onclick = toggleNoCapsize;
}

// ---------- frame loop ----------
let lastT = performance.now();
let physAccum = 0;   // real seconds of physics owed, carried frame to frame

// fixed-step physics with an accumulator, capped so a stall can't snowball
function stepPhysics(dtReal) {
  physAccum = Math.min(physAccum + dtReal * TIME_SCALE, SIM.dt * MAX_PHYS_TICKS);
  S.frameTicks = Math.min(Math.floor(physAccum / SIM.dt), MAX_PHYS_TICKS);
  for (let s = 0; s < S.frameTicks; s++) {
    S.simTime += SIM.dt;
    if (S.gameState !== 'run') continue;
    S.runTime += SIM.dt;
    const outcome = kayak.step(SIM.dt);
    if (outcome) endRun(outcome === 'finished');
  }
  physAccum -= S.frameTicks * SIM.dt;
}

function updateWorld(dtReal) {
  spawnRucksacks(dtReal);
  updateRucksackDrift(dtReal);
  updatePickups();
  updateObstacles(dtReal);
}

function renderFrame(dtReal) {
  const { device } = gpu;
  const { cj0, rows } = computeWindow(kayak.p[2]);
  writeSimUniforms(S.simTime, inflowQ(S.simTime), cj0);
  writeParticleUniforms(dtReal);
  const enc = device.createCommandEncoder();
  encodeWaterSim(enc, rows);
  encodeParticleSim(enc);
  const bandReq = encodeBandCopy(enc, kayak.p[2]);
  encodeRenderPass(enc);
  device.queue.submit([enc.finish()]);
  finishBandCopy(bandReq);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dtRaw = (now - lastT) / 1000;
  lastT = now;
  if (dtRaw > 0) S.fps += (1 / dtRaw - S.fps) * 0.1;
  if (!S.river || S.gameState === 'menu' || S.warmingUp) return;
  const dtReal = clamp(dtRaw, 0, 0.05);

  stepPhysics(dtReal);
  if (!S.river) return;   // permadeath tore the run down mid-tick: leave the last frame on screen
  if (S.gameState === 'run') updateWorld(dtReal);
  writeObstacleInstances();   // also while 'over', so the wreck scene isn't missing its logs
  updateSparks(dtReal);
  cam.update(dtReal);
  writeCam();
  updateKayakInstances(dtReal);
  renderFrame(dtReal);
  hud();
}

// ---------- boot ----------
async function main() {
  const fail = t => {
    showErr(t);
    $('menu').style.display = 'none';
  };
  try {
    validateConfig();
    for (const R of [...RIVERS, ...RIVERS_HIDDEN]) validateRiverConfig(R);
  } catch (e) {
    return fail('Level configuration error:\n' + e.message);
  }
  try {
    await initGpu($('c'));
  } catch (e) {
    return fail(e.message || String(e));
  }
  gpu.device.onuncapturederror = e => showErr('WebGPU error: ' + e.error.message);
  gpu.device.lost.then(i => fail('WebGPU device lost: ' + i.message));
  resize();
  addEventListener('resize', resize);

  S.profile = loadProfile();
  bindKeys();
  initPads();
  bindMobileButtons();
  initUi({ startRun });
  showMenu();
  requestAnimationFrame(frame);
}

main().catch(e => showErr('Error: ' + (e.stack || e)));