/* --------------------------------------------------------------------------
 * HighFiveAuto — press the send button too.
 *
 * HighFive already presses the one the game puts there itself: "go to the next
 * vehicle with a transport request". This presses the other one — the
 * destination — so a queue of radio calls works through itself instead of
 * being clicked one hospital at a time.
 *
 * IT IS NOT A WATCHER. Nothing polls the game and nothing opens a window: it
 * only ever acts on a transport page the player is already looking at. Armed,
 * each page picks its destination and goes; the page that lands carries the
 * next vehicle's link and HighFive follows it. When nothing is left, the window
 * closes. Armed from the radio row, the whole queue runs in the lightbox that
 * is already open.
 *
 * THIS WRITES, AND A HOSPITAL CANNOT BE UNASSIGNED. That is the rule this repo
 * does not break lightly, and it is broken here on purpose and on request —
 * the second time, after RecruitRoom, and for the same reason: the clicking it
 * replaces was worse. What stands in for the backup it cannot have:
 *
 *   - it is off until switched on, and it has its own switch in ElementFriend
 *     as well as the one in the radio row, which is red when it is off;
 *   - every page shows the destination it chose and why, and holds for a beat
 *     with a Stop beside it, so a wrong pick is stoppable rather than regretted;
 *   - it never sends beyond the range set for it, and where nothing qualifies
 *     it stands down and leaves the page to the player rather than picking the
 *     least bad thing.
 *
 * WHAT A ROW SAYS, AND WHO SAID SO. The capture gave the shape — two tables,
 * `#own-hospitals` and `#alliance-hospitals`, six headings over seven cells, so
 * matching a column by the label above it is one out from the fourth one on.
 * Which cell is which came from the player pasting a row:
 *
 *   name | 0.75 km | 29 / 30 | 0 % | <span class="label">No</span> | Transport | (empty)
 *
 * So each cell is read for what it looks like rather than for where it sits: a
 * distance carries its unit, free beds are `n / n`, tax ends in `%`, and the
 * department is a label that says Yes or No. A row that answers none of them is
 * left out rather than guessed at.
 * ------------------------------------------------------------------------ */

const HFA_BUTTON_ID = 'ymca-hfa-btn';
const HFA_BAR_ID = 'ymca-hfa-bar';

function hfaCfg(ctx) {
    return ctx.store.read('cfg', {});
}
const hfaMaxKm = (cfg) => (cfg.maxKm > 0 ? Number(cfg.maxKm) : 25);
const hfaHold = (cfg) => (Number.isFinite(Number(cfg.hold)) ? Number(cfg.hold) : 800);

/** One destination, read off its own cells. */
function hfaRead(tr) {
    const link = tr.querySelector(HF_PICK_LINK);
    if (!link) return null;
    const cells = [...tr.cells].map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim());
    /* Cell 0 repeats everything for a narrow screen, so it is never asked for
     * a figure — only for the name, which is its first piece of text. */
    const rest = cells.slice(1);
    const distance = rest.find((t) => HF_DISTANCE_VALUE.test(t));
    const beds = rest.map((t) => /^(\d+)\s*\/\s*(\d+)$/.exec(t)).find(Boolean);
    const tax = rest.map((t) => /^(\d[\d.,]*)\s*%$/.exec(t)).find(Boolean);
    const label = tr.querySelector('.label');
    const said = (label?.textContent || '').trim();
    return {
        row: tr,
        href: link.getAttribute('href'),
        name: (tr.cells[0]?.firstChild?.textContent || cells[0] || '').trim().slice(0, 60),
        km: distance ? hfNum(distance) : null,
        free: beds ? Number(beds[1]) : null,
        tax: tax ? hfNum(tax[1]) : null,
        // Yes, no, or the page did not say — and "did not say" is not "no".
        department: /^(yes|ja)$/i.test(said) ? true : /^(no|nein)$/i.test(said) ? false : null,
    };
}

/**
 * Which one to send to.
 *
 * Treatment first: a patient who can be treated where he lands is the whole
 * point, so a hospital with the department wins over a nearer one without. Only
 * where none of them has it does it become a plain distance case.
 *
 * Then the nearest of those. Then, and only then, the swap: if the nearest
 * charges and there is a free one in the same group, take the free one. That is
 * a saving rather than a detour, because everything here is already inside the
 * range set for it.
 *
 * A hospital with no free bed is not a destination, and a row whose distance
 * cannot be read is left out rather than assumed to be near.
 */
