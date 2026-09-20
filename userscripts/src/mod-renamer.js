/* --------------------------------------------------------------------------
 * Renamer — bulk-rename vehicles and stations from a pattern.
 *
 * It never posts a hand-built request. For each object it fetches that object's
 * own edit page, takes the real form out of the response and builds a FormData
 * from it, so the CSRF token and every other setting travel along untouched;
 * only the name field is replaced. The request pattern and the field limits
 * come from jxn_30's LSS-Scripts (MIT), which supports the same domains.
 * -------------------------------------------------------------------------- */

const KINDS = {
    vehicle: { path: (id) => `/vehicles/${id}/edit`, field: 'vehicle[caption]', max: 150, noun: 'vehicle' },
    building: { path: (id) => `/buildings/${id}/edit`, field: 'building[name]', max: 40, noun: 'station' },
};
const WRITE_DELAY_MS = 350;
const BACKUP_KEEP = 10;

/**
 * The names the repo ships with, from data/vehicle-types.json.
 *
 * Everything the game sells is read from its own buy pages by
 * Diagnostics -> Vehicle types and kept in one store both this and
 * MissionMagician read, so a type added by a game update names itself the first
 * time that button is pressed rather than waiting to be typed in here.
 */
const BUILTIN_VEHICLE_TYPES = Object.fromEntries(
    Object.entries(__VEHICLE_TYPES__).map(([id, t]) => [id, t.name]));

/** id -> name, learnt from the game and shared across modules. */
const LEARNT_TYPES_KEY = 'ymca-vehicle-types';

function learntVehicleName(id) {
    try {
        const all = JSON.parse(localStorage.getItem(LEARNT_TYPES_KEY)) || {};
        const one = all[String(id)];
        return (one && one.name) || null;
    } catch (e) {
        return null;
    }
}

/**
 * Station type names, confirmed against the game rather than inferred: each
 * building reports generates_mission_categories, and these line up with what
 * they generate. Small and full stations share a type and differ by a flag.
 */
const BUILTIN_STATION_TYPES = {
    0: 'Fire Station', 1: 'Dispatch Center', 3: 'Ambulance Station',
    4: 'Fire Academy', 5: 'Police Station', 29: 'Prison',
};

/**
 * Counters are written {n}, and grow by prefix and start value:
 *   {n} {nn} {nnn}  the default counter, padded to as many digits as n's
 *   {typenn}        counts within the type, across stations
 *   {dcnn}          counts within the dispatch center
 *   {x12nn}         the default counter, starting at 12 instead of 1
 *   {typex12nn}     per type, starting at 12
 * The pattern needs at least one "n" before the brace, so {type} and {typeid}
 * can never be mistaken for a counter.
 */
const COUNTER_RE = /\{(type|dc)?(?:x(\d+))?(n+)\}/g;

function expandPattern(pattern, indexes, tokens, max) {
    const withCounters = pattern.replace(COUNTER_RE, (_m, scope, start, ns) => {
        const base = indexes[scope || 'default'] ?? 0;
        const from = start === undefined ? 1 : Number(start);
        return String(base + from).padStart(ns.length, '0');
    });
    let out = withCounters;
    for (const [key, value] of Object.entries(tokens)) {
        out = out.split('{' + key + '}').join(value ?? '');
    }
    return out.slice(0, max).trim();
}

/** Position of each row within each counter scope, in listed order. */
function assignIndexes(rows, scopeOf) {
    const seen = new Map();
    return rows.map((row) => {
        const indexes = {};
        for (const [scope, key] of Object.entries(scopeOf(row))) {
            const composite = scope + '\u0000' + key;
            const n = seen.get(composite) ?? 0;
            seen.set(composite, n + 1);
            indexes[scope] = n;
        }
        return { row, indexes };
    });
}

const TOKEN_HELP = [
    ['{n} {nn} {nnn}', 'counter, padded to as many digits as you write'],
    ['{x12nn}', 'same counter, starting at 12'],
    ['{typenn}', 'counts per type, across stations'],
    ['{typex12nn}', 'per type, starting at 12'],
    ['{dcnn}', 'counts per dispatch center'],
    ['{type}', 'type name'], ['{typeid}', 'the numeric type id'],
    ['{building}', 'the station it is in'], ['{dc}', 'its dispatch center'],
    ['{id}', 'the object id'], ['{name}', 'the current name'],
];

