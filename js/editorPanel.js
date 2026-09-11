// The level editor's side panel: collapsible sections of sliders/selects/toggles built from the
// custom river's config, plus the feature placement buttons and the selected feature's parameters.
// Pure DOM; all effects go through ctx.api (editor.js) so changes save and rebuild uniformly.
import { BIOMES, TIME_OF_DAY, TIERS, COLLECTIBLES, CRAFTS } from './config/index.js';
import { clamp } from './math.js';
import { L, dx } from './quality.js';
import { FEATURES, FEATURE_ORDER, sld, sel, chk } from './editorFeatures.js';

const panelOpen = new Set(['river', 'channel', 'features', 'test']);   // survives re-renders

const div = (cls, html) => {
  const d = document.createElement('div');
  d.className = cls;
  if (html != null) d.innerHTML = html;
  return d;
};
const btn = (text, onclick, cls = '') => {
  const b = document.createElement('button');
  b.textContent = text;
  b.className = cls;
  b.onclick = onclick;
  return b;
};

// ---------- control builders ----------
function sliderCtl(spec, onChange) {
  const row = div('ctl'), lab = div('lab');
  lab.textContent = spec.label;
  const inp = document.createElement('input');
  inp.type = 'range';
  const val = div('val');
  const fmt = spec.fmt || (v => (spec.step >= 1 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)));
  const toS = v => (spec.log ? Math.round(1000 * Math.log(v / spec.min) / Math.log(spec.max / spec.min)) : v);
  const fromS = p => (spec.log ? spec.min * Math.pow(spec.max / spec.min, p / 1000) : +p);
  if (spec.log) { inp.min = 0; inp.max = 1000; inp.step = 1; }
  else { inp.min = spec.min; inp.max = spec.max; inp.step = spec.step; }
  const cur = clamp(spec.get() ?? spec.min, spec.min, spec.max);
  inp.value = toS(cur);
  val.textContent = fmt(cur);
  inp.oninput = () => {
    let v = fromS(inp.value);
    if (!spec.log && spec.step >= 1) v = Math.round(v);
    spec.set(v);
    val.textContent = fmt(spec.get() ?? v);   // re-read: setters may cross-clamp (rockR, slab)
    onChange();
  };
  row.append(lab, inp, val);
  return row;
}
function selectCtl(spec, onChange) {
  const row = div('ctl'), lab = div('lab');
  lab.textContent = spec.label;
  const s = document.createElement('select');
  for (const o of spec.options) {
    const op = document.createElement('option');
    op.value = o;
    op.textContent = o;
    s.appendChild(op);
  }
  s.value = spec.get();
  s.onchange = () => { spec.set(s.value); onChange(); };
  row.append(lab, s);
  return row;
}
function checkCtl(spec, onChange) {
  const row = div('ctl'), lab = document.createElement('label');
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = !!spec.get();
  c.onchange = () => { spec.set(c.checked); onChange(); };
  lab.append(c, document.createTextNode(' ' + spec.label));
  row.appendChild(lab);
  return row;
}
const buildCtl = (spec, onChange) =>
  spec.kind === 'select' ? selectCtl(spec, onChange) : spec.kind === 'check' ? checkCtl(spec, onChange) : sliderCtl(spec, onChange);

function section(id, title, children) {
  const d = document.createElement('details');
  d.className = 'sec';
  d.dataset.sec = id;
  d.open = panelOpen.has(id);
  d.addEventListener('toggle', () => { if (d.open) panelOpen.add(id); else panelOpen.delete(id); });
  const s = document.createElement('summary');
  s.textContent = title;
  d.appendChild(s);
  for (const c of children) if (c) d.appendChild(c);
  return d;
}

