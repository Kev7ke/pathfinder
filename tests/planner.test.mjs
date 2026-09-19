import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseMissions, extensionDepartments, ladder, annotate, milestones,
  nextPurchases, canSpawn, shortfall, ceiling, priceShortfall, TRUSTED_SOURCES,
  effectiveState, ownedCount, priceEntry,
} from '../src/planner.js';

const data = JSON.parse(readFileSync(new URL('../data/missions.json', import.meta.url)));
const prices = JSON.parse(readFileSync(new URL('../data/prices.json', import.meta.url)));
const missions = parseMissions(data);
const extDept = extensionDepartments(missions);
const PATHS = ['F', 'P', 'E'];
const FRESH = { fire: 1, ems: 0, police: 0, ext: {} };
const MID = { fire: 10, ems: 5, police: 5, ext: {} };

const build = (path, state, p = prices) =>
  ladder(missions, path, state, p, { extensionDepartments: extDept });

test('the dataset is the one the tool was built against', () => {
  assert.equal(missions.length, 1261);
  assert.equal(data.p.length, 1261);
  assert.equal(data.ext.length, 37);
});

test('the frontier rises in both cost and credits', () => {
  for (const path of PATHS) {
    for (const state of [FRESH, MID]) {
      const rungs = build(path, state);
      assert.ok(rungs.length > 0, `${path} produced no rungs`);
      for (let i = 1; i < rungs.length; i++) {
        assert.ok(rungs[i].cost >= rungs[i - 1].cost,
          `${path}: cost fell at rung ${i}`);
        assert.ok(rungs[i].mission.credits > rungs[i - 1].mission.credits,
          `${path}: credits did not rise at rung ${i}`);
      }
    }
  }
});

test('every rung is reachable: buying its shortfall makes the mission spawnable', () => {
  for (const path of PATHS) {
    for (const rung of build(path, FRESH)) {
      const after = {
        fire: FRESH.fire + rung.shortfall.stations.fire,
        ems: FRESH.ems + rung.shortfall.stations.ems,
        police: FRESH.police + rung.shortfall.stations.police,
        ext: { ...FRESH.ext },
      };
      for (const [k, n] of Object.entries(rung.shortfall.ext)) {
        after.ext[k] = (after.ext[k] || 0) + n;
      }
      assert.ok(canSpawn(rung.mission, after),
        `${path}: ${rung.mission.name} still not spawnable after its own shortfall`);
    }
  }
});

test('no rung is something the player can already spawn', () => {
  for (const path of PATHS) {
    for (const rung of build(path, MID)) {
      assert.ok(!canSpawn(rung.mission, MID),
        `${path}: ${rung.mission.name} was already reachable`);
    }
  }
});

test('missions without a credit value stay out of the ladder', () => {
  for (const path of PATHS) {
    for (const rung of build(path, FRESH)) {
      assert.notEqual(rung.mission.credits, null);
    }
  }
});

test('raising a price raises what depends on it, and moves nothing else', () => {
  // Technical Rescue Equipment gates the EMS ceiling (Roller Coaster Derailment).
  const key = 'Technical Rescue Equipment';
  const dearer = structuredClone(prices);
  dearer.extensions[key].price *= 4;

  const costOf = (mission, table) =>
    priceShortfall(shortfall(mission, FRESH), table, { extensionDepartments: extDept }).cost;

  const users = missions.filter((m) => m.credits != null && key in m.extras);
  assert.ok(users.length > 0, `no mission requires ${key}`);
  for (const m of users) {
    assert.ok(costOf(m, dearer) > costOf(m, prices),
      `${m.name} did not get more expensive`);
  }

  // Mission names repeat across intensity variants, so match on the mission
  // index, never on the name.
  const before = build('E', FRESH);
  const after = build('E', FRESH, dearer);
  const seen = new Map(after.map((r) => [r.mission.index, r]));
  for (const rung of before) {
    if (key in rung.mission.extras) continue;
    if (!seen.has(rung.mission.index)) continue;
    assert.equal(seen.get(rung.mission.index).cost, rung.cost,
      `${rung.mission.name} changed although it does not use ${key}`);
  }
});

test('halving a ladder-critical price never raises a rung cost', () => {
  const cheaper = structuredClone(prices);
  cheaper.extensions['Disaster Response Extension'].price /= 2;
  const before = build('F', FRESH);
  const after = build('F', FRESH, cheaper);
  const was = new Map(before.map((r) => [r.mission.index, r.cost]));
  for (const rung of after) {
    if (!was.has(rung.mission.index)) continue;
    assert.ok(rung.cost <= was.get(rung.mission.index),
      `${rung.mission.name} (#${rung.mission.index}) got dearer`);
  }
});

