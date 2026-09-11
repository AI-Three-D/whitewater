// Moving hazards: floating obstacles (logs, drift ice) and landslide boulders.

export const OBSTACLES = {
    enabled: true,
    maxActive: 40,                 // hard cap on obstacles existing at once (a river's `max` overrides)
    spawnAhead: [190, 260],        // [m] downstream of the kayak where new ones are dropped in
    seedAheadFrom: 50,             // pre-populate this reach to spawnAhead[1] at run start
    despawnBehind: 70,             // [m] upstream of the kayak before one retires
    sinkTime: 4.0, sinkDepth: 1.6, // the retirement animation
    substeps: 2,
    dragAxial: 0.5, dragLat: 2.2,  // [1/s] velocity relaxation toward the current, along / across axis
    yawDrag: 0.9,
    groundPush: 45, groundFric: 6, // grounded in shallow water: bed slope pushes back out, friction strands it
    pairK: 70, pairDamp: 10,       // obstacle-vs-obstacle contact — builds log jams
    vmax: 8, wmax: 2.5,            // [m/s], [rad/s] sanity clamps
    hullR: 0.34,                   // [m] kayak hull radius used by the contact test
    bob: 0.04, bobSpeed: 1.6,
    freeboard: 0.15,               // rides this much higher than its radius, so it stays visible above the noise
    ySmooth: 4,
    classes: {
      medium: { hitK: 0.16, lift: 0.45, samples: 4 },
      large:  { hitK: 1.0,  lift: 0.05, samples: 6 },
    },
    kinds: {
      log: {
        label: 'driftwood', density: 650, roll: true,
        medium: { meshes: ['logMedium', 'logMediumB'], len: [3.5, 6.0] },
        large:  { meshes: ['logLarge', 'logLargeB'],   len: [7.0, 11.0] },
      },
      ice: {
        label: 'drift ice', density: 900, roll: false,
        medium: { meshes: ['iceMedium', 'iceMediumB'], len: [1.8, 3.4] },
        large:  { meshes: ['iceberg', 'icebergB'],     len: [4.0, 8.0] },
      },
    },
  };
  
  export const LANDSLIDE = {
    bankOffset: [2, 16],           // [m] beyond the channel edge where a boulder starts
    assumedSpeed: 3.2, leadTime: 1.5, minTriggerZ: 15, maxTriggerZ: 90, nearTriggerZ: 14, nearChance: 0.4,
    splashRefSpeed: 6, splashRadius: 1.5, splashHeight: 0.34, splashMinScale: 0.35, splashMaxScale: 1.6,
    splashCol: [0.85, 0.92, 0.98], dustCol: [0.5, 0.4, 0.27], dustInterval: 0.22,
    deepWater: 0.9,                // [m] water depth at which a rolling boulder stops and settles
    rollAccel: 9.0, rollFric: 0.8, rollWobble: 1.3, rollVmax: 9, downstreamBias: 1.4,
    bakeDt: 1 / 60, bakeMaxSteps: 900, settleSpeed: 0.05, settleTime: 1.2,
    medium: { meshes: ['boulderMedium'], len: [1.3, 2.6], density: 2600, hitK: 1.6, lift: 0.03, samples: 3 },
    large:  { meshes: ['boulderLarge'],  len: [2.6, 4.8], density: 2700, hitK: 2.6, lift: 0.02, samples: 4 },
  };