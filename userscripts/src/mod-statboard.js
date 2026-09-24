/* --------------------------------------------------------------------------
 * StatBoard — four pages that say what this game actually is.
 *
 * Everything YMCA measures was readable before this and none of it was worth
 * looking at: a report is a wall of JSON and a panel is a table. This is the
 * same readings laid out the way anybody reads numbers — a few big ones on the
 * left, the list they came from on the right, and four pages you step between.
 *
 * WHAT IS MEASURED AND WHAT IS NOT IS ON THE TILE, NOT IN THE CODE. Three of
 * the figures asked for are not stated by any page of the game this repo has
 * read — how long a vehicle has driven, what a station's level is, how many of
 * its crew hold a training — and a board that quietly showed a nought for them
 * would be the same fault TrackOps' payouts were withdrawn for. So each tile
 * says which of the three it is: read from the game, read from the game's own
 * ledger, or not stated anywhere yet, with the button that would find out.
 *
 * NOTHING HERE IS FETCHED UNTIL IT IS ASKED FOR. `/api/buildings` and
 * `/api/vehicles` are one request each and already cached for the page load, so
 * they are free. A station's own page, a vehicle's own page and the ledger are
 * one request per station, per vehicle and per page of history, which on a real
 * account is 40, 80 and 256 — that is the player's to spend, so each is a
 * button that says how many requests it is about to make.
 *
 * THE COLOURS ARE THE ONE PLACE A MODULE ENCODES WITH THEM, as in HeatSeeker,
 * and they are validated rather than chosen: the categorical slots below come
 * off the documented palette's dark column and were run through its own
 * checker against this board's card colour — six slots, every check passing,
 * worst adjacent CVD ΔE 8.4 and normal-vision ΔE 19.3. THE CARD IS #333 AND
 * THAT IS WHY: on the game's own #505050 every one of them came back under
 * 3:1, which is the fault that makes a chart unreadable rather than ugly. A
 * darker step of the game's own neutral fixes it and is not a colour of YMCA's
 * own. Identity is never colour alone — every slice and bar carries its name
 * and its figure, and the table beside it says the same thing in words.
 * -------------------------------------------------------------------------- */

/** The documented categorical order, dark column. Fixed, never cycled. */
const SB_SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];
/** Anything past the sixth slot folds into one grey rather than inventing a hue. */
const SB_OTHER = '#8a8a8a';
const SB_INCOME = '#199e70';
const SB_SPEND = '#d95926';

const SB_BOARDS = [
    { id: 'buildings', label: 'Buildings' },
    { id: 'vehicles', label: 'Vehicles' },
    { id: 'missions', label: 'Missions' },
    { id: 'credits', label: 'Credits' },
];

/** One glyph per page, drawn in the current colour so the nav can fill it. */
const SB_ICONS = {
    buildings: '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-5h6v5"/>',
    vehicles: '<path d="M3 16v-4l2-5h9l3 5h4v4M3 16h18M3 16v2h2m14-2v2h2"/>'
        + '<circle cx="7.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    missions: '<path d="M12 3c2 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 2 2 2 2 0 0-2-1-3 1-5z"/>',
    credits: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 4h-3'
        + 'a1.8 1.8 0 0 0 0 4h4"/>',
    stat: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
};

const sbIcon = (name, size = 18) => `<svg viewBox="-1.5 -1.5 27 27" width="${size}"
  height="${size}" fill="none" stroke="currentColor" stroke-width="1.8"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
    SB_ICONS[name] || SB_ICONS.stat}</svg>`;

/* ------------------------------------------------------------ small pieces */

const sbNum = (n, digits = 0) => (Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '—');

/** Count a figure up when it appears. Skipped where motion is not wanted. */
function sbCountUp(el, to, digits) {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (still || !Number.isFinite(to) || to === 0) { el.textContent = sbNum(to, digits); return; }
    const started = performance.now();
    const step = (now) => {
        const t = Math.min(1, (now - started) / 650);
        const eased = 1 - ((1 - t) ** 3);
        el.textContent = sbNum(to * eased, digits);
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = sbNum(to, digits);
    };
    requestAnimationFrame(step);
}

/**
 * A donut, for part-to-whole and nothing else.
 *
 * Five slices and an Other, because a ring of thirty is a colour wheel rather
 * than a reading. Every slice is named and figured beside it, so the colour is
 * the second encoding rather than the only one, and a 2px gap in the card's own
 * colour separates neighbours the way the mark spec asks.
 */
function sbDonut(parts, opts = {}) {
    const top = [...parts].filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
    const shown = top.slice(0, 5);
    const rest = top.slice(5);
    if (rest.length) {
        shown.push({ label: `Other (${rest.length})`, value: rest.reduce((n, p) => n + p.value, 0) });
    }
    const total = shown.reduce((n, p) => n + p.value, 0);
    if (!total) return '<p class="sb-dim">Nothing to show yet.</p>';

    const r = 52;
    const c = 2 * Math.PI * r;
    let at = 0;
    const rings = shown.map((p, i) => {
        const share = p.value / total;
        const len = Math.max(0, share * c - 2);
        const seg = `<circle class="sb-seg" cx="64" cy="64" r="${r}" fill="none"
      stroke="${i >= 5 ? SB_OTHER : SB_SERIES[i]}" stroke-width="18"
      stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}"
      stroke-dashoffset="${(-at * c).toFixed(2)}"
      style="--sb-len:${len.toFixed(2)};--sb-gap:${(c - len).toFixed(2)}"
      data-tip="${p.label}: ${sbNum(p.value)}"></circle>`;
        at += share;
        return seg;
    }).join('');

    const keys = shown.map((p, i) => `<li><i style="background:${
        i >= 5 ? SB_OTHER : SB_SERIES[i]}"></i><span>${p.label}</span>
    <b>${sbNum(p.value)}</b></li>`).join('');

    return `<div class="sb-donut">
    <svg viewBox="0 0 128 128" width="128" height="128" role="img"
      aria-label="${opts.alt || 'Share of the total'}">
      <g transform="rotate(-90 64 64)">${rings}</g>
      <text x="64" y="60" class="sb-donut-n">${sbNum(opts.middle ?? total)}</text>
      <text x="64" y="78" class="sb-donut-l">${opts.middleLabel || 'total'}</text>
    </svg>
    <ul class="sb-keys">${keys}</ul>
  </div>`;
}

