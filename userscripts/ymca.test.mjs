// Drives the built YMCA userscript against a stand-in for the game.
//
// Needs Playwright and a static server on :8777:
//   python3 -m http.server 8777 & node userscripts/ymca.test.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const script = readFileSync(new URL('./ymca.user.js', import.meta.url), 'utf8');
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'],
});
const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
pg.on('pageerror', (e) => errs.push(e.message));

await pg.goto('http://localhost:8777/README.md');
await pg.setContent(`<html><body>
  <nav class="navbar navbar-fixed-top"><div id="navbar-main-collapse">
    <ul class="nav navbar-nav"><li><a href="#">Buildings</a></li></ul>
  </div></nav><p>game</p></body></html>`);

await pg.evaluate(() => {
  window.__posts = [];
  window.confirm = () => true;
  window.GM_registerMenuCommand = () => {};
  window.GM_info = { scriptHandler: 'Tampermonkey', version: '5.0' };
  window.I18n = { locale: 'en_US' };

  const buildings = [
    { id: 90, caption: 'Central Dispatch', building_type: 1, generates_mission_categories: '#<Set: {}>' },
    { id: 1, caption: 'FS01', building_type: 0, leitstelle_building_id: 90, small_building: true,
      generates_mission_categories: '#<Set: {:fire}>', extensions: [] },
    { id: 2, caption: 'FS02', building_type: 0, leitstelle_building_id: 90,
      generates_mission_categories: '#<Set: {:fire}>',
      extensions: [{ caption: 'Forestry Expansion', type_id: 3, available: true, enabled: true }] },
    { id: 3, caption: 'PO01', building_type: 5, leitstelle_building_id: 90,
      generates_mission_categories: '#<Set: {:police}>', extensions: [] },
    { id: 4, caption: 'AS01', building_type: 3,
      generates_mission_categories: '#<Set: {:ambulance}>',
      extensions: [{ caption: 'Forestry Expansion', type_id: 3, available: false,
        available_at: '2099-01-01 00:00:00 -0400' }] },
  ];
  const vehicles = [
    { id: 11, caption: 'Old A', building_id: 1, vehicle_type: 13 },
    { id: 12, caption: 'Old B', building_id: 1, vehicle_type: 13 },
    { id: 13, caption: 'Old C', building_id: 3, vehicle_type: 10 },
  ];
  const mission = (id, name, credits, pre, filter) => ({
    id: String(id), name, place: '', place_array: [], average_credits: credits,
    icons: ['/a.png'], requirements: { firetrucks: 1 }, chances: {},
    additional: { filter_id: filter }, prerequisites: pre,
    base_mission_id: id, mission_categories: ['fire'],
  });
  const missions = [
    mission(1, 'Bin fire', 110, { main_building: 0, fire_stations: 1 }, 'firehouse_missions'),
    mission(2, 'Room fire', 1400, { main_building: 0, fire_stations: 3 }, 'firehouse_missions'),
    mission(3, 'Forest fire', 9000, { main_building: 0, fire_stations: 6, brush_extension: 2 },
      'firehouse_missions'),
    mission(4, 'Street patrol', 1500, { main_building: 5, police_stations: 2 },
      'police_station_missions'),
    mission(5, 'Riot', 13000, { main_building: 5, police_stations: 7, riot_police: 1 },
      'police_station_missions'),
    mission(6, 'Cardiac arrest', null, { main_building: 3, rescue_stations: 1 },
      'ambulance_station_missions'),
    mission(7, 'Avalanche', 5600, { main_building: 3, rescue_stations: 4, mountain_rescue: 2 },
      'ambulance_station_missions'),
  ];

  const form = (action, field, value) => `<html><body><form action="${action}" method="post">
    <input name="authenticity_token" value="CSRF-XYZ">
    <input name="${field}" value="${value}">
    <input name="keep_this" value="preserve-me"></form></body></html>`;

  window.fetch = async (url, opts = {}) => {
    url = String(url);
    if (url === '/api/buildings') return new Response(JSON.stringify(buildings));
    if (url === '/api/vehicles') return new Response(JSON.stringify(vehicles));
    if (url === '/einsaetze.json') return new Response(JSON.stringify(missions));
    if (url === '/api/credits') return new Response(JSON.stringify({ credits_user_current: 500000 }));
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
    throw new Error('HTTP 404');
  };
});

await pg.addScriptTag({ content: script });

// ---- the way in: the navbar, like LSS Manager ----
const nav = pg.locator('#ymca-nav');
assert.equal(await nav.count(), 1, 'no entry was added to the game navbar');
assert.equal(await pg.locator('#ymca-fab').count(), 0,
  'the floating button should stand down once the navbar entry is placed');
console.log('entry point       : navbar entry, floating button withdrawn');
await nav.click();
await pg.waitForSelector('#ymca-window');

// ---- the launcher: tiles first ----
const tiles = await pg.$$eval('.ymca-tile[data-mod]', (b) => b.map((x) => x.dataset.mod));
console.log('tiles             :', JSON.stringify(tiles));
assert.deepEqual(tiles, ['pathfinder', 'renamer', 'diagnostics']);
assert.equal(await pg.locator('#ymca-back').isVisible(), false,
  'the back button should be hidden on the launcher');
await pg.screenshot({ path: '/tmp/ymca-tiles.png' });

