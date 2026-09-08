// Small spark bursts (pickup collected, landslide dust/splash). CPU-simulated, one instance each.
import { PICKUPS } from './config/index.js';
import { mat4TRS, clamp } from './math.js';
import { gpu, SPARK_MAX, ensureScratch } from './gpu.js';

const G = 9.81;
export const sparks = [];   // mutated in place so importers can read .length

export function spawnBurst(x, y, z, col) {
  for (let n = 0; n < PICKUPS.burstCount; n++) {
    const a = Math.random() * 2 * Math.PI, spd = 1.2 + Math.random() * 2.2;
    sparks.push({
      x, y, z,
      vx: Math.cos(a) * spd, vy: 1.5 + Math.random() * 2.0, vz: Math.sin(a) * spd,
      life: PICKUPS.burstLife, maxLife: PICKUPS.burstLife, col,
    });
  }
  if (sparks.length > SPARK_MAX) sparks.splice(0, sparks.length - SPARK_MAX);
}

export function updateSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const sp = sparks[i];
    sp.vy -= G * dt;
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.z += sp.vz * dt;
    sp.life -= dt;
    if (sp.life <= 0) sparks.splice(i, 1);
  }
  if (!sparks.length) return;
  const data = ensureScratch('spark', 'main', sparks.length * 20);
  sparks.forEach((sp, n) => {
    const t = sp.life / sp.maxLife, sc = 0.12 * (0.4 + 0.6 * t);
    data.set(mat4TRS([sp.x, sp.y, sp.z], 0, [sc, sc, sc]), n * 20);
    data.set([sp.col[0], sp.col[1], sp.col[2], clamp(t * 1.4, 0, 1)], n * 20 + 16);
  });
  gpu.device.queue.writeBuffer(gpu.sparkBuf, 0, data, 0, sparks.length * 20);
}