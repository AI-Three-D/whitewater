// Custom (level-editor) rivers: persisted in localStorage the same way as the save game, exported
// as JSON for pasting into config/rivers.js later. Pure data apart from the download helper.
import { RIVERS, RIVERS_HIDDEN, TIERS, BIOMES, TIME_OF_DAY, COLLECTIBLES, OBSTACLES, makeRiver } from './config/index.js';

const KEY = 'whitewater.customRivers.v1';

// "blank template": a plain easy alpine run with every field generateRiver() needs
export const CUSTOM_TEMPLATE = {
  tier: 'easy', name: 'New river',
  slope: 0.002, manning: 0.032, depth: 1.5, len: 300, seed: 1,
  halfW: 10, widthVar: 0.25, meander: [[18, 170], [6, 60]], constrictions: 0, valleyH: 12, valleyScale: 70,
  rocks: 10, rockR: [0.8, 2.0], emergent: 0.3, ledges: [], bands: [],
  biome: 'alpine', timeOfDay: 'day', waterTint: [0.03, 0.14, 0.09], waterClarity: 1.2,
  lanes: { count: 2, amp: 0.12, wander: 2, seedOffset: 1 },
};

const clone = o => JSON.parse(JSON.stringify(o));
export const builtInRivers = () => [...RIVERS, ...RIVERS_HIDDEN];

export function loadCustomRivers() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(list)) return list.filter(e => e && typeof e.id === 'string' && e.config && typeof e.config === 'object');
  } catch (_) { /* corrupt → start empty */ }
  return [];
}
function saveAll(list) { localStorage.setItem(KEY, JSON.stringify(list)); }

export const getCustom = id => loadCustomRivers().find(e => e.id === id) || null;

// touch: false for bookkeeping saves (camera view) that shouldn't bump the "edited" time
export function saveCustom(entry, { touch = true } = {}) {
  if (touch) entry.updated = Date.now();
  const list = loadCustomRivers(), i = list.findIndex(e => e.id === entry.id);
  if (i >= 0) list[i] = entry; else list.push(entry);
  saveAll(list);
}

export function deleteCustom(id) { saveAll(loadCustomRivers().filter(e => e.id !== id)); }

// profile.best is keyed by name, so a custom river never reuses a built-in's (or another custom's) name
function uniqueName(base) {
  const taken = new Set([...builtInRivers(), ...loadCustomRivers().map(e => e.config)].map(r => r.name));
  let name = base, k = 2;
  while (taken.has(name)) name = `${base} ${k++}`;
  return name;
}

// baseName: a built-in river to duplicate, or '' for the blank template
export function createCustom(baseName) {
  const base = builtInRivers().find(r => r.name === baseName);
  const config = clone(base || CUSTOM_TEMPLATE);
  delete config.cls;   // derived from tier by makeRiver
  config.name = uniqueName(base ? `${base.name} (custom)` : CUSTOM_TEMPLATE.name);
  const now = Date.now();
  const entry = { id: 'c' + now.toString(36) + Math.random().toString(36).slice(2, 6), config, created: now, updated: now, view: null };
  saveCustom(entry, { touch: false });
  return entry;
}

// the runtime river table (same shape RIVERS entries have), from a stored entry
export function customRiverR(entry) {
  const { tier, ...fields } = clone(entry.config);
  return { ...makeRiver(tier, fields), custom: entry.id };
}

// cheap structural checks generateRiver() doesn't do itself; bridges are checked by validateRiverConfig
const REQUIRED_NUMBERS = ['slope', 'manning', 'depth', 'seed', 'halfW', 'widthVar', 'constrictions', 'valleyH', 'valleyScale', 'rocks', 'emergent'];
export function checkCustomR(R) {
  const errs = [];
  if (typeof R.name !== 'string' || !R.name.trim()) errs.push('name is required');
  if (!TIERS.some(t => t.id === R.tier)) errs.push(`tier must be one of ${TIERS.map(t => t.id).join(', ')} (got ${R.tier})`);
  for (const k of REQUIRED_NUMBERS) if (typeof R[k] !== 'number' || !Number.isFinite(R[k])) errs.push(`${k} must be a number (got ${R[k]})`);
  if (!Array.isArray(R.meander)) errs.push('meander must be an array of [amplitude, wavelength] pairs');
  if (!Array.isArray(R.ledges)) errs.push('ledges must be an array of [z, drop] pairs');
  if (R.rocks > 0 && !(Array.isArray(R.rockR) && R.rockR.length === 2)) errs.push('rockR must be [min, max] when rocks > 0');
  if (R.biome && !BIOMES[R.biome]) errs.push(`unknown biome "${R.biome}"`);
  if (R.timeOfDay && !TIME_OF_DAY[R.timeOfDay]) errs.push(`unknown timeOfDay "${R.timeOfDay}"`);
  if (R.extraKind && !COLLECTIBLES[R.extraKind]) errs.push(`unknown extraKind "${R.extraKind}"`);
  for (const k of Object.keys(R.obstacles || {})) {
    if (k !== 'max' && k !== 'spawnAhead' && !OBSTACLES.kinds[k]) errs.push(`unknown obstacle kind "${k}"`);
  }
  if (errs.length) throw new Error(`River "${R.name}":\n` + errs.join('\n'));
}

// ---------- export ----------
// name/tier first, derived/editor-only fields stripped — ready to become river(tier, {...}) in rivers.js
export function exportConfig(entry) {
  const { name, tier, cls, custom, ...rest } = clone(entry.config);
  return { name, tier, ...rest };
}

// JSON with number/string arrays kept on one line ([18, 170]) so it reads like the hand-written configs
function pretty(v, ind = '') {
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (v.every(x => x === null || typeof x !== 'object')) return '[' + v.map(x => JSON.stringify(x)).join(', ') + ']';
    const ni = ind + '  ';
    return '[\n' + v.map(x => ni + pretty(x, ni)).join(',\n') + '\n' + ind + ']';
  }
  if (v && typeof v === 'object') {
    const ks = Object.keys(v).filter(k => v[k] !== undefined);
    if (!ks.length) return '{}';
    const ni = ind + '  ';
    return '{\n' + ks.map(k => ni + JSON.stringify(k) + ': ' + pretty(v[k], ni)).join(',\n') + '\n' + ind + '}';
  }
  return JSON.stringify(v);
}
export const exportJson = entry => pretty(exportConfig(entry));

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'river';

export function downloadJson(entry) {
  const blob = new Blob([exportJson(entry) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = slug(entry.config.name) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}