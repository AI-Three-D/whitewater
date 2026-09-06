// Browser/device plumbing with no game logic: DOM lookup, the error overlay, mobile detection,
// the tilt sensor and fullscreen. Safe to import from anywhere.
import { MOBILE } from './config.js';
import { clamp } from './math.js';

const DEG = Math.PI / 180;

export const $ = id => document.getElementById(id);

export function showErr(text) {
  const el = $('err');
  el.style.display = 'flex';
  el.textContent = text;
}

export function installErrorHandlers() {
  addEventListener('error', e => showErr(`Script error: ${e.message} (line ${e.lineno})`));
  addEventListener('unhandledrejection', e =>
    showErr('Promise error: ' + ((e.reason && e.reason.stack) || e.reason)));
}

export const isMobile = MOBILE.force || (navigator.maxTouchPoints > 0 &&
  (matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches));

export const gyro = {
  supported: typeof DeviceOrientationEvent !== 'undefined',
  active: false,
  requesting: false,
  rollRaw: 0,
  offset: 0,
  lastEvent: -1e9,

  request() {
    if (!this.supported || this.active || this.requesting) return;
    const start = () => {
      addEventListener('deviceorientation', e => this.onOrient(e));
      this.active = true;
      this.requesting = false;
    };
    if (typeof DeviceOrientationEvent.requestPermission !== 'function') return start();
    this.requesting = true;
    DeviceOrientationEvent.requestPermission()
      .then(r => { if (r === 'granted') start(); else this.requesting = false; })
      .catch(() => { this.requesting = false; });
  },

  onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    const b = e.beta * DEG, c = e.gamma * DEG;
    // "up" in the phone's natural frame …
    const ux = -Math.cos(b) * Math.sin(c), uy = Math.sin(b), uz = Math.cos(b) * Math.cos(c);
    // … rotated into screen coords (x right, y up); the screen may be rotated CCW from natural
    const deg = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
    const a = deg * DEG, ca = Math.cos(a), sa = Math.sin(a);
    const sx = ux * ca - uy * sa, sy = ux * sa + uy * ca;
    this.rollRaw = Math.atan2(sx, Math.hypot(sy, uz));   // > 0: the screen's left edge is lower
    this.lastEvent = performance.now();
  },

  live() {
    return this.active && performance.now() - this.lastEvent < 2000;
  },

  calibrate() {
    this.offset = MOBILE.calibrateOnStart ? this.rollRaw : 0;
  },

  // -1 … 1, +1 = lean left (same sign as the A key)
  lean() {
    if (!this.live()) return 0;
    const d = (this.rollRaw - this.offset) / DEG * (MOBILE.tiltInvert ? -1 : 1);
    const m = (Math.abs(d) - MOBILE.tiltDead) / Math.max(1e-3, MOBILE.tiltMax - MOBILE.tiltDead);
    return clamp(m, 0, 1) * Math.sign(d);
  },
};

// best effort: fullscreen hides the browser chrome and (Android) allows a landscape lock.
// iPhone Safari has no requestFullscreen and lock() rejects — both are simply skipped.
export function enterFullscreen() {
  if (!MOBILE.fullscreen || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    .then(() => (screen.orientation && screen.orientation.lock ? screen.orientation.lock('landscape') : null))
    .catch(() => {});
}