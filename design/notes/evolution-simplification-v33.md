# Evolution simplification v33

This note records the first, mechanical/branch-only revision. The user subsequently
approved the remaining special evolutions; revision 34 resolves the deferred list
under the separate source-versus-remake rules in `evolution-completion-v34.md`.

## Approved behavior and evidence

The user requested ordinary level evolution for mechanical species and a direct choice of branch for branching evolution. Branch-family initial forms must remain repeatedly obtainable under the existing six-per-species cap.

The official retained Flash client supplies the targets and levels. Automatic mechanical evolution and removing branch item costs are explicit remake choices, not claims about the original client. The policy is recorded in `data/evolution-rules.json` and applied deterministically to each affected `data/monsters/NNNN.json`, `data/gamedata.json`, and `data/catalog_index.json`.

- 43 single-target mechanical transitions use their source levels and `automatic: true`. This includes the mechanical/psychic families starting at 610 and 1421. Eleven targets already had another acquisition route, so all 43 transitions are needed to repair the families even though only 32 targets were missing from the v32 closure.
- Six traditional branch points expose all 16 original targets with `automatic: false`. Three targets already had separate acquisition routes; the new transitions make 13 previously missing forms reachable.
- The non-mechanical, psychic/ice transition 671 to 672 retains its existing manual rule. A trigger flag alone does not identify a mechanical species.
- The earlier manual rule for mechanical transition 1220 to 1221 is superseded by the user's automatic-level policy.
- Stats, learnsets, ancestry, types, acquisition metadata, and unrelated evolution transitions are preserved.

## Pinned sources and reproduction

The XML files were extracted from `https://seer.61.com/dll/RobotCoreDLL.swf` on 2026-10-14 without executing ActionScript. The wrapper is removed, its payload inflated, and binary-data symbols read from the decoded SWF.

| Artifact | SHA-256 |
|---|---|
| Encoded RobotCoreDLL | `4fdde653317cf81ad34bcd87e0a4e01c2f518bfe4cfadcc396bbad6b698b1e1e` |
| Decoded RobotCoreDLL | `e97b3f53a5f0242e89018bee91be508dc8fc6f41ae5e4bc5818d8f5161e81c42` |
| PetXMLInfo, binary 23 | `bc1fd07bdad0f5086807a8c91d6e27e9638f8ec6fed28c44468a15281d08214d` |
| EvolveXMLInfo, binary 44 | `f88fa14c15e7fe725e848c152de4a30bdd3e4bb2988429be66290ba6184ad80d` |

`PetXMLInfo.EvolvFlag` selects an `EvolveXMLInfo.Evolve` record. Its `Branch.MonTo` supplies the target; the source parent's `EvolvingLv` supplies the level. The policy JSON retains these original fields and all original branch item IDs/counts. The live upstream URL may change, so the generator rejects XML bytes that do not match the pinned hashes.

```sh
python3 tools/assets/build_evolution_rules.py --source-dir /path/to/extracted-xml
python3 tools/assets/build_evolution_rules.py --source-dir /path/to/extracted-xml --check
```

The directory must contain `23-PetXMLInfo_xmlClass.xml` and `44-EvolveXMLInfo_xmlcls.xml`. The default cache directory is `.cache/evolution-v33`. The generator does not infer missing levels or download a changing upstream file silently.

## Mechanical transitions

All rows below are automatic in the remake. The source flag and target remain recoverable in the policy JSON.