test('small-station pricing is cheaper than full-station pricing', () => {
  for (const path of PATHS) {
    const small = ladder(missions, path, FRESH, prices, { useSmall: true, extensionDepartments: extDept });
    const full = ladder(missions, path, FRESH, prices, { useSmall: false, extensionDepartments: extDept });
    const cheapestSmall = small[small.length - 1].cost;
    const cheapestFull = full[full.length - 1].cost;
    assert.ok(cheapestSmall <= cheapestFull, `${path}: small pricing was not cheaper`);
  }
});

test('provenance survives into the recommendation', () => {
  const rungs = build('E', FRESH);
  const avalanche = rungs.find((r) => r.mission.name === 'Moderate gravity avalanche');
  assert.ok(avalanche, 'expected the avalanche rung in the EMS ladder');
  assert.ok(avalanche.unverified.length > 0,
    'a rung built on estimated extension prices reported none');
  for (const u of avalanche.unverified) {
    assert.ok(!TRUSTED_SOURCES.has(u.source));
  }
});

test('an unknown price is reported, not silently treated as free', () => {
  const gapped = structuredClone(prices);
  delete gapped.extensions['Foam Extension'];
  const rungs = ladder(missions, 'F', FRESH, gapped, { extensionDepartments: extDept });
  const withFoam = rungs.filter((r) => 'Foam Extension' in r.mission.extras);
  assert.ok(withFoam.length > 0, 'expected rungs needing foam');
  for (const r of withFoam) assert.ok(r.unknown.includes('Foam Extension'));
});

test('the milestone spine is short, ordered, and free of trap rungs', () => {
  for (const path of PATHS) {
    const spine = milestones(annotate(build(path, FRESH), path));
    assert.ok(spine.length >= 3 && spine.length <= 6, `${path}: ${spine.length} milestones`);
    for (const m of spine) assert.ok(!m.isTrap, `${path}: a trap rung reached the spine`);
    for (let i = 1; i < spine.length; i++) {
      assert.ok(spine[i].cost >= spine[i - 1].cost);
      assert.ok(spine[i].mission.credits > spine[i - 1].mission.credits);
    }
  }
});

test('trap rungs are flagged on the paths that have them', () => {
  const ems = annotate(build('E', FRESH), 'E');
  const traps = ems.filter((r) => r.isTrap);
  assert.ok(traps.length > 0, 'the EMS ladder should contain at least one trap rung');
  for (const r of traps) assert.ok(r.gainPer100k < 400);

  const avalanche = ems.find((r) => r.mission.name === 'Small avalanche');
  assert.ok(avalanche?.isTrap, 'Small avalanche should be a trap: 400,000 more for 600 credits');
});

test('the rockslide rung is priced in full, not as if tow trucks were free', () => {
  // Regression: this mission needs 8x Tow Truck Station. While that requirement
  // resolved to no price it was costed at 1,600,000 instead of 4,000,000, which
  // put it on the frontier as the cheapest way to reach 15,400 credits.
  const m = missions.find((x) => x.name.startsWith('Massive Debris from Rockslide'));
  assert.ok(m, 'expected the rockslide mission in the dataset');
  assert.equal(m.extras['Tow Truck Station'], 8);
  const priced = priceShortfall(shortfall(m, FRESH), prices, { extensionDepartments: extDept });
  assert.deepEqual(priced.unknown, []);
  assert.equal(priced.cost, 4000000);
  assert.ok(!build('E', FRESH).some((r) => r.mission.index === m.index),
    'at its real price the rockslide rung should not be on the frontier');
});

test('every single purchase in a queue is affordable on its own and priced', () => {
  const rungs = build('P', FRESH);
  const queue = nextPurchases(rungs[rungs.length - 1], FRESH, missions, prices);
  assert.ok(queue.length > 0);
  let total = 0;
  for (const item of queue) {
    assert.ok(item.price === null || item.price > 0, `${item.label} priced at ${item.price}`);
    total += item.price || 0;
  }
  assert.equal(total, rungs[rungs.length - 1].cost,
    'the purchase queue does not add up to the rung cost');
});

test('ceiling and shortfall agree with each other', () => {
  const top = ceiling(missions, 'P', MID);
  assert.ok(top, 'expected a reachable police mission at mid game');
  const sf = shortfall(top, MID);
  assert.equal(sf.stations.fire + sf.stations.ems + sf.stations.police, 0);
  assert.equal(Object.keys(sf.ext).length, 0);
});

