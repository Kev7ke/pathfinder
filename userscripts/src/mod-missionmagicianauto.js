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

    if (mmaWaitingForADestination()) {
        say('<b>Not dispatched.</b> Somebody here is still waiting on a destination \u2014 '
            + 'pick it first, and this mission is finished then rather than skipped past.', true);
        own.log.info('held back, a destination is still to be picked');
        return;
    }

    const table = panel.querySelector('.mm-table');
    if (!table || !table.classList.contains('mm-ok')) {
        mmaNotGreen(panel, own, say);
        return;
    }
    mmaRun.shortOn = null;

    /* GREEN, AND NOTHING LEFT TO SEND, BUT A TRANSPORT IS WAITING. Pressing
     * Dispatch and Next here would send nothing and leave the patient or the
     * prisoner sitting at the mission. Where boxes ARE ticked the send goes
     * first — the transport is still waiting when the queue comes back round,
     * and a vehicle held back is one that is not on its way. */
    if (!document.querySelector('.vehicle_checkbox:checked')) {
        const transport = mmaTransportLink();
        if (transport) {
            say('<b>Nothing left to send, and a transport is waiting.</b> Going to that '
                + 'vehicle \u2014 HighFive Auto takes it from there.');
            own.log.info('following a transport request', transport.getAttribute('href'));
            mmaResumeLater(own);
            setTimeout(() => { if (mmaArmed()) transport.click(); }, mmaHold(mmaCfg(own)));
            return;
        }
    }

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
        /* Written down before the click, because the click is what reloads the
         * frame and takes every variable with it. */
        mmaRemember(mmaMissionId());
        button.click();
    }, hold);
}


/**
 * A prisoner still waiting for a cell is a mission that is not finished.
 *
 * The game states it on the mission page itself: every vehicle carrying one
 * gets a `div.prison-select` full of `/gefangener/` links, and until one is
 * picked the call stays open however green the requirement table is. Dispatch
 * and Next would skip straight past it, and the prisoners would be left to the
 * game's own timer.
 *
 * READ AS A DESTINATION LINK, NOT AS A PRISON. It is the same question HighFive
 * asks — is there somewhere on this page still to be picked — so it is the same
 * reading, and a branch of the game nobody here has seen answers it too.
 */
