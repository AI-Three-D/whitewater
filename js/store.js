// The store and the character sheet.
import { CRAFTS, ITEMS, UPGRADES, TRAINING, RIVER_PACKS, STORE_LISTING, TIERS, RIVERS } from './config.js';
import { clearProfile, character, pointsForLevel, itemCount, canBuyItem, canBuyCraft, buyItem, buyCraft, ownsUpgrade, canBuyUpgrade, buyUpgrade, canHeal, healInjury, ownsPack, canBuyPack, buyPack, canBuyTraining, buyTraining } from './progression.js';
import { $ } from './platform.js';
import { G } from './state.js';
import { show, hide, plural, pips, statBar, xpBar, artSlot, swatch, coins } from './ui.js';
import { renderMenu, showLevelUp } from './menu.js';

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

const buyBtn = (attr, id, ok) => `<button data-${attr}="${id}" ${ok ? '' : 'disabled'}>Buy</button>`;
const shelfItem = ({ art, title, desc, price, have = '', button = '', owned = false }) =>
  `<div class="item${owned ? ' owned' : ''}">${art}
    <div class="info"><h3>${title}</h3><p>${desc}</p></div>
    <div class="buy"><span class="price">${price}</span>${have}${button}</div></div>`;

const ROW_BUILDERS = {
  item(profile, id) {
    const it = ITEMS[id], have = itemCount(profile, id);
    return shelfItem({
      art: artSlot('', it.icon), title: it.name, desc: it.desc, price: `${it.price} 🪙`,
      have: `<span class="have">${have} in pack${have >= it.maxStack ? ' (full)' : ''}</span>`,
      button: buyBtn('item', id, canBuyItem(profile, id)),
    });
  },
  training(profile, id) {
    const t = TRAINING.find(x => x.id === id);
    return shelfItem({
      art: artSlot('', t.icon), title: t.name, desc: t.desc, price: `${t.price} 🪙`,
      have: `<span class="have">+${t.xp} xp</span>`,
      button: buyBtn('training', id, canBuyTraining(profile, id)),
    });
  },
  pack(profile, id) {
    const pk = RIVER_PACKS[id], owned = ownsPack(profile, id);
    const tierLabel = (TIERS.find(t => t.id === pk.tier) || {}).label || pk.tier;
    return shelfItem({
      art: artSlot('', '🗺️'), owned, title: `${tierLabel} — ${pk.label}`,
      desc: `Unlocks ${RIVERS.filter(r => r.pack === id).map(r => r.name).join(' & ')}.`,
      price: owned ? 'owned' : `${pk.price} 🪙`,
      button: owned ? '' : buyBtn('pack', id, canBuyPack(profile, id)),
    });
  },
  upgrade(profile, id) {
    const u = UPGRADES[id], owned = ownsUpgrade(profile, id);
    return shelfItem({
      art: artSlot('', u.icon), owned, title: u.name, desc: u.desc,
      price: owned ? 'owned' : `${u.price} 🪙`,
      button: owned ? '' : buyBtn('upgrade', id, canBuyUpgrade(profile, id)),
    });
  },
  craft(profile, id) {
    const c = CRAFTS[id], owned = profile.crafts.includes(id);
    return shelfItem({
      art: artSlot('', c.name + ' art'), owned, title: `${swatch(c.color)} ${c.name}`, desc: c.desc,
      price: owned ? 'owned' : `${c.price} 🪙`,
      have: owned ? `<span class="have">${profile.craft === id ? 'in use' : 'pick it on the main screen'}</span>` : '',
      button: owned ? '' : buyBtn('craft', id, canBuyCraft(profile, id)),
    });
  },
};

const isOwned = (profile, e) =>
  e.type === 'upgrade' ? ownsUpgrade(profile, e.id)
  : e.type === 'craft' ? profile.crafts.includes(e.id)
  : e.type === 'pack' ? ownsPack(profile, e.id)
  : false;

function storeCategory(profile, g) {
  const entries = STORE_LISTING.filter(e => g.types.includes(e.type));
  if (!entries.length) return '';
  const consumable = g.types[0] === 'item' || g.types[0] === 'training';
  const note = consumable ? `${entries.length} kinds` : `${entries.filter(e => isOwned(profile, e)).length} / ${entries.length} owned`;
  return `<details class="cat" data-cat="${g.id}" ${storeOpen.has(g.id) ? 'open' : ''}>
    <summary>${g.icon} ${g.label}<small>${note}</small></summary>
    <div class="shelf">${entries.map(e => ROW_BUILDERS[e.type](profile, e.id)).join('')}</div></details>`;
}

