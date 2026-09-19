# What to verify, ranked by measured impact

Companion to `OPEN_QUESTIONS.md`. That file lists what is unknown. This one lists
what to **do about it**, ordered by what actually moves the planner's output.

The live, editable version of this list is the **Pathfinder Verification Desk**
artifact: it holds the same rows, persists your answers, and exports a corrected
`data/prices.json`. Edit there; this file is the checked-in snapshot.

## How the ranking was produced

Not by judgement. `tools/price_sensitivity.py` halves and doubles every price in
`data/prices.json` and re-runs the ladder on all three paths at three player
states (new = 1 fire station, mid = 10/5/5, late = 25/15/15 — nine frontiers).
A price is **ladder-critical** if perturbing it changes which missions appear as
rungs. Run it yourself:

```
python3 tools/price_sensitivity.py   # impact + sensitivity per extension
python3 tools/path_purity.py         # where each rung's money goes, by department
python3 tools/ladder.py              # the frontier, per path
```

Result: **15 unverified prices move the ladder. 11 unverified prices do not.**
That split matters — it is the difference between an afternoon of work and a week
of it.

## Tier A — answered

Confirmed by the player at the build menu or in game. Details in
`MILESTONES.md`; the live sheet is the Verification Desk artifact.

| id | answer |
|---|---|
| CAP-1 | Mission cap = count of your most-built building type, +1. |
| REQ-1 | Requirements count **buildings**, not vehicles. |
| REQ-2 | Range matters. A call picks a building and spawns in **that building's** range; extensions on it add special calls; specialisation restricts it to those only. |
| CRED-1 | The listed figure is what you receive. A range means the mission spawns at various intensities — which is why one mission name appears several times in the dataset. |
| CRED-2 | No partial credit. A mission completes only when every required vehicle arrives **with correctly trained personnel**. Alliance missions pay **every participant the full amount**. |
| POI-1 | POIs are free and effectively unlimited. |
| POI-2 | A POI must sit inside your own coverage area. |
| SPAWN-1 | Missions spawn continuously up to the cap; timing looks random. Understaffed stations cause low-credit phases. Player's rule: fill a small station to max vehicles before building the next. |
| EMS-3 | Hospital beds and specialist departments gate nothing. **Hospitals leave the ladder.** |
| NAME-1 | Federal Police Station and Federal Police Extension are the same for mission spawn. A standalone station exists with its own building and personnel. |
| SPEC-3 | A specialised station only stops **spawning** other calls. It still counts as a normal station of its type, still responds to missions, and the mission cap is unchanged. Specialisation is optional and does not affect unlocking, so it is out of the ladder entirely. |

## Tier A — still open

| id | question | why |
|---|---|---|
| EMS-1 | **How many credits in total land in your account for one completed ambulance call?** | 96 of the 197 EMS-path missions carry no credit value — counted from `data/missions.json`, which is the game's own `/einsaetze.json`, so the gap is the game's and not the parse's. Confirmed so far: transport is free and hospitals gate nothing — neither says what the call *pays*. Until this number exists the EMS ladder runs on 51% of its own path. **This is what TrackOps is being built to close**: record what each finished mission actually paid, rather than what it was listed at. |
| SPEC-1 | What specialisations exist, what do they cost, can they be undone? | A specialised station generates only its specialised calls. This is the game's own path mechanism and it is absent from the dataset — more important to the planner than any single price. |
| SPEC-2 | Does specialising cut total spawn volume, or only redirect it? | Decides whether a path costs income, and by how much. |
| RANGE-1 | How large is a building's range, and does each area need its own copy of an extension? | The planner prices each extension once, globally. If you need one per area, **every extension rung is under-costed by a multiple** — the largest known cost error in the tool. |
| ALLY-3 | How do alliance missions work: who starts them, how often, is there a cap? | Every participant is paid in full. That is a credit multiplier no purchase on any path competes with. |
| PERS-1 | Which vehicles need which training, how long is each course, how many seats per classroom? | Unlocking a mission and being able to earn from it are different things, and the second is untracked. |
| NAME-2 | Is "Traffic Police Extension" the menu's "Traffic Control Extension"? | 29 missions. If they are two buildings, the price is on the wrong one. |

## Tier A prices — unverified *and* ladder-critical

Read these off the build menu first. Each one currently changes the recommended
build order when perturbed.

