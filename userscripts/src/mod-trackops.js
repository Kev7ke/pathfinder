/* --------------------------------------------------------------------------
 * TrackOps — count the missions you finish, and what they paid.
 *
 * Only from the day it is installed, which is the honest limit: the game does
 * not hand out a history.
 *
 * NOT COUNTING YET, and here is what the first attempt learnt. That watcher
 * wrapped fetch and XMLHttpRequest and came back with zero requests across
 * half a minute in which the mission list never stopped moving. The game is
 * not polled over HTTP; it is pushed to over a socket that is already open by
 * the time a userscript set to document-idle runs. So the socket cannot be
 * tapped after the fact, and the rendered page is what is left.
 *
 * That is not a loss. The page is where the answer actually is — a mission
 * leaving your list and the credit counter moving in the same second is the
 * completion, whatever frame carried it. The first watcher did see the list
 * change; it just counted the changes instead of naming them, so a row the
 * game removed and re-added while re-sorting looked exactly like a mission
 * that ended.
 *
 * This one names them: which mission id left, whether it came back, what the
 * credit counter did around it, and what the row was built out of. It also
 * survives a page load, so the watch can be armed and then simply played
 * through.
 * -------------------------------------------------------------------------- */

const TO_KEY = 'ymca-trackops-watch';
const TO_MAX_EVENTS = 400;

/* A row the game removes and re-adds while re-sorting is back within a frame
 * or two. Four seconds is far beyond that and far below a real mission's life,
 * so it separates the two without having to guess at either. */
const TO_RESORT_GRACE_MS = 4000;

/* Where the game keeps the running credit total. Read in order; the first one
 * present wins, and which one it was is in the report. */
const TO_CREDIT_SELECTORS = ['#credits_user_total', '.credits_user_total', '#credits', '.credits'];

/* Ids the game is known to use around a mission ending, from reading
 * jxn-30/LSS-Scripts. Present here only to be noticed, never to be clicked. */
const TO_MARKER_IDS = ['mission_deleted', 'mission_general_info', 'mission_alarm_btn'];

