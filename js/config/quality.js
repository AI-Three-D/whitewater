// Detail tiers. `high` is also the source for the load-time defaults in sim.js / biomes.js, so a
// number only ever lives here. Applied by ../quality.js (the runtime module) before anything sizes
// a buffer.
export const QUALITY_LEVELS = ['high', 'medium', 'low'];

export const QUALITY = {
  high: {
    grid: { W: 256, L: 1024, dx: 0.5 },
    particles: 24000, kayakShare: 4000,
    veg: { caps: { tree: 900, bush: 700, rock: 500, grass: 3500, boulder: 70 }, attempts: 26000 },
    dprCap: 1.5, warmupSteps: 400, macCormack: 1, turbA: 0.6, simpleShading: false, substeps: 2,
    lod: { near: 80, mid: 140 },
    viewAhead: 170, viewBehind: 30, computeAhead: 220, computeBehind: 60,
    fogDensity: 0.0024,
  },
  medium: {
    grid: { W: 216, L: 864, dx: 128 / 216 },
    particles: 3000, kayakShare: 1000,
    veg: { caps: { tree: 400, bush: 300, rock: 250, grass: 2500, boulder: 35 }, attempts: 12000 },
    dprCap: 1.0, warmupSteps: 300, macCormack: 1, turbA: 0.6, simpleShading: false, substeps: 2,
    lod: { near: 60, mid: 110 },
    // computeAhead/Behind stay a healthy margin past viewAhead/Behind: rows beyond the compute
    // window only hold the one-time load warm-up state (no live turbulence/foam) until the moving
    // window reaches them, so a view range that outruns compute reads as dead, frozen water.
    viewAhead: 150, viewBehind: 25, computeAhead: 180, computeBehind: 45,
    fogDensity: 0.0028,
  },
  low: {
    grid: { W: 216, L: 864, dx: 128 / 216 },
    particles: 800, kayakShare: 400,
    veg: { caps: { tree: 100, bush: 80, rock: 80, grass: 500, boulder: 15 }, attempts: 12000 },
    dprCap: 0.75, warmupSteps: 300, macCormack: 1, turbA: 0.6, simpleShading: false, substeps: 2,
    lod: { near: 40, mid: 80 },
    viewAhead: 120, viewBehind: 20, computeAhead: 140, computeBehind: 35,
    fogDensity: 0.0040,
  },
};