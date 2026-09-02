export const WGSL_NOISE = /* wgsl */`
fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
fn hash31(p: vec3f) -> f32 {
  var p3 = fract(p * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
fn noise2(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i); let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0)); let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn noise3(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let n000 = hash31(i); let n100 = hash31(i + vec3f(1.0,0.0,0.0));
  let n010 = hash31(i + vec3f(0.0,1.0,0.0)); let n110 = hash31(i + vec3f(1.0,1.0,0.0));
  let n001 = hash31(i + vec3f(0.0,0.0,1.0)); let n101 = hash31(i + vec3f(1.0,0.0,1.0));
  let n011 = hash31(i + vec3f(0.0,1.0,1.0)); let n111 = hash31(i + vec3f(1.0,1.0,1.0));
  return mix(mix(mix(n000,n100,u.x), mix(n010,n110,u.x), u.y),
             mix(mix(n001,n101,u.x), mix(n011,n111,u.x), u.y), u.z);
}
`;

export const WGSL_SIM = WGSL_NOISE + /* wgsl */`
struct SimU {
  W: u32, L: u32, dx: f32, dt: f32,
  g: f32, manning: f32, hmin: f32, umax: f32,
  time: f32, inEta: f32, inQ: f32, inVelScale: f32,
  turbA: f32, turbL: f32, turbT: f32, foamDecay: f32,
  kDecay: f32, macCormack: f32, kGen: f32, foamGen: f32,
  jOffset: f32, p1: f32, p2: f32, p3: f32,   // jOffset: first row of this dispatch's moving compute window
};
@group(0) @binding(0) var<uniform> P: SimU;
@group(0) @binding(1) var<storage, read> B: array<f32>;
@group(0) @binding(2) var<storage, read> SI: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> SO: array<vec4f>;
@group(0) @binding(4) var<storage, read> KI: array<f32>;
@group(0) @binding(5) var<storage, read_write> KO: array<f32>;
fn ci(i: i32, j: i32) -> u32 {
  let ii = clamp(i, 0, i32(P.W) - 1);
  let jj = clamp(j, 0, i32(P.L) - 1);
  return u32(jj) * P.W + u32(ii);
}
fn bilinU(gx: f32, gy: f32) -> f32 {
  let x0 = floor(gx); let y0 = floor(gy); let fx = gx - x0; let fy = gy - y0;
  let i0 = i32(x0); let j0 = i32(y0);
  return mix(mix(SI[ci(i0,j0)].y, SI[ci(i0+1,j0)].y, fx), mix(SI[ci(i0,j0+1)].y, SI[ci(i0+1,j0+1)].y, fx), fy);
}
fn bilinV(gx: f32, gy: f32) -> f32 {
  let x0 = floor(gx); let y0 = floor(gy); let fx = gx - x0; let fy = gy - y0;
  let i0 = i32(x0); let j0 = i32(y0);
  return mix(mix(SI[ci(i0,j0)].z, SI[ci(i0+1,j0)].z, fx), mix(SI[ci(i0,j0+1)].z, SI[ci(i0+1,j0+1)].z, fx), fy);
}
fn bilinF(gx: f32, gy: f32) -> f32 {
  let x0 = floor(gx); let y0 = floor(gy); let fx = gx - x0; let fy = gy - y0;
  let i0 = i32(x0); let j0 = i32(y0);
  return mix(mix(SI[ci(i0,j0)].w, SI[ci(i0+1,j0)].w, fx), mix(SI[ci(i0,j0+1)].w, SI[ci(i0+1,j0+1)].w, fx), fy);
}
fn bilinK(gx: f32, gy: f32) -> f32 {
  let x0 = floor(gx); let y0 = floor(gy); let fx = gx - x0; let fy = gy - y0;
  let i0 = i32(x0); let j0 = i32(y0);
  return mix(mix(KI[ci(i0,j0)], KI[ci(i0+1,j0)], fx), mix(KI[ci(i0,j0+1)], KI[ci(i0+1,j0+1)], fx), fy);
}
fn velAt(p: vec2f) -> vec2f {
  return vec2f(bilinU(p.x / P.dx, p.y / P.dx - 0.5), bilinV(p.x / P.dx - 0.5, p.y / P.dx));
}
fn facePosU(i: i32, j: i32) -> vec2f { return vec2f(f32(i) * P.dx, (f32(j) + 0.5) * P.dx); }
fn facePosV(i: i32, j: i32) -> vec2f { return vec2f((f32(i) + 0.5) * P.dx, f32(j) * P.dx); }
fn advU(p: vec2f) -> f32 { let pb = p - P.dt * velAt(p); return bilinU(pb.x / P.dx, pb.y / P.dx - 0.5); }
fn advV(p: vec2f) -> f32 { let pb = p - P.dt * velAt(p); return bilinV(pb.x / P.dx - 0.5, pb.y / P.dx); }
@compute @workgroup_size(8, 8)
fn advect(@builtin(global_invocation_id) gid: vec3u) {
  let i = i32(gid.x); let j = i32(gid.y) + i32(P.jOffset);
  if (i >= i32(P.W) || j >= i32(P.L)) { return; }
  let id = ci(i, j);
  let s = SI[id];
  let dx = P.dx; let dt = P.dt;
  let pu = facePosU(i, j);
  var u = advU(pu);
  let pv = facePosV(i, j);
  var v = advV(pv);
  if (P.macCormack > 0.5) {
    let vu = velAt(pu);
    let pf = pu + dt * vu;
    var gx = pf.x / dx; var gy = pf.y / dx - 0.5;
    var x0 = floor(gx); var y0 = floor(gy); var fx = gx - x0; var fy = gy - y0;
    var i0 = i32(x0); var j0 = i32(y0);
    let ub = mix(mix(advU(facePosU(i0,j0)), advU(facePosU(i0+1,j0)), fx),
                 mix(advU(facePosU(i0,j0+1)), advU(facePosU(i0+1,j0+1)), fx), fy);
    let pb = pu - dt * vu;
    let bi = i32(floor(pb.x / dx)); let bj = i32(floor(pb.y / dx - 0.5));
    let a0 = SI[ci(bi,bj)].y; let a1 = SI[ci(bi+1,bj)].y; let a2 = SI[ci(bi,bj+1)].y; let a3 = SI[ci(bi+1,bj+1)].y;
    u = clamp(u + 0.5 * (s.y - ub), min(min(a0,a1),min(a2,a3)), max(max(a0,a1),max(a2,a3)));
    let vv = velAt(pv);
    let pfv = pv + dt * vv;
    gx = pfv.x / dx - 0.5; gy = pfv.y / dx;
    x0 = floor(gx); y0 = floor(gy); fx = gx - x0; fy = gy - y0; i0 = i32(x0); j0 = i32(y0);
    let vb = mix(mix(advV(facePosV(i0,j0)), advV(facePosV(i0+1,j0)), fx),
                 mix(advV(facePosV(i0,j0+1)), advV(facePosV(i0+1,j0+1)), fx), fy);
    let pbv = pv - dt * vv;
    let q0 = i32(floor(pbv.x / dx - 0.5)); let q1 = i32(floor(pbv.y / dx));
    let c0 = SI[ci(q0,q1)].z; let c1 = SI[ci(q0+1,q1)].z; let c2 = SI[ci(q0,q1+1)].z; let c3 = SI[ci(q0+1,q1+1)].z;
    v = clamp(v + 0.5 * (s.z - vb), min(min(c0,c1),min(c2,c3)), max(max(c0,c1),max(c2,c3)));
  }
  let pc = vec2f((f32(i) + 0.5) * dx, (f32(j) + 0.5) * dx);
  let pcb = pc - dt * velAt(pc);
  let gcx = pcb.x / dx - 0.5; let gcy = pcb.y / dx - 0.5;
  SO[id] = vec4f(s.x, u, v, bilinF(gcx, gcy));
  KO[id] = bilinK(gcx, gcy);
}
fn outScale(i: i32, j: i32) -> f32 {
  let s = SI[ci(i, j)];
  var uR = SI[ci(i+1, j)].y; if (i >= i32(P.W) - 1) { uR = 0.0; }
  var uL = s.y;              if (i <= 0) { uL = 0.0; }
  var vT = SI[ci(i, j+1)].z; if (j >= i32(P.L) - 1) { vT = s.z; }
  let vB = s.z;
  let outf = max(uR, 0.0) + max(-uL, 0.0) + max(vT, 0.0) + max(-vB, 0.0);
  let lim = 0.8 * P.dx / P.dt;
  return select(1.0, lim / outf, outf > lim);
}
@compute @workgroup_size(8, 8)
fn height(@builtin(global_invocation_id) gid: vec3u) {
  let i = i32(gid.x); let j = i32(gid.y) + i32(P.jOffset);
  if (i >= i32(P.W) || j >= i32(P.L)) { return; }
  let id = ci(i, j);
  let s = SI[id];
  let h = s.x;
  var uL = s.y;              if (i == 0) { uL = 0.0; }
  var uR = SI[ci(i+1, j)].y; if (i == i32(P.W) - 1) { uR = 0.0; }
  let vB = s.z;
  var vT = SI[ci(i, j+1)].z; if (j == i32(P.L) - 1) { vT = s.z; }
  let hL = SI[ci(i-1, j)].x; let hR = SI[ci(i+1, j)].x;
  let hB = SI[ci(i, j-1)].x; let hT = SI[ci(i, j+1)].x;
  let sc = outScale(i, j);
  let FL = select(uL * h * sc, uL * hL * outScale(i-1, j), uL > 0.0);
  let FR = select(uR * hR * outScale(i+1, j), uR * h * sc, uR > 0.0);
  let FB = select(vB * h * sc, vB * hB * outScale(i, j-1), vB > 0.0);
  let FT = select(vT * hT * outScale(i, j+1), vT * h * sc, vT > 0.0);
  SO[id] = vec4f(max(0.0, h - P.dt / P.dx * (FR - FL + FT - FB)), s.y, s.z, s.w);
  KO[id] = KI[id];
}
fn noiseGrad(p: vec2f, t: f32) -> vec2f {
  let e = 0.02;
  let n = vec3f(p / P.turbL, t / P.turbT);
  let n2 = vec3f(p / (P.turbL * 0.45) + vec2f(17.3, 9.1), t / (P.turbT * 0.6));
  let px = (noise3(n + vec3f(e,0.0,0.0)) - noise3(n - vec3f(e,0.0,0.0))) / (2.0 * e)
         + 0.5 * (noise3(n2 + vec3f(e,0.0,0.0)) - noise3(n2 - vec3f(e,0.0,0.0))) / (2.0 * e);
  let py = (noise3(n + vec3f(0.0,e,0.0)) - noise3(n - vec3f(0.0,e,0.0))) / (2.0 * e)
         + 0.5 * (noise3(n2 + vec3f(0.0,e,0.0)) - noise3(n2 - vec3f(0.0,e,0.0))) / (2.0 * e);
  return vec2f(px, py);
}
@compute @workgroup_size(8, 8)
fn momentum(@builtin(global_invocation_id) gid: vec3u) {
  let i = i32(gid.x); let j = i32(gid.y) + i32(P.jOffset);
  if (i >= i32(P.W) || j >= i32(P.L)) { return; }
  let id = ci(i, j);
  let s = SI[id];
  let h = s.x; let b = B[id];
  let dx = P.dx; let dt = P.dt; let g = P.g;
  // inflow: prescribed level, velocity from the target discharge (see inVelScale)
  if (j <= 1) {
    let hin = max(0.0, P.inEta - b);
    var vin = 0.0; var hh = hin;
    if (hin > 0.05) { vin = P.inQ * P.inVelScale * pow(hin, 0.6667); } else { hh = 0.0; }
    SO[id] = vec4f(hh, 0.0, vin, 0.0);
    KO[id] = 0.12;
    return;
  }
  let sL = SI[ci(i-1, j)]; let hL = sL.x; let bL = B[ci(i-1, j)];
  var u = s.y;
  if (i == 0) { u = 0.0; } else {
    let wetL = hL > P.hmin; let wetR = h > P.hmin;
    let etaL = bL + hL; let etaR = b + h;
    if (!wetL && !wetR) { u = 0.0; }
    else if (wetL && wetR) { u -= g * dt * (etaR - etaL) / dx; }
    else if (wetL) { if (etaL <= b) { u = 0.0; } else { u -= g * dt * (b - etaL) / dx; u = max(u, 0.0); } }
    else { if (etaR <= bL) { u = 0.0; } else { u -= g * dt * (etaR - bL) / dx; u = min(u, 0.0); } }
    let vavg = 0.25 * (sL.z + SI[ci(i-1, j+1)].z + s.z + SI[ci(i, j+1)].z);
    let hf = max(0.5 * (hL + h), P.hmin);
    let spd = sqrt(u * u + vavg * vavg);
    u = u / (1.0 + dt * g * P.manning * P.manning * spd / pow(hf, 1.3333));
    let kf = 0.5 * (KI[ci(i-1, j)] + KI[id]);
    if (P.turbA > 1e-4 && kf > 0.02 && wetL && wetR) {
      let gr = noiseGrad(facePosU(i, j), P.time);
      u += dt * P.turbA * clamp(kf, 0.0, 1.0) * gr.y;
    }
    u = clamp(u, -P.umax, P.umax);
  }
  let sB = SI[ci(i, j-1)]; let hB = sB.x; let bB = B[ci(i, j-1)];
  var v = s.z;
  {
    let wetB = hB > P.hmin; let wetT = h > P.hmin;
    let etaB = bB + hB; let etaT = b + h;
    if (!wetB && !wetT) { v = 0.0; }
    else if (wetB && wetT) { v -= g * dt * (etaT - etaB) / dx; }
    else if (wetB) { if (etaB <= b) { v = 0.0; } else { v -= g * dt * (b - etaB) / dx; v = max(v, 0.0); } }
    else { if (etaT <= bB) { v = 0.0; } else { v -= g * dt * (etaT - bB) / dx; v = min(v, 0.0); } }
    let uavg = 0.25 * (sB.y + SI[ci(i+1, j-1)].y + s.y + SI[ci(i+1, j)].y);
    let hf = max(0.5 * (hB + h), P.hmin);
    let spd = sqrt(v * v + uavg * uavg);
    v = v / (1.0 + dt * g * P.manning * P.manning * spd / pow(hf, 1.3333));
    let kf = 0.5 * (KI[ci(i, j-1)] + KI[id]);
    if (P.turbA > 1e-4 && kf > 0.02 && wetB && wetT) {
      let gr = noiseGrad(facePosV(i, j), P.time);
      v += dt * P.turbA * clamp(kf, 0.0, 1.0) * (-gr.x);
    }
    v = clamp(v, -P.umax, P.umax);
  }
  var foam = s.w; var k = KI[id];
  if (h > P.hmin) {
    let sR = SI[ci(i+1, j)]; let sT = SI[ci(i, j+1)];
    let bR = B[ci(i+1, j)]; let bT = B[ci(i, j+1)];
    let uc = 0.5 * (s.y + sR.y); let vc = 0.5 * (s.z + sT.z);
    let spd = length(vec2f(uc, vc));
    let Fr = spd / sqrt(g * h);
    let div = (sR.y - s.y + sT.z - s.z) / dx;
    let dudy = (sT.y - sB.y) / (2.0 * dx);
    let dvdx = (sR.z - sL.z) / (2.0 * dx);
    let shear = abs(dudy) + abs(dvdx);
    let eta = b + h;
    var rock = 0.0;
    if ((sR.x <= P.hmin && bR > eta) || (hL <= P.hmin && bL > eta) || (sT.x <= P.hmin && bT > eta) || (hB <= P.hmin && bB > eta)) { rock = 1.0; }
    let eR = select(eta, bR + sR.x, sR.x > P.hmin); let eL2 = select(eta, bL + hL, hL > P.hmin);
    let eT = select(eta, bT + sT.x, sT.x > P.hmin); let eB2 = select(eta, bB + hB, hB > P.hmin);
    let slopeMag = length(vec2f(eR - eL2, eT - eB2)) / (2.0 * dx);
    let foamSrc = P.foamGen * (max(0.0, Fr - 0.8) * 1.2 + max(0.0, -div) * 0.6
                               + max(0.0, slopeMag - 0.15) * 3.0 + rock * 0.8 * min(spd, 3.0) / 3.0);
    foam = min(1.5, foam * exp(-P.foamDecay * dt) + dt * foamSrc);
    let kSrc = P.kGen * (shear * 0.4 + max(0.0, Fr - 0.6) * 0.6 + rock * 0.8 + max(0.0, -div) * 0.5
                         + 0.12 * min(spd * spd / 16.0, 1.0));
    k = min(1.0, k * exp(-P.kDecay * dt) + dt * kSrc);
  } else { foam *= 0.9; k *= 0.8; }
  SO[id] = vec4f(h, u, v, foam);
  KO[id] = k;
}
`;

