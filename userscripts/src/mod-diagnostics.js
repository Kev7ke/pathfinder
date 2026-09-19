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
        <p class="ymca-sub" style="margin:4px 0 10px">The full export is the one to attach when
          the dataset should be rebuilt. It carries your player name, your alliance and your
          building coordinates, so share it only where you are happy to.</p>
        <button class="ymca-btn primary" data-do="export-all">Download everything</button>
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
        const [V, B] = await Promise.all([ctx.game('/api/vehicles'), ctx.game('/api/buildings')]);
        const host = new Map(B.map((b) => [b.id, b.building_type]));
        const byType = new Map();
        for (const v of V) {
            const t = String(v.vehicle_type ?? '');
            if (!byType.has(t)) byType.set(t, { id: Number(t), vehicles: 0, hosts: new Set(), caption: null });
            const row = byType.get(t);
            row.vehicles++;
            row.hosts.add(host.get(v.building_id));
            if (v.vehicle_type_caption) row.caption = v.vehicle_type_caption;
        }
        put([...byType.values()].sort((a, b) => a.id - b.id).map((r) => ({
            id: r.id, vehicles: r.vehicles, customCaption: r.caption,
            onBuildingTypes: [...r.hosts],
        })), 'the vehicle types');
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
            types = JSON.parse(localStorage.getItem('ymca-missionmagician-types')) || {};
        } catch (e) { /* nothing learnt yet */ }
        return {
            vehicleTypesLearnt: Object.keys(types).length,
            capabilitiesByType: types,
            unmatchedRequirements: read('unmatched', []),
            settings: read('cfg', null),
        };
    }

    return null;
}
