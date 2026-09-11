// Raw input state: keyboard flags and the two touch paddle pads.
import { MOBILE } from './config/index.js';
import { $ } from './platform.js';
import { S } from './state.js';
import { clamp } from './math.js';

export const input = { fwd: false, back: false, left: false, right: false, leanL: false, leanR: false };

export const KEYMAP = {
  ArrowUp: 'fwd', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right',
  KeyA: 'leanL', KeyD: 'leanR', KeyW: 'fwd', KeyS: 'back',
};

export const PAD_KEYS = { ArrowLeft: [1], ArrowRight: [-1], ArrowUp: [1, -1] };

// side: +1 = blade on the LEFT of the boat (boat turns right), -1 = right blade (turns left)
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

export function nextPadSide(poised) {
  if (pad.queue.length) return pad.queue.shift();
  const l = pad.held[1], r = pad.held[-1];
  if (l && r) return poised;
  return l ? 1 : r ? -1 : 0;
}

export function initPads() {
  for (const side of [1, -1]) {
    const el = padEls[side];
    const ids = new Set();
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      ids.add(e.pointerId);
      padDown(side);
    });
    const release = e => {
      ids.delete(e.pointerId);
      if (!ids.size) padUp(side);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
}

// drag-to-orbit camera for the end-of-run screen; listens on `document` because #msg overlays the canvas
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