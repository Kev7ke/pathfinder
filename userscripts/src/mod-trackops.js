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

/* The game announces the same mission ending more than once. An id seen again
 * inside this window is the same ending, not a second one. */
const TO_DEDUPE_MS = 120000;

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
    optional: true,

    description: 'Counts the missions you finish and what each one actually paid, '
        + 'from the day it was installed.',

    async mount(el, ctx) {
        const cfg = toCfg();
        /* The game defines missionDelete while the page loads, which can be after this file
         * runs, and the retry below gives up rather than spinning forever. Opening the tool is
         * the natural second chance — and the one moment the player would notice it missing. */
        if (cfg.recording) toAttach();
        const whole = toRead(TO_LOG_KEY, []);
        const listed = await toListedCredits(ctx);
        const span = TO_SPANS[cfg.span] ? cfg.span : 'all';
        const log = toWithin(whole, span);
        const rows = toSummarise(log, listed);
        const yours = log.filter((e) => e.mine).length;
        const unknown = log.filter((e) => e.mine === undefined).length;

        el.innerHTML = `
      <div class="ymca-card">
        <b>Since ${whole.length ? new Date(whole[0].at).toLocaleDateString() : 'you turned it on'}</b>
        <p style="font-size:26px;font-weight:700;margin:8px 0 2px">${yours}
          <span class="ymca-dim" style="font-size:14px;font-weight:400">of yours</span>
          <span class="ymca-dim" style="font-size:14px;font-weight:400">&middot; ${log.length}
          finished nearby</span></p>
        <p class="ymca-dim">Across ${rows.length} kinds of mission${
    unknown ? `, ${unknown} recorded before TrackOps could tell whose they were` : ''}.</p>
        <div style="margin:10px 0 0">${Object.entries(TO_SPANS).map(([key, v]) =>
    `<button class="ymca-btn${key === span ? ' primary' : ''}" data-span="${key}"
            >${v.label}</button>`).join(' ')}</div>
        <label style="display:block;margin:10px 0 0"><input type="checkbox" data-cfg="recording"
          ${cfg.recording ? 'checked' : ''}> Keep recording</label>
      </div>

      <div class="ymca-note"><b>Yours means one of your vehicles was at it.</b> An alliance call
        somebody else handled ends on your map exactly like one of your own, so both numbers are
        shown: the game announced the ending, YMCA saw your vehicle.</div>

      <div class="ymca-card">
        <b>What missions actually paid</b>
        <p class="ymca-sub" style="margin:4px 0 10px">Read from the game's own credits ledger,
          where every line says what it was for. A mission's payout is the line named after the
          mission; a daily task is named as one and left out.</p>
        <label class="ymca-dim" style="display:block;margin-bottom:8px">How far back
          <select data-pages style="margin-left:6px">
            ${[1, 5, 10, 25, 50, 100, 200].map((n) => `<option value="${n}"${
    n === (Number(cfg.pages) || 5) ? ' selected' : ''}>${n} page${n === 1 ? '' : 's'}</option>`)
    .join('')}
          </select>
          <span style="margin-left:6px">&mdash; the game pages this, and one page is not an
            account's history</span></label>
        <button class="ymca-btn primary" data-do="ledger">Read the credits ledger</button>
        <button class="ymca-btn" data-do="ledger-copy">Copy it</button>
        <button class="ymca-btn" data-do="ledger-shape"
          title="press this if the ledger will not read">Copy the credits page</button>
        <span class="ymca-status" id="to-ledger-status"></span>
        <div id="to-ledger"></div>
      </div>

      <div class="ymca-note"><b>Counting endings is what this does.</b> Pairing an ending with
        the next rise in your balance could not tell that rise apart from a daily task reward, so
        that reading is gone — it put a 320-credit call at 3,716. The ledger above answers the
        same question by reading what the game wrote down.</div>

      ${rows.length ? `
      <div class="ymca-card">
        <b>What you have run</b>
        <table id="to-table" style="margin-top:8px">
          <thead><tr><th class="ymca-num">Yours</th><th class="ymca-num">Nearby</th>
            <th>Mission</th><th class="ymca-num">Listed</th>
            <th class="ymca-num" title="what the ledger says this mission paid">Paid</th></tr></thead>
          <tbody>${rows.map((r) => `
            <tr><td class="ymca-num">${r.yours || '<span class="ymca-dim">&ndash;</span>'}</td>
              <td class="ymca-num">${r.runs}</td>
              <td>${r.icon ? `<img src="${ctx.esc(r.icon)}" width="16" height="16" alt=""
                style="vertical-align:-3px;margin-right:6px">` : ''}${ctx.esc(r.name)}</td>
              <td class="ymca-num">${r.listed === null
        ? '<span class="ymca-warn">none listed</span>' : ctx.fmt(r.listed)}</td>
              <td class="ymca-num" data-paid="${ctx.esc(toNameKey(r.name))}"
                ><span class="ymca-dim">reading\u2026</span></td></tr>`).join('')}
          </tbody>
        </table>
        <p class="ymca-sub" style="margin-top:8px"><b>Listed</b> is the game's own figure from
          the mission list. <b>Paid</b> is what its own ledger wrote down, averaged over the
          lines named after that mission &mdash; measured, not paired with anything. Rows where
          the game lists nothing are the ones worth having: those are what the planner is
          guessing at.</p>
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

        /* The ledger is read on open rather than on a button, because a column
         * that says "reading\u2026" until somebody presses something is a column
         * nobody reads. The button stays: it is how the ledger's own table and
         * the copy are asked for. */
        toReadLedger(1).then(({ rows }) => {
            toFillPaid(el, ctx, toSummariseLedger(rows));
        }).catch((err) => {
            el.querySelectorAll('[data-paid]').forEach((cell) => {
                cell.innerHTML = '<span class="ymca-dim" title="the ledger could not be read"'
                    + '>&ndash;</span>';
            });
            ctx.log.warn('credits ledger unreadable on open', err.message);
        });

        /* The span changes what every number on the panel means, so the panel is
         * built again rather than patched in six places. */
        el.addEventListener('click', (e) => {
            const pick = e.target.closest('[data-span]');
            if (!pick) return;
            toWrite(TO_CFG_KEY, Object.assign(toCfg(), { span: pick.dataset.span }));
            YMCA.modules.find((m) => m.id === 'trackops').mount(el, ctx);
        });

        el.addEventListener('change', (e) => {
            if (e.target.hasAttribute?.('data-pages')) {
                toWrite(TO_CFG_KEY, Object.assign(toCfg(), { pages: Number(e.target.value) }));
                ctx.status(`Reading ${e.target.value} page(s) of the ledger.`);
                return;
            }
            if (e.target.dataset.cfg !== 'recording') return;
            const next = Object.assign(toCfg(), { recording: e.target.checked });
            toWrite(TO_CFG_KEY, next);
            if (next.recording) toAttach(); else toDetach();
            ctx.status(next.recording ? 'Recording.' : 'Stopped.');
            ctx.log.info(next.recording ? 'recording on' : 'recording off');
        });

        el.addEventListener('click', (e) => {
            const out = el.querySelector('#to-out');
            if (e.target.closest('[data-do="ledger"]') || e.target.closest('[data-do="ledger-copy"]')) {
                const copy = !!e.target.closest('[data-do="ledger-copy"]');
                const status = el.querySelector('#to-ledger-status');
                status.textContent = 'Reading…';
                const want = Number(toCfg().pages) || 5;
                toReadLedger(want, (done, asked, total) => {
                    status.textContent = `Page ${done} of ${asked}… (the game has ${total})`;
                }).then(({ path, rows, pagesRead, pagesTotal, more }) => {
                    const sum = toSummariseLedger(rows);
                    sum.pagesRead = pagesRead;
                    sum.pagesTotal = pagesTotal;
                    sum.more = more;
                    status.textContent = `${sum.lines} lines from ${path}, `
                        + `${pagesRead} of ${pagesTotal} page${pagesTotal === 1 ? '' : 's'}.`;
                    el.querySelector('#to-ledger').innerHTML = toLedgerHtml(sum, ctx);
                    toFillPaid(el, ctx, sum);
                    ctx.log.info('read the credits ledger', `${sum.lines} lines, ${sum.missions.length} kinds`);
                    if (copy) {
                        ctx.clipboard(JSON.stringify({
                            note: 'mission names and credit amounts from the game\'s own ledger',
                            ymca: YMCA.version,
                            lines: sum.lines,
                            /* HOW FAR BACK THIS READ. An average over one page
                             * of 210 is a sample, and a sample that does not
                             * say so reads as a measurement. */
                            pagesRead: sum.pagesRead,
                            pagesTheGameHas: sum.pagesTotal,
                            patientIncome: sum.patients,
                            ignoredLines: sum.ignored,
                            /* The wording of every kind of line, figures taken
                             * out: what a transport, prisoner or alliance count
                             * has to be built on before it can be built. */
                            lineKinds: sum.kinds,
                            byMission: sum.missions.map((m) => ({
                                name: m.name, runs: m.runs, average: m.average,
                                low: m.low, high: m.high,
                            })),
                        }, null, 1), 'the ledger');
                    }
                }).catch((err) => {
                    status.textContent = `Could not read it: ${err.message}`;
                    el.querySelector('#to-ledger').innerHTML = `<div class="ymca-note bad"
              style="margin-top:8px"><b>The ledger did not read.</b> ${ctx.esc(err.message)}<br>
              Press <b>Copy the credits page</b> and send what it gives you \u2014 it copies the
              shape of that page and nothing that is on it.</div>`;
                    ctx.log.warn('credits ledger unreadable', err.message);
                });
            } else if (e.target.closest('[data-do="ledger-shape"]')) {
                const status = el.querySelector('#to-ledger-status');
                status.textContent = 'Reading\u2026';
                toCaptureLedger().then((shape) => {
                    const text = JSON.stringify(shape, null, 1);
                    out.value = text;
                    status.textContent = `${shape.pages.length} pages looked at.`;
                    ctx.clipboard(text, 'the credits page\u2019s shape');
                });
            } else if (e.target.closest('[data-do="copy"]')) {
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
            /* The game ships its own artwork for every mission and names it in
             * the catalogue: three states, green through red. The first is the
             * quiet one, which is what a list wants. */
            icon: Array.isArray(m.icons) && m.icons.length ? m.icons[0] : null,
        }]));
    } catch (err) {
        ctx.log.warn('could not read the mission list, so nothing can be named', err.message);
        return {};
    }
}

