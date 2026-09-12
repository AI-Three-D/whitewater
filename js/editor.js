// Level editor (step 1): custom river persistence + JSON export, free camera, play/pause sim.
import { RENDER, PARTS } from './config/index.js';
import { clamp } from './math.js';
import { generateRiver, validateRiverConfig } from './river.js';
import { S } from './state.js';
import { $ } from './platform.js';
import { gpu, fillTerrainIndex } from './gpu.js';
import { band, encodeBandCopy, finishBandCopy, terrainH } from './sampling.js';
import { kayak } from './kayak.js';
import { cam, writeCam, updateKayakInstances, encodeRenderPass } from './render.js';
import { placeVegetation, buildBridgeScenery } from './props.js';
import { placePickups, updatePickups } from './pickups.js';
import { placeObstacles, updateObstacles, writeObstacleInstances } from './obstacles.js';
import { placeLandslides } from './landslides.js';
import { computeWindow, inflowQ, writeSimUniforms, writeParticleUniforms, encodeWaterSim, encodeParticleSim } from './sim.js';
import { showMenu } from './ui.js';
import { W, L, dx } from './quality.js';

// ---------- persistence (same mechanism as character data: localStorage) ----------
const CKEY = 'whitewater.customrivers.v1';
export function loadCustomRivers() {
  try {
    const a = JSON.parse(localStorage.getItem(CKEY));
    return Array.isArray(a) ? a : [];
  } catch (_) { return []; }
}
export const saveCustomRivers = list => localStorage.setItem(CKEY, JSON.stringify(list));

// a fresh custom river uses a gentle, known-good template; every field here is plain JSON
export const newCustomRiver = name => ({
  name, tier: 'easy', cls: 'Class II · custom', custom: true,
  slope: 0.002, manning: 0.032, depth: 1.5, len: 300, seed: Math.floor(Math.random() * 1e6),
  halfW: 10, widthVar: 0.25, meander: [[18, 170], [6, 61]], constrictions: 0, valleyH: 12, valleyScale: 70,
  rocks: 10, rockR: [0.8, 2.0], emergent: 0.3, ledges: [], bands: [],
  biome: 'alpine', timeOfDay: 'day', waterTint: [0.02, 0.12, 0.1], waterClarity: 1.0,
});

// ---------- editor state ----------
export const ed = {
  active: false, playing: false, idx: -1, cfg: null,
  pos: [0, 8, 12], yaw: 0, pitch: -0.35, keys: {}, speed: 18,
  saved: null,
};

export function openEditor(idx) {
  const list = loadCustomRivers();
  const cfg = list[idx];
  if (!cfg) return;
  try { validateRiverConfig(cfg); } catch (e) { alert('Level configuration error:\n' + e.message); return; }
  initInput();
  ed.idx = idx;
  ed.cfg = cfg;
  // ignore the behind culling distance: use the front distance in every direction while editing
  ed.saved = { viewBehind: RENDER.viewBehind, computeBehind: RENDER.computeBehind };
  RENDER.viewBehind = RENDER.viewAhead;
  RENDER.computeBehind = RENDER.computeAhead;
  rebuildWorld();
  const c0 = S.river.centerAt(30);
  ed.pos = [c0, terrainH(c0, 30) + 9, 10];
  ed.yaw = 0;
  ed.pitch = -0.35;
  ed.playing = false;
  ed.active = true;
  S.gameState = 'editor';
  document.body.classList.remove('inrun');
  for (const id of ['menu', 'msg', 'stam']) $(id).style.display = 'none';
  $('loot').style.display = 'none';
  showToolbar();
}

// full regenerate + upload — also what live param editing will call in step 2
export function rebuildWorld() {
  const river = generateRiver(ed.cfg);
  S.river = river;
  fillTerrainIndex(river.b);
  gpu.device.queue.writeBuffer(gpu.terrainBuf, 0, river.b);
  gpu.device.queue.writeBuffer(gpu.maskBuf, 0, river.mask);
  placeVegetation();
  placePickups();
  buildBridgeScenery();
  // static initial water — paused mode renders exactly this; play mode simulates from it
  gpu.device.queue.writeBuffer(gpu.stateBufs[0], 0, river.state);
  gpu.device.queue.writeBuffer(gpu.kBufs[0], 0, river.kArr);
  gpu.device.queue.writeBuffer(gpu.partBuf, 0, new Float32Array(PARTS.count * 8));
  kayak.reset();
  placeObstacles();
  placeLandslides();
  kayak.p = [-999, -500, 10];   // park the boat out of sight (and out of pickup-collect range)
  band.ready = false;
  S.simTime = 0;
}

export function exitEditor() {
  if (!ed.active) return;
  ed.active = false;
  ed.playing = false;
  RENDER.viewBehind = ed.saved.viewBehind;
  RENDER.computeBehind = ed.saved.computeBehind;
  if (bar) bar.style.display = 'none';
  S.river = null;   // force a clean loadRiver on the next normal run
  showMenu();
}

