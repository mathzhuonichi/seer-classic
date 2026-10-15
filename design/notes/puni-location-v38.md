# Puni arena placement and campaign entry, v38

The reported scene placed Puni beside the lower-right pillar and named the
interaction after its final body. The existing campaign already required the
seven seals in order. The defect was the map placement and the way the world
selected a particular boss, rather than the campaign's unlock rules.

## Source and placement

The official [map 10032 SWF](https://seer.61.com/resource/map/10032.swf) was
downloaded again on 2026-10-15 UTC. Its SHA-256 is
`657a73d6b79d5c03bce08f05bc92319854e080a2e87e5a4d06a80aae014f8920`,
exactly matching the shipped original-map manifest. The retained SVG has
SHA-256 `f5796507d290a74e84fcc8e837c24494f6a17d386ad1fb9b6fe8c8d94270e6f0`.
The SWF stage is 960 by 560 pixels. Static parsing of its placement tags found:

| Original instance | Placement | Interpretation |
| --- | --- | --- |
| `top_mc.puli_mc` | `(439.95, 160.45)` | Puni animation registration point |
| `control_mc.cachetMc_0` through `cachetMc_6` | Seven distinct placements around the platform | The shared arena contains the seven seal components |
| `control_mc.door_0` | `(806.95, 480)` | Lower-right door registration point |

The first frame of `puli_mc` is empty. Its registration point cannot be treated
as the foot of a rendered Puni image. The remake therefore preserves the
source horizontal coordinate, `439.95 / 960 = 45.828125%`, and places its own
bottom-anchored contact at `55%` of scene height, on the central white platform.
The vertical anchor is an explicit fit for the current renderer, not a recovered
official foot coordinate. The arrival point `(74%, 78%)` is likewise authored.
This replaces the generic floor-derived boss anchor `(57.1%, 73.6%)` that put
the contact over the pillar. The shipped background itself is unchanged.

The source SWF, placement extraction, empty-frame result, and rendered
background inspection are retained in the task analysis directory under
`puni-location-v38/`. This was a structural and visual inspection; no Flash
ActionScript was executed. A matching current official asset establishes the
map identity, not its complete server behavior or exact historical release date.

## One arena and one contact

The `mystery` world region now names campaign `puni` and explicitly contains all
seven seal boss IDs plus the final body. Every stage therefore resolves to map
10032, including travel requests and the campaign's battle background lookup.
Previously only the body was explicitly located there; seal records fell back
to the Brave Tower category destination, map 500.

The world displays one neutral Puni contact and the player's next campaign
stage. Interacting with it opens campaign progress; it does not dispatch a
specific boss battle. Boss travel and species focus select this same contact.
On a fresh save, the campaign selects seal one. Existing progress determines
the next seal or body, and a completed campaign remains replayable. The world
does not rewrite progress, reset the player's campaign, or expose a new
direct-body action.

## Physical route

The retained [location source audit](challenge-location-expansion-sources.md)
records the route from station 102 through left wing 108 and Brave Tower 500 to
Mystery 10032. This change explicitly connects the represented Brave Tower and
Mystery regions before the generic connectivity fallback runs. Mystery returns
to Brave Tower; the accidental sequential Dark Arena-to-Mystery connection is
removed. The three authored battle rooms retain their existing hub connections.

The gate controls remain labeled `authored` in scene metadata because complete
original clickable bounds and arrival behavior were not recovered. The Mystery
return marker follows the visible lower-right door registration point, while
the Tower-side gate is an authored placement. This change does not claim to
reconstruct the absent left-wing corridor or the full original path mask.

## Verification

TypeScript checking and scoped whitespace checks passed after the contact,
placement, and route changes. The independent `puni-location-v38.mjs` runner
passed all 23 checks, including 18 explicit/legacy progress states. It covers common
stage location, one neutral map contact, fresh-save seal selection, prohibited
direct boss entry, and all completion counts from zero through eight for both
explicit and legacy campaign progress. It also checks progress gaps, explicit
reset persistence, and save reloads. Route assertions cover Tower/Mystery access,
the absent Dark Arena shortcut, and preserved battle-room returns.

The parent task checked the live map on an isolated browser origin and observed
Puni on the central white platform with a neutral name and seal one selected.
The progress panel kept stages two through eight locked on that fresh save.
Starting the encounter loaded seal one with 5,000 HP and the Mystery background,
and walking through the return gate reached Brave Tower. The subsequent Tower,
resource hub, and classic battle room route also worked through normal controls.
Screenshots are retained in the task analysis directory under `browser-v38/` as
`puni-central-platform.png`, `puni-seal-progression.png`, and
`puni-seal-battle.png`. These checks do not imply reconstruction of the original
seven seal animations.
