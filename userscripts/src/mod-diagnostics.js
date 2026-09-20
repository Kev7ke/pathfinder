/* --------------------------------------------------------------------------
 * Diagnostics — the channel back to whoever is fixing this.
 *
 * The person running YMCA can see the game; whoever maintains it usually
 * cannot. Every button here produces something copyable or downloadable, so a
 * problem report is a paste rather than a description, and a question about
 * the game can be answered with the game's own data.
 * -------------------------------------------------------------------------- */

/** Everything the game will hand over. Widened deliberately: a 404 is a fact too. */
const ENDPOINTS = [
    { path: '/einsaetze.json', label: 'missions', slim: true },
    { path: '/api/buildings', label: 'buildings' },
    { path: '/api/vehicles', label: 'vehicles' },
    { path: '/api/credits', label: 'credits' },
    { path: '/api/allianceinfo', label: 'alliance' },
    { path: '/api/v1/aaos', label: 'aaos' },
    { path: '/alliance_event_types.json', label: 'allianceEventTypes' },
    { path: '/api/schoolings', label: 'schoolings' },
    { path: '/api/missions', label: 'activeMissions' },
    { path: '/api/transport_requests', label: 'transportRequests' },
    { path: '/api/vehicle_states', label: 'vehicleStates' },
];

/* The type ids data/vehicle-types.json already carries, so the vehicle export
 * can say which of the player's types are new rather than making somebody
 * compare two lists by eye. */
const SHIPPED_VEHICLE_TYPE_IDS = __VEHICLE_TYPE_IDS__;

/** Drop what no planner reads. Icons alone are three paths per mission. */
function slimMissions(data) {
    return (Array.isArray(data) ? data : Object.values(data)).map((m) => ({
        id: m.id,
        name: m.name,
        place: m.place_array ?? (m.place ? [m.place] : []),
        average_credits: m.average_credits,
        requirements: m.requirements,
        prerequisites: m.prerequisites,
        chances: m.chances,
        categories: m.mission_categories,
        base_mission_id: m.base_mission_id,
        filter_id: m.additional?.filter_id,
    }));
}

YMCA.register({
    id: 'diagnostics',
    title: 'Diagnostics',
    tagline: 'Send data back',
    description: 'Every button here copies or downloads something. Use them to report a '
        + 'problem, or to answer a question about the game with the game’s own data.',

    mount(el, ctx) {
        el.innerHTML = `
      <div class="ymca-card">
        <b>Report a problem</b>
        <p class="ymca-sub" style="margin:4px 0 10px">One button, everything that answers a
          question about YMCA: what it did and what failed, which endpoints answered, the game's
          own styling, what TrackOps has measured, and every requirement MissionMagician could not
          match. It carries nothing about your account beyond its station and vehicle counts
          &mdash; no names, no coordinates.</p>
        <button class="ymca-btn primary" data-do="report">Copy the report</button>
        <button class="ymca-btn" data-do="feedback">Send feedback</button>
        <button class="ymca-btn" data-do="clearlog">Clear the log</button>
      </div>

      <div class="ymca-card">
        <b>Hand over game data</b>
        <p class="ymca-sub" style="margin:4px 0 10px"><b>Vehicle types</b> is the one to send when
          a vehicle YMCA does not know turns up: nothing can be counted by a type it cannot name.
          It carries ids, names and what each type can do, and nothing about your account.<br>
          <b>Download everything</b> is for rebuilding the dataset. That one carries your player
          name, your alliance and your building coordinates, so share it only where you are happy
          to.</p>
        <button class="ymca-btn primary" data-do="export-all">Download everything</button>
        <button class="ymca-btn" data-do="vehicles">Vehicle types</button>
        <button class="ymca-btn" data-do="missions">Mission list only</button>
      </div>

      <div class="ymca-card">
        <b>Output</b>
        <p class="ymca-sub" style="margin:4px 0 8px">Whatever a button produced also lands here,
          in case the clipboard is refused.</p>
        <textarea id="ymca-diag-out" rows="14" style="width:100%;font-family:ui-monospace,monospace;
          font-size:11.5px" readonly></textarea>
      </div>`;

        const out = el.querySelector('#ymca-diag-out');
        const put = (obj, what) => {
            const text = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1);
            out.value = text;
            ctx.clipboard(text, what);
        };

        el.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-do]');
            if (!btn) return;
            const what = btn.dataset.do;
            const before = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Working…';
            try {
                await run(what, ctx, put);
            } catch (err) {
                ctx.log.error(`button ${what} failed`, err.stack || err.message);
                put({ button: what, error: err.message }, 'the error');
            }
            btn.disabled = false;
            btn.textContent = before;
        });
    },
});

