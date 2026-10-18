# Source-supported habitat completion

This change adds 29 source-identified subregions to 21 existing planets. It keeps all 158 previous generated locations and their encounter levels. A later source-policy audit deliberately changes five old direct-acquisition entries, plus three newly added entries, into collection-quest contacts; a location alone must not bypass a paid/VIP/lottery conversion. The resulting habitat file contains 201 species in 217 placements: 174 capture encounters, 35 field challenges, and eight collection-quest contacts. This is the generated habitat subset, not the entire collection catalog.

The 59 additional placements comprise 44 previously missing initial forms in the new subregions, three additional initial forms on existing planets, and 12 alternate source-supported locations for previously placed forms. The additional existing-planet forms are 760, 818, and 831; their locations come from `petbook.json`. They are collection-quest contacts, not new free capture or generic challenge routes. Their retained level ranges are presentation metadata derived for the remake. For actual source spawn routes, capsule versus essence acquisition follows the runtime catalog: a source `BossCatchable` entry alone does not override a non-capturable catalog form. Collection-quest contacts instead follow the explicit recruitment marker.

## Evidence and limits

The pinned snapshot is [Nattsu39/seer_data, commit a00bcdd](https://github.com/Nattsu39/seer_data/tree/a00bcdd/resource/config/xml). `map_config.json` establishes scene names and `super` parent identities; `maps.json` establishes monster IDs and levels in `Monsters` or `BossCatchable` records; `petbook.json` supplies broader named locations. Boss-only records sometimes use a creature name as `Map.Name`, so that field must not be used as a scene name. The build now uses the map configuration's name.

These configuration snapshots include maps from different periods. They establish source identities and encounters, not simultaneous availability in a particular historical release. Historical timers, equipment gates, puzzles, and retired events are not reconstructed. No unsupported new galaxy or planet identity was introduced.

SHA-256 values are recorded in `data/habitat-regions.json` and checked by the focused verification:

- `maps.json`: `a913f0085b9a3908749dcbe88b0d6f488825af6804039289d76a655e11faf7e3`
- `map_config.json`: `f10888991945008d7f38f328de40b9f014418680c5670752f5bb1cdbfd3f35f3`
- `petbook.json`: `a6fa0f49b192725298c6e447e37a10edcba3631864796715fca74983e2c7b2ba`

## Premium and event route audit

The final policy identifies 113 initial roots with a paid, VIP, or lottery offer. This does not establish historical exclusivity and must not erase independently supported wild, boss, or breeding routes. Its intersection with generated habitats is 27 species in 30 locations. Twenty-two locations have direct `Monsters` or non-VIP `BossCatchable` records on their actual map and keep their direct route. Eight have only `Foundin` for their current map and now use `route: "recruitment"` plus `WorldRegion.recruitmentSpecies`.

| Species ID | Current contact | Evidence limit |
| --- | --- | --- |
| 406 | `volcano/foot` | Foundin only; VIP task 533 does not authorize free field capture. |
| 430 | `tuck/landing` | Foundin only here; capture records exist separately on maps 63 and 687, not on this landing. |
| 560 | `planet-439/landing` | Foundin plus a lottery entry; no capturable source spawn on this map. |
| 576 | `planet-459/landing` | Foundin only here; map 674 has a separate capture record, but is not a modeled destination. |
| 760 | `volcano/foot` | Foundin plus paid/task offers; unmodeled non-capturable bosses and task essence rewards do not justify a free generic field challenge. |
| 789 | `kaku/surface` | Foundin plus the explicitly annual-member task 594. |
| 818 | `kaku/surface` | Foundin plus paid acquisition and the explicitly annual-member task 595. |
| 831 | `byron/deck` | Foundin plus paid acquisition; a broad catalog wild flag is not independent spawn evidence. |

The preserved direct generated routes belong to species 59, 100, 102, 240, 287, 378, 385, 422, 469, 494, 515, 555, 604, 618, 673, 690, 1026, 1271, and 1347. Species 469, 515, and 604 also retain their independent breeding mechanisms. The ordinary source entries for 469 on map 1303 are distinct from the same map's separate `VipOnly=1` boss encounter. The controller blocks direct battle requests at collection contacts, including requests lacking a location; the map opens the collection quest and the index excludes the false direct edge.

The habitat generator records the source-policy hash and applies this rule per generated location. It does not infer that every species ever sold for money must lose all independent acquisition paths. Historical non-VIP map entry fees, timers, and server-side availability remain outside the reconstructed source proof.

## Scene and navigation treatment

Each new region retains its original map ID and exact configured name, except that map 505 later took its maps.json name, 时空通道场景-暮色之城, because map_config.json also names Eddy's map 326 暮色之城. Where no corresponding recovered map background is present, `backgroundMapId` explicitly reuses the supported parent's recovered artwork. `sceneAttribution` states that the scenery and encounter positions are remake adaptations. The region's source identity must not be read as evidence that its reused backdrop is the original image for that region.

The atlas keeps all existing native diagrams and controls. Eight formerly single-region planets now receive composed region pages using their existing recovered planet icon, space background, and original GO artwork. The two Helka regions bind the labels already visible in its native diagram; the other supplemental leaves use authored navigation positions with explicit adaptation metadata. There are 37 added controls: 29 new regions and eight previous landing points that now need a region page. All 59 planets and all 159 landing leaves remain reachable from the overview.

Scenes with more than six visible creatures receive distinct anchors, instead of placing the seventh creature on the first creature's anchor. Existing compositions for six or fewer creatures are unchanged. The expanded placement plane remains the same fully interactive scene already used by the renderer.

## Source membership table

Species in this table are the original 44 targets for the subregion expansion. Additional alternate locations are generated directly from the same source spawn records.

| Source map | Source scene name | Existing planet | Configured parent map | Initial species IDs |
| --- | --- | --- | --- | --- |
| 13 | 克洛斯星地心 | `klose` | 10 | 348 |
| 34 | 精灵广场 | `helka` | 30 | 74 |
| 38 | 麦田村 | `allen` | 29 | 1144 |
| 47 | 双子贝塔星 | `beta` | 47 | 119 |
| 48 | 海盗要塞废墟 | `beta` | 47 | 184 |
| 64 | 沙漠窑洞 | `tuck` | 60 | 257 |
| 105 | 双子阿尔法星 | `alpha` | 105 | 89, 91 |
| 329 | 潘迪拉宝盒 | `eddy` | 325 | 287 |
| 330 | 斯科尔浮岛 | `planet-328` | 328 | 422 |
| 352 | 蜜桃森林 | `planet-350` | 350 | 219, 281, 370, 665 |
| 425 | 时空罗盘 | `planet-424` | 424 | 499 |
| 442 | 尼古尔海底 | `planet-57` | 57 | 814 |
| 461 | 赫鲁卡城 | `planet-459` | 459 | 588 |
| 476 | 阳光大地 | `planet-497` | 497 | 742, 980 |
| 478 | 黑色洞穴 | `white` | 484 | 416 |
| 505 | 暮色之城 | `eddy` | 325 | 720 |
| 665 | 五行仙境 | `planet-494` | 494 | 872 |
| 669 | 异能山谷 | `ability` | 668 | 884 |
| 675 | 机械王国 | `helka` | 30 | 59, 102 |
| 689 | 睡梦空间 | `white` | 484 | 1015 |
| 691 | 斯诺秘洞 | `snow` | 53 | 378, 1020, 1026 |
| 693 | 拉铂尔仙境 | `rabol` | 441 | 1048 |
| 694 | 新泽部落 | `twitter` | 688 | 1056 |
| 697 | 迷雾森林 | `twitter` | 688 | 799, 1024 |
| 707 | 异能空间 | `ability` | 668 | 905, 908, 911, 919, 926, 958 |
| 727 | 冰火绝命崖 | `lainna` | 726 | 751, 936 |
| 750 | 幽暗迷宫 | `demon` | 748 | 1273 |
| 1063 | 降世山巅 | `twitter` | 688 | 139 |
| 1303 | 黑白森林 | `alpha` | 105 | 1450 |

## Reproduction and checks

- `node tools/assets/build_habitats.mjs` regenerates additive habitat placements. Previously generated locations survive new alternative rewards and newly modeled scenes; broad `Foundin` entries keep their location and derived levels but are converted to collection contacts when the premium/event policy requires it.
- `node tools/assets/build_habitat_atlas.mjs` binds the new leaves without replacing existing native pages. Repeating both generation steps is byte-stable.
- `node tools/verification/habitat-regions.mjs` checks source hashes, all 29 region identities and parents, actual spawn records and levels, and every one of the 59 new placements through the real controller, together with the full converted-policy/generated-habitat intersection. The final run passed 78 placement transactions across 75 species: 67 actual captures, three field-challenge victories followed by essence hatching and reload, and eight gated collection claims followed by hatching and reload. Of the 59 new placements specifically, 54 are captures, two are field challenges, and three are collection contacts. All eight contact species reject direct requests both with and without their location, preserving the complete save and RNG; unmet quest claims are rejected as well. Niao rejects a capture without a qualifying active partner without consuming a capsule or RNG, then succeeds with species 77 active; the indexed prerequisite still lists all six accepted forms.
- The same verification checks distinct anchors in the five populated scenes with more than six visible creatures.
- `node tools/verification/graphical-atlas.mjs` passed with 51 reachable pages, 222 controls, 159 landing leaves, no missing destinations, and no introduced hotspot overlaps. Existing source-native geometry remains intact.

The generator's `unplaced` diagnostic counts candidates without a supported habitat. It is not an acquisition-status total: those species can have collection, evolution, fusion, breeding, or named-challenge routes supplied elsewhere.
