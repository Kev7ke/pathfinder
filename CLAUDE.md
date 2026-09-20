# YMCA — Your Mission Chief Alpha

A tool set for **missionchief.com**, built as a Tampermonkey userscript. Think of
it as an LSS-Manager specialised for MissionChief. It grows one module at a time.

Everything below is the contract for working on this repo. Read it before
changing anything.

---

## 1 · Talking to the player

**Whenever you say a new version exists, or that they should update or
reinstall, put the install link in the same message.** Never say "update it" and
leave them to find it.

    https://raw.githubusercontent.com/Kev7ke/pathfinder/claude/keen-hawking-g3z0ph/userscripts/ymca.user.js

If the branch changes, change that link here **and** the `@downloadURL` /
`@updateURL` in `tools/build_ymca.mjs`, which is where the header lives.

**Say plainly when a reinstall is needed rather than an update.** Tampermonkey
does not grant new `@grant` or `@connect` permissions on an in-place update, so
any change to those lines means reinstall.

The player can do copy and paste, and not much more in a browser. **Anything you
need from the game must be a button in Diagnostics** that copies or downloads
it. Never ask them to run something in the console: Chrome blocks pasting there
until `allow pasting` is typed, which cost a round trip once already.

---

## 2 · Versioning

Starts at **0.0.0** and rises in steps of **0.0.1**. Nothing else. No minor or
major bumps, no matter how large the change.

The version lives in **one place**: `VERSION` in `tools/build_ymca.mjs`. It flows
into the userscript header, the window title bar and the problem report. Never
write a version number anywhere else.

---

## 3 · How YMCA is put together

```
userscripts/
  ymca.user.js        GENERATED — never edit, it is overwritten by the build
  ymca.test.mjs       drives the built file in a headless browser
  src/
    shell.js          the window, the module registry, the services
    pf-core.js        adapts the planner to live game data
    mod-stepops.js
    mod-renamer.js
    mod-missionmagician.js
    mod-trackops.js
    mod-diagnostics.js
tools/build_ymca.mjs  the bundler, and the single home of VERSION
```

**Build it with `npm run build:ymca`.** The build exists so the algorithm is
never duplicated: `src/planner.js`, `src/import-game.js` and the prerequisite
mapping in `tools/build_from_game.mjs` are inlined from the same sources the
tests run against. Change them once and both the static app and the userscript
follow. A second copy in the userscript would drift, and the drift would be
silent.

`data/prices.json` is inlined too. The mission list is **not**: inside the game
the Pathfinder reads `/einsaetze.json` live, so it can never be stale.

### The shell

A centred lightbox over a dimmed page, the way the game's own popups work. It
opens on a **launcher of tiles** — one per module — and picking a tile swaps the
panel for that module, with a **← All tools** button in the title bar.

**Escape steps back, it does not slam the door.** Inside a tool it returns to the
tiles; on the tiles it closes the window. That is how the game's lightboxes
behave and people expect it.

**Getting in.** The entry is an item in the game's own navbar, placed the way
LSS-Manager does it, tried against `#navbar-main-collapse > ul` first and then
three narrower fallbacks. The floating button only appears when none of them
matched, and withdraws as soon as the navbar entry lands — so "no way in" still
means "not running" rather than "the markup moved". Which one was used is in the
problem report as `entryPoint`, and every module also registers a Tampermonkey
menu entry.

The click handler sits on the `<li>`, not the `<a>`: the game pads its navbar
items by the list item, so a click can land either side of the text.

### Freshness

`ctx.game()` caches for the whole page load, which is right when switching
between tools and wrong the moment a station is bought or a vehicle moved.
**The refresh button in the title bar** drops the cache and re-mounts the
current tool, so the page does not have to be reloaded. Anything a module
computes from game data must therefore be computed in `mount()`, not cached in
the module itself — otherwise refresh will not reach it.

### Shipping a module that does not work yet

