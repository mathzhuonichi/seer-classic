# Sub-600 elite candidate audit (V45)

The current elite pool excludes strong skill combinations because its sole strength threshold is raw base-stat total (BST) at least 600. This read-only audit prioritizes 12 direct-combat species and 5 specialist species for further balancing. It does not expand the pool, change production data, or claim an exhaustive competitive ranking.

## Population and screening

The runtime catalog contains 1,483 species: 1,378 below 600, 44 exactly 600, and 61 above 600. Excluding NPC-only species 122–125 leaves 1,479 collectible species, including 1,376 below 600 and the existing 103-species elite pool. The ten authored teams contain 60 slots, 51 distinct species, and 36 distinct species below 600. The complete roster snapshot is in the generated scan report.

The audit inspected all 1,376 collectible sub-600 learnsets. Natural moves must have an integer learning level between 1 and 100. Exact species-matched boss reward skills are separately accepted for Rei; no other species inherits those rewards. Multi-hit moves are excluded from every screening feature and every proposed four-move build.

The broad tags nominate 375 species for review, with overlap: 313 have an aligned offense boost of at least two stages plus a power-140 finisher; 113 have main offense at least 110, speed at least 100, power at least 140, and aligned priority power at least 45; 44 combine direct healing of at least 33% with an offense boost of at least two stages; 3 combine fast offense with guaranteed direct control of at least 85 accuracy; 2 have a natural five-stat boost; and 15 have one of the selected specialist scripts. These thresholds are transparent search heuristics, not admission rules.

The following 17 species are prioritized for explicit legal combinations and complementary roles: 16 come from the tagged population, while Rei is added separately because its task-reward moves and ability training are outside the natural-move screening rules. The remaining 359 tagged species have not been proved weaker. Terminal evolution, fame, a large displayed move power, and temporary stat stages are not substitutes for an implemented battle role. The complete machine-readable scan retains both tagged and untagged species for follow-up.

## Direct-combat priority list

Base-stat columns are HP / Attack / Defense / Special Attack / Special Defense / Speed. Move names are retained verbatim from the catalog; IDs are stable verification keys. “Direct-combat” means the rationale survives removal of every `multi_hit` move, not that the species is automatically ready for admission.

| ID and species | BST | Base stats | Legal four-move proposal | Reason to review |
|---|---:|---|---|---|
| 70 雷伊 | 532 | 71/108/70/101/77/105 | 10825 雷神天明闪; 20364 雷神觉醒; 10823 极光刃; 10166 风驰电掣 | Exact-species reward moves: attack/speed +2, priority +2, clear boosts; permanent training is a separate NPC profile. |
| 261 盖亚 | 590 | 105/119/87/96/78/105 | 10715 石破天惊; 20312 返璞归真; 10710 破元闪; 20309 神经修复 | Attack 119, speed 105; attack/accuracy +2, 150-power boost removal, priority, healing; optional single seal is separate. |
| 421 厄尔塞拉 | 581 | 102/79/91/112/94/103 | 11140 奇幻光芒; 20564 光芒附体; 10632 金光闪烁; 11135 瞬闪 | Special attack 112, speed 103; five-stat setup and direct removal of opposing boosts. |
| 468 罗德利斯 | 576 | 102/91/79/114/82/108 | 11224 天火凤凰; 20486 幻化之火; 20488 火之意志; 11017 音速火拳 | Special attack 114, speed 108; 90-accuracy sleep plus special attack +2 and a 150-power finisher. |
| 774 亚兰洛 | 581 | 123/75/79/113/89/102 | 11884 烈火精灵; 20486 幻化之火; 20957 战火复燃; 10981 暗算 | HP 123, special attack 113, speed 102; sleep and special attack/accuracy +2. |
| 798 卡修斯 | 592 | 121/118/83/89/80/101 | 11925 量子绝灭波; 20982 连山绝壑; 11924 乾坤反转; 10223 快攻 | Attack 118, speed 101; sure-hit 150 power, offense/speed setup, priority; boost theft is a script the AI does not value. |
| 865 托鲁克 | 597 | 125/115/82/80/80/115 | 12079 飓风利袭; 21070 坚硬体格; 12080 速度神爪; 10060 快击 | Speed 115; attack +2 and both defenses +1, priority +2, boost removal; scripted blind-wind utility requires separate AI work. |
| 875 布莱克 | 597 | 122/117/95/78/83/102 | 12112 双重暗影; 21090 暗夜守护; 11919 夜魔之球; 12110 邪灵击 | Attack 117, speed 102; five-stat setup, 130-power boost removal, 85-power priority. |
| 927 迪诺恩 | 595 | 118/112/95/83/96/91 | 12217 无尽之火; 20114 凌厉; 12216 燃烧瞬袭; 20116 浴火重生 | Attack/speed +2, priority, full heal with self-fatigue cost; slower initial speed 91. |
| 1260 纳扎 | 598 | 124/119/85/84/81/105 | 12937 无极燎原枪; 20486 幻化之火; 21533 青鸾火凤; 12934 念火突刺 | Attack 119, speed 105; sleep, attack/speed setup and 75-power priority. |
| 1447 金翅托鲁克 | 597 | 125/115/82/80/80/115 | 12079 飓风利袭; 21070 坚硬体格; 12080 速度神爪; 10060 快击 | The catalog base stats, types and learnset equal species 865; separate identity, same battle build. |
| 1477 弗希斯 | 598 | 123/81/87/116/88/103 | 13423 残影叶刃闪; 21817 自然之怒; 13422 幽暗魔花; 13421 瞬域影杀 | Special attack 116, speed 103; special attack +2, 75-power special priority and boost removal; full heal is an alternative fifth move. |