export const WGSL_PART_SIM = WGSL_NOISE + /* wgsl */`
struct Particle { pos: vec3f, life: f32, vel: vec3f, size: f32 };
struct PU {
  gridW: f32, gridL: f32, dx: f32, dt: f32,
  time: f32, hmin: f32, nKayak: f32, ambient: f32,
  center: vec4f, bow: vec4f, bowVel: vec4f, paddle: vec4f, paddleVel: vec4f,
};
@group(0) @binding(0) var<uniform> U: PU;
@group(0) @binding(1) var<storage, read> TB: array<f32>;
@group(0) @binding(2) var<storage, read> ST: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> PT: array<Particle>;
fn pci(i: i32, j: i32) -> u32 {
  let W = i32(U.gridW); let L = i32(U.gridL);
  return u32(clamp(j, 0, L - 1)) * u32(W) + u32(clamp(i, 0, W - 1));
}
fn rnd(i: u32, k: f32) -> f32 {
  return hash31(vec3f(f32(i) * 0.0137 + k * 7.13, U.time * 2.17 + k * 1.91, k * 3.77 + 0.5));
}
@compute @workgroup_size(64)
fn psim(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&PT)) { return; }
  var p = PT[i];
  let dt = U.dt;
  if (p.life > 0.0) {
    p.life = p.life - dt;
    p.vel.y = p.vel.y - 9.81 * dt;        // gravity
    p.vel = p.vel * exp(-1.8 * dt);       // air drag
    p.pos = p.pos + p.vel * dt;
    let id = pci(i32(floor(p.pos.x / U.dx - 0.5)), i32(floor(p.pos.z / U.dx - 0.5)));
    if (p.pos.y < TB[id] + ST[id].x) { p.life = 0.0; }   // fell back into the water / ground
  } else if (f32(i) < U.nKayak) {
    // kayak emitters: even indices = bow spray, odd = paddle blade splash
    let useBow = (i % 2u) == 0u;
    let em = select(U.paddle, U.bow, useBow);
    let ev = select(U.paddleVel, U.bowVel, useBow);
    if (em.w > 0.0 && rnd(i, 1.0) < em.w) {
      p.pos = em.xyz + (vec3f(rnd(i,2.0), rnd(i,3.0), rnd(i,4.0)) - 0.5) * 0.30;
      p.vel = ev.xyz * (0.4 + 0.4 * rnd(i,5.0))
            + vec3f((rnd(i,6.0) - 0.5) * 1.0, 0.35 + 0.75 * rnd(i,7.0), (rnd(i,8.0) - 0.5) * 1.0);
      p.life = 0.18 + 0.32 * rnd(i, 9.0);
      p.size = 0.018 + 0.03 * rnd(i, 10.0);
    }
  } else if (rnd(i, 11.0) < U.ambient) {
    // ambient whitewater spray: pick a random cell near the boat, spawn only if it is foaming
    let px = U.center.x + (rnd(i, 12.0) - 0.5) * 44.0;
    let pz = U.center.z + (rnd(i, 13.0) - 0.28) * 80.0;
    let id = pci(i32(floor(px / U.dx - 0.5)), i32(floor(pz / U.dx - 0.5)));
    let s = ST[id];
    if (s.x > 0.08 && s.w > 0.5) {
      p.pos = vec3f(px, TB[id] + s.x, pz);
      let burst = 0.5 + 1.8 * min(s.w, 1.2) * rnd(i, 14.0);
      p.vel = vec3f(s.y * 0.8 + (rnd(i,15.0) - 0.5) * 1.2, burst, s.z * 0.8 + (rnd(i,16.0) - 0.5) * 1.2);
      p.life = 0.35 + 0.80 * rnd(i, 17.0);
      p.size = 0.04 + 0.09 * rnd(i, 18.0);
    }
  }
  PT[i] = p;
}
`;