Some tools need something from the game that has never been seen from this
side — the markup of a mission window, how a completed mission is announced.
**Do not guess a selector that clicks things on the player's behalf.** Ship the
module with its settings, a plain warning that it does not work yet, and the
button that collects the missing piece. MissionMagician was in that state for
three rounds of captures before it ticked anything, and its capture button is
still there for a window built differently from the one it was written against.

**When a guess turns out wrong, write down what was wrong in the module's
header.** TrackOps guessed twice — first that the game polls over HTTP, then
that a finished mission leaves the mission list — and both are recorded there,
because the next person to reach for the obvious answer is going to be us.

### How the game actually talks

Three things, learnt the hard way, that anything live has to be built on.

**The game pushes over a socket**, which is already open by the time a
userscript set to `document-idle` runs. Wrapping `fetch` or `XMLHttpRequest`
sees nothing at all.

**The socket is Faye, and it sends JavaScript.** A mission page does
`new Faye.Client('/faye')`, subscribes to `/private-mission<id><locale>` and
runs `eval(data)` on what arrives. So the game's live updates *are* calls to
its own global functions.

**Those functions are reachable, so hook them**: `missionDelete(missionId)`
when a mission ends, `missionMarkerAdd(mission)` when one appears,
`creditsUpdate(balance)` when the balance changes. **Wrap them, never replace
them** — call the original first and hand its return value back, so the game
behaves exactly as it would without YMCA. That is how jxn-30/LSS-Scripts has
done it for years, and it is how TrackOps counts.

**Prefer a hook to a poll.** TrackOps read `/api/credits` before and after a
mission ended, which races the payout and drifts the moment the player buys
anything. The mission window itself shows the right answer:
`tellParent('creditsUpdate(2283098);')`. If a number is being polled for,
the game is probably already announcing it.

**A finished mission does not leave the mission list.** The game adds the class
`mission_deleted` to its panel and leaves it there. A panel carries
`mission_id` and `mission_type_id` as **plain attributes, not `data-`**, and
`mission_type_id` is the key straight into `/einsaetze.json`.

**The game announces the same ending more than once**, so anything hooking
`missionDelete` has to key on the mission instance id. TrackOps' first run
recorded 15 endings that were really 9 missions, and because a second ending
inside the window marked both unattributable, every duplicated mission measured
nothing. Pass every call through to the game; deduplicate only what is written
down.

**On the big map, a mission window is an iframe.** The address bar still says
`/`. YMCA is not locked out: the `@match` covers frames, so it boots a second
time inside the mission and a module that belongs there simply runs there. No
reaching across from the parent, ever. Inside the frame there is no navbar, so
it is the floating button that opens it.

**The game keeps a ledger and names every line.** `/credits/overview` is a
table of amount, description and date: `+575 Patient Treatment and Transport`,
`+1.450 Bar Fight`, `+13.500 Completed task "Treat 6 patients"`, `-5.000 Vehicle
bought`. A mission's payout is the line named after the mission, so nothing has
to be paired with anything. This is where per-mission credits come from, and it
is also the only place the **ambulance service's own income** appears —
"Patient Treatment" and "Patient Treatment and Transport" are not in the mission
list at all. Amounts use a dot for thousands.

**`/einsaetze.json` only lists missions this player can generate.** An alliance
mission from somebody else's building is absent, and so is anything the account
has not unlocked. Every mission window links to the answer anyway:
`#mission_help` → `/einsaetze/<type>`, a plain table of
`Required Firetrucks | 5`. Lowercasing a label and joining it with underscores
gives the key `/einsaetze.json` already uses, so it is the same vocabulary read
from a second place. `Required … Stations` is a precondition for generating the
mission, not something to send.

**Patients are not in `requirements`.** They are `additional.possible_patient`
in the mission catalogue, and the window states the real number three ways:
`#patient_missing_requirements` ("1x We need: Ambulance"), which only renders
while an ambulance is actually wanted; `#patient_button_text` ("1 Patient"),
which is there whenever the mission has patients, including while a first
responder is already on its way; and one element per patient. Read all of them —
reading only the first misses every call where nothing is being flagged.

