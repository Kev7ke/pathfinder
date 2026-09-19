// Drives the userscript against a stand-in for the game: the /api endpoints,
// realistic edit forms for vehicles and buildings, and a save endpoint that
// records what was posted. Verifies both tabs, the pickers, the dispatch-centre
// stamp, and that a write preserves the CSRF token and every unrelated field.
//
// Needs Playwright and a static server on :8777:
//   python3 -m http.server 8777 & node userscripts/vehicle-renamer.test.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const script = readFileSync(new URL('./vehicle-renamer.user.js', import.meta.url), 'utf8');

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'],
});
const pg = await b.newPage({ viewport: { width: 1200, height: 1000 } });
const errs = [];
pg.on('pageerror', (e) => errs.push(e.message));

await pg.goto('http://localhost:8777/README.md');
await pg.setContent('<html><body></body></html>');

await pg.evaluate(() => {
  window.__posts = [];
  window.confirm = () => true;
  window.GM_registerMenuCommand = () => {};
  window.I18n = { locale: 'en_US' };

  // As the real game sends it: numeric types, vehicle_type_caption only on
  // custom types, and leitstelle_building_id linking a station to its centre.
  const buildings = [
    { id: 90, caption: 'Central Dispatch', building_type: 7 },
    { id: 1, caption: 'Downtown Fire', building_type: 0, leitstelle_building_id: 90 },
    { id: 2, caption: 'North EMS', building_type: 2, leitstelle_building_id: 90 },
    { id: 3, caption: 'Lone Station', building_type: 0 },
  ];
  const vehicles = [
    { id: 11, caption: 'Old A', building_id: 1, vehicle_type: 13 },
    { id: 12, caption: 'Old B', building_id: 1, vehicle_type: 13 },
    { id: 13, caption: 'Old C', building_id: 2, vehicle_type: 5 },
    { id: 14, caption: 'Old D', building_id: 3, vehicle_type: 13 },
  ];
  window.__vehicles = vehicles;
  window.__buildings = buildings;

  const form = (action, field, value) => `<html><body>
    <form action="${action}" method="post">
      <input name="authenticity_token" value="CSRF-TOKEN-XYZ">
      <input name="${field}" value="${value}">
      <input name="keep_this" value="preserve-me">
    </form></body></html>`;

  window.fetch = async (url, opts = {}) => {
    url = String(url);
    if (url === '/api/vehicles') return new Response(JSON.stringify(vehicles));
    if (url === '/api/buildings') return new Response(JSON.stringify(buildings));
    let m = url.match(/^\/vehicles\/(\d+)\/edit$/);
    if (m) {
      const v = vehicles.find((x) => x.id === Number(m[1]));
      return new Response(form(`/vehicles/${v.id}`, 'vehicle[caption]', v.caption),
        { headers: { 'content-type': 'text/html' } });
    }
    m = url.match(/^\/buildings\/(\d+)\/edit$/);
    if (m) {
      const bl = buildings.find((x) => x.id === Number(m[1]));
      return new Response(form(`/buildings/${bl.id}`, 'building[name]', bl.caption),
        { headers: { 'content-type': 'text/html' } });
    }
    if (opts.method && opts.method.toLowerCase() === 'post') {
      const entries = {};
      for (const [k, val] of opts.body.entries()) entries[k] = val;
      window.__posts.push({ url, entries });
      return new Response('ok');
    }
    throw new Error('unexpected fetch: ' + url);
  };
});

await pg.addScriptTag({ content: script });

const fab = pg.locator('#pf-renamer-fab');
assert.equal(await fab.count(), 1, 'the floating launcher button was not added');
console.log('launcher          : visible');
await fab.click();
await pg.waitForFunction(() => document.querySelector('#pf-status')?.textContent.includes('stations'));
console.log('loaded            :', (await pg.textContent('#pf-status')).trim());

// ---- built-in type names ----
const typeLabels = await pg.$$eval('#pf-v-types .pf-pick span', (e) => e.map((x) => x.textContent));
console.log('vehicle types     :', JSON.stringify(typeLabels));
assert.ok(typeLabels.some((t) => t.startsWith('Quint')), 'built-in name for type 13 not used');
assert.ok(typeLabels.some((t) => t.startsWith('ALS Ambulance')), 'built-in name for type 5 not used');

