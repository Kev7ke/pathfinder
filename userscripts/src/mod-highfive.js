/* --------------------------------------------------------------------------
 * HighFive — clicking through status 5.
 *
 * Status 5 is a vehicle transporting: an ambulance taking a patient to a
 * hospital, a patrol car taking somebody to a prison. Each one wants a
 * destination picked, and picking it one vehicle at a time means going back to
 * the list and finding the next. LSS-Manager's version jumps straight to the
 * next vehicle in status 5 after each pick, so the whole queue is clicked
 * through in one place. That is what this is for.
 *
 * WHICH FIELD CARRIES THE STATUS IS ANSWERED. The first fleet capture came
 * back with `fms_real` and `fms_show` on every vehicle, both running 1 to 6
 * across a fleet of 83, so the status is the game's own field and 5 is a value
 * it really takes. Nothing here guesses at it any more, and the capture button
 * that found it stays for the day the field is renamed. `hospital_*` and
 * `police_cell_*` sit on the same record, which is where the two branches of
 * status 5 are told apart.
 *
 * So FINDING the vehicles works: the list below is read from `/api/vehicles`.
 *
 * AND THE GAME ADVANCES ITSELF, which is the whole trick. A transporting
 * vehicle's page carries
 *
 *     <a class="btn btn-success" id="next-vehicle-fms-5"
 *        href="/vehicles/15079875">Go to the next vehicle with a transport request</a>
 *
 * so the next vehicle in status 5 is a link the game has already worked out.
 * Nothing has to be searched for and nothing has to be guessed: HighFive reads
 * that href before the pick and follows it after, which is the one button
 * LSS-Manager presses for you.
 *
 * **IT NEVER PICKS, AND IT NEVER FETCHES THE PICK.** The destination is a plain
 * `<a href="/vehicles/<id>/patient/<hospital>">` and the player clicks it
 * themselves; HighFive only remembers where "next" pointed and goes there
 * afterwards. Doing the GET on their behalf would be writing something that
 * cannot be taken back, and a failed fetch would leave a patient untransported
 * while the panel moved on. Navigating is not writing.
 *
 * The jump is one-shot and it checks first: if the game already landed on the
 * vehicle it was going to send you to, it does nothing rather than skipping one.
 * It also expires, so a flag left behind cannot hijack a navigation minutes
 * later.
 *
 * WHAT IS STILL MISSING IS THE FILTERING. A range — "only hospitals within so
 * far" — needs to know which cell of that table carries the distance, and the
 * rows carry no class at all (`rowClasses: {}` on a page with 35 destinations).
 * So the capture asks for the table's own shape and the filter waits for it.
 * `hospital_max_distance`, `hospital_max_price` and `hospital_own` sit on the
 * vehicle in `/api/vehicles`, which is where the game keeps that setting
 * itself.
 *
 * THE FIRST CAPTURE WAS TAKEN ON THE MAP, which is why it came back with 67
 * building links and no destinations. The panel says where it is being pressed
 * now, so that round trip is not repeated.
 * ------------------------------------------------------------------------ */

/** Digits out: a path is reported as a shape, not as a particular vehicle. */
const hfShape = (s) => String(s || '').replace(/\d+/g, '#').slice(0, 80);

function hfTally(list, cap) {
    const counts = new Map();
    for (const item of list) counts.set(item, (counts.get(item) || 0) + 1);
    return Object.fromEntries([...counts.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, cap));
}

/**
 * The page YMCA is open over.
 *
 * YMCA's window is a lightbox on top of the game, so everything below it is
 * still in the document — a capture pressed here reads the vehicle page behind
 * it. That is why this does not need to be injected into the game's markup to
 * work.
 */
/**
 * The page's own answer to "is this a vehicle waiting for a destination".
 *
 * THE GAME NAMES THE TWO BRANCHES IN TWO LANGUAGES. A hospital is
 * `/vehicles/<id>/patient/<hospital>` and a prison is
 * `/vehicles/<id>/gefangener/<cell>` — the German word, in an English game,
 * exactly as `gw_gefahrgut` turned up in a requirement list. Matching only the
 * English one is why the ambulances advanced and the patrol cars did not.
 * Neither word is guessed at: both came off a capture.
 */
const HF_BRANCHES = ['patient', 'gefangener'];
const HF_PICK_LINK = HF_BRANCHES.map((w) => `a[href*="/${w}/"]`).join(', ');
const HF_PICKED = new RegExp(`^/vehicles/\\d+/(${HF_BRANCHES.join('|')})/-?\\d+`);
const HF_NEXT = '#next-vehicle-fms-5';

