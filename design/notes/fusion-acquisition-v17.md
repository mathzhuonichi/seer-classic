# Fusion acquisition and prerequisite habitats

The acquisition graph now recognizes executable fusion recipes and their subsequent level evolutions. This delivery supports **22 of 34 recipes and 21 of the 33 retained fusion infant outputs** through normal acquisition. The other twelve outputs remain blocked by missing parent routes. Retaining a recipe in the fusion registry is not equivalent to making its parents obtainable.

The three starter fusions, the shiny Nier/Karu pair, and an Elro Seed/Hige pair have complete parent acquisition routes. Karu and Hige use the user's explicit 5% outcome preference. Parents are retained. Fusion requires no materials or waiting; the resulting named spirit bead is hatched immediately through inventory. The controller and fusion panel are documented and verified by the integration task; this note audits the graph and newly added prerequisite habitats.

## Executable graph

`AcquisitionRoute.kind` includes `fusion`, and `fusionRecipeId` identifies the actual recipe. Every downstream level evolution preserves that ID. The encyclopedia uses the existing species art and attribute icons and displays **前往融合** for both the infant output and its evolved forms. App navigation must prioritize `fusionRecipeId` over a retained evolution chain.

Fusion and level evolution share a fixed point. A recipe grants a route only when at least one permitted primary form and one permitted secondary form already have implemented routes. An inferred catch rate, reverse ancestry, missing event parent, or unsupported acquisition cycle cannot grant a fusion output. Recipe/output routes are deduplicated independently of the number of parent route combinations. Displayed outcome percentages are rounded to two decimal places; the underlying weights remain unchanged.

## Source-supported prerequisite batch

Thirteen existing capturable seed species receive visible capsule encounters. Catalog and bundle metadata required no changes. Historical gear, disguise, puzzles, membership gates, event dates, escape timers and random spawn delays are intentionally omitted under the user's simplified acquisition direction. The maps retain their source identities; direct visibility and always-open access are remake choices. Wild level ranges are separate from the bosses' own encounter definitions.