**"1x We need: Ambulance" is a shortfall, not a total.** The patient panel's
header counts every patient at the mission, treated or not, and that is the
total; the missing-vehicles line counts how many *more* are wanted. Subtracting
what is already there from a shortfall asks for one ambulance and then answers
itself with the one already treating somebody. Read the total where there is
one; where there is only the shortfall, add what is there to it.

One ambulance per patient, and **an ambulance means `any_rtw`**: a Rescue Engine
or a heavy rescue is a fire appliance that can neither treat a patient nor carry
one, and the game does not flag them `any_rtw`.
`chances.patient_transport` is the chance of a transport to hospital afterwards
and answers a different question.

**The `oneof_…` requirement keys name their own alternatives**
(`oneof_fire_engine_or_rescue_or_ladder`), so they are read rather than guessed:
any vehicle with any one of those flags satisfies them.

**Inside a mission**, `#mission-form` posts to `/missions/<id>/alarm`,
`#vehicle_show_table_body_all` holds the rows, a row is
`.vehicle_select_table_tr`, and the checkbox `.vehicle_checkbox` carries
everything useful as **plain attributes**: `vehicle_type_id`, `fms`, and
capability flags like `fire`, `elw`, `rw`, `dlk`, `gwa`, `fustw`, `any_rtw`.
`#mission_general_info[data-mission-type]` gives the type id, so what a mission
*needs* comes from `/einsaetze.json` and the window is only asked what is
available.

**"Covered" is what is committed, never what is planned.** At the mission, on
the way, or ticked. A row that reads covered before a box has been ticked says
nothing, and the plan is not a promise. The game fires `change` on every box it
ticks, its own dispatch orders included, so one listener keeps the count live
for the player's clicks and YMCA's alike — without a redraw.

**Ticking a checkbox means dispatching a `change` event.** The game keeps its
counter, water bar and AAO state from `$("body").on("change", ".vehicle_checkbox", …)`.
Setting `checked` alone shows the player something different from what would
be sent.

**A vehicle can satisfy two requirements at once.** A Quint is flagged `fire`
and `dlk`, a Rescue Engine `fire` and `rw`. So the choice is made **per vehicle,
not per requirement**, and the order of the reasons is the design: what it still
covers, then how little else it could have done, then how many of its kind are
left and how often that kind has been drawn on, and only then how fast it is.

**Versatility is judged on everything a vehicle can do, not on what this mission
asks.** Scope it to the mission's own requirements and a Quint and a pumper look
identical on an engines-only call — and then the nearer Quint goes and the
ladders run dry. Speed is the last tie-break for the same reason.

The same overlap is why "more than the requirement asks for" is not a safe test
for sending one back: take the candidate away and check every requirement again.
And **a vehicle no requirement judges is unaccounted for, not surplus** — an
ambulance on a call whose patients went undetected has no line to be measured
against, and sending it away because nothing asked for it is the wrong reading
of the same silence.

**Order vehicles by travel time, never by distance.** The row's `data-distance`
is how far the dot is; the fourth cell's `timevalue`, in seconds, is when the
vehicle actually arrives. They disagree often enough that ordering by distance
alarms the slower vehicle — which is what the game's own "fastest vehicle"
appeared to do. `timevalue` is filled in after the page settles, so anything
reading it has to re-read rather than trust its first look; fall back to
distance until it is there and **say on screen** that it is doing that.

A capture button takes **structure, not content**: element names, classes,
request paths, which parts of the page changed. Never mission text, addresses,
player names or response bodies.

### Writing for the player

**Say what is, not why it took three tries.** A panel that explains what used to
be wrong with it is asking to be forgiven rather than telling anyone anything.
"1 patient, as this window states" is the whole sentence; what the game leaves
out of its requirement list belongs in the code, where the next person to touch
it will look.

Keep the hedges that change what somebody would do — "too few to rely on yet",
"an unknown type", "it does not dispatch" — and cut the ones that only explain
the work.

### Looking like the game