async function run(what, ctx, put) {
    if (what === 'clearlog') {
        YMCA.logger.clear();
        put('Log cleared.', 'nothing');
        return;
    }

    if (what === 'feedback') {
        const note = prompt('What is wrong, or what would you like YMCA to do?\n\n'
            + 'Your note is packaged with the version, the page and the last log entries, '
            + 'and copied to your clipboard. Nothing is sent anywhere by itself.');
        if (!note) return;
        put({
            feedback: note,
            ymca: YMCA.version,
            at: new Date().toISOString(),
            page: location.origin + location.pathname,
            where: YMCA.lastModule || null,
            log: YMCA.logger.read().slice(-25),
        }, 'your feedback');
        return;
    }

    if (what === 'report') {
        const report = {
            ymca: YMCA.version,
            at: new Date().toISOString(),
            game: location.origin,
            page: location.pathname,
            locale: ctx.locale() || null,
            userAgent: navigator.userAgent,
            manager: typeof GM_info !== 'undefined'
                ? `${GM_info.scriptHandler} ${GM_info.version}` : 'unknown',
            grants: {
                xhr: typeof GM_xmlhttpRequest === 'function',
                menu: typeof GM_registerMenuCommand === 'function',
            },
            modules: YMCA.modules.map((m) => m.id),
            entryPoint: document.getElementById('ymca-nav') ? 'navbar'
                : document.getElementById('ymca-fab') ? 'floating button' : 'none',
            endpoints: {},
            log: YMCA.logger.read().slice(-60),
        };
        /* Every endpoint, not the two it used to be. Which of them answer was a
         * button of its own, and a question only asked when something is wrong
         * is a question that should already be answered when it is. Counts and
         * key names only — never the buildings themselves, which carry
         * coordinates. */
        for (const ep of ENDPOINTS) {
            try {
                const data = await ctx.rawGame(ep.path);
                report.endpoints[ep.path] = Array.isArray(data)
                    ? `ok, ${data.length} entries`
                    : `ok, object with keys: ${Object.keys(data).slice(0, 8).join(', ')}`;
            } catch (err) {
                report.endpoints[ep.path] = `failed: ${err.message}`;
            }
            await ctx.sleep(60);
        }

        /* What the other tools have worked out. Folding these in is the point of
         * one button: the answer to "how is it going" used to be spread across
         * three tools and a paste each. */
        report.trackops = moduleStore('trackops');
        report.missionmagician = moduleStore('missionmagician');
        report.interface = interfaceProbe();

        put(report, 'the report');
        return;
    }

    if (what === 'endpoints') {
        const rows = {};
        for (const ep of ENDPOINTS) {
            try {
                const data = await ctx.rawGame(ep.path);
                rows[ep.path] = Array.isArray(data)
                    ? `ok, ${data.length} entries`
                    : `ok, object with keys: ${Object.keys(data).slice(0, 8).join(', ')}`;
            } catch (err) {
                rows[ep.path] = `failed: ${err.message}`;
            }
            await ctx.sleep(120);
        }
        put(rows, 'the endpoint check');
        return;
    }

    if (what === 'export-all') {
        const outp = {
            fetchedAt: new Date().toISOString(),
            ymca: YMCA.version,
            game: location.origin,
            locale: ctx.locale() || null,
            endpoints: {},
        };
        let ok = 0;
        for (const ep of ENDPOINTS) {
            ctx.status(`Fetching ${ep.path}…`);
            try {
                const data = await ctx.rawGame(ep.path);
                outp.endpoints[ep.label] = {
                    path: ep.path,
                    count: Array.isArray(data) ? data.length : Object.keys(data).length,
                    data: ep.slim ? slimMissions(data) : data,
                };
                ok++;
            } catch (err) {
                outp.endpoints[ep.label] = { path: ep.path, error: err.message };
            }
            await ctx.sleep(120);
        }
        const text = JSON.stringify(outp);
        ctx.download('missionchief-export.json', text);
        ctx.status(`Downloaded missionchief-export.json — ${ok} of ${ENDPOINTS.length} endpoints,`
            + ` ${Math.round(text.length / 1024)} KB`);
        put(Object.fromEntries(Object.entries(outp.endpoints)
            .map(([k, v]) => [k, v.error ? `failed: ${v.error}` : `${v.count} entries`])),
        'the summary');
        return;
    }

    if (what === 'missions') {
        const slim = slimMissions(await ctx.game('/einsaetze.json'));
        const text = JSON.stringify(slim);
        ctx.download('einsaetze-slim.json', text);
        ctx.status(`Downloaded einsaetze-slim.json — ${slim.length} missions,`
            + ` ${Math.round(text.length / 1024)} KB`);
        put(slim.slice(0, 2), 'a sample');
        return;
    }

    if (what === 'buildings') {
        const B = await ctx.game('/api/buildings');
        const byType = new Map();
        for (const b of B) {
            if (!byType.has(b.building_type)) byType.set(b.building_type, []);
            byType.get(b.building_type).push(b);
        }
        put([...byType].sort((a, b) => a[0] - b[0]).map(([type, list]) => ({
            building_type: type,
            stations: list.length,
            generates: [...new Set(list.map((b) => b.generates_mission_categories))],
            small: [...new Set(list.map((b) => !!b.small_building))],
            levels: [...new Set(list.map((b) => b.level))].sort((x, y) => x - y),
            extensions: [...new Set(list.flatMap((b) =>
                (b.extensions || []).map((e) => `${e.type_id}:${e.caption}`)))],
        })), 'the station types');
        return;
    }

    if (what === 'vehicles') {
        put(await vehicleCatalogue(ctx), 'the vehicle types');
        return;
    }

    if (what === 'dispatch') {
        const B = await ctx.game('/api/buildings');
        const centres = B.filter((b) => B.some((x) => x.leitstelle_building_id === b.id));
        put({
            dispatchCenters: centres.map((d) => ({
                name: d.caption,
                stations: B.filter((b) => b.leitstelle_building_id === d.id).map((b) => b.caption),
            })),
            withoutDispatchCenter: B.filter((b) => !b.leitstelle_building_id
                && !centres.some((d) => d.id === b.id)).map((b) => b.caption),
            rule: 'build menu: 1 + 1 per 15 buildings, dispatch centers not counted',
            check: `${B.length} buildings, ${centres.length} of them centers`,
        }, 'the dispatch centers');
    }
}


