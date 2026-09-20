/* --------------------------------------------------------------------------
 * MissionMagician — read a mission window, say which vehicles it wants, and
 * pick them.
 *
 * IT PICKS. IT DOES NOT DISPATCH. That is the whole safety design, and it is
 * not a limitation to be lifted later. An alarm cannot be taken back, so the
 * rule about a mandatory preview and an undoable backup cannot be met by any
 * amount of care — there is no undo to write. So the preview *is* the product:
 * MissionMagician ticks the game's own checkboxes and stops. The player looks
 * at what is selected and presses the game's own Dispatch button. Nothing is
 * ever written to the account by this module.
 *
 * What the first real capture settled. A mission is its own page at
 * /missions/<id>. The dispatch is a plain form: `input[name="vehicle_ids[]"]`
 * checkboxes carrying `data-direct`, `data-distance` and `data-equipment-types`,
 * and an `input[name="commit"]` submit labelled Dispatch, beside `.alert_next`
 * and `.alert_next_alliance`. `#mission_general_info` holds the header and
 * `#missing_text` the missing-vehicle line, as text with no child elements.
 *
 * That is the safe-write shape already: tick the game's own boxes, submit the
 * game's own form. Nothing has to be hand-built.
 *
 * WHERE THAT PAGE LIVES, which was the confusing part. On the big map the
 * mission window is an iframe, so the address bar still says "/" while the
 * mission is on screen. YMCA is not locked out of it — the userscript's @match
 * covers frames, so YMCA boots a second time *inside* that iframe, which is
 * why the capture that worked reported "/missions/505949001". Reaching across
 * from the parent is therefore never necessary, and jxn-30/LSS-Scripts does
 * the same thing: its mission scripts match /missions/* and simply run in the
 * frame.
 *
 * So the rule for this module is: it belongs inside the mission frame. Open
 * the mission first, then open YMCA — on the big map that means the floating
 * button, because the frame has no navbar of its own.
 *
 * WHAT THE VEHICLE LIST IS, now seen on a real page. `#mission-form` posts to
 * /missions/<id>/alarm. `#vehicle_show_table_body_all` holds the rows; a row is
 * `.vehicle_select_table_tr` and carries `vehicle_id`, `data-distance` and a
 * category flag matching the tab it belongs to (`polizei`, `feuerwehr_lf`,
 * `rettungsdienst`, …). The checkbox inside it is `.vehicle_checkbox`, id
 * `vehicle_checkbox_<vehicleId>`, and it is where the useful attributes live:
 * `vehicle_type_id`, `fms` for status, and a set of plain capability flags —
 * `fire`, `elw`, `rw`, `dlk`, `gwa`, `fustw`, `any_rtw`, `gwl2wasser_only` —
 * plus `wasser_amount` and `foam_amount_display`. Those flags are not guessed:
 * they are the same ones the player's own AAO buttons select on, which is how
 * each entry in REQUIREMENTS below is sourced.
 *
 * The mission's type is on `#mission_general_info` as `data-mission-type`, so
 * what a mission *needs* comes from /einsaetze.json rather than from reading
 * the window's text. The window is only asked which vehicles are available.
 * -------------------------------------------------------------------------- */

/**
 * What a requirement in /einsaetze.json is called on a vehicle checkbox.
 *
 * Every entry carries where it came from, and the AAO ones are strong: an AAO
 * is a filter the player built in the game's own editor, so a button labelled
 * "F-HRV" selecting on `rw="1"` is the game itself saying which flag means a
 * heavy rescue vehicle. Requirements with no entry here are shown and counted
 * but never auto-selected — an unmatched requirement is stated, not guessed at.
 */
const MM_REQUIREMENTS = {
    firetrucks: { flag: 'fire', label: 'Fire engines', icon: 'flame', source: 'the "Fire Truck" AAO selects on fire=1' },
    battalion_chief_vehicles: { flag: 'elw', label: 'Battalion chief units', icon: 'star', source: 'the "F-BCU" AAO selects on elw=1' },
    police_cars: { flag: 'fustw_or_police_motorcycle', label: 'Patrol cars', icon: 'shield', source: 'the "Patrol Car" AAO' },
    ambulances: { flag: 'any_rtw', label: 'Ambulances', icon: 'cross', source: 'the "Rescue Unit" AAO selects on any_rtw=1' },
    heavy_rescue_vehicles: { flag: 'rw', label: 'Heavy rescue', icon: 'arm', source: 'the "F-HRV" AAO selects on rw=1' },
    mobile_air_vehicles: { flag: 'gwa', label: 'Mobile air', icon: 'wind', source: 'the "F-MA" AAO selects on gwa=1' },
    platform_trucks: { flag: 'dlk', label: 'Platform trucks', icon: 'ladder', source: 'the "F-PlT" AAO selects on dlk=1' },
    water_tankers: { flag: 'gwl2wasser_only', label: 'Water tankers', icon: 'tank', source: 'the "F-WaTa" AAO' },

    /* The "one of these will do" family. The key spells out the alternatives, so
     * these are read rather than guessed: any vehicle carrying any one of the
     * flags satisfies it, which is also why they are the easiest requirement to
     * fill and end up last in the scarcity order. Only the ones whose every
     * alternative already has a flag above are listed; the rest stay unmatched
     * and say so. */
    oneof_fire_engine_or_rescue: {
        anyOf: ['fire', 'rw'], label: 'An engine or a rescue', icon: 'arm',
        source: 'the key names its own alternatives',
    },
    oneof_fire_engine_or_ladder: {
        anyOf: ['fire', 'dlk'], label: 'An engine or a ladder', icon: 'ladder',
        source: 'the key names its own alternatives',
    },
    oneof_fire_engine_or_rescue_or_ladder: {
        anyOf: ['fire', 'rw', 'dlk'], label: 'An engine, rescue or ladder', icon: 'ladder',
        source: 'the key names its own alternatives',
    },
    oneof_fire_rescue_or_ladder: {
        anyOf: ['rw', 'dlk'], label: 'A rescue or a ladder', icon: 'arm',
        source: 'the key names its own alternatives',
    },

    /* Patients live under `additional`, not in `requirements`. They are counted
     * into the ambulance row rather than shown as a line of their own.
     *
     * A patient wants an ambulance: something that can treat one and carry one.
     * A Rescue Engine or a heavy rescue is a fire appliance and does neither,
     * and the game does not flag either `any_rtw`. So this is the same test as
     * the ambulances line above, deliberately and not a looser one. */
    patients: { flag: 'any_rtw', label: 'Ambulances', icon: 'cross', source: 'one per patient' },
};

/**
 * How many ambulances the patients want.
 *
 * `requirements` says nothing about patients; the catalogue carries them under
 * `additional.possible_patient` as the most this mission can produce, with
 * `possible_patient_min` as the fewest. The window itself knows the real number
 * for this instance and states it in `#patient_missing_requirements` — "1x We
 * need: Ambulance" — so the leading count there is preferred, and the
 * catalogue's figure is the fallback for a window that has not said yet.
 *
 * One ambulance per patient. `chances.patient_transport` is the chance of a
 * *transport to hospital* afterwards, which is a different question and not
 * this one.
 */
function mmPatients(record) {
    /* The window says it three ways and which one is showing depends on where
     * the mission has got to, so all three are read in order of how sure each is.
     *
     *  1. What is still missing — "1x We need: Ambulance". Rendered only while
     *     an ambulance is actually wanted, so surest when it is there.
     *  2. The patient panel's own header — "1 Patient". Present whenever the
     *     mission has patients at all, including while a first responder is
     *     already on the way and nothing is being flagged as missing. This is
     *     the one that was missing, and why an ambulance went unasked for.
     *  3. One element per patient, the same number said a third way.
     *
     * Only then `additional.possible_patient`, which is the most this mission
     * *can* produce rather than what it did. */
    const firstNumber = (sel, re) => {
        for (const el of document.querySelectorAll(sel)) {
            const m = re.exec((el.textContent || '').trim());
            if (m) return Number(m[1]);
        }
        return null;
    };

    /* The patient panel's own header counts every patient at the mission,
     * treated or not, and keeps counting them until they are taken away. That
     * is the number this wants. */
    const stated = firstNumber('#patient_button_text strong, #patient_button_form strong', /^(\d+)\b/);
    if (stated) return { count: stated, total: true, from: 'window' };

    const each = document.querySelectorAll('.mission_patient, [id^="patient_form_"]').length;
    if (each) return { count: each, total: true, from: 'rows' };

    /* "1x We need: Ambulance" is how many *more* are wanted, not how many the
     * mission has. Subtracting what is already there from it would ask for one
     * ambulance and then answer itself with the one already treating somebody. */
    const missing = firstNumber('#patient_missing_requirements strong', /^(\d+)\s*x/i);
    if (missing) return { count: missing, total: false, from: 'missing' };

    const possible = Number(record?.additional?.possible_patient || record?.patients) || 0;
    return possible ? { count: possible, total: true, from: 'catalogue' } : null;
}

/** Where the window keeps its patients, for a window that keeps them elsewhere. */
function mmPatientProbe() {
    const shapes = (sel, attr) => [...new Set([...document.querySelectorAll(sel)]
        .map((el) => String(el[attr] || '').replace(/\d+/g, '#')))].filter(Boolean).slice(0, 15);
    return {
        detected: mmPatients(null),
        patientIdShapes: shapes('[id*="patient"]', 'id'),
        patientClasses: shapes('[class*="patient"]', 'className'),
        missingBlockHidden: [...document.querySelectorAll('#patient_missing_requirements')]
            .map((el) => getComputedStyle(el).display === 'none'),
    };
}

/** Requirements that are an amount to reach, not a count of vehicles. */
const MM_AMOUNTS = {
    water_needed: { attr: 'wasser_amount', label: 'Water', unit: 'gal.', icon: 'drop' },
    foam_needed: { attr: 'foam_amount_display', label: 'Foam', unit: 'gal.', icon: 'foam' },
};

/**
 * A glyph per requirement, so a row is recognised before it is read.
 *
 * Stroke only and `currentColor`, at the height of the text beside it, so it
 * takes the colour of whatever it sits in and follows the game into dark mode.
 */
