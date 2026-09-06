// Characters, boats, consumables, permanent upgrades, training, the store shelf and injury.
export const CHARACTERS = {
    ronja: {
      name: 'Ronja', title: 'the Technician',
      desc: 'Grew up slalom racing. Reads water like a book and has hips of steel — but she tires quickly.',
      caps: { skill: 10, stamina: 6, health: 20 }, start: { skill: 1, stamina: 0, health: 10 }, talent: 'skill',
    },
    bram: {
      name: 'Bram', title: 'the Engine',
      desc: 'Ex-rower. Can paddle all day without slowing down, but the boat still surprises him now and then.',
      caps: { skill: 6, stamina: 10, health: 20 }, start: { skill: 0, stamina: 1, health: 10 }, talent: 'stamina',
    },
  };
  
  // ---------- watercraft ----------
  // `mods` multiply the matching KAYAK physics numbers for a run in that craft (see
  // kayak.craftKayakParams), so a new hull is a config entry, not code. `color` is the deck colour
  // (the hull mesh is white/grey and takes it as tint). `lootMod` scales the pickup collect radius.
  // price 0 = owned from the start; no store listing = found, not bought.
  export const CRAFTS = {
    classic: {
      name: 'River Runner', type: 'kayak', price: 0, color: [0.92, 0.22, 0.12],
      desc: 'The all-rounder you started in. Forgiving, steady, no surprises.',
      mods: {},
    },
    slalom: {
      name: 'Slalom Blade', type: 'kayak', price: 20, color: [0.15, 0.55, 0.95],
      desc: 'Shorter, harder-edged hull: sweep strokes bite and swing the boat round noticeably faster.',
      mods: { sweepTorque: 1.45, sweepFwd: 1.15 },
    },
    // a tube ring: barely steerable and weak on the paddle, but very hard to flip and forgiving of
    // rocks. Fine for cruising an easy river for a little xp, but its tiny reach near loot means it
    // rarely grabs much on the way down.
    tubering: {
      name: 'Tube Ring', type: 'tube', price: 15, color: [0.95, 0.55, 0.1],
      desc: 'An inflatable ring. Almost impossible to flip, almost impossible to steer — just float and enjoy the ride.',
      mods: { sweepTorque: 0.25, sweepFwd: 0.3, paddleFwd: 0.5, paddleBack: 0.5, rollInstab: 0.3, capsize: 1.6 },
      lootMod: 0.4,
    },
    // found once, globally, as a rucksack special item (see loot.SPECIAL_ITEMS and awardRun's
    // raftFound handling). Slower and even harder to steer than the tube ring, but tougher still
    // against flipping. Lane-picking on hard rapids is future calibration work.
    raft: {
      name: 'Inflatable Raft', type: 'raft', price: 0, color: [0.85, 0.78, 0.15],
      desc: 'A found inflatable raft. Slow and clumsy to steer, but very hard to flip — cruises easy water almost on its own.',
      mods: { sweepTorque: 0.15, sweepFwd: 0.2, paddleFwd: 0.35, paddleBack: 0.35, rollInstab: 0.15, capsize: 2.0 },
      lootMod: 0.3,
    },
  };
  
  // ---------- consumables ----------
  export const ITEMS = {
    snack: {
      name: 'Trail snack', icon: '🥜', price: 2, stamina: 45, maxStack: 9, color: [0.85, 0.65, 0.25],
      desc: 'Eat it mid-run to get 45 stamina back. Up to 9 fit in your pack.',
    },
    bandaid: {
      name: 'Bandaid', icon: '🩹', price: 4, heal: 1, maxStack: 9, color: [0.95, 0.95, 0.9],
      desc: 'Patches up one point of injury. Use it from the character sheet whenever — no rush.',
    },
    medikit: {
      name: 'Medikit', icon: '💉', price: 10, heal: 3, maxStack: 5, color: [0.9, 0.2, 0.25],
      desc: 'A proper kit: reverses three points of injury. Use it from the character sheet whenever — no rush.',
    },
    // temporary mid-run buff: for buffDuration seconds kayak.traits() treats skill as buffSkill
    // points higher, sharpening passive stability and lean response — see run.drinkEnergy
    energyDrink: {
      name: 'Energy booster', icon: '⚡', price: 5, buffSkill: 3, buffDuration: 4, maxStack: 5, color: [0.95, 0.85, 0.15],
      desc: 'Mostly used for increasing focus during workouts, but it helps with kayaking too: 4 seconds of +3 skill for keeping the boat up, keys and all. Up to 5 fit in your pack.',
    },
  };
  
  // every paddler has a starter equipment deal paying this many coins per finished run;
  // UPGRADES.sponsor adds runIncome on top
  export const BASE_SPONSOR_INCOME = 1;
  
  // ---------- permanent upgrades (bought once, or found once, then always in effect) ----------
  export const UPGRADES = {
    lifevest: {
      name: 'Life vest', icon: '🦺', price: 20, injuryReduction: 1,
      desc: 'Padded flotation vest. Takes one point of sting out of every fall, on any river.',
    },
    paddle: {
      name: 'Carbon paddle', icon: '🛶', price: 30,
      mods: { paddleFwd: 1.2, paddleBack: 1.2, sweepTorque: 1.15, sweepFwd: 1.15 },
      desc: 'Stiffer blade, better catch — every stroke hits harder and turns the boat faster.',
    },
    // found only (no `price`, never listed), as a rucksack special item — see awardRun's helmetFound
    helmet: {
      name: 'Better helmet', icon: '⛑️', medHardReduction: 1,
      desc: 'A sturdier helmet. Takes one extra point off every fall on medium and hard water.',
    },
    sponsor: {
      name: 'Promotion program', icon: '📣', price: 10, runIncome: 1,
      desc: 'A bigger equipment sponsor backs you — more content, more ads. Pays 1 extra coin on top of your starter deal for every run you finish.',
    },
  };
  
  // ---------- training (repeatable coin-for-xp purchase, see buyTraining) ----------
  export const TRAINING = [
    { id: 'basic', name: 'Basic training', icon: '📘', price: 5, xp: 2,
      desc: 'A short coaching session with a local guide — a quick nudge toward your next level.' },
    { id: 'intensive', name: 'Intensive training', icon: '📗', price: 10, xp: 5,
      desc: 'A full day on the water with a pro. Costs more, but banks noticeably more xp.' },
  ];
  
  // the store shelf, top to bottom. Owned crafts/upgrades/packs show as owned rather than disappearing.
  export const STORE_LISTING = [
    { type: 'item', id: 'snack' },
    { type: 'item', id: 'bandaid' },
    { type: 'item', id: 'medikit' },
    { type: 'item', id: 'energyDrink' },
    { type: 'training', id: 'basic' },
    { type: 'training', id: 'intensive' },
    { type: 'upgrade', id: 'sponsor' },
    { type: 'upgrade', id: 'lifevest' },
    { type: 'upgrade', id: 'paddle' },
    { type: 'craft', id: 'slalom' },
    { type: 'craft', id: 'tubering' },
    { type: 'pack', id: 'easyPack' },
    { type: 'pack', id: 'mediumPack' },
    { type: 'pack', id: 'hardPack' },
  ];
  
  // ---------- injury ----------
  // injury taken per capsize, by tier (happens to equal TIER_SCALE today; kept separate on purpose
  // so difficulty and punishment can be tuned independently)
  export const INJURY = { perTier: { easy: 1, medium: 2, hard: 4 } };