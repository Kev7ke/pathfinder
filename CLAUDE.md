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
    mod-eagleeye.js
    mod-shuteye.js
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
(`#leave_without_transport_no_compensation`). Each destination carries
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

**The range filter is sort plus a limit.** "Sort by distance" and "show the
first 10" is a range, and it works for price or free beds without a second
control. `hospital_max_distance`, `hospital_max_price` and `hospital_own` sit on
the vehicle in `/api/vehicles`, which is where the game keeps its own version of
that setting.

**A dot before exactly three digits is a thousand; anything else is a decimal
point.** `2.79` is a distance and `1.450` is a thousand and a half, and both
turn up in the same list. Decided per value, which is safe because a column
holds one kind of thing.

**`#own-hospitals` and `#alliance-hospitals` are in the page, but whether they
are the container or the heading above it was never captured.** Both shapes are
handled — the element itself if it holds destinations, otherwise the next thing
after it that does — and where neither works the control is not offered at all
rather than offered and doing nothing.

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
happened. Readings that are ranked have to be separate queries.

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

**A mission panel is `#mission_panel_<id>`.** Inside its `.panel-body` the
artwork sits in `.col-xs-1` and everything else in `.col-xs-11`, one `<div>`
each: `mission_overview_countdown_<id>`, `mission_bar_outer_<id>` (the progress
bar), `mission_missing_<id>`, `mission_missing_short_<id>`,
`mission_pump_progress_<id>`, `mission_patients_<id>` and
`mission_prisoners_<id>`.

**A met row greens itself.** Painting the whole table one colour says "something
is missing" without saying what; a row that goes green when its own line is
covered leaves only the missing ones red.

**There is no page that states what an unowned type covers.** The flags are
written per vehicle *instance*, onto that vehicle's checkbox and its own page.
The buy page lists all 106 types with crew, patient transport and required
education — no capabilities. The mission window's script carries only the
selection tabs (`feuerwehr_lf`, `rettungsdienst`, `polizei`, `wasserrettung`,
`fbi`, `brush`, `tow_trucks`, `mountain_rescue`, `occupied`), not a type map. So
the dataset grows from what players actually have, and the open question —
whether an at-mission row carries the flags itself, which would end the need for
it — rides in MissionMagician's report as `tablesNotSeenYet`.

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

**Water is filled by the tank, not by the clock.** Adding vehicles in arrival
order sends whatever is close, and what is close is engines: asked for 20,000
gallons the panel picked eleven when four were wanted, because each moved the
bar a little. A Quint carries a few hundred gallons, a Water Tanker several
thousand. Biggest tank first, ties broken by travel time.

**The flag vocabulary is everything the game has ever flagged**, not only what
is in the table now. A HazMat out of range today still taught `hazmat` the day
it was in a selection list, and `hazmat_vehicles` is no less real a requirement
for the vehicle being busy.

**D ticks.** The button carries the key so it can be found, and the handler
stands aside for anything being typed into and for any modifier chord.

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
- A **requirement key** in `missionmagician.unmatchedRequirements` gets an entry
  in `MM_REQUIREMENTS`, or stays listed as unmatched on purpose with a reason.
- **Mission types** the catalogue does not carry mean `data/missions.json` is
  behind; rebuild it from a fresh export.
- **Endpoints** that started or stopped answering change the `ENDPOINTS` list in
  Diagnostics.

Each of those carries a `source`, and none of them is inferred from a name.
A type seen only in the player's localStorage is not in the dataset yet — it is
in the dataset when it is in `data/`.
