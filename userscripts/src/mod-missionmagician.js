/* --------------------------------------------------------------------------
 * MissionMagician — read a mission window, say which vehicles it wants, and
 * pick them.
 *
 * IT PICKS. IT DOES NOT DISPATCH. That is the whole safety design, and it is
 * not a limitation to be lifted later. An alarm cannot be taken back, so the
 * rule about a mandatory preview and an undoable backup cannot be met by any
 * amount of care — there is no undo to write. So the preview *is* the product:
 * MissionMagician ticks the game's own checkboxes and stops. The player looks
 * at what is selected and presses the game's own Dispatch button. Nothing is
 * ever written to the account by this module.
 *
 * What the first real capture settled. A mission is its own page at
 * /missions/<id>. The dispatch is a plain form: `input[name="vehicle_ids[]"]`
 * checkboxes carrying `data-direct`, `data-distance` and `data-equipment-types`,
 * and an `input[name="commit"]` submit labelled Dispatch, beside `.alert_next`
 * and `.alert_next_alliance`. `#mission_general_info` holds the header and
 * `#missing_text` the missing-vehicle line, as text with no child elements.
 *
 * That is the safe-write shape already: tick the game's own boxes, submit the
 * game's own form. Nothing has to be hand-built.
 *
 * WHERE THAT PAGE LIVES, which was the confusing part. On the big map the
 * mission window is an iframe, so the address bar still says "/" while the
 * mission is on screen. YMCA is not locked out of it — the userscript's @match
 * covers frames, so YMCA boots a second time *inside* that iframe, which is
 * why the capture that worked reported "/missions/505949001". Reaching across
 * from the parent is therefore never necessary, and jxn-30/LSS-Scripts does
 * the same thing: its mission scripts match /missions/* and simply run in the
 * frame.
 *
 * So the rule for this module is: it belongs inside the mission frame. Open
 * the mission first, then open YMCA — on the big map that means the floating
 * button, because the frame has no navbar of its own.
 *
 * WHAT THE VEHICLE LIST IS, now seen on a real page. `#mission-form` posts to
 * /missions/<id>/alarm. `#vehicle_show_table_body_all` holds the rows; a row is
 * `.vehicle_select_table_tr` and carries `vehicle_id`, `data-distance` and a
 * category flag matching the tab it belongs to (`polizei`, `feuerwehr_lf`,
 * `rettungsdienst`, …). The checkbox inside it is `.vehicle_checkbox`, id
 * `vehicle_checkbox_<vehicleId>`, and it is where the useful attributes live:
 * `vehicle_type_id`, `fms` for status, and a set of plain capability flags —
 * `fire`, `elw`, `rw`, `dlk`, `gwa`, `fustw`, `any_rtw`, `gwl2wasser_only` —
 * plus `wasser_amount` and `foam_amount_display`. Those flags are not guessed:
 * they are the same ones the player's own AAO buttons select on, which is how
 * each entry in REQUIREMENTS below is sourced.
 *
 * The mission's type is on `#mission_general_info` as `data-mission-type`, so
 * what a mission *needs* comes from /einsaetze.json rather than from reading
 * the window's text. The window is only asked which vehicles are available.
 * -------------------------------------------------------------------------- */

/**
 * What a requirement in /einsaetze.json is called on a vehicle checkbox.
 *
 * Every entry carries where it came from, and the AAO ones are strong: an AAO
 * is a filter the player built in the game's own editor, so a button labelled
 * "F-HRV" selecting on `rw="1"` is the game itself saying which flag means a
 * heavy rescue vehicle. Requirements with no entry here are shown and counted
 * but never auto-selected — an unmatched requirement is stated, not guessed at.
 */
const MM_REQUIREMENTS = {
    firetrucks: { flag: 'fire', label: 'Fire engines', source: 'the "Fire Truck" AAO selects on fire=1' },
    battalion_chief_vehicles: { flag: 'elw', label: 'Battalion chief units', source: 'the "F-BCU" AAO selects on elw=1' },
    police_cars: { flag: 'fustw_or_police_motorcycle', label: 'Patrol cars', source: 'the "Patrol Car" AAO' },
    ambulances: { flag: 'any_rtw', label: 'Ambulances', source: 'the "Rescue Unit" AAO selects on any_rtw=1' },
    heavy_rescue_vehicles: { flag: 'rw', label: 'Heavy rescue', source: 'the "F-HRV" AAO selects on rw=1' },
    mobile_air_vehicles: { flag: 'gwa', label: 'Mobile air', source: 'the "F-MA" AAO selects on gwa=1' },
    platform_trucks: { flag: 'dlk', label: 'Platform trucks', source: 'the "F-PlT" AAO selects on dlk=1' },
    water_tankers: { flag: 'gwl2wasser_only', label: 'Water tankers', source: 'the "F-WaTa" AAO' },
};

/** Requirements that are an amount to reach, not a count of vehicles. */
const MM_AMOUNTS = {
    water_needed: { attr: 'wasser_amount', label: 'Water', unit: 'gal.' },
    foam_needed: { attr: 'foam_amount_display', label: 'Foam', unit: 'gal.' },
};

