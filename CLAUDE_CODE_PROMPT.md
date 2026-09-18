# Prompt for Claude Code

Paste everything below the line into Claude Code, from inside the unzipped
project folder.

---

You are taking over a working prototype and turning it into a maintainable tool.
Everything you need is in this folder. Read `README.md`, `docs/ALGORITHM.md`,
`docs/OPEN_QUESTIONS.md` and `docs/CORRECTIONS.md` before you write any code —
`CORRECTIONS.md` in particular, because it lists mistakes that have already been
made once and are easy to make again.

## The project

A planner for **missionchief.com**, the US/English emergency-services management
game. Not Leitstellenspiel.de — that is a different game and its wikis and forums
are the most common source of wrong answers here. Treat anything from a
`leitstellenspiel.*` domain as not evidence.

The tool takes the player's owned stations and extensions and shows, for a chosen
department path (fire / police / EMS), the cheapest sequence of purchases that
raises the highest-paying mission they can spawn. `docs/ALGORITHM.md` specifies
the computation exactly. It is correct and tested — port it, do not redesign it.

## What exists

`web/planner.html` is a single generated HTML file with the dataset inlined,
produced by `src/build_web_app.py`, which holds the entire app as one Python
string literal. That was fine for prototyping and is now the main problem: the
data, the price table, the algorithm, both language dictionaries and all the CSS
live in one unmaintainable blob, and the player is feeding in corrected prices
every few days.

## What to build

A proper small web app. No backend — it must stay a static site the player can
host anywhere or open locally.

1. **Separate data from code.** `data/missions.json` and `data/prices.json` load
   at runtime. Correcting a price must mean editing JSON, never touching code.
2. **Port the algorithm** from `docs/ALGORITHM.md` into a tested module. Write
   real tests: the frontier must be monotonically increasing in both cost and
   credits; every rung must be reachable from the current state; a price change
   must move the rungs in the expected direction. Test with the current data,
   not fixtures you invent.
3. **Keep the provenance system.** `prices.json` marks every price with a
   `source` field. Prices whose source is `estimate`, `wiki_table`,
   `name_mapped` or `leitstellenspiel` must be visually marked in the UI, and
   any recommendation depending on one must carry a warning. This is the most
   important feature in the tool — it is what stops it from confidently
   recommending a build order based on a guessed number. Do not let a redesign
   quietly drop it.
4. **Make price entry pleasant.** The player reads prices off the in-game build
   menu and types them in. Build a dedicated editor: filter to what is still
   estimated, sort by impact, and let them export the result as a
   `prices.json` they can paste back into the repo. Persist to `localStorage`
   so nothing is lost on reload, and make the export the durable path.
5. **Keep the existing UI features:** English/German toggle, the path selector,
   the owned-stations and owned-extensions inputs, the ceiling card, the ladder,
   the searchable full mission table, and the small-vs-full station price toggle
   (small stations count identically toward requirements and cost half — see
   `prices.json` → `station_rules`).
6. **Do not add income predictions.** The tool ranks unlock efficiency. Spawn
   rates, vehicle tie-up and the concurrent-mission cap are not in the data, and
   any "credits per hour" figure would be invented. `docs/ALGORITHM.md` explains
   what is deliberately excluded and why.

## Also in the folder

`web/alliance-kit.html` — a separate, self-contained editable page of alliance
texts with a progress-bar generator. It works. Leave it alone unless asked, but
if you set up a build for the planner, keep it building too.

`src/parse_pdf.py` and `src/build_dataset.py` regenerate the dataset from a
print-to-PDF of the game's mission list, because that page truncates when
fetched programmatically. Keep them working; the player will need to re-run them
when the game adds missions. The parse is validated by matching the count of
`(/einsaetze/` anchors against the number of parsed rows — currently 1,261 on
both sides. Preserve that check.

## Ground rules

- Where a question can be answered from `data/missions.json`, compute it. Do not
  search the web for something the dataset already contains — the dataset is the
  strongest source in this project.
- If you do search, verify against a second independent source, and never accept
  a Leitstellenspiel source as evidence about MissionChief.
- When you are unsure, mark it in the data and surface it in the UI. Every wrong
  number in this project so far came from a confident guess that looked like a
  fact by the time it reached the screen.
- Ask before changing the algorithm's behaviour. The current design is the
  second attempt; the first one optimised the wrong thing and the reasoning is
  written down in `docs/ALGORITHM.md`.

Start by reading the docs and the two data files, then tell me your plan and what
you think the riskiest part is before you build.