// ---------- sections ----------
function riverRows(cfg, ctx) {
  const rows = [], tierRow = div('ctl btns', '<span class="lab">tier</span>');
  for (const t of TIERS) {
    tierRow.appendChild(btn(t.id, () => { cfg.tier = t.id; ctx.api.change({ panel: true }); }, cfg.tier === t.id ? 'on' : ''));
  }
  rows.push(tierRow);
  const ch = () => ctx.api.change();
  rows.push(buildCtl(sel('biome', () => cfg.biome ?? 'alpine', v => { cfg.biome = v; }, Object.keys(BIOMES)), ch));
  rows.push(buildCtl(sel('time of day', () => cfg.timeOfDay ?? 'day', v => { cfg.timeOfDay = v; }, Object.keys(TIME_OF_DAY)), ch));
  rows.push(buildCtl(sld('length (m)', () => cfg.len ?? L * dx - 25, v => { cfg.len = v; }, 80, L * dx - 25, 5, v => v.toFixed(0)), ch));
  const seedRow = div('ctl', `<span class="lab">seed</span><span class="val">${cfg.seed}</span>`);
  seedRow.appendChild(btn('🎲 re-roll', () => { cfg.seed = 1 + Math.floor(Math.random() * 1e6); ctx.api.change({ panel: true }); }));
  rows.push(seedRow);
  return rows;
}
function hydroRows(cfg, ch) {
  return [
    buildCtl(sld('gradient', () => cfg.slope, v => { cfg.slope = v; }, 0.0003, 0.05, 0, v => (v * 100).toFixed(2) + ' %', true), ch),
    buildCtl(sld('manning n', () => cfg.manning, v => { cfg.manning = v; }, 0.02, 0.06, 0.001, v => v.toFixed(3)), ch),
    buildCtl(sld('depth (m)', () => cfg.depth, v => { cfg.depth = v; }, 0.4, 4, 0.05), ch),
  ];
}
function channelRows(cfg, ctx) {
  const ch = () => ctx.api.change();
  const rows = [
    div('note', 'half width & variation are also drag-editable in ↔ Width mode'),
    buildCtl(sld('half width (m)', () => cfg.halfW, v => { cfg.halfW = v; }, 2.5, 28, 0.1), ch),
    buildCtl(sld('width variation', () => cfg.widthVar, v => { cfg.widthVar = v; }, 0, 0.95, 0.01), ch),
    buildCtl(sld('constrictions', () => cfg.constrictions ?? 0, v => { cfg.constrictions = v; }, 0, 8, 1), ch),
    buildCtl(sld('valley height (m)', () => cfg.valleyH, v => { cfg.valleyH = v; }, 4, 60, 1), ch),
    buildCtl(sld('valley scale (m)', () => cfg.valleyScale, v => { cfg.valleyScale = v; }, 20, 120, 1), ch),
    buildCtl(chk('braided lanes', () => !!cfg.lanes, v => {
      if (v) cfg.lanes = cfg.lanes || { count: 2, amp: 0.12, wander: 2, seedOffset: cfg.seed ?? 1 };
      else delete cfg.lanes;
    }), () => ctx.api.change({ panel: true })),
  ];
  if (cfg.lanes) {
    rows.push(buildCtl(sld('lanes', () => cfg.lanes.count, v => { cfg.lanes.count = v; }, 1, 4, 1), ch));
    rows.push(buildCtl(sld('lane depth', () => cfg.lanes.amp ?? 0.15, v => { cfg.lanes.amp = v; }, 0, 0.4, 0.01), ch));
    rows.push(buildCtl(sld('lane wander', () => cfg.lanes.wander ?? 2, v => { cfg.lanes.wander = v; }, 0, 6, 0.5), ch));
  }
  return rows;
}
function meanderRows(cfg, ctx) {
  const rows = [div('note', 'drag on the river in 〰 Meander mode: ← → amplitude, ↑ ↓ wavelength of the ◉ component')];
  cfg.meander = cfg.meander || [];
  cfg.meander.forEach((cmp, i) => {
    const head = div('ctl mhead');
    head.appendChild(btn((ctx.meanderSel === i ? '◉ ' : '○ ') + `component ${i + 1}`,
      () => ctx.api.setMeanderSel(i), ctx.meanderSel === i ? 'on' : ''));
    head.appendChild(btn('✕', () => { cfg.meander.splice(i, 1); ctx.api.change({ panel: true }); }));
    rows.push(head);
    rows.push(buildCtl(sld('amplitude (m)', () => cmp[0], v => { cmp[0] = v; }, 0, 40, 0.5), () => ctx.api.change()));
    rows.push(buildCtl(sld('wavelength (m)', () => cmp[1], v => { cmp[1] = v; }, 20, 400, 0, v => v.toFixed(0), true), () => ctx.api.change()));
  });
  if (cfg.meander.length < 4) {
    rows.push(btn('＋ add component', () => { cfg.meander.push([8, 60 + 60 * cfg.meander.length]); ctx.api.change({ panel: true }); }, 'addbtn'));
  }
  return rows;
}
// ---------- bridge pillar/pylon columns: a count (auto-spread) or a hand-edited array ----------
const COLUMN_FIELD_SPECS = {
  along: { label: 'along span', min: -0.2, max: 1.2, step: 0.01, fmt: v => v.toFixed(2) },
  across: { label: 'across (± half-width)', min: -1.5, max: 1.5, step: 0.02, fmt: v => v.toFixed(2) },
  radius: { label: 'radius (m)', min: 0.2, max: 3, step: 0.05, fmt: v => v.toFixed(2) },
  sizeAlong: { label: 'size along (m)', min: 0.2, max: 6, step: 0.1, fmt: v => v.toFixed(1) },
  sizeAcross: { label: 'size across (m)', min: 0.2, max: 8, step: 0.1, fmt: v => v.toFixed(1) },
  yaw: { label: 'yaw (°)', min: -90, max: 90, step: 1, fmt: v => v.toFixed(0) },
};
// converts an even auto-spread count into the same positions generateRiver() would've used
// (river.js), so switching to individual editing doesn't visually jump
const spreadColumns = (n, template) => Array.from({ length: n }, (_, k) => ({ ...template, along: +((k + 1) / (n + 1)).toFixed(3) }));
function columnRows(it, colSpec, ctx) {
  const { key, label, max, template, fields } = colSpec, ch = () => ctx.api.change();
  const rows = [];
  if (!Array.isArray(it[key])) {
    rows.push(div('note', `${label}s are auto-spread evenly across the span (may be trimmed if it's too narrow)`));
    rows.push(buildCtl(sld(`${label}s`, () => it[key] ?? 0, v => { it[key] = v; }, 0, max, 1), ch));
    rows.push(btn(`✎ place each ${label} individually`, () => {
      it[key] = spreadColumns(Math.max(1, Math.round(it[key] ?? 1)), template);
      ctx.api.change({ panel: true });
    }, 'addbtn'));
    return rows;
  }
  const cols = it[key];
  rows.push(div('note', `${cols.length} ${label}${cols.length === 1 ? '' : 's'}, placed individually`));
  cols.forEach((col, i) => {
    const head = div('ctl mhead');
    head.appendChild(div('lab', `${label} ${i + 1}`));
    head.appendChild(btn('✕', () => {
      cols.splice(i, 1);
      if (!cols.length) it[key] = 0;
      ctx.api.change({ panel: true });
    }));
    rows.push(head);
    for (const f of fields) {
      const fs = COLUMN_FIELD_SPECS[f];
      rows.push(buildCtl(sld(fs.label, () => col[f] ?? template[f] ?? 0, v => { col[f] = v; }, fs.min, fs.max, fs.step, fs.fmt), ch));
    }
  });
  if (cols.length < max) {
    rows.push(btn(`＋ add ${label}`, () => { cols.push({ ...template, along: +((cols.length + 1) / (cols.length + 2)).toFixed(3) }); ctx.api.change({ panel: true }); }, 'addbtn'));
  }
  rows.push(btn('↺ back to a simple count', () => { it[key] = cols.length; ctx.api.change({ panel: true }); }));
  return rows;
}
function rockRows(cfg, ch) {
  return [
    div('note', 'boulders & constrictions are placed randomly from the seed'),
    buildCtl(sld('boulders', () => cfg.rocks ?? 0, v => { cfg.rocks = v; if (v > 0 && !cfg.rockR) cfg.rockR = [0.8, 2.0]; }, 0, 200, 1), ch),
    buildCtl(sld('boulder r min (m)', () => cfg.rockR?.[0] ?? 0.8, v => {
      cfg.rockR = cfg.rockR || [0.8, 2.0];
      cfg.rockR[0] = Math.min(v, cfg.rockR[1]);
    }, 0.3, 3, 0.1), ch),
    buildCtl(sld('boulder r max (m)', () => cfg.rockR?.[1] ?? 2.0, v => {
      cfg.rockR = cfg.rockR || [0.8, 2.0];
      cfg.rockR[1] = Math.max(v, cfg.rockR[0]);
    }, 0.5, 4, 0.1), ch),
    buildCtl(sld('emergent fraction', () => cfg.emergent ?? 0.3, v => { cfg.emergent = v; }, 0, 1, 0.05), ch),
  ];
}
function waterRows(cfg, ch) {
  cfg.waterTint = cfg.waterTint || [0.03, 0.14, 0.09];
  const wt = cfg.waterTint;
  return [
    ...['tint red', 'tint green', 'tint blue'].map((label, i) =>
      buildCtl(sld(label, () => wt[i], v => { wt[i] = v; }, 0, 0.35, 0.005), ch)),
    buildCtl(sld('clarity', () => cfg.waterClarity ?? 1, v => { cfg.waterClarity = v; }, 0.2, 4, 0, v => v.toFixed(2), true), ch),
  ];
}
function rulesRows(cfg, ctx) {
  const ch = () => ctx.api.change(), chP = () => ctx.api.change({ panel: true });
  const extraOpts = ['(none)', ...Object.keys(COLLECTIBLES).filter(k => COLLECTIBLES[k].type === 'currency' && k !== 'coin')];
  const rows = [
    buildCtl(sld('time limit', () => cfg.timeLimit ?? 0, v => { if (v > 0) cfg.timeLimit = v; else delete cfg.timeLimit; },
      0, 600, 10, v => (v ? v + ' s' : 'off')), ch),
    buildCtl(sld('loot multiplier', () => cfg.lootMult ?? 1, v => { cfg.lootMult = v; }, 0.25, 5, 0.25), ch),
    buildCtl(sld('coins', () => cfg.coinCount ?? 0, v => { if (v > 0) cfg.coinCount = v; else delete cfg.coinCount; },
      0, 60, 1, v => (v ? v.toFixed(0) : 'auto')), ch),
    buildCtl(sld('evasive coins', () => cfg.evasiveCoinCount ?? 0, v => { if (v > 0) cfg.evasiveCoinCount = v; else delete cfg.evasiveCoinCount; },
      0, 40, 1), ch),
    buildCtl(sel('extra pickup', () => cfg.extraKind ?? '(none)', v => {
      if (v === '(none)') { delete cfg.extraKind; delete cfg.extraCount; } else cfg.extraKind = v;
    }, extraOpts), chP),
  ];
  if (cfg.extraKind) rows.push(buildCtl(sld('extra count', () => cfg.extraCount ?? 6, v => { cfg.extraCount = v; }, 1, 20, 1), ch));
  rows.push(buildCtl(chk('single attempt (secret-style)', () => !!cfg.singleAttempt, v => {
    if (v) cfg.singleAttempt = true; else delete cfg.singleAttempt;
  }), ch));
  return rows;
}
function obstacleRows(cfg, ch) {
  const rows = [div('note', 'drifting obstacles can\'t be combined with bridges (the validator will say so)')];
  for (const kind of ['log', 'ice']) {
    for (const cls of ['medium', 'large']) {
      rows.push(buildCtl(sld(`${kind} ${cls} / 100 m`, () => cfg.obstacles?.[kind]?.[cls] ?? 0, v => {
        if (v > 0) {
          cfg.obstacles = cfg.obstacles || {};
          cfg.obstacles[kind] = cfg.obstacles[kind] || {};
          cfg.obstacles[kind][cls] = v;
        } else if (cfg.obstacles?.[kind]) {
          delete cfg.obstacles[kind][cls];
          if (!Object.keys(cfg.obstacles[kind]).length) delete cfg.obstacles[kind];
          if (!Object.keys(cfg.obstacles).length) delete cfg.obstacles;
        }
      }, 0, 30, 0.5), ch));
    }
  }
  return rows;
}
function featureRows(cfg, ctx) {
  const rows = [div('note', 'arm a feature, then click the river (📍 Features mode); drag markers to move, Del deletes')];
  const grid = div('featgrid');
  for (const type of FEATURE_ORDER) {
    const F = FEATURES[type];
    const taken = F.storage.max1 && F.storage.items(cfg).length;
    const b = btn(`${F.icon} ${F.label}`, () => ctx.api.arm(type), ctx.armed === type ? 'on' : '');
    if (taken) { b.disabled = true; b.title = 'already placed'; }
    grid.appendChild(b);
  }
  rows.push(grid);
  for (const type of FEATURE_ORDER) {
    const F = FEATURES[type];
    F.storage.items(cfg).forEach((it, i) => {
      const seld = ctx.sel && ctx.sel.type === type && ctx.sel.i === i;
      const row = div('featrow' + (seld ? ' on' : ''), `${F.icon} ${F.label} · ${F.z(it).toFixed(0)} m`);
      row.onclick = () => ctx.api.select(type, i);
      rows.push(row);
      if (seld) {
        const box = div('featparams');
        for (const spec of F.params(it)) box.appendChild(buildCtl(spec, () => ctx.api.change()));
        if (F.columns) for (const row of columnRows(it, F.columns, ctx)) box.appendChild(row);
        box.appendChild(div('hint', 'drag its marker on the river to move it' + (type === 'vortex' ? ' (moves in x and z)' : '')));
        box.appendChild(btn('🗑 Delete (Del)', ctx.api.del, 'del'));
        rows.push(box);
      }
    });
  }
  return rows;
}

