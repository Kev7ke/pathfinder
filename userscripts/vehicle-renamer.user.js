// ==UserScript==
// @name         MissionChief Vehicle Renamer
// @namespace    https://github.com/Kev7ke/pathfinder
// @version      1.4.0
// @description  Bulk-rename your vehicles from a pattern, with a preview before anything is written.
// @author       Kev7ke (built with Claude Code)
// @homepageURL  https://github.com/Kev7ke/pathfinder
// @downloadURL  https://raw.githubusercontent.com/Kev7ke/pathfinder/claude/keen-hawking-g3z0ph/userscripts/vehicle-renamer.user.js
// @updateURL    https://raw.githubusercontent.com/Kev7ke/pathfinder/claude/keen-hawking-g3z0ph/userscripts/vehicle-renamer.user.js
// @match        *://*.missionchief.com/*
// @match        *://missionchief.com/*
// @match        *://*.missionchief.co.uk/*
// @match        *://missionchief.co.uk/*
// @match        *://*.missionchief-australia.com/*
// @match        *://*.missionchief-japan.com/*
// @match        *://*.missionchief-korea.com/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// ==/UserScript==

/*
 * How it saves, and why this way:
 *
 * It does NOT post a hand-built request. For each vehicle it fetches
 * /vehicles/<id>/edit, takes the real <form> out of the returned HTML, and
 * builds a FormData from it. That carries the CSRF token and every other
 * setting the vehicle already has. Only vehicle[caption] is replaced, then the
 * form is posted back to its own action. Nothing else about the vehicle can be
 * lost, because nothing else is ever touched.
 *
 * This request pattern is the one used by jxn_30's LSS-Scripts
 * (https://github.com/jxn-30/LSS-Scripts, MIT), which supports these same
 * MissionChief domains. The 150-character cap on vehicle[caption] comes from
 * there too.
 */