function mmaWaitingForADestination() {
    return !!document.querySelector(HF_PICK_LINK);
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

/**
 * WHICH MISSION WAS JUST DISPATCHED, ACROSS THE RELOAD.
 *
 * `Dispatch and Next` reloads the frame, so everything this module holds in a
 * variable is gone by the time the next page draws — including "I have already
 * ticked this one". On the last mission there is no next one to load, the game
 * hands back the same mission, and a module with no memory ticks it, finds it
 * green and dispatches it again. And again.
 *
 * So the one thing that has to survive the reload is written down: the mission
 * it dispatched, and when. Landing on that same mission afterwards is the game
 * saying there was nowhere else to go, and that is where the window closes.
 */
const MMA_LAST_KEY = 'ymca-mma-dispatched';
const MMA_LOOP_WINDOW = 45e3;

function mmaRemember(mission) {
    try {
        sessionStorage.setItem(MMA_LAST_KEY, JSON.stringify({ mission, at: Date.now() }));
    } catch (e) { /* private window: the loop guard simply does not hold */ }
}

function mmaJustDispatched() {
    let held = null;
    try {
        held = JSON.parse(sessionStorage.getItem(MMA_LAST_KEY));
    } catch (e) {
        return null;
    }
    if (!held || Date.now() - held.at > MMA_LOOP_WINDOW) return null;
    return held.mission;
}

function mmaForget() {
    try {
        sessionStorage.removeItem(MMA_LAST_KEY);
    } catch (e) { /* nothing to forget */ }
}

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
/**
 * A vehicle at this mission that is asking to transport somebody.
 *
 * The game puts it in the mission window as a button of its own —
 * `<a class="btn btn-xs btn-success" href="/vehicles/15096931">ALS Ambulance -
 * Transport Requested</a>` — and it is the one link on the page whose href is a
 * bare `/vehicles/<id>` **and** which is styled as a button. The vehicle names
 * in the tables are plain links; the recall buttons carry `/backalarm`. So it
 * is found by that pair rather than by its words, which are the game's and
 * change with the language.
 *
 * WHY AUTO FOLLOWS IT. A mission with a transport waiting is not finished, and
 * the page it leads to is a status-5 page — which is exactly what HighFive Auto
 * was written for. Nothing is duplicated: this only presses the way in, and the
 * queue on the other side is already somebody else's job.
 */
const mmaTransportLink = () => [...document.querySelectorAll('a.btn[href]')]
    .find((a) => /^\/vehicles\/\d+$/.test(a.getAttribute('href') || ''));

function mmaMoveOn(own, say, mission) {
    /* A TRANSPORT WAITING COMES BEFORE THE NEXT MISSION. Going on would leave
     * the patient or the prisoner sitting there, and the page this leads to is
     * one HighFive Auto already works through to its end. */
    const transport = mmaTransportLink();
    if (transport) {
        say('<b>A transport is waiting.</b> Going to that vehicle \u2014 HighFive Auto takes '
            + 'it from there.');
        own.log.info('following a transport request', transport.getAttribute('href'));
        mmaResumeLater(own);
        setTimeout(() => { if (mmaArmed()) transport.click(); }, 400);
        return;
    }

    const next = document.getElementById('mission_next_mission_btn');
    const goesTo = (/\/missions\/(\d+)/.exec(next?.getAttribute('href') || '') || [])[1] || '';
    if (next && goesTo && goesTo !== mission) {
        own.log.info('next mission', goesTo);
        setTimeout(() => { if (mmaArmed()) next.click(); }, 400);
        return;
    }
    const wait = mmaCloseWait(mmaCfg(own));
    say(`<b>Nothing else to go to.</b> Closing in ${wait} ms.`, true);
    own.log.info('no next mission, closing', next ? 'it points at this one' : 'no button');
    mmaCloseWindow(own, wait);
}

const mmaCloseWait = (cfg) => (Number.isFinite(Number(cfg.closeAfter))
    ? Number(cfg.closeAfter) : 600);

/** Escape, on this document and on the map's, the way the player would press it. */
function mmaCloseWindow(own, wait) {
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
        own.log.info('closed the window');
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
    if (!mission) return;

    /* The same mission again, right after dispatching it: Dispatch and Next had
     * nowhere to go, so this was the last one. Ticking it again would dispatch
     * it again, which is exactly what it did. */
    if (mmaJustDispatched() === mission) {
        mmaForget();
        const own = YMCA.contextFor('missionmagicianauto');
        own.log.info('the same mission came back, so that was the last one');
        mmaCloseWindow(own, mmaCloseWait(mmaCfg(own)));
        return;
    }
    mmaForget();
    if (mmaRun.tickedOn === mission) return;
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


/* ------------------------------------------- coming back from a transport */

/**
 * FOLLOWING A TRANSPORT IS A ONE-WAY DOOR, and that is what was wrong with it.
 *
 * The link leads to the vehicle, HighFive Auto works the queue through to its
 * end, and its end is Escape — the window closes and the map is left sitting
 * there. MissionMagician Auto never gets another mission to open, because
 * nothing opens one.
 *
 * So the way back is written down before the door is gone through.
 * `sessionStorage` is the only thing that survives a frame being replaced and
 * then removed, and it is shared between the frame and the map, so the note
 * written inside the mission window is read by the map a minute later.
 *
 * WHAT IT PRESSES IS THE GAME'S OWN DISPATCH. The map's mission list is a
 * column of `a#alarm_button_<id>.mission-alarm-button.lightbox-open`, the same
 * link a player clicks to open a mission, so the first one starts the
 * run-through again from the top.
 */
const MMA_RESUME_KEY = 'ymca-mma-resume';
const MMA_RESUME_WINDOW = 5 * 60e3;

function mmaResumeLater(own) {
    try {
        sessionStorage.setItem(MMA_RESUME_KEY, String(Date.now()));
        own.log.info('noted the way back', 'the map reopens the first mission when the window goes');
    } catch (e) { /* private window: it simply will not resume */ }
}

function mmaResumeWanted() {
    let at = 0;
    try { at = Number(sessionStorage.getItem(MMA_RESUME_KEY)) || 0; } catch (e) { return false; }
    if (!at) return false;
    if (Date.now() - at > MMA_RESUME_WINDOW) { mmaResumeForget(); return false; }
    return true;
}

function mmaResumeForget() {
    try { sessionStorage.removeItem(MMA_RESUME_KEY); } catch (e) { /* nothing to clear */ }
}

/** Is a mission window still open over the map? Its frame is what says so, and
 * a frame with no height is one the game has already taken down. */
function mmaWindowOpen() {
    return [...document.querySelectorAll('iframe')]
        .some((f) => f.getBoundingClientRect().height > 40);
}

/**
 * On the map, with the way back noted and the window gone: open the first
 * mission in the game's own list and let the run-through start again.
 */
function mmaResumeIfDue(ctx) {
    if (!mmaArmed() || !mmaResumeWanted()) return;
    if (mmaWindowOpen()) return;
    const first = document.querySelector('#mission_list a[id^="alarm_button_"]')
        || document.querySelector('a[id^="alarm_button_"]');
    if (!first) return;
    mmaResumeForget();
    ctx.log.info('back from a transport, reopening the list', first.id);
    setTimeout(() => { if (mmaArmed()) first.click(); }, 600);
}

/* ---------------------------------------------- the switch, where the list is */

const MMA_BUTTON_ID = 'ymca-mma-btn';

/**
 * Armed or not, in the row the game keeps its own mission filters in.
 *
 * `#missions-panel-main` holds Emergency, Patient transports and the rest, and
 * it is on screen whatever mission is open — which a switch inside the mission
 * panel is not. It was in the panel and that was the wrong place twice over:
 * it moved with the table, and it was two clicks away whenever the window it
 * belonged to was shut. The game's own button classes, green for armed and
 * plain for not, exactly as the filters beside it do.
 */
function mmaMountButton(ctx) {
    if (!mmaAvailable()) return false;
    if (document.getElementById(MMA_BUTTON_ID)) { mmaPaintButton(); return true; }
    const row = document.getElementById('missions-panel-main');
    if (!row) return false;

    const btn = document.createElement('a');
    btn.id = MMA_BUTTON_ID;
    btn.setAttribute('role', 'button');
    btn.href = '';
    btn.title = 'MissionMagician Auto \u2014 tick and dispatch a mission whose table is green';
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        mmaSetArmed(!mmaArmed());
        mmaPaintButton();
        ctx.log.info(`armed ${mmaArmed() ? 'on' : 'off'} from the map`);
    });
    row.append(btn);
    mmaPaintButton();
    return true;
}

