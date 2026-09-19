/* --------------------------------------------------------------------------
 * TrackOps — count the missions you finish, and what they paid.
 *
 * Only from the day it is installed, which is the honest limit: the game does
 * not hand out a history.
 *
 * Two wrong guesses got us here, and both are worth keeping written down.
 *
 * The first watcher wrapped fetch and XMLHttpRequest and saw zero requests
 * across half a minute in which the mission list never stopped moving. The
 * game is not polled over HTTP; it is pushed to over a socket that is already
 * open by the time a userscript set to document-idle runs.
 *
 * The second watched the mission list instead, and across 455 seconds recorded
 * 30 departures of which 30 came straight back. Not one mission left. That is
 * because a finished mission does not leave the list — the game adds the class
 * `mission_deleted` to its panel and leaves it sitting there. Counting rows
 * would have counted nothing forever.
 *
 * What the game actually does is call its own functions, and jxn-30/LSS-Scripts
 * has been hooking them for years: `missionMarkerAdd(mission)` when one
 * appears and `missionDelete(missionId)` when one ends. Those are driven by the
 * same socket, so hooking them is hooking the socket without needing to reach
 * it. That is what this does now.
 *
 * THE CREDITS COME FROM THE GAME TOO. Reading /api/credits after the fact was
 * wrong twice over: it races the payout, and it drifts the moment the player
 * buys anything. A mission page's own source settled it —
 *
 *     tellParent('creditsUpdate(2283098);');
 *
 * — the game pushes the new balance to a global `creditsUpdate` and the whole
 * thing runs over Faye, which eval()s what it is sent. So both halves of the
 * question are announced: `missionDelete` says a mission ended, `creditsUpdate`
 * says what the balance became. /api/credits is now only the opening reading.
 *
 * WHAT IS STILL INFERRED, and is labelled as such everywhere it shows:
 * `missionDelete` says a mission ended, not that *you* finished it, and the
 * balance moving right afterwards is not proof it moved *because* of it. So a
 * payout is only trusted when one mission ended alone and the balance rose
 * once within a few seconds. Anything else is recorded and shown, but kept out
 * of the averages.
 * -------------------------------------------------------------------------- */

/* The page the mission list lives on. Inside a mission's own iframe there is no
 * list and no globals to hook, so the recorder stays out of the way there. */
const TO_MAIN_PAGE = /^\/?$/;

const TO_LOG_KEY = 'ymca-trackops-log';
const TO_CFG_KEY = 'ymca-trackops-cfg';
const TO_LOG_MAX = 2000;

/* How long a mission's ending stays open for a balance change to be attributed
 * to it. The payout is pushed over the same channel, a beat behind. */
const TO_SETTLE_MS = 5000;

/* Two missions ending inside this window cannot be told apart by a balance
 * that moved once, so neither is trusted. */
const TO_CONCURRENT_MS = 6000;

function toRead(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch (e) {
        return fallback;
    }
}
function toWrite(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* private window: it still counts, it just forgets */ }
}

const toCfg = () => toRead(TO_CFG_KEY, { recording: true });

