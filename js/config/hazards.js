// Moving hazards: floating obstacles (logs, drift ice) and landslide boulders.

export const OBSTACLES = {
    enabled: true,
    maxActive: 40,                 // hard cap on obstacles existing at once (a river's `max` overrides)
    spawnAhead: [190, 260],        // [m] downstream of the kayak where new ones are dropped in
    seedAheadFrom: 50,             // at run start the reach from here to spawnAhead[1] is pre-populated
                                   // at the same density, so the first stretch isn't empty
    despawnBehind: 70,             // [m] upstream of the kayak before one retires
    sinkTime: 4.0, sinkDepth: 1.6, // the retirement animation
    substeps: 2,                   // physics substeps per rendered frame
    dragAxial: 0.5, dragLat: 2.2,  // [1/s] velocity relaxation toward the current along / across the axis
    yawDrag: 0.9,                  // [1/s] spin damping
    // grounded (water shallower than the draft): the bed slope pushes it back toward deeper water,
    // friction strands it on a flat bar — see stepObstacle in obstacles.js
    groundPush: 45, groundFric: 6,
    pairK: 70, pairDamp: 10,       // obstacle-vs-obstacle contact — this is what builds log jams
    vmax: 8, wmax: 2.5,            // sanity clamps [m/s], [rad/s]
    hullR: 0.34,                   // kayak hull radius used by the contact test [m]
    bob: 0.04, bobSpeed: 1.6,      // gentle vertical bob while afloat
    // a log resting with its centreline AT the surface reads as half-submerged and disappears into
    // the water's noise from any distance; riding this much higher (as a fraction of its radius)
    // keeps most of it above the surface while still letting chaotic water dunk it now and then
    freeboard: 0.15,
    ySmooth: 4,                    // [1/s] low-pass on the floating height (see surfaceAt in sampling.js)
    // size classes: how hard a hit is (hitK), how much it lifts the boat, how many axis samples
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
    // trigger: by default timed against the boulder's own fall so the player watches it come down;
    // nearChance picks a close-range surprise instead
    assumedSpeed: 3.2, leadTime: 1.5, minTriggerZ: 15, maxTriggerZ: 90, nearTriggerZ: 14, nearChance: 0.4,
    // splash injected into the water sim where it lands, scaled by arrival speed
    splashRefSpeed: 6, splashRadius: 1.5, splashHeight: 0.34, splashMinScale: 0.35, splashMaxScale: 1.6,
    splashCol: [0.85, 0.92, 0.98], dustCol: [0.5, 0.4, 0.27], dustInterval: 0.22,
    deepWater: 0.9,                // [m] water depth at which a rolling boulder stops and settles
    // baked roll-down simulation (see bakeBoulderTrajectory in landslides.js)
    rollAccel: 9.0, rollFric: 0.8, rollWobble: 1.3, rollVmax: 9, downstreamBias: 1.4,
    bakeDt: 1 / 60, bakeMaxSteps: 900, settleSpeed: 0.05, settleTime: 1.2,
    // len ranges overlap a bit at the medium/large boundary on purpose — a continuous-feeling size
    // spread rather than two visibly-clustered clumps, while hitK/mass still step up with the class
    medium: { meshes: ['boulderMedium'], len: [1.3, 2.6], density: 2600, hitK: 1.6, lift: 0.03, samples: 3 },
    large:  { meshes: ['boulderLarge'],  len: [2.6, 4.8], density: 2700, hitK: 2.6, lift: 0.02, samples: 4 },
  };