YMCA.register({
    id: 'renamer',
    title: 'Renamer',
    tagline: 'Vehicles and stations',
    description: 'Rename from a pattern. The preview is mandatory, and every run records the '
        + 'previous names so it can be undone.',

    async mount(el, ctx) {
        el.innerHTML = '<p>Reading the game…</p>';
        let vehicles;
        let buildings;
        try {
            [vehicles, buildings] = await Promise.all([
                ctx.game('/api/vehicles'), ctx.game('/api/buildings'),
            ]);
        } catch (err) {
            el.innerHTML = `<div class="ymca-note bad">Could not read the game:
        ${ctx.esc(err.message)}</div>`;
            return;
        }

        const byId = new Map(buildings.map((b) => [b.id, b]));
        const dcName = (b) => byId.get(b?.leitstelle_building_id)?.caption || '';
        let typeNames = ctx.store.read('vehicleTypes', {});
        let stationNames = ctx.store.read('stationTypes', {});

        const vType = (v) => {
            const id = String(v.vehicle_type ?? '');
            if (v.vehicle_type_caption) return { id, name: v.vehicle_type_caption, named: true, fixed: true };
            if (typeNames[id]) return { id, name: typeNames[id], named: true };
            const fromGame = learntVehicleName(id);
            if (fromGame) return { id, name: fromGame, named: true, fromGame: true };
            if (BUILTIN_VEHICLE_TYPES[id]) return { id, name: BUILTIN_VEHICLE_TYPES[id], named: true, builtin: true };
            return { id, name: `Type ${id}`, named: false };
        };
        const bType = (b) => {
            const id = String(b.building_type ?? '');
            if (stationNames[id]) return { id, name: stationNames[id], named: true };
            if (BUILTIN_STATION_TYPES[id]) return { id, name: BUILTIN_STATION_TYPES[id], named: true, builtin: true };
            return { id, name: `Type ${id}`, named: false };
        };

        let tab = 'vehicle';
        let planned = [];
        let plannedKind = 'vehicle';

        el.innerHTML = `
      <div class="ymca-card">
        <button class="ymca-btn primary" data-tab="vehicle">Vehicles</button>
        <button class="ymca-btn" data-tab="building">Stations</button>
        <span class="ymca-status" id="rn-status"></span>
      </div>
      <div class="ymca-card">
        <div class="ymca-row">
          <div style="flex:1;min-width:220px"><b>Dispatch center</b><br>
            <select id="rn-dc" style="width:70%"></select>
            <button class="ymca-btn" data-do="stamp">Select its stations</button></div>
          <div style="flex:1;min-width:200px"><b>Types</b> <span id="rn-tc"></span>
            <div class="ymca-pick" id="rn-types"></div></div>
        </div>
        <div style="margin-top:10px"><b>Stations</b> <span id="rn-sc"></span>
          <button class="ymca-btn" data-do="all">all</button>
          <button class="ymca-btn" data-do="none">none</button>
          <div class="ymca-pick" id="rn-stations"></div></div>
      </div>
      <div class="ymca-card">
        <b>Type names</b>
        <p class="ymca-sub" style="margin:4px 0 8px">The game sends only a number for standard
          types, so the names live here. Remembered in this browser.</p>
        <div id="rn-typenames"></div>
      </div>
      <div class="ymca-card">
        <b>Pattern</b>
        <input id="rn-pattern" style="width:100%;margin:6px 0" value="{building} {type} {nn}">
        <p class="ymca-sub" style="margin:0 0 10px">${TOKEN_HELP.map(([t, d]) =>
        `<code>${ctx.esc(t)}</code> ${ctx.esc(d)}`).join(' &middot; ')}</p>
        <button class="ymca-btn" data-do="preview">Preview</button>
        <button class="ymca-btn danger" data-do="apply" disabled>Apply</button>
      </div>
      <div id="rn-restore"></div>
      <div id="rn-preview"></div>`;

        const $ = (id) => el.querySelector('#' + id);
        const checked = (id) => [...$(id).querySelectorAll('input:checked')].map((i) => i.value);
        const setStatus = (t) => { $('rn-status').textContent = t; };

        const withVehicles = [...new Set(vehicles.map((v) => v.building_id))]
            .map((id) => byId.get(id)).filter(Boolean);
        const dcs = buildings.filter((b) => buildings.some((x) => x.leitstelle_building_id === b.id));
        $('rn-dc').innerHTML = '<option value="">— pick one —</option>'
            + dcs.map((d) => `<option value="${d.id}">${ctx.esc(d.caption)}</option>`).join('');

        function typeRows() {
            return tab === 'building'
                ? [...new Set(buildings.map((b) => bType(b).id))].sort((a, b) => a - b)
                    .map((id) => ({ id, info: bType(buildings.find((b) => bType(b).id === id)),
                        n: buildings.filter((b) => bType(b).id === id).length }))
                : [...new Set(vehicles.map((v) => vType(v).id))].sort((a, b) => a - b)
                    .map((id) => ({ id, info: vType(vehicles.find((v) => vType(v).id === id)),
                        n: vehicles.filter((v) => vType(v).id === id).length }));
        }

        function renderPickers() {
            const stations = tab === 'building' ? buildings : withVehicles;
            $('rn-stations').innerHTML = stations
                .slice().sort((a, b) => a.caption.localeCompare(b.caption))
                .map((b) => `<label><input type="checkbox" value="${b.id}" checked>
          ${ctx.esc(b.caption)}</label>`).join('');
            $('rn-types').innerHTML = typeRows().map((t) =>
                `<label><input type="checkbox" value="${t.id}" checked>
          ${ctx.esc(t.info.name)} (${t.n})</label>`).join('');
            $('rn-typenames').innerHTML = `<table><thead><tr><th>Id</th><th>Count</th><th>Name</th>
        </tr></thead><tbody>${typeRows().map((t) => `<tr data-type="${t.id}">
          <td>${t.id}</td><td>${t.n}</td>
          <td>${t.info.fixed ? `${ctx.esc(t.info.name)} <small>(custom)</small>`
        : `<input data-do="typename" style="width:100%" value="${ctx.esc(
            (tab === 'building' ? stationNames : typeNames)[t.id] || '')}"
             placeholder="${ctx.esc(t.info.builtin ? t.info.name : 'Type ' + t.id)}">
           ${t.info.builtin ? '<small>built in</small>' : ''}`}</td></tr>`).join('')}</tbody></table>`;
            counts();
        }
        function counts() {
            $('rn-sc').textContent = `(${checked('rn-stations').length})`;
            $('rn-tc').textContent = `(${checked('rn-types').length})`;
        }

        function needsRows() {
            const st = new Set(checked('rn-stations').map(Number));
            const ty = new Set(checked('rn-types'));
            return tab === 'building'
                ? buildings.filter((b) => st.has(b.id) && ty.has(bType(b).id))
                    .sort((a, b) => a.caption.localeCompare(b.caption))
                : vehicles.filter((v) => st.has(v.building_id) && ty.has(vType(v).id));
        }

        function buildPlan(pattern) {
            const kind = tab;
            const max = KINDS[kind].max;
            const rows = needsRows();
            const scopeOf = kind === 'building'
                ? (b) => ({ default: 'all', type: bType(b).id, dc: String(b.leitstelle_building_id || '') })
                : (v) => ({ default: String(v.building_id), type: vType(v).id,
                    dc: String(byId.get(v.building_id)?.leitstelle_building_id || '') });
            const plan = assignIndexes(rows, scopeOf).map(({ row, indexes }) => {
                const tokens = kind === 'building'
                    ? { type: bType(row).name, typeid: String(row.building_type ?? ''),
                        building: row.caption, dc: dcName(row), id: String(row.id), name: row.caption }
                    : { type: vType(row).name, typeid: String(row.vehicle_type ?? ''),
                        building: byId.get(row.building_id)?.caption || '',
                        dc: dcName(byId.get(row.building_id)), id: String(row.id), name: row.caption };
                return { entity: row, from: row.caption, to: expandPattern(pattern, indexes, tokens, max) };
            });
            return { kind, considered: rows.length, plan };
        }

        function showPlan(considered, verb) {
            const apply = el.querySelector('[data-do="apply"]');
            apply.disabled = planned.length === 0;
            apply.textContent = planned.length ? `${verb} ${planned.length}` : verb;
            setStatus(planned.length ? `${planned.length} of ${considered} would change.`
                : `Nothing would change in those ${considered}.`);
            $('rn-preview').innerHTML = planned.length
                ? `<div class="ymca-card"><table><thead><tr><th>Now</th><th>Becomes</th></tr></thead>
           <tbody>${planned.slice(0, 200).map((r) =>
        `<tr><td>${ctx.esc(r.from)}</td><td><b>${ctx.esc(r.to)}</b></td></tr>`).join('')}</tbody>
           </table>${planned.length > 200
        ? `<p class="ymca-sub">…and ${planned.length - 200} more.</p>` : ''}</div>` : '';
        }

        function renderRestore() {
            const backups = ctx.store.read('backups', []);
            if (!backups.length) { $('rn-restore').innerHTML = ''; return; }
            const newest = backups[0];
            const noun = KINDS[newest.kind]?.noun || 'vehicle';
            $('rn-restore').innerHTML = `<div class="ymca-note">Last rename:
        <b>${new Date(newest.at).toLocaleString()}</b>, ${newest.entries.length} ${noun}${
    newest.entries.length === 1 ? '' : 's'}.
        <button class="ymca-btn" data-do="undo">Preview undo</button>
        <button class="ymca-btn" data-do="copybackup">Copy backup</button></div>`;
        }

        async function renameOne(kind, id, name) {
            const spec = KINDS[kind];
            const res = await fetch(spec.path(id), { credentials: 'include' });
            if (!res.ok) throw new Error(`could not open the edit form (${res.status})`);
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            const form = doc.querySelector('form');
            if (!form) throw new Error('no form on the edit page');
            const data = new FormData(form);
            if (!data.has(spec.field)) throw new Error(`no ${spec.field} on that form`);
            data.set(spec.field, name);
            // A document from DOMParser has no base URL, so form.action can be empty.
            const action = form.getAttribute('action') || spec.path(id).replace(/\/edit$/, '');
            const post = await fetch(new URL(action, location.origin).toString(), {
                method: (form.getAttribute('method') || 'POST').toUpperCase(),
                body: data, credentials: 'include',
            });
            if (!post.ok) throw new Error(`saving answered ${post.status}`);
        }

        el.addEventListener('change', (e) => {
            if (e.target.closest('.ymca-pick')) counts();
            if (e.target.dataset.do === 'typename') {
                const id = e.target.closest('tr').dataset.type;
                const store = tab === 'building' ? stationNames : typeNames;
                const v = e.target.value.trim();
                if (v) store[id] = v; else delete store[id];
                ctx.store.write(tab === 'building' ? 'stationTypes' : 'vehicleTypes', store);
                renderPickers();
            }
        });

        el.addEventListener('click', async (e) => {
            const tabBtn = e.target.closest('[data-tab]');
            if (tabBtn) {
                tab = tabBtn.dataset.tab;
                for (const b of el.querySelectorAll('[data-tab]')) {
                    b.classList.toggle('primary', b.dataset.tab === tab);
                }
                planned = [];
                $('rn-preview').innerHTML = '';
                el.querySelector('[data-do="apply"]').disabled = true;
                if (tab === 'building' && $('rn-pattern').value === '{building} {type} {nn}') {
                    $('rn-pattern').value = '{dc} {type} {nn}';
                }
                renderPickers();
                return;
            }
            const btn = e.target.closest('[data-do]');
            if (!btn) return;
            const what = btn.dataset.do;

            if (what === 'all' || what === 'none') {
                $('rn-stations').querySelectorAll('input')
                    .forEach((i) => { i.checked = what === 'all'; });
                counts();
            } else if (what === 'stamp') {
                const dcId = Number($('rn-dc').value);
                if (!dcId) { setStatus('Pick a dispatch center first.'); return; }
                let hit = 0;
                $('rn-stations').querySelectorAll('input').forEach((i) => {
                    const b = byId.get(Number(i.value));
                    const belongs = b && (b.leitstelle_building_id === dcId || b.id === dcId);
                    i.checked = !!belongs;
                    if (belongs) hit++;
                });
                counts();
                setStatus(`Selected ${hit} station${hit === 1 ? '' : 's'} of that dispatch center.`);
            } else if (what === 'preview') {
                const pattern = $('rn-pattern').value;
                const { kind, considered, plan } = buildPlan(pattern);
                plannedKind = kind;
                planned = plan.filter((r) => r.to && r.to !== r.from);
                showPlan(considered, 'Apply');
                const warn = [];
                if (/\{type\}/.test(pattern) && planned.some((r) =>
                    !(kind === 'building' ? bType(r.entity) : vType(r.entity)).named)) {
                    warn.push('Some use a type with no name yet, so they would be called '
                        + '<b>Type &lt;number&gt;</b>. Name them above first.');
                }
                if (/\{dc\}/.test(pattern) && planned.some((r) =>
                    !dcName(kind === 'building' ? r.entity : byId.get(r.entity.building_id)))) {
                    warn.push('Some are in no dispatch center, so <b>{dc}</b> would be empty.');
                }
                const dup = new Map();
                for (const r of planned) dup.set(r.to, (dup.get(r.to) || 0) + 1);
                const clashes = [...dup.values()].filter((n) => n > 1).length;
                if (clashes) {
                    warn.push(`This gives <b>${clashes}</b> name${clashes === 1 ? '' : 's'} to more
            than one of them. Add a counter to tell them apart.`);
                }
                if (warn.length) {
                    $('rn-preview').insertAdjacentHTML('afterbegin',
                        `<div class="ymca-note warn">${warn.join('<br>')}</div>`);
                }
            } else if (what === 'undo') {
                const newest = ctx.store.read('backups', [])[0];
                if (!newest) return;
                plannedKind = newest.kind;
                const pool = newest.kind === 'building' ? byId : new Map(vehicles.map((v) => [v.id, v]));
                planned = newest.entries
                    .map((en) => ({ entity: pool.get(en.id), from: pool.get(en.id)?.caption, to: en.from }))
                    .filter((r) => r.entity && r.to && r.to !== r.from);
                showPlan(newest.entries.length, 'Undo');
            } else if (what === 'copybackup') {
                ctx.clipboard(JSON.stringify(ctx.store.read('backups', [])[0], null, 1), 'the backup');
            } else if (what === 'apply') {
                if (!planned.length) return;
                const noun = KINDS[plannedKind].noun + 's';
                if (!confirm(`Rename ${planned.length} ${noun}?\n\nThis writes to your account. `
                    + 'The old names are saved in this browser so you can undo it, but check the '
                    + 'preview first.')) return;
                const backups = ctx.store.read('backups', []);
                const record = { at: new Date().toISOString(), kind: plannedKind,
                    entries: planned.map((r) => ({ id: r.entity.id, from: r.from, to: r.to })) };
                ctx.store.write('backups', [record, ...backups].slice(0, BACKUP_KEEP));
                const saved = ctx.store.read('backups', [])[0]?.at === record.at;

                btn.disabled = true;
                let done = 0;
                const failed = [];
                for (const { entity, to } of planned) {
                    setStatus(`Renaming ${done + 1} of ${planned.length}…`);
                    try {
                        await renameOne(plannedKind, entity.id, to);
                        done++;
                    } catch (err) {
                        failed.push(`${entity.caption}: ${err.message}`);
                        ctx.log.error('rename failed', `${entity.id}: ${err.message}`);
                    }
                    await ctx.sleep(WRITE_DELAY_MS);
                }
                setStatus(`Renamed ${done}.${failed.length ? ` ${failed.length} failed.` : ''}`
                    + (saved ? ' Reopen to undo.' : ' NO UNDO was saved for this run.'));
                if (failed.length) {
                    $('rn-preview').insertAdjacentHTML('afterbegin',
                        `<div class="ymca-note bad"><b>Failed:</b><br>${
                            failed.slice(0, 20).map(ctx.esc).join('<br>')}</div>`);
                }
                renderRestore();
            }
        });

        renderPickers();
        renderRestore();
    },
});
