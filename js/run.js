// The run controller: driving the GPU water sim, and starting / ending / retrying a run.
import { GRID, SIM, PARTS, STAMINA, ITEMS, RENDER } from './config.js';
import { clamp } from './math.js';
import { generateRiver } from './river.js';
import { craftOf, itemCount, useItem, awardRun, applyInjury } from './progression.js';
import { $, isMobile, gyro, enterFullscreen } from './platform.js';
import { G, emptyLoot, isRunning } from './state.js';
import { gpu, fillTerrainIndex } from './gpu.js';
import { band } from './sampling.js';
import { kayak, craftKayakParams } from './kayak.js';
import { cam } from './render.js';
import { placeVegetation, buildBridgeGpu } from './scenery.js';
import { placePickups, resetPickups, placeMapItem } from './pickups.js';
import { placeObstacles, placeLandslides } from './obstacles.js';
import { show, hide, isShown } from './ui.js';
import { showMenu, showLevelUp } from './menu.js';
import { popLoot, showEndMessage, finishSummary, capsizeSummary } from './hud.js';

const { W, L, dx } = GRID;

// ---------- water simulation driver ----------
export function writeSimUniforms(time, inQ, jOffset = 0) {
  const river = G.river, vx = river.R.vortex;
  const ab = new ArrayBuffer(112), f = new Float32Array(ab), u = new Uint32Array(ab);
  u[0] = W; u[1] = L; f[2] = dx; f[3] = SIM.dt; f[4] = SIM.g; f[5] = river.R.manning; f[6] = SIM.hmin; f[7] = SIM.umax;
  f[8] = time; f[9] = river.inEta; f[10] = inQ; f[11] = river.inVelScale;
  f[12] = SIM.turbA; f[13] = SIM.turbL; f[14] = SIM.turbT; f[15] = SIM.foamDecay;
  f[16] = SIM.kDecay; f[17] = SIM.macCormack; f[18] = SIM.kGen; f[19] = SIM.foamGen;
  f[20] = jOffset;
  f[21] = vx ? vx.x : 0; f[22] = vx ? vx.z : 0; f[23] = vx ? vx.strength : 0; f[24] = vx ? vx.radius : 0;
  gpu.write(gpu.simUBuf, 0, ab);
}

export function encodeSubstep(enc, rows = L) {
  const pass = enc.beginComputePass();
  for (let k = 0; k < 3; k++) {
    pass.setPipeline(gpu.simPipes[k]);
    pass.setBindGroup(0, gpu.simBGs[k]);
    pass.dispatchWorkgroups(W / 8, Math.ceil(rows / 8));
  }
  pass.end();
}

// slow wobble of the inflow discharge so the river never looks perfectly steady
export const inflowQ = t => 1 + 0.06 * Math.sin(0.21 * t) + 0.04 * Math.sin(0.53 * t + 1) + 0.025 * Math.sin(1.3 * t + 2);

// the rows actually stepped this frame: a window around the kayak
export function computeWindow(zk) {
  const j0 = clamp(Math.floor((zk - RENDER.computeBehind) / dx), 0, L - 1);
  const j1 = clamp(Math.ceil((zk + RENDER.computeAhead) / dx), j0 + 1, L);
  return { j0, rows: j1 - j0 };
}

async function runWarmup() {
  const chunk = 30;
  for (let s = 0; s < SIM.warmupSteps; s += chunk) {
    const enc = gpu.device.createCommandEncoder();
    const n = Math.min(chunk, SIM.warmupSteps - s);
    for (let k = 0; k < n; k++) encodeSubstep(enc);
    gpu.device.queue.submit([enc.finish()]);
    await gpu.device.queue.onSubmittedWorkDone();
  }
}

