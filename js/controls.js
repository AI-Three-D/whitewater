// Raw input state: keyboard flags and the two touch paddle pads. No game logic beyond the
// "only queue strokes mid-run" guard; main.js does the key → action wiring.
import { MOBILE } from './config/index.js';
import { $ } from './platform.js';
import { S } from './state.js';
import { clamp } from './math.js';

export const input = { fwd: false, back: false, left: false, right: false, leanL: false, leanR: false };

export const KEYMAP = {
  ArrowUp: 'fwd', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right',
  KeyA: 'leanL', KeyD: 'leanR', KeyW: 'fwd', KeyS: 'back',
};

// in mobile mode the arrow keys drive the two pads (handy when developing with MOBILE.force)
export const PAD_KEYS = { ArrowLeft: [1], ArrowRight: [-1], ArrowUp: [1, -1] };

// side follows kayak.side: +1 = blade on the LEFT of the boat (the boat turns right),
// -1 = blade on the right (turns left). A press queues one stroke; a pad still held when a
// stroke ends starts the next one on that side; both held alternates sides like the desktop ↑.
export const pad = { held: { 1: false, '-1': false }, queue: [] };
const padEls = { 1: $('padL'), '-1': $('padR') };

export function padDown(side) {
  pad.held[side] = true;
  padEls[side].classList.add('down');
  if (S.gameState === 'run' && pad.queue.length < MOBILE.strokeQueue) pad.queue.push(side);
}

export function padUp(side) {
  pad.held[side] = false;
  padEls[side].classList.remove('down');
}

// side of the next stroke (0 = none). `poised` is the side the paddle is already lifted toward,
// i.e. the one an alternating (both-held) rhythm naturally continues with
export function nextPadSide(poised) {
  if (pad.queue.length) return pad.queue.shift();
  const l = pad.held[1], r = pad.held[-1];
  if (l && r) return poised;
  return l ? 1 : r ? -1 : 0;
}

export function initPads() {
  for (const side of [1, -1]) {
    const el = padEls[side];
    const ids = new Set();   // several fingers on one pad: released when the last one lifts
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* some pointer types can't be captured */ }
      ids.add(e.pointerId);
      padDown(side);
    });
    const release = e => {
      ids.delete(e.pointerId);
      if (!ids.size) padUp(side);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('contextmenu', e => e.preventDefault());   // no long-press menu
  }
}

// drag-to-orbit camera for the end-of-run screen (see cam.updateFree in render.js) — only live
// while gameState is 'over', so it never fights the in-run chase cam or the pads.
// Listens on `document`, not the canvas: #msg is a full-viewport `position:fixed;inset:0` overlay
// that sits on top of the canvas whenever a run is over (that's how its buttons receive clicks at
// all), so a canvas-only listener would never see a pointerdown that starts anywhere over it.
export function initFreeLook() {
  let dragging = false, lastX = 0, lastY = 0;
  document.addEventListener('pointerdown', e => {
    if (S.gameState !== 'over') return;
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
  });
  document.addEventListener('pointermove', e => {
    if (!dragging || S.gameState !== 'over') return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    const fc = S.freeCam;
    fc.yaw -= dx * 0.008;
    fc.pitch = clamp(fc.pitch + dy * 0.006, -0.15, 1.3);
  });
  const stop = () => { dragging = false; };
  document.addEventListener('pointerup', stop);
  document.addEventListener('pointercancel', stop);
  document.addEventListener('wheel', e => {
    if (S.gameState !== 'over') return;
    e.preventDefault();
    S.freeCam.dist = clamp(S.freeCam.dist + e.deltaY * 0.01, 3, 30);
  }, { passive: false });
}