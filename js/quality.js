// Detail tier: the persisted choice, and applying it to the shared config tables.
//
// IMPORTANT: this must be the FIRST import in main.js. applyQuality() rewrites GRID/PARTS/VEG/SIM/
// RENDER in place, and several modules (gpu, sampling, …) capture `const { W, L, dx } = GRID` when
// they are evaluated. ES modules evaluate main.js's imports in order, so importing this one first
// guarantees the saved tier is in effect before anything reads the grid size — the same ordering
// the original single file relied on (applyQuality ran at top level, before main()).
import { GRID, SIM, RENDER, PARTS, VEG, QUALITY, QUALITY_LEVELS } from './config.js';

const KEY = 'whitewater.quality';

function loadQuality() {
  const q = localStorage.getItem(KEY);
  return QUALITY_LEVELS.includes(q) ? q : 'high';
}

export function saveQuality(q) {
  localStorage.setItem(KEY, q);
}

export const quality = loadQuality();
export const Q = QUALITY[quality];   // the active tier's table (dprCap, simpleShading, …)

function applyQuality(t) {
  Object.assign(GRID, t.grid);
  PARTS.count = t.particles;
  PARTS.kayakShare = t.kayakShare;
  VEG.caps = t.veg.caps;
  VEG.attempts = t.veg.attempts;
  SIM.warmupSteps = t.warmupSteps;
  SIM.macCormack = t.macCormack;
  SIM.turbA = t.turbA;
  SIM.substeps = t.substeps;
  RENDER.viewAhead = t.viewAhead ?? RENDER.viewAhead;
  RENDER.viewBehind = t.viewBehind ?? RENDER.viewBehind;
  RENDER.computeAhead = t.computeAhead ?? RENDER.computeAhead;
  RENDER.computeBehind = t.computeBehind ?? RENDER.computeBehind;
  RENDER.fogDensity = t.fogDensity ?? RENDER.fogDensity;
  RENDER.lod = t.lod ?? { near: 1e9, mid: 1e9 };
}

applyQuality(Q);