function hfCapturePage() {
    const classOf = (el) => (typeof el.className === 'string' ? el.className.trim().slice(0, 100) : '');

    const links = [...document.querySelectorAll('a[href]')]
        .map((a) => hfShape((a.getAttribute('href') || '').split('?')[0]))
        .filter((h) => h && h !== '#');

    const forms = [...document.querySelectorAll('form')].slice(0, 8).map((f) => ({
        id: hfShape(f.id) || undefined,
        class: classOf(f) || undefined,
        action: hfShape((f.getAttribute('action') || '').split('?')[0]),
        method: f.getAttribute('method') || 'get',
        // Names only. A value here could be a CSRF token or a caption.
        fieldNames: [...new Set([...f.elements].map((x) => x.name).filter(Boolean))].slice(0, 25),
    }));

    return {
        path: hfShape(location.pathname),
        inFrame: window.top !== window.self,
        /* Where a destination is picked will be one of these shapes. */
        linkShapes: hfTally(links, 45),
        idShapes: hfTally([...document.querySelectorAll('[id]')]
            .map((el) => hfShape(el.id)).filter(Boolean), 45),
        rowClasses: hfTally([...document.querySelectorAll('tr')]
            .map(classOf).filter(Boolean), 25),
        panelClasses: hfTally([...document.querySelectorAll('.panel, .box, .alert, .list-group')]
            .map(classOf).filter(Boolean), 25),
        tableCount: document.querySelectorAll('table').length,
        forms,
        /* WHAT THE RANGE FILTER IS WAITING FOR. 35 destinations came back with
         * no class on a single row, so which cell carries the distance cannot
         * be found by name. This asks the row itself: how many cells, what each
         * is called, and whether it holds digits or words. Never a hospital
         * name, never a distance, never a price — only the shape of the cell
         * one of them is in. */
        destinations: (() => {
            const link = document.querySelector(HF_PICK_LINK);
            const row = link?.closest('tr');
            const table = link?.closest('table');
            if (!link) return 'no destination link on this page';
            if (!row) {
                const up = link.parentElement;
                return { noRow: true, parent: up
                    ? { tag: up.tagName.toLowerCase(), class: classOf(up) || undefined } : null };
            }
            return {
                rows: table ? table.querySelectorAll('tr').length : null,
                tableId: hfShape(table?.id) || undefined,
                tableClass: classOf(table) || undefined,
                /* The headings, because they are what says which column is the
                 * distance — a number cannot say that about itself. */
                headings: [...(table?.querySelectorAll('thead th, thead td') || [])]
                    .map((th) => (th.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)),
                rowAttributes: [...row.attributes].map((a) => a.name),
                cells: [...(row.cells || [])].map((c) => ({
                    tag: c.tagName.toLowerCase(),
                    class: classOf(c) || undefined,
                    attributes: [...c.attributes].map((a) => a.name),
                    digits: /\d/.test(c.textContent || ''),
                    words: /[a-z]{4}/i.test(c.textContent || ''),
                    controls: [...c.querySelectorAll('a,button,input,span[id]')]
                        .map((x) => `${x.tagName.toLowerCase()}${hfShape(x.id) ? `#${hfShape(x.id)}` : ''}.${classOf(x)}`)
                        .slice(0, 4),
                })),
                /* FOUND, NOT NAMED. `own-hospitals` and `alliance-hospitals` were
                 * a list of ids to look for, which answers nothing on a prison
                 * page. Every element carrying an id and holding destinations
                 * is reported instead, so whatever the other branch calls its
                 * halves names itself. */
                sections: [...document.querySelectorAll('[id]')]
                    .map((el) => ({ el, n: el.querySelectorAll(HF_PICK_LINK).length }))
                    .filter(({ el, n }) => n && el.tagName !== 'BODY')
                    .slice(0, 12)
                    .map(({ el, n }) => ({
                        id: hfShape(el.id),
                        tag: el.tagName.toLowerCase(),
                        class: classOf(el) || undefined,
                        holdsLinks: n,
                    })),
            };
        })(),
        hasNextButton: !!document.querySelector(HF_NEXT),
    };
}

/**
 * The fields the first capture found carrying the status, in the order they
 * are trusted. `fms_real` is what the vehicle IS; `fms_show` is what the game
 * displays, which can lag it.
 */
const HF_STATUS_FIELDS = ['fms_real', 'fms_show'];
const HF_TRANSPORTING = 5;

/** Your vehicles in status 5, as the game's own field reports them. */
function hfTransporting(vehicles) {
    return (vehicles || []).filter((v) => HF_STATUS_FIELDS
        .some((f) => Number(v?.[f]) === HF_TRANSPORTING));
}

/**
 * What the fleet says about status, without saying anything about the fleet.
 *
 * A field is reported only when the whole fleet has few distinct values for it
 * and all of them are small integers. A status looks like that; a vehicle id,
 * a building id and a set of coordinates do not, so they are left out by the
 * shape of the test rather than by a list of names to avoid.
 */
function hfCaptureFleet(vehicles) {
    const fields = new Map();
    for (const v of vehicles.slice(0, 600)) {
        for (const [key, value] of Object.entries(v || {})) {
            if (!fields.has(key)) fields.set(key, { values: new Map(), kinds: new Set() });
            const f = fields.get(key);
            f.kinds.add(value === null ? 'null' : typeof value);
            /* An id names the player's own things, so it never gets a
             * histogram however small it happens to be on a small fleet. A
             * status field is not called an id, so nothing is lost. */
            const isIdentifier = key === 'id' || /(^|_)id$/.test(key);
            if (!isIdentifier && typeof value === 'number' && Number.isInteger(value)
                && value >= -1 && value <= 30) {
                f.values.set(value, (f.values.get(value) || 0) + 1);
            }
        }
    }
    const statusLike = {};
    for (const [key, f] of fields) {
        if (f.values.size && f.values.size <= 12) {
            statusLike[key] = Object.fromEntries([...f.values.entries()].sort((a, b) => a[0] - b[0]));
        }
    }
    return {
        vehicleCount: vehicles.length,
        fieldNames: [...fields.keys()].sort(),
        // key -> { value: how many vehicles }. The field carrying 5 names itself.
        smallIntegerFields: statusLike,
    };
}

function hfPanel(el, ctx) {
    const onVehiclePage = /^\/vehicles\/\d+/.test(location.pathname);
    el.innerHTML = `
    <div class="ymca-card">
      <b>Transporting right now</b>
      <p class="ymca-dim" style="margin:6px 0 9px">Your vehicles in status 5, read from the
        game's own <code>fms_real</code>. Each one opens where the destination is picked.</p>
      <div id="hf-list"><span class="ymca-dim">Reading your fleet\u2026</span></div>
      <button class="ymca-btn" data-do="again" style="margin-top:10px">Read it again</button>
    </div>

    <div class="ymca-card">
      <b>After you pick</b>
      <label style="display:block;margin-top:6px;font-weight:400;cursor:pointer">
        <input type="checkbox" data-cfg="advance"> Go straight to the next transport</label>
      <label style="display:block;margin-top:6px;font-weight:400;cursor:pointer">
        <input type="checkbox" data-cfg="closeWhenDone"> Close the window when there is nothing
        left</label>
      <label style="display:block;margin-top:10px">Wait before closing
        <input type="range" data-wait min="0" max="2000" step="50"
          value="${Number.isFinite(Number(hfCfg(ctx).closeAfter))
        ? Number(hfCfg(ctx).closeAfter) : HF_CLOSE_DEFAULT}" style="vertical-align:middle;
          width:200px;margin:0 8px">
        <b data-wait-shows></b></label>
      <p class="ymca-dim" style="margin:6px 0 0;font-size:12px">The game works out which vehicle
        is next and links to it; this follows that link once you have picked. It never picks for
        you and never repeats your click \u2014 assigning a hospital cannot be undone. The wait
        is only long enough to be sure nothing moved you on; if it closes too early, push it up
        and tell me the number that worked.</p>
    </div>

    <div class="ymca-card">
      <b>Sorting and filtering</b>
      <p class="ymca-dim" style="margin:6px 0 0">The controls sit on the vehicle's own page,
        above the destinations. Which column is the distance is not something the page says
        anywhere &mdash; not one row carries a class &mdash; so the table is asked instead: its
        own headers name the columns, and any column whose cells read as numbers can be sorted
        by. <b>Show the first 10</b> is the range: sort by distance and the far ones are gone.
        Yours and the alliance's can be separated where the page marks them.</p>
      <div id="hf-last" class="ymca-dim" style="font-size:12px;margin-top:9px"></div>
    </div>

    <div class="ymca-card">
      <b>Send the missing piece</b>
      <p class="ymca-dim" style="margin:6px 0 9px">Open one of the vehicles above, leave that
        page open, open YMCA from the navbar and press this. It copies <em>structure</em>: path
        shapes, element names, form field names. No hospital names, no patients, no addresses,
        no vehicle names.</p>
      <div class="ymca-row">
        <button class="ymca-btn ${onVehiclePage ? 'primary' : ''}" data-do="capture"
          >Copy this vehicle window</button>
        <button class="ymca-btn" data-do="fleet">Copy what your fleet says about status</button>
      </div>
      <p class="${onVehiclePage ? 'ymca-dim' : 'ymca-warn'}" style="margin:9px 0 0;font-size:12px"
        id="hf-where"></p>
    </div>`;

    /* Where it is being pressed, said before it is pressed. The first capture
     * came back from the map with 67 building links and no destinations, and
     * that was a whole round trip spent on a button that should have said so. */
    el.querySelector('#hf-where').textContent = onVehiclePage
        ? `You are on ${hfShape(location.pathname)} \u2014 this is the page to capture.`
        : `You are on ${hfShape(location.pathname)}, which is not a vehicle page. Capturing from `
          + 'here answers nothing about transporting; open a vehicle above first.';

    const paint = async () => {
        const list = el.querySelector('#hf-list');
        try {
            const moving = hfTransporting(await ctx.game('/api/vehicles'));
            list.innerHTML = moving.length
                ? `<div class="ymca-pick">${moving.map((v) => `<div><a href="/vehicles/${
                    encodeURIComponent(v.id)}" class="ymca-accent">${ctx.esc(v.caption || `#${v.id}`)
                }</a> <small>${ctx.esc(v.vehicle_type_caption || '')}</small></div>`).join('')}</div>
          <p class="ymca-dim" style="margin:8px 0 0;font-size:12px">${moving.length}
            transporting.</p>`
                : '<span class="ymca-dim">Nothing of yours is in status 5 right now.</span>';
        } catch (err) {
            list.innerHTML = `<span class="ymca-bad">Your fleet could not be read (${
                ctx.esc(err.message)}).</span>`;
        }
    };
    paint();

    const last = ctx.store.read('lastRun', null);
    el.querySelector('#hf-last').innerHTML = last
        ? `Last transport page seen ${ctx.esc(new Date(last.at).toLocaleString())}:
       ${last.destinations} destinations,
       ${last.namesNextVehicle ? 'the page named a next vehicle'
        : '<b>the page named no next vehicle</b>, so there was nowhere to go on to'},
       ${last.sortableColumns.length
        ? `sortable by ${ctx.esc(last.sortableColumns.join(', '))}`
        : 'no column read as a number'}.`
        : 'No transport page seen yet. Open a vehicle that is transporting.';

    const wait = el.querySelector('[data-wait]');
    const shows = el.querySelector('[data-wait-shows]');
    const sayWait = () => { shows.textContent = `${wait.value} ms`; };
    sayWait();
    wait.addEventListener('input', sayWait);
    wait.addEventListener('change', () => {
        ctx.store.write('cfg', { ...hfCfg(ctx), closeAfter: Number(wait.value) });
        ctx.status(`Closing after ${wait.value} ms.`);
    });

    el.querySelectorAll('[data-cfg]').forEach((box) => {
        box.checked = hfCfg(ctx)[box.dataset.cfg] !== false;
        box.addEventListener('change', () => {
            ctx.store.write('cfg', { ...hfCfg(ctx), [box.dataset.cfg]: box.checked });
            ctx.status(box.checked ? 'On.' : 'Off.');
        });
    });

    el.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-do]');
        if (!btn) return;
        if (btn.dataset.do === 'again') { paint(); return; }
        if (btn.dataset.do === 'capture') {
            const report = { ymca: YMCA.version, what: 'highfive-window', at: new Date().toISOString(), onVehiclePage, ...hfCapturePage() };
            ctx.store.write('lastCapture', report);
            ctx.log.info('captured a vehicle window', report.path);
            ctx.clipboard(JSON.stringify(report, null, 2), 'the vehicle window\u2019s structure');
            return;
        }
        if (btn.dataset.do === 'fleet') {
            ctx.status('Reading your fleet\u2026');
            try {
                const vehicles = await ctx.game('/api/vehicles');
                const report = { ymca: YMCA.version, what: 'highfive-fleet', at: new Date().toISOString(), transporting: hfTransporting(vehicles).length, ...hfCaptureFleet(vehicles || []) };
                ctx.store.write('lastFleet', report);
                ctx.clipboard(JSON.stringify(report, null, 2), 'what your fleet says about status');
            } catch (err) {
                ctx.status('The fleet could not be read.');
                ctx.log.error('fleet capture failed', err.message);
            }
        }
    });
}