/** Every flag a requirement can ask for, so only those are worth remembering. */
const MM_FLAGS = Object.values(MM_REQUIREMENTS).map((r) => r.flag);

/** How long the game's own mission catalogue is worth keeping. It changes when
 * the game is updated, not while anyone is playing. */
const MM_CATALOGUE_MS = 24 * 60 * 60 * 1000;

/**
 * What each vehicle type can do, learnt from the selection table.
 *
 * A vehicle already at the mission is listed in a different table, and that one
 * carries only `vehicle_type_id` — no capability flags. So the flags are
 * remembered from the selection table, where both appear on the same row, and
 * the fleet fills itself in over the first few missions. A type never yet seen
 * there counts as present but unknown, and the panel says so rather than
 * quietly treating it as nothing.
 */
const MM_TYPES_KEY = 'ymca-missionmagician-types';

function mmKnownTypes() {
    try {
        return JSON.parse(localStorage.getItem(MM_TYPES_KEY)) || {};
    } catch (e) {
        return {};
    }
}

function mmLearnTypes(vehicles) {
    const known = mmKnownTypes();
    let changed = false;
    for (const v of vehicles) {
        if (!v.typeId || known[v.typeId]) continue;
        known[v.typeId] = MM_FLAGS.filter((f) => v.has(f));
        changed = true;
    }
    if (changed) {
        try { localStorage.setItem(MM_TYPES_KEY, JSON.stringify(known)); } catch (e) { /* private window */ }
    }
    return known;
}

/**
 * Vehicles already at the mission or on their way to it.
 *
 * They meet a requirement just as much as one you are about to send, so not
 * subtracting them was the difference between "needs 4 engines" and "needs 4
 * more engines" — and only the second is true once anything has been sent.
 */
function mmOnScene(known) {
    const rows = document.querySelectorAll(
        '#mission_vehicle_at_mission tbody tr[id^="vehicle_row"], '
        + '#mission_vehicle_driving tbody tr[id^="vehicle_row"]');
    const counts = {};
    let unknown = 0;
    let total = 0;
    for (const row of rows) {
        const typeId = row.querySelector('[vehicle_type_id]')?.getAttribute('vehicle_type_id');
        if (!typeId) continue;
        total += 1;
        const flags = known[typeId];
        if (!flags) { unknown += 1; continue; }
        for (const flag of flags) counts[flag] = (counts[flag] || 0) + 1;
    }
    return { counts, unknown, total };
}

/** Only what the panel reads, so the stored catalogue is a fraction of the original. */
function mmShrinkCatalogue(data) {
    const list = Array.isArray(data) ? data : Object.values(data);
    const byId = {};
    for (const m of list) {
        byId[String(m.id)] = {
            name: m.name,
            requirements: m.requirements || {},
            average_credits: m.average_credits || null,
        };
    }
    return byId;
}


YMCA.register({
    id: 'missionmagician',
    title: 'MissionMagician',
    tagline: 'Pick the right vehicles',

    description: 'Reads what a mission needs and ticks the vehicles that match. '
        + 'It never dispatches — you press the game\'s own button.',

    async mount(el, ctx) {
        const cfg = ctx.store.read('cfg', { fastestFirst: true });
        const page = mmReadMissionPage();

        if (!page.onMissionPage) {
            el.innerHTML = mmOffMissionHtml();
            mmWireCapture(el, ctx);
            return;
        }

        const plan = await mmPlan(page, ctx, cfg);
        el.innerHTML = mmPlanHtml(plan, page, cfg, ctx);

        el.addEventListener('change', (e) => {
            const key = e.target.dataset.cfg;
            if (!key) return;
            cfg[key] = e.target.checked;
            ctx.store.write('cfg', cfg);
            ctx.open('missionmagician');
        });

        el.addEventListener('click', (e) => {
            if (e.target.closest('[data-do="select"]')) {
                const n = mmSelect(plan.pick);
                ctx.status(`Ticked ${n} vehicles — now press the game's own Dispatch.`);
                ctx.log.info('ticked vehicles', `${n} for mission type ${page.missionType}`);
                el.querySelector('#mm-done').hidden = false;
            } else if (e.target.closest('[data-do="clear"]')) {
                const n = mmClear();
                ctx.status(`Unticked ${n}.`);
                el.querySelector('#mm-done').hidden = true;
            }
        });
    },
});

/* ---------------------------------------------------------- reading the page */

/** What this page is and what it offers, without reading a word of its text. */
function mmReadMissionPage() {
    const info = document.getElementById('mission_general_info');
    const form = document.getElementById('mission-form');
    const body = document.getElementById('vehicle_show_table_body_all');
    return {
        onMissionPage: !!(info && form && body),
        inFrame: window.top !== window.self,
        // The type id, which is the key into /einsaetze.json. Not the title.
        missionType: info?.getAttribute('data-mission-type') || null,
        rows: body ? [...body.querySelectorAll('.vehicle_select_table_tr')] : [],
    };
}

