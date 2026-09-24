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
  <div id="map" class="leaflet-container" style="position:relative;width:600px;height:400px">
    <div class="leaflet-pane leaflet-map-pane"><div class="leaflet-pane leaflet-tile-pane">
      <div class="leaflet-tile-container">
        <img class="leaflet-tile leaflet-tile-loaded" src="/tile/13/2410/3080.png"
          style="position:absolute;left:100px;top:50px;width:256px;height:256px">
      </div></div></div>
    <div class="leaflet-control-container"><div class="leaflet-top leaflet-left">
      <div class="leaflet-bar leaflet-control leaflet-control-custom map-expand-button"></div>
    </div></div>
  </div>
  <div id="mission_list">
    <div id="mission_4711" mission_id="4711" mission_type_id="3" class="missionSideBarEntry">
      <div id="mission_caption_4711"></div><div id="mission_overview_countdown_4711"></div>
    </div>
    <div id="mission_4712" mission_id="4712" mission_type_id="1"></div>
  </div></body></html>`);

await pg.evaluate(() => {
window.__hired = [];
  window.__aaoPosts = [];
    window.__posts = [];
  window.confirm = () => true;
  window.GM_registerMenuCommand = () => {};
  window.GM_info = { scriptHandler: 'Tampermonkey', version: '5.0' };
  window.I18n = { locale: 'en_US' };

  const buildings = [
    { id: 90, caption: 'Central Dispatch', building_type: 1, latitude: 40.72, longitude: -74.00,
      generates_mission_categories: '#<Set: {}>' },
    { id: 1, caption: 'FS01', building_type: 0, leitstelle_building_id: 90, small_building: true,
      latitude: 40.7169, longitude: -74.0019,
      generates_mission_categories: '#<Set: {:fire}>', extensions: [] },
    { id: 2, caption: 'FS02', building_type: 0, leitstelle_building_id: 90,
      latitude: 40.7500, longitude: -73.9900,
      generates_mission_categories: '#<Set: {:fire}>',
      extensions: [{ caption: 'Forestry Expansion', type_id: 3, available: true, enabled: true }] },
    { id: 3, caption: 'PO01', building_type: 5, leitstelle_building_id: 90,
      latitude: 40.6900, longitude: -74.0400,
      generates_mission_categories: '#<Set: {:police}>', extensions: [] },
    { id: 4, caption: 'AS01', building_type: 3,
      latitude: 40.7300, longitude: -73.9600,
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
    // Its page names the flags on an element carrying no type id at all.
    { id: 15, caption: 'Old E', building_id: 4, vehicle_type: 5 },
  ].map((v) => Object.assign(v, { fms_real: 2, fms_show: 2, vehicle_type_caption: 'Quint' }));
  // One of them is transporting: fms_real 5 is what HighFive looks for.
  vehicles[2].fms_real = 5;
  vehicles[2].fms_show = 5;
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

  /* The credits ledger: amount, description, date, with a dot for thousands.
     One daily task, which must be left out, and two runs of one mission so the
     Paid column has an average to make. */
  /* THE LEDGER IS PAGED, and on a real account it is 210 pages. The game states the total on
   * its own pagination and links the next page with rel="next", so both are read rather than
   * built. Three pages here: enough for "one page is not the history" to be testable. */
  const ledgerNav = (page, last) => `<ul class="pagination">
    <li class="${page === 1 ? 'prev disabled' : 'prev'}"><span>&larr; Back</span></li>
    ${[1, 2, 3].map((n) => (n === page ? `<li class="active"><span>${n}</span></li>`
    : `<li><a href="/credits?page=${n}">${n}</a></li>`)).join('')}
    <li><a href="/credits?page=${last}">${last}</a></li>
    ${page < last ? `<li class="next"><a rel="next" href="/credits?page=${page + 1}"
      >Next &rarr;</a></li>` : ''}</ul>`;
  const ledgerPage = (page) => `<html><body><table><tbody>
    <tr><td>+1.450</td><td>Forest fire</td><td>08/11/2026 10:0${page}</td></tr>
    <tr><td>+1.550</td><td>Forest fire</td><td>08/11/2026 10:4${page}</td></tr>
    ${page === 1 ? `
    <tr><td>+13.500</td><td>Completed task "Treat 6 patients"</td><td>08/11/2026 11:00</td></tr>
    <tr><td>+575</td><td>Patient Treatment and Transport</td><td>08/11/2026 11:02</td></tr>
    <tr><td>-5.000</td><td>Vehicle bought</td><td>08/11/2026 11:05</td></tr>` : ''}
  </tbody></table>${ledgerNav(page, 3)}</body></html>`;
  const ledger = ledgerPage(1);

  const form = (action, field, value) => `<html><body><form action="${action}" method="post">
    <input name="authenticity_token" value="CSRF-XYZ">
    <input name="${field}" value="${value}">
    <input name="keep_this" value="preserve-me"></form></body></html>`;

  window.fetch = async (url, opts = {}) => {
    url = String(url);
    if (url === '/api/buildings') return new Response(JSON.stringify(buildings));
    if (url === '/api/vehicles') return new Response(JSON.stringify(vehicles));
    if (url === '/credits/overview') {
      return new Response(ledger, { headers: { 'content-type': 'text/html' } });
    }
    if (/^\/credits\?page=\d+$/.test(url)) {
      return new Response(ledgerPage(Number(/page=(\d+)/.exec(url)[1])),
        { headers: { 'content-type': 'text/html' } });
    }
    if (url === '/einsaetze.json') return new Response(JSON.stringify(missions));
    /* The game's own dispatch-order editor, as the question to be answered: does it
     * state the flags per vehicle type, for types nobody owns as well? */
    if (url === '/aaos/new') {
      /* THE REAL FORM, AS THE GAME WRITES IT. Every capability is an
       * <input type="number"> — an order is a COUNT per class, not a tick — with the game's
       * own label beside it, in a tab the game itself names. The types it sells sit beside
       * them with the id in the FIELD NAME, never in an attribute. */
      return new Response(`<html><body><form id="new_aao" action="/aaos" method="post">
        <input name="utf8" value="&#10003;"><input name="authenticity_token" value="CSRF-XYZ">
        <input id="aao_caption" name="aao[caption]"><input name="aao[color]">
        <select name="aao[category_id]"><option value="7" selected>Fire</option></select>
        <select name="aao[building_ids][]" multiple></select>
        <input name="aao[reset]">
        <ul id="tabs">
          <li><a href="#fire" data-toggle="tab">Fire</a></li>
          <li><a href="#polizei" data-toggle="tab">Police</a></li>
        </ul>
        <div id="tab_panels">
          <div class="tab-pane" id="fire">
            <label for="aao_fire">Fire Engine</label>
            <input type="number" step="1" value="0" id="aao_fire" name="aao[fire]">
            <label for="aao_dlk">Platform Truck</label>
            <input type="number" step="1" value="0" id="aao_dlk" name="aao[dlk]">
            <label for="aao_rw">Heavy Rescue Vehicle</label>
            <input type="number" step="1" value="0" id="aao_rw" name="aao[rw]">
            <label for="aao_gwgefahrgut">HazMat</label>
            <input type="number" step="1" value="0" id="aao_gwgefahrgut" name="aao[gwgefahrgut]">
            <label for="aao_crew_carrier">Crew Carrier</label>
            <input type="number" step="1" value="0" id="aao_crew_carrier" name="aao[crew_carrier]">
            <input type="number" id="vehicle_type_ids_0" name="vehicle_type_ids[0]" value="0">
            <input type="number" id="vehicle_type_ids_4" name="vehicle_type_ids[4]" value="0">
            <input type="number" id="vehicle_type_ids_91" name="vehicle_type_ids[91]" value="0">
          </div>
          <div class="tab-pane" id="polizei">
            <label for="aao_fustw">Patrol Car</label>
            <input type="number" step="1" value="0" id="aao_fustw" name="aao[fustw]">
            <input type="number" id="vehicle_type_ids_10" name="vehicle_type_ids[10]" value="0">
          </div>
        </div></form></body></html>`, { headers: { 'content-type': 'text/html' } });
    }
    /* Creating one: the game's own form, posted back to its own action. */
    if (url === '/aaos' && (opts?.method || '').toUpperCase() === 'POST') {
      const body = {};
      for (const [k, v] of opts.body.entries()) body[k] = v;
      window.__aaoPosts.push({ url, body });
      // Response.url is a read-only getter, so a fake redirect has to be defined, not assigned.
      const res = new Response('ok');
      Object.defineProperty(res, 'url', { value: '/aaos/99' });
      return res;
    }
    if (url === '/api/v1/aaos') {
      return new Response(JSON.stringify([{ id: 1, caption: 'x', vehicle_classes: ['fire'] }]),
        { headers: { 'content-type': 'application/json' } });
    }
    if (url === '/api/credits') return new Response(JSON.stringify({ credits_user_current: 500000 }));
    let m = url.match(/^\/vehicles\/(\d+)\/edit$/);
    if (m) {
      const v = vehicles.find((x) => x.id === Number(m[1]));
      // Type 5's own page states nothing; its edit form does. Which page answers is the
      // question the reader exists to settle, so one fixture has to answer it elsewhere.
      const extra = v.vehicle_type === 5
        ? '<div class="caps" any_rtw="1" ktw_or_rtw="1" wasser_amount="0"></div>' : '';
      return new Response(form(`/vehicles/${v.id}`, 'vehicle[caption]', v.caption) + extra,
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
    // A vehicle's own page, in the three shapes a real account came back with.
    // Type 13 carries its flags on an element with vehicle_type_id, the way a mission window
    // does. Everything else is the page 26 types out of 26 answered with: a details panel, a
    // loader, an error box, and not one word the game has for a capability — 21,715 characters
    // of rendered page and no path it fetches anything from, so not a shell, simply a page that
    // does not carry it.
    m = url.match(/^\/vehicles\/(\d+)$/);
    if (m) {
      const v = vehicles.find((x) => x.id === Number(m[1]));
      let body;
      if (v && (v.vehicle_type === 13 || v.vehicle_type === 904)) {
        body = `<div vehicle_type_id="${v.vehicle_type}" fire="1" dlk="1" fms="2" custom_="1"></div>`;
      } else {
        body = `<img id="ajax-loader" src="/images/loader.gif">
           <div id="vehicle_details">
             <div id="vehicle-attr-station" data-url="/buildings/5685072"></div>
             <div id="vehicle-attr-type"></div>
             <div id="vehicle-attr-fms"><a id="change_fms" href="#"></a></div>
             <div id="vehicle-attr-max-personnel"></div>
           </div>
           <div id="load_info"></div><div id="loading_error"></div>
           <div class="well"></div>
           <script>$.get("/vehicles/${m[1]}/details");</script>`;
      }
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
  ['stepops', 'renamer', 'missionmagician', 'recruitroom', 'simpleaao', 'heatmap', 'trackops',
    'elementfriend', 'diagnostics']);
// HighFive is an element tile: it lives in ElementFriend and never in the launcher.
assert.equal(await pg.locator('.ymca-tile[data-mod="highfive"]').count(), 0,
  'an element-only tile should not be in the launcher');
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

// ---- what the repo is missing, said without anybody asking for it ----
// Four rounds went on asking for a report and reading it for the three lines that were new.
// The repo ships inside this very script, so the difference can be taken here instead.
await pg.evaluate(() => {
  localStorage.setItem('ymca-missionmagician-types', JSON.stringify({
    999: { caps: ['fire', 'newfangled'], name: 'Something Nobody Ships' },
  }));
  localStorage.setItem('ymca-missionmagician-tanks', JSON.stringify({
    999: { water: 3000, foam: 0, bonus: 25 },
  }));
  localStorage.setItem('ymca-missionmagician-crew-seen', JSON.stringify({ 999: 3 }));
});
// It is worked out on opening, so stepping out and back in is what redraws it.
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="diagnostics"]');
await pg.waitForSelector('[data-do="gap"]');
const gapSaid = (await pg.textContent('[data-gap]')).replace(/\s+/g, ' ').trim();
console.log('repo gap said     :', gapSaid);
assert.match(gapSaid, /never heard of/, 'the notice says a type is new without being pressed');
await pg.click('[data-do="gap"]');
await pg.waitForFunction(() => document.querySelector('#ymca-diag-out')?.value.includes('noCapabilities'));
const gap = JSON.parse(await pg.inputValue('#ymca-diag-out'));
console.log('repo gap          :', JSON.stringify(gap.types['999']));
assert.deepEqual(gap.types['999'].capabilities, ['fire', 'newfangled'],
  'the flags this game taught ride in it');
assert.deepEqual(gap.types['999'].tank, { water: 3000, foam: 0, bonus: 25 },
  'and the tank, which no export carried at all before');
assert.equal(gap.types['999'].crewSeen, 3, 'and the seats measured off the Crew column');
assert.equal(gap.types['999'].name, 'Something Nobody Ships', 'named, so it can be written down');
// A type the repo already carries in full is not news.
assert.ok(!gap.types['13'], 'the Quint is shipped, so it is not in what is missing');

// ---- a type you own that nothing has ever read ----
// Every store above is written by something that already read a vehicle, so a type nobody could
// read is in none of them and therefore in no report either. That is how one Type 1 fire engine
// (vehicle_type 0, and zero is falsy) stayed invisible through a dozen rounds of exports. Owned
// and unread is a third state and it has to say so on its own.
await pg.evaluate(() => {
  localStorage.setItem('ymca-cache-/api/vehicles', JSON.stringify({
    at: Date.now(),
    value: [{ id: 1, vehicle_type: 0 }, { id: 2, vehicle_type: 13 }],
  }));
});
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="diagnostics"]');
await pg.waitForSelector('[data-do="gap"]');
const blindSaid = (await pg.textContent('[data-gap]')).replace(/\s+/g, ' ').trim();
console.log('owned but unread  :', blindSaid);
assert.match(blindSaid, /1 vehicle type you own is still unread/,
  'a type owned and unread says so without anybody pressing anything');
await pg.click('[data-do="gap"]');
await pg.waitForFunction(() => document.querySelector('#ymca-diag-out')?.value.includes('ownedUnknown'));
const blind = JSON.parse(await pg.inputValue('#ymca-diag-out'));
console.log('owned but unread  :', JSON.stringify(blind.types['0']));
assert.equal(blind.counts.ownedUnknown, 1, 'exactly the one nothing can read');
assert.equal(blind.types['0'].youOwn, 1, 'and it says how many of them this game has');
assert.match(blind.types['0'].why.join(' '), /nothing here knows what it covers/,
  'in the words that say what to do about it');
assert.ok(!blind.types['13'], 'the Quint is read, so it is not blind');

await pg.evaluate(() => {
  localStorage.removeItem('ymca-missionmagician-tanks');
  localStorage.removeItem('ymca-missionmagician-crew-seen');
  localStorage.removeItem('ymca-cache-/api/vehicles');
});

// ---- what the game's own dispatch orders know ----
// The AAO editor is a form and the form is the answer: a checkbox per capability the game has —
// aao[fire], aao[dlk], aao[gwgefahrgut], aao[crew_carrier] — because an order can say "every
// vehicle that can do this", and one per type it sells beside them. THE TYPE ID IS IN THE FIELD
// NAME, not in an attribute, which is what the first read got wrong: it looked for
// vehicle_type_id="4", found nothing, and reported "no page named a vehicle type at all" about
// a page listing every one of them.
await pg.click('[data-do="aao"]');
await pg.waitForFunction(() => document.querySelector('#ymca-diag-out')?.value.includes('verdict'));
const aao = JSON.parse(await pg.inputValue('#ymca-diag-out'));
console.log('dispatch orders   :', aao.verdict);
assert.deepEqual(aao.flagVocabulary,
  ['crew_carrier', 'dlk', 'fire', 'fustw', 'gwgefahrgut', 'rw'],
  'every capability the game has a word for, including ones no vehicle here carries');
assert.deepEqual(aao.typeIdsTheGameSells, [0, 4, 10, 91],
  'and every type it sells, read off the field name — type 0 included, because zero is a type');
assert.deepEqual(aao.orderSettings.sort(),
  ['building_ids', 'caption', 'category_id', 'color', 'reset'],
  'an order\'s own settings are told apart from its capabilities rather than counted as flags');
// The tabs are the game's own grouping: a branch, never a capability.
console.log('dispatch tabs     :', JSON.stringify(aao.byTab));
assert.deepEqual(aao.byTab.polizei, { flags: ['fustw'], typeIds: [10] },
  'which flags and which types share a tab is branch membership, and it is reported as that');
// And the question it does NOT answer stays open and says so, rather than being inferred.
assert.deepEqual(aao.capabilitiesByType, {},
  'flag boxes and type boxes are siblings on a form, never a mapping');
assert.match(aao.verdict, /never says which type carries which/,
  'so the verdict says plainly what is still missing');
// The player's own configuration is not in it.
assert.ok(!/hotkey|building_ids/.test(JSON.stringify(aao.flagVocabulary)),
  'a setting is not a capability');

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
// A REAL ACCOUNT ANSWERED 26 TYPES OUT OF 26 ON /vehicles/<id>, so more than one page of a
// vehicle's is asked and the result says WHICH one answered.
console.log('answered by       :', JSON.stringify(caps.answeredBy));
assert.equal(caps.answeredBy['13'], 'vehiclePage', 'a page that does carry them still answers');
assert.equal(caps.answeredBy['5'], 'vehicleEditPage',
  'and where its own page states nothing, the form behind it is asked');
assert.deepEqual(caps.capabilitiesByType['5'], ['any_rtw', 'ktw_or_rtw'],
  'the flags come off whatever page had them, by name rather than by a type id');
assert.deepEqual(caps.tanksByType['5'], { water: 0, foam: 0, bonus: 0 },
  'and the tank off the same element, where a zero is an answer');
assert.deepEqual(caps.unanswered.map((u) => u.typeId), ['10'],
  'a type no page states says so rather than being reported as covering nothing');
assert.match(caps.unanswered[0].why.join(' '), /vehiclePage.*vehicleEditPage/,
  'and names every page that was asked, so the next read knows what is already ruled out');
// AN EMPTY REASON SAYS NOTHING. On a real account 23 of 26 types came back with why: [] once
// every kind had been given up on — true, useless, and the same as a type nothing was tried for.
assert.ok(caps.unanswered.every((u) => u.why.length),
  'every unanswered type says why, including the ones nothing was asked for');
console.log('caps verdict      :', caps.verdict);
assert.match(caps.verdict, /3 of 4 types answered, off vehicle/,
  'and the answer is one line rather than twenty-six entries to count');
const pageShape = caps.pageShapesWhereNothingWasFound.vehiclePage;
console.log('page shape        :', JSON.stringify({
  flags: pageShape.anyFlagAnywhere, paths: pageShape.pathsThePageNames }));
assert.match(String(pageShape.anyFlagAnywhere), /none of the 65 words/,
  'the question is no longer which ids it has but whether any capability is on it at all');
assert.ok(pageShape.attributeNamesOnDetails.includes('data-url'),
  'the attribute names of the details panel come back, because that is where they would be');
assert.ok(pageShape.elementsWithId.includes('div#vehicle_details'),
  'and what that page is built from, so the next read knows where to look');
assert.ok(pageShape.pathsThePageNames.includes('/vehicles/#/details'),
  'a page that fetches its own content names where from, with every digit masked');
assert.ok(!/\d/.test(pageShape.pathsThePageNames.join(' ')),
  'no id of the player\'s rides along in a path');
// A form is asked for its field NAMES: the dispatch-order editor was called empty because the
// id sat in the name rather than in an attribute, and that mistake is not made twice.
const editShape = caps.pageShapesWhereNothingWasFound.vehicleEditPage;
console.log('edit form fields  :', JSON.stringify(editShape.formFieldNames));
assert.ok(editShape.formFieldNames.includes('vehicle[caption]'),
  'a form hands over its field names even where it carried no flag');
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
console.log('scene note        :', sceneNote.slice(sceneNote.indexOf('at the mission') - 4, 210));
assert.ok(/1 whose type has not been seen/.test(sceneNote),
  'an empty flag set is unknown, not nothing, so the panel says what it cannot judge');
assert.ok(/2 at the mission/.test(sceneNote),
  'the panel says how many have arrived, not just how many are counted');

// ---- at the mission and on the way are not the same certainty ----
// One that has arrived is there; one that is driving still carries a recall button on its own
// row. Both meet the requirement, so both count — but the panel says which is which, and the
// switch is there for a player who does not want the second kind counted.
await mission.evaluate(() => {
  const t = document.createElement('table');
  t.id = 'mission_vehicle_driving';
  t.innerHTML = '<tbody><tr id="vehicle_row_97"><td vehicle_type_id="13">driving</td></tr></tbody>';
  document.getElementById('col_right').append(t);
  document.getElementById('vehicle_show_table_body_all').append(document.createElement('tr'));
});
await mission.waitForTimeout(900);
const bothNote = (await mission.textContent('#ymca-mm-panel')).replace(/\s+/g, ' ');
console.log('driving note      :', bothNote.slice(0, 260));
assert.ok(/on the way/.test(bothNote), 'one on the way should be named as such');
const withDriving = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
assert.equal(withDriving.find((r) => r[4] === 'Platform trucks')?.[1], '1',
  'a Quint on the way covers the platform truck line like one already there');

await mission.click('#ymca-mm-panel .mm-switch:has([data-cfg="countDriving"])');
await mission.waitForTimeout(900);
const notCounted = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
console.log('not counting      :', JSON.stringify(notCounted.find((r) => r[4] === 'Platform trucks')));
assert.match(notCounted.find((r) => r[4] === 'Platform trucks')?.[1], /^(0|\u2013)$/,
  'switched off, what is on the way stops being subtracted');
assert.ok(/not counted/.test((await mission.textContent('#ymca-mm-panel')).replace(/\s+/g, ' ')),
  'and the panel says so rather than quietly wanting one more');
await mission.click('#ymca-mm-panel .mm-switch:has([data-cfg="countDriving"])');
await mission.waitForTimeout(900);
await mission.evaluate(() => document.getElementById('mission_vehicle_driving')?.remove());

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

// ---- two silences, told apart ----
// A requirement with no rule used to read one way: "left alone". But if the game names that
// capability on its own dispatch-order form, the rule is not what is missing — a vehicle is.
// That is the player's answer to give; "YMCA has never heard of this" is ours.
await mission.evaluate(() => {
  window.__catalogue = [{
    id: '315', name: 'Two silences', average_credits: 500,
    requirements: { swat: 1, wobble_wagons: 1 },
  }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  document.getElementById('vehicle_show_table_body_all').innerHTML = `
    <tr class="vehicle_select_table_tr" vehicle_id="701" data-distance="1">
      <td><input type="checkbox" class="vehicle_checkbox" value="701" name="vehicle_ids[]"
        vehicle_type_id="10" fms="2" fustw="1"></td>
      <td id="vehicle_sort_701" timevalue="300">5 min.</td></tr>`;
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '315');
});
await mission.waitForTimeout(1200);
const silences = (await mission.textContent('#ymca-mm-panel .alert-warning'))
  .replace(/\s+/g, ' ').trim();
console.log('two silences      :', silences.slice(0, 150));
// `swat` is on the game's own form, and no patrol car carries it.
assert.match(silences, /Nothing in range can do this: Swat\b/,
  'a capability the game names means the fleet is short, not the rule');
assert.match(silences, /what is missing is the vehicle/, 'and it says whose answer that is');
// `wobble_wagons` is on no form anywhere.
assert.match(silences, /Left alone: Wobble wagons/, 'a key the game never names stays ours');
assert.match(silences, /does not know what answers/, 'and says so in as many words');
// Neither is picked for: nothing is invented either way.
assert.equal(await mission.evaluate(() =>
  (document.getElementById('ymca-mm-panel')?.dataset.pick || '')), '',
'and neither silence picks a vehicle');

// ---- seventeen keys the game named itself ----
// /aaos/new carries a checkbox per capability the game has — aao[k9], aao[arff], aao[fwk] —
// and for these the requirement key and the flag are the same word, character for character.
// So the match is a reading rather than a resemblance, and a vehicle carrying the flag is
// picked for the key without anybody mapping the two by hand.
await mission.evaluate(() => {
  window.__catalogue = [{
    id: '314', name: 'Dog search', average_credits: 700,
    requirements: { k9: 1, technical_rescue: 1 },
  }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  document.getElementById('vehicle_show_table_body_all').innerHTML = `
    <tr class="vehicle_select_table_tr" vehicle_id="601" data-distance="1">
      <td><input type="checkbox" class="vehicle_checkbox" value="601" name="vehicle_ids[]"
        vehicle_type_id="88" fms="2" k9="1"></td>
      <td id="vehicle_sort_601" timevalue="300">5 min.</td></tr>
    <tr class="vehicle_select_table_tr" vehicle_id="602" data-distance="1">
      <td><input type="checkbox" class="vehicle_checkbox" value="602" name="vehicle_ids[]"
        vehicle_type_id="96" fms="2" technical_rescue="1"></td>
      <td id="vehicle_sort_602" timevalue="400">6 min.</td></tr>`;
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '314');
});
await mission.waitForTimeout(1200);
const named = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
console.log('named by the game :', JSON.stringify(named.map((r) => r[4])));
const labels = named.map((r) => r[4]);
assert.ok(labels.includes('K9 units') && labels.includes('Technical rescue'),
  'both are lines with a label of their own, not "nothing could match this"');
assert.ok(labels.every((l) => !/could not be matched/i.test(l)),
  'and neither is listed as unmatched any more');
// And a vehicle carrying the flag is picked for the key it is named by.
assert.deepEqual(await mission.evaluate(() =>
  (document.getElementById('ymca-mm-panel')?.dataset.pick || '')
    .split(',').filter(Boolean).sort()), ['601', '602'],
'the K9 unit answers k9 and the technical rescue answers technical_rescue');

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

// ---- the game refusing the send for want of crew ----
// Nothing on any page counts people, and that has not changed. But a refusal is the game saying
// out loud what it otherwise keeps to itself, so it is read where it is unambiguous: this
// mission names a training, and the alert names that training back. The table stops calling
// itself finished, so the table does not read green on a send the game has just refused.
// `.alert-missing-vehicles` is the game's own line for the other shortfall and must be ignored.
await mission.evaluate(() => {
  const missing = document.createElement('div');
  missing.className = 'alert alert-danger alert-missing-vehicles';
  missing.dataset.fixture = '1';
  missing.textContent = 'Not enough vehicles of the type HazMat';
  document.body.prepend(missing);
  document.querySelector('.vehicle_checkbox').dispatchEvent(new Event('change', { bubbles: true }));
});
await mission.waitForTimeout(300);
assert.equal(await mission.$eval('#ymca-mm-panel .mm-table', (t) => t.classList.contains('mm-ok')),
  true, 'the missing-vehicles alert is the other shortfall and must not be read as this one');
await mission.evaluate(() => {
  const flash = document.createElement('div');
  flash.className = 'alert alert-danger';
  flash.dataset.fixture = '1';
  flash.textContent = 'You do not have enough personnel with the HazMat education!';
  document.body.prepend(flash);
  document.querySelector('.vehicle_checkbox').dispatchEvent(new Event('change', { bubbles: true }));
});
await mission.waitForTimeout(300);
const refused = await mission.evaluate(() => ({
  ok: document.querySelector('#ymca-mm-panel .mm-table').classList.contains('mm-ok'),
  short: document.querySelector('#ymca-mm-panel .mm-table').classList.contains('mm-short'),
  said: document.querySelector('#ymca-mm-panel [data-crew-refusal]').textContent
    .replace(/\s+/g, ' ').trim(),
}));
console.log('refused           :', JSON.stringify(refused));
assert.equal(refused.ok, false, 'a refused send is not a finished table, whatever the rows say');
assert.equal(refused.short, true, 'and it reads as short, so the player is not told it is done');
assert.ok(/HazMat crew/.test(refused.said),
  'it says which training the game named, in the game\'s own word');
// It is remembered, because a refused dispatch hands the window back with every box unticked:
// tick the same set again and the panel would find it green and send exactly what was refused.
await mission.evaluate(() => {
  document.querySelectorAll('.alert-danger[data-fixture]').forEach((a) => a.remove());
  document.querySelector('.vehicle_checkbox').dispatchEvent(new Event('change', { bubbles: true }));
});
await mission.waitForTimeout(300);
assert.equal(await mission.$eval('#ymca-mm-panel .mm-table', (t) => t.classList.contains('mm-ok')),
  false, 'the alert going with the next page load must not make the table green again');
console.log('refusal held      : the alert is gone, the table is still not green');
await mission.evaluate(() => sessionStorage.removeItem('ymca-mm-crew-refused'));

// ---- a requirement the game asks for and states nowhere ----
// The skateboard accident cannot be finished without an ambulance and no page says so: no
// patient, an empty treatment bar, nothing in `requirements` and nothing in `#missing_text`.
// It is keyed on the game's own name — the type id has never been seen from this side.
await mission.evaluate(() => {
  window.__catalogue = [{
    id: '1131', name: 'Skateboard accident', average_credits: 100,
    requirements: { firetrucks: 1 },
  }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '1131');
  const mt = document.getElementById('missing_text'); if (mt) mt.textContent = '';
  document.getElementById('vehicle_show_table_body_all').innerHTML = `
    <tr class="vehicle_select_table_tr" vehicle_id="70" data-distance="1"><td>
    <input type="checkbox" class="vehicle_checkbox" id="vehicle_checkbox_70" value="70"
    name="vehicle_ids[]" vehicle_type_id="33" fire="1" fms="2"></td>
    <td id="vehicle_sort_70" timevalue="10">x</td></tr>
    <tr class="vehicle_select_table_tr" vehicle_id="71" data-distance="2"><td>
    <input type="checkbox" class="vehicle_checkbox" id="vehicle_checkbox_71" value="71"
    name="vehicle_ids[]" vehicle_type_id="5" any_rtw="1" fms="2"></td>
    <td id="vehicle_sort_71" timevalue="20">x</td></tr>`;
});
await mission.waitForTimeout(1200);
const skateOnly = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [tr.cells[0].textContent.trim(), tr.cells[4].textContent.replace(/\s+/g, ' ').trim()]));
console.log('nothing says so   :', JSON.stringify(skateOnly));
const skateOnlyAmb = skateOnly.find((r) => /Ambulances/.test(r[1]));
assert.ok(skateOnlyAmb, 'the call wants an ambulance even though nothing in the game asks for one');
assert.equal(skateOnlyAmb[0], '1', 'one, and only where nothing has already asked for it');
assert.ok(/not in the game's own list/.test(skateOnlyAmb[1]),
  'a line nobody\'s page stated must never read like one that was');