/**
 * The game’s own chrome, so YMCA can be matched to it rather than guessed at.
 *
 * This is part of the one report now rather than a button of its own. A reading
 * somebody has to remember to ask for is a reading they will not have when they
 * need it, and whoever styles YMCA cannot open the game to take it themselves.
 */
function interfaceProbe() {
        // Whoever styles YMCA cannot open the game, so this has to do the
        // looking. Computed styles give the resting state; the stylesheet scan
        // below is the only way to see hover and active, which nothing renders
        // until a mouse is over it.
        const pick = (sel, props) => {
            const el = document.querySelector(sel);
            if (!el) return 'not on this page';
            const cs = getComputedStyle(el);
            return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
        };
        const box = ['background-color', 'color', 'border-color', 'border-radius',
            'font-family', 'font-size'];

        /** Rules the game itself declares for the selectors that matter. */
        const INTERESTING =
            /(^|[\s,])(\.btn|\.navbar|\.modal|\.panel|\.nav\b|\.alert|\.well|\.table|\.label|\.badge|\.dropdown-menu|body|a)/;
        const rules = [];
        let unreadableSheets = 0;
        for (const sheet of document.styleSheets) {
            let list;
            try {
                list = sheet.cssRules;
            } catch (err) {
                unreadableSheets++;    // cross-origin, and not readable by design
                continue;
            }
            for (const rule of list || []) {
                if (!rule.selectorText || !rule.cssText) continue;
                if (!/:hover|:focus|:active|\.active|\.disabled/.test(rule.selectorText)) continue;
                if (!INTERESTING.test(rule.selectorText)) continue;
                rules.push(rule.cssText.slice(0, 220));
                if (rules.length >= 60) break;
            }
            if (rules.length >= 60) break;
        }

        return {
            note: 'the game\u2019s own chrome, so YMCA can be matched to it rather than guessed at',
            navbarSelectorsPresent: [
                '#navbar-main-collapse > ul', '#navbar-main-collapse ul.navbar-nav',
                '.navbar-fixed-top .navbar-nav', '.navbar-nav', '#navbar-mobile-footer',
            ].filter((sel) => !!document.querySelector(sel)),
            navbarEntryPlaced: !!document.getElementById('ymca-nav'),
            usingFloatingButton: !!document.getElementById('ymca-fab'),
            bootstrapPresent: !!document.querySelector('.navbar, .panel, .btn-default'),
            resting: {
                body: pick('body', box),
                navbar: pick('.navbar', box),
                navbarLink: pick('.navbar-nav a', ['color', 'font-size', 'padding', 'font-weight']),
                navbarActive: pick('.navbar-nav .active a', ['color', 'background-color']),
                modal: pick('.modal-content', box),
                modalHeader: pick('.modal-header', box),
                modalBody: pick('.modal-body', box),
                panel: pick('.panel', box),
                panelHeading: pick('.panel-heading', box),
                panelBody: pick('.panel-body', box),
                well: pick('.well', box),
                alert: pick('.alert', box),
                buttonDefault: pick('.btn-default', box),
                buttonPrimary: pick('.btn-primary', box),
                buttonSuccess: pick('.btn-success', box),
                buttonDanger: pick('.btn-danger', box),
                input: pick('input[type=text], .form-control', box),
                table: pick('table.table', ['background-color', 'font-size', 'color']),
                tableHeader: pick('table.table th', ['background-color', 'color', 'border-color']),
                link: pick('a', ['color', 'text-decoration-line']),
                heading: pick('h1, h2, h3', ['color', 'font-size', 'font-weight', 'font-family']),
            },
            // Everything above is the resting state only. These are the rules
            // that change it on hover, focus and active.
            stateRules: rules,
            unreadableSheets,
            openLightboxes: [...document.querySelectorAll('.modal, .lightbox_content')]
                .map((el) => el.className).slice(0, 5),
            viewport: `${window.innerWidth}x${window.innerHeight}`,
    };
        return;
}

