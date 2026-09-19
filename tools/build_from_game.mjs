/**
 * Build data/missions.json from the game's own /einsaetze.json.
 *
 * This replaces the print-to-PDF route (src/parse_pdf.py). The game serves the
 * mission list as structured JSON with the requirements already machine
 * readable, so nothing has to be reconstructed from a printed table.
 *
 * Get the input with the renamer userscript: Data for Claude -> Download
 * mission list. Then:
 *
 *   node tools/build_from_game.mjs <einsaetze-slim.json>
 *
 * The prerequisite keys the game uses (brush_extension, fire_investigation_count)
 * are mapped onto the names data/prices.json is keyed by. That mapping was not
 * guessed: every entry was derived by matching the old dataset against this one
 * on distinct mission names, in both directions, and accepted only where the
 * required COUNTS were identical on every shared mission. See PREREQ_MAP.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** Game prerequisite key -> the name data/prices.json uses. */
export const PREREQ_MAP = {
    airport: 'Airport Extension',
    atf_count: 'ATF Expansion',
    bomb_disposal_count: 'Bomb Squad Extension or Federal Police Station',
    brush_air_command: 'Wildland Air Command Extension',
    brush_command: 'Wildland Commando Extension',
    brush_extension: 'Forestry Expansion',
    coastal_helicopter_count: 'Coastal Helicopter Hangar',
    coastal_plane_count: 'Coastal Plane Hangar',
    coastal_rescue_count: 'Coastal Rescue Station',
    coastal_rescue_small_count: 'Lifeguard Post or Coastal Rescue Station',
    container: 'Container Slot',
    dea_count: 'DEA Expansion',
    detention_unit_count: 'Detention Unit Extension',
    disaster_response_count: 'Disaster Response Extension',
    federalpolice_stations: 'Federal Police Station',
    fire_aviation_count: 'Firefighting Plane Station',
    fire_boat_docks: 'Fire Boat Dock',
    fire_crane_equipment: 'Fire Crane Equipment',
    fire_investigation_count: "Fire Marshal's Office",
    fire_support_count: 'Foam Extension',
    game_warden_count: 'Game Warden Expansion',
    mountain_lift: 'Sked Equipment',
    mountain_lift_2: 'Litter Equipment',
    mountain_rescue: 'Mountain Rescue Station',
    police_drone: 'Police Drone Equipment',
    police_helicopter_stations: 'Police Helicopter Station',
    rescue_boat_docks: 'Rescue Boat Dock',
    riot_police: 'Riot Police Extension',
    search_and_rescue_equipment: 'Search and Rescue Equipment',
    smoke_jumper: 'Smoke Jumper Team',
    technical_rescue_equipment: 'Technical Rescue Equipment',
    tow_trucks: 'Tow Truck Station',
    tow_trucks_large: 'Rotator Truck Extension',
    traffic_police: 'Traffic Police Extension',
    water_damage_pump_count: 'Flood Control Extension',
    water_police_count: 'Water Police Extension',
    wasserrettung: 'Water Rescue Extension',
};

/** Keys that are not extensions and are handled on their own. */
const STRUCTURAL = new Set([
    'main_building',        // the building type that spawns the mission
    'fire_stations', 'police_stations', 'rescue_stations',
    'max_police_stations',  // a cap, not something to buy
    'personnel_educations', // training, not a building
]);

/**
 * Which path a mission belongs to, from the game's own filter, not a heuristic.
 * Previously this was derived from which station count was highest, which is a
 * guess about intent; filter_id is the game saying which station list the
 * mission appears under.
 */
const PATH_BY_FILTER = {
    firehouse_missions: 'F',
    tow_trucks_missions: 'F',
    police_station_missions: 'P',
    federal_police_missions: 'P',
    riot_police_missions: 'P',
    water_watch_missions: 'P',
    ambulance_station_missions: 'E',
    coastal_rescue_missions: 'E',
    mountain_missions: 'E',
};

function pathOf(m) {
    const byFilter = PATH_BY_FILTER[m.filter_id];
    if (byFilter) return byFilter;
    // Fall back to the old rule so an unknown filter never drops a mission.
    const f = m.prerequisites?.fire_stations || 0;
    const p = m.prerequisites?.police_stations || 0;
    const e = m.prerequisites?.rescue_stations || 0;
    if (p >= f && p >= e && p > 0) return 'P';
    if (e >= f && e >= p && e > 0) return 'E';
    return 'F';
}

export function build(raw) {
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    const extNames = new Set();
    const unknownKeys = new Map();

    const rows = list.map((m) => {
        const pre = m.prerequisites || {};
        const extras = {};
        for (const [key, n] of Object.entries(pre)) {
            if (STRUCTURAL.has(key)) continue;
            const name = PREREQ_MAP[key];
            if (!name) {
                unknownKeys.set(key, (unknownKeys.get(key) || 0) + 1);
                continue;
            }
            if (n > 0) {
                extras[name] = n;
                extNames.add(name);
            }
        }
        return [
            m.name,
            m.average_credits || null,
            pre.fire_stations || 0,
            pre.rescue_stations || 0,
            pre.police_stations || 0,
            extras,
            (m.place || []).join(', '),
            (m.categories || []).join(' '),
            m.requirements || {},          // new: the vehicles it needs
            pre.main_building ?? null,     // new: the building type that spawns it
        ];
    });

    return {
        ext: [...extNames].sort(),
        m: rows,
        p: list.map(pathOf).join(''),
        unknownKeys: Object.fromEntries(unknownKeys),
    };
}

// --- CLI ONLY BELOW (the YMCA bundle cuts here) ---
const input = process.argv[2];
if (input) {
    const raw = JSON.parse(readFileSync(input, 'utf8'));
    const out = build(raw);
    const { unknownKeys, ...data } = out;
    writeFileSync(new URL('../data/missions.json', import.meta.url),
        JSON.stringify(data));
    const counts = { F: 0, P: 0, E: 0 };
    for (const c of data.p) counts[c]++;
    console.log(`${data.m.length} missions written`);
    console.log(`  paths: ${counts.F} fire, ${counts.P} police, ${counts.E} ambulance`);
    console.log(`  extensions referenced: ${data.ext.length}`);
    console.log(`  without a credit value: ${data.m.filter((r) => r[1] == null).length}`);
    if (Object.keys(unknownKeys).length) {
        console.log('  UNMAPPED prerequisite keys (dropped):', unknownKeys);
    }
}
