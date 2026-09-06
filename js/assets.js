// Static GPU geometry shared across runs, uploaded once after the device exists.
import { buildKayakParts, buildVegetationMeshes, buildCoinMesh, buildSparkMesh, buildDiamondMesh, buildMapMesh, buildRucksackMesh, buildObstacleMeshes } from './meshes.js';
import { gpu, INST_BYTES } from './gpu.js';

export const meshes = {};         // veg, kayak, pickup, obst, spark — filled by initAssets()
export const obstInstBufs = {};   // per obstacle mesh name, grown on demand by ensureObstInstBufs()

export function initAssets() {
  const upload = table => Object.fromEntries(Object.entries(table).map(([k, mb]) => [k, gpu.gpuMesh(mb)]));
  meshes.veg = upload(buildVegetationMeshes());
  meshes.kayak = upload(buildKayakParts());
  meshes.pickup = {
    paddle: meshes.kayak.paddle,
    coin: gpu.gpuMesh(buildCoinMesh()),
    diamond: gpu.gpuMesh(buildDiamondMesh()),
    map: gpu.gpuMesh(buildMapMesh()),
    rucksack: gpu.gpuMesh(buildRucksackMesh()),
  };
  // each obstacle mesh keeps its builder's nominal metres (len/rad/draft/vol) so an instance can be
  // scaled uniformly to a chosen length and derive its physics numbers from that
  meshes.obst = {};
  for (const [k, v] of Object.entries(buildObstacleMeshes())) {
    meshes.obst[k] = { ...gpu.gpuMesh(v.mb), len: v.len, rad: v.rad, draft: v.draft, vrad: v.vrad, vol: v.vol };
  }
  meshes.spark = gpu.gpuMesh(buildSparkMesh());
}

// make sure each named obstacle mesh has an instance buffer holding at least `count` instances
export function ensureObstInstBufs(names, count) {
  const need = Math.max(INST_BYTES, count * INST_BYTES);
  for (const name of names) {
    const cur = obstInstBufs[name];
    if (cur && cur.size >= need) continue;
    if (cur) cur.destroy();
    obstInstBufs[name] = gpu.instBuf(count);
  }
}