/**
 * What another module has worked out, summarised for the report.
 *
 * Diagnostics deliberately does not import from the other modules: it reads
 * what they stored, which is the same thing they would have to hand over
 * anyway, and it means a module can be removed without breaking the report.
 *
 * Counts and the game's own constants only. No mission instances, no balance,
 * no names.
 */
function moduleStore(moduleId) {
    const read = (key, fallback) => {
        try {
            return JSON.parse(localStorage.getItem(`ymca-${moduleId}-${key}`)) ?? fallback;
        } catch (e) {
            return fallback;
        }
    };

    if (moduleId === 'trackops') {
        const log = read('log', []) || [];
        const byType = new Map();
        for (const e of log) {
            const row = byType.get(e.type) || { type: e.type, runs: 0, measured: 0, total: 0 };
            row.runs += 1;
            if (e.alone && e.delta > 0) { row.measured += 1; row.total += e.delta; }
            byType.set(e.type, row);
        }
        return {
            missionsEnded: log.length,
            since: log.length ? new Date(log[0].at).toISOString().slice(0, 10) : null,
            byMissionType: [...byType.values()]
                .sort((a, b) => b.runs - a.runs)
                .map((r) => ({
                    type: r.type,
                    runs: r.runs,
                    measured: r.measured,
                    averagePaid: r.measured ? Math.round(r.total / r.measured) : null,
                })),
        };
    }

    if (moduleId === 'missionmagician') {
        /* The learnt fleet and, more usefully, every requirement it met and
         * could not match a vehicle attribute to. That list is the next thing
         * to fix, and it should arrive without anyone having to notice it. */
        let types = {};
        try {
            const raw = JSON.parse(localStorage.getItem('ymca-missionmagician-types')) || {};
            types = Object.fromEntries(Object.entries(raw).map(([id, t]) =>
                [id, Array.isArray(t) ? { caps: t, name: null } : t]));
        } catch (e) { /* nothing learnt yet */ }
        return {
            vehicleTypesLearnt: Object.keys(types).length,
            learntTypes: types,
            capabilitiesByType: Object.fromEntries(Object.entries(types)
                .map(([id, t]) => [id, Array.isArray(t) ? t : (t.caps || [])])),
            unmatchedRequirements: read('unmatched', []),
            settings: read('cfg', null),
        };
    }

    return null;
}

