// Boat physics, paddler traits and the touch/tilt controls.

const buoyK = 1300;
const buoySide = 0.20;   // [m] lateral offset of the side buoyancy points
const buoyPts = [
  [0, -0.05, 1.4], [0, -0.05, -1.4],
  [-buoySide, -0.08, 0.5], [buoySide, -0.08, 0.5],
  [-buoySide, -0.08, -0.5], [buoySide, -0.08, -0.5],
];

export const KAYAK = {
  mass: 95,
  inertia: [70, 70, 14],
  buoyK, buoyDamp: 140, buoySide, buoyPts,
  formStab: 2 * buoyK * buoySide * buoySide,
  dragPts: [[0, -0.1, 0.9], [0, -0.1, -0.9]],
  dragAlong: 18, dragLat: 140, dragLatLin: 60,
  yawDamp: 45, rollDamp: 16, pitchDamp: 60,
  leanTorque: 85,
  leanRate: 1,             // key-driven lean response (MOBILE.leanRate is for tilt)
  rollInstab: 6,
  capsize: 1.45,           // [rad] roll beyond which the run ends
  startGrace: 2.5, graceStab: 90,
  paddleFwd: 120, paddleBack: 80, sweepTorque: 85, sweepFwd: 45, strokePeriod: 0.8,
  backFadeLo: 2.5, backFadeHi: 6.0,   // [m/s local flow] backpaddle strength fades to none across this range
  paddleSwingRate: 7,
  collPts: [...buoyPts, [0, -0.14, 0], [0, -0.12, 0.8], [0, -0.12, -0.8]],
  collK: 8000, collDamp: 300, collFric: 60,
};

export const STAMINA = {
  max: 100,
  regenTime: 10,           // seconds from empty to full
  drain: 22,
  drainPerPt: 0.083,
  tiredFrac: 1 / 3,
  tiredPower: 0.5,
  tiredStroke: 1.7,
  passivePerLevel: 0.25,
};

export const SKILL = {
  instabPerPt: 0.95,
  leanPerPt: 1.8,
  leanRatePerPt: 0.015,
  passivePerLevel: 0.25,
};

export const MOBILE = {
  force: false,             // true → touch pads + tilt even on desktop, for development
  tiltMax: 22,              // device roll [deg] for a full lean
  tiltDead: 2.5,            // [deg] dead zone around neutral
  tiltInvert: false,
  calibrateOnStart: true,
  leanRate: 3,              // analog tilt lean response (KAYAK.leanRate is for keys)
  strokeQueue: 2,
  repeatFwd: 0.45,
  repeatYaw: 1.0,
  fullscreen: true,
};