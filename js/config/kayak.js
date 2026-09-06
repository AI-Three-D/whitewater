// Boat physics and the two character traits that feed into it.
const K = {
    mass: 95,
    inertia: [70, 70, 14],
    buoyK: 1300, buoyDamp: 140,
    buoySide: 0.20,                 // half-beam of the side buoyancy points [m]
    dragPts: [[0, -0.1, 0.9], [0, -0.1, -0.9]],
    dragAlong: 18, dragLat: 140, dragLatLin: 60,
    yawDamp: 45, rollDamp: 16, pitchDamp: 60,
    leanTorque: 85,
    leanRate: 1,                    // key-driven lean response (MOBILE.leanRate is for tilt)
    rollInstab: 6,
    capsize: 1.45,                  // [rad] roll beyond which the run is over
    startGrace: 2.5, graceStab: 90, // extra righting torque fading out over the first seconds
    paddleFwd: 120, paddleBack: 80, sweepTorque: 85, sweepFwd: 45, strokePeriod: 0.8,
    collK: 8000, collDamp: 300, collFric: 60,
    paddleSwingRate: 7,             // rad/s cap on the drawn paddle's yaw — any jump in the stroke angle becomes a short swing
  };
  
  const s = K.buoySide;
  const buoyPts = [
    [0, -0.05, 1.4], [0, -0.05, -1.4],
    [-s, -0.08, 0.5], [s, -0.08, 0.5],
    [-s, -0.08, -0.5], [s, -0.08, -0.5],
  ];
  
  export const KAYAK = {
    ...K,
    buoyPts,
    collPts: [...buoyPts, [0, -0.14, 0], [0, -0.12, 0.8], [0, -0.12, -0.8]],
    formStab: 2 * K.buoyK * s * s,   // righting stiffness from hull form alone [N·m/rad]
  };
  
  export const STAMINA = {
    max: 100,
    regenTime: 10,          // seconds from empty to full
    drain: 22,              // units/s while paddling (before stamina-trait reduction)
    drainPerPt: 0.083,      // each stamina point removes 8.3 % of the drain
    tiredFrac: 1 / 3,       // below this fraction the paddler is "tired"
    tiredPower: 0.5,        // stroke force multiplier when tired
    tiredStroke: 1.7,       // stroke period multiplier when tired (visually slower)
    passivePerLevel: 0.25,  // small automatic gain on every level-up, on top of spent points
  };
  
  export const SKILL = {
    instabPerPt: 0.95,      // N·m/rad removed from roll instability per skill point
    leanPerPt: 1.8,         // N·m added to hip/lean torque per skill point
    leanRatePerPt: 0.015,   // small speedup to how fast A/D leaning reaches its target, per skill point
    passivePerLevel: 0.25,  // small automatic gain on every level-up, on top of spent points
  };