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
      <div class="ymca-note warn"><b>Not working yet.</b> Everything below is settings and a
        way to send the one thing that is missing. Turning it on does nothing until the mission
        window has been read once.</div>

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
        <b>What is needed to build it</b>
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
 * Structure is what is needed — which container holds the requirements, how the
 * vehicle rows are marked up, what the alarm control is. Mission text, street
 * names and player names are not, so they are not taken.
 */
function captureMissionWindow() {
    const CANDIDATES = [
        '#mission_general_info', '#missing_text', '.mission_header', '#mission_vehicle_driving',
        '#vehicle_show_table_all', '#vehicle_show_table_body', 'table.vehicle_table',
        '#mission_vehicle_amount', '.alert-missing-vehicles', '#mission_aao_group',
        'form#vehicle_select', 'input[name="vehicle_ids[]"]', '.aao', '#vehicle_list',
    ];
    const seen = CANDIDATES.filter((sel) => !!document.querySelector(sel));

    const describe = (el, depth = 0) => {
        if (!el || depth > 3) return null;
        return {
            tag: el.tagName.toLowerCase(),
            id: el.id || undefined,
            class: el.className && typeof el.className === 'string'
                ? el.className.slice(0, 120) : undefined,
            children: [...el.children].slice(0, 8)
                .map((c) => describe(c, depth + 1)).filter(Boolean),
        };
    };

    // The vehicle list is the part that matters most: how a row is identified,
    // and what the checkbox is called.
    const row = document.querySelector('#vehicle_show_table_body tr, table.vehicle_table tbody tr');
    const checkbox = document.querySelector('input[type=checkbox][name*="vehicle"], .vehicle_checkbox');

    return {
        note: 'structure only — no mission text, addresses or player names',
        url: location.pathname,
        looksLikeMissionWindow: /\/missions?\//.test(location.pathname)
            || !!document.querySelector('#mission_general_info, #missing_text'),
        found: seen,
        missing: CANDIDATES.filter((sel) => !seen.includes(sel)),
        vehicleRow: row ? {
            outline: describe(row),
            cellCount: row.cells?.length,
            dataAttributes: Object.keys(row.dataset || {}),
        } : 'no vehicle row found',
        checkbox: checkbox ? {
            name: checkbox.name, class: checkbox.className,
            dataAttributes: Object.keys(checkbox.dataset || {}),
        } : 'no vehicle checkbox found',
        alarmControls: [...document.querySelectorAll('input[type=submit], button[type=submit], .btn-success')]
            .slice(0, 6).map((b) => ({
                tag: b.tagName.toLowerCase(), type: b.type, name: b.name || undefined,
                class: typeof b.className === 'string' ? b.className.slice(0, 80) : undefined,
                text: (b.value || b.textContent || '').trim().slice(0, 30),
            })),
        requirementBlocks: [...document.querySelectorAll('#missing_text, .missing_text, #mission_general_info')]
            .map((e) => ({ id: e.id, class: e.className, childTags: [...e.children].map((c) => c.tagName) })),
    };
}
