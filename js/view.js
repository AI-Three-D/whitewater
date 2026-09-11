// Which stretch of river is "in view": the chase cam's asymmetric window during a run, a symmetric
// one around the fly camera in the level editor (it can face any direction, so viewAhead is used
// all round). Every z-culling site (terrain LOD, props, bridges, obstacles, sim rows) goes through here.
import { RENDER } from './config/index.js';
import { S } from './state.js';
import { kayak } from './kayak.js';

export const isEditing = () => S.gameState === 'editor';

// z the windows are centred on
export const focusZ = () => (isEditing() ? S.flyCam.pos[2] : kayak.p[2]);

// drawn terrain/water/props cover [zc - back, zc + ahead]
export function viewWindow() {
  const ed = isEditing();
  return { zc: focusZ(), back: ed ? RENDER.viewAhead : RENDER.viewBehind, ahead: RENDER.viewAhead };
}

// rows the water sim runs on
export function simWindow() {
  const ed = isEditing();
  return { zc: focusZ(), back: ed ? RENDER.computeAhead : RENDER.computeBehind, ahead: RENDER.computeAhead };
}