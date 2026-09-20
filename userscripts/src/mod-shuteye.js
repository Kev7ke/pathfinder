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

/**
 * ONE LINE, AND THE BOXES IN BETWEEN STEP OUT OF THE WAY.
 *
 * The artwork and the progress bar live in `.panel-body`; the Dispatch button
 * and the mission's name live in `.panel-heading`. They are in different
 * containers, so no amount of flex on either one will interleave them — and
 * moving the nodes with script would have to be done again every time the
 * socket redraws the panel.
 *
 * `display: contents` is what makes it a stylesheet job: it takes away a box
 * and lets its children lay out in the grandparent. Heading, body, the row and
 * both columns all step out, the panel itself becomes the flex row, and then
 * `order` puts them in the line the player asked for — icon, Dispatch, name,
 * bar. Anything put back takes a full line under it rather than squeezing the
 * name, which is what `flex: 1 1 100%` is for.
 *
 * The name is one line with an ellipsis rather than a word count: a word count
 * gives a ragged right edge, and the bar is what wants a predictable width.
 * The address is a second sentence inside the name and goes by default — it is
 * what made the name unreadable in the space left.
 */
function seCss(cfg) {
    const P = '.panel[id^="mission_panel_"]';
    const col = `${P} .panel-body .col-xs-11`;
    const bar = `${col} > div[id^="mission_bar_outer_"]`;
    const back = SE_PARTS.filter((p) => cfg[p.key]).map((p) => `${col} > div[id^="${p.prefix}"]`);

    const rules = [
        `${col} > *{display:none !important}`,
        `${[bar, ...back].join(',')}{display:block !important}`,
    ];
    if (!cfg.address) rules.push(`${P} small[id^="mission_address_"]{display:none}`);

    if (cfg.line !== false) {
        const width = Number(cfg.bar) || 30;
        rules.push(`${P}{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:2px 8px}`,
            `${P} > .panel-heading,${P} > .panel-body,${P} .panel-body > .row,`
            + `${P} .panel-body > .row > .col-xs-1,`
            + `${P} .panel-body > .row > .col-xs-11{display:contents}`,
            `${P} .col-xs-1 img{order:1;flex:none;height:20px;width:auto}`,
            `${P} a[id^="alarm_button_"]{order:2;flex:none}`,
            `${P} span[id^="mission_participant"]{order:3;flex:none}`,
            `${P} a[id^="mission_caption_"]{order:4;flex:1 1 40px;min-width:0;`
            + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            `${bar}{order:5;flex:0 0 ${width}%;margin:0;height:14px}`);
        if (back.length) rules.push(`${back.join(',')}{flex:1 1 100%;order:10}`);
    }
    return rules.join('\n');
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
    description: 'Folds every mission panel into one line \u2014 artwork, Dispatch, the name and '
        + 'the progress bar \u2014 and puts the rest away, so a screen full of calls reads at a '
        + 'glance.',

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
        <b>The one line</b>
        <label style="display:block;margin-top:7px"><input type="checkbox" data-part="line"
          ${cfg.line !== false ? 'checked' : ''}> Artwork, Dispatch, the name and the bar on one
          line</label>
        <label style="display:block;margin-top:7px"><input type="checkbox" data-part="address"
          ${cfg.address ? 'checked' : ''}> Keep the address after the mission name</label>
        <label style="display:block;margin-top:9px">Progress bar
          <select data-width style="margin-left:6px">
            ${[20, 30, 40, 50].map((n) => `<option value="${n}"${n === (Number(cfg.bar) || 30)
        ? ' selected' : ''}>${n}% of the line</option>`).join('')}
          </select></label>
        <p class="ymca-dim" style="margin:8px 0 0;font-size:12px">The name is cut with an
          ellipsis rather than after a set number of words, so the bar keeps the same width on
          every call.</p>
      </div>
      <div class="ymca-card">
        <b>Keep showing</b>
        <p class="ymca-dim" style="margin:4px 0 8px;font-size:12px">Each of these takes a line of
          its own under the mission rather than squeezing the name.</p>
        <div class="ymca-pick">
          ${SE_PARTS.map((p) => `<label><input type="checkbox" data-part="${ctx.esc(p.key)}"
            ${cfg[p.key] ? 'checked' : ''}> ${ctx.esc(p.label)}</label>`).join('')}
        </div>
      </div>`;
        el.addEventListener('change', (e) => {
            const width = e.target.closest('[data-width]');
            if (width) {
                ctx.store.write('cfg', { ...seCfg(ctx), bar: Number(width.value) });
                seApply(ctx);
                ctx.status(`Bar is ${width.value}% of the line.`);
                return;
            }
            const box = e.target.closest('[data-part]');
            if (!box) return;
            ctx.store.write('cfg', { ...seCfg(ctx), [box.dataset.part]: box.checked });
            seApply(ctx);
            ctx.status(`${box.checked ? 'Showing' : 'Hiding'} ${box.dataset.part}.`);
        });
    },
});
