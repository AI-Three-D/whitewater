// Level editor for custom rivers (debug only): free-fly camera, play/pause of the water sim,
// rename, JSON export. Opened from the custom-river cards (ui.js, via initUi handlers). While
// S.gameState === 'editor', main.js calls editorUpdate() every frame and renders the result.
import { PARTS } from './config/index.js';
import { v3, clamp } from './math.js';
import { validateRiverConfig } from './river.js';
import { S, TIME_SCALE } from './state.js';
import { $ } from './platform.js';
import { gpu } from './gpu.js';
import { band, terrainH, rowOf } from './sampling.js';
import { kayak } from './kayak.js';
import { cam, writeCam } from './render.js';
import { sparks } from './effects.js';
import { resetPickupsForAttempt, updatePickups } from './pickups.js';
import { placeObstacles, updateObstacles, writeObstacleInstances } from './obstacles.js';
import { placeLandslides } from './landslides.js';
import { loadRiver, uploadInitialWater } from './run.js';
import { showMenu } from './ui.js';
import { getCustom, saveCustom, customRiverR, checkCustomR, exportJson, downloadJson } from './customRivers.js';
import { W, L, dx } from './quality.js';

const DBG_VIEWS = ['normal', 'speed', 'foam', 'turbulence k', 'Froude'];
const FLY = { look: 0.005, keyTurn: 1.6, boost: 4, minSpeed: 2, maxSpeed: 250, minClear: 0.4 };
const FLY_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

const ed = { entry: null, playing: false, infoT: 0 };
const keys = new Set();
const isOpen = () => S.gameState === 'editor' && !!ed.entry;

// ---------- fly camera ----------
const flyDir = fc => {
  const cp = Math.cos(fc.pitch);
  return [Math.sin(fc.yaw) * cp, Math.sin(fc.pitch), Math.cos(fc.yaw) * cp];
};

function updateFly(dt) {
  const fc = S.flyCam, k = c => (keys.has(c) ? 1 : 0);
  fc.yaw += (k('ArrowLeft') - k('ArrowRight')) * FLY.keyTurn * dt;
  fc.pitch = clamp(fc.pitch + (k('ArrowUp') - k('ArrowDown')) * FLY.keyTurn * dt, -1.5, 1.5);
  const dir = flyDir(fc), right = [-Math.cos(fc.yaw), 0, Math.sin(fc.yaw)];   // screen right
  const fwd = k('KeyW') - k('KeyS'), strafe = k('KeyD') - k('KeyA'), vert = k('KeyE') - k('KeyQ');
  const step = fc.speed * (k('ShiftLeft') || k('ShiftRight') ? FLY.boost : 1) * dt;
  for (let a = 0; a < 3; a++) fc.pos[a] += (dir[a] * fwd + right[a] * strafe) * step;
  fc.pos[1] += vert * step;
  fc.pos[1] = Math.max(fc.pos[1], terrainH(fc.pos[0], fc.pos[2]) + FLY.minClear);
  cam.pos = fc.pos.slice();
  cam.look = v3.add(fc.pos, dir);
  cam.dir = dir;
}

function setView(v) {
  const fc = S.flyCam;
  if (v && Array.isArray(v.pos) && v.pos.length === 3 && v.pos.every(Number.isFinite)) {
    fc.pos = v.pos.slice();
    fc.yaw = Number.isFinite(v.yaw) ? v.yaw : 0;
    fc.pitch = Number.isFinite(v.pitch) ? clamp(v.pitch, -1.5, 1.5) : -0.35;
    fc.speed = Number.isFinite(v.speed) ? clamp(v.speed, FLY.minSpeed, FLY.maxSpeed) : 15;
    return;
  }
  // default: hovering over the put-in, looking downstream
  const row = S.river.rows[rowOf(10)][0];
  fc.pos = [row.c, row.eta + 9, 0];
  fc.yaw = 0;
  fc.pitch = -0.35;
  fc.speed = 15;
}

function saveView() {
  if (!ed.entry) return;
  const fc = S.flyCam;
  ed.entry.view = { pos: fc.pos.map(v => +v.toFixed(2)), yaw: +fc.yaw.toFixed(4), pitch: +fc.pitch.toFixed(4), speed: +fc.speed.toFixed(1) };
  saveCustom(ed.entry, { touch: false });
}

// ---------- building the river ----------
function setStatus(text, err = false) {
  const s = $('edStatus');
  if (!s) return;
  s.textContent = text;
  s.classList.toggle('err', err);
}

