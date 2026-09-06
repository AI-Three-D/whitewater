// CPU-side sampling of the terrain heightfield and of the water state (via the band readback).
import { GRID, SIM } from './config.js';
import { clamp, smoothstep, v3 } from './math.js';
import { nearestChan } from './river.js';
import { G } from './state.js';
import { gpu, BAND_ROWS, BAND_BYTES } from './gpu.js';

const { W, L, dx } = GRID;

export const rowOf = z => clamp(Math.floor(z / dx), 0, L - 1);   // grid row containing world z
export const clampX = x => clamp(x, 1, W * dx - 1);               // keep a world x inside the grid

// ---------- terrain ----------
export function terrainH(x, z) {
  const b = G.river.b;
  const gx = x / dx - 0.5, gz = z / dx - 0.5;
  const x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0;
  const f = (i, j) => b[clamp(j, 0, L - 1) * W + clamp(i, 0, W - 1)];
  return (f(x0, z0) * (1 - fx) + f(x0 + 1, z0) * fx) * (1 - fz)
       + (f(x0, z0 + 1) * (1 - fx) + f(x0 + 1, z0 + 1) * fx) * fz;
}

export function terrainN(x, z) {
  const e = 0.3;
  return v3.norm([terrainH(x - e, z) - terrainH(x + e, z), 2 * e, terrainH(x, z - e) - terrainH(x, z + e)]);
}

// ---------- water band: a window of rows around the kayak copied back from the GPU ----------
export const band = { ready: false, j0: 0, data: new Float32Array(BAND_ROWS * W * 4) };

function bandVal(ch, i, j) {
  return band.data[(clamp(j - band.j0, 0, BAND_ROWS - 1) * W + clamp(i, 0, W - 1)) * 4 + ch];
}

function bilinBand(ch, gx, gz) {
  const x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0;
  return (bandVal(ch, x0, z0) * (1 - fx) + bandVal(ch, x0 + 1, z0) * fx) * (1 - fz)
       + (bandVal(ch, x0, z0 + 1) * (1 - fx) + bandVal(ch, x0 + 1, z0 + 1) * fx) * fz;
}

// distance (rows) from the band's centre row
const bandDist = z => Math.abs(z / dx - (band.j0 + BAND_ROWS / 2));
const bandCovers = z => band.ready && bandDist(z) <= BAND_ROWS / 2 - 3;

// steady-state Manning estimate used wherever the band has no data
function nominalWater(river, row, bed) {
  const h = Math.max(0, row.eta - bed);
  const v = h > 0 ? Math.min(0.8 * Math.pow(h, 0.6667) * Math.sqrt(river.R.slope) / river.R.manning, 4) : 0;
  return { eta: Math.max(row.eta, bed), h, u: 0, v };
}

export function waterAt(x, z) {
  const river = G.river, bed = terrainH(x, z);
  const row = nearestChan(river.rows[rowOf(z)], x);
  if (!bandCovers(z)) return nominalWater(river, row, bed);

  const gx = x / dx - 0.5, gz = z / dx - 0.5;
  const x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0;
  // surface height is averaged over wet cells only, so a dry bank cell doesn't drag it down
  let wsum = 0, esum = 0;
  for (const [di, dj, wgt] of [[0, 0, (1 - fx) * (1 - fz)], [1, 0, fx * (1 - fz)], [0, 1, (1 - fx) * fz], [1, 1, fx * fz]]) {
    const i = clamp(x0 + di, 0, W - 1), j = clamp(z0 + dj, 0, L - 1), h = bandVal(0, i, j);
    if (h > SIM.hmin) { wsum += wgt; esum += wgt * (h + river.b[j * W + i]); }
  }
  return {
    eta: wsum > 0.05 ? Math.max(esum / wsum, bed) : bed,
    h: bilinBand(0, gx, gz),
    u: bilinBand(1, x / dx, gz),
    v: bilinBand(2, gx, z / dx),
  };
}

// water surface for things that float: the nominal level, blended toward the live band where it
// has data, so an object drifting out of the band doesn't pop
export function surfaceAt(x, z) {
  const river = G.river;
  const nominal = Math.max(nearestChan(river.rows[rowOf(z)], x).eta, terrainH(x, z));
  if (!band.ready) return nominal;
  const wgt = 1 - smoothstep(BAND_ROWS / 2 - 8, BAND_ROWS / 2 - 3.5, bandDist(z));
  return wgt <= 0 ? nominal : nominal + (waterAt(x, z).eta - nominal) * wgt;
}

// ---------- readback ----------
// queue a copy of the band around zCenter into a free staging buffer (null if both are busy)
export function beginBandReadback(enc, zCenter) {
  const stg = gpu.staging.find(s => !s.busy);
  if (!stg) return null;
  const j0 = clamp(Math.floor(zCenter / dx) - BAND_ROWS / 2, 0, L - BAND_ROWS);
  enc.copyBufferToBuffer(gpu.stateBufs[0], j0 * W * 16, stg.buf, 0, BAND_BYTES);
  stg.busy = true;
  return { stg, j0 };
}

// after submit: map the staging buffer and publish it as the current band
export function finishBandReadback(token) {
  if (!token) return;
  const { stg, j0 } = token;
  stg.buf.mapAsync(GPUMapMode.READ).then(() => {
    band.data.set(new Float32Array(stg.buf.getMappedRange()));
    band.j0 = j0;
    band.ready = true;
    stg.buf.unmap();
    stg.busy = false;
  }).catch(() => { stg.busy = false; });
}