**The game is dark.** Body and modals are `rgb(80,80,80)` with white text, the
navbar is `rgb(0,73,151)`, panel borders are black, radii are 6px for a modal,
4px for a panel and 3px for a button, and the type is
`"Helvetica Neue", Helvetica, Arial` at 14px with 12px buttons. All of that was
read out of the game with **Diagnostics → Copy interface probe**, not guessed.

Two readings from that probe were deliberately *not* copied: `.btn-default` came
back white on white and `.panel-heading` as `#ddd` on `#f5f5f5`. Both would be
invisible, so they were measured on an element something else was overriding.
Where a reading is implausible, use the Bootstrap 3 default and say so in a
comment — that is the only part of the palette not straight from the game.

**A module never writes a colour of its own.** Use the role classes the shell
provides: `.ymca-dim`, `.ymca-accent`, `.ymca-warn`, `.ymca-bad`, `.ymca-num`,
and the `.ymca-card` / `.ymca-note` containers. An icon is `fill="none"
stroke="currentColor"` at the height of the text beside it, so it takes the
colour of wherever it lands. The first dark build shipped
with light-era greys inlined in the Pathfinder and half its text was
unreadable — the screenshot caught what the tests could not.

When the look needs to change, run the probe again rather than reasoning about
it. It reports resting styles for 21 elements plus the stylesheet rules for
hover, focus and active, which computed styles cannot show.

### Writing a module

```js
YMCA.register({
    id: 'thing',
    title: 'Thing',
    tagline: 'One line for the sidebar',
    description: 'A sentence under the heading.',
    async mount(el, ctx) { /* render into el */ },
});
```

A module renders into the element it is handed and talks to the game only
through `ctx`. It never touches the shell's chrome. `ctx` gives you:

| | |
|---|---|
| `ctx.game(path)` | game JSON, shared between modules, cached **for the page load** |
| `ctx.rawGame(path)` | the same, uncached — for probing whether an endpoint answers |
| `ctx.fetchExternal(url)` | cross-origin via `GM_xmlhttpRequest`, so CORS and the page's CSP cannot block it |
| `ctx.store.read/write` | localStorage namespaced to the module |
| `ctx.log.info/warn/error` | goes into the rolling log the problem report carries |
| `ctx.status(text)` | the status line in the title bar |
| `ctx.clipboard(text, what)` | copy, with the status line as feedback |
| `ctx.download(name, text)` | hand the player a file |
| `ctx.esc` `ctx.fmt` `ctx.sleep` | escaping, number formatting, waiting |

Register order is sidebar order. A module that throws in `mount` shows an error
panel and is logged — it never takes the window down with it.

### A module that belongs in the game's own page

A tool you have to open a lightbox to reach is a tool you stop using, and YMCA's
window is built before a mission frame has finished loading, so it read an empty
page until it was reopened. `YMCA.inject(moduleId, fn)` hands a module a `ctx`
without a mount, with a throw logged rather than left to break the game's page.

**`fn` returns truthy once it has done its job**, and until then it is tried
again as the page grows. Waiting for `DOMContentLoaded` was the mistake: a
mission window pulls in the game's bundle and whatever else the player has
installed, and the log showed the panel landing up to sixteen seconds after the
markup it needed already existed. Watch for the markup, not the last script.

```js
YMCA.inject('missionmagician', (ctx) => {
    if (!onTheRightPage()) return;
    mountPanelIntoTheGame(ctx);
});
```

**Colour the cells, not the table.** Bootstrap's own table styling and the
game's dark theme both set a background on `td` and `th`, so a background on the
`<table>` sits behind them and nothing shows.

**A render that awaits anything needs a token.** Two draws can be in flight at
once — the catalogue, then a mission's requirements page — and the slower, older
one can land last and put a stale plan on screen. Take a number before the first
await and drop the render if it is no longer the newest.

**Injected markup uses the game's own Bootstrap classes** — `panel`, `table`,
`btn`, `label`, `alert` — and never YMCA's role classes, which are scoped to the
window, and never a colour of its own. That way it follows the game into dark
mode without knowing anything about it. Watch whatever the game fills in later
and re-render; do not assume the first look was the whole picture.

