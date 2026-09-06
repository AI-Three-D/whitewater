// Mobile / touch build.
export const MOBILE = {
    force: false,             // true → touch pads + tilt even on a desktop browser (for development)
    tiltMax: 22,              // device roll [deg] that gives a full lean
    tiltDead: 2.5,            // roll [deg] around neutral that is ignored
    tiltInvert: false,        // flip the tilt direction (only if a device reports it mirrored)
    calibrateOnStart: true,   // how the phone is held when a run starts counts as "level"
    leanRate: 3,              // lean response for the analog tilt (KAYAK.leanRate is for the binary keys)
    strokeQueue: 2,           // taps remembered while a stroke is still in progress
    repeatFwd: 0.45,          // forward push of a same-side (turning) stroke, as a fraction of paddleFwd
    repeatYaw: 1.0,           // turning torque of a same-side stroke, as a fraction of sweepTorque
    fullscreen: true,         // ask for fullscreen + landscape lock when a run starts (best effort, Android)
  };