// water back to the analytic starting state, obstacles/landslides re-seeded (boulders that already
// carved into the bed stay carved until the next rebuild)
function resetWorld() {
  uploadInitialWater();
  band.ready = false;
  S.simTime = 0;
  placeObstacles();
  placeLandslides();
}

// regenerates everything from ed.entry.config; on a bad config the last good river stays on screen
function rebuild(resetView) {
  if (!isOpen()) return false;
  const t0 = performance.now(), prev = S.river;
  const R = customRiverR(ed.entry);
  try {
    checkCustomR(R);
    validateRiverConfig(R);
    loadRiver(R);
  } catch (e) {
    if (S.river !== prev) S.river = null;   // half-loaded — don't draw a mismatched scene
    setStatus('⚠ ' + (e.message || String(e)), true);
    return false;
  }
  kayak.reset();                 // obstacles/landslides are seeded relative to the boat at the put-in
  resetPickupsForAttempt();
  S.river.pickups.map = [];      // the hidden map belongs to the profile, not to a level
  resetWorld();
  if (resetView || !prev) setView(ed.entry.view);
  setStatus(`built in ${(performance.now() - t0).toFixed(0)} ms`);
  return true;
}

// deferred a tick so the "Building…" status paints before the (synchronous) generation blocks
export function scheduleRebuild(resetView = false) {
  setStatus('Building river…');
  setTimeout(() => rebuild(resetView), 30);
}

// ---------- actions ----------
function renderPlayBtn() {
  const b = $('edPlay');
  if (!b) return;
  b.textContent = ed.playing ? '⏸ Pause' : '▶ Play';
  b.classList.toggle('on', ed.playing);
}

function togglePlay() {
  if (!S.river) return;
  ed.playing = !ed.playing;
  // frozen spray would hang in mid-air, so it's cleared on pause
  if (!ed.playing) gpu.device.queue.writeBuffer(gpu.partBuf, 0, new Float32Array(PARTS.count * 8));
  renderPlayBtn();
  setStatus(ed.playing ? 'simulating' : 'paused — static river');
}

function resetWater() {
  if (!S.river) return;
  resetWorld();
  setStatus('water reset to its starting state');
}

function cycleView() {
  S.dbgMode = (S.dbgMode + 1) % DBG_VIEWS.length;
  const b = $('edView');
  if (b) b.textContent = `👁 ${DBG_VIEWS[S.dbgMode]}`;
}

function copyJson() {
  if (!navigator.clipboard) return setStatus('clipboard not available — use Export', true);
  navigator.clipboard.writeText(exportJson(ed.entry))
    .then(() => setStatus('JSON copied to the clipboard'))
    .catch(() => setStatus('copy failed — use Export', true));
}

function renderToolbar() {
  const el = $('editor');
  el.innerHTML = `<div class="ed-bar">
      <button id="edBack" title="save and return to the river menu (Esc)">← Menu</button>
      <input id="edName" maxlength="60" spellcheck="false" title="river name">
      <button id="edPlay" title="run / freeze the water simulation (P)"></button>
      <button id="edReset" title="water back to its starting state, obstacles re-seeded (R)">↺ Reset water</button>
      <button id="edView" title="debug water view (F1)">👁 ${DBG_VIEWS[S.dbgMode]}</button>
      <button id="edExport" title="download the config as a .json file">⬇ Export JSON</button>
      <button id="edCopy" title="copy the config JSON to the clipboard">📋 Copy JSON</button>
      <span id="edStatus"></span>
    </div>
    <div class="ed-info" id="edInfo"></div>
    <div class="ed-help">drag — look · W A S D — move · Q / E — down / up · Shift — fast · wheel — fly speed<br>
      arrows — turn · P — play / pause · R — reset water · F1 — debug view · Esc — menu</div>`;
  const name = $('edName');
  name.value = ed.entry.config.name;
  name.onchange = () => {
    const v = name.value.trim();
    if (!v) { name.value = ed.entry.config.name; return; }
    ed.entry.config.name = v;
    if (S.river) S.river.R.name = v;
    saveCustom(ed.entry);
    setStatus('renamed · saved');
  };
  $('edBack').onclick = closeEditor;
  $('edPlay').onclick = togglePlay;
  $('edReset').onclick = resetWater;
  $('edView').onclick = cycleView;
  $('edExport').onclick = () => { downloadJson(ed.entry); setStatus('exported'); };
  $('edCopy').onclick = copyJson;
  renderPlayBtn();
}