| From | To | Level |
|---|---|---:|
| 59 西塔 | 60 铁达斯 | 18 |
| 60 铁达斯 | 61 雷吉欧斯 | 38 |
| 71 派派 | 72 派鲁克 | 17 |
| 72 派鲁克 | 73 派鲁基达 | 36 |
| 80 帕诺 | 81 帕拉丝 | 16 |
| 81 帕拉丝 | 82 帕尔西丝 | 35 |
| 100 卡西 | 101 卡尔特 | 29 |
| 102 奇塔 | 103 钢塔斯 | 18 |
| 103 钢塔斯 | 104 雷吉姆斯 | 38 |
| 111 雷格 | 112 雷顿塔 | 19 |
| 112 雷顿塔 | 113 雷纳多 | 39 |
| 143 卡塔 | 144 赫卡特 | 28 |
| 201 SRT | 202 SRX | 27 |
| 213 TOE | 214 TOH | 29 |
| 223 德塔 | 224 赫德卡 | 31 |
| 287 厄斯 | 288 厄斯沃姆 | 30 |
| 338 多塔 | 339 托雷亚 | 21 |
| 339 托雷亚 | 340 托雷塔斯 | 41 |
| 362 丘波 | 363 鲁比克 | 30 |
| 459 尤达 | 460 尤达里克 | 30 |
| 494 卡丹 | 495 洛卡特 | 20 |
| 495 洛卡特 | 496 洛卡斯特 | 40 |
| 539 艾克 | 540 艾克斯 | 32 |
| 541 赫洛 | 542 赫格拉斯 | 20 |
| 542 赫格拉斯 | 543 赫拉尼洛 | 40 |
| 610 帕尔 | 611 卡帕达 | 28 |
| 669 哈德 | 670 哈德克 | 30 |
| 724 斯贝拉 | 725 洛斯贝拉 | 26 |
| 807 艾派 | 808 艾蒂森 | 34 |
| 887 彼得 | 888 彼得华 | 34 |
| 1074 杰雷 | 1075 杰莱卡 | 34 |
| 1082 LEK | 1083 LYN | 36 |
| 1195 卡桑 | 1196 卡利莫 | 19 |
| 1196 卡利莫 | 1197 卡莫尔 | 35 |
| 1209 道尔 | 1210 道格 | 34 |
| 1220 博杰斯 | 1221 博卡特 | 40 |
| 1273 卡斯奇 | 1274 卡雷尼 | 35 |
| 1318 罗比 | 1319 罗伯特 | 39 |
| 1329 罗伊 | 1330 罗伯斯 | 39 |
| 1388 罗迪 | 1389 罗斯克 | 36 |
| 1392 莱奇斯 | 1393 莱伯拉 | 38 |
| 1421 阿莱耶 | 1422 阿莱耶克 | 40 |
| 1423 玛尔科 | 1424 玛卢达科 | 35 |

## Traditional branch choices

Each row requires an explicit target selection once the source level is reached. The original material costs are omitted under the approved remake policy.

| Parent | Targets | Level |
|---|---|---:|
| 91 悠悠 | 92 蝠迪; 93 希拉; 94 柯蓝 | 20 |
| 269 眼球 | 270 刹洛眼; 271 迪修眼; 272 詹士眼 | 30 |
| 366 呆呆蛹 | 367 海纹蝶; 368 炽翼蝶; 369 橡木蝶 | 30 |
| 373 莫顿 | 374 古利安; 375 隆米尔 | 30 |
| 756 邪特 | 757 西鲁; 758 邪洛; 759 斯拉特 | 30 |
| 1461 雪啦啦 | 1462 拉可尼; 1463 尼可拉 | 40 |

## Deferred forms in the original 77-form audit

This first policy resolves 45 missing forms. The remaining 32 have a different source structure and are recorded in `deferredMissingForms`, not made obtainable by this generator. Six have a single-target item trigger. Twenty-six have only reverse ancestry in these two XML tables; some are also described by a separate super-evolution configuration.

| Target | Predecessor | Source structure |
|---|---|---|
| 432 杰西卡 | 398 杰拉德 | single-item-trigger |
| 652 诺拉德 | 651 诺奇 | single-item-trigger |
| 729 鱼龙王 | 347 远古鱼龙 | single-item-trigger |
| 811 始祖灵兽 | 810 灵光兽 | single-item-trigger |
| 881 炽焰之刃 | 601 火刃 | single-item-trigger |
| 1017 三尾火狐 | 821 烈焰火狐 | special-ancestry |
| 1018 四尾火狐 | 1017 三尾火狐 | special-ancestry |
| 1019 九尾火狐 | 1018 四尾火狐 | special-ancestry |
| 1121 巨石灵王 | 1120 阿洛比斯 | special-ancestry |
| 1122 圣光天马 | 999 珀伽索斯 | special-ancestry |
| 1143 鲁迪诺斯 | 55 鲁加斯 | single-item-trigger |
| 1192 巨蘑怪 | 47 蘑菇怪 | special-ancestry |
| 1215 尤米娜 | 1214 尤米尔 | special-ancestry |
| 1216 魔域仙子 | 29 魔花仙子 | special-ancestry |
| 1230 巨齿鲨 | 34 钢牙鲨 | special-ancestry |
| 1237 洛拉托兹 | 37 洛吉拉斯 | special-ancestry |
| 1238 炽翼火龙 | 1237 洛拉托兹 | special-ancestry |
| 1266 萨帕罗亚 | 400 萨帕克 | special-ancestry |
| 1277 雷纳尔多 | 113 雷纳多 | special-ancestry |
| 1278 阿诺比零 | 500 阿尔比零 | special-ancestry |
| 1279 时空之零 | 1278 阿诺比零 | special-ancestry |
| 1297 布鲁卡卡 | 110 布鲁克克 | special-ancestry |
| 1298 里奥杰斯 | 42 里奥斯 | special-ancestry |
| 1316 寒冰之魂 | 67 布林克斯 | special-ancestry |
| 1317 裂冰之魂 | 67 布林克斯 | special-ancestry |
| 1346 格鲁斯特 | 64 格鲁奇高 | special-ancestry |
| 1361 阿克妮丝 | 50 阿克希亚 | special-ancestry |
| 1428 哈德罗卡 | 739 哈德萨 | special-ancestry |
| 1429 哈德莱斯 | 739 哈德萨 | special-ancestry |
| 1459 艾菲德斯 | 77 尼尔 | special-ancestry |
| 1464 吉纳波斯 | 239 吉娜斯 | special-ancestry |
| 1473 亚梅迪丝 | 197 亚梅丝 | special-ancestry |

