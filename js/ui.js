// Out-of-run screens: main menu (character select, top bar, boat picker, river carousels),
// level-up, store and character sheet. Pure DOM; game actions are injected via initUi().
import { QUALITY_LEVELS, TIERS, RIVERS, RIVERS_HIDDEN, RIVER_PACKS, CHARACTERS, CRAFTS, ITEMS, UPGRADES, TRAINING, STORE_LISTING, OBSTACLES } from './config/index.js';
import { clamp } from './math.js';
import { newProfile, clearProfile, saveProfile, character, canRaise, anyRaisable, spendPoint, discardPending, pointsForLevel,
  itemCount, canBuyItem, canBuyCraft, buyItem, buyCraft, selectCraft, ownsUpgrade, canBuyUpgrade, buyUpgrade, canHeal, healInjury,
  ownsPack, canBuyPack, buyPack, riverUnlocked, canBuyTraining, buyTraining } from './progression.js';
import { S } from './state.js';
import { $ } from './platform.js';
import { quality, saveQuality } from './quality.js';
import { pad } from './controls.js';

const handlers = { startRun: null };
export function initUi(h) {
  Object.assign(handlers, h);
  addEventListener('resize', layoutCarousels);
}

// ---------- small html helpers ----------
export const plural = (n, word, pl = word + 's') => `${n} ${n === 1 ? word : pl}`;
export const isOpen = id => $(id).style.display === 'flex';
const show = (id, mode = 'flex') => { $(id).style.display = mode; };
const hide = id => { $(id).style.display = 'none'; };

// floor val: passive per-level trait growth is fractional, but a pip should only light up once a
// full point's worth has accrued
const pips = (val, cap, max = 10) => `<div class="bar">${Array.from({ length: max }, (_, i) =>
  `<i class="${i < Math.floor(val) ? 'on' : ''}${i >= cap ? ' cap' : ''}"></i>`).join('')}</div>`;

// slim proportional bar for stats whose range is too wide for pips (health goes to 20)
const statBar = (val, cap, color) =>
  `<div class="xpbar"><div class="xpfill" style="width:${clamp(100 * val / Math.max(cap, 1), 0, 100)}%;background:${color}"></div></div>`;

// stand-in for art that isn't in yet; pass a url once real art exists
const artSlot = (cls, label, url) => (url
  ? `<div class="art-slot ${cls}" style="background-image:url('${url}');background-size:cover;background-position:center" role="img" aria-label="${label}"></div>`
  : `<div class="art-slot ${cls}">${label}</div>`);

const swatch = c => `<i class="swatch" style="background:rgb(${c.map(v => Math.round(v * 255)).join(',')})"></i>`;

const xpBar = prof => {
  const need = pointsForLevel(prof.level), pct = clamp(100 * prof.points / need, 0, 100);
  return { need, html: `<div class="xpbar"><div class="xpfill" style="width:${pct}%"></div></div>` };
};

// ---------- menu ----------
export function showMenu() {
  S.gameState = 'menu';
  document.body.classList.remove('inrun');
  pad.queue.length = 0;
  show('menu');
  hide('msg');
  hide('stam');
  hide('loot');
  renderMenu();
  if (S.profile && S.profile.pending > 0) showLevelUp();
}

function renderQuality() {
  const el = $('quality'), labels = { high: 'High', medium: 'Medium', low: 'Low' };
  el.innerHTML = '<span>detail</span>' + QUALITY_LEVELS.map(q =>
    `<button data-q="${q}" class="${q === quality ? 'on' : ''}">${labels[q]}</button>`).join('');
  for (const btn of el.querySelectorAll('button')) {
    btn.onclick = () => {
      if (btn.dataset.q === quality) return;
      saveQuality(btn.dataset.q);
      location.reload();   // grid/particle/prop buffers are sized once at load — a reload is the safe way to re-tier
    };
  }
}

