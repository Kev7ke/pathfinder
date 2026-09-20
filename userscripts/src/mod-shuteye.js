/* --------------------------------------------------------------------------
 * ShutEye — a mission list you can read at a glance.
 *
 * The map's mission panels carry everything the game knows: the missing
 * vehicles line, the patient summary, the prisoner row, the pump progress, the
 * countdown. All of it useful, and all of it at once, which is why a screen
 * with eighteen missions on it is a wall of red text. ShutEye leaves the
 * artwork and the progress bar and folds the rest away.
 *
 * IT IS A STYLESHEET, NOT A SWEEP. The game redraws these panels constantly —
 * they are driven by the same socket that announces a mission ending — so
 * hiding elements one at a time means hiding them again every few seconds, and
 * missing the ones that arrive in between. One rule in one stylesheet applies
 * to a panel the game has not drawn yet.
 *
 * HIDE EVERYTHING, THEN PUT BACK WHAT IS WANTED. Naming the parts to hide means
 * a part the game adds next month is one nobody hid. The column is emptied and
 * the progress bar named back in, so anything new is quiet by default — which
 * is the way round that stays true.
 *
 * The panel is `#mission_panel_<id>`; inside its `.panel-body` the artwork sits
 * in `.col-xs-1` and everything else in `.col-xs-11`, one `<div>` per thing:
 * `mission_overview_countdown_<id>`, `mission_bar_outer_<id>` (the progress
 * bar), `mission_missing_<id>`, `mission_missing_short_<id>`,
 * `mission_pump_progress_<id>`, `mission_patients_<id>` and
 * `mission_prisoners_<id>`.
 * ------------------------------------------------------------------------ */

const SE_STYLE_ID = 'ymca-shuteye';

/** What can be put back, by the id the game gives it. */
const SE_PARTS = [
    { key: 'missing', prefix: 'mission_missing_', label: 'Missing vehicles' },
    { key: 'patients', prefix: 'mission_patients_', label: 'Patients' },
    { key: 'prisoners', prefix: 'mission_prisoners_', label: 'Prisoners' },
    { key: 'countdown', prefix: 'mission_overview_countdown_', label: 'Countdown' },
    { key: 'pump', prefix: 'mission_pump_progress_', label: 'Pump progress' },
];

function seCfg(ctx) {
    return ctx.store.read('cfg', {});
}

function seCss(cfg) {
    const panel = 'div[id^="mission_panel_"] .panel-body .col-xs-11';
    const back = SE_PARTS.filter((p) => cfg[p.key])
        .map((p) => `${panel} > div[id^="${p.prefix}"]`);
    return `${panel} > *{display:none !important}
${[`${panel} > div[id^="mission_bar_outer_"]`, ...back].join(',\n')}{display:block !important}`;
}

/** Write the rule, or take it away. Both are one element. */
function seApply(ctx) {
    const on = YMCA.isOn('shuteye');
    let style = document.getElementById(SE_STYLE_ID);
    if (!on) {
        style?.remove();
        return;
    }
    if (!style) {
        style = document.createElement('style');
        style.id = SE_STYLE_ID;
        (document.head || document.documentElement).append(style);
    }
    style.textContent = seCss(seCfg(ctx));
}

YMCA.inject('shuteye', (ctx) => {
    /* Only where there are mission panels to quieten. A mission window is not
     * the list, and a stylesheet in there would hide nothing and confuse the
     * next person reading the page. */
    if (window.top !== window.self) return true;
    seApply(ctx);
    return true;
});

YMCA.register({
    id: 'shuteye',
    title: 'ShutEye',
    tagline: 'A quieter mission list',
    description: 'Leaves the artwork and the progress bar on every mission panel and folds the '
        + 'rest away, so a screen full of calls reads at a glance.',

    group: 'eagleeye',
    mainTile: false,
    optional: true,
    defaultOn: false,

    /* Switching it off has to take the rule back out, and no reload should be
     * needed for that. */
    onSwitch(on, ctx) { seApply(ctx); },

    settings(el, ctx) {
        const cfg = seCfg(ctx);
        el.innerHTML = `
      <div class="ymca-note">The artwork and the progress bar always stay. Everything else is
        hidden unless you put it back here &mdash; that way round, a panel the game starts
        drawing next month is quiet without anybody having to notice it.</div>
      <div class="ymca-card">
        <b>Keep showing</b>
        <div class="ymca-pick" style="margin-top:8px">
          ${SE_PARTS.map((p) => `<label><input type="checkbox" data-part="${ctx.esc(p.key)}"
            ${cfg[p.key] ? 'checked' : ''}> ${ctx.esc(p.label)}</label>`).join('')}
        </div>
      </div>`;
        el.addEventListener('change', (e) => {
            const box = e.target.closest('[data-part]');
            if (!box) return;
            ctx.store.write('cfg', { ...seCfg(ctx), [box.dataset.part]: box.checked });
            seApply(ctx);
            ctx.status(`${box.checked ? 'Showing' : 'Hiding'} ${box.dataset.part}.`);
        });
    },
});
