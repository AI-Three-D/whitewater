// The main menu (character select, top bar, boat picker, river carousels) and the level-up dialog.
import { CHARACTERS, CRAFTS, ITEMS, TIERS, RIVERS, RIVERS_HIDDEN, RIVER_PACKS, STORE_LISTING, OBSTACLES, QUALITY_LEVELS } from './config.js';
import { newProfile, saveProfile, character, canRaise, anyRaisable, spendPoint, discardPending, pointsForLevel, selectCraft, riverUnlocked } from './progression.js';
import { quality, saveQuality } from './quality.js';
import { $ } from './platform.js';
import { G } from './state.js';
import { pad } from './input.js';
import { show, hide, plural, pips, statBar, xpBar, artSlot, swatch, coins } from './ui.js';

// injected by main.js so this module doesn't depend on the run controller or the other screens
let actions = { startRun: () => {}, showStore: () => {}, showCharSheet: () => {} };
export function initMenu(a) { actions = a; }

export function showMenu() {
  G.gameState = 'menu';
  document.body.classList.remove('inrun');
  pad.queue.length = 0;
  show('menu');
  hide('msg'); hide('stam'); hide('loot');
  renderMenu();
  if (G.profile && G.profile.pending > 0) showLevelUp();
}

// ---------- detail level ----------
function renderQuality() {
  const el = $('quality'), labels = { high: 'High', medium: 'Medium', low: 'Low' };
  el.innerHTML = '<span>detail</span>' + QUALITY_LEVELS.map(q =>
    `<button data-q="${q}" class="${q === quality ? 'on' : ''}">${labels[q]}</button>`).join('');
  for (const btn of el.querySelectorAll('button')) {
    btn.onclick = () => {
      if (btn.dataset.q === quality) return;
      saveQuality(btn.dataset.q);
      location.reload();   // grid/particle/prop buffers are sized once at load — simplest safe way to apply a new tier
    };
  }
}

// ---------- river carousel ----------
// wraps one tier's row of cards in [‹][viewport][›]. The viewport is an overflow:auto strip with
// its scrollbar hidden; layoutCarousels() sizes it to a whole number of cards for the current
// window width, so nothing gets cut off and the page itself never scrolls sideways.
const CAR_BTN = 34 + 8;   // .carbtn width + .carousel gap, as laid out in css

