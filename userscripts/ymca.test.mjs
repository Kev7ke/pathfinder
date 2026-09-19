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
await pg.setContent(`<html><head><style>
    .btn-default:hover{background-color:#e6e6e6}
    .navbar-nav>.active>a{background-color:#003a78}
  </style></head><body>
  <nav class="navbar navbar-fixed-top"><div id="navbar-main-collapse">
    <ul class="nav navbar-nav"><li><a href="#">Buildings</a></li></ul>
  </div></nav><p>game</p>
  <div class="credits_user_total">500.000</div>
  <div id="mission_list">
    <div id="mission_4711" data-mission-type-id="3" data-mission-id="4711" class="missionSideBarEntry">
      <div id="mission_caption_4711"></div><div id="mission_overview_countdown_4711"></div>
    </div>
    <div id="mission_4712" data-mission-type-id="1" data-mission-id="4712"></div>
  </div></body></html>`);

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
assert.deepEqual(tiles,
  ['stepops', 'renamer', 'missionmagician', 'trackops', 'diagnostics']);
assert.equal(await pg.locator('#ymca-back').isVisible(), false,
  'the back button should be hidden on the launcher');
await pg.screenshot({ path: '/tmp/ymca-tiles.png' });

await pg.click('.ymca-tile[data-mod="stepops"]');
await pg.waitForSelector('#pf-state');
assert.equal(await pg.locator('#ymca-back').isVisible(), true,
  'the back button should appear inside a tool');

// Escape steps back to the tiles rather than closing the window.
await pg.keyboard.press('Escape');
await pg.waitForTimeout(150);
assert.ok(await pg.locator('.ymca-tile[data-mod]').count() > 0,
  'Escape inside a tool should return to the launcher');
assert.equal(await pg.locator('#ymca-window').count(), 1, 'Escape closed the whole window');
console.log('escape            : tool \u2192 launcher, not straight out');
await pg.click('.ymca-tile[data-mod="stepops"]');
await pg.waitForSelector('#pf-state');

// ---- StepOps, computed from live game data ----
await pg.waitForFunction(() => document.querySelector('#pf-state')?.textContent.includes('fire'));
console.log('pathfinder state  :', (await pg.textContent('#pf-state')).replace(/\s+/g, ' ').trim());
const state = await pg.textContent('#pf-state');
assert.ok(state.includes('2') && state.includes('fire'), 'station counts were not read');
assert.ok(state.includes('Forestry Expansion'), 'a finished extension was not counted');
assert.ok(state.includes('Still being built'), 'an unfinished extension was not flagged');
console.log('buy next          :', (await pg.textContent('#pf-next')).replace(/\s+/g, ' ').trim());
assert.ok((await pg.textContent('#pf-ladder')).includes('Forest fire'), 'the ladder is empty');

// ---- the dispatch area narrows the count to one center's stations ----
const areaOptions = await pg.$$eval('#pf-area option', (o) => o.map((x) => x.textContent));
console.log('dispatch areas    :', JSON.stringify(areaOptions));
assert.ok(areaOptions.includes('Central Dispatch'), 'the dispatch center is not selectable');
await pg.selectOption('#pf-area', { label: 'Central Dispatch' });
await pg.waitForTimeout(250);
const scoped = await pg.textContent('#pf-state');
console.log('scoped to area    :', scoped.replace(/\s+/g, ' ').trim().slice(0, 90));
assert.ok(scoped.includes('in this dispatch area only'), 'the area filter did not take');
assert.ok(scoped.includes('0 ambulance'),
  'AS01 has no dispatch center, so it must drop out of the scoped count');
await pg.selectOption('#pf-area', '');
await pg.waitForTimeout(200);

// ---- only construction that unlocks a mission is listed ----
const buildSum = await pg.textContent('#pf-building-sum');
const buildList = await pg.textContent('#pf-building-list');
console.log('under construction:', buildSum.trim(), '|', buildList.replace(/\s+/g, ' ').trim().slice(0, 80));
assert.ok(buildList.includes('Forestry Expansion'),
  'an extension a mission needs should be listed while it builds');
assert.ok(!buildList.includes('Prison cell'),
  'an extension no mission needs must be hidden, not listed');

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
assert.equal(report.ymca, '0.0.4');
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
assert.ok(probe.stateRules.some((r) => r.includes(':hover')),
  'the stylesheet scan found no hover rule');
assert.equal(probe.navbarEntryPlaced, true);
assert.equal(probe.usingFloatingButton, false);
assert.ok(probe.resting.navbar, 'the probe did not read the navbar styles');
assert.ok('stateRules' in probe, 'the probe must report hover and active rules too');
assert.ok(typeof probe.unreadableSheets === 'number',
  'the probe should say how many stylesheets it could not read');