// ---------- run lifecycle ----------
// upload a freshly generated river and everything that's fixed for it (restarts skip this)
function loadRiver(R) {
  const river = G.river = generateRiver(R);
  fillTerrainIndex(river.b);
  gpu.write(gpu.terrainBuf, 0, river.b);
  gpu.write(gpu.maskBuf, 0, river.mask);
  placeVegetation();
  placePickups();
  buildBridgeGpu(river);
}

export async function startRun(R) {
  if (G.warmingUp) return;
  if (!G.profile) return showMenu();
  G.runCraft = craftOf(G.profile);
  G.effK = craftKayakParams(G.runCraft, G.profile);
  if (isMobile) { gyro.request(); enterFullscreen(); }   // both must run inside the tap that brought us here

  G.warmingUp = true;
  hide('menu'); hide('lvl');
  show('stam', 'block'); show('loot');
  show('msg');
  $('msg').innerHTML = 'Loading river…';

  if (!G.river || G.river.R !== R) loadRiver(R);   // regenerate only when the river changes (R restarts are instant)
  const river = G.river;
  resetPickups();
  placeMapItem();   // re-rolled every attempt, not just on river regeneration
  G.runLoot = emptyLoot();
  G.snackMsgUntil = 0; G.drinkBuffUntil = 0; G.drinkMsgUntil = 0;

  gpu.write(gpu.stateBufs[0], 0, river.state);
  gpu.write(gpu.kBufs[0], 0, river.kArr);
  gpu.write(gpu.partBuf, 0, new Float32Array(PARTS.count * 8));
  writeSimUniforms(0, 1);
  await runWarmup();
  band.ready = false;

  kayak.reset();
  cam.reset();
  placeObstacles();    // seeded relative to the boat, so after reset; redone every attempt
  placeLandslides();
  if (isMobile) gyro.calibrate();   // however the phone is held right now counts as level
  document.body.classList.add('inrun');
  G.simTime = 0;
  G.runTime = 0;
  hide('msg');
  G.warmingUp = false;
  G.gameState = 'run';
}

export function endRun(won) {
  if (!isRunning()) return;
  G.gameState = 'over';
  const buttons = { retry: retryRun, menu: () => showMenu() };
  if (won) {
    const award = awardRun(G.profile, G.river.R, G.runTime, G.runLoot);
    showEndMessage(finishSummary(award), buttons);
    if (award.ups || award.bookBoost) setTimeout(showLevelUp, 900);
  } else {
    showEndMessage(capsizeSummary(applyInjury(G.profile, G.river.R.tier)), buttons);
  }
}

// R key and the Retry button share the same guard
export function retryRun() {
  if (G.river && G.gameState !== 'menu' && !G.warmingUp && !isShown('lvl')) startRun(G.river.R);
}

// F key: finish the run where it stands
export function finishRun() {
  if (isRunning()) endRun(true);
}

// ---------- in-run consumables ----------
// eat one snack from the pack: only mid-run, only if there's one, and not when the stamina bar
// is already (nearly) full — it'd just be thrown away
export function eatSnack() {
  if (!isRunning() || !G.profile) return;
  if (itemCount(G.profile, 'snack') <= 0 || kayak.stamina >= STAMINA.max - 2) return;
  useItem(G.profile, 'snack');
  kayak.stamina = clamp(kayak.stamina + ITEMS.snack.stamina, 0, STAMINA.max);
  kayak.tired = kayak.stamina < STAMINA.max * STAMINA.tiredFrac;
  G.snackMsgUntil = G.simTime + 2.5;
  popLoot('snack');
}

// drink one energy booster: only mid-run, only if there's one — unlike the snack there's no
// "already full" guard since the buff always refreshes to a fresh buffDuration window
export function drinkEnergy() {
  if (!isRunning() || !G.profile) return;
  if (itemCount(G.profile, 'energyDrink') <= 0) return;
  useItem(G.profile, 'energyDrink');
  G.drinkBuffUntil = G.simTime + ITEMS.energyDrink.buffDuration;
  G.drinkMsgUntil = G.simTime + 2.5;
  popLoot('energyDrink');
}