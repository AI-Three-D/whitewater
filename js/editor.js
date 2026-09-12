// Level editor: fly camera, play/pause (step 1) plus the editing layer (step 2) — a side panel of
// controls (editorPanel.js), drag gestures for width/meander, click-to-place feature markers
// (editorFeatures.js) and live overlay gizmos (editorOverlay.js). Edits save (debounced) and
// trigger a debounced rebuild, so in pause mode the static river follows changes near real-time.
import { PARTS, PUTIN, CRAFTS, ITEMS } from './config/index.js';
import { v3, clamp, mat4Perspective, mat4LookAt, mat4Mul, mat4Invert } from './math.js';
import { validateRiverConfig, channelProfile, nearestChan } from './river.js';
import { S, TIME_SCALE, resetRunCounters } from './state.js';
import { $ } from './platform.js';
import { gpu } from './gpu.js';
import { band, terrainH, rowOf } from './sampling.js';
import { kayak, craftKayakParams } from './kayak.js';
import { cam, writeCam } from './render.js';
import { sparks } from './effects.js';
import { MeshBuilder, addSphere, addCylinder, addRingTube } from './meshes.js';
import { resetPickupsForAttempt, updatePickups } from './pickups.js';
import { placeObstacles, updateObstacles, writeObstacleInstances } from './obstacles.js';
import { placeLandslides } from './landslides.js';
import { loadRiver, uploadInitialWater } from './run.js';
import { showMenu } from './ui.js';
import { craftOf, newProfile, suspendSave } from './progression.js';
import { runWarmup } from './sim.js';
import { getCustom, saveCustom, customRiverR, checkCustomR, exportJson, downloadJson } from './customRivers.js';
import { FEATURES, FEATURE_ORDER } from './editorFeatures.js';
import { renderPanel } from './editorPanel.js';
import { setOverlayMesh, clearOverlay } from './editorOverlay.js';
import { W, L, dx } from './quality.js';

const DBG_VIEWS = ['normal', 'speed', 'foam', 'turbulence k', 'Froude'];
const MODES = ['view', 'width', 'meander', 'features', 'test'];
const MODE_LABEL = { view: '🎥 View', width: '↔ Width', meander: '〰 Meander', features: '📍 Features', test: '🛶 Test' };
const MODE_HELP = {
  view: 'drag — look · W A S D — move · Q / E — down / up · Shift — fast · wheel — fly speed',
  width: 'left-drag on the river: ← → half width · ↑ ↓ width variation · right-drag — look',
  meander: 'left-drag: ← → amplitude · ↑ ↓ wavelength of the selected component · right-drag — look',
  features: 'click — select / place armed feature · drag marker — move · Del — delete · right-drag — look',
  test: 'click the river to spawn the chosen boat there and start a real run · right-drag — look',
};
const FLY = { look: 0.005, keyTurn: 1.6, boost: 4, minSpeed: 2, maxSpeed: 250, minClear: 0.4 };
const FLY_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const MODE_KEYS = { Digit1: 'view', Digit2: 'width', Digit3: 'meander', Digit4: 'features', Digit5: 'test' };