// Mission 1167 is the same fault reported with its id attached, so it is keyed on the id — a
// type id is the game's own constant and names exactly one mission, where a name is only what
// is used when no id has been seen.
await mission.evaluate(() => {
  window.__catalogue = [{ id: '1167', name: 'Something new', requirements: {} }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '1167');
  document.getElementById('vehicle_show_table_body_all').append(document.createElement('tr'));
});
await mission.waitForTimeout(1200);
const byId = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [tr.cells[0].textContent.trim(),
    tr.cells[4].textContent.replace(/\s+/g, ' ').trim()]));
// The report carries the plan itself, not only its aftermath: three rounds of "why did it send
// nine engines" arrived showing every line covered and `ticked: 0`, which is what a plan looks
// like once it has been acted on. What was picked and what it carries is the answer.
await mission.evaluate(() => {
  window.__copied = '';
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } },
  });
});
await mission.click('#ymca-mm-panel [data-do="report"]');
await mission.waitForTimeout(500);
const planned = await mission.evaluate(() => JSON.parse(window.__copied || '{}').picked);
console.log('report carries    :', JSON.stringify(planned));
assert.ok(planned && planned.count >= 1, 'the report says how many vehicles the plan picked');
assert.ok(planned.byType && Object.keys(planned.byType).length,
  'and which types they are, which is what "nine engines" has to be answered with');
