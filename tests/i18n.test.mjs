import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS } from '../src/i18n.js';

// A syntax error here takes the whole app down without touching the algorithm,
// and the tests would not have caught it. Now they do.

test('both languages load and carry the same keys', () => {
  const en = Object.keys(STRINGS.en).sort();
  const de = Object.keys(STRINGS.de).sort();
  assert.deepEqual(de, en, 'English and German are out of step');
});

test('nested string groups match too', () => {
  for (const group of ['paths', 'tabs', 'pathContract']) {
    assert.deepEqual(
      Object.keys(STRINGS.de[group]).sort(),
      Object.keys(STRINGS.en[group]).sort(),
      `${group} differs between languages`);
  }
});

test('no string is empty or left as a placeholder', () => {
  for (const [lang, table] of Object.entries(STRINGS)) {
    for (const [key, value] of Object.entries(table)) {
      const values = typeof value === 'object' ? Object.entries(value) : [[key, value]];
      for (const [k, v] of values) {
        assert.equal(typeof v, 'string', `${lang}.${key}.${k} is not a string`);
        assert.ok(v.trim().length > 0, `${lang}.${key}.${k} is empty`);
        assert.ok(!v.includes('TODO'), `${lang}.${key}.${k} is a placeholder`);
      }
    }
  }
});