YMCA.register({
    id: 'trackops',
    title: 'TrackOps',
    tagline: 'What you have run',

    description: 'Counts the missions you finish and what each one actually paid, '
        + 'from the day it was installed.',

    async mount(el, ctx) {
        const cfg = toCfg();
        /* The game defines missionDelete while the page loads, which can be after this file
         * runs, and the retry below gives up rather than spinning forever. Opening the tool is
         * the natural second chance — and the one moment the player would notice it missing. */
        if (cfg.recording) toAttach();
        const log = toRead(TO_LOG_KEY, []);
        const trusted = log.filter((e) => e.alone && e.delta > 0);
        const listed = await toListedCredits(ctx);
        const rows = toSummarise(log, listed);
        const totalPaid = trusted.reduce((n, e) => n + e.delta, 0);

        el.innerHTML = `
      <div class="ymca-card">
        <b>Since ${log.length ? new Date(log[0].at).toLocaleDateString() : 'you turned it on'}</b>
        <p style="font-size:26px;font-weight:700;margin:8px 0 2px">${trusted.length}
          <span class="ymca-dim" style="font-size:14px;font-weight:400">missions measured</span></p>
        <p class="ymca-dim">${ctx.fmt(totalPaid)} credits, across ${rows.length} kinds of mission.
          ${log.length - trusted.length} more ended without a payout that could be told apart.</p>
        <label style="display:block;margin:10px 0 0"><input type="checkbox" data-cfg="recording"
          ${cfg.recording ? 'checked' : ''}> Keep recording</label>
      </div>

      <div class="ymca-note"><b>How the payout is arrived at.</b> The game announces that a
        mission ended, not what it paid you. So TrackOps reads your balance before and after and
        takes the difference, and only trusts it when no second mission ended at the same time.
        A figure here is a measurement, not the game's own number — which is the point, because
        <b>96 of the 197 ambulance missions have no listed number at all</b>.</div>

      ${rows.length ? `
      <div class="ymca-card">
        <b>What each kind of mission paid</b>
        <table id="to-table" style="margin-top:8px">
          <thead><tr><th>Mission</th><th class="ymca-num">Run</th><th class="ymca-num">Measured</th>
            <th class="ymca-num">Average paid</th><th class="ymca-num">Listed</th></tr></thead>
          <tbody>${rows.map((r) => `
            <tr><td>${ctx.esc(r.name)}</td>
              <td class="ymca-num">${r.runs}</td>
              <td class="ymca-num">${r.measured}</td>
              <td class="ymca-num">${r.measured ? ctx.fmt(Math.round(r.average)) : '<span class="ymca-dim">—</span>'}</td>
              <td class="ymca-num">${r.listed === null
        ? '<span class="ymca-warn">none listed</span>' : ctx.fmt(r.listed)}</td></tr>`).join('')}
          </tbody>
        </table>
        <p class="ymca-sub" style="margin-top:8px">Rows where the game lists nothing are the ones
          worth having. Those are what the planner has been guessing at.</p>
      </div>` : `
      <div class="ymca-card">
        <b>Nothing counted yet</b>
        <p class="ymca-dim">It records while you play, on the main map page. Finish a mission and
          come back. If this stays empty after a few, press the button below and send the result —
          that says which of the game's own hooks are reachable.</p>
      </div>`}

      <div class="ymca-card">
        <b>Hand it over</b>
        <button class="ymca-btn primary" data-do="copy">Copy what was measured</button>
        <button class="ymca-btn" data-do="probe">Check the hooks</button>
        <button class="ymca-btn" data-do="reset">Start over</button>
        <span class="ymca-status" id="to-status"></span>
        <textarea id="to-out" rows="10" readonly style="width:100%;margin-top:10px;
          font-family:ui-monospace,monospace;font-size:11.5px"></textarea>
      </div>`;

        el.addEventListener('change', (e) => {
            if (e.target.dataset.cfg !== 'recording') return;
            const next = Object.assign(toCfg(), { recording: e.target.checked });
            toWrite(TO_CFG_KEY, next);
            if (next.recording) toAttach(); else toDetach();
            ctx.status(next.recording ? 'Recording.' : 'Stopped.');
            ctx.log.info(next.recording ? 'recording on' : 'recording off');
        });

        el.addEventListener('click', (e) => {
            const out = el.querySelector('#to-out');
            if (e.target.closest('[data-do="copy"]')) {
                const text = JSON.stringify(toExport(log, listed), null, 1);
                out.value = text;
                ctx.clipboard(text, 'what was measured');
            } else if (e.target.closest('[data-do="probe"]')) {
                const text = JSON.stringify(toProbe(), null, 1);
                out.value = text;
                ctx.clipboard(text, 'the hook check');
                ctx.log.info('hook check', text.slice(0, 120));
            } else if (e.target.closest('[data-do="reset"]')) {
                if (!confirm('Forget every mission recorded so far? This cannot be undone.')) return;
                toWrite(TO_LOG_KEY, []);
                ctx.status('Forgotten.');
                ctx.log.warn('recorded missions cleared');
                ctx.open('trackops');
            }
        });
    },
});