const MM_ICONS = {
    ladder: '<path d="M5 2v16M13 2v16M5 6h8M5 10h8M5 14h8"/>',
    arm: '<path d="M2 13c3-1 5-4 8-4 3 0 4 2 4 4a3 3 0 0 1-3 3H6"/><path d="M11 9V5a2 2 0 1 1 4 0v3"/>',
    cross: '<path d="M7 3h6v4h4v6h-4v4H7v-4H3V7h4z"/>',
    wind: '<path d="M2 7h9a3 3 0 1 0-3-3"/><path d="M2 12h12a3 3 0 1 1-3 3"/>',
    drop: '<path d="M10 2s6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 6-10 6-10z"/>',
    shield: '<path d="M10 2 3 5v5c0 4 3 7 7 8 4-1 7-4 7-8V5z"/>',
    locked: '<rect x="4" y="9" width="12" height="8" rx="1.5"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/>',
    unlocked: '<rect x="4" y="9" width="12" height="8" rx="1.5"/><path d="M7 9V6a3 3 0 0 1 5.6-1.5"/>',
    flame: '<path d="M10 18c3.3 0 6-2.4 6-5.5 0-4-4-6-4-10.5-2 1.5-4 3.5-4 6 0 1.5.6 2.4.6 2.4'
        + 'S7 9 6 7.5C4.8 9 4 10.8 4 12.5 4 15.6 6.7 18 10 18z"/>',
    // The chief: a star, the way rank is worn.
    star: '<path d="M10 2.5 12.2 7l5 .7-3.6 3.5.9 5-4.5-2.4L5.5 16l.9-5L2.8 7.7l5-.7z"/>',
    // A tanker: a cylinder on its side, which is what one looks like.
    tank: '<ellipse cx="5" cy="10" rx="2.5" ry="5"/><path d="M5 5h10M5 15h10"/>'
        + '<path d="M15 5a2.5 5 0 0 1 0 10"/>',
    // Foam: bubbles.
    foam: '<circle cx="6.5" cy="12" r="3.5"/><circle cx="13" cy="13" r="2.5"/>'
        + '<circle cx="11" cy="6.5" r="2.5"/>',
    // HazMat: the trefoil, the way a placard wears it.
    hazard: '<path d="M10 2.5 18 16.5H2z"/><path d="M10 7.5v4"/><circle cx="10" cy="14" r=".6"/>',
    // Water rescue: a wave.
    wave: '<path d="M2 12c2-2 3.3-2 5 0s3 2 5 0 3.3-2 5 0"/>'
        + '<path d="M2 7c2-2 3.3-2 5 0s3 2 5 0 3.3-2 5 0"/>',
    // A tow hook.
    hook: '<path d="M10 2v7"/><path d="M10 9a4 4 0 1 0 4 4"/><path d="M6 2h8"/>',
    // Light and power: a bolt.
    bolt: '<path d="M11 2 4 11h5l-1 7 7-9h-5z"/>',
    // A trailer or a container: a box on the ground.
    box: '<rect x="2.5" y="5" width="15" height="8" rx="1"/><circle cx="6" cy="16" r="1.6"/>'
        + '<circle cx="14" cy="16" r="1.6"/>',
    // Wildland: a tree.
    tree: '<path d="M10 2 5 9h10z"/><path d="M10 6.5 4 14h12z"/><path d="M10 14v4"/>',
};

/**
 * The glyphs are drawn edge to edge in a 20-wide box, so a 1.6 stroke put half
 * its width outside it and the outermost lines came back shaved. The viewBox
 * carries a unit of margin on every side instead of the paths being redrawn.
 */
function mmIcon(name) {
    const path = MM_ICONS[name];
    if (!path) return '';
    return `<svg viewBox="-1.5 -1.5 23 23" width="15" height="15" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" class="mm-glyph">${path}</svg>`;
}

/** Every flag the requirements above ask for by name. */
const MM_NAMED_FLAGS = [...new Set(Object.values(MM_REQUIREMENTS)
    .flatMap((r) => r.anyOf || [r.flag]))];

/**
 * Attributes on a vehicle's checkbox that are not capabilities.
 *
 * Everything else the game sets to "1" is one: `fire`, `dlk`, `rw`,
 * `any_rtw`, `water_damage_pump`, `crew_carrier_or_fire_engine`. The game
 * writes the whole set on the element, so the vocabulary is read from the page
 * rather than kept in a list here — which is what lets a vehicle YMCA has never
 * heard of still be counted and sent.
 */
const MM_NOT_A_FLAG = new Set([
    'fms', 'checked', 'disabled', 'value', 'name', 'type', 'id', 'class',
    'vehicle_type_id', 'direct', 'distance', 'wasser_amount', 'foam_amount_display',
    'custom_', 'equipmenttypes', 'tabindex',
]);

/** Every capability the game put on this checkbox, whatever YMCA makes of it. */
function mmFlagsOn(box) {
    const flags = [];
    for (const attr of box.attributes) {
        if (attr.value !== '1') continue;
        const n = attr.name.toLowerCase();
        if (MM_NOT_A_FLAG.has(n) || !/^[a-z][a-z0-9_]*$/.test(n)) continue;
        flags.push(n);
    }
    return flags;
}

/**
 * A requirement the table can answer even though nothing here maps it.
 *
 * The game names the same thing twice: `requirements` calls it
 * `hazmat_vehicles`, and the checkbox of a vehicle that satisfies it carries an
 * attribute of its own name. Where those two line up, the requirement is
 * matched — read off the page, not guessed at, and only ever against a flag
 * some vehicle in this very table actually carries. The `oneof_…` family says
 * its alternatives out loud, so it is split on `_or_` and each part looked up
 * the same way.
 *
 * Nothing is invented: if no candidate is in the vocabulary the requirement
 * stays unmatched and the panel says so, exactly as before.
 */
function mmDeriveRule(key, vocab) {
    const has = (n) => vocab.has(n);
    const trim = (n) => n.replace(/s$/, '');
    const shorten = (n) => n.replace(/_(vehicles?|trucks?|cars?|units?|engines?)$/, '');

    if (key.startsWith('oneof_')) {
        const body = key.slice('oneof_'.length);
        if (has(body)) return { flag: body, derived: body };
        const parts = body.split('_or_');
        const flags = parts.map((part) =>
            [part, trim(part), shorten(part)].find(has)).filter(Boolean);
        if (parts.length > 1 && flags.length === parts.length) {
            return { anyOf: [...new Set(flags)], derived: flags.join(' or ') };
        }
        return null;
    }

    const flag = [key, trim(key), shorten(key), shorten(trim(key))].find(has);
    return flag ? { flag, derived: flag } : null;
}

/** Which requirement an icon suits, by what the key says it is. */
const MM_ICON_WORDS = [
    [/hazmat|gefahrgut|decon/, 'hazard'], [/foam/, 'foam'], [/water|tanker|pump|flood/, 'drop'],
    [/ladder|platform|aerial|tiller/, 'ladder'], [/rescue|extricat/, 'arm'],
    [/ambulance|patient|ems|medic/, 'cross'], [/air|breath/, 'wind'],
    [/police|patrol|swat|k9|riot|fbi|sheriff|prisoner/, 'shield'],
    [/chief|command|supervisor|investigat/, 'star'], [/boat|marine|coastal|lifeguard/, 'wave'],
    [/tow|wrecker|crane/, 'hook'], [/light|generator|power/, 'bolt'],
    [/trailer|container|equipment|hooklift/, 'box'], [/dozer|wildland|brush|crew/, 'tree'],
    [/fire|engine|pumper|arff/, 'flame'],
];

function mmIconFor(key, label) {
    const text = `${key} ${label || ''}`.toLowerCase();
    return (MM_ICON_WORDS.find(([re]) => re.test(text)) || [, 'star'])[1];
}

/** Does this vehicle answer the requirement — one flag, or any of several? */
function mmMeets(v, rule) {
    return rule.anyOf ? rule.anyOf.some((f) => v.has(f)) : v.has(rule.flag);
}

/** The same question for a type already at the mission, whose flags were learnt. */
function mmSceneCount(scene, rule) {
    if (!rule.anyOf) return scene.counts[rule.flag] || 0;
    /* A vehicle carrying two of the alternatives must not be counted twice, so
     * the per-vehicle flag sets are kept and asked, not the per-flag totals. */
    return scene.vehicles.filter((flags) => rule.anyOf.some((f) => flags.includes(f))).length;
}

/** How long the game's own mission catalogue is worth keeping. It changes when
 * the game is updated, not while anyone is playing. */
const MM_CATALOGUE_MS = 24 * 60 * 60 * 1000;

/**
 * What each vehicle type can do, learnt from the selection table.
 *
 * A vehicle already at the mission is listed in a different table, and that one
 * carries only `vehicle_type_id` — no capability flags. So the flags are
 * remembered from the selection table, where both appear on the same row, and
 * the fleet fills itself in over the first few missions. A type never yet seen
 * there counts as present but unknown, and the panel says so rather than
 * quietly treating it as nothing.
 */
const MM_TYPES_KEY = 'ymca-missionmagician-types';

/**
 * The fleet the repo already knows, inlined from data/vehicle-types.json.
 *
 * Without it a fresh install cannot say what a vehicle already at the mission
 * covers until it has watched enough selection tables to learn the type — so
 * every report that names a new type belongs in that file.
 */
const MM_SHIPPED_TYPES = __VEHICLE_TYPES__;

function mmKnownTypes() {
    let learnt = {};
    try {
        learnt = JSON.parse(localStorage.getItem(MM_TYPES_KEY)) || {};
    } catch (e) { /* nothing learnt yet */ }
    const known = {};
    /* A shipped entry may carry a name and nothing else: the buy pages name every
     * type the game sells, but they do not say what a vehicle covers. An entry
     * without capabilities stays unknown here, so a vehicle already at the mission
     * is left alone rather than judged to cover nothing. */
    for (const [id, t] of Object.entries(MM_SHIPPED_TYPES)) {
        if (Array.isArray(t.capabilities)) known[id] = t.capabilities;
    }
    /* What this game taught wins: the player's own server is the truth here.
     *
     * An empty set is not an answer. It used to mean the vehicle carried none
     * of the handful of flags a requirement named, which is how a HazMat came
     * back with no capabilities at all; the whole set is read now, so an empty
     * one means the checkbox was read before the game had written to it.
     * Either way, storing it as "covers nothing" would let Cancel Unused send a
     * HazMat home from a HazMat call. Unknown is the safe reading, and leaving
     * the vehicle alone is what unknown already does. */
    for (const [id, t] of Object.entries(learnt)) {
        const caps = Array.isArray(t) ? t : (t.caps || []);
        if (caps.length) known[id] = caps;
    }
    return known;
}

function mmLearnTypes(vehicles) {
    let learnt = {};
    try {
        learnt = JSON.parse(localStorage.getItem(MM_TYPES_KEY)) || {};
    } catch (e) { /* nothing learnt yet */ }

    let changed = false;
    for (const v of vehicles) {
        if (!v.typeId) continue;
        const had = learnt[v.typeId];
        const caps = v.flags;
        // Older stores kept a bare array of flags; keep reading those.
        const before = Array.isArray(had) ? { caps: had, name: null } : had;
        if (before && before.name && before.caps.join('|') === caps.join('|')) continue;
        learnt[v.typeId] = { caps, name: v.typeName || before?.name || null };
        changed = true;
    }
    if (changed) {
        try { localStorage.setItem(MM_TYPES_KEY, JSON.stringify(learnt)); } catch (e) { /* private window */ }
    }
    return mmKnownTypes();
}