All proposals passed the live `trainerSkillOrigin` legality check. For Rei, 10825, 20364, and 10823 are exact-species training rewards; 10166 is natural. Other proposed moves are natural. Species 865 and 1447 have identical base stats, types, and learnsets in this catalog, so the 12 species represent 11 distinct builds.

Rei retains raw BST 532. The separately implemented `rei-classic-full` NPC profile adds 60 HP, 20 Attack, 30 Defense, 10 Special Attack, 20 Special Defense, and 20 Speed to final level-100 neutral stats. Those 160 actual-stat points correspond to 80 base-stat points at that level, hence an equivalent BST of 612 for this pinned baseline. They are not 160 extra base-stat points. Ordinary skill acquisition does not confer this profile.

Gaia retains BST 590. Its selected training seal is a separate passive, never an equivalent-BST addition and never all three historical options stacked together. The authored core selects 5% end-turn healing; the authored fast-pressure team selects one 30-damage follow-up per qualifying move. The five-stat and attack/speed moves elsewhere in the table create temporary stages, not permanent training.

## Default factory and AI readiness

Only species 865 and 1447 receive exactly the proposed four-move set from the existing random factory. The other ten need authored loadouts to reproduce these plans. Several still receive a useful partial set; the missing moves below identify the precise gap.

| Species | Current automatically selected moves | Proposed moves omitted by the factory |
|---|---|---|
| 70 雷伊 | 10176 瞬雷天闪; 10170 白光刃; 10167 闪光击; 20086 雷雨天 | 10825 雷神天明闪; 20364 雷神觉醒; 10823 极光刃; 10166 风驰电掣 |
| 261 盖亚 | 10715 石破天惊; 10714 日月皆伤; 10710 破元闪; 20308 怒嚎 | 20312 返璞归真; 20309 神经修复 |
| 421 厄尔塞拉 | 11140 奇幻光芒; 11139 时空裂痕; 11135 瞬闪; 20564 光芒附体 | 10632 金光闪烁 |
| 468 罗德利斯 | 11224 天火凤凰; 11222 火焰压制; 11017 音速火拳; 20049 封印 | 20486 幻化之火; 20488 火之意志 |
| 774 亚兰洛 | 11884 烈火精灵; 10981 暗算; 20957 战火复燃; 11881 烈日炎烤 | 20486 幻化之火 |
| 798 卡修斯 | 11925 量子绝灭波; 11731 风沙四起; 10223 快攻; 20982 连山绝壑 | 11924 乾坤反转 |
| 865 托鲁克 | 12079 飓风利袭; 12080 速度神爪; 10060 快击; 21070 坚硬体格 | None |
| 875 布莱克 | 12112 双重暗影; 12113 勇猛之力; 12110 邪灵击; 21090 暗夜守护 | 11919 夜魔之球 |
| 927 迪诺恩 | 12217 无尽之火; 10076 猛击; 12216 燃烧瞬袭; 20116 浴火重生 | 20114 凌厉 |
| 1260 纳扎 | 12937 无极燎原枪; 12936 炽炎之枪; 12934 念火突刺; 21532 幻火红绫 | 20486 幻化之火; 21533 青鸾火凤 |
| 1447 金翅托鲁克 | 12079 飓风利袭; 12080 速度神爪; 10060 快击; 21070 坚硬体格 | None |
| 1477 弗希斯 | 13423 残影叶刃闪; 11828 暗影之舞; 13421 瞬域影杀; 21816 暗影微光 | 21817 自然之怒; 13422 幽暗魔花 |

