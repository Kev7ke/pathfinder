// Pathfinder UI. All computation lives in planner.js; this file only renders.
import {
  parseMissions, extensionDepartments, ladder, annotate, milestones,
  nextPurchases, ceiling, unpricedMissions, canSpawn, TRUSTED_SOURCES, ownedCount,
} from './planner.js';
import { STRINGS } from './i18n.js';

const LS = 'pathfinder-v1';
const $ = (id) => document.getElementById(id);

const ui = {
  lang: 'en',
  path: 'F',
  tab: 'plan',
  useSmall: true,
  own: { fire: 0, ems: 0, police: 0, ext: {} },
  priceEdits: {},
  missionTerm: '',
  priceTerm: '',
  priceFilter: 'unver',
};
let MISSIONS = [];
let BASE_PRICES = null;
let EXT_DEPT = {};
let EXT_NAMES = [];

const t = () => STRINGS[ui.lang];
const fmt = (n) => Number(n).toLocaleString(ui.lang === 'de' ? 'de-DE' : 'en-US');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function prices() {
  const p = structuredClone(BASE_PRICES);
  for (const [key, edit] of Object.entries(ui.priceEdits)) {
    for (const group of ['stations', 'buildings', 'extensions']) {
      if (p[group] && p[group][key]) {
        if (edit.price != null) p[group][key].price = edit.price;
        if (edit.source) p[group][key].source = edit.source;
      }
    }
  }
  return p;
}

function save() {
  try {
    localStorage.setItem(LS, JSON.stringify({
      lang: ui.lang, path: ui.path, useSmall: ui.useSmall,
      own: ui.own, priceEdits: ui.priceEdits,
    }));
  } catch (e) { /* private window: the app still works, nothing is remembered */ }
}
function load() {
  try {
    const raw = localStorage.getItem(LS);
    if (raw) Object.assign(ui, JSON.parse(raw));
  } catch (e) { /* ignore */ }
}

// ---------- computation for the current view ----------
function view() {
  const p = prices();
  const opts = { useSmall: ui.useSmall, extensionDepartments: EXT_DEPT };
  const rungs = annotate(ladder(MISSIONS, ui.path, ui.own, p, opts), ui.path);
  const spine = milestones(rungs);
  const target = spine[0] || rungs[0] || null;
  const queue = target ? nextPurchases(target, ui.own, MISSIONS, p, opts) : [];
  return { prices: p, rungs, spine, target, queue, top: ceiling(MISSIONS, ui.path, ui.own) };
}

function sourcePill(source) {
  if (TRUSTED_SOURCES.has(source)) return `<span class="pill ok">${esc(source)}</span>`;
  const cls = source === 'name_mapped' ? 'chk'
    : source === 'wiki_table' || source === 'community' || source === 'official_help' ? 'weak' : 'bad';
  return `<span class="pill ${cls}">${esc(source)}</span>`;
}

function needsText(rung) {
  const parts = [];
  const names = { fire: t().fire, ems: t().ems, police: t().police };
  for (const d of ['fire', 'ems', 'police']) {
    const n = rung.shortfall.stations[d];
    if (n) parts.push(`${n}× ${names[d]}`);
  }
  for (const [k, n] of Object.entries(rung.shortfall.ext)) parts.push(`${n}× ${k}`);
  return parts.join(' · ') || '—';
}

// ---------- render ----------
function renderPlan(v) {
  $('ceil-v').innerHTML = v.top
    ? `${fmt(v.top.credits)} <small>${esc(v.top.name)}</small>`
    : `<span style="color:var(--ink-2)">${t().ceilingNone}</span>`;

  const first = v.queue[0];
  if (first) {
    const unl = first.unlocks === 1 ? t().missionWord : t().missionsWord;
    $('buy-v').innerHTML = `${esc(first.label)} <small>${first.price == null ? t().unknownPrice : fmt(first.price)}`
      + `${first.unlocks ? ` · ${t().unlocks} ${first.unlocks} ${unl}` : ''}</small>`;
    $('buy-d').textContent = `${t().buyNextHint} ${t().towardMilestone}: ${v.target.mission.name} (${fmt(v.target.mission.credits)})`;
  } else {
    $('buy-v').textContent = '—';
    $('buy-d').textContent = t().buyNextHint;
  }

  $('contract-t').textContent = t().pathContract[ui.path];
  const gap = unpricedMissions(MISSIONS, ui.path).length;
  $('emsgap').hidden = ui.path !== 'E' || gap === 0;
  $('emsgap-t').textContent = t().emsGap;

  $('spine').innerHTML = v.spine.map((r, i) => {
    const warn = r.unverified.length
      ? `<div class="warn">${t().provenanceWarn} ${esc([...new Set(r.unverified.map((u) => u.name))].join(', '))}</div>` : '';
    const detour = r.isDetour ? ` <span class="pill weak" title="${esc(t().detourHint)}">${t().detour}</span>` : '';
    return `<div class="step">
      <div class="n">${i + 1}</div>
      <div><div class="t">${esc(r.mission.name)}${detour}</div>
        <div class="d">${esc(needsText(r))}</div>${warn}</div>
      <div class="c"><div class="cr">${fmt(r.mission.credits)}</div><div class="co">${r.costIsLowerBound ? '\u2265 ' : ''}${fmt(r.cost)}</div></div>
    </div>`;
  }).join('') || `<p class="hint">—</p>`;
}