function renderCharSelect() {
  const cs = $('charsel');
  cs.innerHTML = '<p style="width:100%;margin:0 0 6px">Choose your paddler</p>';
  for (const [id, c] of Object.entries(CHARACTERS)) {
    const d = document.createElement('div');
    d.className = 'chr';
    d.innerHTML = `${artSlot('chr-portrait', c.name + ' art', c.art)}
      <h3>${c.name}</h3><small>${c.title}</small><p>${c.desc}</p>
      <small>skill ${c.start.skill}/${c.caps.skill}</small>${pips(c.start.skill, c.caps.skill)}
      <small>stamina ${c.start.stamina}/${c.caps.stamina}</small>${pips(c.start.stamina, c.caps.stamina)}
      <small>health ${c.start.health}/${c.caps.health}</small>${statBar(c.start.health, c.caps.health, '#7fd6ff')}`;
    d.onclick = () => {
      S.profile = newProfile(id);
      renderMenu();
    };
    cs.appendChild(d);
  }
}

function renderTopbar() {
  const prof = S.profile, c = character(prof), xp = xpBar(prof), tb = $('topbar');
  tb.innerHTML = `${artSlot('topbar-portrait', 'portrait', c.art)}
    <div class="topbar-info">
      <div><b style="color:#ffe08a">${c.name}</b> ${c.title} · level <b>${prof.level}</b>
        · <b style="color:#ffd35c">${prof.coins || 0}</b> ${prof.coins === 1 ? 'coin' : 'coins'}</div>
      ${xp.html}
      <small style="color:#9bc">${prof.points} / ${xp.need} xp to next level · ${plural(prof.runs, 'run')}</small>
    </div>
    <div class="topbar-btns"><button id="openCharSheet">Character</button><button id="openStoreBtn">Store</button>
      <button id="debugUnlockBtn" style="background:${S.debugUnlockAll ? '#a33' : ''}">${S.debugUnlockAll ? 'Debug: all unlocked' : 'Debug: unlock all rivers'}</button>
      <button id="debugMoneyBtn">Debug: +1000 coins</button>
      <button id="debugInvBtn">Debug: full inventory</button>
      <button id="debugMaxBtn">Debug: max skills</button>
      <button id="debugGearBtn">Debug: all gear</button></div>`;
  $('openCharSheet').onclick = showCharSheet;
  $('openStoreBtn').onclick = showStore;
  $('debugUnlockBtn').onclick = () => {
    S.debugUnlockAll = !S.debugUnlockAll;
    renderMenu();
  };
  $('debugMoneyBtn').onclick = () => {
    prof.coins = (prof.coins || 0) + 1000;
    saveProfile(prof);
    renderMenu();
  };
  // dev: top up every consumable to its max stack so testing doesn't need to grind coins first
  $('debugInvBtn').onclick = () => {
    for (const id of Object.keys(ITEMS)) prof.inventory[id] = ITEMS[id].maxStack;
    saveProfile(prof);
    renderMenu();
  };
  // dev: skill/stamina/health straight to this character's caps — the level/xp/points bookkeeping
  // is left alone, this is only for testing what maxed-out traits feel like
  $('debugMaxBtn').onclick = () => {
    const caps = c.caps;
    prof.skill = caps.skill; prof.stamina = caps.stamina; prof.health = caps.health;
    saveProfile(prof);
    renderMenu();
  };
  // dev: own every craft and upgrade — debugInvBtn only covers consumables (ITEMS), this is the
  // one-time, ownership-based store items (boats, gear) it doesn't touch
  $('debugGearBtn').onclick = () => {
    for (const id of Object.keys(CRAFTS)) if (!prof.crafts.includes(id)) prof.crafts.push(id);
    for (const id of Object.keys(UPGRADES)) if (!prof.upgrades.includes(id)) prof.upgrades.push(id);
    saveProfile(prof);
    renderMenu();
  };
}

// boat picker: one toggle per owned craft. Selection persists in the profile (read by startRun).
function renderCraftBar() {
  const prof = S.profile, cb = $('craftbar');
  cb.style.display = 'flex';
  // only count crafts actually sold in the store — the raft is found, not bought
  const unowned = STORE_LISTING.filter(e => e.type === 'craft' && !prof.crafts.includes(e.id)).length;
  cb.innerHTML = '<span>boat</span>' + prof.crafts.map(id => {
    const c = CRAFTS[id];
    return `<button class="craftbtn ${id === prof.craft ? 'on' : ''}" data-craft="${id}" title="${c.desc}">${swatch(c.color)}${c.name}</button>`;
  }).join('') + (unowned ? `<span>· ${unowned} more in the store</span>` : '');
  for (const btn of cb.querySelectorAll('button')) {
    btn.onclick = () => {
      selectCraft(prof, btn.dataset.craft);
      renderMenu();
    };
  }
}

