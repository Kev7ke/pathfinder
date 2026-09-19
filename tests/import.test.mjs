import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  parseGeneratedCategories, departmentOf, extensionState, stateFromExport,
} from '../src/import-game.js';

test('the Ruby Set the game sends is read correctly', () => {
  assert.deepEqual(parseGeneratedCategories('#<Set: {:fire}>'), ['fire']);
  assert.deepEqual(parseGeneratedCategories('#<Set: {}>'), []);
  assert.deepEqual(parseGeneratedCategories('#<Set: {:fire, :police}>'), ['fire', 'police']);
  assert.deepEqual(parseGeneratedCategories(undefined), []);
});

test('a department is read from what a building generates, not its type id', () => {
  assert.equal(departmentOf({ generates_mission_categories: '#<Set: {:fire}>' }), 'fire');
  assert.equal(departmentOf({ generates_mission_categories: '#<Set: {:ambulance}>' }), 'ems');
  assert.equal(departmentOf({ generates_mission_categories: '#<Set: {:police}>' }), 'police');
  assert.equal(departmentOf({ generates_mission_categories: '#<Set: {}>' }), null,
    'a dispatch centre or academy must not count as a station');
});

test('an extension still building does not count as owned', () => {
  const now = new Date('2026-09-19T12:00:00Z');
  assert.equal(extensionState({ available: true }, now), 'ready');
  assert.equal(extensionState({ available: false, available_at: '2026-09-24T22:02:52-04:00' }, now),
    'building');
  assert.equal(extensionState({ available: false, available_at: '2026-09-01T00:00:00Z' }, now),
    'ready', 'a past timestamp means it finished');
});

test('an export becomes a planner state', () => {
  const now = new Date('2026-09-19T12:00:00Z');
  const exported = {
    fetchedAt: '2026-09-19T12:00:00Z',
    endpoints: {
      buildings: { data: [
        { id: 1, caption: 'FS1', small_building: true, generates_mission_categories: '#<Set: {:fire}>',
          extensions: [{ caption: 'Forestry Expansion', available: true }] },
        { id: 2, caption: 'FS2', generates_mission_categories: '#<Set: {:fire}>',
          extensions: [{ caption: 'Forestry Expansion', available: false, available_at: '2026-09-24T00:00:00Z' }] },
        { id: 3, caption: 'AS1', generates_mission_categories: '#<Set: {:ambulance}>' },
        { id: 4, caption: 'DC', generates_mission_categories: '#<Set: {}>' },
      ] },
      vehicles: { data: [{ building_id: 1 }, { building_id: 1 }] },
      credits: { data: { credits_user_current: 2264089, user_level_title: 'Police sergeant' } },
    },
  };
  const out = stateFromExport(exported, now);
  assert.deepEqual(out.state, { fire: 2, ems: 1, police: 0, ext: { 'Forestry Expansion': 1 } },
    'only the finished extension counts, and the dispatch centre is not a station');
  assert.deepEqual(out.pending, { 'Forestry Expansion': 1 });
  assert.equal(out.credits, 2264089);
  assert.equal(out.rank, 'Police sergeant');
  assert.deepEqual(out.unstaffed, ['FS2', 'AS1'], 'stations with no vehicles should be named');
  assert.deepEqual(out.nonGenerating.map((b) => b.caption), ['DC']);
});

test('an empty export is reported, not crashed on', () => {
  const out = stateFromExport({});
  assert.deepEqual(out.state, { fire: 0, ems: 0, police: 0, ext: {} });
  assert.equal(out.warnings.length, 1);
});

// The real export, when it is present. Kept optional so the suite runs anywhere.
const real = new URL('../data/game-export.json', import.meta.url);
test('the real export reads back the account it came from', { skip: !existsSync(real) }, () => {
  const out = stateFromExport(JSON.parse(readFileSync(real)));
  assert.equal(out.state.fire, 13);
  assert.equal(out.state.ems, 2);
  assert.equal(out.state.police, 5);
  assert.equal(out.counts.buildings, 24);
  assert.equal(out.counts.vehicles, 62);
});
