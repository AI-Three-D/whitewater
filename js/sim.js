// Driving the GPU water and particle simulation: uniform packing, dispatch, warm-up.
import { SIM, PARTS, RENDER } from './config/index.js';
import { v3, qRotate, clamp } from './math.js';
import { S } from './state.js';
import { gpu } from './gpu.js';
import { waterAt } from './sampling.js';
import { kayak } from './kayak.js';
import { W, L, dx } from './quality.js';

const simUAb = new ArrayBuffer(112), simUF = new Float32Array(simUAb), simUU = new Uint32Array(simUAb);
export function writeSimUniforms(time, inQ, jOffset = 0) {
  const river = S.river, vx = river.R.vortex;
  const ab = simUAb, f = simUF, u = simUU;
  u[0] = W; u[1] = L;
  f.set([dx, SIM.dt, SIM.g, river.R.manning, SIM.hmin, SIM.umax], 2);
  f.set([time, river.inEta, inQ, river.inVelScale], 8);
  f.set([SIM.turbA, SIM.turbL, SIM.turbT, SIM.foamDecay], 12);
  f.set([SIM.kDecay, SIM.macCormack, SIM.kGen, SIM.foamGen], 16);
  f[20] = jOffset;
  f.set(vx ? [vx.x, vx.z, vx.strength, vx.radius] : [0, 0, 0, 0], 21);
  gpu.device.queue.writeBuffer(gpu.simUBuf, 0, ab);
}

// slowly varying inflow discharge multiplier
export const inflowQ = t => 1 + 0.06 * Math.sin(0.21 * t) + 0.04 * Math.sin(0.53 * t + 1) + 0.025 * Math.sin(1.3 * t + 2);

// rows of the grid the water sim is run on this frame: a window around the boat
export function computeWindow(zk) {
  const cj0 = clamp(Math.floor((zk - RENDER.computeBehind) / dx), 0, L - 1);
  const cj1 = clamp(Math.ceil((zk + RENDER.computeAhead) / dx), cj0 + 1, L);
  return { cj0, rows: cj1 - cj0 };
}

export function encodeSubstep(enc, rows = L) {
  const pass = enc.beginComputePass();
  for (let k = 0; k < 3; k++) {
    pass.setPipeline(gpu.simPipes[k]);
    pass.setBindGroup(0, gpu.simBGs[k]);
    pass.dispatchWorkgroups(W / 8, Math.ceil(rows / 8));
  }
  pass.end();
}

export function encodeWaterSim(enc, rows) {
  for (let s = 0; s < SIM.substeps; s++) encodeSubstep(enc, rows);
}

export function encodeParticleSim(enc) {
  const pass = enc.beginComputePass();
  pass.setPipeline(gpu.partPipe);
  pass.setBindGroup(0, gpu.partBG);
  pass.dispatchWorkgroups(Math.ceil(PARTS.count / 64));
  pass.end();
}

// settle the water before a run starts, in chunks so the queue never gets a huge single submit
export async function runWarmup() {
  const chunk = 30;
  for (let s = 0; s < SIM.warmupSteps; s += chunk) {
    const enc = gpu.device.createCommandEncoder();
    const n = Math.min(chunk, SIM.warmupSteps - s);
    for (let k = 0; k < n; k++) encodeSubstep(enc);
    gpu.device.queue.submit([enc.finish()]);
    await gpu.device.queue.onSubmittedWorkDone();
  }
}

// spray emitters: ambient, bow wave (speed relative to the water, plus thuds) and the paddle blade
const partUF = new Float32Array(28);   // reused every frame; writeBuffer copies out synchronously
export function writeParticleUniforms(dtReal) {
  const k = kayak, t = S.simTime;
  const wB = waterAt(k.p[0], k.p[2]);
  const f = qRotate(k.q, [0, 0, 1]), fwdH = v3.norm([f[0], 0.001, f[2]]);
  const relSpd = Math.hypot(k.v[0] - wB.u, k.v[2] - wB.v);
  const bowP = v3.add(k.p, v3.scale(fwdH, 1.45));
  const wBow = waterAt(bowP[0], bowP[2]);
  const bowProb = clamp((relSpd - 1.4) * 0.02, 0, 0.07) * (wBow.h > 0.1 ? 1 : 0) + k.hitFlash * 0.12;
  const bl = k.blade, wBl = waterAt(bl[0], bl[2]);
  const bladeWet = k.paddling && bl[1] < wBl.eta + 0.05 && wBl.h > 0.1;
  const padProb = bladeWet ? 0.05 * k.env * (k.tired ? 0.5 : 1) : 0;
  const pu = partUF;
  pu.set([W, L, dx, dtReal], 0);
  pu.set([t, SIM.hmin, PARTS.kayakShare, PARTS.ambient], 4);
  pu.set([k.p[0], k.p[1], k.p[2], PARTS.ambient], 8);
  pu.set([bowP[0], wBow.eta + 0.05, bowP[2], bowProb], 12);
  pu.set([k.v[0] * 0.35, 0.2, k.v[2] * 0.35, 0], 16);
  pu.set([bl[0], Math.min(bl[1], wBl.eta), bl[2], padProb], 20);
  pu.set([k.bladeVel[0] * 0.25, 0.25, k.bladeVel[2] * 0.25, 0], 24);
  gpu.device.queue.writeBuffer(gpu.partUBuf, 0, pu);
}