const WGSL_RENDER_COMMON = WGSL_NOISE + /* wgsl */`
struct Cam { vp: mat4x4f, ivp: mat4x4f, camPos: vec4f, sunDir: vec4f, prm: vec4f, fog: vec4f, dbg: vec4f,
             camRight: vec4f, camUp: vec4f,
             water: vec4f,   // per-river water look: tint.rgb multiplies the water colour, .a is clarity
                              // (>1 = see deeper/clearer, <1 = murkier — scales the absorption falloff)
             env: vec4f };    // .x = biome id, selecting a terrain/prop palette (see fsTerrain)
@group(0) @binding(0) var<uniform> C: Cam;
@group(0) @binding(1) var<storage, read> B: array<f32>;
@group(0) @binding(2) var<storage, read> S: array<vec4f>;
@group(0) @binding(3) var<storage, read> K: array<f32>;
@group(0) @binding(4) var<storage, read> M: array<f32>;
fn ci(i: i32, j: i32) -> u32 {
  let W = i32(C.prm.y); let L = i32(C.prm.z);
  return u32(clamp(j, 0, L - 1)) * u32(W) + u32(clamp(i, 0, W - 1));
}
fn skyColor(d: vec3f) -> vec3f {
  let horizon = vec3f(0.70, 0.80, 0.92); let zenith = vec3f(0.20, 0.42, 0.80);
  var c = mix(horizon, zenith, pow(max(d.y, 0.0), 0.6));
  let sd = max(dot(d, C.sunDir.xyz), 0.0);
  c += vec3f(1.0, 0.92, 0.75) * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.25);
  if (d.y < 0.0) { c = mix(c, C.fog.rgb, clamp(-d.y * 8.0, 0.0, 1.0)); }
  return c;
}
fn applyFog(col: vec3f, dist: f32) -> vec3f { return mix(col, C.fog.rgb, 1.0 - exp(-dist * C.fog.w)); }
fn heat(x: f32) -> vec3f {
  let t = clamp(x, 0.0, 1.0);
  return mix(mix(vec3f(0.0,0.0,0.6), vec3f(0.0,0.9,0.2), smoothstep(0.0,0.5,t)), vec3f(1.0,0.1,0.0), smoothstep(0.5,1.0,t));
}
`;

