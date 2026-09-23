# YMCA — Your Mission Chief Alpha

A tool set for **missionchief.com**, built as a Tampermonkey userscript. Think of
it as an LSS-Manager specialised for MissionChief. It grows one module at a time.

Everything below is the contract for working on this repo. Read it before
changing anything.

---

## 1 · Talking to the player

**Whenever you say a new version exists, or that they should update or
reinstall, put the install link in the same message.** Never say "update it" and
leave them to find it.

    https://raw.githubusercontent.com/Kev7ke/pathfinder/claude/keen-hawking-g3z0ph/userscripts/ymca.user.js

If the branch changes, change that link here **and** the `@downloadURL` /
`@updateURL` in `tools/build_ymca.mjs`, which is where the header lives.

**Say plainly when a reinstall is needed rather than an update.** Tampermonkey
does not grant new `@grant` or `@connect` permissions on an in-place update, so
any change to those lines means reinstall.

The player can do copy and paste, and not much more in a browser. **Anything you
need from the game must be a button in Diagnostics** that copies or downloads
it. Never ask them to run something in the console: Chrome blocks pasting there
until `allow pasting` is typed, which cost a round trip once already.

---

## 2 · Versioning

Starts at **0.0.0** and rises in steps of **0.0.1**. Nothing else. No minor or
major bumps, no matter how large the change.

The version lives in **one place**: `VERSION` in `tools/build_ymca.mjs`. It flows
into the userscript header, the window title bar and the problem report. Never
write a version number anywhere else.

---

## 3 · How YMCA is put together

```
userscripts/
  ymca.user.js        GENERATED — never edit, it is overwritten by the build
  ymca.test.mjs       drives the built file in a headless browser
  src/
    shell.js          the window, the module registry, the services
    pf-core.js        adapts the planner to live game data
    mod-stepops.js
    mod-renamer.js
    mod-missionmagician.js
    mod-recruitroom.js
    mod-trackops.js
    mod-elementfriend.js
    mod-highfive.js
    mod-easyedit.js
    mod-switchdispatch.js
    mod-eagleeye.js
    mod-shuteye.js
    mod-stationfascination.js
    mod-diagnostics.js
tools/build_ymca.mjs  the bundler, and the single home of VERSION
```

**Build it with `npm run build:ymca`.** The build exists so the algorithm is
never duplicated: `src/planner.js`, `src/import-game.js` and the prerequisite
mapping in `tools/build_from_game.mjs` are inlined from the same sources the
tests run against. Change them once and both the static app and the userscript
follow. A second copy in the userscript would drift, and the drift would be
silent.

`data/prices.json` is inlined too. The mission list is **not**: inside the game
the Pathfinder reads `/einsaetze.json` live, so it can never be stale.

### The shell

A centred lightbox over a dimmed page, the way the game's own popups work. It
opens on a **launcher of tiles** — one per module — and picking a tile swaps the
panel for that module, with a **← All tools** button in the title bar.

**Escape steps back, it does not slam the door.** Inside a tool it returns to the
tiles; on the tiles it closes the window. That is how the game's lightboxes
behave and people expect it.

**Getting in.** The entry is an item in the game's own navbar, placed the way
LSS-Manager does it, tried against `#navbar-main-collapse > ul` first and then
three narrower fallbacks. The floating button only appears when none of them
matched, and withdraws as soon as the navbar entry lands — so "no way in" still
means "not running" rather than "the markup moved". Which one was used is in the
problem report as `entryPoint`, and every module also registers a Tampermonkey
menu entry.

The click handler sits on the `<li>`, not the `<a>`: the game pads its navbar
items by the list item, so a click can land either side of the text.

### The switchboard

**A tool set that cannot be turned down is one somebody uninstalls whole.**
ElementFriend is a page of **element tiles**, one per part of YMCA the player
may not want, each with a switch on its face and its own settings behind it.

The state lives in the shell, not in ElementFriend: `YMCA.isOn(mod)` is read by
the launcher and by `YMCA.inject`, both of which run before any module mounts,
and `YMCA.switchElement` is the only writer. ElementFriend is the face of it, so
a module going does not take every other module's state with it.

**A switch takes effect where it is flicked.** The shell keeps every injection
it was handed, so switching a module on re-runs it in the page there and then.
Without that, a switch did nothing until the next reload — the injection had
already given up — and a switch that appears to do nothing is a switch that gets
reported as broken. For the same reason the switch is asked **on every attempt**
rather than once at the top, and **a page a module does not belong on is not a
job done**: returning truthy there marks it finished, so the panel never appears
when the player navigates to the page it was waiting for.

**Every tile carries a switch, and every tile says what it is for.** It used to
be the modules somebody might object to; it is all of them now, because the
question the page answers is "what have I got and do I want it", and a page that
lists five of nine tools answers it for five. The tile carries the module's own
`description` rather than its four-word `tagline` — one to three sentences, the
same wording its own panel heads itself with, so there is one thing to keep true
rather than two. **A group tile names what is inside it**: "switch this off and
every one of them goes with it" means nothing until the list is on the tile.

ElementFriend itself is the one thing with no switch. A switchboard that can
switch itself off is a switchboard nobody can switch back on.

**A switch means the whole module, not its tile.** The tile leaves the launcher
*and* `YMCA.inject` refuses to run it, so nothing of it reaches the game's page
either — a switch that left MissionMagician's mission panel standing would be
switching off the part nobody looks at. The Tampermonkey menu answers to the
same switches, because it is the launcher by another route.

Two fields on a module, and no others:

| | |
|---|---|
| `optional: true` | carries a switch, and is listed in ElementFriend |
| `defaultOn` | what it is before anybody has touched it. **On** for anything that works: an update that hides a tool somebody was using is an update that broke, and a tool shipped switched off is a tool nobody finds. Off only while it genuinely does nothing yet — and the day it starts working, that flips |
| `mainTile: false` | never in the launcher. An **element tile**: its work happens in the game's own pages, so a tile on the front would open a panel that does nothing |
| `settings(el, ctx)` | rendered when its element tile is opened. `ctx` is `YMCA.contextFor(mod.id)`, so what it writes lands in the **module's own** namespace and the module reads it back without knowing ElementFriend exists |

### Groups

**A switchboard that grows a row per tweak stops being a page anybody can take
in.** A module may declare `group: '<id>'`, and then it is listed inside that
group's tile rather than beside it. EagleEye is the first: everything under it
changes how the game's own pages *look* and nothing under it changes what the
game *does*.

**A group's page of tiles is `efGroupTiles`, not a copy per group.** EagleEye
had its own, and the moment EasyEdit wanted the same page there would have been
two to keep in step.

**The group is a master switch.** `YMCA.isOn` answers false for a member whose
group is off, so switching EagleEye off takes every layout change with it
without anybody having to remember which ones were on.

**Switching off has to undo what was done.** An injection cannot be un-run, so a
module that changes the game's own markup declares `onSwitch(on, ctx)` and the
shell calls it on both edges. Without it a stylesheet written into the page
stays there until the next reload, which reads as a switch that only works one
way.

### Freshness

`ctx.game()` caches for the whole page load, which is right when switching
between tools and wrong the moment a station is bought or a vehicle moved.
**The refresh button in the title bar** drops the cache and re-mounts the
current tool, so the page does not have to be reloaded. Anything a module
computes from game data must therefore be computed in `mount()`, not cached in
the module itself — otherwise refresh will not reach it.

### Shipping a module that does not work yet

Some tools need something from the game that has never been seen from this
side — the markup of a mission window, how a completed mission is announced.
**Do not guess a selector that clicks things on the player's behalf.** Ship the
module with its settings, a plain warning that it does not work yet, and the
button that collects the missing piece. MissionMagician was in that state for
three rounds of captures before it ticked anything, and its capture button is
still there for a window built differently from the one it was written against.

**HighFive works, and what is left is the filtering.** Status 5 is a vehicle
transporting — an ambulance to a hospital, a patrol car to a prison — and the
point is to pick the destination and land straight on the next one, the way
LSS-Manager does.

**The game already works out which vehicle is next.** A transporting vehicle's
page carries `<a class="btn btn-success" id="next-vehicle-fms-5"
href="/vehicles/15079875">Go to the next vehicle with a transport request</a>`,
so nothing has to be searched for: HighFive reads that href before the pick and
follows it after. The destination itself is a plain
`a[href="/vehicles/<id>/patient/<hospital>"]` — no form on the page at all — and
"leave without transport" is the same link with a negative id
(`#leave_without_transport_no_compensation`).

**The game names the two branches in two languages.** A hospital is
`/vehicles/<id>/patient/<hospital>`; a prison is
`/vehicles/<id>/gefangener/<cell>` — the German word, in an English game,
exactly as `gw_gefahrgut` turned up in an English requirement list. Matching
only the English one is why the ambulances advanced and the patrol cars did not.
**Assume a second spelling wherever the game has two branches**, and read both
off a capture rather than translating one. Each destination carries
`div_free_beds_<id>`, and the list is split into `#own-hospitals` and
`#alliance-hospitals`.

**The page a pick lands on is the proof, and remembering was the wrong
mechanism.** Arming a flag before the click and reading it back after the
navigation has four ways to fail quietly and no way to say which one happened —
and it did fail, for a whole version, while the sorting beside it worked fine.
The capture ended it: a pick lands on `/vehicles/<id>/patient/<hospital>`, a
page with no destinations, no tables, and `#next-vehicle-fms-5` **already on
it**. Nothing has to survive the navigation. "Leave without transport" is the
same path with a negative hospital id, so it moves on the same way.

**It never picks, and it never repeats the click as a fetch.** The player clicks
the hospital; HighFive only remembers where "next" pointed and navigates there
afterwards. Doing the GET on their behalf would be writing something that cannot
be taken back, and a failed fetch would leave a patient untransported while the
panel moved on. **Navigating is not writing** — that is the whole reason this
one can ship where MissionMagician's dispatch cannot.

