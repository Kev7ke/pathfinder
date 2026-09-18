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

## Tier A — the model is wrong until these are answered

These are not price corrections. Each one means the planner is computing the
wrong thing, and no amount of price accuracy fixes it.

| id | question | why |
|---|---|---|
| EMS-1 | What does an ambulance mission actually pay? | **54 of the 175 EMS-path missions have no credit value in the dataset.** Ambulance missions pay through patient transport and that payout was never captured. The EMS ladder is computed on 69% of its own path, and the missing third is the routine work an ambulance player runs all day. This is the single highest-value item on the list. |
| EMS-2 | Is transport pay flat, or does it scale with distance / specialist / patient count? | Decides whether hospitals are a per-mission multiplier or a flat unlock, and therefore whether the planner should ever recommend one. |
| CRED-1 | Is the listed "average credits" what you actually receive? | Every rung is ranked on this number. A mean of a range is still rankable; a figure that *excludes* patient and prisoner transport is not, and would skew the entire tool toward fire. |
| REQ-1 | Does "40 fire stations" mean 40 buildings, or the vehicles they imply? | The whole cost model assumes buildings. If requirements count vehicles, every rung above 1,000,000 is wrong. |
| REQ-2 | Must a required extension be within dispatch range of the mission? | If range matters, the tool under-costs every rung — you would need the same extension once per area. |
| POI-1 | Are POIs free, unlimited, and placeable anywhere? | **629 of 1,261 missions are gated behind a POI** and the planner prices them at zero. A cap or a cost changes every rung that needs one. |
| CAP-1 | Exact concurrent mission cap formula. | The premise of the whole algorithm — the reason it ranks the highest-paying mission instead of mission count. If the cap is much larger than assumed, breadth becomes a real strategy again. |
| SPAWN-1 | What drives mission spawn rate? | Decides whether "buy more small stations" is a strategy in itself. Unmodelled, and the reason the tool refuses to print credits per hour. |
| NAME-1 | Is "Federal Police Station" the menu's "Federal Police Extension"? | 55 missions, including most top-tier fire missions. A wrong mapping distorts the entire upper fire path. |
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
`POI-2` must a POI sit in your coverage area · `NAME-3` the three coastal air names.

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