Three additional structural branch points therefore require a separate decision: 67 to 1316/1317; 739 to 1428/1429; and 77 to existing 78 plus special form 1459. The source level 17 belongs to 77 to 78 and must not be copied to 1459. The retained `super_evolve` configuration describes 1459 as a super-evolution from any of 77/78/79, reinforcing that distinction. Mechanical super-evolution 113 to 1277 likewise has no level in the two pinned XML files and is outside the ordinary mechanical policy.

## Data validation

The generator verifies both source SHA-256 values, every target's predecessor, all source levels, the 43 mechanical transitions, six branch points, and 16 branch targets. A second run with `--check` must report zero changed files. A field-level audit compares the catalog with Git HEAD and permits only the reviewed species' evolution arrays and provenance notes, plus the corresponding index target lists, to change. Gameplay and acquisition verification are reported separately below when completed.


## Gameplay and validation

The raising panel lists target portraits, names, levels and blocking reasons. Multiple targets have no default selection, including when only one is currently eligible. Confirming evolution sends the selected target ID; invalid or unavailable targets are rejected before any save or RNG change. Switching the selected held creature or completing an evolution clears the old choice. The panel reports success only after the controller returns the requested species.

Both the core automatic-evolution helper and the controller inspect the complete target set before advancing. They never choose a branch based only on which target has reached its level. Ordinary single-target evolutions run after battle experience, pooled experience, positive level/experience items and developer level edits. Destination limits count all held creatures and every pending essence alias. A blocked automatic evolution preserves the earned training and leaves manual evolution available after space is freed.

Repeat acquisition retains each family's existing route: Yoyo (91) and Eyeball (269) use wild capture; the other four branch families use earned tower or collection essences. No paid or lottery route is turned into a new free wild encounter. Evolving frees the original form's allowance; it does not remove progress or the ability to obtain another initial form.

- `evolution-branches.mjs`: 82 grouped cases passed, including all 43 mechanical level boundaries, all 16 branch targets, six repeat-acquisition routes, destination caps across aliases, retained instance fields/traits, old-save reloads, missing/invalid target rejection and automatic-evolution entry points. Yoyo and Eyeball each pass six actual captures, a seventh-copy rejection, and another capture after evolution frees an initial-form slot. The tower-essence repeat check starts from a cleared save. The battle-experience check enhances one move to isolate experience settlement rather than claiming a normal-difficulty playthrough.
- `acquisition-limits-controller.mjs` and `collection-shop-v25.mjs`: 27 existing grouped checks passed.
- `boss-essence-targets.mjs`: all 25 reward bindings remain correct; the former manual 1220 assertion now checks an ordinary level item causing automatic evolution at level 40.
- `dex-acquisition.ts`: 205 actual mapped captures, eight collection-map guards, 54 original essence bindings and 815 executable evolution edges passed; no previously available form lost its route. Its deliberately reduced baseline is not used to count this revision's additions.
- The independent acquisition export reaches 1,447/1,479 eligible forms, 632/632 initial entries, 316/316 recruitment rewards, 34/34 fusion recipes and 8/8 breeding pairs. The remaining 32 IDs equal the deferred policy list exactly, so the increase from the v32 audit is 45 forms.
- TypeScript, source-generation checks and whitespace checks passed. Acquisition-policy regeneration changes only the catalog source hash; habitat regeneration changes only its policy hash, preserving all 217 placement records.
- In a separate browser test origin, a level-20 Yoyo stays unevolved until a choice is made. Selecting the second target, Hila (93), produces that target, while switching to another held creature first clears the old selection. Browser evidence is saved in `../analysis/codex-takeover-2026-10-14/browser-v33/`; the console contains no warnings or errors. The main preview save is unaffected.

The latest independent report is `../analysis/codex-takeover-2026-10-14/evolution-v33-final/`. This remains a development-source change with no production build, packaging or remote push.