/** Only what happened inside the window the player asked for. */
const TO_SPANS = {
    all: { label: 'All', ms: null },
    day: { label: 'Today', ms: 24 * 3600e3 },
    week: { label: '7 days', ms: 7 * 24 * 3600e3 },
    month: { label: '30 days', ms: 30 * 24 * 3600e3 },
};

function toWithin(log, span) {
    const ms = TO_SPANS[span]?.ms;
    if (!ms) return log;
    const from = Date.now() - ms;
    return log.filter((e) => e.at >= from);
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
                icon: listed[key]?.icon || null,
                runs: 0,
                yours: 0,
                measured: 0,
                total: 0,
            });
        }
        const row = byType.get(key);
        row.runs += 1;
        /* `mine` is absent on everything recorded before TrackOps started
         * looking, so it is counted as unknown rather than as a no. */
        if (entry.mine) row.yours += 1;
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
 * Write the ledger's own figure into every row of the run table.
 *
 * THIS IS MEASURED AND THE COLUMN BESIDE IT IS NOT THE SAME THING. The balance
 * delta was withdrawn because a rise cannot be told apart from a daily task
 * landing in the same second. A ledger line is the game writing down what it
 * paid and what it paid it for, so averaging those is reading rather than
 * inferring — and the count is shown beside it, because one line is not an
 * average.
 *
 * A mission with no line yet says so rather than showing a zero: nothing run
 * since the ledger page begins is not the same as nothing paid.
 */