The factory only considers natural level moves, ranks powered attacks by ordinary power/accuracy/type/priority, and picks one support using direct effect scores. It cannot add Rei reward skills or optimize combinations such as sleep plus a two-stage attack boost. Its support scoring also favors some redundant multi-stat effects over the intended role. None of these twelve default builds contains a multi-hit move.

The current smart AI can evaluate direct stat stages, direct status, healing, boost removal, and priority. It deliberately does not execute script callbacks while planning. A script-bearing powered attack is still scored for its ordinary damage, but the planner does not understand such benefits as boost theft or delayed/sacrifice mechanics. The proposed Toruk set uses direct setup and ordinary attacks; its separate 21069 blind-wind script is not included in that proposed four-move set.

## Conditional specialist list

| ID and species | BST | Exact role move | Current implementation and limitation |
|---|---:|---|---|
| 177 巴弗洛 | 520 | 20215 镇魂歌 | Delayed knockout requires staying alive through three end turns; specialist survival plan, not a raw damage duelist. |
| 110 布鲁克克 | 558 | 20143 海洋之心 | Engine removes one quarter of maximum HP; useful for large HP targets but ordinary opponents may be better hit directly. |
| 359 布林克克 | 592 | 20143 海洋之心 | Same percent-HP role with a stronger physical stat line; special build and AI awareness required. |
| 356 斯加尔卡 | 575 | 20398 电闪光华阵 | Self-KO grants the living team two shared guaranteed-critical attacks; requires a reserve finisher. |
| 755 斯普林特 | 590 | 20932 灵魂寄托 | Same team critical-sacrifice role; special attack 118 and higher speed 96 provide a different pivot. |

All five role moves are naturally legal. The current factory selects none of them, and the smart AI has no utility score for their scripts. These five therefore require authored four-move/team plans and script-aware decision support before a reliable random elite deployment. They were source-reviewed, not ranked by the single-combat benchmark.

The percent-HP implementation uses maximum HP, not current HP (`seer_eff_28`). The delayed knockout uses a three-turn condition on its owner (`seer_eff_62`), so surviving and retaining that condition matters. The sacrifice grants a shared pool of two guaranteed-critical attack charges to living teammates (`seer_eff_71`); it is not two charges independently given to each teammate. Immunity rules and switching can still change these roles.

## Bounded sanity benchmark

The frozen panel contains 12 species selected with seed 4515 from the 97 existing elite species whose default four moves contain no `multi_hit`. Six elite species were excluded from this panel for that reason: 274, 391, 622, 886, 912, and 1480. The panel was selected before any results were observed. Its species IDs are 1336, 1279, 1298, 1187, 393, 1000, 1093, 1216, 1029, 1317, 413, and 309.

Every matchup uses seeds 7, 29, and 101; both sides use the current smart AI, level 100, IV 31, neutral nature, and HP 255 plus main-offense 255 EVs. Candidate moves are the explicit proposals above; opponents use the existing factory. There are no player items, beads, boss phases, unlimited PP, or stat multipliers. This is one-on-one with no team switching. Eleven distinct ordinary candidate builds plus a separate trained Rei scenario produce 432 duels. All finished before the 80-turn limit.