export const WGSL_SKY = WGSL_RENDER_COMMON + /* wgsl */`
struct SkyOut { @builtin(position) pos: vec4f, @location(0) dir: vec3f };
@vertex fn vsSky(@builtin(vertex_index) vi: u32) -> SkyOut {
  var pts = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let p = pts[vi];
  let far = C.ivp * vec4f(p, 1.0, 1.0);
  var o: SkyOut;
  o.pos = vec4f(p, 0.9999, 1.0);
  o.dir = far.xyz / far.w - C.camPos.xyz;
  return o;
}
@fragment fn fsSky(in: SkyOut) -> @location(0) vec4f { return vec4f(skyColor(normalize(in.dir)), 1.0); }
`;

export const WGSL_TERRAIN = WGSL_RENDER_COMMON + /* wgsl */`
struct TVOut { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) mask: f32, @location(3) h: f32 };
@vertex fn vsTerrain(@builtin(vertex_index) vi: u32) -> TVOut {
  let W = u32(C.prm.y); let dx = C.prm.w;
  let i = i32(vi % W); let j = i32(vi / W);
  let b = B[ci(i, j)];
  let n = normalize(vec3f((B[ci(i-1,j)] - B[ci(i+1,j)]) / (2.0*dx), 1.0, (B[ci(i,j-1)] - B[ci(i,j+1)]) / (2.0*dx)));
  let wp = vec3f((f32(i) + 0.5) * dx, b, (f32(j) + 0.5) * dx);
  var o: TVOut;
  o.pos = C.vp * vec4f(wp, 1.0); o.wp = wp; o.n = n; o.mask = M[ci(i, j)]; o.h = S[ci(i, j)].x;
  return o;
}
// per-biome base palette for grass/dirt/rock/gravel — everything else (noise breakup, slope
// blending, altitude scree, lighting) stays identical, only these anchor colours shift. biome 0
// is the original look; 1 is the first new one (dry canyon: redder rock, sandier dirt, olive
// scrub instead of lush grass); 2/3 are reserved slots, currently identical to 0.
fn biomeColors(biome: i32) -> array<vec3f, 4> {
  if (biome == 1) {
    return array<vec3f, 4>(vec3f(0.42, 0.38, 0.15), vec3f(0.55, 0.38, 0.22), vec3f(0.53, 0.35, 0.28), vec3f(0.58, 0.42, 0.27));
  }
  return array<vec3f, 4>(vec3f(0.24, 0.40, 0.13), vec3f(0.40, 0.32, 0.20), vec3f(0.45, 0.44, 0.42), vec3f(0.48, 0.40, 0.30));
}
@fragment fn fsTerrain(in: TVOut) -> @location(0) vec4f {
  let n = normalize(in.n);
  let slope = 1.0 - n.y;
  let sun = max(dot(n, C.sunDir.xyz), 0.0);
  let pal = biomeColors(i32(C.env.x));
  // low detail: one noise sample instead of three, no altitude/gravel tinting — the branch is
  // uniform across the draw (driven by a setting, not per-pixel data) so it costs nothing to keep
  if (C.dbg.z > 0.5) {
    let n2 = noise2(in.wp.xz * 2.3);
    let grass = pal[0] * (0.8 + 0.4 * n2);
    let rock  = pal[2] * (0.7 + 0.5 * n2);
    var col = mix(grass, rock, smoothstep(0.3, 0.6, slope));
    col = mix(col, rock, in.mask * 0.6);
    let lit = col * (0.4 + sun * 0.85);
    return vec4f(applyFog(lit, length(in.wp - C.camPos.xyz)), 1.0);
  }
  let n1 = noise2(in.wp.xz * 0.35); let n2 = noise2(in.wp.xz * 2.3); let n3 = noise2(in.wp.xz * 0.08);
  let grass = pal[0] * (0.72 + 0.5 * n1) * (0.85 + 0.3 * n2) * (0.85 + 0.3 * n3);
  let dirt  = pal[1] * (0.8 + 0.4 * n2);
  let rock  = pal[2] * (0.7 + 0.5 * n2);
  var col = mix(grass, dirt, smoothstep(0.18, 0.38, slope));
  col = mix(col, rock, smoothstep(0.42, 0.68, slope));
  // a little high-altitude scree / heath so the big hills are not uniformly green
  col = mix(col, mix(rock, vec3f(0.38,0.36,0.30), n1), smoothstep(14.0, 26.0, in.wp.y) * 0.7);
  let gravel = mix(pal[3], vec3f(0.36, 0.36, 0.35), n2) * (0.8 + 0.3 * n1);
  col = mix(col, mix(gravel, rock, smoothstep(0.25, 0.5, slope)), in.mask);
  col = mix(col, col * 0.55, smoothstep(0.0, 0.05, in.h));
  let amb = 0.35 + 0.15 * n.y;
  var lit = col * (amb + sun * 0.9);
  lit = applyFog(lit, length(in.wp - C.camPos.xyz));
  return vec4f(lit, 1.0);
}
`;

