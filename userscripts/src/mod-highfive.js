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
 * WHAT DOES NOT WORK YET IS THE PICKING. The markup of the game's own vehicle
 * window while it is transporting has not been seen — what holds the
 * destinations, what a pick actually is, and what the page does afterwards.
 * Guessing a selector that clicks a destination on somebody's behalf is
 * exactly the thing this repo does not do: a wrong guess sends a patient to
 * the wrong hospital and there is no undo for that. So the list links to each
 * vehicle and stops there, and the capture button collects the missing piece —
 * structure only, never a hospital name, a patient or an address.
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

    <div class="ymca-note warn"><b>Picking for you does not work yet.</b>
      Finding the vehicles does \u2014 that is the list above. What is missing is the markup of
      one of your vehicles <em>while it is transporting</em>, so nothing here can move you on to
      the next one after you have picked. Guessing which link is a hospital would mean guessing
      where a patient goes, and that cannot be taken back.</div>

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
    defaultOn: false,

    async mount(el, ctx) { hfPanel(el, ctx); },
    settings(el, ctx) { hfPanel(el, ctx); },
});