/** What has been learnt, with its names, for handing back. */
function mmLearntTypes() {
    try {
        const raw = JSON.parse(localStorage.getItem(MM_TYPES_KEY)) || {};
        return Object.fromEntries(Object.entries(raw).map(([id, t]) =>
            [id, Array.isArray(t) ? { caps: t, name: null } : t]));
    } catch (e) {
        return {};
    }
}

/**
 * Vehicles already at the mission or on their way to it.
 *
 * They meet a requirement just as much as one you are about to send, so not
 * subtracting them was the difference between "needs 4 engines" and "needs 4
 * more engines" — and only the second is true once anything has been sent.
 */
function mmOnScene(known) {
    const rows = document.querySelectorAll(
        '#mission_vehicle_at_mission tbody tr[id^="vehicle_row"], '
        + '#mission_vehicle_driving tbody tr[id^="vehicle_row"]');
    const counts = {};
    const vehicles = [];
    let unknown = 0;
    let total = 0;
    for (const row of rows) {
        const typeId = row.querySelector('[vehicle_type_id]')?.getAttribute('vehicle_type_id');
        if (!typeId) continue;
        total += 1;
        const flags = known[typeId];
        if (!flags) { unknown += 1; continue; }
        vehicles.push(flags);
        for (const flag of flags) counts[flag] = (counts[flag] || 0) + 1;
    }
    return { counts, vehicles, unknown, total };
}

/**
 * Read a mission's requirements off the game's own requirements page.
 *
 * `/einsaetze.json` only lists missions this player can generate. An alliance
 * mission started from somebody else's building is not in it, and neither is
 * anything the account has not unlocked — so the catalogue answered "unknown"
 * for exactly the missions worth helping with.
 *
 * Every mission window links to the answer itself: `#mission_help` points at
 * /einsaetze/<type>, which is a plain table of "Required Firetrucks | 5". The
 * labels turn into the keys /einsaetze.json already uses by lowercasing and
 * joining with underscores — "Required Platform Trucks" is `platform_trucks` —
 * so this is the same vocabulary read from a second place, not a second
 * vocabulary. A label that does not turn into a key YMCA knows is carried into
 * the report rather than dropped.
 */
async function mmMissionHelp(typeId, href) {
    const url = href || `/einsaetze/${encodeURIComponent(typeId)}`;
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

    const requirements = {};
    const unread = [];
    let name = null;
    let credits = null;
    let patients = 0;

    const heading = doc.querySelector('h1, h2, .page-header');
    if (heading) name = heading.textContent.trim().split('\n')[0].trim() || null;

    for (const row of doc.querySelectorAll('table tr')) {
        const cells = row.querySelectorAll('td, th');
        if (cells.length < 2) continue;
        const label = cells[0].textContent.trim();
        const value = Number(cells[1].textContent.replace(/[^\d-]/g, ''));
        if (!label || !Number.isFinite(value)) continue;

        if (/^average credits$/i.test(label)) { credits = value; continue; }
        if (/^max\.?\s*patients$/i.test(label)) { patients = value; continue; }

        /* Only the vehicle lines. "Required Fire Stations" is a prerequisite for
         * generating the mission, not something to send, and the two read alike
         * — so stations are named out rather than filtered by guesswork. */
        const m = /^required\s+(.+)$/i.exec(label);
        if (!m) continue;
        const key = m[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '');
        if (/_stations?$/.test(key) || key === 'foam_extensions') continue;
        if (MM_REQUIREMENTS[key]) requirements[key] = value;
        else { requirements[key] = value; unread.push(key); }
    }

    return { name, requirements, average_credits: credits, patients, unread, fromHelpPage: true };
}

/** Only what the panel reads, so the stored catalogue is a fraction of the original. */
function mmShrinkCatalogue(data) {
    const list = Array.isArray(data) ? data : Object.values(data);
    const byId = {};
    for (const m of list) {
        byId[String(m.id)] = {
            name: m.name,
            requirements: m.requirements || {},
            average_credits: m.average_credits || null,
            // Patients are here, not in requirements — the one field that mattered.
            additional: m.additional?.possible_patient
                ? { possible_patient: m.additional.possible_patient }
                : undefined,
        };
    }
    return byId;
}


YMCA.register({
    id: 'missionmagician',
    title: 'MissionMagician',
    tagline: 'Pick the right vehicles',

    description: 'Reads what a mission needs and ticks the vehicles that match. '
        + 'It never dispatches — you press the game\'s own button.',

    async mount(el, ctx) {
        const cfg = ctx.store.read('cfg', { fastestFirst: true });
        const page = mmReadMissionPage();

        if (!page.onMissionPage) {
            el.innerHTML = mmOffMissionHtml();
            mmWireCapture(el, ctx);
            return;
        }

        const plan = await mmPlan(page, ctx, cfg);
        el.innerHTML = mmPlanHtml(plan, page, cfg, ctx);

        el.addEventListener('change', (e) => {
            const key = e.target.dataset.cfg;
            if (!key) return;
            cfg[key] = e.target.checked;
            ctx.store.write('cfg', cfg);
            ctx.open('missionmagician');
        });

        el.addEventListener('click', (e) => {
            if (e.target.closest('[data-do="select"]')) {
                const n = mmSelect(plan.pick);
                ctx.status(`Ticked ${n} vehicles — now press the game's own Dispatch.`);
                ctx.log.info('ticked vehicles', `${n} for mission type ${page.missionType}`);
                el.querySelector('#mm-done').hidden = false;
            } else if (e.target.closest('[data-do="clear"]')) {
                const n = mmClear();
                ctx.status(`Unticked ${n}.`);
                el.querySelector('#mm-done').hidden = true;
            }
        });
    },
});

/* ---------------------------------------------------------- reading the page */

/** What this page is and what it offers, without reading a word of its text. */
function mmReadMissionPage(withFollowUp) {
    const info = document.getElementById('mission_general_info');
    const form = document.getElementById('mission-form');
    const body = document.getElementById('vehicle_show_table_body_all');
    const rows = body ? [...body.querySelectorAll('.vehicle_select_table_tr')] : [];

    /* Follow-up holds vehicles that are already out on another mission and can
     * be redirected to this one. The game loads that tab only when it is
     * opened, so opening it is what makes the rows exist — and it is the game's
     * own tab doing the game's own fetch, not a request built here. */
    let followUp = [];
    if (withFollowUp) {
        followUp = [...document.querySelectorAll(
            '#vehicle_show_table_body_occupied .vehicle_select_table_tr, '
            + '#occupied .vehicle_select_table_tr')];
        if (!followUp.length) document.querySelector('#tabs a[tabload="occupied"]')?.click();
    }

    return {
        onMissionPage: !!(info && form && body),
        inFrame: window.top !== window.self,
        // The type id, which is the key into /einsaetze.json. Not the title.
        missionType: info?.getAttribute('data-mission-type') || null,
        helpHref: document.getElementById('mission_help')?.getAttribute('href')
            || document.getElementById('mission-type-helper-mobile')?.getAttribute('href') || null,
        rows,
        followUpRows: followUp,
        followUpOffered: !!document.querySelector('#tabs a[tabload="occupied"]'),
    };
}

/** A vehicle, described by the attributes the game put on its own checkbox. */
function mmVehicle(row) {
    const box = row.querySelector('.vehicle_checkbox');
    if (!box) return null;
    const num = (name) => {
        const v = box.getAttribute(name);
        return v === null || v === '' ? 0 : Number(v) || 0;
    };
    /* The travel time, not the distance. The game prints it into the fourth cell
     * as `timevalue` in seconds once it has worked the route out, and it is the
     * only honest ordering: a vehicle whose dot sits closer on the map can still
     * arrive later, which is exactly what "fastest vehicle" got wrong. Until the
     * game has filled it in the row falls back to distance, and the panel says
     * when it is doing that. */
    const timed = row.querySelector('[timevalue]');
    const seconds = timed ? Number(timed.getAttribute('timevalue')) : NaN;
    return {
        box,
        id: box.value,
        typeId: num('vehicle_type_id'),
        /* The row says what the type is called and the checkbox says which id it
         * is, on the same row — the only place in the game the two appear
         * together. Everything else has to be told. */
        typeName: row.getAttribute('vehicle_type') || null,
        seconds: Number.isFinite(seconds) ? seconds : null,
        distance: Number(row.getAttribute('data-distance')) || 0,
        water: num('wasser_amount'),
        foam: num('foam_amount_display'),
        /* Everything the game flagged, so a requirement nothing here maps can
         * still be answered from the page's own vocabulary. */
        flags: mmFlagsOn(box),
        has: (flag) => box.getAttribute(flag) === '1',
    };
}

/** Seconds where the game has them, distance as a stand-in where it has not. */
function mmOrder(a, b) {
    if (a.seconds !== null && b.seconds !== null) return a.seconds - b.seconds;
    if (a.seconds !== null) return -1;
    if (b.seconds !== null) return 1;
    return a.distance - b.distance;
}

/* -------------------------------------------------------------- the planning */

/**
 * What this mission needs, and which of the vehicles on screen meet it.
 *
 * The need comes from /einsaetze.json — the game's own list — so the window
 * only has to answer "what is available", which is the one thing the list
 * cannot know.
 */
/**
 * Choose the fewest vehicles that cover everything, without spending the
 * versatile ones on work an ordinary vehicle could do.
 *
 * A Quint is flagged `fire` and `dlk`, a Rescue Engine `fire` and `rw`. Both
 * are worth two requirements at once, and both are scarce; an ordinary pumper
 * is worth one and there are plenty. Filling requirements one at a time in any
 * order gets this wrong in one direction or the other — nearest-first sends
 * Quints as plain engines and empties the ladders, scarcest-first stops as soon
 * as each line is met without asking whether a different vehicle would have
 * done.
 *
 * So the choice is made per vehicle rather than per requirement, and the
 * ordering of the reasons is the whole design:
 *
 *  1. **How much it still covers.** A vehicle answering two outstanding
 *     requirements beats one answering a single requirement, which is what
 *     keeps the total down.
 *  2. **How little else it could have done**, judged on everything it can do
 *     rather than on what this mission asks — a Quint is worth keeping back on
 *     a mission with no ladder line at all, because the next one has one.
 *  3. **How many of its kind are left**, recounted every round, and then **how
 *     often that kind has already been drawn on**. Between two equally useful
 *     kinds these two take turns rather than emptying one of them.
 *  4. **How fast it gets there.** Only once nothing above separates them —
 *     which is why a nearer Quint still stays behind a further pumper.
 */
