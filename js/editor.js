// Level editor: fly camera, play/pause (step 1) plus the editing layer (step 2) — a side panel of
// controls (editorPanel.js), drag gestures for width/meander, click-to-place feature markers
// (editorFeatures.js) and live overlay gizmos (editorOverlay.js). Edits save (debounced) and
// trigger a debounced rebuild, so in pause mode the static river follows changes near real-time.
import { PARTS } from './config/index.js';
import { v3, clamp, mat4Perspective, mat4LookAt, mat4Mul, mat4Invert } from './math.js';
import { validateRiverConfig, channelProfile, nearestChan } from './river.js';
import { S, TIME_SCALE } from './state.js';
import { $ } from './platform.js';
import { gpu } from './gpu.js';
import { band, terrainH, rowOf } from './sampling.js';
import { kayak } from './kayak.js';
import { cam, writeCam } from './render.js';
import { sparks } from './effects.js';
import { MeshBuilder, addSphere, addCylinder, addRingTube } from './meshes.js';
import { resetPickupsForAttempt, updatePickups } from './pickups.js';
import { placeObstacles, updateObstacles, writeObstacleInstances } from './obstacles.js';
import { placeLandslides } from './landslides.js';
import { loadRiver, uploadInitialWater } from './run.js';
import { showMenu } from './ui.js';
import { getCustom, saveCustom, customRiverR, checkCustomR, exportJson, downloadJson } from './customRivers.js';
import { FEATURES, FEATURE_ORDER } from './editorFeatures.js';
import { renderPanel } from './editorPanel.js';
import { setOverlayMesh, clearOverlay } from './editorOverlay.js';
import { W, L, dx } from './quality.js';

const DBG_VIEWS = ['normal', 'speed', 'foam', 'turbulence k', 'Froude'];
const MODES = ['view', 'width', 'meander', 'features'];
const MODE_LABEL = { view: '🎥 View', width: '↔ Width', meander: '〰 Meander', features: '📍 Features' };
const MODE_HELP = {
  view: 'drag — look · W A S D — move · Q / E — down / up · Shift — fast · wheel — fly speed',
  width: 'left-drag on the river: ← → half width · ↑ ↓ width variation · right-drag — look',
  meander: 'left-drag: ← → amplitude · ↑ ↓ wavelength of the selected component · right-drag — look',
  features: 'click — select / place armed feature · drag marker — move · Del — delete · right-drag — look',
};
const FLY = { look: 0.005, keyTurn: 1.6, boost: 4, minSpeed: 2, maxSpeed: 250, minClear: 0.4 };
const FLY_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const MODE_KEYS = { Digit1: 'view', Digit2: 'width', Digit3: 'meander', Digit4: 'features' };

const ed = { entry: null, playing: false, infoT: 0, mode: 'view', armed: null, sel: null, meanderSel: 0, profile: null, drag: null };
const keys = new Set();
let rebuildTimer = 0, saveTimer = 0;
const isOpenEd = () => S.gameState === 'editor' && !!ed.entry;

// ---------- fly camera ----------
const flyDir = fc => {
  const cp = Math.cos(fc.pitch);
  return [Math.sin(fc.yaw) * cp, Math.sin(fc.pitch), Math.cos(fc.yaw) * cp];
};
function updateFly(dt) {
  const fc = S.flyCam, k = c => (keys.has(c) ? 1 : 0);
  fc.yaw += (k('ArrowLeft') - k('ArrowRight')) * FLY.keyTurn * dt;
  fc.pitch = clamp(fc.pitch + (k('ArrowUp') - k('ArrowDown')) * FLY.keyTurn * dt, -1.5, 1.5);
  const dir = flyDir(fc), right = [-Math.cos(fc.yaw), 0, Math.sin(fc.yaw)];
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
  const row = S.river.rows[rowOf(10)][0];   // default: over the put-in, looking downstream
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

// ---------- change pipeline: live overlay, debounced save + rebuild ----------
function setStatus(text, err = false) {
  const s = $('edStatus');
  if (!s) return;
  s.textContent = text;
  s.classList.toggle('err', err);
}
function refreshProfile() {
  try { ed.profile = channelProfile(customRiverR(ed.entry)); }
  catch (_) { ed.profile = null; }   // mid-edit nonsense → no overlay until it's valid again
}
function dirtySave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (ed.entry) saveCustom(ed.entry); }, 800);
}
function flushSave() {
  clearTimeout(saveTimer);
  if (ed.entry) saveCustom(ed.entry);
}
function dirtyRebuild(delay = 350) {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => rebuild(false), delay);
}
// the one entry point every edit goes through (panel controls, drags, marker moves)
function apiChange(opts = {}) {
  refreshProfile();
  refreshOverlayMesh();
  dirtySave();
  if (opts.rebuild !== false) dirtyRebuild();
  if (opts.panel) refreshPanel();
}