const ed = {
  invalid: null, entry: null, playing: false, infoT: 0, mode: 'view', armed: null, sel: null, meanderSel: 0, profile: null, drag: null, alert: null,
  panelHidden: false,
  // test-run panel settings (session-only — not part of the river config, never saved with it)
  test: { craft: 'classic', skill: 5, stamina: 5, god: false },
  testSpawn: null, savedProfile: null,
};
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
// a banner under the toolbar for a broken/degraded build — the corner status text is too easy to
// miss while dragging, and a failed rebuild otherwise just freezes on the last good frame in silence
const BRIDGE_ARRAY_TYPE = { landBridges: 'landBridge', builtBridges: 'builtBridge' };
const locateFromMessage = msg => {
  const m = /(\w+)\[(\d+)\]/.exec(msg), type = m && BRIDGE_ARRAY_TYPE[m[1]];
  return type ? { type, i: +m[2] } : null;
};
function renderAlert() {
  const el = $('edAlert');
  if (!el) return;
  if (!ed.alert) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const { text, warn, locate } = ed.alert;
  el.className = 'ed-alert' + (warn ? ' warn' : '');
  el.innerHTML = `<span>${warn ? '⚠' : '🛑'} ${text.replace(/[&<]/g, c => (c === '&' ? '&amp;' : '&lt;'))}</span>` +
    (locate ? '<button id="edLocate">🔍 show me</button>' : '');
  el.style.display = 'flex';
  if (locate) {
    $('edLocate').onclick = () => {
      ed.sel = locate;
      setMode('features');
      refreshOverlayMesh();
      refreshPanel();
    };
  }
}
function setAlert(text, opts = {}) {
  ed.alert = text ? { text, warn: !!opts.warn, locate: opts.locate || null } : null;
  renderAlert();
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
  ed.invalid = null;
  let buildR = R, error = null;
  try {
    checkCustomR(R);
    validateRiverConfig(R);
  } catch (e) {
    error = e.message || String(e);
    const deg = degradeConfig(R);   // checkCustomR failures aren't feature-local → deg is null
    if (deg) { buildR = deg.R; ed.invalid = deg; } else buildR = null;
  }
  if (buildR) {
    try { loadRiver(buildR); }
    catch (e) { error = e.message || String(e); buildR = null; }
  }
  if (!buildR) {
    if (S.river !== prev) S.river = null;   // half-loaded — don't draw a mismatched scene
    clearOverlay();
    setStatus('⚠ ' + error, true);
    setAlert(error, { locate: locateFromMessage(error) });
    return false;
  }
  kayak.reset();
  resetPickupsForAttempt();
  S.river.pickups.map = [];
  resetWorld();
  if (resetCam || !prev) setView(ed.entry.view);
  refreshProfile();
  refreshOverlayMesh();
  if (error) {
    setStatus('⚠ ' + error, true);
    setAlert(error + '\nThe invalid feature was left out of the preview — its marker is shown in red. Drag it to a valid spot or delete it.',
      { locate: locateFromMessage(error) });
  } else if (S.river.warnings && S.river.warnings.length) {
    setStatus(`built in ${(performance.now() - t0).toFixed(0)} ms · ⚠ ${S.river.warnings[0]}`);
    setAlert(S.river.warnings.join('\n'), { warn: true });
  } else {
    setStatus(`built in ${(performance.now() - t0).toFixed(0)} ms`);
    setAlert(null);
  }
  return true;
}
export function scheduleRebuild(resetCam = false) {
  setStatus('Building river…');
  setTimeout(() => rebuild(resetCam), 30);
}

// ---------- test run: a real, physics-driven run from any point, without touching the save ----------
// a synthetic profile, full inventory every time — starts fresh from the character's own base
// traits, then applies the panel's skill/stamina/craft sliders on top
function testProfile() {
  const p = newProfile(S.profile.charId);
  p.skill = ed.test.skill;
  p.stamina = ed.test.stamina;
  p.crafts = Object.keys(CRAFTS);   // every boat unlocked for testing, regardless of what's owned
  p.craft = ed.test.craft;
  p.inventory = Object.fromEntries(Object.keys(ITEMS).map(id => [id, ITEMS[id].maxStack]));
  return p;
}
async function startTestRun(pt) {
  if (!S.river || !ed.entry) return;
  if (S.gameState === 'testWarmup') return;   // a previous attempt is still settling (see issue 3)
  clearTimeout(rebuildTimer);
  clearTimeout(saveTimer);
  ed.testSpawn = pt;
  // first entry only — on a retry S.profile is already the synthetic test profile, and capturing
  // it here is exactly how a retry used to leak the test profile into the real save slot
  if (!ed.savedProfile) {
    ed.savedProfile = S.profile;
    ed.savedNoCapsize = S.debugNoCapsize;
    suspendSave(true);   // the synthetic profile below must never reach the real save slot
  }
  S.profile = testProfile();
  S.debugNoCapsize = ed.test.god;


  S.runCraft = craftOf(S.profile);
  S.effK = craftKayakParams(S.runCraft, S.profile);
  resetRunCounters();
  S.gameState = 'testWarmup';   // main.js draws nothing for this state — same idea as a real run's warmup
 
  S.testExit = exitTestRun;
  S.testRetry = () => startTestRun(ed.testSpawn);
  S.testAbort = testTeardown;
  S.onRunOver = handleTestRunOver;

  document.body.classList.remove('editing');
  document.body.classList.add('inrun');
  $('stam').style.display = 'block';
  $('loot').style.display = 'flex';
  $('editor').style.display = 'none';
  kayak.reset(pt);
  cam.reset();
  resetWorld();               // obstacles/landslides re-seed relative to the new spawn
  await runWarmup();
  if (S.gameState !== 'testWarmup') return;   // the tester backed out (Esc etc.) while this was settling
  S.simTime = 0;
  S.runTime = 0;
  S.paused = false;
  S.gameState = 'run';
}
function handleTestRunOver() {
  const btnMenu = $('btnMenu'), btnRetry = $('btnRetry');
  if (btnMenu) { btnMenu.textContent = '← Back to editor'; btnMenu.onclick = exitTestRun; }
  if (btnRetry) { btnRetry.textContent = '↻ Retry test'; btnRetry.onclick = () => { $('msg').style.display = 'none'; startTestRun(ed.testSpawn); }; }
}

