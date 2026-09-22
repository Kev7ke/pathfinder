/* --------------------------------------------------------------------------
 * MissionMagician Auto — press Dispatch when the table is green.
 *
 * The panel works out what a mission needs and ticks the vehicles that match;
 * the player presses Dispatch. This presses that too — but only after the
 * player has pressed Tick, and only when every line the panel can judge is
 * covered. So the press that sends is still downstream of a press the player
 * made, and the thing it waits for is the table saying it is finished.
 *
 * IT DISPATCHES, AND AN ALARM CANNOT BE TAKEN BACK. That is the rule this repo
 * was built on and it is broken here on purpose and on request — the third
 * deliberate exception, after RecruitRoom and HighFive Auto. What stands in for
 * the backup it cannot have:
 *
 *   - off until switched on, with its own tile in ElementFriend, and a switch
 *     in the panel itself that is only there while the tile is on;
 *   - it fires on a Tick the player pressed, never on a redraw, never on a
 *     mission opening, and never twice for one press;
 *   - **only on a green table**. One line short and it says so and stops, which
 *     is the case the panel exists for;
 *   - a hold with a Stop beside it before it presses anything.
 *
 * WHICH BUTTON. `Dispatch and Next` is `a#alert_next_btn.alert_next`, which
 * posts the form and loads the next mission into the same frame — the one
 * control that keeps a queue moving. Where the page does not carry it, nothing
 * is pressed and the panel says so rather than reaching for one of the other
 * four, which do something else.
 * ------------------------------------------------------------------------ */

/* Two separate queries, in the order written. A selector list answers in
 * DOCUMENT order, so `'#alert_next_btn, .alert_next'` hands back whichever the
 * page holds first — which is the same trap the patient readings fell into. */
const mmaNextButton = () => document.getElementById('alert_next_btn')
    || document.querySelector('.alert_next');

function mmaCfg(ctx) {
    return ctx.store.read('cfg', {});
}
const mmaHold = (cfg) => (Number.isFinite(Number(cfg.hold)) ? Number(cfg.hold) : 900);

/** Is the tile switched on at all? The panel asks before it draws its switch. */
function mmaAvailable() {
    return YMCA.isOn('missionmagicianauto');
}

/** And is it armed right now? The switch in the panel writes this. */
function mmaArmed() {
    try {
        return (JSON.parse(localStorage.getItem('ymca-missionmagicianauto-cfg')) || {}).on === true;
    } catch (e) {
        return false;
    }
}

function mmaSetArmed(on) {
    let held = {};
    try {
        held = JSON.parse(localStorage.getItem('ymca-missionmagicianauto-cfg')) || {};
    } catch (e) { /* nothing set */ }
    held.on = !!on;
    try {
        localStorage.setItem('ymca-missionmagicianauto-cfg', JSON.stringify(held));
    } catch (e) { /* private window */ }
}

/**
 * Called by the panel once a Tick the player asked for has happened.
 *
 * The table is the judge: `mmRecount` puts `mm-ok` on it when every line it can
 * judge is covered and `mm-short` while one is not, so this reads the same
 * answer the player is looking at rather than working it out a second way.
 */
function mmaAfterTick(panel, ctx) {
    if (!mmaAvailable() || !mmaArmed()) return;
    /* ITS OWN STORE, NOT THE PANEL'S. This is called from MissionMagician's
     * tick with MissionMagician's context, and `ctx.store` is namespaced to
     * whoever owns it — so reading the hold through it read a setting that was
     * never written and quietly waited the default. A module that is handed
     * somebody else's context asks the shell for its own. */
    const own = YMCA.contextFor('missionmagicianauto');
    const note = panel.querySelector('#mma-note');
    const say = (html, bad) => {
        if (!note) return;
        note.hidden = false;
        note.className = `alert ${bad ? 'alert-warning' : 'alert-success'}`;
        note.style.cssText = 'padding:6px 10px;margin:8px 0 0';
        note.innerHTML = html;
    };

    const table = panel.querySelector('.mm-table');
    if (!table || !table.classList.contains('mm-ok')) {
        mmaNotGreen(panel, own, say);
        return;
    }
    mmaRun.shortOn = null;

    const button = mmaNextButton();
    if (!button) {
        say('<b>Not dispatched.</b> This window has no <i>Dispatch and Next</i> button, and '
            + 'nothing else here does the same thing.', true);
        own.log.warn('no dispatch-and-next on this page');
        return;
    }

    const hold = mmaHold(mmaCfg(own));
    say(`<b>Everything is covered.</b> Dispatching in a moment.
    <button type="button" class="btn btn-xs btn-danger" data-do="mma-stop"
      style="margin-left:8px">Stop</button>`);

    let cancelled = false;
    note.querySelector('[data-do="mma-stop"]').addEventListener('click', () => {
        cancelled = true;
        mmaSetArmed(false);
        say('<b>Stopped.</b> Auto is off; press Dispatch yourself.', true);
        own.log.info('stopped by the player');
        panel.querySelectorAll('[data-cfg="mmaOn"]').forEach((b) => { b.checked = false; });
    });

    setTimeout(() => {
        if (cancelled || !mmaArmed()) return;
        own.log.info('dispatching', 'every line covered');
        button.click();
    }, hold);
}