function renderLadder(v) {
  $('ladder-body').innerHTML = v.rungs.map((r) => {
    const badges = (r.isTrap ? `<span class="pill chk" title="${esc(t().trapHint)}">${t().trap}</span> ` : '')
      + (r.isDetour ? `<span class="pill weak" title="${esc(t().detourHint)}">${t().detour}</span>` : '');
    const warn = r.unverified.length
      ? `<div class="warn">${t().provenanceWarn} ${esc([...new Set(r.unverified.map((u) => u.name))].join(', '))}</div>` : '';
    const unknown = r.unknown.length
      ? `<div class="warn">${t().unknownPrice}: ${esc(r.unknown.join(', '))}</div>` : '';
    const gain = Number.isFinite(r.gainPer100k) ? fmt(Math.round(r.gainPer100k)) : '—';
    return `<tr class="${r.isTrap ? 'trap' : r.isDetour ? 'detour' : ''}">
      <td class="mono">${r.costIsLowerBound ? '\u2265 ' : ''}${fmt(r.cost)}</td>
      <td class="mono">${fmt(r.mission.credits)}</td>
      <td class="mono">${gain}</td>
      <td class="mono">${Math.round(r.ownShare * 100)}%</td>
      <td>${esc(r.mission.name)} ${badges}${warn}${unknown}</td>
      <td>${esc(needsText(r))}</td>
    </tr>`;
  }).join('');
}

function renderMissions() {
  const term = ui.missionTerm;
  const rows = MISSIONS.filter((m) => m.path === ui.path
    && (!term || m.name.toLowerCase().includes(term) || (m.poi || '').toLowerCase().includes(term)));
  const shown = rows.slice(0, 150);
  $('m-count').textContent = `${t().showing} ${shown.length} ${t().of} ${rows.length}`;
  $('missions-body').innerHTML = shown.map((m) => {
    const ext = Object.entries(m.extras).map(([k, n]) => `${n}× ${k}`).join(' · ');
    const cr = m.credits == null
      ? `<span class="pill bad" title="${esc(t().noCredits)}">—</span>` : fmt(m.credits);
    const own = canSpawn(m, ui.own) ? ' <span class="pill ok">✓</span>' : '';
    return `<tr>
      <td>${esc(m.name)}${own}</td><td class="mono">${cr}</td>
      <td class="mono">${m.fire || ''}</td><td class="mono">${m.ems || ''}</td><td class="mono">${m.police || ''}</td>
      <td>${esc(ext) || '—'}</td><td>${esc(m.poi) || '—'}</td>
    </tr>`;
  }).join('');
}

function priceRows() {
  const p = prices();
  const usage = new Map();
  for (const m of MISSIONS) for (const k of Object.keys(m.extras)) usage.set(k, (usage.get(k) || 0) + 1);
  const out = [];
  for (const group of ['stations', 'buildings', 'extensions']) {
    for (const [key, entry] of Object.entries(p[group] || {})) {
      if (key.startsWith('_')) continue;
      out.push({ group, key, price: entry.price, source: entry.source, used: usage.get(key) || 0 });
    }
  }
  return out;
}

