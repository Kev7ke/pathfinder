// Drives the built YMCA userscript against a stand-in for the game.
//
// Needs Playwright and a static server on :8777:
//   python3 -m http.server 8777 & node userscripts/ymca.test.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';


const script = readFileSync(new URL('./ymca.user.js', import.meta.url), 'utf8');
/* VERSION lives in the build and nowhere else, so the test reads it from there rather than
 * carrying a copy that has to be bumped twice. Importing the builder would rebuild on import,
 * so the constant is read as text. */
const VERSION = /VERSION = '([^']+)'/.exec(
    readFileSync(new URL('../tools/build_ymca.mjs', import.meta.url), 'utf8'))[1];
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
    <div id="mission_4711" mission_id="4711" mission_type_id="3" class="missionSideBarEntry">
      <div id="mission_caption_4711"></div><div id="mission_overview_countdown_4711"></div>
    </div>
    <div id="mission_4712" mission_id="4712" mission_type_id="1"></div>
  </div></body></html>`);

await pg.evaluate(() => {
window.__hired = [];
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
    // A type the repo does not ship: exactly what the sweep exists for.
    { id: 14, caption: 'Old D', building_id: 1, vehicle_type: 904 },
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
    m = url.match(/^\/buildings\/(\d+)\/hire_do\/(\d+)$/);
    if (m) {
      window.__hired.push(`${m[1]}/${m[2]}`);
      return new Response('ok');
    }
    m = url.match(/^\/buildings\/(\d+)$/);
    if (m) {
      // The real page: Personnel is a <dt> whose <dd> carries the count, and the station heads
      // itself with its own artwork. Building 4 is written without a count, which must read as
      // unknown rather than as zero.
      const id = Number(m[1]);
      const staff = id === 4 ? '' : '<dt><strong>Personnel:</strong></dt><dd>16 Employees'
        + `<a class="btn btn-default btn-xs" href="/buildings/${id}/hire">Hire new people</a></dd>`;
      return new Response(`<html><body>
        <img class="pull-right" src="/images/building_fire.png" alt="Building fire">
        <a href="/buildings/${m[1]}/vehicles/new">Buy vehicle</a>
        <dl><dt><strong>Vehicles:</strong></dt><dd>3 of 3</dd>${staff}</dl>
        </body></html>`, { headers: { 'content-type': 'text/html' } });
    }
    m = url.match(/^\/buildings\/(\d+)\/vehicles\/new/);
    if (m) {
      // The real page: cards, not a form. The type id is in the buy link, every tab is already
      // in the markup, and what you cannot afford is listed with its buttons disabled.
      const id = m[1];
      const card = (type, name, extra = '') => `
        <div class="col-sm-3"><div class="vehicle_type well">
          <h3>${name}</h3>${extra}
          <a class="btn btn-success disabled" href="/buildings/${id}/vehicle/${id}/${type}/coins?building=${id}">25 Coins</a>
          <a class="btn btn-success disabled" href="/buildings/${id}/vehicle/${id}/${type}/credits?building=${id}">19,000 Credits</a>
        </div></div>`;
      const fire = `
        <ul id="tabs" class="nav nav-tabs">
          <li class="active"><a href="#fire_engine" data-toggle="tab">Firetruck</a></li>
          <li><a href="#ambulance" data-toggle="tab">Ambulance</a></li>
        </ul>
        <div class="tab-content">
          <div role="tabpanel" class="tab-pane active" id="fire_engine">
            ${card(13, 'Quint', '<b>Quint Fire Truck</b>')}
            ${card(33, 'Pumper Tanker')}
            ${card(901, 'Hovercraft Wrangler')}
          </div>
          <div role="tabpanel" class="tab-pane" id="ambulance">
            ${card(5, 'ALS Ambulance',
    '<div class="alert alert-info">Required extension: Ambulance Extension</div>')}
          </div>
        </div>`;
      const police = `<ul id="tabs"><li><a href="#patrol" data-toggle="tab">Patrol</a></li></ul>
        <div class="tab-content"><div role="tabpanel" class="tab-pane" id="patrol">
          ${card(10, 'Patrol car')}</div></div>`;
      const b = buildings.find((x) => x.id === Number(id));
      // A dispatch center has no buy page at all. That is the building, not a breakage.
      if (b && b.building_type === 1) return new Response('Not Found', { status: 404 });
      return new Response(`<html><body>${b && b.building_type === 5 ? police : fire}</body></html>`,
        { headers: { 'content-type': 'text/html' } });
    }
    // A vehicle's own page. Type 13 carries its flags the way a mission window does; type 10's
    // page is built without them, which is the case that has to report itself rather than fail.
    m = url.match(/^\/vehicles\/(\d+)$/);
    if (m) {
      const v = vehicles.find((x) => x.id === Number(m[1]));
      const body = v && (v.vehicle_type === 13 || v.vehicle_type === 904)
        ? `<div vehicle_type_id="${v.vehicle_type}" fire="1" dlk="1" fms="2" custom_="1"></div>`
        : `<div class="panel panel-default"><table class="table"></table></div>
           <form action="/vehicles/${m[1]}/move"></form>`;
      return new Response(`<html><body><div id="vehicle-main">${body}</div></body></html>`,
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
  ['stepops', 'renamer', 'missionmagician', 'recruitroom', 'trackops', 'diagnostics']);
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
assert.ok(!state.includes('Prison cell'),
  'the banner must filter the same way the panel does');

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
// Wait for something only the report carries: the output box already holds the sweep's answer.
await pg.waitForFunction(() => document.querySelector('#ymca-diag-out')?.value.includes('entryPoint'));
const report = JSON.parse(await pg.inputValue('#ymca-diag-out'));
console.log('report keys       :', Object.keys(report).join(', '));
assert.equal(report.ymca, VERSION, 'the report must carry the version the build stamped in');
assert.equal(report.entryPoint, 'navbar', 'the report should say how YMCA was reached');
assert.ok(report.log.length > 0, 'the report carries no log');

// ---- the catalogue reads itself, so no install waits on a release ----
// The buy pages name every type the game sells, and the sweep reads them on its own a few
// seconds after the page settles. Nobody presses anything, and nobody exports anything.
await pg.waitForFunction(
  () => !!localStorage.getItem('ymca-vehicle-types'), null, { timeout: 40000 });
const swept = await pg.evaluate(() =>
  JSON.parse(localStorage.getItem('ymca-vehicle-types') || '{}'));
console.log('swept catalogue   :', JSON.stringify(Object.entries(swept).slice(0, 3)));
assert.ok(Object.keys(swept).length >= 3,
  'the buy pages are read on their own, with nobody pressing anything');
assert.equal(swept['13'].name, 'Quint', 'and the names land where every module reads them');

// A type in the fleet with no flags is learnt on a reload, not six hours later. The first
// version wrote "done" before doing anything, so a vehicle bought after that sat unlearnt.
await pg.evaluate(() => {
  localStorage.removeItem('ymca-missionmagician-types');
  localStorage.removeItem('ymca-diagnostics-typeSweepFailed');
});
await pg.click('[data-do="sweep"]');
await pg.waitForFunction(() => document.querySelector('#ymca-diag-out')?.value.includes('flagsLearnt'));
const sweepNow = JSON.parse(await pg.inputValue('#ymca-diag-out'));
console.log('sweep now         :', JSON.stringify(sweepNow.flagsLearnt),
  '| still without:', JSON.stringify(sweepNow.stillWithoutFlags));
assert.ok(sweepNow.flagsLearnt && sweepNow.flagsLearnt['904'],
  'the fleet is checked on demand, and a type with no flags gets read');
assert.deepEqual(sweepNow.flagsLearnt['904'], ['dlk', 'fire'],
  'and what it reads is what the vehicle\'s own page says');

assert.ok(report.log.some((l) => l.where === 'renamer' || l.where === 'api'),
  'the log did not record what happened');
assert.ok(!JSON.stringify(report).includes('Central Dispatch'),
  'the problem report must not carry building names');
console.log('report endpoints  :', JSON.stringify(report.endpoints));

// ---- the vehicle catalogue, read from the game's own buy pages ----
// Learning names one mission at a time needs somebody to keep playing until a type happens to
// be in range. The buy page lists every one of them, with the id the game uses for it.
await pg.click('[data-do="vehicles"]');
await pg.waitForFunction(() => document.querySelector('#ymca-diag-out')?.value.includes('missingFromDataset'));
const fleet = JSON.parse(await pg.inputValue('#ymca-diag-out'));
console.log('vehicle types     :', JSON.stringify(fleet.types.map((t) => [t.id, t.name, t.youOwn])));
assert.ok(fleet.types.some((t) => t.id === 13 && t.name === 'Quint'),
  'the buy page names every type it sells, so nothing has to be played through to find out');
assert.ok(fleet.types.some((t) => t.id === 10 && t.name === 'Patrol car'),
  'and a different kind of station sells different vehicles, so each kind is asked');
assert.ok(fleet.types.some((t) => t.id === 33 && t.name === 'Pumper Tanker'),
  'the name is the card\'s heading, not the price on its button');
// Every tab is in the markup already, so one page carries the ambulances too.
const als = fleet.types.find((t) => t.id === 5);
console.log('from another tab  :', JSON.stringify(als));
assert.equal(als.category, 'Ambulance', 'the tab a vehicle sits in is the game\'s own grouping');
assert.equal(als.requiredExtension, 'Ambulance Extension',
  'and what it needs before it can be stationed');
assert.equal(fleet.types.find((t) => t.id === 13).longName, 'Quint Fire Truck');
// ---- what a type can do, without waiting for it to be in range of a mission ----
// The buy page names every type and says nothing about what one covers; the flags live on a
// .vehicle_checkbox, which means waiting for a mission. A vehicle's own page is the same vehicle
// without the mission, so it is asked directly — one per type owned.
await pg.click('[data-do="capabilities"]');
await pg.waitForFunction(() => document.querySelector('#ymca-diag-out')?.value.includes('typesAnswered'));
const caps = JSON.parse(await pg.inputValue('#ymca-diag-out'));
console.log('capabilities      :', JSON.stringify(caps.capabilitiesByType),
  'unanswered:', JSON.stringify(caps.unanswered.map((u) => u.typeId)));
assert.deepEqual(caps.capabilitiesByType['13'], ['dlk', 'fire'],
  'the flags come off the vehicle\'s own page, and fms and custom_ are not flags');
assert.deepEqual(caps.unanswered.map((u) => u.typeId), ['10'],
  'a page built without them says so rather than reporting the type as covering nothing');
assert.ok(caps.pageShapeWhereNothingWasFound.elementsWithId.includes('div#vehicle-main'),
  'and hands back what that page is built from, so the next read knows where to look');
assert.ok(!JSON.stringify(caps).includes('Old A'), 'no vehicle name may leave in this one');
// It lands where MissionMagician reads it, so the type is known before a mission asks.
const taught = await pg.evaluate(() =>
  JSON.parse(localStorage.getItem('ymca-missionmagician-types') || '{}')['13']);
console.log('taught            :', JSON.stringify(taught));
assert.deepEqual(taught.caps, ['dlk', 'fire'], 'a sweep teaches the same store a mission does');

console.log('not in dataset    :', JSON.stringify(fleet.missingFromDataset));
assert.deepEqual(fleet.missingFromDataset, [901, 904],
  'a type the repo does not carry is named, so it can be added without comparing two lists');
assert.ok(!JSON.stringify(fleet).includes('FS01'), 'no station name may leave in the fleet export');
// A dispatch center sells nothing, and that must not read like a page that failed to load.
console.log('sells nothing     :', JSON.stringify(fleet.buildingsThatSellNothing.map((b) => b.buildingType)),
  'failed:', JSON.stringify(fleet.buyPagesFailed));
assert.deepEqual(fleet.buildingsThatSellNothing.map((b) => b.buildingType), [1],
  'a building with no buy page is reported as such, not as a failure');
assert.deepEqual(fleet.buyPagesFailed, [], 'so a real failure stays visible on its own');
// And it lands where every module reads it, not just in the clipboard.
const shared = await pg.evaluate(() => JSON.parse(localStorage.getItem('ymca-vehicle-types')));
assert.equal(shared['901'].name, 'Hovercraft Wrangler',
  'a name learnt once must be a name the Renamer has too');
console.log('shared store      :', JSON.stringify(shared['901']));

// ---- one report carries what used to be four buttons ----
console.log('report gathers    :',
  ['interface', 'trackops', 'missionmagician'].filter((k) => k in report).join(', '));
assert.ok(report.interface && report.trackops && report.missionmagician,
  'the one report must fold in the probe and what the other tools have worked out');
assert.ok(Object.keys(report.endpoints).length > 2,
  'the report should say which of every endpoint answered, not just two');
assert.equal(await pg.locator('[data-do="ui"]').count(), 0,
  'the interface probe is part of the report now, not a button of its own');
const probe = report.interface;
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
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="missionmagician"]');
await pg.waitForSelector('[data-do="capture"]');
{
  const warn = await pg.textContent('.ymca-note');
  assert.ok(/nothing to do here/i.test(warn),
    'off a mission it should point at the panel in the mission window, not at itself');
  console.log(`missionmagician   : off a mission, says "${warn.trim().split('.')[0]}"`);
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

// ---- the capture on a mission page, built to what the first real one reported ----
// The dispatch form, the checkbox names and the data attributes below are the ones the game
// actually sent back; the container around them is invented, which is exactly the part the
// capture must describe rather than assume.
await pg.evaluate(() => {
  const page = document.createElement('div');
  page.innerHTML = `
    <div id="mission_general_info" class="col-md-6" data-mission-type="209"
      data-generating-building-id="5680582"><div></div><h3>x</h3><small>y</small></div>
    <div id="missing_text" class="alert alert-danger alert-missing-vehicles"></div>
    <form id="mission-form" action="/missions/505949001/alarm" method="post">
      <input name="utf8" type="hidden" value="x">
      <input type="hidden" name="authenticity_token" value="CSRF-XYZ">
      <a class="aao btn btn-xs" aao_id="2886058" fire="1">Fire Truck</a>
      <div id="vehicle_list_step"><div class="tab-content">
        <div class="tab-pane active" id="all">
        <table id="vehicle_show_table_all" class="table table-striped">
          <tbody id="vehicle_show_table_body_all">
            <tr id="vehicle_element_content_11" class="vehicle_select_table_tr distance_calculation"
              vehicle_id="11" vehicle_caption="F-Q1" vehicle_type="Quint" building="FS01"
              data-distance="3.2" data-direct="0" feuerwehr_lf="1">
              <td class="text-center">
                <input type="checkbox" value="11" class="vehicle_checkbox" id="vehicle_checkbox_11"
                  name="vehicle_ids[]" data-direct="0" data-distance="3.2" fms="2"
                  fire="1" vehicle_type_id="13" data-equipment-types="">
              </td>
              <td><a href="#">FS01</a></td>
            </tr>
          </tbody>
        </table></div>
      </div></div>
      <input type="submit" name="commit" class="btn btn-success" value="Dispatch" id="alert_btn">
    </form>
    <a id="mission_alarm_btn" class="btn btn-success">Dispatch</a>`;
  document.body.append(page);
  history.replaceState({}, '', '/missions/505949001');
});
await pg.click('[data-do="capture"]');
await pg.waitForFunction(() => document.querySelector('#mm-out')?.value.includes('dispatchForm'));
const cap2 = JSON.parse(await pg.inputValue('#mm-out'));
assert.equal(cap2.looksLikeMissionWindow, true, 'a mission page should be recognised as one');
assert.equal(await pg.locator('#mm-wrongpage').isVisible(), false,
  'the wrong-page warning must clear once a real mission page is captured');
console.log('capture url       :', cap2.url);
assert.equal(cap2.url, '/missions/#', 'the mission id must be shaped out of the url');
console.log('dispatch form     :', JSON.stringify(cap2.dispatchForm));
assert.equal(cap2.dispatchForm.id, 'mission-form');
assert.equal(cap2.dispatchForm.action, '/missions/#/alarm', 'the form action was not shaped');
assert.ok(cap2.dispatchForm.fieldNames.includes('authenticity_token'),
  'the capture must show that a CSRF token is among the fields');
assert.ok(!JSON.stringify(cap2).includes('CSRF-XYZ'), 'the capture must never carry a field value');
assert.deepEqual(cap2.dispatchForm.submitNames, ['commit']);
// Walking up rather than guessing is the point: the container is named by the page, not by us.
const chain = cap2.vehicleContainerChain.map((c) => c.tag + (c.id ? '#' + c.id : ''));
console.log('container chain   :', JSON.stringify(chain));
assert.ok(chain.includes('tbody#vehicle_show_table_body_all'),
  'the walk up from a checkbox should name the table body the game actually uses');
assert.equal(cap2.vehicleRow.numericAttrs.vehicle_id, 11,
  'the row must give up its plain attributes, not only the data- ones');
assert.ok(cap2.vehicleRow.class.includes('vehicle_select_table_tr'));
assert.ok(cap2.checkbox.attributes.includes('data-distance:number'),
  'checkbox attributes should be reported by name and type, never by value');
assert.ok(!JSON.stringify(cap2.checkbox).includes('3.2'),
  'the distance to your own station is a value, so it must not be carried');
// vehicle_type_id is a plain attribute, not a data one — that is what the first capture missed.
assert.equal(cap2.checkbox.vehicleTypeId, 13,
  'the vehicle type must come through: it is what matches a row against a requirement');
assert.equal(cap2.aao.count, 1);
assert.ok(cap2.requirementBlocks.some((b) => b.id === 'missing_text' && !b.hasElementChildren),
  'the missing-vehicle block should be reported as text-only');
assert.ok(!JSON.stringify(cap2).includes('F-Q1'), 'no vehicle name may leave in a capture');
console.log('capture on mission: form, container chain and vehicle type id all named');

// ---- MissionMagician plans against the markup the real capture reported ----
// Mission type 3 wants 6 fire stations and brush_extension; its requirements say firetrucks.
// The rows below carry the attributes the game actually puts on its own checkboxes.
await pg.evaluate(() => {
  document.querySelector('#mission_general_info').setAttribute('data-mission-type', '3');
  document.querySelectorAll('#ymca-window').forEach((w) => {});
  const tbody = document.getElementById('vehicle_show_table_body_all');
  const row = (id, dist, attrs) => `
    <tr class="vehicle_select_table_tr" vehicle_id="${id}" data-distance="${dist}">
      <td><input type="checkbox" name="vehicle_ids[]" class="vehicle_checkbox"
        id="vehicle_checkbox_${id}" value="${id}" ${attrs}></td></tr>`;
  tbody.innerHTML = [
    row(1, 9.0, 'vehicle_type_id="33" fire="1" wasser_amount="2500" foam_amount_display="25"'),
    row(2, 1.2, 'vehicle_type_id="33" fire="1" wasser_amount="2500" foam_amount_display="25"'),
    row(3, 3.4, 'vehicle_type_id="3" elw="1"'),
    row(4, 2.0, 'vehicle_type_id="10" fustw="1" fustw_or_police_motorcycle="1"'),
  ].join('');
  window.__changes = 0;
  document.body.addEventListener('change', (e) => {
    if (e.target.classList.contains('vehicle_checkbox')) window.__changes += 1;
  });
});
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="missionmagician"]');
await pg.waitForSelector('#mm-needs');
const needs = await pg.$$eval('#mm-needs tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
console.log('mission needs     :', JSON.stringify(needs));
assert.ok(needs.some((r) => r[3] === 'Fire engines' && r[0] === '1'),
  'the requirement should come from the game\'s own mission list, by data-mission-type');
const tickLabel = await pg.textContent('[data-do="select"]');
console.log('tick button       :', tickLabel.trim());
await pg.click('[data-do="select"]');
await pg.waitForSelector('#mm-done:not([hidden])');
const ticked = await pg.$$eval('.vehicle_checkbox:checked', (b) => b.map((x) => x.value));
console.log('ticked            :', JSON.stringify(ticked));
assert.deepEqual(ticked, ['2'], 'nearest first: the 1.2 km engine, not the 9.0 km one');
assert.equal(await pg.evaluate(() => window.__changes), 1,
  'the game listens for a change event, so one must be dispatched per box');
// The one thing it must never do.
assert.equal(await pg.evaluate(() => window.__posts.filter((p) => /alarm/.test(p.url)).length), 0,
  'MissionMagician must never submit the dispatch form');
console.log('missionmagician   : picks fastest, fires change, never dispatches');

// ---- the panel that lives in the game's own mission window ----
// A separate page, because this is the iframe case: the userscript loads on a page that is
// already a mission, and must put itself there without anyone opening YMCA.
const mission = await b.newPage({ viewport: { width: 1100, height: 900 } });
const missionErrs = [];
mission.on('pageerror', (e) => missionErrs.push(e.message));
await mission.goto('http://localhost:8777/README.md');
await mission.setContent(`<html><body class="dark">
  <div class="container-fluid" id="iframe-inside-container">
    <div class="mission_header_info row">
      <div class="col-md-6" id="mission_general_info" data-mission-type="3"></div>
    </div>
    <div class="alert alert-danger alert-missing-vehicles" id="missing_text"></div>
    <div class="row">
    <div class="col-lg-6" id="col_left">
      <a class="aao btn btn-xs" id="aao_reset" reset="true" href="#">Reset</a>
    </div>
    <div class="col-lg-6" id="col_right"></div>
    </div>
    <form id="mission-form" action="/missions/506003398/alarm" method="post">
      <input type="hidden" name="authenticity_token" value="CSRF-XYZ">
      <table id="vehicle_show_table_all"><tbody id="vehicle_show_table_body_all">
        <tr class="vehicle_select_table_tr" vehicle_id="21" data-distance="1.1">
          <td><input type="checkbox" class="vehicle_checkbox" id="vehicle_checkbox_21" value="21"
            name="vehicle_ids[]" fire="1" vehicle_type_id="33" fms="2"></td>
          <td id="vehicle_sort_21" timevalue="300">05 min.</td>
        </tr>
        <tr class="vehicle_select_table_tr" vehicle_id="22" data-distance="3.9">
          <td><input type="checkbox" class="vehicle_checkbox" id="vehicle_checkbox_22" value="22"
            name="vehicle_ids[]" fire="1" vehicle_type_id="33" fms="2"></td>
          <td id="vehicle_sort_22" timevalue="90">01 min. 30 sec.</td>
        </tr>
      </tbody></table>
      <input type="submit" name="commit" value="Dispatch" id="alert_btn">
    </form>
  </div></body></html>`);
await mission.evaluate(() => {
  window.GM_registerMenuCommand = () => {};
  window.GM_info = { scriptHandler: 'Tampermonkey', version: '5.0' };
  window.I18n = { locale: 'en_US' };
  window.__submits = 0;
  document.getElementById('mission-form').addEventListener('submit', (e) => {
    window.__submits += 1; e.preventDefault();
  });
  window.fetch = async (url) => {
    if (String(url) === '/einsaetze.json') {
      return new Response(JSON.stringify([{
        id: '3', name: 'Forest fire', average_credits: 9000,
        requirements: { firetrucks: 1 }, prerequisites: {}, chances: {},
      }]));
    }
    throw new Error('HTTP 404');
  };
});
await mission.addScriptTag({ content: script });

// It must be there without anyone opening YMCA.
await mission.waitForSelector('#ymca-mm-panel .panel-heading');
assert.equal(await mission.locator('#ymca-window').count(), 0,
  'the panel must appear without YMCA\'s own window being opened');
const where = await mission.evaluate(() =>
  document.getElementById('ymca-mm-panel').parentElement?.id);
console.log('panel placed      : first child of #' + where);
assert.equal(where, 'col_right',
  'it belongs at the top of the right-hand column, where LSS-Manager puts its mission helper');
assert.equal(await mission.evaluate(() =>
  document.getElementById('col_right').firstElementChild.id), 'ymca-mm-panel',
'it must be first in that column, not below whatever else is there');
const panelRows = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
console.log('panel table       :', JSON.stringify(panelRows));
assert.deepEqual(panelRows, [['1', '\u2013', '0', '0', 'Fire engines']],
  'covered is what is committed, and nothing is committed before a box is ticked');
// The row fades between red and green, so let the transition land before measuring.
const paint = async () => { await mission.waitForTimeout(400); return mission.evaluate(() => {
  const t = document.querySelector('#ymca-mm-panel .mm-table');
  const tr = t.querySelector('tbody tr');
  const td = tr.querySelector('td');
  return { cls: t.className, row: tr.className, cell: getComputedStyle(td).backgroundColor };
}); };
const before = await paint();
console.log('paint short       :', JSON.stringify(before));
assert.ok(before.cls.includes('mm-short'), 'red while something is still missing');
assert.equal(before.cell, 'rgb(231, 76, 60)',
  'the cells must carry the colour — the table\'s own background sits behind them');

// Travel time, not map distance: vehicle 22 is further away but arrives in 90s, not 300s.
await mission.click('#ymca-mm-panel [data-do="select"]');
const chosen = await mission.$$eval('.vehicle_checkbox:checked', (b) => b.map((x) => x.value));
console.log('panel ticked      :', JSON.stringify(chosen), '(22 is 3.9km/90s, 21 is 1.1km/300s)');
// Ticking moves Covered, with no redraw, and turns the table green once nothing is missing.
const afterTick = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
const tintAfter = await paint();
console.log('after ticking     :', JSON.stringify(afterTick), JSON.stringify(tintAfter));
assert.equal(afterTick[0][2], '1', 'the Ticked column shows what was ticked');
assert.equal(afterTick[0][3], '1', 'and Covered is There plus Ticked');
assert.ok(tintAfter.cls.includes('mm-ok'), 'green once every requirement is covered');
assert.equal(tintAfter.cell, 'rgb(0, 188, 140)', 'and the cells carry it');
// And unticking by hand takes it straight back, without YMCA being told.
await mission.evaluate(() => {
  const box = document.querySelector('.vehicle_checkbox:checked');
  box.checked = false;
  box.dispatchEvent(new Event('change', { bubbles: true }));
});
await mission.waitForTimeout(150);
const afterUntick = await mission.$$eval('#ymca-mm-panel tbody tr td:nth-child(4)',
  (tds) => tds.map((t) => t.textContent.trim()));
const tintBack = await paint();
console.log('after unticking   :', JSON.stringify(afterUntick), JSON.stringify(tintBack));
assert.equal(afterUntick[0], '0', 'unticking by hand must drop the count again');
assert.ok(tintBack.cls.includes('mm-short'), 'and turn the table red again');
await mission.click('#ymca-mm-panel [data-do="select"]');
assert.deepEqual(chosen, ['22'],
  'ordering must follow the travel time the game prints, not how close the dot is');
assert.equal(await mission.evaluate(() => window.__submits), 0,
  'the panel must never submit the dispatch form');

// ---- a Quint answers two requirements, and what is already there is subtracted ----
// The game flags a Quint fire+dlk and a Rescue Engine fire+rw, so one of them covers a platform
// truck AND an engine. Mission 209 wants 2 platform trucks and 3 engines: two Quints plus one
// plain engine should do it, not two Quints and three engines.
await mission.evaluate(async () => {
  window.__catalogue = [{
    id: '209', name: 'Factory fire minor', average_credits: 2000,
    requirements: { platform_trucks: 2, firetrucks: 3 },
  }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  localStorage.removeItem('ymca-missionmagician-types');
  const realFetch = window.fetch;
  window.fetch = async (url) => (String(url) === '/einsaetze.json'
    ? new Response(JSON.stringify(window.__catalogue)) : realFetch(url));
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '209');
  const tbody = document.getElementById('vehicle_show_table_body_all');
  const row = (id, secs, attrs) => `
    <tr class="vehicle_select_table_tr" vehicle_id="${id}" data-distance="1">
      <td><input type="checkbox" class="vehicle_checkbox" id="vehicle_checkbox_${id}"
        value="${id}" name="vehicle_ids[]" ${attrs}></td>
      <td id="vehicle_sort_${id}" timevalue="${secs}">x</td></tr>`;
  tbody.innerHTML = [
    row(31, 10, 'vehicle_type_id="13" fire="1" dlk="1"'),   // Quint
    row(32, 20, 'vehicle_type_id="13" fire="1" dlk="1"'),   // Quint
    row(33, 30, 'vehicle_type_id="33" fire="1"'),           // Pumper
    row(34, 40, 'vehicle_type_id="33" fire="1"'),           // Pumper
    row(35, 50, 'vehicle_type_id="33" fire="1"'),           // Pumper
  ].join('');
  for (const b of document.querySelectorAll('.vehicle_checkbox:checked')) b.checked = false;
});
await mission.waitForTimeout(900);
const quintPlan = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
console.log('shared duty       :', JSON.stringify(quintPlan));
const tickN = await mission.textContent('#ymca-mm-panel [data-do="select"]');
console.log('tick count        :', tickN.trim());
assert.ok(/Tick 3 vehicles/.test(tickN),
  'two Quints cover both platform trucks and two of the three engines, so one more engine: 3');

// Now put an engine on scene. It must come off the requirement, not be sent again.
await mission.evaluate(() => {
  const t = document.createElement('table');
  t.id = 'mission_vehicle_at_mission';
  t.innerHTML = '<tbody><tr id="vehicle_row_99"><td vehicle_type_id="33">on scene</td></tr></tbody>';
  document.getElementById('col_right').append(t);
  document.getElementById('vehicle_show_table_body_all').append(document.createElement('tr'));
});
await mission.waitForTimeout(900);
const withScene = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
console.log('with one on scene :', JSON.stringify(withScene));
const engines = withScene.find((r) => r[4] === 'Fire engines');
assert.equal(engines[1], '1', 'the engine already at the mission must show in the There column');
const tickAfter = await mission.textContent('#ymca-mm-panel [data-do="select"]');
console.log('tick after        :', tickAfter.trim());
assert.ok(/Tick 2 vehicles/.test(tickAfter),
  'one engine is already there, so only the two Quints are still needed');

// A type whose checkbox carries none of the flags YMCA reads — a HazMat is the real case — is
// learnt with an empty capability set. Empty is not an answer: it means the flags it does carry
// are ones nothing here asks about yet, so it has to stay unknown rather than become "covers
// nothing", or Cancel Unused would send a HazMat home from a HazMat call.
await mission.evaluate(() => {
  const tr = document.createElement('tr');
  tr.className = 'vehicle_select_table_tr';
  tr.setAttribute('vehicle_id', '55');
  tr.setAttribute('data-distance', '9');
  tr.innerHTML = `<td><input type="checkbox" class="vehicle_checkbox" id="vehicle_checkbox_55"
    value="55" name="vehicle_ids[]" vehicle_type_id="902" fms="2"></td>
    <td id="vehicle_sort_55" timevalue="900">15 min.</td>`;
  document.getElementById('vehicle_show_table_body_all').append(tr);
  const scene = document.querySelector('#mission_vehicle_at_mission tbody');
  const on = document.createElement('tr');
  on.id = 'vehicle_row_98';
  on.innerHTML = '<td vehicle_type_id="902">on scene</td>';
  scene.append(on);
});
await mission.waitForTimeout(900);
const flagless = await mission.evaluate(() =>
  JSON.parse(localStorage.getItem('ymca-missionmagician-types'))['902']);
console.log('flagless type     :', JSON.stringify(flagless));
assert.deepEqual(flagless.caps, [], 'the game gave it none of the flags YMCA reads');
const sceneNote = (await mission.textContent('#ymca-mm-panel')).replace(/\s+/g, ' ');
console.log('scene note        :', sceneNote.slice(sceneNote.indexOf('already at the mission'), 200));
assert.ok(/1 whose type has not been seen/.test(sceneNote),
  'an empty flag set is unknown, not nothing, so the panel says what it cannot judge');

// ---- a Rescue Engine covers heavy rescue AND an engine, by the same route ----
// The game flags it fire+rw exactly as it flags a Quint fire+dlk, so this needs no special case;
// the test is here because "no special case" is a claim that has to keep being true.
await mission.evaluate(() => {
  document.getElementById('mission_vehicle_at_mission')?.remove();
  window.__catalogue = [{
    id: '210', name: 'Rescue job', average_credits: 1000,
    requirements: { heavy_rescue_vehicles: 1, firetrucks: 2 },
  }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '210');
  const tbody = document.getElementById('vehicle_show_table_body_all');
  const row = (id, secs, attrs) => `
    <tr class="vehicle_select_table_tr" vehicle_id="${id}" data-distance="1">
      <td><input type="checkbox" class="vehicle_checkbox" id="vehicle_checkbox_${id}"
        value="${id}" name="vehicle_ids[]" ${attrs}></td>
      <td id="vehicle_sort_${id}" timevalue="${secs}">x</td></tr>`;
  tbody.innerHTML = [
    row(41, 10, 'vehicle_type_id="18" fire="1" rw="1"'),   // Rescue Engine
    row(42, 20, 'vehicle_type_id="33" fire="1"'),          // Pumper
    row(43, 30, 'vehicle_type_id="33" fire="1"'),          // Pumper
  ].join('');
});
await mission.waitForTimeout(900);
const rescue = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
console.log('rescue engine     :', JSON.stringify(rescue));
const tickRescue = await mission.textContent('#ymca-mm-panel [data-do="select"]');
console.log('tick rescue       :', tickRescue.trim());
assert.ok(/Tick 2 vehicles/.test(tickRescue),
  'the Rescue Engine covers the heavy rescue and one of the two engines, so one pumper: 2');

// ---- patients want ambulances, and the game keeps them out of `requirements` ----
// The record is the one the player sent back: patients live under additional.possible_patient,
// and the window states the real number for this instance in #patient_missing_requirements.
await mission.evaluate(() => {
  window.__catalogue = [{
    id: '1002', name: 'Hand Pierced By Sharp Catfish Bone', average_credits: 1500,
    requirements: { oneof_fire_engine_or_rescue_or_ladder: 1, firetrucks: 1 },
    chances: { patient_transport: 20 },
    additional: { possible_patient: 1, possible_patient_min: 1 },
  }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '1002');
  const missing = document.createElement('div');
  missing.id = 'patient_missing_requirements';
  missing.className = 'alert alert-danger';
  missing.innerHTML = '<strong>2x</strong> We need: Ambulance';
  document.getElementById('col_right').append(missing);
  const tbody = document.getElementById('vehicle_show_table_body_all');
  const row = (id, secs, attrs) => `
    <tr class="vehicle_select_table_tr" vehicle_id="${id}" data-distance="1">
      <td><input type="checkbox" class="vehicle_checkbox" id="vehicle_checkbox_${id}"
        value="${id}" name="vehicle_ids[]" ${attrs}></td>
      <td id="vehicle_sort_${id}" timevalue="${secs}">x</td></tr>`;
  tbody.innerHTML = [
    row(51, 10, 'vehicle_type_id="33" fire="1"'),                 // pumper
    row(52, 20, 'vehicle_type_id="5" rtw="1" any_rtw="1"'),       // ambulance
    row(53, 30, 'vehicle_type_id="5" rtw="1" any_rtw="1"'),       // ambulance
  ].join('');
});
await mission.waitForTimeout(900);
const withPatients = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
console.log('patients          :', JSON.stringify(withPatients));
const amb = withPatients.find((r) => /Ambulances/.test(r[4]));
assert.ok(amb, 'patients must reach the plan even though `requirements` omits them');
assert.equal(amb[0], '2', 'the window states two, and the window beats the catalogue maximum');
// One glyph per requirement, sized to the text and taking its colour.
const icons = await mission.$$eval('#ymca-mm-panel tbody tr td:last-child svg',
  (els) => els.map((e) => ({
    w: e.getAttribute('width'), stroke: e.getAttribute('stroke'), box: e.getAttribute('viewBox'),
  })));
console.log('row icons         :', JSON.stringify(icons[0]), `x${icons.length}`);
assert.equal(icons.length, withPatients.length, 'every requirement row should carry a glyph');
assert.ok(icons.every((i) => i.stroke === 'currentColor'),
  'the glyphs take the colour around them rather than choosing one');
// The paths run edge to edge in a 20-wide box, so the viewBox has to carry the stroke's
// overhang or the outermost lines come back shaved.
assert.ok(icons.every((i) => /^-[\d.]+ -[\d.]+ /.test(i.box)),
  'the viewBox must leave room for the stroke rather than clipping it');
assert.ok(icons.every((i) => Number(i.w) >= 14 && Number(i.w) <= 18),
  'and read at the size of the text beside them');

// "Ambulance per patient" off means one ambulance, however many patients there are.
// The switch keeps a real checkbox behind it, moved out of sight — clicking the label is what
// a person does, and it must still drive the input the browser reports.
await mission.click('#ymca-mm-panel [data-cfg="ambulancePerPatient"] ~ i');
assert.equal(await mission.isChecked('#ymca-mm-panel [data-cfg="ambulancePerPatient"]'), false,
  'the switch must toggle the checkbox it is drawn over');
await mission.waitForTimeout(600);
const oneAmb = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
console.log('one ambulance     :', JSON.stringify(oneAmb.find((r) => /Ambulances/.test(r[4]))));
assert.equal(oneAmb.find((r) => /Ambulances/.test(r[4]))[0], '1',
  'with the setting off, two patients still want one ambulance');
await mission.click('#ymca-mm-panel [data-cfg="ambulancePerPatient"] ~ i');
await mission.waitForTimeout(600);
// oneof: the pumper answers "an engine, rescue or ladder" AND "firetrucks" at once.
assert.ok(withPatients.some((r) => /engine, rescue or ladder/i.test(r[4])),
  'the oneof_ family must be matched, not left as an unmatched requirement');
const tickPatients = await mission.textContent('#ymca-mm-panel [data-do="select"]');
console.log('tick w/ patients  :', tickPatients.trim());
assert.ok(/Tick 3 vehicles/.test(tickPatients),
  'one pumper covers both fire requirements, plus two ambulances for the patients');

// ---- the versatile vehicles are kept back, and the two kinds take turns ----
// 4 engines wanted, nothing else. Quints (fire+dlk) and Rescue Engines (fire+rw) would each do,
// and both are closer than the pumpers — but spending them as plain engines empties the ladders
// and the rescues. Pumpers go.
await mission.evaluate(() => {
  document.getElementById('mission_vehicle_at_mission')?.remove();
  window.__catalogue = [{ id: '300', name: 'Engines only', requirements: { firetrucks: 4 } }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '300');
  const row = (id, secs, attrs) => `
    <tr class="vehicle_select_table_tr" vehicle_id="${id}" data-distance="1">
      <td><input type="checkbox" class="vehicle_checkbox" id="vehicle_checkbox_${id}"
        value="${id}" name="vehicle_ids[]" ${attrs}></td>
      <td id="vehicle_sort_${id}" timevalue="${secs}">x</td></tr>`;
  document.getElementById('vehicle_show_table_body_all').innerHTML = [
    row(71, 10, 'vehicle_type_id="13" fire="1" dlk="1"'),   // Quint, nearest
    row(72, 20, 'vehicle_type_id="18" fire="1" rw="1"'),    // Rescue Engine
    row(73, 60, 'vehicle_type_id="33" fire="1"'),           // pumpers, further away
    row(74, 70, 'vehicle_type_id="33" fire="1"'),
    row(75, 80, 'vehicle_type_id="33" fire="1"'),
    row(76, 90, 'vehicle_type_id="33" fire="1"'),
  ].join('');
  for (const b of document.querySelectorAll('.vehicle_checkbox:checked')) b.checked = false;
});
await mission.waitForTimeout(900);
await mission.click('#ymca-mm-panel [data-do="select"]');
const plain = await mission.$$eval('.vehicle_checkbox:checked', (b) => b.map((x) => x.value));
console.log('kept back         :', JSON.stringify(plain), '(71 Quint and 72 Rescue are nearer)');
assert.deepEqual(plain, ['73', '74', '75', '76'],
  'a Quint or a Rescue Engine must not be spent as a plain engine while pumpers exist');

// Now only two pumpers, so two of the dual-purpose ones have to go — one of each, not two Quints.
await mission.evaluate(() => {
  document.querySelector('.aao[reset="true"]').click();
  for (const b of document.querySelectorAll('.vehicle_checkbox:checked')) b.checked = false;
  for (const id of ['75', '76']) document.getElementById(`vehicle_checkbox_${id}`).closest('tr').remove();
  const row = (id, secs, attrs) => {
    const tr = document.createElement('tr');
    tr.className = 'vehicle_select_table_tr';
    tr.setAttribute('vehicle_id', id);
    tr.setAttribute('data-distance', '1');
    tr.innerHTML = `<td><input type="checkbox" class="vehicle_checkbox"
      id="vehicle_checkbox_${id}" value="${id}" name="vehicle_ids[]" ${attrs}></td>
      <td id="vehicle_sort_${id}" timevalue="${secs}">x</td>`;
    document.getElementById('vehicle_show_table_body_all').append(tr);
  };
  row(77, 15, 'vehicle_type_id="13" fire="1" dlk="1"');     // a second Quint, still near
});
await mission.waitForTimeout(900);
await mission.click('#ymca-mm-panel [data-do="select"]');
const mixed = await mission.$$eval('.vehicle_checkbox:checked', (b) => b.map((x) => x.value).sort());
console.log('balanced          :', JSON.stringify(mixed), '(71,77 Quints · 72 Rescue · 73,74 pumpers)');
assert.equal(mixed.length, 4, 'four engines wanted, four sent');
assert.ok(mixed.includes('73') && mixed.includes('74'), 'both pumpers go first');
assert.ok(mixed.includes('72'), 'the Rescue Engine is taken before a second Quint');
assert.ok(!(mixed.includes('71') && mixed.includes('77')),
  'both Quints must not go while a Rescue Engine is standing there');

// ---- an alliance mission: not in the catalogue, read from its requirements page ----
// /einsaetze.json only carries missions this player can generate, so an alliance call started
// from somebody else's building is absent. The window links to the answer; this is that page.
await mission.evaluate(() => {
  document.getElementById('mission_vehicle_at_mission')?.remove();
  window.__catalogue = [];                       // the catalogue knows nothing about type 16
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  localStorage.removeItem('ymca-missionmagician-mm-help-16');
  const help = `<html><body><h1>Campside - Gas Canister Explosion</h1><table>
    <tr><td>Average credits</td><td>10600</td></tr>
    <tr><td>Required Fire Stations</td><td>14</td></tr>
    <tr><td>Required Firetrucks</td><td>2</td></tr>
    <tr><td>Required Platform Trucks</td><td>1</td></tr>
    <tr><td>Required Hovercraft Wranglers</td><td>1</td></tr>
    <tr><td>Max. Patients</td><td>3</td></tr></table></body></html>`;
  const realFetch = window.fetch;
  window.fetch = async (url, opts) => {
    if (String(url).startsWith('/einsaetze/16')) {
      return new Response(help, { headers: { 'content-type': 'text/html' } });
    }
    return realFetch(url, opts);
  };
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '16');
  const a = document.createElement('a');
  a.id = 'mission_help';
  a.setAttribute('href', '/einsaetze/16?mission_id=506114091');
  document.getElementById('col_right').append(a);
  document.getElementById('vehicle_show_table_body_all').innerHTML = '';
});
await mission.waitForTimeout(1400);
const alliance = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
console.log('alliance mission  :', JSON.stringify(alliance));
assert.ok(alliance.some((r) => /Fire engines/.test(r[4]) && r[0] === '2'),
  'a mission absent from the catalogue must still be read, from its own requirements page');
assert.ok(alliance.some((r) => /Platform trucks/.test(r[4])), 'and its other vehicle lines with it');
assert.ok(alliance.some((r) => /Ambulances/.test(r[4])),
  'Max. Patients on that page is a patient count like any other');
assert.ok(!alliance.some((r) => /stations/i.test(r[4])),
  'required stations are a precondition for generating the mission, not something to send');
assert.ok(alliance.some((r) => /Hovercraft wranglers/i.test(r[4])),
  'a label with no known key is named rather than dropped');
const remembered = await mission.evaluate(() =>
  JSON.parse(localStorage.getItem('ymca-missionmagician-unmatched') || '[]').map((e) => e.key));
console.log('unmatched keys    :', JSON.stringify(remembered.slice(-3)));
assert.ok(remembered.includes('hovercraft_wranglers'),
  'and carried into the report so it can be added');

// ---- a requirement nothing maps, answered by the page's own vocabulary ----
// The game names the same capability twice: `hazmat_vehicles` in the requirements, and an
// attribute of that name on the checkbox of every vehicle that satisfies it. Where the two line
// up the row is filled without anybody adding a mapping — and only ever against a flag a vehicle
// in this very table actually carries, which is why the Hovercraft Wrangler above stays unmatched.
await mission.evaluate(() => {
  localStorage.removeItem('ymca-missionmagician-mm-help-17');
  const help = `<html><body><h1>Chemical spill</h1><table>
    <tr><td>Required Firetrucks</td><td>1</td></tr>
    <tr><td>Required Snowplows</td><td>2</td></tr></table></body></html>`;
  const realFetch = window.fetch;
  window.fetch = async (url, opts) => {
    if (String(url).startsWith('/einsaetze/17')) {
      return new Response(help, { headers: { 'content-type': 'text/html' } });
    }
    return realFetch(url, opts);
  };
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '17');
  document.getElementById('mission_help').setAttribute('href', '/einsaetze/17');
  const row = (id, secs, attrs) => `<tr class="vehicle_select_table_tr" vehicle_id="${id}"
    data-distance="1"><td><input type="checkbox" class="vehicle_checkbox"
    id="vehicle_checkbox_${id}" value="${id}" name="vehicle_ids[]" ${attrs} fms="2"></td>
    <td id="vehicle_sort_${id}" timevalue="${secs}">x</td></tr>`;
  document.getElementById('vehicle_show_table_body_all').innerHTML = [
    row(80, 10, 'vehicle_type_id="903" snowplow="1"'),
    row(81, 20, 'vehicle_type_id="903" snowplow="1"'),
    row(82, 30, 'vehicle_type_id="33" fire="1"'),
  ].join('');
});
await mission.waitForTimeout(1400);
const hazmat = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
console.log('hazmat row        :', JSON.stringify(hazmat));
const haz = hazmat.find((r) => /Snowplows/i.test(r[4]));
assert.ok(haz, 'a requirement nothing maps is still a row, not a shrug');
assert.equal(haz[0], '2', 'and it wants what the page said it wants');
assert.ok(/read from the page/.test(haz[4]),
  'the panel says this one was read off the checkboxes rather than mapped here');
const hazTick = await mission.textContent('#ymca-mm-panel [data-do="select"]');
console.log('hazmat tick       :', hazTick.trim());
assert.ok(/Tick 3 vehicles/.test(hazTick),
  'two snowplows and an engine: a vehicle YMCA has never heard of is dispatched like any other');
await mission.click('#ymca-mm-panel [data-do="select"]');
const hazTicked = await mission.evaluate(() =>
  [...document.querySelectorAll('.vehicle_checkbox:checked')].map((b) => b.value).sort());
console.log('hazmat ticked     :', JSON.stringify(hazTicked));
assert.deepEqual(hazTicked, ['80', '81', '82'], 'and it is the game\'s own boxes that get ticked');

// A requirement read off the page has to count when vehicles are sent back too, or a HazMat
// would go home from a HazMat call because nothing here named the line keeping it there.
await mission.evaluate(() => {
  window.__backalarms = [];
  window.confirm = () => true;
  // No patients on this one, so the ambulance line is out of the way and the HazMats are the point.
  for (const el of document.querySelectorAll(
    '#patient_button_text, .mission_patient, #patient_missing_requirements')) el.remove();
  const t = document.createElement('table');
  t.id = 'mission_vehicle_at_mission';
  const at = (rowId, typeId) => `<tr id="vehicle_row_${rowId}"><td vehicle_type_id="${typeId}">
    <a class="btn-backalarm-ajax" href="#">back</a></td></tr>`;
  // Two snowplows and two pumpers, against 2 snowplows + 1 engine: one pumper is spare.
  t.innerHTML = `<tbody>${at(90, 903)}${at(91, 903)}${at(92, 33)}${at(93, 33)}</tbody>`;
  document.getElementById('col_right').append(t);
  for (const a of document.querySelectorAll('.btn-backalarm-ajax')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      window.__backalarms.push(a.closest('tr').id.replace('vehicle_row_', ''));
    });
  }
  document.getElementById('vehicle_show_table_body_all').append(document.createElement('tr'));
});
await mission.waitForTimeout(1500);

const hazCancel = await mission.textContent('#ymca-mm-panel [data-do="cancel"]');
console.log('hazmat cancel     :', hazCancel.trim(), '(wants 2 hazmat + 1 engine, 2+2 are there)');
assert.ok(/Cancel 1 unused/.test(hazCancel),
  'one pumper is spare; the two snowplows are held by a line nothing here mapped');
await mission.click('#ymca-mm-panel [data-do="cancel"]');
const hazBack = await mission.evaluate(() => window.__backalarms);
console.log('hazmat sent back  :', JSON.stringify(hazBack));
// The panel's own report has to carry the types, not a count of them: a count cannot be added to
// data/vehicle-types.json, and this is the button that actually gets pressed.
const handover = await mission.evaluate(async () => {
  let copied = null;
  navigator.clipboard.writeText = async (t) => { copied = t; };
  document.querySelector('#ymca-mm-panel [data-do="report"]').click();
  await new Promise((r) => setTimeout(r, 400));
  return JSON.parse(copied);
});
console.log('handover          :', JSON.stringify(handover.capabilitiesByType),
  '| not shipped:', JSON.stringify(handover.notInDataset));
assert.ok(Object.keys(handover.capabilitiesByType).length > 0,
  'the report carries what each type can do, not how many types there are');
assert.ok(handover.notInDataset.includes(903),
  'and says which of them this repo does not ship yet');
assert.deepEqual(hazBack, ['93'], 'a pumper goes home, never a snowplow');
// Out of the way: the next block builds its own scene table, and two with this id would merge.
await mission.evaluate(() => document.getElementById('mission_vehicle_at_mission')?.remove());

// ---- one height, whatever the mission asks for ----
// A panel that grows with the requirement count moves the buttons under the cursor between one
// mission and the next. Three rows and six rows must measure the same.
const frame = await mission.evaluate(() => {
  const box = document.querySelector('#ymca-mm-panel .mm-scroll');
  return { h: Math.round(box.getBoundingClientRect().height), more: box.classList.contains('mm-more'),
    rows: document.querySelectorAll('#ymca-mm-panel tbody tr').length };
});
console.log('panel frame       :', JSON.stringify(frame));
assert.ok(frame.h > 120, 'the frame is built for six rows even when fewer are shown');
assert.equal(frame.more, false, 'and nothing fades while everything fits');
// Now overfill it: the frame holds, and the overflow scrolls behind a fade.
await mission.evaluate(() => {
  const body = document.querySelector('#ymca-mm-panel tbody');
  for (let i = 0; i < 8; i += 1) body.append(body.firstElementChild.cloneNode(true));
  document.querySelector('#ymca-mm-panel .mm-scroll').classList.add('mm-more');
});
const full = await mission.evaluate(() => {
  const box = document.querySelector('#ymca-mm-panel .mm-scroll');
  return { h: Math.round(box.getBoundingClientRect().height), scrolls: box.scrollHeight > box.clientHeight,
    masked: getComputedStyle(box).maskImage !== 'none'
      || getComputedStyle(box).webkitMaskImage !== 'none' };
});
console.log('panel overfilled  :', JSON.stringify(full));
assert.equal(full.h, frame.h, 'eleven rows must not make the panel taller than three');
assert.ok(full.scrolls, 'the rest scroll inside it');
assert.ok(full.masked, 'and fade at the bottom rather than being cut');

// ---- follow-up stays on until it is switched off ----
// It was guarded against — a claim, a lock, an automatic switch-off after dispatching — and the
// guard was wrong more often than the thing it guarded against happened. It is a plain switch.
await mission.evaluate(() => {
  const bar = document.createElement('div');
  bar.innerHTML = `<a class="alert_next" href="#">Dispatch and Next</a>
    <a class="alert_next_alliance" href="#">Dispatch, share and next</a>
    <a id="mission_alarm_btn" href="#">Dispatch</a>`;
  document.body.append(bar);
});
await mission.evaluate(() => {
  const key = 'ymca-missionmagician-cfg';
  const cfg = JSON.parse(localStorage.getItem(key) || '{}');
  cfg.followUp = true;
  localStorage.setItem(key, JSON.stringify(cfg));
  document.querySelector('.alert_next').click();
  document.querySelector('#mission_alarm_btn').click();
});
await mission.waitForTimeout(400);
const stillOn = await mission.evaluate(() =>
  JSON.parse(localStorage.getItem('ymca-missionmagician-cfg') || '{}').followUp);
console.log('follow-up after   : dispatched twice ->', JSON.stringify(stillOn));
assert.equal(stillOn, true, 'dispatching does not switch it off any more');
const noLock = await mission.$('#ymca-mm-panel [data-do="lock"]');
assert.equal(noLock, null, 'and the lock beside it is gone with the thing it was locking');

// ---- D ticks ----
// The button says its key, and the key does what the button does.
await mission.evaluate(() => {
  for (const b of document.querySelectorAll('.vehicle_checkbox:checked')) b.checked = false;
});
const keyLabel = await mission.textContent('#ymca-mm-panel [data-do="select"]');
console.log('tick button       :', keyLabel.replace(/\s+/g, ' ').trim());
assert.ok(/\bd\b/i.test(keyLabel), 'the button names the key, or nobody finds it');
await mission.evaluate(() => document.body.dispatchEvent(
  new KeyboardEvent('keydown', { key: 'd', bubbles: true })));
await mission.waitForTimeout(200);
const byKey = await mission.evaluate(() =>
  document.querySelectorAll('.vehicle_checkbox:checked').length);
console.log('ticked by key     :', byKey);
assert.ok(byKey > 0, 'D ticks what the button would have ticked');
// Not while something is being typed into.
await mission.evaluate(() => {
  for (const b of document.querySelectorAll('.vehicle_checkbox:checked')) b.checked = false;
  const input = document.createElement('input');
  document.body.append(input);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
});
await mission.waitForTimeout(200);
assert.equal(await mission.evaluate(() =>
  document.querySelectorAll('.vehicle_checkbox:checked').length), 0,
'a D typed into a field is a letter, not a dispatch');

// ---- crew training is a sentence, not a vehicle row ----
// `personnel_educations: { gw_gefahrgut: 8 }` asks for eight trained crew, who arrive on whatever
// is sent. As a row it read "Personnel educations, wanted [object Object]".
await mission.evaluate(() => {
  window.__catalogue = [{
    id: '1008', name: 'Chemical spill', average_credits: 100,
    requirements: { firetrucks: 1, personnel_educations: { gw_gefahrgut: 8 } },
    additional: { personnel_educations: { HazMat: 8 } },
  }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '1008');
  document.getElementById('vehicle_show_table_body_all').innerHTML = `
    <tr class="vehicle_select_table_tr" vehicle_id="70" data-distance="1"><td>
    <input type="checkbox" class="vehicle_checkbox" id="vehicle_checkbox_70" value="70"
    name="vehicle_ids[]" vehicle_type_id="33" fire="1" fms="2"></td>
    <td id="vehicle_sort_70" timevalue="10">x</td></tr>`;
});
await mission.waitForTimeout(1200);
const trained = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => tr.cells[4].textContent.trim()));
console.log('with training     :', JSON.stringify(trained));
assert.ok(!trained.some((r) => /Personnel educations|object Object/i.test(r)),
  'a requirement that is not a count of vehicles is not a vehicle row');
const crewNote = (await mission.textContent('#ymca-mm-panel')).replace(/\s+/g, ' ');
console.log('crew note         :', crewNote.slice(crewNote.indexOf('Crew:'), crewNote.indexOf('Crew:') + 70));
assert.ok(/Crew: 8 with HazMat training/.test(crewNote),
  'it is said in the game\'s own English, from additional.personnel_educations');
// It says the requirement and stops there. `Max. Crew` is a cap the player sets per vehicle, so
// counting seats would look measured while being a guess.
assert.ok(!/about \d+|\d+ aboard|\d+ seats/i.test(crewNote),
  'nothing in this window says who is aboard, so nothing here counts them');
// A met row goes green on its own, so what is still missing is the only thing still red.
await mission.click('#ymca-mm-panel [data-do="select"]');
await mission.waitForTimeout(400);
const perRow = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) => trs.map((tr) => ({
  need: tr.cells[4].textContent.trim(),
  green: tr.classList.contains('mm-row-ok'),
})));
console.log('rows green        :', JSON.stringify(perRow));
assert.ok(perRow.some((r) => r.green), 'the line that is covered says so by itself');
// And the game's own figure for what this kind of call pays rides in the heading.
const head = await mission.textContent('#ymca-mm-panel .panel-heading');
console.log('heading           :', head.replace(/\s+/g, ' ').trim());
assert.ok(/~100 credits/.test(head), 'average_credits is the game\'s own number, so it is shown');

// ---- water comes from the tank, not from whatever is nearest ----
// Filling the bar in arrival order sends whatever is close, and what is close is engines: asked
// for 20,000 gallons the panel picked eleven when four were wanted, because each moved it a
// little. One tanker is worth ten of them.
await mission.evaluate(() => {
  window.__catalogue = [{
    id: '1130', name: 'Water test', average_credits: 100,
    requirements: { firetrucks: 1, water_needed: 6000 },
  }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '1130');
  for (const el of document.querySelectorAll(
    '#patient_button_text, .mission_patient, #patient_missing_requirements')) el.remove();
  const row = (id, secs, attrs, water) => `<tr class="vehicle_select_table_tr" vehicle_id="${id}"
    data-distance="1"><td><input type="checkbox" class="vehicle_checkbox"
    id="vehicle_checkbox_${id}" value="${id}" name="vehicle_ids[]" ${attrs} fms="2"
    wasser_amount="${water}"></td><td id="vehicle_sort_${id}" timevalue="${secs}">x</td></tr>`;
  document.getElementById('vehicle_show_table_body_all').innerHTML = [
    // Five nearby engines carrying a little each, one distant tanker carrying the lot.
    row(60, 10, 'vehicle_type_id="13" fire="1" dlk="1"', 500),
    row(61, 20, 'vehicle_type_id="13" fire="1" dlk="1"', 500),
    row(62, 30, 'vehicle_type_id="33" fire="1"', 2500),
    row(63, 40, 'vehicle_type_id="33" fire="1"', 2500),
    row(64, 50, 'vehicle_type_id="33" fire="1"', 2500),
    row(65, 900, 'vehicle_type_id="7" gwl2wasser_only="1"', 3500),
  ].join('');
});
await mission.waitForTimeout(1200);
await mission.click('#ymca-mm-panel [data-do="select"]');
const wet = await mission.evaluate(() =>
  [...document.querySelectorAll('.vehicle_checkbox:checked')].map((b) => b.value).sort());
console.log('water picked      :', JSON.stringify(wet), '(65 is the 3,500 tanker, 15 min away)');
assert.ok(wet.includes('65'), 'the tanker goes even though it is the furthest thing in the list');
assert.ok(wet.length <= 3,
  'and three vehicles cover 6,000 gallons — not five engines chosen for being close');

// ---- RecruitDude: every station's hiring on one screen ----
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="recruitroom"]');
await pg.waitForSelector('#rr-table');
// Rows fill one at a time, so wait for the last of them rather than the first.
await pg.waitForFunction(() => [...document.querySelectorAll('#rr-table .rr-staff')]
  .every((c) => !c.textContent.includes('\u2026')));
const rooms = await pg.$$eval('#rr-table tbody tr', (trs) => trs.map((tr) => ({
  name: tr.cells[2].textContent.trim(),
  crew: tr.cells[3].textContent.trim(),
  art: !!tr.querySelector('img'),
})));
console.log('recruitroom       :', JSON.stringify(rooms.map((r) => [r.name, r.crew, r.art])));
assert.ok(!rooms.some((r) => /Central Dispatch/.test(r.name)),
  'a dispatch center employs nobody, so it is not a row here');
assert.ok(rooms.every((r) => r.art), 'each station carries the artwork its own page heads with');
assert.equal(rooms.find((r) => /FS01/.test(r.name)).crew, '16',
  'the crew count is read from the station page, not guessed at');
assert.equal(rooms.find((r) => /AS01/.test(r.name)).crew, '\u2013',
  'a page that does not state one reads as unknown, never as zero');
// Recruiting spends credits and cannot be undone, so it asks first — and a no sends nothing.
await pg.evaluate(() => { window.confirm = () => false; });
await pg.click('#rr-all');
await pg.click('[data-hire="2"]');
await pg.waitForTimeout(300);
assert.deepEqual(await pg.evaluate(() => window.__hired), [],
  'a preview answered no must send nothing at all');

let asked = null;
await pg.evaluate(() => {
  window.__asked = null;
  window.confirm = (text) => { window.__asked = text; return true; };
});
await pg.click('[data-hire="2"]');
await pg.waitForFunction(() => window.__hired.length >= 4);
asked = await pg.evaluate(() => window.__asked);
console.log('recruit preview   :', JSON.stringify(asked.replace(/\s+/g, ' ').slice(0, 120)));
assert.ok(/cannot be undone/.test(asked), 'the preview has to say there is no taking it back');
assert.ok(/FS01/.test(asked) && /AS01/.test(asked),
  'and name every station it is about to spend credits at');
const hired = await pg.evaluate(() => window.__hired);
console.log('recruited         :', JSON.stringify(hired));
assert.equal(hired.length, 4, 'one request per ticked station');
assert.ok(hired.every((h) => h.endsWith('/2')), 'and the length that was pressed, at each');

// ---- whose mission was it, and when ----
// missionDelete says a mission ended, not that you were in it. An alliance call somebody else
// handled ends on your map the same way, and counting those made "what you have run" a count of
// what the alliance has run. A mission is yours when one of your own vehicles was at it.
await pg.evaluate(() => {
  const now = Date.now();
  localStorage.setItem('ymca-trackops-log', JSON.stringify([
    { at: now - 40 * 24 * 3600e3, mission: '900', type: 3, delta: null, alone: true, mine: true },
    { at: now - 10 * 24 * 3600e3, mission: '901', type: 3, delta: null, alone: true, mine: true },
    { at: now - 3 * 24 * 3600e3, mission: '902', type: 3, delta: null, alone: true, mine: true },
    { at: now - 60e3, mission: '903', type: 3, delta: null, alone: true, mine: false },
  ]));
});
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="trackops"]');
await pg.waitForSelector('#to-table');
const spanOf = async () => (await pg.textContent('.ymca-card')).replace(/\s+/g, ' ').trim();
console.log('span all          :', (await spanOf()).slice(0, 80));
assert.ok(/3 of yours/.test(await spanOf()),
  'four ended nearby, three of them yours: the alliance call is not one you ran');
for (const [span, expect, why] of [
  ['month', '2 of yours', 'the 40-day-old one falls outside a 30-day window'],
  ['week', '1 of yours', 'and the 10-day-old one outside a 7-day one'],
  ['day', '0 of yours', 'today leaves only the alliance call, which is not yours'],
]) {
  await pg.click(`[data-span="${span}"]`);
  await pg.waitForTimeout(250);
  const text = await spanOf();
  console.log('span', span.padEnd(14), ':', text.slice(0, 70));
  assert.ok(text.includes(expect), why);
}
await pg.click('[data-span="all"]');
await pg.waitForTimeout(250);

console.log('page errors       :', errs.length ? errs.slice(0, 3) : 'none');
assert.equal(errs.length, 0);
console.log('\nALL ASSERTIONS PASSED');
await b.close();
