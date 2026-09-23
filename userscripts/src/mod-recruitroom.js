/* --------------------------------------------------------------------------
 * RecruitDude — every station's hiring, on one screen.
 *
 * Hiring is four clicks per station: open the building, Hire new people, pick a
 * length, confirm. Across fourteen stations that is the whole evening, and it
 * is the same four clicks every time.
 *
 * THIS ONE WRITES, AND WHAT IT WRITES CANNOT BE UNDONE. Credits spent on
 * personnel do not come back. That is the one place YMCA departs from "where
 * there can be no undo, do not write at all", and it is deliberate: the player
 * asked for it after tab-per-station proved worse than the clicking it
 * replaced. What guards it instead is a preview that names every station and
 * what it will cost, and a confirmation that has to be given before anything is
 * sent. Nothing is ever recruited without both.
 *
 * It follows the game's own link — `hire_do` is a plain GET, the same request
 * the button in the page makes — rather than posting a form of its own.
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

/**
 * Recruit at one station, by following the game's own link.
 *
 * `/buildings/<id>/hire_do/<days>` is what the button in the page points at,
 * and it is a plain GET — so this is the same request the game would make,
 * not a form built here.
 */
async function rrHire(buildingId, days) {
    const res = await fetch(`/buildings/${buildingId}/hire_do/${days}`, {
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
}

YMCA.register({
    id: 'recruitroom',
    optional: true,
    defaultOn: true,
    title: 'RecruitDude',
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
          page. Recruiting spends credits and cannot be undone, so it says what it is about
          to do and waits to be told yes.</p>
        ${centres.length ? `<label class="ymca-dim">Dispatch center
          <select data-cfg="area" style="margin-left:6px">
            <option value="">Everything you own</option>
            ${centres.map((c) => `<option value="${c.id}"${String(c.id) === area ? ' selected' : ''}
              >${ctx.esc(c.caption || `Center ${c.id}`)}</option>`).join('')}
          </select></label>` : ''}
      </div>

      <div class="ymca-card">
        <table id="rr-table" style="margin-top:4px">
          <thead><tr><th style="width:1%"><input type="checkbox" id="rr-all"
              title="all of them"></th><th style="width:1%"></th><th>Station</th>
            <th class="ymca-num">Crew</th><th></th></tr></thead>
          <tbody>${stations.map((b) => `
            <tr data-station="${b.id}">
              <td><input type="checkbox" class="rr-pick" value="${b.id}"></td>
              <td class="rr-art"></td>
              <td><a href="/buildings/${b.id}" target="_blank" rel="noopener"
                >${ctx.esc(b.caption || `Building ${b.id}`)}</a></td>
              <td class="ymca-num rr-staff"><span class="ymca-dim">&hellip;</span></td>
              <td class="rr-said"></td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${stations.length ? '' : '<p class="ymca-dim">No station in this dispatch center hires.</p>'}
      </div>

      ${stations.length ? `
      <div class="ymca-card">
        <b>Recruit at the ticked stations</b>
        <p class="ymca-sub" style="margin:4px 0 10px">It says what it is about to do and waits to
          be told yes. <b>Credits spent on people do not come back</b>, so there is no undo
          afterwards &mdash; the preview is the only check there is.</p>
        ${RR_DAYS.map((d) => `<button class="ymca-btn primary" data-hire="${d.days}"
          >Recruit ${d.label}</button>`).join(' ')}
        <span class="ymca-status" id="rr-status"></span>
      </div>` : ''}`;

        el.addEventListener('change', (e) => {
            if (e.target.id === 'rr-all') {
                for (const box of el.querySelectorAll('.rr-pick')) box.checked = e.target.checked;
                return;
            }
            if (e.target.dataset.cfg !== 'area') return;
            ctx.store.write('cfg', Object.assign(ctx.store.read('cfg', {}), { area: e.target.value }));
            YMCA.modules.find((m) => m.id === 'recruitroom').mount(el, ctx);
        });

        const say = (text) => {
            const at = el.querySelector('#rr-status');
            if (at) at.textContent = text;
            ctx.status(text);
        };

        el.addEventListener('click', async (e) => {
            const go = e.target.closest('[data-hire]');
            if (!go) return;
            const days = Number(go.dataset.hire);
            const picked = [...el.querySelectorAll('.rr-pick:checked')].map((b) => b.value);
            if (!picked.length) { say('Tick the stations first.'); return; }

            /* The preview is the whole safeguard: what it will do, where, and
             * that it cannot be taken back. Nothing is sent before the yes. */
            const named = picked.map((id) => {
                const b = stations.find((x) => String(x.id) === String(id));
                return `· ${b?.caption || `Building ${id}`}`;
            }).join('\n');
            const ok = confirm(`Recruit one person for ${days} day${days > 1 ? 's' : ''} at `
                + `${picked.length} station${picked.length > 1 ? 's' : ''}:\n\n${named}\n\n`
                + 'This spends credits and cannot be undone.');
            if (!ok) return;

            for (const box of el.querySelectorAll('[data-hire]')) box.disabled = true;
            let done = 0;
            let failed = 0;
            for (const id of picked) {
                const row = el.querySelector(`tr[data-station="${id}"] .rr-said`);
                /* eslint-disable no-await-in-loop */
                try {
                    await rrHire(id, days);
                    done += 1;
                    if (row) row.innerHTML = '<span class="ymca-accent">recruited</span>';
                } catch (err) {
                    failed += 1;
                    if (row) row.innerHTML = `<span class="ymca-bad">${ctx.esc(err.message)}</span>`;
                    ctx.log.warn('recruit failed', `${id}: ${err.message}`);
                }
                say(`${done} of ${picked.length}…`);
                // The crew count this browser holds is a page old now.
                RR_CACHE.delete(Number(id));
                RR_CACHE.delete(id);
                await ctx.sleep(250);
            }
            ctx.log.info('recruited', `${done} stations, ${days} day(s), ${failed} failed`);
            say(`Recruited at ${done}${failed ? `, ${failed} failed` : ''}. Reading the counts again…`);
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