The jump is one-shot, it expires after thirty seconds, and it checks the landing
page first: if the game already went to the vehicle it was going to send you to,
it does nothing rather than skipping one.

**The columns are asked of the table, not guessed.** Which cell carries the
distance cannot be found by name — 35 destinations came back with
`rowClasses: {}`, not one row carrying a class. So the table answers for itself:
its own `<thead>` names the columns, and a column counts as sortable when most
of its cells read as a number and they are not all the same. A column nobody has
heard of sorts just as well, and a game update that adds one needs no change
here.

**Nearest first, and fifty of whatever that column counts in.** The game's own
order puts your own hospitals above nearer ones, which is not an order anybody
driving there would choose. So the first time a transport page is opened the
sort is set to the column that **names itself** a distance and a ceiling of
fifty goes with it: sending an ambulance across the map is a mistake you only
notice afterwards, and a default that cannot make it is worth more than one that
can be changed. Only ever the first time — `sortBy` being undefined is what
"nobody has chosen yet" looks like, and an empty string is a choice.

**The heading was the wrong place to ask.** A real page came back with **six
headings over seven cells** — `Buildings, Distance, Free beds, Department, ,`
against a row of name, distance, beds, **tax**, department, the button and an
empty one — so the fourth heading sits over the tax column and anything matching
by position is one out from there on. **The cells say it themselves**: a distance
carries its unit (`0.75 km`) and no other column does. Read the value, not the
label over it.

**The columns are worked out once, not per table.** `#own-hospitals` and
`#alliance-hospitals` are two tables of the same shape, and asking each of them
put "Distance" in the dropdown twice — one entry that worked and one that looked
broken.

**Nearest first is the ground state, not a stored choice.** Writing the distance
column into the settings looked like the same thing and was not: the bar writes
its controls back on every redraw, so an empty sort overwrote it within a second
of the first render. The fallback lives in the sorting instead, and only the
ceiling is seeded — once, behind a marker, because `max` is written back as 0
every redraw too and "nobody has chosen" stops being visible after the first one.

**A row says what it is, cell by cell.** The capture gave the shape; **the
player pasted the row that said which cell is which**. A distance carries its
unit, free beds are `n / n`, tax ends in `%`, the department is a `.label` that
says Yes or No, and the first cell repeats all of it for a narrow screen, so it
is asked only for the name. Each cell is read for what it looks like rather than
for where it sits, and a row that answers none of them is left out rather than
guessed at.

**The range is a ceiling on the column being sorted by**, not a distance this
knows the units of. Sort by distance and "at most 20" is twenty of whatever that
column counts in; sort by price and it is a price. The page names the column and
the player names the number, so neither is guessed — and a row whose cell cannot
be read is never hidden by it. "Show the first 10" is the other half of the same
idea. `hospital_max_distance`, `hospital_max_price` and `hospital_own` sit on
the vehicle in `/api/vehicles`, which is where the game keeps its own version of
that setting.

**Nothing left to do is a page that did not move.** A second on the pick page
with no navigation is the game saying there is no next transport — the button it
would have put there is not there. Escape is what the player would press, so
Escape is what is pressed, on the top document as well because the vehicle
window is a frame inside the map's own lightbox. **No function of the game's is
called by name**: nothing here has seen one, and a wrong guess would be a dead
button rather than an honest one.

**A dot before exactly three digits is a thousand; anything else is a decimal
point.** `2.79` is a distance and `1.450` is a thousand and a half, and both
turn up in the same list. Decided per value, which is safe because a column
holds one kind of thing.

**`#own-hospitals` and `#alliance-hospitals` are in the page, but whether they
are the container or the heading above it was never captured.** Both shapes are
handled — the element itself if it holds destinations, otherwise the next thing
after it that does — and where neither works the control is not offered at all
rather than offered and doing nothing. A list of ids to look for answers
nothing on a prison page, so the capture **finds** the sections instead: every
element with an id that holds destination links names itself, however that
branch spells its halves.

**`fms_real` and `fms_show` carry the status**, and the first fleet capture
settled it: both run 1 to 6 across a fleet of 83, so 5 is a value the field
really takes. `fms_real` is what the vehicle is, `fms_show` what the game
displays. `hospital_free_space`, `hospital_max_distance`, `hospital_own`,
`police_cell_free_space` and `police_cell_max_price` sit on the same
`/api/vehicles` record, which is where the two branches of status 5 are told
apart. **That capture found the field without being told its name**, by
reporting every field whose values across the whole fleet are few and small; an
id is never tallied however small it happens to be, so a status names itself
without the player's own identifiers riding along.

**A row that could not be read used to vanish.** `mmOnScene` skipped a row with
no `vehicle_type_id` *before* counting it, so a vehicle already on its way was
not at the mission, not unknown and not mentioned — it simply was not there, and
the panel asked for one more than it needed. Present-but-unreadable is a third
answer and it has to be one: counted as there, said on screen, and carried in
the report as `rowSaidNoType` beside the type ids that were read.

**Green on the cells, not on the row.** Bootstrap's own table styling and the
game's dark theme both put a background on `td`, so a colour on the `<tr>` sits
behind them and nothing shows. `.success` is the game's own class for exactly
this and it is defined for both, so it goes on the row **and** on every cell —
which also means it follows the theme instead of carrying a colour of YMCA's own.

**The police branch is not a table, and that is what was wrong with it.** The
guess was that a prison list states its figures the way a hospital table does.
It does not: thirty-two `<a>` side by side in one `div.prison-select`, an `<h5>`
between yours and the alliance's, and every figure inside the link's own text —
`NYPD | 7th Precinct(Available cells: 2, Distance: 0.69 km, owner's tax: 0%)`.
Everything read `tr` and `cells`, so the bar drew itself over a list it could
then neither sort, cap nor send from.

**So "the row" is worked out, not named.** Climb from the link until it is one
of **several siblings that each hold a destination**: that is what one
destination per block looks like in any layout, table or not, and on the prison
page the answer is the link itself. A list of class names to try would have
answered nothing here, exactly as a list of section ids answered nothing before
it.

**`closest('tr')` is not a shortcut to it, and taking it first broke the
window.** Inside a mission window the whole `div.prison-select` sits in one
`tr.tablesorter-childRow` under the vehicle it belongs to, so the nearest row
swallowed all thirty-two destinations into a single block — the capture showed
it as one "row" with a 2604-character name and no pieces at all. The climb
answers a table on its own anyway: a hospital link's `<td>` has no
destination-carrying siblings, so it climbs to the `<tr>`, which does. One rule,
no shortcut.

**The brackets are the cells.** A block that is not a row states its name and
then a bracketed, comma-separated list, so the head is one piece and each item
inside is another — split only inside the brackets, or a name with a comma in it
comes apart. `Distance: 0.69 km` then **names its own column** on a list that
has no headings at all, and the word in front of the figure comes off before any
rule reads it. That is what lets one set of rules read both shapes.

**Free space is the one plain count a destination states.** The prison list says
`Free cells: 1` where the hospital table says `29 / 30`, so where no piece reads
as `n / n` the first piece that is a plain whole number — after the distance and
the tax have been taken by shape — is that count. Nothing reads the word, so it
is the same rule in whatever language the game is being played in.

**A page with no tax column and no department label simply has neither read**,
which leaves a prison a plain distance case — the safe end to be wrong on. And
green says nothing on a list of green buttons: a block that is not a row is
marked `active`, Bootstrap's own word for the one that is chosen.

**Wherever there are destinations, not only on a vehicle page.** A prisoner is
picked from inside the mission window too, and that page's address is
`/missions/<id>` — so the page is asked what it holds rather than what it is
called. **The step out of the mission window was the missing one**: the
status-5 handling was right all along, and what it never got was the click that
lands on the vehicle, which is where the queue it was written for runs.

**One vehicle at a time, and the link says which.** On a vehicle page every
destination belongs to the same vehicle, so nothing changes there. In a mission
window each vehicle carrying a prisoner has a list of its own — ninety-six links
across three of them — and choosing across the lot would take the nearest cell
for whichever vehicle happened to be closest to it. The href carries the vehicle
id, so the first one in the page is worked and the pick lands on its own page.
"The first ten" is ten per list for the same reason: one running count across
all of them left the later vehicles showing nothing at all.

**A prisoner still waiting for a cell keeps a mission open**, however green the
requirement table is, which is why the bar is offered there at all. It is found
as **a destination link, not as a prison** — the same question HighFive asks of
any page — so a branch nobody here has seen answers it too.

**The best one is marked, and only marked.** Removing the auto-sender took the
choosing with it, and the choosing was never the problem — pressing was. So it is
back as a mark: treatment first, then the nearest of those, then the free one
where the nearest charges and a free one is in the same group. It is judged on
**what is still on screen**, so the range and the sections the player set are
already in it, and it is redone on every redraw — a mark that stayed put when
the range changed would point at a hospital that is no longer offered. One per
list, because in a mission window each vehicle has a list of its own.

**A green row is a recommendation nobody can check**, so the bar says which and
why in words — the click is the player's and the reason has to be readable before
they make it.

**The module is called Status 5 Helper and its id is `highfive`.** The id is the
key every stored setting is filed under, so renaming it would read as a fresh
install to anybody who had already set a range. Only what the player sees
changed.

**A capture button says where it is being pressed, before it is pressed.** The
first one was taken on the map and came back with 67 building links and no
destinations — a whole round trip spent on a button that could have said so.

**When a guess turns out wrong, write down what was wrong in the module's
header.** TrackOps guessed twice — first that the game polls over HTTP, then
that a finished mission leaves the mission list — and both are recorded there,
because the next person to reach for the obvious answer is going to be us.

### How the game actually talks

Three things, learnt the hard way, that anything live has to be built on.

**The game pushes over a socket**, which is already open by the time a
userscript set to `document-idle` runs. Wrapping `fetch` or `XMLHttpRequest`
sees nothing at all.

