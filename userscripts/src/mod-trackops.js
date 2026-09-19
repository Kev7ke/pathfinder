/* --------------------------------------------------------------------------
 * TrackOps — count the missions you finish, and what they paid.
 *
 * Only from the day it is installed, which is the honest limit: the game does
 * not hand out a history.
 *
 * NOT COUNTING YET. Counting means noticing the moment a mission completes, and
 * that moment has never been observed from the side this was written on. It
 * might be a page the game navigates to, a websocket frame, or a row leaving a
 * list. Guessing would produce a counter that is quietly wrong, which is worse
 * than one that says it is empty.
 *
 * So this ships as the store, the display, and a button that watches for the
 * event and reports what it saw.
 * -------------------------------------------------------------------------- */

YMCA.register({
    id: 'trackops',
    title: 'TrackOps',
    tagline: 'What you have run',

    description: 'Counts the missions you finish and what they paid, from today onward. '
        + 'Not counting yet — it needs to learn how the game announces a completed mission.',

    async mount(el, ctx) {
        const log = ctx.store.read('missions', []);
        const total = log.reduce((n, m) => n + (m.credits || 0), 0);

        el.innerHTML = `
      <div class="ymca-note warn"><b>Not counting yet.</b> Nothing has been recorded, because
        the moment a mission completes has not been identified yet. The watcher below is how
        that gets found.</div>

      <div class="ymca-card">
        <b>So far</b>
        <p style="font-size:26px;font-weight:700;margin:8px 0 2px">${log.length}
          <span class="ymca-dim" style="font-size:14px;font-weight:400">missions</span></p>
        <p class="ymca-dim">${ctx.fmt(total)} credits recorded</p>
        ${log.length ? '' : '<p class="ymca-dim">Nothing yet.</p>'}
      </div>

      <div class="ymca-card">
        <b>Teach it what a finished mission looks like</b>
        <p class="ymca-sub" style="margin:4px 0 10px">Press start, then play normally and finish
          a mission. The watcher records how the page changed around that moment — which
          requests were made and which parts of the page appeared or vanished. Press stop and
          send the result; that is what turns the counter on.</p>
        <button class="ymca-btn primary" data-do="watch">Start watching</button>
        <button class="ymca-btn" data-do="stop" disabled>Stop and copy</button>
        <span class="ymca-status" id="to-status"></span>
        <textarea id="to-out" rows="12" readonly style="width:100%;margin-top:10px;
          font-family:ui-monospace,monospace;font-size:11.5px"></textarea>
      </div>

      <div class="ymca-card">
        <b>What is also needed</b>
        <ul style="margin:6px 0 0;padding-left:20px" class="ymca-dim">
          <li>The game's own mission icons, so the list can look like the game. They are served
            from <code>/images/</code> — the mission list already names them.</li>
          <li>Whether the credit figure on completion is the mission's listed average or the
            exact amount paid. TrackOps should record what was paid, not what was expected.</li>
        </ul>
      </div>`;

        let watcher = null;
        el.addEventListener('click', (e) => {
            const start = e.target.closest('[data-do="watch"]');
            const stop = e.target.closest('[data-do="stop"]');
            if (start) {
                watcher = startWatching();
                el.querySelector('[data-do="watch"]').disabled = true;
                el.querySelector('[data-do="stop"]').disabled = false;
                ctx.status('Watching — go and finish a mission.');
                ctx.log.info('mission watcher started');
            } else if (stop && watcher) {
                const report = watcher.stop();
                el.querySelector('#to-out').value = JSON.stringify(report, null, 1);
                ctx.clipboard(el.querySelector('#to-out').value, 'what the watcher saw');
                el.querySelector('[data-do="watch"]').disabled = false;
                el.querySelector('[data-do="stop"]').disabled = true;
                watcher = null;
                ctx.log.info('mission watcher stopped', `${report.requests.length} requests`);
            }
        });
    },
});

/**
 * Watch how the page behaves around a finished mission.
 *
 * Records request paths and coarse page changes, never response bodies or page
 * text, so nothing about the player or the missions themselves is carried.
 */
function startWatching() {
    const started = Date.now();
    const requests = [];
    const mutations = [];

    const realFetch = window.fetch;
    window.fetch = async function (...args) {
        const url = String(args[0]);
        const at = Date.now() - started;
        try {
            const res = await realFetch.apply(this, args);
            requests.push({ at, url: url.split('?')[0], status: res.status, method: args[1]?.method || 'GET' });
            return res;
        } catch (err) {
            requests.push({ at, url: url.split('?')[0], error: true });
            throw err;
        }
    };

    const realOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        requests.push({ at: Date.now() - started, url: String(url).split('?')[0], method, xhr: true });
        return realOpen.call(this, method, url, ...rest);
    };

    const observer = new MutationObserver((list) => {
        for (const m of list) {
            if (mutations.length > 120) return;
            const target = m.target;
            if (!(target instanceof Element)) continue;
            const id = target.id || target.className;
            if (!id || typeof id !== 'string') continue;
            if (!/mission|credit|alarm|vehicle/i.test(id)) continue;
            mutations.push({
                at: Date.now() - started,
                on: id.slice(0, 60),
                added: m.addedNodes.length,
                removed: m.removedNodes.length,
            });
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return {
        stop() {
            window.fetch = realFetch;
            XMLHttpRequest.prototype.open = realOpen;
            observer.disconnect();
            return {
                note: 'request paths and coarse page changes only — no response bodies, no page text',
                watchedForSeconds: Math.round((Date.now() - started) / 1000),
                url: location.pathname,
                requests: requests.slice(0, 120),
                mutations,
            };
        },
    };
}
