/* ==========================================================================
 * YMCA — Your Mission Chief Alpha
 * The shell: a full-screen window, a module registry, and the services every
 * module needs. Modules never talk to the game or the DOM chrome directly;
 * they get a context and render into the panel they are handed.
 * ========================================================================== */

const YMCA = {
    version: '__VERSION__',
    modules: [],
    /** Register a module. Order here is the order in the sidebar. */
    register(mod) {
        this.modules.push(mod);
    },
};

const LS = {
    ui: 'ymca-ui',
    log: 'ymca-log',
};

// ---------- small helpers every module uses ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => Number(n).toLocaleString('en-US');

function readStore(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch (e) {
        return fallback;
    }
}
function writeStore(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* private window: nothing is remembered, everything still works */ }
}

/**
 * A rolling log of what YMCA did and what went wrong.
 *
 * This exists because the person running it can see the game and I cannot.
 * When something misbehaves, the Diagnostics module hands the last entries
 * over in one copyable block, so a bug report is a paste rather than a
 * description.
 */
const LOG_MAX = 200;
function log(level, where, message, detail) {
    const entries = readStore(LS.log, []);
    entries.push({
        at: new Date().toISOString(),
        level,
        where,
        message: String(message),
        detail: detail === undefined ? undefined
            : String(detail).slice(0, 400),
    });
    writeStore(LS.log, entries.slice(-LOG_MAX));
    if (level === 'error') console.error('[YMCA]', where, message, detail ?? '');
}
const logger = {
    info: (where, msg, detail) => log('info', where, msg, detail),
    warn: (where, msg, detail) => log('warn', where, msg, detail),
    error: (where, msg, detail) => log('error', where, msg, detail),
    read: () => readStore(LS.log, []),
    clear: () => writeStore(LS.log, []),
};

// ---------- the game ----------
/** Every game request goes through here, so every failure is logged once. */
async function getJSON(path) {
    const started = Date.now();
    try {
        const res = await fetch(path, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        logger.info('api', `${path} ok`, `${Date.now() - started}ms`);
        return data;
    } catch (err) {
        logger.error('api', `${path} failed`, err.message);
        throw err;
    }
}

function gameLocale() {
    try {
        const w = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
        return w.I18n?.locale || '';
    } catch (e) {
        return '';
    }
}

function download(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    logger.info('download', filename, `${text.length} bytes`);
}

/** Cross-origin fetch that CORS and the page's content policy cannot block. */
function fetchExternal(url) {
    if (typeof GM_xmlhttpRequest === 'function') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url, timeout: 20000,
                onload: (res) => {
                    if (res.status < 200 || res.status >= 300) {
                        reject(new Error(`answered ${res.status}`));
                        return;
                    }
                    try {
                        resolve(JSON.parse(res.responseText));
                    } catch (err) {
                        reject(new Error('the answer was not JSON'));
                    }
                },
                onerror: () => reject(new Error('the request was refused')),
                ontimeout: () => reject(new Error('the request timed out')),
            });
        });
    }
    return fetch(url).then((res) => {
        if (!res.ok) throw new Error(`answered ${res.status}`);
        return res.json();
    });
}

/**
 * Game data, fetched once per open and shared between modules, so switching
 * from the Pathfinder to the Renamer does not refetch 1,500 missions.
 */
const cache = new Map();

/**
 * Throw the cache away, so the next read is fresh.
 *
 * The cache lives as long as the page does, which is right for switching
 * between tools but wrong after buying a station or moving a vehicle. The
 * refresh button in the title bar calls this so the page does not have to be
 * reloaded for YMCA to see the change.
 */
function forgetGameData() {
    cache.clear();
    logger.info('shell', 'game data forgotten, next read is fresh');
}

async function gameData(path) {
    if (!cache.has(path)) cache.set(path, getJSON(path));
    try {
        return await cache.get(path);
    } catch (err) {
        cache.delete(path);   // a failure must not be cached
        throw err;
    }
}

// ---------- the window ----------
const WINDOW_ID = 'ymca-window';

