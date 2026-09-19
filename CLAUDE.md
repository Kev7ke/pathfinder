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
button that collects the missing piece. MissionMagician is in that state on
purpose and says so in its own first line.

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

**On the big map, a mission window is an iframe.** The address bar still says
`/`. YMCA is not locked out: the `@match` covers frames, so it boots a second
time inside the mission and a module that belongs there simply runs there. No
reaching across from the parent, ever. Inside the frame there is no navbar, so
it is the floating button that opens it.

**Inside a mission**, `#mission-form` posts to `/missions/<id>/alarm`,
`#vehicle_show_table_body_all` holds the rows, a row is
`.vehicle_select_table_tr`, and the checkbox `.vehicle_checkbox` carries
everything useful as **plain attributes**: `vehicle_type_id`, `fms`, and
capability flags like `fire`, `elw`, `rw`, `dlk`, `gwa`, `fustw`, `any_rtw`.
`#mission_general_info[data-mission-type]` gives the type id, so what a mission
*needs* comes from `/einsaetze.json` and the window is only asked what is
available.

**Ticking a checkbox means dispatching a `change` event.** The game keeps its
counter, water bar and AAO state from `$("body").on("change", ".vehicle_checkbox", …)`.
Setting `checked` alone shows the player something different from what would
be sent.

A capture button takes **structure, not content**: element names, classes,
request paths, which parts of the page changed. Never mission text, addresses,
player names or response bodies.

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
and the `.ymca-card` / `.ymca-note` containers. The first dark build shipped
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

- **Copy problem report** — version, page, browser, script manager, which grants
  are present, how YMCA was reached, the module list, endpoint reachability and
  the last 60 log entries. Deliberately carries **no** building names or
  coordinates.
- **Send feedback** — a typed note packaged with the version, the page, which
  tool was open and the last 25 log entries. Nothing is transmitted; it lands on
  the clipboard for the player to paste wherever they like.
- **Copy interface probe** — the computed styles of the game's own navbar,
  modal, panel and buttons, plus which navbar selectors exist on this page.
  **This is how YMCA gets styled to match the game.** Whoever works on the look
  cannot open the game, so the alternative is guessing at colours.
- **Download everything** — every endpoint, into one file. This one *does* carry
  the player's name, alliance and building coordinates, so it is described as
  such and is never committed to the repo.
- The rest copy one focused thing: station types, vehicle types, dispatch
  centres, which endpoints answer.

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
  why it is as it is.
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