### Add a module in five steps

1. Write `userscripts/src/mod-<name>.js` with one `YMCA.register` call.
2. Add it to the `parts` list in `tools/build_ymca.mjs`.
3. Give it a tile icon in `ICONS` in `shell.js`, keyed by module id. Without one
   it falls back to a generic glyph, which is fine but looks unfinished.
4. Bump `VERSION` by 0.0.1.
5. Extend `userscripts/ymca.test.mjs` to open its tile and assert something real.
6. `npm run build:ymca && npm test && node userscripts/ymca.test.mjs`.

---

## 4 · Diagnostics is the channel back

The player sees the game; whoever maintains this does not. Diagnostics exists to
close that gap, and **every new module should add whatever button would let a
question about it be answered with the game's own data.**

**One report, not a button per question.** A reading somebody has to remember to
ask for is a reading they will not have when they need it, so the buttons that
each copied one thing are gone and what they copied rides in the report.

- **Copy the report** — version, page, browser, script manager, grants, how YMCA
  was reached, the module list, **which of every endpoint answered**, the last 60
  log entries, **the interface probe**, **what TrackOps has measured**, and
  **every requirement MissionMagician could not match**. Deliberately carries
  **no** building names or coordinates.
- **Send feedback** — a typed note packaged with the version, the page, which
  tool was open and the last 25 log entries. Nothing is transmitted; it lands on
  the clipboard for the player to paste wherever they like.
- **Download everything** — every endpoint, into one file. This one *does* carry
  the player's name, alliance and building coordinates, so it is described as
  such and is never committed to the repo.

Diagnostics reads the other modules' **stored state** rather than importing from
them, so a module can change or go without breaking the report.

Every game request goes through `getJSON` in the shell, so every failure is in
the log without a module having to remember to log it.

---

## 5 · Ground rules that do not change

- MissionChief (missionchief.com), **not** Leitstellenspiel.de. `docs/CORRECTIONS.md`
  records what happens when that line blurs.
- **Every price and rule carries a `source`.** The player's own build menu and
  their reports are truth; everything else stays marked. Never quietly upgrade a
  guess into a fact. If something is inferred, say so in the code.
- Where a question can be answered from the data, **compute it** rather than
  searching or guessing. The prerequisite mapping in `tools/build_from_game.mjs`
  is the example: derived by matching datasets in both directions with identical
  counts, after a one-way match produced confident nonsense.
- **Ask before changing the ladder's behaviour.** `docs/ALGORITHM.md` explains
  why it is as it is. TrackOps measuring what missions actually pay is exactly
  the sort of thing that should feed StepOps, and exactly the sort of thing not
  to wire in quietly — it is shown in TrackOps and goes no further until asked.
- **Separate what is measured from what is inferred, on screen and not only in
  the code.** TrackOps counts endings, which the game states. It used to infer
  payouts, which it could not: a rise in the balance cannot be told apart from a
  daily task reward or an alliance payment landing in the same few seconds, and
  across 102 missions it put a 320-credit call at 3,716. **A reading that cannot
  be made sound is withdrawn, not caveated.** The deltas are still recorded and
  exported, labelled as balance movements rather than payouts, and nothing
  averages them.
- **Do not tell the player about a setting they chose.** The vehicle range in a
  mission window is theirs and starts at its widest; "not enough in range, widen
  it" is a tool second-guessing a deliberate choice.
- Anything that writes to the player's account needs a **mandatory preview**, a
  confirmation, and a **backup that makes it undoable** — and must say so
  plainly when the backup could not be written.
- **Where there can be no undo, do not write at all.** An alarm cannot be taken
  back, so MissionMagician ticks the game's own checkboxes and stops; the player
  presses Dispatch. The preview is the whole product, and that is not a
  limitation to be lifted later.
- Never post a hand-built form to the game. Fetch the object's own edit page,
  build `FormData` from the real form, replace one field. That is what keeps the
  CSRF token and every unrelated setting intact.