/** Bars where a ring would be a colour wheel: many categories, one measure. */
function sbBars(parts, opts = {}) {
    const rows = [...parts].filter((p) => p.value > 0)
        .sort((a, b) => b.value - a.value).slice(0, opts.limit || 8);
    if (!rows.length) return '<p class="sb-dim">Nothing to show yet.</p>';
    const most = rows[0].value;
    return `<ul class="sb-bars">${rows.map((p, i) => `<li>
    <span class="sb-bar-l">${p.label}</span>
    <span class="sb-bar-t"><i style="width:${Math.max(2, (p.value / most) * 100)}%;
      background:${SB_SERIES[i % SB_SERIES.length]}"></i></span>
    <b>${opts.fmt ? opts.fmt(p.value) : sbNum(p.value)}</b></li>`).join('')}</ul>`;
}

/**
 * A figure, what it is, and where it came from.
 *
 * `source` is the whole point of the tile: **measured** is the game stating it,
 * **ledger** is the game's own book of what it paid, and **unread** is a figure
 * no page this repo has seen states at all — which is said in words rather than
 * shown as a nought.
 */
function sbTile(t) {
    const badge = {
        measured: 'read from the game',
        ledger: 'from the game’s own ledger',
        unread: 'no page states this yet',
    }[t.source] || '';
    return `<section class="sb-tile${t.source === 'unread' ? ' sb-tile-unread' : ''}">
    <header><h3>${t.label}</h3><span class="sb-src sb-src-${t.source}">${badge}</span></header>
    ${t.value === undefined ? '' : `<p class="sb-big"><b data-count="${t.value}"
      data-digits="${t.digits || 0}">0</b>${t.unit ? `<small>${t.unit}</small>` : ''}</p>`}
    ${t.sub ? `<p class="sb-sub">${t.sub}</p>` : ''}
    ${t.chart || ''}
    ${t.note ? `<p class="sb-note">${t.note}</p>` : ''}
  </section>`;
}

/* ---------------------------------------------------------- reading a page */

/**
 * Everything a page of the game names about itself.
 *
 * A station page states `Personnel:` in a `<dt>` with "16 Employees" in the
 * `<dd>` beside it, and a vehicle page carries `#vehicle-attr-…` elements. Both
 * are the page naming its own fields, so they are read as pairs of label and
 * value rather than by a selector per figure — which is the same rule the
 * ledger's columns and a hospital row already keep, and the reason a field
 * nobody here has heard of still arrives.
 */
function sbPageFacts(doc) {
    const facts = {};
    const put = (label, value) => {
        const key = String(label).replace(/\s+/g, ' ').trim().replace(/:$/, '');
        const text = String(value).replace(/\s+/g, ' ').trim();
        if (!key || !text || facts[key] !== undefined) return;
        facts[key] = text;
    };
    for (const dt of doc.querySelectorAll('dt')) {
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === 'DD') put(dt.textContent, dd.textContent);
    }
    for (const el of doc.querySelectorAll('[id^="vehicle-attr-"], [id^="building-attr-"]')) {
        put(el.id.replace(/^(vehicle|building)-attr-/, '').replace(/-/g, ' '), el.textContent);
    }
    return facts;
}