**The socket is Faye, and it sends JavaScript.** A mission page does
`new Faye.Client('/faye')`, subscribes to `/private-mission<id><locale>` and
runs `eval(data)` on what arrives. So the game's live updates *are* calls to
its own global functions.

**Those functions are reachable, so hook them**: `missionDelete(missionId)`
when a mission ends, `missionMarkerAdd(mission)` when one appears,
`creditsUpdate(balance)` when the balance changes. **Wrap them, never replace
them** — call the original first and hand its return value back, so the game
behaves exactly as it would without YMCA. That is how jxn-30/LSS-Scripts has
done it for years, and it is how TrackOps counts.

**Prefer a hook to a poll.** TrackOps read `/api/credits` before and after a
mission ended, which races the payout and drifts the moment the player buys
anything. The mission window itself shows the right answer:
`tellParent('creditsUpdate(2283098);')`. If a number is being polled for,
the game is probably already announcing it.

**A finished mission does not leave the mission list.** The game adds the class
`mission_deleted` to its panel and leaves it there. A panel carries
`mission_id` and `mission_type_id` as **plain attributes, not `data-`**, and
`mission_type_id` is the key straight into `/einsaetze.json`.

**The game announces the same ending more than once**, so anything hooking
`missionDelete` has to key on the mission instance id. TrackOps' first run
recorded 15 endings that were really 9 missions, and because a second ending
inside the window marked both unattributable, every duplicated mission measured
nothing. Pass every call through to the game; deduplicate only what is written
down.

**On the big map, a mission window is an iframe.** The address bar still says
`/`. YMCA is not locked out: the `@match` covers frames, so it boots a second
time inside the mission and a module that belongs there simply runs there. No
reaching across from the parent, ever. Inside the frame there is no navbar, so
it is the floating button that opens it.

**`missionDelete` says a mission ended, not that you were in it.** An alliance
call somebody else handled ends on your map exactly like one of your own, so
counting endings alone counts what the alliance has run. A mission is yours when
one of your own vehicles was at it, and that is answered from inside the mission
window: `/api/vehicles` is your fleet, `#mission_vehicle_at_mission` and
`#mission_vehicle_driving` say what is there, and an id in both is yours.
Pressing a dispatch control says the same a moment earlier. Nothing is inferred
from the map — a mission never opened and never sent to is unknown, not yours,
and the panel counts it that way.

**The mission catalogue ships the game's own artwork.** `icons` on a record in
`/einsaetze.json` is three paths, green through red, and they are served by the
game, so a list can use `icons[0]` directly.

**The game keeps a ledger and names every line.** `/credits/overview` is a
table of amount, description and date: `+575 Patient Treatment and Transport`,
`+1.450 Bar Fight`, `+13.500 Completed task "Treat 6 patients"`, `-5.000 Vehicle
bought`. A mission's payout is the line named after the mission, so nothing has
to be paired with anything. This is where per-mission credits come from, and it
is also the only place the **ambulance service's own income** appears —
"Patient Treatment" and "Patient Treatment and Transport" are not in the mission
list at all. Amounts use a dot for thousands.

**Find a table's columns, do not assume them.** The ledger reader took cell 0 as
the amount, cell 1 as the description and cell 2 as the date, and dropped any
row with fewer than three cells — three assumptions about a page nobody here had
seen, and on a real account it came back with nothing at all. Each row is asked
instead which of its cells reads as a number and which carries words. A read
that still finds nothing reports the page's **shape** — how many tables, how
many rows, what each cell is called and whether it held digits or words — so the
next version knows what it is looking at without anybody pasting HTML.

**`/einsaetze.json` only lists missions this player can generate.** An alliance
mission from somebody else's building is absent, and so is anything the account
has not unlocked. Every mission window links to the answer anyway:
`#mission_help` → `/einsaetze/<type>`, a plain table of
`Required Firetrucks | 5`. Lowercasing a label and joining it with underscores
gives the key `/einsaetze.json` already uses, so it is the same vocabulary read
from a second place. `Required … Stations` is a precondition for generating the
mission, not something to send.

**Patients are not in `requirements`.** They are `additional.possible_patient`
in the mission catalogue, and the window states the real number three ways:
`#patient_missing_requirements` ("1x We need: Ambulance"), which only renders
while an ambulance is actually wanted; `#patient_button_text` ("1 Patient"),
which is there whenever the mission has patients, including while a first
responder is already on its way; and one element per patient. Read all of them —
reading only the first misses every call where nothing is being flagged.

**A selector list answers in document order, not in the order it is written.**
`querySelectorAll('#patient_button_text strong, #patient_button_form strong')`
reads whichever of the two the page holds first — and `#patient_button_form`
sits before `#patient_button_text` — so "most sure first" was never what
happened. Readings that are ranked have to be separate queries. **It caught the
dispatch button too**: `'#alert_next_btn, .alert_next'` handed back whichever
the page held first, which was not the one meant, and the press went nowhere.

**The catalogue is not the whole requirement.** A skateboard accident wants an
ambulance, produces no patient and lists neither — so the panel read the mission
as finished while the game went on asking. `#missing_text` is the game saying it
out loud, and the same trick that reads the help page reads it: lowercase a
label, join it with underscores, and it is the vocabulary `/einsaetze.json`
already uses. **It is a shortfall, not a total**, exactly as the patient line is,
so what is already there is added back rather than subtracted twice. Only a key
nothing else already asks for is taken, and only one a rule can be found for —
a label this cannot turn into a requirement is left alone rather than invented,
and the row says **as this window states** so it is never mistaken for a
catalogue line.

**And where no page of the game states it at all, it is written down here and
says so on the row.** The skateboard accident cannot be finished until an
ambulance goes: `requirements` is empty of it, no patient spawns, the treatment
bar stays at nothing and `#missing_text` is silent too, so every reading ends
green on a call the game will not close. That is a fault on their side, and the
one requirement in this repo that came from neither the catalogue nor the page.
It is **keyed on the game's own name where no id has been seen** — a made-up id
would put an ambulance on whatever mission happened to hold it — and **on the id
the moment one is reported**, as mission 1167 was, because a type id is the
game's own constant and names exactly one mission where a name only describes
it. It is added only where nothing has already asked for it, so
the day the game lists it the entry becomes a no-op, and the row reads **not in
the game's own list** with the reason under the cursor.

**`possible_patient` does not dispatch anything.** It is the most a mission
*can* produce — 8 on a tunnel fire — and ticking eight ambulances because eight
were possible is the inference this repo does not make. It is marked
`measured: false`, said under the table in those words, and nothing is picked
for it. Only what the window itself states sends an ambulance.

**"1x We need: Ambulance" is a shortfall, not a total.** The patient panel's
header counts every patient at the mission, treated or not, and that is the
total; the missing-vehicles line counts how many *more* are wanted. Subtracting
what is already there from a shortfall asks for one ambulance and then answers
itself with the one already treating somebody. Read the total where there is
one; where there is only the shortfall, add what is there to it.

One ambulance per patient, and **an ambulance means `any_rtw`**: a Rescue Engine
or a heavy rescue is a fire appliance that can neither treat a patient nor carry
one, and the game does not flag them `any_rtw`.
`chances.patient_transport` is the chance of a transport to hospital afterwards
and answers a different question.

**The `oneof_…` requirement keys name their own alternatives**
(`oneof_fire_engine_or_rescue_or_ladder`), so they are read rather than guessed:
any vehicle with any one of those flags satisfies them.

**A checkbox carries its whole capability set, and the game names a capability
the same way twice.** A requirement called `hazmat_vehicles` is answered by
vehicles whose checkbox carries `hazmat`. So the vocabulary is read off the page
rather than kept in a list: every attribute set to `1` is a flag — `fire`,
`dlk`, `rw`, `any_rtw`, `water_damage_pump`, and composites the game writes for
itself like `road_rescue_or_fire_engine` and `ktw_or_rtw`.

That is what lets a vehicle YMCA has never heard of be counted and sent. Where a
requirement key matches an observed flag — as itself, without its plural, or
without a `_vehicles` / `_trucks` / `_cars` / `_units` ending — the row fills
itself, and the panel says **read from the page** so a matched-here row and a
read-here row are not mistaken for each other. The match is only ever made
against a flag some vehicle *in that table* actually carries, so nothing is
invented: a key with no answer in the page stays unmatched and says so.

**A vehicle at a mission carries its type and nothing else.** The row is
`tr[id^="vehicle_row"]`, and `vehicle_type_id` sits on the `<img>` inside its
cell, not on the row or the cell — the cells themselves carry only `sortvalue`,
`rowspan` and `class`, and the controls are `a.btn-backalarm-ajax`. So the
capability flags are **not** there, and looking up what a vehicle already at the
mission covers really does need the dataset. That question is closed.

**Type 0 is a type, and zero is falsy.** `Type 1 fire engine` is
`vehicle_type_id="0"` — the commonest engine in the game. `mmVehicle` read it
with `Number`, which cannot tell it apart from "this row states no type", so
every guard spelled `if (!v.typeId) continue` threw it away: its flags were
never learnt off a selection table, its tank was never learnt, and one at a
mission stayed an unknown type for ever, however many times one was in range.
**A type id is read as the game wrote it, as a string**, so `'0'` is a type and
`null` is no type. It indexes every store exactly as it did, because an object
key is a string either way.

**Somebody else's vehicle at your mission teaches nothing.** It is never in
your selection table, so its checkbox — the only place the flags are written —
is never yours to read. All the at-mission row gives is a type id. An alliance
partner bringing every type he owns is not a capability capture.

**Nobody has to be fed data, and no install waits on a release.** A player's
own game teaches their own install, on its own, on every page but a mission:

- **Flags** are on every checkbox in a mission window, and the sweep reads one
  vehicle page for any type in the fleet nothing knows yet — at most eight at a
  time, a second apart. **It is not on a timer**, and the first version was,
  which made it useless: it wrote "done" before doing anything, so a vehicle
  bought after that sat unlearnt for six hours however often the page was
  reloaded. The check costs nothing — the fleet is already cached — so it runs
  every page load. What is remembered is a type whose page could not be read,
  so a broken one is not retried every time.