| Seed | Implemented scene | Location evidence |
| --- | --- | --- |
| 77 尼尔 | `ocean/deep` | The [original rare-species guide](https://m.news.4399.com/seer/jingyanxinde/201002-10-64234.html) identifies all three Ocean layers as possible locations. One visible seed is placed in the existing second layer. |
| 164 闪光皮皮 | `klose/plain` | The [original species guide](https://news.4399.com/seer/jinglingdaquan/feixingxi/200912-05-54529.html) identifies Klose grassland and direct capture. |
| 133 巴多 | `volcano/cave` | The [original rare-species guide](https://m.news.4399.com/seer/jingyanxinde/201002-10-64234.html) identifies Volcano's second layer. |
| 136 卢比 | `byron/deck` | The same [rare-species guide](https://m.news.4399.com/seer/jingyanxinde/201002-10-64234.html) identifies Byron's green deck. |
| 178 达比拉 | `snow/cave` | The [December 2009 capture guide](https://news.4399.com/seer/saiergonglue/200912-11-55845.html) identifies Snow cave and its original stone puzzle. |
| 188 加格 | `alpha/surface` | The [December 2009 capture guide](https://news.4399.com/seer/jingyanxinde/200912-25-59514.html) identifies Alpha's rocky area beside Naduolei. |
| 198 小鳍鱼 | `ocean/seabed` | The [January 2010 capture guide](https://news.4399.com/seer/jingyanxinde/201001-08-62373.html) identifies Ocean's third layer. |
| 203 晶岩兽 | `lucio/marsh` | The [original rare-species guide](https://news.4399.com/seer/xyjl/201009-11-77233.html) identifies Lucio marsh and its original membership/bubble setup. |
| 205 阿兹 | `lucio/surface` | The [original training table](https://news.4399.com/seer/lianjishuzhi/) identifies Lucio's first layer. |
| 208 火晶兽 | `lucio/marsh` | The [January 2010 capture guide](https://news.4399.com/seer/jingyanxinde/201001-23-63795.html) identifies Lucio marsh. |
| 228 查斯 | `planet-57/cliff` | The [original training table](https://news.4399.com/seer/lianjishuzhi/) identifies Nigu'er's second layer; official MapConfig identifies that region as map 58, Nigu'er cliff. |
| 249 浮空苗 | `cloud/summit` | The [species capture guide](https://news.4399.com/seer/tujian/65320.htm) identifies Cloud's third layer. |
| 480 埃尔特 | `tuck/landing` | The [original capture guide](https://news.4399.com/seer/zenmezhua/201105-13-96595.html) explicitly allows direct capture in the first scene of each Kalan planet during its September event. Tuck's existing first scene is used. |

The Elter guide has an inconsistent title/date presentation. Its actual species names, illustrated capture instructions and explicit Kalan first-scene distribution support the placement; its header alone is not used as a release-date certificate. Restoring that event's visible seed makes existing 伊特 → 伊洛花 plus 埃尔特 available for `fusion-571`, including Hige. This is not a claim that the historical event remains live today.

The singular population policy additionally covers 77, 133, 136, 164, 203 and 480. It preserves one visible instance of those rare seeds instead of filling the scene with duplicates. Ordinary parents continue using the existing six-instance policy.

## Nigu'er cliff artwork and doors

Map 58 is a necessary source-supported second scene, rather than placing Chas on Nigu'er's unrelated landing. Its official [H5 background](https://seerh5.61.com/resource/assets/map/58/map_58_bg_mc.jpg) was downloaded unchanged to `public/maps/original/58.jpg` and registered in both artwork manifests. Dimensions are 962 × 565; SHA-256 is `5666e34bc1898d7b6e6b2ddd4b8d0cacd433c216664bc5a188aaf7e4f7596889`. The image was visually inspected. As with existing scenery, this retained official resource is not certified as an exact 2009 revision.

The preserved official MapConfig snapshot, `.cache/atlas-source/original-maps-155.xml`, supplies map 57 `door_1`/`hit_1` → 58 and map 58 `door_0`/`hit_0` → 57. The existing SWF placement parser recovered the corresponding first-frame hit coordinates from the official map SWFs. Both H5 skin files place their background images at `(0, 0)`, so no composite-bound offset is applied.

| Direction | Hit coordinate | Image projection | Arrow |
| --- | --- | --- | --- |
| 57 → 58 | `(298, 170)` | `(30.85%, 30.25%)` | Up |
| 58 → 57 | `(344.65, 442.6)` | `(35.83%, 78.34%)` | Down |

These bindings are in `src/presentation/scene-exits.ts`. MapConfig contains no explicit arrival entries for either scene; arrivals use the existing reciprocal-marker inset. Source SWF hashes and placement matrices remain in ignored `artifacts/fusion-v17/cliff-door-source.json`.

## Remaining twelve blocked outputs

Each row names a missing required parent family or form. Existing parent routes on the other side are preserved; none of these rows is an implemented acquisition promise.

| Fusion infant output | Missing primary prerequisite | Missing secondary prerequisite |
| --- | --- | --- |
| 578 萨酷 | Available 埃洛兽 | 沃特 / 史沃勒 |
| 623 沃拉普 | 史沃勒 | 德普 / 贪食龙 |
| 625 卡龙 | 贪食龙 | 嘟拉 / 嘟嘟卡拉 |
| 629 依尔 | 波尼斯 | Available 依依 family |
| 632 杰丹 | 撒格利加 | 鲁格洛 family |
| 849 雪灵 | 康克特 | 凯奴 family |
| 932 马尔洛 | 洛尼尔 | 马修 / 马切洛 |
| 946 果然多多 | 果然苹果多 | 草莓多多 family |
| 1070 布迪 | Available 狂野黑鸟 | 伊尔 / 鹰嘴蝶 |
| 1072 莫德 | 希克拉 | 黑格 / 黑布罗 |
| 1267 瑞姆 | 瑞多 | 小岩怪 / 怪怪岩 |
| 1487 霍迪斯 | 霍吉斯 | 卡普 family |

Other recipes that can also yield Hige remain blocked, but Hige itself is obtainable through `fusion-571`. The complete registry keeps all 33 infant outputs. Several later parents require additional event research or absent subregions; completing them is a separate, larger acquisition batch. The discontinued Lili/Green routes and the unmodeled Jellyduck plaza are not silently substituted into unrelated maps.

## Verification and limits

The focused runner at ignored `artifacts/fusion-v17/verify-acquisition.mjs` executed the real controller's wild entry and guaranteed capsule transaction for all thirteen new seeds. It then prepared level-100 fixtures, executed **22 real forward evolution actions**, checked collection registration, and reloaded every resulting line. Guaranteed capsules and fixture levels isolate acquisition/evolution wiring from ordinary capsule probabilities and experience grinding.

Graph checks passed for every recipe's actual parent availability, exactly one direct route per supported recipe/output, formatted probabilities and retained fusion IDs through evolution. An adversarial miniature catalog passed reverse recipe order, fusion → evolution → fusion, missing-parent rejection and unsupported-cycle rejection. Both cliff directions were checked for existing targets and finite arrivals, and the registered local image hash matches the source manifest. TypeScript (`npx tsc --noEmit`) and whitespace (`git diff --check`) passed.

The graph snapshot reports **367 obtainable species; 110 complete, 62 partial and 460 missing collectible families**. Fusion contributes 53 previously unavailable species beyond the expanded non-fusion graph. This is implementation route coverage, not a full historical acquisition reconstruction or an original-difficulty campaign playthrough. The ignored `artifacts/fusion-v17/acquisition-report.json` preserves exact supported recipes, blocked IDs, captured habitats and evolution chains. Browser fusion/bead checks belong to the root integration report. No production build or native package was made.
