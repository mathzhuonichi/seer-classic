# Encyclopedia acquisition review, version 21

Date: 2026-10-03. This review audits the current working source, including the existing uncommitted revision-19/20 changes. It makes no gameplay changes and does not certify campaign difficulty, historical acquisition fidelity, or a complete fresh-save playthrough.

## Result

**The current game does not provide normal acquisition for all retained collection species.** There are 367 species with implemented, dependency-supported routes and 1,112 eligible species without a route. The 34 fusion recipes are included; a registry entry alone does not count when either parent is unavailable. The earlier version-14 coverage paragraph describes an older snapshot.

| Species partition | Count |
| --- | ---: |
| Retained encyclopedia entries | 1,483 |
| Deliberately excluded NPC forms | 4 |
| Eligible collection denominator | 1,479 |
| Species with normal implemented routes | 367 |
| Missing eligible species | 1,112 |
| Direct acquisition species (overlapping route categories) | 193 |
| Species obtainable only through forward evolution | 174 |

The exclusions are exactly **122 达尔, 123 希路达, 124 英卡洛斯, and 125 萨格罗斯**. They constitute the complete Incaros-related family and the Saggros family, not only the two named final partners. They remain in the encyclopedia and explicit modifier.

| Family partition | Count |
| --- | ---: |
| Source-defined families | 634 |
| Excluded families | 2 |
| Eligible families | 632 |
| Complete eligible families | 110 |
| Partial eligible families | 62 |
| Entirely missing eligible families | 460 |
| Eligible families with at least one obtainable form | 172 |

Family grouping joins source `evolves_from` links and forward evolution relationships. These relationships classify forms; they do not grant an acquisition action. A family can contain an obtainable classic line and an unavailable later upgrade.

## Route evidence and gates

The direct route counts overlap: three starter species, 46 mapped capsule-capture species, three quest rewards, 119 non-campaign challenge reward species, six campaign reward species, and 21 distinct fusion infant outputs. There are 194 available species with a forward-evolution route, but only 174 whose routes are exclusively evolution.

| Route | Evidence checked | Remaining limit |
| --- | --- | --- |
| Starter gifts | Fresh controller creates species 1, 4, and 7 | No difficulty question |
| Wild capture | Every world creature entry tested against actual controller interception and guaranteed-capsule capture; 46 distinct species remain capturable | Guaranteed capsules isolate wiring from ordinary capsule probability and resource use |
| Named challenges | All 149 non-campaign encounter records start through the controller after an ordinary one-member party configuration; all 179 challenge destinations resolve to existing scenes and expose the selected encounter | Entry is verified; individual victories and original difficulty are not |
| Essence rewards | Every generated runtime challenge essence has a valid species binding; all 53 explicit source infant bindings checked, including 49 that differ from the final enemy; controlled victory/hatch/reload fixtures pass | Fixtures reduce selected enemies to isolate the transaction; they do not establish natural battle success |
| Collection campaigns | All six collection campaigns enter their first stage; all referenced encounters exist; later stages require sequential victories | Later victories are not cleared in this audit; combat feasibility remains outside the coverage claim |
| Rei skill training | Requires independently obtainable species 70 in the party, living and up to level 100; fresh-save entry correctly rejects missing Rei | Skill rewards add no new species; no acquisition cycle is created |
| Quests | Current quest records match acquisition routes; predicates require one or three wins, or one recorded boss clear; ordinary wild/boss actions provide those predicates | Reward dispatch is inspected; the complete natural quest grind is not replayed |
| Forward evolution | All 194 reachable level edges checked with the raising API; selected manual chains replayed through controller, ownership registration, and reload; 22 additional fusion prerequisite evolution actions replayed | Prepared level-100 fixtures isolate wiring from training time; no reverse evolution is supplied |
| Fusion | All 34 recipes checked against exact eligible primary/secondary parents and positive outcome weights; independent dependency closure matches all 367 available IDs; existing adversarial fixtures replayed | Probabilistic outputs have positive probability, not a finite-run guarantee; controller fusion transaction checks belong to the separate fusion delivery audit |

The only controller-level entry restrictions in encounter validation are party maximum size and level caps. A fresh three-member party correctly fails the one-member requirement of the Black encounter; normal storage actions solve this gate. The current non-campaign records all enter with one starter. The six species-granting campaigns have order gates and no required owned species. Rei training is separately gated by Rei and grants skills.

The 46 species whose listed routes all carry `authoredReward` use actual named challenge rewards supplied by the remake. They count as implemented actions, while their historical fidelity remains unverified. This differs from arbitrary `startTraining` fallback recruitment: controller code can synthesize remote recruitment essences or wild targets for unmapped IDs, but the normal encyclopedia/map UI exposes no corresponding route. Those generic fallbacks, `cheatAcquire`, imported collections, and modifier-created parents are excluded.

No obtainable species has multiple forward level branches or a non-level evolution edge in the current catalog. The normal evolve action's selection of its first option therefore does not hide a counted branch. Reverse ancestry cannot obtain earlier forms. The independent least-fixed-point starts only from real non-evolution seed routes; each added evolution records its obtainable predecessor, and each added fusion output records both obtainable parents. Unsupported cycles cannot bootstrap availability. The adversarial replay checks reverse recipe ordering, fusion → evolution → fusion, missing-parent rejection, and a self-dependent unsupported fusion cycle.

## Missing reasons

The following diagnostic groups partition all 1,112 missing forms. They explain the immediate route gap, rather than claiming original historical unavailability.

| Missing group | Count |
| --- | ---: |
| Explicit boss infant rewards without usable binding | 0 |
| Unsupported transformation from an obtainable predecessor | 19 |
| Wild metadata without a mapped executable habitat | 269 |
| Missing base acquisition | 267 |
| Descendants of unavailable predecessors | 557 |