export function showStore() {
  const profile = G.profile;
  if (!profile) return;
  const el = $('store');
  el.style.display = 'flex';
  el.innerHTML = `<h2>Store</h2>
    ${artSlot('store-banner', 'store banner art')}
    <div>${coins(profile.coins)} collected on the water</div>
    <div class="cats">${STORE_GROUPS.map(g => storeCategory(profile, g)).join('')}</div>
    <button id="storeClose">Close</button>`;

  for (const d of el.querySelectorAll('details.cat')) {
    d.addEventListener('toggle', () => { if (d.open) storeOpen.add(d.dataset.cat); else storeOpen.delete(d.dataset.cat); });
  }
  const refresh = () => { showStore(); renderMenu(); };
  const buyers = { item: buyItem, craft: buyCraft, upgrade: buyUpgrade, pack: buyPack };
  for (const [type, buy] of Object.entries(buyers)) {
    for (const b of el.querySelectorAll(`button[data-${type}]`)) {
      b.onclick = () => { if (buy(profile, b.dataset[type])) refresh(); };
    }
  }
  for (const b of el.querySelectorAll('button[data-training]')) {
    b.onclick = () => {
      const res = buyTraining(profile, b.dataset.training);
      if (!res) return;
      refresh();
      if (res.ups) setTimeout(showLevelUp, 300);
    };
  }
  $('storeClose').onclick = hideStore;
}

export function hideStore() { hide('store'); }

// ---------- character sheet ----------
function packSection(profile) {
  const rows = Object.entries(ITEMS).filter(([id]) => itemCount(profile, id) > 0).map(([id, it]) =>
    `<div class="row">${it.icon} ${it.name} × <b>${itemCount(profile, id)}</b>${it.heal
      ? ` <button data-heal="${id}" ${canHeal(profile, id) ? '' : 'disabled'}>Use (-${it.heal} injury)</button>` : ''}</div>`);
  return rows.join('') || '<div class="row">empty — visit the store</div>';
}

function upgradesSection(profile) {
  const rows = Object.entries(UPGRADES).filter(([id]) => ownsUpgrade(profile, id)).map(([, u]) => `<div class="row">${u.icon} ${u.name}</div>`);
  return rows.join('') || '<div class="row">none yet — visit the store, or get lucky in a rucksack</div>';
}

const boathouseSection = profile => profile.crafts.map(id =>
  `<div class="row">${swatch(CRAFTS[id].color)} ${CRAFTS[id].name}${id === profile.craft ? ' <small style="color:#ffe08a">· in use</small>' : ''}</div>`).join('');

export function showCharSheet() {
  const profile = G.profile;
  if (!profile) return;
  const el = $('charsheet'), c = character(profile);
  const injuryNote = profile.injury >= profile.health ? ' — one more fall means a long recovery' : '';
  el.style.display = 'flex';
  el.innerHTML = `<div class="charsheet-card">
      ${artSlot('charsheet-portrait', c.name + ' art')}
      <div class="charsheet-info">
        <h2>${c.name} <small>${c.title}</small></h2>
        <p>${c.desc}</p>
        <div>level <b style="color:#ffe08a">${profile.level}</b></div>
        ${xpBar(profile)}
        <small style="color:#9bc">${profile.points} / ${pointsForLevel(profile.level)} xp to next level</small>
        <div class="stat-row"><small>skill ${profile.skill}/${c.caps.skill}</small>${pips(profile.skill, c.caps.skill)}</div>
        <div class="stat-row"><small>stamina ${profile.stamina}/${c.caps.stamina}</small>${pips(profile.stamina, c.caps.stamina)}</div>
        <div class="stat-row"><small>health ${profile.health}/${c.caps.health}</small>${statBar(profile.health, c.caps.health, '#7fd6ff')}</div>
        <div class="stat-row"><small style="color:${profile.injury > 0 ? '#ff9a80' : '#9bc'}">injury ${profile.injury}/${profile.health}${injuryNote}</small>${statBar(profile.injury, profile.health, '#ff5040')}</div>
        <div style="margin-top:8px">${plural(profile.runs, 'run')} · ${coins(profile.coins)}</div>
        <div class="inv"><h4>Pack</h4>${packSection(profile)}</div>
        <div class="inv"><h4>Upgrades</h4>${upgradesSection(profile)}</div>
        <div class="inv"><h4>Boathouse</h4>${boathouseSection(profile)}</div>
      </div>
    </div>
    <div class="charsheet-actions">
      <button id="charNewBtn">New character</button>
      <button id="charCloseBtn">Close</button>
    </div>`;
  for (const b of el.querySelectorAll('button[data-heal]')) {
    b.onclick = () => { if (healInjury(profile, b.dataset.heal)) showCharSheet(); };
  }
  $('charNewBtn').onclick = () => {
    if (!confirm('Discard this paddler and all progress?')) return;
    clearProfile();
    G.profile = null;
    G.river = null;
    hideCharSheet();
    renderMenu();
  };
  $('charCloseBtn').onclick = hideCharSheet;
}

export function hideCharSheet() { hide('charsheet'); }