/* ----------------------------------------------------------- the run-through */

/**
 * What it is in the middle of.
 *
 * `shortOn` is the mission it has been trying and failing to fill, with how
 * many tries have gone by; `tickedOn` is the mission it has already pressed
 * Tick for, so a redraw does not press it again. Both are one mission at a
 * time, because that is all there ever is.
 */
const mmaRun = { shortOn: null, tries: 0, tickedOn: null };

const mmaMissionId = () => (/\/missions\/(\d+)/.exec(
    document.getElementById('mission-form')?.getAttribute('action') || location.pathname,
) || [])[1] || '';

/**
 * Red, and still red after trying again.
 *
 * The first time through is not a verdict: the game fills a mission window in
 * over several seconds, and a vehicle that arrives late is exactly the one that
 * would have finished the table. So it ticks again, a second apart, twice more.
 * Only then is the mission left alone — on to the next one the game offers, and
 * where it offers none, the window closes.
 */
function mmaNotGreen(panel, own, say) {
    const mission = mmaMissionId();
    if (mmaRun.shortOn !== mission) {
        mmaRun.shortOn = mission;
        mmaRun.tries = 0;
    }
    mmaRun.tries += 1;
    const cfg = mmaCfg(own);
    const allowed = Number.isFinite(Number(cfg.tries)) ? Number(cfg.tries) : 3;

    if (mmaRun.tries < allowed) {
        say(`<b>Still short.</b> Trying again &mdash; ${mmaRun.tries} of ${allowed}.`, true);
        own.log.info('short, trying again', `${mmaRun.tries} of ${allowed}`);
        setTimeout(() => {
            if (!mmaArmed() || mmaMissionId() !== mission) return;
            panel.querySelector('[data-do="select"]')?.click();
        }, 1000);
        return;
    }

    say('<b>Still short after ' + allowed + ' tries.</b> Moving on.', true);
    own.log.info('short after every try', `${allowed} on mission ${mission}`);
    mmaMoveOn(own, say, mission);
}

/**
 * On to the next mission, or out.
 *
 * `#mission_next_mission_btn` is the game's own "Next Mission" with the count
 * beside it, and its href names the mission it goes to — so a button pointing
 * at the mission already open is not a way on, it is a loop, and it is treated
 * as no button at all. Where there is no way on, Escape closes the window the
 * same way it does when a transport queue runs out.
 */
function mmaMoveOn(own, say, mission) {
    const next = document.getElementById('mission_next_mission_btn');
    const goesTo = (/\/missions\/(\d+)/.exec(next?.getAttribute('href') || '') || [])[1] || '';
    if (next && goesTo && goesTo !== mission) {
        own.log.info('next mission', goesTo);
        setTimeout(() => { if (mmaArmed()) next.click(); }, 400);
        return;
    }
    const cfg = mmaCfg(own);
    const wait = Number.isFinite(Number(cfg.closeAfter)) ? Number(cfg.closeAfter) : 600;
    say(`<b>Nothing else to go to.</b> Closing in ${wait} ms.`, true);
    own.log.info('no next mission, closing', next ? 'it points at this one' : 'no button');
    setTimeout(() => {
        if (!mmaArmed()) return;
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
    }, wait);
}

/**
 * A mission that has just opened, with Auto armed: press Tick.
 *
 * Called once the panel has drawn. Keyed on the mission id so a redraw — and
 * the game redraws a mission window several times as it fills — presses it
 * once, not once per redraw.
 */