- **Tanks come off the same element, and used not to.** A capability is an
  attribute set to `1`, so the flag loop stepped straight over `wasser_amount`,
  and what a type carries was left to be learnt one mission window at a time —
  which means waiting for each type to happen to be in range of a call.
  **Diagnostics — What they can do** reads `wasser_amount`,
  `foam_amount_display` and `water_modifier_raw` off the same element now, and
  reports `answeredWithNoTank` for a page that gave flags and no figures,
  because whether a vehicle's own page states a tank at all has never been seen
  from this side.
- **A sweep marks itself done only once it has read something.** The same
  mistake hid in the catalogue sweep: marked first, so one failure meant a week
  of silence.
- **Names, branches and extensions** come from the buy pages, which list every
  type the game sells whether or not it is owned. Read once a week, because a
  catalogue changes when the game is updated and not while anyone is playing.

Buy a vehicle nobody has ever owned and it is flagged within a page load. A type
added by a game update names itself the next week. `data/vehicle-types.json` is
a head start on day one, not a dependency, and **Diagnostics → Vehicle types /
What they can do** are the same work on demand rather than the only way to get it.

**The sweep runs everywhere but a mission.** Pinning it to `/` was wrong twice
over: a mission window is a frame whose address bar still says `/`, and the
player spends plenty of time on building and vehicle pages where a quiet sweep
is welcome. What it stays out of is the mission itself.

**Counting the crew was tried and withdrawn.** The buy page states
`Max. Crew: 3` and `Requires special education (HazMat)` on every card, and that
read like the answer: count the seats on every vehicle carrying the training.
It is not. **`Max. Crew` is a cap the player sets per vehicle** — the same
HazMat rides with fewer or more — so seats are not people, and a figure built on
them looks measured while being a guess. Nothing in a mission window says who is
aboard. The requirement is stated and nothing counts it. Both facts are kept in
the type store because the game states them; neither is arithmetic.

**…and then the player was asked.** `Max. Crew` is a cap *somebody set*, which
is exactly why the game cannot be read for it and exactly why the person who set
it can. Crew numbers are typed in **ElementFriend → MissionMagician**, one row
per type in the fleet, with `Max. Crew` shown beside as a hint and never as the
value. What the panel adds up is **seats ticked**, labelled as the player's own
number wherever it shows. Whether the people aboard a HazMat hold the HazMat
training is still not something any page says, so it is still not claimed — the
training sentence stays the game's own.

**…and then the game stated it, and both readings above were wrong.** What was
withdrawn was counting `Max. Crew` off the buy page, and that stays withdrawn —
it is a cap somebody set. What was written down beside it was "nothing in a
mission window says who is aboard", and **that is not true**:

- the at-mission and driving tables carry a **Crew** column, stated per
  vehicle — `<td sortvalue="3">3</td>` on a row whose link carries
  `vehicle_type_id="5"`. That row is the only place in the game where a type
  and its crew meet, which is why it is the only place crew can be measured;
- the window states the shortfall itself:
  `<div data-requirement-type="personnel"><b>Missing Personnel:</b>
  14 Firefighters</div>`.

So crew is **measured** now. A type is learnt the first time one of its
vehicles is seen at a mission, exactly as a tank is, and **which cell is the
crew is asked of the header**: the heading is the game's own
`icons8-groups_dark.svg`, and an asset name is the same in every language the
game is played in where the tooltip beside it is not.

**Crew is a total filled by adding vehicles**, the way water is: the people
arrive on whatever is sent, so covering a shortfall of fourteen means sending
until fourteen seats have gone — biggest that fits, then the smallest that
finishes it, ties on the clock. **It is a shortfall**: the game has already
taken off whoever is there and whoever is driving, so nothing is subtracted
twice. A type whose crew has never been stated carries **nobody** rather than a
guess, and the panel says how many of those it picked.

**A training is not seats, and filling it with seats sent an ambulance to a
HazMat call.** `Missing Personnel` on such a call is a shortfall of people who
hold that training, and the mission names which one —
`personnel_educations: { gw_gefahrgut: 1 }`. Any vehicle with a seat satisfies
a count of seats, which is exactly what went wrong. So where the mission names
a training, **only the vehicles the game flags for it are candidates**, and the
flag is derived from the key against the vocabulary the page already carries:
`gw_gefahrgut` finds `gwgefahrgut`, because **the game spells a capability with
and without its underscores** and the derivation reads both now. Still nothing
invented — the flag has to be one some vehicle in that table actually carries.

**A refusal outranks the arithmetic.** The game can turn a send down for want of
trained crew with every row green — nothing on any page counts people — and it
hands the window back with every box unticked, so a panel that only did the
arithmetic would tick the same set again. A danger alert that is not
`.alert-missing-vehicles` and that **names one of the trainings this mission
itself asks for** is the game saying it out loud, and that is the only case
read: an alert naming nothing this mission wants is left alone rather than
guessed at. The table stops calling itself finished for that mission, said in a
sentence beside the crew line, so nobody is told a call is covered that the game
has just refused.

**What is still not claimed is that the people aboard a HazMat hold the HazMat
training.** No page says that. The claim is the other way round: a vehicle the
game does not flag for the training cannot be the one that brings it, so it is
not picked. Where nothing in range carries the flag, **nothing is picked at
all** and the panel says so — sending the wrong vehicle is worse than sending
none.

**`average_credits` is the game's own figure**, in the catalogue the
`#mission_help` link points at, so the panel can show what a call is worth
without measuring anything.

**Hide everything, then put back what is wanted.** ShutEye quietens the map's
mission panels, and naming the parts to hide would mean a part the game adds
next month is one nobody hid. The column is emptied and the progress bar named
back in, so anything new is quiet by default — the way round that stays true.

**It is a stylesheet, not a sweep.** The game redraws those panels constantly —
they are driven by the same socket that announces a mission ending — so hiding
elements one at a time means hiding them again every few seconds and missing the
ones that arrive in between. One rule applies to a panel the game has not drawn
yet.

**`display: contents` is what makes a one-line layout a stylesheet job.** The
artwork and the progress bar live in `.panel-body`; the Dispatch button and the
mission's name live in `.panel-heading`. No amount of flex on either will
interleave them, and moving the nodes with script would have to be done again on
every redraw. `display: contents` takes a box away and lets its children lay out
in the grandparent — heading, body, the row and both columns step out, the panel
becomes the flex row, and `order` lines them up. Anything put back takes
`flex: 1 1 100%` so it gets its own line rather than squeezing the name.

**`display: contents` takes the gradient with the box.** The heading's
background, its text colour and its bottom rule are its own, and giving up its
box gives them up — which left a flat white strip where the game had something
worth looking at, and lost the red/yellow/green that says how a mission is
going. So it is read back off the game the way the shell's palette was:
`getComputedStyle` on one heading **of each state**, moved onto the panel
itself. A state that is not on screen is simply not sampled this time and what
was learnt before is remembered, so after a few page loads all three are known
and a game update repaints them without anybody editing a hex.

**A switch that was flicked off and on again means "do it again".** The shell
used to refuse to re-run a finished injection, which left the switch looking
dead on the very page it was flicked: what the module had placed was taken away
when it went off, and nothing put it back. Switching on clears `done` first.

**Two switches mean two different things.** ElementFriend decides whether
ShutEye is part of this install; the button in `#missions-panel-main` — the row
holding the game's own Emergency and Patient transport filters — decides whether
it is folded right now. The first gates the second, so switching it off takes
the button with it. A switch for how a list reads belongs beside that list, not
two clicks away in a lightbox.

**A name is cut with an ellipsis, not after a set number of words.** A word
count leaves a ragged right edge, and the thing beside it — the progress bar —
is what wants a predictable width. The address is a second sentence inside the
name (`small#mission_address_<id>` inside the caption) and it is what made the
name unreadable in the space left, so it goes by default.

**A mission panel is `#mission_panel_<id>`.** Its heading is
`#mission_panel_heading_<id>` — which also starts with `mission_panel_`, so a
selector meant for the panel has to say `.panel[id^="mission_panel_"]` or it
catches both. The heading holds `a#alarm_button_<id>` (Dispatch),
`span#mission_participant_<id>` and `a#mission_caption_<id>` (the name, with the
address nested inside it). Inside its `.panel-body` the
artwork sits in `.col-xs-1` and everything else in `.col-xs-11`, one `<div>`
each: `mission_overview_countdown_<id>`, `mission_bar_outer_<id>` (the progress
bar), `mission_missing_<id>`, `mission_missing_short_<id>`,
`mission_pump_progress_<id>`, `mission_patients_<id>` and
`mission_prisoners_<id>`.

**A met row greens itself.** Painting the whole table one colour says "something
is missing" without saying what; a row that goes green when its own line is
covered leaves only the missing ones red.

**An AAO is the game stating a capability out loud, and half of
`MM_REQUIREMENTS` is sourced that way.** A dispatch order is a filter built in
the game's own editor, so a button labelled `F-HRV` that ticks exactly the
vehicles carrying `rw="1"` **is the game saying** which flag means a heavy
rescue vehicle. `firetrucks` — `fire`, `platform_trucks` — `dlk`,
`ambulances` — `any_rtw`: every one of those carries that sentence as its
`source`, and none of them was guessed. It was done by hand, one key at a time.

**The editor's form is the vocabulary, stated by the game.** `/aaos/new` carries
a checkbox per capability the game has — `aao[fire]`, `aao[dlk]`, `aao[rw]`,
`aao[gwl2wasser_only]`, `aao[gwgefahrgut]`, `aao[crew_carrier]` — because an
order can say "every vehicle that can do this". That is **every flag the game
has a word for, including ones no vehicle on this account carries**, which is
exactly what a requirement key is matched against: a wider vocabulary is a
shorter `unmatched` list. Beside them sit `vehicle_type_ids[<id>]`, one per type
the game sells.

