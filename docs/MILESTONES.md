# Path milestones: making the planner answer "what do I buy next"

A design spec, not an implementation. It changes what the planner *presents*; it
does not redesign the frontier algorithm in `ALGORITHM.md`, which stays as the
layer underneath.

## The complaint

Pick the ambulance path as a new player and the tool eventually tells you to buy
fire stations. That is not a bug in the frontier — it is the frontier doing
exactly what it was specified to do. A small fire station is the cheapest
building in the game (50,000) and fire appears in the requirements of almost
every large mission, so "the cheapest state that raises your ceiling" very often
contains fire stations.

Run `python3 tools/path_purity.py` to see it. The EMS path from a fresh account:

| cost | ceiling | gain per 100k | EMS share of spend | mission |
|---|---|---|---|---|
| 100,000 | 2,500 | 2,500 | 100% | Fired Employee Spills Cleaning Chemicals |
| 200,000 | 5,000 | 2,500 | 100% | Hunting accident |
| 600,000 | 5,600 | 150 | 100% | Small avalanche |
| 1,000,000 | 14,000 | 2,100 | 100% | Moderate gravity avalanche |
| **1,600,000** | **15,400** | **233** | **19%** | **Massive Debris from Rockslide** |
| 1,800,000 | 20,000 | 2,300 | 56% | Airplane Crash in Urban Area with Fire |
| 2,100,000 | 22,500 | 833 | 48% | Airplane Crash with Explosion |
| 2,800,000 | 40,000 | 2,500 | 54% | Roller Coaster Derailment (Major) |

The bold row is what makes the tool feel stupid. It costs 600,000 more than the
rung above, spends 75% of that on fire stations, and raises the ceiling by 1,400
credits — a tenth of the return of the rung below it and a tenth of the rung
above it. A new player following the list in order pays 600,000 for the worst
purchase on the path, immediately before the best one.

The police path has the same shape: rung 5 (*Fire in Aquarium*) costs 1,550,000
more than rung 4, spends 77% of it outside police, and buys 3,000 credits of
ceiling. Rung 6 costs 700,000 and is 100% police.

## The data problem underneath it

**54 of the 175 EMS-path missions carry no credit value at all.** Ambulance
missions pay through patient transport, which is not in the dataset. The EMS
ladder is computed on two thirds of its own path, and the missing third is the
ordinary high-frequency work an ambulance player actually runs.

No presentation layer fixes this. It is `EMS-1` in `VERIFICATION.md` and it
should be answered before anyone tunes the EMS path further.

## Five changes

### 1. Rank by marginal efficiency, not absolute cost

The frontier sorts by absolute cost from the current state — right for drawing a
ladder, wrong for picking a next step. Add:

```
gain_per_100k = (credits[i] - credits[i-1]) / ((cost[i] - cost[i-1]) / 100000)
```

Anything under roughly 400 on this data is a **trap rung**: on the frontier only
because nothing cheaper beats it, not because it is worth buying. Mark it, and
never let it be the headline recommendation.

### 2. Tax the detour, do not ban it

Per rung, compute the share of cost landing in the path's own department
(`tools/path_purity.py` does this). Under 50% is a detour. Detours are real — the
EMS ceiling genuinely needs 14 fire stations — so they stay visible, but in a
separate lane labelled *cross-department requirement*, with the reason attached:
"the top EMS mission needs a fire response; this is when you start building it."

What must never happen is a detour appearing as step 1 of the EMS plan with no
explanation.

### 3. Give each path a milestone spine

A milestone is **the cheapest state that unlocks a new credit band of that path's
own missions**, computed with the detour tax applied and trap rungs removed. That
yields 4–6 named checkpoints per path instead of 8–21 raw rungs. The spine is
what the player sees; the rungs are the detail behind it.

Because it is derived from the same data, a price correction moves the spine
automatically. There is no editorial list to maintain — which matters, because
several of the prices these milestones sit on are still estimates.

### 4. Break milestones into single purchases

"2,800,000 — 14 fire, 15 ambulance, 10 police, Technical Rescue ×2" is not an
instruction anyone can act on. Each milestone needs an ordered purchase queue
where every individual purchase is independently useful, ordered by how many
*already-unlocked* missions it also strengthens. The front page shows one line:
**Buy this next** — one building, its price, what it moves you toward. Everything
else is one click away.

### 5. State the path contract up front

When a player picks EMS, tell them the shape of the road before they start: the
first 1,000,000 is pure ambulance, and above 15,000 credits every EMS ceiling
needs a fire and police response too — that is the game's design, not the tool's.
A path that silently turns into a fire build at rung 5 feels like a bait and
switch. A path that says so at rung 0 feels like a plan.

## The spine as the current data gives it

These move when the prices in `VERIFICATION.md` are confirmed. Several sit on
estimates right now, noted inline.

**Ambulance**
1. *Get spawning* — 2 small ambulance stations, 200,000, ceiling 5,000.
2. *The avalanche branch* — 3 more ambulance stations + Mountain Rescue, Sked,
   Litter, 1,000,000, ceiling 14,000, still 100% EMS. **Three of those four
   prices are estimates.**
3. *First cross-department step* — the airport branch, 1,800,000, ceiling 20,000.
   Fire enters here, and the tool should say so out loud.
4. *Ceiling* — Roller Coaster Derailment, 2,800,000, 40,000. Needs Technical
   Rescue Equipment, **currently an estimate**.

**Police**
1. *Four small police stations* — 200,000, ceiling 10,500. The best
   credits-per-credit in the entire dataset, on any path.
2. *Riot Police* — 600,000, ceiling 13,000, still pure police.
3. *The helicopter tier* — 2,850,000, ceiling 17,000, pure police again. Skip the
   Aquarium rung: detour and trap.
4. *Ceiling* — Clash and assault of risky fans, 4,500,000, 23,000.

**Fire**
1. *Five small fire stations* — 250,000, ceiling 4,800.
2. *Forestry* — 700,000, ceiling 24,000. Excellent value and the last cheap thing
   on the path.
3. *Flood / Disaster Response* — 2,100,000, ceiling 25,000. **Both prices are
   estimates and both are ladder-critical.**
4. *Industrial tier* — 2,850,000 upward: refineries, chemical plants, power
   plants, to 56,500.

## Still deliberately excluded

No credits per hour. Spawn rate, vehicle tie-up and the concurrent-mission cap
are not in the data (`SPAWN-1`, `CAP-1`), and a fabricated rate would undo the
one thing this tool is good at. Milestones rank **unlock efficiency**. Say so on
the screen.