await pg.click('.ymca-tile[data-mod="pathfinder"]');
await pg.waitForSelector('#pf-state');
assert.equal(await pg.locator('#ymca-back').isVisible(), true,
  'the back button should appear inside a tool');

// Escape steps back to the tiles rather than closing the window.
await pg.keyboard.press('Escape');
await pg.waitForTimeout(150);
assert.equal(await pg.locator('.ymca-tile[data-mod]').count(), 3,
  'Escape inside a tool should return to the launcher');
assert.equal(await pg.locator('#ymca-window').count(), 1, 'Escape closed the whole window');
console.log('escape            : tool \u2192 launcher, not straight out');
await pg.click('.ymca-tile[data-mod="pathfinder"]');
await pg.waitForSelector('#pf-state');

// ---- Pathfinder, computed from live game data ----
await pg.waitForFunction(() => document.querySelector('#pf-state')?.textContent.includes('fire'));
console.log('pathfinder state  :', (await pg.textContent('#pf-state')).replace(/\s+/g, ' ').trim());
const state = await pg.textContent('#pf-state');
assert.ok(state.includes('2') && state.includes('fire'), 'station counts were not read');
assert.ok(state.includes('Forestry Expansion'), 'a finished extension was not counted');
assert.ok(state.includes('Still being built'), 'an unfinished extension was not flagged');
console.log('buy next          :', (await pg.textContent('#pf-next')).replace(/\s+/g, ' ').trim());
assert.ok((await pg.textContent('#pf-ladder')).includes('Forest fire'), 'the ladder is empty');

await pg.click('[data-path="P"]');
await pg.waitForTimeout(200);
console.log('police next       :', (await pg.textContent('#pf-next')).replace(/\s+/g, ' ').trim());
assert.ok((await pg.textContent('#pf-ladder')).includes('Riot'), 'the police path did not switch');

// ---- Renamer ----
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="renamer"]');
await pg.waitForSelector('#rn-pattern');
await pg.fill('#rn-pattern', '{building} {type} {x12nn}');
await pg.click('[data-do="preview"]');
await pg.waitForTimeout(250);
const rows = await pg.$$eval('#rn-preview tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent)));
console.log('rename preview    :', JSON.stringify(rows));
assert.ok(rows.some((r) => r[1] === 'FS01 Quint 12'), 'the x12 counter or built-in type name failed');
await pg.click('[data-do="apply"]');
await pg.waitForFunction(() => document.querySelector('#rn-status')?.textContent.startsWith('Renamed'));
const posts = await pg.evaluate(() => window.__posts);
assert.equal(posts[0].entries['vehicle[caption]'], 'FS01 Quint 12');
assert.equal(posts[0].entries.authenticity_token, 'CSRF-XYZ', 'the CSRF token was lost');
assert.equal(posts[0].entries.keep_this, 'preserve-me', 'an unrelated field was lost');
console.log('rename save       :', JSON.stringify(posts[0].entries));

// ---- Diagnostics ----
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="diagnostics"]');
await pg.waitForSelector('[data-do="report"]');
await pg.evaluate(() => { navigator.clipboard.writeText = async () => {}; });
await pg.click('[data-do="report"]');
await pg.waitForFunction(() => document.querySelector('#ymca-diag-out')?.value.includes('ymca'));
const report = JSON.parse(await pg.inputValue('#ymca-diag-out'));
console.log('report keys       :', Object.keys(report).join(', '));
assert.equal(report.ymca, '0.0.1');
assert.equal(report.entryPoint, 'navbar', 'the report should say how YMCA was reached');
assert.ok(report.log.length > 0, 'the report carries no log');
assert.ok(report.log.some((l) => l.where === 'renamer' || l.where === 'api'),
  'the log did not record what happened');
assert.ok(!JSON.stringify(report).includes('Central Dispatch'),
  'the problem report must not carry building names');
console.log('report endpoints  :', JSON.stringify(report.endpoints));

// ---- the interface probe, which is how the styling gets matched ----
await pg.click('[data-do="ui"]');
await pg.waitForFunction(() => document.querySelector('#ymca-diag-out')?.value.includes('navbar'));
const probe = JSON.parse(await pg.inputValue('#ymca-diag-out'));
console.log('probe found       :', JSON.stringify(probe.navbarSelectorsPresent));
assert.ok(probe.navbarSelectorsPresent.includes('#navbar-main-collapse > ul'));
assert.equal(probe.navbarEntryPlaced, true);
assert.equal(probe.usingFloatingButton, false);
assert.ok(probe.navbar, 'the probe did not read the navbar styles');

// ---- feedback ----
await pg.evaluate(() => { window.prompt = () => 'the tiles are too small'; });
await pg.click('[data-do="feedback"]');
await pg.waitForFunction(() => document.querySelector('#ymca-diag-out')?.value.includes('feedback'));
const fb = JSON.parse(await pg.inputValue('#ymca-diag-out'));
console.log('feedback          :', JSON.stringify({ feedback: fb.feedback, where: fb.where }));
assert.equal(fb.feedback, 'the tiles are too small');
assert.equal(fb.where, 'diagnostics', 'feedback should record which tool was open');
assert.ok(fb.log.length, 'feedback should carry the log');

console.log('page errors       :', errs.length ? errs : 'none');
assert.equal(errs.length, 0);
console.log('\nALL ASSERTIONS PASSED');
await b.close();
