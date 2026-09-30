// Turn a game export into the state the planner works on.
//
// The export comes from the renamer userscript: Data for Claude -> Download
// everything. Nothing here is hardcoded to one account: the department a
// building belongs to is read from what the game says it generates, not from a
// table of building-type ids.

/** `#<Set: {:fire}>` -> `['fire']`. The game serialises a Ruby Set into the JSON. */
export function parseGeneratedCategories(value) {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value !== 'string') return [];
    const inner = value.match(/\{(.*)\}/)?.[1] ?? '';
    return inner.split(',').map((s) => s.trim().replace(/^:/, '')).filter(Boolean);
}

const DEPT_BY_CATEGORY = { fire: 'fire', ambulance: 'ems', police: 'police' };

/**
 * Which of the planner's three departments a building counts toward, or null
 * for one that generates nothing (dispatch centres, academies, prisons).
 */
export function departmentOf(building) {
    for (const cat of parseGeneratedCategories(building.generates_mission_categories)) {
        if (DEPT_BY_CATEGORY[cat]) return DEPT_BY_CATEGORY[cat];
    }
    return null;
}

/**
 * An extension is counted as owned only once it is finished.
 *
 * ASSUMPTION: `available: false` with `available_at` in the future means still
 * under construction. Every extension in the first export read that way, all
 * with future timestamps, and pairs on one station were exactly 7 days apart —
 * consistent with a build queue. If it turns out to mean something else, this
 * is the one place to change.
 */
export function extensionState(extension, now = new Date()) {
    if (extension.available === true) return 'ready';
    if (extension.available_at && new Date(extension.available_at) > now) return 'building';
    return 'ready';
}

/** Read an export into the planner's owned state, plus what it could not use. */
export function stateFromExport(exported, now = new Date()) {
    const endpoints = exported?.endpoints ?? {};
    const buildings = endpoints.buildings?.data ?? [];
    const vehicles = endpoints.vehicles?.data ?? [];
    const credits = endpoints.credits?.data ?? null;
    const warnings = [];

    if (!buildings.length) warnings.push('The export contains no buildings.');

    const state = { fire: 0, ems: 0, police: 0, ext: {} };
    const pending = {};
    const unknownBuildings = [];

    for (const b of buildings) {
        const dept = departmentOf(b);
        if (dept) state[dept] += 1;
        else unknownBuildings.push({ caption: b.caption, building_type: b.building_type });

        for (const e of b.extensions ?? []) {
            if (!e.caption) continue;
            if (extensionState(e, now) === 'ready') {
                state.ext[e.caption] = (state.ext[e.caption] || 0) + 1;
            } else {
                pending[e.caption] = (pending[e.caption] || 0) + 1;
            }
        }
    }

    const vehiclesPerStation = {};
    for (const v of vehicles) {
        vehiclesPerStation[v.building_id] = (vehiclesPerStation[v.building_id] || 0) + 1;
    }
    const unstaffed = buildings
        .filter((b) => departmentOf(b) && !vehiclesPerStation[b.id])
        .map((b) => b.caption);

    return {
        state,
        pending,
        credits: credits?.credits_user_current ?? null,
        rank: credits?.user_level_title ?? null,
        counts: {
            buildings: buildings.length,
            vehicles: vehicles.length,
            smallStations: buildings.filter((b) => b.small_building).length,
        },
        unstaffed,
        nonGenerating: unknownBuildings,
        warnings,
        fetchedAt: exported?.fetchedAt ?? null,
    };
}

/** Extensions the game named that the price table does not know. */
export function unpricedExtensions(imported, prices) {
    const known = new Set(Object.keys(prices.extensions ?? {}));
    const seen = new Set([...Object.keys(imported.state.ext), ...Object.keys(imported.pending)]);
    return [...seen].filter((name) => !known.has(name));
}
