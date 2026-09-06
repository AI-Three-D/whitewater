// Water simulation and particle constants. GRID and PARTS are *mutable* — the runtime quality
// module overwrites them with the chosen tier at load. Their defaults are the high tier so the
// numbers aren't written twice.
import { QUALITY } from './quality.js';

export const GRID = { ...QUALITY.high.grid };

export const PARTS = {
  count: QUALITY.high.particles,
  kayakShare: QUALITY.high.kayakShare,
  ambient: 0.055,
};

export const SIM = {
  dt: 1 / 120, substeps: 2,
  g: 9.81, hmin: 0.02, umax: 12.0,
  turbA: 0.7,                 // stochastic forcing amplitude [m/s²] (1.5 = too much backflow)
  turbL: 3.0, turbT: 0.8,
  foamDecay: 0.35, kDecay: 0.8, macCormack: 1, kGen: 1.0, foamGen: 1.0,
  warmupSteps: 400,
  waterFrac: 0.75,
};