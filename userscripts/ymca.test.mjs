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
    <div id="mission_4711" mission_id="4711" mission_type_id="3" class="missionSideBarEntry">
      <div id="mission_caption_4711"></div><div id="mission_overview_countdown_4711"></div>
    </div>
    <div id="mission_4712" mission_id="4712" mission_type_id="1"></div>
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
assert.equal(report.ymca, '0.0.7');
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
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="missionmagician"]');
await pg.waitForSelector('[data-do="capture"]');
{
  const warn = await pg.textContent('.ymca-note.warn');
  assert.ok(/no mission open/i.test(warn), 'missionmagician should say why it has nothing to plan');
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
assert.ok(needs.some((r) => r[0] === 'Fire engines' && r[1] === '1'),
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
console.log('missionmagician   : picks nearest, fires change, never dispatches');

// ---- TrackOps: hook the game's own missionDelete, the way the game really announces it ----
// A finished mission does not leave #mission_list — the game adds .mission_deleted to its panel
// and calls missionDelete(id). That is what is hooked here, and 505... ids are the game's.
await pg.evaluate(() => {
  window.__creditsBalance = 500000;
  window.__missionDeleteCalls = [];
  window.__creditsUpdateCalls = [];
  window.missionDelete = (id) => { window.__missionDeleteCalls.push(id); };
  // The game's own balance push — a mission frame sends tellParent('creditsUpdate(2283098);').
  window.creditsUpdate = (n) => { window.__creditsUpdateCalls.push(n); };
  const realFetch = window.fetch;
  window.fetch = async (url, opts) => {
    if (String(url) === '/api/credits') {
      return new Response(JSON.stringify({ credits_user_current: window.__creditsBalance }));
    }
    return realFetch(url, opts);
  };
  localStorage.removeItem('ymca-trackops-log');
  // the MissionMagician capture left us on a mission page; the recorder belongs on the map
  history.replaceState({}, '', '/');
});
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="trackops"]');
await pg.waitForSelector('[data-do="probe"]');
await pg.click('[data-do="probe"]');
await pg.waitForFunction(() => document.querySelector('#to-out')?.value.includes('globals'));
const hooks = JSON.parse(await pg.inputValue('#to-out'));
console.log('trackops hooks    :', JSON.stringify(hooks.globals), 'hooked:', hooks.hooked);
assert.equal(hooks.globals.missionDelete, 'function', 'the game\'s own hook was not seen');
assert.equal(hooks.globals.creditsUpdate, 'function',
  'the balance is announced by the game, not polled for');
assert.equal(hooks.hooked, true, 'TrackOps did not wrap missionDelete');

// A mission ends. The game calls its own function; the wrapper must pass it straight through.
await pg.evaluate(() => {
  window.missionDelete(4711);
  window.creditsUpdate(502340);
});
await pg.waitForFunction(
  () => JSON.parse(localStorage.getItem('ymca-trackops-log') || '[]').length > 0,
  null, { timeout: 8000 });
assert.deepEqual(await pg.evaluate(() => window.__missionDeleteCalls), [4711],
  'the game\'s own missionDelete must still run, exactly once');
assert.deepEqual(await pg.evaluate(() => window.__creditsUpdateCalls), [502340],
  'the game\'s own creditsUpdate must still run, exactly once');
const recorded = await pg.evaluate(() => JSON.parse(localStorage.getItem('ymca-trackops-log')));
console.log('trackops recorded :', JSON.stringify(recorded));
assert.equal(recorded[0].type, 3, 'the mission type id must be read off the panel before it goes');
assert.equal(recorded[0].delta, 2340, 'the payout is the balance difference');
assert.equal(recorded[0].alone, true, 'one ending at a time is attributable');

// It reads as a table, named from the mission list rather than from the page's text.
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="trackops"]');
await pg.waitForSelector('#to-table');
const summary = await pg.$$eval('#to-table tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
console.log('trackops table    :', JSON.stringify(summary));
assert.equal(summary[0][0], 'Forest fire', 'the mission type id was not resolved to its name');
assert.equal(summary[0][3], '2,340', 'the measured payout is not shown');
assert.equal(summary[0][4], '9,000', 'the game\'s own listed figure should sit beside it');

// And the export carries the comparison without carrying a balance.
await pg.click('[data-do="copy"]');
await pg.waitForFunction(() => document.querySelector('#to-out')?.value.includes('byMissionType'));
const exported = JSON.parse(await pg.inputValue('#to-out'));
console.log('trackops export   :', JSON.stringify(exported.byMissionType));
assert.equal(exported.byMissionType[0].averagePaid, 2340);
assert.equal(exported.byMissionType[0].listedByGame, 9000);
assert.ok(!JSON.stringify(exported).includes('502340') && !JSON.stringify(exported).includes('500000'),
  'the export must never carry a balance');
console.log('trackops          : the game announces, TrackOps measures, nothing is assumed');

console.log('page errors       :', errs.length ? errs : 'none');
assert.equal(errs.length, 0);
console.log('\nALL ASSERTIONS PASSED');
await b.close();
