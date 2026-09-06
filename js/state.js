// The shared, mutable game state. The original kept these as closure `let`s inside main(); modules
// can't share re-bindable variables, so they live on one explicitly named object instead — every
// read/write of e.g. the current profile is now a greppable `G.profile`.
import { KAYAK, CRAFTS } from './config.js';

export const TIME_SCALE = 2;
export const MAX_PHYS_TICKS = 8;   // hard cap on ticks replayed in one frame — after a big stall (tab
                                   // backgrounded, a long GC pause) sim time falls behind real time
                                   // instead of the frame trying to replay all of it and spiralling

export const emptyLoot = () => ({
  paddles: 0, coins: 0, coinValue: 0, snacks: 0, bandaids: 0, medikits: 0, books: 0,
  raftFound: false, helmetFound: false,
});

export const G = {
  profile: null,          // null → character selection
  river: null,
  gameState: 'menu',      // 'menu' | 'run' | 'over'
  simTime: 0,
  runTime: 0,
  warmingUp: false,
  frameTicks: 2,          // physics ticks run this frame (kayak.step divides obstacle reaction by it)
  camMode: 0,
  dbgMode: 0,
  fps: 60,

  debugUnlockAll: false,  // dev toggle: show every river as unlocked regardless of pack ownership
  debugNoCapsize: false,  // dev toggle: kayak.step ignores roll/pitch capsize — toggled in-run (KeyG / mGod)

  // the boat for the current run: KAYAK with the craft's (and, if owned, the better-paddle
  // upgrade's) mods applied, plus the craft itself for hull colour / lootMod. Set in startRun.
  effK: KAYAK,
  runCraft: CRAFTS.classic,
  runLoot: emptyLoot(),

  snackMsgUntil: 0,       // simTime until which the "snack eaten" HUD line shows
  drinkBuffUntil: 0,      // simTime until which the energy booster's skill buff is active (see traits())
  drinkMsgUntil: 0,       // simTime until which the "booster drunk" HUD line shows
  mapFoundUntil: 0,       // simTime until which the "hidden map found" HUD line shows
};

export const isRunning = () => G.gameState === 'run';