function mmAllocate(needs, vehicles) {
    const outstanding = new Map(needs.map((n) => [n.key, Math.max(0, n.wanted - n.onScene)]));
    const coversOf = new Map(vehicles.map((v) =>
        [v.id, needs.filter((n) => mmMeets(v, n.rule)).map((n) => n.key)]));
    /* What a vehicle can do in general, not only what this mission happens to
     * ask for. A Quint is worth keeping back even on a mission with no ladder
     * line at all, because the next one will have one. Judging versatility
     * against this mission's needs alone makes a Quint and a pumper look
     * identical, and then the nearer Quint goes.
     *
     * Judged on the flags a requirement can ask for — the ones named above plus
     * whatever this mission's own requirements turned out to want. Not every
     * attribute on the checkbox: the game also writes composites like
     * `road_rescue_or_fire_engine`, and counting those would rank a vehicle by
     * how many ways the game has of describing it. */
    const judged = new Set([...MM_NAMED_FLAGS,
        ...needs.flatMap((n) => n.rule.anyOf || [n.rule.flag])]);
    const capsOf = new Map(vehicles.map((v) =>
        [v.id, [...judged].filter((f) => v.has(f))]));
    const kindOf = (v) => capsOf.get(v.id).join('|');

    const picked = [];
    const taken = new Set();
    const takenOfKind = new Map();

    while ([...outstanding.values()].some((n) => n > 0)) {
        /* Recounted each round: what is left of each kind decides the balance,
         * not what there was to begin with. */
        const left = new Map();
        for (const v of vehicles) {
            if (taken.has(v.id)) continue;
            left.set(kindOf(v), (left.get(kindOf(v)) || 0) + 1);
        }

        let best = null;
        for (const v of vehicles) {
            if (taken.has(v.id)) continue;
            const covers = coversOf.get(v.id);
            const gain = covers.filter((k) => outstanding.get(k) > 0).length;
            if (!gain) continue;
            const score = [
                -gain,                                  // most outstanding work first
                capsOf.get(v.id).length,                // least able to do anything else
                -(left.get(kindOf(v)) || 0),            // commonest kind of those left
                takenOfKind.get(kindOf(v)) || 0,        // then the kind least drawn on so far
                v.seconds === null ? Infinity : v.seconds,
            ];
            if (!best || mmLess(score, best.score)) best = { v, covers, score };
        }
        if (!best) break;                                // nothing left that helps

        taken.add(best.v.id);
        takenOfKind.set(kindOf(best.v), (takenOfKind.get(kindOf(best.v)) || 0) + 1);
        picked.push(best.v);
        for (const k of best.covers) outstanding.set(k, Math.max(0, outstanding.get(k) - 1));
    }
    return picked;
}

/** First difference wins, so the reasons above are strictly in order. */
function mmLess(a, b) {
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return a[i] < b[i];
    }
    return false;
}

async function mmPlan(page, ctx, cfg) {
    let requirements = null;
    let name = null;
    let record = null;
    try {
        /* Kept across page loads. Every mission window is its own load, so the
         * whole catalogue was being refetched each time one opened. */
        const byId = await ctx.gameCached('/einsaetze.json', MM_CATALOGUE_MS, mmShrinkCatalogue);
        record = byId[String(page.missionType)] || null;
        if (record) {
            requirements = record.requirements || {};
            name = record.name;
        }
    } catch (err) {
        ctx.log.warn('could not read the mission list', err.message);
    }

    /* Not in the catalogue: an alliance mission from somebody else's building,
     * or one this account cannot generate. The window links to the answer, so
     * ask it. Kept per type, because it is the same answer every time. */
    if (!record && page.missionType) {
        const key = `mm-help-${page.missionType}`;
        record = ctx.store.read(key, null);
        if (!record) {
            try {
                record = await mmMissionHelp(page.missionType, page.helpHref);
                ctx.store.write(key, record);
                ctx.log.info('read requirements from the mission help page',
                    `type ${page.missionType}${record.unread.length
                        ? `, ${record.unread.length} labels unrecognised` : ''}`);
            } catch (err) {
                ctx.log.warn('mission help page unreadable', err.message);
            }
        }
        if (record) {
            requirements = record.requirements || {};
            name = record.name;
            if (record.unread) for (const k of record.unread) mmRememberUnmatched(k, page.missionType);
        }
    }

    const free = page.rows.map(mmVehicle).filter(Boolean);
    /* A follow-up vehicle is already committed somewhere else, so it goes behind
     * every free one however fast it is — taking it costs another mission. */
    const busy = page.followUpRows.map(mmVehicle).filter(Boolean).map((v) =>
        Object.assign(v, { followUp: true }));
    if (cfg.fastestFirst !== false) { free.sort(mmOrder); busy.sort(mmOrder); }
    const vehicles = free.concat(busy);
    const untimed = vehicles.filter((v) => v.seconds === null).length;
    const scene = mmOnScene(mmLearnTypes(vehicles));
    const patients = mmPatients(record);

    const picked = new Map();
    const lines = [];

    if (requirements) {
        const wants = Object.entries(requirements).filter(([key]) => !MM_AMOUNTS[key]);
        /* Patients are not a requirement key. They want ambulances, so they are
         * counted into the ambulance line rather than shown beside it — one each
         * unless told otherwise. An `ambulances` requirement and the patients
         * are the same ambulances, so the larger of the two stands. */
        if (patients) {
            const perPatient = cfg.ambulancePerPatient === false ? 1 : patients.count;
            const existing = wants.find(([key]) => key === 'ambulances');
            if (existing) existing[1] = Math.max(existing[1], perPatient);
            else wants.push(['patients', perPatient]);
        }

        /* What the game's own words can answer. Every flag on every checkbox in
         * this table, and every flag learnt from any table before it: a HazMat
         * out of range today still taught `hazmat` the day it was in one, and a
         * requirement is no less real for the vehicle being busy. */
        const vocab = new Set(vehicles.flatMap((v) => v.flags));
        for (const caps of Object.values(mmKnownTypes())) for (const f of caps) vocab.add(f);

        const needs = [];
        for (const [key, wanted] of wants) {
            let rule = MM_REQUIREMENTS[key];
            if (!rule) {
                const found = mmDeriveRule(key, vocab);
                if (found) {
                    const label = mmPretty(key);
                    rule = {
                        ...found, label, icon: mmIconFor(key, label),
                        source: `the game flags ${found.derived} on the vehicles that answer it`,
                    };
                }
            }
            if (!rule) {
                lines.push({ key, label: mmPretty(key), wanted, found: null, unmatched: true });
                mmRememberUnmatched(key, page.missionType);
                mmPublishMappedFlags();
                continue;
            }
            const onScene = mmSceneCount(scene, rule);
            /* A shortfall is counted on top of what is there; a total has what
             * is there counted against it. */
            const shortfall = key === 'patients' && patients && patients.total === false;
            needs.push({ key, rule, wanted: shortfall ? wanted + onScene : wanted, onScene });
        }

        for (const v of mmAllocate(needs, vehicles)) picked.set(v.id, v);

        /* `found` starts at what is committed — at the mission or on the way.
         * What the plan *would* send covers nothing; it counts once the boxes
         * are ticked, and mmRecount takes it from there. */
        for (const n of needs) {
            lines.push({
                key: n.key, label: n.rule.label, icon: n.rule.icon, wanted: n.wanted,
                rule: n.rule, onScene: n.onScene, found: n.onScene,
                derived: n.rule.derived || null,
            });
        }

        /* Water and foam are totals, so they are filled by adding vehicles until
         * the figure is reached — the ones already picked may carry some. */
        for (const [key, rule] of Object.entries(MM_AMOUNTS)) {
            const wanted = requirements[key];
            if (!wanted) continue;
            const carried = (v) => (key === 'water_needed' ? v.water : v.foam);
            let have = [...picked.values()].reduce((n, v) => n + carried(v), 0);
            for (const v of vehicles) {
                if (have >= wanted) break;
                if (picked.has(v.id) || !carried(v)) continue;
                picked.set(v.id, v);
                have += carried(v);
            }
            lines.push({
                key, label: rule.label, icon: rule.icon, wanted,
                found: 0, unit: rule.unit, carries: key, onScene: 0,
            });
        }

        // Counts first, then the totals, so the table reads the way the game states it.
        lines.sort((a, b) => Number(!!a.unit) - Number(!!b.unit));
    }

    return {
        name,
        requirements,
        lines,
        pick: [...picked.values()],
        fromHelpPage: !!record?.fromHelpPage,
        available: free.length,
        followUp: busy.length,
        followUpOffered: page.followUpOffered,
        untimed,
        scene,
        patients,
        missionType: page.missionType,
    };
}


/**
 * Keep a note of a requirement nothing could be matched to.
 *
 * It rides out in the one report rather than waiting for somebody to notice the
 * warning in the panel and mention it. Key and mission type only — both are the
 * game's own names for things.
 */
/* Which flags a requirement here already asks for, written where Diagnostics
 * can read it: the report names the flags nothing asks for yet, and whatever
 * answers an unmatched requirement is among them. Diagnostics reads stored
 * state rather than reaching into this module, so it is published rather than
 * imported. */
function mmPublishMappedFlags() {
    try {
        localStorage.setItem('ymca-missionmagician-mappedFlags',
            JSON.stringify(MM_NAMED_FLAGS));
    } catch (e) { /* private window */ }
}

function mmRememberUnmatched(key, missionType) {
    const store = 'ymca-missionmagician-unmatched';
    try {
        const seen = JSON.parse(localStorage.getItem(store)) || [];
        if (seen.some((e) => e.key === key)) return;
        seen.push({ key, firstSeenOnMissionType: Number(missionType) || missionType });
        localStorage.setItem(store, JSON.stringify(seen.slice(-40)));
    } catch (e) { /* private window: the panel still says it */ }
}

