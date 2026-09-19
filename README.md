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