/* ------------------------------------------------- going to the next one */

/**
 * Where the jump is remembered between two page loads.
 *
 * sessionStorage rather than a variable, because the pick navigates: the page
 * that reads this is not the page that wrote it. It is one-shot and it expires,
 * so a flag left behind by a click the player thought better of cannot take
 * over a navigation two minutes later.
 */
const HF_JUMP_KEY = 'ymca-highfive-jump';
const HF_JUMP_GOOD_FOR = 30e3;

function hfCfg(ctx) {
    return ctx.store.read('cfg', { advance: true });
}

function hfArmJump(href) {
    try {
        sessionStorage.setItem(HF_JUMP_KEY, JSON.stringify({
            href, path: new URL(href, location.origin).pathname, at: Date.now(),
        }));
    } catch (e) { /* private window: the jump simply does not happen */ }
}

function hfTakeJump() {
    let held = null;
    try {
        held = JSON.parse(sessionStorage.getItem(HF_JUMP_KEY));
        // Taken, not read: one-shot, so a jump that fails cannot loop.
        sessionStorage.removeItem(HF_JUMP_KEY);
    } catch (e) {
        return null;
    }
    if (!held || Date.now() - held.at > HF_JUMP_GOOD_FOR) return null;
    return held;
}

/* ------------------------------------------- sorting what the page gave us */