| Scenario | Wins / 36 | Losses / 36 |
|---|---:|---:|
| 70 雷伊 — no permanent training profile | 13 | 23 |
| 261 盖亚 — no permanent training profile | 22 | 14 |
| 421 厄尔塞拉 — no permanent training profile | 22 | 14 |
| 468 罗德利斯 — no permanent training profile | 18 | 18 |
| 774 亚兰洛 — no permanent training profile | 27 | 9 |
| 798 卡修斯 — no permanent training profile | 19 | 17 |
| 865 托鲁克 — no permanent training profile | 28 | 8 |
| 875 布莱克 — no permanent training profile | 20 | 16 |
| 927 迪诺恩 — no permanent training profile | 25 | 11 |
| 1260 纳扎 — no permanent training profile | 25 | 11 |
| 1477 弗希斯 — no permanent training profile | 20 | 16 |
| 70 雷伊 — permanent training profile | 24 | 12 |

**These results do not measure the authored six-member teams.** Benchmark Rei uses HP 255 / Attack 255 EVs. Its trained final stats are 406 / 335 / 206 / 248 / 210 / 266. Both authored trained teams instead use Attack 255 / Speed 255, giving 343 / 335 / 206 / 248 / 210 / 329 with the same training profile. The benchmark therefore tests a bulkier, slower Rei than the actual trained core. The “ordinary” Rei scenario still uses legal reward moves; it omits only the permanent ability-training additions.

Benchmark Gaia uses HP 255 / Attack 255 and **neither training passive**. Its 22 wins cannot be presented as the result of the authored healing-seal or fixed-damage-seal build. The core uses the same EV distribution plus the healing seal; the fast-pressure team uses Attack 255 / Speed 255 plus the fixed-damage seal.

This small panel checks that the intended ordinary mechanics can compete at all; it does not prove general superiority, a tier order, or 6v6 synergy. Results depend on the panel, typing, chosen EVs, legal four-move tradeoffs, and the existing AI. Script utility ignored by the AI can depress results even when its runtime implementation works. Identical Toruk variants are simulated once. No candidate or opponent result uses a multi-hit move.

## Multi-hit uncertainty kept separate

Across the 1,376-species sub-600 population, 487 species have at least one naturally learned `multi_hit` move. Of these, 143 have at least one such move whose displayed power times mean hit count exceeds 200. This is an audit bucket, not evidence that all 143 are broken or strong: some multi-hit descriptions may be intentional.

The engine currently applies the displayed move power separately to each hit. The parallel [source audit](skill-atknum-audit-v45.md) establishes that the documented blanket conversion of group-fight `AtkNum` metadata into single-target hit counts is erroneous. Retained records such as 10175 (displayed power 120, five hits) and 10961 (power 100, three hits) need source-mapping correction; the 94 fixed-count records without effect 31 remain a bounded suspect set rather than 94 individually proven errors. A large simulated win rate driven by those mappings would not justify elite admission. This task neither changes those mappings nor uses such moves in its proposed builds or benchmark.

## Evidence and reproduction

- `src/progression/battle-facilities.ts:20`: pool filtering; `:46`: ordinary factory; `:74`: current elite threshold.
- `src/progression/trainer-skills.ts`: exact-species natural/reward legality.
- `data/npc-training-profiles.json`, `src/progression/npc-training.ts`, and `src/mechanics/npc-training.ts`: explicit permanent training/passive boundary.
- `battle/core/src/tactics.ts:1`, `:110`, and `:251`: read-only direct-effect heuristics and absent script utility.
- `battle/core/src/scripts/seer-main.ts:257`: maximum-HP percentage damage.
- `battle/core/src/scripts/seer-tail.ts:150` and `:358`: shared team critical charges and delayed knockout.
- `battle/core/src/battle.ts:650`: per-hit damage loop.
- `data/gamedata.json` and `data/monsters/<id>.json`: source species stats and learnsets; `data/skills.json`: exact move definitions. Runtime catalog species and skills were checked against those source definitions.
- `tools/verification/elite-sub600-audit.mjs`: reproducible full scan, factory comparison, legality assertions, frozen panel, per-seed moves/results, and catalog immutability assertion.

Run from the repository root:

```sh
node tools/verification/elite-sub600-audit.mjs
```

The ignored generated reports are `artifacts/elite-sub600-audit/catalog-scan.json` and `artifacts/elite-sub600-audit/benchmark.json`. They include the full 1,376-species scan, all 10 authored rosters, exact proposed/default move effects, source hashes, opponent builds, and per-seed move traces. Ten watched source files were unchanged during the completed audit, and the loaded catalog remained byte-for-byte equal when serialized. The audit creates verification reports only; it does not change the elite pool, production definitions, player saves, or training profiles.