// ---------- building the river ----------
function resetWorld() {
  uploadInitialWater();
  band.ready = false;
  S.simTime = 0;
  placeObstacles();
  placeLandslides();
}
function rebuild(resetCam) {
  if (!isOpenEd()) return false;
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
  if (resetCam || !prev) setView(ed.entry.view);
  refreshProfile();
  refreshOverlayMesh();
  setStatus(`built in ${(performance.now() - t0).toFixed(0)} ms`);
  return true;
}
export function scheduleRebuild(resetCam = false) {
  setStatus('Building river…');
  setTimeout(() => rebuild(resetCam), 30);
}

// ---------- picking: mouse → a point on the river surface ----------
const surfY = (x, z) => Math.max(terrainH(x, z), nearestChan(S.river.rows[rowOf(z)], x).eta);
function unprojectRay(e) {
  const nx = (e.clientX / innerWidth) * 2 - 1, ny = 1 - (e.clientY / innerHeight) * 2;
  const proj = mat4Perspective(60 * Math.PI / 180, gpu.canvas.width / gpu.canvas.height, 0.3, 900);
  const ivp = mat4Invert(mat4Mul(proj, mat4LookAt(cam.pos, cam.look, [0, 1, 0])));
  const tx = zc => {   // full homogeneous transform (mat4Transform skips the /w)
    const m = ivp, w = m[3] * nx + m[7] * ny + m[11] * zc + m[15];
    return [(m[0] * nx + m[4] * ny + m[8] * zc + m[12]) / w,
            (m[1] * nx + m[5] * ny + m[9] * zc + m[13]) / w,
            (m[2] * nx + m[6] * ny + m[10] * zc + m[14]) / w];
  };
  const p0 = tx(0);
  return { p0, dir: v3.norm(v3.sub(tx(1), p0)) };
}
// march the ray 1 m at a time against the terrain/nominal-water surface, then bisect the crossing
function pickGround(e) {
  if (!S.river) return null;
  const { p0, dir } = unprojectRay(e);
  if (p0[1] - surfY(p0[0], p0[2]) <= 0) return null;
  let tPrev = 0;
  for (let t = 1; t <= 500; t++) {
    const p = v3.add(p0, v3.scale(dir, t));
    if (p[1] - surfY(p[0], p[2]) <= 0) {
      let lo = tPrev, hi = t;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2, pm = v3.add(p0, v3.scale(dir, mid));
        if (pm[1] - surfY(pm[0], pm[2]) > 0) lo = mid; else hi = mid;
      }
      const ph = v3.add(p0, v3.scale(dir, (lo + hi) / 2));
      return { x: clamp(ph[0], 1, W * dx - 1), z: clamp(ph[2], 1, L * dx - 1) };
    }
    tPrev = t;
  }
  return null;
}

