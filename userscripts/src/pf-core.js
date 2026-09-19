/* The Pathfinder's shared surface inside YMCA.
 *
 * The algorithm above this point is the same source the static app and the
 * tests use; the build inlines it rather than keeping a second copy that could
 * drift. This file only adapts it to live game data. */
const PF = {
    PRICES: __PRICES__,
    parseMissions, extensionDepartments, ladder, annotate, milestones,
    nextPurchases, ceiling, canSpawn, priceEntry,

    /** /einsaetze.json -> the dataset shape the planner reads. */
    buildDataset(raw) {
        return build(raw);
    },

    /** /api/buildings -> owned stations and finished extensions. */
    stateFromBuildings(buildings) {
        return stateFromExport({ endpoints: { buildings: { data: buildings } } });
    },

    /** "6x fire, 2x Foam Extension" for a rung. */
    needsText(rung) {
        const parts = [];
        const labels = { fire: 'fire', ems: 'ambulance', police: 'police' };
        for (const d of ['fire', 'ems', 'police']) {
            const n = rung.shortfall.stations[d];
            if (n) parts.push(`${n}× ${labels[d]} station`);
        }
        for (const [k, n] of Object.entries(rung.shortfall.ext)) parts.push(`${n}× ${k}`);
        return parts.join(' · ') || '—';
    },
};