/**
 * A number out of a cell, whichever way this game writes them.
 *
 * `2.79` is a distance and `1.450` is a thousand and a half, and both turn up
 * in the same table. A dot before exactly three digits at the end is a
 * thousands separator; anything else is a decimal point. Decided per value,
 * which is safe because a column holds one kind of thing.
 */
function hfNum(text) {
    const m = /-?\d[\d.,]*/.exec(String(text || ''));
    if (!m) return null;
    let t = m[0];
    if (/^-?\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, '');
    else t = t.replace(',', '.');
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

/** Every table holding destinations. There can be more than one. */
function hfTables() {
    const seen = new Set();
    for (const a of document.querySelectorAll(HF_PICK_LINK)) {
        const t = a.closest('table');
        if (t) seen.add(t);
    }
    return [...seen];
}

const hfRowsOf = (table) => [...table.querySelectorAll('tr')]
    .filter((tr) => tr.querySelector(HF_PICK_LINK));

/**
 * What this table's columns are called and which of them hold numbers.
 *
 * ASKED OF THE PAGE, NOT GUESSED. Which cell carries the distance cannot be
 * found by name — not one row carries a class — so the table is asked instead:
 * its own headers name the columns, and a column counts as sortable when most
 * of its cells read as a number. That way a column this has never heard of
 * sorts just as well, and a game update that adds one needs no change here.
 */
/**
 * Which column is the distance, by the name the table gives it.
 *
 * A number cannot say whether it is kilometres or a price, so the heading is
 * asked — the one place the page does say. The vocabulary is small and read
 * off real tables, English and German both, because this game leaks German
 * (`gefangener`, `gw_gefahrgut`). A heading that matches nothing is not a
 * failure: the list keeps the game's own order and the panel says so, and the
 * capture carries the headings so the next spelling can be added rather than
 * guessed at.
 */
const HF_DISTANCE_WORDS = /distan|entfernung|abstand|\bkm\b|\bmiles?\b|\bmi\b/i;

function hfColumns(table) {
    const rows = hfRowsOf(table);
    if (!rows.length) return [];
    const heads = [...table.querySelectorAll('thead th, thead td')];
    const width = Math.max(...rows.map((r) => r.cells.length));
    const out = [];
    for (let i = 0; i < width; i += 1) {
        const values = rows.map((r) => (r.cells[i]?.textContent || '').trim());
        const numbers = values.filter((v) => hfNum(v) !== null).length;
        if (numbers < Math.max(2, Math.ceil(rows.length * 0.6))) continue;
        // All one value is a column nobody would sort by.
        if (new Set(values).size < 2) continue;
        const label = (heads[i]?.textContent || '').replace(/\s+/g, ' ').trim();
        out.push({
            index: i,
            label: label || `Column ${i + 1}`,
            distance: HF_DISTANCE_WORDS.test(label),
        });
    }
    return out;
}

/**
 * Which rows belong to which half of the list.
 *
 * `#own-hospitals` and `#alliance-hospitals` are in the page, but whether they
 * are the container or the heading above it is not something a capture said.
 * So both shapes are handled: if the element holds destinations it is the
 * container, otherwise the next thing after it that does. Neither, and the
 * control is not offered at all rather than offered and doing nothing.
 */
function hfSectionRows(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    let holder = el.querySelector(HF_PICK_LINK) ? el : null;
    for (let n = holder ? null : el.nextElementSibling; n; n = n.nextElementSibling) {
        if (n.querySelector(HF_PICK_LINK)) { holder = n; break; }
    }
    if (!holder) return null;
    return new Set([...holder.querySelectorAll(HF_PICK_LINK)]
        .map((a) => a.closest('tr')).filter(Boolean));
}

/** Sort, then hide what the player did not ask to see. */
function hfApply(ctx, cfg) {
    const own = hfSectionRows('own-hospitals');
    const alliance = hfSectionRows('alliance-hospitals');
    let shown = 0;

    for (const table of hfTables()) {
        const rows = hfRowsOf(table);
        if (!rows.length) continue;

        const column = hfColumns(table).find((c) => c.label === cfg.sortBy);
        if (column) {
            const key = (tr) => hfNum(tr.cells[column.index]?.textContent);
            const sorted = [...rows].sort((a, b) => {
                const x = key(a);
                const y = key(b);
                if (x === null) return 1;      // unreadable rows go last, either way
                if (y === null) return -1;
                return cfg.sortDown ? y - x : x - y;
            });
            const parent = sorted[0].parentElement;
            // Only within one parent: a row moved between tbodies would leave
            // the game's own grouping behind it.
            for (const tr of sorted) if (tr.parentElement === parent) parent.append(tr);
        }

        for (const tr of hfRowsOf(table)) {
            let hide = false;
            if (cfg.who === 'own' && own) hide = !own.has(tr);
            if (cfg.who === 'alliance' && alliance) hide = !alliance.has(tr);
            /* THE RANGE IS A CEILING ON THE COLUMN BEING SORTED BY, not a
             * distance this knows the units of. Sort by distance and "at most
             * 20" is twenty of whatever that column counts in; sort by price
             * and it is a price. The page names the column and the player
             * names the number, so neither has to be guessed — and a row whose
             * cell cannot be read is never hidden by it. */
            if (!hide && column && cfg.max > 0) {
                const value = hfNum(tr.cells[column.index]?.textContent);
                if (value !== null && value > cfg.max) hide = true;
            }
            if (!hide && cfg.limit && shown >= cfg.limit) hide = true;
            tr.style.display = hide ? 'none' : '';
            if (!hide) shown += 1;
        }
    }
    ctx.log.info('destinations filtered', `${shown} shown, by ${cfg.sortBy || 'page order'}`);
    return shown;
}

/**
 * On a vehicle waiting for a destination: the controls, and remembering where
 * "next" points.
 *
 * The click is only listened to. It is never taken over, never prevented and
 * never repeated as a fetch — the player's own click is what assigns the
 * hospital, and that cannot be undone.
 */
function hfOnPickPage(ctx) {
    if (document.getElementById('hf-bar')) return true;
    const link = document.querySelector(HF_PICK_LINK);
    if (!link) return false;

    const next = document.querySelector(HF_NEXT);
    const columns = hfTables().flatMap(hfColumns);

    /* NEAREST FIRST, AND FIFTY OF WHATEVER THAT COLUMN COUNTS IN.
     *
     * The game's own order puts your own hospitals above nearer ones, which is
     * not an order anybody driving there would choose. So the first time a
     * transport page is opened the sort is set to the distance column and a
     * ceiling of fifty goes with it — sending an ambulance across the map is a
     * mistake you only notice afterwards, and a default that cannot make it is
     * worth more than one that can be changed.
     *
     * Only ever the first time: `sortBy` being undefined is what "nobody has
     * chosen yet" looks like, and an empty string is a choice. */
    const cfg = hfCfg(ctx);
    if (cfg.sortBy === undefined) {
        const nearest = columns.find((c) => c.distance);
        cfg.sortBy = nearest ? nearest.label : '';
        if (nearest && cfg.max === undefined) cfg.max = 50;
        ctx.store.write('cfg', cfg);
        ctx.log.info('first transport page', nearest
            ? `sorted by ${nearest.label}, at most ${cfg.max}`
            : 'no column in this table names itself a distance');
    }
    const haveSections = !!(hfSectionRows('own-hospitals') || hfSectionRows('alliance-hospitals'));
    const total = document.querySelectorAll(HF_PICK_LINK).length;

    /* The game's own Bootstrap, never YMCA's role classes: this is the game's
     * page and it has to follow it into whatever theme it is wearing. */
    const bar = document.createElement('div');
    bar.id = 'hf-bar';
    bar.className = 'alert alert-info';
    bar.style.margin = '6px 0';
    bar.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
      <b>HighFive</b>
      <label style="font-weight:400;margin:0;cursor:pointer">
        <input type="checkbox" id="hf-advance" ${cfg.advance !== false ? 'checked' : ''}>
        Go straight to the next transport</label>
      ${next ? `<a class="btn btn-xs btn-success" id="hf-next"
        href="${next.getAttribute('href')}">Next transport</a>`
        : '<span style="opacity:.75">This is the last transport.</span>'}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:7px">
      ${columns.length ? `<label style="font-weight:400;margin:0">Sort by
        <select id="hf-sort" class="input-sm">
          <option value="">the page's own order</option>
          ${columns.map((c) => `<option value="${ctx.esc(c.label)}"${
        c.label === cfg.sortBy ? ' selected' : ''}>${ctx.esc(c.label)}</option>`).join('')}
        </select></label>
      <label style="font-weight:400;margin:0;cursor:pointer">
        <input type="checkbox" id="hf-down" ${cfg.sortDown ? 'checked' : ''}> biggest first</label>`
        : '<span style="opacity:.75">No column in this table reads as a number.</span>'}
      ${columns.length ? `<label style="font-weight:400;margin:0">At most
        <input type="number" id="hf-max" min="0" step="1" style="width:74px"
          value="${cfg.max > 0 ? Number(cfg.max) : ''}" placeholder="any"
          ${cfg.sortBy ? '' : 'disabled title="pick a column to sort by first"'}>
        <span style="opacity:.75">${ctx.esc(cfg.sortBy || '\u2014')}</span></label>` : ''}
      <label style="font-weight:400;margin:0">Show
        <select id="hf-limit" class="input-sm">
          ${[0, 5, 10, 20, 40].map((n) => `<option value="${n}"${n === (cfg.limit || 0)
        ? ' selected' : ''}>${n ? `the first ${n}` : `all ${total}`}</option>`).join('')}
        </select></label>
      ${haveSections ? `<label style="font-weight:400;margin:0">
        <select id="hf-who" class="input-sm">
          ${[['all', 'Yours and the alliance\u2019s'], ['own', 'Yours only'],
        ['alliance', 'The alliance\u2019s only']].map(([v, t]) => `<option value="${v}"${
        v === (cfg.who || 'all') ? ' selected' : ''}>${t}</option>`).join('')}
        </select></label>` : ''}
      <span style="opacity:.75" id="hf-count"></span>
    </div>`;

    /* Above whatever holds the destinations. `before()` needs a parent, so a
     * table sitting directly in <body> falls back to going in at the top. */
    const holder = link.closest('table') || link.closest('div');
    if (holder && holder.parentElement) holder.before(bar);
    else document.body.prepend(bar);

    const read = () => ({
        ...hfCfg(ctx),
        advance: bar.querySelector('#hf-advance').checked,
        sortBy: bar.querySelector('#hf-sort')?.value || '',
        sortDown: !!bar.querySelector('#hf-down')?.checked,
        limit: Number(bar.querySelector('#hf-limit').value) || 0,
        max: Number(bar.querySelector('#hf-max')?.value) || 0,
        who: bar.querySelector('#hf-who')?.value || 'all',
    });
    const redraw = () => {
        const now = read();
        ctx.store.write('cfg', now);
        /* The ceiling belongs to whichever column is being sorted by, so it
         * follows the sort rather than being fixed when the bar was drawn —
         * a box that stays greyed out after you pick a column is a box that
         * looks broken. */
        const max = bar.querySelector('#hf-max');
        if (max) {
            max.disabled = !now.sortBy;
            max.title = now.sortBy ? '' : 'pick a column to sort by first';
            max.nextElementSibling.textContent = now.sortBy || '\u2014';
        }
        const shown = hfApply(ctx, now);
        bar.querySelector('#hf-count').textContent = shown < total
            ? `${shown} of ${total} shown` : '';
    };
    bar.addEventListener('change', redraw);
    // A number field only fires `change` when it loses focus, and a range you
    // have to click away from to see is a range nobody trusts.
    bar.addEventListener('input', (e) => {
        if (e.target.id !== 'hf-max') return;
        redraw();
    });
    redraw();

    document.addEventListener('click', (e) => {
        const picked = e.target.closest(HF_PICK_LINK);
        if (!picked || hfCfg(ctx).advance === false) return;
        const href = document.querySelector(HF_NEXT)?.getAttribute('href');
        if (!href) { ctx.log.info('picked, but the page names no next vehicle'); return; }
        hfArmJump(href);
        ctx.log.info('picked a destination, next is armed', href);
    }, true);

    /* Why it did or did not advance, without anybody having to describe it.
     * "It does not go to the next one" has four different causes and only one
     * of them is a bug. */
    ctx.store.write('lastRun', {
        at: new Date().toISOString(),
        path: hfShape(location.pathname),
        inFrame: window.top !== window.self,
        destinations: total,
        namesNextVehicle: !!next,
        sortableColumns: columns.map((c) => c.label),
        sectionsFound: haveSections,
        advance: cfg.advance !== false,
    });
    return true;
}

/**
 * The page a pick lands on says so itself.
 *
 * THE FLAG WAS THE WRONG MECHANISM. Remembering where "next" pointed, then
 * reading it back after the navigation, has four ways to fail quietly and no
 * way to say which one happened. The capture ended that: picking a destination
 * lands on `/vehicles/<id>/patient/<hospital>` — a page with no destinations,
 * no tables and `#next-vehicle-fms-5` already on it. **The page is the proof.**
 * Nothing has to be remembered across the navigation and nothing can expire.
 *
 * "Leave without transport" is the same path with a negative hospital id, so it
 * moves on the same way.
 */
/**
 * Nothing left to do: close the window.
 *
 * A second on the pick page with no navigation is the game saying there is no
 * next transport — the button it would have put there is not there. Escape is
 * what the player would press, so Escape is what is pressed, on the top
 * document as well because the vehicle window is a frame inside the map's own
 * lightbox. No function of the game's is called by name: nothing here has seen
 * one, and a wrong guess would be a dead button rather than an honest one.
 */
function hfCloseWindow(ctx) {
    if (!HF_PICKED.test(location.pathname)) return;   // something moved us on after all
    const press = (doc) => {
        for (const type of ['keydown', 'keyup']) {
            doc.dispatchEvent(new KeyboardEvent(type, {
                key: 'Escape', code: 'Escape', keyCode: 27, which: 27,
                bubbles: true, cancelable: true,
            }));
        }
    };
    try {
        if (window.top !== window.self) press(window.top.document);
    } catch (e) { /* a frame from somewhere else is not ours to close */ }
    press(document);
    ctx.log.info('nothing left in status 5, pressed Escape');
}

/* Half of what it was. It waits only to be sure nothing navigated us on, and
 * every tenth of a second of that is one the player spends looking at a page
 * they are done with. The slider in the settings is how the right number gets
 * found; whatever comes back, a little is added back as a buffer. */
const HF_CLOSE_DEFAULT = 500;

function hfAfterPick(ctx) {
    if (!HF_PICKED.test(location.pathname)) return false;
    const next = document.querySelector(HF_NEXT);
    const href = next?.getAttribute('href');
    ctx.store.write('lastPick', {
        at: new Date().toISOString(),
        path: hfShape(location.pathname),
        inFrame: window.top !== window.self,
        namesNextVehicle: !!href,
        advance: hfCfg(ctx).advance !== false,
    });
    if (hfCfg(ctx).advance === false) {
        ctx.log.info('picked, but advancing is switched off');
        return true;
    }
    if (!href) {
        ctx.log.info('picked, and this page names no next vehicle');
        if (hfCfg(ctx).closeWhenDone !== false) {
            const wait = Number(hfCfg(ctx).closeAfter);
            setTimeout(() => hfCloseWindow(ctx),
                Number.isFinite(wait) && wait >= 0 ? wait : HF_CLOSE_DEFAULT);
        }
        return true;
    }
    if (new URL(href, location.origin).pathname === location.pathname) return true;
    ctx.log.info('picked, going to the next transport', href);
    location.href = href;
    return true;
}

/** The older route: a flag armed before the click, for a landing page that
 * carries no button of its own. Harmless where the page above answered. */
function hfFollowJump(ctx) {
    const jump = hfTakeJump();
    if (!jump) return;
    if (location.pathname === jump.path) {
        // The game landed there itself. Jumping again would skip a vehicle.
        ctx.log.info('already on the next vehicle, not jumping');
        return;
    }
    ctx.log.info('going to the next transport', jump.path);
    location.href = jump.href;
}

const HF_BUTTON_ID = 'ymca-hf-btn';

/**
 * On and off beside the game's own Alliance Radio.
 *
 * `#alliance_radio_on` sits in a `.flex-fixed-size` with its Off twin, and a
 * switch for "does it move me on by itself" belongs next to the other switch
 * about what happens without you. It is the same `advance` setting the panel
 * on the transport page carries — one thing, two places to reach it.
 */
function hfPaintButton(ctx) {
    const btn = document.getElementById(HF_BUTTON_ID);
    if (!btn) return;
    const on = hfCfg(ctx).advance !== false;
    btn.className = `btn btn-xs pull-right ${on ? 'btn-success' : 'btn-danger'}`;
    btn.textContent = `HighFive: ${on ? 'On' : 'Off'}`;
}

function hfMountButton(ctx) {
    if (document.getElementById(HF_BUTTON_ID)) return true;
    const radio = document.getElementById('alliance_radio_on')
        || document.getElementById('alliance_radio_off');
    if (!radio || !radio.parentElement) return false;

    const btn = document.createElement('a');
    btn.id = HF_BUTTON_ID;
    btn.href = '#';
    btn.setAttribute('role', 'button');
    btn.title = 'Go straight to the next transport after you pick a destination';
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        ctx.store.write('cfg', { ...hfCfg(ctx), advance: hfCfg(ctx).advance === false });
        hfPaintButton(ctx);
        ctx.log.info(`advance ${hfCfg(ctx).advance === false ? 'off' : 'on'} from the radio row`);
    });
    radio.parentElement.append(btn);
    hfPaintButton(ctx);
    return true;
}

