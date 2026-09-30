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
const SE_BUTTON_ID = 'ymca-shuteye-btn';

/** The three states the game paints a mission panel in. */
const SE_STATES = ['red', 'yellow', 'green'];

/**
 * THE GRADIENT CAME OFF WITH THE BOX.
 *
 * `display: contents` is what lets the heading's children lay out in the panel,
 * and the price is the heading's own box — its gradient, its text colour and
 * its bottom rule all go with it, which left a flat white strip where the
 * game had something worth looking at. Worse, the gradient is how a panel says
 * red, yellow or green, so losing it lost the state as well.
 *
 * So it is read back off the game, the way the palette in the shell was:
 * `getComputedStyle` on one heading of each state, moved onto the panel itself.
 * Nothing is invented and the three colours keep meaning what they meant. A
 * state that is not on screen right now is simply not sampled this time, and
 * what was learnt before is remembered — so after a few page loads all three
 * are known, and a game update repaints them without anybody editing a hex.
 */
function seSample(ctx) {
    const looks = ctx.store.read('looks', {});
    let changed = false;
    for (const state of SE_STATES) {
        const head = document.querySelector(`.panel.mission_panel_${state} > .panel-heading`);
        if (!head) continue;
        const cs = getComputedStyle(head);
        const look = {
            color: cs.color,
            background: cs.backgroundColor,
            image: cs.backgroundImage,
            border: `${cs.borderBottomWidth} ${cs.borderBottomStyle} ${cs.borderBottomColor}`,
        };
        if (JSON.stringify(looks[state]) !== JSON.stringify(look)) {
            looks[state] = look;
            changed = true;
        }
    }
    if (changed) ctx.store.write('looks', looks);
    return looks;
}

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
/**
 * WHAT THE CALL IS LISTED AT, ON THE PANEL ITSELF.
 *
 * A panel carries `mission_type_id` as a plain attribute, and that is the key
 * straight into `/einsaetze.json`, where `average_credits` is the game's own
 * figure. So the number is a reading rather than anything measured here — it
 * is what TrackOps calls **Listed**, and it is marked `≈` on the panel for
 * exactly that reason.
 *
 * IT IS STILL A STYLESHEET. The game redraws a panel's insides constantly, so
 * writing the figure into the markup would mean writing it again every few
 * seconds. The panel element itself survives those redraws, so the figure goes
 * on the panel as an attribute and a `::after` rule shows it: one rule, and
 * the redraw underneath cannot take it off. Only a panel the game has newly
 * added needs stamping, which is what the observer is for and all it does.
 */
const SE_CREDITS_ATTR = 'data-ymca-credits';
let SE_LISTED = null;
let SE_WATCHER = null;

async function seListed(ctx) {
    if (SE_LISTED) return SE_LISTED;
    SE_LISTED = (async () => {
        const list = await ctx.game('/einsaetze.json');
        const by = {};
        for (const m of Array.isArray(list) ? list : []) {
            const paid = Number(m.average_credits);
            if (Number.isFinite(paid) && paid > 0) by[String(m.id)] = paid;
        }
        return by;
    })().catch(() => ({}));
    return SE_LISTED;
}

/** Stamp whatever the game has drawn and nothing else knows about yet. */
function seStamp(ctx, listed) {
    for (const panel of document.querySelectorAll('.panel[id^="mission_panel_"]')) {
        if (panel.hasAttribute(SE_CREDITS_ATTR)) continue;
        /* A plain attribute, not `data-` — the game writes it that way. */
        const type = panel.getAttribute('mission_type_id');
        const paid = type === null ? undefined : listed[String(type)];
        /* A mission type the catalogue does not carry gets no figure rather
         * than a nought: `/einsaetze.json` lists only what this player can
         * generate, so an alliance call from somebody else's building is
         * simply absent and inventing a zero would read as "pays nothing". */
        panel.setAttribute(SE_CREDITS_ATTR, paid ? `\u2248\u2009${ctx.fmt(paid)}` : '');
    }
}

