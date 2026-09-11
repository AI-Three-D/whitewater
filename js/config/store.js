// Everything with a price (or found instead of bought): boats, consumables, upgrades, training.
import { SPECIAL_ITEMS } from './loot.js';

// `mods` multiply the matching KAYAK physics fields for a run in that craft (see craftKayakParams
// in kayak.js). `lootMod` scales PICKUPS/RUCKSACK collectRadius. price 0 = owned from the start.
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
  tubering: {
    name: 'Tube Ring', type: 'tube', price: 15, color: [0.95, 0.55, 0.1],
    desc: 'An inflatable ring. Almost impossible to flip, almost impossible to steer — just float and enjoy the ride.',
    mods: { sweepTorque: 0.25, sweepFwd: 0.3, paddleFwd: 0.5, paddleBack: 0.5, rollInstab: 0.3, capsize: 1.6 },
    lootMod: 0.4,
  },
  // found only, as a rucksack special item — see SPECIAL_ITEMS and awardRun's raftFound handling
  raft: {
    name: 'Inflatable Raft', type: 'raft', price: 0, color: SPECIAL_ITEMS.raft.color,
    desc: 'A found inflatable raft. Slow and clumsy to steer, but very hard to flip — cruises easy water almost on its own.',
    mods: { sweepTorque: 0.15, sweepFwd: 0.2, paddleFwd: 0.35, paddleBack: 0.35, rollInstab: 0.15, capsize: 2.0 },
    lootMod: 0.3,
  },
};

// `stamina` → usable mid-run (E), `heal` → usable from the character sheet, `buffSkill`/
// `buffDuration` → temporary mid-run skill buff (Q; see traits() in kayak.js)
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
    name: 'Medikit', icon: '💉', price: 10, heal: 3, maxStack: 5, color: SPECIAL_ITEMS.medikit.color,
    desc: 'A proper kit: reverses three points of injury. Use it from the character sheet whenever — no rush.',
  },
  energyDrink: {
    name: 'Energy booster', icon: '⚡', price: 5, buffSkill: 3, buffDuration: 4, maxStack: 5, color: [0.95, 0.85, 0.15],
    desc: 'Mostly used for increasing focus during workouts, but it helps with kayaking too: 4 seconds of +3 skill for keeping the boat up, keys and all. Up to 5 fit in your pack.',
  },
};

// base per-run coin income; UPGRADES.sponsor adds its runIncome on top
export const BASE_SPONSOR_INCOME = 1;

// bought once (or found once: no `price`), then always in effect
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
  // found only, as a rucksack special item — see awardRun's helmetFound handling
  helmet: {
    name: 'Better helmet', icon: '⛑️', medHardReduction: 1,
    desc: 'A sturdier helmet. Takes one extra point off every fall on medium and hard water.',
  },
  sponsor: {
    name: 'Promotion program', icon: '📣', price: 10, runIncome: 1,
    desc: 'A bigger equipment sponsor backs you — more content, more ads. Pays 1 extra coin on top of your starter deal for every run you finish.',
  },
};

// repeatable coin-for-xp purchases — not owned, buy as many as coins allow (see buyTraining)
export const TRAINING = [
  { id: 'basic', name: 'Basic training', icon: '📘', price: 5, xp: 2,
    desc: 'A short coaching session with a local guide — a quick nudge toward your next level.' },
  { id: 'intensive', name: 'Intensive training', icon: '📗', price: 10, xp: 5,
    desc: 'A full day on the water with a pro. Costs more, but banks noticeably more xp.' },
];

// the store shelf, top to bottom (grouped by type in the UI). Owned crafts/upgrades stay listed.
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