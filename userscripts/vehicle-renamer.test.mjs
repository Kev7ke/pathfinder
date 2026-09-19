import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Drives the userscript against a stand-in for the game: the /api endpoints,
// a realistic edit form, and a save endpoint that records what was posted.
// Verifies the write preserves the CSRF token and every unrelated field.
//
// Needs Playwright and a static server on :8777 (npm start, port changed):
//   node userscripts/vehicle-renamer.test.mjs
const script = readFileSync(new URL('./vehicle-renamer.user.js', import.meta.url), 'utf8');

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox']});
const pg = await b.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));

// any same-origin page will do; the script resolves form actions against it
await pg.goto('http://localhost:8777/README.md');
await pg.setContent(`<html><body>
  <ul class="navbar-nav"><li class="dropdown"><ul class="dropdown-menu"><li><a>Profile</a></li></ul></li></ul>
</body></html>`);

// A stand-in for the game: the API, the edit form, and the save endpoint.
await pg.evaluate(() => {
  window.__posts = [];
  const vehicles = [
    { id: 11, caption: 'Old A', building_id: 1, vehicle_type_caption: 'Type 1 Engine' },
    { id: 12, caption: 'Old B', building_id: 1, vehicle_type_caption: 'Type 1 Engine' },
    { id: 13, caption: 'Old C', building_id: 2, vehicle_type_caption: 'Ambulance' },
  ];
  const buildings = [
    { id: 1, caption: 'Downtown Fire' },
    { id: 2, caption: 'North EMS' },
  ];
  window.fetch = async (url, opts = {}) => {
    url = String(url);
    if (url === '/api/vehicles') return new Response(JSON.stringify(vehicles), {status:200});
    if (url === '/api/buildings') return new Response(JSON.stringify(buildings), {status:200});
    const edit = url.match(/^\/vehicles\/(\d+)\/edit$/);
    if (edit) {
      const v = vehicles.find(x => x.id === Number(edit[1]));
      return new Response(`<html><body><form action="/vehicles/${v.id}" method="post">
        <input name="authenticity_token" value="CSRF-TOKEN-XYZ">
        <input name="vehicle[caption]" value="${v.caption}">
        <input name="vehicle[hospital_max_price]" value="42">
        <input name="vehicle[keep_this]" value="preserve-me">
      </form></body></html>`, {status:200, headers:{'content-type':'text/html'}});
    }
    if (opts.method && opts.method.toLowerCase() === 'post') {
      const entries = {};
      for (const [k, val] of opts.body.entries()) entries[k] = val;
      window.__posts.push({ url, entries });
      return new Response('ok', {status:200});
    }
    throw new Error('unexpected fetch: ' + url);
  };
  window.confirm = () => true;
  window.GM_registerMenuCommand = () => {};
});

await pg.addScriptTag({ content: script });

// The launcher is what failed in the field: the navbar entry depends on markup
// that was never verified, so the floating button must appear on its own.
const fab = await pg.locator('#pf-renamer-fab');
assert.equal(await fab.count(), 1, 'the floating launcher button was not added');
assert.ok(await fab.isVisible(), 'the launcher button is not visible');
console.log('launcher button   : visible, text =', JSON.stringify(await fab.textContent()));

// Opening by clicking it, not by calling the function, is the real path.
await fab.click();
await pg.waitForFunction(() => document.querySelector('#pf-status')?.textContent.includes('vehicles found'));

console.log('status after load :', await pg.textContent('#pf-status'));
await pg.fill('#pf-pattern', '{building} {type} {nn}');
await pg.click('[data-pf="preview"]');
await pg.waitForTimeout(200);
console.log('preview status    :', await pg.textContent('#pf-status'));
const rows = await pg.$$eval('#pf-preview tbody tr', trs =>
  trs.map(tr => [...tr.cells].map(c => c.textContent)));
console.log('preview rows      :', JSON.stringify(rows));

