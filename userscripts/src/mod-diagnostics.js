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
const SHIPPED_VEHICLE_TYPES = __VEHICLE_TYPES__;
const SHIPPED_VEHICLE_TYPE_IDS = Object.keys(SHIPPED_VEHICLE_TYPES);

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
    optional: true,
    defaultOn: true,
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
        <b>What the repo is missing</b>
        <p class="ymca-sub" style="margin:4px 0 6px">Everything else here says what the game
          says. This says what is <i>new</i> &mdash; the vehicle types, the tanks, the seats and
          the requirements this game has taught your install that the repo does not carry. When
          it says there is nothing, there is nothing to send.</p>
        <p data-gap style="margin:0 0 10px"></p>
        <button class="ymca-btn primary" data-do="gap">Copy what is missing</button>
      </div>

      <div class="ymca-card">
        <b>Hand over game data</b>
        <p class="ymca-sub" style="margin:4px 0 10px"><b>Vehicle types</b> is the one to send when
          a vehicle YMCA does not know turns up: nothing can be counted by a type it cannot name.
          It carries ids, names and what each type can do, and nothing about your account.<br>
          <b>What they can do</b> reads one vehicle of each type you own and takes the capability
          flags off it, so a type does not have to wait until it happens to be in range of a
          mission. Ids and flags only.<br>
          <b>Send this one</b> is everything the repo needs in a single file, with nothing in it
          that is yours: every vehicle type and what it can do, every mission the game lists,
          what you have run, what the ledger says each paid, and every requirement nothing could
          match. That is the file to hand over.<br>
          <b>Download everything</b> is the raw endpoints. That one carries your player name,
          your alliance and your building coordinates, so share it only where you are happy
          to.</p>
        <button class="ymca-btn primary" data-do="dataset">Send this one</button>
        <button class="ymca-btn" data-do="export-all">Download everything</button>
        <button class="ymca-btn" data-do="vehicles">Vehicle types</button>
        <button class="ymca-btn" data-do="capabilities">What they can do</button>
        <button class="ymca-btn" data-do="sweep">Look for new types now</button>
        <button class="ymca-btn" data-do="missions">Mission list only</button>
      </div>

      <div class="ymca-card">
        <b>Output</b>
        <p class="ymca-sub" style="margin:4px 0 8px">Whatever a button produced also lands here,
          in case the clipboard is refused.</p>
        <textarea id="ymca-diag-out" rows="14" style="width:100%;font-family:ui-monospace,monospace;
          font-size:11.5px" readonly></textarea>
      </div>`;

        /* Said on opening rather than behind a press: a reading somebody has to
         * remember to ask for is a reading they will not have when it matters,
         * and this one costs nothing but a look at localStorage. */
        const gapLine = el.querySelector('[data-gap]');
        try {
            const gap = repoGap();
            gapLine.textContent = repoGapLine(gap);
            gapLine.className = gap.counts.types || gap.counts.unmatchedRequirements
                ? 'ymca-accent' : 'ymca-dim';
        } catch (err) {
            gapLine.textContent = `Could not be worked out: ${err.message}`;
            gapLine.className = 'ymca-warn';
        }

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
            /* Which parts are switched on in ElementFriend. Half of "it does
             * nothing" is "it is switched off", and that is not something the
             * player thinks to mention. */
            elements: YMCA.elementState(),
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
        /* HighFive's captures ride along rather than waiting to be asked for:
         * the window it needs is one the player happens to be looking at, and
         * a reading that has to be remembered is a reading that is missing. */
        report.highfive = moduleStore('highfive');
        // What the sweep has managed, so "nothing saves itself" is answerable.
        report.typeSweep = sweepState();
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

    /* ONE FILE, AND NOTHING IN IT IS THEIRS.
     *
     * Every answer this repo has ever asked for, gathered without anybody
     * having to remember which button produced which half: the type store, the
     * game's own mission list, what has actually been run, what the ledger says
     * it paid, and the requirement keys nothing could match.
     *
     * What it deliberately leaves out is the whole of "Download everything":
     * no player name, no alliance, no buildings, no coordinates, no vehicle
     * captions, no mission instance ids. The reason there are two buttons is
     * that one of them can be posted in public and the other cannot.
     */
    if (what === 'gap') {
        const gap = repoGap();
        put(gap, `what the repo is missing \u2014 ${gap.counts.types} type`
            + `${gap.counts.types === 1 ? '' : 's'}`);
        ctx.log.info('repo gap copied', `${gap.counts.types} types`);
        return;
    }

    if (what === 'dataset') {
        ctx.status('Gathering\u2026');
        const data = {
            note: 'Everything YMCA has learnt about the game, and nothing about the account. '
                + 'No player name, no alliance, no buildings, no coordinates, no vehicle names.',
            ymca: YMCA.version,
            at: new Date().toISOString(),
            game: location.origin,
            locale: ctx.locale() || null,
        };

        /* Vehicle types: what the repo shipped, with whatever this game taught
         * laid over the top. Names, flags, seats and training \u2014 the type, not
         * the vehicle. */
        let learnt = {};
        try {
            learnt = JSON.parse(localStorage.getItem('ymca-vehicle-types')) || {};
        } catch (err) { /* nothing learnt here yet */ }
        const types = {};
        for (const [id, t] of Object.entries(SHIPPED_VEHICLE_TYPES)) types[id] = { ...t };
        for (const [id, t] of Object.entries(learnt)) {
            const caps = Array.isArray(t) ? t : (t.caps || []);
            types[id] = { ...(types[id] || {}) };
            if (caps.length) types[id].capabilities = caps;
            if (!Array.isArray(t) && t.name) types[id].name = t.name;
            types[id].learntHere = true;
        }
        data.vehicleTypes = types;
        data.vehicleTypesNotShipped = Object.keys(types)
            .filter((id) => !SHIPPED_VEHICLE_TYPES[id]).map(Number);

        /* Which types this account actually owns, as a count per type. A count
         * is not a vehicle: no ids, no names, no stations. */
        try {
            const fleet = await ctx.game('/api/vehicles');
            const own = {};
            for (const v of fleet || []) {
                const t = String(v.vehicle_type ?? '');
                if (t) own[t] = (own[t] || 0) + 1;
            }
            data.ownedByType = own;
        } catch (err) {
            data.ownedByType = `could not be read: ${err.message}`;
        }

        /* The game's own mission list, which is what data/missions.json is
         * built from. It is the same static list for everyone on this server. */
        try {
            const missions = await ctx.rawGame('/einsaetze.json');
            data.missions = slimMissions(missions);
        } catch (err) {
            data.missions = `could not be read: ${err.message}`;
        }

        /* What the other modules have worked out, read from their stores so a
         * module can change or go without breaking this. */
        /* The difference, taken here rather than by hand afterwards. The whole
         * file still carries everything; this is the part that is news. */
        data.missingFromRepo = repoGap();
        data.trackops = moduleStore('trackops');
        data.missionmagician = moduleStore('missionmagician');
        data.highfive = moduleStore('highfive');
        data.elements = YMCA.elementState();
        data.typeSweep = sweepState();

        const text = JSON.stringify(data, null, 1);
        ctx.download('ymca-dataset.json', text);
        out.value = text;
        ctx.status(`Downloaded ymca-dataset.json \u2014 ${Math.round(text.length / 1024)} KB, `
            + `${Object.keys(types).length} vehicle types, `
            + `${data.missingFromRepo.counts.types} of them with something the repo does not `
            + 'have. Nothing in it is yours.');
        ctx.log.info('dataset exported', `${Math.round(text.length / 1024)} KB`);
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

    if (what === 'capabilities') {
        ctx.status('Reading one vehicle of each type you own…');
        put(await vehicleCapabilities(ctx), 'what your vehicles can do');
        return;
    }

    if (what === 'sweep') {
        /* The same work the page does on its own, with the waiting skipped —
         * for when something has just been bought and should be known now. */
        ctx.status('Looking for types nothing knows yet…');
        try { localStorage.removeItem(CATALOGUE_KEY); } catch (e) { /* private window */ }
        try { localStorage.removeItem(SWEEP_FAILED_KEY); } catch (e) { /* as above */ }
        const flags = await learnNewTypes(ctx);
        const named = await learnCatalogue(ctx);
        put({
            note: 'what the sweep found just now',
            ymca: YMCA.version,
            flagsLearnt: flags || 'nothing new — every type in your fleet already has flags',
            typesNamed: named ? (named.types || []).filter((t) => t.name).length : 0,
            stillWithoutFlags: sweepState().withoutFlags,
        }, 'what the sweep found');
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
/**
 * WHAT THIS INSTALL KNOWS AND THE REPO DOES NOT.
 *
 * Every other button here answers "what does the game say"; this one answers
 * "what is missing from the file", which is the only question a round trip is
 * ever really spent on. Asking for a fresh report and reading four sections of
 * it to find the three new lines is work on both sides, and it is work a
 * comparison does for nothing: the repo ships in this very script, so the
 * difference can be taken here rather than by hand afterwards.
 *
 * Four things can be new, and each has one home in `data/vehicle-types.json`:
 * a type with no entry at all, an entry with no `capabilities`, one with no
 * `tank` and one with no `crewSeen`. Requirements nothing could match ride
 * along because they are the same kind of answer — something the repo has to
 * learn from a game it cannot see.
 *
 * It reads stores and the shipped table. Nothing is fetched, so it can be run
 * on any page and on mount, which is what makes the notice above the buttons
 * possible at all.
 */
function repoGap() {
    const read = (key, fallback) => {
        try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) {
            return fallback;
        }
    };
    const learnt = read('ymca-vehicle-types', {}) || {};
    const mm = read('ymca-missionmagician-types', {}) || {};
    const tanks = read('ymca-missionmagician-tanks', {}) || {};
    const crew = read('ymca-missionmagician-crew-seen', {}) || {};
    const unmatched = read('ymca-missionmagician-unmatched', []) || [];

    const capsOf = (t) => (Array.isArray(t) ? t : (t && t.caps) || t?.capabilities || []);
    const nameOf = (id) => (learnt[id] && !Array.isArray(learnt[id]) && learnt[id].name)
        || (mm[id] && !Array.isArray(mm[id]) && mm[id].name) || null;

    const ids = new Set([...Object.keys(learnt), ...Object.keys(mm),
        ...Object.keys(tanks), ...Object.keys(crew)]);
    const types = {};
    const counts = { noEntry: 0, noCapabilities: 0, noTank: 0, noCrew: 0 };
    for (const id of [...ids].sort((a, b) => Number(a) - Number(b))) {
        const shipped = SHIPPED_VEHICLE_TYPES[id];
        const caps = capsOf(learnt[id]).length ? capsOf(learnt[id]) : capsOf(mm[id]);
        const why = [];
        const entry = {};
        if (!shipped) { why.push('no entry in the repo'); counts.noEntry += 1; }
        if (nameOf(id) && (!shipped || !shipped.name)) entry.name = nameOf(id);
        if (caps.length && !(shipped && shipped.capabilities && shipped.capabilities.length)) {
            entry.capabilities = caps;
            why.push('the repo has no capabilities for it');
            counts.noCapabilities += 1;
        }
        /* A zero tank is an answer — knowing a patrol car carries nothing is
         * knowing something — so what counts as missing is the repo having no
         * `tank` at all, never the figure being nought. */
        if (tanks[id] && !(shipped && shipped.tank)) {
            entry.tank = tanks[id];
            why.push('the repo has no tank for it');
            counts.noTank += 1;
        }
        if (crew[id] > 0 && !(shipped && shipped.crewSeen)) {
            entry.crewSeen = crew[id];
            why.push('the repo has no measured crew for it');
            counts.noCrew += 1;
        }
        if (why.length) types[id] = { ...entry, why };
    }

    const total = Object.keys(types).length;
    return {
        note: 'What this install has measured that data/vehicle-types.json does not carry. '
            + 'Type ids, flags, tanks and seats — the type, never the vehicle, and nothing '
            + 'about the account.',
        ymca: YMCA.version,
        at: new Date().toISOString(),
        counts: { ...counts, types: total, unmatchedRequirements: unmatched.length },
        types,
        unmatchedRequirements: unmatched,
    };
}

/** The one line that says whether pressing anything here is worth it. */
function repoGapLine(gap) {
    const c = gap.counts;
    if (!c.types && !c.unmatchedRequirements) {
        return 'Nothing here that the repo does not already have.';
    }
    const bits = [];
    if (c.noEntry) bits.push(`${c.noEntry} vehicle type${c.noEntry === 1 ? '' : 's'} it has never heard of`);
    if (c.noCapabilities) bits.push(`${c.noCapabilities} with flags it does not carry`);
    if (c.noTank) bits.push(`${c.noTank} tank${c.noTank === 1 ? '' : 's'}`);
    if (c.noCrew) bits.push(`${c.noCrew} crew figure${c.noCrew === 1 ? '' : 's'}`);
    if (c.unmatchedRequirements) {
        bits.push(`${c.unmatchedRequirements} requirement${c.unmatchedRequirements === 1 ? '' : 's'} nothing could match`);
    }
    return `This game has taught YMCA ${bits.join(', ')} that the repo does not have.`;
}

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
        const capsByType = Object.fromEntries(Object.entries(types)
            .map(([id, t]) => [id, Array.isArray(t) ? t : (t.caps || [])]));

        /* Every capability name the game has been seen to write, and which types
         * carry it. A requirement nothing maps is answered by one of these, so
         * the two lists together are the whole of what a mapping needs — one
         * press of this button rather than a question per family. */
        const vocabulary = {};
        for (const [id, caps] of Object.entries(capsByType)) {
            for (const flag of caps) (vocabulary[flag] ||= []).push(Number(id));
        }
        const unmatched = read('unmatched', []) || [];
        // Published by MissionMagician into its own store, so this stays a reader.
        const claimed = new Set(read('mappedFlags', []) || []);

        /* WHAT IT MEASURED, NOT ONLY WHAT IT FLAGGED. Tanks and crew live in
         * stores of their own and rode in no export at all, so three rounds of
         * reports could come back and the repo still start every install blind
         * on water and on people. They are the game's own figures — a tank off
         * a selection checkbox, seats off the at-mission Crew column — and a
         * figure that arrives once and is not written down has to be asked for
         * again. */
        const readKey = (key, fallback) => {
            try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) {
                return fallback;
            }
        };
        return {
            vehicleTypesLearnt: Object.keys(types).length,
            learntTypes: types,
            capabilitiesByType: capsByType,
            typeNames: Object.fromEntries(Object.entries(types)
                .filter(([, t]) => t && t.name).map(([id, t]) => [id, t.name])),
            tanksByType: readKey('ymca-missionmagician-tanks', {}),
            crewByType: readKey('ymca-missionmagician-crew-seen', {}),
            flagVocabulary: Object.fromEntries(Object.entries(vocabulary)
                .sort(([a], [b]) => a.localeCompare(b))),
            /* The flags no requirement asks for yet: whatever answers an
             * unmatched key is among them. */
            flagsNoRequirementUses: Object.keys(vocabulary)
                .filter((f) => !claimed.has(f)).sort(),
            unmatchedRequirements: unmatched,
            settings: read('cfg', null),
        };
    }

    if (moduleId === 'highfive') {
        /* Structure only, both of them — path shapes and field names, never a
         * hospital, a patient or a vehicle of the player's. */
        return {
            window: read('lastCapture', null),
            fleetStatus: read('lastFleet', null),
        };
    }

    return null;
}

/**
 * What each type you own can actually do, without waiting for a mission.
 *
 * The buy page names every type in the game but says nothing about what one
 * covers, and the capability flags only ever appear on a `.vehicle_checkbox` —
 * which means waiting until a vehicle of that type happens to be in range of an
 * open mission. That is fine for a fleet of ten and useless for the game's 106.
 *
 * A vehicle's own page is the same vehicle without the mission, so it is asked
 * directly: one vehicle per type you own, its page fetched, and every attribute
 * the game set to "1" taken off whatever element carries `vehicle_type_id`.
 *
 * Nothing is guessed. Where a page carries no such element the type is reported
 * as unanswered, with the element names and classes that page did have — so a
 * page built differently can be read next time rather than argued about. No
 * captions, no addresses, no building names: attribute and class names only.
 */
const CAP_NOT_A_FLAG = new Set([
    'fms', 'checked', 'disabled', 'value', 'name', 'type', 'id', 'class',
    'vehicle_type_id', 'direct', 'distance', 'tabindex', 'custom_',
]);

/** What the sweep knows and does not, for the report and the button. */
function sweepState() {
    let learnt = {};
    let failed = {};
    try { learnt = JSON.parse(localStorage.getItem('ymca-missionmagician-types')) || {}; } catch (e) { /* none */ }
    try { failed = JSON.parse(localStorage.getItem(SWEEP_FAILED_KEY)) || {}; } catch (e) { /* none */ }
    const flagged = new Set();
    for (const [id, t] of Object.entries(learnt)) {
        const caps = Array.isArray(t) ? t : t?.caps;
        if (caps && caps.length) flagged.add(String(id));
    }
    for (const [id, t] of Object.entries(SHIPPED_VEHICLE_TYPES)) {
        if (t.capabilities?.length) flagged.add(String(id));
    }
    let owned = [];
    try {
        const raw = JSON.parse(localStorage.getItem('ymca-cache-/api/vehicles'));
        owned = Array.isArray(raw?.value) ? raw.value : [];
    } catch (e) { /* the sweep reads it live anyway */ }
    return {
        typesWithFlags: flagged.size,
        withoutFlags: [...new Set(owned.map((v) => String(v.vehicle_type ?? '')))]
            .filter((t) => t && !flagged.has(t)),
        couldNotRead: Object.keys(failed),
        catalogueReadAt: (() => {
            try {
                const at = Number(localStorage.getItem(CATALOGUE_KEY));
                return at ? new Date(at).toISOString() : null;
            } catch (e) { return null; }
        })(),
    };
}

async function vehicleCapabilities(ctx) {
    const vehicles = await ctx.game('/api/vehicles');
    if (!Array.isArray(vehicles) || !vehicles.length) {
        return { note: 'no vehicles on this account, so there is nothing to read', types: {} };
    }

    /* One of each type: two vehicles of a type carry the same flags, and the
     * point is to ask the game as few times as possible. */
    const oneEach = new Map();
    for (const v of vehicles) {
        const t = String(v.vehicle_type ?? '');
        if (t && !oneEach.has(t)) oneEach.set(t, v.id);
    }

    const found = {};
    const unanswered = [];
    let shape = null;

    for (const [typeId, vehicleId] of oneEach) {
        try {
            const res = await fetch(`/vehicles/${vehicleId}`, { credentials: 'same-origin' });
            if (!res.ok) { unanswered.push({ typeId, why: `HTTP ${res.status}` }); continue; }
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

            const flags = new Set();
            for (const el of doc.querySelectorAll('[vehicle_type_id]')) {
                for (const attr of el.attributes) {
                    if (attr.value !== '1') continue;
                    const n = attr.name.toLowerCase();
                    if (CAP_NOT_A_FLAG.has(n) || !/^[a-z][a-z0-9_]*$/.test(n)) continue;
                    flags.add(n);
                }
            }
            if (flags.size) {
                found[typeId] = [...flags].sort();
            } else {
                unanswered.push({ typeId, why: 'no element on that page carries vehicle_type_id' });
                /* Once only, and structure alone: the ids and classes of what the
                 * page is built from, so the next read knows where to look. */
                if (!shape) {
                    shape = {
                        elementsWithId: [...doc.querySelectorAll('[id]')]
                            .map((el) => `${el.tagName.toLowerCase()}#${el.id}`).slice(0, 40),
                        formActions: [...doc.querySelectorAll('form')]
                            .map((f) => (f.getAttribute('action') || '').replace(/\d+/g, '#')),
                        tablesAndPanels: [...doc.querySelectorAll('table, .panel, .well')]
                            .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.trim())
                            .slice(0, 20),
                    };
                }
            }
        } catch (err) {
            unanswered.push({ typeId, why: err.message });
        }
        await ctx.sleep(150);
    }

    /* Into the store every module reads, merged under what a mission window
     * taught — a selection table is the same game saying the same thing, and
     * neither overrides the other unless it has more to say. */
    let written = 0;
    try {
        const key = 'ymca-missionmagician-types';
        const learnt = JSON.parse(localStorage.getItem(key)) || {};
        for (const [typeId, caps] of Object.entries(found)) {
            const had = learnt[typeId];
            const before = Array.isArray(had) ? { caps: had, name: null } : had;
            if (before && (before.caps || []).length >= caps.length) continue;
            learnt[typeId] = { caps, name: before?.name || null };
            written += 1;
        }
        localStorage.setItem(key, JSON.stringify(learnt));
    } catch (e) { /* private window: the copy below still carries it */ }

    return {
        note: 'capability flags per vehicle type, read from each vehicle\'s own page in your '
            + 'game. Type ids and flag names only — nothing about the vehicles themselves.',
        ymca: YMCA.version,
        typesYouOwn: oneEach.size,
        typesAnswered: Object.keys(found).length,
        newToThisBrowser: written,
        capabilitiesByType: found,
        unanswered,
        /* Present only when nothing could be read, and then it is what says why. */
        pageShapeWhereNothingWasFound: shape,
    };
}

