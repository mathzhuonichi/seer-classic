# Compact PetBag previews, revision 29

Date: 2026-10-04. Scope: improve preview size and information density while retaining the recovered original PetBag frame, its 647:471 aspect ratio, and the existing creature actions. This remains developer/debug work without a production build, package or commit.

## Changes

The panel can grow to 820 CSS pixels when the scene permits, with proportional fitting and six-pixel upper/lower margins. The normal game frame is aligned at the top of its host instead of leaving unused space above it. The previously bottom-anchored diagnostic fixture is archived; its old URL redirects to the normal developer game. Normal source previews at ports 1425 and 1440 retain their separate existing saves.

The central portrait uses 97-percent alpha-bound fill in a square stage, with no evolution-stage size reduction. Its header keeps the name, a small original attribute icon and level. A pink female symbol or blue male symbol appears directly below the level. Generation text and the corner party count are removed. The lower portrait retains only current/max HP; duplicate number and lead/slot rows are removed. The information well no longer repeats name and level, while retaining species number, nature, IV, trait, all six stats, experience and a read-only summary of equipped skills.

Skill editing has one left-side shortcut. The redundant overview edit button, clickable preview skill summaries and secondary ability/skill switch are removed. The four original primary tabs still expose information, ability/learning values, items and profile. Backend skill replacement and raising actions are unchanged.

Only the six bottom cards opt into `MonsterCard` presentation `petbag-party`. Their original visible silhouettes fill a square stage at 96 percent without the stage-size multiplier. Slot number and level occupy the upper corners; the lower row keeps a full short name and a 13-pixel original attribute icon, followed by an HP bar and actual numeric HP. Resetting an inherited nine-pixel name margin restores space to the preview. Generic warehouse and encyclopedia cards retain their default layout. The empty instruction/status line no longer reserves visible space; action feedback remains available to assistive technology and existing controller notices.

## Actual verification

TypeScript, changed stylesheet parsing and whitespace checks pass. Browser inspection of the normal saved game changes only the selected interface view; no grant or raising action is applied to that save. Isolated functional checks use a separate root-owned developer origin and explicit test controller.

- At a 1280-by-720 host, the game frame starts at y=0, and the panel is 820 by 596.94. The central stage is 216.41 square. The final party stages are 75.39 square after the inherited nine-pixel margin is removed; icons remain 13 square.
- At a 738-pixel host, the panel is 573.83 by 417.73. The corrected party stage is 39.55 square, the name row is 14 high, and the short four-character Bubu name fits its 53.07-pixel name area. All six current stats remain present.
- The female glyph is `♀` with computed color `rgb(255,144,204)`. Its top equals the level row's bottom, confirming placement below the level. Male `♂` is also observed in the normal saved game. The party count, generation sentence and duplicate skill controls are absent.
- The left skill shortcut opens four equip positions and one replacement confirmation. The original attribute-skill symbol remains visible. Primary ability and profile tabs remain available. The isolated warehouse opens with its search control and bounded page navigation. Existing battle and breeding rules, including stored generation validation, are not changed by removing display text.

Ignored screenshots and isolated fixtures are under `artifacts/ui-v29/`. These checks establish the current developer interface at the inspected sizes; they are not a pixel-fidelity certificate or a new full battle/acquisition audit.

## Frame correction follow-up, revision 30

The enlarged party silhouettes exposed a mismatch with the original slot bitmap's small inset window. Stretching the entire 190-by-212 bitmap left the dark interior too small, so tall portraits crossed its inner rim even though they remained inside the card. The correction expands the interior using a nine-slice source frame behind the unchanged card contents. Source slices are top 40, right 31, bottom 48 and left 35, measured at the solid dark window's boundaries. Destination edges are 5, 4, 3 and 4 CSS pixels. Filled and empty slots share this frame. The art container permits the existing breathing animation to extend into the surrounding interior instead of clipping it.

Creature fill, card dimensions, party layout and the central portrait are unchanged. The wide party stages remain 75.390625 square; narrow stages remain 39.546875 square. Browser geometry checks conservatively enclose every normalized silhouette at maximum breathing scale 1.01 and upward displacement one pixel. Minimum clearance from the interior boundary is 1.769 pixels wide and 1.403 pixels narrow. The frame encloses all six party previews at both inspected sizes. Moving a creature into storage on the isolated fixture confirms that the resulting empty frame remains anchored to its own slot. Normal saved-game checks only select interface views.

TypeScript and whitespace checks pass. Final screenshots and geometry evidence are ignored under `artifacts/ui-v30/`. This follow-up remains developer/debug work; no build, package or commit was made.