assert.deepEqual(rows, [
  ['Old A', 'Downtown Fire Type 1 Engine 01'],
  ['Old B', 'Downtown Fire Type 1 Engine 02'],
  ['Old C', 'North EMS Ambulance 01'],
], 'preview did not render the expected names (counter must restart per station)');

await pg.click('[data-pf="apply"]');
await pg.waitForFunction(() => document.querySelector('#pf-status')?.textContent.startsWith('Renamed'));
console.log('apply status      :', await pg.textContent('#pf-status'));

const posts = await pg.evaluate(() => window.__posts);
assert.equal(posts.length, 3, 'expected three saves');
assert.equal(new URL(posts[0].url).pathname, '/vehicles/11', 'posted to the wrong url');
assert.equal(posts[0].entries['vehicle[caption]'], 'Downtown Fire Type 1 Engine 01');
assert.equal(posts[0].entries['authenticity_token'], 'CSRF-TOKEN-XYZ', 'CSRF token was lost');
assert.equal(posts[0].entries['vehicle[keep_this]'], 'preserve-me', 'an unrelated field was lost');
assert.equal(posts[0].entries['vehicle[hospital_max_price]'], '42', 'a setting was lost');
console.log('post[0] fields    :', JSON.stringify(posts[0].entries));
// ---- the undo path ----
// The mock now reports the NEW names, as the game would after a rename.
await pg.evaluate(() => {
  const renamed = { 11:'Downtown Fire Type 1 Engine 01', 12:'Downtown Fire Type 1 Engine 02', 13:'North EMS Ambulance 01' };
  const inner = window.fetch;
  window.fetch = async (url, opts = {}) => {
    if (String(url) === '/api/vehicles') {
      return new Response(JSON.stringify([
        { id:11, caption: renamed[11], building_id:1, vehicle_type_caption:'Type 1 Engine' },
        { id:12, caption: renamed[12], building_id:1, vehicle_type_caption:'Type 1 Engine' },
        { id:13, caption: renamed[13], building_id:2, vehicle_type_caption:'Ambulance' },
      ]), {status:200});
    }
    return inner(url, opts);
  };
  window.__posts = [];
  document.getElementById('pf-vehicle-renamer')?.remove();
});

await pg.evaluate(() => window.pfRenamer());
await pg.waitForFunction(() => document.querySelector('#pf-status')?.textContent.includes('vehicles found'));
const hasBackup = await pg.locator('[data-pf="undo"]').count();
console.log('backup offered    :', hasBackup === 1 ? 'yes' : 'NO');
assert.equal(hasBackup, 1, 'the backup panel did not appear after a rename');

await pg.click('[data-pf="undo"]');
await pg.waitForTimeout(200);
const undoRows = await pg.$$eval('#pf-preview tbody tr', trs => trs.map(tr => [...tr.cells].map(c => c.textContent)));
console.log('undo preview      :', JSON.stringify(undoRows));
assert.deepEqual(undoRows, [
  ['Downtown Fire Type 1 Engine 01', 'Old A'],
  ['Downtown Fire Type 1 Engine 02', 'Old B'],
  ['North EMS Ambulance 01', 'Old C'],
], 'undo did not offer the original names back');

await pg.click('[data-pf="apply"]');
await pg.waitForFunction(() => document.querySelector('#pf-status')?.textContent.startsWith('Renamed'));
const undoPosts = await pg.evaluate(() => window.__posts);
assert.equal(undoPosts.length, 3, 'undo did not write three vehicles');
assert.equal(undoPosts[0].entries['vehicle[caption]'], 'Old A', 'undo wrote the wrong name');
assert.equal(undoPosts[0].entries['authenticity_token'], 'CSRF-TOKEN-XYZ', 'undo lost the CSRF token');
console.log('undo post[0]      :', JSON.stringify(undoPosts[0].entries));

console.log('page errors       :', errs.length ? errs : 'none');
assert.equal(errs.length, 0);
console.log('\nALL ASSERTIONS PASSED');
await b.close();
