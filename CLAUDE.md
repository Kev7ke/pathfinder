# Working on this repo

## Talking to the player

Whenever you tell the player a userscript has a new version, or that they should
update or reinstall it, **include the install link in the same message**. Never
say "update it" and leave them to find the link.

    https://raw.githubusercontent.com/Kev7ke/pathfinder/claude/keen-hawking-g3z0ph/userscripts/vehicle-renamer.user.js

If the branch ever changes, update that link here and in the script's
`@downloadURL` / `@updateURL` headers, which currently point at the same branch.

Say plainly when a reinstall is needed rather than an update: Tampermonkey does
not grant new `@grant` or `@connect` permissions on an in-place update.

## Ground rules that do not change

- MissionChief (missionchief.com), **not** Leitstellenspiel.de. See
  `docs/CORRECTIONS.md` for what happens when that line blurs.
- Every price and rule carries a `source`. The player's own build menu and their
  reports are truth; everything else stays marked. Never quietly upgrade a guess
  into a fact.
- Where a question can be answered from `data/missions.json`, compute it rather
  than searching.
- Ask before changing the ladder's behaviour — `docs/ALGORITHM.md` explains why
  it is the way it is.

## Checks

    npm test                                  # 30 tests, algorithm and i18n
    node userscripts/vehicle-renamer.test.mjs # needs Playwright and a server on :8777
    python3 tools/build_offline.py            # rebuild web/planner-offline.html
