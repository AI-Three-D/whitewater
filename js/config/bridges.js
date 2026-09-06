// Land bridges (natural rock arches) and built road bridges: geometry defaults a river's entry
// can override per bridge, and the material palettes for built ones.
export const LAND_BRIDGE = {
    width: 6, widthVar: 0.3, height: 3, pillars: 1, thickness: 1.3, rise: 0.5,
    roughness: 1, wander: 1, flare: 0.8,
    minExt: 4, maxExt: 22,
    maxPillars: 8, minHeight: 1.5,
    // props on the deck: tries/m² and per-role scaling of the biome's open-ground mix
    propDensity: 0.3, treeScale: 0.4, rockScale: 1.6, grassScale: 1.2,
    pillar: {
      along: 0.5, across: 0, radius: null, sizeAlong: 1, sizeAcross: 1.15, yaw: 0, irregular: 1,
      baseFlare: 0.55, waist: 0.12, flare: 0.35, flareFrom: 0.6, flareCurve: 1.5,
    },
  };
  
  export const BRIDGE_MATERIALS = {
    concrete: {
      deck: [0.62, 0.62, 0.60], side: [0.54, 0.54, 0.52], soffit: [0.46, 0.46, 0.45], pylon: [0.58, 0.58, 0.56],
      rail: [0.72, 0.72, 0.70], road: [0.20, 0.20, 0.21], line: [0.92, 0.90, 0.70],
      railStyle: 'parapet', girders: 3, planks: 0, blockVar: 0.03,
    },
    stone: {
      deck: [0.60, 0.56, 0.50], side: [0.55, 0.51, 0.45], soffit: [0.42, 0.39, 0.35], pylon: [0.56, 0.52, 0.46],
      rail: [0.62, 0.58, 0.52], road: [0.38, 0.34, 0.29], line: [0, 0, 0],
      railStyle: 'parapet', girders: 0, planks: 0, blockVar: 0.10,
    },
    wood: {
      deck: [0.45, 0.32, 0.19], side: [0.38, 0.27, 0.16], soffit: [0.33, 0.23, 0.14], pylon: [0.36, 0.25, 0.15],
      rail: [0.42, 0.30, 0.18], road: [0.45, 0.32, 0.19], line: [0, 0, 0],
      railStyle: 'posts', girders: 4, planks: 1, blockVar: 0.06,
    },
    steel: {
      deck: [0.55, 0.56, 0.58], side: [0.30, 0.33, 0.36], soffit: [0.26, 0.29, 0.32], pylon: [0.34, 0.37, 0.40],
      rail: [0.40, 0.44, 0.48], road: [0.20, 0.20, 0.21], line: [0.92, 0.90, 0.70],
      railStyle: 'posts', girders: 5, planks: 0, blockVar: 0.04,
    },
  };
  
  export const BUILT_BRIDGE = {
    material: 'concrete', color: [1, 1, 1],
    width: 7, height: 4, thickness: 1.0, slab: 0.35, rail: 0.9, railThick: 0.25,
    pylons: 2, abutExt: 5, shoulder: 7, roadLine: 1,
    minHeight: 1.5, maxPylons: 8,
    pylon: { along: 0.5, across: 0, sizeAlong: 1.2, sizeAcross: 2.6, yaw: 0, taper: 0.08, footing: 0.35, cap: 0.3 },
  };