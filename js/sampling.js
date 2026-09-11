// CPU-side reads of the world: terrain height/normal, water state (GPU band + 1-D fallback), placement helpers.
import { SIM } from './config/index.js';
import { nearestChan } from './river.js';
import { v3, clamp, smoothstep } from './math.js';
import { S } from './state.js';
import { gpu, BAND_ROWS } from './gpu.js';
import { W, L, dx } from './quality.js';

export const band = { ready: false, j0: 0, data: new Float32Array(BAND_ROWS * W * 4) };

export const rowOf = z => clamp(Math.floor(z / dx), 0, L - 1);

const bilerp = (a, b, c, d, fx, fz) => (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;

export function terrainH(x, z) {
  const b = S.river.b;
  const gx = x / dx - 0.5, gz = z / dx - 0.5;
  const x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0;
  const f = (i, j) => b[clamp(j, 0, L - 1) * W + clamp(i, 0, W - 1)];
  return bilerp(f(x0, z0), f(x0 + 1, z0), f(x0, z0 + 1), f(x0 + 1, z0 + 1), fx, fz);
}

export function terrainN(x, z) {
  const e = 0.3;
  return v3.norm([terrainH(x - e, z) - terrainH(x + e, z), 2 * e, terrainH(x, z - e) - terrainH(x, z + e)]);
}

function bandVal(ch, i, j) {
  return band.data[(clamp(j - band.j0, 0, BAND_ROWS - 1) * W + clamp(i, 0, W - 1)) * 4 + ch];
}

function bilinBand(ch, gx, gz) {
  const x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0;
  return bilerp(bandVal(ch, x0, z0), bandVal(ch, x0 + 1, z0), bandVal(ch, x0, z0 + 1), bandVal(ch, x0 + 1, z0 + 1), fx, fz);
}

const inBand = z => band.ready && Math.abs(z / dx - (band.j0 + BAND_ROWS / 2)) <= BAND_ROWS / 2 - 3;

// { eta, h, u, v }; outside the read-back band, falls back to the 1-D channel profile
export function waterAt(x, z) {
  const river = S.river;
  const bed = terrainH(x, z);
  if (!inBand(z)) {
    const row = nearestChan(river.rows[rowOf(z)], x);
    const h = Math.max(0, row.eta - bed);
    const v = h > 0 ? Math.min(0.8 * Math.pow(h, 0.6667) * Math.sqrt(river.R.slope) / river.R.manning, 4) : 0;
    return { eta: Math.max(row.eta, bed), h, u: 0, v };
  }
  const gx = x / dx - 0.5, gz = z / dx - 0.5;
  const x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0;
  // averaged over wet corners only, so a dry neighbour doesn't drag eta down
  let wsum = 0, esum = 0;
  for (const [di, dj, wgt] of [[0, 0, (1 - fx) * (1 - fz)], [1, 0, fx * (1 - fz)], [0, 1, (1 - fx) * fz], [1, 1, fx * fz]]) {
    const i = clamp(x0 + di, 0, W - 1), j = clamp(z0 + dj, 0, L - 1), h = bandVal(0, i, j);
    if (h > SIM.hmin) {
      wsum += wgt;
      esum += wgt * (h + river.b[j * W + i]);
    }
  }
  return {
    eta: wsum > 0.05 ? Math.max(esum / wsum, bed) : bed,
    h: bilinBand(0, gx, gz),
    u: bilinBand(1, x / dx, gz),
    v: bilinBand(2, gx, z / dx),
  };
}

// nominal 1-D surface, blended toward the simulated one as a point enters the band (no pop at the edge)
export function surfaceAt(x, z) {
  const nominal = Math.max(nearestChan(S.river.rows[rowOf(z)], x).eta, terrainH(x, z));
  if (!band.ready) return nominal;
  const dj = Math.abs(z / dx - (band.j0 + BAND_ROWS / 2));
  const wgt = 1 - smoothstep(BAND_ROWS / 2 - 8, BAND_ROWS / 2 - 3.5, dj);
  return wgt <= 0 ? nominal : nominal + (waterAt(x, z).eta - nominal) * wgt;
}

// true if (x, z) sits inside a land bridge's arch or pillar — placement re-rolls such spots
export function bridgeBlocked(x, z) {
  for (const br of S.river.bridges) {
    if (Math.abs(z - br.z) > br.reach) continue;
    if (br.at(x, z) || br.at(x, z - 1.5) || br.at(x, z + 1.5)) return true;
    for (const pl of br.pillars) if (br.pillarHit(pl, x, z, 1.2)) return true;
  }
  return false;
}

// RNG call order (z, channel, x) must stay as-is — seeded layouts depend on it
export function randomChannelSpot(rng, zOf, tries = 12) {
  let x = 0, z = 0;
  for (let t = 0; t < tries; t++) {
    z = zOf(t);
    const chans = S.river.rows[rowOf(z)];
    const chan = chans[Math.floor(rng() * chans.length)];
    x = clamp(chan.c + (rng() * 1.4 - 0.7) * chan.hw, 1, W * dx - 1);
    if (!bridgeBlocked(x, z)) break;
  }
  return { x, z };
}

// ---- GPU → CPU band readback (one copy per frame, double-buffered staging) ----
export function encodeBandCopy(enc, zk) {
  const stg = gpu.staging.find(s => !s.busy);
  if (!stg) return null;
  const j0 = clamp(Math.floor(zk / dx) - BAND_ROWS / 2, 0, L - BAND_ROWS);
  enc.copyBufferToBuffer(gpu.stateBufs[0], j0 * W * 16, stg.buf, 0, gpu.bandBytes);
  stg.busy = true;
  return { stg, j0 };
}

export function finishBandCopy(req) {
  if (!req) return;
  const { stg, j0 } = req;
  stg.buf.mapAsync(GPUMapMode.READ).then(() => {
    band.data.set(new Float32Array(stg.buf.getMappedRange()));
    band.j0 = j0;
    band.ready = true;
    stg.buf.unmap();
    stg.busy = false;
  }).catch(() => { stg.busy = false; });
}