function makeCarousel(row) {
  const car = document.createElement('div'); car.className = 'carousel';
  const vp = document.createElement('div'); vp.className = 'vp';
  const mkBtn = (txt, label) => {
    const b = document.createElement('button');
    b.className = 'carbtn'; b.textContent = txt; b.setAttribute('aria-label', label);
    return b;
  };
  const bl = mkBtn('‹', 'previous rivers'), br = mkBtn('›', 'more rivers');
  vp.appendChild(row);
  car.append(bl, vp, br);
  const gap = () => { const g = parseFloat(getComputedStyle(row).gap); return isNaN(g) ? 14 : g; };
  const pitch = () => { const c = row.firstElementChild; return c ? c.offsetWidth + gap() : 1; };
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

function layoutCarousels() {
  for (const c of document.querySelectorAll('#riverlist .carousel')) c._layout();
}
addEventListener('resize', layoutCarousels);

// ---------- menu sections ----------
function renderCharSelect(cs) {
  cs.innerHTML = '<p style="width:100%;margin:0 0 6px">Choose your paddler</p>';
  for (const [id, c] of Object.entries(CHARACTERS)) {
    const d = document.createElement('div'); d.className = 'chr';
    d.innerHTML = `${artSlot('chr-portrait', c.name + ' art')}
      <h3>${c.name}</h3><small>${c.title}</small><p>${c.desc}</p>
      <small>skill ${c.start.skill}/${c.caps.skill}</small>${pips(c.start.skill, c.caps.skill)}
      <small>stamina ${c.start.stamina}/${c.caps.stamina}</small>${pips(c.start.stamina, c.caps.stamina)}
      <small>health ${c.start.health}/${c.caps.health}</small>${statBar(c.start.health, c.caps.health, '#7fd6ff')}`;
    d.onclick = () => { G.profile = newProfile(id); renderMenu(); };
    cs.appendChild(d);
  }
}

function renderTopbar(tb, profile) {
  const c = character(profile);
  tb.innerHTML = `${artSlot('topbar-portrait', 'portrait')}
    <div class="topbar-info">
      <div><b style="color:#ffe08a">${c.name}</b> ${c.title} · level <b>${profile.level}</b> · ${coins(profile.coins)}</div>
      ${xpBar(profile)}
      <small style="color:#9bc">${profile.points} / ${pointsForLevel(profile.level)} xp to next level · ${plural(profile.runs, 'run')}</small>
    </div>
    <div class="topbar-btns"><button id="openCharSheet">Character</button><button id="openStoreBtn">Store</button>
      <button id="debugUnlockBtn" style="background:${G.debugUnlockAll ? '#a33' : ''}">${G.debugUnlockAll ? 'Debug: all unlocked' : 'Debug: unlock all rivers'}</button>
      <button id="debugMoneyBtn">Debug: +1000 coins</button>
      <button id="debugInvBtn">Debug: full inventory</button></div>`;
  $('openCharSheet').onclick = actions.showCharSheet;
  $('openStoreBtn').onclick = actions.showStore;
  $('debugUnlockBtn').onclick = () => { G.debugUnlockAll = !G.debugUnlockAll; renderMenu(); };
  $('debugMoneyBtn').onclick = () => { profile.coins = (profile.coins || 0) + 1000; saveProfile(profile); renderMenu(); };
  // dev toggle: top up every consumable to its max stack in one click, so testing doesn't need
  // to grind coins first
  $('debugInvBtn').onclick = () => {
    for (const id of Object.keys(ITEMS)) profile.inventory[id] = ITEMS[id].maxStack;
    saveProfile(profile);
    renderMenu();
  };
}

// boat picker: one toggle per owned craft, the selected one highlighted. Selection persists in
// the profile and is read by startRun.
function renderCraftBar(cb, profile) {
  // only count crafts actually sold in the store — the raft is found, not bought, so it
  // shouldn't inflate "X more in the store" before it's even been found
  const unowned = STORE_LISTING.filter(e => e.type === 'craft' && !profile.crafts.includes(e.id)).length;
  cb.innerHTML = '<span>boat</span>' + profile.crafts.map(id => {
    const c = CRAFTS[id];
    return `<button class="craftbtn ${id === profile.craft ? 'on' : ''}" data-craft="${id}" title="${c.desc}">${swatch(c.color)}${c.name}</button>`;
  }).join('') + (unowned ? `<span>· ${unowned} more in the store</span>` : '');
  for (const btn of cb.querySelectorAll('button')) {
    btn.onclick = () => { selectCraft(profile, btn.dataset.craft); renderMenu(); };
  }
}

function riverExtras(R) {
  const parts = [];
  if (R.forks?.length) parts.push(plural(R.forks.length, 'fork'));
  if (R.waterfalls?.length) parts.push('waterfall');
  if (R.obstacles) parts.push(Object.keys(R.obstacles).map(k => (OBSTACLES.kinds[k] || {}).label || k).join(' + '));
  if (R.landBridges?.length) parts.push(R.landBridges.length > 1 ? `${R.landBridges.length} land bridges` : 'land bridge');
  if (R.builtBridges?.length) parts.push(R.builtBridges.length > 1 ? `${R.builtBridges.length} road bridges` : 'road bridge');
  return parts.map(p => ` · ${p}`).join('');
}

const bestLine = best => (best ? `<br><span class="best">best ${best.toFixed(1)} s</span>` : '');

function riverCard(R, profile, { unlocked, extras, lockedNote }) {
  const d = document.createElement('div');
  d.className = unlocked ? 'riv' : 'riv locked';
  if (unlocked) {
    d.innerHTML = `${artSlot('riv-thumb', R.name + ' art', R.art)}
      <h3>${R.name}</h3><small>gradient ${(R.slope * 100).toFixed(1)} % · ${R.rocks} boulders · ${R.ledges.length} ledges${extras}</small>
      ${bestLine(profile.best[R.name])}`;
    d.onclick = () => actions.startRun(R);
  } else {
    d.innerHTML = lockedNote;
  }
  return d;
}

function renderRiverList(rl, profile) {
  rl.innerHTML = '';
  for (const tier of TIERS) {
    const tierRivers = RIVERS.filter(r => r.tier === tier.id);
    const lockedCount = G.debugUnlockAll ? 0 : tierRivers.filter(r => !riverUnlocked(profile, r)).length;
    const h = document.createElement('div'); h.className = 'tier';
    h.textContent = `${tier.label} · ${tier.points} pt${lockedCount ? ` · ${lockedCount} more in the store` : ''}`;
    rl.appendChild(h);

    const row = document.createElement('div'); row.className = 'rivers';
    for (const R of tierRivers) {
      row.appendChild(riverCard(R, profile, {
        unlocked: G.debugUnlockAll || riverUnlocked(profile, R),
        extras: riverExtras(R),
        lockedNote: `${artSlot('riv-thumb', R.name + ' art', R.art)}
          <h3>${R.name}</h3><small>🔒 buy "${RIVER_PACKS[R.pack].label}" in the store to unlock</small>`,
      }));
    }
    // hidden per-tier secret river — greyed out and unclickable until its map item is found
    const hiddenR = RIVERS_HIDDEN.find(r => r.tier === tier.id);
    if (hiddenR) {
      row.appendChild(riverCard(hiddenR, profile, {
        unlocked: G.debugUnlockAll || profile.unlockedHidden[tier.id],
        extras: '',
        lockedNote: `${artSlot('riv-thumb', '?')}<h3>???</h3><small>find the hidden map on this tier to unlock</small>`,
      }));
    }
    rl.appendChild(makeCarousel(row));
  }
  layoutCarousels();
}

export function renderMenu() {
  renderQuality();
  const cs = $('charsel'), tb = $('topbar'), rl = $('riverlist'), cb = $('craftbar'), profile = G.profile;
  if (!profile) {
    show('charsel'); hide('topbar'); hide('riverlist'); hide('craftbar');
    renderCharSelect(cs);
    return;
  }
  hide('charsel'); show('topbar'); show('riverlist'); show('craftbar');
  renderTopbar(tb, profile);
  renderCraftBar(cb, profile);
  renderRiverList(rl, profile);
}

// ---------- level-up dialog ----------
export function showLevelUp() {
  const el = $('lvl'), profile = G.profile;
  const close = () => { el.style.display = 'none'; if (G.gameState === 'menu') renderMenu(); };
  if (!profile || profile.pending <= 0) return close();
  if (!anyRaisable(profile)) { discardPending(profile); return close(); }

  const c = character(profile);
  const opt = (id, title, bar, desc, stat) => `<div class="opt"><h3>${title}</h3>${bar}<p>${desc}</p>
    <button id="${id}" ${canRaise(profile, stat) ? '' : 'disabled'}>${canRaise(profile, stat) ? `Raise ${stat}` : 'At cap'}</button></div>`;
  el.style.display = 'flex';
  el.innerHTML = `<h2>Level ${profile.level}!</h2><div>${c.name} has ${plural(profile.pending, 'point')} to spend</div>
    <div class="opts">
      ${opt('lvSkill', 'Skill', pips(profile.skill, c.caps.skill), 'Better edge control: the boat is harder to flip and easier to right.', 'skill')}
      ${opt('lvStam', 'Stamina', pips(profile.stamina, c.caps.stamina), 'Paddling drains stamina more slowly, so you stay strong for longer.', 'stamina')}
      ${opt('lvHealth', 'Health', `<small>${profile.health}/${c.caps.health}</small>${statBar(profile.health, c.caps.health, '#7fd6ff')}`,
        "Raises how much injury you can sustain before it's game over.", 'health')}
    </div>`;
  $('lvSkill').onclick = () => { spendPoint(profile, 'skill'); showLevelUp(); };
  $('lvStam').onclick = () => { spendPoint(profile, 'stamina'); showLevelUp(); };
  $('lvHealth').onclick = () => { spendPoint(profile, 'health'); showLevelUp(); };
}