function renderPrices() {
  const rows = priceRows().filter((r) => {
    if (ui.priceFilter === 'unver' && TRUSTED_SOURCES.has(r.source)) return false;
    if (ui.priceTerm && !r.key.toLowerCase().includes(ui.priceTerm)) return false;
    return true;
  }).sort((a, b) => b.used - a.used || a.key.localeCompare(b.key));

  const SOURCES = ['build_menu', 'player_report', 'name_mapped', 'official_help', 'wiki_table', 'community', 'leitstellenspiel', 'estimate'];
  $('prices-body').innerHTML = rows.map((r) => `<tr data-key="${esc(r.key)}">
    <td>${esc(r.key)}<div class="hint">${r.group}</div></td>
    <td><input class="num" data-f="price" style="width:104px" inputmode="numeric" value="${r.price}"></td>
    <td><select data-f="source">${SOURCES.map((s) =>
      `<option value="${s}"${s === r.source ? ' selected' : ''}>${s}</option>`).join('')}</select>
      <div style="margin-top:4px">${sourcePill(r.source)}</div></td>
    <td class="mono">${r.used || '—'}</td>
  </tr>`).join('');
}

function renderExtRows() {
  const s = t();
  const entries = Object.entries(ui.own.ext)
    .map(([k, e]) => [k, ownedCount(e).count])
    .filter(([, n]) => n > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));

  $('ext-rows').innerHTML = entries.length ? entries.map(([k, n]) => `
    <div class="extrow" data-k="${esc(k)}">
      <div class="nm">${esc(k)}</div>
      <label>${s.extTotal}<input class="num" type="number" min="0" data-f="count"
        value="${n}" aria-label="${esc(k)} ${s.extTotal}"></label>
      <button class="rm" data-f="x" aria-label="remove ${esc(k)}">×</button>
    </div>`).join('') : `<p class="hint">${s.noExtensions}</p>`;
}

function applyLanguage() {
  const s = t();
  document.documentElement.lang = ui.lang;
  $('h-tag').textContent = s.tagline;
  [...$('pathbar').children].forEach((b) => { b.textContent = s.paths[b.dataset.p]; });
  [...$('tabs').children].forEach((b) => { b.textContent = s.tabs[b.dataset.t]; });
  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  set('l-yours', s.yours); set('l-fire', s.fire); set('l-ems', s.ems); set('l-police', s.police);
  set('l-ext', s.extensions); set('l-exthint', s.extHeadHint); set('l-size', s.stationSize); set('l-sizenote', s.smallNote);
  set('l-ceiling', s.ceiling); set('l-ceilhint', s.ceilingHint); set('l-buy', s.buyNext);
  set('l-spine', s.spine); set('l-spinehint', s.spineHint);
  set('l-ladder', s.ladderTitle); set('l-ladderhint', s.ladderHint);
  set('l-levers', s.biggerLevers); set('lever1', s.lever1); set('lever2', s.lever2);
  set('l-notmod', s.notModelled); set('notmod-b', s.notModelledBody);
  set('l-priceshint', s.pricesHint);
  set('th-cost', s.cost); set('th-cr', s.credits); set('th-gain', s.gain); set('th-own', s.ownShare);
  set('th-m', s.mission); set('th-n', s.needs); set('th-m2', s.mission); set('th-cr2', s.credits);
  set('th-n2', s.needs); set('th-poi', 'POI'); set('th-item', s.mission); set('th-price', s.price);
  set('th-src', s.source); set('th-use', s.showing);
  $('ext-add').placeholder = s.addExtension;
  $('m-search').placeholder = s.search;
  $('pr-search').placeholder = s.search;
  $('pr-export').textContent = s.exportPrices;
  $('pr-reset').textContent = s.reset;
  const [u, a] = $('pr-filter').children;
  u.textContent = s.filterUnverified; a.textContent = s.filterAll;
  const [sm, fu] = $('sizeseg').children;
  sm.textContent = s.small; fu.textContent = s.full;
}

function render() {
  applyLanguage();
  const v = view();
  renderPlan(v);
  renderLadder(v);
  renderMissions();
  renderPrices();
  renderExtRows();
}

// ---------- events ----------
function segment(id, cb) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    [...$(id).children].forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    cb(b.dataset.v);
  });
}