/**
 * Every vehicle type the game will sell, by the id it uses for it.
 *
 * Learning names one mission at a time is no way to build a catalogue: it needs
 * somebody to keep playing until a type happens to be in range, and a type
 * added by a game update would stay nameless until it was. The buy page already
 * lists them all — one `.vehicle_type` card per vehicle the building can buy,
 * affordable or not, with the name in its heading and the id in its buy link.
 * That is the whole answer, and it is one page per kind of building.
 *
 * Nothing here is guessed at. The buy page is found by following the building's
 * own link to it, so a game that moves it is followed rather than broken. What
 * could not be reached is named in the result.
 */
async function vehicleCatalogue(ctx) {
    const buildings = await ctx.game('/api/buildings');

    /* One building of each kind: a fire station and an ambulance station sell
     * different vehicles, two fire stations sell the same ones. */
    const perKind = new Map();
    for (const b of buildings) {
        if (!perKind.has(b.building_type)) perKind.set(b.building_type, b.id);
    }

    const types = new Map();
    const reached = [];
    const sellsNothing = [];
    const failed = [];

    for (const [kind, buildingId] of perKind) {
        try {
            const options = await buyableAt(buildingId);
            if (!options.length) { failed.push({ buildingType: kind, why: 'no vehicle list on that page' }); continue; }
            reached.push({ buildingType: kind, offers: options.length });
            for (const offer of options) {
                const row = types.get(offer.id) || { id: offer.id, soldBy: [] };
                for (const k of ['name', 'longName', 'category', 'requiredExtension']) {
                    if (!row[k] && offer[k]) row[k] = offer[k];
                }
                if (!row.soldBy.includes(kind)) row.soldBy.push(kind);
                types.set(offer.id, row);
            }
        } catch (err) {
            (err.sellsNothing ? sellsNothing : failed).push({ buildingType: kind, why: err.message });
        }
        await ctx.sleep(120);
    }

    // What the account actually owns, and what a mission window has taught.
    const vehicles = await ctx.game('/api/vehicles');
    const owned = new Map();
    for (const v of vehicles) {
        const t = Number(v.vehicle_type);
        if (Number.isFinite(t)) owned.set(t, (owned.get(t) || 0) + 1);
    }
    const learnt = moduleStore('missionmagician')?.learntTypes || {};
    for (const id of [...owned.keys(), ...Object.keys(learnt).map(Number)]) {
        if (!types.has(id)) types.set(id, { id, name: learnt[String(id)]?.name || null, soldBy: [] });
    }

    const rows = [...types.values()].sort((a, b) => a.id - b.id).map((r) => ({
        id: r.id,
        name: r.name || learnt[String(r.id)]?.name || null,
        capabilities: learnt[String(r.id)]?.caps || null,
        longName: r.longName || undefined,
        category: r.category || undefined,
        requiredExtension: r.requiredExtension || undefined,
        soldByBuildingTypes: r.soldBy,
        youOwn: owned.get(r.id) || 0,
        inDataset: SHIPPED_VEHICLE_TYPE_IDS.includes(String(r.id)),
    }));

    /* Written where every module reads it, so a name learnt once is a name the
     * Renamer and MissionMagician both have from then on. */
    try {
        const store = {};
        for (const r of rows) {
            if (r.name || r.capabilities) store[r.id] = { name: r.name, caps: r.capabilities };
        }
        localStorage.setItem('ymca-vehicle-types', JSON.stringify(store));
    } catch (e) { /* private window: the copy below still carries it */ }

    return {
        note: 'vehicle type ids and their names, read from the game’s own buy pages. '
            + 'Nothing about the account beyond how many of each it owns.',
        ymca: YMCA.version,
        types: rows,
        missingFromDataset: rows.filter((r) => !r.inDataset).map((r) => r.id),
        stillUnnamed: rows.filter((r) => !r.name).map((r) => r.id),
        buyPagesRead: reached,
        buildingsThatSellNothing: sellsNothing,
        buyPagesFailed: failed,
    };
}

