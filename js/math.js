export const v3 = {
    add: (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]],
    sub: (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]],
    scale: (a, s) => [a[0]*s, a[1]*s, a[2]*s],
    dot: (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2],
    cross: (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
    len: a => Math.hypot(a[0], a[1], a[2]),
    norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; },
  };
  export function qMul(a, b) {
    const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
    return [aw*bx + ax*bw + ay*bz - az*by, aw*by - ax*bz + ay*bw + az*bx, aw*bz + ax*by - ay*bx + az*bw, aw*bw - ax*bx - ay*by - az*bz];
  }
  export function qConj(q) { return [-q[0], -q[1], -q[2], q[3]]; }
  export function qNorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0]/l, q[1]/l, q[2]/l, q[3]/l]; }
  export function qRotate(q, v) {
    const qv = [q[0], q[1], q[2]];
    const t = v3.scale(v3.cross(qv, v), 2);
    return v3.add(v3.add(v, v3.scale(t, q[3])), v3.cross(qv, t));
  }
  export function qAxisAngle(axis, ang) { const s = Math.sin(ang/2); return [axis[0]*s, axis[1]*s, axis[2]*s, Math.cos(ang/2)]; }
  export function qFromRotVec(rv) { const a = v3.len(rv); if (a < 1e-9) return [0,0,0,1]; return qAxisAngle(v3.scale(rv, 1/a), a); }
  export function mat4Perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far), m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = far * nf; m[11] = -1; m[14] = far * near * nf; return m;
  }
  export function mat4LookAt(eye, target, up) {
    const z = v3.norm(v3.sub(eye, target)), x = v3.norm(v3.cross(up, z)), y = v3.cross(z, x);
    const m = new Float32Array(16);
    m[0] = x[0]; m[1] = y[0]; m[2] = z[0]; m[4] = x[1]; m[5] = y[1]; m[6] = z[1]; m[8] = x[2]; m[9] = y[2]; m[10] = z[2];
    m[12] = -v3.dot(x, eye); m[13] = -v3.dot(y, eye); m[14] = -v3.dot(z, eye); m[15] = 1; return m;
  }
  export function mat4Mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
      o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
    return o;
  }
  export function mat4Invert(m) {
    const a = m, o = new Float32Array(16);
    const a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7],a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
    const b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10,b03=a01*a12-a02*a11,b04=a01*a13-a03*a11,b05=a02*a13-a03*a12,
          b06=a20*a31-a21*a30,b07=a20*a32-a22*a30,b08=a20*a33-a23*a30,b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;
    let det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06; if (!det) return o; det = 1/det;
    o[0]=(a11*b11-a12*b10+a13*b09)*det; o[1]=(a02*b10-a01*b11-a03*b09)*det; o[2]=(a31*b05-a32*b04+a33*b03)*det; o[3]=(a22*b04-a21*b05-a23*b03)*det;
    o[4]=(a12*b08-a10*b11-a13*b07)*det; o[5]=(a00*b11-a02*b08+a03*b07)*det; o[6]=(a32*b02-a30*b05-a33*b01)*det; o[7]=(a20*b05-a22*b02+a23*b01)*det;
    o[8]=(a10*b10-a11*b08+a13*b06)*det; o[9]=(a01*b08-a00*b10-a03*b06)*det; o[10]=(a30*b04-a31*b02+a33*b00)*det; o[11]=(a21*b02-a20*b04-a23*b00)*det;
    o[12]=(a11*b07-a10*b09-a12*b06)*det; o[13]=(a00*b09-a01*b07+a02*b06)*det; o[14]=(a31*b01-a30*b03-a32*b00)*det; o[15]=(a20*b03-a21*b01+a22*b00)*det;
    return o;
  }
  export function mat4Compose(p, q, s) {
    const [x, y, z, w] = q, m = new Float32Array(16);
    m[0] = (1-2*(y*y+z*z))*s[0]; m[1] = 2*(x*y+z*w)*s[0]; m[2] = 2*(x*z-y*w)*s[0];
    m[4] = 2*(x*y-z*w)*s[1]; m[5] = (1-2*(x*x+z*z))*s[1]; m[6] = 2*(y*z+x*w)*s[1];
    m[8] = 2*(x*z+y*w)*s[2]; m[9] = 2*(y*z-x*w)*s[2]; m[10] = (1-2*(x*x+y*y))*s[2];
    m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; m[15] = 1; return m;
  }
  export function mat4TRS(p, yaw, s) { return mat4Compose(p, qAxisAngle([0,1,0], yaw), s); }
  export function mat4Transform(m, p) {
    return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
  }
  export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  export function hashi(x, y, z, seed) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + Math.imul(seed | 0, 2147483629)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296;
  }
  const sm = t => t * t * (3 - 2 * t);
  export function vnoise2(x, y, seed = 0) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
    const a = hashi(xi, yi, 0, seed), b = hashi(xi+1, yi, 0, seed), c = hashi(xi, yi+1, 0, seed), d = hashi(xi+1, yi+1, 0, seed);
    return (a + (b-a)*fx) * (1-fy) + (c + (d-c)*fx) * fy;
  }
  export function vnoise3(x, y, z, seed = 0) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = sm(x-xi), fy = sm(y-yi), fz = sm(z-zi);
    const l = (a, b, t) => a + (b - a) * t;
    const n0 = l(l(hashi(xi,yi,zi,seed), hashi(xi+1,yi,zi,seed), fx), l(hashi(xi,yi+1,zi,seed), hashi(xi+1,yi+1,zi,seed), fx), fy);
    const n1 = l(l(hashi(xi,yi,zi+1,seed), hashi(xi+1,yi,zi+1,seed), fx), l(hashi(xi,yi+1,zi+1,seed), hashi(xi+1,yi+1,zi+1,seed), fx), fy);
    return l(n0, n1, fz);
  }
  export function fbm2(x, y, oct, seed = 0) { let a = 0, w = 0.5, s = 0; for (let o = 0; o < oct; o++) { a += w * vnoise2(x, y, seed + o); s += w; x *= 2.03; y *= 1.97; w *= 0.5; } return a / s; }
  export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };