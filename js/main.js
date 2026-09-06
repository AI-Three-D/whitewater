// Bootstrap and the frame loop. This is the composition root: it creates the GPU context, wires
// the screens and input to the run controller, and owns the per-frame ordering.
import './quality.js';   // MUST stay first — applies the detail tier before any module reads GRID
import { SIM, RIVERS, RIVERS_HIDDEN } from './config.js';
import { validateRiverConfig } from './river.js';
import { loadProfile } from './progression.js';
import { $, showErr } from './platform.js';
import { G, TIME_SCALE, MAX_PHYS_TICKS } from './state.js';
import { gpu, initGpu } from './gpu.js';
import { initAssets } from './assets.js';
import { beginBandReadback, finishBandReadback } from './sampling.js';
import { initInput } from './input.js';
import { kayak } from './kayak.js';
import { initPickups, spawnRucksacks, updateRucksackDrift, updatePickups, updateSparks } from './pickups.js';
import { updateObstacles, writeObstacleInstances } from './obstacles.js';
import { initRender, cam, writeCam, updateKayakInstances, writeParticleUniforms, encodeParticleStep, encodeRenderPass } from './render.js';
import { isShown } from './ui.js';
import { initMenu, showMenu } from './menu.js';
import { showStore, hideStore, showCharSheet, hideCharSheet } from './store.js';
import { hud } from './hud.js';
import { startRun, endRun, retryRun, finishRun, eatSnack, drinkEnergy, writeSimUniforms, encodeSubstep, inflowQ, computeWindow } from './run.js';

const fail = t => { showErr(t); $('menu').style.display = 'none'; };

// ---------- frame loop ----------
let lastT = performance.now();
let physAccum = 0;   // real seconds of physics owed, carried frame to frame

// fixed-step physics at TIME_SCALE × real time, capped at MAX_PHYS_TICKS per frame
function stepPhysics(dtReal) {
  physAccum = Math.min(physAccum + dtReal * TIME_SCALE, SIM.dt * MAX_PHYS_TICKS);
  G.frameTicks = Math.min(Math.floor(physAccum / SIM.dt), MAX_PHYS_TICKS);
  for (let s = 0; s < G.frameTicks; s++) {
    G.simTime += SIM.dt;
    if (G.gameState !== 'run') continue;
    G.runTime += SIM.dt;
    const outcome = kayak.step(SIM.dt);
    if (outcome) endRun(outcome === 'finish');
  }
  physAccum -= G.frameTicks * SIM.dt;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dtRaw = (now - lastT) / 1000;
  lastT = now;
  if (dtRaw > 0) G.fps += (1 / dtRaw - G.fps) * 0.1;
  if (!G.river || G.gameState === 'menu' || G.warmingUp) return;
  const dtReal = Math.min(0.05, Math.max(0, dtRaw));

  stepPhysics(dtReal);
  if (!G.river) return;   // the run was torn down this frame: leave the last frame on screen
  const running = G.gameState === 'run';

  // CPU-side updates
  const win = computeWindow(kayak.p[2]);
  writeSimUniforms(G.simTime, inflowQ(G.simTime), win.j0);
  cam.update(dtReal);
  writeCam();
  updateKayakInstances(dtReal);
  if (running) {
    spawnRucksacks(dtReal);
    updateRucksackDrift(dtReal);
    updatePickups();
    updateObstacles(dtReal);
  }
  writeObstacleInstances();   // also while 'over', so the wreck scene isn't missing its logs
  updateSparks(dtReal);
  writeParticleUniforms(dtReal);

  // GPU work: water substeps, spray particles, band copy-back, then the scene
  const enc = gpu.device.createCommandEncoder();
  for (let s = 0; s < SIM.substeps; s++) encodeSubstep(enc, win.rows);
  encodeParticleStep(enc);
  const readback = beginBandReadback(enc, kayak.p[2]);
  encodeRenderPass(enc);
  gpu.device.queue.submit([enc.finish()]);
  finishBandReadback(readback);

  hud();
}

// ---------- bootstrap ----------
(async function main() {
  // level-config sanity (land bridges vs floating obstacles etc.) — see validateRiverConfig
  try {
    for (const R of [...RIVERS, ...RIVERS_HIDDEN]) validateRiverConfig(R);
  } catch (e) {
    return fail('Level configuration error:\n' + e.message);
  }

  try {
    await initGpu($('c'));
  } catch (e) {
    return fail(e.message);
  }
  gpu.device.lost.then(i => fail('WebGPU device lost: ' + i.message));
  initAssets();
  initPickups();
  initRender();

  G.profile = loadProfile();
  initMenu({ startRun, showStore, showCharSheet });
  initInput({
    eatSnack, drinkEnergy, retryRun, finishRun,
    escape: () => {
      if (isShown('charsheet')) hideCharSheet();
      else if (isShown('store')) hideStore();
      else if (!isShown('lvl')) showMenu();
    },
    exitToMenu: () => { if (G.gameState !== 'menu' && !isShown('lvl')) showMenu(); },
  });

  showMenu();
  requestAnimationFrame(frame);
})().catch(e => showErr('Error: ' + (e.stack || e)));