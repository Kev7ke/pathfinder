/* --------------------------------------------------------------------------
 * MissionMagician — read a mission window, say which vehicles it wants, and
 * alarm them in one go.
 *
 * NOT BUILT YET, and deliberately so. Doing this properly means writing into
 * the game's own mission window: reading the requirement block, matching it
 * against the vehicles in range, ticking them and pressing alarm. None of that
 * markup has ever been seen from the side this was written on, and guessing at
 * a selector that ticks checkboxes and submits a form is exactly the way to
 * alarm the wrong vehicles.
 *
 * So this module ships as its settings plus one button: open a mission, press
 * "Capture this mission window", and it takes the structure — not the content —
 * of the window back. That is the missing piece.
 *
 * What the first real capture settled. A mission is its own page at
 * /missions/<id>. The dispatch is a plain form: `input[name="vehicle_ids[]"]`
 * checkboxes carrying `data-direct`, `data-distance` and `data-equipment-types`,
 * and an `input[name="commit"]` submit labelled Dispatch, beside `.alert_next`
 * and `.alert_next_alliance`. `#mission_general_info` holds the header and
 * `#missing_text` the missing-vehicle line, as text with no child elements.
 * `.aao` buttons are present; `#mission_aao_group` is not.
 *
 * That is the safe-write shape already: tick the game's own boxes, submit the
 * game's own form. Nothing has to be hand-built.
 *
 * What it did not settle is what *holds* the checkboxes — the table is neither
 * `#vehicle_show_table_body` nor `table.vehicle_table` — and how a row says
 * which vehicle type it is. Both are needed to match a row against the
 * requirements, which come from /einsaetze.json rather than from reading the
 * page's text. So the capture no longer guesses at container names: it walks up
 * from a checkbox and reports what it passes.
 * -------------------------------------------------------------------------- */

YMCA.register({
    id: 'missionmagician',
    title: 'MissionMagician',
    tagline: 'Alarm the right vehicles',

    description: 'Reads a mission window, works out what it needs, and alarms it. '
        + 'Not working yet — it needs the shape of your mission window first.',

    async mount(el, ctx) {
        const cfg = ctx.store.read('cfg', { enabled: false, showTable: true, confirmBeforeAlarm: true });

        el.innerHTML = `
      <div class="ymca-note warn"><b>Not working yet</b>, but half-known now. The first capture
        showed the dispatch is a normal form — the game's own checkboxes and its own Dispatch
        button — so nothing will ever have to be hand-built. What is still missing is what holds
        those checkboxes and how a row says which vehicle type it is. One more capture, below,
        and that is answered.</div>

      <div class="ymca-card">
        <b>Settings</b>
        <p class="ymca-sub" style="margin:4px 0 10px">These are remembered now so they are ready
          when the tool is.</p>
        <label style="display:block;margin:4px 0"><input type="checkbox" data-cfg="enabled"
          ${cfg.enabled ? 'checked' : ''}> Add the helper to mission windows</label>
        <label style="display:block;margin:4px 0"><input type="checkbox" data-cfg="showTable"
          ${cfg.showTable ? 'checked' : ''}> Show required against selected as a table</label>
        <label style="display:block;margin:4px 0"><input type="checkbox" data-cfg="confirmBeforeAlarm"
          ${cfg.confirmBeforeAlarm ? 'checked' : ''}> Show what is selected before alarming</label>
      </div>

      <div class="ymca-card">
        <b>The one capture still needed</b>
        <p class="ymca-sub" style="margin:4px 0 10px">The order matters, because YMCA is a
          lightbox and clicking a mission navigates away from it:</p>
        <ol class="ymca-sub" style="margin:0 0 10px;padding-left:20px">
          <li>Close this window and click a mission in your list, so the mission itself is on
            screen — the page with the vehicle table and the alarm button.</li>
          <li>Open YMCA again from the navbar, <b>on that page</b>, and come back here.</li>
          <li>Press the button.</li>
        </ol>
        <p class="ymca-sub" style="margin:0 0 10px">It copies the <i>structure</i> of that page —
          element names, classes and the shape of the vehicle list — and no mission text,
          addresses or player names.</p>
        <button class="ymca-btn primary" data-do="capture">Capture this mission window</button>
        <span class="ymca-status" id="mm-status"></span>
        <div class="ymca-note warn" id="mm-wrongpage" hidden style="margin-top:10px">
          <b>That was not a mission page.</b> Nothing was copied, because there was nothing on it
          worth sending — the capture found none of the mission markup, only the mission list's
          own category buttons. Do step 1 above first: click a mission so its page is open, and
          only then open YMCA and press this.</div>
        <textarea id="mm-out" rows="12" readonly style="width:100%;margin-top:10px;
          font-family:ui-monospace,monospace;font-size:11.5px"></textarea>
      </div>`;

        el.addEventListener('change', (e) => {
            const key = e.target.dataset.cfg;
            if (!key) return;
            cfg[key] = e.target.checked;
            ctx.store.write('cfg', cfg);
            ctx.status('Saved.');
        });

        el.addEventListener('click', (e) => {
            if (!e.target.closest('[data-do="capture"]')) return;
            const out = el.querySelector('#mm-out');
            const report = captureMissionWindow();
            out.value = JSON.stringify(report, null, 1);
            // A capture taken on the overview page finds nothing and looks like a failure of
            // the game rather than of the moment it was taken. Say which it was.
            const warn = el.querySelector('#mm-wrongpage');
            warn.hidden = report.looksLikeMissionWindow;
            if (report.looksLikeMissionWindow) {
                ctx.clipboard(out.value, 'the mission window structure');
            } else {
                ctx.status('No mission window on this page — nothing worth sending.');
            }
            ctx.log.info('captured mission window',
                report.looksLikeMissionWindow
                    ? `${report.found.length} of ${report.found.length + report.missing.length} selectors found`
                    : 'not on a mission page');
        });
    },
});

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
        // Not yet looked for.
        '#mission_help', '.mission_help', '#vehicle_show_table', '.vehicle_select_table',
    ];
    const seen = CANDIDATES.filter((sel) => !!document.querySelector(sel));

    const classOf = (el) => (typeof el.className === 'string' ? el.className.trim().slice(0, 120) : '');
    /** Digits out, so an id is reported as a shape rather than as a particular thing. */
    const shapeId = (id) => String(id || '').replace(/\d+/g, '#').slice(0, 48);

    const outline = (el) => (el ? { tag: el.tagName.toLowerCase(), id: shapeId(el.id) || undefined, class: classOf(el) || undefined } : null);

    const checkbox = document.querySelector('input[name="vehicle_ids[]"], .vehicle_checkbox');

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
        found: seen,
        missing: CANDIDATES.filter((sel) => !seen.includes(sel)),
        dispatchForm,
        vehicleContainerChain: chain,
        vehicleRow: describeRow(row),
        checkbox: checkbox ? {
            name: checkbox.name,
            class: classOf(checkbox),
            // Names and types, not values: data-distance is a number about where you are.
            dataAttributes: Object.entries(checkbox.dataset || {})
                .map(([k, v]) => `${k}:${/^-?[\d.]+$/.test(v) ? 'number' : 'string'}`),
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
