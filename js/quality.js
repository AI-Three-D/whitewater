// Detail tier. Loads the saved tier, applies it to the mutable config tables and exports the
// grid dimensions *after* that mutation. Every module that sizes anything by the grid imports
// W/L/dx from here, never from config.js: ES modules evaluate their dependencies first, so this
// guarantees the tier has been applied before any buffer is allocated.
import { GRID, SIM, RENDER, PARTS, VEG, QUALITY, QUALITY_LEVELS } from './config/index.js';

const QKEY = 'whitewater.quality';

function loadQuality() {
  const q = localStorage.getItem(QKEY);
  return QUALITY_LEVELS.includes(q) ? q : null;
}

export function saveQuality(q) {
  localStorage.setItem(QKEY, q);
}

export function applyQuality(q) {
  const T = QUALITY[q];
  Object.assign(GRID, T.grid);
  PARTS.count = T.particles;
  PARTS.kayakShare = T.kayakShare;
  VEG.caps = T.veg.caps;
  VEG.attempts = T.veg.attempts;
  SIM.warmupSteps = T.warmupSteps;
  SIM.macCormack = T.macCormack;
  SIM.turbA = T.turbA;
  SIM.substeps = T.substeps;
  RENDER.viewAhead = T.viewAhead ?? RENDER.viewAhead;
  RENDER.viewBehind = T.viewBehind ?? RENDER.viewBehind;
  RENDER.computeAhead = T.computeAhead ?? RENDER.computeAhead;
  RENDER.computeBehind = T.computeBehind ?? RENDER.computeBehind;
  RENDER.fogDensity = T.fogDensity ?? RENDER.fogDensity;
  RENDER.lod = T.lod ?? { near: 1e9, mid: 1e9 };
}

export const quality = loadQuality() || 'high';
export const Q = QUALITY[quality];   // the active tier table (dprCap, simpleShading, …)
applyQuality(quality);

export const { W, L, dx } = GRID;
export const N = W * L;