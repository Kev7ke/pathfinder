/* --------------------------------------------------------------------------
 * RecruitDude — every station's hiring, on one screen.
 *
 * Hiring is four clicks per station: open the building, Hire new people, pick a
 * length, confirm. Across fourteen stations that is the whole evening, and it
 * is the same four clicks every time.
 *
 * IT USED TO DO THE PRESSING, AND THAT WAS THE WRONG SIDE OF THE LINE. It was
 * the one exception to "where there can be no undo, do not write at all", and
 * the exception did not hold: a tool that spends credits at fourteen stations
 * off one press is doing the playing, which is the same objection that took
 * MissionMagician Auto and HighFive Auto out in 0.0.51. What was actually
 * wanted was never the sending — it was not having to open fourteen buildings
 * to find the four clicks.
 *
 * So it lays the choice out and presses nothing. Each station's row carries the
 * game's own hire links, one per length, and the player clicks the one they
 * want. One click instead of four, no credits spent by anything here, and no
 * preview to stand in for an undo that never existed.
 *
 * Where the numbers come from, all of it the game's own:
 *   /api/buildings                  the stations, their type and their name
 *   /buildings/<id>                 "16 Employees", the artwork, the countdown
 *   /buildings/<id>/hire            where the game's own recruit buttons live
 *   /buildings/<id>/hire_do/1|2|3   recruit for one, two or three days
 *
 * The personnel count is not in /api/buildings, so it is read from each
 * station's own page — once, kept for the page load, and only for the stations
 * actually being shown.
 *
 * WHAT IS STILL OPEN: which element states a recruitment already running.
 * `data-end-time` is the game's own countdown attribute — it is on
 * `span#extension_countdown_<id>` — but whether personnel gets one, and under
 * what id, has never been seen from this side. So every countdown on the page
 * is read, one whose id names hiring is shown as Days left, and where none
 * does the column says so rather than showing a number off the wrong clock.
 * -------------------------------------------------------------------------- */

const RR_CACHE = new Map();

/** Buildings that employ people. A dispatch center has none to hire. */
const RR_NO_STAFF = new Set([1]);

/** An id that names hiring rather than an extension being built. */
const RR_HIRING_ID = /personnel|personal|staff|hire|schooling|recruit/i;

/**
 * What a station's page says about it.
 *
 * `Personnel:` is a `<dt>` and the count is the `<dd>` after it — "16
 * Employees" — so the number is taken from the pair rather than from a position
 * in the list, which moves as the game adds rows. The station's artwork is the
 * `img.pull-right` the page heads itself with.
 *
 * A countdown is `data-end-time`, which is the game's own attribute and not one
 * invented here. Every one on the page is collected with the id it sits on, so
 * a page that names its hiring countdown something nobody here has heard of can
 * still be read next time rather than argued about.
 */
