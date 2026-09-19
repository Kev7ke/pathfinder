/* --------------------------------------------------------------------------
 * Pathfinder — the cheapest way to raise the highest-paying mission you can
 * spawn, on the department you actually want to play.
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
    id: 'pathfinder',
    title: 'Pathfinder',
    tagline: 'What to build next',
    description: 'Reads your stations and the mission list straight from the game. '
        + 'Costs are absolute, from where you are now — never add the rungs together.',

    async mount(el, ctx) {
        el.innerHTML = '<p>Reading the game…</p>';
        let missions;
        let owned;
        try {
            const [raw, buildings] = await Promise.all([
                ctx.game('/einsaetze.json'),
                ctx.game('/api/buildings'),
            ]);
            missions = PF.parseMissions(PF.buildDataset(raw));
            owned = PF.stateFromBuildings(buildings);
        } catch (err) {
            el.innerHTML = `<div class="ymca-note bad">Could not read the game: ${ctx.esc(err.message)}.
        <br>Diagnostics → Which endpoints answer will say which part is missing.</div>`;
            return;
        }

        const prices = PF.PRICES;
        const extDept = PF.extensionDepartments(missions);
        const saved = ctx.store.read('ui', { path: 'F', small: true });
        let path = saved.path;
        let useSmall = saved.small !== false;

        el.innerHTML = `
      <div class="ymca-card">
        <div class="ymca-row">
          <div><b>Path</b><br>
            <span id="pf-paths">${PATHS.map(([id, label]) =>
        `<button class="ymca-btn" data-path="${id}">${label}</button>`).join(' ')}</span></div>
          <div><b>Price growth with</b><br>
            <button class="ymca-btn" data-size="small">Small stations</button>
            <button class="ymca-btn" data-size="full">Full stations</button></div>
        </div>
        <div id="pf-state" style="margin-top:12px"></div>
      </div>
      <div class="ymca-card"><b>Buy this next</b><div id="pf-next"></div></div>
      <div class="ymca-card"><b>Your milestones</b><div id="pf-spine"></div></div>
      <div class="ymca-card"><b>Every rung</b><div id="pf-ladder"></div></div>
      <div class="ymca-note">This ranks how cheaply you unlock better missions. It is not an
        income forecast: spawn timing, vehicle tie-up and staffing are not in the data.
        Two things beat any build order here — an alliance mission pays every participant in
        full, and a mission only completes when every vehicle arrives with trained personnel.</div>`;

        const $ = (id) => el.querySelector('#' + id);

        const paint = () => {
            for (const b of el.querySelectorAll('[data-path]')) {
                b.classList.toggle('primary', b.dataset.path === path);
            }
            for (const b of el.querySelectorAll('[data-size]')) {
                b.classList.toggle('primary', (b.dataset.size === 'small') === useSmall);
            }

            const opts = { useSmall, extensionDepartments: extDept };
            const rungs = PF.annotate(PF.ladder(missions, path, owned.state, prices, opts), path);
            const spine = PF.milestones(rungs);
            const top = PF.ceiling(missions, path, owned.state);
            const target = spine[0] || rungs[0];
            const queue = target
                ? PF.nextPurchases(target, owned.state, missions, prices, opts) : [];

            const pend = Object.entries(owned.pending);
            $('pf-state').innerHTML = `
        <b>${owned.state.fire}</b> fire &middot; <b>${owned.state.ems}</b> ambulance &middot;
        <b>${owned.state.police}</b> police stations
        ${Object.keys(owned.state.ext).length
        ? ' &middot; ' + Object.entries(owned.state.ext)
            .map(([k, n]) => `${ctx.esc(k)} ×${n}`).join(', ') : ''}
        <br><span style="color:#5a6673">Your ceiling now:
          <b>${top ? ctx.fmt(top.credits) : '—'}</b>
          ${top ? ctx.esc(top.name) : 'nothing on this path yet'}</span>
        ${pend.length ? `<div class="ymca-note warn" style="margin-top:8px">Still being built,
          so not counted yet: ${pend.map(([k, n]) => `${ctx.esc(k)} ×${n}`).join(', ')}</div>` : ''}`;

            const first = queue[0];
            $('pf-next').innerHTML = first
                ? `<div style="font-size:21px;font-weight:700;margin:6px 0 2px">${ctx.esc(first.label)}</div>
           <div style="color:#5a6673">${first.price == null ? 'no price known' : ctx.fmt(first.price)}
           ${first.unlocks ? ` &middot; unlocks ${first.unlocks} mission${first.unlocks === 1 ? '' : 's'}` : ''}
           &middot; toward ${ctx.esc(target.mission.name)} (${ctx.fmt(target.mission.credits)})</div>`
                : '<p>Nothing left to unlock on this path.</p>';

            $('pf-spine').innerHTML = spine.length ? spine.map((r, i) => `
        <div style="display:flex;gap:12px;padding:9px 0;border-bottom:1px solid #e6eaf0">
          <b style="color:#2f4490">${i + 1}</b>
          <div style="flex:1"><b>${ctx.esc(r.mission.name)}</b>
            ${r.isDetour ? ' <span style="color:#a94d17">detour</span>' : ''}
            <div style="color:#5a6673;font-size:12.5px">${ctx.esc(PF.needsText(r))}</div>
            ${r.unverified.length ? `<div style="color:#a94d17;font-size:12px">Depends on unconfirmed
              prices: ${ctx.esc([...new Set(r.unverified.map((u) => u.name))].join(', '))}</div>` : ''}
          </div>
          <div style="text-align:right"><b>${ctx.fmt(r.mission.credits)}</b>
            <div style="color:#5a6673;font-size:12px">${r.costIsLowerBound ? '≥ ' : ''}${ctx.fmt(r.cost)}</div>
          </div>
        </div>`).join('') : '<p>—</p>';

            $('pf-ladder').innerHTML = `<table><thead><tr>
        <th>Cost</th><th>Credits</th><th>Gain/100k</th><th>On path</th><th>Mission</th><th>Needs</th>
        </tr></thead><tbody>${rungs.map((r) => `<tr>
          <td>${r.costIsLowerBound ? '≥ ' : ''}${ctx.fmt(r.cost)}</td>
          <td>${ctx.fmt(r.mission.credits)}</td>
          <td>${Number.isFinite(r.gainPer100k) ? ctx.fmt(Math.round(r.gainPer100k)) : '—'}</td>
          <td>${Math.round(r.ownShare * 100)}%</td>
          <td>${ctx.esc(r.mission.name)}${r.isTrap ? ' <span style="color:#8c6104">trap</span>' : ''}</td>
          <td>${ctx.esc(PF.needsText(r))}</td></tr>`).join('')}</tbody></table>`;

            ctx.store.write('ui', { path, small: useSmall });
        };

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