export const WGSL_WATER = WGSL_RENDER_COMMON + /* wgsl */`
struct WVOut { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f,
               @location(2) hv: vec4f, @location(3) k: f32 };
fn etaN(i: i32, j: i32, eta0: f32, hmin: f32) -> f32 {
  let sn = S[ci(i, j)];
  return select(eta0, B[ci(i, j)] + sn.x, sn.x > hmin);
}
@vertex fn vsWater(@builtin(vertex_index) vi: u32) -> WVOut {
  let W = u32(C.prm.y); let dx = C.prm.w; let hmin = C.dbg.y; let t = C.prm.x;
  let i = i32(vi % W); let j = i32(vi / W);
  let id = ci(i, j);
  let s = S[id]; let b = B[id]; let h = s.x;
  let eta = b + h;
  let eL = etaN(i-1, j, eta, hmin); let eR = etaN(i+1, j, eta, hmin);
  let eD = etaN(i, j-1, eta, hmin); let eU = etaN(i, j+1, eta, hmin);
  let uc = 0.5 * (s.y + S[ci(i+1, j)].y); let vc = 0.5 * (s.z + S[ci(i, j+1)].z);
  let k = K[id];
  let p2 = vec2f((f32(i) + 0.5) * dx, (f32(j) + 0.5) * dx);
  // waves are sub-pixel where the mesh goes coarse; fading them before the LOD seam keeps the
  // fine and coarse edges at the same height there (no flickering slivers). dbg.w = RENDER.lod.near
  let camD = length(vec3f(p2.x, eta, p2.y) - C.camPos.xyz);
  let amp = 0.06 * k * smoothstep(0.0, 0.35, h) * (1.0 - smoothstep(0.6 * C.dbg.w, C.dbg.w, camD));
  
  let d = amp * (sin(dot(p2, vec2f(2.3, 0.9)) - t * 6.0) + sin(dot(p2, vec2f(-1.1, 2.4)) - t * 4.7)
                 + 0.6 * sin(dot(p2, vec2f(3.9, 3.3)) - t * 8.1));
  var y = eta + d;
  if (h <= hmin * 0.5) { y = b - 0.08; }
  let n = normalize(vec3f((eL - eR) / (2.0 * dx), 1.0, (eD - eU) / (2.0 * dx)));
  var o: WVOut;
  let wp = vec3f(p2.x, y, p2.y);
  o.pos = C.vp * vec4f(wp, 1.0); o.wp = wp; o.n = n; o.hv = vec4f(h, uc, vc, s.w); o.k = k;
  return o;
}
@fragment fn fsWater(in: WVOut) -> @location(0) vec4f {
  let h = in.hv.x; let vel = in.hv.yz; let foam = in.hv.w; let k = in.k;
  let fa = clamp(foam, 0.0, 1.0);
  var col: vec3f; var alpha: f32;
  // low detail: skip the hash-noise flow ripple (~11 noise samples/px, each several hashes) and
  // the noisy foam edge — but a perfectly flat geometric normal reads as a dead, glassy mirror,
  // which is worse than just plain. Perturb the normal with the same travelling-wave pattern the
  // vertex shader already displaces the surface by, analytically (its gradient is a few cos()
  // calls) instead of resampling noise — real ripple, a fraction of the cost. Foam stays a plain
  // threshold. Uniform branch (a setting, not per-pixel), so it costs nothing to keep both paths.
  if (C.dbg.z > 0.5) {
    let p2 = in.wp.xz; let tt = C.prm.x;
    let ampR = 0.06 * k * smoothstep(0.0, 0.35, h);
    let a1 = dot(p2, vec2f(2.3, 0.9)) - tt * 6.0;
    let a2 = dot(p2, vec2f(-1.1, 2.4)) - tt * 4.7;
    let a3 = dot(p2, vec2f(3.9, 3.3)) - tt * 8.1;
    let rx = ampR * (2.3 * cos(a1) - 1.1 * cos(a2) + 2.34 * cos(a3));
    let rz = ampR * (0.9 * cos(a1) + 2.4 * cos(a2) + 1.98 * cos(a3));
    let n = normalize(in.n + vec3f(-rx * 2.5, 0.0, -rz * 2.5));
    let V = normalize(C.camPos.xyz - in.wp);
    let R = reflect(-V, n);
    let F = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    let sky = skyColor(R);
    let absorb = exp(-h * vec3f(1.6, 0.8, 0.6) / C.water.a);
    let shallowT = mix(vec3f(0.32, 0.28, 0.21) * 0.8, C.water.rgb * 1.8, 0.45);
    let body = mix(C.water.rgb, shallowT, absorb);
    let spec = pow(max(dot(R, C.sunDir.xyz), 0.0), 180.0) * 1.2;
    col = mix(body, sky, F) + spec * vec3f(1.0, 0.95, 0.85);
    let foamCol = vec3f(0.92, 0.95, 0.97) * (0.8 + 0.4 * max(dot(n, C.sunDir.xyz), 0.0));
    col = mix(col, foamCol, smoothstep(0.1, 0.55, fa));
    col = applyFog(col, length(in.wp - C.camPos.xyz));
    // real transparency now, not just the internal bed-colour mixing above: shallow water lets
    // more of the actual terrain underneath show through, deep water goes opaque — and clarity
    // (the same knob "murky vs crystal clear" uses for colour) controls how fast that happens,
    // so a muddy river goes opaque in a few inches while a clear one stays see-through much deeper
    let present = smoothstep(0.0, 0.06, h);
    let depthT = 1.0 - exp(-h * 2.2 / C.water.a);
    alpha = present * mix(0.42, 1.0, depthT);
  } else {
    let t = C.prm.x;
    let T = 1.5;
    let ph0 = fract(t / T); let ph1 = fract(t / T + 0.5);
    let uv = in.wp.xz;
    let uvA = uv - vel * ph0 * T; let uvB = uv - vel * ph1 * T + vec2f(37.0, 11.0);
    let blend = abs(2.0 * ph0 - 1.0);
    let e = 0.05; let f = 1.6;
    let nA = vec2f(noise2(uvA*f + vec2f(e,0.0)) - noise2(uvA*f - vec2f(e,0.0)), noise2(uvA*f + vec2f(0.0,e)) - noise2(uvA*f - vec2f(0.0,e))) / (2.0*e);
    let nB = vec2f(noise2(uvB*f + vec2f(e,0.0)) - noise2(uvB*f - vec2f(e,0.0)), noise2(uvB*f + vec2f(0.0,e)) - noise2(uvB*f - vec2f(0.0,e))) / (2.0*e);
    let g2 = mix(nA, nB, blend);
    let str = 0.03 + 0.12 * k;
    let n = normalize(in.n + vec3f(-g2.x * str, 0.0, -g2.y * str));
    let V = normalize(C.camPos.xyz - in.wp);
    let R = reflect(-V, n);
    let F = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    let sky = skyColor(R);
    let bedCol = vec3f(0.40, 0.35, 0.26) * (0.8 + 0.4 * noise2(uv * 1.7));
    let bedColT = mix(bedCol, C.water.rgb * 1.8, 0.45);
    let absorb = exp(-h * vec3f(1.6, 0.8, 0.6) / C.water.a);
    var body = mix(C.water.rgb, bedColT * 0.8, absorb);
    body += C.water.rgb * (1.0 - absorb.g) * 0.3;
    let spec = pow(max(dot(R, C.sunDir.xyz), 0.0), 180.0) * 1.5;
    col = mix(body, sky, F) + spec * vec3f(1.0, 0.95, 0.85);
    let pat = mix(noise2(uvA * 2.2), noise2(uvB * 2.2), blend) * 0.6 + 0.4 * mix(noise2(uvA * 6.0), noise2(uvB * 6.0), blend);
    let mask = smoothstep(0.62 - 0.55 * fa, 0.72 - 0.55 * fa, pat) * smoothstep(0.0, 0.15, fa);
    let foamCol = vec3f(0.92, 0.95, 0.97) * (0.8 + 0.4 * max(dot(n, C.sunDir.xyz), 0.0));
    col = mix(col, foamCol, mask);
    col = applyFog(col, length(in.wp - C.camPos.xyz));
    // real transparency now, not just the internal bed-colour mixing above: shallow water lets
    // more of the actual terrain underneath show through, deep water goes opaque — and clarity
    // (the same knob "murky vs crystal clear" uses for colour) controls how fast that happens,
    // so a muddy river goes opaque in a few inches while a clear one stays see-through much deeper
    let present = smoothstep(0.0, 0.06, h);
    let depthT = 1.0 - exp(-h * 2.2 / C.water.a);
    alpha = present * mix(0.42, 1.0, depthT);
  }
  let mode = C.dbg.x;
  if (mode > 0.5) {
    if (mode < 1.5) { col = heat(length(vel) / 6.0); }
    else if (mode < 2.5) { col = heat(foam); }
    else if (mode < 3.5) { col = heat(k); }
    else { col = heat(length(vel) / sqrt(9.81 * max(h, 0.02)) / 2.0); }
    alpha = select(0.0, 1.0, h > 0.01);
  }
  return vec4f(col, alpha);
}
`;

