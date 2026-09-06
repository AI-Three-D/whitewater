// Keyboard, the two mobile paddle pads, and the small in-run toggles. Run-level actions (eat,
// drink, retry, …) are injected via initInput() so this module doesn't depend on the run controller.
import { MOBILE } from './config.js';
import { $, isMobile } from './platform.js';
import { G, isRunning } from './state.js';

export const input = { fwd: false, back: false, left: false, right: false, leanL: false, leanR: false };
const keymap = { ArrowUp: 'fwd', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right', KeyA: 'leanL', KeyD: 'leanR', KeyW: 'fwd', KeyS: 'back' };
// in mobile mode the arrow keys drive the two pads (handy when developing with MOBILE.force)
const padKeys = { ArrowLeft: [1], ArrowRight: [-1], ArrowUp: [1, -1] };

// ---------- mobile paddle pads ----------
// side follows kayak.side: +1 = blade on the LEFT of the boat (the boat turns right),
// -1 = blade on the right (turns left). A press queues one stroke; a pad still held when a
// stroke ends starts the next one on that side; both held alternates sides like the desktop ↑.
export const pad = { held: { 1: false, '-1': false }, queue: [] };
const padEls = { 1: $('padL'), '-1': $('padR') };

function padDown(side) {
  pad.held[side] = true;
  padEls[side].classList.add('down');
  if (isRunning() && pad.queue.length < MOBILE.strokeQueue) pad.queue.push(side);
}

function padUp(side) {
  pad.held[side] = false;
  padEls[side].classList.remove('down');
}

// side of the next stroke (0 = none). `poised` is the side the paddle is already lifted toward,
// i.e. the one an alternating (both-held) rhythm naturally continues with
export function nextPadSide(poised) {
  if (pad.queue.length) return pad.queue.shift();
  const l = pad.held[1], r = pad.held[-1];
  return l && r ? poised : l ? 1 : r ? -1 : 0;
}

function bindPad(side) {
  const el = padEls[side], ids = new Set();   // several fingers on one pad: released when the last one lifts
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* some pointer types can't be captured */ }
    ids.add(e.pointerId);
    padDown(side);
  });
  const release = e => { ids.delete(e.pointerId); if (!ids.size) padUp(side); };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('contextmenu', e => e.preventDefault());   // no long-press menu
}

// ---------- toggles ----------
export function toggleCam() { G.camMode = (G.camMode + 1) % 3; }

export function toggleDbg() {
  G.dbgMode = (G.dbgMode + 1) % 5;
  $('dbg').style.display = G.dbgMode ? 'block' : 'none';
}

export function toggleNoCapsize() {
  G.debugNoCapsize = !G.debugNoCapsize;
  $('mGod').classList.toggle('on', G.debugNoCapsize);
}

// ---------- wiring ----------
export function initInput({ eatSnack, drinkEnergy, retryRun, finishRun, escape, exitToMenu }) {
  const keyActions = {
    KeyC: toggleCam, KeyE: eatSnack, KeyQ: drinkEnergy, F1: toggleDbg, KeyG: toggleNoCapsize,
    KeyR: retryRun, KeyF: finishRun, Escape: escape,
  };

  addEventListener('keydown', e => {
    if (isMobile && padKeys[e.code]) {
      if (!e.repeat) for (const s of padKeys[e.code]) padDown(s);
      e.preventDefault();
      return;
    }
    if (keymap[e.code] !== undefined) { input[keymap[e.code]] = true; e.preventDefault(); }
    const act = keyActions[e.code];
    if (!act) return;
    act();
    if (e.code === 'F1') e.preventDefault();
  });

  addEventListener('keyup', e => {
    if (isMobile && padKeys[e.code]) { for (const s of padKeys[e.code]) padUp(s); return; }
    if (keymap[e.code] !== undefined) input[keymap[e.code]] = false;
  });

  bindPad(1);
  bindPad(-1);

  $('mExit').onclick = exitToMenu;
  $('mCam').onclick = toggleCam;
  $('mDbg').onclick = toggleDbg;
  $('mEat').onclick = eatSnack;
  $('mDrink').onclick = drinkEnergy;
  $('mGod').onclick = toggleNoCapsize;
}