// ---- the dispatch-centre stamp ----
await pg.selectOption('#pf-v-dc', '90');
await pg.click('[data-pf="stamp-dc"][data-for="vehicle"]');
await pg.waitForTimeout(150);
const picked = await pg.$$eval('#pf-v-stations input:checked', (e) => e.map((x) => x.value));
console.log('stamped stations  :', JSON.stringify(picked), '(Lone Station 3 must be out)');
assert.deepEqual(picked.sort(), ['1', '2'], 'the stamp did not select exactly that centre\'s stations');

// ---- the new counters, on the vehicles tab ----
await pg.fill('#pf-pattern', '{dc} {type} {x12nn} [{typenn}]');
await pg.click('[data-pf="preview"]');
await pg.waitForTimeout(200);
const rows = await pg.$$eval('#pf-preview tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent)));
console.log('preview           :', JSON.stringify(rows));
assert.deepEqual(rows, [
  ['Old A', 'Central Dispatch Quint 12 [01]'],
  ['Old B', 'Central Dispatch Quint 13 [02]'],
  ['Old C', 'Central Dispatch ALS Ambulance 12 [01]'],
], 'x12 counter restarts per station, type counter runs on within its type');

await pg.click('[data-pf="apply"]');
await pg.waitForFunction(() => document.querySelector('#pf-status')?.textContent.startsWith('Renamed'));
const vPosts = await pg.evaluate(() => window.__posts);
assert.equal(vPosts.length, 3, 'expected three vehicle saves');
assert.equal(new URL(vPosts[0].url).pathname, '/vehicles/11');
assert.equal(vPosts[0].entries['vehicle[caption]'], 'Central Dispatch Quint 12 [01]');
assert.equal(vPosts[0].entries.authenticity_token, 'CSRF-TOKEN-XYZ', 'CSRF token lost');
assert.equal(vPosts[0].entries.keep_this, 'preserve-me', 'an unrelated field was lost');
console.log('vehicle save      :', JSON.stringify(vPosts[0].entries));

// ---- the stations tab ----
await pg.evaluate(() => { window.__posts = []; });
await pg.click('[data-pf="tab"][data-tab="building"]');
await pg.waitForTimeout(150);
await pg.fill('#pf-pattern', '{dc} station {nn}');
await pg.click('[data-pf="preview"]');
await pg.waitForTimeout(200);
const bRows = await pg.$$eval('#pf-preview tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent)));
console.log('station preview   :', JSON.stringify(bRows));
assert.ok(bRows.some((r) => r[0] === 'Downtown Fire' && r[1] === 'Central Dispatch station 02'),
  'stations were not renamed with the dispatch centre and a running counter');

await pg.click('[data-pf="apply"]');
await pg.waitForFunction(() => document.querySelector('#pf-status')?.textContent.startsWith('Renamed'));
const bPosts = await pg.evaluate(() => window.__posts);
assert.ok(bPosts.length > 0, 'no station was saved');
assert.ok(new URL(bPosts[0].url).pathname.startsWith('/buildings/'), 'posted to the wrong place');
assert.ok('building[name]' in bPosts[0].entries, 'the station name field was not set');
assert.equal(bPosts[0].entries.authenticity_token, 'CSRF-TOKEN-XYZ', 'CSRF token lost on a station');
console.log('station save      :', JSON.stringify(bPosts[0].entries));

// ---- undo, which must know it was stations ----
await pg.evaluate(() => {
  window.__posts = [];
  document.getElementById('pf-renamer').remove();
});
await pg.locator('#pf-renamer-fab').click();
await pg.waitForFunction(() => document.querySelector('#pf-restore .alert'));
const backupNote = await pg.textContent('#pf-restore');
console.log('backup note       :', backupNote.replace(/\s+/g, ' ').trim().slice(0, 80));
assert.ok(backupNote.includes('station'), 'the backup did not record that it renamed stations');

// ---- the data buttons ----
await pg.click('[data-pf="tab"][data-tab="data"]');
await pg.waitForTimeout(100);
await pg.click('[data-pf="dump"][data-what="dispatch"]');
await pg.waitForTimeout(200);
const dump = JSON.parse(await pg.inputValue('#pf-dump'));
console.log('dispatch dump     :', JSON.stringify(dump));
assert.equal(dump.dispatchCenters.length, 1);
assert.deepEqual(dump.withoutDispatchCenter, ['Lone Station'],
  'a station with no dispatch centre was not reported');

console.log('page errors       :', errs.length ? errs : 'none');
assert.equal(errs.length, 0);
console.log('\nALL ASSERTIONS PASSED');
await b.close();