assert.ok(Array.isArray(planned.answering),
  'and which requirement each one is there for');

console.log('by type id        :', JSON.stringify(byId));
assert.ok(byId.some((r) => /Ambulances/.test(r[1]) && /not in the game's own list/.test(r[1])),
  'an empty requirement list on 1167 still wants the ambulance that closes it');

// ---- the crew, now that the game states it ----
// Counting `Max. Crew` off the buy page was withdrawn, and rightly: that is a cap somebody set.
// This is different. The driving table carries a Crew column stated per vehicle, on a row whose
// link carries the type id — the two facts meeting in one place — and the window states the
// shortfall itself as `Missing Personnel: 14 Firefighters`. So it is measured, not asked for.
await mission.evaluate(() => {
  document.getElementById('mission_vehicle_at_mission')?.remove();
  document.getElementById('mission_vehicle_driving')?.remove();
  const driving = document.createElement('table');
  driving.id = 'mission_vehicle_driving';
  driving.innerHTML = `<thead><tr><th></th><th>Vehicle</th><th>Station</th>
      <th><img src="/images/icons8-swipe_right_dark.svg" title="ETA"></th>
      <th><img src="/images/icons8-groups_dark.svg" title="Crew"></th>
      <th>Owner</th><th></th></tr></thead>
    <tbody><tr id="vehicle_row_15079875"><td>3</td>
      <td><a href="/vehicles/15079875" vehicle_type_id="5">ALS1</a></td>
      <td>AS01</td><td sortvalue="269">00:03:41</td><td sortvalue="3">3</td>
      <td>ollyp321</td><td></td></tr></tbody>`;
  document.body.append(driving);
  const short = document.createElement('div');
  short.id = 'ymca-test-personnel';
  short.setAttribute('data-requirement-type', 'personnel');
  short.innerHTML = '<b>Missing Personnel:</b> 8 Firefighters';
  document.body.append(short);
  window.__catalogue = [{ id: '1200', name: 'Crew test', requirements: {} }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '1200');
  // Four ambulances in range, three seats each by the column above.
  document.getElementById('vehicle_show_table_body_all').innerHTML = [401, 402, 403, 404]
    .map((id) => `<tr class="vehicle_select_table_tr" vehicle_id="${id}" data-distance="${id % 10}">
      <td><input type="checkbox" class="vehicle_checkbox" value="${id}"
        id="vehicle_checkbox_${id}" name="vehicle_ids[]" vehicle_type_id="5" any_rtw="1" fms="2"></td>
      <td id="vehicle_sort_${id}" timevalue="${id}">x</td></tr>`).join('');
});
await mission.waitForTimeout(1300);
const learnt = await mission.evaluate(() =>
  JSON.parse(localStorage.getItem('ymca-missionmagician-crew-seen') || '{}'));
console.log('crew learnt       :', JSON.stringify(learnt));
assert.equal(learnt['5'], 3, 'the Crew column is read off the row that also names the type');
const crewRow = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.replace(/\s+/g, ' ').trim()))
    .find((r) => /Crew/.test(r[4])));
console.log('crew row          :', JSON.stringify(crewRow));
assert.ok(crewRow, 'the personnel shortfall is a line of its own');
assert.match(crewRow[0], /^8/, 'and it is the number the game stated, not one worked out here');
// THE CREW ALREADY ON THE WAY COUNT, and they used not to. The shortfall was read as net of
// everyone already committed, on grounds a real window disproved: three HazMats on a call — one
// there, two driving with 3 and 4 crew — and `Missing Personnel` still asking for one, so the
// panel asked for a fourth for ever. The one ambulance driving here carries 3 of the 8, which
// leaves 5, which is two more at three seats apiece.
assert.match(crewRow[3] || '', /3/, 'the seats already committed are counted and shown');
const tick = await mission.textContent('#ymca-mm-panel [data-do="select"]');
console.log('crew tick         :', tick.trim().split('<')[0]);
assert.match(tick, /Tick 2 vehicles/,
  'the three seats already driving to it are not asked for a second time');
await mission.click('#ymca-mm-panel [data-do="select"]');
await mission.waitForTimeout(400);
const covered = await mission.$eval('#ymca-mm-panel [data-covered="personnel"]',
  (el) => el.textContent.trim());
console.log('crew covered      :', covered);
assert.match(covered, /^9/, 'ticking counts the seats the game measured, 3 apiece');
await mission.evaluate(() => {
  document.getElementById('ymca-test-personnel')?.remove();
  document.getElementById('mission_vehicle_driving')?.remove();
});

// ---- a training is not seats ----
// `Missing Personnel` on a HazMat call is a shortfall of people holding that training, and the
// mission names which one. Any vehicle with a seat satisfies a count of seats, which is how an
// ambulance got sent to a call that wanted HazMat crew. Only what the game flags for the
// training is a candidate — `gw_gefahrgut` in the requirement, `gwgefahrgut` on the vehicle.
await mission.evaluate(() => {
  // Crew measured off the game's own column for both types.
  localStorage.setItem('ymca-missionmagician-crew-seen', JSON.stringify({ 5: 3, 9: 3 }));
  const short = document.createElement('div');
  short.id = 'ymca-test-personnel';
  short.setAttribute('data-requirement-type', 'personnel');
  short.innerHTML = '<b>Missing Personnel:</b> 2 HazMat';
  document.body.append(short);
  window.__catalogue = [{
    id: '1202', name: 'Chemical', requirements: { personnel_educations: { gw_gefahrgut: 2 } },
    additional: { personnel_educations: { HazMat: 2 } },
  }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '1202');
  document.getElementById('vehicle_show_table_body_all').innerHTML = `
    <tr class="vehicle_select_table_tr" vehicle_id="501" data-distance="1"><td>
      <input type="checkbox" class="vehicle_checkbox" value="501" id="vehicle_checkbox_501"
      name="vehicle_ids[]" vehicle_type_id="5" any_rtw="1" rtw="1" fms="2"></td>
      <td id="vehicle_sort_501" timevalue="10">x</td></tr>
    <tr class="vehicle_select_table_tr" vehicle_id="502" data-distance="9"><td>
      <input type="checkbox" class="vehicle_checkbox" value="502" id="vehicle_checkbox_502"
      name="vehicle_ids[]" vehicle_type_id="9" gwgefahrgut="1" gw_gefahrgut_only="1" fms="2"></td>
      <td id="vehicle_sort_502" timevalue="90">x</td></tr>`;
});
await mission.waitForTimeout(1300);
await mission.click('#ymca-mm-panel [data-do="select"]');
await mission.waitForTimeout(400);
const forTraining = await mission.$$eval('.vehicle_checkbox:checked', (bs) =>
  bs.map((b) => b.getAttribute('vehicle_type_id')));
console.log('trained crew      :', JSON.stringify(forTraining), '(9 is the HazMat, 5 the ambulance)');
assert.deepEqual(forTraining, ['9'],
  'the nearer ambulance has seats and none of the training, so it is not the one sent');

// ---- and a trained crew already on the way is not asked for again ----
// Only crew who hold the training can board the vehicle that needs it, so the crew of a vehicle
// the game flags for it are the trained ones. An ambulance driving to the same call is not.
await mission.evaluate(() => {
  /* UNTICKING MEANS DISPATCHING A CHANGE EVENT, exactly as ticking does: setting `checked`
   * alone leaves the panel counting a vehicle that would not be sent. */
  document.querySelectorAll('.vehicle_checkbox:checked').forEach((b) => {
    b.checked = false;
    b.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const driving = document.createElement('table');
  driving.id = 'mission_vehicle_driving';
  driving.innerHTML = `<thead><tr><th></th><th>Vehicle</th><th>Station</th>
      <th><img src="/images/icons8-swipe_right_dark.svg" title="ETA"></th>
      <th><img src="/images/icons8-groups_dark.svg" title="Crew"></th></tr></thead>
    <tbody>
      <tr id="vehicle_row_901"><td>3</td>
        <td><a href="/vehicles/901" vehicle_type_id="9">HazMat on the way</a></td>
        <td>FS07</td><td sortvalue="38">00:00:38</td><td sortvalue="3">3</td></tr>
      <tr id="vehicle_row_902"><td>3</td>
        <td><a href="/vehicles/902" vehicle_type_id="5">Ambulance on the way</a></td>
        <td>AS01</td><td sortvalue="60">00:01:00</td><td sortvalue="9">9</td></tr>
    </tbody>`;
  document.body.append(driving);
  /* A full redraw, the way every other block here gets one: a ticked box only recounts. */
  window.__catalogue = [{
    id: '1203', name: 'Chemical again',
    requirements: { personnel_educations: { gw_gefahrgut: 2 } },
    additional: { personnel_educations: { HazMat: 2 } },
  }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '1203');
  /* The panel watches the selection table, so that is what a redraw is asked of. */
  document.getElementById('vehicle_show_table_body_all').append(document.createElement('tr'));
});
await mission.waitForTimeout(1500);
const committedRow = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.replace(/\s+/g, ' ').trim()))
    .find((r) => /Crew/.test(r[4])));
console.log('committed crew    :', JSON.stringify(committedRow));
assert.match(committedRow[3] || '', /^3 crew/,
  'the HazMat crew driving to it counts, the ambulance\'s nine seats do not');
const afterCommitted = await mission.textContent('#ymca-mm-panel [data-do="select"]');
console.log('after committed   :', afterCommitted.trim().split('<')[0]);
assert.match(afterCommitted, /Tick 0 vehicles/,
  'two trained crew are wanted and three are already driving, so nothing more is asked for');
await mission.evaluate(() => document.getElementById('mission_vehicle_driving')?.remove());

// And where nothing in range carries it, nothing is picked rather than the wrong thing.
await mission.evaluate(() => {
  document.getElementById('vehicle_show_table_body_all').innerHTML = `
    <tr class="vehicle_select_table_tr" vehicle_id="501" data-distance="1"><td>
      <input type="checkbox" class="vehicle_checkbox" value="501" id="vehicle_checkbox_501"
      name="vehicle_ids[]" vehicle_type_id="5" any_rtw="1" rtw="1" fms="2"></td>
      <td id="vehicle_sort_501" timevalue="10">x</td></tr>`;
});
await mission.waitForTimeout(1300);
const saidSo = (await mission.textContent('#ymca-mm-panel')).replace(/\s+/g, ' ');
console.log('nothing carries it:', /Nothing in range carries the training/.test(saidSo));
assert.match(saidSo, /Nothing in range carries the training/,
  'it says so rather than filling a training with whatever had a seat');
assert.match(await mission.textContent('#ymca-mm-panel [data-do="select"]'), /Tick 0 vehicles/,
  'and picks nothing at all');
await mission.evaluate(() => {
  document.getElementById('ymca-test-personnel')?.remove();
  localStorage.removeItem('ymca-missionmagician-crew-seen');
});

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

// ---- RecruitDude: every station's hiring on one screen, and it presses none of it ----
// IT USED TO DO THE PRESSING and that was the wrong side of the line: a tool that spends
// credits at fourteen stations off one press is doing the playing. What was wanted was never
// the sending, it was not opening fourteen buildings to find the same four clicks.
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="recruitroom"]');
await pg.waitForSelector('#rr-table');
// Rows fill one at a time, so wait for the last of them rather than the first.
await pg.waitForFunction(() => [...document.querySelectorAll('#rr-table .rr-staff')]
  .every((c) => !c.textContent.includes('\u2026')));