function hfaChoose(rows, cfg) {
    const limit = hfaMaxKm(cfg);
    const usable = rows.filter((r) => r.href && r.km !== null && r.km <= limit
        && (r.free === null || r.free > 0));
    if (!usable.length) return null;

    const treating = usable.filter((r) => r.department === true);
    const pool = treating.length ? treating : usable;
    const byDistance = pool.slice().sort((a, b) => a.km - b.km);
    const nearest = byDistance[0];
    if (!(nearest.tax > 0)) return { pick: nearest, why: 'nearest', pool: pool.length, treating: treating.length };

    const free = byDistance.find((r) => r.tax === 0);
    return free
        ? { pick: free, why: 'nearest free', pool: pool.length, treating: treating.length }
        : { pick: nearest, why: 'nearest', pool: pool.length, treating: treating.length };
}

/* ------------------------------------------------------------- the sending */

let hfaArmed = false;

function hfaSay(ctx, html, bad) {
    let bar = document.getElementById(HFA_BAR_ID);
    if (!bar) {
        bar = document.createElement('div');
        bar.id = HFA_BAR_ID;
        bar.style.margin = '6px 0';
        const anchor = document.getElementById('hf-bar')
            || document.querySelector(HF_PICK_LINK)?.closest('table');
        if (anchor && anchor.parentElement) anchor.before(bar);
        else document.body.prepend(bar);
    }
    bar.className = `alert ${bad ? 'alert-warning' : 'alert-success'}`;
    bar.innerHTML = html;
    return bar;
}

/** On a transport page with Auto on: choose, show it, hold, then go. */
function hfaRun(ctx) {
    if (hfaArmed) return true;
    if (hfaCfg(ctx).auto !== true) return false;
    const rows = hfAllRows().map(hfaRead).filter(Boolean);
    if (!rows.length) return false;

    const cfg = hfaCfg(ctx);
    const choice = hfaChoose(rows, cfg);
    if (!choice) {
        hfaSay(ctx, `<b>HighFive Auto stood down.</b> Nothing within
      ${ctx.esc(String(hfaMaxKm(cfg)))} with a free bed. Pick one yourself.`, true);
        ctx.log.warn('nothing within range', `${rows.length} destinations`);
        return true;
    }

    const { pick, why, treating } = choice;
    hfaArmed = true;
    const hold = hfaHold(cfg);
    const bar = hfaSay(ctx, `<b>HighFive Auto</b> &rarr; ${ctx.esc(pick.name)}
    &middot; ${ctx.esc(String(pick.km))} away${pick.tax !== null
        ? ` &middot; ${ctx.esc(String(pick.tax))}% tax` : ''}${pick.free !== null
        ? ` &middot; ${ctx.esc(String(pick.free))} free` : ''}
    &middot; ${treating ? 'can treat' : 'no department, so distance only'} (${ctx.esc(why)})
    <a href="#" id="hfa-stop" class="btn btn-xs btn-danger" style="margin-left:10px">Stop</a>`);

    let cancelled = false;
    bar.querySelector('#hfa-stop').addEventListener('click', (e) => {
        e.preventDefault();
        cancelled = true;
        hfaArmed = false;
        ctx.store.write('cfg', { ...hfaCfg(ctx), auto: false });
        hfaPaintButton(ctx);
        hfaSay(ctx, '<b>Stopped.</b> Auto is off; pick this one yourself.', true);
        ctx.log.info('stopped by the player');
    });

    setTimeout(() => {
        if (cancelled || hfaCfg(ctx).auto !== true) return;
        ctx.log.info('sending', `${pick.km} away, ${why}`);
        location.href = pick.href;
    }, hold);
    return true;
}

/* -------------------------------------------------------------- the switch */

function hfaPaintButton(ctx) {
    const btn = document.getElementById(HFA_BUTTON_ID);
    if (!btn) return;
    const on = hfaCfg(ctx).auto === true;
    btn.className = `btn btn-xs pull-right ${on ? 'btn-success' : 'btn-danger'}`;
    btn.textContent = `Auto: ${on ? 'On' : 'Off'}`;
}

