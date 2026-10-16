# Station navigation and Brave Tower, V53

The station now uses four distinct scenes: Station Hall (102), Brave Tower
(500), Dark Arena (110), and Mystery Realm (10032). The three battle modes
share the hall's equipment terminal instead of occupying three copies of its
background. The ship retains Transport, Laboratory, and Captain's Room.
Seven old room IDs redirect to these retained destinations. Unlocated mission
encounters use Transport; the original challenge and acquisition routes remain
available.

The station graph connects Hall to Tower and Dark Arena, and Tower to Mystery
Realm. Equipment controls follow visible objects in the recovered backgrounds.
The positions and hit areas are remake adaptations, not recovered Flash
geometry. See [the atlas source note](station-atlas-v53.md) for the unchanged
official architecture and the four-destination atlas layout.

## Tower progression

The tower panel replaces the flat list of 70 numbered encounters. It shows the
highest cleared floor, seven ten-floor starting segments, the selected segment's
actual opponents, preparation controls, and a separate continuation action.
Starting points are 1, 11, 21, 31, 41, 51, and 61. Clearing 10, 20, and so on
unlocks the following segment. A saved continuation can resume an intermediate
floor such as 17 independently of the selected segment's starting floor 11.

`game.braveTower` stores `highestCleared` and `resumeFloor`. A successful start
saves the attempted floor; a win advances continuation to the next floor.
Failure, retreat, and loading cancellation preserve the attempted floor.
Clearing 70 records completion with no floor 71. Restarting from an unlocked
segment retains all previously unlocked segments. The controller enforces the
same rules for both `startTower` and legacy numbered `startBattle` actions.
Invalid or locked starts do not consume saved RNG state or change progression.

Older saves derive the highest floor from exact numbered tower clear IDs.
Sparse legacy clears retain their original clear list without fabricating wins
on earlier floors. Missing or invalid continuation falls back to the next floor,
or completion after 70. A valid lower continuation from a restarted climb is
preserved. Unnumbered mystery encounters and the Puni campaign remain separate.

Ten-floor starting segments and persistent continuation implement the user's
requested rules. This change does not claim to reproduce every historical
official tower rule. Enemy data, battle calculations, and existing rewards are
unchanged.

## Verification

- TypeScript and both changed CSS files pass parsing checks; `git diff --check`
  passes.
- The progression helper passes 8 tests. The independent controller regression
  passes 12 cases, including actual victories through 10, continuation at 17
  after defeat and retreat, multi-opponent floors 69 and 70, legacy saves with
  and without game extras, locked starts, and RNG/save atomicity.
- Station navigation passes 8 checks, covering aliases, unique scene assets,
  retained challenge routes, Dark Arena inhabitants, and Puni access.
- Existing facility validation passes 35 checks; challenge navigation covers
  180 bosses, 49 SPT entries, and 59 destinations. Puni validation passes 23
  checks over 18 progression states. Its image checks use map 10032's registered
  remastered URL, attribution, and file hash.
- The isolated production Game preview was exercised through the four atlas
  destinations, hall battle modes, walking exits, tower console, first-floor
  battle, retreat, loading cancellation, and Dark Arena terminal. A saved-floor
  fixture displayed continuation at 17 and an independent start at 11; actual
  entry into floor 17 and retreat returned to the same continuation panel.
- At 640 by 480 the panel scrolls to all preparation/start controls without
  horizontal overflow, and the eight original bottom menu controls remain
  available. At 1280 by 720 the complete tower panel fits without scrolling.
  At a 3840 by 2160 viewport, DOM bounds place all tower controls inside the
  viewport without overflow. The atlas's original vector architecture was
  separately inspected at fourfold resolution.

Test battles use isolated in-memory saves. The controller regression reduces
only its in-memory tower opponents' HP to exercise wins quickly; source encounter
data is unchanged. No player save was read or overwritten. Screenshots and
reports are under the ignored `artifacts/station-tower-v53/` and
`artifacts/brave-tower-v53/` directories. No production build, application
package, or remote push was performed.