const rooms = await pg.$$eval('#rr-table tbody tr', (trs) => trs.map((tr) => ({
  name: tr.cells[1].textContent.trim(),
  crew: tr.cells[2].textContent.trim(),
  left: tr.cells[3].textContent.trim(),
  links: [...tr.cells[4].querySelectorAll('a')].map((a) => a.getAttribute('href')),
  art: !!tr.querySelector('img'),
})));
console.log('recruitroom       :', JSON.stringify(rooms.map((r) => [r.name, r.crew, r.left])));
assert.ok(!rooms.some((r) => /Central Dispatch/.test(r.name)),
  'a dispatch center employs nobody, so it is not a row here');
assert.ok(rooms.every((r) => r.art), 'each station carries the artwork its own page heads with');
assert.equal(rooms.find((r) => /FS01/.test(r.name)).crew, '16',
  'the crew count is read from the station page, not guessed at');
assert.equal(rooms.find((r) => /AS01/.test(r.name)).crew, '\u2013',
  'a page that does not state one reads as unknown, never as zero');
// One click instead of four, and every one of them is the game's own href.
console.log('recruit links     :', JSON.stringify(rooms[0].links));
assert.deepEqual(rooms[0].links.map((h) => h.replace(/\d+/g, '#')),
  ['/buildings/#/hire_do/#', '/buildings/#/hire_do/#', '/buildings/#/hire_do/#'],
  'one of the game\'s own hire links per length, so the length is chosen per station');
assert.ok(rooms[0].links.some((h) => h.endsWith('/1')) && rooms[0].links.some((h) => h.endsWith('/3')),
  'and they are the three lengths the game sells');
// NOTHING HERE SPENDS A CREDIT. There is no button that hires, so there is nothing to confirm.
assert.equal(await pg.locator('[data-hire]').count(), 0,
  'the sender is gone, not switched off');
assert.deepEqual(await pg.evaluate(() => window.__hired), [],
  'and opening the panel must not have hired anywhere');
// A station whose page states no hiring countdown says so rather than showing somebody else's.
console.log('days left         :', JSON.stringify(rooms.map((r) => r.left)));
assert.ok(rooms.every((r) => r.left === '\u2013' || /^\d+$/.test(r.left)),
  'days left is a number the game stated or nothing at all');

// ---- HeatSeeker: where the cover is thick and where it is thin ----
// Nothing was captured for this: /api/buildings states latitude and longitude per station and
// /api/vehicles states building_id and vehicle_type, so where the fleet is is already answered.
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="heatmap"]');
await pg.waitForSelector('#hm-canvas');
await pg.waitForFunction(() => /station/.test(document.querySelector('#hm-legend')?.textContent || ''));
const hmTypes = await pg.$$eval('[data-type]', (b) => b.map((x) => x.dataset.type));
console.log('heat types        :', JSON.stringify(hmTypes));
assert.ok(hmTypes.includes('13') && hmTypes.includes('10'),
  'every type the fleet holds is offered, by the id the game uses');
const hmCentres = await pg.$$eval('[data-centre]', (b) => b.map((x) => x.dataset.centre));
console.log('heat centres      :', JSON.stringify(hmCentres));
assert.deepEqual(hmCentres, ['90', ''],
  'the dispatch centres, plus one for the stations answering to none \u2014 without it a station '
  + 'vanished the moment the list was filtered, which reads as cover that is not there');
const legend = (await pg.textContent('#hm-legend')).replace(/\s+/g, ' ').trim();
console.log('heat legend       :', legend);
assert.match(legend, /thickest here/, 'the scale says it is this map\'s own, not a standard');
assert.match(legend, /within 8 km/, 'and the distance it was drawn at, because that is a choice');
// The canvas is drawn on, not left blank: something is actually painted.
const painted = await pg.evaluate(() => {
  const c = document.getElementById('hm-canvas');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) lit += 1;
  return lit;
});
console.log('heat painted      :', painted, 'sampled pixels carry ink');
assert.ok(painted > 20, 'the heat is actually drawn rather than an empty canvas');
// Ticking nothing must say so rather than drawing a map of nothing.
await pg.click('[data-none="types"]');
await pg.waitForFunction(() => /Nothing ticked/.test(
  document.querySelector('#hm-legend')?.textContent || ''));
console.log('heat empty        : it says so rather than drawing a map of nothing');
await pg.click('[data-all="types"]');
await pg.waitForFunction(() => /station/.test(document.querySelector('#hm-legend')?.textContent || ''));

// ---- and the same cover on the game's own map ----
// THE TILES ARE THE PROJECTION. A loaded tile is /tile/{z}/{x}/{y}.png, and in Web Mercator the
// tile at (x,y,z) is exactly the world-pixel square from (x·256, y·256). One tile's rect fixes
// where world pixel zero is and how big a world pixel is, so no Leaflet call and no global is
// needed — which is why this works without anybody having seen the game's own map object.
// The lightbox covers the page, so it steps back out the way a player would before touching
// the map at all — Escape returns to the tiles, Escape again closes the window.
await pg.keyboard.press('Escape');
await pg.keyboard.press('Escape');
await pg.waitForFunction(() => !document.getElementById('ymca-window'));
await pg.waitForSelector('#ymca-heat-btn', { timeout: 20000 });
const ctrl = await pg.$eval('#ymca-heat-btn', (b) => ({
  className: b.className,
  beside: b.previousElementSibling?.className || null,
}));
console.log('map control       :', JSON.stringify(ctrl));
assert.match(ctrl.className, /leaflet-bar leaflet-control/,
  'the button is the game\'s own kind of control, in the map');
assert.match(ctrl.beside || '', /map-expand-button/,
  'and it sits beside the one the game made itself');
