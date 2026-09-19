/* --------------------------------------------------------------------------
 * StepOps — the cheapest way to raise the highest-paying mission you can
 * spawn, on the department you actually want to play. One step at a time.
 *
 * Inside the game it reads the mission list live from /einsaetze.json and your
 * stations from /api/buildings, so it is never working from a snapshot. The
 * algorithm is the same tested module the static app uses; the build inlines
 * it rather than keeping a second copy.
 * -------------------------------------------------------------------------- */

const PATHS = [
    ['F', 'Fire'],
    ['P', 'Police'],
    ['E', 'Ambulance'],
];

YMCA.register({
    id: 'stepops',
    title: 'StepOps',
    tagline: 'What to build next',
    description: 'Reads your stations and the mission list straight from the game. '
        + 'Costs are absolute, from where you are now — never add the rungs together.',

    async mount(el, ctx) {
        el.innerHTML = '<p>Reading the game…</p>';
        let missions;
        let owned;
        let allBuildings = [];
        try {
            const [raw, buildings] = await Promise.all([
                ctx.game('/einsaetze.json'),
                ctx.game('/api/buildings'),
            ]);
            missions = PF.parseMissions(PF.buildDataset(raw));
            allBuildings = buildings;
            owned = PF.stateFromBuildings(buildings);
        } catch (err) {
            el.innerHTML = `<div class="ymca-note bad">Could not read the game: ${ctx.esc(err.message)}.
        <br>Diagnostics → Which endpoints answer will say which part is missing.</div>`;
            return;
        }

        const prices = PF.PRICES;
        const extDept = PF.extensionDepartments(missions);
        const saved = ctx.store.read('ui', { path: 'F', small: true, area: '' });
        let path = saved.path;
        let useSmall = saved.small !== false;
        let area = saved.area || '';

        /**
         * A dispatch center's own area, for players who run one path in one
         * area and another elsewhere. Only the stations that answer to that
         * center are counted.
         *
         * NOTE: the game's "create own dispatch area" setting is not in
         * /api/buildings, so this groups by leitstelle_building_id alone. If a
         * center has that setting off, its stations still show here. Diagnostics
         * -> Copy building fields is the way to find the flag if it exists.
         */
        const centres = allBuildings.filter((b) =>
            allBuildings.some((x) => x.leitstelle_building_id === b.id));

        function ownedFor(areaId) {
            if (!areaId) return owned;
            const inArea = allBuildings.filter((b) =>
                String(b.leitstelle_building_id) === String(areaId));
            return PF.stateFromBuildings(inArea);
        }

        el.innerHTML = `
      <div class="ymca-card">
        <div class="ymca-row">
          <div style="min-width:230px"><b>Dispatch area</b><br>
            <select id="pf-area"></select>
            <div class="ymca-dim" style="font-size:12px;margin-top:3px">
              Counts only the stations of one center.</div></div>
          <div><b>Path</b><br>
            <span id="pf-paths">${PATHS.map(([id, label]) =>
        `<button class="ymca-btn" data-path="${id}">${label}</button>`).join(' ')}</span></div>
          <div><b>Price growth with</b><br>
            <button class="ymca-btn" data-size="small">Small stations</button>
            <button class="ymca-btn" data-size="full">Full stations</button></div>
        </div>
        <div id="pf-state" style="margin-top:12px"></div>
      </div>
      <details class="ymca-card" id="pf-building"><summary style="cursor:pointer">
        <b>Under construction</b> <span class="ymca-dim" id="pf-building-sum"></span></summary>
        <div id="pf-building-list" style="margin-top:10px"></div></details>
      <div class="ymca-card"><b>Buy this next</b><div id="pf-next"></div></div>
      <div class="ymca-card"><b>Your milestones</b><div id="pf-spine"></div></div>
      <div class="ymca-card"><b>Every rung</b><div id="pf-ladder"></div></div>
      <div class="ymca-note">This ranks how cheaply you unlock better missions. It is not an
        income forecast: spawn timing, vehicle tie-up and staffing are not in the data.
        Two things beat any build order here — an alliance mission pays every participant in
        full, and a mission only completes when every vehicle arrives with trained personnel.</div>`;

        const $ = (id) => el.querySelector('#' + id);

        $('pf-area').innerHTML = '<option value="">Everything you own</option>'
            + centres.map((c) => `<option value="${c.id}"${String(c.id) === area ? ' selected' : ''}>`
                + `${ctx.esc(c.caption)}</option>`).join('');

        /* Extensions some mission actually requires. Everything under
         * construction is filtered through this, in the banner as well as in the
         * panel: a prison cell finishing on Tuesday is not build planning, and
         * saying so at the top of the tool was the loudest place to say it. */
        const needed = new Set(missions.flatMap((m) => Object.keys(m.extras)));

        /**
         * What is being built right now, narrowed to what actually matters: an
         * extension only appears here if some mission requires it. A prison
         * cell finishing on Tuesday is not build planning.
         */
        function renderBuilding(current) {
            const now = Date.now();
            const rows = [];
            for (const b of allBuildings) {
                if (area && String(b.leitstelle_building_id) !== area) continue;
                for (const e of b.extensions || []) {
                    if (e.available === true || !e.available_at) continue;
                    const done = new Date(e.available_at).getTime();
                    if (!(done > now)) continue;
                    if (!needed.has(e.caption)) continue;
                    rows.push({ station: b.caption, name: e.caption, done });
                }
            }
            rows.sort((x, y) => x.done - y.done);
            const skipped = allBuildings.reduce((n, b) => n + (b.extensions || []).filter((e) =>
                e.available !== true && e.available_at && new Date(e.available_at) > now
                && !needed.has(e.caption)).length, 0);

            $('pf-building-sum').textContent = rows.length
                ? `\u2014 ${rows.length} that unlock missions`
                : '\u2014 nothing that unlocks a mission';
            $('pf-building-list').innerHTML = (rows.length ? `<table><thead><tr>
          <th>Extension</th><th>Station</th><th>Ready in</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td>${ctx.esc(r.name)}</td>
            <td class="ymca-dim">${ctx.esc(r.station)}</td>
            <td class="ymca-num">${remaining(r.done - now)}</td></tr>`).join('')}</tbody></table>`
                : '<p class="ymca-dim">Nothing under construction that any mission needs.</p>')
              + (skipped ? `<p class="ymca-dim" style="font-size:12px;margin-top:8px">
                ${skipped} other extension${skipped === 1 ? '' : 's'} building, but no mission
                requires ${skipped === 1 ? 'it' : 'them'} \u2014 hidden.</p>` : '');
        }

        function remaining(ms) {
            const mins = Math.max(0, Math.round(ms / 60000));
            const d = Math.floor(mins / 1440);
            const h = Math.floor((mins % 1440) / 60);
            const m = mins % 60;
            if (d) return `${d}d ${h}h`;
            if (h) return `${h}h ${m}m`;
            return `${m}m`;
        }

        const paint = () => {
            for (const b of el.querySelectorAll('[data-path]')) {
                b.classList.toggle('primary', b.dataset.path === path);
            }
            for (const b of el.querySelectorAll('[data-size]')) {
                b.classList.toggle('primary', (b.dataset.size === 'small') === useSmall);
            }

            const opts = { useSmall, extensionDepartments: extDept };
            const view = ownedFor(area);
            const rungs = PF.annotate(PF.ladder(missions, path, view.state, prices, opts), path);
            const spine = PF.milestones(rungs);
            const top = PF.ceiling(missions, path, view.state);
            const target = spine[0] || rungs[0];
            const queue = target
                ? PF.nextPurchases(target, view.state, missions, prices, opts) : [];

            /* Same filter as the panel below: only what unlocks something. */
            const pend = Object.entries(view.pending).filter(([k]) => needed.has(k));
            const pendHidden = Object.keys(view.pending).length - pend.length;
            $('pf-state').innerHTML = `
        <b>${view.state.fire}</b> fire &middot; <b>${view.state.ems}</b> ambulance &middot;
        <b>${view.state.police}</b> police stations
        ${area ? ' <span class="ymca-accent">in this dispatch area only</span>' : ''}
        ${Object.keys(view.state.ext).length
        ? ' &middot; ' + Object.entries(view.state.ext)
            .map(([k, n]) => `${ctx.esc(k)} ×${n}`).join(', ') : ''}
        <br><span class="ymca-dim">Your ceiling now:
          <b>${top ? ctx.fmt(top.credits) : '—'}</b>
          ${top ? ctx.esc(top.name) : 'nothing on this path yet'}</span>
        ${pend.length ? `<div class="ymca-note warn" style="margin-top:8px">Still being built,
          so not counted yet: ${pend.map(([k, n]) => `${ctx.esc(k)} ×${n}`).join(', ')}${
        pendHidden ? `<span class="ymca-dim"> · ${pendHidden} more being built that no mission
          needs</span>` : ''}</div>`
        : (pendHidden ? `<div class="ymca-dim" style="margin-top:8px">${pendHidden} under
          construction, none of which unlocks a mission.</div>` : '')}`;

            const first = queue[0];
            $('pf-next').innerHTML = first
                ? `<div style="font-size:21px;font-weight:700;margin:6px 0 2px">${ctx.esc(first.label)}</div>
           <div class="ymca-dim">${first.price == null ? 'no price known' : ctx.fmt(first.price)}
           ${first.unlocks ? ` &middot; unlocks ${first.unlocks} mission${first.unlocks === 1 ? '' : 's'}` : ''}
           &middot; toward ${ctx.esc(target.mission.name)} (${ctx.fmt(target.mission.credits)})</div>`
                : '<p>Nothing left to unlock on this path.</p>';

            $('pf-spine').innerHTML = spine.length ? spine.map((r, i) => `
        <div style="display:flex;gap:12px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.14)">
          <b class="ymca-accent">${i + 1}</b>
          <div style="flex:1"><b>${ctx.esc(r.mission.name)}</b>
            ${r.isDetour ? ' <span class="ymca-warn">detour</span>' : ''}
            <div class="ymca-dim" style="font-size:12.5px">${ctx.esc(PF.needsText(r))}</div>
            ${r.unverified.length ? `<div class="ymca-warn" style="font-size:12px">Depends on unconfirmed
              prices: ${ctx.esc([...new Set(r.unverified.map((u) => u.name))].join(', '))}</div>` : ''}
          </div>
          <div style="text-align:right"><b>${ctx.fmt(r.mission.credits)}</b>
            <div class="ymca-dim" style="font-size:12px">${r.costIsLowerBound ? '≥ ' : ''}${ctx.fmt(r.cost)}</div>
          </div>
        </div>`).join('') : '<p>—</p>';

            $('pf-ladder').innerHTML = `<table><thead><tr>
        <th>Cost</th><th>Credits</th><th>Gain/100k</th><th>On path</th><th>Mission</th><th>Needs</th>
        </tr></thead><tbody>${rungs.map((r) => `<tr>
          <td>${r.costIsLowerBound ? '≥ ' : ''}${ctx.fmt(r.cost)}</td>
          <td>${ctx.fmt(r.mission.credits)}</td>
          <td>${Number.isFinite(r.gainPer100k) ? ctx.fmt(Math.round(r.gainPer100k)) : '—'}</td>
          <td>${Math.round(r.ownShare * 100)}%</td>
          <td>${ctx.esc(r.mission.name)}${r.isTrap ? ' <span class="ymca-warn">trap</span>' : ''}</td>
          <td>${ctx.esc(PF.needsText(r))}</td></tr>`).join('')}</tbody></table>`;

            renderBuilding();
            ctx.store.write('ui', { path, small: useSmall, area });
        };

        $('pf-area').addEventListener('change', (e) => {
            area = e.target.value;
            paint();
        });
        el.addEventListener('click', (e) => {
            const p = e.target.closest('[data-path]');
            if (p) { path = p.dataset.path; paint(); return; }
            const s = e.target.closest('[data-size]');
            if (s) { useSmall = s.dataset.size === 'small'; paint(); }
        });
        paint();
        ctx.log.info(`ready: ${missions.length} missions, ${owned.counts.buildings} buildings`);
    },
});