/**
 * The palette is the game's own, read out of it with Diagnostics -> Copy
 * interface probe rather than guessed:
 *
 *   body and modal   rgb(80,80,80) with white text   -> the game is DARK
 *   navbar           rgb(0,73,151)
 *   panel borders    black
 *   radii            modal 6px, panel 4px, button 3px
 *   type             "Helvetica Neue", Helvetica, Arial, 14px; buttons 12px
 *
 * Two readings from that probe were NOT copied, because they cannot be what
 * they appear to be: .btn-default came back as white on white, and
 * .panel-heading as #ddd on #f5f5f5. Both would be invisible, so they were
 * measured on an element with something else overriding it. Where a reading
 * was implausible the Bootstrap 3 default was used instead, and that is the
 * only place in here that is not straight from the game.
 */
function styles() {
    return `
#${WINDOW_ID}{--g-ground:#505050;--g-raise:#5a5a5a;--g-navy:#004997;--g-ink:#fff;
  --g-dim:rgba(255,255,255,.62);--g-line:rgba(0,0,0,.45);--g-soft:rgba(255,255,255,.14);
  --g-red:#c9302c;--g-font:"Helvetica Neue",Helvetica,Arial,sans-serif;
  position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;
  background:rgba(0,0,0,.5);font:14px/1.42857 var(--g-font);color:var(--g-ink)}
#${WINDOW_ID} *{box-sizing:border-box}
#${WINDOW_ID} .ymca-sheet{margin:auto;width:min(1100px,94vw);max-height:92vh;display:flex;
  flex-direction:column;background:var(--g-ground);border:1px solid rgba(0,0,0,.2);
  border-radius:6px;box-shadow:0 5px 15px rgba(0,0,0,.5);overflow:hidden}
#${WINDOW_ID} .ymca-bar{display:flex;align-items:center;gap:12px;padding:11px 15px;flex:none;
  background:var(--g-navy);color:#fff;border-bottom:1px solid rgba(0,0,0,.35)}
#${WINDOW_ID} .ymca-logo{font-weight:700;letter-spacing:.06em}
#${WINDOW_ID} .ymca-logo small{font-weight:400;opacity:.75;margin-left:8px;letter-spacing:0}
#${WINDOW_ID} .ymca-spacer{flex:1}
#${WINDOW_ID} .ymca-back{background:rgba(255,255,255,.16);border:0;color:#fff;border-radius:3px;
  padding:5px 11px;cursor:pointer;font:600 12px/1.2 var(--g-font)}
#${WINDOW_ID} .ymca-back:hover{background:rgba(255,255,255,.28)}
#${WINDOW_ID} .ymca-refresh{background:none;border:0;color:#fff;font-size:19px;line-height:1;
  cursor:pointer;padding:0 6px;opacity:.8}
#${WINDOW_ID} .ymca-refresh:hover{opacity:1}
#${WINDOW_ID} .ymca-refresh.spin{animation:ymca-spin .6s linear infinite}
@keyframes ymca-spin{to{transform:rotate(360deg)}}
#${WINDOW_ID} .ymca-close{background:none;border:0;color:#fff;font-size:24px;line-height:1;
  cursor:pointer;padding:0 4px;opacity:.8}
#${WINDOW_ID} .ymca-close:hover{opacity:1}
#${WINDOW_ID} .ymca-main{flex:1;overflow:auto;padding:16px 18px;background:var(--g-ground)}

/* the launcher */
#${WINDOW_ID} .ymca-tiles{display:grid;gap:12px;
  grid-template-columns:repeat(auto-fill,minmax(228px,1fr))}
#${WINDOW_ID} .ymca-tile{display:flex;flex-direction:column;gap:5px;text-align:left;
  background:var(--g-raise);border:1px solid var(--g-line);border-radius:4px;padding:15px;
  cursor:pointer;font:inherit;color:var(--g-ink);transition:border-color .12s,background .12s}
#${WINDOW_ID} .ymca-tile:hover{border-color:var(--g-navy);background:#636363}
#${WINDOW_ID} .ymca-tile .ymca-ico{width:32px;height:32px;color:#8ab4f8}
#${WINDOW_ID} .ymca-tile b{font-size:15px}
#${WINDOW_ID} .ymca-tile span{color:var(--g-dim);font-size:12.5px}
#${WINDOW_ID} .ymca-tile.soon{opacity:.5;cursor:default}
#${WINDOW_ID} .ymca-tile.soon:hover{border-color:var(--g-line);background:var(--g-raise)}
#${WINDOW_ID} .ymca-lead{margin:0 0 14px;color:var(--g-dim)}

#${WINDOW_ID} h2.ymca-h{margin:0 0 4px;font-size:19px;color:#fff}
#${WINDOW_ID} p.ymca-sub{margin:0 0 14px;color:var(--g-dim);font-size:13px}
#${WINDOW_ID} .ymca-btn{border:1px solid #252525;background:#fff;border-radius:3px;
  padding:6px 12px;cursor:pointer;font:600 12px/1.42857 var(--g-font);color:#252525}
#${WINDOW_ID} .ymca-btn:hover{background:#e6e6e6}
#${WINDOW_ID} .ymca-btn.primary{background:var(--g-navy);border-color:#003a78;color:#fff}
#${WINDOW_ID} .ymca-btn.primary:hover{background:#005cbf}
#${WINDOW_ID} .ymca-btn.danger{background:var(--g-red);border-color:#a02622;color:#fff}
#${WINDOW_ID} .ymca-btn:disabled{opacity:.45;cursor:default}
#${WINDOW_ID} input,#${WINDOW_ID} select,#${WINDOW_ID} textarea{font:14px/1.42857 var(--g-font);
  color:#252525;background:#fff;border:1px solid #252525;border-radius:3px;padding:5px 9px}
#${WINDOW_ID} table{border-collapse:collapse;width:100%}
#${WINDOW_ID} th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--g-dim);border-bottom:1px solid var(--g-soft);padding:7px 9px;font-weight:600}
#${WINDOW_ID} td{padding:7px 9px;border-bottom:1px solid var(--g-soft);vertical-align:top}
#${WINDOW_ID} .ymca-card{background:var(--g-raise);border:1px solid var(--g-line);
  border-radius:4px;padding:13px;margin-bottom:11px}
#${WINDOW_ID} .ymca-note{border-left:3px solid var(--g-navy);background:rgba(0,0,0,.18);
  border-radius:0 3px 3px 0;padding:9px 12px;margin:8px 0;font-size:13px}
#${WINDOW_ID} .ymca-note.warn{border-left-color:#ec971f;background:rgba(236,151,31,.14)}
#${WINDOW_ID} .ymca-note.bad{border-left-color:var(--g-red);background:rgba(201,48,44,.16)}
#${WINDOW_ID} .ymca-status{font-size:12px;opacity:.9;margin-left:6px}
#${WINDOW_ID} .ymca-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
#${WINDOW_ID} .ymca-pick{max-height:190px;overflow:auto;border:1px solid var(--g-line);
  border-radius:3px;padding:6px;background:rgba(0,0,0,.18)}
#${WINDOW_ID} .ymca-pick label{display:block;font-weight:400;margin-bottom:3px;cursor:pointer}
#${WINDOW_ID} code{background:rgba(0,0,0,.3);border-radius:3px;padding:1px 5px;font-size:12.5px}
#${WINDOW_ID} small{color:var(--g-dim)}
/* Named roles, so a module never writes a colour of its own. A hardcoded grey
   from the light era is exactly what made the first dark build unreadable. */
#${WINDOW_ID} .ymca-dim{color:var(--g-dim)}
#${WINDOW_ID} .ymca-accent{color:#8ab4f8}
#${WINDOW_ID} .ymca-warn{color:#f0ad4e}
#${WINDOW_ID} .ymca-bad{color:#e88a86}
#${WINDOW_ID} .ymca-num{font-variant-numeric:tabular-nums}
#ymca-fab{position:fixed;right:14px;bottom:14px;z-index:2147482000;padding:9px 15px;
  border-radius:3px;border:1px solid #003a78;cursor:pointer;background:#004997;color:#fff;
  font:700 12px/1 "Helvetica Neue",Helvetica,Arial,sans-serif;letter-spacing:.06em;
  box-shadow:0 2px 8px rgba(0,0,0,.5)}
@media (max-width:620px){
  #${WINDOW_ID} .ymca-sheet{width:100vw;max-height:100vh;height:100%;border-radius:0;border:0}
  #${WINDOW_ID} .ymca-tiles{grid-template-columns:1fr}
}`;
}