YMCA.register({
    id: 'trackops',
    title: 'TrackOps',
    tagline: 'What you have run',

    description: 'Counts the missions you finish and what they paid, from today onward. '
        + 'Not counting yet — it needs to learn how the game announces a completed mission.',

    async mount(el, ctx) {
        const log = ctx.store.read('missions', []);
        const total = log.reduce((n, m) => n + (m.credits || 0), 0);
        const live = toSession();

        el.innerHTML = `
      <div class="ymca-note warn"><b>Not counting yet.</b> Nothing has been recorded, because
        the moment a mission completes has not been identified yet. The first watcher listened
        on the wrong channel — the game pushes over a socket rather than polling — so this one
        reads the page instead. One run of it is what turns the counter on.</div>

      <div class="ymca-card">
        <b>So far</b>
        <p style="font-size:26px;font-weight:700;margin:8px 0 2px">${log.length}
          <span class="ymca-dim" style="font-size:14px;font-weight:400">missions</span></p>
        <p class="ymca-dim">${ctx.fmt(total)} credits recorded</p>
        ${log.length ? '' : '<p class="ymca-dim">Nothing yet.</p>'}
      </div>

      <div class="ymca-card">
        <b>Teach it what a finished mission looks like</b>
        <p class="ymca-sub" style="margin:4px 0 10px">Press start, then close this window and
          play until at least one mission has finished — a handful is better. The watch keeps
          running while you play and survives a page reload, so there is no hurry. Come back,
          press stop, and send what it copied.</p>
        <button class="ymca-btn primary" data-do="watch"${live ? ' disabled' : ''}>Start watching</button>
        <button class="ymca-btn" data-do="stop"${live ? '' : ' disabled'}>Stop and copy</button>
        <button class="ymca-btn" data-do="discard"${live ? '' : ' disabled'}>Discard</button>
        <span class="ymca-status" id="to-status">${live ? toLiveLine(live) : ''}</span>
        <textarea id="to-out" rows="12" readonly style="width:100%;margin-top:10px;
          font-family:ui-monospace,monospace;font-size:11.5px"></textarea>
      </div>

      <div class="ymca-card">
        <b>What it writes down</b>
        <ul style="margin:6px 0 0;padding-left:20px" class="ymca-dim">
          <li>Which mission id left your list, and whether it came straight back — that is how a
            finished mission is told apart from the game re-sorting the list.</li>
          <li>How much the credit counter moved around that moment. The <em>change</em>, never
            your balance.</li>
          <li>What a mission row is built out of: attribute and element names, and the numbers in
            them. No mission text, no addresses, no names.</li>
        </ul>
      </div>

      <div class="ymca-card">
        <b>What is still needed after that</b>
        <ul style="margin:6px 0 0;padding-left:20px" class="ymca-dim">
          <li>The game's own mission icons, so the list can look like the game. They are served
            from <code>/images/</code> — the mission list already names them.</li>
          <li>Whether the credit figure on completion is the mission's listed average or the
            exact amount paid. TrackOps must record what was paid, not what was expected — and
            that is the whole point, because 96 of the 197 ambulance missions carry no listed
            figure at all.</li>
        </ul>
      </div>`;

        const status = (text) => { el.querySelector('#to-status').textContent = text; };
        const buttons = (watching) => {
            el.querySelector('[data-do="watch"]').disabled = watching;
            el.querySelector('[data-do="stop"]').disabled = !watching;
            el.querySelector('[data-do="discard"]').disabled = !watching;
        };

        let ticker = null;
        const tick = () => {
            const s = toSession();
            if (s) status(toLiveLine(s));
        };
        if (live) ticker = setInterval(tick, 2000);

        el.addEventListener('click', (e) => {
            if (e.target.closest('[data-do="watch"]')) {
                toArm();
                buttons(true);
                ctx.status('Watching — close this and go and finish a mission.');
                ctx.log.info('mission watcher armed');
                clearInterval(ticker);
                ticker = setInterval(tick, 2000);
                tick();
            } else if (e.target.closest('[data-do="stop"]')) {
                const report = toDisarm();
                clearInterval(ticker);
                buttons(false);
                if (!report) { status('Nothing was being watched.'); return; }
                const text = JSON.stringify(report, null, 1);
                el.querySelector('#to-out').value = text;
                ctx.clipboard(text, 'what the watcher saw');
                ctx.log.info('mission watcher stopped',
                    `${report.missionList.departures.length} departures, `
                    + `${report.credits.changes.length} credit changes`);
            } else if (e.target.closest('[data-do="discard"]')) {
                toDisarm();
                clearInterval(ticker);
                buttons(false);
                status('Discarded.');
                ctx.log.info('mission watcher discarded');
            }
        });
    },
});

/* ---------------------------------------------------------------- the watch */

/** The armed session, or null. Kept in localStorage so a reload does not end it. */
function toSession() {
    try {
        return JSON.parse(localStorage.getItem(TO_KEY)) || null;
    } catch (e) {
        return null;
    }
}

function toSave(session) {
    try {
        localStorage.setItem(TO_KEY, JSON.stringify(session));
    } catch (e) { /* private window: the watch still runs, it just forgets on reload */ }
}

function toLiveLine(session) {
    const mins = Math.round((Date.now() - session.started) / 60000);
    const left = session.events.filter((ev) => ev.type === 'left' && !ev.cameBack).length;
    return `Watching for ${mins} min · ${session.events.length} events · ${left} missions gone`;
}

function toArm() {
    toSave({ started: Date.now(), events: [], page: location.pathname });
    toAttach();
}

function toDisarm() {
    const session = toSession();
    toDetach();
    try { localStorage.removeItem(TO_KEY); } catch (e) { /* nothing to remove */ }
    return session ? toReport(session) : null;
}

/** Append an event. Capped, so a watch left running overnight cannot fill the store. */
function toRecord(type, extra) {
    const session = toSession();
    if (!session) return null;
    if (session.events.length >= TO_MAX_EVENTS) return session;
    session.events.push(Object.assign({ at: Date.now() - session.started, type }, extra));
    toSave(session);
    return session;
}

/** Mark the departure this arrival cancels, if it is inside the re-sort grace. */
function toCancelDeparture(missionId) {
    const session = toSession();
    if (!session) return false;
    const now = Date.now() - session.started;
    for (let i = session.events.length - 1; i >= 0; i -= 1) {
        const ev = session.events[i];
        if (ev.type !== 'left' || ev.mission !== missionId || ev.cameBack) continue;
        if (now - ev.at > TO_RESORT_GRACE_MS) return false;
        ev.cameBack = true;
        ev.backAfterMs = now - ev.at;
        toSave(session);
        return true;
    }
    return false;
}