// ---------- feature markers ----------
function markerXZ(type, it) {
  const z = FEATURES[type].z(it);
  const x = type === 'vortex' ? it.x : ed.profile ? clamp(ed.profile.centerAt(z), 1, W * dx - 1) : W * dx / 2;
  return { x, z };
}
function allMarkers() {
  const out = [], cfg = ed.entry.config;
  for (const type of FEATURE_ORDER) {
    FEATURES[type].storage.items(cfg).forEach((it, i) => out.push({ type, i, it, ...markerXZ(type, it) }));
  }
  return out;
}
function markerAt(pt) {
  let best = null, bd = 6;   // 6 m pick radius
  for (const m of allMarkers()) {
    const d = Math.hypot(m.x - pt.x, m.z - pt.z);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}
const featureZMax = () => ((ed.profile ? ed.profile.finishZ : L * dx - 25) - 12);
function placeFeature(type, pt) {
  const F = FEATURES[type], cfg = ed.entry.config;
  const z = clamp(pt.z, 40, Math.max(41, featureZMax()));
  F.storage.insert(cfg, F.make(z, pt));
  ed.sel = { type, i: F.storage.items(cfg).length - 1 };
  ed.armed = null;
  apiChange({ panel: true });
  setStatus(`${F.label} placed at ${z.toFixed(0)} m`);
}
function deleteSelected() {
  if (!ed.sel || !ed.entry) return;
  const F = FEATURES[ed.sel.type];
  F.storage.remove(ed.entry.config, ed.sel.i);
  setStatus(`${F.label} deleted`);
  ed.sel = null;
  apiChange({ panel: true });
}

// ---------- overlay gizmos ----------
// a flat ribbon through pts (lifted above the surface), horizontal — reads as a line on the water
function addPath(mb, pts, w, col) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    let px = b[2] - a[2], pz = -(b[0] - a[0]);
    const l = Math.hypot(px, pz) || 1;
    px = px / l * w;
    pz = pz / l * w;
    mb.quad([a[0] - px, a[1], a[2] - pz], [a[0] + px, a[1], a[2] + pz],
            [b[0] + px, b[1], b[2] + pz], [b[0] - px, b[1], b[2] - pz], col);
  }
}
function linePts(xOf, z0, z1, step, lift) {
  const pts = [];
  for (let z = z0; z <= z1; z += step) {
    const x = clamp(xOf(z), 1, W * dx - 1);
    pts.push([x, surfY(x, z) + lift, z]);
  }
  return pts;
}
function refreshOverlayMesh() {
  if (!S.river || !ed.profile || ed.mode === 'view') return clearOverlay();
  const pr = ed.profile, mb = new MeshBuilder();
  const zEnd = Math.min(pr.finishZ, L * dx - 25);
  addPath(mb, linePts(pr.centerAt, 6, zEnd, 3, 0.3), 0.12, [1, 1, 1]);   // centreline
  if (ed.mode === 'width' || ed.mode === 'meander') {
    for (const s of [-1, 1]) addPath(mb, linePts(z => pr.centerAt(z) + s * pr.hwAt(z), 6, zEnd, 2, 0.3), 0.18, [1, 0.85, 0.2]);
  }
  if (ed.mode === 'features') {
    for (const m of allMarkers()) {
      const F = FEATURES[m.type], seld = ed.sel && ed.sel.type === m.type && ed.sel.i === m.i;
      const span = F.span && F.span(m.it);
      if (span) addPath(mb, linePts(pr.centerAt, Math.max(span[0], 2), Math.min(span[1], L * dx - 2), 3, 0.45), 0.5, F.color);
      const y = surfY(m.x, m.z);
      addCylinder(mb, [m.x, y, m.z], [m.x, y + 5, m.z], 0.12, 0.12, 6, F.color);
      const r = seld ? 1.0 : 0.65;
      addSphere(mb, [m.x, y + 5.4, m.z], [r, r, r], 5, 8, seld ? [1, 1, 1] : F.color);
      if (seld) addRingTube(mb, [m.x, y + 0.35, m.z], 2.2, 2.2, 0.14, 18, 6, [1, 1, 1]);
    }
  }
  setOverlayMesh(mb);
}

