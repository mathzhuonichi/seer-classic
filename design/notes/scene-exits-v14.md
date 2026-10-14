# Source-backed local scene exits

`src/presentation/scene-exits.ts` replaces array-index exit placement with a local route graph. `getSceneExits(planet, region)` returns a target region ID, normalized scene anchor, cardinal arrow direction, compact caption, full destination name, accessible label, target arrival position, and an explicit `official` or `authored` source classification. It adds no atlas, general transporter, or external navigation panel.

## Original source evidence

The route targets and arrival entries come from MapConfig, DefineBinaryData symbol 155 in the official [RobotCoreDLL](https://seer.61.com/dll/RobotCoreDLL.swf). The preserved extraction is `.cache/atlas-source/original-maps-155.xml`, SHA-256 `8e21341bb8189be99e9d0dc7cafd1c53bac184a2fffa955feca716ee6961567f`.

Doorway positions come from the first-frame hit components in the official `https://seer.61.com/resource/map/<id>.swf` maps. The extraction follows named placements through nested sprite matrices and converts Flash twips to stage pixels. The source-only extraction found all 77 candidate hit components across 65 maps; Byron has two doors to the same modeled destination, so the API retains 76 distinct directed routes. A small binary SWF reader independently matched JPEXS XML placement matrices for maps 10, 11, 12, 441, and 515. Downloads, extraction helpers, and replay output remain ignored under `.cache/map-assets/`.

| Source map | Target map | Original hit component | Original stage position | Cardinal placement |
| --- | --- | --- | --- | --- |
| 10, Klose grassland | 11, Klose swamp | `comp_1` | `(136, 426)` | Left |
| 11, Klose swamp | 10, Klose grassland | `comp_0` | `(891, 289.45)` | Right |
| 11, Klose swamp | 12, Klose forest | `comp_1` | `(162.55, 373.45)` | Left |
| 12, Klose forest | 11, Klose swamp | `comp_0` | `(774.9, 197.5)` | Upper right, represented by Right |
| 441, Rabol | 515, Rabol secret realm | `hit_0` | `(80, 340)` | Left |
| 515, Rabol secret realm | 441, Rabol | `hit_0` | `(836, 388)` | Right |

The grassland's visible `door_1` art starts at `(50, 408)`, while its associated hit is farther inside the path. Rabol's `door_0` art starts at `(24, 228)`, and its hit lies at `(80, 340)` in the left opening. The API uses the hit position rather than the upper-left registration of tall doorway artwork.

The priority SWF SHA-256 values are:

| Map | SHA-256 |
| --- | --- |
| 10 | `2634e14a08d2c5925a3491876c11ac544bd7bc65d6b785993e27815a74233e03` |
| 11 | `5db43182e9c07c10f83d731c908cb017cb93d660547590b139457f9136cf61e5` |
| 12 | `0205946dc6e45bcd0e6343445451cb3d51a8c3787ebd56a31954c44cbe52bd37` |
| 441 | `34663dec97ed44d4701c3888a72c172c81790ebf43a7354af685c43d3f0003fa` |
| 515 | `eae7540afc84f3714a511dfc59f84c80b208a4f6aaf33b862509b3ea661ae316` |

## Coordinate registration and source limits

Coordinates are projected onto each shipped background's natural dimensions from `public/maps/original-manifest.json`. The background image's own placement is authoritative. The H5 EXML files were inspected for the priority scenes and every recovered route scene with a nonzero composite background bound. In particular, map 12's `bg_mc.offy = -192` describes an overhanging child vine; its actual background Image in `Map12Skin_768302fd.exml` is at `(0, 0)`. Map 445 likewise contains a child with a negative bound while its background Image remains at `(0, 0)`. Those composite bounds must not shift the jpg exit coordinates. Byron's actual background Image is at `(1.95, 0)`, which the projection accounts for.

The four cardinal arrows use the nearest edge of the natural image frame; diagonal doorways therefore become a cardinal approximation. This recovers the doorway side and location, rather than claiming to reproduce the original animated arrow's exact orientation. Marker centers are clamped to horizontal 9–91% and vertical 10–89% margins for readable full destination labels. Original hit coordinates remain visible in the table above; the clamp can move a marker a few percent inward.

For source routes, arrival uses the destination's matching `FromMap` entry, then its original default entry. For example, grassland-to-swamp arrives at `(830, 240)`, swamp-to-grassland at `(76, 420)`, forest-to-swamp at `(165, 360)`, and secret-realm-to-Rabol at `(95, 365)`. The secret realm has no explicit `FromMap=441` entry; its original default `(840, 425)` is used. Authored arrivals use an inset from the reciprocal marker.

These are current recovered official resources. They do not establish a complete or exact 2009 map revision. Only routes between modeled regions are exposed; unmodeled target IDs remain outside this local scene API.

## Connectivity and authored routes

Original branches take precedence over region order. Examples include map 51 directly connecting to 53, and map 662 branching to both 664 and 666. The duplicate map-40 encounter region does not gain a second claimed historical identity; only the first region with an original ID participates in the recovered graph.

A missing reverse route receives an explicitly authored return. The API then adds only enough former sequential connections to join disconnected source-incomplete or custom regions. The current world receives 76 official and 64 authored directed exits: ten authored returns and 54 directed connections joining disconnected areas. The 106 regions on multi-region destinations remain connected. The 23 singleton destinations receive no invented local exit. Authored routes remain distinguishable through `SceneExit.source` and do not inherit a recovered-classical claim merely because their background is official artwork.

## Focused verification

A source-import audit covered all 129 modeled regions. It verified existing targets, reciprocal routes, connected multi-region destinations, unique local targets, finite in-frame anchors and arrivals, full names in accessible labels, all six priority cardinal placements, and two exact source arrival coordinates. The replay output is `.cache/map-assets/exit-api-audit.json`. TypeScript compilation passed. No production bundle, package, native application, or broad historical test suite was run. Browser integration and visual acceptance belong to the parent presentation task.