/* ------------------------------------------------------------ what it shows */

/** The game's own listed averages, so a measurement can be held against them. */
async function toListedCredits(ctx) {
    try {
        const missions = await ctx.game('/einsaetze.json');
        const list = Array.isArray(missions) ? missions : Object.values(missions);
        return Object.fromEntries(list.map((m) => [String(m.id), {
            name: m.name,
            // null and 0 both mean "the game does not say", which is the gap being filled.
            listed: m.average_credits || null,
        }]));
    } catch (err) {
        ctx.log.warn('could not read the mission list, so nothing can be named', err.message);
        return {};
    }
}

function toSummarise(log, listed) {
    const byType = new Map();
    for (const entry of log) {
        const key = String(entry.type);
        if (!byType.has(key)) {
            byType.set(key, {
                type: key,
                name: listed[key]?.name || `Mission type ${key}`,
                listed: listed[key] ? listed[key].listed : null,
                runs: 0,
                measured: 0,
                total: 0,
            });
        }
        const row = byType.get(key);
        row.runs += 1;
        if (entry.alone && entry.delta > 0) {
            row.measured += 1;
            row.total += entry.delta;
        }
    }
    return [...byType.values()]
        .map((r) => Object.assign(r, { average: r.measured ? r.total / r.measured : 0 }))
        .sort((a, b) => b.runs - a.runs);
}

/**
 * What goes back for the planner's sake.
 *
 * Mission type ids and credit figures, which are the game's own constants, and
 * counts. No mission instance ids, no timestamps beyond the day, no balance.
 */
function toExport(log, listed) {
    const rows = toSummarise(log, listed);
    return {
        note: 'mission type ids, what each paid on average, and how often — no balance, '
            + 'no mission instance ids, no addresses, no names',
        ymca: YMCA.version,
        measuredFrom: log.length ? new Date(log[0].at).toISOString().slice(0, 10) : null,
        missionsEnded: log.length,
        missionsMeasured: log.filter((e) => e.alone && e.delta > 0).length,
        byMissionType: rows.map((r) => ({
            type: Number(r.type) || r.type,
            name: r.name,
            runs: r.runs,
            measured: r.measured,
            averagePaid: r.measured ? Math.round(r.average) : null,
            listedByGame: r.listed,
        })),
    };
}

/**
 * Which of the game's own hooks are actually there.
 *
 * If counting ever comes back empty this is the first thing to look at, and it
 * says so without the player having to describe anything.
 */
function toProbe() {
    const w = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
    const named = (fn) => (typeof fn === 'function' ? 'function' : typeof fn);
    return {
        note: 'which of the game\'s own functions are reachable — names and types only',
        page: location.pathname,
        onMainPage: TO_MAIN_PAGE.test(location.pathname),
        recording: toCfg().recording,
        hooked: toHooked,
        balanceKnown: toBalance !== null,
        globals: {
            missionDelete: named(w.missionDelete),
            creditsUpdate: named(w.creditsUpdate),
            missionMarkerAdd: named(w.missionMarkerAdd),
            missionInvolved: named(w.missionInvolved),
            mission_markers: Array.isArray(w.mission_markers) ? `array(${w.mission_markers.length})` : typeof w.mission_markers,
        },
        unsafeWindowAvailable: typeof unsafeWindow !== 'undefined',
        missionListPresent: !!document.getElementById('mission_list'),
        deletedPanelsOnPage: document.querySelectorAll('.mission_deleted').length,
        recorded: toRead(TO_LOG_KEY, []).length,
    };
}

/* --------------------------------------------------------------- recording */

let toHooked = false;
let toOriginals = null;
let toBalance = null;
let toPending = [];