/* ------------------------------------------------------- reading the page */

const TO_ROW_ID = /^mission_(\d+)$/;

/** Digits out, so an id is reported as a shape rather than as a particular thing. */
function toShape(id) {
    return String(id || '').replace(/\d+/g, '#').slice(0, 48);
}

/**
 * What a mission row is made of — names and numbers, never text.
 *
 * This is the piece that lets a completed mission be matched back to its entry
 * in /einsaetze.json, which is where the credit figure and the mission's real
 * name live. Reading the caption out of the page instead would carry the
 * address the game prints next to it.
 */
function toRowAnatomy(row) {
    if (!(row instanceof Element)) return null;
    const numeric = {};
    const names = [];
    for (const attr of row.attributes) {
        names.push(attr.name);
        if (/^-?\d+$/.test(attr.value) && attr.value.length <= 12) numeric[attr.name] = Number(attr.value);
    }
    const childIds = [];
    for (const child of row.querySelectorAll('[id]')) {
        const shape = toShape(child.id);
        if (shape && !childIds.includes(shape)) childIds.push(shape);
        if (childIds.length >= 12) break;
    }
    return { tag: row.tagName.toLowerCase(), attrs: names, numericAttrs: numeric, childIdShapes: childIds };
}

function toCreditsElement() {
    for (const sel of TO_CREDIT_SELECTORS) {
        const node = document.querySelector(sel);
        if (node) return { node, selector: sel };
    }
    return null;
}

function toCreditsValue(node) {
    const digits = (node.textContent || '').replace(/[^\d-]/g, '');
    return digits ? Number(digits) : null;
}

let toObservers = [];
let toCreditsLast = null;

