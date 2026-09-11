// GPU plumbing for the level editor's overlay gizmos (bank lines, centreline, feature markers):
// one grow-only vertex buffer in the standard mesh layout, drawn with the glowing pickup pipeline
// so the overlay reads clearly over water and terrain. Content is pushed by editor.js as a
// MeshBuilder whenever something changes; render.js calls drawOverlay while editing.
import { mat4TRS } from './math.js';
import { gpu, mkBuf } from './gpu.js';

let vbuf = null, capBytes = 0, count = 0, inst = null, pending = null;

export const setOverlayMesh = mb => { pending = mb; };
export const clearOverlay = () => { pending = null; count = 0; };

function upload(mb) {
  const d = mb.data();
  count = mb.count;
  if (!count) return;
  if (!vbuf || capBytes < d.byteLength) {
    if (vbuf) vbuf.destroy();
    capBytes = Math.max(d.byteLength, 1 << 16);
    vbuf = mkBuf(capBytes, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
  }
  gpu.device.queue.writeBuffer(vbuf, 0, d);
  if (!inst) {   // single identity instance, slightly translucent tint
    inst = mkBuf(80, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
    const id = new Float32Array(20);
    id.set(mat4TRS([0, 0, 0], 0, [1, 1, 1]), 0);
    id.set([1, 1, 1, 0.9], 16);
    gpu.device.queue.writeBuffer(inst, 0, id);
  }
}

export function drawOverlay(pass) {
  if (pending) {
    upload(pending);
    pending = null;
  }
  if (!count || !vbuf) return;
  pass.setPipeline(gpu.pickupPipe);   // glows from every angle, alpha-blended, no depth writes
  pass.setVertexBuffer(0, vbuf);
  pass.setVertexBuffer(1, inst);
  pass.draw(count, 1);
}