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

## Tampermonkey script: bulk vehicle renaming

`userscripts/vehicle-renamer.user.js` renames your vehicles from a pattern such
as `{building} {type} {nn}`. Install it by opening the raw file with Tampermonkey
active. It puts a **"Rename vehicles" button in the bottom right of the game**.
If that button is not there, the script is not running — that is the whole
diagnosis. It also registers in the Tampermonkey menu, adds a profile-menu entry
where that markup is found, and exposes `pfRenamer()` in the console.

Run `pfRenamerCheck()` in the console when something is wrong: it reports
whether the script is loaded and whether `/api/vehicles` and `/api/buildings`
actually answer on this game.

- Filters by station and by vehicle type; the counter restarts per station.
- **Preview is mandatory** — nothing is written until you have seen the list and
  confirmed a second time.
- **Undo.** Every run records what each name was before it changed, in this
  browser. Reopen the dialog to preview and apply the reverse, or copy the
  backup out as JSON. If the backup cannot be written the run says so, loudly,
  instead of leaving you without a way back.

It never posts a hand-built request. For each vehicle it fetches
`/vehicles/<id>/edit`, takes the real form out of the response and builds a
`FormData` from it, so the CSRF token and every other setting travel along
untouched; only `vehicle[caption]` is replaced.

`vehicle-renamer.test.mjs` drives the whole cycle — rename, backup, undo — in a
headless browser against a stand-in game server, and asserts the preview names,
the per-station counter, and that both directions keep the CSRF token and every
unrelated vehicle setting. It needs Playwright and a static server on :8777.

The request pattern and the 150-character caption limit come from
[jxn-30/LSS-Scripts](https://github.com/jxn-30/LSS-Scripts) (MIT), which
supports these same MissionChief domains.

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

The source is the **Possible Missions** list at `missionchief.com/einsaetze`. Fetching
it programmatically truncates around row 114, so the full list comes from printing the
page to PDF. Run `src/parse_pdf.py` then `src/build_dataset.py`. Verify the parse by
comparing the count of `(/einsaetze/` link anchors in the PDF against the number of
parsed records — they must match exactly. They currently do, at 1,261.