/** Take back what was written, because an attribute outlives a stylesheet. */
function seUnstamp() {
    SE_WATCHER?.disconnect();
    SE_WATCHER = null;
    for (const panel of document.querySelectorAll(`[${SE_CREDITS_ATTR}]`)) {
        panel.removeAttribute(SE_CREDITS_ATTR);
    }
}

async function seWatch(ctx) {
    const listed = await seListed(ctx);
    seStamp(ctx, listed);
    if (SE_WATCHER) return;
    const list = document.getElementById('mission_list') || document.body;
    if (!list) return;
    let due = null;
    SE_WATCHER = new MutationObserver(() => {
        /* The socket redraws these panels several times a second, so the sweep
         * is debounced to the next frame's worth rather than run per mutation. */
        if (due) return;
        due = setTimeout(() => { due = null; seStamp(ctx, listed); }, 250);
    });
    SE_WATCHER.observe(list, { childList: true, subtree: true });
}

function seCss(cfg, looks) {
    const P = '.panel[id^="mission_panel_"]';
    const col = `${P} .panel-body .col-xs-11`;
    const bar = `${col} > div[id^="mission_bar_outer_"]`;
    const back = SE_PARTS.filter((p) => cfg[p.key]).map((p) => `${col} > div[id^="${p.prefix}"]`);

    const count = `${col} > div[id^="mission_overview_countdown_"]`;
    const rules = [
        `${col} > *{display:none !important}`,
        `${[bar, ...back].join(',')}{display:block !important}`,
    ];

    /* GREEN IS THE ONE STATE WHERE THE CLOCK IS THE WHOLE STORY. Every vehicle
     * is there, nothing is missing to read, and what is left to know is how
     * long it still runs. So the countdown comes back on a green panel whatever
     * it is set to elsewhere — one rule, and it follows a panel into green and
     * out again without anything here watching for it. */
    if (cfg.greenClock !== false) {
        rules.push(`${P}.mission_panel_green ${count}{display:inline-block !important}`);
    }
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
            `${bar}{order:6;flex:0 0 ${width}%;margin:0;height:14px}`);
        if (back.length) rules.push(`${back.join(',')}{flex:1 1 100%;order:10}`);
        /* The figure sits between the name and the bar, where the eye already
         * is. It is only drawn where there is one: an empty attribute is no
         * figure, and `content` of nothing draws nothing. */
        if (cfg.credits !== false) {
            rules.push(`${P}[${SE_CREDITS_ATTR}]::after{content:attr(${SE_CREDITS_ATTR});`
                + 'order:5;flex:none;opacity:.75;font-size:12px;white-space:nowrap}');
        }
        /* On one line the countdown is a word beside the bar rather than a row
         * of its own, so it goes after it rather than under it. */
        if (cfg.greenClock !== false) {
            rules.push(`${P}.mission_panel_green ${count}{order:7;flex:none;`
                + 'font-size:12px;white-space:nowrap}');
        }

        /* The heading's own look, put back on the panel now that the heading
         * has no box of its own to wear it. */
        for (const state of SE_STATES) {
            const look = looks?.[state];
            if (!look) continue;
            rules.push(`${P}.mission_panel_${state}{background-color:${look.background};`
                + `background-image:${look.image};color:${look.color};`
                + `border-bottom:${look.border}}`);
        }
    }
    return rules.join('\n');
}