function testTeardown() {
  if (!ed.savedProfile) return;
  suspendSave(false);
  S.profile = ed.savedProfile;
  ed.savedProfile = null;
  S.debugNoCapsize = ed.savedNoCapsize;
  S.testExit = null;
  S.testRetry = null;
  S.onRunOver = null;
  S.testAbort = null;
}

function exitTestRun() {
  testTeardown();
  S.paused = false;
  $('msg').style.display = 'none';
  document.body.classList.remove('inrun');
  document.body.classList.add('editing');
  $('editor').style.display = 'flex';
  S.gameState = 'editor';
  rebuild(false);
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

function degradeConfig(R) {
  const live = { landBridges: (R.landBridges || []).slice(), builtBridges: (R.builtBridges || []).slice() };
  const orig = { landBridges: live.landBridges.map((_, i) => i), builtBridges: live.builtBridges.map((_, i) => i) };
  const dropped = new Set();   // 'type:originalIndex' — drives the red markers
  let obstaclesDropped = false;
  const total = live.landBridges.length + live.builtBridges.length + 2;
  for (let guard = 0; guard <= total; guard++) {
    const cand = { ...R, landBridges: live.landBridges, builtBridges: live.builtBridges };
    if (obstaclesDropped) delete cand.obstacles;
    try {
      validateRiverConfig(cand);
      return { R: cand, dropped, obstaclesDropped };
    } catch (e) {
      const m = /(landBridges|builtBridges)\[(\d+)\]/.exec(e.message || '');
      if (m) {
        const key = m[1], i = +m[2];
        dropped.add(`${BRIDGE_ARRAY_TYPE[key]}:${orig[key][i]}`);
        live[key].splice(i, 1);
        orig[key].splice(i, 1);
      } else if (!obstaclesDropped && R.obstacles) {
        obstaclesDropped = true;   // the bridges × floating-obstacles conflict names no index
      } else {
        return null;
      }
    }
  }
  return null;
}

const BRIDGE_FEATURES = new Set(['landBridge', 'builtBridge']);
function featureZRange(type) {
  const zMax = ed.profile ? ed.profile.finishZ : L * dx - 25;
  return BRIDGE_FEATURES.has(type) ? [PUTIN + 26, Math.max(PUTIN + 27, zMax - 11)] : [40, Math.max(41, zMax - 12)];
}
function placeFeature(type, pt) {
  const F = FEATURES[type], cfg = ed.entry.config;
  const [zLo, zHi] = featureZRange(type);
  const z = clamp(pt.z, zLo, zHi);
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
  const ERR_COLOR = [1, 0.18, 0.12];

  if (ed.mode === 'features') {
    for (const m of allMarkers()) {
      const F = FEATURES[m.type], seld = ed.sel && ed.sel.type === m.type && ed.sel.i === m.i;
      const bad = ed.invalid && ed.invalid.dropped.has(`${m.type}:${m.i}`);
      const col = bad ? ERR_COLOR : F.color;
      const span = F.span && F.span(m.it);
      if (span) addPath(mb, linePts(pr.centerAt, Math.max(span[0], 2), Math.min(span[1], L * dx - 2), 3, 0.45), 0.5, col);
      const y = surfY(m.x, m.z);
      addCylinder(mb, [m.x, y, m.z], [m.x, y + 5, m.z], 0.12, 0.12, 6, col);
      const r = seld ? 1.0 : 0.65;
      addSphere(mb, [m.x, y + 5.4, m.z], [r, r, r], 5, 8, seld ? [1, 1, 1] : col);
      if (seld) addRingTube(mb, [m.x, y + 0.35, m.z], 2.2, 2.2, 0.14, 18, 6, bad ? ERR_COLOR : [1, 1, 1]);
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
    if (m === 'test') {
      if (ed.panelHidden) togglePanel();   // the boat/skill/stamina controls live in the panel
      $('edPanel')?.querySelector('[data-sec="test"]')?.scrollIntoView({ block: 'start' });
    }
  }
  updateModeButtons();
}
function refreshPanel() {
  const host = $('edPanel');
  if (!host || !ed.entry) return;
  renderPanel(host, {
    cfg: ed.entry.config, mode: ed.mode, sel: ed.sel, armed: ed.armed, meanderSel: ed.meanderSel, test: ed.test,
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
function togglePanel() {
  ed.panelHidden = !ed.panelHidden;
  $('editor').classList.toggle('panelHidden', ed.panelHidden);
  const b = $('edPanelToggle');
  if (b) b.classList.toggle('on', ed.panelHidden);
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
      <button id="edPanelToggle" title="show/hide the side panel (Tab)">☰</button>
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
    <div class="ed-alert" id="edAlert" style="display:none"></div>
    <div class="ed-body">
      <div class="ed-panel" id="edPanel"></div>
    </div>
    <div class="ed-info" id="edInfo"></div>
    <div class="ed-help"><span id="edModeHelp">${MODE_HELP[ed.mode]}</span><br>
      1–5 — modes · P — play / pause · R — reset water · F1 — debug view · Tab — panel · Esc — menu</div>`;
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
  $('edPanelToggle').onclick = togglePanel;
  $('edPlay').onclick = togglePlay;
  $('edReset').onclick = resetWater;
  $('edView').onclick = cycleView;
  $('edExport').onclick = () => { downloadJson(ed.entry); setStatus('exported'); };
  $('edCopy').onclick = copyJson;
  for (const b of el.querySelectorAll('.ed-modes button')) b.onclick = () => setMode(b.dataset.mode);
  el.classList.toggle('panelHidden', ed.panelHidden);
  $('edPanelToggle').classList.toggle('on', ed.panelHidden);
  renderPlayBtn();
  updateModeButtons();
  renderAlert();
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
  Object.assign(ed, { entry, invalid: null, playing: false, infoT: 0, mode: 'view', armed: null, sel: null, meanderSel: 0, drag: null, alert: null, panelHidden: false });
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
  $('editor').style.display = 'flex';
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
    else if (e.code === 'Tab') { togglePanel(); e.preventDefault(); }
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
    } else if (ed.mode === 'test') {
      const pt = pickGround(e);
      if (pt) startTestRun(pt);
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
      const [zLo, zHi] = featureZRange(ed.sel.type);
      F.setZ(it, clamp(pt.z, zLo, zHi), pt);
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
export function clearFrame() {
  const enc = gpu.device.createCommandEncoder();
  const pass = enc.beginRenderPass({
    colorAttachments: [{
      view: gpu.ctx.getCurrentTexture().createView(),
      clearValue: { r: 0.02, g: 0.05, b: 0.08, a: 1 }, loadOp: 'clear', storeOp: 'store',
    }],
    depthStencilAttachment: { view: gpu.depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
  });
  pass.end();
  gpu.device.queue.submit([enc.finish()]);
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