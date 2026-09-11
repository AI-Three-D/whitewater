// Entry point: boot sequence, key/button wiring and the per-frame loop.
import { SIM, RIVERS, RIVERS_HIDDEN, validateConfig } from './config/index.js';
import { clamp } from './math.js';
import { validateRiverConfig } from './river.js';
import { loadProfile } from './progression.js';
import { $, showErr, installErrorHandlers, isMobile } from './platform.js';
import { S, TIME_SCALE, MAX_PHYS_TICKS } from './state.js';
import { gpu, initGpu, resize } from './gpu.js';
import { input, KEYMAP, PAD_KEYS, padDown, padUp, initPads, initFreeLook } from './controls.js';
import { kayak } from './kayak.js';
import { encodeBandCopy, finishBandCopy } from './sampling.js';
import { computeWindow, inflowQ, writeSimUniforms, writeParticleUniforms, encodeWaterSim, encodeParticleSim } from './sim.js';
import { simWindow } from './view.js';
import { cam, writeCam, updateKayakInstances, encodeRenderPass } from './render.js';
import { updateSparks } from './effects.js';
import { spawnRucksacks, updateRucksackDrift, updatePickups } from './pickups.js';
import { updateObstacles, writeObstacleInstances } from './obstacles.js';
import { hud } from './hud.js';
import { initUi, showMenu, hideStore, hideCharSheet, showHowTo, hideHowTo, isOpen } from './ui.js';
import { startRun, confirmStart, endRun, retryRun, eatSnack, drinkEnergy, cycleCamera, toggleDbg, toggleNoCapsize, togglePause } from './run.js';
import { initEditor, openEditor, editorUpdate } from './editor.js';
const BUILD = 'build 36';
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
  KeyP: togglePause,
  F1: e => { toggleDbg(); e.preventDefault(); },
  KeyF: () => { if (S.gameState === 'run') endRun('finished'); },
  Escape: () => {
    if (isOpen('charsheet')) hideCharSheet();
    else if (isOpen('store')) hideStore();
    else if (isOpen('howto')) hideHowTo();
    else if (!isOpen('lvl')) showMenu();
  },
};
function bindKeys() {
  addEventListener('keydown', e => {
    if (S.gameState === 'editor') return;   // the level editor binds its own keys (editor.js)
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
  $('mPause').onclick = togglePause;
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
    if (outcome) endRun(outcome);
    else if (S.river.R.timeLimit && S.runTime >= S.river.R.timeLimit) endRun('timeout');
  }
  physAccum -= S.frameTicks * SIM.dt;
}
function updateWorld(dtReal) {
  spawnRucksacks(dtReal);
  updateRucksackDrift(dtReal);
  updatePickups();
  updateObstacles(dtReal);
}
// simulate = false (editor paused): draw the current water state as-is — no sim/particle dispatch, no readback
function renderFrame(dtReal, simulate = true) {
  const { device } = gpu;
  const enc = device.createCommandEncoder();
  let bandReq = null;
  if (simulate) {
    const { cj0, rows } = computeWindow();
    writeSimUniforms(S.simTime, inflowQ(S.simTime), cj0);
    writeParticleUniforms(dtReal);
    encodeWaterSim(enc, rows);
    encodeParticleSim(enc);
    bandReq = encodeBandCopy(enc, simWindow().zc);
  }
  encodeRenderPass(enc);
  device.queue.submit([enc.finish()]);
  finishBandCopy(bandReq);
}
function frame(now) {
  requestAnimationFrame(frame);
  const dtRaw = (now - lastT) / 1000;
  lastT = now;
  if (dtRaw > 0) S.fps += (1 / dtRaw - S.fps) * 0.1;
  const dtReal = clamp(dtRaw, 0, 0.05);
  if (S.gameState === 'editor') {
    if (S.river) renderFrame(dtReal, editorUpdate(dtReal));
    return;
  }
  if (!S.river || S.gameState === 'menu' || S.warmingUp || S.paused) return;
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
  initFreeLook();
  initEditor();
  bindMobileButtons();
  $('howtoBtn').onclick = showHowTo;
  initUi({ startRun, confirmStart, openEditor });
  showMenu();
  requestAnimationFrame(frame);
}
main().catch(e => showErr('Error: ' + (e.stack || e)));