/** firetrucks -> Firetrucks, for a requirement with no entry in the map. */
function mmPretty(key) {
    return key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------- the selecting */

/**
 * Tick the game's own checkboxes.
 *
 * A native change event is dispatched because the game listens for one —
 * `$("body").on("change", ".vehicle_checkbox", …)` keeps its counter, its water
 * bar and its AAO state up to date from it. Setting `checked` alone would leave
 * the page showing the player something different from what it would send.
 */
function mmSelect(pick) {
    let n = 0;
    for (const v of pick) {
        if (v.box.checked) continue;
        v.box.checked = true;
        v.box.dispatchEvent(new Event('change', { bubbles: true }));
        n += 1;
    }
    return n;
}

/**
 * Clear the selection the way the game does.
 *
 * Every dispatch order list carries a Reset entry — `.aao[reset="true"]` — and
 * clicking it is the game's own way of putting the selection back, counters,
 * water bar and all. Unticking each box by hand is only the fallback for a
 * window with no dispatch orders on it.
 */
function mmClear() {
    const reset = document.querySelector('.aao[reset="true"]');
    if (reset) {
        reset.click();
        return -1;
    }
    let n = 0;
    for (const box of document.querySelectorAll('.vehicle_checkbox:checked')) {
        box.checked = false;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        n += 1;
    }
    return n;
}

/* ---------------------------------------------------------------- the panels */

function mmPlanHtml(plan, page, cfg, ctx) {
    const rows = plan.lines.map((l) => {
        const enough = l.found !== null && l.found >= l.wanted;
        const state = l.unmatched
            ? '<span class="ymca-warn">not matched yet</span>'
            : `<span class="${enough ? 'ymca-accent' : 'ymca-bad'}">${ctx.fmt(l.found)}${l.unit ? ` ${l.unit}` : ''}</span>`;
        return `<tr>
      <td class="ymca-num" style="width:1%;white-space:nowrap">${ctx.fmt(l.wanted)}${l.unit ? ` ${l.unit}` : ''}</td>
      <td class="ymca-num" style="width:1%">${l.onScene || '<span class="ymca-dim">&ndash;</span>'}</td>
      <td class="ymca-num" style="width:1%;padding-right:10px">${state}</td>
      <td>${ctx.esc(l.label)}${mmIcon(l.icon)}</td></tr>`;
    }).join('');

    const unmatched = plan.lines.filter((l) => l.unmatched);
    const short = plan.lines.filter((l) => !l.unmatched && l.found < l.wanted);

    return `
      <div class="ymca-note"><b>This is also in the mission window itself</b>, at the top of its
        right-hand column.</div>

      <div class="ymca-note"><b>It picks. It does not dispatch.</b> It ticks the game's own
        checkboxes and stops. You press Dispatch.</div>

      <div class="ymca-card">
        <b>${plan.name ? ctx.esc(plan.name) : `Mission type ${ctx.esc(String(page.missionType))}`}</b>
        <p class="ymca-sub" style="margin:4px 0 8px">What this needs, against the
          ${plan.available} vehicles in range.</p>
        ${plan.requirements ? `<table style="margin-top:4px" id="mm-needs">
          <thead><tr><th class="ymca-num">Wanted</th><th class="ymca-num">There</th>
            <th class="ymca-num" style="padding-right:10px">Covered</th><th>Needs</th></tr></thead>
          <tbody>${rows}</tbody></table>`
        : '<p class="ymca-bad">This mission type is not in the game\'s list, so nothing can be planned.</p>'}
      </div>

      ${short.length ? `<div class="ymca-note warn"><b>Not enough on screen.</b>
        ${short.map((l) => ctx.esc(l.label)).join(', ')} — this window is not offering enough of
        them. Widen the range with the game's own km buttons and reopen this.</div>` : ''}

      ${unmatched.length ? `<div class="ymca-note warn"><b>${unmatched.length} requirement${
        unmatched.length > 1 ? 's are' : ' is'} not matched yet:</b>
        ${unmatched.map((l) => ctx.esc(l.label)).join(', ')}. Which checkbox attribute means these
        has not been established, and a guess would tick the wrong vehicle — so they are named here
        and left alone. Send a problem report from a mission needing one and it can be added.</div>` : ''}

      <div class="ymca-card">
        <b>Pick them</b>
        <label style="display:block;margin:4px 0"><input type="checkbox" data-cfg="fastestFirst"
          ${cfg.fastestFirst !== false ? 'checked' : ''}> Fastest first, by travel time</label>
        <button class="ymca-btn primary" data-do="select">Tick ${plan.pick.length} vehicles</button>
        <button class="ymca-btn" data-do="clear">Untick everything</button>
        <div class="ymca-note" id="mm-done" hidden style="margin-top:10px">Ticked.</div>
      </div>`;
}

function mmOffMissionHtml() {
    return `
      <div class="ymca-note"><b>Nothing to do here.</b> MissionMagician puts itself
        <b>inside the mission window</b>, above the game's own missing-vehicle line. Open any
        mission and it is already there — you do not open YMCA for it at all.</div>

      <div class="ymca-card">
        <b>What it does there</b>
        <ul class="ymca-sub" style="margin:6px 0 0;padding-left:20px">
          <li>Lists what the mission needs, from the game's own mission list, against what is in
            range — and keeps the list current as the game works out the travel times.</li>
          <li>One button ticks the vehicles that match, <b>fastest first by travel time</b>, not by
            how close the dot looks on the map.</li>
          <li>It never presses Dispatch. That stays yours.</li>
        </ul>
      </div>

      <div class="ymca-card">
        <b>If it still says this while a mission is open</b>
        <p class="ymca-sub" style="margin:4px 0 10px">This copies the window's structure —
          element, class and field names and the numbers in them. No mission text, addresses or
          player names.</p>
        <button class="ymca-btn" data-do="capture">Capture this mission window</button>
        <span class="ymca-status" id="mm-status"></span>
        <div class="ymca-note warn" id="mm-wrongpage" hidden style="margin-top:10px">
          <b>That was not the mission frame.</b> Nothing was copied, because there was nothing on
          this page worth sending. Open the mission, then open YMCA with the floating button
          <i>inside</i> it, and press this there.</div>
        <textarea id="mm-out" rows="10" readonly style="width:100%;margin-top:10px;
          font-family:ui-monospace,monospace;font-size:11.5px"></textarea>
      </div>`;
}

function mmWireCapture(el, ctx) {
    el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-do="capture"]')) return;
        const out = el.querySelector('#mm-out');
        const report = captureMissionWindow();
        out.value = JSON.stringify(report, null, 1);
        const warn = el.querySelector('#mm-wrongpage');
        warn.hidden = report.looksLikeMissionWindow;
        if (report.looksLikeMissionWindow) {
            ctx.clipboard(out.value, 'the mission window structure');
        } else {
            ctx.status('No mission window on this page — nothing worth sending.');
        }
        ctx.log.info('captured mission window',
            report.looksLikeMissionWindow ? `${report.found.length} selectors found` : 'not on a mission page');
    });
}

/**
 * Describe the mission window without reading its content.
 *
 * Structure is what is needed — which form carries the dispatch, how a vehicle
 * row is marked up, what the alarm control is called. Mission text, street
 * names and player names are not, so they are not taken.
 *
 * The first real capture answered half of it: the dispatch is a plain form with
 * `input[name="vehicle_ids[]"]` checkboxes and an `input[name="commit"]` submit,
 * which is exactly the shape the safe-write rule wants — tick the game's own
 * boxes and submit the game's own form, never build one. What it could not
 * answer is what holds those checkboxes, because the table is not
 * `#vehicle_show_table_body` or `table.vehicle_table`. So this version stops
 * guessing at container names and walks up from a checkbox instead.
 */
function captureMissionWindow() {
    const CANDIDATES = [
        // Confirmed present on a real mission page.
        '#mission_general_info', '#missing_text', '#vehicle_show_table_all',
        '.alert-missing-vehicles', 'input[name="vehicle_ids[]"]', '.aao',
        'input[name="commit"]', '.alert_next', '.vehicle_checkbox',
        // Confirmed absent, kept so a future game change shows up as a diff.
        '.mission_header', '#mission_vehicle_driving', '#vehicle_show_table_body',
        'table.vehicle_table', '#mission_vehicle_amount', '#mission_aao_group',
        'form#vehicle_select', '#vehicle_list',
        // Named by jxn-30/LSS-Scripts, not yet seen on this player's page.
        '#vehicle_show_table_body_all', '.vehicle_select_table_tr', '#mission_alarm_btn',
        '#vehicle_list_step', '.vehicle_checkbox[vehicle_type_id]',
    ];
    const seen = CANDIDATES.filter((sel) => !!document.querySelector(sel));

    const classOf = (el) => (typeof el.className === 'string' ? el.className.trim().slice(0, 120) : '');
    /** Digits out, so an id is reported as a shape rather than as a particular thing. */
    const shapeId = (id) => String(id || '').replace(/\d+/g, '#').slice(0, 48);

    const outline = (el) => (el ? { tag: el.tagName.toLowerCase(), id: shapeId(el.id) || undefined, class: classOf(el) || undefined } : null);

    const checkbox = document.querySelector('input[name="vehicle_ids[]"], .vehicle_checkbox');
    const rowsPresent = document.querySelectorAll('.vehicle_select_table_tr').length
        || document.querySelectorAll('input[name="vehicle_ids[]"]').length;

    /* --- the form that actually dispatches ---
     * Its field names are what a safe write needs: everything unrelated has to
     * survive, so it has to be known what "everything unrelated" is. Names only;
     * a value could be a CSRF token or a caption. */
    // :has() is recent enough that an older browser would throw and take the whole
    // capture with it, and closest() answers this on every page seen so far anyway.
    let form = checkbox?.closest('form') || null;
    if (!form) {
        try {
            form = document.querySelector('form:has(input[name="vehicle_ids[]"])');
        } catch (e) { /* no :has() here */ }
    }
    const dispatchForm = form ? {
        id: shapeId(form.id) || undefined,
        class: classOf(form) || undefined,
        action: (form.getAttribute('action') || '').split('?')[0].replace(/\d+/g, '#'),
        method: form.getAttribute('method') || 'get',
        fieldNames: [...new Set([...form.elements].map((f) => f.name).filter(Boolean))].slice(0, 30),
        submitNames: [...form.querySelectorAll('[type=submit]')].map((b) => b.name || '(unnamed)'),
        checkboxCount: form.querySelectorAll('input[name="vehicle_ids[]"]').length,
    } : 'no form wraps the vehicle checkboxes';

    /* --- what holds a vehicle, found by walking up rather than by guessing --- */
    const chain = [];
    for (let node = checkbox?.parentElement; node && node !== document.body && chain.length < 8; node = node.parentElement) {
        chain.push(outline(node));
        if (node.tagName === 'FORM') break;
    }

    const row = checkbox?.closest('tr') || chain[1] && checkbox?.parentElement?.parentElement || null;
    const describeRow = (el) => (el ? {
        tag: el.tagName.toLowerCase(),
        class: classOf(el) || undefined,
        idShape: shapeId(el.id) || undefined,
        attrs: [...el.attributes].map((a) => a.name),
        // Numbers in attributes are how a row says which vehicle type it is. Text is not taken.
        numericAttrs: Object.fromEntries([...el.attributes]
            .filter((a) => /^-?\d+$/.test(a.value) && a.value.length <= 12)
            .map((a) => [a.name, Number(a.value)])),
        cellCount: el.cells?.length,
        cells: [...(el.cells || el.children)].slice(0, 10).map((c) => ({
            tag: c.tagName.toLowerCase(),
            class: classOf(c) || undefined,
            childTags: [...c.children].slice(0, 5).map((x) => x.tagName.toLowerCase()),
            childClasses: [...c.children].slice(0, 5).map((x) => classOf(x)).filter(Boolean),
        })),
    } : 'no vehicle row found');

    /* --- everything the page marks as mission-ish ---
     * The mission's *type* has to be findable, because that is the key into
     * /einsaetze.json where the requirements and the credit figure already are.
     * Reading the requirements off the page would mean reading its text. */
    const missionHints = [];
    for (const el of document.querySelectorAll('[id*="mission"], [class*="mission"], [data-mission-type-id], [data-mission-id]')) {
        const hint = {
            tag: el.tagName.toLowerCase(),
            idShape: shapeId(el.id) || undefined,
            class: classOf(el) || undefined,
            numericData: Object.fromEntries(Object.entries(el.dataset || {})
                .filter(([, v]) => /^-?\d+$/.test(v) && v.length <= 12)
                .map(([k, v]) => [k, Number(v)])),
        };
        if (!hint.idShape && !hint.class && !Object.keys(hint.numericData).length) continue;
        if (missionHints.some((h) => h.idShape === hint.idShape && h.class === hint.class)) continue;
        missionHints.push(hint);
        if (missionHints.length >= 25) break;
    }

    const aaos = [...document.querySelectorAll('.aao')];

    return {
        note: 'structure only — element, class and field names and the numbers in them. '
            + 'No mission text, addresses, player names or field values.',
        url: location.pathname.replace(/\d+/g, '#'),
        looksLikeMissionWindow: /\/missions?\//.test(location.pathname)
            || !!document.querySelector('#mission_general_info, #missing_text'),
        // On the big map this page is an iframe, so saying which one it is beats guessing later.
        inFrame: window.top !== window.self,
        vehicleRowsPresent: rowsPresent,
        found: seen,
        missing: CANDIDATES.filter((sel) => !seen.includes(sel)),
        dispatchForm,
        vehicleContainerChain: chain,
        vehicleRow: describeRow(row),
        checkbox: checkbox ? {
            name: checkbox.name,
            class: classOf(checkbox),
            idShape: shapeId(checkbox.id) || undefined,
            // The first capture only read data-* and so missed vehicle_type_id, which is a
            // plain attribute. Names and types, not values: data-distance says where you are.
            attributes: [...checkbox.attributes]
                .map((a) => `${a.name}:${/^-?[\d.]+$/.test(a.value) ? 'number' : 'string'}`),
            // The vehicle type is the one value that has to come through, because it is what
            // matches a row against a requirement from /einsaetze.json.
            vehicleTypeId: Number(checkbox.getAttribute('vehicle_type_id')) || null,
        } : 'no vehicle checkbox found',
        aao: aaos.length ? {
            count: aaos.length,
            sample: {
                tag: aaos[0].tagName.toLowerCase(),
                class: classOf(aaos[0]),
                attrs: [...aaos[0].attributes].map((a) => a.name),
                numericData: Object.fromEntries(Object.entries(aaos[0].dataset || {})
                    .filter(([, v]) => /^-?\d+$/.test(v))
                    .map(([k, v]) => [k, Number(v)])),
            },
        } : 'no AAO buttons found',
        missionHints,
        alarmControls: [...document.querySelectorAll('input[type=submit], button[type=submit], .btn-success')]
            .slice(0, 8).map((b) => ({
                tag: b.tagName.toLowerCase(), type: b.type, name: b.name || undefined,
                class: classOf(b).slice(0, 80) || undefined,
                text: (b.value || b.textContent || '').trim().slice(0, 30),
            })),
        patients: mmPatientProbe(),
        requirementBlocks: [...document.querySelectorAll('#missing_text, .missing_text, #mission_general_info')]
            .map((e) => ({
                id: e.id, class: classOf(e),
                childTags: [...e.children].map((c) => c.tagName),
                // Whether the requirement is text or markup decides whether it can be parsed
                // at all, without saying what it says.
                textLength: (e.textContent || '').trim().length,
                hasElementChildren: e.children.length > 0,
            })),
    };
}

/* ======================================================================
 * The panel in the game's own mission window.
 *
 * A tool you have to open a lightbox to reach is a tool you stop using, and
 * the lightbox has the further problem that YMCA's window is built before the
 * mission frame has finished loading — so it read an empty page unless you
 * reloaded it. Living in the window solves both: it is there when the mission
 * is, and it re-reads itself as the game fills the table in.
 *
 * This is the one place a module writes markup outside its own panel, so it
 * writes **no colours of its own**. Everything is the game's own Bootstrap —
 * `panel`, `table`, `btn`, `label` — which means it follows the game into dark
 * mode without YMCA having to know anything about it.
 * ====================================================================== */

const MM_PANEL_ID = 'ymca-mm-panel';

/* The two states the table can be in, said loudly enough to read without
 * looking. Not from the interface probe: the game has no "everything is
 * covered" of its own to match, so these are chosen, and they are the only
 * colours in YMCA that are. */
const MM_RED = '#e74c3c';
const MM_GREEN = '#00bc8c';

/**
 * A switch rather than a tick box.
 *
 * The real checkbox is still there and still what the browser reports — it is
 * moved out of sight rather than replaced, so a click, a label and a keyboard
 * all behave as they did. Only the track and the knob are drawn.
 */
/** How many requirement rows the frame is built for. Below this it does not
 * shrink; above it, the rest scroll. */
const MM_ROWS_SHOWN = 6;

const MM_SWITCH_CSS = `
#${MM_PANEL_ID} .mm-switch{display:inline-flex;align-items:center;gap:7px;
  font-weight:normal;margin:0;cursor:pointer;user-select:none}
#${MM_PANEL_ID} .mm-switch input{position:absolute;opacity:0;width:0;height:0}
#${MM_PANEL_ID} .mm-switch i{position:relative;width:30px;height:16px;flex:0 0 30px;
  border-radius:8px;background:rgba(127,127,127,.5);transition:background .15s}
#${MM_PANEL_ID} .mm-switch i::after{content:"";position:absolute;top:2px;left:2px;
  width:12px;height:12px;border-radius:50%;background:#fff;transition:left .15s}
#${MM_PANEL_ID} .mm-switch input:checked + i{background:${MM_GREEN}}
#${MM_PANEL_ID} .mm-switch input:checked + i::after{left:16px}
#${MM_PANEL_ID} .mm-switch input:focus-visible + i{outline:2px solid currentColor;outline-offset:2px}
#${MM_PANEL_ID} .mm-switch.off{opacity:.55}
#${MM_PANEL_ID} .mm-lock{background:none;border:0;padding:0 2px;line-height:1;opacity:.45;color:inherit}
#${MM_PANEL_ID} .mm-lock.on{opacity:1}

/* The cells are what is painted, not the table. Bootstrap's own table styling
 * and the game's dark theme both set a background on td and th, so colouring
 * the table alone put the colour behind them and nothing showed. */
#${MM_PANEL_ID} .mm-table.mm-short,#${MM_PANEL_ID} .mm-table.mm-ok{color:#fff}
#${MM_PANEL_ID} .mm-table.mm-short td,#${MM_PANEL_ID} .mm-table.mm-short th{
  background-color:${MM_RED}!important;color:#fff!important;border-color:rgba(255,255,255,.25)!important}
#${MM_PANEL_ID} .mm-table.mm-ok td,#${MM_PANEL_ID} .mm-table.mm-ok th{
  background-color:${MM_GREEN}!important;color:#fff!important;border-color:rgba(255,255,255,.25)!important}
#${MM_PANEL_ID} .mm-table.mm-short small,#${MM_PANEL_ID} .mm-table.mm-ok small{color:rgba(255,255,255,.8)}

/* One height, whatever the mission asks for.
 *
 * A panel that grows and shrinks with the requirement count moves the buttons
 * under the cursor between one mission and the next. The frame is ${MM_ROWS_SHOWN}
 * rows tall and stays there: fewer rows leave space below, more rows scroll
 * inside it, and Dispatch never moves. */
#${MM_PANEL_ID} .mm-scroll{position:relative;margin-bottom:8px;
  height:calc(var(--mm-head) + ${MM_ROWS_SHOWN} * var(--mm-row));
  --mm-row:29px;--mm-head:33px;
  overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;
  scrollbar-color:rgba(127,127,127,.55) transparent}
#${MM_PANEL_ID} .mm-scroll::-webkit-scrollbar{width:8px}
#${MM_PANEL_ID} .mm-scroll::-webkit-scrollbar-track{background:transparent}
#${MM_PANEL_ID} .mm-scroll::-webkit-scrollbar-thumb{
  background:rgba(127,127,127,.55);border-radius:4px;
  border:2px solid transparent;background-clip:content-box}
#${MM_PANEL_ID} .mm-scroll:hover::-webkit-scrollbar-thumb{background:rgba(127,127,127,.8);
  background-clip:content-box}
#${MM_PANEL_ID} .mm-scroll .mm-table{margin-bottom:0}
#${MM_PANEL_ID} .mm-scroll thead th{position:sticky;top:0;z-index:1}

/* Only when there is more below: the last rows fade rather than being cut,
 * and the fade lifts as the bottom is reached. Masked, not painted over, so it
 * works on whatever colour the row happens to be. */
#${MM_PANEL_ID} .mm-scroll.mm-more{
  -webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 34px),transparent);
  mask-image:linear-gradient(to bottom,#000 calc(100% - 34px),transparent);
  transition:-webkit-mask-image .2s,mask-image .2s}
#${MM_PANEL_ID} .mm-scroll.mm-more.mm-end{
  -webkit-mask-image:linear-gradient(to bottom,#000 100%,#000);
  mask-image:linear-gradient(to bottom,#000 100%,#000)}

/* The glyphs sit on the text baseline and take its colour. */
#${MM_PANEL_ID} .mm-key{display:inline-block;margin-left:5px;padding:0 5px;border-radius:3px;
  font:600 11px/17px "Helvetica Neue",Helvetica,Arial;text-transform:uppercase;
  background:rgba(255,255,255,.22);box-shadow:inset 0 -1px 0 rgba(0,0,0,.25)}
#${MM_PANEL_ID} .mm-glyph{vertical-align:-2.5px;margin-left:6px;opacity:.8;overflow:visible}
#${MM_PANEL_ID} tr:hover .mm-glyph{opacity:1}`;

function mmSwitch(key, label, on, disabled) {
    return `<label class="mm-switch${on ? '' : ' off'}"${disabled ? ' title="not on this mission"' : ''}>
    <input type="checkbox" data-cfg="${key}"${on ? ' checked' : ''}${disabled ? ' disabled' : ''}>
    <i></i>${label}</label>`;
}

/**
 * Follow-up is a plain switch.
 *
 * It holds vehicles that are out on another mission and can be redirected here,
 * so two missions armed at once can take each other's and leave them driving
 * between. It was guarded against — a claim, a lock, an automatic switch-off
 * after dispatching — and the guard was wrong more often than the thing it
 * guarded against happened. It stays on until it is switched off.
 */
/* The game fills travel times in after the page settles and appends rows when
 * "load missing vehicles" is used, so the panel re-reads rather than assuming
 * the first look was the whole picture. */
const MM_REDRAW_MS = 400;

/* Returns true once the panel is in. Until then the shell tries again as the
 * mission window builds itself, so the panel appears with the markup rather
 * than after the last script on the page has finished loading. */
YMCA.inject('missionmagician', (ctx) => {
    if (!mmReadMissionPage().onMissionPage) return false;
    mmMountPanel(ctx);
    return true;
});

function mmMountPanel(ctx) {
    if (document.getElementById(MM_PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = MM_PANEL_ID;
    panel.className = 'panel panel-default';
    panel.innerHTML = '<div class="panel-body"><i>YMCA is reading this mission…</i></div>';

    if (!document.getElementById('ymca-mm-style')) {
        const style = document.createElement('style');
        style.id = 'ymca-mm-style';
        style.textContent = MM_SWITCH_CSS;
        document.head.append(style);
    }

    /* Top of the right-hand half, which is where LSS-Manager puts its own mission
     * helper. The window is two columns — the dispatch orders on the left and
     * everything else on the right — and this belongs with the everything else.
     * Above the game's missing-vehicle line, then the top of the frame, are the
     * fallbacks for a window laid out differently. */
    const right = document.getElementById('col_right');
    const missing = document.getElementById('missing_text');
    if (right) right.prepend(panel);
    else if (missing) missing.parentNode.insertBefore(panel, missing);
    else document.getElementById('iframe-inside-container')?.prepend(panel);

    let timer = null;
    let lastPlan = null;
    /* Drawing waits on the catalogue and sometimes on the mission's own
     * requirements page, so two draws can be in flight at once and the slower —
     * older — one can land last and put a stale plan on screen. Only the newest
     * is allowed to render. */
    let drawing = 0;
    const draw = async () => {
        const mine = (drawing += 1);
        const cfg = ctx.store.read('cfg', { fastestFirst: true });
        /* Another mission holding follow-up means its tab is not opened here
         * either: the guard is on what gets read, not only on the switch. */
        const page = mmReadMissionPage(cfg.followUp === true);
        if (!page.onMissionPage) return;
        const plan = await mmPlan(page, ctx, cfg);
        if (mine !== drawing) return;
        panel.dataset.pick = plan.pick.map((v) => v.id).join(',');
        panel.dataset.type = String(plan.missionType || '');
        plan.surplus = mmSurplus(plan);
        lastPlan = plan;
        panel.innerHTML = mmGamePanelHtml(plan, cfg, ctx);
        mmRecount(panel, plan);
        mmWatchScroll(panel);
    };
    const redraw = () => {
        clearTimeout(timer);
        timer = setTimeout(() => { draw(); }, MM_REDRAW_MS);
    };

    const tick = () => {
        const ids = (panel.dataset.pick || '').split(',').filter(Boolean);
        const n = mmSelectIds(ids);
        ctx.log.info('ticked vehicles', `${n} in the mission window`);
        const done = panel.querySelector('#mm-panel-done');
        if (done) done.hidden = false;
    };

    /* D ticks. The game's own dispatch orders are on single letters too, so this
     * stays out of the way of anything being typed and of any chord — a D with
     * a modifier is a browser shortcut, not a dispatch. */
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'd' && e.key !== 'D') return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const on = e.target;
        if (on && (on.isContentEditable || /^(input|textarea|select)$/i.test(on.tagName))) return;
        if (!document.getElementById(MM_PANEL_ID)) return;
        e.preventDefault();
        tick();
        ctx.status?.('Ticked.');
    });

    panel.addEventListener('click', (e) => {
        if (e.target.closest('[data-do="select"]')) {
            tick();
        } else if (e.target.closest('[data-do="clear"]')) {
            mmClear();
            const done = panel.querySelector('#mm-panel-done');
            if (done) done.hidden = true;
        } else if (e.target.closest('[data-do="report"]')) {
            mmCopyState(ctx, lastPlan, panel);
        } else if (e.target.closest('[data-do="type"]')) {
            mmCopyType(ctx, panel.dataset.type);
        } else if (e.target.closest('[data-do="cancel"]')) {
            /* This one writes to the account, so it says exactly what it will do
             * and waits to be told yes. It is undoable in the only way that
             * matters here — the vehicles can be sent again — and it clicks the
             * game's own send-back button rather than posting anything. */
            const drop = mmSurplus(lastPlan);
            if (!drop.length) { ctx.status('Nothing is spare.'); return; }
            const ok = confirm(`Send ${drop.length} vehicle${drop.length > 1 ? 's' : ''} back?\n\n`
                + 'Every requirement was checked again after each one, so what is left still '
                + 'covers the mission. They can be alarmed again afterwards.');
            if (!ok) return;
            for (const v of drop) v.back.click();
            ctx.log.info('sent back', `${drop.length} surplus vehicles`);
            ctx.status(`Sent ${drop.length} back.`);
        }
    });

    panel.addEventListener('change', (e) => {
        const key = e.target.dataset.cfg;
        if (!['fastestFirst', 'ambulancePerPatient', 'followUp'].includes(key)) return;
        const cfg = ctx.store.read('cfg', {});
        cfg[key] = e.target.checked;
        ctx.store.write('cfg', cfg);
        draw();
    });

    /* Watch the whole mission, not only the selection table. Rows arriving and
     * travel times landing are one half; a vehicle reaching the mission is the
     * other, and that turns up in a different table entirely — which is how a
     * panel that only watched the selection list ended up showing a plan made
     * before anything had been sent.
     *
     * Its own writes are skipped, or rendering would trigger another render. */
    /* Follow-up takes vehicles off other missions, so it is a decision for one
     * alarm rather than a setting. It switches itself off once the alarm goes,
     * unless the lock beside it says otherwise.
     *
     * Only one of the game's five ways to dispatch submits the form. `Dispatch`
     * is `input[name="commit"]` inside `#mission-form`; `Dispatch and Next`
     * (`.alert_next`), the alliance one that shares as it goes
     * (`.alert_next_alliance`) and both navbar buttons (`#mission_alarm_btn`,
     * `#mission_alarm_btn_mobile`) are all `<a href="#">` that post by
     * themselves. Watching the submit alone left follow-up on through every
     * one of them.
     *
     * The click is only listened to, never taken over: the capture phase runs
     * before the game's own handler and nothing here touches the event, so the
     * dispatch goes exactly as it would. Switching off is the safe direction
     * anyway — the lock is what makes it stay on. */

    /* The game fires change on every box it ticks, its dispatch orders included,
     * so this catches the player's clicks and YMCA's alike. */
    document.addEventListener('change', (e) => {
        if (e.target?.classList?.contains('vehicle_checkbox')) mmRecount(panel, lastPlan);
    });

    const watched = document.getElementById('iframe-inside-container') || document.body;
    new MutationObserver((records) => {
        for (const rec of records) {
            if (rec.target instanceof Node && panel.contains(rec.target)) continue;
            redraw();
            return;
        }
    }).observe(watched, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['timevalue'],
    });
    draw();
    ctx.log.info('panel placed in the mission window');
}

