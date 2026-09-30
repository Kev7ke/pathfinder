# Pathfinder — MissionChief build planner

A browser tool for **missionchief.com** (the US/English game — *not* Leitstellenspiel.de,
which has different buildings, prices and mechanics). It answers one question:

> Given the stations and extensions I own, what is the cheapest thing I can buy
> to unlock a better-paying mission, on the department I actually want to play?

## Import your game

Press **Choose export file…** at the top of the planner and pick the
`missionchief-export.json` the renamer writes. It fills in your stations and
extensions, shows your credits and rank, and says which extensions are still
under construction and so do not count yet.

The file is read in your browser and never uploaded — it carries your player
name, your alliance and the coordinates of every building you own.

## Run it

**The quickest way — no install, no server.** Download `web/planner-offline.html`
and double-click it. It is one file with the data baked in and it opens straight
in your browser.

**From a clone,** if you want to edit prices and keep them in the repo:

```
git clone -b claude/keen-hawking-g3z0ph https://github.com/Kev7ke/pathfinder.git
cd pathfinder
python3 -m http.server 8000        # or: npm start
```

Then open **http://localhost:8000/web/**. This version loads `data/*.json` at
runtime, so a price you correct in the JSON shows up on reload.

Run the tests with `npm test` (or `node --test tests/*.test.mjs`) — 30 of them,
against the real dataset. Rebuild the single-file version after changing data or
source with `npm run build` (or `python3 tools/build_offline.py`).

## Layout

```
data/
  missions.json     1,261 missions — the dataset the app runs on
  missions_raw.json intermediate parse output, one row per mission variant
  prices.json       every known price WITH ITS PROVENANCE — read this first
  rules.json        confirmed game mechanics, same provenance system
src/
  planner.js        the algorithm: frontier, milestones, purchase queue
  import-game.js    turns a game export into the planner's owned state
  i18n.js           English and German UI strings
  app.js            the UI — rendering only, no computation
  parse_pdf.py      extracts missions from a print-to-PDF of the mission list
  build_dataset.py  normalises requirements into structured fields
tests/
  planner.test.mjs  the algorithm against the real dataset
  i18n.test.mjs     both languages load and stay in step
  pattern.test.mjs  the renamer's counter and token rules
  import.test.mjs   reading a game export into a planner state
userscripts/
  ymca.user.js      GENERATED — the installable tool set
  src/              its shell and modules
web/
  index.html            the same planner outside the game
  planner-offline.html  generated single-file build
  alliance-kit.html     separate, self-contained alliance text kit
tools/
  build_offline.py     the single-file build
  ladder.py            Python reference implementation of the frontier
  price_sensitivity.py which unverified prices actually move the ladder
  path_purity.py       where each rung's money goes, by department
docs/
  ALGORITHM.md      how the ladder is computed and why
  MILESTONES.md     the presentation layer, and what the spawn model changes
  VERIFICATION.md   what to verify, ranked by measured impact
  OPEN_QUESTIONS.md the original open list
  CORRECTIONS.md    mistakes already made — do not repeat them
```

## YMCA — the in-game tool set

`userscripts/ymca.user.js` is a Tampermonkey userscript: a full-screen window
inside MissionChief with the Pathfinder, the Renamer and Diagnostics in it. More
modules follow. Install by opening the raw file with Tampermonkey active:

    https://raw.githubusercontent.com/Kev7ke/pathfinder/claude/keen-hawking-g3z0ph/userscripts/ymca.user.js

It adds a **YMCA** entry to the game's own navbar, next to Buildings and the
rest. Opening it gives a lightbox with a tile per tool; Escape steps back to the
tiles and again to close. If the navbar cannot be found a floating button
appears instead, so "no way in at all" still means the script is not running.

- **StepOps** reads your stations and the mission list live from the game and
  says what to build next. Scope it to one dispatch area, and see which
  extensions under construction actually unlock missions.
- **Renamer** bulk-renames vehicles and stations from a pattern, with a
  mandatory preview and an undo.
- **MissionMagician** and **TrackOps** are scaffolded but not working yet; each
  carries the button that collects what is still missing.
- **Diagnostics** turns every question about the game into a button that copies
  or downloads an answer.

The refresh button in the title bar re-reads the game, so buying a station does
not mean reloading the page.

It is generated — never edit `ymca.user.js` by hand. Sources live in
`userscripts/src/`, and `npm run build:ymca` bundles them together with
`src/planner.js` so the algorithm exists once rather than twice. `CLAUDE.md` is
the full contract: how the shell works, how to add a module, and the rules that
do not change.

## The one thing to get right

**Prices are the weak link, not the mission data.** `data/prices.json` marks every
price with a `source`:

| source | meaning | trust |
|---|---|---|
| `build_menu` | read off the live in-game build menu | truth |
| `player_report` | the player confirmed it in game | truth |
| `name_mapped` | a build_menu price under a different in-game name; the mapping is an assumption | check |
| `official_help` | Xyrality's help centre — still publishes a figure known to be wrong | weak |
| `wiki_table` | a pasted building list already shown to contain outdated entries | weak |
| `leitstellenspiel` | the German game — **wrong game**, must be re-verified | do not trust |
| `estimate` | a heuristic guess, not data | replace |

The app marks any recommendation that depends on an unconfirmed price, on the plan
page and in the ladder. **Keep that behaviour.** A silently wrong price produces a
confident, wrong build order, which is worse than admitting the gap.

Correcting a price means editing `data/prices.json`, never touching code. The
Prices tab does the same thing in the browser and exports the file back.

## What it does not do

It ranks **unlock efficiency** — how cheaply you reach better-paying missions. It is
not an income forecast. Mission spawn timing, vehicle tie-up and staffing are not in
the data, so no credits-per-hour figure appears anywhere, by design.

Two things beat any build order this tool can produce, and it says so on the plan
page instead of pretending to model them: alliance missions pay **every** participant
the full amount, and a mission only completes when every required vehicle arrives
with correctly trained personnel.

## Refreshing the dataset

The game serves its own mission list as JSON, so no PDF is involved any more:

1. In the game, open the renamer and press **Data for Claude → Download everything**.
2. Run `node tools/build_from_game.mjs <the downloaded file>`.

That rewrites `data/missions.json` from `/einsaetze.json`, with the requirements
structured as the game sends them and the vehicles each mission needs. Run
`npm test` afterwards — it checks the shape, that every requirement still
resolves to a price, and the ladder invariants.

`src/parse_pdf.py` and `src/build_dataset.py` are kept for reference, along with
`data/missions.pdf-parse.json.bak`, the last dataset they produced. The two were
compared before the switch: 778 mission names carried a credit value in both and
not one disagreed. See `docs/VERIFICATION.md`.