A positive catch rate or retained `wild` metadata is insufficient without an actual mapped habitat and controller capture route. A source ancestry relationship is insufficient without executable forward evolution. The transformation gap is: 339 托雷亚; 367 海纹蝶; 368 炽翼蝶; 1121 巨石灵王; 1143 鲁迪诺斯; 1192 巨蘑怪; 1216 魔域仙子; 1230 巨齿鲨; 1237 洛拉托兹; 1266 萨帕罗亚; 1277 雷纳尔多; 1297 布鲁卡卡; 1298 里奥杰斯; 1316 寒冰之魂; 1317 裂冰之魂; 1346 格鲁斯特; 1361 阿克妮丝; 1459 艾菲德斯; 1464 吉纳波斯.

## Classic examples

| Forms | Current status and implication |
| --- | --- |
| 19 利利; 20 绵绵; 21 电击兔 | 19 and 20 are missing. The adult 21 has a named challenge route. Its availability cannot obtain the earlier forms, so this is a partial family. |
| 91 悠悠; 92 蝠迪; 93 希拉; 94 柯蓝 | Only 94 is available. The seed and other branches remain missing; ancestry supplies no reverse evolution. |
| 95 尼布; 96 尼斯克 | The family is entirely missing. |
| 102 奇塔; 103 钢塔斯; 104 雷吉姆斯 | Only 104 is available. The available adult permits its applicable fusion recipe but does not fill earlier forms. |
| 22 毛毛 → 23 卡洛 → 24 巴洛卡 | All three are available; the family is complete. |
| 83 依依 → 84 依丁丝 → 85 依卡莱恩 | All three are available from mapped capture and forward evolution. |
| 77 尼尔 → 78 菲斯利 → 79 艾斯菲亚 | This classic line is available; the wider retained family is partial because a later transformation remains missing. |
| 301–303 黄金布布/蒙娜布布/丽莎布布; 304–306 伊优达/利爪尤里安/鲁斯王; 307–309 炎火猴/熔火灵猴/魔焰猩猩 | All three starter-fusion families are complete. |

## Fusion coverage

**22 of 34 recipes have obtainable parents; 21 of 33 distinct infant outputs are available.** Fusion adds 53 species beyond the non-fusion graph. The following twelve blocked recipes explain the twelve unavailable infant outputs; some blocked recipes can also produce Hige, which is independently available through `fusion-571`.

| Blocked recipe / main infant output | Unavailable required primary forms | Unavailable required secondary forms |
| --- | --- | --- |
| fusion-578 / 578 萨酷 | At least one eligible form is available | 560 沃特; 561 史沃勒 |
| fusion-623 / 623 沃拉普 | 561 史沃勒 | 576 德普; 577 贪食龙 |
| fusion-625 / 625 卡龙 | 577 贪食龙 | 618 嘟拉; 619 嘟嘟卡拉 |
| fusion-629 / 629 依尔 | 559 波尼斯 | At least one eligible form is available |
| fusion-632 / 632 杰丹 | 511 撒格利加 | 463 鲁格洛; 464 纳尔鲁; 465 纳鲁洛特 |
| fusion-849 / 849 雪灵 | 717 康克特 | 378 凯奴; 379 凯瑟琳; 380 凯凯西朴 |
| fusion-932 / 932 马尔洛 | 931 洛尼尔 | 801 马修; 802 马切洛 |
| fusion-946 / 946 果然多多 | 683 果然苹果多 | 677 草莓多多; 678 果然草莓; 679 果然草莓多 |
| fusion-1070 / 1070 布迪 | At least one eligible form is available | 1048 伊尔; 1049 鹰嘴蝶 |
| fusion-1072 / 1072 莫德 | 1047 希克拉 | 1022 黑格; 1023 黑布罗 |
| fusion-1267 / 1267 瑞姆 | 1194 瑞多 | 1056 小岩怪; 1057 怪怪岩 |
| fusion-1487 / 1487 霍迪斯 | 1270 霍吉斯 | 710 卡普; 711 卡纳德; 712 普利德 |

## Reproduction and complete records

Run `node artifacts/dex-acquisition-v21/run-audit.mjs` and `node artifacts/dex-acquisition-v21/replay-fusion-acquisition.mjs` from the repository root. Both passed against the current working source. The Node process emitted a localStorage availability warning; the audit uses controller snapshots and explicit save/reload fixtures, not a browser's live saved collection. The tracked audit runner was reused without modification. The auxiliary runner and generated bulk records remain ignored.

- [Complete missing-species CSV](../../artifacts/dex-acquisition-v21/missing-species.csv): UTF-8 with BOM for Chinese-name compatibility; 1,112 rows with dex ID, source name, family, and missing reason.
- [Complete missing-species Markdown](../../artifacts/dex-acquisition-v21/missing-species.md): all missing IDs and names grouped by reason.
- [Complete family list](../../artifacts/dex-acquisition-v21/acquisition-families.md): all 634 families, obtainable/missing/excluded members.
- [Exhaustive audit JSON](../../artifacts/dex-acquisition-v21/audit.json): all species routes, habitat checks, essence bindings, evolution edges, summary, and source hashes.
- [Dependency and gate audit JSON](../../artifacts/dex-acquisition-v21/dependency-audit.json): every fusion recipe, witnesses for the independent closure, campaign gates, boss entry results, and scene destinations.
- [Fusion prerequisite replay](../../artifacts/dex-acquisition-v21/fusion-acquisition-replay.json): thirteen actual captures, 22 controller evolution actions, reload checks, and adversarial dependency fixtures.

These results establish current implemented route coverage and specific transaction wiring. They do not imply every difficult named encounter or campaign can be defeated from a natural fresh save, and they do not turn missing routes into obtainable species.