**The type id is in the field name, not in an attribute**, and the first read
got that wrong: it looked for `vehicle_type_id="4"`, found nothing, and reported
"no page named a vehicle type at all" about a page listing every one of them.
**Ask a form for its field names before deciding it is empty.**

**Sixty-five flags came back, and seventeen requirement keys were the same
word.** `arff`, `brush_truck`, `fire_investigation`, `k9`, `foam`, `fwk`,
`flood_equipment`, `technical_rescue`, `riot_police`, `coastal_boat`,
`fire_aviation`, `search_and_rescue`, `mountain_lift`, `mountain_lift_2`,
`police_drone`, `fbi_drone`, `swat_armored_vehicle` — key and flag identical,
character for character, across 654 mission-uses. That is a **reading, not a
resemblance**, so each went into `MM_REQUIREMENTS` sourced as *the editor names
this flag itself*. Anything needing a suffix added or a word swapped
(`sheriff` — `sheriff_unit`, `boats` — `boot`) is **not** there: that would be
inferring from a name, which every other entry was written to avoid. Forty keys
stay unmatched and stay listed.

**The whole vocabulary is in `data/vehicle-flags.json`**, inlined by the build,
with the editor's own tab as `branch`.

**Nothing is matched against it that was not matched already.** A requirement is
still only ever answered by a flag some vehicle *in that table* actually
carries, because a rule that picks a vehicle nothing in range can be is a rule
that picks nothing. What the vocabulary is for is **telling two silences apart**
— they used to read identically as "left alone":

- the game **has** a word for it and nothing in range carries it. The rule is
  not what is missing, a vehicle is, and that is the player's answer to give:
  *"Nothing in range can do this: SWAT."*
- the game names it nowhere. Then YMCA genuinely does not know what answers it,
  which is ours to fix: *"Left alone: Wobble wagons."* with the button that
  sends the mission type over.

A file the build does not read is a file nobody reads. Three of the sixty-five — `wasser_amount`, `foam_amount`,
`water_damage_pump_value` — are **figures the editor filters on rather than
capabilities**, and are marked `isAmount` so nothing treats them as a flag a
vehicle either has or has not.

**What the editor does not state is which flags a type carries.** The flag boxes
and the type boxes are siblings on a form, not a mapping; they share a tab, and
a tab is a *branch* rather than a capability. So `byTab` is reported as branch
membership and nothing is inferred from it — the per-type flags stay where they
always were, on a vehicle.

**But the editor's own labels do state some of it, and that is a reading rather
than a guess.** A flag checkbox is labelled with the words the game uses for it,
and for a fair number of flags that label *is* a vehicle's name, character for
character — `Fly-Car`, `K-9 Unit`, `Crew Carrier`, `SWAT SUV`. Where a label
names a vehicle the game sells, the game has said that vehicle carries that
flag. And a label that reads `Wrecker or Flatbed Carrier` says it of both, which
is the same reading an `oneof_…` key already gets.

**It was only written down because it was checked against what had been
measured.** Both derivations were run over the types whose flags are already
known from a checkbox: the name match agreed on 8 and the split-on-`or` match on
11, with one apparent miss each — type 27 BLS Ambulance, whose measured record is
`['any_rtw']` alone where its sibling type 5 carries five flags, so the
measurement is the incomplete half. The type names agreed on 59 and differed on
none. **A derivation that cannot be checked against a measurement does not go
in**; this one could be, so it did.

It lands in `namedBy`, **never in `capabilities`**, so what a checkbox said and
what a label said stay tellable apart for ever. `mmKnownTypes` reads the union
of the two, which took the types a vehicle already at a mission can be judged by
from 26 of 106 to 41 of 124 — and 15 of those had no flags at all before.

`/api/v1/aaos` answers with the player's own saved orders:
`id, caption, color, column, hotkey, reset, text_color, automatic_text_color,
aao_category_id, vehicle_classes`. `vehicle_classes` is the flag list an order
selects on, which is the same vocabulary from a second place — and the rest of
it is configuration, so none of it is taken.

**Diagnostics — What the dispatch orders know** reads that form and takes
**field names only**: no order names, no counts, nothing this account owns.

**There is no page that states what an unowned type covers.** The flags are
written per vehicle *instance*, onto that vehicle's checkbox and its own page.
The buy page lists all 106 types with crew, patient transport and required
education — no capabilities. The mission window's script carries only the
selection tabs (`feuerwehr_lf`, `rettungsdienst`, `polizei`, `wasserrettung`,
`fbi`, `brush`, `tow_trucks`, `mountain_rescue`, `occupied`), not a type map. So
the dataset grows from what players actually have, and the open question —
whether an at-mission row carries the flags itself, which would end the need for
it — rides in MissionMagician's report as `tablesNotSeenYet`.

**The station list already says which dispatch centre each station answers
to.** A row is `li#building_list_<id>` carrying `building_type_id` and
`leitstelle_building_id` as plain attributes; a dispatch centre is
`building_type_id="1"` and its own `leitstelle_building_id` is the string
`"null"`. So StationFascination groups by reading, and `/api/buildings` is never
asked. The game filters that list by *kind* of building and never by region,
which is the gap.

**The one you picked belongs at the top.** A flex column on the list and
`order: -1` on the chosen centre is all that takes, and it survives every redraw
because it is keyed on the id the game writes itself.

**A native control needs the system's own colours, not the game's button
classes.** A `<select>` wearing `.btn-default` was unreadable — that class came
back white on white in the probe, and an option highlighted made it worse. It
wears `Field` on `FieldText` instead, with `color-scheme: light dark`: the pair
the browser uses for every other dropdown on the machine, always legible against
itself, and following whatever theme the page is in. That is not a colour of
YMCA's own.

**The game shows the answer in one place and lets you change it in another.**
A building page names its dispatch centre at the top, in
`#building-navigation-container`, between Previous building and Next building;
it is changed in `select#building_leitstelle_building_id`, in the building's own
form far down the page. So moving a run of stations is a scroll down and back up
per station. **SwitchDispatchCenter mirrors the game's own field into that row**
— after the button naming the current centre, or between Previous and Next where
the game names none because none is set.

**A building page is a frame, and ruling frames out ruled out every one of
them.** The game opens a building in its own lightbox —
`<iframe class="lightbox_iframe" src="/buildings/5685072">` — so the address is
`/buildings/<id>` inside an iframe, and the guard that is right for the map's
own modules was wrong here. **Ask the page what it holds, never where it sits.**

**And the select is not on the building page.** A capture came back with
`forms: []` and no `#building_leitstelle_building_id` anywhere: it lives on the
building's own **edit** page, which the building page only links to. That page
is fetched once and hands over both halves at the same time — the options to
offer and the real form to send — which is why one request does it.

**Nothing is built.** The FormData comes out of the game's own form and one
field is replaced, so the CSRF token and every unrelated setting go back exactly
as they came. That is the route RelabelTable already takes. A building the game
does not let you assign — a dispatch centre itself — has no such select on its
edit page, and then nothing is offered rather than offered and dead.

**It looks like the game because it is the game's own dropdown.** The row is a
`.btn-group`, so what goes in it is a nested `.btn-group`: a caret button
wearing `btn btn-default btn-xs`, the same classes as the button naming the
centre beside it, and a `.dropdown-menu` under it. Bootstrap shows that menu on
**`.open`, a class rather than a script**, so none of the game's JavaScript is
needed — and the menu's own `display` is set as well, so it still opens where a
stylesheet is built differently.

**Each entry carries its own button, and that button is the confirmation.** The
name is inert; the tick beside it is the one thing that moves anything. So
choosing is one press rather than pick-then-confirm, and a stray click on a list
still moves nothing — which is the whole reason the arming step existed. Nothing
has to say "Move to LI" either, because the row already names the centre. The
one it is in now is marked and carries no tick: there is nowhere to move it to.

**It opens leftwards, because the row is already at the right-hand edge.** Hung
from the left the menu ran off the screen and half the centres could not be
reached. `dropdown-menu-right` is Bootstrap's own word for it, with `right: 0`
and `left: auto` saying the same thing where that class is not defined. The
`.caret` is turned a quarter to point that way — which keeps the game's own
colour and size and only changes where it points.

**A `.caret` with no `.caret` rule behind it is a zero-sized button**, which is
why the browser test's fixture carries the handful of Bootstrap 3 rules the
game's own stylesheet has. Markup that borrows the game's look has to be tested
against something that supplies it, or "invisible" passes.

**A filter that only hides can be combined with the game's own.** The game's
station search marks rows with `building-filtered-by-search`; a rule that forced
rows visible would fight it. Hiding what is not in the chosen centre and leaving
everything else alone means the two filters simply add up.

**`hire_do` is a plain GET**, the same request the button in the page makes:
`/buildings/<id>/hire_do/1|2|3` for credits, `…/hire_do/coins` for coins. So
recruiting needs no form of its own.

**A station page states its own crew.** `Personnel:` is a `<dt>` whose `<dd>`
reads "16 Employees", the station heads itself with `img.pull-right`, and
hiring is `/buildings/<id>/hire` with the game's own buttons at
`/buildings/<id>/hire_do/1|2|3` for credits and `…/hire_do/coins` for coins.
`/api/buildings` does not carry the count, so RecruitRoom reads each page. It
renders the game's links and presses none of them: credits spent on people do
not come back, and where there is no undo YMCA does not write.

**The extensions tab names the vehicles each extension unlocks**, by name, in
`.allowed-vehicle-types` — which is where the branch a type belongs to is
stated by the game rather than inferred from a buy-page tab.

**Follow-up is a plain switch, and that was the lesson.** It pulls vehicles off
whatever they are doing, so two missions armed at once can take each other's.
That was guarded against three ways — a claim naming the mission that armed it,
a lock beside the switch, an automatic switch-off after dispatching — and each
guard was wrong more often than the thing it guarded against happened:
`Dispatch and Next` loads the next mission into the same frame, and a claim held
past the alarm opened it on a switch its own predecessor was holding shut. It
stays on until it is switched off.