const countLabel = (list, singular, pluralWord) =>
  (list && list.length ? ` · ${list.length > 1 ? list.length + ' ' + pluralWord : singular}` : '');

// the feature summary on an unlocked river card
function riverFeatures(R) {
  const forks = R.forks && R.forks.length ? ` · ${plural(R.forks.length, 'fork')}` : '';
  const falls = R.waterfalls && R.waterfalls.length ? ' · waterfall' : '';
  const obst = R.obstacles ? ' · ' + Object.keys(R.obstacles).map(k => (OBSTACLES.kinds[k] || {}).label || k).join(' + ') : '';
  return forks + falls + obst
    + countLabel(R.landBridges, 'land bridge', 'land bridges')
    + countLabel(R.builtBridges, 'road bridge', 'road bridges');
}

function riverCard(R, { unlocked, hidden }) {
  const d = document.createElement('div');
  d.className = unlocked ? 'riv' : 'riv locked';
  if (!unlocked) {
    d.innerHTML = hidden
      ? `${artSlot('riv-thumb', '?')}<h3>???</h3><small>find the hidden map on this tier to unlock</small>`
      : `${artSlot('riv-thumb', R.name + ' art', R.art)}
        <h3>${R.name}</h3><small>🔒 buy "${RIVER_PACKS[R.pack].label}" in the store to unlock</small>`;
    return d;
  }
  const best = S.profile.best[R.name];
  d.innerHTML = `${artSlot('riv-thumb', R.name + ' art', hidden ? undefined : R.art)}
    <h3>${R.name}</h3><small>gradient ${(R.slope * 100).toFixed(1)} % · ${R.rocks} boulders · ${R.ledges.length} ledges${hidden ? '' : riverFeatures(R)}</small>
    ${best ? `<br><span class="best">best ${best.toFixed(1)} s</span>` : ''}`;
  d.onclick = () => handlers.startRun(R);
  return d;
}

function renderRiverList() {
  const prof = S.profile, rl = $('riverlist');
  rl.innerHTML = '';
  for (const tier of TIERS) {
    const tierRivers = RIVERS.filter(r => r.tier === tier.id);
    const lockedCount = S.debugUnlockAll ? 0 : tierRivers.filter(r => !riverUnlocked(prof, r)).length;
    const h = document.createElement('div');
    h.className = 'tier';
    h.textContent = `${tier.label} · ${tier.points} pt${lockedCount ? ` · ${lockedCount} more in the store` : ''}`;
    rl.appendChild(h);
    const row = document.createElement('div');
    row.className = 'rivers';
    for (const R of tierRivers) {
      row.appendChild(riverCard(R, { unlocked: S.debugUnlockAll || riverUnlocked(prof, R), hidden: false }));
    }
    // per-tier secret river — greyed out and unclickable until its map item is found
    const hiddenR = RIVERS_HIDDEN.find(r => r.tier === tier.id);
    if (hiddenR) {
      row.appendChild(riverCard(hiddenR, { unlocked: S.debugUnlockAll || prof.unlockedHidden[tier.id], hidden: true }));
    }
    rl.appendChild(makeCarousel(row));
  }
  layoutCarousels();
}

export function renderMenu() {
  renderQuality();
  const cs = $('charsel'), tb = $('topbar'), rl = $('riverlist');
  if (!S.profile) {
    cs.style.display = 'flex';
    tb.style.display = 'none';
    rl.style.display = 'none';
    hide('craftbar');
    renderCharSelect();
    return;
  }
  cs.style.display = 'none';
  tb.style.display = 'flex';
  rl.style.display = 'flex';
  renderTopbar();
  renderCraftBar();
  renderRiverList();
}

// ---------- river carousel ----------
// wraps one tier's row of cards in [‹][viewport][›]. The viewport is an overflow:auto strip with
// its scrollbar hidden; layoutCarousels() sizes it to a whole number of cards for the current
// window width, so nothing gets cut off and the page itself never scrolls sideways.
const CAR_BTN = 34 + 8;   // .carbtn width + .carousel gap, as laid out in css

