// Small HTML/DOM helpers shared by the menu, store, character sheet and HUD.
import { clamp } from './math.js';
import { pointsForLevel } from './progression.js';
import { $ } from './platform.js';

export const show = (id, mode = 'flex') => { $(id).style.display = mode; };
export const hide = id => { $(id).style.display = 'none'; };
export const isShown = id => $(id).style.display === 'flex';

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// floor val: passive per-level trait growth is fractional, but a pip should only light up
// once a full point's worth has accrued, not for a sliver of progress toward the next one
export const pips = (val, cap, max = 10) => `<div class="bar">${Array.from({ length: max }, (_, i) =>
  `<i class="${i < Math.floor(val) ? 'on' : ''}${i >= cap ? ' cap' : ''}"></i>`).join('')}</div>`;

// a slim proportional bar (reuses the xp-bar look) for stats whose range is too wide for
// individual pips to read well — health's cap goes up to 20, injury tracks against it
export const statBar = (val, cap, color) =>
  `<div class="xpbar"><div class="xpfill" style="width:${clamp(100 * val / Math.max(cap, 1), 0, 100)}%;background:${color}"></div></div>`;

export const xpPct = profile => clamp(100 * profile.points / pointsForLevel(profile.level), 0, 100);
export const xpBar = profile => `<div class="xpbar"><div class="xpfill" style="width:${xpPct(profile)}%"></div></div>`;

// stand-in for art that isn't in yet; pass a url once real art exists to swap the label for it
export const artSlot = (cls, label, url) => url
  ? `<div class="art-slot ${cls}" style="background-image:url('${url}');background-size:cover;background-position:center" role="img" aria-label="${label}"></div>`
  : `<div class="art-slot ${cls}">${label}</div>`;

export const swatch = c =>
  `<i class="swatch" style="background:rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})"></i>`;

export const coins = n => `<b style="color:#ffd35c">${n || 0}</b> coin${n === 1 ? '' : 's'}`;