test('pricing a shortfall splits spend across departments without losing credits', () => {
  const rungs = build('E', FRESH);
  for (const r of rungs) {
    const sum = r.byDept.fire + r.byDept.ems + r.byDept.police;
    if (r.unknown.length === 0) assert.equal(sum, r.cost, `${r.mission.name}: dept split lost money`);
  }
});

test('no rung pays less than the ceiling the player already has', () => {
  const states = [FRESH, MID, { fire: 6, ems: 2, police: 4, ext: {} }];
  for (const path of PATHS) {
    for (const state of states) {
      const top = ceiling(missions, path, state);
      if (!top) continue;
      for (const rung of build(path, state)) {
        assert.ok(rung.mission.credits > top.credits,
          `${path}: rung ${rung.mission.name} (${rung.mission.credits}) does not beat the ceiling ${top.credits}`);
      }
    }
  }
});

test('the unseeded walk is still available and is a superset', () => {
  const seeded = build('E', MID);
  const unseeded = ladder(missions, 'E', MID, prices, {
    extensionDepartments: extDept, fromCeiling: false,
  });
  assert.ok(unseeded.length >= seeded.length);
  const names = new Set(unseeded.map((r) => r.mission.index));
  for (const r of seeded) assert.ok(names.has(r.mission.index));
});

// ---- extensions: counted on the building, withdrawn when specialised ----

const HOSTS = { 'Forestry Expansion': 'fire', 'Mountain Rescue Station': 'ems', 'Riot Police Extension': 'police' };

test('an extension counts as itself and leaves the station count alone', () => {
  const { state, withdrawn } = effectiveState(
    { fire: 10, ems: 0, police: 0, ext: { 'Forestry Expansion': 3 } }, HOSTS);
  assert.equal(state.fire, 10, 'a plain extension must not remove the building from its pool');
  assert.equal(state.ext['Forestry Expansion'], 3);
  assert.equal(withdrawn.fire, 0);
});

test('a specialised station leaves its base pool but keeps its extension', () => {
  const { state, withdrawn } = effectiveState(
    { fire: 10, ems: 0, police: 0, ext: { 'Forestry Expansion': { count: 3, specialised: 2 } } }, HOSTS);
  assert.equal(state.fire, 8, 'two specialised fire stations should leave the fire pool');
  assert.equal(state.ext['Forestry Expansion'], 3, 'all three still carry the extension');
  assert.equal(withdrawn.fire, 2);
});

test('specialisation is withdrawn from the department the extension sits on', () => {
  const owned = {
    fire: 5, ems: 5, police: 5,
    ext: {
      'Forestry Expansion': { count: 2, specialised: 2 },
      'Mountain Rescue Station': { count: 3, specialised: 1 },
      'Riot Police Extension': { count: 1, specialised: 1 },
    },
  };
  const { state } = effectiveState(owned, HOSTS);
  assert.deepEqual([state.fire, state.ems, state.police], [3, 4, 4]);
});

test('more specialised than owned is clamped, not negative, and reported', () => {
  assert.deepEqual(ownedCount({ count: 2, specialised: 9 }), { count: 2, specialised: 2, host: null });
  const { state, overdrawn } = effectiveState(
    { fire: 1, ems: 0, police: 0, ext: { 'Forestry Expansion': { count: 4, specialised: 4 } } }, HOSTS);
  assert.equal(state.fire, 0, 'station count must not go negative');
  assert.equal(overdrawn.length, 1);
  assert.equal(overdrawn[0].dept, 'fire');
});

test('a plain number and the object form mean the same thing', () => {
  const a = effectiveState({ fire: 4, ems: 0, police: 0, ext: { 'Forestry Expansion': 2 } }, HOSTS);
  const b = effectiveState({ fire: 4, ems: 0, police: 0, ext: { 'Forestry Expansion': { count: 2 } } }, HOSTS);
  assert.deepEqual(a.state, b.state);
});

test('specialising shrinks what the player can already spawn', () => {
  const base = { fire: 12, ems: 6, police: 6, ext: { 'Forestry Expansion': { count: 4, specialised: 0 } } };
  const spec = { fire: 12, ems: 6, police: 6, ext: { 'Forestry Expansion': { count: 4, specialised: 4 } } };
  const opts = { extensionDepartments: extDept };
  const before = ceiling(missions, 'F', base, opts);
  const after = ceiling(missions, 'F', spec, opts);
  assert.ok(before, 'expected a reachable fire mission');
  assert.ok(!after || after.credits <= before.credits,
    'withdrawing four fire stations should not raise the ceiling');
});