function makeCarousel(row) {
  const car = document.createElement('div');
  car.className = 'carousel';
  const vp = document.createElement('div');
  vp.className = 'vp';
  const mkBtn = (txt, label) => {
    const b = document.createElement('button');
    b.className = 'carbtn';
    b.textContent = txt;
    b.setAttribute('aria-label', label);
    return b;
  };
  const bl = mkBtn('‹', 'previous rivers'), br = mkBtn('›', 'more rivers');
  vp.appendChild(row);
  car.append(bl, vp, br);
  const gap = () => {
    const g = parseFloat(getComputedStyle(row).gap);
    return isNaN(g) ? 14 : g;
  };
  const pitch = () => {
    const c = row.firstElementChild;
    return c ? c.offsetWidth + gap() : 1;
  };
  bl.onclick = () => vp.scrollBy({ left: -pitch(), behavior: 'smooth' });
  br.onclick = () => vp.scrollBy({ left: pitch(), behavior: 'smooth' });
  const sync = () => {
    const max = vp.scrollWidth - vp.clientWidth;
    bl.disabled = vp.scrollLeft < 2;
    br.disabled = vp.scrollLeft > max - 2;
  };
  vp.addEventListener('scroll', sync);
  car._layout = () => {
    const n = row.children.length;
    if (!n || !car.clientWidth) return;
    const p = pitch(), g = gap(), total = n * p - g;
    if (total <= car.clientWidth) {
      car.classList.add('fits');
      vp.style.maxWidth = total + 'px';
    } else {
      car.classList.remove('fits');
      const fit = Math.max(1, Math.floor((car.clientWidth - 2 * CAR_BTN) / p));
      vp.style.maxWidth = (fit * p - g) + 'px';
    }
    sync();
  };
  return car;
}

export function layoutCarousels() {
  for (const c of document.querySelectorAll('#riverlist .carousel')) c._layout();
}

// ---------- level-up ----------
export function showLevelUp() {
  const prof = S.profile, el = $('lvl');
  const close = () => {
    hide('lvl');
    if (S.gameState === 'menu') renderMenu();
  };
  if (!prof || prof.pending <= 0) return close();
  if (!anyRaisable(prof)) {
    discardPending(prof);
    return close();
  }
  const c = character(prof);
  const opt = (stat, title, bar, text) => `<div class="opt"><h3>${title}</h3>${bar}<p>${text}</p>
    <button data-stat="${stat}" ${canRaise(prof, stat) ? '' : 'disabled'}>${canRaise(prof, stat) ? `Raise ${stat}` : 'At cap'}</button></div>`;
  el.style.display = 'flex';
  el.innerHTML = `<h2>Level ${prof.level}!</h2><div>${c.name} has ${plural(prof.pending, 'point')} to spend</div>
    <div class="opts">
      ${opt('skill', 'Skill', pips(prof.skill, c.caps.skill), 'Better edge control: the boat is harder to flip and easier to right.')}
      ${opt('stamina', 'Stamina', pips(prof.stamina, c.caps.stamina), 'Paddling drains stamina more slowly, so you stay strong for longer.')}
      ${opt('health', 'Health', `<small>${prof.health}/${c.caps.health}</small>${statBar(prof.health, c.caps.health, '#7fd6ff')}`,
        "Raises how much injury you can sustain before it's game over.")}
    </div>`;
  for (const b of el.querySelectorAll('button[data-stat]')) {
    b.onclick = () => {
      spendPoint(prof, b.dataset.stat);
      showLevelUp();
    };
  }
}

// ---------- store ----------
// store categories — which ones are expanded survives the re-render after every purchase
const STORE_GROUPS = [
  { id: 'supplies', label: 'Supplies', icon: '🎒', types: ['item'] },
  { id: 'training', label: 'Training', icon: '📘', types: ['training'] },
  { id: 'gear', label: 'Gear', icon: '🦺', types: ['upgrade'] },
  { id: 'boats', label: 'Boathouse', icon: '🛶', types: ['craft'] },
  { id: 'packs', label: 'River packs', icon: '🗺️', types: ['pack'] },
];
const storeOpen = new Set(['supplies']);

const OWNED_CHECK = {
  upgrade: (prof, id) => ownsUpgrade(prof, id),
  craft: (prof, id) => prof.crafts.includes(id),
  pack: (prof, id) => ownsPack(prof, id),
};
const BUY = { item: buyItem, craft: buyCraft, upgrade: buyUpgrade, pack: buyPack };