**The game calls the same capability two different things, and says so itself.**
Mission 1008 asks for `personnel_educations: { gw_gefahrgut: 8 }` and spells the
same training `HazMat` under `additional`. The vehicle wears the German name —
`gwgefahrgut`, `gw_gefahrgut_only` — so `hazmat_vehicles` could never match by
spelling, however wide the vocabulary was read. Where a key and a flag are two
names for one thing, `personnel_educations` beside `additional.personnel_educations`
is where the game states the pair.

**A requirement whose value is not a number is not a count of vehicles.**
`personnel_educations: { gw_gefahrgut: 8 }` asks for eight trained crew at the
mission, and they arrive on whatever is sent rather than being sent themselves.
As a row it read "Personnel educations, wanted [object Object]". It is a
sentence under the table instead, in the game's own English — which
`additional.personnel_educations` gives, listing the same trainings in the same
order. That sentence earns its place: it is why a call can sit unfinished with
every row green.

**Water: the biggest tank that still fits, and only then the smallest that
finishes it.** Two wrong answers got here. Adding vehicles in arrival order
sends whatever is close, and what is close is engines: asked for 20,000 gallons
the panel picked eleven when four were wanted. Biggest-first fixed that and
overshot the other way — a fire wanting 20,000 took the one tanker carrying
30,000, spending a vehicle half again over and leaving it out of reach of the
next call. **The question is how little is wasted, not how few are sent.** So
the biggest tank that fits inside what is left, over and over: 12,000 + 4,000 +
4,000 lands on 20,000 exactly. Only when nothing fits any more does the smallest
tank that would finish it go, because then some overshoot is the whole choice.
Big tanks still go first while they fit, so eleven engines are only reached when
nothing bigger is left — which is exactly when they are the right answer. Ties
broken by travel time.

**A tanker multiplies what is there, and the game says by how much.**
`water_modifier_raw` sits on the tanker's own checkbox — 25 on a Water Tanker
and on a Pumper Tanker, absent on a Quint — and the game's own
`calculateWaterBar` sums those across the ticked boxes into
`water_total_modifier` beside the plain total. Adding the loads up flat ignored
it, which is how a fire wanting 20,000 gallons was sent 60,000. So the loads are
totalled and the percentages raise the lot, the way the game's own code does it,
and what a vehicle is worth is the **marginal** gain at that moment: its load
raised by every percentage already committed, plus its own percentage raising
everything already there. That is also why **tankers fill a fire first without
being named** — a tanker carrying a big load *and* lifting everything already
there outgrows any engine the moment anything is on scene. Foam carries no such
field, so foam stays a plain sum.

**The game's own water bar is not the measure.** It counts what is actually
available, not what the call is short of, so nothing here is calibrated against
it.

**A vehicle that fits is not therefore worth sending.** Once the tankers are on,
what is left is small and every engine in the fleet fits it — five went where
one more tanker would have done, which is the nine-appliance send that was
complained about. A vehicle covering **less than half of what is left** is not
filling the gap, so where one vehicle can finish the job instead, that one goes.
Not at any price: a finisher worth more than twice what is left is its own kind
of waste, and then the fitting one goes after all. And "the smallest that
finishes" has to mean exactly that — taken as the smallest of the whole pool it
dribbled fifty-gallon brush trucks in one at a time.

**A tank already on its way counted for nothing.** The amount lines shipped with
`onScene: 0` because the tally beside them counts vehicles by flag and a tank is
not a flag — so a call with two Water Tankers and eight Pumper Tankers already
driving to it was asked for the full 20,000 again, and the panel sent the fleet
twice. A row at the mission carries a type id and nothing else, so **the tank is
learnt off the selection table's checkboxes** (`wasser_amount`,
`foam_amount_display`) exactly as the flags are, and looked up by type. A zero is
stored as a zero — knowing a patrol car carries nothing is an answer; not knowing
what a tanker carries is not, and the panel says which of the two it is.

**The flag vocabulary is everything the game has ever flagged**, not only what
is in the table now. A HazMat out of range today still taught `hazmat` the day
it was in a selection list, and `hazmat_vehicles` is no less real a requirement
for the vehicle being busy.

**The keys are the player's.** `d` was written into the handler, which is fine
until somebody's layout, their browser or the game itself already wants it. Tick
and untick are one letter each, set in ElementFriend, **and empty is a real
answer** — a key nobody wants is one that gets in the way of something else.
Letters only: a digit is one of the game's own dispatch orders and a chord is a
browser shortcut. They are read on every press rather than captured when the
panel drew, so a change takes effect without reopening the mission, and the
button carries whichever letter is set so it can still be found.

**The switches stack, the buttons keep the last line.** They were one row until
a fourth switch pushed the buttons off the end — and the one thing that must
never move is the button the cursor is already on. Switches wrap on the left,
buttons sit hard right on a line of their own.

**One height, whatever the mission asks for.** A panel that grows with the
requirement count moves the buttons under the cursor between one mission and the
next. The frame is six rows tall and stays there: fewer leave space, more scroll
inside it behind a mask that fades the last rows and lifts once the end is
reached.

**A glyph drawn edge to edge needs a viewBox bigger than its paths.** At
`0 0 20 20` a 1.5 stroke put half its width outside the box and the outermost
lines came back shaved; the box carries the overhang instead of the paths being
redrawn.

**Versatility is still judged on the named flags**, not on every attribute. The
composites mean the game has several ways of describing the same vehicle, and
counting them would rank a vehicle by how talkative the game is about it.

**Only one of the five dispatch controls submits the form.** `Dispatch` is
`input[name="commit"]` inside `#mission-form`; `Dispatch and Next`
(`.alert_next`), the alliance one that shares as it goes
(`.alert_next_alliance`) and both navbar buttons (`#mission_alarm_btn`,
`#mission_alarm_btn_mobile`) are `<a href="#">` that post by themselves. Anything
that has to know a mission was dispatched watches all five.

**Inside a mission**, `#mission-form` posts to `/missions/<id>/alarm`,
`#vehicle_show_table_body_all` holds the rows, a row is
`.vehicle_select_table_tr`, and the checkbox `.vehicle_checkbox` carries
everything useful as **plain attributes**: `vehicle_type_id`, `fms`, and
capability flags like `fire`, `elw`, `rw`, `dlk`, `gwa`, `fustw`, `any_rtw`.
`#mission_general_info[data-mission-type]` gives the type id, so what a mission
*needs* comes from `/einsaetze.json` and the window is only asked what is
available.

**At the mission and on the way are not the same certainty.** One that has
arrived is there; one that is driving carries a recall button on its very row,
and on an alliance call it may not be yours at all. Both meet the requirement,
so both are counted — but they are counted separately and the panel says which
is which, because "why does it want one fewer than I do" has to have an answer
on screen. **Count what is on the way** is a switch for the player who does not
want the second kind counted.

**"Covered" is what is committed, never what is planned.** At the mission, on
the way, or ticked. A row that reads covered before a box has been ticked says
nothing, and the plan is not a promise. The game fires `change` on every box it
ticks, its own dispatch orders included, so one listener keeps the count live
for the player's clicks and YMCA's alike — without a redraw.

**Ticking a checkbox means dispatching a `change` event.** The game keeps its
counter, water bar and AAO state from `$("body").on("change", ".vehicle_checkbox", …)`.
Setting `checked` alone shows the player something different from what would
be sent.

**A vehicle can satisfy two requirements at once.** A Quint is flagged `fire`
and `dlk`, a Rescue Engine `fire` and `rw`. So the choice is made **per vehicle,
not per requirement**, and the order of the reasons is the design: what it still
covers, then how little else it could have done, then how many of its kind are
left and how often that kind has been drawn on, and only then how fast it is.

**Versatility is judged on everything a vehicle can do, not on what this mission
asks.** Scope it to the mission's own requirements and a Quint and a pumper look
identical on an engines-only call — and then the nearer Quint goes and the
ladders run dry. Speed is the last tie-break for the same reason.

The same overlap is why "more than the requirement asks for" is not a safe test
for sending one back: take the candidate away and check every requirement again.
And **a vehicle no requirement judges is unaccounted for, not surplus** — an
ambulance on a call whose patients went undetected has no line to be measured
against, and sending it away because nothing asked for it is the wrong reading
of the same silence.

**Order vehicles by travel time, never by distance.** The row's `data-distance`
is how far the dot is; the fourth cell's `timevalue`, in seconds, is when the
vehicle actually arrives. They disagree often enough that ordering by distance
alarms the slower vehicle — which is what the game's own "fastest vehicle"
appeared to do. `timevalue` is filled in after the page settles, so anything
reading it has to re-read rather than trust its first look; fall back to
distance until it is there and **say on screen** that it is doing that.

A capture button takes **structure, not content**: element names, classes,
request paths, which parts of the page changed. Never mission text, addresses,
player names or response bodies.

### Writing for the player

**Say what is, not why it took three tries.** A panel that explains what used to
be wrong with it is asking to be forgiven rather than telling anyone anything.
"1 patient, as this window states" is the whole sentence; what the game leaves
out of its requirement list belongs in the code, where the next person to touch
it will look.

Keep the hedges that change what somebody would do — "too few to rely on yet",
"an unknown type", "it does not dispatch" — and cut the ones that only explain
the work.

### Looking like the game

**The game is dark.** Body and modals are `rgb(80,80,80)` with white text, the
navbar is `rgb(0,73,151)`, panel borders are black, radii are 6px for a modal,
4px for a panel and 3px for a button, and the type is
`"Helvetica Neue", Helvetica, Arial` at 14px with 12px buttons. All of that was
read out of the game with **Diagnostics → Copy interface probe**, not guessed.

Two readings from that probe were deliberately *not* copied: `.btn-default` came
back white on white and `.panel-heading` as `#ddd` on `#f5f5f5`. Both would be
invisible, so they were measured on an element something else was overriding.
Where a reading is implausible, use the Bootstrap 3 default and say so in a
comment — that is the only part of the palette not straight from the game.