/** The first figure in a fact, so "16 Employees" and "Level 4" both answer. */
function sbFigure(facts, words) {
    for (const [key, value] of Object.entries(facts)) {
        if (!words.some((w) => key.toLowerCase().includes(w))) continue;
        const m = /-?[\d.,]+/.exec(value);
        if (!m) continue;
        const n = Number(m[0].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
        if (Number.isFinite(n)) return n;
    }
    return null;
}

/** Read a run of pages, a few at a time, saying where it has got to. */
async function sbSweep(urls, onEach, onProgress, ctx) {
    const out = new Map();
    for (let i = 0; i < urls.length; i += 1) {
        onProgress?.(i + 1, urls.length);
        try {
            /* eslint-disable no-await-in-loop */
            const res = await fetch(urls[i].url, { credentials: 'same-origin' });
            if (res.ok) {
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                out.set(urls[i].id, onEach(doc));
            }
            /* eslint-enable no-await-in-loop */
        } catch (e) { ctx.log.warn('statboard page', e.message); }
        if (i % 8 === 7) await ctx.sleep(400);
    }
    return out;
}

/* ------------------------------------------------------------- the ledger */

const SB_LEDGER_KEY = 'ymca-statboard-ledger';

/**
 * The game's own book, kept with its dates.
 *
 * The reading itself is TrackOps' — `toParseLedgerRow` finds which cell is the
 * amount and which is the description by asking the row, and `toLedgerPages`
 * follows `a[rel="next"]` rather than building `?page=N`. Both stay in one
 * place: a second copy of the column-finding would drift the first time the
 * game moved a column, and it is the reading that took three rounds to get
 * right.
 *
 * WHAT IS ADDED HERE IS THE DATE. TrackOps needed only what a line was worth;
 * a board that answers "today" needs when. The game writes `23 Sep 23:21` with
 * no year, so the year is this one — and where that lands in the future, the
 * one before. That is an assumption and it is the only one in this file.
 */
function sbWhen(text, now = new Date()) {
    if (!text) return null;
    const direct = Date.parse(text);
    if (Number.isFinite(direct)) return direct;
    const m = /(\d{1,2})[.\s]*([A-Za-zÄäÖöÜü]{3,})\.?\s+(\d{1,2}):(\d{2})/.exec(text);
    if (!m) return null;
    const months = ['jan', 'feb', 'mar|mär', 'apr', 'may|mai', 'jun', 'jul', 'aug',
        'sep', 'oct|okt', 'nov', 'dec|dez'];
    const want = m[2].slice(0, 3).toLowerCase();
    const month = months.findIndex((set) => set.split('|').includes(want));
    if (month < 0) return null;
    const at = new Date(now.getFullYear(), month, Number(m[1]), Number(m[3]), Number(m[4]));
    if (at.getTime() > now.getTime() + 36e5) at.setFullYear(now.getFullYear() - 1);
    return at.getTime();
}

async function sbReadLedger(pages, onProgress) {
    const res = await fetch('/credits/overview', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`the ledger answered HTTP ${res.status}`);
    let doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const { total } = toLedgerPages(doc);
    const want = Math.max(1, Math.min(Number(pages) || 1, 300));
    const lines = [];
    let read = 0;
    let next = null;
    for (;;) {
        for (const tr of doc.querySelectorAll('table tr')) {
            const row = toParseLedgerRow(tr);
            if (row) lines.push({ amount: row.amount, what: row.what, when: sbWhen(row.at) });
        }
        read += 1;
        next = toLedgerPages(doc).next;
        if (!next || read >= want) break;
        onProgress?.(read, want, total);
        /* eslint-disable no-await-in-loop */
        const more = await fetch(next, { credentials: 'same-origin' });
        if (!more.ok) break;
        doc = new DOMParser().parseFromString(await more.text(), 'text/html');
        /* eslint-enable no-await-in-loop */
    }
    return { lines, pagesRead: read, pagesTotal: total, at: Date.now() };
}

const SB_SPANS = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'week', label: '7 days' },
    { id: 'month', label: '30 days' },
    { id: 'all', label: 'Everything read' },
];

/** The lines inside a span. A line with no readable date is only ever in "all". */
function sbInSpan(lines, span, now = Date.now()) {
    if (span === 'all') return lines;
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    const start = {
        today: day.getTime(),
        yesterday: day.getTime() - 864e5,
        week: day.getTime() - 6 * 864e5,
        month: day.getTime() - 29 * 864e5,
    }[span];
    const end = span === 'yesterday' ? day.getTime() : Infinity;
    return lines.filter((l) => l.when && l.when >= start && l.when < end);
}

/** What the ledger says, grouped by the game's own wording for each line. */
function sbByKind(lines) {
    const kinds = new Map();
    for (const l of lines) {
        const key = l.what;
        if (!kinds.has(key)) kinds.set(key, { label: key, runs: 0, paid: 0, spent: 0, amounts: [] });
        const k = kinds.get(key);
        k.runs += 1;
        if (l.amount >= 0) { k.paid += l.amount; k.amounts.push(l.amount); } else k.spent -= l.amount;
    }
    for (const k of kinds.values()) {
        k.average = k.amounts.length
            ? Math.round(k.amounts.reduce((n, a) => n + a, 0) / k.amounts.length) : null;
        k.low = k.amounts.length ? Math.min(...k.amounts) : null;
        k.high = k.amounts.length ? Math.max(...k.amounts) : null;
    }
    return [...kinds.values()];
}

/* Lines the game writes that are not a mission being run. Each is the game's
 * own wording, read off a real account's ledger rather than guessed at — and
 * anything not on this list stays a mission, so a call nobody here has seen
 * still counts. */
const SB_NOT_A_MISSION = [
    /^patient treatment/i, /^prisoner transported$/i, /^vehicle bought$/i,
    /constructed$/i, /^completed task/i, /^daily login reward$/i, /^refund /i,
    /extended guard$/i, /station upgraded/i, /^personnel education$/i,
];
const sbIsMission = (label) => !SB_NOT_A_MISSION.some((re) => re.test(label));

/**
 * A figure the record itself names.
 *
 * `/api/buildings` and `/api/vehicles` carry more than this repo has written
 * down — the fixture it is tested against is a handful of fields and a real
 * account's is not. So a figure is looked for by what the game called it,
 * across whatever keys the record actually has, rather than against a list of
 * field names somebody here guessed. A record that names none of them answers
 * null, and null is said on screen as "not stated" rather than drawn as a nought.
 */