const buyButton = (type, id, ok) => `<button data-${type}="${id}" ${ok ? '' : 'disabled'}>Buy</button>`;
const storeItem = (cls, art, info, buy) =>
  `<div class="item ${cls}">${art}<div class="info">${info}</div><div class="buy">${buy}</div></div>`;

// one shelf row per listing type
const STORE_ROW = {
  item(prof, id) {
    const it = ITEMS[id], have = itemCount(prof, id);
    return storeItem('', artSlot('', it.icon), `<h3>${it.name}</h3><p>${it.desc}</p>`,
      `<span class="price">${it.price} 🪙</span><span class="have">${have} in pack${have >= it.maxStack ? ' (full)' : ''}</span>
        ${buyButton('item', id, canBuyItem(prof, id))}`);
  },
  training(prof, id) {
    const t = TRAINING.find(x => x.id === id);
    return storeItem('', artSlot('', t.icon), `<h3>${t.name}</h3><p>${t.desc}</p>`,
      `<span class="price">${t.price} 🪙</span><span class="have">+${t.xp} xp</span>
        ${buyButton('training', id, canBuyTraining(prof, id))}`);
  },
  pack(prof, id) {
    const pk = RIVER_PACKS[id], owned = ownsPack(prof, id);
    const included = RIVERS.filter(r => r.pack === id).map(r => r.name).join(' & ');
    const tierLabel = (TIERS.find(t => t.id === pk.tier) || {}).label || pk.tier;
    return storeItem(owned ? 'owned' : '', artSlot('', '🗺️'), `<h3>${tierLabel} — ${pk.label}</h3><p>Unlocks ${included}.</p>`,
      `<span class="price">${owned ? 'owned' : pk.price + ' 🪙'}</span>${owned ? '' : buyButton('pack', id, canBuyPack(prof, id))}`);
  },
  upgrade(prof, id) {
    const u = UPGRADES[id], owned = ownsUpgrade(prof, id);
    return storeItem(owned ? 'owned' : '', artSlot('', u.icon), `<h3>${u.name}</h3><p>${u.desc}</p>`,
      `<span class="price">${owned ? 'owned' : u.price + ' 🪙'}</span>${owned ? '' : buyButton('upgrade', id, canBuyUpgrade(prof, id))}`);
  },
  craft(prof, id) {
    const c = CRAFTS[id], owned = prof.crafts.includes(id);
    const note = owned ? `<span class="have">${prof.craft === id ? 'in use' : 'pick it on the main screen'}</span>` : buyButton('craft', id, canBuyCraft(prof, id));
    return storeItem(owned ? 'owned' : '', artSlot('', c.name + ' art'), `<h3>${swatch(c.color)} ${c.name}</h3><p>${c.desc}</p>`,
      `<span class="price">${owned ? 'owned' : c.price + ' 🪙'}</span>${note}`);
  },
};

function storeCategory(prof, g) {
  const entries = STORE_LISTING.filter(e => g.types.includes(e.type));
  if (!entries.length) return '';
  const owned = entries.filter(e => OWNED_CHECK[e.type] ? OWNED_CHECK[e.type](prof, e.id) : false).length;
  const consumable = g.types[0] === 'item' || g.types[0] === 'training';
  const note = consumable ? `${entries.length} kinds` : `${owned} / ${entries.length} owned`;
  return `<details class="cat" data-cat="${g.id}" ${storeOpen.has(g.id) ? 'open' : ''}>
    <summary>${g.icon} ${g.label}<small>${note}</small></summary>
    <div class="shelf">${entries.map(e => STORE_ROW[e.type](prof, e.id)).join('')}</div></details>`;
}

export function showStore() {
  const prof = S.profile;
  if (!prof) return;
  const el = $('store');
  el.style.display = 'flex';
  el.innerHTML = `<h2>Store</h2>
    ${artSlot('store-banner', 'store banner art')}
    <div><b style="color:#ffd35c">${prof.coins || 0}</b> ${prof.coins === 1 ? 'coin' : 'coins'} collected on the water</div>
    <div class="cats">${STORE_GROUPS.map(g => storeCategory(prof, g)).join('')}</div>
    <button id="storeClose">Close</button>`;
  const refresh = () => {
    showStore();
    renderMenu();
  };
  for (const d of el.querySelectorAll('details.cat')) {
    d.addEventListener('toggle', () => { if (d.open) storeOpen.add(d.dataset.cat); else storeOpen.delete(d.dataset.cat); });
  }
  for (const [type, buy] of Object.entries(BUY)) {
    for (const b of el.querySelectorAll(`button[data-${type}]`)) {
      b.onclick = () => { if (buy(prof, b.dataset[type])) refresh(); };
    }
  }
  for (const b of el.querySelectorAll('button[data-training]')) {
    b.onclick = () => {
      const res = buyTraining(prof, b.dataset.training);
      if (!res) return;
      refresh();
      if (res.ups) setTimeout(showLevelUp, 300);
    };
  }
  $('storeClose').onclick = hideStore;
}