| extension | current | source | missions | top mission | frontiers moved |
|---|---|---|---|---|---|
| Disaster Response Extension | 100,000 | estimate | 40 | 56,500 | 5 of 9 |
| Fire Crane Equipment | 50,000 | estimate | 39 | 20,115 | 5 of 9 |
| Technical Rescue Equipment | 50,000 | estimate | 18 | 40,000 | 5 of 9 |
| Fire Marshal's Office | 250,000 | wiki_table | 137 | 56,500 | 4 of 9 |
| Federal Police Station | 200,000 | name_mapped | 55 | 56,500 | 3 of 9 |
| Search and Rescue Equipment | 50,000 | estimate | 7 | 46,900 | 3 of 9 |
| Bomb Squad Extension or Federal Police Station | 200,000 | estimate | 6 | 36,500 | 3 of 9 |
| Rotator Truck Extension | 100,000 | estimate | 23 | 15,400 | 2 of 9 |
| Mountain Rescue Station | 200,000 | estimate | 9 | 14,000 | 2 of 9 |
| Police Helicopter Station | 1,000,000 | name_mapped | 34 | 35,500 | 1 of 9 |
| Flood Control Extension | 100,000 | estimate | 31 | 25,000 | 1 of 9 |
| Traffic Police Extension | 200,000 | name_mapped | 29 | 9,500 | 1 of 9 |
| Police Drone Equipment | 50,000 | estimate | 7 | 8,800 | 1 of 9 |
| Sked Equipment | 50,000 | estimate | 7 | 14,000 | 1 of 9 |
| Litter Equipment | 50,000 | estimate | 5 | 14,000 | 1 of 9 |

## Tier B — distorts the ranking, does not break it

`PRICE-1` station price escalation past the 24th · `PRICE-2` small station really
holds 6 vehicles and 1 extension · `PRICE-3` exact small→full upgrade cost ·
`TIME-1` build time per building · `RANK-1` which buildings are rank-locked ·
`ALLY-1` do alliance-built hospitals, schools and prisons count toward *my*
mission requirements · `REQ-3` does "Foam Extension ×2" mean two total or two
stations · `EX-1` do the two exercise missions self-spawn · `EMS-3` do hospital
departments gate missions · `CRED-2` do credits scale with response size ·
`NAME-3` the three coastal air names · `VEH-1` vehicle cost and count per mission · `CAP-2` do small stations count toward the mission cap (if they do, one more small station of your most-built type may be the cheapest income upgrade in the game).

**Unverified but *not* currently ladder-critical** — do these last, despite the
mission counts looking alarming: Wildland Commando (51 missions), Wildland Air
Command (40), Smoke Jumper Team (39), Coastal Helicopter Hangar (17),
Firefighting Plane Station (16), ATF (12), Game Warden (10), Container Slot (9),
DEA (8), Coastal Plane Hangar (4), Coastal Air Station.

## Tier C — later

`PRICE-4` classroom price (the last surviving Leitstellenspiel number) ·
`COAST-1` coastal air station unlock rate · `ALLY-2` alliance building range ·
`AREA-1` does the coverage-area split actually pay (genuinely open — nobody has
measured it).

## Rule of engagement, unchanged

Build menu or the dataset, or it stays flagged. Two independent sources, or your
own screen. Nothing from a `leitstellenspiel.*` domain is evidence about
MissionChief. See `CORRECTIONS.md` for what happens when that rule is relaxed.

## Done: the dataset now comes from the game

`data/missions.json` is built from the game's own `/einsaetze.json` by
`tools/build_from_game.mjs`. `src/parse_pdf.py` is no longer the route; the old
parse is kept as `data/missions.pdf-parse.json.bak` for comparison.

**The two agreed before the switch.** Matching on distinct mission names:
**778 names carried a credit value in both, and not one disagreed.** Two names
existed only in the old parse, both mangled by PDF line wrapping
("high- risk", "mountain- road"). 244 names existed only in the game, including
seasonal events and real missions the parse never saw.

| | old parse | from the game |
|---|---|---|
| missions | 1,261 | **1,519** |
| vehicle requirements | none | **on 1,000+ missions** |
| requirements as data | reconstructed from a printed table | structured, as the game sends them |
| path assignment | guessed from which station count was highest | the game's own `filter_id` |