/** Write the rule, or take it away. Both are one element. */
function seApply(ctx) {
    const cfg = seCfg(ctx);
    /* Two switches, and they mean different things: ElementFriend decides
     * whether ShutEye is part of this install at all, and the button on the
     * map decides whether it is folded right now. The first one gates the
     * second, so switching it off takes the button with it. */
    const available = YMCA.isOn('shuteye');
    const folded = available && cfg.on !== false;

    /* An attribute cannot be un-written by a stylesheet going away, so the two
     * edges are both handled here: stamped while it is folded, taken off when
     * it is not. */
    if (folded && cfg.credits !== false) {
        seWatch(ctx).catch((err) => ctx.log.warn('shuteye credits', err.message));
    } else {
        seUnstamp();
    }

    let style = document.getElementById(SE_STYLE_ID);
    if (!folded) style?.remove();
    else {
        if (!style) {
            style = document.createElement('style');
            style.id = SE_STYLE_ID;
            (document.head || document.documentElement).append(style);
        }
        // Sampled before the rule lands, so it reads the game and not itself.
        style.textContent = seCss(cfg, seSample(ctx));
    }

    if (!available) document.getElementById(SE_BUTTON_ID)?.remove();
    sePaintButton(ctx);
}

/**
 * The button, among the game's own mission filters.
 *
 * `#missions-panel-main` is the row that holds Emergency, Patient transports
 * and the rest, so a switch for how that list reads belongs in it rather than
 * two clicks away in a lightbox. It uses the game's own button classes, green
 * for on and plain for off, exactly as the filters beside it do.
 */
function seMountButton(ctx) {
    if (!YMCA.isOn('shuteye')) return false;
    if (document.getElementById(SE_BUTTON_ID)) return true;
    const row = document.getElementById('missions-panel-main');
    if (!row) return false;

    const btn = document.createElement('a');
    btn.id = SE_BUTTON_ID;
    btn.setAttribute('role', 'button');
    btn.href = '';
    btn.title = 'ShutEye — fold the mission list into one line';
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        ctx.store.write('cfg', { ...seCfg(ctx), on: seCfg(ctx).on === false });
        seApply(ctx);
        ctx.log.info(`folded ${seCfg(ctx).on === false ? 'off' : 'on'} from the map`);
    });
    row.append(btn);
    sePaintButton(ctx);
    return true;
}

function sePaintButton(ctx) {
    const btn = document.getElementById(SE_BUTTON_ID);
    if (!btn) return;
    const on = seCfg(ctx).on !== false;
    btn.className = `btn btn-xs mission_selection ${on ? 'btn-success' : 'btn-default'}`;
    btn.innerHTML = `<span class="glyphicon glyphicon-eye-${on ? 'close' : 'open'}"></span>
    ShutEye`;
}

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
        <b>Folded right now</b>
        <label style="display:block;margin-top:7px"><input type="checkbox" data-part="on"
          ${seCfg(ctx).on !== false ? 'checked' : ''}> Fold the mission list</label>
        <p class="ymca-dim" style="margin:6px 0 0;font-size:12px">The same switch sits on the map
          itself, with the game&rsquo;s own Emergency and Patient transport filters, so it can be
          turned off for a moment without opening this.</p>
      </div>

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
      </div>

      <div class="ymca-card">
        <b>On the line itself</b>
        <label style="display:block;margin-top:7px"><input type="checkbox" data-part="credits"
          ${cfg.credits !== false ? 'checked' : ''}> What the call is worth</label>
        <label style="display:block;margin-top:7px"><input type="checkbox" data-part="greenClock"
          ${cfg.greenClock !== false ? 'checked' : ''}> The countdown once every vehicle is
          there</label>
        <p class="ymca-dim" style="margin:8px 0 0;font-size:12px">The figure is the game's own
          average for that kind of call, marked &#8776; because it is what the catalogue lists
          rather than what this one paid. A call the catalogue does not carry &mdash; an alliance
          call from somebody else's building &mdash; simply has none.</p>
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

YMCA.inject('shuteye', (ctx) => {
    /* Only where there are mission panels to quieten. A mission window is not
     * the list, and a stylesheet in there would hide nothing and confuse the
     * next person reading the page. */
    if (window.top !== window.self) return true;
    seApply(ctx);
    /* The rule is written straight away; the button waits for the row that
     * holds the game's own filters, which arrives with the mission list. */
    return seMountButton(ctx);
});
