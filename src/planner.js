// Pathfinder — the ladder and milestone computation.
// Pure functions, no DOM, no globals. Shared by the browser app and the tests.
// Ported from docs/ALGORITHM.md; the presentation layer follows docs/MILESTONES.md.

export const TRUSTED_SOURCES = new Set(['build_menu', 'player_report']);

// A rung whose marginal return is below this is on the frontier only because
// nothing cheaper beats it. docs/MILESTONES.md calls it a trap rung.
export const TRAP_GAIN_PER_100K = 400;

// Below this share of own-department spend a rung is a cross-department detour.
export const DETOUR_OWN_SHARE = 0.5;

const DEPTS = ['fire', 'ems', 'police'];

/** missions.json rows are positional; name them once, here. */
export function parseMissions(data) {
  return data.m.map((row, i) => ({
    index: i,
    name: row[0],
    credits: row[1],
    fire: row[2],
    ems: row[3],
    police: row[4],
    extras: row[5] || {},
    poi: row[6] || '',
    type: row[7] || '',
    path: data.p[i],
  }));
}

/**
 * Which department an extension hangs off, derived from the station mix of the
 * missions that require it. Computed from the dataset, never hardcoded.
 */
export function extensionDepartments(missions) {
  const agg = new Map();
  for (const m of missions) {
    for (const key of Object.keys(m.extras)) {
      const a = agg.get(key) || { fire: 0, ems: 0, police: 0 };
      a.fire += m.fire; a.ems += m.ems; a.police += m.police;
      agg.set(key, a);
    }
  }
  const out = {};
  for (const [key, a] of agg) {
    out[key] = a.fire >= a.ems && a.fire >= a.police ? 'fire'
      : a.ems >= a.police ? 'ems' : 'police';
  }
  return out;
}

export function emptyState() {
  return { fire: 0, ems: 0, police: 0, ext: {} };
}

/**
 * How an extension is owned. A plain number is the count of buildings carrying
 * it; the object form adds how many of those are SPECIALISED.
 * @typedef {number | {count: number, specialised?: number}} Owned
 */
export function ownedCount(entry) {
  if (entry == null) return { count: 0, specialised: 0, host: null };
  if (typeof entry === 'number') return { count: Math.max(0, entry), specialised: 0, host: null };
  const count = Math.max(0, entry.count || 0);
  return {
    count,
    specialised: Math.min(count, Math.max(0, entry.specialised || 0)),
    host: entry.host || null,
  };
}

/**
 * An extension sits ON a station, and it counts twice: the building still
 * counts toward its own station type, and the extension counts toward its own
 * requirement. Forestry on a fire station is a fire station AND a Forestry
 * station.
 *
 * A SPECIALISED station is the exception. It can only spawn its specialty's
 * calls, so it leaves its base station pool and counts only as the specialty.
 * Ten fire stations with two specialised into Forestry are eight fire stations
 * and two Forestry stations.
 *
 * Returns the flat state the rest of the algorithm works on, plus what was
 * withdrawn, so the UI can show the player why their station count dropped.
 */
export function effectiveState(owned, extHosts = {}) {
  const out = {
    fire: Math.max(0, owned.fire || 0),
    ems: Math.max(0, owned.ems || 0),
    police: Math.max(0, owned.police || 0),
    ext: {},
  };
  const withdrawn = { fire: 0, ems: 0, police: 0 };
  const overdrawn = [];

  for (const [name, entry] of Object.entries(owned.ext || {})) {
    const { count, specialised, host } = ownedCount(entry);
    if (count > 0) out.ext[name] = count;
    if (!specialised) continue;
    // Which station the extension sits on is the player's to set: it is not the
    // same question as which missions need it, so it is never derived silently.
    const on = host || extHosts[name] || 'fire';
    withdrawn[DEPTS.includes(on) ? on : 'fire'] += specialised;
  }

  for (const dept of DEPTS) {
    if (withdrawn[dept] > out[dept]) {
      overdrawn.push({ dept, have: out[dept], specialised: withdrawn[dept] });
    }
    out[dept] = Math.max(0, out[dept] - withdrawn[dept]);
  }
  return { state: out, withdrawn, overdrawn };
}

/** Resolve whatever shape the caller passed into the flat state. */
function resolve(state, opts) {
  if (opts && opts.alreadyEffective) return state;
  return effectiveState(state, opts?.extensionHosts || opts?.extensionDepartments || {}).state;
}

