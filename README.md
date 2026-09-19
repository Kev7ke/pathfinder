# Pathfinder — MissionChief build planner

A browser tool for **missionchief.com** (the US/English game — *not* Leitstellenspiel.de,
which has different buildings, prices and mechanics). It answers one question:

> Given the stations and extensions I own, what is the cheapest thing I can buy
> to unlock a better-paying mission, on the department I actually want to play?

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
  i18n.js           English and German UI strings
  app.js            the UI — rendering only, no computation
  parse_pdf.py      extracts missions from a print-to-PDF of the mission list
  build_dataset.py  normalises requirements into structured fields
tests/
  planner.test.mjs  27 tests against the real dataset
  i18n.test.mjs     both languages load and stay in step
  pattern.test.mjs  the renamer's counter and token rules
web/
  index.html            the app
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

## Tampermonkey script: bulk renaming

`userscripts/vehicle-renamer.user.js` renames **vehicles and stations** from a
pattern. Install it by opening the raw file with Tampermonkey active:

    https://raw.githubusercontent.com/Kev7ke/pathfinder/claude/keen-hawking-g3z0ph/userscripts/vehicle-renamer.user.js

It puts a **"Renamer" button in the bottom right of the game**. If that button is
not there, the script is not running — that is the whole diagnosis. It also
registers in the Tampermonkey menu and exposes `pfRenamer()` in the console.

**Three tabs.** *Vehicles* and *Stations* rename; *Data for Claude* only copies
small pieces of JSON to the clipboard — vehicle types, station types, the
dispatch centres and their stations, a `/einsaetze.json` check, and a self-check
— so nothing has to be typed into a browser console.

**Picking what to rename.** Stations and types are checkbox lists, not
dropdowns, so any combination works. Choosing a dispatch centre and pressing
*Select its stations* stamps that centre's stations onto the selection; every
box stays clickable afterwards, so a station that should be left out is one
click away and no "except" syntax is needed.

**Pattern placeholders.**

| | |
|---|---|
| `{n}` `{nn}` `{nnn}` | counter, padded to as many digits as you write |
| `{x12nn}` | the same counter, starting at 12 instead of 1 |
| `{typenn}` | counts per type, running on across stations |
| `{typex12nn}` | per type, starting at 12 |
| `{dcnn}` | counts per dispatch centre |
| `{type}` `{typeid}` | type name, or its numeric id |
| `{building}` `{dc}` | the station, and the dispatch centre it belongs to |
| `{id}` `{name}` | the object id, and its current name |

On the vehicles tab `{n}` restarts at each station; on the stations tab it runs
across the whole selection. Vehicle names are cut to 150 characters, station
names to 40.

**Safety.** The preview is mandatory and warns before it would write a bare
`Type <number>`, leave `{dc}` empty, or give the same name to more than one
object. Every run records the previous names in this browser, so reopening the
dialog offers the reverse; the backup can also be copied out as JSON. If it
cannot be saved the run says so rather than implying an undo exists.

It never posts a hand-built request. For each object it fetches its edit page,
takes the real form out of the response and builds a `FormData` from it, so the
CSRF token and every other setting travel along untouched; only
`vehicle[caption]` or `building[name]` is replaced.

**Vehicle type names.** `/api/vehicles` sends a numeric `vehicle_type` and fills
`vehicle_type_caption` only for custom types, so standard vehicles have no name
in any data the script can see. Nine names read out of a real en_US fleet ship
with the script; the dialog lets you name the rest, and a button can fetch them
from `api.lss-manager.de` over `GM_xmlhttpRequest` (third-party, opt-in, never
called on its own). Typed names win over the built-in list. To extend that list,
press **Copy type map** and paste the result into `BUILTIN_TYPE_NAMES`.

Station type names start empty for the same reason — use the *Station types*
button on the data tab to send them over.

`vehicle-renamer.test.mjs` drives both tabs in a headless browser against a
stand-in game server and asserts the counters, the dispatch-centre stamp, and
that both kinds of save keep the CSRF token and unrelated fields.
`tests/pattern.test.mjs` pins the counter rules without a browser.

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