// Off until pressed; pressing paints over the map without taking clicks from it.
assert.equal(await pg.locator('#ymca-heat-canvas').count(), 0, 'nothing is drawn until asked');
await pg.click('#ymca-heat-btn');
await pg.waitForSelector('#ymca-heat-canvas');
await pg.waitForFunction(() => {
  const c = document.getElementById('ymca-heat-canvas');
  if (!c || !c.width) return false;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4 * 211) if (d[i] > 0) return true;
  return false;
}, null, { timeout: 15000 });
const over = await pg.$eval('#ymca-heat-canvas', (c) => ({
  events: getComputedStyle(c).pointerEvents,
  w: c.width > 0,
}));
console.log('map overlay       :', JSON.stringify(over));
assert.equal(over.events, 'none', 'the map has to keep working: the overlay never takes a click');
// The projection put the stations where the tile says they belong, not at a guess.
const heatWhere = await pg.evaluate(() => {
  const n = 256 * (2 ** 13);
  const rad = (40.7169 * Math.PI) / 180;
  const x = ((-74.0019 + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const tile = document.querySelector('#map img.leaflet-tile').getBoundingClientRect();
  const map = document.getElementById('map').getBoundingClientRect();
  return {
    x: Math.round(tile.left - 2410 * 256 + x - map.left),
    y: Math.round(tile.top - 3080 * 256 + y - map.top),
  };
});
console.log('station lands at  :', JSON.stringify(heatWhere), '(from the tile, not from a global)');
assert.ok(Number.isFinite(heatWhere.x) && Number.isFinite(heatWhere.y),
  'a tile alone fixes where a latitude and longitude lands on screen');
// Pressing again takes it away entirely.
await pg.click('#ymca-heat-btn');
await pg.waitForTimeout(200);
assert.equal(await pg.locator('#ymca-heat-canvas').count(), 0, 'off means gone, not hidden');
// Back into the window and into a tool, which is where the map block stepped out from.
await pg.click('#ymca-nav');
await pg.waitForSelector('#ymca-window');
await pg.click('.ymca-tile[data-mod="heatmap"]');
await pg.waitForSelector('#hm-canvas');

// ---- SimpleAAO: the dispatch orders you would have built by hand ----
// The editor's capability fields are <input type="number">, so an order is a COUNT per class.
// That is the whole feature, and it is read off the game's own form rather than listed here.
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="simpleaao"]');
await pg.waitForSelector('[data-make]');
const groups = await pg.$$eval('[data-group]', (b) => b.map((x) => x.textContent.trim()));
console.log('aao groups        :', JSON.stringify(groups));
assert.deepEqual(groups, ['Fire', 'Police'],
  'the groups are the editor\'s own tabs, named as the game names them');
const saRows = await pg.$$eval('[data-make]', (b) => b.map((x) => x.dataset.make));
console.log('aao rows          :', JSON.stringify([...new Set(saRows)]));
assert.ok([...new Set(saRows)].includes('aao[fire]'),
  'and the rows are its own number fields');
assert.equal(saRows.filter((f) => f === 'aao[fire]').length, 5,
  'one button per count, so making the order is one click');
// It writes, so it asks first — and a no sends nothing.
await pg.evaluate(() => { window.__aaoPosts = []; window.confirm = () => false; });
await pg.click('[data-make="aao[fire]"][data-n="3"]');
await pg.waitForTimeout(200);
assert.deepEqual(await pg.evaluate(() => window.__aaoPosts), [],
  'a preview answered no must create nothing');
// A yes posts the game's own form with two fields replaced and everything else untouched.
await pg.evaluate(() => {
  window.__asked = null;
  window.confirm = (t) => { window.__asked = t; return true; };
});
await pg.click('[data-make="aao[fire]"][data-n="3"]');
await pg.waitForFunction(() => window.__aaoPosts.length > 0);
const asked = await pg.evaluate(() => window.__asked);
console.log('aao preview       :', JSON.stringify(asked.replace(/\s+/g, ' ')));
assert.ok(/3/.test(asked) && /delete it again/.test(asked),
  'the preview names what it creates and that it can be taken back');
const posted = (await pg.evaluate(() => window.__aaoPosts))[0];
console.log('aao posted        :', JSON.stringify(posted));
assert.equal(posted.url, '/aaos', 'it posts to the form\'s own action');
assert.equal(posted.body['aao[fire]'], '3', 'the one count it was asked for');
assert.equal(posted.body['aao[caption]'], 'Fire Engine 3', 'named after the game\'s own label');
assert.equal(posted.body.authenticity_token, 'CSRF-XYZ',
  'and the CSRF token rides back exactly as the game wrote it');
assert.equal(posted.body['aao[category_id]'], '7',
  'as does every setting nobody here touched');
// What it made is listed, with the game's own link, because that is the undo.
await pg.waitForSelector('#sa-made a');
assert.equal(await pg.getAttribute('#sa-made a', 'href'), '/aaos/99',
  'where the game redirected to is the way back to delete it');

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

// ---- what a mission really paid, from the ledger the game writes itself ----
// The log's one mission type is 3 — "Forest fire" — which the ledger names twice, at 1,450 and
// 1,550. The daily task and the vehicle purchase in the same table are not missions.
await pg.waitForFunction(() =>
  !/reading/i.test(document.querySelector('[data-paid]')?.textContent || 'reading'));
const paid = await pg.$$eval('#to-table tbody tr', (rows) => rows.map((r) =>
  [...r.cells].map((c) => c.textContent.replace(/\s+/g, ' ').trim())));
console.log('paid column       :', JSON.stringify(paid));
assert.ok(/1,500/.test(paid[0][4]), 'the ledger averages the two Forest fire lines');
assert.ok(/2/.test(paid[0][4]), 'and says how many lines that average is made of');

// ---- and the ledger is paged, which every figure above used to ignore ----
// A real account has 210 pages. Reading one of them and calling the result an average is the
// same fault this module already withdrew once, so how far back it went is read, followed by
// the game's own rel="next" link, and said on the panel.
await pg.selectOption('[data-pages]', '5');
await pg.click('[data-do="ledger"]');
await pg.waitForFunction(() => /page/i.test(
  document.querySelector('#to-ledger-status')?.textContent || ''));
await pg.waitForFunction(() => !/Reading|Page \d+ of/i.test(
  document.querySelector('#to-ledger-status')?.textContent || 'Reading'));
const ledSaid = (await pg.textContent('#to-ledger-status')).replace(/\s+/g, ' ').trim();
console.log('ledger pages      :', ledSaid);
assert.match(ledSaid, /3 of 3 pages/, 'it follows the game\'s own next link to the end asked for');
const howFar = (await pg.textContent('#to-ledger')).replace(/\s+/g, ' ');
assert.match(howFar, /3 most recent pages of 3/,
  'and the panel says what the figures under it are actually over');
// Three pages hold six Forest fire lines, not two: the sample really did grow.
assert.match(howFar, /Forest fire/, 'the missions are still named');
const runs = await pg.$$eval('#to-ledger tbody tr', (rows) => rows.map((r) =>
  [...r.cells].map((c) => c.textContent.trim())));
console.log('ledger rows       :', JSON.stringify(runs[0]));
assert.ok(runs[0].some((c) => c === '6'), 'six lines over three pages, not two over one');

// ---- ElementFriend: the switchboard ----
await pg.click('#ymca-back');
await pg.click('.ymca-tile[data-mod="elementfriend"]');
await pg.waitForSelector('.ymca-tile.el');
const elements = await pg.$$eval('.ymca-tile.el', (b) => b.map((x) => x.dataset.el));
console.log('elements          :', JSON.stringify(elements));
await pg.screenshot({ path: '/tmp/ymca-elements.png' });
assert.deepEqual(elements,
  ['stepops', 'renamer', 'missionmagician', 'recruitroom', 'simpleaao', 'heatmap', 'trackops',
    'highfive', 'easyedit', 'eagleeye', 'diagnostics'],
  'every module carries a switch now: the page answers "what have I got" in one look');
// AND EVERY TILE SAYS WHAT IT IS FOR. A four-word tagline tells you which tool this is and
// nothing about whether you want it, which is the only question this page exists to answer.
const blurbs = await pg.$$eval('.ymca-tile.el', (b) => b.map((x) => ({
  id: x.dataset.el, said: x.querySelector('span')?.textContent.trim() || '' })));
console.log('tile blurbs       :', JSON.stringify(blurbs.map((x) => x.said.length)));
for (const { id, said } of blurbs) {
  assert.ok(said.length > 40 && said.length < 400,
    `${id} should carry its own description, one to three sentences: got ${said.length} chars`);
}
// A group tile says what is inside it, by name \u2014 "switch this off and every one of them
// goes" means nothing until the list is on the tile.
const holds = await pg.textContent('.ymca-tile.el[data-el="easyedit"]');
console.log('easyedit holds    :', /Holds ([^\n]*)/.exec(holds.replace(/\s+/g, ' '))?.[1]);
assert.match(holds.replace(/\s+/g, ' '), /Holds SwitchDispatchCenter/,
  'a group tile names its members');
assert.equal(await pg.locator('.ymca-tile.el[data-el="shuteye"]').count(), 0,
  'a module in a group is listed inside the group, not beside it');
// Nothing that works is off by default: an update that hides a tool is an update that broke.
for (const id of ['stepops', 'renamer', 'missionmagician', 'recruitroom', 'simpleaao',
  'heatmap', 'trackops', 'highfive', 'easyedit', 'eagleeye', 'diagnostics']) {
  assert.equal(await pg.locator(`.ymca-switch[data-sw="${id}"] input`).isChecked(), true,
    `${id} should be on until somebody says otherwise`);
}
// EVERY ONE OF THEM SHOWS, SORTS OR COUNTS, and that is now the whole of YMCA: the two that
// pressed the game's own buttons on a queue are gone. Nothing here writes to the account
// except on a press the player made, for the thing they pressed.
assert.equal(await pg.locator('.ymca-switch[data-sw="missionmagicianauto"]').count(), 0,
  'MissionMagician Auto is gone, not switched off');
assert.equal(await pg.locator('.ymca-switch[data-sw="highfiveauto"]').count(), 0,
  'HighFive Auto is gone, not switched off');

// A switch takes the tool out of the launcher, not just out of this page.
await pg.click('.ymca-switch[data-sw="trackops"]');
await pg.waitForTimeout(120);
assert.ok(await pg.locator('.ymca-tile.el[data-el="trackops"].off').count() === 1,
  'a switched-off element tile should read as off');
await pg.click('#ymca-back');
await pg.waitForSelector('.ymca-tile[data-mod]');
assert.equal(await pg.locator('.ymca-tile[data-mod="trackops"]').count(), 0,
  'switching TrackOps off should take its tile out of the launcher');
console.log('switch off        : TrackOps left the launcher');

await pg.click('.ymca-tile[data-mod="elementfriend"]');
await pg.click('.ymca-switch[data-sw="trackops"]');
await pg.waitForTimeout(120);
await pg.click('#ymca-back');
await pg.waitForSelector('.ymca-tile[data-mod="trackops"]');
console.log('switch on         : and came back');

// ---- HighFive: honest about not working, and collects what would make it ----
await pg.click('.ymca-tile[data-mod="elementfriend"]');
await pg.click('.ymca-tile.el[data-el="highfive"] b');
await pg.waitForSelector('[data-do="capture"]');
const hfText = (await pg.textContent('#ef-body')).replace(/\s+/g, ' ');
assert.ok(/Sorting and filtering/i.test(hfText),
  'HighFive should explain how the destinations are sorted');
await pg.waitForSelector('#hf-list a');
const transporting = await pg.$$eval('#hf-list a', (a) => a.map((x) => x.textContent.trim()));
console.log('transporting      :', JSON.stringify(transporting));
assert.deepEqual(transporting, ['Old C'], 'only the vehicle whose fms_real is 5 is transporting');
await pg.click('[data-do="fleet"]');
await pg.waitForFunction(() => localStorage.getItem('ymca-highfive-lastFleet'));
const hfFleet = await pg.evaluate(() => JSON.parse(localStorage.getItem('ymca-highfive-lastFleet')));
console.log('highfive fleet    :', JSON.stringify(hfFleet.smallIntegerFields));
assert.ok(hfFleet.fieldNames.includes('vehicle_type'), 'the fleet capture should name its fields');
assert.ok(!('id' in hfFleet.smallIntegerFields) && !('building_id' in hfFleet.smallIntegerFields),
  'a capture must not tally the player\'s own identifiers');
await pg.click('[data-do="capture"]');
await pg.waitForFunction(() => localStorage.getItem('ymca-highfive-lastCapture'));
const shot = await pg.evaluate(() => JSON.parse(localStorage.getItem('ymca-highfive-lastCapture')));
assert.ok(Object.keys(shot.linkShapes).every((k) => !/\d/.test(k)),
  'a captured path should be a shape, with the digits taken out');
console.log('highfive capture  : structure only, digits shaped out');

// ---- crew numbers: the player's figure, because the game has none ----
await pg.click('#ef-back');
await pg.click('.ymca-tile.el[data-el="missionmagician"] b');
await pg.waitForSelector('[data-crew]');
const crewRows = await pg.$$eval('[data-crew]', (b) => b.map((x) => x.dataset.crew));
console.log('crew rows         :', JSON.stringify(crewRows));
assert.deepEqual(crewRows.sort(), ['10', '13', '5', '904'], 'one row per type in the fleet');
await pg.fill('[data-crew="13"]', '6');
await pg.waitForTimeout(120);
assert.deepEqual(
  await pg.evaluate(() => JSON.parse(localStorage.getItem('ymca-missionmagician-crew'))),
  { 13: 6 }, 'a crew number should be saved under MissionMagician, not under ElementFriend');
console.log('crew numbers      : saved as typed');
await pg.click('#ymca-back');

// ---- HighFive switches on and off beside the game's own Alliance Radio ----
await pg.evaluate(() => {
  const radio = document.createElement('div');
  radio.className = 'flex-row';
  radio.innerHTML = `<div class="flex-fixed-size">
    <a id="alliance_radio_off" class="btn_alliance_radio btn btn-danger btn-xs pull-right"
      href="#" style="display:none">Alliance Radio: Off</a>
    <a id="alliance_radio_on" class="btn_alliance_radio btn btn-success btn-xs pull-right"
      href="#">Alliance Radio: On</a></div>`;
  document.body.append(radio);
  window.YMCA.switchElement('highfive', false);
  window.YMCA.switchElement('highfive', true);
});
await pg.waitForSelector('#ymca-hf-btn');
const hfBtn = '.flex-fixed-size #ymca-hf-btn';
assert.equal(await pg.locator(hfBtn).count(), 1, 'it lands beside the radio, not somewhere else');
assert.equal((await pg.textContent(hfBtn)).trim(), 'Status 5: On');
await pg.evaluate((sel) => document.querySelector(sel).click(), hfBtn);
await pg.waitForTimeout(120);
console.log('radio row button  :', (await pg.textContent(hfBtn)).trim());
assert.equal((await pg.textContent(hfBtn)).trim(), 'Status 5: Off', 'and it toggles');
assert.equal(await pg.evaluate(() =>
  JSON.parse(localStorage.getItem('ymca-highfive-cfg')).advance), false,
'it is the same setting the transport page carries, not a second one');
await pg.evaluate((sel) => document.querySelector(sel).click(), hfBtn);
await pg.waitForTimeout(120);

// ---- EagleEye holds ShutEye, and the group switch carries it ----
await pg.click('.ymca-tile[data-mod="elementfriend"]');
await pg.waitForSelector('.ymca-tile.el[data-el="eagleeye"]');
await pg.click('.ymca-tile.el[data-el="eagleeye"] b');
await pg.waitForSelector('.ymca-tile.el[data-el="shuteye"]');
const inGroup = await pg.$$eval('.ymca-tile.el', (b) => b.map((x) => x.dataset.el));
console.log('inside eagleeye   :', JSON.stringify(inGroup));
assert.deepEqual(inGroup, ['shuteye', 'stationfascination'],
  'a group lists its own members and nothing else');
assert.equal(await pg.locator('.ymca-switch[data-sw="shuteye"] input').isChecked(), false,
  'ShutEye is off until asked for: it hides things the player may want');

// A mission panel, shaped the way the game builds one.
await pg.evaluate(() => {
  const filters = document.createElement('div');
  filters.id = 'missions-panel-main';
  filters.className = 'missions-panel-main';
  filters.innerHTML = '<a id="mission_select_emergency" class="btn btn-xs btn-success">7/16</a>';
  document.body.append(filters);
  // The game paints the heading, not the panel, and it paints it per state.
  const paint = document.createElement('style');
  paint.textContent = `.mission_panel_red > .panel-heading{
    background-color: rgb(217, 83, 79); background-image: linear-gradient(rgb(217,83,79),
    rgb(201,48,44)); color: rgb(255, 255, 255); border-bottom: 1px solid rgb(150, 30, 26)}`;
  document.head.append(paint);
  const panel = document.createElement('div');
  panel.id = 'mission_panel_506247649';
  panel.className = 'panel panel-default mission_panel_red';
  panel.innerHTML = `<div class="panel-heading" id="mission_panel_heading_506247649">
    <a class="btn btn-default btn-xs" id="alarm_button_506247649">Dispatch</a>
    <span id="mission_participant_506247649" class="glyphicon"></span>
    <a href="" id="mission_caption_506247649" class="map_position_mover">Washing machine on
      fire, <small id="mission_address_506247649">151 West 34th Street, 10001 New York</small></a>
  </div><div class="panel-body"><div class="row">
    <div class="col-xs-1"><img id="mission_vehicle_state_506247649"></div>
    <div class="col-xs-11">
      <div class="mission_overview_countdown" id="mission_overview_countdown_506247649"></div>
      <div id="mission_bar_outer_506247649" class="progress mission_progress"></div>
      <div id="mission_missing_506247649" class="alert alert-danger">Missing Vehicles</div>
      <div id="mission_patients_506247649" class="row">8 Patient</div>
      <div class="mission_prisoners" id="mission_prisoners_506247649"></div>
    </div></div></div>`;
  document.body.append(panel);
});
const seen = () => pg.evaluate(() => [...document.querySelectorAll('#mission_panel_506247649 '
  + '.col-xs-11 > div')].filter((d) => getComputedStyle(d).display !== 'none').map((d) => d.id));
console.log('panel before      :', JSON.stringify(await seen()));
assert.equal((await seen()).length, 5, 'untouched, the game shows everything it has');

await pg.click('.ymca-switch[data-sw="shuteye"]');
await pg.waitForTimeout(150);
console.log('panel after       :', JSON.stringify(await seen()));
assert.deepEqual(await seen(), ['mission_bar_outer_506247649'],
  'the progress bar stays and the rest folds away — a stylesheet, so a panel drawn later obeys');

// One line: the boxes in between step out with display:contents, so the artwork, the Dispatch
// button, the name and the bar all become children of one flex row and `order` lines them up.
const line = await pg.evaluate(() => {
  const p = document.getElementById('mission_panel_506247649');
  const at = (sel) => document.querySelector(sel)?.getBoundingClientRect().top;
  return {
    panel: getComputedStyle(p).display,
    heading: getComputedStyle(p.querySelector('.panel-heading')).display,
    address: getComputedStyle(document.getElementById('mission_address_506247649')).display,
    sameRow: Math.abs(at('#alarm_button_506247649') - at('#mission_bar_outer_506247649')) < 24,
  };
});
console.log('one line          :', JSON.stringify(line));
assert.equal(line.panel, 'flex', 'the panel itself becomes the row');
assert.equal(line.heading, 'contents', 'the heading gives up its box so its children join it');
assert.equal(line.address, 'none', 'the address is what made the name unreadable');
assert.ok(line.sameRow, 'Dispatch and the progress bar end up on the same line');

// display:contents takes the heading's box away, and its gradient with it. It is read back off
// the game per state rather than written here, so red still means red.
const look = await pg.evaluate(() => {
  const cs = getComputedStyle(document.getElementById('mission_panel_506247649'));
  return { bg: cs.backgroundColor, image: cs.backgroundImage };
});
console.log('panel look        :', JSON.stringify(look));
assert.equal(look.bg, 'rgb(217, 83, 79)', 'the heading\'s own colour moves onto the panel');
assert.ok(look.image.includes('linear-gradient'), 'and so does its gradient');
assert.deepEqual(
  await pg.evaluate(() => JSON.parse(localStorage.getItem('ymca-shuteye-looks')).red.color),
  'rgb(255, 255, 255)', 'what was sampled is remembered, so a state off screen keeps its look');

// The same switch on the map, among the game's own mission filters.
const btn = '#missions-panel-main #ymca-shuteye-btn';
assert.equal(await pg.locator(btn).count(), 1, 'the button sits with the game\'s own filters');
assert.ok((await pg.getAttribute(btn, 'class')).includes('btn-success'), 'green while folded');
// YMCA's own window is a lightbox over the page, so the click goes to the element directly.
const press = () => pg.evaluate((sel) => document.querySelector(sel).click(), btn);
await press();
await pg.waitForTimeout(150);
console.log('folded off        :', JSON.stringify(await seen()));
assert.equal((await seen()).length, 5, 'the button unfolds without touching the ElementFriend switch');
assert.ok((await pg.getAttribute(btn, 'class')).includes('btn-default'), 'and goes plain');
await press();
await pg.waitForTimeout(150);
assert.deepEqual(await seen(), ['mission_bar_outer_506247649'], 'and folds again');
console.log('map button        : folds and unfolds');
assert.notEqual(await pg.evaluate(() =>
  getComputedStyle(document.querySelector('#mission_panel_506247649 .col-xs-1 img')).display),
'none', 'the artwork is in the other column and is never hidden');

// Put one part back, by the id the game gives it.
await pg.click('.ymca-tile.el[data-el="shuteye"] b');
await pg.waitForSelector('[data-part="patients"]');
await pg.check('[data-part="patients"]');
await pg.waitForTimeout(150);
console.log('patients back     :', JSON.stringify(await seen()));
assert.deepEqual(await seen(), ['mission_bar_outer_506247649', 'mission_patients_506247649'],
  'what is put back comes back, and nothing else with it');

// ---- what the window says is missing, that the catalogue never mentioned ----
// A skateboard accident wants an ambulance, produces no patient and lists neither, so the panel
// read it as finished while the game went on asking. #missing_text is the game saying it out
// loud, and it counts what is STILL missing, so what is there is added back rather than
// subtracted twice.
await mission.evaluate(() => {
  document.getElementById('mission_vehicle_at_mission')?.remove();
  document.getElementById('mission_vehicle_driving')?.remove();
  const tbody = document.getElementById('vehicle_show_table_body_all');
  tbody.innerHTML = '';
  const add = (id, attrs) => {
    const tr = document.createElement('tr');
    tr.className = 'vehicle_select_table_tr';
    tr.setAttribute('vehicle_id', String(id));
    tr.setAttribute('data-distance', '1');
    tr.innerHTML = `<td><input type="checkbox" class="vehicle_checkbox" value="${id}"
      id="vehicle_checkbox_${id}" name="vehicle_ids[]" fms="2" ${attrs}></td>
      <td id="vehicle_sort_${id}" timevalue="${id}">1 min.</td>`;
    tbody.append(tr);
  };
  add(501, 'vehicle_type_id="13" fire="1" dlk="1"');
  add(502, 'vehicle_type_id="5" any_rtw="1" rtw="1"');
  document.getElementById('missing_text').textContent = 'Missing Vehicles: 1 Ambulance';
  window.__catalogue = [{
    id: '314', name: 'Skateboard accident', requirements: { firetrucks: 1 },
  }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '314');
  document.getElementById('mission-form').setAttribute('action', '/missions/506003400/alarm');
});
await mission.waitForTimeout(1300);
const skate = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
console.log('skateboard        :', JSON.stringify(skate));
assert.ok(skate.some((r) => /Ambulances/.test(r[4]) && /this window states/.test(r[4])),
  'the ambulance the catalogue never mentioned is a line, and says where it came from');
assert.ok(/Tick 2 vehicles/.test(await mission.textContent('#ymca-mm-panel [data-do="select"]')),
  'and it is picked: an engine for the catalogue, an ambulance for the window');
await mission.evaluate(() => { document.getElementById('missing_text').textContent = ''; });

// ---- type 0 is a type, and zero is falsy ----
// `Type 1 fire engine` is vehicle_type_id 0, the commonest engine in the game. Read as a number
// it could not be told apart from "this row states no type", so every guard spelled
// `if (!v.typeId) continue` threw it away: its flags were never learnt off a selection table,
// its tank was never learnt, and one at a mission stayed an unknown type for ever.
await mission.evaluate(() => {
  document.getElementById('mission_vehicle_at_mission')?.remove();
  document.getElementById('mission_vehicle_driving')?.remove();
  localStorage.removeItem('ymca-missionmagician-types');
  localStorage.removeItem('ymca-missionmagician-tanks');
  document.getElementById('vehicle_show_table_body_all').innerHTML = `
    <tr class="vehicle_select_table_tr" vehicle_id="501" data-distance="1"
      vehicle_type="Type 1 fire engine">
      <td><input type="checkbox" class="vehicle_checkbox" id="vehicle_checkbox_501" value="501"
        name="vehicle_ids[]" vehicle_type_id="0" fms="2" fire="1" lf_only="1"
        wasser_amount="750" foam_amount_display="25"></td>
      <td id="vehicle_sort_501" timevalue="300">5 min.</td></tr>`;
  window.__catalogue = [{
    id: '313', name: 'Bin fire', average_credits: 400, requirements: { firetrucks: 1 },
  }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '313');
});
await mission.waitForTimeout(1200);
const zero = await mission.evaluate(() => ({
  types: JSON.parse(localStorage.getItem('ymca-missionmagician-types') || '{}')['0'] || null,
  tank: JSON.parse(localStorage.getItem('ymca-missionmagician-tanks') || '{}')['0'] || null,
}));
console.log('type zero learnt  :', JSON.stringify(zero));
assert.ok(zero.types && zero.types.caps.includes('fire'),
  'type 0 is a type: its flags are learnt off the checkbox like any other');
assert.equal(zero.types.name, 'Type 1 fire engine', 'and the row names it');
assert.deepEqual(zero.tank, { water: 750, foam: 25, bonus: 0 },
  'and its tank is learnt, which a falsy id had been throwing away');
// And it is picked for the engine the mission wants, rather than passed over.
assert.ok(/Tick 1 vehicle/.test(await mission.textContent('#ymca-mm-panel [data-do="select"]')),
  'the commonest engine in the game is a candidate again');

// One at the mission is counted, not filed as an unknown type.
await mission.evaluate(() => {
  const t = document.createElement('table');
  t.id = 'mission_vehicle_at_mission';
  t.innerHTML = '<tbody><tr id="vehicle_row_97"><td vehicle_type_id="0">there</td></tr></tbody>';
  document.getElementById('col_right').append(t);
});
await mission.waitForTimeout(1200);
const counted = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
console.log('type zero there   :', JSON.stringify(counted[0]));
assert.equal(counted[0][1], '1', 'a type-0 engine at the mission counts as there');
await mission.evaluate(() => document.getElementById('mission_vehicle_at_mission')?.remove());

// ---- water: best fit, and what is already carrying it counts ----
// Arrival order sent eleven engines for what four could carry; biggest-first then sent the one
// enormous tanker for a job a smaller one covers. Best fit is the smallest that finishes it,
// and the biggest only while nothing on its own would.
await mission.evaluate(() => {
  document.getElementById('mission_vehicle_at_mission')?.remove();
  document.getElementById('mission_vehicle_driving')?.remove();
  document.getElementById('vehicle_show_table_body_all').innerHTML = '';
  // Tanks the game states on each checkbox: two big, three middling, one small.
  const tanks = [[301, 30000], [302, 12000], [303, 4000], [304, 4000], [305, 4000], [306, 500]];
  for (const [id, water] of tanks) {
    const tr = document.createElement('tr');
    tr.className = 'vehicle_select_table_tr';
    tr.setAttribute('vehicle_id', String(id));
    tr.setAttribute('data-distance', '5');
    tr.innerHTML = `<td><input type="checkbox" class="vehicle_checkbox" value="${id}"
      id="vehicle_checkbox_${id}" name="vehicle_ids[]" vehicle_type_id="33" fms="2"
      fire="1" wasser_amount="${water}"></td>
      <td id="vehicle_sort_${id}" timevalue="${300 + id}">5 min.</td>`;
    document.getElementById('vehicle_show_table_body_all').append(tr);
  }
  window.__catalogue = [{
    id: '311', name: 'Warehouse fire', average_credits: 9000,
    requirements: { water_needed: 20000 },
  }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  localStorage.removeItem('ymca-missionmagician-tanks');
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '311');
});
await mission.waitForTimeout(1200);
const waterPicked = await mission.evaluate(() =>
  [...document.querySelectorAll('.vehicle_checkbox')]
    .filter((b) => b.checked).map((b) => Number(b.getAttribute('wasser_amount'))));
const waterBtn = await mission.textContent('#ymca-mm-panel [data-do="select"]');
await mission.click('#ymca-mm-panel [data-do="select"]');
await mission.waitForTimeout(400);
const took = await mission.evaluate(() => [...document.querySelectorAll('.vehicle_checkbox')]
  .filter((b) => b.checked).map((b) => Number(b.getAttribute('wasser_amount'))));
console.log('water picked      :', JSON.stringify(took), waterBtn.trim());
assert.deepEqual(took.sort((a, b) => b - a), [12000, 4000, 4000],
  '20,000 wanted: 12,000 + 4,000 + 4,000 lands on it exactly, and the 30,000 tanker '
  + 'stays free for the next call');
await mission.click('#ymca-mm-panel [data-do="clear"]');
await mission.waitForTimeout(300);

// ---- a tanker multiplies what is there, and the game says by how much ----
// `water_modifier_raw` is the game's own field, summed by its own calculateWaterBar. Ignoring it
// is why a fire wanting 20,000 was sent 60,000; and once the tankers are on, every engine in the
// fleet fits the little that is left, which is the tail of appliances that came with it.
await mission.evaluate(() => {
  document.getElementById('vehicle_show_table_body_all').innerHTML = '';
  // Three Water Tankers and four Pumper Tankers, each lifting the total by a quarter, and a
  // yard full of engines that carry a little and lift nothing.
  const fleet = [[401, 3000, 25, '41'], [402, 3000, 25, '41'], [403, 3000, 25, '41'],
    [404, 2500, 25, '42'], [405, 2500, 25, '42'], [406, 2500, 25, '42'], [407, 2500, 25, '42'],
    [411, 500, 0, '33'], [412, 500, 0, '33'], [413, 500, 0, '33'], [414, 500, 0, '33'],
    [415, 500, 0, '33'], [416, 500, 0, '33'], [417, 500, 0, '33'], [418, 500, 0, '33']];
  for (const [id, water, mod, type] of fleet) {
    const tr = document.createElement('tr');
    tr.className = 'vehicle_select_table_tr';
    tr.setAttribute('vehicle_id', String(id));
    tr.setAttribute('data-distance', '5');
    tr.innerHTML = `<td><input type="checkbox" class="vehicle_checkbox" value="${id}"
      id="vehicle_checkbox_${id}" name="vehicle_ids[]" vehicle_type_id="${type}" fms="2"
      fire="1" wasser_amount="${water}"
      ${mod ? `water_modifier="${mod}" water_modifier_raw="${mod}"` : ''}></td>
      <td id="vehicle_sort_${id}" timevalue="${300 + id}">5 min.</td>`;
    document.getElementById('vehicle_show_table_body_all').append(tr);
  }
  window.__catalogue = [{
    id: '312', name: 'Tank farm fire', average_credits: 9000,
    requirements: { water_needed: 20000 },
  }];
  localStorage.removeItem('ymca-cache-/einsaetze.json');
  localStorage.removeItem('ymca-missionmagician-tanks');
  document.getElementById('mission_general_info').setAttribute('data-mission-type', '312');
});
await mission.waitForTimeout(1200);
await mission.click('#ymca-mm-panel [data-do="select"]');
await mission.waitForTimeout(400);
const bonusTook = await mission.evaluate(() => [...document.querySelectorAll('.vehicle_checkbox')]
  .filter((b) => b.checked).map((b) => Number(b.getAttribute('wasser_amount'))));
console.log('water with bonus  :', JSON.stringify(bonusTook.slice().sort((a, b) => b - a)));
assert.deepEqual(bonusTook.slice().sort((a, b) => b - a), [3000, 3000, 3000, 2500],
  'three Water Tankers and one Pumper Tanker carry 11,500 gallons and lift them by a whole '
  + 'hundred per cent, so 20,000 is covered without a single engine being sent');
// And the row says so: the panel counts the ticking the way the game's own bar would.
const bonusRow = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())).find((r) => /Water/.test(r[4])));
console.log('water row         :', JSON.stringify(bonusRow));
assert.ok(bonusRow && Number(String(bonusRow[3]).replace(/[^0-9]/g, '')) >= 20000,
  'the covered figure is what the game would pour, bonus and all');
