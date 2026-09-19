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

function styles() {
    return `
#${WINDOW_ID}{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;
  background:rgba(12,17,23,.55);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
#${WINDOW_ID} *{box-sizing:border-box}
#${WINDOW_ID} .ymca-sheet{margin:auto;width:min(1100px,94vw);max-height:92vh;display:flex;
  flex-direction:column;background:#fff;border-radius:6px;box-shadow:0 12px 50px rgba(0,0,0,.5);
  overflow:hidden}
#${WINDOW_ID} .ymca-bar{display:flex;align-items:center;gap:12px;padding:12px 16px;flex:none;
  background:#2b3a4a;color:#fff}
#${WINDOW_ID} .ymca-logo{font-weight:700;letter-spacing:.06em}
#${WINDOW_ID} .ymca-logo small{font-weight:400;opacity:.7;margin-left:8px;letter-spacing:0}
#${WINDOW_ID} .ymca-spacer{flex:1}
#${WINDOW_ID} .ymca-back{background:rgba(255,255,255,.14);border:0;color:#fff;border-radius:4px;
  padding:5px 11px;cursor:pointer;font:600 13px/1.2 inherit}
#${WINDOW_ID} .ymca-back:hover{background:rgba(255,255,255,.24)}
#${WINDOW_ID} .ymca-close{background:none;border:0;color:#fff;font-size:26px;line-height:1;
  cursor:pointer;padding:0 4px;opacity:.85}
#${WINDOW_ID} .ymca-close:hover{opacity:1}
#${WINDOW_ID} .ymca-main{flex:1;overflow:auto;padding:18px 20px;background:#f4f6f9;color:#141a21}

/* the launcher */
#${WINDOW_ID} .ymca-tiles{display:grid;gap:14px;
  grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
#${WINDOW_ID} .ymca-tile{display:flex;flex-direction:column;gap:6px;text-align:left;
  background:#fff;border:1px solid #d5dce5;border-radius:7px;padding:16px;cursor:pointer;
  font:inherit;color:#141a21;transition:border-color .12s,box-shadow .12s}
#${WINDOW_ID} .ymca-tile:hover{border-color:#2f4490;box-shadow:0 3px 14px rgba(47,68,144,.18)}
#${WINDOW_ID} .ymca-tile .ymca-ico{width:34px;height:34px;color:#2f4490}
#${WINDOW_ID} .ymca-tile b{font-size:15.5px}
#${WINDOW_ID} .ymca-tile span{color:#5a6673;font-size:12.5px}
#${WINDOW_ID} .ymca-tile.soon{opacity:.55;cursor:default}
#${WINDOW_ID} .ymca-tile.soon:hover{border-color:#d5dce5;box-shadow:none}
#${WINDOW_ID} .ymca-lead{margin:0 0 16px;color:#5a6673}

#${WINDOW_ID} h2.ymca-h{margin:0 0 4px;font-size:19px}
#${WINDOW_ID} p.ymca-sub{margin:0 0 16px;color:#5a6673;font-size:13px}
#${WINDOW_ID} .ymca-btn{border:1px solid #c3ccd8;background:#fff;border-radius:4px;padding:7px 12px;
  cursor:pointer;font:600 13px/1.2 inherit;color:#141a21}
#${WINDOW_ID} .ymca-btn:hover{background:#f0f3f7}
#${WINDOW_ID} .ymca-btn.primary{background:#2f4490;border-color:#2f4490;color:#fff}
#${WINDOW_ID} .ymca-btn.danger{background:#9e2b22;border-color:#9e2b22;color:#fff}
#${WINDOW_ID} .ymca-btn:disabled{opacity:.5;cursor:default}
#${WINDOW_ID} input,#${WINDOW_ID} select,#${WINDOW_ID} textarea{font:inherit;color:#141a21;
  background:#fff;border:1px solid #c3ccd8;border-radius:4px;padding:6px 9px}
#${WINDOW_ID} table{border-collapse:collapse;width:100%}
#${WINDOW_ID} th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;
  color:#69737f;border-bottom:1px solid #cfd7e1;padding:7px 9px;font-weight:600}
#${WINDOW_ID} td{padding:7px 9px;border-bottom:1px solid #e6eaf0;vertical-align:top}
#${WINDOW_ID} .ymca-card{background:#fff;border:1px solid #dde3ea;border-radius:7px;padding:14px;
  margin-bottom:12px}
#${WINDOW_ID} .ymca-note{border-left:3px solid #2f4490;background:#fff;border-radius:0 5px 5px 0;
  padding:9px 12px;margin:8px 0;font-size:13px}
#${WINDOW_ID} .ymca-note.warn{border-left-color:#8c6104;background:#fdf6e6}
#${WINDOW_ID} .ymca-note.bad{border-left-color:#9e2b22;background:#fbeceb}
#${WINDOW_ID} .ymca-status{font-size:12.5px;opacity:.85;margin-left:6px}
#${WINDOW_ID} .ymca-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
#${WINDOW_ID} .ymca-pick{max-height:190px;overflow:auto;border:1px solid #cfd7e1;border-radius:4px;
  padding:6px;background:#fff}
#${WINDOW_ID} .ymca-pick label{display:block;font-weight:400;margin-bottom:3px;cursor:pointer}
#${WINDOW_ID} code{background:#eef1f5;border-radius:3px;padding:1px 5px;font-size:12.5px}
#ymca-fab{position:fixed;right:14px;bottom:14px;z-index:2147482000;padding:10px 16px;
  border-radius:999px;border:0;cursor:pointer;background:#2f4490;color:#fff;
  font:700 13px/1 system-ui,sans-serif;letter-spacing:.06em;box-shadow:0 2px 10px rgba(0,0,0,.35)}
@media (max-width:620px){
  #${WINDOW_ID} .ymca-sheet{width:100vw;max-height:100vh;height:100%;border-radius:0}
  #${WINDOW_ID} .ymca-tiles{grid-template-columns:1fr}
}`;
}

/** Small, flat icons. A module may bring its own; these are the fallbacks. */
const ICONS = {
    pathfinder: '<path d="M4 28 L12 8 L18 20 L24 12 L30 28 Z"/>',
    renamer: '<path d="M6 22 L20 8 L26 14 L12 28 H6 Z"/><path d="M6 30 H30"/>',
    diagnostics: '<circle cx="15" cy="15" r="9"/><path d="M22 22 L30 30"/>',
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