/** The account balance, from the game's own endpoint rather than off the page. */
async function toReadBalance() {
    try {
        const res = await fetch('/api/credits', { credentials: 'same-origin' });
        const data = await res.json();
        const value = data.credits_user_current ?? data.credits_user_total ?? data.credits;
        return typeof value === 'number' ? value : null;
    } catch (err) {
        return null;
    }
}

/**
 * A mission ended. Hold it open for the balance to say what it paid.
 *
 * The type id is read off the panel before the game takes it away — it is the
 * key into /einsaetze.json, where the name and the listed figure live, so
 * nothing has to be read out of the page's text.
 */
function toMissionEnded(missionId) {
    const panel = document.getElementById(`mission_${missionId}`);
    const type = panel?.getAttribute('mission_type_id') || null;
    if (type === null) return; // not one of ours, or already gone

    const at = Date.now();
    /* Anything else ending in the same window makes both unattributable: one
     * balance change cannot be split between two missions. */
    for (const other of toPending) other.alone = false;
    const entry = { at, type: Number(type) || type, delta: null, alone: toPending.length === 0 };
    toPending.push(entry);

    setTimeout(() => {
        toPending = toPending.filter((e) => e !== entry);
        const log = toRead(TO_LOG_KEY, []);
        log.push({ at: entry.at, type: entry.type, delta: entry.delta, alone: entry.alone });
        toWrite(TO_LOG_KEY, log.slice(-TO_LOG_MAX));
    }, TO_SETTLE_MS);
}

/**
 * The balance changed. Give it to whatever ended just before it.
 *
 * A rise while nothing ended is the player selling or being paid for something
 * else, and is simply the new baseline. A fall is never a payout.
 */
function toCreditsChanged(next) {
    if (typeof next !== 'number' || !isFinite(next)) return;
    const previous = toBalance;
    toBalance = next;
    if (previous === null) return;
    const delta = next - previous;
    if (delta <= 0) return;
    for (const entry of toPending) {
        entry.delta = (entry.delta || 0) + delta;
    }
}

/**
 * Hook the game's own functions.
 *
 * Wrapped, never replaced: the original is called first and its return value
 * handed back, so the game behaves exactly as it would without YMCA. If the
 * game ever stops defining them, nothing is hooked and "Check the hooks" says
 * so rather than the counter silently staying at zero.
 */
function toAttach() {
    if (toHooked || !TO_MAIN_PAGE.test(location.pathname)) return;
    const w = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
    if (typeof w.missionDelete !== 'function') return;

    toOriginals = { target: w, missionDelete: w.missionDelete, creditsUpdate: w.creditsUpdate };

    w.missionDelete = function (...args) {
        const result = toOriginals.missionDelete.apply(this, args);
        try { toMissionEnded(args[0]); } catch (e) { /* never break the game's own call */ }
        return result;
    };

    /* creditsUpdate is what a mission window tells the page it is inside —
     * tellParent('creditsUpdate(2283098);') — so it carries the balance the
     * moment it changes, which no amount of polling can. */
    if (typeof w.creditsUpdate === 'function') {
        w.creditsUpdate = function (...args) {
            const result = toOriginals.creditsUpdate.apply(this, args);
            try { toCreditsChanged(Number(args[0])); } catch (e) { /* as above */ }
            return result;
        };
    }

    toHooked = true;
    toReadBalance().then((v) => { if (toBalance === null) toBalance = v; });
}

function toDetach() {
    if (!toHooked || !toOriginals) return;
    toOriginals.target.missionDelete = toOriginals.missionDelete;
    if (typeof toOriginals.creditsUpdate === 'function') {
        toOriginals.target.creditsUpdate = toOriginals.creditsUpdate;
    }
    toOriginals = null;
    toHooked = false;
}

/* The game defines its functions as the page finishes loading, which can be
 * after this file runs. Try now, then a few times, then give up quietly —
 * "Check the hooks" is there to say what happened. */
if (toCfg().recording && TO_MAIN_PAGE.test(location.pathname)) {
    let tries = 0;
    const attempt = () => {
        toAttach();
        if (!toHooked && (tries += 1) < 10) setTimeout(attempt, 1000);
    };
    attempt();
}
