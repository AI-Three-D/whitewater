// Barrel for the game's data tables. Import from here ('./config/index.js'), never from the
// individual files, so the layout below can change without touching the game code.
export * from './simulation.js';
export * from './environment.js';
export * from './kayak.js';
export * from './rivers.js';
export * from './hazards.js';
export * from './bridges.js';
export * from './loot.js';
export * from './characters.js';
export * from './store.js';
export { validateConfig } from './validate.js';