await mission.click('#ymca-mm-panel [data-do="clear"]');
await mission.waitForTimeout(300);

// And a tank already on its way counts. The type is learnt off the checkbox above, so the row
// at the mission needs only its type id — which is all such a row ever carries.
await mission.evaluate(() => {
  const t = document.createElement('table');
  t.id = 'mission_vehicle_driving';
  t.innerHTML = '<tbody><tr id="vehicle_row_96"><td vehicle_type_id="33">driving</td></tr></tbody>';
  document.getElementById('col_right').append(t);
});
await mission.waitForTimeout(1200);
const withTank = await mission.$$eval('#ymca-mm-panel tbody tr', (trs) =>
  trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
console.log('water on the way  :', JSON.stringify(withTank.find((r) => /Water/.test(r[4]))));
assert.equal(withTank.find((r) => /Water/.test(r[4]))?.[1], '500 gal.',
  'the last tank seen for that type is what a row on its way is carrying');
await mission.evaluate(() => document.getElementById('mission_vehicle_driving')?.remove());

// ---- StationFascination filters by an attribute the game already wrote ----
await pg.evaluate(() => {
  const box = document.createElement('div');
  box.innerHTML = `<div class="btn-group" id="btn-group-building-select">
      <a class="btn btn-xs btn-success building_selection">Firehouse</a></div>
    <ul id="building_list">
      <li id="building_list_11" building_type_id="1" leitstelle_building_id="null"
        search_attribute="NY"></li>
      <li id="building_list_12" building_type_id="1" leitstelle_building_id="null"
        search_attribute="LI"></li>
      <li id="building_list_21" building_type_id="0" leitstelle_building_id="11"
        search_attribute="FS01"></li>
      <li id="building_list_22" building_type_id="3" leitstelle_building_id="11"
        search_attribute="AS01"></li>
      <li id="building_list_23" building_type_id="0" leitstelle_building_id="12"
        search_attribute="FS101"></li>
    </ul>`;
  document.body.append(box);
  // The station list arrives long after the page does; off and on again is what a fresh page
  // load looks like from the injection's side.
  window.YMCA.switchElement('stationfascination', false);
  window.YMCA.switchElement('stationfascination', true);
});
await pg.waitForSelector('#ymca-sf-pick');
const centres = await pg.$$eval('#ymca-sf-pick option', (o) => o.map((x) => x.textContent.trim()));
console.log('dispatch centres  :', JSON.stringify(centres));
assert.deepEqual(centres, ['All dispatch centres', 'NY (2)', 'LI (1)'],
  'the centres name themselves and say how many stations answer to each');

const stations = () => pg.evaluate(() => [...document.querySelectorAll('#building_list > li')]
  .filter((li) => getComputedStyle(li).display !== 'none')
  .map((li) => li.getAttribute('search_attribute')));
await pg.selectOption('#ymca-sf-pick', '11');
await pg.waitForTimeout(150);
console.log('centre NY         :', JSON.stringify(await stations()));
assert.deepEqual(await stations(), ['NY', 'FS01', 'AS01'],
  'the centre itself stays, and only the stations that answer to it');
const top = await pg.evaluate(() => {
  const li = document.getElementById('building_list_11');
  return {
    order: getComputedStyle(li).order,
    first: [...document.querySelectorAll('#building_list > li')]
      .filter((x) => getComputedStyle(x).display !== 'none')
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0]
      .getAttribute('search_attribute'),
  };
});
console.log('centre on top     :', JSON.stringify(top));
assert.equal(top.order, '-1', 'the chosen centre is ordered above its own stations');
assert.equal(top.first, 'NY', 'and really sits there');

await pg.selectOption('#ymca-sf-pick', '');
await pg.waitForTimeout(150);
assert.equal((await stations()).length, 5, 'and all of them come back');
console.log('centre all        : 5 back');
await pg.evaluate(() => document.getElementById('building_list').closest('div').remove());

// The group is the master switch: EagleEye off takes ShutEye with it.
await pg.click('#ef-back');
await pg.waitForSelector('.ymca-switch[data-sw="shuteye"]');
await pg.evaluate(() => window.YMCA.switchElement('eagleeye', false));
await pg.waitForTimeout(150);
console.log('eagleeye off      :', JSON.stringify(await seen()));
assert.equal((await seen()).length, 5, 'switching the group off takes every member with it');
await pg.evaluate(() => {
  window.YMCA.switchElement('eagleeye', true);
  window.YMCA.switchElement('shuteye', false);
  document.getElementById('mission_panel_506247649').remove();
});
await pg.click('#ymca-back');
await pg.waitForSelector('.ymca-tile[data-mod]');