console.log('probe resting keys:', Object.keys(probe.resting).length, 'elements measured');

// ---- feedback ----
await pg.evaluate(() => { window.prompt = () => 'the tiles are too small'; });
await pg.click('[data-do="feedback"]');
await pg.waitForFunction(() => document.querySelector('#ymca-diag-out')?.value.includes('feedback'));
const fb = JSON.parse(await pg.inputValue('#ymca-diag-out'));
console.log('feedback          :', JSON.stringify({ feedback: fb.feedback, where: fb.where }));
assert.equal(fb.feedback, 'the tiles are too small');
assert.equal(fb.where, 'diagnostics', 'feedback should record which tool was open');
assert.ok(fb.log.length, 'feedback should carry the log');

// ---- the two scaffolds open, and say plainly that they do not work yet ----
for (const [id, button] of [['missionmagician', 'capture'], ['trackops', 'watch']]) {
  await pg.click('#ymca-back');
  await pg.click(`.ymca-tile[data-mod="${id}"]`);
  await pg.waitForSelector(`[data-do="${button}"]`);
  const warn = await pg.textContent('.ymca-note.warn');
  assert.ok(/not (working|counting) yet/i.test(warn), `${id} does not admit it is unfinished`);
  console.log(`${id.padEnd(18)}: opens, says "${warn.trim().split('.')[0]}"`);
}
// MissionMagician's capture must work even with no mission window open.
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="missionmagician"]');
await pg.click('[data-do="capture"]');
await pg.waitForFunction(() => document.querySelector('#mm-out')?.value.includes('structure only'));
const cap = JSON.parse(await pg.inputValue('#mm-out'));
assert.equal(cap.looksLikeMissionWindow, false, 'there is no mission window on this page');
assert.ok(Array.isArray(cap.missing) && cap.missing.length, 'it should report what it did not find');
assert.equal(await pg.locator('#mm-wrongpage').isVisible(), true,
  'a capture taken off a mission page must say so rather than copy an empty one');
console.log('capture           : reports', cap.missing.length, 'selectors not present, warns about the page');

// ---- TrackOps: the watcher names what left the list and what the credits did ----
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="trackops"]');
await pg.waitForSelector('[data-do="watch"]');
await pg.click('[data-do="watch"]');

// The game re-sorts its list by removing a row and putting it straight back. That must not
// read as a finished mission.
await pg.evaluate(() => {
  const list = document.getElementById('mission_list');
  const row = document.getElementById('mission_4712');
  list.removeChild(row);
  list.appendChild(row);
});
await pg.waitForTimeout(100);

// A mission ending: the row goes and stays gone, and the credit counter moves.
await pg.evaluate(() => {
  document.getElementById('mission_4711').remove();
  document.querySelector('.credits_user_total').textContent = '502.340';
});
await pg.waitForTimeout(300);
await pg.click('[data-do="stop"]');
await pg.waitForFunction(() => document.querySelector('#to-out')?.value.includes('mission ids'));
const watch = JSON.parse(await pg.inputValue('#to-out'));
console.log('trackops found    :', JSON.stringify(watch.found));
console.log('trackops counts   :', JSON.stringify(watch.counts));
assert.equal(watch.found.missionList, true, 'the watcher did not find the mission list');
assert.equal(watch.found.creditsSelector, '.credits_user_total',
  'the watcher did not find the credit counter');
assert.equal(watch.counts.departures, 2, 'both removals should be recorded');
assert.equal(watch.counts.resorts, 1, 'the re-sorted row must be marked as having come back');
assert.equal(watch.pairedWithCredits.length, 1,
  'exactly one row left for good, so exactly one pairing');
assert.equal(watch.pairedWithCredits[0].mission, 4711, 'the wrong mission was paired');
assert.equal(watch.pairedWithCredits[0].creditChangesNearby[0].delta, 2340,
  'the credit change was not read as a delta');
assert.ok(!JSON.stringify(watch).includes('502340') && !JSON.stringify(watch).includes('500000'),
  'the report must carry the change, never the balance');
const row0 = watch.missionList.departures.find((d) => d.mission === 4711).row;
console.log('departing row     :', JSON.stringify(row0));
assert.equal(row0.numericAttrs['data-mission-type-id'], 3,
  'the row anatomy must carry the numbers that match a mission back to einsaetze.json');
assert.ok(row0.childIdShapes.includes('mission_caption_#'),
  'child ids should be reported as shapes, with the numbers taken out');
console.log('trackops          : re-sort told apart from a finished mission, credits paired');

console.log('page errors       :', errs.length ? errs : 'none');
assert.equal(errs.length, 0);
console.log('\nALL ASSERTIONS PASSED');
await b.close();