/** Small, flat icons. A module may bring its own; these are the fallbacks. */
const ICONS = {
    stepops: '<path d="M4 29 H10 V23 H16 V17 H22 V11 H28 V5"/><path d="M4 29 H30"/>',
    renamer: '<path d="M6 22 L20 8 L26 14 L12 28 H6 Z"/><path d="M6 30 H30"/>',
    diagnostics: '<circle cx="15" cy="15" r="9"/><path d="M22 22 L30 30"/>',
    missionmagician: '<path d="M7 27 L24 10"/><path d="M22 5 L24 10 L29 12 L24 14 L22 19 L20 14 '
        + 'L15 12 L20 10 Z"/>',
    trackops: '<path d="M5 29 H30"/><rect x="7" y="18" width="5" height="11"/>'
        + '<rect x="15" y="11" width="5" height="18"/><rect x="23" y="5" width="5" height="24"/>',
    default: '<rect x="6" y="6" width="9" height="9"/><rect x="19" y="6" width="9" height="9"/>'
        + '<rect x="6" y="19" width="9" height="9"/><rect x="19" y="19" width="9" height="9"/>',
};
function iconFor(id) {
    return `<svg class="ymca-ico" viewBox="0 0 34 34" fill="none" stroke="currentColor"
    stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
    ${ICONS[id] || ICONS.default}</svg>`;
}