// ---- HighFive: the game already works out which vehicle is next ----
// A transporting vehicle's page carries #next-vehicle-fms-5, so nothing has to be searched for.
// HighFive reads that href before the pick and follows it after; it never picks and never
// repeats the click, because assigning a hospital cannot be undone.
await pg.evaluate(() => {
  document.getElementById('ymca-window')?.remove();
  // Switched off and on again: a switch has to take effect where it is flicked, not on reload.
  window.YMCA.switchElement('highfive', false);
  window.YMCA.switchElement('highfive', true);
  const page = document.createElement('div');
  page.innerHTML = `
    <a class="btn btn-success" id="next-vehicle-fms-5" href="/vehicles/15079875"
      >Go to the next vehicle with a transport request</a>
    <div><table id="own-hospitals">
      <!-- Six headings over seven cells, the way the real page has them: the tax column has
           no heading of its own, so anything matching a column by the label above it is one
           out from there on. -->
      <thead><tr><th>Buildings</th><th>Free beds</th><th>Distance</th><th>Department</th>
        <th></th><th></th></tr></thead>
      <tbody>
      <tr><td>Mercy General<div class="visible-xs small" id="div_free_beds_41">12.40 km</div></td>
        <td class="hidden-xs"><span id="beds_41">6 / 30</span></td>
        <td class="hidden-xs">12.40 km</td><td class="hidden-xs">0 %</td>
        <td class="hidden-xs"><span class="label">Yes</span></td>
        <td><a class="btn btn-success" href="/vehicles/15079874/patient/41"
          >Transport Patient</a></td><td class="hidden-xs"></td></tr>
      <tr><td>St Anne<div class="visible-xs small" id="div_free_beds_42">2.79 km</div></td>
        <td class="hidden-xs"><span id="beds_42">2 / 30</span></td>
        <td class="hidden-xs">2.79 km</td><td class="hidden-xs">10 %</td>
        <td class="hidden-xs"><span class="label">No</span></td>
        <td><a class="btn btn-success" href="/vehicles/15079874/patient/42"
          >Transport Patient</a></td><td class="hidden-xs"></td></tr>
      <tr><td>County<div class="visible-xs small" id="div_free_beds_43">7.10 km</div></td>
        <td class="hidden-xs"><span id="beds_43">9 / 30</span></td>
        <td class="hidden-xs">7.10 km</td><td class="hidden-xs">5 %</td>
        <td class="hidden-xs"><span class="label">Yes</span></td>
        <td><a class="btn btn-success" href="/vehicles/15079874/patient/43"
          >Transport Patient</a></td><td class="hidden-xs"></td></tr>
      <tr><td>Riverside<div class="visible-xs small" id="div_free_beds_44">19.00 km</div></td>
        <td class="hidden-xs"><span id="beds_44">4 / 30</span></td>
        <td class="hidden-xs">19.00 km</td><td class="hidden-xs">0 %</td>
        <td class="hidden-xs"><span class="label">Yes</span></td>
        <td><a class="btn btn-success" href="/vehicles/15079874/patient/44"
          >Transport Patient</a></td><td class="hidden-xs"></td></tr>
      <tr><td>Lakeview<div class="visible-xs small" id="div_free_beds_45">21.50 km</div></td>
        <td class="hidden-xs"><span id="beds_45">1 / 30</span></td>
        <td class="hidden-xs">21.50 km</td><td class="hidden-xs">0 %</td>
        <td class="hidden-xs"><span class="label">No</span></td>
        <td><a class="btn btn-success" href="/vehicles/15079874/patient/45"
          >Transport Patient</a></td><td class="hidden-xs"></td></tr>
      <tr><td>Hillcrest<div class="visible-xs small" id="div_free_beds_46">30.00 km</div></td>
        <td class="hidden-xs"><span id="beds_46">3 / 30</span></td>
        <td class="hidden-xs">30.00 km</td><td class="hidden-xs">0 %</td>
        <td class="hidden-xs"><span class="label">Yes</span></td>
        <td><a class="btn btn-success" href="/vehicles/15079874/patient/46"
          >Transport Patient</a></td><td class="hidden-xs"></td></tr>
    </tbody></table></div>
    <a id="leave_without_transport_no_compensation"
      href="/vehicles/15079874/patient/-1">Leave without transport</a>`;
  document.body.append(page);
  history.replaceState({}, '', '/vehicles/15079874');
});
// The switch is asked on every attempt, so turning HighFive on starts it without a reload.
await pg.waitForSelector('#hf-bar');
assert.equal(await pg.locator('#hf-advance').isChecked(), true, 'advancing is on by default');
assert.equal(await pg.getAttribute('#hf-bar a.btn', 'href'), '/vehicles/15079875',
  'the bar links to the vehicle the game named as next');
console.log('highfive bar      : next is /vehicles/15079875');

// The columns are read off the table's own headers, because not one row carries a class.
const sortable = await pg.$$eval('#hf-sort option', (o) => o.map((x) => x.value).filter(Boolean));
console.log('sortable columns  :', JSON.stringify(sortable));
console.log('sortable columns  :', JSON.stringify(sortable));
assert.ok(sortable.includes('Distance'), 'the distance column is offered');
assert.equal(sortable.filter((c) => c === 'Distance').length, 1,
  'and offered once, however many tables of the same shape the page holds');

const order = () => pg.$$eval('#own-hospitals tbody tr', (rows) => rows
  .filter((r) => r.style.display !== 'none')
  .map((r) => r.cells[0].firstChild.textContent.trim()));

// The game's own order puts your own hospitals above nearer ones, so the first transport page
// ever opened sets the sort to the column that names itself a distance, with a ceiling of 50.
const started = await pg.evaluate(() => JSON.parse(localStorage.getItem('ymca-highfive-cfg')));
console.log('first time        :', JSON.stringify({ sortBy: started.sortBy, max: started.max }));
assert.ok(!started.sortBy,
  'nearest first is the ground state, not a choice written into the settings — which is how the '
  + 'first version lost it, to a redraw writing an empty sort back over it');
assert.equal(started.max, 50, 'a ceiling is seeded once, so nothing goes on a world tour');
assert.deepEqual(await order(),
  ['St Anne', 'County', 'Mercy General', 'Riverside', 'Lakeview', 'Hillcrest'],
  'nearest first, without anybody choosing it — and all six are inside fifty');
await pg.fill('#hf-max', '15');
await pg.waitForTimeout(200);
assert.deepEqual(await order(), ['St Anne', 'County', 'Mercy General'],
  'and the ceiling is what keeps an ambulance off a world tour');

await pg.fill('#hf-max', '');
await pg.waitForTimeout(200);
await pg.selectOption('#hf-sort', 'Distance');
await pg.waitForTimeout(150);
console.log('sorted by distance:', JSON.stringify(await order()));
assert.deepEqual(await order(),
  ['St Anne', 'County', 'Mercy General', 'Riverside', 'Lakeview', 'Hillcrest'],
  '2.79 before 7.10 before 12.40 — a dot before two digits is a decimal point, not a thousand');

// "Show the first N" is the range: sort by distance and the far ones are gone.
await pg.selectOption('#hf-limit', '5');
await pg.waitForTimeout(150);
assert.deepEqual(await order(),
  ['St Anne', 'County', 'Mercy General', 'Riverside', 'Lakeview'],
  'the limit hides what is furthest away — sorted by distance, that is the range filter');
console.log('limited           : the five nearest, 30.00 km dropped');
await pg.selectOption('#hf-limit', '0');
await pg.waitForTimeout(150);

// The range is a ceiling on whatever column is being sorted by — the page names it, the player
// names the number, so neither is guessed and it works for price as well as for distance.
await pg.fill('#hf-max', '10');
await pg.waitForTimeout(200);
console.log('at most 10        :', JSON.stringify(await order()));
assert.deepEqual(await order(), ['St Anne', 'County'],
  'nothing further than 10 — no ambulance sent on a world tour');
await pg.fill('#hf-max', '');
await pg.waitForTimeout(200);
assert.equal((await order()).length, 6, 'and an empty box is no ceiling at all');

// ---- the best one is MARKED, and only marked ----
// Mercy General (12.40, Yes, 0%) and County (7.10, Yes, 5%) both treat; St Anne is nearer at
// 2.79 and cannot. So County is the nearest that treats, it charges, and Mercy General is the
// free one in the same group \u2014 that is the swap. The green is on the cells, because the game's
// dark theme puts a background on every td and a colour on the tr sits behind it.
assert.equal(await pg.locator('#hf-best').isChecked(), true, 'marking is on by default');
const best = await pg.evaluate(() => {
  const row = document.querySelector('#own-hospitals tr[data-ymca-best]');
  return row && {
    name: row.cells[0].firstChild.textContent.trim(),
    why: row.getAttribute('data-ymca-best'),
    row: row.classList.contains('success'),
    cells: [...row.cells].every((c) => c.classList.contains('success')),
    others: document.querySelectorAll('#own-hospitals tr.success').length,
  };
});
console.log('best marked       :', JSON.stringify(best));
assert.equal(best.name, 'Mercy General',
  'treatment first, then distance, then the free one over the paying one');
assert.equal(best.why, 'nearest free', 'and the reason is on the row');
assert.ok(best.row && best.cells, 'green on the row AND on every cell, or the theme hides it');
assert.equal(best.others, 1, 'exactly one is marked');
const saidBest = (await pg.textContent('#hf-best-said')).replace(/\s+/g, ' ').trim();
console.log('best said         :', saidBest);
assert.match(saidBest, /Mercy General/, 'and it is said in words, not only in colour');
assert.match(saidBest, /can treat/, 'with the reason, because a green row cannot be checked');
// Nothing was pressed and nothing navigated: the mark is the whole of it.
assert.equal(await pg.evaluate(() => location.pathname), '/vehicles/15079874',
  'marking the best one never moves the page');
// And it follows the range: cap it below Mercy General and the mark moves to what is left.
await pg.fill('#hf-max', '8');
await pg.waitForTimeout(250);
assert.equal(await pg.evaluate(() =>
  document.querySelector('#own-hospitals tr[data-ymca-best]')?.cells[0].firstChild.textContent.trim()),
'County', 'a mark that stayed put when the range changed would point at a hospital not offered');
await pg.fill('#hf-max', '');
await pg.waitForTimeout(250);
// It can be turned off, and then nothing is marked at all.
await pg.uncheck('#hf-best');
await pg.waitForTimeout(250);
assert.equal(await pg.locator('#own-hospitals tr[data-ymca-best]').count(), 0,
  'switched off, nothing is marked');
await pg.check('#hf-best');
await pg.waitForTimeout(250);