function mmaAfterDraw(panel, ctx) {
    if (!mmaAvailable() || !mmaArmed()) return;
    const mission = mmaMissionId();
    if (!mission || mmaRun.tickedOn === mission) return;
    if (!panel.querySelector('.mm-table')) return;
    mmaRun.tickedOn = mission;
    mmaRun.shortOn = null;
    mmaRun.tries = 0;
    YMCA.contextFor('missionmagicianauto').log.info('new mission, ticking', mission);
    setTimeout(() => {
        if (mmaArmed() && mmaMissionId() === mission) {
            panel.querySelector('[data-do="select"]')?.click();
        }
    }, 300);
}

YMCA.register({
    id: 'missionmagicianauto',
    title: 'MissionMagician Auto',
    tagline: 'Dispatch when it is green',
    description: 'Presses the game’s own Dispatch and Next once you have ticked and every '
        + 'line is covered. It dispatches, and an alarm cannot be taken back.',

    mainTile: false,
    optional: true,
    /* Off. It sends vehicles. */
    defaultOn: false,

    settings(el, ctx) {
        const cfg = mmaCfg(ctx);
        el.innerHTML = `
      <div class="ymca-note bad"><b>This one dispatches.</b> MissionMagician ticks and stops on
        purpose &mdash; an alarm cannot be taken back. With this on, the tick you press is
        followed by the game&rsquo;s own <i>Dispatch and Next</i>, and only then.</div>

      <div class="ymca-card">
        <b>When it fires</b>
        <ol class="ymca-dim" style="margin:8px 0 0;padding-left:20px">
          <li>You pressed Tick &mdash; the button or the key. Never a redraw, never a mission
            opening, never twice for one press.</li>
          <li>The table is green: every line it can judge is covered. One short and it says so
            and stops.</li>
          <li>The window carries <i>Dispatch and Next</i>. Where it does not, nothing is pressed
            and the panel says why.</li>
        </ol>
      </div>

      <div class="ymca-card">
        <b>Settings</b>
        <label style="display:block;margin-top:8px">Hold before dispatching
          <input type="range" data-hold min="0" max="4000" step="100"
            value="${ctx.esc(String(mmaHold(cfg)))}"
            style="vertical-align:middle;width:200px;margin:0 8px">
          <b data-hold-shows></b></label>
        <label style="display:block;margin-top:10px">Tries before moving on
          <input type="number" data-tries min="1" max="9" style="width:64px;margin:0 6px"
            value="${ctx.esc(String(Number.isFinite(Number(cfg.tries)) ? cfg.tries : 3))}">
          <span class="ymca-dim">one a second &mdash; a vehicle arriving late is often the one
            that would have finished it</span></label>
        <label style="display:block;margin-top:10px">Wait before closing
          <input type="range" data-close min="0" max="3000" step="100"
            value="${ctx.esc(String(Number.isFinite(Number(cfg.closeAfter))
        ? cfg.closeAfter : 600))}" style="vertical-align:middle;width:180px;margin:0 8px">
          <b data-close-shows></b></label>
        <p class="ymca-dim" style="margin:6px 0 0;font-size:12px">The hold is how long Stop is
          reachable. The switch that arms it sits in the panel, in the mission itself. When a
          mission stays short, it goes on to the game's own <i>Next Mission</i>; where that
          button is missing or points back at the same mission, the window closes.</p>
      </div>`;

        const tries = el.querySelector('[data-tries]');
        tries.addEventListener('input', () => {
            ctx.store.write('cfg', { ...mmaCfg(ctx), tries: Number(tries.value) || 1 });
            ctx.status(`${tries.value} tries.`);
        });
        const closing = el.querySelector('[data-close]');
        const closeShows = el.querySelector('[data-close-shows]');
        const sayClose = () => { closeShows.textContent = `${closing.value} ms`; };
        sayClose();
        closing.addEventListener('input', sayClose);
        closing.addEventListener('change', () => {
            ctx.store.write('cfg', { ...mmaCfg(ctx), closeAfter: Number(closing.value) });
            ctx.status(`Closing after ${closing.value} ms.`);
        });

        const hold = el.querySelector('[data-hold]');
        const shows = el.querySelector('[data-hold-shows]');
        const say = () => { shows.textContent = `${hold.value} ms`; };
        say();
        hold.addEventListener('input', say);
        hold.addEventListener('change', () => {
            ctx.store.write('cfg', { ...mmaCfg(ctx), hold: Number(hold.value) });
            ctx.status(`Holding ${hold.value} ms.`);
        });
    },
});
