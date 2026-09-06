// Boat physics. step() gathers forces from a handful of single-purpose helpers via a per-tick
// context `c` (orientation helpers, accumulated force/torque) and returns the run outcome
// instead of ending the run itself, so physics never touches menus or the profile.
import { KAYAK, SIM, STAMINA, SKILL, MOBILE, OBSTACLES, UPGRADES, ITEMS } from './config.js';
import { v3, qMul, qConj, qNorm, qRotate, qAxisAngle, qFromRotVec, clamp } from './math.js';
import { ownsUpgrade } from './progression.js';
import { S } from './state.js';
import { gyro, isMobile } from './platform.js';
import { input, pad, nextPadSide } from './controls.js';
import { terrainH, terrainN, waterAt } from './sampling.js';
import { W, L, dx } from './quality.js';

const MAX_SPEED = 15;          // m/s hard cap on the boat
const CAPSIZE_PITCH = 1.35;    // rad
const HARD_HIT = 0.8;          // m/s normal speed that counts as a thud (hitFlash)

// three points along the hull used for obstacle contact — a 3.3 m boat hitting a 9 m trunk has
// to be tested at bow/centre/stern or the ends visibly sink into it, and it's what lets a hit
// swing the boat parallel to the log instead of stopping it dead
const OBST_HULL_PTS = [[0, -0.06, 1.3], [0, -0.06, 0], [0, -0.06, -1.3]];
// kayak-local points tested against a land bridge's arch underside: the paddler's head and the
// bow/stern deck — hitting the rock ceiling shoves the boat down and scrapes it, pitching it
const BRIDGE_CEIL_PTS = [[0, 1.05, 0.05], [0, 0.2, 1.55], [0, 0.2, -1.55]];

// KAYAK with the craft's (and, if owned, the better-paddle upgrade's) multiplicative mods applied
export function craftKayakParams(craft, prof) {
  const K = { ...KAYAK };
  const apply = mods => {
    for (const [k, m] of Object.entries(mods || {})) if (typeof K[k] === 'number') K[k] *= m;
  };
  apply(craft.mods);
  if (prof && ownsUpgrade(prof, 'paddle')) apply(UPGRADES.paddle.mods);
  return K;
}

// effective parameters derived from the character's traits. An active energy booster adds to
// skill here only — not to profile.skill — so it sharpens instabK/leanTorque/leanRate for its
// buffDuration without touching the saved trait.
// NOTE: reads the base KAYAK table, not S.effK — craft mods to rollInstab/formStab/leanTorque
// would not apply here. Kept as in the original; confirm whether that is intended.
export function traits() {
  const prof = S.profile;
  const buffSkill = S.simTime < S.drinkBuffUntil ? ITEMS.energyDrink.buffSkill : 0;
  const skill = (prof ? prof.skill : 0) + buffSkill;
  const stamina = prof ? prof.stamina : 0;
  return {
    skill,
    stamina,
    instabK: KAYAK.formStab + Math.max(0, KAYAK.rollInstab - SKILL.instabPerPt * skill),
    leanTorque: KAYAK.leanTorque + SKILL.leanPerPt * skill,
    drain: STAMINA.drain * (1 - STAMINA.drainPerPt * stamina),
  };
}

