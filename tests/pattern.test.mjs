// Exercises the pattern engine on its own, lifted out of the userscript, so the
// counter rules are pinned without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../userscripts/src/mod-renamer.js', import.meta.url), 'utf8');
const grab = (name) => {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i > 0, `${name} not found`);
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true; }
    else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced');
};
const COUNTER_RE_SRC = src.match(/const COUNTER_RE = (.+);/)[1];
const mod = new Function(`
  const COUNTER_RE = ${COUNTER_RE_SRC};
  ${grab('expandPattern')}
  ${grab('assignIndexes')}
  return { expandPattern, assignIndexes };
`)();

const T = { type: 'Quint', typeid: '13', building: 'Downtown Fire', dc: 'Central', id: '7', name: 'Old' };

test('plain counters pad to the number of n characters', () => {
  assert.equal(mod.expandPattern('{n}', { default: 0 }, T, 150), '1');
  assert.equal(mod.expandPattern('{nn}', { default: 0 }, T, 150), '01');
  assert.equal(mod.expandPattern('{nnn}', { default: 11 }, T, 150), '012');
});

test('{x12nn} starts the counter at 12', () => {
  assert.equal(mod.expandPattern('{x12nn}', { default: 0 }, T, 150), '12');
  assert.equal(mod.expandPattern('{x12nn}', { default: 1 }, T, 150), '13');
  assert.equal(mod.expandPattern('{x13nn}', { default: 0 }, T, 150), '13');
  assert.equal(mod.expandPattern('{x7n}', { default: 2 }, T, 150), '9');
});

test('{typenn} and {typex12nn} use the type counter', () => {
  const idx = { default: 0, type: 4, dc: 1 };
  assert.equal(mod.expandPattern('{typenn}', idx, T, 150), '05');
  assert.equal(mod.expandPattern('{typex12nn}', idx, T, 150), '16');
  assert.equal(mod.expandPattern('{dcnn}', idx, T, 150), '02');
});

test('plain tokens are not mistaken for counters', () => {
  assert.equal(mod.expandPattern('{type} {typeid} {dc}', { default: 0 }, T, 150),
    'Quint 13 Central');
  assert.equal(mod.expandPattern('{building}/{name}/{id}', { default: 0 }, T, 150),
    'Downtown Fire/Old/7');
});

test('a full pattern combines them', () => {
  assert.equal(
    mod.expandPattern('{dc} {building} {type} {x12nn} [{typenn}]',
      { default: 0, type: 2, dc: 0 }, T, 150),
    'Central Downtown Fire Quint 12 [03]');
});

test('names are cut to the limit for their kind', () => {
  assert.equal(mod.expandPattern('{building}', { default: 0 },
    { ...T, building: 'x'.repeat(60) }, 40).length, 40);
});

test('counters restart per scope key and run on across them', () => {
  const rows = [
    { station: 'A', type: 'engine' },
    { station: 'A', type: 'engine' },
    { station: 'B', type: 'engine' },
    { station: 'B', type: 'ladder' },
  ];
  const out = mod.assignIndexes(rows, (r) => ({ default: r.station, type: r.type }));
  assert.deepEqual(out.map((o) => o.indexes.default), [0, 1, 0, 1], 'per-station counter');
  assert.deepEqual(out.map((o) => o.indexes.type), [0, 1, 2, 0], 'per-type counter');
});