(function () {
    'use strict';

    const CAPTION_MAX = 150;
    const DELAY_MS = 350;      // between writes — be kind to the server
    const MODAL_ID = 'pf-vehicle-renamer';

    const PLACEHOLDERS = [
        ['{n}', 'counter, 1 2 3 …'],
        ['{nn}', 'counter, zero-padded: 01 02 03'],
        ['{type}', 'vehicle type name — see the Vehicle types panel'],
        ['{typeid}', 'the numeric vehicle type id'],
        ['{building}', 'name of the station it is in'],
        ['{id}', 'the vehicle id'],
        ['{name}', 'the current name'],
    ];

    const esc = (s) =>
        String(s).replace(/[&<>"]/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Renaming writes to the account and the game offers no undo, so every run
    // records what each name was before it changed. Kept in this browser only.
    // The game's own /api/vehicles gives a numeric vehicle_type and only fills
    // vehicle_type_caption for custom types, so standard vehicles have no name
    // anywhere in the data this script can see. The names therefore live here,
    // supplied by you or fetched on request, and persist in this browser.
    const TYPES_KEY = 'pf-vehicle-renamer-types';

    function readTypeNames() {
        try {
            return JSON.parse(localStorage.getItem(TYPES_KEY)) || {};
        } catch (e) {
            return {};
        }
    }
    function writeTypeNames(map) {
        try {
            localStorage.setItem(TYPES_KEY, JSON.stringify(map));
        } catch (e) { /* nothing to do; the names just will not persist */ }
    }

    let typeNames = readTypeNames();

    /** The name to use for a vehicle's type, and whether it is a real name. */
    function typeInfo(vehicle) {
        const id = String(vehicle.vehicle_type ?? '');
        if (vehicle.vehicle_type_caption) {
            return { id, name: vehicle.vehicle_type_caption, named: true };
        }
        const given = typeNames[id];
        if (given) return { id, name: given, named: true };
        return { id, name: `Type ${id}`, named: false };
    }

    const BACKUP_KEY = 'pf-vehicle-renamer-backups';
    const BACKUP_KEEP = 10;

    function readBackups() {
        try {
            return JSON.parse(localStorage.getItem(BACKUP_KEY)) || [];
        } catch (e) {
            return [];
        }
    }
    function writeBackup(entries) {
        if (!entries.length) return null;
        const record = { at: new Date().toISOString(), entries };
        try {
            localStorage.setItem(BACKUP_KEY,
                JSON.stringify([record, ...readBackups()].slice(0, BACKUP_KEEP)));
        } catch (e) {
            // A full or blocked store must not stop the rename; the user is
            // told instead, so they can copy the backup out by hand.
            return null;
        }
        return record;
    }

    async function getJSON(url) {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`${url} answered ${res.status}`);
        return res.json();
    }

    /** Replace only the caption on the vehicle's own edit form. */
    async function renameVehicle(id, caption) {
        const res = await fetch(`/vehicles/${id}/edit`, { credentials: 'include' });
        if (!res.ok) throw new Error(`could not open the edit form (${res.status})`);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const form = doc.querySelector('form');
        if (!form) throw new Error('no form on the edit page');
        const data = new FormData(form);
        if (!data.has('vehicle[caption]')) {
            throw new Error('this edit form has no vehicle[caption] field');
        }
        data.set('vehicle[caption]', caption);
        // Resolve the target explicitly. A document from DOMParser has no base
        // URL of its own, so form.action can come back empty; reading the
        // attribute and resolving it against the game origin is deterministic.
        const action = form.getAttribute('action') || `/vehicles/${id}`;
        const target = new URL(action, location.origin).toString();
        const post = await fetch(target, {
            method: (form.getAttribute('method') || 'POST').toUpperCase(),
            body: data,
            credentials: 'include',
        });
        if (!post.ok) throw new Error(`saving answered ${post.status}`);
    }

    function applyPattern(pattern, vehicle, index, buildings) {
        const building = buildings.get(vehicle.building_id);
        const n = index + 1;
        return pattern
            .replaceAll('{nn}', String(n).padStart(2, '0'))
            .replaceAll('{n}', String(n))
            .replaceAll('{type}', typeInfo(vehicle).name)
            .replaceAll('{typeid}', String(vehicle.vehicle_type ?? ''))
            .replaceAll('{building}', building ? building.caption : '')
            .replaceAll('{id}', String(vehicle.id))
            .replaceAll('{name}', vehicle.caption || '')
            .slice(0, CAPTION_MAX)
            .trim();
    }

    function buildModal() {
        const wrap = document.createElement('div');
        wrap.id = MODAL_ID;
        wrap.className = 'modal fade in';
        // Explicit, because the page's own CSS must not be able to hide this.
        wrap.style.cssText =
            'display:block;position:fixed;inset:0;z-index:2147483000;overflow:auto;'
            + 'background:rgba(0,0,0,.4)';
        wrap.innerHTML = `
      <div class="modal-dialog" style="width:min(860px,94vw)">
        <div class="modal-content">
          <div class="modal-header">
            <button type="button" class="close" data-pf="close">&times;</button>
            <h4 class="modal-title">Vehicle Renamer</h4>
          </div>
          <div class="modal-body" style="max-height:72vh;overflow:auto">
            <div class="row" style="margin-bottom:10px">
              <div class="col-sm-6">
                <label for="pf-building">Station</label>
                <select id="pf-building" class="form-control"></select>
              </div>
              <div class="col-sm-6">
                <label for="pf-type">Vehicle type</label>
                <select id="pf-type" class="form-control"></select>
              </div>
            </div>
            <details id="pf-types-panel" style="margin-bottom:12px">
              <summary style="cursor:pointer"><b>Vehicle types</b>
                <span id="pf-types-summary" class="text-muted"></span></summary>
              <p class="help-block" style="margin:6px 0">
                The game only sends a number for standard vehicle types, so the names
                are yours to set. They are remembered in this browser.
                <button class="btn btn-xs btn-default" data-pf="fetch-types">Fetch names</button>
                <button class="btn btn-xs btn-default" data-pf="copy-types">Copy type map</button>
                <button class="btn btn-xs btn-default" data-pf="paste-types">Paste type map</button>
                <span class="text-muted">— asks api.lss-manager.de, a third-party service, for the
                names in your game's language. Optional; you can just type them.</span>
              </p>
              <div id="pf-types-list"></div>
            </details>
            <label for="pf-pattern">Pattern</label>
            <input id="pf-pattern" class="form-control" value="{building} {type} {nn}">
            <p class="help-block" style="margin-top:6px">
              ${PLACEHOLDERS.map(([p, d]) =>
                  `<code>${esc(p)}</code> ${esc(d)}`).join(' &nbsp;·&nbsp; ')}
              <br>The counter restarts per station. Names are cut to ${CAPTION_MAX} characters.
            </p>
            <div style="margin:10px 0">
              <button class="btn btn-default" data-pf="preview">Preview</button>
              <button class="btn btn-danger" data-pf="apply" disabled>Apply</button>
              <span id="pf-status" style="margin-left:10px"></span>
            </div>
            <div id="pf-restore"></div>
            <div id="pf-preview"></div>
          </div>
        </div>
      </div>`;
        return wrap;
    }

    async function openRenamer(undoMode = false) {
        document.getElementById(MODAL_ID)?.remove();
        const modal = buildModal();
        document.body.append(modal);

        const $ = (id) => modal.querySelector('#' + id);
        const status = $('pf-status');
        const previewBox = $('pf-preview');
        let planned = [];

        modal.addEventListener('click', (e) => {
            if (e.target.dataset.pf === 'close') modal.remove();
        });

        status.textContent = 'Loading your vehicles…';
        let vehicles;
        let buildings;
        try {
            const [v, b] = await Promise.all([
                getJSON('/api/vehicles'),
                getJSON('/api/buildings'),
            ]);
            vehicles = v;
            buildings = new Map(b.map((x) => [x.id, x]));
        } catch (err) {
            status.innerHTML = `<span class="text-danger">${esc(err.message)}</span>`;
            return;
        }
        status.textContent = `${vehicles.length} vehicles found.`;

        // Restoring uses the same preview-then-apply path as renaming: the
        // backup simply supplies the target names instead of a pattern.
        const backups = readBackups();
        const restoreBox = $('pf-restore');
        if (backups.length) {
            const newest = backups[0];
            restoreBox.innerHTML = `
        <div class="alert alert-info" style="margin-top:12px">
          Last rename: <b>${esc(new Date(newest.at).toLocaleString())}</b>,
          ${newest.entries.length} vehicle${newest.entries.length === 1 ? '' : 's'}.
          <button class="btn btn-xs btn-default" data-pf="undo" style="margin-left:8px">Preview undo</button>
          <button class="btn btn-xs btn-link" data-pf="copy-backup">Copy backup</button>
        </div>`;
            restoreBox.querySelector('[data-pf="copy-backup"]').addEventListener('click', () => {
                navigator.clipboard.writeText(JSON.stringify(newest, null, 2))
                    .then(() => { status.textContent = 'Backup copied to the clipboard.'; })
                    .catch(() => { status.textContent = 'Could not copy — open the console and run localStorage.getItem("' + BACKUP_KEY + '")'; });
            });
            restoreBox.querySelector('[data-pf="undo"]').addEventListener('click', () => {
                const byId = new Map(vehicles.map((v) => [v.id, v]));
                planned = newest.entries
                    .map((e) => ({ vehicle: byId.get(e.id), to: e.from }))
                    .filter((r) => r.vehicle && r.to && r.to !== r.vehicle.caption);
                showPlan(newest.entries.length, 'Undo');
            });
        }
        if (undoMode) restoreBox.querySelector('[data-pf="undo"]')?.click();

        const buildingSel = $('pf-building');
        const typeSel = $('pf-type');
        const used = [...new Set(vehicles.map((v) => v.building_id))]
            .map((id) => buildings.get(id))
            .filter(Boolean)
            .sort((a, b) => a.caption.localeCompare(b.caption));
        buildingSel.innerHTML = `<option value="">All stations</option>` +
            used.map((b) => `<option value="${b.id}">${esc(b.caption)}</option>`).join('');

        // One row per distinct type in the fleet, so nothing is guessed by number.
        const typeCounts = new Map();
        for (const v of vehicles) {
            const { id } = typeInfo(v);
            typeCounts.set(id, (typeCounts.get(id) || 0) + 1);
        }
        const typeIds = [...typeCounts.keys()].sort((a, b) => Number(a) - Number(b));
        const sample = (id) => vehicles.find((v) => String(v.vehicle_type ?? '') === id);

        function renderTypes() {
            const unnamed = typeIds.filter((id) => !typeInfo(sample(id)).named).length;
            $('pf-types-summary').textContent = unnamed
                ? ` — ${unnamed} of ${typeIds.length} still unnamed`
                : ` — all ${typeIds.length} named`;
            if (unnamed) $('pf-types-panel').open = true;

            $('pf-types-list').innerHTML = `<table class="table table-condensed">
          <thead><tr><th style="width:70px">Id</th><th style="width:90px">Vehicles</th><th>Name</th></tr></thead>
          <tbody>${typeIds.map((id) => {
                const info = typeInfo(sample(id));
                const fixed = !!sample(id).vehicle_type_caption;
                return `<tr data-type="${esc(id)}">
              <td class="text-muted">${esc(id)}</td>
              <td>${typeCounts.get(id)}</td>
              <td>${fixed
                    ? `<span>${esc(info.name)}</span> <span class="text-muted">(custom type)</span>`
                    : `<input class="form-control input-sm" data-pf="type-name"
                         value="${esc(typeNames[id] || '')}" placeholder="Type ${esc(id)}">`}</td>
            </tr>`;
            }).join('')}</tbody></table>`;

            typeSel.innerHTML = `<option value="">All types</option>` + typeIds.map((id) =>
                `<option value="${esc(id)}">${esc(typeInfo(sample(id)).name)} (${typeCounts.get(id)})</option>`
            ).join('');
        }
        renderTypes();

        $('pf-types-list').addEventListener('input', (e) => {
            if (e.target.dataset.pf !== 'type-name') return;
            const id = e.target.closest('tr').dataset.type;
            const name = e.target.value.trim();
            if (name) typeNames[id] = name; else delete typeNames[id];
            writeTypeNames(typeNames);
            const keep = typeSel.value;
            $('pf-types-summary').textContent = '';
            typeSel.innerHTML = `<option value="">All types</option>` + typeIds.map((tid) =>
                `<option value="${esc(tid)}">${esc(typeInfo(sample(tid)).name)} (${typeCounts.get(tid)})</option>`
            ).join('');
            typeSel.value = keep;
        });

        // The map is worth keeping and sharing: fetched once, it can be pasted
        // into another browser or sent on to be built into the script.
        modal.querySelector('[data-pf="copy-types"]').addEventListener('click', (e) => {
            e.preventDefault();
            const map = {};
            for (const id of typeIds) {
                const info = typeInfo(sample(id));
                if (info.named) map[id] = info.name;
            }
            const text = JSON.stringify(map, null, 2);
            navigator.clipboard.writeText(text)
                .then(() => {
                    status.textContent = `Copied ${Object.keys(map).length} type names.`;
                })
                .catch(() => {
                    previewBox.innerHTML =
                        `<p class="help-block">Copy this by hand:</p>
                         <textarea class="form-control" rows="10">${esc(text)}</textarea>`;
                    status.textContent = 'Clipboard refused — the map is below.';
                });
        });

        modal.querySelector('[data-pf="paste-types"]').addEventListener('click', (e) => {
            e.preventDefault();
            const raw = prompt('Paste a type map as JSON, e.g. {"0":"Type 1 Engine"}');
            if (!raw) return;
            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (err) {
                status.innerHTML = '<span class="text-danger">That is not valid JSON.</span>';
                return;
            }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                status.innerHTML = '<span class="text-danger">Expected an object of id to name.</span>';
                return;
            }
            let added = 0;
            for (const [id, name] of Object.entries(parsed)) {
                if (typeof name === 'string' && name.trim()) {
                    typeNames[String(id)] = name.trim();
                    added++;
                }
            }
            writeTypeNames(typeNames);
            renderTypes();
            status.textContent = `Took ${added} name${added === 1 ? '' : 's'} from the pasted map.`;
        });

        modal.querySelector('[data-pf="fetch-types"]').addEventListener('click', async (e) => {
            e.preventDefault();
            const locale = (() => {
                try {
                    const w = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
                    return w.I18n?.locale || '';
                } catch (err) {
                    return '';
                }
            })();
            if (!locale) {
                status.innerHTML = '<span class="text-danger">Could not read the game language,'
                    + ' so the right names cannot be requested. Type them instead.</span>';
                return;
            }
            status.textContent = `Asking api.lss-manager.de for ${locale} names…`;
            try {
                const res = await fetch(`https://api.lss-manager.de/${locale}/vehicles`);
                if (!res.ok) throw new Error(`answered ${res.status}`);
                const data = await res.json();
                let filled = 0;
                for (const id of typeIds) {
                    const caption = data[id]?.caption;
                    if (caption && !typeNames[id]) {
                        typeNames[id] = caption;
                        filled++;
                    }
                }
                writeTypeNames(typeNames);
                renderTypes();
                status.textContent = filled
                    ? `Filled in ${filled} name${filled === 1 ? '' : 's'}.`
                      + ' Check them, then "Copy type map" keeps them for good.'
                    : 'That service knew none of your type ids — type the names instead.';
            } catch (err) {
                status.innerHTML = `<span class="text-danger">Could not reach the name service`
                    + ` (${esc(err.message)}). Type the names instead.</span>`;
            }
        });

        const selected = () => {
            const bId = buildingSel.value;
            const type = typeSel.value;
            return vehicles.filter((v) =>
                (!bId || String(v.building_id) === bId) &&
                (!type || String(v.vehicle_type ?? '') === type));
        };

        modal.querySelector('[data-pf="preview"]').addEventListener('click', () => {
            const pattern = $('pf-pattern').value;
            const rows = selected();
            // The counter restarts per station, which is what people expect.
            const perBuilding = new Map();
            planned = rows.map((v) => {
                const i = perBuilding.get(v.building_id) ?? 0;
                perBuilding.set(v.building_id, i + 1);
                return { vehicle: v, to: applyPattern(pattern, v, i, buildings) };
            }).filter((r) => r.to && r.to !== r.vehicle.caption);

            const usesType = /\{type\}/.test(pattern);
            const unnamedHit = usesType && planned.some((r) => !typeInfo(r.vehicle).named);
            showPlan(rows.length, 'Apply');
            if (unnamedHit) {
                previewBox.insertAdjacentHTML('afterbegin',
                    '<div class="alert alert-warning">Some of these use a type that has no name yet,'
                    + ' so they would be called <b>Type &lt;number&gt;</b>. Fill the names in above first.</div>');
            }
        });

        function showPlan(considered, verb) {
            const applyBtn = modal.querySelector('[data-pf="apply"]');
            applyBtn.disabled = planned.length === 0;
            applyBtn.textContent = planned.length
                ? `${verb} ${planned.length} vehicle${planned.length === 1 ? '' : 's'}`
                : verb;
            applyBtn.classList.toggle('btn-warning', verb === 'Undo');
            applyBtn.classList.toggle('btn-danger', verb !== 'Undo');
            status.textContent = planned.length
                ? `${planned.length} of ${considered} would change.`
                : `Nothing would change in those ${considered}.`;

            previewBox.innerHTML = planned.length ? `
        <table class="table table-condensed">
          <thead><tr><th>Now</th><th>Becomes</th></tr></thead>
          <tbody>${planned.slice(0, 200).map((r) => `
            <tr><td>${esc(r.vehicle.caption)}</td><td><b>${esc(r.to)}</b></td></tr>`).join('')}
          </tbody>
        </table>${planned.length > 200
            ? `<p class="help-block">…and ${planned.length - 200} more.</p>` : ''}` : '';
        }

        modal.querySelector('[data-pf="apply"]').addEventListener('click', async (e) => {
            const btn = e.target;
            if (!planned.length) return;
            if (!confirm(
                `Rename ${planned.length} vehicles?\n\n` +
                `This writes to your account. The old names are saved in this ` +
                `browser so you can undo it, but check the preview first.`)) return;

            const saved = writeBackup(planned.map(
                ({ vehicle, to }) => ({ id: vehicle.id, from: vehicle.caption, to })));

            btn.disabled = true;
            let done = 0;
            const failed = [];
            for (const { vehicle, to } of planned) {
                status.textContent = `Renaming ${done + 1} of ${planned.length}…`;
                try {
                    await renameVehicle(vehicle.id, to);
                    done++;
                } catch (err) {
                    failed.push(`${vehicle.caption}: ${err.message}`);
                }
                await sleep(DELAY_MS);
            }
            const undoNote = saved
                ? ' The old names are saved — reopen this dialog to undo.'
                : ' <span class="text-danger">The old names could NOT be saved,'
                  + ' so there is no undo for this run.</span>';
            status.innerHTML = (failed.length
                ? `Renamed ${done}. <span class="text-danger">${failed.length} failed.</span>`
                : `Renamed ${done}. Reload the page to see the new names.`) + undoNote;
            if (failed.length) {
                previewBox.innerHTML =
                    `<div class="alert alert-danger"><b>Failed:</b><br>${
                        failed.slice(0, 20).map(esc).join('<br>')}</div>` + previewBox.innerHTML;
            }
        });
    }

    // ---- getting in ----
    // The navbar markup was never verified against the live game, so the
    // floating button is the one that must always work. It is deliberately
    // impossible to miss: if you cannot see it, the script is not running.

    function addFloatingButton() {
        if (document.getElementById('pf-renamer-fab')) return;
        if (!document.body) return;
        const btn = document.createElement('button');
        btn.id = 'pf-renamer-fab';
        btn.type = 'button';
        btn.textContent = 'Rename vehicles';
        btn.title = 'MissionChief Vehicle Renamer';
        btn.style.cssText =
            'position:fixed;right:14px;bottom:14px;z-index:2147483000;'
            + 'padding:9px 14px;border-radius:999px;border:0;cursor:pointer;'
            + 'background:#2f4490;color:#fff;font:600 13px/1 system-ui,sans-serif;'
            + 'box-shadow:0 2px 10px rgba(0,0,0,.35)';
        btn.addEventListener('click', () => openRenamer());
        document.body.append(btn);
    }

    function addMenuEntry() {
        if (document.getElementById('pf-renamer-entry')) return;
        const menu = document.querySelector('#menu_profile + .dropdown-menu')
            || document.querySelector('.navbar-nav .dropdown-menu');
        if (!menu) return;
        const li = document.createElement('li');
        li.id = 'pf-renamer-entry';
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = 'Vehicle Renamer';
        a.addEventListener('click', (e) => {
            e.preventDefault();
            openRenamer();
        });
        li.append(a);
        menu.append(li);
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Rename vehicles', () => openRenamer());
        GM_registerMenuCommand('Undo last rename', () => openRenamer(true));
    }

    const mount = () => {
        addFloatingButton();
        addMenuEntry();
    };
    mount();
    document.addEventListener('DOMContentLoaded', mount);
    setInterval(mount, 5000);

    /**
     * Self-check. Run pfRenamerCheck() in the console when something is wrong:
     * it says whether the script is loaded, what the page is, and whether the
     * two endpoints it depends on actually answer on this game.
     */
    async function selfCheck() {
        const out = {
            script: 'MissionChief Vehicle Renamer 1.2.0 is running',
            url: location.href,
            buttonOnPage: !!document.getElementById('pf-renamer-fab'),
            menuEntryOnPage: !!document.getElementById('pf-renamer-entry'),
        };
        for (const path of ['/api/vehicles', '/api/buildings']) {
            try {
                const res = await fetch(path, { credentials: 'include' });
                const body = await res.text();
                let count = 'not an array';
                try {
                    const json = JSON.parse(body);
                    count = Array.isArray(json) ? `${json.length} entries`
                        : `object with keys: ${Object.keys(json).slice(0, 6).join(', ')}`;
                } catch (e) {
                    count = `not JSON — starts with: ${body.slice(0, 60)}`;
                }
                out[path] = `HTTP ${res.status}, ${count}`;
            } catch (err) {
                out[path] = `request failed: ${err.message}`;
            }
        }
        console.log('%c Vehicle Renamer self-check ', 'background:#2f4490;color:#fff', out);
        return out;
    }

    try {
        const w = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
        w.pfRenamer = openRenamer;
        w.pfRenamerCheck = selfCheck;
    } catch (e) {
        window.pfRenamer = openRenamer;
        window.pfRenamerCheck = selfCheck;
    }

})();