function hfaMountButton(ctx) {
    if (document.getElementById(HFA_BUTTON_ID)) return true;
    const beside = document.getElementById('ymca-hf-btn')
        || document.getElementById('alliance_radio_on')
        || document.getElementById('alliance_radio_off');
    if (!beside || !beside.parentElement) return false;

    const btn = document.createElement('a');
    btn.id = HFA_BUTTON_ID;
    btn.href = '#';
    btn.setAttribute('role', 'button');
    btn.title = 'Pick the destination as well, by treatment then distance — it cannot be undone';
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const next = hfaCfg(ctx).auto !== true;
        if (next && !confirm('HighFive Auto picks the hospital or cell for every transport you '
            + 'open and sends it.\n\nIt goes for one that can treat the patient, then the '
            + `nearest, then a free one over a paying one, and never further than `
            + `${hfaMaxKm(hfaCfg(ctx))}.\n\nA transport cannot be taken back. Turn it on?`)) return;
        ctx.store.write('cfg', { ...hfaCfg(ctx), auto: next });
        hfaPaintButton(ctx);
        ctx.log.info(`auto ${next ? 'on' : 'off'}`);
    });
    beside.parentElement.append(btn);
    hfaPaintButton(ctx);
    return true;
}

YMCA.register({
    id: 'highfiveauto',
    title: 'HighFive Auto',
    tagline: 'Press the send button too',
    description: 'Picks the hospital or cell for every transport you open and sends it, so a '
        + 'queue of radio calls works through itself. It writes, and a transport cannot be '
        + 'taken back.',

    mainTile: false,
    optional: true,
    /* Off. Everything else here shows or moves; this one sends. */
    defaultOn: false,

    onSwitch(on, ctx) {
        if (!on) document.getElementById(HFA_BUTTON_ID)?.remove();
        else hfaMountButton(ctx);
    },

    settings(el, ctx) {
        const cfg = hfaCfg(ctx);
        el.innerHTML = `
      <div class="ymca-note bad"><b>This one sends.</b> Every other part of YMCA shows you
        something or moves you somewhere; this presses the button that assigns a hospital, and
        that cannot be taken back. It is off until you switch it on, the button in the radio row
        is red while it is, and every page shows what it chose with a Stop beside it.</div>

      <div class="ymca-card">
        <b>How it chooses</b>
        <ol class="ymca-dim" style="margin:8px 0 0;padding-left:20px">
          <li>Only what is inside the range below, and only where a bed is free.</li>
          <li>A facility that can treat the patient beats a nearer one that cannot. Where none
            of them can, it is a plain distance case.</li>
          <li>The nearest of those.</li>
          <li>If that one charges and a free one is in the same group, the free one &mdash; a
            saving rather than a detour, because both are already inside the range.</li>
        </ol>
      </div>

      <div class="ymca-card">
        <b>Settings</b>
        <label style="display:block;margin-top:8px">Never further than
          <input type="number" data-maxkm min="1" step="1" style="width:74px;margin:0 6px"
            value="${ctx.esc(String(hfaMaxKm(cfg)))}"> of whatever the distance column counts
          in</label>
        <label style="display:block;margin-top:10px">Hold before sending
          <input type="range" data-hold min="0" max="3000" step="100"
            value="${ctx.esc(String(hfaHold(cfg)))}"
            style="vertical-align:middle;width:200px;margin:0 8px">
          <b data-hold-shows></b></label>
        <p class="ymca-dim" style="margin:6px 0 0;font-size:12px">The hold is how long Stop is
          reachable. Nought is as fast as the game allows and leaves nothing to press.</p>
      </div>`;

        const km = el.querySelector('[data-maxkm]');
        km.addEventListener('input', () => {
            ctx.store.write('cfg', { ...hfaCfg(ctx), maxKm: Number(km.value) || 0 });
            ctx.status(`Never further than ${km.value || 25}.`);
        });
        const hold = el.querySelector('[data-hold]');
        const shows = el.querySelector('[data-hold-shows]');
        const say = () => { shows.textContent = `${hold.value} ms`; };
        say();
        hold.addEventListener('input', say);
        hold.addEventListener('change', () => {
            ctx.store.write('cfg', { ...hfaCfg(ctx), hold: Number(hold.value) });
            ctx.status(`Holding ${hold.value} ms.`);
        });
    },
});

YMCA.inject('highfiveauto', (ctx) => {
    if (/^\/vehicles\/\d+/.test(location.pathname)) return hfaRun(ctx);
    hfaMountButton(ctx);
    return false;
});