/**
 * The vehicles a building will sell you, from its own buy page.
 *
 * The page is not a form. Each vehicle is a `.vehicle_type` card with its name
 * in an `<h3>`, and the id is in the buy link:
 *
 *     /buildings/5681502/vehicle/5681502/13/credits?…   ->  13 is the Quint
 *
 * Every tab of that page — firetrucks, ambulances, trailers, containers — is in
 * the markup already, hidden rather than fetched on demand, so one page has all
 * of them. Vehicles the account cannot afford or has not unlocked are listed
 * too, with the buttons disabled, which is exactly what makes this a catalogue
 * rather than an inventory.
 */
async function buyableAt(buildingId) {
    const get = async (url) => {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status} on ${url.replace(/\d+/g, '#')}`);
        return new DOMParser().parseFromString(await res.text(), 'text/html');
    };

    /* The building's own link to its buy page first, so a game that moves the
     * page is followed; the usual address only as a fallback. */
    let doc = null;
    let tried = [];
    try {
        const page = await get(`/buildings/${buildingId}`);
        const link = page.querySelector('a[href*="vehicles/new"], a[href*="/vehicle/new"]');
        if (link) {
            const href = new URL(link.getAttribute('href'), location.origin);
            tried.push(href.pathname);
            doc = await get(href.pathname + href.search);
        }
    } catch (err) {
        tried.push(`building page: ${err.message}`);
    }
    if (!doc || !doc.querySelector('.vehicle_type')) {
        for (const path of [`/buildings/${buildingId}/vehicles/new`, `/buildings/${buildingId}/vehicle/new`]) {
            try {
                tried.push(path.replace(/\d+/g, '#'));
                const candidate = await get(path);
                if (candidate.querySelector('.vehicle_type')) { doc = candidate; break; }
            } catch (err) { /* try the next */ }
        }
    }
    /* A dispatch center, a fire academy and a prison have no buy page at all.
     * That is the building, not a breakage, so say which it was: a real failure
     * reading a station that does sell vehicles has to stay visible. */
    if (!doc) {
        const err = new Error(`no buy page (tried ${tried.join(', ')})`);
        err.sellsNothing = true;
        throw err;
    }

    /* Which tab a card sits in is the game's own grouping — firetrucks,
     * ambulances, containers — and worth keeping. */
    const tabName = new Map();
    for (const tab of doc.querySelectorAll('#tabs a[href^="#"]')) {
        tabName.set(tab.getAttribute('href').slice(1), tab.textContent.trim());
    }

    const out = [];
    for (const card of doc.querySelectorAll('.vehicle_type')) {
        const link = card.querySelector('a[href*="/vehicle/"]');
        const id = link && Number(/\/vehicle\/\d+\/(\d+)\//.exec(link.getAttribute('href'))?.[1]);
        if (!Number.isFinite(id)) continue;
        if (out.some((o) => o.id === id)) continue;

        const pane = card.closest('[role="tabpanel"]');
        const needs = [...card.querySelectorAll('.alert')]
            .map((a) => a.textContent.trim())
            .find((t) => /^required extension:/i.test(t));

        out.push({
            id,
            name: (card.querySelector('h3')?.textContent || '').trim() || null,
            longName: (card.querySelector('b')?.textContent || '').trim() || null,
            category: pane ? (tabName.get(pane.id) || pane.id) : null,
            requiredExtension: needs ? needs.replace(/^required extension:\s*/i, '') : null,
        });
    }
    return out;
}