export const kayak = {
  p: [0, 0, 0], v: [0, 0, 0], q: [0, 0, 0, 1], wl: [0, 0, 0],
  roll: 0, pitch: 0, lean: 0,
  strokeT: 0, side: 1, paddling: false, env: 0, mode: 'fwd', hitFlash: 0, speed: 0,
  stamina: STAMINA.max, tired: false,
  blade: [0, 0, 0], bladePrev: [0, 0, 0], bladeVel: [0, 0, 0],

  reset() {
    const river = S.river;
    const j = 30, z = (j + 0.5) * dx, row = river.rows[j][0];
    const dcdz = (river.centerAt(z + 1) - river.centerAt(z - 1)) / 2;
    this.p = [row.c, row.eta + 0.06, z];
    this.q = qAxisAngle([0, 1, 0], Math.atan2(dcdz, 1));
    this.v = v3.scale(qRotate(this.q, [0, 0, 1]), 1.0);
    this.wl = [0, 0, 0];
    this.roll = 0;
    this.pitch = 0;
    this.lean = 0;
    this.strokeT = 0;
    this.side = 1;
    this.paddling = false;
    this.env = 0;
    this.hitFlash = 0;
    this.stamina = STAMINA.max;
    this.tired = false;
    // mobile stroke state
    this.strokeActive = false;
    this.lastSide = 0;
    pad.queue.length = 0;
    // smoothed copies used only for the mesh pose (see render.updateKayakInstances)
    this.visYaw = 0;
    this.visSide = 1;
    this.visAmp = 0.6;
    this.visDirn = 1;
    this.visEnv = 0;
    this.visBack = 1;
    this.blade = this.p.slice();
    this.bladePrev = this.p.slice();
    this.bladeVel = [0, 0, 0];
  },

  // mobile: start one stroke on side s. Repeating the previous side makes it a turning sweep,
  // alternating makes it a forward pull — so L R L R runs straight and L L L spins the boat.
  beginStroke(s) {
    this.mode = s === this.lastSide ? 'sweep' : 'fwd';
    this.lastSide = s;
    this.side = s;
    this.strokeT = 0;
    this.strokeActive = true;
  },

  // one physics tick; returns 'capsized' | 'finished' | null
  step(dt) {
    const c = this.beginTick();
    const subFac = this.buoyancy(c);
    this.drag(c);
    const paddleYaw = this.paddle(c, dt);
    this.updateLean(c, dt);
    this.hitFlash *= Math.exp(-dt * 4);
    this.terrainContact(c);
    this.obstacleContact(c);
    this.bridgeContact(c);
    this.integrate(c, dt, subFac, paddleYaw);
    return this.outcome(c.K);
  },

  // per-tick context: orientation helpers plus the force/torque accumulators
  beginTick() {
    const K = S.effK, q = this.q, p = this.p;
    const R = v => qRotate(q, v);
    const fwd = R([0, 0, 1]);
    const fwdH = v3.norm([fwd[0], 0, fwd[2]]);
    const wWorld = R(this.wl);
    const c = {
      K, p, q, R, fwdH,
      rightH: [fwdH[2], 0, -fwdH[0]],
      tr: traits(),
      F: [0, -K.mass * SIM.g, 0],
      T: [0, 0, 0],
      pointVel: pw => v3.add(this.v, v3.cross(wWorld, v3.sub(pw, p))),
    };
    c.addForceAt = (pw, f) => {
      c.F = v3.add(c.F, f);
      c.T = v3.add(c.T, v3.cross(v3.sub(pw, p), f));
    };
    const ul = qRotate(qConj(q), [0, 1, 0]);
    this.roll = Math.atan2(ul[0], ul[1]);
    this.pitch = Math.atan2(ul[2], ul[1]);
    return c;
  },

  // returns the submerged fraction (0…1) used to scale roll instability
  buoyancy(c) {
    const { K, p, R, addForceAt, pointVel } = c;
    let nwet = 0;
    for (const lp of K.buoyPts) {
      const pw = v3.add(p, R(lp));
      const s = waterAt(pw[0], pw[2]).eta - pw[1];
      if (s <= 0) continue;
      const vp = pointVel(pw);
      addForceAt(pw, [0, Math.max(0, K.buoyK * s - K.buoyDamp * vp[1]), 0]);
      nwet++;
    }
    return clamp(nwet / 4, 0, 1);
  },

  // hydrodynamic drag relative to the local current
  drag(c) {
    const { K, p, R, fwdH, rightH, addForceAt, pointVel } = c;
    for (const lp of K.dragPts) {
      const pw = v3.add(p, R(lp)), w = waterAt(pw[0], pw[2]), vp = pointVel(pw);
      const rel = [vp[0] - w.u, 0, vp[2] - w.v];
      const va = v3.dot(rel, fwdH), vl = v3.dot(rel, rightH);
      const fac = clamp(w.h / 0.15, 0, 1) * clamp((w.eta - pw[1] + 0.15) / 0.15, 0, 1);
      const along = v3.scale(fwdH, -K.dragAlong * 0.5 * va * Math.abs(va));
      const lateral = v3.scale(rightH, -(K.dragLat * 0.5 * vl * Math.abs(vl) + K.dragLatLin * 0.5 * vl));
      const fd = v3.scale(v3.add(along, lateral), fac);
      fd[1] = -25 * vp[1] * fac;
      addForceAt(pw, fd);
    }
  },

  // desktop keys → continuous strokes, mobile pads → one stroke per tap. Returns the yaw torque.
  paddle(c, dt) {
    const { active, turn } = this.paddleInput();
    const { power, period } = this.updateStamina(dt, active, c.tr);
    if (!active) {
      this.paddling = false;
      this.env *= Math.exp(-dt * 8);
      return 0;
    }
    return isMobile
      ? this.mobileStroke(c, dt, power, period)
      : this.desktopStroke(c, dt, power, period, turn);
  },

  paddleInput() {
    if (isMobile) {
      if (!this.strokeActive) {
        const next = nextPadSide(this.side);
        if (next !== 0) this.beginStroke(next);
      }
      return { active: this.strokeActive, turn: 0 };
    }
    const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    return { active: input.fwd || input.back || turn !== 0, turn };
  },

  // regenerates 0 → full in regenTime, drains while paddling; tired → weaker, slower strokes
  updateStamina(dt, active, tr) {
    this.stamina += dt * STAMINA.max / STAMINA.regenTime;
    if (active) this.stamina -= dt * tr.drain;
    this.stamina = clamp(this.stamina, 0, STAMINA.max);
    this.tired = this.stamina < STAMINA.max * STAMINA.tiredFrac;
    return {
      power: this.tired ? STAMINA.tiredPower : 1,
      period: S.effK.strokePeriod * (this.tired ? STAMINA.tiredStroke : 1),
    };
  },

  mobileStroke(c, dt, power, period) {
    const { K, p, R, fwdH, addForceAt } = c;
    this.paddling = true;
    this.strokeT += dt / period;
    this.env = Math.sin(Math.PI * Math.min(this.strokeT, 1));
    const s = this.side, at = v3.add(p, R([s * 0.25, 0, 0.3]));
    let paddleYaw = 0;
    if (this.mode === 'sweep') {   // same side again: a turning stroke (see beginStroke)
      paddleYaw = -s * K.sweepTorque * MOBILE.repeatYaw * power * (0.5 + 0.5 * this.env);
      addForceAt(at, v3.scale(fwdH, K.paddleFwd * MOBILE.repeatFwd * power * this.env));
    } else {
      addForceAt(at, v3.scale(fwdH, K.paddleFwd * power * this.env));
    }
    // stroke finished: the paddle is now poised over the other side (the same flip the desktop
    // loop does — it keeps the drawn paddle angle continuous); next tick decides what follows
    if (this.strokeT >= 1) {
      this.strokeT = 0;
      this.strokeActive = false;
      this.side = -s;
    }
    return paddleYaw;
  },

  desktopStroke(c, dt, power, period, turn) {
    const { K, p, R, fwdH, addForceAt } = c;
    if (!this.paddling) this.strokeT = 0;   // keys just came back → a fresh stroke
    this.paddling = true;
    this.strokeT += dt / period;
    if (this.strokeT >= 1) {
      this.strokeT -= 1;
      this.side = turn !== 0 ? -turn : -this.side;
    }
    if (turn !== 0 && this.strokeT < 0.05) this.side = -turn;
    this.env = Math.sin(Math.PI * this.strokeT);
    this.mode = input.back && !input.fwd ? 'back' : turn !== 0 ? 'sweep' : 'fwd';
    if (input.fwd) {
      addForceAt(v3.add(p, R([this.side * 0.25, 0, 0.3])), v3.scale(fwdH, K.paddleFwd * power * this.env));
    } else if (input.back) {
      addForceAt(v3.add(p, R([this.side * 0.25, 0, -0.3])), v3.scale(fwdH, -K.paddleBack * power * this.env));
    }
    if (turn === 0) return 0;
    // a pure sweep also nudges the boat forward a little (no torque, so added to F directly)
    if (!input.fwd && !input.back) c.F = v3.add(c.F, v3.scale(fwdH, K.sweepFwd * power * this.env * 0.5));
    return turn * K.sweepTorque * power * (0.5 + 0.5 * this.env) * (input.fwd ? 0.7 : 1);
  },

  // A/D give a binary target, the device tilt an analog one. Keys win while pressed, so a
  // forced-mobile desktop session (or a phone without a sensor) can still lean.
  updateLean(c, dt) {
    const keyLean = (input.leanL ? 1 : 0) - (input.leanR ? 1 : 0);
    const useTilt = isMobile && keyLean === 0 && gyro.live();
    const target = useTilt ? gyro.lean() : keyLean;
    // key-driven leaning reacts a little faster with more skill (tilt is a physical sensor
    // reading, not a trained reflex, so it's left at MOBILE.leanRate regardless of skill)
    const rate = useTilt ? MOBILE.leanRate : c.K.leanRate + SKILL.leanRatePerPt * c.tr.skill;
    this.lean += (target - this.lean) * Math.min(1, dt * rate);
  },

  terrainContact(c) {
    const { K, p, R, addForceAt, pointVel } = c;
    for (const lp of K.collPts) {
      const pw = v3.add(p, R(lp)), tb = terrainH(pw[0], pw[2]);
      if (pw[1] >= tb) continue;
      const pen = tb - pw[1], n = terrainN(pw[0], pw[2]), vp = pointVel(pw), vn = v3.dot(vp, n);
      let fc = v3.scale(n, K.collK * pen - K.collDamp * Math.min(vn, 0));
      fc = v3.sub(fc, v3.scale(v3.sub(vp, v3.scale(n, vn)), K.collFric));
      addForceAt(pw, fc);
      if (-vn > HARD_HIT) this.hitFlash = 1;
    }
  },

  // capsule contact against nearby floating obstacles (broad phase: river.obstNear, built by
  // obstacles.updateObstacles). The reaction is fed back to the log at the contact point.
  obstacleContact(c) {
    const { K, p, R, addForceAt, pointVel } = c;
    if (!S.river.obstNear) return;
    const kf = 1 / S.frameTicks;   // contact runs once per kayak tick, the log consumes it once per frame
    for (const ob of S.river.obstNear) {
      const dirx = Math.sin(ob.yaw), dirz = Math.cos(ob.yaw), half = ob.len / 2;
      const Rr = ob.rad + OBSTACLES.hullR;
      for (const lp of OBST_HULL_PTS) {
        const pw = v3.add(p, R(lp));
        const tt = clamp((pw[0] - ob.x) * dirx + (pw[2] - ob.z) * dirz, -half, half);
        const cx = ob.x + dirx * tt, cz = ob.z + dirz * tt;
        let ddx = pw[0] - cx, ddz = pw[2] - cz, d = Math.hypot(ddx, ddz);
        if (d >= Rr) continue;
        if (d < 1e-4) { ddx = 1; ddz = 0; d = 1e-4; }
        const nx = ddx / d, nz = ddz / d, pen = Rr - d;
        const vp = pointVel(pw);
        const vn = (vp[0] - ob.vx) * nx + (vp[2] - ob.vz) * nz;
        const fn = Math.max(0, ob.hitK * (K.collK * pen - K.collDamp * Math.min(vn, 0)));
        const f = [nx * fn, ob.lift * fn, nz * fn];
        addForceAt(pw, f);
        ob.fx -= f[0] * kf;
        ob.fz -= f[2] * kf;
        ob.tq -= ((cz - ob.z) * f[0] - (cx - ob.x) * f[2]) * kf;
        if (-vn > HARD_HIT && ob.hitK > 0.5) this.hitFlash = 1;
      }
    }
  },

  bridgeContact(c) {
    const { K, p, R, addForceAt, pointVel } = c;
    for (const br of S.river.bridges) {
      if (Math.abs(p[2] - br.z) > br.reach + 3) continue;
      // pillars: horizontal capsule contact
      for (const pl of br.pillars) {
        for (const lp of K.collPts) {
          const pw = v3.add(p, R(lp));
          const hit = br.pillarHit(pl, pw[0], pw[2], OBSTACLES.hullR);
          if (!hit) continue;
          const { nx, nz, pen } = hit, vp = pointVel(pw), vn = vp[0] * nx + vp[2] * nz;
          const fn = K.collK * pen - K.collDamp * Math.min(vn, 0);
          let fc = [nx * fn, 0, nz * fn];
          fc = v3.sub(fc, v3.scale([vp[0] - vn * nx, 0, vp[2] - vn * nz], K.collFric));
          addForceAt(pw, fc);
          if (-vn > HARD_HIT) this.hitFlash = 1;
        }
      }
      // arch ceiling: pushes down, scrapes along the rock
      for (const lp of BRIDGE_CEIL_PTS) {
        const pw = v3.add(p, R(lp)), d = br.at(pw[0], pw[2]);
        if (!d || pw[1] <= d.bottom) continue;
        const pen = pw[1] - d.bottom, vp = pointVel(pw);
        let fc = [0, -(K.collK * pen + K.collDamp * Math.max(vp[1], 0)), 0];
        fc = v3.sub(fc, v3.scale([vp[0], 0, vp[2]], K.collFric * 2));
        addForceAt(pw, fc);
        if (vp[1] > 0.5 || pen > 0.15) this.hitFlash = 1;
      }
    }
  },

  // roll is an inverted pendulum; skill lowers instability and raises hip torque
  integrate(c, dt, subFac, paddleYaw) {
    const { K, q, p, F, T, tr } = c;
    const Tl = qRotate(qConj(q), T);
    const grace = S.runTime < K.startGrace ? 1 - S.runTime / K.startGrace : 0;
    Tl[2] += tr.instabK * Math.sin(this.roll) * subFac
      - K.rollDamp * this.wl[2]
      - this.lean * tr.leanTorque
      - grace * K.graceStab * this.roll;
    Tl[1] += paddleYaw - K.yawDamp * this.wl[1];
    Tl[0] += -K.pitchDamp * this.wl[0];
    for (let a = 0; a < 3; a++) this.wl[a] += Tl[a] / K.inertia[a] * dt;

    this.v = v3.add(this.v, v3.scale(F, dt / K.mass));
    const sp = v3.len(this.v);
    if (sp > MAX_SPEED) this.v = v3.scale(this.v, MAX_SPEED / sp);
    this.p = v3.add(p, v3.scale(this.v, dt));
    this.p[0] = clamp(this.p[0], 1, W * dx - 1);
    this.p[2] = clamp(this.p[2], 1, L * dx - 1);
    this.q = qNorm(qMul(q, qFromRotVec(v3.scale(this.wl, dt))));
    this.speed = Math.hypot(this.v[0], this.v[2]);
  },

  outcome(K) {
    if (!S.debugNoCapsize && (Math.abs(this.roll) > K.capsize || Math.abs(this.pitch) > CAPSIZE_PITCH)) return 'capsized';
    if (this.p[2] > S.river.finishZ) return 'finished';
    return null;
  },
};