// test-run settings live on ctx.test (editor.js's ed.test) — session-only prefs, not part of the
// river config, so changes here don't save/rebuild; they just take effect on the next test run
function testRunRows(test) {
  const noop = () => {};
  return [
    div('note', 'pick a boat and traits, then switch to 🛶 Test mode and click the river to spawn it there and start a real run — full inventory every time, and none of this touches your save.'),
    buildCtl(sel('boat', () => test.craft, v => { test.craft = v; }, Object.keys(CRAFTS)), noop),
    buildCtl(sld('skill', () => test.skill, v => { test.skill = v; }, 0, 10, 1), noop),
    buildCtl(sld('stamina', () => test.stamina, v => { test.stamina = v; }, 0, 10, 1), noop),
    buildCtl(chk('🛡 god mode (no capsizing)', () => test.god, v => { test.god = v; }), noop),
  ];
}
export function renderPanel(host, ctx) {
  const { cfg } = ctx, ch = () => ctx.api.change();
  host.innerHTML = '';
  // first and always open — it's how you play what's below, not part of what's being built
  host.appendChild(section('test', '🛶 Test run', testRunRows(ctx.test)));
  host.appendChild(section('river', '🏞 River', riverRows(cfg, ctx)));
  host.appendChild(section('hydro', '🌊 Hydraulics', hydroRows(cfg, ch)));
  host.appendChild(section('channel', '↔ Channel & valley', channelRows(cfg, ctx)));
  host.appendChild(section('meander', '〰 Meander', meanderRows(cfg, ctx)));
  host.appendChild(section('rocks', '🪨 Boulders', rockRows(cfg, ch)));
  host.appendChild(section('water', '💧 Water look', waterRows(cfg, ch)));
  host.appendChild(section('rules', '🏁 Rules & loot', rulesRows(cfg, ctx)));
  host.appendChild(section('obst', '🪵 Floating obstacles', obstacleRows(cfg, ch)));
  host.appendChild(section('features', '📍 Features', featureRows(cfg, ctx)));
}