let toLastLedger = null;

function toFillPaid(el, ctx, sum) {
    toLastLedger = sum;
    const byName = new Map(sum.missions.map((m) => [toNameKey(m.name), m]));
    for (const cell of el.querySelectorAll('[data-paid]')) {
        const m = byName.get(cell.dataset.paid);
        cell.innerHTML = m
            ? `${ctx.fmt(m.average)} <span class="ymca-dim" style="font-size:11px"
                title="${m.runs} line${m.runs > 1 ? 's' : ''} in the ledger">\u00d7${m.runs}</span>`
            : '<span class="ymca-dim" title="no line named after it on this page of the ledger"'
                + '>&ndash;</span>';
    }
}

/** The ledger, as a table: what each mission paid, and how much it varied. */
function toLedgerHtml(sum, ctx) {
    /* SAID ON THE PANEL, not only in the copy: every figure under here is over
     * the pages that were read and no further, and a reader who is not told
     * that will take an average of one page for an average of the account. */
    const howFar = sum.pagesTotal > 1
        ? `<div class="ymca-note" style="margin-top:8px">Everything below is the
        <b>${ctx.fmt(sum.pagesRead || 1)}</b> most recent page${(sum.pagesRead || 1) === 1 ? '' : 's'}
        of ${ctx.fmt(sum.pagesTotal)} the game has. ${sum.more
        ? 'There is more behind it — raise "How far back" to take it in.' : ''}</div>`
        : '';
    if (!sum.missions.length && !sum.patients.lines) {
        return '<p class="ymca-dim">The ledger answered, but nothing in it was a mission.</p>';
    }
    return `
    ${howFar}
    ${sum.patients.lines ? `<p style="margin:10px 0 4px"><b>${ctx.fmt(sum.patients.total)}</b>
      <span class="ymca-dim">from ${sum.patients.lines} patient treatment and transport lines
      &mdash; income the mission list does not carry at all.</span></p>` : ''}
    <table style="margin-top:8px">
      <thead><tr><th class="ymca-num">Run</th><th>Mission</th><th class="ymca-num">Average</th>
        <th class="ymca-num">Lowest</th><th class="ymca-num">Highest</th></tr></thead>
      <tbody>${sum.missions.slice(0, 60).map((m) => `<tr>
        <td class="ymca-num">${m.runs}</td><td>${ctx.esc(m.name)}</td>
        <td class="ymca-num">${ctx.fmt(m.average)}</td>
        <td class="ymca-num ymca-dim">${ctx.fmt(m.low)}</td>
        <td class="ymca-num ymca-dim">${ctx.fmt(m.high)}</td></tr>`).join('')}</tbody>
    </table>
    ${sum.kinds?.length ? `<details style="margin-top:10px"><summary class="ymca-dim"
      >Every kind of line in the ledger (${sum.kinds.length})</summary>
      <table style="margin-top:6px"><thead><tr><th>As the game words it</th>
        <th class="ymca-num">Lines</th><th class="ymca-num">In</th>
        <th class="ymca-num">Out</th></tr></thead>
      <tbody>${sum.kinds.slice(0, 80).map((k) => `<tr>
        <td>${ctx.esc(k.kind)}</td><td class="ymca-num">${ctx.fmt(k.lines)}</td>
        <td class="ymca-num">${k.paid ? ctx.fmt(k.paid) : ''}</td>
        <td class="ymca-num">${k.spent ? ctx.fmt(k.spent) : ''}</td></tr>`).join('')}</tbody>
      </table>
      <p class="ymca-dim" style="margin:6px 0 0;font-size:12px">Figures inside the wording are
        taken out, so this is what the game calls things and nothing of yours. It is what a
        count of transports, prisoners or alliance shares has to be built on.</p></details>` : ''}
    <p class="ymca-sub" style="margin-top:8px">${sum.ignored} lines left out as not a mission.
      This is one page of the ledger &mdash; the game keeps many.</p>`;
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
        missionsYours: log.filter((e) => e.mine).length,
        missionsWhoseOwnerIsUnknown: log.filter((e) => e.mine === undefined).length,
        missionsMeasured: log.filter((e) => e.alone && e.delta > 0).length,
        /* What the game wrote down, by name, so what a mission really pays can
         * go into data/missions.json instead of being asked for again. Names
         * and amounts, which are the game's own constants. */
        paidByName: toLastLedger ? toLastLedger.missions.map((m) => ({
            name: m.name, lines: m.runs, average: m.average, low: m.low, high: m.high,
        })) : null,
        payoutReadingRetired: 'a balance rise cannot be told apart from a daily reward',
        byMissionType: rows.map((r) => ({
            type: Number(r.type) || r.type,
            name: r.name,
            runs: r.runs,
            yours: r.yours,
            /* Kept, and kept labelled. A balance rise near a mission ending is
             * not that mission's payout — a daily task reward lands the same
             * way — so these are observations of the balance, not of a payout,
             * and nothing averages them. */
            balanceRoseNearby: r.measured,
            balanceRiseTotal: r.measured ? r.total : null,
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

/* ------------------------------------------------------- the credits ledger */

/**
 * The game keeps a ledger, and it names every line.
 *
 *     +575   Patient Treatment and Transport   20 Sep 00:45
 *     +649   Child swallows cleaning supply    20 Sep 00:44
 *     +13.500 Completed task "Treat 6 patients"
 *     -5.000 Vehicle bought
 *
 * Which is the thing the balance-watching could never be: each amount already
 * says what it was for. A mission's payout is the line named after the mission,
 * a daily task is named as one and thrown away, and "Patient Treatment" and
 * "Patient Treatment and Transport" are their own income — the figure the
 * ambulance path was missing.
 *
 * Amounts use a dot for thousands, so every character that is not a digit or a
 * sign is dropped before reading it.
 */
const TO_LEDGER_PATHS = ['/credits/overview', '/credits'];

/** Lines that are not a mission being paid for. Matched loosely and on purpose. */
const TO_NOT_A_MISSION = [
    /completed task/i, /\btask\b/i, /bought/i, /constructed/i, /built/i,
    /sold/i, /sale/i, /coins?/i, /alliance (deposit|withdraw)/i, /daily/i,
    /schooling|education|course/i, /extension/i, /expansion/i, /upgrade/i,
];

/** Income that belongs to the ambulance service rather than to a mission name. */
const TO_PATIENT_LINES = /^patient (treatment|transport)/i;

/**
 * Find the columns rather than assume them.
 *
 * The first version took cell 0 as the amount, cell 1 as the description and
 * cell 2 as the date, and threw away any row with fewer than three cells. That
 * is three assumptions about a page nobody here has seen, and on a real account
 * it came back with nothing at all. So each row is asked which of its cells is
 * a number and which carries words, and a row that answers neither is skipped
 * rather than taking the whole read with it.
 *
 * Amounts use a dot for thousands, so every character that is not a digit is
 * dropped and the sign is read separately.
 */
/**
 * Does this cell say nothing but when?
 *
 * A date is a day, a month named in letters and a clock, and nothing else —
 * `23 Sep 23:21`, `Sep 23, 2026 23:21`, `2026-09-23 23:21`. A mission's name
 * has a word in it that is not a month, so the test is: take the digits, the
 * separators and one month name away, and see whether anything is left.
 */
function toLooksLikeDate(text) {
    const months = /jan|feb|mar|apr|may|jun|jul|aug|sep|okt|oct|nov|dez|dec|m\u00e4r|mai|dez/gi;
    const left = text.replace(months, ' ').replace(/[\d:.,\-/]+/g, ' ')
        .replace(/\b(am|pm|uhr|at|um)\b/gi, ' ').replace(/\s+/g, '').trim();
    return left === '' && /\d/.test(text);
}

function toParseLedgerRow(tr) {
    const cells = [...(tr.cells || tr.querySelectorAll('td, th'))];
    if (cells.length < 2) return null;
    const text = (c) => (c.textContent || '').replace(/\s+/g, ' ').trim();

    let amount = null;
    let amountAt = -1;
    for (let i = 0; i < cells.length; i += 1) {
        const t = text(cells[i]);
        if (!/^[+\-\u2212]?\s*[\d.,]+$/.test(t) || !/\d/.test(t)) continue;
        const digits = Number(t.replace(/\D/g, ''));
        if (!Number.isFinite(digits) || !digits) continue;
        amount = /^[-\u2212]/.test(t) ? -digits : digits;
        amountAt = i;
        break;
    }
    if (amount === null) return null;

    /* The description is the wordiest cell that is not the amount and is not a
     * date.
     *
     * A DATE HAS THREE LETTERS IN IT TOO, and that is what went wrong: "23 Sep
     * 23:21" clears a test for three letters, so every row whose description
     * cell was empty fell back to its own date and was counted as a mission.
     * A real account came back with 180 such lines and 236,108 credits filed
     * under a mission called `# Sep #:#`. A cell that reads as a date is never
     * the description — day, month name and a clock, in whatever order the
     * game writes them, with nothing else in it. */
    let what = '';
    for (let i = 0; i < cells.length; i += 1) {
        if (i === amountAt) continue;
        const t = text(cells[i]);
        if (!/[a-z]{3}/i.test(t)) continue;
        if (toLooksLikeDate(t)) continue;
        if (t.length > what.length) what = t;
    }
    if (!what) return null;

    const at = text(cells[cells.length - 1]);
    return { amount, what, at: at === what ? '' : at };
}

/** What the page looked like, for a read that came back empty. */
function toLedgerShape(doc) {
    const tables = [...doc.querySelectorAll('table')];
    return {
        tables: tables.length,
        rows: tables.map((t) => t.querySelectorAll('tr').length),
        /* Cell shapes only: how many, what they are called, whether each held
         * digits or words. Never an amount and never a description. */
        firstRow: tables.map((t) => {
            const tr = t.querySelector('tbody tr, tr');
            if (!tr) return null;
            return [...(tr.cells || [])].map((c) => ({
                tag: c.tagName.toLowerCase(),
                class: (typeof c.className === 'string' && c.className.trim()) || undefined,
                digits: /\d/.test(c.textContent || ''),
                words: /[a-z]{3}/i.test(c.textContent || ''),
            }));
        }),
    };
}

/**
 * THE LEDGER IS 210 PAGES AND THIS READ ONE OF THEM.
 *
 * Everything the ledger answered — what a mission paid, how many patient
 * lines, every kind of line there is — was the most recent page and nothing
 * else, and it said so nowhere. An average over one page of an account's
 * history is not the account's average, and a figure that looks measured while
 * being a sample is exactly what this module already withdrew once.
 *
 * So: how far back it actually read is counted and said, the total the game
 * states is read off its own pagination, and **the next page is followed by
 * the game's own link** — `a[rel="next"]` — rather than by building
 * `?page=N`, which is the same rule every other reader here keeps.
 */
function toLedgerPages(doc) {
    const nav = doc.querySelector('ul.pagination');
    if (!nav) return { next: null, total: 1 };
    const next = nav.querySelector('li.next > a[rel="next"], a[rel="next"]')
        ?.getAttribute('href') || null;
    /* The highest page the game itself links to. It shows an ellipsis in the
     * middle and the last pages at the end, so the biggest number on it is the
     * total — read rather than counted. */
    let total = 1;
    for (const a of nav.querySelectorAll('a[href*="page="]')) {
        const n = Number(/[?&]page=(\d+)/.exec(a.getAttribute('href') || '')?.[1]);
        if (Number.isFinite(n) && n > total) total = n;
    }
    return { next, total };
}

async function toReadLedger(pages = 1, onProgress) {
    let lastError = null;
    let lastShape = null;
    for (const path of TO_LEDGER_PATHS) {
        try {
            /* eslint-disable no-await-in-loop */
            const res = await fetch(path, { credentials: 'same-origin' });
            if (!res.ok) { lastError = `HTTP ${res.status}`; continue; }
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            const rows = [...doc.querySelectorAll('table tr')]
                .map(toParseLedgerRow).filter(Boolean);
            if (!rows.length) {
                lastShape = { path, ...toLedgerShape(doc) };
                lastError = `${path} answered, but no row in it read as an amount and a description`;
                continue;
            }

            const { next: firstNext, total } = toLedgerPages(doc);
            let next = firstNext;
            let read = 1;
            const want = Math.max(1, Math.min(Number(pages) || 1, 200));
            while (next && read < want) {
                onProgress?.(read, want, total);
                const more = await fetch(next, { credentials: 'same-origin' });
                if (!more.ok) break;
                const page = new DOMParser().parseFromString(await more.text(), 'text/html');
                const got = [...page.querySelectorAll('table tr')]
                    .map(toParseLedgerRow).filter(Boolean);
                if (!got.length) break;
                rows.push(...got);
                next = toLedgerPages(page).next;
                read += 1;
                /* A page at a time, unhurried: this is 210 requests if somebody
                 * asks for all of it, and the game is not owed a stampede. */
                await new Promise((go) => { setTimeout(go, 200); });
            }
            return { path, rows, pagesRead: read, pagesTotal: total, more: !!next };
        } catch (err) {
            lastError = err.message;
        }
    }
    const err = new Error(lastError || 'no credits page answered');
    err.shape = lastShape;
    throw err;
}

/**
 * The credits page, as structure.
 *
 * Pressed when the ledger will not read, so the next version knows what it is
 * looking at. Table and cell shapes only \u2014 never an amount, never a line's
 * description, never a balance.
 */
async function toCaptureLedger() {
    const out = { ymca: YMCA.version, what: 'trackops-ledger', at: new Date().toISOString(), pages: [] };
    for (const path of TO_LEDGER_PATHS) {
        try {
            const res = await fetch(path, { credentials: 'same-origin' });
            if (!res.ok) { out.pages.push({ path, status: res.status }); continue; }
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            const rows = [...doc.querySelectorAll('table tr')].map(toParseLedgerRow).filter(Boolean);
            out.pages.push({
                path,
                status: res.status,
                rowsParsed: rows.length,
                ...toLedgerShape(doc),
                /* Where the rest of the ledger is: the game keeps many pages and
                 * one of these links is how to reach them. Shapes, not targets. */
                linkShapes: [...new Set([...doc.querySelectorAll('a[href]')]
                    .map((a) => (a.getAttribute('href') || '').split('?')[0].replace(/\d+/g, '#')))]
                    .filter(Boolean).slice(0, 25),
            });
        } catch (err) {
            out.pages.push({ path, failed: err.message });
        }
    }
    return out;
}

/**
 * One name, spelled one way.
 *
 * The catalogue names a mission and the ledger names the line after it, so the
 * two meet on the name — but only once case and spacing stop mattering.
 */
function toNameKey(name) {
    return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * What the ledger says, grouped by what each line was for.
 *
 * Nothing is inferred here: a line is only counted as a mission's payout if the
 * line is named after that mission. What is left over is reported as such
 * rather than spread across the missions around it.
 */
function toSummariseLedger(rows) {
    const missions = new Map();
    const patients = { lines: 0, total: 0 };
    const kinds = new Map();
    let ignored = 0;
    let spent = 0;

    /* WHAT IS THROWN AWAY IS WHAT THE STATS ARE MADE OF. Everything this counts
     * as "not a mission" — a prisoner delivered, an alliance share, a daily
     * task, a course — is a thing the player wants counted, and the only reason
     * it is not counted yet is that nobody here knows the words the game writes
     * for it. So each one is tallied by its own description with the figures
     * taken out: digits masked and anything quoted emptied, which leaves the
     * game's own wording and no mission, task or building of the player's in
     * it. That is the vocabulary the next version is built from. */
    const kindOf = (what) => String(what).replace(/"[^"]*"/g, '"…"')
        .replace(/\d[\d.,]*/g, '#').replace(/\s+/g, ' ').trim()
        .slice(0, 80);

    for (const row of rows) {
        const kind = kindOf(row.what);
        const tally = kinds.get(kind) || { kind, lines: 0, paid: 0, spent: 0 };
        tally.lines += 1;
        if (row.amount < 0) tally.spent += -row.amount; else tally.paid += row.amount;
        kinds.set(kind, tally);

        if (row.amount < 0) { spent += -row.amount; continue; }
        if (TO_PATIENT_LINES.test(row.what)) {
            patients.lines += 1;
            patients.total += row.amount;
            continue;
        }
        if (TO_NOT_A_MISSION.some((re) => re.test(row.what))) { ignored += 1; continue; }
        const seen = missions.get(row.what) || { name: row.what, runs: 0, total: 0, low: Infinity, high: 0 };
        seen.runs += 1;
        seen.total += row.amount;
        seen.low = Math.min(seen.low, row.amount);
        seen.high = Math.max(seen.high, row.amount);
        missions.set(row.what, seen);
    }

    return {
        missions: [...missions.values()]
            .map((m) => Object.assign(m, { average: Math.round(m.total / m.runs) }))
            .sort((a, b) => b.runs - a.runs || b.total - a.total),
        patients,
        ignored,
        spent,
        lines: rows.length,
        /* Every kind of line the ledger holds, by the game's own wording, with
         * every figure in the text taken out. Missions are in here too, because
         * telling a mission name from a payout kind by looking at it is exactly
         * the guess that has to stop. */
        kinds: [...kinds.values()].sort((a, b) => b.lines - a.lines),
    };
}

/* --------------------------------------------------------------- recording */

let toHooked = false;
let toOriginals = null;
let toBalance = null;
let toPending = [];
/** Mission ids already counted, so the game announcing one twice counts once. */
const toRecent = new Map();

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
 *
 * THE SAME MISSION IS ANNOUNCED MORE THAN ONCE. The first run recorded 15
 * endings that were really 9 missions: six of them arrived twice, and because
 * a second ending inside the window marked both unattributable, every
 * duplicated mission measured nothing. A mission can only end once, so the
 * instance id is remembered and a repeat is dropped.
 */
/**
 * Missions one of your own vehicles was sent to.
 *
 * `missionDelete` says a mission ended, not that you were in it. An alliance
 * call somebody else handled ends on your map exactly like one of yours, and
 * counting those made "what you have run" a count of what your alliance has
 * run.
 *
 * Written from inside the mission window, where the answer is plain: the ids in
 * `/api/vehicles` are yours, and `#mission_vehicle_at_mission` says which
 * vehicles are there. An id in both is your vehicle at that mission. Pressing
 * one of the game's dispatch buttons says the same thing a moment earlier.
 *
 * Nothing is inferred from the map: a mission you never opened and never sent
 * to is simply not marked, and the panel counts it as unknown rather than as
 * yours.
 */
const TO_MINE_KEY = 'ymca-trackops-mine';
const TO_MINE_MAX = 400;

function toMarkMine(missionId) {
    const id = String(missionId || '');
    if (!id) return;
    const mine = toRead(TO_MINE_KEY, []);
    if (mine.includes(id)) return;
    mine.push(id);
    toWrite(TO_MINE_KEY, mine.slice(-TO_MINE_MAX));
}

const toIsMine = (id) => toRead(TO_MINE_KEY, []).includes(String(id));

function toMissionEnded(missionId) {
    const id = String(missionId);
    const at = Date.now();

    if (toPending.some((e) => e.mission === id)) return;
    if (toRecent.get(id) > at - TO_DEDUPE_MS) return;
    toRecent.set(id, at);
    for (const [key, when] of toRecent) if (when < at - TO_DEDUPE_MS) toRecent.delete(key);

    const panel = document.getElementById(`mission_${id}`);
    const type = panel?.getAttribute('mission_type_id') || null;
    if (type === null) return; // not one of ours, or already gone

    const entry = {
        mission: id, at, type: Number(type) || type, delta: null,
        alone: toPending.length === 0,
        mine: toIsMine(id),
    };
    /* Something else already waiting means a balance change could belong to
     * either, so neither is trusted for the averages — it is still counted. */
    if (toPending.length) for (const other of toPending) other.alone = false;
    toPending.push(entry);

    setTimeout(() => {
        toPending = toPending.filter((e) => e !== entry);
        const log = toRead(TO_LOG_KEY, []);
        log.push({
            at: entry.at, mission: entry.mission, type: entry.type,
            delta: entry.delta, alone: entry.alone, mine: entry.mine,
        });
        toWrite(TO_LOG_KEY, log.slice(-TO_LOG_MAX));
    }, TO_SETTLE_MS);
}

/**
 * The balance changed. Give it to whatever ended just before it.
 *
 * One rise belongs to one mission, so it goes to the longest-waiting ending
 * that has not been paid yet. The first version added every rise to every
 * pending mission, which double-counted the moment two ended together.
 *
 * A rise while nothing is pending is the player selling or being paid for
 * something else, and is simply the new baseline. A fall is never a payout.
 */
function toCreditsChanged(next) {
    if (typeof next !== 'number' || !isFinite(next)) return;
    const previous = toBalance;
    toBalance = next;
    if (previous === null) return;
    const delta = next - previous;
    if (delta <= 0) return;
    const waiting = toPending.filter((e) => e.delta === null);
    if (!waiting.length) return;
    waiting[0].delta = delta;
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

/**
 * Inside a mission window: was one of your own vehicles there?
 *
 * Two signals, both measured, neither asking the player anything.
 *
 * Pressing any of the game's five dispatch controls sends what is ticked, and
 * what is ticked is yours — the selection table only ever lists your own
 * vehicles. That marks the mission immediately.
 *
 * The other is for a mission you joined earlier and reopened: `/api/vehicles`
 * is your fleet, `#mission_vehicle_at_mission` and `#mission_vehicle_driving`
 * are the vehicles there and on the way, and an id in both is yours. The fleet
 * list is the one YMCA already caches, so this costs no extra request.
 */
const TO_DISPATCH = '#mission-form input[name="commit"], .alert_next, .alert_next_alliance,'
    + ' #mission_alarm_btn, #mission_alarm_btn_mobile';

YMCA.inject('trackops', (ctx) => {
    const info = document.getElementById('mission_general_info');
    if (!info || !document.getElementById('mission-form')) return;

    const missionId = (/\/missions\/(\d+)/.exec(location.pathname) || [])[1]
        || info.getAttribute('mission_id') || null;
    if (!missionId) return;

    document.addEventListener('click', (e) => {
        if (!e.target?.closest?.(TO_DISPATCH)) return;
        toMarkMine(missionId);
        ctx.log.info('trackops', `mission ${missionId} is yours — you dispatched to it`);
    }, true);

    /* And for one you are already in. Re-checked as the tables fill, because
     * the vehicles at a mission arrive after the page does. */
    const check = async () => {
        if (toIsMine(missionId)) return;
        let fleet;
        try {
            // `shrink` is handed the whole answer, not each row, and only the ids are wanted.
            fleet = await ctx.gameCached('/api/vehicles', 6 * 3600e3,
                (data) => (Array.isArray(data) ? data.map((v) => String(v.id)) : []));
        } catch (err) { return; }
        const own = new Set(Array.isArray(fleet) ? fleet.map(String) : []);
        if (!own.size) return;
        const rows = document.querySelectorAll(
            '#mission_vehicle_at_mission tbody tr[id^="vehicle_row"], '
            + '#mission_vehicle_driving tbody tr[id^="vehicle_row"]');
        for (const row of rows) {
            if (own.has(row.id.replace('vehicle_row_', ''))) {
                toMarkMine(missionId);
                ctx.log.info('trackops', `mission ${missionId} is yours — your vehicle is there`);
                return;
            }
        }
    };
    check();
    const watcher = new MutationObserver(() => check());
    watcher.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => watcher.disconnect(), 120000);
    return true;
});

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
