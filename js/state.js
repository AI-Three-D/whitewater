// The one shared, mutable game state. Anything that used to be a `let` in the old main()
// closure lives here so modules can be split without threading 40 parameters around.
import { KAYAK, CRAFTS } from './config.js';

export const TIME_SCALE = 2;
// hard cap on ticks replayed in one frame — after a big stall (tab backgrounded, a long GC
// pause) sim time falls behind real time instead of the frame replaying all of it and spiralling
export const MAX_PHYS_TICKS = 8;

export const newRunLoot = () => ({
  paddles: 0, coins: 0, coinValue: 0, snacks: 0, bandaids: 0, medikits: 0, books: 0,
  raftFound: false, helmetFound: false,
});

export const S = {
  river: null,
  profile: null,            // null → character selection
  gameState: 'menu',        // 'menu' | 'run' | 'over'
  warmingUp: false,
  simTime: 0,
  runTime: 0,
  frameTicks: 2,            // physics ticks run this frame (kayak.step divides obstacle reactions by it)
  fps: 60,
  camMode: 0,
  dbgMode: 0,
  debugUnlockAll: false,    // dev: show every river as unlocked regardless of pack ownership
  debugNoCapsize: false,    // dev: kayak.step ignores roll/pitch capsize (KeyG / mGod)
  // the boat for the current run: KAYAK with the craft's (and paddle upgrade's) mods applied,
  // plus the craft itself for hull colour / lootMod. Set in startRun.
  effK: KAYAK,
  runCraft: CRAFTS.classic,
  runLoot: newRunLoot(),
  // simTime deadlines for transient HUD lines / buffs
  snackMsgUntil: 0,
  drinkBuffUntil: 0,
  drinkMsgUntil: 0,
  mapFoundUntil: 0,
};

export function resetRunCounters() {
  S.runLoot = newRunLoot();
  S.snackMsgUntil = 0;
  S.drinkBuffUntil = 0;
  S.drinkMsgUntil = 0;
}