test('the ladder reprices when stations are specialised away', () => {
  const opts = { extensionDepartments: extDept };
  const base = { fire: 12, ems: 6, police: 6, ext: { 'Forestry Expansion': { count: 4 } } };
  const spec = { fire: 12, ems: 6, police: 6, ext: { 'Forestry Expansion': { count: 4, specialised: 4 } } };
  const a = new Map(ladder(missions, 'F', base, prices, opts).map((r) => [r.mission.index, r.cost]));
  const b = ladder(missions, 'F', spec, prices, opts);
  let dearer = 0;
  for (const rung of b) {
    if (!a.has(rung.mission.index)) continue;
    assert.ok(rung.cost >= a.get(rung.mission.index),
      `${rung.mission.name} got cheaper after losing four fire stations`);
    if (rung.cost > a.get(rung.mission.index)) dearer++;
  }
  assert.ok(dearer > 0, 'specialising four fire stations changed no rung cost at all');
});

test('owning an extension removes it from the shortfall of a rung that needs it', () => {
  const opts = { extensionDepartments: extDept };
  const without = ladder(missions, 'F', { fire: 8, ems: 4, police: 4, ext: {} }, prices, opts);
  const target = without.find((r) => 'Forestry Expansion' in r.shortfall.ext);
  assert.ok(target, 'expected a fire rung needing Forestry');
  const need = target.shortfall.ext['Forestry Expansion'];

  const withExt = ladder(missions, 'F',
    { fire: 8, ems: 4, police: 4, ext: { 'Forestry Expansion': need } }, prices, opts);
  const same = withExt.find((r) => r.mission.index === target.mission.index);
  if (same) {
    assert.ok(!('Forestry Expansion' in same.shortfall.ext),
      'the owned extension still showed up as missing');
    assert.ok(same.cost < target.cost, 'owning the extension did not reduce the cost');
  }
});

test('the host station is the player\'s to set and overrides the derived guess', () => {
  // The derived map puts Water Police Extension on fire, because fire missions
  // ask for it. The building it actually sits on is a different question.
  assert.equal(extDept['Water Police Extension'], 'fire');
  const owned = {
    fire: 5, ems: 0, police: 5,
    ext: { 'Water Police Extension': { count: 2, specialised: 2, host: 'police' } },
  };
  const { state, withdrawn } = effectiveState(owned, extDept);
  assert.equal(state.fire, 5, 'the override was ignored and fire was charged');
  assert.equal(state.police, 3);
  assert.equal(withdrawn.police, 2);
});

test('an unknown host falls back rather than throwing', () => {
  const { state } = effectiveState(
    { fire: 3, ems: 0, police: 0, ext: { 'Forestry Expansion': { count: 1, specialised: 1, host: 'nonsense' } } },
    { 'Forestry Expansion': 'fire' });
  assert.equal(state.fire, 2);
});

test('a requirement filed under buildings is still priced', () => {
  // Tow Truck Station is required by 43 missions but lives in prices.buildings.
  const entry = priceEntry(prices, 'Tow Truck Station');
  assert.ok(entry, 'Tow Truck Station resolved to no price');
  assert.equal(entry.price, prices.buildings.tow_truck_station.price);
  assert.equal(entry.source, prices.buildings.tow_truck_station.source);
});

test('every requirement in the dataset resolves to a price', () => {
  const missing = new Set();
  for (const m of missions) {
    for (const key of Object.keys(m.extras)) {
      if (!priceEntry(prices, key)) missing.add(key);
    }
  }
  assert.deepEqual([...missing], [], 'requirements with no price entry');
});

test('an unknown price is a lower bound and never outranks a priced rung', () => {
  const gapped = structuredClone(prices);
  delete gapped.extensions['Forestry Expansion'];
  const rungs = ladder(missions, 'F', FRESH, gapped, { extensionDepartments: extDept });
  const gaps = rungs.filter((r) => r.costIsLowerBound);
  assert.ok(gaps.length > 0, 'expected at least one rung with an unpriced requirement');
  for (const r of gaps) assert.ok(r.unknown.length > 0);
  for (let i = 1; i < rungs.length; i++) {
    if (rungs[i].cost === rungs[i - 1].cost && !rungs[i - 1].costIsLowerBound) continue;
    assert.ok(rungs[i].cost >= rungs[i - 1].cost);
  }
});