/** Tick by id, so the panel survives the game re-sorting its own table. */
function mmSelectIds(ids) {
    let n = 0;
    for (const id of ids) {
        const box = document.getElementById(`vehicle_checkbox_${id}`);
        if (!box || box.checked) continue;
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        n += 1;
    }
    return n;
}

/**
 * The panel, in the game's own clothes.
 *
 * No colour is chosen here. `label-success` and `label-danger` are the game's,
 * so a met requirement and a short one read the same as everywhere else in it.
 */
/**
 * Which vehicles at the mission are surplus.
 *
 * Not "more than the requirement asks for" — that is the trap. A Quint at the
 * mission may be the only thing covering the ladder *and* one of the engines,
 * so removing it looks safe against the engine count and is not. The only
 * honest test is to take one away and check every requirement again, which is
 * what this does: try each candidate, keep the removal only if everything is
 * still met afterwards, and carry that forward so two removals are checked
 * together rather than each against the full set.
 *
 * Slowest first, so what is given back is what would have arrived last.
 */
function mmSurplus(plan) {
    const known = mmKnownTypes();
    const here = [];
    const rows = document.querySelectorAll(
        '#mission_vehicle_at_mission tbody tr[id^="vehicle_row"], '
        + '#mission_vehicle_driving tbody tr[id^="vehicle_row"]');
    for (const row of rows) {
        const back = row.querySelector('.btn-backalarm-ajax');
        const typeId = row.querySelector('[vehicle_type_id]')?.getAttribute('vehicle_type_id');
        // Without a way to send it back, or without knowing what it covers, leave it alone.
        if (!back || !typeId || !known[typeId]) continue;
        here.push({ back, typeId, flags: known[typeId] });
    }
    if (!here.length) return [];

    /* Only requirements that can be judged. An unmatched one is unknown, and
     * nothing is sent back on the strength of a requirement nobody can check. */
    const checks = plan.lines
        .filter((l) => !l.unmatched && !l.unit && l.rule)
        .map((l) => ({ wanted: l.wanted, rule: l.rule }));
    if (!checks.length) return [];

    const covers = (flags, rule) => (rule.anyOf
        ? rule.anyOf.some((f) => flags.includes(f))
        : flags.includes(rule.flag));

    /* A vehicle whose abilities no requirement here judges is not surplus, it is
     * unaccounted for. An ambulance on a call whose patients went undetected has
     * no ambulance line to be measured against, and sending it away because
     * nothing asked for it is exactly the wrong reading. */
    const judged = new Set(checks.flatMap(({ rule }) => rule.anyOf || [rule.flag]));
    /* Judged against the flags a requirement can ask for. The game also writes
     * composites of its own — `road_rescue_or_fire_engine`, `ktw_or_rtw` — and
     * counting those as unaccounted-for would mean nothing is ever spare. */
    const meaningful = new Set([...MM_NAMED_FLAGS, ...judged]);
    const accountable = (v) =>
        v.flags.filter((f) => meaningful.has(f)).every((f) => judged.has(f));
    const met = (kept) => checks.every(({ wanted, rule }) =>
        kept.filter((v) => covers(v.flags, rule)).length >= wanted);

    if (!met(here)) return [];   // already short — nothing is spare

    let kept = here.slice();
    const drop = [];
    for (let i = here.length - 1; i >= 0; i -= 1) {
        if (!accountable(here[i])) continue;
        const without = kept.filter((v) => v !== here[i]);
        if (!met(without)) continue;
        kept = without;
        drop.push(here[i]);
    }
    return drop;
}