async function rrRead(buildingId) {
    if (RR_CACHE.has(buildingId)) return RR_CACHE.get(buildingId);
    const load = (async () => {
        const res = await fetch(`/buildings/${buildingId}`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

        let staff = null;
        for (const dt of doc.querySelectorAll('dt')) {
            if (!/personnel/i.test(dt.textContent)) continue;
            const dd = dt.nextElementSibling;
            const n = dd && /(\d[\d,.]*)\s*(employee|personnel|people)/i.exec(dd.textContent);
            if (n) { staff = Number(n[1].replace(/[,.]/g, '')); break; }
        }
        const art = doc.querySelector('img.pull-right[src*="/images/"]')?.getAttribute('src') || null;
        // The game only offers the link when the station can actually hire.
        const canHire = !!doc.querySelector(`a[href$="/buildings/${buildingId}/hire"]`)
            || !!doc.querySelector('a[href*="/hire"]');

        const clocks = [];
        for (const el of doc.querySelectorAll('[data-end-time]')) {
            clocks.push({ id: el.id || null, endsAt: el.getAttribute('data-end-time') });
        }
        const hiring = clocks.find((c) => c.id && RR_HIRING_ID.test(c.id)) || null;
        return { staff, art, canHire, clocks, hiring };
    })().catch((err) => ({ staff: null, art: null, canHire: true, clocks: [], hiring: null,
        why: err.message }));
    RR_CACHE.set(buildingId, load);
    return load;
}

/** The lengths the game sells for credits, as its own links word them. */
const RR_DAYS = [
    { days: 1, label: '1 day' },
    { days: 2, label: '2 days' },
    { days: 3, label: '3 days' },
];

/**
 * Days left on a countdown the game stated, or null.
 *
 * `data-end-time` has only ever been seen as milliseconds since the epoch, so
 * anything that does not read as a time in the future is left as no answer
 * rather than turned into a number.
 */
function rrDaysLeft(endsAt) {
    const at = Number(endsAt);
    if (!Number.isFinite(at)) return null;
    const ms = at - Date.now();
    if (ms <= 0) return null;
    return Math.ceil(ms / 86400000);
}

YMCA.register({
    id: 'recruitroom',
    optional: true,
    defaultOn: true,
    title: 'RecruitDude',
    tagline: 'Hiring, every station at once',

    description: 'Every station that employs people, with its crew count and the game’s own '
        + 'recruit links for one, two or three days side by side. It does not hire for you — '
        + 'spent credits do not come back, so the link that costs money stays yours to click.',

    async mount(el, ctx) {
        const buildings = await ctx.game('/api/buildings');
        const cfg = ctx.store.read('cfg', {});

        const centres = buildings.filter((b) =>
            buildings.some((x) => x.leitstelle_building_id === b.id));
        const area = cfg.area && centres.some((c) => String(c.id) === String(cfg.area))
            ? String(cfg.area) : '';

        const stations = buildings
            .filter((b) => !RR_NO_STAFF.has(b.building_type))
            .filter((b) => !area || String(b.leitstelle_building_id) === area)
            .sort((a, b) => (a.caption || '').localeCompare(b.caption || ''));

        el.innerHTML = `
      <div class="ymca-card">
        <b>${stations.length} station${stations.length === 1 ? '' : 's'}</b>
        <p class="ymca-sub" style="margin:4px 0 10px">Crew counts come from each station's own
          page. The recruit links are the game's own &mdash; one click instead of four, and
          <b>nothing here spends a credit until you click one</b>.</p>
        ${centres.length ? `<label class="ymca-dim">Dispatch center
          <select data-cfg="area" style="margin-left:6px">
            <option value="">Everything you own</option>
            ${centres.map((c) => `<option value="${c.id}"${String(c.id) === area ? ' selected' : ''}
              >${ctx.esc(c.caption || `Center ${c.id}`)}</option>`).join('')}
          </select></label>` : ''}
      </div>

      <div class="ymca-card">
        <table id="rr-table" style="margin-top:4px">
          <thead><tr><th style="width:1%"></th><th>Station</th>
            <th class="ymca-num">Crew</th>
            <th class="ymca-num" title="From the game's own countdown, where it states one"
              >Days left</th>
            <th>Recruit for</th></tr></thead>
          <tbody>${stations.map((b) => `
            <tr data-station="${b.id}">
              <td class="rr-art"></td>
              <td><a href="/buildings/${b.id}" target="_blank" rel="noopener"
                >${ctx.esc(b.caption || `Building ${b.id}`)}</a></td>
              <td class="ymca-num rr-staff"><span class="ymca-dim">&hellip;</span></td>
              <td class="ymca-num rr-left"><span class="ymca-dim">&hellip;</span></td>
              <td class="rr-do">${RR_DAYS.map((d) => `<a class="ymca-btn"
                href="/buildings/${b.id}/hire_do/${d.days}" target="_blank" rel="noopener"
                >${d.label}</a>`).join(' ')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${stations.length ? '' : '<p class="ymca-dim">No station in this dispatch center hires.</p>'}
      </div>

      <div class="ymca-note">Each link is the game's own <code>hire_do</code>, opened in a new
        tab. <b>Credits spent on people do not come back</b>, and nothing here clicks one for
        you &mdash; that is the whole reason this is a layout rather than a queue.</div>`;

        el.addEventListener('change', (e) => {
            if (e.target.dataset.cfg !== 'area') return;
            ctx.store.write('cfg', Object.assign(ctx.store.read('cfg', {}), { area: e.target.value }));
            YMCA.modules.find((m) => m.id === 'recruitroom').mount(el, ctx);
        });

        /* One station at a time, so a big alliance of stations does not arrive
         * as fourteen requests at once. Each row fills itself in as it lands. */
        let noClock = 0;
        const clockIds = new Set();
        for (const b of stations) {
            const row = el.querySelector(`tr[data-station="${b.id}"]`);
            if (!row) continue;
            /* eslint-disable no-await-in-loop */
            const info = await rrRead(b.id);
            const cell = row.querySelector('.rr-staff');
            if (cell) {
                cell.innerHTML = info.staff === null
                    ? '<span class="ymca-dim">&ndash;</span>'
                    : `<b>${ctx.fmt(info.staff)}</b>`;
            }
            const left = row.querySelector('.rr-left');
            if (left) {
                const days = info.hiring ? rrDaysLeft(info.hiring.endsAt) : null;
                left.innerHTML = days === null
                    ? '<span class="ymca-dim" title="this page states no hiring countdown">&ndash;</span>'
                    : `<b>${ctx.fmt(days)}</b>`;
                if (days === null) noClock += 1;
            }
            for (const c of info.clocks || []) if (c.id) clockIds.add(c.id.replace(/\d+/g, '#'));
            const art = row.querySelector('.rr-art');
            if (art && info.art) {
                art.innerHTML = `<img src="${ctx.esc(info.art)}" width="24" height="24" alt=""
                  style="vertical-align:-6px">`;
            }
            await ctx.sleep(80);
        }
        /* Whether a station page states a hiring countdown at all has never been
         * seen from this side, so what the pages did carry is written down for
         * the next read rather than left as a column of dashes nobody can act on. */
        ctx.store.write('clocks', { at: Date.now(), noCountdown: noClock,
            countdownIds: [...clockIds].sort() });
        ctx.status(`${stations.length} stations.`);
    },
});