/** Station and extension requirements this state does not meet yet. */
export function shortfall(mission, state) {
  const stations = {
    fire: Math.max(0, mission.fire - (state.fire || 0)),
    ems: Math.max(0, mission.ems - (state.ems || 0)),
    police: Math.max(0, mission.police - (state.police || 0)),
  };
  const ext = {};
  for (const [key, need] of Object.entries(mission.extras)) {
    const missing = need - ((state.ext && state.ext[key]) || 0);
    if (missing > 0) ext[key] = missing;
  }
  return { stations, ext };
}

export function canSpawn(mission, state) {
  const s = shortfall(mission, state);
  return s.stations.fire === 0 && s.stations.ems === 0 && s.stations.police === 0
    && Object.keys(s.ext).length === 0;
}

/**
 * Look a requirement up in the price table. Mission requirements name
 * extensions, but a few of them are filed under buildings (Tow Truck Station,
 * required by 43 missions). Falling back by normalised name keeps one price in
 * one place instead of duplicating it into both groups, where a correction to
 * one would silently leave the other stale.
 */
export function priceEntry(prices, key) {
  const direct = prices.extensions && prices.extensions[key];
  if (direct && typeof direct.price === 'number') return direct;
  const snake = key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const building = prices.buildings && prices.buildings[snake];
  if (building && typeof building.price === 'number') return building;
  return null;
}

function stationPrices(prices, useSmall) {
  const s = prices.stations;
  const pick = (full, small) => {
    const entry = useSmall ? (s[small] || s[full]) : s[full];
    return { price: entry.price, source: entry.source };
  };
  return {
    fire: pick('fire_station', 'fire_station_small'),
    ems: pick('ambulance_station', 'ambulance_station_small'),
    police: pick('police_station', 'police_station_small'),
  };
}

/**
 * Price a shortfall. Returns the cost, the spend split by department (for the
 * detour tax), every price whose provenance is not the player's own build menu,
 * and anything the price table does not know at all.
 */
export function priceShortfall(sf, prices, opts = {}) {
  const useSmall = opts.useSmall !== false;
  const extDept = opts.extensionDepartments || {};
  const st = stationPrices(prices, useSmall);
  const byDept = { fire: 0, ems: 0, police: 0 };
  const unverified = [];
  const unknown = [];
  let cost = 0;

  for (const dept of DEPTS) {
    const n = sf.stations[dept];
    if (!n) continue;
    cost += n * st[dept].price;
    byDept[dept] += n * st[dept].price;
    if (!TRUSTED_SOURCES.has(st[dept].source)) {
      unverified.push({ name: dept + ' station', source: st[dept].source });
    }
  }

  for (const [key, n] of Object.entries(sf.ext)) {
    const entry = priceEntry(prices, key);
    if (!entry) {
      unknown.push(key);
      continue;
    }
    cost += n * entry.price;
    byDept[extDept[key] || 'fire'] += n * entry.price;
    if (!TRUSTED_SOURCES.has(entry.source)) {
      unverified.push({ name: key, source: entry.source });
    }
  }
  return { cost, byDept, unverified, unknown };
}

/**
 * The cost/credit efficient frontier for one path, priced from the player's
 * current state. Costs are ABSOLUTE, not incremental: rung 4 already contains
 * everything rung 2 needed, so the rungs must never be summed.
 */
export function ladder(missions, path, owned, prices, opts = {}) {
  const extDept = opts.extensionDepartments || extensionDepartments(missions);
  const state = resolve(owned, { ...opts, extensionDepartments: extDept });
  const candidates = [];
  // A rung that pays less than what the player can already spawn raises nothing.
  // Seeding the running maximum with the current ceiling keeps the frontier to
  // rungs that actually lift it, which is what ALGORITHM.md says it is for.
  // Pass fromCeiling:false for the unseeded walk.
  const floor = opts.fromCeiling === false ? -Infinity
    : (ceiling(missions, path, state, { alreadyEffective: true })?.credits ?? -Infinity);

  for (const m of missions) {
    if (m.path !== path) continue;
    if (m.credits == null) continue;          // ambulance missions: see EMS-1
    if (canSpawn(m, state)) continue;
    const sf = shortfall(m, state);
    const priced = priceShortfall(sf, prices, { ...opts, extensionDepartments: extDept });
    candidates.push({
      mission: m, shortfall: sf, ...priced,
      costIsLowerBound: priced.unknown.length > 0,
    });
  }

  // A rung carrying an unknown price has a cost that is only a lower bound, so
  // it must never outrank a fully priced rung that costs the same.
  candidates.sort((a, b) => a.cost - b.cost
    || (a.unknown.length ? 1 : 0) - (b.unknown.length ? 1 : 0)
    || b.mission.credits - a.mission.credits);

  const rungs = [];
  let best = floor;
  for (const c of candidates) {
    if (c.mission.credits > best) {
      best = c.mission.credits;
      rungs.push(c);
    }
  }
  return rungs;
}

