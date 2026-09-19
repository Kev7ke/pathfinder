// ==UserScript==
// @name         MissionChief Vehicle Renamer
// @namespace    https://github.com/Kev7ke/pathfinder
// @version      1.2.0
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
        ['{type}', 'vehicle type, e.g. Type 1 Engine'],
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
            .replaceAll('{type}', vehicle.vehicle_type_caption || vehicle.vehicle_type || '')
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

        const types = [...new Set(vehicles.map(
            (v) => v.vehicle_type_caption || v.vehicle_type))].sort();
        typeSel.innerHTML = `<option value="">All types</option>` +
            types.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('');

        const selected = () => {
            const bId = buildingSel.value;
            const type = typeSel.value;
            return vehicles.filter((v) =>
                (!bId || String(v.building_id) === bId) &&
                (!type || String(v.vehicle_type_caption || v.vehicle_type) === type));
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

            showPlan(rows.length, 'Apply');
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