function sbRecordFigure(record, words) {
    if (!record || typeof record !== 'object') return null;
    for (const [key, value] of Object.entries(record)) {
        const k = key.toLowerCase();
        if (!words.some((w) => k.includes(w))) continue;
        const n = typeof value === 'number' ? value : Number(value);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

/** The average of what was actually stated, and how many stated it. */
function sbAverage(values) {
    const real = values.filter((v) => Number.isFinite(v));
    if (!real.length) return { value: null, of: 0 };
    return { value: real.reduce((n, v) => n + v, 0) / real.length, of: real.length };
}

YMCA.register({
    id: 'statboard',
    optional: true,
    defaultOn: true,
    title: 'StatBoard',
    tagline: 'Your game in four pages',

    description: 'Four boards over what this game is: your stations, your fleet, the calls you '
        + 'run and what they paid. Each one is three figures and the list they came from, and '
        + 'every figure says whether the game stated it, its ledger stated it, or no page states '
        + 'it yet.',

    async mount(el, ctx) {
        /* THE WINDOW IS TWICE THE SIZE WHILE THIS IS OPEN, and it is the
         * shell's own window rather than a second lightbox: Escape has to go on
         * stepping back the way it does everywhere else, and a popup over a
         * popup is two things to close. The class comes off again the moment
         * this panel leaves the page. */
        const win = document.getElementById('ymca-window');
        win?.classList.add('ymca-wide');
        const watch = new MutationObserver(() => {
            if (!el.isConnected) { win?.classList.remove('ymca-wide'); watch.disconnect(); }
        });
        if (win) watch.observe(win, { childList: true, subtree: true });

        el.innerHTML = '<p class="ymca-dim">Reading your stations and your fleet…</p>';
        const [buildings, vehicles] = await Promise.all([
            ctx.game('/api/buildings'), ctx.game('/api/vehicles'),
        ]);

        const cfg = () => ctx.store.read('cfg', {});
        const save = (patch) => ctx.store.write('cfg', { ...cfg(), ...patch });
        const state = {
            board: SB_BOARDS.some((b) => b.id === cfg().board) ? cfg().board : 'buildings',
            span: cfg().span || 'all',
            centre: '',
            view: null,
            sort: {},
        };

        const byId = new Map((buildings || []).map((b) => [String(b.id), b]));
        const kindName = (id) => {
            let learnt = {};
            try {
                learnt = JSON.parse(localStorage.getItem('ymca-renamer-stationTypes')) || {};
            } catch (e) { /* none */ }
            const builtin = typeof BUILTIN_STATION_TYPES === 'object' ? BUILTIN_STATION_TYPES : {};
            return learnt[id] || builtin[id] || `Building type ${id}`;
        };
        let typeNames = {};
        try { typeNames = JSON.parse(localStorage.getItem('ymca-vehicle-types')) || {}; } catch (e) { /* none */ }
        const vehicleName = (v) => v.vehicle_type_caption
            || typeNames[String(v.vehicle_type)]?.name || typeNames[String(v.vehicle_type)]
            || `Type ${v.vehicle_type}`;

        const centres = (buildings || [])
            .filter((b) => (buildings || []).some((x) => String(x.leitstelle_building_id) === String(b.id)))
            .map((b) => ({ id: String(b.id), name: b.caption || `Centre ${b.id}` }));
        const inCentre = (b) => !state.centre
            || String(b.leitstelle_building_id ?? '') === state.centre;

        el.innerHTML = `
      <div class="sb-root">
        <div class="sb-body" id="sb-body"></div>
        <nav class="sb-nav" id="sb-nav">${SB_BOARDS.map((b, i) => `
          <button class="sb-dot" data-board="${b.id}" title="${b.label}"
            style="--sb-dot:${SB_SERIES[i]}">${sbIcon(b.id, 20)}
            <span>${b.label}</span></button>`).join('')}</nav>
      </div>`;
        const body = el.querySelector('#sb-body');

        const facts = {
            buildings: ctx.store.read('buildingFacts', {}),
            vehicles: ctx.store.read('vehicleFacts', {}),
        };
        let ledger = ctx.store.read('ledger', null);

        /* ------------------------------------------------------- the pages */

        const filterBar = (kind) => (centres.length ? `
      <div class="sb-filter">
        <label>Dispatch centre
          <select data-centre>
            <option value="">All of them</option>
            ${centres.map((c) => `<option value="${ctx.esc(c.id)}"${
    c.id === state.centre ? ' selected' : ''}>${ctx.esc(c.name)}</option>`).join('')}
          </select></label>
        <button class="ymca-btn" data-read="${kind}">Read every ${kind === 'buildings'
    ? 'station' : 'vehicle'} page</button>
        <span class="sb-dim" id="sb-progress"></span>
      </div>` : '');

        const boardBuildings = () => {
            const mine = (buildings || []).filter(inCentre);
            const levels = mine.map((b) => sbRecordFigure(b, ['level', 'stufe'])
                ?? sbFigure(facts.buildings[String(b.id)] || {}, ['level', 'stufe', 'ausbau']));
            const crew = mine.map((b) => sbRecordFigure(b, ['personal_count', 'personnel'])
                ?? sbFigure(facts.buildings[String(b.id)] || {}, ['personnel', 'personal',
                    'employee', 'mitarbeiter']));
            const level = sbAverage(levels);
            const staff = sbAverage(crew);
            const byKind = new Map();
            for (const b of mine) {
                const k = kindName(String(b.building_type ?? ''));
                byKind.set(k, (byKind.get(k) || 0) + 1);
            }
            const exts = new Map();
            for (const b of mine) {
                for (const e of b.extensions || []) {
                    if (e.caption) exts.set(e.caption, (exts.get(e.caption) || 0) + 1);
                }
            }

            const tiles = [
                sbTile({
                    label: 'Stations', source: 'measured', value: mine.length,
                    sub: `${byKind.size} kind${byKind.size === 1 ? '' : 's'} of building`,
                    chart: sbDonut([...byKind].map(([label, value]) => ({ label, value })),
                        { middleLabel: 'stations' }),
                }),
                sbTile({
                    label: 'Average level',
                    source: level.value === null ? 'unread' : 'measured',
                    value: level.value === null ? undefined : level.value,
                    digits: 1,
                    sub: level.value === null ? '' : `stated by ${level.of} of ${mine.length}`,
                    note: level.value === null
                        ? 'Neither <code>/api/buildings</code> nor any station page read so far '
                        + 'names a level. Press <b>Read every station page</b> and it will fill '
                        + 'itself if the page states it under any name at all.' : '',
                }),
                sbTile({
                    label: 'Personnel', source: staff.value === null ? 'unread' : 'measured',
                    value: staff.value === null ? undefined : staff.value,
                    digits: 1, unit: 'per station',
                    sub: staff.value === null ? '' : `${sbNum(staff.value * staff.of)} in all, `
                        + `stated by ${staff.of} of ${mine.length}`,
                    note: staff.value === null
                        ? 'A station page states <code>Personnel:</code> and the API does not, so '
                        + 'this waits for the read.'
                        : 'How many of them hold a training is stated by no page this has read, '
                        + 'so it is not claimed.',
                }),
            ].join('');

            const rows = mine.map((b) => {
                const f = facts.buildings[String(b.id)] || {};
                const fleet = (vehicles || []).filter((v) => String(v.building_id) === String(b.id));
                const lvl = sbRecordFigure(b, ['level', 'stufe']) ?? sbFigure(f, ['level', 'stufe']);
                const bays = sbRecordFigure(b, ['vehicle_slot', 'slots', 'stellplatz'])
                    ?? sbFigure(f, ['slot', 'stellplatz', 'garage']);
                const ready = (b.extensions || []).filter((e) => e.available === true).length;
                return {
                    id: String(b.id), name: b.caption || `Building ${b.id}`,
                    cells: [
                        kindName(String(b.building_type ?? '')),
                        byId.get(String(b.leitstelle_building_id))?.caption || '—',
                        fleet.length,
                        bays,
                        `${ready}/${(b.extensions || []).length}`,
                        lvl,
                        sbRecordFigure(b, ['personal_count', 'personnel'])
                            ?? sbFigure(f, ['personnel', 'personal', 'employee']),
                    ],
                    sort: [0, 0, fleet.length, bays, ready, lvl, 0],
                };
            });

            return {
                tiles,
                head: ['Station', 'Kind', 'Centre', 'Vehicles', 'Bays', 'Extensions', 'Level', 'Crew'],
                rows,
                kind: 'buildings',
                extras: exts,
            };
        };

        const boardVehicles = () => {
            const mine = (vehicles || []).filter((v) => {
                const home = byId.get(String(v.building_id));
                return home ? inCentre(home) : !state.centre;
            });
            const km = mine.map((v) => sbRecordFigure(v, ['total_km', 'kilomet'])
                ?? sbFigure(facts.vehicles[String(v.id)] || {}, ['km', 'kilomet', 'mile']));
            const drivenKm = sbAverage(km);
            const byType = new Map();
            for (const v of mine) {
                const n = vehicleName(v);
                byType.set(n, (byType.get(n) || 0) + 1);
            }
            const tiles = [
                sbTile({
                    label: 'Vehicles', source: 'measured', value: mine.length,
                    sub: `${byType.size} type${byType.size === 1 ? '' : 's'} in the fleet`,
                    chart: sbDonut([...byType].map(([label, value]) => ({ label, value })),
                        { middleLabel: 'vehicles' }),
                }),
                sbTile({
                    label: 'Distance driven',
                    source: drivenKm.value === null ? 'unread' : 'measured',
                    value: drivenKm.value === null ? undefined : drivenKm.value,
                    digits: 1, unit: 'km each',
                    sub: drivenKm.value === null ? '' : `${sbNum(drivenKm.value * drivenKm.of)} km `
                        + `in all, stated by ${drivenKm.of} of ${mine.length}`,
                    note: drivenKm.value === null
                        ? 'A vehicle’s own page states its distance; the API does not. '
                        + 'Press <b>Read every vehicle page</b>.'
                        : `In miles that is ${sbNum(drivenKm.value * 0.621371, 1)} each.`,
                }),
                sbTile({
                    label: 'Time driven, and speed', source: 'unread',
                    note: 'No page of the game this repo has read states how long a vehicle has '
                        + 'been driving — not the API, not its own page, not its edit form. '
                        + 'Without it an average speed is arithmetic on a number nobody has, so '
                        + 'neither is shown. The page read collects every field a vehicle page '
                        + 'names, so the day one of them is a clock this fills itself.',
                }),
            ].join('');

            const rows = mine.map((v) => {
                const f = facts.vehicles[String(v.id)] || {};
                return {
                    id: String(v.id), name: v.caption || `Vehicle ${v.id}`,
                    cells: [
                        vehicleName(v),
                        byId.get(String(v.building_id))?.caption || '—',
                        v.fms_show ?? v.fms_real ?? '—',
                        sbRecordFigure(v, ['personal_max', 'max_personnel'])
                            ?? sbFigure(f, ['crew', 'personal', 'besatzung']),
                        sbRecordFigure(v, ['total_km', 'kilomet']) ?? sbFigure(f, ['km', 'kilomet']),
                    ],
                    sort: [0, 0, Number(v.fms_show) || 0, 0, 0],
                };
            });
            return {
                tiles,
                head: ['Vehicle', 'Type', 'Station', 'Status', 'Crew', 'km'],
                rows,
                kind: 'vehicles',
            };
        };

        const needLedger = (what) => `
      <section class="sb-tile sb-tile-unread">
        <header><h3>${what}</h3><span class="sb-src sb-src-ledger">the game keeps a ledger</span></header>
        <p class="sb-note">Every figure on this board is a line the game wrote in
          <code>/credits/overview</code> — what it paid and what it paid it for. It is
          paged, and a real account has hundreds, so how far back to read is yours.</p>
        <p><label>Read <select data-pages>
          ${[1, 5, 25, 50, 100, 200, 300].map((n) => `<option value="${n}"${n === 50
    ? ' selected' : ''}>${n} page${n === 1 ? '' : 's'}</option>`).join('')}
        </select></label>
        <button class="ymca-btn primary" data-read="ledger">Read the ledger</button></p>
        <p class="sb-dim" id="sb-progress"></p>
      </section>`;

        const boardMissions = () => {
            if (!ledger) return { tiles: needLedger('Missions'), head: [], rows: [], kind: 'missions' };
            const kinds = sbByKind(sbInSpan(ledger.lines, state.span));
            const missions = kinds.filter((k) => sbIsMission(k.label));
            const runs = missions.reduce((n, k) => n + k.runs, 0);
            const find = (re) => kinds.find((k) => re.test(k.label));
            const transport = find(/^patient treatment and transport/i);
            const treatment = find(/^patient treatment$/i);
            const prisoners = find(/^prisoner transported$/i);
            const most = [...missions].sort((a, b) => b.runs - a.runs)[0];

            const tiles = [
                sbTile({
                    label: 'Calls run', source: 'ledger', value: runs,
                    sub: `${missions.length} different kinds, over ${ledger.pagesRead} of `
                        + `${ledger.pagesTotal || '?'} pages of the ledger`,
                    chart: sbDonut(missions.map((k) => ({ label: k.label, value: k.runs })),
                        { middleLabel: 'calls' }),
                }),
                sbTile({
                    label: 'Patients and prisoners', source: 'ledger',
                    value: (transport?.runs || 0) + (treatment?.runs || 0) + (prisoners?.runs || 0),
                    sub: 'lines the game wrote for them',
                    chart: sbBars([
                        { label: 'Treated and transported', value: transport?.runs || 0 },
                        { label: 'Treated', value: treatment?.runs || 0 },
                        { label: 'Prisoners transported', value: prisoners?.runs || 0 },
                    ]),
                    note: 'These are the ambulance service’s and the cells’ own income '
                        + 'and appear in no mission list — the ledger is the only place they '
                        + 'are named.',
                }),
                sbTile({
                    label: 'Most run', source: 'ledger',
                    value: most?.runs, unit: most ? `× ${most.label}` : '',
                    sub: most ? `${sbNum(most.average)} credits each on average` : '',
                    chart: sbBars(missions.map((k) => ({ label: k.label, value: k.runs })),
                        { limit: 6 }),
                }),
            ].join('');

            const rows = missions.sort((a, b) => b.runs - a.runs).map((k) => ({
                id: k.label, name: k.label,
                cells: [k.runs, k.average, k.low, k.high, k.paid],
                sort: [k.runs, k.average, k.low, k.high, k.paid],
            }));
            return {
                tiles,
                head: ['Mission', 'Run', 'Average', 'Lowest', 'Highest', 'Paid in all'],
                rows,
                kind: 'missions',
            };
        };

        const boardCredits = () => {
            if (!ledger) return { tiles: needLedger('Credits'), head: [], rows: [], kind: 'credits' };
            const lines = sbInSpan(ledger.lines, state.span);
            const kinds = sbByKind(lines);
            const paid = kinds.reduce((n, k) => n + k.paid, 0);
            const spent = kinds.reduce((n, k) => n + k.spent, 0);
            const dated = ledger.lines.filter((l) => l.when).length;

            const tiles = [
                sbTile({
                    label: 'Came in', source: 'ledger', value: paid, unit: 'credits',
                    sub: `${lines.filter((l) => l.amount >= 0).length} lines`,
                    chart: sbDonut(kinds.filter((k) => k.paid > 0)
                        .map((k) => ({ label: k.label, value: k.paid })),
                    { middleLabel: 'in' }),
                }),
                sbTile({
                    label: 'Went out', source: 'ledger', value: spent, unit: 'credits',
                    sub: `${lines.filter((l) => l.amount < 0).length} lines`,
                    chart: sbDonut(kinds.filter((k) => k.spent > 0)
                        .map((k) => ({ label: k.label, value: k.spent })),
                    { middleLabel: 'out' }),
                }),
                sbTile({
                    label: 'Left over', source: 'ledger', value: paid - spent, unit: 'credits',
                    sub: state.span === 'all'
                        ? `over ${ledger.pagesRead} of ${ledger.pagesTotal || '?'} pages`
                        : 'in the span chosen above',
                    note: dated < ledger.lines.length
                        ? `${ledger.lines.length - dated} of ${ledger.lines.length} lines carry no `
                        + 'date this could read, so they are only ever in "everything read".' : '',
                }),
            ].join('');

            const rows = kinds.sort((a, b) => (b.paid + b.spent) - (a.paid + a.spent)).map((k) => ({
                id: k.label, name: k.label,
                cells: [k.runs, k.paid || null, k.spent || null, k.average],
                sort: [k.runs, k.paid, k.spent, k.average],
                flat: true,
            }));
            return {
                tiles,
                head: ['Line', 'Times', 'In', 'Out', 'Average in'],
                rows,
                kind: 'credits',
                span: true,
            };
        };

        const BOARDS = {
            buildings: boardBuildings,
            vehicles: boardVehicles,
            missions: boardMissions,
            credits: boardCredits,
        };

        /* ---------------------------------------------------------- drawing */

        const cell = (v) => (v === null || v === undefined || v === '' ? '<span class="sb-dim">—</span>'
            : (typeof v === 'number' ? sbNum(v) : ctx.esc(String(v))));

        const table = (board) => {
            if (!board.head.length) return '';
            const key = state.sort[board.kind];
            let rows = board.rows;
            if (key !== undefined) {
                const at = Math.abs(key) - 1;
                const dir = key < 0 ? -1 : 1;
                rows = [...rows].sort((a, b) => {
                    if (at === 0) return dir * String(a.name).localeCompare(String(b.name));
                    const x = a.sort?.[at - 1] ?? a.cells[at - 1];
                    const y = b.sort?.[at - 1] ?? b.cells[at - 1];
                    const nx = Number(x);
                    const ny = Number(y);
                    if (Number.isFinite(nx) && Number.isFinite(ny)) return dir * (nx - ny);
                    return dir * String(x ?? '').localeCompare(String(y ?? ''));
                });
            }
            return `<div class="sb-table">
        <table>
          <thead><tr>${board.head.map((h, i) => `<th data-sort="${i}"${
    Math.abs(key || 0) - 1 === i ? ` class="sb-on${key < 0 ? ' sb-desc' : ''}"` : ''
}>${ctx.esc(h)}</th>`).join('')}<th></th></tr></thead>
          <tbody>${rows.map((r) => `<tr>
            <td>${r.flat ? ctx.esc(r.name)
        : `<a href="#" data-open="${ctx.esc(r.id)}">${ctx.esc(r.name)}</a>`}</td>
            ${r.cells.map((c) => `<td>${cell(c)}</td>`).join('')}
            <td class="sb-statcell"><button class="sb-statbtn" data-stat="${ctx.esc(r.id)}"
              title="What this one on its own says">${sbIcon('stat', 14)}</button></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
        };

        /* THE DRILL-DOWN STAYS IN THE BOARD. The game's own page for a station
         * or a vehicle opens in a frame inside this panel, because a new tab is
         * a place with no way back to what you were reading and a full-page
         * navigation throws the whole board away. */
        const pageView = (kind, id) => {
            const url = kind === 'buildings' ? `/buildings/${encodeURIComponent(id)}`
                : `/vehicles/${encodeURIComponent(id)}`;
            const name = kind === 'buildings'
                ? byId.get(String(id))?.caption
                : (vehicles || []).find((v) => String(v.id) === String(id))?.caption;
            return `<div class="sb-drill">
        <div class="sb-drill-bar">
          <button class="ymca-btn" data-back>← Back to the board</button>
          <b>${ctx.esc(name || url)}</b>
          <span class="sb-dim">${ctx.esc(url)}</span>
        </div>
        <iframe class="sb-frame" src="${ctx.esc(url)}" title="${ctx.esc(name || url)}"></iframe>
      </div>`;
        };

        const statView = (kind, id) => {
            let title = id;
            let tiles = '';
            if (kind === 'buildings') {
                const b = byId.get(String(id));
                const f = facts.buildings[String(id)] || {};
                const fleet = (vehicles || []).filter((v) => String(v.building_id) === String(id));
                const byType = new Map();
                for (const v of fleet) {
                    const n = vehicleName(v);
                    byType.set(n, (byType.get(n) || 0) + 1);
                }
                title = b?.caption || `Building ${id}`;
                const exts = b?.extensions || [];
                tiles = [
                    sbTile({
                        label: 'Extensions', source: 'measured', value: exts.length,
                        sub: `${exts.filter((e) => e.available === true).length} finished`,
                        chart: exts.length ? `<ul class="sb-list">${exts.map((e) => `<li>
              <span>${ctx.esc(e.caption || 'unnamed')}</span>
              <b class="${e.available === true ? 'sb-ok' : 'sb-wait'}">${
    e.available === true ? 'ready' : 'building'}</b></li>`).join('')}</ul>`
                            : '<p class="sb-dim">None on this one.</p>',
                        note: b?.generates_mission_categories
                            ? `It generates: ${ctx.esc(String(b.generates_mission_categories)
                                .replace(/[#<>{}:]|Set|\s/g, ' ').replace(/\s+/g, ' ').trim()
                                || 'nothing')}.` : '',
                    }),
                    sbTile({
                        label: 'Its fleet', source: 'measured', value: fleet.length,
                        chart: sbDonut([...byType].map(([label, value]) => ({ label, value })),
                            { middleLabel: 'vehicles' }),
                    }),
                    sbTile({
                        label: 'What its page states',
                        source: Object.keys(f).length ? 'measured' : 'unread',
                        chart: Object.keys(f).length ? `<ul class="sb-list">${
                            Object.entries(f).slice(0, 14).map(([k, v]) => `<li>
              <span>${ctx.esc(k)}</span><b>${ctx.esc(v)}</b></li>`).join('')}</ul>` : '',
                        note: Object.keys(f).length ? ''
                            : 'Its own page has not been read yet. The button on the board reads '
                            + 'every station’s, and whatever the page names lands here.',
                    }),
                ].join('');
            } else if (kind === 'vehicles') {
                const v = (vehicles || []).find((x) => String(x.id) === String(id));
                const f = facts.vehicles[String(id)] || {};
                title = v?.caption || `Vehicle ${id}`;
                tiles = [
                    sbTile({
                        label: vehicleName(v || {}), source: 'measured',
                        sub: `at ${ctx.esc(byId.get(String(v?.building_id))?.caption || 'an unknown station')}`,
                        note: `The game shows it as status ${v?.fms_show ?? '—'}`
                            + ` and it really is ${v?.fms_real ?? '—'}.`,
                    }),
                    sbTile({
                        label: 'Distance driven',
                        source: sbFigure(f, ['km', 'kilomet']) === null ? 'unread' : 'measured',
                        value: sbFigure(f, ['km', 'kilomet']) ?? undefined, unit: 'km',
                        note: sbFigure(f, ['km', 'kilomet']) === null
                            ? 'Its page has not been read yet.' : '',
                    }),
                    sbTile({
                        label: 'What its page states',
                        source: Object.keys(f).length ? 'measured' : 'unread',
                        chart: Object.keys(f).length ? `<ul class="sb-list">${
                            Object.entries(f).slice(0, 14).map(([k, x]) => `<li>
              <span>${ctx.esc(k)}</span><b>${ctx.esc(x)}</b></li>`).join('')}</ul>` : '',
                        note: Object.keys(f).length ? '' : 'Read the vehicle pages and it fills.',
                    }),
                ].join('');
            } else {
                const k = sbByKind(sbInSpan(ledger?.lines || [], state.span))
                    .find((x) => x.label === id);
                title = id;
                tiles = [
                    sbTile({
                        label: 'Run', source: 'ledger', value: k?.runs || 0,
                        sub: 'lines the game wrote with this name',
                    }),
                    sbTile({
                        label: 'What it paid', source: 'ledger', value: k?.average ?? undefined,
                        unit: 'credits on average',
                        sub: k ? `between ${sbNum(k.low)} and ${sbNum(k.high)}` : '',
                        chart: k ? sbBars([
                            { label: 'Lowest', value: k.low || 0 },
                            { label: 'Average', value: k.average || 0 },
                            { label: 'Highest', value: k.high || 0 },
                        ]) : '',
                    }),
                    sbTile({
                        label: 'In all', source: 'ledger', value: k?.paid || 0, unit: 'credits',
                        note: 'What a call <i>asks for</i> is in MissionMagician, off the game’s '
                            + 'own requirement list; this board only has what it paid.',
                    }),
                ].join('');
            }
            return `<div class="sb-drill">
        <div class="sb-drill-bar">
          <button class="ymca-btn" data-back>← Back to the board</button>
          <b>${ctx.esc(title)}</b>
        </div>
        <div class="sb-stats sb-stats-wide">${tiles}</div>
      </div>`;
        };

        const render = () => {
            for (const dot of el.querySelectorAll('.sb-dot')) {
                dot.classList.toggle('sb-dot-on', dot.dataset.board === state.board);
            }
            if (state.view) {
                body.innerHTML = state.view.kind === 'stat'
                    ? statView(state.board, state.view.id)
                    : pageView(state.board, state.view.id);
            } else {
                const board = BOARDS[state.board]();
                body.innerHTML = `
          <div class="sb-left">
            ${board.span ? `<div class="sb-spans">${SB_SPANS.map((s) => `
              <button class="ymca-btn${s.id === state.span ? ' primary' : ''}"
                data-span="${s.id}">${s.label}</button>`).join('')}</div>` : ''}
            ${board.kind === 'buildings' || board.kind === 'vehicles' ? filterBar(board.kind) : ''}
            <div class="sb-stats">${board.tiles}</div>
          </div>
          <div class="sb-right">${table(board)}</div>`;
            }
            for (const n of body.querySelectorAll('[data-count]')) {
                sbCountUp(n, Number(n.dataset.count), Number(n.dataset.digits) || 0);
            }
        };

        /* -------------------------------------------------------- listening */

        const progress = (a, b) => {
            const at = el.querySelector('#sb-progress');
            if (at) at.textContent = `Reading ${a} of ${b}…`;
        };

        el.addEventListener('click', async (e) => {
            const dot = e.target.closest('[data-board]');
            if (dot) {
                state.board = dot.dataset.board;
                state.view = null;
                save({ board: state.board });
                render();
                return;
            }
            if (e.target.closest('[data-back]')) { state.view = null; render(); return; }
            const open = e.target.closest('[data-open]');
            if (open) {
                e.preventDefault();
                state.view = { kind: 'page', id: open.dataset.open };
                if (state.board === 'missions' || state.board === 'credits') {
                    state.view.kind = 'stat';
                }
                render();
                return;
            }
            const stat = e.target.closest('[data-stat]');
            if (stat) { state.view = { kind: 'stat', id: stat.dataset.stat }; render(); return; }
            const span = e.target.closest('[data-span]');
            if (span) {
                state.span = span.dataset.span;
                save({ span: state.span });
                render();
                return;
            }
            const sort = e.target.closest('[data-sort]');
            if (sort) {
                const at = Number(sort.dataset.sort) + 1;
                const now = state.sort[state.board];
                state.sort[state.board] = now === at ? -at : at;
                render();
                return;
            }
            const read = e.target.closest('[data-read]');
            if (!read) return;
            const what = read.dataset.read;
            read.disabled = true;
            try {
                if (what === 'ledger') {
                    const pages = Number(el.querySelector('[data-pages]')?.value) || 50;
                    ctx.status(`Reading ${pages} pages of the ledger…`);
                    ledger = await sbReadLedger(pages, (a, b) => progress(a, b));
                    ctx.store.write('ledger', ledger);
                    ctx.status(`${ledger.lines.length} lines, ${ledger.pagesRead} pages.`);
                } else if (what === 'buildings') {
                    const list = (buildings || []).filter(inCentre)
                        .map((b) => ({ id: String(b.id), url: `/buildings/${b.id}` }));
                    const got = await sbSweep(list, sbPageFacts, progress, ctx);
                    for (const [id, f] of got) facts.buildings[id] = f;
                    ctx.store.write('buildingFacts', facts.buildings);
                    ctx.status(`${got.size} station pages read.`);
                } else {
                    const list = (vehicles || []).map((v) => ({ id: String(v.id), url: `/vehicles/${v.id}` }));
                    const got = await sbSweep(list, sbPageFacts, progress, ctx);
                    for (const [id, f] of got) facts.vehicles[id] = f;
                    ctx.store.write('vehicleFacts', facts.vehicles);
                    ctx.status(`${got.size} vehicle pages read.`);
                }
            } catch (err) {
                ctx.log.warn('statboard read', err.message);
                const at = el.querySelector('#sb-progress');
                if (at) at.textContent = `That read did not finish: ${err.message}`;
                return;
            }
            render();
        });

        el.addEventListener('change', (e) => {
            if (e.target.dataset.centre === undefined) return;
            state.centre = e.target.value;
            render();
        });

        render();
    },
});
