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
  // buoyancy (spring per submerged point) and the points it acts at
  buoyK, buoyDamp: 140, buoySide, buoyPts,
  formStab: 2 * buoyK * buoySide * buoySide,   // static roll stiffness from the hull form [N·m/rad]
  // hydrodynamic drag
  dragPts: [[0, -0.1, 0.9], [0, -0.1, -0.9]],
  dragAlong: 18, dragLat: 140, dragLatLin: 60,
  yawDamp: 45, rollDamp: 16, pitchDamp: 60,
  // balance
  leanTorque: 85,
  leanRate: 1,            // response of the key-driven lean (MOBILE.leanRate is for tilt)
  rollInstab: 6,          // inverted-pendulum instability, reduced by skill (see traits())
  capsize: 1.45,          // [rad] roll beyond which the run ends
  startGrace: 2.5, graceStab: 90,   // extra stability fading out over the first seconds
  // paddle
  paddleFwd: 120, paddleBack: 80, sweepTorque: 85, sweepFwd: 45, strokePeriod: 0.8,
  // backpaddling fights the current directly, and a human paddle can't out-muscle a real rapid —
  // full strength below backFadeLo [m/s local flow speed], fading to none by backFadeHi, so a
  // steep drop's fast water can't be casually stalled out by holding the back stroke through it
  backFadeLo: 2.5, backFadeHi: 6.0,
  paddleSwingRate: 7,     // rad/s cap on the drawn paddle's yaw — turns any jump in the stroke angle into a short swing
  // terrain/obstacle contact
  collPts: [...buoyPts, [0, -0.14, 0], [0, -0.12, 0.8], [0, -0.12, -0.8]],
  collK: 8000, collDamp: 300, collFric: 60,
};

export const STAMINA = {
  max: 100,
  regenTime: 10,          // seconds from empty to full
  drain: 22,              // units/s while paddling (before the stamina-trait reduction)
  drainPerPt: 0.083,      // each stamina point removes 8.3 % of the drain
  tiredFrac: 1 / 3,       // below this fraction the paddler is "tired"
  tiredPower: 0.5,        // stroke force multiplier when tired
  tiredStroke: 1.7,       // stroke period multiplier when tired (visually slower)
  passivePerLevel: 0.25,  // small automatic gain on every level-up, on top of spent points
};

export const SKILL = {
  instabPerPt: 0.95,      // N·m/rad removed from roll instability per skill point
  leanPerPt: 1.8,         // N·m added to hip/lean torque per skill point
  leanRatePerPt: 0.015,   // speedup of how fast A/D leaning reaches its target, per skill point
  passivePerLevel: 0.25,  // small automatic gain on every level-up, on top of spent points
};

export const MOBILE = {
  force: false,             // true → touch pads + tilt even on a desktop browser (for development)
  tiltMax: 22,              // device roll [deg] that gives a full lean
  tiltDead: 2.5,            // roll [deg] around neutral that is ignored
  tiltInvert: false,        // flip the tilt direction (only if a device reports it mirrored)
  calibrateOnStart: true,   // how the phone is held when a run starts counts as "level"
  leanRate: 3,              // lean response for the analog tilt (KAYAK.leanRate is for the keys)
  strokeQueue: 2,           // taps remembered while a stroke is still in progress
  repeatFwd: 0.45,          // forward push of a same-side (turning) stroke, as a fraction of paddleFwd
  repeatYaw: 1.0,           // turning torque of a same-side stroke, as a fraction of sweepTorque
  fullscreen: true,         // ask for fullscreen + landscape lock when a run starts (best effort, Android)
};