function mmaPaintButton() {
    const btn = document.getElementById(MMA_BUTTON_ID);
    if (!btn) return;
    const on = mmaArmed();
    /* Red when it is off, the way HighFive Auto's button is: a switch that
     * writes to the player's account says which it is at a glance, and plain
     * grey reads as "not a button" rather than "not armed". */
    btn.className = `btn btn-xs mission_selection ${on ? 'btn-success' : 'btn-danger'}`;
    btn.innerHTML = `<span class="glyphicon glyphicon-${on ? 'flash' : 'off'}"></span>
    Auto${on ? '' : ' off'}`;
}

/* Never finished: the map can grow that row without a fresh document, and the
 * button has to appear when it does. */
/**
 * A standing watch on the map, because the shell's own one expires.
 *
 * `YMCA.inject` retries on every mutation and then **stops watching after
 * thirty seconds** — which is right for a page that never grew what a module
 * was waiting for, and wrong here: a transport queue takes minutes, and the
 * mutation this is waiting for is the mission window being taken down at the
 * end of it. So the watch is MissionMagician Auto's own, attached once, and it
 * is still the map's own mutations rather than a poll — nothing asks the game
 * anything, it is told when its own page changes.
 */
let mmaWatching = false;
function mmaWatchForTheWayBack(ctx) {
    if (mmaWatching || !document.body) return;
    mmaWatching = true;
    let queued = false;
    new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; mmaResumeIfDue(ctx); });
    }).observe(document.documentElement, { childList: true, subtree: true });
}

YMCA.inject('missionmagicianauto', (ctx) => {
    mmaMountButton(ctx);
    mmaResumeIfDue(ctx);
    mmaWatchForTheWayBack(ctx);
    return false;
});
