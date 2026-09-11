// Water/particle simulation sizes and the detail tiers that override them.
// QUALITY is the source of truth; GRID/SIM/PARTS/VEG are mutable tables js/quality.js overwrites
// at load from the chosen tier (see applyQuality).

export const QUALITY = {
    high: {
      grid: { W: 256, L: 1024, dx: 0.5 },
      particles: 24000, kayakShare: 4000,
      veg: { caps: { tree: 900, bush: 700, rock: 500, grass: 3500, boulder: 70 }, attempts: 26000 },
      dprCap: 1.5, warmupSteps: 900, macCormack: 1, turbA: 0.6, simpleShading: false, substeps: 2,
      lod: { near: 80, mid: 140 },
      viewAhead: 170, viewBehind: 30, computeAhead: 220, computeBehind: 60, fogDensity: 0.0024,
    },
    medium: {
      grid: { W: 216, L: 864, dx: 128 / 216 },
      particles: 3000, kayakShare: 1000,
      veg: { caps: { tree: 400, bush: 300, rock: 250, grass: 2500, boulder: 35 }, attempts: 12000 },
      dprCap: 1.0, warmupSteps: 700, macCormack: 1, turbA: 0.6, simpleShading: false, substeps: 2,
      // computeAhead/Behind must stay past viewAhead/Behind or unreached rows show as dead, frozen water
      lod: { near: 60, mid: 110 },
      viewAhead: 150, viewBehind: 25, computeAhead: 120, computeBehind: 45, fogDensity: 0.0028,
    },
    low: {
      grid: { W: 216, L: 864, dx: 128 / 216 },
      particles: 800, kayakShare: 400,
      veg: { caps: { tree: 100, bush: 80, rock: 80, grass: 500, boulder: 15 }, attempts: 12000 },
      dprCap: 0.75, warmupSteps: 700, macCormack: 1, turbA: 0.6, simpleShading: false, substeps: 2,
      lod: { near: 40, mid: 80 },
      viewAhead: 120, viewBehind: 20, computeAhead: 50, computeBehind: 10, fogDensity: 0.0040,
    },
  };
  export const QUALITY_LEVELS = ['high', 'medium', 'low'];

  const HIGH = QUALITY.high;

  // mutable run-time tables, overwritten per tier by applyQuality
  export const GRID = { ...HIGH.grid };

  export const SIM = {
    dt: 1 / 120,
    substeps: HIGH.substeps,
    g: 9.81,
    hmin: 0.02,             // [m] below this a cell counts as dry
    umax: 12.0,             // [m/s] velocity clamp
    maxRise: 3.0, maxFall: 3.0,   // [m/s] per-substep depth-change cap, see height() in shaders.js
    turbA: HIGH.turbA,      // [m/s²] stochastic forcing amplitude
    turbL: 3.0,
    turbT: 0.8,
    foamDecay: 0.35,
    kDecay: 0.8,
    macCormack: HIGH.macCormack,
    kGen: 1.0,
    foamGen: 1.0,
    warmupSteps: HIGH.warmupSteps,
    waterFrac: 0.75,
  };
  
  export const PARTS = { count: HIGH.particles, kayakShare: HIGH.kayakShare, ambient: 0.055 };
  
  export const VEG = { caps: { ...HIGH.veg.caps }, attempts: HIGH.veg.attempts };