**A module never writes a colour of its own.** Use the role classes the shell
provides: `.ymca-dim`, `.ymca-accent`, `.ymca-warn`, `.ymca-bad`, `.ymca-num`,
and the `.ymca-card` / `.ymca-note` containers. An icon is `fill="none"
stroke="currentColor"` at the height of the text beside it, so it takes the
colour of wherever it lands. The first dark build shipped
with light-era greys inlined in the Pathfinder and half its text was
unreadable — the screenshot caught what the tests could not.

When the look needs to change, run the probe again rather than reasoning about
it. It reports resting styles for 21 elements plus the stylesheet rules for
hover, focus and active, which computed styles cannot show.

### Writing a module

```js
YMCA.register({
    id: 'thing',
    title: 'Thing',
    tagline: 'One line for the sidebar',
    description: 'A sentence under the heading.',
    async mount(el, ctx) { /* render into el */ },
});
```

A module renders into the element it is handed and talks to the game only
through `ctx`. It never touches the shell's chrome. `ctx` gives you:

| | |
|---|---|
| `ctx.game(path)` | game JSON, shared between modules, cached **for the page load** |
| `ctx.rawGame(path)` | the same, uncached — for probing whether an endpoint answers |
| `ctx.fetchExternal(url)` | cross-origin via `GM_xmlhttpRequest`, so CORS and the page's CSP cannot block it |
| `ctx.store.read/write` | localStorage namespaced to the module |
| `ctx.log.info/warn/error` | goes into the rolling log the problem report carries |
| `ctx.status(text)` | the status line in the title bar |
| `ctx.clipboard(text, what)` | copy, with the status line as feedback |
| `ctx.download(name, text)` | hand the player a file |
| `ctx.esc` `ctx.fmt` `ctx.sleep` | escaping, number formatting, waiting |

Register order is sidebar order. A module that throws in `mount` shows an error
panel and is logged — it never takes the window down with it.

### A module that belongs in the game's own page

A tool you have to open a lightbox to reach is a tool you stop using, and YMCA's
window is built before a mission frame has finished loading, so it read an empty
page until it was reopened. `YMCA.inject(moduleId, fn)` hands a module a `ctx`
without a mount, with a throw logged rather than left to break the game's page.

**Register before you inject.** `YMCA.isOn` answers false for a module it cannot
find, and it cannot tell "switched off" from "not registered yet" — so four
files calling `YMCA.inject` above their own `YMCA.register` read as switched off
on the very page they were injected into, silently. The shell logs an error if
it happens again.

**`fn` returns truthy once it has done its job**, and until then it is tried
again as the page grows. Waiting for `DOMContentLoaded` was the mistake: a
mission window pulls in the game's bundle and whatever else the player has
installed, and the log showed the panel landing up to sixteen seconds after the
markup it needed already existed. Watch for the markup, not the last script.

```js
YMCA.inject('missionmagician', (ctx) => {
    if (!onTheRightPage()) return;
    mountPanelIntoTheGame(ctx);
});
```

**Colour the cells, not the table.** Bootstrap's own table styling and the
game's dark theme both set a background on `td` and `th`, so a background on the
`<table>` sits behind them and nothing shows.

**A render that awaits anything needs a token.** Two draws can be in flight at
once — the catalogue, then a mission's requirements page — and the slower, older
one can land last and put a stale plan on screen. Take a number before the first
await and drop the render if it is no longer the newest.

**`text-muted` inside an `alert` is grey on blue.** Bootstrap's muted grey is
meant for a white panel; in a coloured alert it is the one thing on the page
nobody can read. Inside an alert the alert sets the colour, so nothing else
should — dim it with `opacity` instead, which is not a colour and follows
whatever theme the game is wearing.

**Injected markup uses the game's own Bootstrap classes** — `panel`, `table`,
`btn`, `label`, `alert` — and never YMCA's role classes, which are scoped to the
window, and never a colour of its own. That way it follows the game into dark
mode without knowing anything about it. Watch whatever the game fills in later
and re-render; do not assume the first look was the whole picture.

### Add a module in five steps

1. Write `userscripts/src/mod-<name>.js` with one `YMCA.register` call. Decide
   whether it carries a switch (`optional: true`, and `defaultOn: false` if it
   does not work yet) and whether it belongs in the launcher at all
   (`mainTile: false` makes it an element tile).
2. Add it to the `parts` list in `tools/build_ymca.mjs`.
3. Give it a tile icon in `ICONS` in `shell.js`, keyed by module id. Without one
   it falls back to a generic glyph, which is fine but looks unfinished.
4. Bump `VERSION` by 0.0.1.
5. Extend `userscripts/ymca.test.mjs` to open its tile and assert something real.
6. `npm run build:ymca && npm test && node userscripts/ymca.test.mjs`.

---

## 4 · Diagnostics is the channel back

The player sees the game; whoever maintains this does not. Diagnostics exists to
close that gap, and **every new module should add whatever button would let a
question about it be answered with the game's own data.**

**One report, not a button per question.** A reading somebody has to remember to
ask for is a reading they will not have when they need it, so the buttons that
each copied one thing are gone and what they copied rides in the report.

- **Copy the report** — version, page, browser, script manager, grants, how YMCA
  was reached, the module list, **which parts are switched on in ElementFriend**,
  **which of every endpoint answered**, the last 60 log entries, **the interface
  probe**, **what TrackOps has measured**, **every requirement MissionMagician
  could not match**, and **whatever HighFive has captured**. Deliberately carries
  **no** building names or coordinates. Half of "it does nothing" is "it is
  switched off", and that is not something a player thinks to mention.
- **Copy what is missing** — the difference between what this install has
  learnt and what `data/vehicle-types.json` carries: types with no entry, entries
  with no capabilities, no `tank`, no `crewSeen`, and the requirements nothing
  could match. **Everything else here says what the game says; this says what is
  new**, which is the only thing a round trip is ever really spent on. Asking for
  a whole report and reading four sections of it for the three lines that are new
  is work on both sides, and the repo ships inside the very script doing the
  comparing — so it is taken in the page rather than by hand afterwards. It costs
  nothing but a look at localStorage, so **the same line is on screen the moment
  Diagnostics opens**, including when it says there is nothing to send. It rides
  in **Send this one** as `missingFromRepo`.
- **Send feedback** — a typed note packaged with the version, the page, which
  tool was open and the last 25 log entries. Nothing is transmitted; it lands on
  the clipboard for the player to paste wherever they like.
- **Send this one** — everything the repo has ever asked for, in a single
  downloadable file, with nothing in it that is the player's: every vehicle type
  and what it can do, how many of each they own as a count, the game's own
  mission list, what TrackOps has run, what the ledger says each paid, every
  requirement MissionMagician could not match, and what HighFive captured. **The
  reason there are two download buttons is that one of them can be posted in
  public and the other cannot.** A reading that arrives by a button somebody has
  to be told about is a reading that does not arrive.
- **Download everything** — every endpoint, into one file. This one *does* carry
  the player's name, alliance and building coordinates, so it is described as
  such and is never committed to the repo.

Diagnostics reads the other modules' **stored state** rather than importing from
them, so a module can change or go without breaking the report.

Every game request goes through `getJSON` in the shell, so every failure is in
the log without a module having to remember to log it.

---

## 5 · Ground rules that do not change

- MissionChief (missionchief.com), **not** Leitstellenspiel.de. `docs/CORRECTIONS.md`
  records what happens when that line blurs.
- **Every price and rule carries a `source`.** The player's own build menu and
  their reports are truth; everything else stays marked. Never quietly upgrade a
  guess into a fact. If something is inferred, say so in the code.
- Where a question can be answered from the data, **compute it** rather than
  searching or guessing. The prerequisite mapping in `tools/build_from_game.mjs`
  is the example: derived by matching datasets in both directions with identical
  counts, after a one-way match produced confident nonsense.
- **Ask before changing the ladder's behaviour.** `docs/ALGORITHM.md` explains
  why it is as it is. TrackOps measuring what missions actually pay is exactly
  the sort of thing that should feed StepOps, and exactly the sort of thing not
  to wire in quietly — it is shown in TrackOps and goes no further until asked.
- **Separate what is measured from what is inferred, on screen and not only in
  the code.** TrackOps counts endings, which the game states. It used to infer
  payouts, which it could not: a rise in the balance cannot be told apart from a
  daily task reward or an alliance payment landing in the same few seconds, and
  across 102 missions it put a 320-credit call at 3,716. **A reading that cannot
  be made sound is withdrawn, not caveated.** The deltas are still recorded and
  exported, labelled as balance movements rather than payouts, and nothing
  averages them. **The ledger is the other half of that rule and it is
  measured**: `/credits/overview` is the game writing down what it paid and what
  it paid it for, so a line named after a mission is a reading, not a pairing.
  TrackOps shows it per row as **Paid**, beside the game's own **Listed**
  figure, with the number of lines the average is made of — and it still goes no
  further than TrackOps until asked.
- **Do not tell the player about a setting they chose.** The vehicle range in a
  mission window is theirs and starts at its widest; "not enough in range, widen
  it" is a tool second-guessing a deliberate choice.
- Anything that writes to the player's account needs a **mandatory preview**, a
  confirmation, and a **backup that makes it undoable** — and must say so
  plainly when the backup could not be written.
- **Where there can be no undo, do not write at all.** An alarm cannot be taken
  back, so MissionMagician ticks the game's own checkboxes and stops; the player
  presses Dispatch. The preview is the whole product, and that is not a
  limitation to be lifted later.
