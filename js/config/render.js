// Lighting, sky and fog. RENDER holds the defaults and the per-tier view/compute windows the
// runtime quality module fills in; BIOME_SKY / TIME_OF_DAY layer on top (see render.currentSky).
import { BIOMES } from './biomes.js';

const DEFAULT_SUN = [0.35, 0.55, 0.75];
const DEFAULT_FOG = [0.72, 0.80, 0.90];

export const RENDER = {
  sunDir: DEFAULT_SUN,
  fogColor: DEFAULT_FOG,
  fogDensity: 0.0024,
  // filled from QUALITY[tier] at load; listed so the shape is visible
  viewAhead: 170, viewBehind: 30,
  computeAhead: 220, computeBehind: 60,
  lod: { near: 80, mid: 140 },
};

export const TIME_OF_DAY = {
  day:   { sunDir: null,                skyHorizon: [0.70, 0.80, 0.92], skyZenith: [0.20, 0.42, 0.80], fogTint: [1.00, 1.00, 1.00], fogMul: 1.00, exposure: 1.00 },
  dawn:  { sunDir: [0.85, 0.16, 0.30],  skyHorizon: [0.96, 0.64, 0.48], skyZenith: [0.24, 0.32, 0.58], fogTint: [1.15, 0.78, 0.58], fogMul: 1.15, exposure: 0.75 },
  dusk:  { sunDir: [-0.82, 0.14, 0.42], skyHorizon: [0.85, 0.38, 0.28], skyZenith: [0.16, 0.13, 0.34], fogTint: [1.20, 0.72, 0.62], fogMul: 1.20, exposure: 0.62 },
  night: { sunDir: [0.30, -0.30, 0.60], skyHorizon: [0.05, 0.07, 0.15], skyZenith: [0.01, 0.015, 0.05], fogTint: [0.14, 0.16, 0.30], fogMul: 1.35, exposure: 0.16 },
  misty: { sunDir: [0.40, 0.45, 0.72],  skyHorizon: [0.80, 0.82, 0.84], skyZenith: [0.55, 0.58, 0.63], fogTint: [0.95, 0.97, 1.00], fogMul: 2.0,  exposure: 0.85 },
};

export const BIOME_SKY = {
  alpine:     { sunDir: DEFAULT_SUN,        fogColor: DEFAULT_FOG,        fogMul: 1.0 },
  canyon:     { sunDir: [0.55, 0.35, 0.65], fogColor: [0.80, 0.72, 0.60], fogMul: 0.9 },
  desert:     { sunDir: [0.50, 0.65, 0.55], fogColor: [0.85, 0.80, 0.65], fogMul: 1.1 },
  deciduous:  { sunDir: [0.30, 0.60, 0.70], fogColor: [0.75, 0.82, 0.78], fogMul: 1.0 },
  icy:        { sunDir: [0.25, 0.50, 0.80], fogColor: [0.80, 0.87, 0.95], fogMul: 1.1 },
  barren:     { sunDir: [0.30, 0.45, 0.75], fogColor: [0.68, 0.66, 0.62], fogMul: 1.15 },
  rainforest: { sunDir: [0.25, 0.55, 0.75], fogColor: [0.70, 0.80, 0.72], fogMul: 1.3 },
  savannah:   { sunDir: [0.55, 0.60, 0.60], fogColor: [0.85, 0.78, 0.55], fogMul: 0.85 },
  glacier:    { sunDir: [0.30, 0.60, 0.75], fogColor: [0.85, 0.90, 0.97], fogMul: 1.2 },
  // ominous, hazier and darker-lit than anything else — a low sun through thick smoky air
  volcanic:   { sunDir: [0.40, 0.30, 0.70], fogColor: [0.55, 0.42, 0.38], fogMul: 1.6 },
  // warm golden-hour light for a fall-foliage river
  autumn:     { sunDir: [0.50, 0.42, 0.65], fogColor: [0.85, 0.72, 0.58], fogMul: 1.0 },
};

// index = the biome id the terrain shader switches on. APPEND ONLY — reordering changes the
// look of every river. validateConfig() checks this stays in sync with BIOMES and BIOME_SKY.
export const BIOME_ORDER = [
  'alpine', 'canyon', 'desert', 'deciduous', 'icy', 'barren',
  'rainforest', 'savannah', 'glacier', 'volcanic', 'autumn',
];
export const BIOME_IDS = Object.fromEntries(BIOME_ORDER.map((id, i) => [id, i]));

// keep the import honest: a biome that has a look needs a sky too
export const biomesWithoutSky = () => Object.keys(BIOMES).filter(id => !(id in BIOME_SKY));