/** A vehicle, described by the attributes the game put on its own checkbox. */
function mmVehicle(row) {
    const box = row.querySelector('.vehicle_checkbox');
    if (!box) return null;
    const num = (name) => {
        const v = box.getAttribute(name);
        return v === null || v === '' ? 0 : Number(v) || 0;
    };
    /* The travel time, not the distance. The game prints it into the fourth cell
     * as `timevalue` in seconds once it has worked the route out, and it is the
     * only honest ordering: a vehicle whose dot sits closer on the map can still
     * arrive later, which is exactly what "fastest vehicle" got wrong. Until the
     * game has filled it in the row falls back to distance, and the panel says
     * when it is doing that. */
    const timed = row.querySelector('[timevalue]');
    const seconds = timed ? Number(timed.getAttribute('timevalue')) : NaN;
    return {
        box,
        id: box.value,
        typeId: num('vehicle_type_id'),
        seconds: Number.isFinite(seconds) ? seconds : null,
        distance: Number(row.getAttribute('data-distance')) || 0,
        water: num('wasser_amount'),
        foam: num('foam_amount_display'),
        has: (flag) => box.getAttribute(flag) === '1',
    };
}

/** Seconds where the game has them, distance as a stand-in where it has not. */
function mmOrder(a, b) {
    if (a.seconds !== null && b.seconds !== null) return a.seconds - b.seconds;
    if (a.seconds !== null) return -1;
    if (b.seconds !== null) return 1;
    return a.distance - b.distance;
}

/* -------------------------------------------------------------- the planning */

/**
 * What this mission needs, and which of the vehicles on screen meet it.
 *
 * The need comes from /einsaetze.json — the game's own list — so the window
 * only has to answer "what is available", which is the one thing the list
 * cannot know.
 */
async function mmPlan(page, ctx, cfg) {
    let requirements = null;
    let name = null;
    try {
        /* Kept across page loads. Every mission window is its own load, so the
         * whole catalogue was being refetched each time one opened — which is
         * what made the panel take a moment to appear. */
        const byId = await ctx.gameCached('/einsaetze.json', MM_CATALOGUE_MS, mmShrinkCatalogue);
        const record = byId[String(page.missionType)];
        if (record) {
            requirements = record.requirements || {};
            name = record.name;
        }
    } catch (err) {
        ctx.log.warn('could not read the mission list', err.message);
    }

    const vehicles = page.rows.map(mmVehicle).filter(Boolean);
    if (cfg.fastestFirst !== false) vehicles.sort(mmOrder);
    const untimed = vehicles.filter((v) => v.seconds === null).length;
    const scene = mmOnScene(mmLearnTypes(vehicles));

    const picked = new Map();   // id -> vehicle, so one vehicle can serve two requirements
    const lines = [];

    if (requirements) {
        /* A Quint carries both `fire` and `dlk`; a Rescue Engine both `fire` and
         * `rw`. The game flags them that way itself, so one of them genuinely
         * answers two requirements and an ordinary engine can stay at home.
         * That only works if the scarce requirement is filled first — fill
         * `fire` first and the Quint is spent as a plain engine — so the
         * requirements are taken in order of how few vehicles can meet them.
         * No setting and no special case for either: it falls out of filling
         * the hardest requirement first. */
        const counted = Object.entries(requirements)
            .filter(([key]) => !MM_AMOUNTS[key])
            .map(([key, wanted]) => {
                const rule = MM_REQUIREMENTS[key];
                return { key, wanted, rule, able: rule ? vehicles.filter((v) => v.has(rule.flag)) : [] };
            })
            .sort((a, b) => a.able.length - b.able.length);

        for (const { key, wanted, rule, able } of counted) {
            if (!rule) {
                lines.push({ key, label: mmPretty(key), wanted, found: null, unmatched: true });
                continue;
            }
            const already = scene.counts[rule.flag] || 0;
            const stillWanted = Math.max(0, wanted - already);
            // Anything picked for another requirement counts here too, and costs nothing more.
            let have = able.filter((v) => picked.has(v.id)).length;
            for (const v of able) {
                if (have >= stillWanted) break;
                if (picked.has(v.id)) continue;
                picked.set(v.id, v);
                have += 1;
            }
            lines.push({ key, label: rule.label, wanted, onScene: already, found: have + already });
        }

        /* Water and foam are totals, so they are filled by adding vehicles until
         * the figure is reached — the ones already picked may carry some. */
        for (const [key, rule] of Object.entries(MM_AMOUNTS)) {
            const wanted = requirements[key];
            if (!wanted) continue;
            const carried = (v) => (key === 'water_needed' ? v.water : v.foam);
            let have = [...picked.values()].reduce((n, v) => n + carried(v), 0);
            for (const v of vehicles) {
                if (have >= wanted) break;
                if (picked.has(v.id) || !carried(v)) continue;
                picked.set(v.id, v);
                have += carried(v);
            }
            lines.push({ key, label: rule.label, wanted, found: have, unit: rule.unit });
        }

        // Counts first, then the totals, so the table reads the way the game states it.
        lines.sort((a, b) => Number(!!a.unit) - Number(!!b.unit));
    }

    return {
        name,
        requirements,
        lines,
        pick: [...picked.values()],
        available: vehicles.length,
        untimed,
        scene,
        missionType: page.missionType,
    };
}