YMCA.inject('highfive', (ctx) => {
    /* The page a pick lands on is the first thing asked about, because it is
     * the one that proves a pick happened. */
    if (hfAfterPick(ctx)) return true;
    hfFollowJump(ctx);
    /* Falsy, not true: a page that is not a vehicle is not a job done. The
     * player can switch HighFive on while looking at the map and open a
     * transport a moment later, and marking it finished here would mean the
     * bar never appeared until the next reload. */
    if (/^\/vehicles\/\d+/.test(location.pathname)) return hfOnPickPage(ctx);
    /* Everywhere else the switch beside the radio is placed, but this is never
     * finished here: a page that is not a transport page is not a job done, and
     * the map can still become one without a fresh document. */
    hfMountButton(ctx);
    return false;
});

YMCA.register({
    id: 'highfive',
    title: 'HighFive',
    tagline: 'Click through the transports',
    description: 'Picks a hospital or a prison for every vehicle in status 5, one after the '
        + 'next. It does not work yet — the game’s own window has not been seen from '
        + 'this side.',

    /* An element tile, so it is never in the launcher: its work happens in the
     * game's own pages, and a tile on the front would open a panel that does
     * nothing. Off until it does something. */
    mainTile: false,
    optional: true,
    /* On. It stopped being a promise the moment the game's own
     * #next-vehicle-fms-5 turned out to exist. */
    defaultOn: true,

    onSwitch(on, ctx) {
        if (!on) document.getElementById(HF_BUTTON_ID)?.remove();
        else hfMountButton(ctx);
    },

    async mount(el, ctx) { hfPanel(el, ctx); },
    settings(el, ctx) { hfPanel(el, ctx); },
});
