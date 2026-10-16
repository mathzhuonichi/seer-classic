# Brave Tower floor flow, V54

V54 replaces the equipment-console interpretation with a walkable floor. The
existing tower map (500) shows one central guardian for the current numbered
floor. Its floor number and opponent change when a successful battle advances
saved continuation. Multi-opponent floors display the opening guardian in the
room and list the complete ordered team in its interaction dialogue.

Clicking the guardian walks to it and opens the floor challenge. Winning returns
to the next floor's scene; losing, retreating, or cancelling battle loading
returns to the current floor. After floor 70 the room displays completion, with
no floor 71 or additional battle until a new starting point is selected. The
central standing position is adapted to the platform; it is not a recovered
Flash spawn coordinate.

The separate Choose Starting Point window retains the seven ten-floor entry
points and exact continuation from V53. Its buttons enter a floor without
starting combat. The `enterTower` controller action validates the same floor
permission as `startTower`, updates continuation, and does not consume battle
attempts, saved RNG, HP, or PP. Battles begin through the room's guardian.
The bottom menu remains available for team preparation and recovery.

## Rewards

Numbered tower encounters use only their explicit source reward records.
Ordinary floors no longer invent an essence of their opponent. Acquisition and
recruitment indexes apply the same exclusion so the collection UI cannot
advertise nonexistent tower essence routes. Unnumbered mystery encounters and
other bosses retain their existing reward policy.

The floor's dialogue displays its rewards. The entrance window also lists the
first-clear milestones: the floor-30 Flash Suit, floor-60 Ken essence, and
floor-70 Daidaiyong essence. Ken is species 141 and evolves at level 30 to
species 142 (Kenzate). The
[official Ken entry](https://seer.61.com/main/spirit/137.html) and
[Kenzate entry](https://seer.61.com/main/spirit/138.html) establish that identity.
The existing catalog encodes the original creature rewards as essences for
hatching; V54 retains that project policy.

Unique milestone items are awarded on the first clear, subject to the existing
six-copy collection limit. An already full collection does not receive another
essence. Source `item_seer_beans` rewards now increase the actual coin balance;
numbered tower wins do not also grant the generic 500-coin boss bonus. Other
repeatable explicit items retain their source quantities. Achievements and the
Brave title are displayed from their exact cleared-floor records. A sparse old
save does not fabricate earlier achievements.

The once-only item policy is the remake contract; the floor-30 suit's catalog
note already documents that first-clear-only behavior was assumed. The retained
60/70 creature rewards have contemporaneous guide evidence, while their exact
historical repeat-claim rules have not been confirmed from an official source.

The floor-room changes follow the user's requested classic flow. The original
resource and historical rule boundaries are recorded separately in
[the floor source note](tower-floor-source-v54.md). Ten-floor starts and
continuation continue the explicitly requested V53 progression contract.

## Validation

- The helper passes 9 tests. The V54 controller regression passes 13 cases with
  43 actual battle settlements; the previous 12-case progression regression also
  passes. Coverage includes entering without battle or resource changes,
  ordinary-floor coins without ghost essences, first-clear/repeat milestones,
  Ken hatching and level-30 evolution, floor-70 completion, the six-copy cap,
  acquisition routes, and unchanged ordinary SPT settlement.
- Station navigation passes 9 groups, including 72 rendered tower states: the
  70 numbered floors, completion, and a legacy snapshot. The complete collection
  route regression retains access to all 632 initial forms.
- The isolated production Game preview was exercised through the SPT tower
  entry, a floor-1 victory with original opponent data, automatic arrival at
  floor 2 with its different guardian, floor-2 loading cancellation, and
  re-entering floor 1 through the starting-point window without combat.
- A memory-only floor-60 fixture displays one central guardian, its complete
  three-opponent team, and the Ken reward. At 640 by 480 all dialogue controls
  fit above the original eight-button menu. The starting-point window scrolls
  to all rewards without horizontal overflow. It also fits normally at
  1280 by 720. Browser warnings/errors are empty.
- TypeScript, CSS parsing, and whitespace checks pass. Screenshots are retained
  under ignored `artifacts/tower-v54/screenshots/`; controller evidence is under
  `artifacts/brave-tower-v54/`. All UI and controller saves are isolated in memory.
  No player save, production build, app package, or remote repository was changed.