/**
 * Recount what is covered, from the boxes as they stand.
 *
 * Covered is what is committed: at the mission, on the way, or ticked. Not what
 * the plan would send — a plan nobody has acted on covers nothing, and a row
 * reading "covered" before a single box is ticked says nothing at all.
 *
 * Driven by the game's own change event, so ticking or unticking moves the
 * numbers without a redraw, whether it was YMCA or the player who did it.
 */
/** The fade lifts once the last row is in view, so nothing looks cut off when
 * there is nothing left below. */
function mmWatchScroll(panel) {
    const box = panel.querySelector('.mm-scroll');
    if (!box) return;
    const mark = () => {
        const end = box.scrollTop + box.clientHeight >= box.scrollHeight - 2;
        box.classList.toggle('mm-end', end);
    };
    box.addEventListener('scroll', mark, { passive: true });
    mark();
}

function mmRecount(panel, plan) {
    if (!plan || !plan.lines) return;
    const ticked = [...document.querySelectorAll('.vehicle_checkbox:checked')].map((box) => ({
        has: (flag) => box.getAttribute(flag) === '1',
        water: Number(box.getAttribute('wasser_amount')) || 0,
        foam: Number(box.getAttribute('foam_amount_display')) || 0,
    }));

    let allMet = true;
    let judged = false;
    for (const line of plan.lines) {
        if (line.unmatched) continue;
        judged = true;
        const byTick = line.unit
            ? ticked.reduce((n2, v) => n2 + (line.carries === 'water_needed' ? v.water : v.foam), 0)
            : ticked.filter((v) => mmMeets(v, line.rule)).length;
        line.ticked = byTick;
        line.found = line.onScene + byTick;
        if (line.found < line.wanted) allMet = false;

        const show = (attr, value) => {
            const cell = panel.querySelector(`[data-${attr}="${line.key}"]`);
            if (cell) cell.textContent = line.unit ? `${value} ${line.unit}` : String(value);
        };
        show('ticked', byTick);
        show('covered', line.found);
    }

    /* The table is the surface with the answer on it, so it carries the answer:
     * red while anything is short, green once nothing is. */
    const table = panel.querySelector('.mm-table');
    if (table) {
        table.classList.toggle('mm-short', judged && !allMet);
        table.classList.toggle('mm-ok', judged && allMet);
    }
}