/** Marginal return and department mix per rung — the trap and detour tests. */
export function annotate(rungs, path) {
  const own = path === 'F' ? 'fire' : path === 'P' ? 'police' : 'ems';
  let prevCost = 0;
  let prevCredits = 0;
  return rungs.map((r) => {
    const dCost = r.cost - prevCost;
    const dCredits = r.mission.credits - prevCredits;
    const gainPer100k = dCost > 0 ? dCredits / (dCost / 100000) : Infinity;
    const total = r.byDept.fire + r.byDept.ems + r.byDept.police;
    const ownShare = total > 0 ? r.byDept[own] / total : 1;
    prevCost = r.cost;
    prevCredits = r.mission.credits;
    return {
      ...r,
      deltaCost: dCost,
      deltaCredits: dCredits,
      gainPer100k,
      ownShare,
      isTrap: dCost > 0 && gainPer100k < TRAP_GAIN_PER_100K,
      isDetour: dCost > 0 && ownShare < DETOUR_OWN_SHARE,
    };
  });
}

/**
 * The milestone spine: trap rungs removed, then the remaining rungs thinned to
 * the checkpoints that each open a genuinely new credit band. Derived from the
 * same data as the ladder, so a price correction moves it automatically.
 */
export function milestones(annotated, opts = {}) {
  const minJump = opts.minJump ?? 1.4;   // a checkpoint must raise the ceiling by 40%
  const max = opts.max ?? 6;
  const usable = annotated.filter((r) => !r.isTrap);
  if (!usable.length) return [];

  const picked = [];
  let last = 0;
  for (const r of usable) {
    if (r.mission.credits >= last * minJump) {
      picked.push(r);
      last = r.mission.credits;
    }
  }
  const top = usable[usable.length - 1];
  if (picked[picked.length - 1] !== top) picked.push(top);

  // Keep the cheapest entries and the ceiling if the spine grew too long.
  if (picked.length > max) {
    const head = picked.slice(0, max - 1);
    head.push(picked[picked.length - 1]);
    return head;
  }
  return picked;
}

/**
 * Break a rung into individual purchases, ordered so that each one is useful on
 * its own: what unlocks the most additional missions first, cheapest to break a
 * tie. This is what the front page shows as "buy this next".
 */
export function nextPurchases(rung, owned, missions, prices, opts = {}) {
  const useSmall = opts.useSmall !== false;
  const state = resolve(owned, opts);
  const st = stationPrices(prices, useSmall);
  const items = [];

  for (const dept of DEPTS) {
    for (let i = 0; i < rung.shortfall.stations[dept]; i++) {
      items.push({ kind: 'station', dept, label: dept, price: st[dept].price, source: st[dept].source });
    }
  }
  for (const [key, n] of Object.entries(rung.shortfall.ext)) {
    const entry = priceEntry(prices, key);
    for (let i = 0; i < n; i++) {
      items.push({
        kind: 'extension', key, label: key,
        price: entry ? entry.price : null,
        source: entry ? entry.source : 'unknown',
      });
    }
  }

  // How many missions each single purchase would unlock, applied to the state
  // one at a time rather than all at once.
  const scored = items.map((item) => {
    const probe = {
      fire: state.fire, ems: state.ems, police: state.police,
      ext: { ...state.ext },
    };
    if (item.kind === 'station') probe[item.dept] += 1;
    else probe.ext[item.key] = (probe.ext[item.key] || 0) + 1;
    let unlocks = 0;
    for (const m of missions) {
      if (m.credits == null) continue;
      if (!canSpawn(m, state) && canSpawn(m, probe)) unlocks++;
    }
    return { ...item, unlocks };
  });

  scored.sort((a, b) => b.unlocks - a.unlocks || (a.price ?? Infinity) - (b.price ?? Infinity));
  return scored;
}

export function ceiling(missions, path, owned, opts = {}) {
  const state = resolve(owned, opts);
  let best = null;
  for (const m of missions) {
    if (m.path !== path || m.credits == null) continue;
    if (!canSpawn(m, state)) continue;
    if (!best || m.credits > best.credits) best = m;
  }
  return best;
}

/** Missions on a path that carry no credit value — the EMS-1 blind spot. */
export function unpricedMissions(missions, path) {
  return missions.filter((m) => m.path === path && m.credits == null);
}
