# Fusion recipe recovery and implementation boundary (v17)

The pure recipe module contains 34 ordered parent-pair recipes covering all 33 retained base forms marked `IsFuseMon="1"` by the recovered official client monster table. Every parent and outcome exists in the 1,483-species catalog. Coverage of this source-defined fusion set does not mean that every parent is currently obtainable through normal play.

## Source identity and recovery

The official [RobotCoreDLL resource](https://seer.61.com/dll/RobotCoreDLL.swf) was reused from `.cache/classic-robots/RobotCoreDLL-decoded.swf`. DefineBinaryData record 23 was extracted without executing ActionScript and preserved byte-for-byte at `.cache/fusion-v17/original-binary-23.bin`; its SHA-256 is `bc1fd07bdad0f5086807a8c91d6e27e9638f8ec6fed28c44468a15281d08214d`. Its `Monsters` XML supplies `FuseMaster`, `FuseSub`, `IsFuseMon`, `EvolvesFrom`, `EvolvesTo`, and evolution levels. The current resource contains later additions and is not an untouched 2010 client snapshot.

The existing `PetFusionInfo.as` contains only four unsigned wire fields (`obtainTime`, `soulID`, `starterCpTm`, and `costItemFlag`). It does not specify parent pairs, random outcome weights, parent deletion, or hatch species. No recipe or server-side probability table was recovered from this class. Original successful-fusion probabilities are therefore not certified by the client data.

The [4399 fusion index](https://news.4399.com/seer/ronghe/) was browsed, then its linked recipe pages were fetched into the ignored cache. Original HTML is preserved under `.cache/fusion-v17/original-guide-*.html`, with separate extracted text files. `.cache/fusion-v17/source-manifest.json` records source-byte hashes; `guide-urls.json` maps original guide titles to URLs. Generated extraction, verification scripts, and snapshot reports remain under `.cache/`.

## Parent forms, consumption, and remake decisions

Recipe-specific 2012 reports consistently require the designated final primary form and permit any secondary family form and level. All supported secondary descendants are recovered through official `EvolvesFrom` links and filtered by `FuseSub="1"`. This preserves mechanical families with manual evolutions and the later retained Gil-family descendant 1237. It does not infer eligibility merely from matching type or name.

The remake requires the recorded primary species and does not impose a further training threshold. Both minimum-level fields are 1. The [2012 Ryder guide](https://news.4399.com/gonglue/seer/saiergonglue/201212-07-220416.html) additionally recommends a primary above level 50; that historical extra threshold is intentionally omitted under the current user instruction. Final-form requirements remain in the exact primary species lists.

Successful classic fusion replaces both original parent monsters. The [2014 illustrated procedure](https://news.4399.com/gonglue/seer/jingyanxinde/454468.html) describes successful parents becoming a spirit bead, and the [2010 restoration report](https://news.4399.com/seer/jingyanxinde/201002-17-64345.html) describes restoring the former primary from a fusion creature. An explicit [fusion procedure](https://www.51wendang.com/doc/5dda5ca74bb14b41c5e62faf) states that both parents disappear on success and that a premium item preserves the secondary. The [launch-week report](https://news.4399.com/seer/jingyanxinde/201002-10-64236.html) also records changing failure rules immediately after release; those unstable early rules are not used for this remake.

`FUSION_PARENT_POLICY` equals `retain`: the user explicitly chose to keep both actual parents and generate only the spirit bead. This module never deletes or alters an owned creature. The controller owns that decision, verifies distinct actual instances, and applies any transaction. `chooseFusionOutcome` requires the controller's explicit random roll; it does not call an independent random generator.

No mineral material, currency charge, failure outcome, energy collection, wait timer, or premium item is encoded. Each successful outcome supplies a unique `fusion_bead_<base species>` item ID and a bead label. The controller reuses the existing immediate essence-hatching flow. Every hatched species is its base form, even when the cited guide is titled after the final evolution.

## Probability calibration

`FUSION_RARE_PROBABILITIES` is the single adjustment point: Karu 5%, Hige 5%, as explicitly selected by the user. The other result receives the complementary probability. The normal trio receives equal probability (100/3% each). Single-outcome formulas succeed with 100% of the resulting bead probability. All recipes carry `probabilityBasis: 'remake'`; these are explicit playable settings, not recovered original server rates.

Karu's source rates conflict. The [2010 formula page](https://news.4399.com/seer/seertuijiangonglue/jinglinggonglue/201004-08-65888_9.html), later repeated in the [2012 Karuyeck guide](https://news.4399.com/seer/jingyanxinde/201202-20-144021.html), gives 70% purple and 15% pink without identifying the remaining 15%. Those figures must not be silently normalized into a certified historical distribution. The user-selected 95% Shiny Nier / 5% Karu distribution is independent of that incomplete report.

The [2011 Hige report](https://news.4399.com/seer/jlfx/201102-02-86043.html) reports a 5% pink-bead result from the four glutton-family formulas. The user chose to retain a 5% rare-result rate, giving each paired ordinary result 95%. The [2012 Hige summary](https://news.4399.com/seer/jingyanxinde/201202-21-144217.html) has copied parent names in its first explanatory sentence; the four numbered family pairs and their individual ordinary-result pages determine the implemented formulas.

Normal-bead guides contain broad and inconsistent claims about arbitrary combinations and parent-dependent biases. The [2010 observation report](https://news.4399.com/seer/jingyanxinde/201003-23-65200.html) records specific successful pairs but identifies its bias explanation as an inference. The module implements six source-supported, ordered pairs; it does not create a universal arbitrary-parent fallback. The equal trio rate is a remake choice, not a certified source percentage.

## Recipe and acquisition snapshot

The table below records the existing acquisition index before the integrated fusion controller and any new encounter routes were added. A ready pair means that at least one permitted primary and secondary form already had an implemented acquisition route. It does not mean that the player currently owns either parent. At this snapshot, 7 of 34 pairs were ready and 27 had at least one acquisition gap. The complete per-form snapshot is `.cache/fusion-v17/parent-acquisition.json`.

| Recipe | Exact primary | Eligible secondary forms | Base outcomes and remake percentages | Acquisition snapshot | Pair source |
| --- | --- | --- | --- | --- | --- |
| `fusion-301` | 3 (布布花) | 27, 28, 29 | 301 (黄金布布) 100% | Ready | [Guide](https://news.4399.com/seer/jingyanxinde/201202-20-144024.html) |
| `fusion-304` | 6 (巴鲁斯) | 198, 199, 200 | 304 (伊优达) 100% | Secondary route missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-20-144027.html) |
| `fusion-307` | 9 (烈焰猩猩) | 35, 36, 37, 1237 | 307 (炎火猴) 100% | Ready | [Guide](https://news.4399.com/seer/jingyanxinde/201202-20-144030.html) |
| `fusion-310` | 79 (艾斯菲亚) | 164, 165, 166 | 310 (闪光尼尔) 95%; 313 (卡鲁) 5% | Both parent routes missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-20-144036.html) |
| `fusion-316` | 180 (卡斯达克) | 53, 54, 55 | 316 (达莫拉) 100% | Primary route missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-20-144019.html) |
| `fusion-319` | 155 (灵翼蜂) | 25, 26 | 319 (轻羽蜂) 100% | Ready | [Guide](https://news.4399.com/seer/jingyanxinde/201202-20-143905.html) |
| `fusion-322` | 118 (克洛亚) | 190, 191, 192 | 322 (卡克) 100% | Ready | [Guide](https://news.4399.com/seer/jingyanxinde/201202-20-143886.html) |
| `fusion-332` | 210 (多鲁姆) | 38, 39, 40 | 332 (烈炎兽) 100% | Primary route missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-18-143756.html) |
| `fusion-338` | 61 (雷吉欧斯) | 102, 103, 104 | 338 (多塔) 100% | Ready | [Guide](https://news.4399.com/seer/jingyanxinde/201202-20-144041.html) |
| `fusion-341` | 138 (洛比特) | 128, 129, 130 | 341 (索尔) 100% | Primary route missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-20-144037.html) |
| `fusion-401` | 15 (天雷鼠) | 97, 98, 99 | 401 (泰尼) 100% | Ready | [Guide](https://news.4399.com/seer/jingyanxinde/201202-20-144038.html) |
| `fusion-404` | 189 (加格尔) | 228, 229 | 404 (迪姆) 100% | Both parent routes missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-20-144040.html) |
| `fusion-427` | 251 (萨洛姆斯) | 232, 233, 234 | 427 (桑帕) 100% | Primary route missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-18-143750.html) |
| `fusion-571` | 473 (伊洛花) | 480, 481 | 571 (埃洛种子) 95%; 639 (希格) 5% | Secondary route missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-18-143739.html) |
| `fusion-578` | 481 (埃洛兽) | 560, 561 | 578 (萨酷) 95%; 639 (希格) 5% | Both parent routes missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-14-142972.html) |
| `fusion-623` | 561 (史沃勒) | 576, 577 | 623 (沃拉普) 95%; 639 (希格) 5% | Both parent routes missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-21-144218.html) |
| `fusion-625` | 577 (贪食龙) | 618, 619 | 625 (卡龙) 95%; 639 (希格) 5% | Both parent routes missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-21-144215.html) |
| `fusion-627` | 554 (远古甲虫) | 203, 204 | 627 (晶岩虫) 100% | Secondary route missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-21-144232.html) |
| `fusion-629` | 559 (波尼斯) | 83, 84, 85 | 629 (依尔) 100% | Primary route missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-21-144227.html) |
| `fusion-632` | 511 (撒格利加) | 463, 464, 465 | 632 (杰丹) 100% | Both parent routes missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-20-144033.html) |
| `fusion-849` | 717 (康克特) | 378, 379, 380 | 849 (雪灵) 100% | Both parent routes missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-20-144022.html) |
| `fusion-932` | 931 (洛尼尔) | 801, 802 | 932 (马尔洛) 100% | Both parent routes missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-21-144205.html) |
| `fusion-946` | 683 (果然苹果多) | 677, 678, 679 | 946 (果然多多) 100% | Both parent routes missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-20-144029.html) |
| `fusion-1070` | 828 (狂野黑鸟) | 1048, 1049 | 1070 (布迪) 100% | Secondary route missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-20-144025.html) |
| `fusion-1072` | 1047 (希克拉) | 1022, 1023 | 1072 (莫德) 100% | Both parent routes missing | [Guide](https://news.4399.com/seer/jingyanxinde/201202-21-144209.html) |
| `fusion-1267` | 1194 (瑞多) | 1056, 1057 | 1267 (瑞姆) 100% | Both parent routes missing | [Guide](https://news.4399.com/seer/jingyanxinde/201207-13-176282.html) |
| `fusion-1448` | 147 (吉尼亚斯) | 133, 134, 135 | 1448 (瑞普) 100% | Secondary route missing | [Guide](https://news.4399.com/gonglue/seer/saiergonglue/201212-07-220416.html) |
| `fusion-1487` | 1270 (霍吉斯) | 710, 711, 712 | 1487 (霍迪斯) 100% | Both parent routes missing | [Guide](https://news.4399.com/gonglue/seer/saiergonglue/201301-11-229869.html) |
| `fusion-normal-121-205` | 121 (伊卡罗尼) | 205, 206, 207 | 325 (卡门兔) 1/3; 328 (辛克) 1/3; 330 (伊达) 1/3 | Secondary route missing | [Guide](https://news.4399.com/seer/jingyanxinde/201003-23-65200.html) |
| `fusion-normal-207-119` | 207 (星吉拉) | 119, 120, 121 | 325 (卡门兔) 1/3; 328 (辛克) 1/3; 330 (伊达) 1/3 | Primary route missing | [Guide](https://news.4399.com/seer/jingyanxinde/201003-23-65200.html) |
| `fusion-normal-34-205` | 34 (钢牙鲨) | 205, 206, 207 | 325 (卡门兔) 1/3; 328 (辛克) 1/3; 330 (伊达) 1/3 | Secondary route missing | [Guide](https://news.4399.com/seer/jingyanxinde/201003-23-65200.html) |
| `fusion-normal-55-178` | 55 (鲁加斯) | 178, 179, 180 | 325 (卡门兔) 1/3; 328 (辛克) 1/3; 330 (伊达) 1/3 | Secondary route missing | [Guide](https://news.4399.com/seer/jingyanxinde/201003-23-65200.html) |
| `fusion-normal-166-77` | 166 (闪光波克尔) | 77, 78, 79 | 325 (卡门兔) 1/3; 328 (辛克) 1/3; 330 (伊达) 1/3 | Both parent routes missing | [Guide](https://news.4399.com/seer/jingyanxinde/201003-23-65200.html) |
| `fusion-normal-15-43` | 15 (天雷鼠) | 43, 44, 45 | 325 (卡门兔) 1/3; 328 (辛克) 1/3; 330 (伊达) 1/3 | Ready | [Guide](https://news.4399.com/seer/jingyanxinde/201003-23-65200.html) |

The source pages contain recognizable copied names: the Karalong page first mentions the water secondary family but then explicitly identifies Duducala as the secondary; the dedicated original Karalong guide and the 2011 full formula list confirm that pair. The 2012 Shadow Hige formula also contains parent names copied from the separate Jedan formula. The module follows the separately corroborated family pairs, not those copied sentences.

The [2013 bead-color clarification](https://news.4399.com/news/seerwenda/242688.html) identifies the red-yellow bead for Ryder and the cyan-purple bead for Holiday. The [illustrated Bookbird report](https://news.4399.com/seer/tujian/139577.htm) identifies its bead as orange. These later labels correct unsupported inferred color names.

## Scope exclusions and remaining work

Ilandi is official species 1850 and is absent from the retained catalog, which ends at ID 1499. Its official monster record does not mark it as a fusion creature. Ilanroni 227 is a different monster, an eligible fusion primary rather than a fusion base output. Git 1537 and Kudika 2164 are also outside this catalog. No output or recipe is invented for any of these species. The 33-output coverage measure specifically means retained `IsFuseMon` base forms; later event additions to generic normal beads and arbitrary combination behavior have not been reconstructed here.

Missing parent acquisition routes remain integration work. This change does not claim that creating recipes supplies those routes. Parent consumption, instance uniqueness, selected-parent feedback, inventory awards, save persistence, and immediate hatching are controller and interface responsibilities outside this module's ownership.

## Verification performed

- The official source's 33 retained fusion base forms are exactly covered by the module's 33 distinct outputs; no source-defined base output is missing.
- Every parent and output ID exists in the 1,483-entry catalog. Every output has no prior evolution and is hatched as the infant form.
- Every primary has the official `FuseMaster` flag and every secondary the `FuseSub` flag. Parent order and every secondary family member are explicit.
- Node checks validate 34 recipes, positive normalized percentages, supported matching, invalid-parent rejection, deterministic boundary selection for Karu and Hige, normal trio coverage, invalid random-roll rejection, and the approved retention policy.
- The module passed standalone TypeScript verification with `--ignoreConfig --noEmit`, and the initial full-project check passed after module creation. A later full-project check encountered the concurrently edited manager's missing Fusion component before that component was saved; final integration verification belongs to the controller/interface delivery. No production bundle or native package was generated. These checks validate recipe data and selection behavior; they do not establish original server probabilities or end-to-end game acceptance.