function wire() {
  segment('lang', (v) => { ui.lang = v; save(); render(); });
  segment('sizeseg', (v) => { ui.useSmall = v === 'small'; save(); render(); });
  segment('pr-filter', (v) => { ui.priceFilter = v; renderPrices(); });

  $('pathbar').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    [...$('pathbar').children].forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    ui.path = b.dataset.p; save(); render();
  });

  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    ui.tab = b.dataset.t;
    [...$('tabs').children].forEach((x) => x.setAttribute('aria-selected', x === b ? 'true' : 'false'));
    for (const name of ['plan', 'ladder', 'missions', 'prices']) $('p-' + name).hidden = name !== ui.tab;
  });

  for (const d of ['fire', 'ems', 'police']) {
    $('own-' + d).addEventListener('input', (e) => {
      ui.own[d] = Math.max(0, parseInt(e.target.value, 10) || 0);
      save(); const v = view(); renderPlan(v); renderLadder(v); renderMissions();
    });
  }

  $('ext-add').addEventListener('change', (e) => {
    const name = e.target.value.trim();
    if (EXT_NAMES.includes(name)) {
      ui.own.ext[name] = { count: ownedCount(ui.own.ext[name]).count + 1 };
      e.target.value = ''; save(); render();
    }
  });

  $('ext-rows').addEventListener('click', (e) => {
    if (e.target.dataset.f !== 'x') return;
    delete ui.own.ext[e.target.closest('.extrow').dataset.k];
    save(); render();
  });
  $('ext-rows').addEventListener('input', (e) => {
    if (e.target.dataset.f !== 'count') return;
    const key = e.target.closest('.extrow').dataset.k;
    const n = Math.max(0, parseInt(e.target.value, 10) || 0);
    if (n === 0) delete ui.own.ext[key]; else ui.own.ext[key] = { count: n };
    save();
    const v = view();
    renderPlan(v); renderLadder(v); renderMissions();
    if (n === 0) renderExtRows();
  });

  $('m-search').addEventListener('input', (e) => { ui.missionTerm = e.target.value.toLowerCase().trim(); renderMissions(); });
  $('pr-search').addEventListener('input', (e) => { ui.priceTerm = e.target.value.toLowerCase().trim(); renderPrices(); });

  $('prices-body').addEventListener('input', onPriceEdit);
  $('prices-body').addEventListener('change', onPriceEdit);
  function onPriceEdit(e) {
    const f = e.target.dataset.f; if (!f) return;
    const key = e.target.closest('tr').dataset.key;
    const cur = ui.priceEdits[key] || {};
    if (f === 'price') cur.price = Math.max(0, parseInt(String(e.target.value).replace(/[^0-9]/g, ''), 10) || 0);
    else cur.source = e.target.value;
    ui.priceEdits[key] = cur;
    save();
    const v = view(); renderPlan(v); renderLadder(v);
    if (f === 'source') renderPrices();
  }

  $('pr-export').addEventListener('click', () => {
    const out = JSON.stringify(prices(), null, 2);
    navigator.clipboard.writeText(out)
      .then(() => { $('pr-msg').textContent = t().copied; })
      .catch(() => { $('pr-msg').textContent = out.slice(0, 0) || '—'; });
    setTimeout(() => { $('pr-msg').textContent = ''; }, 2500);
  });
  $('pr-reset').addEventListener('click', () => { ui.priceEdits = {}; save(); render(); });
}

// ---------- boot ----------
async function boot() {
  try {
    // tools/build_offline.py inlines the data so the page also works from file://
    const inline = globalThis.__PATHFINDER_DATA__;
    const [m, p] = inline ? [inline.missions, inline.prices] : await Promise.all([
      fetch('../data/missions.json').then((r) => r.json()),
      fetch('../data/prices.json').then((r) => r.json()),
    ]);
    MISSIONS = parseMissions(m);
    BASE_PRICES = p;
    EXT_DEPT = extensionDepartments(MISSIONS);
    EXT_NAMES = m.ext.slice().sort();
  } catch (err) {
    $('boot').hidden = false;
    $('boot-msg').textContent = STRINGS[ui.lang].loadError;
    return;
  }
  load();
  $('ext-list').innerHTML = EXT_NAMES.map((n) => `<option value="${esc(n)}">`).join('');
  for (const d of ['fire', 'ems', 'police']) $('own-' + d).value = ui.own[d] || 0;
  [...$('pathbar').children].forEach((b) => b.setAttribute('aria-pressed', b.dataset.p === ui.path ? 'true' : 'false'));
  [...$('lang').children].forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === ui.lang ? 'true' : 'false'));
  [...$('sizeseg').children].forEach((b) => b.setAttribute('aria-pressed',
    (b.dataset.v === 'small') === ui.useSmall ? 'true' : 'false'));
  wire();
  render();
}
boot();