---

## 6 · Checks

```
npm test                          45 tests: algorithm, i18n, pattern rules, import
npm run build:ymca                rebuild userscripts/ymca.user.js
node userscripts/ymca.test.mjs    drives the built userscript (Playwright + a server on :8777)
npm run build                     rebuild web/planner-offline.html
python3 -m http.server 8777       what the browser tests expect
```

Run `npm test` and the ymca test before saying anything works. The browser test
has caught real bugs twice: an empty `form.action` from `DOMParser`, and a
missing comma in the language file that every algorithm test happily ignored.

---

## 7 · The static planner

`web/index.html` is the same planner outside the game, for working on the data
without being logged in. It loads `data/*.json` at runtime;
`python3 tools/build_offline.py` bundles a single file for opening without a
server. It shares `src/planner.js` with YMCA, so a change there must be checked
against both.

---

## 8 · Where the data comes from

`data/missions.json` is built from the game's own `/einsaetze.json` by
`tools/build_from_game.mjs` — not from a printed PDF any more. Refresh it with
Diagnostics → Download everything, then run that script. `docs/VERIFICATION.md`
lists what is confirmed, what is still open, and how each answer was reached.

`data/vehicle-types.json` is the vehicle type ids, their names and the
capability flags the game puts on their checkboxes. It is what the tools fall
back on before they have seen a type themselves.

### Naming a vehicle type

**The game sells every vehicle it has, and the buy page lists them.** A
building's own page links to `…/vehicles/new`. That page is **not a form**: the
first attempt looked for a `<select>` and came back with nothing on every kind of
building. It is one `.vehicle_type` card per vehicle, the name in the card's
`<h3>`, the long name in its `<b>`, and the id in the buy link —
`/buildings/<b>/vehicle/<b>/13/credits` is the Quint.

Every tab of that page — firetrucks, ambulances, trailers, containers — is in
the markup already, hidden rather than fetched, so one request carries all of
them. Vehicles the account cannot afford or has not unlocked are listed too,
with their buttons disabled, and that is exactly what makes it a catalogue
rather than an inventory. One page per *kind* of building covers the lot — a
fire station and an ambulance station sell different vehicles, two fire stations
sell the same ones.

**The buy page names a type; it does not say what the type covers.** So an entry
in `data/vehicle-types.json` may carry a name and no `capabilities`, and that is
not the same as covering nothing: MissionMagician leaves a vehicle of such a
type alone rather than judging it. Capabilities only ever come from a mission
window's selection table, where the flags sit on the checkbox.

That is **Diagnostics → Vehicle types**, and it is the answer to "what is type
99". Learning names from mission windows still happens — the row carries
`vehicle_type` next to the checkbox's `vehicle_type_id`, and it is the only
place the two meet — but it is a fallback, not the method: it needs somebody to
keep playing until a type happens to be in range, and a type added by a game
update would stay nameless until it was.

Names land in `ymca-vehicle-types`, which every module reads, so a name learnt
once is a name the Renamer has too.

### Every report is a dataset update

**When a report comes back carrying something the repo does not have, put it in
the repo.** A tool that only knows what the player's own browser has learnt
starts from nothing on every new machine, and an answer that arrives once and is
not written down has to be asked for again.

- A **vehicle type id** that is not in `data/vehicle-types.json` — from
  `missionmagician.capabilitiesByType` in the report, or from the player's
  `/api/vehicles` — goes in with its name and its flags.
- A **requirement key** in `missionmagician.unmatchedRequirements` gets an entry
  in `MM_REQUIREMENTS`, or stays listed as unmatched on purpose with a reason.
- **Mission types** the catalogue does not carry mean `data/missions.json` is
  behind; rebuild it from a fresh export.
- **Endpoints** that started or stopped answering change the `ENDPOINTS` list in
  Diagnostics.

Each of those carries a `source`, and none of them is inferred from a name.
A type seen only in the player's localStorage is not in the dataset yet — it is
in the dataset when it is in `data/`.