- **The line is LSS-Manager's line, and two modules were the wrong side of it.**
  A tool that sorts, counts, shows and ticks is one that helps somebody play;
  one that presses the game's own buttons through a queue is playing for them,
  and that is what an automation rule is aimed at. **MissionMagician Auto** and
  **HighFive Auto** were removed in 0.0.51 — not switched off, removed — and the
  work they were built on stayed, because none of it was the pressing:
  MissionMagician ticks and stops, HighFive sorts, caps and follows the game's
  own `#next-vehicle-fms-5` **after a pick the player made**, pressing Escape
  when the game names no next transport. That is exactly LSS-Manager's
  behaviour and it is what was asked for.
  **What was learnt building them is not lost and is not to be re-derived**: the
  status-5 branches and their two spellings, the prison list's shape, the
  mission window being a frame, the refusal alert, the crew column. All of it is
  still written down above, in the reading half of the module it belongs to.
  **Do not put either back without being asked**, and if asked, say what is
  above first.
- **RecruitRoom is the one exception, and it was asked for.** Opening a tab per
  station was worse than the clicking it replaced, so it recruits at every ticked
  station itself. Credits spent on people do not come back, so what stands in for
  the backup is a preview naming every station and saying plainly that it cannot
  be undone, and a confirmation that has to be given before anything is sent.
  An exception is a thing somebody decided, not a precedent.
- Never post a hand-built form to the game. Fetch the object's own edit page,
  build `FormData` from the real form, replace one field. That is what keeps the
  CSRF token and every unrelated setting intact.

---

## 6 · Checks

```
npm test                          45 tests: algorithm, i18n, pattern rules, import
npm run build:ymca                rebuild userscripts/ymca.user.js
node userscripts/ymca.test.mjs    drives the built userscript (Playwright + a server on :8777)
npm run build                     rebuild web/planner-offline.html
python3 -m http.server 8777       what the browser tests expect
```

Run `npm test` and the ymca test before saying anything works. The browser test
has caught real bugs twice: an empty `form.action` from `DOMParser`, and a
missing comma in the language file that every algorithm test happily ignored.

---

## 7 · The static planner

`web/index.html` is the same planner outside the game, for working on the data
without being logged in. It loads `data/*.json` at runtime;
`python3 tools/build_offline.py` bundles a single file for opening without a
server. It shares `src/planner.js` with YMCA, so a change there must be checked
against both.

---

## 8 · Where the data comes from

`data/missions.json` is built from the game's own `/einsaetze.json` by
`tools/build_from_game.mjs` — not from a printed PDF any more. Refresh it with
Diagnostics → Download everything, then run that script. `docs/VERIFICATION.md`
lists what is confirmed, what is still open, and how each answer was reached.

`data/vehicle-types.json` is the vehicle type ids, their names and the
capability flags the game puts on their checkboxes. It is what the tools fall
back on before they have seen a type themselves.

`data/vehicle-flags.json` is the other half: **every capability the game has a
word for**, read off its own dispatch-order form, with the branch each one sits
in. A type's flags are measured per vehicle; this is the list of what a flag can
ever be.

### Naming a vehicle type

**The game sells every vehicle it has, and the buy page lists them.** A
building's own page links to `…/vehicles/new`. That page is **not a form**: the
first attempt looked for a `<select>` and came back with nothing on every kind of
building. It is one `.vehicle_type` card per vehicle, the name in the card's
`<h3>`, the long name in its `<b>`, and the id in the buy link —
`/buildings/<b>/vehicle/<b>/13/credits` is the Quint.

Every tab of that page — firetrucks, ambulances, trailers, containers — is in
the markup already, hidden rather than fetched, so one request carries all of
them. Vehicles the account cannot afford or has not unlocked are listed too,
with their buttons disabled, and that is exactly what makes it a catalogue
rather than an inventory. One page per *kind* of building covers the lot — a
fire station and an ambulance station sell different vehicles, two fire stations
sell the same ones.

**The buy page names a type; it does not say what the type covers.** So an entry
in `data/vehicle-types.json` may carry a name and no `capabilities`, and that is
not the same as covering nothing: MissionMagician leaves a vehicle of such a
type alone rather than judging it.

**A vehicle's own page is the same vehicle without the mission.**
`/vehicles/<id>` is asked directly by **Diagnostics → What they can do**: one
vehicle per type owned, and every attribute the game set to `1` on an element
carrying `vehicle_type_id` is a flag. That is what fills a fleet in one press
instead of waiting for each type to happen to be in range of an open mission.
Where a page carries no such element the type is reported as unanswered, with
the ids and classes that page *did* have, so the next read knows where to look.

**The repo ships what it has measured, not only what it has named.** Three
fields, and each answers a different question:

| | |
|---|---|
| `capabilities` | the plain attributes off a selection checkbox — what the vehicle covers |
| `tank` | `{water, foam, bonus}` off `wasser_amount`, `foam_amount_display` and `water_modifier_raw` — what it carries and by how much it lifts the total. A zero is an answer; an absent `tank` is not |
| `crewSeen` | how many it actually seats, off the at-mission table's Crew column |

`crewSeen` is **not** `crew`, which is the buy page's `Max. Crew` — a cap
somebody set, kept because the game states it and never used as a measurement.

**A figure with no repo fallback is a figure every install starts blind on.**
Capabilities were shipped and tanks were not, so four rounds of reports came
back and a fresh browser still knew nothing about water or people until it had
watched enough missions to learn each type again. `mmKnownTanks` and
`mmKnownCrew` read the shipped table first and lay the player's own game over
the top; the writers keep to their own store, so a repo figure is never frozen
into somebody's browser where a later read could not correct it.

**Missing capabilities do not stop a vehicle being sent.** In a mission window
the flags come off each checkbox, so picking and ticking works for every vehicle
in the game whatever the dataset holds. The dataset answers a narrower
question — what a vehicle *already at the mission* covers, where there is no
checkbox to read — and that is what the "There" column and Cancel Unused need.

**An empty flag set is unknown, not nothing.** It used to mean the vehicle
carried none of the handful of flags a requirement named, which is how a HazMat
came back with no capabilities at all; the whole set is read now, so an empty one
means the checkbox was read before the game had written to it. Either way,
stored as "covers nothing" it would let Cancel Unused send a HazMat home from a
HazMat call. Unknown is the safe reading, and leaving the vehicle alone is what
unknown already does.

**A dispatch center, a fire academy and a prison have no buy page.** That is the
building, not a breakage, so they are reported separately from a page that
failed to load — otherwise a real failure on a station that *does* sell vehicles
hides among three that never could.

Three kinds of building sell vehicles: the fire station (75 types, every branch
from airport to containers), the police station (29) and the ambulance station
(16, all but its two mass-casualty trailers also sold by fire stations).

That is **Diagnostics → Vehicle types**, and it is the answer to "what is type
99". Learning names from mission windows still happens — the row carries
`vehicle_type` next to the checkbox's `vehicle_type_id`, and it is the only
place the two meet — but it is a fallback, not the method: it needs somebody to
keep playing until a type happens to be in range, and a type added by a game
update would stay nameless until it was.

Names land in `ymca-vehicle-types`, which every module reads, so a name learnt
once is a name the Renamer has too.

### Every report is a dataset update

**When a report comes back carrying something the repo does not have, put it in
the repo.** A tool that only knows what the player's own browser has learnt
starts from nothing on every new machine, and an answer that arrives once and is
not written down has to be asked for again.

- A **vehicle type id** that is not in `data/vehicle-types.json` — from
  `capabilitiesByType` in either report, or from the player's `/api/vehicles` —
  goes in with its name and its flags. **A count is not an answer**: the
  mission panel's own report used to carry `vehicleTypesLearnt: 11` and nothing
  else, so three rounds of it could be handed over and add nothing. It carries
  `capabilitiesByType`, `typeNames` and `notInDataset` now, because that is the
  button in the mission window and therefore the one that gets pressed.
  **It carries the plan too, not only its aftermath.** Three rounds of "why did
  it send nine engines" came back showing every line already covered and
  `ticked: 0` — which is what a plan looks like once it has been acted on, and
  answers nothing. `picked` says how many vehicles, of which types, the water
  and foam they carry between them, and which requirement each one is there
  for. A report that cannot answer the question it was pressed for is a round
  trip spent for nothing.
- A **tank or a crew figure** in `tanksByType` / `crewByType` goes into the same
  entry as `tank` and `crewSeen`. Both rode in no export at all until 0.0.50 —
  they are measured off the game, and a measurement that arrives once and is not
  written down has to be asked for again.
- A **requirement key** in `missionmagician.unmatchedRequirements` gets an entry
  in `MM_REQUIREMENTS`, or stays listed as unmatched on purpose with a reason.
- **Mission types** the catalogue does not carry mean `data/missions.json` is
  behind; rebuild it from a fresh export.
- **Endpoints** that started or stopped answering change the `ENDPOINTS` list in
  Diagnostics.

**A type nothing could read is in no report to be missing from.** Every store the
gap is worked out of — `ymca-vehicle-types`, `ymca-missionmagician-types`, the
tanks, the seats — is written by something that has already read a vehicle. So a
type that has never been read is in none of them, and the difference against the
repo could only ever be a difference between two things that had been read. The
Type 1 fire engine is `vehicle_type` **0**, the player owns exactly one, and it
went through a dozen rounds of exports without appearing in a single one: the
falsy-`typeId` bug threw it away on the mission-window side, and on the report
side there was nothing to notice, because nothing was there. Every
`capabilitiesByType` sent in that time starts at `"1"`.

**Owned and unread is a third state and it says so on its own.** The gap now
reads the cached `/api/vehicles` as well, so a type this game owns that neither
the repo nor this install has flags for is named — by name, with how many of
them — the moment Diagnostics opens, as `ownedUnknown` and in a sentence of its
own. It is deliberately **not** joined to the "this game has taught YMCA…"
sentence: what was learnt is worth sending, what could not be read is worth
pressing **What they can do** about, and one reads as the other if they share a
full stop. **Nothing about it is filled in from a sibling type**: a Type 1 is not
a Type 2 with a bigger tank as far as this repo is concerned, and the entry stays
empty until the game states it.

Each of those carries a `source`, and none of them is inferred from a name.
A type seen only in the player's localStorage is not in the dataset yet — it is
in the dataset when it is in `data/`.