let current = null;

function openWindow(moduleId) {
    document.getElementById(WINDOW_ID)?.remove();
    if (!document.getElementById('ymca-style')) {
        const st = document.createElement('style');
        st.id = 'ymca-style';
        st.textContent = styles();
        document.head.append(st);
    }

    const win = document.createElement('div');
    win.id = WINDOW_ID;
    win.innerHTML = `
    <div class="ymca-sheet">
      <div class="ymca-bar">
        <button class="ymca-back" id="ymca-back" hidden>&larr; All tools</button>
        <span class="ymca-logo">YMCA <small>Your Mission Chief Alpha ${esc(YMCA.version)}</small></span>
        <span class="ymca-spacer"></span>
        <span class="ymca-status" id="ymca-bar-status"></span>
        <button class="ymca-refresh" id="ymca-refresh"
          title="Re-read the game — use this after buying or moving something">&#10227;</button>
        <button class="ymca-close" title="Close">&times;</button>
      </div>
      <main class="ymca-main" id="ymca-main"></main>
    </div>`;
    document.body.append(win);
    document.body.style.overflow = 'hidden';

    const close = () => {
        win.remove();
        document.body.style.overflow = '';
        document.removeEventListener('keydown', onKey);
    };
    // Escape steps back the way the game's own lightboxes do: out of a tool
    // first, out of the window only from the launcher.
    const onKey = (e) => {
        if (e.key !== 'Escape') return;
        if (current) showLauncher(); else close();
    };
    win.querySelector('.ymca-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    const main = win.querySelector('#ymca-main');
    const back = win.querySelector('#ymca-back');
    back.addEventListener('click', () => showLauncher());

    const refresh = win.querySelector('#ymca-refresh');
    refresh.addEventListener('click', async () => {
        forgetGameData();
        refresh.classList.add('spin');
        setStatus('Re-reading the game\u2026');
        const mod = YMCA.modules.find((m) => m.id === current);
        if (mod) showModule(mod); else showLauncher();
        // The spin is honest about the work: modules fetch inside mount().
        setTimeout(() => refresh.classList.remove('spin'), 900);
    });

    function showLauncher() {
        current = null;
        back.hidden = true;
        setStatus('');
        main.innerHTML = `<p class="ymca-lead">Pick a tool.</p>
      <div class="ymca-tiles">
        ${YMCA.modules.map((m) => `<button class="ymca-tile" data-mod="${esc(m.id)}">
          ${iconFor(m.id)}<b>${esc(m.title)}</b><span>${esc(m.tagline || '')}</span>
        </button>`).join('')}
        <div class="ymca-tile soon">${iconFor('default')}<b>More to come</b>
          <span>This is where the next tools land.</span></div>
      </div>`;
        main.querySelectorAll('[data-mod]').forEach((b) => {
            b.addEventListener('click', () => {
                const mod = YMCA.modules.find((m) => m.id === b.dataset.mod);
                if (mod) showModule(mod);
            });
        });
    }

    function showModule(mod) {
        current = mod.id;
        YMCA.lastModule = mod.id;
        back.hidden = false;
        writeStore(LS.ui, { last: mod.id });
        main.innerHTML = `<h2 class="ymca-h">${esc(mod.title)}</h2>
      <p class="ymca-sub">${esc(mod.description)}</p><div id="ymca-panel"></div>`;
        const panel = main.querySelector('#ymca-panel');
        logger.info('shell', `opened ${mod.id}`);
        try {
            mod.mount(panel, context(mod.id));
        } catch (err) {
            logger.error(mod.id, 'failed to open', err.stack || err.message);
            panel.innerHTML = `<div class="ymca-note bad"><b>${esc(mod.title)} could not open.</b>
        ${esc(err.message)}<br>Diagnostics \u2192 Copy problem report has the details.</div>`;
        }
    }

    function setStatus(text) {
        const el = win.querySelector('#ymca-bar-status');
        if (el) el.textContent = text;
    }

    const wanted = moduleId && YMCA.modules.find((m) => m.id === moduleId);
    if (wanted) showModule(wanted); else showLauncher();
}

/**
 * Run a module's code on the game's own page, outside YMCA's window.
 *
 * Almost every module only ever renders into the panel it is handed. A few
 * belong in the game's own markup instead — MissionMagician sits inside the
 * mission window the way LSS-Manager's helper does, because a tool you have to
 * open a lightbox to reach is a tool you stop using. Those get a context
 * without a mount.
 *
 * It runs once the document is ready, and a throw is logged rather than left to
 * break the game's page.
 */
YMCA.inject = function inject(moduleId, fn) {
    const run = () => {
        try {
            fn(context(moduleId));
        } catch (err) {
            logger.error(moduleId, 'injection failed', err.message);
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
};

/** What a module is handed. Nothing here touches the shell's own chrome. */
function context(moduleId) {
    return {
        esc, fmt, sleep, download, fetchExternal,
        game: gameData,
        rawGame: getJSON,
        locale: gameLocale,
        store: {
            read: (key, fallback) => readStore(`ymca-${moduleId}-${key}`, fallback),
            write: (key, value) => writeStore(`ymca-${moduleId}-${key}`, value),
        },
        /**
         * Game JSON that survives a page load.
         *
         * `game()` caches for the page, which is right on the map and wrong
         * inside a mission: every mission is its own page load, so the whole
         * mission catalogue was being refetched each time a window opened, and
         * that is what made the panel take a second to appear. /einsaetze.json
         * is the game's static list — it changes when the game is updated, not
         * while you play — so it is worth keeping across loads.
         *
         * `shrink` runs once before storing, so only what is actually used
         * takes up room. A stale read is served immediately and refreshed in
         * the background, because a catalogue a day old is better than a panel
         * that waits.
         */
        async gameCached(path, maxAgeMs, shrink) {
            const key = `ymca-cache-${path}`;
            const held = readStore(key, null);
            const fresh = held && Date.now() - held.at < maxAgeMs;
            const load = async () => {
                const data = await getJSON(path);
                const value = shrink ? shrink(data) : data;
                writeStore(key, { at: Date.now(), value });
                return value;
            };
            if (!held) return load();
            if (!fresh) load().catch(() => { /* the held copy still answers */ });
            return held.value;
        },
        log: {
            info: (m, d) => logger.info(moduleId, m, d),
            warn: (m, d) => logger.warn(moduleId, m, d),
            error: (m, d) => logger.error(moduleId, m, d),
        },
        status(text) {
            const el = document.getElementById('ymca-bar-status');
            if (el) el.textContent = text;
        },
        clipboard(text, what) {
            return navigator.clipboard.writeText(text)
                .then(() => { this.status(`Copied ${what}.`); return true; })
                .catch(() => { this.status('Clipboard refused.'); return false; });
        },
        open: openWindow,
    };
}