// ---------- modes / panel / toolbar ----------
function updateModeButtons() {
  for (const b of document.querySelectorAll('#editor .ed-modes button')) b.classList.toggle('on', b.dataset.mode === ed.mode);
  const h = $('edModeHelp');
  if (h) h.textContent = MODE_HELP[ed.mode];
}
function setMode(m) {
  if (ed.mode !== m) {
    ed.mode = m;
    if (m !== 'features') ed.armed = null;
    refreshOverlayMesh();
    refreshPanel();
  }
  updateModeButtons();
}
function refreshPanel() {
  const host = $('edPanel');
  if (!host || !ed.entry) return;
  renderPanel(host, {
    cfg: ed.entry.config, mode: ed.mode, sel: ed.sel, armed: ed.armed, meanderSel: ed.meanderSel,
    api: {
      change: apiChange,
      arm: type => {
        ed.armed = ed.armed === type ? null : type;
        if (ed.armed) setMode('features');
        setStatus(ed.armed ? `click the river to place a ${FEATURES[ed.armed].label.toLowerCase()} (Esc cancels)` : '');
        refreshPanel();
      },
      select: (type, i) => {
        ed.sel = { type, i };
        setMode('features');
        refreshOverlayMesh();
        refreshPanel();
      },
      del: deleteSelected,
      setMeanderSel: i => {
        ed.meanderSel = i;
        setMode('meander');
        refreshPanel();
      },
    },
  });
}
function renderPlayBtn() {
  const b = $('edPlay');
  if (!b) return;
  b.textContent = ed.playing ? '⏸ Pause' : '▶ Play';
  b.classList.toggle('on', ed.playing);
}
function togglePlay() {
  if (!S.river) return;
  ed.playing = !ed.playing;
  if (!ed.playing) gpu.device.queue.writeBuffer(gpu.partBuf, 0, new Float32Array(PARTS.count * 8));   // no frozen spray
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
      <span class="ed-modes">${MODES.map(m =>
        `<button data-mode="${m}" title="${MODE_HELP[m]} (${MODES.indexOf(m) + 1})">${MODE_LABEL[m]}</button>`).join('')}</span>
      <button id="edPlay" title="run / freeze the water simulation (P)"></button>
      <button id="edReset" title="water back to its starting state, obstacles re-seeded (R)">↺ Reset water</button>
      <button id="edView" title="debug water view (F1)">👁 ${DBG_VIEWS[S.dbgMode]}</button>
      <button id="edExport" title="download the config as a .json file">⬇ Export JSON</button>
      <button id="edCopy" title="copy the config JSON to the clipboard">📋 Copy JSON</button>
      <span id="edStatus"></span>
    </div>
    <div class="ed-panel" id="edPanel"></div>
    <div class="ed-info" id="edInfo"></div>
    <div class="ed-help"><span id="edModeHelp">${MODE_HELP[ed.mode]}</span><br>
      1–4 — modes · P — play / pause · R — reset water · F1 — debug view · Esc — menu</div>`;
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
  for (const b of el.querySelectorAll('.ed-modes button')) b.onclick = () => setMode(b.dataset.mode);
  renderPlayBtn();
  updateModeButtons();
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
  Object.assign(ed, { entry, playing: false, infoT: 0, mode: 'view', armed: null, sel: null, meanderSel: 0, drag: null });
  keys.clear();
  S.gameState = 'editor';
  S.paused = false;
  S.dbgMode = 0;
  S.simTime = 0;
  sparks.length = 0;
  document.body.classList.remove('inrun');
  document.body.classList.add('editing');
  for (const el of ['menu', 'lvl', 'msg', 'stam', 'loot', 'dbg', 'charsheet', 'store', 'howto']) $(el).style.display = 'none';
  refreshProfile();
  renderToolbar();
  refreshPanel();
  $('editor').style.display = 'block';
  S.river = null;   // never show the previous river under this one's toolbar
  clearOverlay();
  scheduleRebuild(true);
}
export function closeEditor() {
  if (S.gameState !== 'editor') return;
  clearTimeout(rebuildTimer);
  flushSave();
  saveView();
  clearOverlay();
  ed.playing = false;
  ed.drag = null;
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
    if (MODE_KEYS[e.code]) setMode(MODE_KEYS[e.code]);
    else if (e.code === 'Escape') {
      // narrowest thing first: armed placement → selection → the editor itself
      if (ed.armed) { ed.armed = null; setStatus(''); refreshPanel(); }
      else if (ed.sel) { ed.sel = null; refreshOverlayMesh(); refreshPanel(); }
      else closeEditor();
    } else if (e.code === 'KeyP') togglePlay();
    else if (e.code === 'KeyR') resetWater();
    else if (e.code === 'Delete' || e.code === 'Backspace') deleteSelected();
    else if (e.code === 'F1') { cycleView(); e.preventDefault(); }
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
}
function bindPointer() {
  const c = $('c');
  c.addEventListener('pointerdown', e => {
    if (S.gameState !== 'editor' || ed.drag) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // keys back to the camera
    try { c.setPointerCapture(e.pointerId); } catch (_) {}
    // right button (or View mode) always looks; the left button is the mode's tool
    if (e.button === 2 || ed.mode === 'view' || !S.river) {
      ed.drag = { kind: 'look', id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    const cfg = ed.entry.config;
    if (ed.mode === 'width') {
      ed.drag = { kind: 'width', id: e.pointerId, x: e.clientX, y: e.clientY, hw: cfg.halfW, wv: cfg.widthVar };
    } else if (ed.mode === 'meander') {
      cfg.meander = cfg.meander || [];
      if (!cfg.meander.length) cfg.meander.push([10, 150]);
      ed.meanderSel = clamp(ed.meanderSel, 0, cfg.meander.length - 1);
      const cmp = cfg.meander[ed.meanderSel];
      ed.drag = { kind: 'meander', id: e.pointerId, x: e.clientX, y: e.clientY, a: cmp[0], lam: cmp[1], cmp };
    } else if (ed.mode === 'features') {
      const pt = pickGround(e);
      if (!pt) return;
      const hit = markerAt(pt);
      if (hit) {
        ed.sel = { type: hit.type, i: hit.i };
        ed.drag = { kind: 'marker', id: e.pointerId };
        refreshOverlayMesh();
        refreshPanel();
      } else if (ed.armed) {
        placeFeature(ed.armed, pt);
      } else if (ed.sel) {
        ed.sel = null;
        refreshOverlayMesh();
        refreshPanel();
      }
    }
  });
  c.addEventListener('pointermove', e => {
    if (!ed.drag || e.pointerId !== ed.drag.id || S.gameState !== 'editor') return;
    const d = ed.drag, dxp = e.clientX - d.x, dyp = e.clientY - d.y;
    if (d.kind === 'look') {
      const fc = S.flyCam;
      fc.yaw -= (e.clientX - d.x) * FLY.look;
      fc.pitch = clamp(fc.pitch - (e.clientY - d.y) * FLY.look, -1.5, 1.5);
      d.x = e.clientX;
      d.y = e.clientY;
      return;
    }
    const cfg = ed.entry.config;
    if (d.kind === 'width') {
      cfg.halfW = clamp(+(d.hw + dxp * 0.03).toFixed(2), 2.5, 28);
      cfg.widthVar = clamp(+(d.wv - dyp * 0.004).toFixed(3), 0, 0.95);
      setStatus(`half width ${cfg.halfW.toFixed(1)} m · variation ${cfg.widthVar.toFixed(2)}`);
      apiChange();
    } else if (d.kind === 'meander') {
      d.cmp[0] = clamp(+(d.a + dxp * 0.05).toFixed(1), 0, 40);
      d.cmp[1] = clamp(Math.round(d.lam * Math.exp(-dyp * 0.004)), 20, 400);
      setStatus(`meander ${ed.meanderSel + 1}: amplitude ${d.cmp[0]} m · wavelength ${d.cmp[1]} m`);
      apiChange();
    } else if (d.kind === 'marker' && ed.sel) {
      const pt = pickGround(e);
      if (!pt) return;
      const F = FEATURES[ed.sel.type], it = F.storage.items(cfg)[ed.sel.i];
      if (!it) return;
      F.setZ(it, clamp(pt.z, 40, Math.max(41, featureZMax())), pt);
      setStatus(`${F.label} → ${F.z(it).toFixed(0)} m`);
      apiChange();
    }
  });
  const end = e => {
    if (!ed.drag || e.pointerId !== ed.drag.id) return;
    const k = ed.drag.kind;
    ed.drag = null;
    if (k !== 'look' && S.gameState === 'editor') {   // commit: save now, sync the panel's sliders
      flushSave();
      refreshPanel();
    }
  };
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
  addEventListener('pagehide', () => {
    if (S.gameState === 'editor') {
      flushSave();
      saveView();
    }
  });
}