function updateInfo(dt) {
  ed.infoT -= dt;
  if (ed.infoT > 0) return;
  ed.infoT = 0.2;
  const fc = S.flyCam, el = $('edInfo');
  if (!el) return;
  el.textContent =
    `cam  x ${fc.pos[0].toFixed(1)}  y ${fc.pos[1].toFixed(1)}  z ${fc.pos[2].toFixed(1)} m` +
    `   (take-out at ${S.river.finishZ.toFixed(0)} m · world ${(W * dx).toFixed(0)} × ${(L * dx).toFixed(0)} m)\n` +
    `yaw ${(fc.yaw * 57.3).toFixed(0)}°  pitch ${(fc.pitch * 57.3).toFixed(0)}°  fly speed ${fc.speed.toFixed(0)} m/s\n` +
    `${ed.playing ? '▶ simulating' : '⏸ static'} · sim t ${S.simTime.toFixed(1)} s · view ${DBG_VIEWS[S.dbgMode]} · ${S.fps.toFixed(0)} fps`;
}

// ---------- open / close ----------
export function openEditor(id) {
  if (S.warmingUp) return;
  const entry = getCustom(id);
  if (!entry) return;
  ed.entry = entry;
  ed.playing = false;
  ed.infoT = 0;
  keys.clear();
  S.gameState = 'editor';
  S.paused = false;
  S.dbgMode = 0;
  S.simTime = 0;
  sparks.length = 0;
  document.body.classList.remove('inrun');
  document.body.classList.add('editing');
  for (const el of ['menu', 'lvl', 'msg', 'stam', 'loot', 'dbg', 'charsheet', 'store', 'howto']) $(el).style.display = 'none';
  renderToolbar();
  $('editor').style.display = 'block';
  S.river = null;   // never show the previous river under this one's toolbar
  scheduleRebuild(true);
}

export function closeEditor() {
  if (S.gameState !== 'editor') return;
  saveView();
  ed.playing = false;
  keys.clear();
  S.dbgMode = 0;
  showMenu();   // also hides #editor and drops body.editing
}

// per frame while editing; returns whether the water sim should be dispatched this frame
export function editorUpdate(dtReal) {
  updateFly(dtReal);
  if (ed.playing) {
    S.simTime += dtReal * TIME_SCALE;   // same pacing as stepPhysics in a run
    updateObstacles(dtReal);
  }
  writeObstacleInstances();
  updatePickups();   // editor mode: static display, no fade or collection (see pickups.js)
  writeCam();
  updateInfo(dtReal);
  return ed.playing;
}

// ---------- input ----------
const isTyping = e => e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);

function bindKeys() {
  addEventListener('keydown', e => {
    if (S.gameState !== 'editor') return;
    if (isTyping(e)) {
      if (e.code === 'Escape' || e.code === 'Enter') e.target.blur();
      return;
    }
    if (FLY_KEYS.has(e.code)) {
      keys.add(e.code);
      e.preventDefault();
    }
    if (e.repeat) return;
    if (e.code === 'Escape') closeEditor();
    else if (e.code === 'KeyP') togglePlay();
    else if (e.code === 'KeyR') resetWater();
    else if (e.code === 'F1') { cycleView(); e.preventDefault(); }
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
}

function bindPointer() {
  const c = $('c');
  let drag = null;
  c.addEventListener('pointerdown', e => {
    if (S.gameState !== 'editor') return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // keys back to the camera
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { c.setPointerCapture(e.pointerId); } catch (_) {}
  });
  c.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id || S.gameState !== 'editor') return;
    const fc = S.flyCam, ddx = e.clientX - drag.x, ddy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    fc.yaw -= ddx * FLY.look;
    fc.pitch = clamp(fc.pitch - ddy * FLY.look, -1.5, 1.5);
  });
  const end = e => { if (drag && e.pointerId === drag.id) drag = null; };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  c.addEventListener('contextmenu', e => { if (S.gameState === 'editor') e.preventDefault(); });
  c.addEventListener('wheel', e => {
    if (S.gameState !== 'editor') return;
    e.preventDefault();
    S.flyCam.speed = clamp(S.flyCam.speed * Math.exp(-e.deltaY * 0.0014), FLY.minSpeed, FLY.maxSpeed);
  }, { passive: false });
}

export function initEditor() {
  bindKeys();
  bindPointer();
  // a reload or closed tab still keeps the camera where it was
  addEventListener('pagehide', () => { if (S.gameState === 'editor') saveView(); });
}