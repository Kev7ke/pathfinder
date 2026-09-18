# Path milestones: making the planner answer "what do I buy next"

Revision 2. The first version treated the ambulance path's drift into fire
stations as a presentation problem. Player answers since then show it is partly a
*model* problem: the planner is missing the mechanic the game already provides
for playing a path.

## What the player confirmed

| | answer | consequence |
|---|---|---|
| Mission cap | count of your **most-built building type**, +1 | Concentration raises your income ceiling. 25 fire stations = 26 concurrent missions. |
| How a call spawns | a call **picks a building** and spawns inside **that building's** range | Requirements are local, not global. |
| Extensions | an extension on a building lets **that building** spawn special calls | An extension is a spawn source, not just a permission. |
| Specialisation | a specialised station generates **only** its specialised calls | **The game's own path mechanism.** Not in the dataset at all. |
| POIs | free, effectively unlimited, must sit in your coverage area | Free, but geographic. |
| Listed credits | what you actually receive; a range means the mission spawns at various intensities | Validates ranking by the listed average, and explains duplicate mission names in the data. |
| Completion | every required vehicle must arrive **with correctly trained personnel** | Unlocking a mission is not the same as earning from it. |
| Alliance missions | **every participant is paid the full amount** | A 2,000 mission pays 2,000 to each player, even one who sent a single vehicle. |
| Hospitals | gate no mission; transport is free | Hospitals leave the ladder entirely. |
| Requirements | count **buildings**, not vehicles | The existing cost model was right about this. |

## What this does to the algorithm's premise

`ALGORITHM.md` ranks the *highest-paying single mission* and dismisses mission
count, on the grounds that the concurrent cap makes extra low-value missions
displace each other. That reasoning is now only half right.

The cap is `max(count of one building type) + 1`. A mid-game player with 25 fire
stations is running **26 concurrent missions**, not a handful. Filling 26 slots
well is a different optimisation from reaching one 56,500 mission — it is about
the *mix* of what spawns, and the mix is controlled by which buildings exist,
what extensions sit on them, and what they are specialised into.

So the tool is currently optimising a real thing (the ceiling) while ignoring the
thing the player actually asked about (profit). Both matter. They are not the
same ladder.

**This is a change to the algorithm's behaviour, so it is a question, not a
decision.** See "Open decision" at the end.

## Why the ambulance path drifted — the real reason

Not because fire stations are cheap. Because the planner had no concept of
*where missions come from*.

Fire dominates because most players build mostly fire stations, which makes fire
their most-built type (raising the cap on fire terms) and makes fire buildings
the ones that spawn calls. It is a consequence of build choices, not a law of the
game. Specialisation and extensions let a player choose a different mix
deliberately — and the planner never mentioned either.

The player's own read is that fire pays better early and mid game. The dataset
supports the volume half of that: **795 fire missions on the fire path against
291 police and 175 EMS**. Police still wins decisively on ceiling per credit
spent — four small police stations, 200,000, unlock a 10,500 mission — but fire
wins on how often anything spawns at all. Both statements are true, and the tool
should print both rather than pick one.

## The revised plan

### Layer 1 — the ladder (exists, keep it)

Cheapest state that raises your ceiling. Unchanged, still correct, still the
thing that answers "what is the biggest mission I can reach".

### Layer 2 — presentation (specified in revision 1, still valid)

1. **Marginal efficiency.** `gain_per_100k` between rungs; anything under ~400 on
   this data is a trap rung and never the headline.
2. **Detour tax.** Share of each rung's cost landing in the path's own
   department; under 50% is a detour and goes in a labelled lane with its reason.
3. **Milestone spine.** 4–6 derived checkpoints per path instead of 8–21 raw
   rungs.
4. **Single-purchase granularity.** One line on the front page: *buy this next*.
5. **Path contract up front.** Say at rung 0 that the EMS ceiling eventually
   needs fire and police.

The worked example still holds: on the EMS path, rung 5 costs 600,000 more than
rung 4, spends 75% of it on fire stations, and raises the ceiling by 1,400
credits — a tenth of the return of the rungs on either side.

### Layer 3 — spawn mix (new, and the real answer to "maximize profit")

This is what was missing. Three inputs the planner does not yet have:

- **Specialisation** steers which calls a station generates. This is how a path
  becomes real instead of aspirational. Blocked on `SPEC-1` / `SPEC-2`.
- **Building range** decides how often an extension must be replicated. The
  planner prices every extension **once, globally**. If each area needs its own,
  every extension rung is under-costed by a multiple. Blocked on `RANGE-1`. This
  is now the largest known cost error in the tool.
- **Cap concentration.** Because the cap follows your most-built type, "one more
  small station of the type you already have most of" may be the cheapest
  income upgrade in the game. Blocked on `CAP-2` — whether small stations count
  toward the cap.

### Layer 4 — the two levers that dwarf the ladder

Neither is a build order, and both should be stated plainly rather than modelled:

- **Alliance missions pay every participant in full.** Joining one with a single
  vehicle pays the same as carrying it. No purchase on any path competes with
  that. `ALLY-3` is about the rules around it, not whether it matters.
- **Staffing beats unlocking.** A mission completes only when every required
  vehicle arrives with trained personnel. The player's own rule — *fill a small
  station to its maximum vehicles before building the next one* — is better
  advice than any rung on any ladder, and the tool should say so on the front
  page. `PERS-1`, `VEH-1`.

## The spine as the current data gives it

Unchanged from revision 1 in its numbers, with two corrections: hospitals are
removed (they gate nothing), and every EMS milestone is provisional until `EMS-1`
gives a payout figure for ambulance calls.

**Ambulance** — 2 small ambulance stations (200,000, ceiling 5,000) → avalanche
branch (1,000,000, ceiling 14,000, three of its four prices are estimates) →
airport branch (1,800,000, ceiling 20,000, fire enters here) → Roller Coaster
Derailment (2,800,000, 40,000).

**Police** — 4 small police stations (200,000, ceiling 10,500, best value in the
dataset) → Riot Police (600,000, 13,000) → helicopter tier (2,850,000, 17,000;
skip the Aquarium rung, it is a detour and a trap) → Clash and assault of risky
fans (4,500,000, 23,000).

**Fire** — 5 small fire stations (250,000, ceiling 4,800) → Forestry (700,000,
24,000, last cheap thing on the path) → Flood / Disaster Response (2,100,000,
25,000, both prices estimates and both ladder-critical) → industrial tier
(2,850,000 upward, to 56,500).

## Open decision for the player

`ALGORITHM.md` says to ask before changing the algorithm's behaviour, so:

**Should the planner gain a second ladder that optimises the spawn mix for a
26-slot mission cap, alongside the existing ceiling ladder?**

It would rank "what should fill my concurrent slots" rather than "what is the
biggest mission I can reach". It cannot be built until `SPEC-1`, `SPEC-2`,
`RANGE-1` and `CAP-2` are answered — and it must not print credits per hour,
because spawn timing is still unmeasured and the player's own description of it
is "it seems random".

## Still deliberately excluded

No credits per hour. Confirmed as unknowable from the current data: spawn timing
looks random to the player, and low-credit phases come from understaffing rather
than from building choices. Milestones rank **unlock efficiency**; the spawn-mix
layer would rank **slot quality**. Neither is an income prediction.
