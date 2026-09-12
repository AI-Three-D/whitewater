// The one shared, mutable game state — replaces the old main() closure's `let`s.
import { KAYAK, CRAFTS } from './config/index.js';

export const TIME_SCALE = 2;
// cap on ticks replayed in one frame, so a big stall doesn't spiral trying to catch up
export const MAX_PHYS_TICKS = 8;

export const newRunLoot = () => ({
  paddles: 0, coins: 0, coinValue: 0, snacks: 0, bandaids: 0, medikits: 0, books: 0,
  raftFound: false, helmetFound: false,
});

export const S = {
  river: null,
  profile: null,            // null → character selection
  gameState: 'menu',        // 'menu' | 'run' | 'over' | 'editor' | 'testWarmup' (editor test-run setup, see editor.js)
  warmingUp: false,
  paused: false,            // 'run' only — see togglePause in run.js; frame() freezes outright
  simTime: 0,
  runTime: 0,
  frameTicks: 2,            // physics ticks run this frame (kayak.step divides obstacle reactions by it)
  fps: 60,
  camMode: 0,
  // post-run free-look orbit — see cam.update in render.js and initFreeLook in controls.js
  freeCam: { yaw: 0, pitch: 0.28, dist: 9 },
  // level-editor fly camera (editor.js); its z also centres the editor's culling windows (view.js)
  flyCam: { pos: [0, 10, 0], yaw: 0, pitch: -0.35, speed: 15 },
 
  dbgMode: 0,
  debugUnlockAll: false,    // dev: show every river as unlocked regardless of pack ownership
  debugNoCapsize: false,    // dev: kayak.step ignores roll/pitch capsize (KeyG / mGod)
  effK: KAYAK,               // this run's boat: KAYAK with craft/paddle mods applied; set in startRun
  runCraft: CRAFTS.classic,
  runLoot: newRunLoot(),
  // simTime deadlines for transient HUD lines / buffs
  snackMsgUntil: 0,
  drinkBuffUntil: 0,
  drinkMsgUntil: 0,
  mapFoundUntil: 0,

  testExit: null,
  testRetry: null,
  testEnd: null,
  onRunOver: null,
};

export function resetRunCounters() {
  S.runLoot = newRunLoot();
  S.snackMsgUntil = 0;
  S.drinkBuffUntil = 0;
  S.drinkMsgUntil = 0;
}