/**
 * Hand back what this panel is looking at.
 *
 * So a mission it cannot plan does not need the player to describe it: the
 * type, where the requirements came from, what was read and what was not, and
 * what is in range. Mission type ids and counts — the game's own constants —
 * and no mission text, addresses or names.
 */
/**
 * The shape of the two tables that only exist once something is happening.
 *
 * A vehicle already at a mission has no checkbox, so what it covers is looked
 * up by type — which is why an unowned type cannot be judged. Whether that is
 * actually necessary depends on what the game writes on those rows, and this
 * is that question asked once, of the real page.
 */
function mmTableShapes() {
    const shapes = {};
    for (const id of ['mission_vehicle_at_mission', 'mission_vehicle_driving',
        'vehicle_show_table_body_occupied']) {
        const table = document.getElementById(id);
        if (!table) { shapes[id] = 'not on this page'; continue; }
        const row = table.querySelector('tr[id^="vehicle_row"], tr.vehicle_select_table_tr, tbody tr');
        if (!row) { shapes[id] = 'present, no rows'; continue; }
        shapes[id] = {
            rowAttributes: [...row.attributes].map((a) =>
                `${a.name}=${/^\d+$/.test(a.value) ? '#' : a.value.slice(0, 12)}`),
            cells: [...row.cells].map((td) => ({
                classes: td.className || null,
                attributes: [...td.attributes].map((a) => a.name),
                controls: [...td.querySelectorAll('a,button,input')]
                    .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.trim()),
            })),
        };
    }
    return shapes;
}

async function mmCopyState(ctx, plan, panel) {
    const page = mmReadMissionPage(false);
    const state = {
        note: 'mission type ids, counts and requirement keys only',
        ymca: YMCA.version,
        missionType: page.missionType,
        helpHref: page.helpHref ? page.helpHref.replace(/\d+/g, '#') : null,
        planned: !!plan?.requirements,
        requirementKeys: plan?.requirements ? Object.keys(plan.requirements) : [],
        source: plan?.fromHelpPage ? 'mission help page' : 'einsaetze.json',
        lines: (plan?.lines || []).map((l) => ({
            key: l.key, wanted: l.wanted, there: l.onScene, ticked: l.ticked, unmatched: !!l.unmatched,
        })),
        patients: mmPatientProbe(),
        vehiclesInRange: page.rows.length,
        followUpTabPresent: page.followUpOffered,
        vehicleTypesLearnt: Object.keys(mmKnownTypes()).length,
        /* The types themselves, not just how many. A count cannot be added to
         * data/vehicle-types.json, and this is the button that gets pressed —
         * it is in the mission window, where the question comes up. Type ids,
         * names and flag names; nothing about the vehicles carrying them. */
        capabilitiesByType: mmKnownTypes(),
        typeNames: Object.fromEntries(Object.entries(mmLearntTypes())
            .filter(([, t]) => t.name).map(([id, t]) => [id, t.name])),
        /* Which of them this repo does not ship, so the gap is the answer
         * rather than something to work out by comparing two lists. */
        notInDataset: Object.keys(mmKnownTypes())
            .filter((id) => !MM_SHIPPED_TYPES[id]?.capabilities)
            .map(Number).sort((a, b) => a - b),
        panelPlaced: !!panel,
        /* The two tables nothing here has ever seen with something in them:
         * what is at the mission, and what the follow-up tab offers. If either
         * carries the capability flags the way a selection checkbox does, a
         * vehicle nobody owns can be counted without owning one. Attribute and
         * class names only — no captions, no addresses, no player names. */
        tablesNotSeenYet: mmTableShapes(),
    };
    await ctx.clipboard(JSON.stringify(state, null, 1), 'what this panel is seeing');
}

/**
 * Hand back one mission type, complete.
 *
 * A mission *type* is the game's static catalogue — no player, no place, no
 * instance of anything — so the whole record can go back as it is, and that is
 * what settles a requirement nobody has matched a vehicle attribute to yet.
 */
async function mmCopyType(ctx, typeId) {
    try {
        const missions = await ctx.rawGame('/einsaetze.json');
        const list = Array.isArray(missions) ? missions : Object.values(missions);
        const record = list.find((m) => String(m.id) === String(typeId));
        if (!record) { ctx.status('That mission type is not in the list.'); return; }
        await ctx.clipboard(JSON.stringify(record, null, 1), 'this mission type, complete');
        ctx.log.info('copied mission type', String(typeId));
    } catch (err) {
        ctx.status('Could not read the mission list.');
        ctx.log.warn('copy mission type failed', err.message);
    }
}


function mmGamePanelHtml(plan, cfg, ctx) {
    if (!plan.requirements) {
        return `<div class="panel-body">
      <b>YMCA</b> — this mission's requirements could not be read, from the game's own list or
      from its requirements page.
      <button type="button" class="btn btn-default btn-xs" data-do="report">Copy what happened</button>
    </div>`;
    }

    const rows = plan.lines.map((l) => {
        // mmRecount fills this and keeps it filled, so it is never rendered stale.
        const cell = l.unmatched
            ? '?'
            : `<span data-covered="${ctx.esc(l.key)}">0</span>`;
        const num = 'text-right" style="width:1%;white-space:nowrap';
        return `<tr>
      <td class="${num}">${ctx.fmt(l.wanted)}${l.unit ? ` ${l.unit}` : ''}</td>
      <td class="${num}">${l.onScene || '&ndash;'}</td>
      <td class="${num}" data-ticked="${ctx.esc(l.key)}">0</td>
      <td class="${num};padding-right:10px"><b>${cell}</b></td>
      <td>${ctx.esc(l.label)}${mmIcon(l.icon)}${
    l.key === 'patients' && plan.patients
        ? `<small> &middot; ${plan.patients.count} patient${
            plan.patients.count > 1 ? 's' : ''}</small>` : ''}${
    /* Nothing here maps this one; the flag was read off the checkboxes in this
     * very table. It counts the same, and it says which it is. */
    l.derived ? `<small title="matched on the game's own ${ctx.esc(l.derived)} flag,
        read from this table"> &middot; read from the page</small>` : ''}</td></tr>`;
    }).join('');

    const unmatched = plan.lines.filter((l) => l.unmatched);

    return `
    <div class="panel-heading">
      <b>YMCA</b> — what this mission needs
      ${plan.name ? `<small> · ${ctx.esc(plan.name)}</small>` : ''}
    </div>
    <div class="panel-body">
      <div class="mm-scroll${plan.lines.length > MM_ROWS_SHOWN ? ' mm-more' : ''}">
        <table class="table table-condensed mm-table">
          <thead><tr>
            <th class="text-right">Wanted</th>
            <th class="text-right" title="already at the mission or on the way">There</th>
            <th class="text-right" title="ticked, not yet dispatched">Ticked</th>
            <th class="text-right" style="padding-right:10px">Covered</th>
            <th>Needs</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      ${plan.scene.total ? `<p class="text-muted" style="margin:0 0 8px">
        ${plan.scene.total} already at the mission or on the way, subtracted above${
        plan.scene.unknown ? ` — except ${plan.scene.unknown} whose type has not been seen in a
        selection list yet, so what they cover is not known` : ''}.</p>` : ''}

      ${unmatched.length ? `<div class="alert alert-warning" style="padding:6px 10px">
        <b>Left alone:</b> ${unmatched.map((l) => ctx.esc(l.label)).join(', ')}.
        <button type="button" class="btn btn-xs btn-default" data-do="type">Copy this mission
          type</button> to have it added.</div>` : ''}

      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px">
        ${mmSwitch('fastestFirst', 'Fastest first', cfg.fastestFirst !== false)}
        ${mmSwitch('ambulancePerPatient', 'Ambulance per patient', cfg.ambulancePerPatient !== false)}
        <span style="display:inline-flex;align-items:center;gap:4px">
          ${mmSwitch('followUp', `Follow-up${plan.followUp ? ` (${plan.followUp})` : ''}`,
        cfg.followUp === true, !plan.followUpOffered)}
        </span>
        <span style="flex:1 1 auto"></span>
        ${plan.surplus.length ? `<button type="button" class="btn btn-warning btn-sm"
          data-do="cancel">Cancel ${plan.surplus.length} unused</button>` : ''}
        <button type="button" class="btn btn-success btn-sm" data-do="select"
          title="or press D">Tick ${plan.pick.length} vehicles <kbd class="mm-key">d</kbd></button>
        <button type="button" class="btn btn-default btn-sm" data-do="clear">Untick everything</button>
        <button type="button" class="btn btn-default btn-sm" data-do="report"
          title="copy what this panel is seeing">&#8942;</button>
      </div>
      ${plan.untimed ? `<small class="text-muted">${plan.untimed} of ${plan.available}
        have no travel time yet, ordered by distance until the game works them out</small>` : ''}
      <div class="alert alert-info" id="mm-panel-done" hidden style="padding:6px 10px;margin:8px 0 0">
        Ticked.</div>
    </div>`;
}
