# Reports

A userscript runs in a browser tab. It cannot write to this repository — there is
no path from the game's page to a git commit, and any button claiming otherwise
would be lying about what it does. So the loop is:

1. A button in YMCA copies or downloads something.
2. You paste or attach it.
3. It lands here as a file, and the next session starts from it rather than from
   a description of it.

That is the whole point of this folder: "look at the reports" has to mean
something a session can actually open.

## What goes where

| file | what it is | which button |
|---|---|---|
| `trackops-<date>.json` | what each mission type paid, against what the game lists | TrackOps → Copy what was measured |
| `mission-type-<id>.json` | one mission type, complete, from the game's catalogue | MissionMagician → Copy this mission type |
| `mission-window-<date>.json` | the structure of a mission window | MissionMagician → Capture this mission window |
| `interface-probe-<date>.json` | the game's own computed styles | Diagnostics → Copy interface probe |
| `problem-<date>.json` | version, page, hooks, the last 60 log entries | Diagnostics → Copy problem report |

## What never goes here

**Diagnostics → Download everything.** It carries the player's name, their
alliance and their building coordinates. It is read in the browser and thrown
away. It is not committed, and no summary of it is either.

Everything else in this folder is checked before it lands: mission *types* are
the game's static catalogue and carry nothing personal; a window capture is
element and field names; a problem report deliberately carries no building names
or coordinates; TrackOps' export carries mission type ids and credit figures, no
balance and no mission instances.