export const WGSL_MESH = WGSL_RENDER_COMMON + /* wgsl */`
struct MVIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) col: vec3f,
              @location(3) m0: vec4f, @location(4) m1: vec4f, @location(5) m2: vec4f, @location(6) m3: vec4f, @location(7) tint: vec4f };
struct MVOut { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) col: vec3f, @location(3) a: f32 };
@vertex fn vsMesh(in: MVIn) -> MVOut {
  let m = mat4x4f(in.m0, in.m1, in.m2, in.m3);
  let wp = (m * vec4f(in.pos, 1.0)).xyz;
  var o: MVOut;
  o.pos = C.vp * vec4f(wp, 1.0); o.wp = wp;
  o.n = normalize((m * vec4f(in.nrm, 0.0)).xyz);
  o.col = in.col * in.tint.rgb;
  o.a = in.tint.a;
  return o;
}
fn litMesh(in: MVOut) -> vec3f {
  var n = normalize(in.n);
  let V = normalize(C.camPos.xyz - in.wp);
  if (dot(n, V) < 0.0) { n = -n; }
  let sun = max(dot(n, C.sunDir.xyz), 0.0);
  var lit = in.col * (0.32 + 0.18 * n.y + sun * 0.95);
  return applyFog(lit, length(in.wp - C.camPos.xyz));
}
@fragment fn fsMesh(in: MVOut) -> @location(0) vec4f {
  return vec4f(litMesh(in), 1.0);
}
// pickups: honours the instance tint's alpha (fade in/out) and glows brightly from every angle
// so paddles and coins stay easy to spot against the water regardless of the sun direction
@fragment fn fsMeshFade(in: MVOut) -> @location(0) vec4f {
  if (in.a <= 0.001) { discard; }
  var n = normalize(in.n);
  let V = normalize(C.camPos.xyz - in.wp);
  if (dot(n, V) < 0.0) { n = -n; }
  let sun = max(dot(n, C.sunDir.xyz), 0.0);
  let rim = pow(1.0 - max(dot(n, V), 0.0), 2.0);
  var lit = in.col * (0.85 + 0.25 * n.y + sun * 0.55) + in.col * rim * 0.6;
  lit = applyFog(lit, length(in.wp - C.camPos.xyz));
  return vec4f(lit, in.a);
}
`;