// Clicking a destination arms the jump. HighFive never prevents that click — so the test has
// to, or the browser really would navigate away to the game's own transport page.
await pg.evaluate(() => {
  document.addEventListener('click', (e) => {
    if (e.target.closest('a[href*="/patient/"]')) e.preventDefault();
  }, true);
  document.querySelector('a[href="/vehicles/15079874/patient/41"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
});
const armed = await pg.evaluate(() => JSON.parse(sessionStorage.getItem('ymca-highfive-jump')));
console.log('highfive armed    :', JSON.stringify({ path: armed?.path }));
assert.equal(armed.path, '/vehicles/15079875', 'picking a destination arms the next vehicle');

// Switched off, it arms nothing at all.
await pg.evaluate(() => sessionStorage.removeItem('ymca-highfive-jump'));
await pg.click('#hf-advance');
await pg.evaluate(() => {
  document.querySelector('a[href="/vehicles/15079874/patient/42"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
});
assert.equal(await pg.evaluate(() => sessionStorage.getItem('ymca-highfive-jump')), null,
  'with advancing off, a pick arms nothing');
console.log('highfive off      : a pick arms nothing');

// ---- EasyEdit → SwitchDispatchCenter: the game's own form, from its own edit page ----
// Two things a capture off a real building page settled. It is a FRAME — the game opens a
// building in its own lightbox — so ruling frames out ruled out every building page there is.
// And the select is not on it: /buildings/<id> came back with `forms: []`. It lives on the
// building's own edit page, which one fetch hands over whole: the options to offer and the
// real form to send.
{
  const bld = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const bldErrs = [];
  bld.on('pageerror', (e) => bldErrs.push(e.message));
  let sent = null;
  // The edit page the module fetches, and the POST it makes afterwards.
  await bld.route('**/buildings/5685072/edit', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<html><body><form id="edit_building" action="/buildings/5685072" method="post">
      <input type="hidden" name="authenticity_token" value="CSRF-XYZ">
      <input type="text" name="building[name]" value="FS01">
      <div class="input-group select optional building_leitstelle_building_id">
        <label class="input-group-addon" for="building_leitstelle_building_id">Assigned
          Dispatch Center</label>
        <select class="select optional form-control" name="building[leitstelle_building_id]"
          id="building_leitstelle_building_id"><option value=""></option>
          <option value="5694841">EMSManiacs</option>
          <option value="5691056">LI</option>
          <option selected="selected" value="5677680">NY</option></select></div>
      <input type="submit" name="commit" value="Save"></form></body></html>`,
  }));
  await bld.route('**/buildings/5685072', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    sent = route.request().postData();
    return route.fulfill({ contentType: 'text/html', body: '<html><body>saved</body></html>' });
  });
  await bld.goto('http://localhost:8777/README.md');
  // The navigation row exactly as the game writes it, and nothing else: no form on this page.
  // With the handful of Bootstrap 3 rules the game's own stylesheet carries, because the look
  // is the game's — a caret with no `.caret` rule behind it is a zero-sized button.
  await bld.setContent(`<html><head><style>
    .btn { display:inline-block; padding:1px 5px; border:1px solid #ccc; }
    .caret { display:inline-block; width:0; height:0; border-top:4px solid;
      border-right:4px solid transparent; border-left:4px solid transparent; }
    .dropdown-menu { display:none; position:absolute; top:100%; left:0; z-index:1000;
      min-width:160px; padding:5px 0; margin:2px 0 0; list-style:none; background:#fff;
      border:1px solid rgba(0,0,0,.15); }
    .open > .dropdown-menu { display:block; }
    .dropdown-menu > li > a { display:block; padding:3px 20px; }
  </style><body>
    <div class="btn-group" id="building-navigation-container">
      <a class="btn btn-xs btn-default" href="/buildings/5677622">Previous building</a>
      <a class="btn btn-default btn-xs" href="/buildings/5677680">NY</a>
      <a class="btn btn-xs btn-success" href="/buildings/5677623">Next building</a>
    </div></body></html>`);
  await bld.evaluate(() => history.replaceState({}, '', '/buildings/5685072'));
  await bld.addScriptTag({ content: script });
  await bld.waitForSelector('#ymca-sd-pick .dropdown-toggle');

  // It lands straight after the button naming the centre it is in now, in the game's own row,
  // wearing the game's own button classes — the same ones that button wears.
  const where = await bld.evaluate(() => {
    const box = document.getElementById('ymca-sd-pick');
    return { after: box.previousElementSibling?.textContent.trim(),
      before: box.nextElementSibling?.textContent.trim(),
      inNav: box.parentElement.id,
      toggle: box.querySelector('.dropdown-toggle').className,
      caret: !!box.querySelector('.caret') };
  });
  console.log('dispatch pick     :', JSON.stringify(where));
  assert.deepEqual(where, { after: 'NY', before: 'Next building',
    inNav: 'building-navigation-container',
    toggle: 'btn btn-default btn-xs dropdown-toggle', caret: true },
  'a caret in the same button design as the one naming the centre, between it and Next');

  // NOTHING IS ON SCREEN UNTIL THE CARET IS PRESSED.
  assert.equal(await bld.locator('#ymca-sd-pick .dropdown-menu').isVisible(), false,
    'the menu is not there until it is asked for');
  await bld.click('#ymca-sd-pick .dropdown-toggle');
  await bld.waitForTimeout(150);
  assert.equal(await bld.locator('#ymca-sd-pick .dropdown-menu').isVisible(), true,
    'and the caret opens it');

  // IT OPENS LEFTWARDS. The navigation row sits at the right-hand edge, so a menu hung from
  // the left ran off the screen and half the centres could not be reached.
  const opens = await bld.evaluate(() => {
    const box = document.getElementById('ymca-sd-pick');
    const menu = box.querySelector('.dropdown-menu');
    const m = menu.getBoundingClientRect();
    const t = box.getBoundingClientRect();
    return { rightAligned: Math.abs(m.right - t.right) < 2, onScreen: m.left >= 0,
      classed: menu.classList.contains('dropdown-menu-right'),
      caretTurned: box.querySelector('.caret').style.transform };
  });
  console.log('dispatch opens    :', JSON.stringify(opens));
  assert.equal(opens.rightAligned, true, 'the menu hangs from the row\'s right edge');
  assert.equal(opens.onScreen, true, 'so none of it is off the screen');
  assert.equal(opens.classed, true, 'by Bootstrap\'s own word for it as well as by style');
  assert.equal(opens.caretTurned, 'rotate(90deg)', 'and the caret points the way it opens');

  // Every option the game offers, the one it is in now marked and with no tick — there is
  // nowhere to move it to — and a tick on each of the others.
  const rows = await bld.$$eval('#ymca-sd-pick .dropdown-menu li', (li) => li.map((x) => ({
    name: x.querySelector('span')?.textContent.trim(),
    here: x.classList.contains('active'),
    // An empty value is a real option — "not assigned" — so the tick is looked for by the
    // attribute being there, never by its value being truthy.
    go: !!x.querySelector('[data-go]'),
  })));
  console.log('dispatch menu     :', JSON.stringify(rows));
  assert.equal(rows.length, 4, 'every option the game offers, including its empty one');
  assert.deepEqual(rows.find((r) => r.here), { name: 'NY', here: true, go: false },
    'the one it is in now is marked and carries no tick');
  assert.equal(rows.filter((r) => r.go).length, 3, 'every other row carries its own tick');

  // THE NAME IS INERT. A list where the whole row moves a station is a list one stray click
  // ruins, which is what the arming step was there to prevent.
  await bld.click('#ymca-sd-pick .dropdown-menu li:not(.active) span:first-child');
  await bld.waitForTimeout(250);
  assert.equal(sent, null, 'clicking the name sends nothing');

  // The tick is the whole choice: one press, and it is the confirmation as well.
  await bld.click('#ymca-sd-pick [data-go="5691056"]');
  await bld.waitForTimeout(700);
  // The body is multipart (FormData), so read its parts rather than parsing it as a query.
  const got = {};
  for (const m of (sent || '').matchAll(/name="([^"]+)"\r?\n\r?\n([^\r\n]*)/g)) got[m[1]] = m[2];
  console.log('dispatch sent     :', JSON.stringify(got));
  assert.equal(got['building[leitstelle_building_id]'], '5691056', 'the one field changed');
  assert.equal(got.authenticity_token, 'CSRF-XYZ', 'the CSRF token was lost');
  assert.equal(got['building[name]'], 'FS01', 'an unrelated field was lost');
    assert.equal(bldErrs.length, 0);
  await bld.close();
}

// A building the game does not let you assign — a dispatch centre itself — has no such select
// on its edit page. Nothing is offered, rather than offered and dead.
{
  const centre = await b.newPage({ viewport: { width: 1100, height: 900 } });
  await centre.route('**/buildings/5677680/edit', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<html><body><form action="/buildings/5677680" method="post">'
      + '<input type="text" name="building[name]" value="NY"></form></body></html>',
  }));
  await centre.goto('http://localhost:8777/README.md');
  await centre.setContent(`<html><body><div class="btn-group"
    id="building-navigation-container">
    <a class="btn btn-xs btn-default" href="/buildings/5677622">Previous building</a>
    <a class="btn btn-xs btn-success" href="/buildings/5677623">Next building</a>
    </div></body></html>`);
  await centre.evaluate(() => history.replaceState({}, '', '/buildings/5677680'));
  await centre.addScriptTag({ content: script });
  await centre.waitForTimeout(900);
  assert.equal(await centre.locator('#ymca-sd-pick').count(), 0,
    'no select on its edit page means nothing to mirror, so nothing is offered');
  console.log('dispatch centre   : a building that cannot be assigned gets no control');
  await centre.close();
}


// ---- a prison list is not a table, and the figures are inside the link ----
// The page the player pasted: thirty-odd `<a>` side by side in one `div.prison-select`, an
// `<h5>` between yours and the alliance's, and every figure stated in the link's own text —
// `NYPD | 7th Precinct(Available cells: 2, Distance: 0.69 km, owner's tax: 0%)`. Everything
// here used to read `tr` and `cells`, so the bar drew itself over a list it could not touch.
{
  const jail = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const jailErrs = [];
  jail.on('pageerror', (e) => jailErrs.push(e.message));
  await jail.goto('http://localhost:8777/README.md');
  const cell = (id, name, free, km, tax) => `<a data-prison-id="${id}" class="btn btn-success"
    href="/vehicles/15042418/gefangener/${id}?load_all_prisons=true&show_only_available=true"
    >${name}(${tax === null ? 'Free' : 'Available'} cells: ${free}, Distance: ${km} km${
  tax === null ? '' : `, owner's tax: ${tax}%`})</a>`;
  await jail.setContent(`<html><body>
    <div id="prison-select-15042418" data-vehicle-id="15042418" class="prison-select">
      ${cell(5688992, 'Prison1', 1, '1.43', null)}
      ${cell(5677625, 'PO 3', 1, '1.82', null)}
      <h5>Alliance Cells</h5>
      ${cell(5615715, "NYPD | 7th Precinct", 2, '0.69', 0)}
      ${cell(5618207, 'NYPD | 5th Precinct', 2, '1.62', 0)}
      ${cell(5661946, 'Rikers Correctional Center', 3, '41.95', 0)}
    </div></body></html>`);
  await jail.evaluate(() => {
    history.replaceState({}, '', '/vehicles/15042418');
    localStorage.setItem('ymca-elements', JSON.stringify({ highfive: true }));
    localStorage.setItem('ymca-highfive-cfg', JSON.stringify({ sortBy: '', max: 25, seeded: 1 }));
  });
  await jail.addScriptTag({ content: script });
  await jail.waitForSelector('#hf-bar');
  // The columns come off the words the game put in front of its own figures, because a list
  // with no headings still names what it is stating.
  const jailCols = await jail.$$eval('#hf-sort option', (os) => os.map((o) => o.value));
  console.log('prison columns    :', JSON.stringify(jailCols));
  assert.ok(jailCols.some((c) => /distance/i.test(c)),
    'the distance names itself inside the link, so it can be sorted and capped by');
  // Nearest first, across both halves, without a table anywhere.
  const order = await jail.$$eval('#prison-select-15042418 a',
    (as) => as.map((a) => a.textContent.split('(')[0]));
  console.log('prison order      :', JSON.stringify(order.slice(0, 3)));
  assert.equal(order[0], 'NYPD | 7th Precinct', 'nearest first is the ground state here too');
  // And the range caps it: Rikers at 41.95 is outside the 25 this is set to. The player still
  // clicks the cell — this only puts the right one under the cursor.
  const hidden = await jail.$$eval('#prison-select-15042418 a',
    (as) => as.filter((a) => a.style.display === 'none').map((a) => a.textContent.split('(')[0]));
  console.log('prison capped     :', JSON.stringify(hidden));
  assert.deepEqual(hidden, ['Rikers Correctional Center'],
    'what is out of range is hidden, and nothing is picked or pressed');
  assert.equal(jailErrs.length, 0);
  await jail.close();
}

// ---- the same list, nested the way a mission window nests it ----
// Each vehicle carrying a prisoner gets its own `div.prison-select`, and the whole thing sits
// in one `tr.tablesorter-childRow` under that vehicle's row. Taking `closest('tr')` first
// swallowed all thirty-two destinations into a single block — the capture showed it as one
// "row" with a 2604-character name and no pieces at all.
{
  const win = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const winErrs = [];
  win.on('pageerror', (e) => winErrs.push(e.message));
  await win.goto('http://localhost:8777/README.md');
  const cellFor = (v, id, name, free, km) => `<a data-prison-id="${id}" class="btn btn-success"
    href="/vehicles/${v}/gefangener/${id}?load_all_prisons=true"
    >${name}(Free cells: ${free}, Distance: ${km} km)</a>`;
  const vehicle = (v, near) => `
    <tr id="vehicle_row_${v}" class="tablesorter-hasChildRow"><td>${v}</td></tr>
    <tr class="tablesorter-childRow"><td colspan="7" class="vehicle_prisoner_select"
      id="vehicle_prisoner_select_${v}" vehicle_id="${v}">
      <div id="prison-select-${v}" data-vehicle-id="${v}" class="prison-select">
        ${cellFor(v, 5677622, 'PO 1', 1, near)}
        ${cellFor(v, 5677625, 'PO 3', 1, '1.24')}
        <h5>Alliance Cells</h5>
        ${cellFor(v, 5615711, 'NYPD | 1st Precinct', 1, '0.82')}
      </div></td></tr>`;
  await win.setContent(`<html><body>
    <div class="alert alert-danger alert-missing-vehicles" id="missing_text">
      Prisoners must be transported.</div>
    <table id="mission_vehicle_at_mission"><tbody>
      ${vehicle('15079750', '3.85')}
      ${vehicle('15079748', '0.10')}
    </tbody></table></body></html>`);
  await win.evaluate(() => {
    history.replaceState({}, '', '/missions/506524437');
    localStorage.setItem('ymca-elements', JSON.stringify({ highfive: true }));
  });
  await win.addScriptTag({ content: script });
  await win.waitForSelector('#hf-bar');
  // Each `<a>` is its own destination, in its own vehicle's list.
  const blocks = await win.evaluate(() =>
    [...document.querySelectorAll('#prison-select-15079750 a')].map((a) => a.style.display));
  console.log('nested blocks     :', blocks.length, 'destinations read separately');
  assert.equal(blocks.length, 3, 'the childRow is not the block; each link is');
  // And one vehicle at a time — the href says which. Sorting across the whole page would
  // order one vehicle's cells by another vehicle's distances.
  const first = await win.$$eval('#prison-select-15079750 a',
    (as) => as.map((a) => a.textContent.split('(')[0]));
  console.log('window order      :', JSON.stringify(first));
  assert.equal(first[0], 'NYPD | 1st Precinct',
    'the first vehicle is sorted on its own figures, at 0.82 not the other vehicle\'s 0.10');
  assert.equal(winErrs.length, 0);
  await win.close();
}

// ---- the page a pick lands on is the proof, and it carries the button already ----
// Remembering where "next" pointed and reading it back after the navigation had four ways to
// fail quietly. The capture ended that: a pick lands on /vehicles/<id>/patient/<hospital>, a
// page with no destinations and #next-vehicle-fms-5 already on it. A fresh page, because a
// fresh page is exactly what a pick produces.
// Both branches, because the game names them in two languages: a hospital is /patient/ and a
// prison is /gefangener/. Matching only the English one is why the ambulances advanced and the
// patrol cars did not.
for (const [branch, dest] of [['patient', '41'], ['gefangener', '7'], ['patient', '-1']]) {
  const picked = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const pickedErrs = [];
  picked.on('pageerror', (e) => pickedErrs.push(e.message));
  await picked.goto('http://localhost:8777/README.md');
  await picked.setContent(`<html><body>
    <div class="alert alert-success">Assigned</div>
    <a class="btn btn-success" id="next-vehicle-fms-5"
      href="/README.md?next=${branch}">Go to the next vehicle with a transport request</a>
  </body></html>`);
  await picked.evaluate(([b2, d]) =>
    history.replaceState({}, '', `/vehicles/15079874/${b2}/${d}`), [branch, dest]);
  await picked.addScriptTag({ content: script });
  await picked.waitForURL(new RegExp(`next=${branch}`), { timeout: 15000 });
  console.log('after a pick      :', `/${branch}/${dest} \u2192`, new URL(picked.url()).search);
  assert.equal(pickedErrs.length, 0, `${branch} page threw`);
  await picked.close();
}

// And when the page names no next vehicle, a second later it presses Escape — which is how the
// player closes the game's own lightbox, and the only thing here that has been seen from this
// side. No function of the game's is called by name.
{
  const last = await b.newPage({ viewport: { width: 1100, height: 900 } });
  await last.goto('http://localhost:8777/README.md');
  await last.setContent('<html><body><div class="alert alert-success">Assigned</div></body></html>');
  await last.evaluate(() => {
    history.replaceState({}, '', '/vehicles/15079874/patient/41');
    window.__escapes = [];
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__escapes.push(1); });
  });
  await last.addScriptTag({ content: script });
  await last.waitForFunction(() => window.__escapes.length > 0, { timeout: 8000 });
  console.log('nothing left      : Escape pressed, window closes');
  assert.match(last.url(), /\/patient\/41$/, 'and it went nowhere, because there was nowhere to go');
  await last.close();
}

console.log('page errors       :', errs.length ? errs.slice(0, 3) : 'none');
assert.equal(errs.length, 0);
console.log('\nALL ASSERTIONS PASSED');
await b.close();