export function hideStore() {
  hide('store');
}

// ---------- character sheet ----------
function inventoryHtml(prof) {
  const rows = Object.entries(ITEMS).filter(([id]) => itemCount(prof, id) > 0).map(([id, it]) => {
    const heal = it.heal ? ` <button data-heal="${id}" ${canHeal(prof, id) ? '' : 'disabled'}>Use (-${it.heal} injury)</button>` : '';
    return `<div class="row">${it.icon} ${it.name} × <b>${itemCount(prof, id)}</b>${heal}</div>`;
  });
  return rows.join('') || '<div class="row">empty — visit the store</div>';
}

export function showCharSheet() {
  const prof = S.profile;
  if (!prof) return;
  const el = $('charsheet'), c = character(prof), xp = xpBar(prof);
  const upgrades = Object.entries(UPGRADES).filter(([id]) => ownsUpgrade(prof, id)).map(([, u]) => `<div class="row">${u.icon} ${u.name}</div>`).join('')
    || '<div class="row">none yet — visit the store, or get lucky in a rucksack</div>';
  const boats = prof.crafts.map(id =>
    `<div class="row">${swatch(CRAFTS[id].color)} ${CRAFTS[id].name}${id === prof.craft ? ' <small style="color:#ffe08a">· in use</small>' : ''}</div>`).join('');
  const injuryNote = prof.injury >= prof.health ? ' — one more fall means a long recovery' : '';
  el.style.display = 'flex';
  el.innerHTML = `<div class="charsheet-card">
      ${artSlot('charsheet-portrait', c.name + ' art', c.art)}
      <div class="charsheet-info">
        <h2>${c.name} <small>${c.title}</small></h2>
        <p>${c.desc}</p>
        <div>level <b style="color:#ffe08a">${prof.level}</b></div>
        ${xp.html}
        <small style="color:#9bc">${prof.points} / ${xp.need} xp to next level</small>
        <div class="stat-row"><small>skill ${prof.skill}/${c.caps.skill}</small>${pips(prof.skill, c.caps.skill)}</div>
        <div class="stat-row"><small>stamina ${prof.stamina}/${c.caps.stamina}</small>${pips(prof.stamina, c.caps.stamina)}</div>
        <div class="stat-row"><small>health ${prof.health}/${c.caps.health}</small>${statBar(prof.health, c.caps.health, '#7fd6ff')}</div>
        <div class="stat-row"><small style="color:${prof.injury > 0 ? '#ff9a80' : '#9bc'}">injury ${prof.injury}/${prof.health}${injuryNote}</small>${statBar(prof.injury, prof.health, '#ff5040')}</div>
        <div style="margin-top:8px">${plural(prof.runs, 'run')} · <b style="color:#ffd35c">${prof.coins || 0}</b> ${prof.coins === 1 ? 'coin' : 'coins'}</div>
        <div class="inv"><h4>Pack</h4>${inventoryHtml(prof)}</div>
        <div class="inv"><h4>Upgrades</h4>${upgrades}</div>
        <div class="inv"><h4>Boathouse</h4>${boats}</div>
      </div>
    </div>
    <div class="charsheet-actions">
      <button id="charNewBtn">New character</button>
      <button id="charCloseBtn">Close</button>
    </div>`;
  for (const b of el.querySelectorAll('button[data-heal]')) {
    b.onclick = () => { if (healInjury(prof, b.dataset.heal)) showCharSheet(); };
  }
  $('charNewBtn').onclick = () => {
    if (!confirm('Discard this paddler and all progress?')) return;
    clearProfile();
    S.profile = null;
    S.river = null;
    hideCharSheet();
    renderMenu();
  };
  $('charCloseBtn').onclick = hideCharSheet;
}

export function hideCharSheet() {
  hide('charsheet');
}