// ---------- toolbar ----------
let bar = null;
const BTN_CSS = 'background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:7px;padding:5px 12px;cursor:pointer;font-size:13px';
function showToolbar() {
  if (!bar) {
    bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;z-index:30;' +
      'background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.35);border-radius:10px;padding:8px 12px;font-size:13px';
    document.body.appendChild(bar);
  }
  renderToolbar();
  bar.style.display = 'flex';
}
function renderToolbar() {
  bar.innerHTML = `<b style="color:#ffe08a">${ed.cfg.name}</b>
    <button id="edPlay">${ed.playing ? '⏸ Pause' : '▶ Play'}</button>
    <button id="edSave">💾 Save</button>
    <button id="edExport">⤓ Export JSON</button>
    <button id="edDelete">🗑</button>
    <button id="edExit">✕ Exit</button>
    <small style="color:#9bc">WASD/arrows move · R/F up/down · Shift fast · wheel speed · drag look · P play/pause · Esc exit</small>`;
  for (const b of bar.querySelectorAll('button')) b.style.cssText = BTN_CSS;
  $('edPlay').onclick = togglePlay;
  $('edSave').onclick = saveCurrent;
  $('edExport').onclick = exportCurrent;
  $('edExit').onclick = exitEditor;
  $('edDelete').onclick = () => {
    if (!confirm(`Delete "${ed.cfg.name}" for good?`)) return;
    const list = loadCustomRivers();
    list.splice(ed.idx, 1);
    saveCustomRivers(list);
    exitEditor();
  };
}
function togglePlay() {
  ed.playing = !ed.playing;
  renderToolbar();
}
function saveCurrent() {
  const list = loadCustomRivers();
  list[ed.idx] = ed.cfg;
  saveCustomRivers(list);
}
function exportCurrent() {
  const blob = new Blob([JSON.stringify(ed.cfg, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ed.cfg.name.replace(/\s+/g, '_') + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- input (capture phase, so the game's bindings never see editor keys) ----------
let inputInit = false;
function initInput() {
  if (inputInit) return;
  inputInit = true;
  addEventListener('keydown', e => {
    if (!ed.active) return;
    if (e.code === 'Escape') { exitEditor(); }
    else if (e.code === 'KeyP' && !e.repeat) { togglePlay(); }
    else { ed.keys[e.code] = true; }
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  addEventListener('keyup', e => {
    if (!ed.active) return;
    ed.keys[e.code] = false;
    e.stopImmediatePropagation();
  }, true);
  const cvs = $('c');
  let drag = false, lx = 0, ly = 0;
  cvs.addEventListener('pointerdown', e => {
    if (!ed.active) return;
    drag = true; lx = e.clientX; ly = e.clientY;
    try { cvs.setPointerCapture(e.pointerId); } catch (_) {}
  });
  cvs.addEventListener('pointermove', e => {
    if (!ed.active || !drag) return;
    ed.yaw -= (e.clientX - lx) * 0.005;
    ed.pitch = clamp(ed.pitch - (e.clientY - ly) * 0.005, -1.5, 1.5);
    lx = e.clientX; ly = e.clientY;
  });
  const up = () => { drag = false; };
  cvs.addEventListener('pointerup', up);
  cvs.addEventListener('pointercancel', up);
  addEventListener('wheel', e => {
    if (ed.active) ed.speed = clamp(ed.speed * (e.deltaY > 0 ? 0.9 : 1.12), 2, 120);
  }, { passive: true });
}

function moveCam(dt) {
  const k = ed.keys, sp = ed.speed * ((k.ShiftLeft || k.ShiftRight) ? 3 : 1) * dt;
  const cp = Math.cos(ed.pitch), sy = Math.sin(ed.yaw), cy = Math.cos(ed.yaw);
  const fwd = [sy * cp, Math.sin(ed.pitch), cy * cp], right = [-cy, 0, sy];
  const m = [0, 0, 0];
  const add = (v, s) => { m[0] += v[0] * s; m[1] += v[1] * s; m[2] += v[2] * s; };
  if (k.KeyW || k.ArrowUp) add(fwd, 1);
  if (k.KeyS || k.ArrowDown) add(fwd, -1);
  if (k.KeyD || k.ArrowRight) add(right, 1);
  if (k.KeyA || k.ArrowLeft) add(right, -1);
  if (k.KeyR || k.Space) m[1] += 1;
  if (k.KeyF || k.ControlLeft) m[1] -= 1;
  ed.pos[0] = clamp(ed.pos[0] + m[0] * sp, 1, W * dx - 1);
  ed.pos[1] = clamp(ed.pos[1] + m[1] * sp, -5, 250);
  ed.pos[2] = clamp(ed.pos[2] + m[2] * sp, 1, L * dx - 1);
}

// ---------- per-frame (called from main.js) ----------
export function editorFrame(dtRaw) {
  const dt = clamp(dtRaw, 0, 0.05);
  moveCam(dt);
  const cp = Math.cos(ed.pitch);
  cam.pos = ed.pos.slice();
  cam.look = [ed.pos[0] + Math.sin(ed.yaw) * cp, ed.pos[1] + Math.sin(ed.pitch), ed.pos[2] + Math.cos(ed.yaw) * cp];
  // the hidden kayak tracks the camera's z so the draw/compute/spawn windows follow the camera
  kayak.p = [-999, -500, ed.pos[2]];
  if (ed.playing) {
    S.simTime += dt;
    updateObstacles(dt);
  }
  updatePickups();            // every frame so instance buffers are valid; simTime frozen → static while paused
  writeObstacleInstances();
  writeCam();
  updateKayakInstances(dt);
  const { cj0, rows } = computeWindow(ed.pos[2]);
  writeSimUniforms(S.simTime, inflowQ(S.simTime), cj0);
  writeParticleUniforms(ed.playing ? dt : 0);
  const enc = gpu.device.createCommandEncoder();
  let bandReq = null;
  if (ed.playing) {
    encodeWaterSim(enc, rows);
    encodeParticleSim(enc);
    bandReq = encodeBandCopy(enc, ed.pos[2]);
  }
  encodeRenderPass(enc);
  gpu.device.queue.submit([enc.finish()]);
  finishBandCopy(bandReq);
}