**The prerequisite keys were mapped, not guessed.** The game names requirements
`brush_extension`, `fire_investigation_count`, `wasserrettung`; `prices.json` is
keyed by the mission-list names. Every one of the 37 mappings was derived by
matching the two datasets on distinct mission names in **both directions** and
accepted only where the required **counts were identical on every shared
mission**. A one-way match was not enough — it paired `atf_count` with Federal
Police, because all twelve ATF missions happen to need both. The six keys that
did not map are the six that should not: `main_building`, the three station
counts, `max_police_stations` (a cap) and `personnel_educations` (training).

**What changed in the output.** Paths now come from the game's `filter_id`
rather than from whichever station count was highest, which moves some missions
between paths and with them the ceilings: fire still tops out at 56,500, police
now at 24,000 (Collision with Jackknifed Semi-Trailer) rather than 23,000, and
ambulance at 35,000 (Oil Rig Explosion) rather than 40,000.

**EMS-1 got worse, not better.** With the full list, **96 of the 197 ambulance
missions carry no credit value** — 49%, against 54 of 175 before. Half of that
path is still invisible, and the number to fix it is still one completed
ambulance call's payout.

## Answered from the full export

A single **Download everything** export settled several open items at once. The
file carries the player's name, alliance and building coordinates, so it is
**not** committed; the importer reads it in the browser and nothing leaves the
machine.

| id | answer |
|---|---|
| **TIME-1** | Build times are real and readable. Every extension carries `available_at`. Five police stations each queued *Prison cell* then *Additional cell*, and every pair was **exactly 7.000 days** apart — a seven-day build, measured five times independently. A 100,000 extension that is live in a day really can beat a 250,000 one that is not. |
| **Building types** | Confirmed, not inferred. Each building carries `generates_mission_categories`: type 0 makes `{:fire}`, 3 `{:ambulance}`, 5 `{:police}`, while 1, 4 and 29 generate nothing — a dispatch centre, an academy and a prison. The planner reads the department from that field rather than from a table of ids. |
| **Spawn model** | `generates_mission_categories` is the spawn model in data. A building generates the categories it lists and nothing else, which is what the player described. |
| **CAP-2** | Small and full stations share a `building_type` and differ only by `small_building`, so nothing distinguishes them in a count. |
| **VEH-1 (vehicles)** | `/api/vehicles` gives every vehicle with its `vehicle_type` and `building_id`. Their cost is still open. |

Also learned, and not previously in the project:

- **An extension's `type_id` is scoped to its host building**, not global: `type_id: 3`
  is Forestry on a fire station while `type_id: 0` is a Prison cell on a police
  station. Never key an extension by that number alone.
- **Three owned extensions gate no mission** — Prison cell, Additional cell and
  Mass Casualty Trailer Extension. They are recorded in `prices.json` with no
  price rather than left out, so the gap is visible instead of silent.
- `credits` gives the account's current balance and rank, so a plan can say what
  is affordable today rather than only what is cheapest.
- `/api/missions` answers **404** on this game. The export records that, so the
  next person does not go looking for it.

## Keeping it current

The renamer's data tab has **Download everything**: it walks every endpoint the
game serves — the mission list, buildings, vehicles, credits, alliance info,
AAOs, schoolings — and writes one `missionchief-export.json`. An endpoint that
is not served is recorded as an error rather than stopping the rest, so the file
also documents what this game does and does not expose. Re-export after the game
adds content and rebuild rather than trusting a snapshot.

## Corroborated: the dispatch centre rate

A 24-building account, two of them dispatch centres: `1 + floor(22 / 15) = 2`,
which is exactly what that player owns. Consistent with the build-menu figure of
**1 + 1 per 15 buildings**, and inconsistent with the help centre's 1 per 25,
which would allow only one.

## Source note: the Xyrality help centre

Xyrality's own help centre (`xyrality.helpshift.com/hc/en/23-mission-chief/`) is
the developer's site and looks authoritative. It is not reliable on its own.

Its dispatch-centre article still states **1 dispatch centre per 25 buildings**.
That is the exact figure `CORRECTIONS.md` records as wrong: the build menu says
**1 + 1 per 15 buildings**, and the wrong figure had already caused the
coverage-area strategy to be dismissed as unreachable.

So the help centre gets its own provenance level, `official_help`, ranked with
`wiki_table` as **weak** — above a fan wiki, below the player's own screen. Use
it for mechanics that have no number attached (what a building does, what
unlocks what) and never for a figure that the build menu can settle.

Note for future sessions: `xyrality.helpshift.com`, `board.missionchief.com` and
`missionchief.fandom.com` are all blocked by the network egress policy in the
Claude Code web environment. Help-centre content has to be pasted in by hand.
