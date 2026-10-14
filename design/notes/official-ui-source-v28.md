# Official graphical atlas and PetBag sources, revision 28

## Source scope

The recovered assets come from official `https://seer.61.com/` SWFs. Cached `ClientConfig` and `StarMapController` source establish the map module, application-resource and `resource/map/starMap/{id}.swf` routes. Exact fetched URLs, byte counts and SHA-256 values are retained in `.cache/classic-ui-v28/source-index.json` and `planet-source-index.json`. Bulk source files remain ignored.

The current official `resource/appRes/update/worldMap/NewWorldMap2020Panel.swf` contains the five galaxy diagrams in sprite 2718, frames 1–5. The exported stage is 960 × 560 logical pixels, rendered at 2×. Fifty-five modeled planet placements retain their original artwork, label outlines, matrices and hit-area coordinates. Unmodeled placements and the ancestor selector strip are omitted. The overview is an explicitly authorized composition of genuine source selector illustrations, source space backdrop and base illustrations; its arrangement is not a recovered historical universe diagram.

The eight available native region diagrams are StarMap IDs 1, 30, 484, 702, 29, 717, 726 and 102. Native map sprite IDs are respectively 248, 71, 111, 66, 61, 51, 77 and 197. The other required StarMap requests returned HTTP 404: 10, 25, 20, 15, 40, 60, 325, 338, 404, 435, 437, 105, 54, 51, 314, 463, 57, 429, 441, 451, 662, 668, 683, 741, 748, 775, 786, 795 and 100. Each exact URL and response is recorded in the source index. The 29 derived region pages therefore compose genuine planet artwork and source GO controls on the genuine backdrop; their landing-control arrangements are adaptations, not original region geography. No individual planet artwork was recovered for small-phantom 741; its retained route uses an original neutral GO control.

## Native render replay

Use `.cache/vector-export/jre/jdk-17.0.20.1+1-jre/Contents/Home/bin/java` and `.cache/vector-export/ffdec/ffdec.jar` (FFDec 26.3.0). For an already corrected native XML:

```sh
.cache/vector-export/jre/jdk-17.0.20.1+1-jre/Contents/Home/bin/java -Xmx2g -Djava.awt.headless=true -jar .cache/vector-export/ffdec/ffdec.jar -xml2swf .cache/classic-ui-v28/native-planet-1-clean.xml .cache/classic-ui-v28/native-planet-1-clean.swf
.cache/vector-export/jre/jdk-17.0.20.1+1-jre/Contents/Home/bin/java -Xmx2g -Djava.awt.headless=true -jar .cache/vector-export/ffdec/ffdec.jar -select 1 -zoom 2 -format frame:png -export frame .cache/classic-ui-v28/native-planet-1-stage .cache/classic-ui-v28/native-planet-1-clean.swf
```

The resulting `native-planet-1-stage/1.png` is the staged image for `public/ui/classic/maps/planet-1-diagram.png`. No ActionScript is executed. Replace the map ID for the other native pages. Original unbounded sprite exports are reference images and must not replace the staged images.

## Title and navigation evidence

The following original `serverNameTxt` rectangles are source coordinates before subtracting the viewport origin. The source field uses regular white text at size 14. A live canonical heading in that field is a remake adaptation.

| StarMap ID | Field symbol | Left | Top | Right | Bottom |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | 31 | 299.2 | 6.6 | 403.2 | 24.6 |
| 30 | 64 | 279.9842041 | 6.9842041 | 383.1097077625 | 24.0895508 |
| 484 | 110 | 279.9842041 | 6.9842041 | 383.1097077625 | 25.7671905725 |
| 702 | 65 | 279.9842041 | 6.9842041 | 383.1097077625 | 25.7671905725 |
| 29 | 4 | 279.9842041 | 6.9842041 | 383.1097077625 | 25.7671905725 |
| 717 | 50 | 279.9842041 | 6.9842041 | 383.1097077625 | 25.7671905725 |
| 726 | 76 | 279.9842041 | 6.9842041 | 383.1097077625 | 25.7671905725 |
| 102 | 19 | 395.6342041 | 6.2342041 | 498.7597077625 | 25.0171905725 |

Ship viewport bounds are `[-33,-3,737,463]`; the standard five pages use `[0,0,661,390]`; station 102 uses `[-1,0,899,466]`. Page 30 requires the full chrome viewport `[0,0,661,390]`, rather than the faulty inferred interior crop `[22,15,637,381]`.

`maps/back-arrow.png` copies the UP state of original UI.swf button 5940, originally the toolbar `starMapBtn`. Reusing this blue curved arrow at a native region page's close hit area is a navigation adaptation. It does not establish that the native StarMap close glyph was an arrow. The five galaxy diagrams retain their original return artwork and source button 160 rectangle `(858.427,501.515,87.223,44.208)`.

## Ship correction boundary

The ship map's original placement `ad`, character 28, is its blue wireframe blueprint. The placement name must not be interpreted as an advertisement. Its source bounds are `[181.85,24.6,507.95,376.7]`; retain its original matrix.

The previously proposed alias from `scene_6`, character 68, to canonical transport was rejected after visual inspection: that placement depicts an unmodeled room, not the visible transport room. The original unnamed current-room graphic is button 146. The agreed canonical transport hit rectangle is `(38.6,212,171,78)`, based on the visible original transport illustration. This is a visual/current-room alias for the remake's map ID 1, not evidence of an original numeric `scene_1` callback. Root removed scene_6, bound transport to original button 146, separated the four staging-port controls and rebuilt the source render. The maintained native exporter now implements these corrections and accepts `--ids` for focused replay. Its map 30 viewport retains the complete chrome. The shared publisher preserves all adapted pages, the overview and the 741 route instead of replacing them with a stale subset.

## PetBag assets

Original UI.swf shape 735 provides the clean 647 × 471 logical PetBag frame, including the correct title, projector, navy portrait well and empty navigation hexagons. `public/ui/classic/petbag/frame.png` is a 2× render. Blank slot shape 45, blank tab shape 766, labeled tabs 770/773/776/779 and navigation symbols 759/745/743/748/752/763/765/740 are recorded in `public/ui/classic/petbag/manifest.json`. Source sprite 812 remains the full-panel reference. Live controls and portraits are composed over the original skin rather than duplicated baked controls.

## Integration and verification limits

Root completed the native corrections and final merge. Corrected artwork hashes and all 43 runtime page records are in `public/ui/classic/maps/manifest.json`. The independent traversal reports 43 pages, 59 destinations, 130 landing leaves, 51 referenced assets, 29 decorations, 8 source title rectangles, 168 audited adapted hotspot pairs, zero overlaps and zero missing leaves. Actual browser interactions are recorded separately in `graphical-management-integration-v28.md`; metadata checks alone are not final visual acceptance.

Revision 27 typography evidence remains in `ui-typography-source-v27.md`. The genuine local Office SimSun font is retained only in ignored cache for development; it is not a public redistributable asset. No build, package or commit was performed by this source-extraction task.
