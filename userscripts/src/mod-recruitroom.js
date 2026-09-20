/* --------------------------------------------------------------------------
 * RecruitRoom — every station's hiring, on one screen.
 *
 * Hiring is four clicks per station: open the building, Hire new people, pick a
 * length, confirm. Across fourteen stations that is the whole evening, and it
 * is the same four clicks every time.
 *
 * WHAT THIS DOES NOT DO: hire. Credits spent on personnel do not come back, and
 * a tool that cannot undo what it did does not write — so the buttons here are
 * the game's own links, rendered together, and the player presses them. One
 * click instead of four, and the thing that costs money is still their hand.
 *
 * Where the numbers come from, all of it the game's own:
 *   /api/buildings                  the stations, their type and their name
 *   /buildings/<id>                 "16 Employees", and the station's artwork
 *   /buildings/<id>/hire            where the game's own recruit buttons live
 *   /buildings/<id>/hire_do/1|2|3   recruit for one, two or three days
 *
 * The personnel count is not in /api/buildings, so it is read from each
 * station's own page — once, kept for the page load, and only for the stations
 * actually being shown.
 * -------------------------------------------------------------------------- */

const RR_CACHE = new Map();

/** Buildings that employ people. A dispatch center has none to hire. */
const RR_NO_STAFF = new Set([1]);

/**
 * What a station's page says about it.
 *
 * `Personnel:` is a `<dt>` and the count is the `<dd>` after it — "16
 * Employees" — so the number is taken from the pair rather than from a position
 * in the list, which moves as the game adds rows. The station's artwork is the
 * `img.pull-right` the page heads itself with.
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
        return { staff, art, canHire };
    })().catch((err) => ({ staff: null, art: null, canHire: true, why: err.message }));
    RR_CACHE.set(buildingId, load);
    return load;
}

/** The lengths the game sells for credits, as it words them. */
const RR_DAYS = [
    { days: 1, label: '1 day' },
    { days: 2, label: '2 days' },
    { days: 3, label: '3 days' },
];

YMCA.register({
    id: 'recruitroom',
    title: 'RecruitRoom',
    tagline: 'Hiring, every station at once',

    description: 'Every station that employs people, with its crew count and the game’s own '
        + 'recruit buttons side by side. It does not hire for you — spent credits do not come '
        + 'back, so the button that costs money stays yours to press.',

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
          page. The recruit buttons are the game's own links &mdash; RecruitRoom does not press
          them, because credits spent on people do not come back.</p>
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
            <th class="ymca-num">Crew</th><th>Recruit for</th></tr></thead>
          <tbody>${stations.map((b) => `
            <tr data-station="${b.id}">
              <td class="rr-art"></td>
              <td>${ctx.esc(b.caption || `Building ${b.id}`)}</td>
              <td class="ymca-num rr-staff"><span class="ymca-dim">&hellip;</span></td>
              <td>${RR_DAYS.map((d) => `<a class="ymca-btn" target="_blank" rel="noopener"
                href="/buildings/${b.id}/hire_do/${d.days}">${d.label}</a>`).join(' ')}
                <a class="ymca-btn" target="_blank" rel="noopener"
                  href="/buildings/${b.id}/hire">All options</a></td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${stations.length ? '' : '<p class="ymca-dim">No station in this dispatch center hires.</p>'}
      </div>`;

        el.addEventListener('change', (e) => {
            if (e.target.dataset.cfg !== 'area') return;
            ctx.store.write('cfg', Object.assign(ctx.store.read('cfg', {}), { area: e.target.value }));
            YMCA.modules.find((m) => m.id === 'recruitroom').mount(el, ctx);
        });

        /* One station at a time, so a big alliance of stations does not arrive
         * as fourteen requests at once. Each row fills itself in as it lands. */
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
            const art = row.querySelector('.rr-art');
            if (art && info.art) {
                art.innerHTML = `<img src="${ctx.esc(info.art)}" width="24" height="24" alt=""
                  style="vertical-align:-6px">`;
            }
            await ctx.sleep(80);
        }
        ctx.status(`${stations.length} stations.`);
    },
});