/* Anywhere but a mission. Pinning this to `/` was wrong twice over: a mission
 * window is a frame whose address bar still says `/`, and the player spends
 * plenty of time on building and vehicle pages where a quiet sweep is welcome.
 * What it stays out of is the mission itself, where there is a call to run. */
function sweepHere() {
    if (window.top !== window.self) return false;
    if (/^\/missions\//.test(location.pathname)) return false;
    return !document.getElementById('mission-form');
}

/**
 * Learn a type the moment it turns up in the fleet, without being asked.
 *
 * A vehicle bought today is a type YMCA may never have seen, and waiting for
 * somebody to press a button — or for a new release to carry it — is waiting.
 * So on the map page the fleet is compared against what is already known, and
 * any type that is new has one of its vehicles' pages read.
 *
 * IT IS NOT ON A TIMER, and the first version was, which made it useless: it
 * wrote "done" before doing anything, so a vehicle bought after that sat
 * unlearnt for six hours however often the page was reloaded. The check itself
 * costs nothing — the fleet is already cached — so it runs every page load and
 * only ever fetches a type nothing knows yet. What *is* remembered is a type
 * whose page could not be read, so a broken one is not retried every time.
 */
const SWEEP_FAILED_KEY = 'ymca-diagnostics-typeSweepFailed';
const SWEEP_RETRY_MS = 6 * 3600e3;
const SWEEP_AT_MOST = 8;

async function learnNewTypes(ctx) {
    let vehicles;
    try {
        vehicles = await ctx.game('/api/vehicles');
    } catch (err) { return null; }
    if (!Array.isArray(vehicles) || !vehicles.length) return null;

    let known = {};
    try { known = JSON.parse(localStorage.getItem('ymca-missionmagician-types')) || {}; } catch (e) { /* none */ }

    let failed = {};
    try { failed = JSON.parse(localStorage.getItem(SWEEP_FAILED_KEY)) || {}; } catch (e) { /* none */ }

    /* One vehicle per type the game has and nothing here has flags for. A type
     * the repo ships already counts as known — this is for what is new. */
    const wanted = new Map();
    for (const v of vehicles) {
        const t = String(v.vehicle_type ?? '');
        if (!t || wanted.has(t)) continue;
        const mine = known[t];
        const caps = Array.isArray(mine) ? mine : mine?.caps;
        if (caps && caps.length) continue;
        if (SHIPPED_VEHICLE_TYPES[t]?.capabilities?.length) continue;
        // A page that would not read is left alone for a while, not for ever.
        if (Date.now() - (failed[t] || 0) < SWEEP_RETRY_MS) continue;
        wanted.set(t, v.id);
    }
    if (!wanted.size) return null;

    const learnt = {};
    for (const [typeId, vehicleId] of [...wanted].slice(0, SWEEP_AT_MOST)) {
        try {
            /* eslint-disable no-await-in-loop */
            const res = await fetch(`/vehicles/${vehicleId}`, { credentials: 'same-origin' });
            if (!res.ok) continue;
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            const flags = new Set();
            for (const el of doc.querySelectorAll('[vehicle_type_id]')) {
                for (const attr of el.attributes) {
                    if (attr.value !== '1') continue;
                    const n = attr.name.toLowerCase();
                    if (CAP_NOT_A_FLAG.has(n) || !/^[a-z][a-z0-9_]*$/.test(n)) continue;
                    flags.add(n);
                }
            }
            if (flags.size) learnt[typeId] = [...flags].sort();
            else failed[typeId] = Date.now();
        } catch (err) {
            failed[typeId] = Date.now();
        }
        await ctx.sleep(1000);
    }
    try { localStorage.setItem(SWEEP_FAILED_KEY, JSON.stringify(failed)); } catch (e) { /* none */ }
    if (!Object.keys(learnt).length) return null;

    try {
        const key = 'ymca-missionmagician-types';
        const store = JSON.parse(localStorage.getItem(key)) || {};
        for (const [typeId, caps] of Object.entries(learnt)) {
            const had = store[typeId];
            store[typeId] = { caps, name: (Array.isArray(had) ? null : had?.name) || null };
        }
        localStorage.setItem(key, JSON.stringify(store));
    } catch (e) { /* private window: it will be learnt again next time */ }

    ctx.log.info('learnt new vehicle types', Object.keys(learnt).join(', '));
    return learnt;
}

/**
 * Read the catalogue into this install, so nothing here waits on a release.
 *
 * The buy pages name every type the game sells, which branch it belongs to and
 * what extension it needs — for all of them, not only the ones owned. That is
 * the whole naming problem solved locally: a type added by a game update names
 * itself the next time this runs, on every install, with nobody exporting
 * anything to anybody.
 *
 * Once a week is plenty: the catalogue changes when the game is updated, not
 * while anyone is playing.
 */
const CATALOGUE_KEY = 'ymca-diagnostics-lastCatalogue';
const CATALOGUE_EVERY_MS = 7 * 24 * 3600e3;

async function learnCatalogue(ctx) {
    let last = 0;
    try { last = Number(localStorage.getItem(CATALOGUE_KEY)) || 0; } catch (e) { /* private window */ }
    if (Date.now() - last < CATALOGUE_EVERY_MS) return null;

    let fleet;
    try {
        fleet = await vehicleCatalogue(ctx);
    } catch (err) {
        // Not marked done, so the next page load tries again.
        ctx.log.warn('catalogue sweep', err.message);
        return null;
    }
    const named = (fleet.types || []).filter((t) => t.name).length;
    if (!named) return null;
    try { localStorage.setItem(CATALOGUE_KEY, String(Date.now())); } catch (e) { /* as above */ }
    ctx.log.info('read the vehicle catalogue', `${named} types named from the buy pages`);
    return fleet;
}

/* Once per load, a while after the page has settled, and never in the way. */
YMCA.inject('diagnostics', (ctx) => {
    if (!sweepHere()) return true;
    setTimeout(() => {
        learnNewTypes(ctx)
            .then(() => learnCatalogue(ctx))
            .catch((err) => ctx.log.warn('type sweep', err.message));
    }, 8000);
    return true;
});

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
                for (const k of ['name', 'longName', 'crew', 'education', 'requiredExtension',
                    'category']) {
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
        crew: r.crew ?? undefined,
        education: r.education || undefined,
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
            if (!r.name && !r.capabilities) continue;
            store[r.id] = { name: r.name, caps: r.capabilities };
            /* Kept because the game states them, not because anything counts
             * with them: `Max. Crew` is a cap the player sets per vehicle, so
             * it is a fact about the type and not a count of people. */
            if (r.crew) store[r.id].maxCrew = r.crew;
            if (r.education) store[r.id].education = r.education;
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
        const alerts = [...card.querySelectorAll('.alert')].map((a) =>
            a.textContent.replace(/\s+/g, ' ').trim());
        const needs = alerts.find((t) => /^required extension:/i.test(t));

        /* The card states two things nothing else does: how many people the
         * vehicle carries, and which training they need. A mission asking for
         * eight HazMat-trained crew is answered by HazMat vehicles and their
         * crews, so both are worth having. */
        const text = card.textContent.replace(/\s+/g, ' ');
        const crew = /max\.?\s*crew:\s*(\d+)/i.exec(text);
        const school = alerts.map((t) => /requires special education\s*\(([^)]+)\)/i.exec(t))
            .find(Boolean);

        out.push({
            id,
            name: (card.querySelector('h3')?.textContent || '').trim() || null,
            longName: (card.querySelector('b')?.textContent || '').trim() || null,
            crew: crew ? Number(crew[1]) : null,
            education: school ? school[1].trim() : null,
            category: pane ? (tabName.get(pane.id) || pane.id) : null,
            requiredExtension: needs ? needs.replace(/^required extension:\s*/i, '') : null,
        });
    }
    return out;
}
