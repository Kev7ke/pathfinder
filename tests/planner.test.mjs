import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseMissions, extensionDepartments, ladder, annotate, milestones,
  nextPurchases, canSpawn, shortfall, ceiling, priceShortfall, TRUSTED_SOURCES,
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

test('the known EMS trap rung is flagged', () => {
  const rungs = annotate(build('E', FRESH), 'E');
  const rockslide = rungs.find((r) => r.mission.name.startsWith('Massive Debris from Rockslide'));
  assert.ok(rockslide, 'expected the rockslide rung');
  assert.ok(rockslide.isTrap, 'the rockslide rung should be a trap');
  assert.ok(rockslide.isDetour, 'the rockslide rung should be a detour');
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