function toAttach() {
    toDetach();
    const session = toSession();
    if (!session) return;

    /* --- the mission list --- */
    const list = document.getElementById('mission_list');
    if (list) {
        const listObserver = new MutationObserver((records) => {
            for (const rec of records) {
                for (const node of rec.removedNodes) {
                    const m = node instanceof Element && TO_ROW_ID.exec(node.id || '');
                    if (m) toRecord('left', { mission: Number(m[1]), row: toRowAnatomy(node) });
                }
                for (const node of rec.addedNodes) {
                    const m = node instanceof Element && TO_ROW_ID.exec(node.id || '');
                    if (!m) continue;
                    if (!toCancelDeparture(Number(m[1]))) toRecord('joined', { mission: Number(m[1]) });
                }
            }
        });
        listObserver.observe(list, { childList: true });
        toObservers.push(listObserver);
        toRecord('listFound', { rows: list.querySelectorAll('[id^="mission_"]').length });
    } else {
        toRecord('listMissing', {});
    }

    /* --- the credit counter --- */
    const credits = toCreditsElement();
    if (credits) {
        toCreditsLast = toCreditsValue(credits.node);
        const creditObserver = new MutationObserver(() => {
            const now = toCreditsValue(credits.node);
            if (now === null || now === toCreditsLast) return;
            /* The change, never the balance. */
            toRecord('credits', { delta: toCreditsLast === null ? null : now - toCreditsLast });
            toCreditsLast = now;
        });
        creditObserver.observe(credits.node, { childList: true, characterData: true, subtree: true });
        toObservers.push(creditObserver);
        toRecord('creditsFound', { selector: credits.selector });
    } else {
        toRecord('creditsMissing', { tried: TO_CREDIT_SELECTORS });
    }

    /* --- anything the game puts up around a mission ending --- */
    const seen = new Set();
    const bodyObserver = new MutationObserver((records) => {
        for (const rec of records) {
            for (const node of rec.addedNodes) {
                if (!(node instanceof Element)) continue;
                for (const id of TO_MARKER_IDS) {
                    if ((node.id === id || node.querySelector?.(`#${id}`)) && !seen.has(id)) {
                        seen.add(id);
                        toRecord('marker', { id });
                    }
                }
            }
        }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
    toObservers.push(bodyObserver);

    /* --- the socket, best effort ---
     * Anything already open is out of reach at document-idle, so this only
     * catches a connection made from now on, and records the shape of a frame
     * rather than what is in it. If it stays empty that is the expected
     * outcome, not a failure. */
    if (!window.__ymcaSocketTap) {
        const RealSocket = window.WebSocket;
        const Tapped = function (url, protocols) {
            const socket = protocols === undefined ? new RealSocket(url) : new RealSocket(url, protocols);
            toRecord('socketOpen', { path: String(url).split('?')[0].replace(/\/\/[^/]+/, '//…') });
            socket.addEventListener('message', (ev) => {
                toRecord('frame', toFrameShape(ev.data));
            });
            return socket;
        };
        Tapped.prototype = RealSocket.prototype;
        for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Tapped[k] = RealSocket[k];
        window.WebSocket = Tapped;
        window.__ymcaSocketTap = { real: RealSocket };
    }

    /* --- Rails' own push channel, if it is reachable ---
     * A read, not a hook: which channels exist says what the game pushes about. */
    try {
        const subs = window.App?.cable?.subscriptions?.subscriptions;
        if (Array.isArray(subs)) {
            toRecord('actionCable', { channels: subs.map((s) => toShape(s.identifier)).slice(0, 12) });
        }
    } catch (e) { /* not an ActionCable page, or it is not exposed */ }
}

/** Keys and value types. Short discriminators are kept because they name the event. */
function toFrameShape(data) {
    if (typeof data !== 'string') return { kind: typeof data };
    let parsed;
    try {
        parsed = JSON.parse(data);
    } catch (e) {
        return { kind: 'text', bytes: data.length, head: toShape(data.slice(0, 24)) };
    }
    if (parsed === null || typeof parsed !== 'object') return { kind: typeof parsed, bytes: data.length };
    const shape = { kind: 'json', bytes: data.length, keys: Object.keys(parsed).slice(0, 12) };
    for (const key of ['type', 'event', 'action', 'command', 'channel', 'identifier']) {
        const v = parsed[key];
        if (typeof v === 'string' && v.length <= 40) shape[key] = v;
    }
    return shape;
}

function toDetach() {
    for (const o of toObservers) o.disconnect();
    toObservers = [];
    toCreditsLast = null;
    if (window.__ymcaSocketTap) {
        window.WebSocket = window.__ymcaSocketTap.real;
        delete window.__ymcaSocketTap;
    }
}

/* ------------------------------------------------------------- the report */

function toReport(session) {
    const ev = session.events;
    const departures = ev.filter((e) => e.type === 'left')
        .map((e) => ({ at: e.at, mission: e.mission, cameBack: !!e.cameBack, backAfterMs: e.backAfterMs, row: e.row }));
    const changes = ev.filter((e) => e.type === 'credits').map((e) => ({ at: e.at, delta: e.delta }));

    /* The pairing is the question this whole run exists to answer, so it is put
     * in the report rather than worked out later: a departure that did not come
     * back, next to whatever the credit counter did within five seconds of it. */
    const paired = departures.filter((d) => !d.cameBack).map((d) => ({
        mission: d.mission,
        at: d.at,
        creditChangesNearby: changes.filter((c) => Math.abs(c.at - d.at) <= 5000)
            .map((c) => ({ offsetMs: c.at - d.at, delta: c.delta })),
    }));

    return {
        note: 'mission ids, element and attribute names, and credit changes only — '
            + 'no mission text, no addresses, no names, and never a balance',
        watchedForSeconds: Math.round((Date.now() - session.started) / 1000),
        page: session.page,
        found: {
            missionList: ev.some((e) => e.type === 'listFound'),
            creditsSelector: ev.find((e) => e.type === 'creditsFound')?.selector || null,
            rowsAtStart: ev.find((e) => e.type === 'listFound')?.rows ?? null,
            actionCableChannels: ev.find((e) => e.type === 'actionCable')?.channels || null,
        },
        counts: {
            events: ev.length,
            capped: ev.length >= TO_MAX_EVENTS,
            departures: departures.length,
            resorts: departures.filter((d) => d.cameBack).length,
            arrivals: ev.filter((e) => e.type === 'joined').length,
            creditChanges: changes.length,
            socketFrames: ev.filter((e) => e.type === 'frame').length,
        },
        missionList: { departures },
        credits: { changes },
        pairedWithCredits: paired,
        markers: ev.filter((e) => e.type === 'marker').map((e) => ({ at: e.at, id: e.id })),
        socketFrames: ev.filter((e) => e.type === 'frame').slice(0, 40),
    };
}

/* If the watch was armed before a page load, pick it back up. */
if (toSession()) toAttach();
