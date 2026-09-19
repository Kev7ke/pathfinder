// ==UserScript==
// @name         MissionChief Renamer
// @namespace    https://github.com/Kev7ke/pathfinder
// @version      2.3.0
// @description  Bulk-rename vehicles and stations from a pattern, with a preview before anything is written and an undo afterwards.
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
// @grant        GM_xmlhttpRequest
// @connect      api.lss-manager.de
// ==/UserScript==

/*
 * How it saves, and why this way:
 *
 * It does NOT post a hand-built request. For each vehicle or station it fetches
 * the object's own edit page, takes the real <form> out of the returned HTML and
 * builds a FormData from it. That carries the CSRF token and every other setting
 * the object already has. Only the name field is replaced, then the form is
 * posted back to its own action, so nothing else can be lost.
 *
 * The request pattern and the field limits come from jxn_30's LSS-Scripts
 * (https://github.com/jxn-30/LSS-Scripts, MIT), which supports these same
 * MissionChief domains.
 */

(function () {
    'use strict';

    const LIMITS = {
        vehicle: { path: (id) => `/vehicles/${id}/edit`, field: 'vehicle[caption]', max: 150 },
        building: { path: (id) => `/buildings/${id}/edit`, field: 'building[name]', max: 40 },
    };
    const DELAY_MS = 350;
    const MODAL_ID = 'pf-renamer';
    const TYPES_KEY = 'pf-vehicle-renamer-types';
    const BTYPES_KEY = 'pf-renamer-building-types';
    const BACKUP_KEY = 'pf-vehicle-renamer-backups';
    const BACKUP_KEEP = 10;

    /**
     * Vehicle type names that ship with the script, so a fresh install is
     * useful straight away and needs no third-party call.
     *
     * Read out of a real MissionChief (en_US) fleet, so these are confirmed
     * against the game rather than taken from a catalogue. The list covers only
     * the types that fleet owned - it is a starting point, not the full
     * catalogue, and unknown ids still fall through to "Type <id>".
     *
     * To extend it: name the missing types in the dialog, press "Copy type map",
     * and paste the result here. A name you type always wins over this list.
     */
    const BUILTIN_TYPE_NAMES = {
        3: 'Battalion chief unit',
        5: 'ALS Ambulance',
        6: 'Mobile air',
        7: 'Water Tanker',
        10: 'Patrol Car',
        13: 'Quint',
        18: 'Rescue Engine',
        27: 'BLS Ambulance',
        33: 'Pumper Tanker',
    };

    /**
     * Building type names.
     *
     * Confirmed against the game, not inferred from a player's own labels: each
     * building carries generates_mission_categories, and the types line up with
     * what they generate — 0 makes fire calls, 3 ambulance, 5 police, while 1, 4
     * and 29 generate nothing, which is what a dispatch centre, an academy and a
     * prison should do.
     *
     * Note that a small and a full station share a building_type and differ by
     * the small_building flag, so type 0 covers both sizes of fire station. A
     * name you type still wins over this list.
     */
    const BUILTIN_BUILDING_TYPES = {
        0: 'Fire Station',
        1: 'Dispatch Center',
        3: 'Ambulance Station',
        4: 'Fire Academy',
        5: 'Police Station',
        29: 'Prison',
    };

    /** What the player calls each kind, so the dialog never says "buildings". */
    const KIND_NOUN = { vehicle: 'vehicle', building: 'station' };

    /**
     * Everything the game will hand over without being asked twice.
     *
     * The point is to keep the planner's data honest: re-export after the game
     * adds missions or buildings, rather than trusting a snapshot. An endpoint
     * that is not served here is recorded as an error and does not stop the
     * rest — the list is deliberately wider than what is known to exist, so a
     * failure tells us something too.
     */
    const ENDPOINTS = [
        { path: '/einsaetze.json', label: 'missions', slim: 'missions' },
        { path: '/api/buildings', label: 'buildings' },
        { path: '/api/vehicles', label: 'vehicles' },
        { path: '/api/credits', label: 'credits' },
        { path: '/api/allianceinfo', label: 'alliance' },
        { path: '/api/v1/aaos', label: 'aaos' },
        { path: '/alliance_event_types.json', label: 'allianceEventTypes' },
        { path: '/api/schoolings', label: 'schoolings' },
        { path: '/api/missions', label: 'activeMissions' },
    ];

    /** Drop what a planner never reads. Icons alone are three paths per mission. */
    function slimMissions(data) {
        return (Array.isArray(data) ? data : Object.values(data)).map((m) => ({
            id: m.id,
            name: m.name,
            place: m.place_array ?? (m.place ? [m.place] : []),
            average_credits: m.average_credits,
            requirements: m.requirements,
            prerequisites: m.prerequisites,
            chances: m.chances,
            categories: m.mission_categories,
            base_mission_id: m.base_mission_id,
            filter_id: m.additional?.filter_id,
        }));
    }

    const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const $ = (id) => document.getElementById(id);

    // ---------- stored names ----------
    function readStore(key) {
        try {
            return JSON.parse(localStorage.getItem(key)) || {};
        } catch (e) {
            return {};
        }
    }
    function writeStore(key, map) {
        try {
            localStorage.setItem(key, JSON.stringify(map));
        } catch (e) { /* names just will not persist */ }
    }

    let typeNames = readStore(TYPES_KEY);
    let buildingTypeNames = readStore(BTYPES_KEY);

    /** The name to use for a vehicle's type, and where it came from. */
    function typeInfo(vehicle) {
        const id = String(vehicle.vehicle_type ?? '');
        if (vehicle.vehicle_type_caption) {
            return { id, name: vehicle.vehicle_type_caption, named: true, source: 'custom' };
        }
        if (typeNames[id]) return { id, name: typeNames[id], named: true, source: 'yours' };
        if (BUILTIN_TYPE_NAMES[id]) {
            return { id, name: BUILTIN_TYPE_NAMES[id], named: true, source: 'builtin' };
        }
        return { id, name: `Type ${id}`, named: false, source: 'none' };
    }

    function buildingTypeInfo(building) {
        const id = String(building.building_type ?? '');
        if (buildingTypeNames[id]) {
            return { id, name: buildingTypeNames[id], named: true, source: 'yours' };
        }
        if (BUILTIN_BUILDING_TYPES[id]) {
            return { id, name: BUILTIN_BUILDING_TYPES[id], named: true, source: 'builtin' };
        }
        return { id, name: `Type ${id}`, named: false, source: 'none' };
    }

    // ---------- backups ----------
    function readBackups() {
        try {
            return JSON.parse(localStorage.getItem(BACKUP_KEY)) || [];
        } catch (e) {
            return [];
        }
    }
    function writeBackup(kind, entries) {
        if (!entries.length) return null;
        const record = { at: new Date().toISOString(), kind, entries };
        try {
            localStorage.setItem(BACKUP_KEY,
                JSON.stringify([record, ...readBackups()].slice(0, BACKUP_KEEP)));
        } catch (e) {
            return null;
        }
        return record;
    }

    // ---------- the pattern engine ----------
    /**
     * Counters are written {n}, and grow by prefix and start value:
     *
     *   {n} {nn} {nnn}   the default counter, padded to as many digits as n's
     *   {typenn}         counts within the vehicle or building type
     *   {dcnn}           counts within the dispatch center
     *   {x12nn}          the default counter, starting at 12 instead of 1
     *   {typex12nn}      per type, starting at 12
     *
     * Everything else is a plain token: {type} {typeid} {building} {dc} {id} {name}.
     * The counter pattern requires at least one "n" before the brace, so {type}
     * and {typeid} can never be mistaken for one.
     */
    const COUNTER_RE = /\{(type|dc)?(?:x(\d+))?(n+)\}/g;

    function expandPattern(pattern, indexes, tokens, max) {
        const withCounters = pattern.replace(COUNTER_RE, (_m, scope, start, ns) => {
            const base = indexes[scope || 'default'] ?? 0;
            const from = start === undefined ? 1 : Number(start);
            return String(base + from).padStart(ns.length, '0');
        });
        let out = withCounters;
        for (const [key, value] of Object.entries(tokens)) {
            out = out.split('{' + key + '}').join(value ?? '');
        }
        return out.slice(0, max).trim();
    }

    /** Which counters a pattern actually uses — drives the preview warnings. */
    function countersUsed(pattern) {
        const scopes = new Set();
        for (const m of pattern.matchAll(COUNTER_RE)) scopes.add(m[1] || 'default');
        return scopes;
    }

    /**
     * Give every row its position within each counter scope, in the order the
     * rows are listed, so {nn} restarts per station while {typenn} runs on
     * across stations.
     */
    function assignIndexes(rows, scopeOf) {
        const seen = new Map();
        return rows.map((row) => {
            const indexes = {};
            for (const [scope, key] of Object.entries(scopeOf(row))) {
                const composite = scope + '\u0000' + key;
                const n = seen.get(composite) ?? 0;
                seen.set(composite, n + 1);
                indexes[scope] = n;
            }
            return { row, indexes };
        });
    }

    // ---------- the game ----------
    async function getJSON(url) {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`${url} answered ${res.status}`);
        return res.json();
    }

    /** Replace only the name on the object's own edit form. */
    async function renameEntity(kind, id, name) {
        const spec = LIMITS[kind];
        const res = await fetch(spec.path(id), { credentials: 'include' });
        if (!res.ok) throw new Error(`could not open the edit form (${res.status})`);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const form = doc.querySelector('form');
        if (!form) throw new Error('no form on the edit page');
        const data = new FormData(form);
        if (!data.has(spec.field)) {
            throw new Error(`this edit form has no ${spec.field} field`);
        }
        data.set(spec.field, name);
        // Resolve the target explicitly: a document from DOMParser has no base
        // URL of its own, so form.action can come back empty.
        const action = form.getAttribute('action') || spec.path(id).replace(/\/edit$/, '');
        const target = new URL(action, location.origin).toString();
        const post = await fetch(target, {
            method: (form.getAttribute('method') || 'POST').toUpperCase(),
            body: data,
            credentials: 'include',
        });
        if (!post.ok) throw new Error(`saving answered ${post.status}`);
    }

    /**
     * Fetch the vehicle type catalogue from the name service.
     *
     * This is a cross-origin request from the game's page, and the game's own
     * console shows other requests to lss-manager.de being refused by CORS. The
     * userscript transport is used when available: it is made for exactly this
     * and is subject to neither CORS nor the page's content policy.
     */
    function getTypeCatalogue(locale) {
        const url = `https://api.lss-manager.de/${locale}/vehicles`;
        if (typeof GM_xmlhttpRequest === 'function') {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    timeout: 20000,
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

    function gameLocale() {
        try {
            const w = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
            return w.I18n?.locale || '';
        } catch (e) {
            return '';
        }
    }

    // ---------- the dialog ----------
    const TOKEN_HELP = [
        ['{n} {nn} {nnn}', 'counter, padded to as many digits as you write'],
        ['{x12nn}', 'same counter but starting at 12'],
        ['{typenn}', 'counts per type, across stations'],
        ['{typex12nn}', 'per type, starting at 12'],
        ['{dcnn}', 'counts per dispatch center'],
        ['{type}', 'type name'],
        ['{typeid}', 'the numeric type id'],
        ['{building}', 'the station it is in'],
        ['{dc}', 'the dispatch center it belongs to'],
        ['{id}', 'the object id'],
        ['{name}', 'the current name'],
    ];

    function modalHtml() {
        return `
      <div class="modal-dialog" style="width:min(940px,95vw)">
        <div class="modal-content">
          <div class="modal-header">
            <button type="button" class="close" data-pf="close">&times;</button>
            <h4 class="modal-title">Renamer</h4>
          </div>
          <div class="modal-body" style="max-height:76vh;overflow:auto">
            <ul class="nav nav-tabs" style="margin-bottom:12px">
              <li class="active"><a href="#" data-pf="tab" data-tab="vehicle">Vehicles</a></li>
              <li><a href="#" data-pf="tab" data-tab="building">Stations</a></li>
              <li><a href="#" data-pf="tab" data-tab="data">Data for Claude</a></li>
            </ul>

            <div data-pane="vehicle">
              <details id="pf-types-panel" style="margin-bottom:10px">
                <summary style="cursor:pointer"><b>Vehicle types</b>
                  <span id="pf-types-summary" class="text-muted"></span></summary>
                <p class="help-block" style="margin:6px 0">
                  The game only sends a number for standard types, so the names are yours to set.
                  Remembered in this browser.
                  <button class="btn btn-xs btn-default" data-pf="fetch-types">Fetch names</button>
                  <button class="btn btn-xs btn-default" data-pf="copy-types">Copy type map</button>
                  <button class="btn btn-xs btn-default" data-pf="paste-types">Paste type map</button>
                </p>
                <div id="pf-types-list"></div>
              </details>
              <div class="row">
                <div class="col-sm-6">
                  <label>Dispatch center</label>
                  <div class="input-group">
                    <select id="pf-v-dc" class="form-control"></select>
                    <span class="input-group-btn">
                      <button class="btn btn-default" data-pf="stamp-dc" data-for="vehicle">Select its stations</button>
                    </span>
                  </div>
                </div>
                <div class="col-sm-6">
                  <label>Vehicle types <span class="text-muted" id="pf-v-typecount"></span></label>
                  <div id="pf-v-types" class="pf-picker"></div>
                </div>
              </div>
              <label style="margin-top:10px">Stations <span class="text-muted" id="pf-v-stationcount"></span>
                <button class="btn btn-xs btn-link" data-pf="all" data-for="pf-v-stations">all</button>
                <button class="btn btn-xs btn-link" data-pf="none" data-for="pf-v-stations">none</button></label>
              <div id="pf-v-stations" class="pf-picker"></div>
            </div>

            <div data-pane="building" hidden>
              <div class="row">
                <div class="col-sm-6">
                  <label>Dispatch center</label>
                  <div class="input-group">
                    <select id="pf-b-dc" class="form-control"></select>
                    <span class="input-group-btn">
                      <button class="btn btn-default" data-pf="stamp-dc" data-for="building">Select its stations</button>
                    </span>
                  </div>
                </div>
                <div class="col-sm-6">
                  <label>Station types <span class="text-muted" id="pf-b-typecount"></span></label>
                  <div id="pf-b-types" class="pf-picker"></div>
                </div>
              </div>
              <label style="margin-top:10px">Stations <span class="text-muted" id="pf-b-stationcount"></span>
                <button class="btn btn-xs btn-link" data-pf="all" data-for="pf-b-stations">all</button>
                <button class="btn btn-xs btn-link" data-pf="none" data-for="pf-b-stations">none</button></label>
              <div id="pf-b-stations" class="pf-picker"></div>
              <p class="help-block" style="margin-top:8px">Station names are limited to
                ${LIMITS.building.max} characters.</p>
            </div>

            <div data-pane="data" hidden>
              <p class="help-block">Each button copies a small piece of JSON to your clipboard,
                ready to paste into the chat. Nothing is changed in the game.</p>
              <p>
                <button class="btn btn-default" data-pf="dump" data-what="vehicle-types">Vehicle types</button>
                <button class="btn btn-default" data-pf="dump" data-what="building-types">Station types</button>
                <button class="btn btn-default" data-pf="dump" data-what="dispatch">Dispatch centers and stations</button>
                <button class="btn btn-default" data-pf="dump" data-what="missions">Mission list check</button>
                <button class="btn btn-primary" data-pf="dump" data-what="export-all">Download everything</button>
                <button class="btn btn-default" data-pf="dump" data-what="missions-export">Mission list only</button>
                <button class="btn btn-default" data-pf="dump" data-what="selfcheck">Self-check</button>
              </p>
              <textarea id="pf-dump" class="form-control" rows="12" readonly
                placeholder="The copied text also appears here, in case the clipboard is refused."></textarea>
            </div>

            <div id="pf-shared" style="margin-top:14px;border-top:1px solid #ddd;padding-top:12px">
              <label for="pf-pattern">Pattern</label>
              <input id="pf-pattern" class="form-control" value="{building} {type} {nn}">
              <p class="help-block" style="margin-top:6px">
                ${TOKEN_HELP.map(([t, d]) =>
                    `<code>${esc(t)}</code> ${esc(d)}`).join(' &nbsp;·&nbsp; ')}
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
        </div>
      </div>`;
    }

    function pickerHtml(items, checked) {
        return items.map((it) => `<label class="pf-pick">
        <input type="checkbox" value="${esc(it.id)}"${checked ? ' checked' : ''}>
        <span>${esc(it.label)}</span></label>`).join('')
        || '<p class="help-block" style="margin:6px">nothing here</p>';
    }

    function injectStyles() {
        if ($('pf-renamer-style')) return;
        const st = document.createElement('style');
        st.id = 'pf-renamer-style';
        st.textContent = `
      .pf-picker{max-height:170px;overflow:auto;border:1px solid #ccc;border-radius:4px;
        padding:6px;background:#fff}
      .pf-pick{display:block;font-weight:400;margin:0 0 3px;cursor:pointer;color:#111}
      .pf-pick input{margin-right:6px}
      #${MODAL_ID} .nav-tabs>li>a{cursor:pointer}`;
        document.head.append(st);
    }

    async function openRenamer(undoMode = false) {
        typeNames = readStore(TYPES_KEY);
        buildingTypeNames = readStore(BTYPES_KEY);
        injectStyles();
        $(MODAL_ID)?.remove();

        const modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'modal fade in';
        modal.style.cssText =
            'display:block;position:fixed;inset:0;z-index:2147483000;overflow:auto;'
            + 'background:rgba(0,0,0,.4)';
        modal.innerHTML = modalHtml();
        document.body.append(modal);

        const status = $('pf-status');
        const previewBox = $('pf-preview');
        let planned = [];
        let plannedKind = 'vehicle';
        let tab = 'vehicle';

        modal.addEventListener('click', (e) => {
            if (e.target.dataset.pf === 'close') modal.remove();
        });

        status.textContent = 'Loading…';
        let vehicles;
        let buildings;
        try {
            const [v, b] = await Promise.all([getJSON('/api/vehicles'), getJSON('/api/buildings')]);
            vehicles = v;
            buildings = b;
        } catch (err) {
            status.innerHTML = `<span class="text-danger">${esc(err.message)}</span>`;
            return;
        }
        const byId = new Map(buildings.map((b) => [b.id, b]));
        const dcName = (b) => byId.get(b?.leitstelle_building_id)?.caption || '';
        status.textContent = `${vehicles.length} vehicles, ${buildings.length} stations.`;

        // ---- pickers ----
        const withVehicles = [...new Set(vehicles.map((v) => v.building_id))]
            .map((id) => byId.get(id)).filter(Boolean)
            .sort((a, b) => a.caption.localeCompare(b.caption));
        const allStations = buildings.slice().sort((a, b) => a.caption.localeCompare(b.caption));

        const dcs = buildings
            .filter((b) => buildings.some((x) => x.leitstelle_building_id === b.id))
            .sort((a, b) => a.caption.localeCompare(b.caption));
        const dcOptions = `<option value="">— pick one —</option>` +
            dcs.map((d) => `<option value="${d.id}">${esc(d.caption)}</option>`).join('');
        $('pf-v-dc').innerHTML = dcOptions;
        $('pf-b-dc').innerHTML = dcOptions;

        $('pf-v-stations').innerHTML = pickerHtml(
            withVehicles.map((b) => ({ id: b.id, label: b.caption })), true);
        $('pf-b-stations').innerHTML = pickerHtml(
            allStations.map((b) => ({ id: b.id, label: b.caption })), true);

        const vTypeCounts = new Map();
        for (const v of vehicles) {
            const id = typeInfo(v).id;
            vTypeCounts.set(id, (vTypeCounts.get(id) || 0) + 1);
        }
        const vTypeIds = [...vTypeCounts.keys()].sort((a, b) => Number(a) - Number(b));
        const vSample = (id) => vehicles.find((v) => String(v.vehicle_type ?? '') === id);

        const bTypeCounts = new Map();
        for (const b of buildings) {
            const id = buildingTypeInfo(b).id;
            bTypeCounts.set(id, (bTypeCounts.get(id) || 0) + 1);
        }
        const bTypeIds = [...bTypeCounts.keys()].sort((a, b) => Number(a) - Number(b));
        const bSample = (id) => buildings.find((b) => String(b.building_type ?? '') === id);

        function renderPickers() {
            $('pf-v-types').innerHTML = pickerHtml(vTypeIds.map((id) => ({
                id, label: `${typeInfo(vSample(id)).name} (${vTypeCounts.get(id)})`,
            })), true);
            $('pf-b-types').innerHTML = pickerHtml(bTypeIds.map((id) => ({
                id, label: `${buildingTypeInfo(bSample(id)).name} (${bTypeCounts.get(id)})`,
            })), true);
            updateCounts();
        }

        const checkedIds = (id) => [...$(id).querySelectorAll('input:checked')].map((i) => i.value);
        function updateCounts() {
            $('pf-v-stationcount').textContent = `(${checkedIds('pf-v-stations').length} of ${withVehicles.length})`;
            $('pf-b-stationcount').textContent = `(${checkedIds('pf-b-stations').length} of ${allStations.length})`;
            $('pf-v-typecount').textContent = `(${checkedIds('pf-v-types').length} of ${vTypeIds.length})`;
            $('pf-b-typecount').textContent = `(${checkedIds('pf-b-types').length} of ${bTypeIds.length})`;
        }

        function renderTypeTable() {
            const unnamed = vTypeIds.filter((id) => !typeInfo(vSample(id)).named).length;
            $('pf-types-summary').textContent = unnamed
                ? ` — ${unnamed} of ${vTypeIds.length} still unnamed`
                : ` — all ${vTypeIds.length} named`;
            if (unnamed) $('pf-types-panel').open = true;
            $('pf-types-list').innerHTML = `<table class="table table-condensed">
          <thead><tr><th style="width:70px">Id</th><th style="width:90px">Vehicles</th><th>Name</th></tr></thead>
          <tbody>${vTypeIds.map((id) => {
                const info = typeInfo(vSample(id));
                const fixed = !!vSample(id).vehicle_type_caption;
                return `<tr data-type="${esc(id)}">
              <td class="text-muted">${esc(id)}</td><td>${vTypeCounts.get(id)}</td>
              <td>${fixed
                    ? `<span>${esc(info.name)}</span> <span class="text-muted">(custom type)</span>`
                    : `<input class="form-control input-sm" data-pf="type-name"
                         value="${esc(typeNames[id] || '')}"
                         placeholder="${esc(BUILTIN_TYPE_NAMES[id] || `Type ${id}`)}">
                       ${info.source === 'builtin'
                        ? '<span class="text-muted" style="font-size:11px">built into the script</span>' : ''}`}
              </td></tr>`;
            }).join('')}</tbody></table>`;
        }
        renderTypeTable();
        renderPickers();

        // ---- tabs ----
        modal.addEventListener('click', (e) => {
            const a = e.target.closest('[data-pf="tab"]');
            if (!a) return;
            e.preventDefault();
            tab = a.dataset.tab;
            modal.querySelectorAll('.nav-tabs li').forEach((li) =>
                li.classList.toggle('active', li.contains(a)));
            modal.querySelectorAll('[data-pane]').forEach((p) => {
                p.hidden = p.dataset.pane !== tab;
            });
            $('pf-shared').hidden = tab === 'data';
            planned = [];
            modal.querySelector('[data-pf="apply"]').disabled = true;
            previewBox.innerHTML = '';
            if (tab === 'building' && $('pf-pattern').value === '{building} {type} {nn}') {
                $('pf-pattern').value = '{dc} {type} {nn}';
            }
        });

        // ---- picker helpers ----
        modal.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-pf="all"],[data-pf="none"]');
            if (btn) {
                e.preventDefault();
                const on = btn.dataset.pf === 'all';
                $(btn.dataset.for).querySelectorAll('input').forEach((i) => { i.checked = on; });
                updateCounts();
                return;
            }
            const stamp = e.target.closest('[data-pf="stamp-dc"]');
            if (!stamp) return;
            e.preventDefault();
            // Stamp the dispatch center's stations onto the selection. It is a
            // starting point, not a lock: every box stays clickable afterwards.
            const which = stamp.dataset.for;
            const dcId = Number($(which === 'vehicle' ? 'pf-v-dc' : 'pf-b-dc').value);
            if (!dcId) {
                status.textContent = 'Pick a dispatch center first.';
                return;
            }
            const box = $(which === 'vehicle' ? 'pf-v-stations' : 'pf-b-stations');
            let hit = 0;
            box.querySelectorAll('input').forEach((i) => {
                const b = byId.get(Number(i.value));
                const belongs = b && (b.leitstelle_building_id === dcId || b.id === dcId);
                i.checked = !!belongs;
                if (belongs) hit++;
            });
            updateCounts();
            status.textContent = `Selected ${hit} station${hit === 1 ? '' : 's'} of that dispatch center.`;
        });
        modal.addEventListener('change', (e) => {
            if (e.target.closest('.pf-picker')) updateCounts();
        });

        // ---- type names ----
        $('pf-types-list').addEventListener('input', (e) => {
            if (e.target.dataset.pf !== 'type-name') return;
            const id = e.target.closest('tr').dataset.type;
            const name = e.target.value.trim();
            if (name) typeNames[id] = name; else delete typeNames[id];
            writeStore(TYPES_KEY, typeNames);
            renderPickers();
        });

        modal.querySelector('[data-pf="copy-types"]').addEventListener('click', (e) => {
            e.preventDefault();
            const map = {};
            for (const id of vTypeIds) {
                const info = typeInfo(vSample(id));
                if (info.named) map[id] = info.name;
            }
            toClipboard(JSON.stringify(map, null, 1), `${Object.keys(map).length} type names`);
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
            writeStore(TYPES_KEY, typeNames);
            renderTypeTable();
            renderPickers();
            status.textContent = `Took ${added} name${added === 1 ? '' : 's'} from the pasted map.`;
        });

        modal.querySelector('[data-pf="fetch-types"]').addEventListener('click', async (e) => {
            e.preventDefault();
            const locale = gameLocale();
            if (!locale) {
                status.innerHTML = '<span class="text-danger">Could not read the game language,'
                    + ' so the right names cannot be requested. Type them instead.</span>';
                return;
            }
            status.textContent = `Asking api.lss-manager.de for ${locale} names…`;
            try {
                const data = await getTypeCatalogue(locale);
                let filled = 0;
                for (const id of vTypeIds) {
                    const caption = data[id]?.caption;
                    if (caption && !typeNames[id] && caption !== BUILTIN_TYPE_NAMES[id]) {
                        typeNames[id] = caption;
                        filled++;
                    }
                }
                writeStore(TYPES_KEY, typeNames);
                renderTypeTable();
                renderPickers();
                status.textContent = filled
                    ? `Filled in ${filled} name${filled === 1 ? '' : 's'}.`
                      + ' Check them, then "Copy type map" keeps them for good.'
                    : 'Nothing new — the names you have already cover your fleet.';
            } catch (err) {
                status.innerHTML = `<span class="text-danger">Could not reach the name service`
                    + ` (${esc(err.message)}). Type the names instead.</span>`;
            }
        });

        function download(filename, text) {
            // The mission list runs to a megabyte or so, which no one is going
            // to paste into a chat. Hand it over as a file instead.
            const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        }

        function toClipboard(text, what) {
            $('pf-dump').value = text;
            navigator.clipboard.writeText(text)
                .then(() => { status.textContent = `Copied ${what}.`; })
                .catch(() => { status.textContent = `Clipboard refused — the text is in the box below.`; });
        }

        // ---- data buttons ----
        modal.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-pf="dump"]');
            if (!btn) return;
            e.preventDefault();
            const what = btn.dataset.what;
            if (what === 'vehicle-types') {
                const rows = vTypeIds.map((id) => ({
                    id: Number(id), vehicles: vTypeCounts.get(id),
                    name: typeInfo(vSample(id)).named ? typeInfo(vSample(id)).name : null,
                }));
                toClipboard(JSON.stringify(rows, null, 1), 'the vehicle types');
            } else if (what === 'building-types') {
                const rows = bTypeIds.map((id) => ({
                    id: Number(id), stations: bTypeCounts.get(id),
                    name: buildingTypeInfo(bSample(id)).named ? buildingTypeInfo(bSample(id)).name : null,
                    example: bSample(id).caption,
                    small: !!bSample(id).small_building,
                }));
                toClipboard(JSON.stringify(rows, null, 1), 'the station types');
            } else if (what === 'dispatch') {
                const rows = dcs.map((d) => ({
                    dispatchCenter: d.caption,
                    stations: buildings.filter((b) => b.leitstelle_building_id === d.id)
                        .map((b) => b.caption),
                }));
                const loose = buildings.filter((b) => !b.leitstelle_building_id
                    && !dcs.some((d) => d.id === b.id)).map((b) => b.caption);
                toClipboard(JSON.stringify({ dispatchCenters: rows, withoutDispatchCenter: loose }, null, 1),
                    `${rows.length} dispatch centers`);
            } else if (what === 'missions') {
                status.textContent = 'Checking /einsaetze.json…';
                try {
                    const data = await getJSON('/einsaetze.json');
                    const summary = {
                        shape: Array.isArray(data) ? 'array' : typeof data,
                        count: Array.isArray(data) ? data.length : Object.keys(data).length,
                        firstEntry: Array.isArray(data) ? data[0] : Object.entries(data)[0],
                    };
                    toClipboard(JSON.stringify(summary, null, 1), 'the mission list check');
                } catch (err) {
                    toClipboard(JSON.stringify({ error: err.message }, null, 1), 'the error');
                }
            } else if (what === 'missions-export') {
                status.textContent = 'Fetching the mission list…';
                try {
                    const slim = slimMissions(await getJSON('/einsaetze.json'));
                    const text = JSON.stringify(slim);
                    download('einsaetze-slim.json', text);
                    status.innerHTML = `Downloaded <b>einsaetze-slim.json</b> —`
                        + ` ${slim.length} missions, ${Math.round(text.length / 1024)} KB.`
                        + ' Attach that file in the chat.';
                    $('pf-dump').value = JSON.stringify(slim.slice(0, 3), null, 1);
                } catch (err) {
                    toClipboard(JSON.stringify({ error: err.message }, null, 1), 'the error');
                }
            } else if (what === 'export-all') {
                const out = {
                    fetchedAt: new Date().toISOString(),
                    game: location.origin,
                    locale: gameLocale() || null,
                    endpoints: {},
                };
                let ok = 0;
                for (const ep of ENDPOINTS) {
                    status.textContent = `Fetching ${ep.path}…`;
                    try {
                        const data = await getJSON(ep.path);
                        out.endpoints[ep.label] = {
                            path: ep.path,
                            count: Array.isArray(data) ? data.length : Object.keys(data).length,
                            data: ep.slim === 'missions' ? slimMissions(data) : data,
                        };
                        ok++;
                    } catch (err) {
                        out.endpoints[ep.label] = { path: ep.path, error: err.message };
                    }
                    await sleep(120);
                }
                const text = JSON.stringify(out);
                download('missionchief-export.json', text);
                const summary = Object.fromEntries(Object.entries(out.endpoints)
                    .map(([k, v]) => [k, v.error ? `failed: ${v.error}` : `${v.count} entries`]));
                $('pf-dump').value = JSON.stringify(summary, null, 1);
                status.innerHTML = `Downloaded <b>missionchief-export.json</b> —`
                    + ` ${ok} of ${ENDPOINTS.length} endpoints,`
                    + ` ${Math.round(text.length / 1024)} KB. Attach that file in the chat.`;
            } else if (what === 'selfcheck') {
                toClipboard(JSON.stringify(await selfCheck(), null, 1), 'the self-check');
            }
        });

        // ---- preview and apply ----
        function currentRows() {
            if (tab === 'building') {
                const stations = new Set(checkedIds('pf-b-stations').map(Number));
                const types = new Set(checkedIds('pf-b-types'));
                return buildings
                    .filter((b) => stations.has(b.id) && types.has(buildingTypeInfo(b).id))
                    .sort((a, b) => a.caption.localeCompare(b.caption));
            }
            const stations = new Set(checkedIds('pf-v-stations').map(Number));
            const types = new Set(checkedIds('pf-v-types'));
            return vehicles.filter((v) =>
                stations.has(v.building_id) && types.has(typeInfo(v).id));
        }

        function planFor(pattern) {
            const kind = tab === 'building' ? 'building' : 'vehicle';
            const max = LIMITS[kind].max;
            const rows = currentRows();
            const scopeOf = kind === 'building'
                ? (b) => ({ default: 'all', type: buildingTypeInfo(b).id, dc: String(b.leitstelle_building_id || '') })
                : (v) => ({ default: String(v.building_id), type: typeInfo(v).id,
                    dc: String(byId.get(v.building_id)?.leitstelle_building_id || '') });

            const plan = assignIndexes(rows, scopeOf).map(({ row, indexes }) => {
                const tokens = kind === 'building'
                    ? { type: buildingTypeInfo(row).name, typeid: String(row.building_type ?? ''),
                        building: row.caption, dc: dcName(row), id: String(row.id), name: row.caption }
                    : { type: typeInfo(row).name, typeid: String(row.vehicle_type ?? ''),
                        building: byId.get(row.building_id)?.caption || '',
                        dc: dcName(byId.get(row.building_id)), id: String(row.id),
                        name: row.caption };
                return {
                    entity: row,
                    from: kind === 'building' ? row.caption : row.caption,
                    to: expandPattern(pattern, indexes, tokens, max),
                };
            });
            return { kind, rows, plan };
        }

        function showPlan(considered, verb) {
            const applyBtn = modal.querySelector('[data-pf="apply"]');
            applyBtn.disabled = planned.length === 0;
            applyBtn.textContent = planned.length
                ? `${verb} ${planned.length}` : verb;
            applyBtn.classList.toggle('btn-warning', verb === 'Undo');
            applyBtn.classList.toggle('btn-danger', verb !== 'Undo');
            status.textContent = planned.length
                ? `${planned.length} of ${considered} would change.`
                : `Nothing would change in those ${considered}.`;
            previewBox.innerHTML = planned.length ? `
        <table class="table table-condensed">
          <thead><tr><th>Now</th><th>Becomes</th></tr></thead>
          <tbody>${planned.slice(0, 200).map((r) => `
            <tr><td>${esc(r.from)}</td><td><b>${esc(r.to)}</b></td></tr>`).join('')}
          </tbody>
        </table>${planned.length > 200
            ? `<p class="help-block">…and ${planned.length - 200} more.</p>` : ''}` : '';
        }

        modal.querySelector('[data-pf="preview"]').addEventListener('click', (e) => {
            e.preventDefault();
            const pattern = $('pf-pattern').value;
            const { kind, rows, plan } = planFor(pattern);
            plannedKind = kind;
            planned = plan.filter((r) => r.to && r.to !== r.from);
            showPlan(rows.length, 'Apply');

            const warn = [];
            if (/\{type\}/.test(pattern)) {
                const unnamed = kind === 'building'
                    ? planned.some((r) => !buildingTypeInfo(r.entity).named)
                    : planned.some((r) => !typeInfo(r.entity).named);
                if (unnamed) {
                    warn.push('Some of these use a type that has no name yet, so they would be'
                        + ' called <b>Type &lt;number&gt;</b>. Name them first.');
                }
            }
            if (/\{dc\}/.test(pattern) && planned.some((r) => {
                const b = kind === 'building' ? r.entity : byId.get(r.entity.building_id);
                return !dcName(b);
            })) {
                warn.push('Some of these are in no dispatch center, so <b>{dc}</b> would be empty for them.');
            }
            const dup = new Map();
            for (const r of planned) dup.set(r.to, (dup.get(r.to) || 0) + 1);
            const clashes = [...dup.entries()].filter(([, n]) => n > 1);
            if (clashes.length) {
                warn.push(`This pattern gives <b>${clashes.length}</b> name${clashes.length === 1 ? '' : 's'}`
                    + ' to more than one of them. Add a counter to tell them apart.');
            }
            if (warn.length) {
                previewBox.insertAdjacentHTML('afterbegin',
                    `<div class="alert alert-warning">${warn.join('<br>')}</div>`);
            }
        });

        // ---- undo ----
        const backups = readBackups();
        const restoreBox = $('pf-restore');
        if (backups.length) {
            const newest = backups[0];
            restoreBox.innerHTML = `
        <div class="alert alert-info">
          Last rename: <b>${esc(new Date(newest.at).toLocaleString())}</b>,
          ${newest.entries.length} ${esc(KIND_NOUN[newest.kind] || 'vehicle')}${newest.entries.length === 1 ? '' : 's'}.
          <button class="btn btn-xs btn-default" data-pf="undo">Preview undo</button>
          <button class="btn btn-xs btn-link" data-pf="copy-backup">Copy backup</button>
        </div>`;
            restoreBox.querySelector('[data-pf="copy-backup"]').addEventListener('click', (e) => {
                e.preventDefault();
                toClipboard(JSON.stringify(newest, null, 1), 'the backup');
            });
            restoreBox.querySelector('[data-pf="undo"]').addEventListener('click', (e) => {
                e.preventDefault();
                plannedKind = newest.kind || 'vehicle';
                const pool = plannedKind === 'building' ? byId : new Map(vehicles.map((v) => [v.id, v]));
                planned = newest.entries
                    .map((en) => ({ entity: pool.get(en.id), from: pool.get(en.id)?.caption, to: en.from }))
                    .filter((r) => r.entity && r.to && r.to !== r.from);
                showPlan(newest.entries.length, 'Undo');
            });
        }
        if (undoMode) restoreBox.querySelector('[data-pf="undo"]')?.click();

        modal.querySelector('[data-pf="apply"]').addEventListener('click', async (e) => {
            e.preventDefault();
            const btn = e.target;
            if (!planned.length) return;
            const noun = KIND_NOUN[plannedKind] + 's';
            if (!confirm(`Rename ${planned.length} ${noun}?\n\n`
                + `This writes to your account. The old names are saved in this browser `
                + `so you can undo it, but check the preview first.`)) return;

            const saved = writeBackup(plannedKind,
                planned.map((r) => ({ id: r.entity.id, from: r.from, to: r.to })));
            btn.disabled = true;
            let done = 0;
            const failed = [];
            for (const { entity, to } of planned) {
                status.textContent = `Renaming ${done + 1} of ${planned.length}…`;
                try {
                    await renameEntity(plannedKind, entity.id, to);
                    done++;
                } catch (err) {
                    failed.push(`${entity.caption}: ${err.message}`);
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

    // ---------- getting in ----------
    function addFloatingButton() {
        if ($('pf-renamer-fab') || !document.body) return;
        const btn = document.createElement('button');
        btn.id = 'pf-renamer-fab';
        btn.type = 'button';
        btn.textContent = 'Renamer';
        btn.title = 'MissionChief Renamer';
        btn.style.cssText =
            'position:fixed;right:14px;bottom:14px;z-index:2147483000;'
            + 'padding:9px 14px;border-radius:999px;border:0;cursor:pointer;'
            + 'background:#2f4490;color:#fff;font:600 13px/1 system-ui,sans-serif;'
            + 'box-shadow:0 2px 10px rgba(0,0,0,.35)';
        btn.addEventListener('click', () => openRenamer());
        document.body.append(btn);
    }

    function addMenuEntry() {
        if ($('pf-renamer-entry')) return;
        const menu = document.querySelector('#menu_profile + .dropdown-menu')
            || document.querySelector('.navbar-nav .dropdown-menu');
        if (!menu) return;
        const li = document.createElement('li');
        li.id = 'pf-renamer-entry';
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = 'Renamer';
        a.addEventListener('click', (ev) => {
            ev.preventDefault();
            openRenamer();
        });
        li.append(a);
        menu.append(li);
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Rename vehicles and stations', () => openRenamer());
        GM_registerMenuCommand('Undo last rename', () => openRenamer(true));
    }

    const mount = () => {
        addFloatingButton();
        addMenuEntry();
    };
    mount();
    document.addEventListener('DOMContentLoaded', mount);
    setInterval(mount, 5000);

    async function selfCheck() {
        const out = {
            script: 'MissionChief Renamer 2.3.0 is running',
            url: location.href,
            locale: gameLocale() || '(not readable)',
            buttonOnPage: !!$('pf-renamer-fab'),
        };
        for (const path of ['/api/vehicles', '/api/buildings']) {
            try {
                const res = await fetch(path, { credentials: 'include' });
                const body = await res.text();
                let count;
                try {
                    const json = JSON.parse(body);
                    count = Array.isArray(json) ? `${json.length} entries`
                        : `object with keys: ${Object.keys(json).slice(0, 6).join(', ')}`;
                } catch (err) {
                    count = `not JSON — starts with: ${body.slice(0, 60)}`;
                }
                out[path] = `HTTP ${res.status}, ${count}`;
            } catch (err) {
                out[path] = `request failed: ${err.message}`;
            }
        }
        return out;
    }

    try {
        const w = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
        w.pfRenamer = openRenamer;
        w.pfRenamerCheck = () => selfCheck().then((r) => {
            console.log('%c Renamer self-check ', 'background:#2f4490;color:#fff', r);
            return r;
        });
    } catch (e) {
        window.pfRenamer = openRenamer;
    }
})();