/** firetrucks -> Firetrucks, for a requirement with no entry in the map. */
function mmPretty(key) {
    return key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------- the selecting */

/**
 * Tick the game's own checkboxes.
 *
 * A native change event is dispatched because the game listens for one —
 * `$("body").on("change", ".vehicle_checkbox", …)` keeps its counter, its water
 * bar and its AAO state up to date from it. Setting `checked` alone would leave
 * the page showing the player something different from what it would send.
 */
function mmSelect(pick) {
    let n = 0;
    for (const v of pick) {
        if (v.box.checked) continue;
        v.box.checked = true;
        v.box.dispatchEvent(new Event('change', { bubbles: true }));
        n += 1;
    }
    return n;
}

/**
 * Clear the selection the way the game does.
 *
 * Every dispatch order list carries a Reset entry — `.aao[reset="true"]` — and
 * clicking it is the game's own way of putting the selection back, counters,
 * water bar and all. Unticking each box by hand is only the fallback for a
 * window with no dispatch orders on it.
 */
function mmClear() {
    const reset = document.querySelector('.aao[reset="true"]');
    if (reset) {
        reset.click();
        return -1;
    }
    let n = 0;
    for (const box of document.querySelectorAll('.vehicle_checkbox:checked')) {
        box.checked = false;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        n += 1;
    }
    return n;
}

/* ---------------------------------------------------------------- the panels */

function mmPlanHtml(plan, page, cfg, ctx) {
    const rows = plan.lines.map((l) => {
        const enough = l.found !== null && l.found >= l.wanted;
        const state = l.unmatched
            ? '<span class="ymca-warn">not matched yet</span>'
            : `<span class="${enough ? 'ymca-accent' : 'ymca-bad'}">${ctx.fmt(l.found)}${l.unit ? ` ${l.unit}` : ''}</span>`;
        return `<tr><td>${ctx.esc(l.label)}</td>
      <td class="ymca-num">${ctx.fmt(l.wanted)}${l.unit ? ` ${l.unit}` : ''}</td>
      <td class="ymca-num">${state}</td></tr>`;
    }).join('');

    const unmatched = plan.lines.filter((l) => l.unmatched);
    const short = plan.lines.filter((l) => !l.unmatched && l.found < l.wanted);

    return `
      <div class="ymca-note"><b>This is also in the mission window itself</b>, above the game's
        own missing-vehicle line — that is where it is meant to be used, and it keeps itself up to
        date as the game works out the travel times. This copy is here for when you want it.</div>

      <div class="ymca-note"><b>It picks. It does not dispatch.</b> MissionMagician ticks the
        game's own checkboxes and stops there. An alarm cannot be undone, so nothing here writes
        to your account — you look at what is selected and press the game's own Dispatch.</div>

      <div class="ymca-card">
        <b>${plan.name ? ctx.esc(plan.name) : `Mission type ${ctx.esc(String(page.missionType))}`}</b>
        <p class="ymca-sub" style="margin:4px 0 8px">What the game's own mission list says this
          needs, against the ${plan.available} vehicles this window is offering.</p>
        ${plan.requirements ? `<table style="margin-top:4px" id="mm-needs">
          <thead><tr><th>Needs</th><th class="ymca-num">Wanted</th><th class="ymca-num">Picked</th></tr></thead>
          <tbody>${rows}</tbody></table>`
        : '<p class="ymca-bad">This mission type is not in the game\'s list, so nothing can be planned.</p>'}
      </div>

      ${short.length ? `<div class="ymca-note warn"><b>Not enough on screen.</b>
        ${short.map((l) => ctx.esc(l.label)).join(', ')} — this window is not offering enough of
        them. Widen the range with the game's own km buttons and reopen this.</div>` : ''}

      ${unmatched.length ? `<div class="ymca-note warn"><b>${unmatched.length} requirement${
        unmatched.length > 1 ? 's are' : ' is'} not matched yet:</b>
        ${unmatched.map((l) => ctx.esc(l.label)).join(', ')}. Which checkbox attribute means these
        has not been established, and a guess would tick the wrong vehicle — so they are named here
        and left alone. Send a problem report from a mission needing one and it can be added.</div>` : ''}

      <div class="ymca-card">
        <b>Pick them</b>
        <label style="display:block;margin:4px 0"><input type="checkbox" data-cfg="fastestFirst"
          ${cfg.fastestFirst !== false ? 'checked' : ''}> Fastest first, by travel time</label>
        <button class="ymca-btn primary" data-do="select">Tick ${plan.pick.length} vehicles</button>
        <button class="ymca-btn" data-do="clear">Untick everything</button>
        <div class="ymca-note" id="mm-done" hidden style="margin-top:10px">Ticked. Check the list,
          then press <b>Dispatch</b> in the game itself — MissionMagician will not press it.</div>
      </div>`;
}

function mmOffMissionHtml() {
    return `
      <div class="ymca-note"><b>Nothing to do here.</b> MissionMagician puts itself
        <b>inside the mission window</b>, above the game's own missing-vehicle line. Open any
        mission and it is already there — you do not open YMCA for it at all.</div>

      <div class="ymca-card">
        <b>What it does there</b>
        <ul class="ymca-sub" style="margin:6px 0 0;padding-left:20px">
          <li>Lists what the mission needs, from the game's own mission list, against what is in
            range — and keeps the list current as the game works out the travel times.</li>
          <li>One button ticks the vehicles that match, <b>fastest first by travel time</b>, not by
            how close the dot looks on the map.</li>
          <li>It never presses Dispatch. That stays yours.</li>
        </ul>
      </div>

      <div class="ymca-card">
        <b>If it still says this while a mission is open</b>
        <p class="ymca-sub" style="margin:4px 0 10px">Then that window is built differently from the
          one this was written against. This copies its structure — element, class and field names
          and the numbers in them, and no mission text, addresses or player names.</p>
        <button class="ymca-btn" data-do="capture">Capture this mission window</button>
        <span class="ymca-status" id="mm-status"></span>
        <div class="ymca-note warn" id="mm-wrongpage" hidden style="margin-top:10px">
          <b>That was not the mission frame.</b> Nothing was copied, because there was nothing on
          this page worth sending. Open the mission, then open YMCA with the floating button
          <i>inside</i> it, and press this there.</div>
        <textarea id="mm-out" rows="10" readonly style="width:100%;margin-top:10px;
          font-family:ui-monospace,monospace;font-size:11.5px"></textarea>
      </div>`;
}

function mmWireCapture(el, ctx) {
    el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-do="capture"]')) return;
        const out = el.querySelector('#mm-out');
        const report = captureMissionWindow();
        out.value = JSON.stringify(report, null, 1);
        const warn = el.querySelector('#mm-wrongpage');
        warn.hidden = report.looksLikeMissionWindow;
        if (report.looksLikeMissionWindow) {
            ctx.clipboard(out.value, 'the mission window structure');
        } else {
            ctx.status('No mission window on this page — nothing worth sending.');
        }
        ctx.log.info('captured mission window',
            report.looksLikeMissionWindow ? `${report.found.length} selectors found` : 'not on a mission page');
    });
}

/**
 * Describe the mission window without reading its content.
 *
 * Structure is what is needed — which form carries the dispatch, how a vehicle
 * row is marked up, what the alarm control is called. Mission text, street
 * names and player names are not, so they are not taken.
 *
 * The first real capture answered half of it: the dispatch is a plain form with
 * `input[name="vehicle_ids[]"]` checkboxes and an `input[name="commit"]` submit,
 * which is exactly the shape the safe-write rule wants — tick the game's own
 * boxes and submit the game's own form, never build one. What it could not
 * answer is what holds those checkboxes, because the table is not
 * `#vehicle_show_table_body` or `table.vehicle_table`. So this version stops
 * guessing at container names and walks up from a checkbox instead.
 */
function captureMissionWindow() {
    const CANDIDATES = [
        // Confirmed present on a real mission page.
        '#mission_general_info', '#missing_text', '#vehicle_show_table_all',
        '.alert-missing-vehicles', 'input[name="vehicle_ids[]"]', '.aao',
        'input[name="commit"]', '.alert_next', '.vehicle_checkbox',
        // Confirmed absent, kept so a future game change shows up as a diff.
        '.mission_header', '#mission_vehicle_driving', '#vehicle_show_table_body',
        'table.vehicle_table', '#mission_vehicle_amount', '#mission_aao_group',
        'form#vehicle_select', '#vehicle_list',
        // Named by jxn-30/LSS-Scripts, not yet seen on this player's page.
        '#vehicle_show_table_body_all', '.vehicle_select_table_tr', '#mission_alarm_btn',
        '#vehicle_list_step', '.vehicle_checkbox[vehicle_type_id]',
    ];
    const seen = CANDIDATES.filter((sel) => !!document.querySelector(sel));

    const classOf = (el) => (typeof el.className === 'string' ? el.className.trim().slice(0, 120) : '');
    /** Digits out, so an id is reported as a shape rather than as a particular thing. */
    const shapeId = (id) => String(id || '').replace(/\d+/g, '#').slice(0, 48);

    const outline = (el) => (el ? { tag: el.tagName.toLowerCase(), id: shapeId(el.id) || undefined, class: classOf(el) || undefined } : null);

    const checkbox = document.querySelector('input[name="vehicle_ids[]"], .vehicle_checkbox');
    const rowsPresent = document.querySelectorAll('.vehicle_select_table_tr').length
        || document.querySelectorAll('input[name="vehicle_ids[]"]').length;

    /* --- the form that actually dispatches ---
     * Its field names are what a safe write needs: everything unrelated has to
     * survive, so it has to be known what "everything unrelated" is. Names only;
     * a value could be a CSRF token or a caption. */
    // :has() is recent enough that an older browser would throw and take the whole
    // capture with it, and closest() answers this on every page seen so far anyway.
    let form = checkbox?.closest('form') || null;
    if (!form) {
        try {
            form = document.querySelector('form:has(input[name="vehicle_ids[]"])');
        } catch (e) { /* no :has() here */ }
    }
    const dispatchForm = form ? {
        id: shapeId(form.id) || undefined,
        class: classOf(form) || undefined,
        action: (form.getAttribute('action') || '').split('?')[0].replace(/\d+/g, '#'),
        method: form.getAttribute('method') || 'get',
        fieldNames: [...new Set([...form.elements].map((f) => f.name).filter(Boolean))].slice(0, 30),
        submitNames: [...form.querySelectorAll('[type=submit]')].map((b) => b.name || '(unnamed)'),
        checkboxCount: form.querySelectorAll('input[name="vehicle_ids[]"]').length,
    } : 'no form wraps the vehicle checkboxes';

    /* --- what holds a vehicle, found by walking up rather than by guessing --- */
    const chain = [];
    for (let node = checkbox?.parentElement; node && node !== document.body && chain.length < 8; node = node.parentElement) {
        chain.push(outline(node));
        if (node.tagName === 'FORM') break;
    }

    const row = checkbox?.closest('tr') || chain[1] && checkbox?.parentElement?.parentElement || null;
    const describeRow = (el) => (el ? {
        tag: el.tagName.toLowerCase(),
        class: classOf(el) || undefined,
        idShape: shapeId(el.id) || undefined,
        attrs: [...el.attributes].map((a) => a.name),
        // Numbers in attributes are how a row says which vehicle type it is. Text is not taken.
        numericAttrs: Object.fromEntries([...el.attributes]
            .filter((a) => /^-?\d+$/.test(a.value) && a.value.length <= 12)
            .map((a) => [a.name, Number(a.value)])),
        cellCount: el.cells?.length,
        cells: [...(el.cells || el.children)].slice(0, 10).map((c) => ({
            tag: c.tagName.toLowerCase(),
            class: classOf(c) || undefined,
            childTags: [...c.children].slice(0, 5).map((x) => x.tagName.toLowerCase()),
            childClasses: [...c.children].slice(0, 5).map((x) => classOf(x)).filter(Boolean),
        })),
    } : 'no vehicle row found');

    /* --- everything the page marks as mission-ish ---
     * The mission's *type* has to be findable, because that is the key into
     * /einsaetze.json where the requirements and the credit figure already are.
     * Reading the requirements off the page would mean reading its text. */
    const missionHints = [];
    for (const el of document.querySelectorAll('[id*="mission"], [class*="mission"], [data-mission-type-id], [data-mission-id]')) {
        const hint = {
            tag: el.tagName.toLowerCase(),
            idShape: shapeId(el.id) || undefined,
            class: classOf(el) || undefined,
            numericData: Object.fromEntries(Object.entries(el.dataset || {})
                .filter(([, v]) => /^-?\d+$/.test(v) && v.length <= 12)
                .map(([k, v]) => [k, Number(v)])),
        };
        if (!hint.idShape && !hint.class && !Object.keys(hint.numericData).length) continue;
        if (missionHints.some((h) => h.idShape === hint.idShape && h.class === hint.class)) continue;
        missionHints.push(hint);
        if (missionHints.length >= 25) break;
    }

    const aaos = [...document.querySelectorAll('.aao')];

    return {
        note: 'structure only — element, class and field names and the numbers in them. '
            + 'No mission text, addresses, player names or field values.',
        url: location.pathname.replace(/\d+/g, '#'),
        looksLikeMissionWindow: /\/missions?\//.test(location.pathname)
            || !!document.querySelector('#mission_general_info, #missing_text'),
        // On the big map this page is an iframe, so saying which one it is beats guessing later.
        inFrame: window.top !== window.self,
        vehicleRowsPresent: rowsPresent,
        found: seen,
        missing: CANDIDATES.filter((sel) => !seen.includes(sel)),
        dispatchForm,
        vehicleContainerChain: chain,
        vehicleRow: describeRow(row),
        checkbox: checkbox ? {
            name: checkbox.name,
            class: classOf(checkbox),
            idShape: shapeId(checkbox.id) || undefined,
            // The first capture only read data-* and so missed vehicle_type_id, which is a
            // plain attribute. Names and types, not values: data-distance says where you are.
            attributes: [...checkbox.attributes]
                .map((a) => `${a.name}:${/^-?[\d.]+$/.test(a.value) ? 'number' : 'string'}`),
            // The vehicle type is the one value that has to come through, because it is what
            // matches a row against a requirement from /einsaetze.json.
            vehicleTypeId: Number(checkbox.getAttribute('vehicle_type_id')) || null,
        } : 'no vehicle checkbox found',
        aao: aaos.length ? {
            count: aaos.length,
            sample: {
                tag: aaos[0].tagName.toLowerCase(),
                class: classOf(aaos[0]),
                attrs: [...aaos[0].attributes].map((a) => a.name),
                numericData: Object.fromEntries(Object.entries(aaos[0].dataset || {})
                    .filter(([, v]) => /^-?\d+$/.test(v))
                    .map(([k, v]) => [k, Number(v)])),
            },
        } : 'no AAO buttons found',
        missionHints,
        alarmControls: [...document.querySelectorAll('input[type=submit], button[type=submit], .btn-success')]
            .slice(0, 8).map((b) => ({
                tag: b.tagName.toLowerCase(), type: b.type, name: b.name || undefined,
                class: classOf(b).slice(0, 80) || undefined,
                text: (b.value || b.textContent || '').trim().slice(0, 30),
            })),
        requirementBlocks: [...document.querySelectorAll('#missing_text, .missing_text, #mission_general_info')]
            .map((e) => ({
                id: e.id, class: classOf(e),
                childTags: [...e.children].map((c) => c.tagName),
                // Whether the requirement is text or markup decides whether it can be parsed
                // at all, without saying what it says.
                textLength: (e.textContent || '').trim().length,
                hasElementChildren: e.children.length > 0,
            })),
    };
}

/* ======================================================================
 * The panel in the game's own mission window.
 *
 * A tool you have to open a lightbox to reach is a tool you stop using, and
 * the lightbox has the further problem that YMCA's window is built before the
 * mission frame has finished loading — so it read an empty page unless you
 * reloaded it. Living in the window solves both: it is there when the mission
 * is, and it re-reads itself as the game fills the table in.
 *
 * This is the one place a module writes markup outside its own panel, so it
 * writes **no colours of its own**. Everything is the game's own Bootstrap —
 * `panel`, `table`, `btn`, `label` — which means it follows the game into dark
 * mode without YMCA having to know anything about it.
 * ====================================================================== */

const MM_PANEL_ID = 'ymca-mm-panel';

/* The game fills travel times in after the page settles and appends rows when
 * "load missing vehicles" is used, so the panel re-reads rather than assuming
 * the first look was the whole picture. */
const MM_REDRAW_MS = 400;

YMCA.inject('missionmagician', (ctx) => {
    if (!mmReadMissionPage().onMissionPage) return;
    mmMountPanel(ctx);
});

function mmMountPanel(ctx) {
    if (document.getElementById(MM_PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = MM_PANEL_ID;
    panel.className = 'panel panel-default';
    panel.innerHTML = '<div class="panel-body"><i>YMCA is reading this mission…</i></div>';

    /* Top of the right-hand half, which is where LSS-Manager puts its own mission
     * helper. The window is two columns — the dispatch orders on the left and
     * everything else on the right — and this belongs with the everything else.
     * Above the game's missing-vehicle line, then the top of the frame, are the
     * fallbacks for a window laid out differently. */
    const right = document.getElementById('col_right');
    const missing = document.getElementById('missing_text');
    if (right) right.prepend(panel);
    else if (missing) missing.parentNode.insertBefore(panel, missing);
    else document.getElementById('iframe-inside-container')?.prepend(panel);

    let timer = null;
    const draw = async () => {
        const page = mmReadMissionPage();
        if (!page.onMissionPage) return;
        const cfg = ctx.store.read('cfg', { fastestFirst: true });
        const plan = await mmPlan(page, ctx, cfg);
        panel.dataset.pick = plan.pick.map((v) => v.id).join(',');
        panel.dataset.type = String(plan.missionType || '');
        panel.innerHTML = mmGamePanelHtml(plan, cfg, ctx);
    };
    const redraw = () => {
        clearTimeout(timer);
        timer = setTimeout(() => { draw(); }, MM_REDRAW_MS);
    };

    panel.addEventListener('click', (e) => {
        if (e.target.closest('[data-do="select"]')) {
            const ids = (panel.dataset.pick || '').split(',').filter(Boolean);
            const n = mmSelectIds(ids);
            ctx.log.info('ticked vehicles', `${n} in the mission window`);
            const done = panel.querySelector('#mm-panel-done');
            if (done) done.hidden = false;
        } else if (e.target.closest('[data-do="clear"]')) {
            mmClear();
            const done = panel.querySelector('#mm-panel-done');
            if (done) done.hidden = true;
        } else if (e.target.closest('[data-do="type"]')) {
            mmCopyType(ctx, panel.dataset.type);
        }
    });

    panel.addEventListener('change', (e) => {
        if (e.target.dataset.cfg !== 'fastestFirst') return;
        const cfg = ctx.store.read('cfg', { fastestFirst: true });
        cfg.fastestFirst = e.target.checked;
        ctx.store.write('cfg', cfg);
        draw();
    });

    const body = document.getElementById('vehicle_show_table_body_all');
    if (body) {
        // childList for rows arriving, attributes for the travel times landing.
        new MutationObserver(redraw).observe(body, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['timevalue'],
        });
    }
    draw();
    ctx.log.info('panel placed in the mission window');
}

/** Tick by id, so the panel survives the game re-sorting its own table. */
function mmSelectIds(ids) {
    let n = 0;
    for (const id of ids) {
        const box = document.getElementById(`vehicle_checkbox_${id}`);
        if (!box || box.checked) continue;
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        n += 1;
    }
    return n;
}

/**
 * The panel, in the game's own clothes.
 *
 * No colour is chosen here. `label-success` and `label-danger` are the game's,
 * so a met requirement and a short one read the same as everywhere else in it.
 */
/**
 * Hand back one mission type, complete.
 *
 * A mission *type* is the game's static catalogue — no player, no place, no
 * instance of anything — so the whole record can go back as it is, and that is
 * what settles a requirement nobody has matched a vehicle attribute to yet.
 */
async function mmCopyType(ctx, typeId) {
    try {
        const missions = await ctx.rawGame('/einsaetze.json');
        const list = Array.isArray(missions) ? missions : Object.values(missions);
        const record = list.find((m) => String(m.id) === String(typeId));
        if (!record) { ctx.status('That mission type is not in the list.'); return; }
        await ctx.clipboard(JSON.stringify(record, null, 1), 'this mission type, complete');
        ctx.log.info('copied mission type', String(typeId));
    } catch (err) {
        ctx.status('Could not read the mission list.');
        ctx.log.warn('copy mission type failed', err.message);
    }
}


function mmGamePanelHtml(plan, cfg, ctx) {
    if (!plan.requirements) {
        return `<div class="panel-body"><b>YMCA</b> — this mission type is not in the game's own
      mission list, so there is nothing to work from.</div>`;
    }

    const rows = plan.lines.map((l) => {
        const cell = l.unmatched
            ? '<span class="label label-warning">not matched yet</span>'
            : `<span class="label label-${l.found >= l.wanted ? 'success' : 'danger'}">${
                ctx.fmt(l.found)}${l.unit ? ` ${l.unit}` : ''}</span>`;
        return `<tr><td>${ctx.esc(l.label)}</td>
      <td class="text-right">${ctx.fmt(l.wanted)}${l.unit ? ` ${l.unit}` : ''}</td>
      <td class="text-right">${l.onScene
        ? `<span class="label label-info">${l.onScene}</span>`
        : '<span class="text-muted">&ndash;</span>'}</td>
      <td class="text-right">${cell}</td></tr>`;
    }).join('');

    const short = plan.lines.filter((l) => !l.unmatched && l.found < l.wanted);
    const unmatched = plan.lines.filter((l) => l.unmatched);

    return `
    <div class="panel-heading">
      <b>YMCA</b> — what this mission needs
      ${plan.name ? `<small> · ${ctx.esc(plan.name)}</small>` : ''}
    </div>
    <div class="panel-body">
      <table class="table table-condensed table-striped" style="margin-bottom:8px">
        <thead><tr><th>Needs</th><th class="text-right">Wanted</th>
          <th class="text-right" title="already at the mission or on the way">There</th>
          <th class="text-right">Covered</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>

      ${plan.scene.total ? `<p class="text-muted" style="margin:0 0 8px">
        ${plan.scene.total} already at the mission or on the way, subtracted above${
        plan.scene.unknown ? ` — except ${plan.scene.unknown} whose type has not been seen in a
        selection list yet, so what they cover is not known` : ''}.</p>` : ''}

      ${short.length ? `<div class="alert alert-warning" style="padding:6px 10px">
        <b>Not enough in range:</b> ${short.map((l) => ctx.esc(l.label)).join(', ')}.
        Widen the distance with the game's own km buttons.</div>` : ''}

      ${unmatched.length ? `<div class="alert alert-warning" style="padding:6px 10px">
        <b>Left alone:</b> ${unmatched.map((l) => ctx.esc(l.label)).join(', ')} — which vehicle
        attribute means this has not been established, and a guess would tick the wrong one.
        <button type="button" class="btn btn-xs btn-default" data-do="type">Copy this mission
          type</button> and it can be added.</div>` : ''}

      <button type="button" class="btn btn-success btn-sm" data-do="select">
        Tick ${plan.pick.length} vehicles</button>
      <button type="button" class="btn btn-default btn-sm" data-do="clear">Reset selection</button>
      <label style="font-weight:normal;margin:0 0 0 10px">
        <input type="checkbox" data-cfg="fastestFirst" ${cfg.fastestFirst !== false ? 'checked' : ''}>
        Fastest first, by travel time</label>
      ${plan.untimed ? `<small class="text-muted"> · ${plan.untimed} of ${plan.available}
        have no travel time yet, ordered by distance until the game works them out</small>` : ''}
      <div class="alert alert-info" id="mm-panel-done" hidden style="padding:6px 10px;margin:8px 0 0">
        Ticked. Check the list, then press <b>Dispatch</b> — YMCA will not press it for you.</div>
    </div>`;
}