export const WGSL_PART_DRAW = WGSL_RENDER_COMMON + /* wgsl */`
struct Particle { pos: vec3f, life: f32, vel: vec3f, size: f32 };
@group(0) @binding(5) var<storage, read> PT: array<Particle>;
struct POut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) a: f32, @location(2) wp: vec3f };
@vertex fn vsPart(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> POut {
  var corners = array<vec2f, 6>(vec2f(-1.0,-1.0), vec2f(1.0,-1.0), vec2f(-1.0,1.0),
                                vec2f(-1.0,1.0), vec2f(1.0,-1.0), vec2f(1.0,1.0));
  let p = PT[ii];
  var o: POut;
  if (p.life <= 0.0) { o.pos = vec4f(0.0, 0.0, 2.0, 1.0); o.uv = vec2f(0.0); o.a = 0.0; o.wp = vec3f(0.0); return o; }
  let c = corners[vi];
  let wp = p.pos + (C.camRight.xyz * c.x + C.camUp.xyz * c.y) * p.size;
  o.pos = C.vp * vec4f(wp, 1.0); o.uv = c; o.a = clamp(p.life * 2.5, 0.0, 1.0); o.wp = wp;
  return o;
}
@fragment fn fsPart(in: POut) -> @location(0) vec4f {
  let d = length(in.uv);
  if (d > 1.0 || in.a <= 0.001) { discard; }
  let soft = exp(-d * d * 3.5);          // soft round puff — no hard disc edge, reads as mist not a ball
  let a = in.a * soft * 0.32;
  var col = vec3f(0.95, 0.97, 1.0) * (0.88 + 0.12 * max(dot(normalize(C.camPos.xyz - in.wp), C.sunDir.xyz), 0.0));
  col = applyFog(col, length(in.wp - C.camPos.xyz));
  return vec4f(col, a);
}
`;