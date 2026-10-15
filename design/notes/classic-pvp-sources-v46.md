# Classic PvP sources and the V46 elite additions

This bounded review supports five additions beyond the first sixteen approved elite-only additions: Medusa (587), Elmig (990), Gabu (826), Thales (691), and Jessica (432). It checks contemporary player descriptions against the retained catalog and natural learnsets. It is not a complete historical usage ranking, an exact reconstruction of one season, or a claim that every modern imported datum existed unchanged in 2011.

The current implementation baseline is 103 original collectible species with raw BST at least 600, plus 16 previously selected additions, plus these five: **124 species**. The user subsequently requested engraving support; engraving-dependent historical candidates remain under consideration as that material is integrated. This count is not a final cap on that follow-up. Bafro (177) and Brook (110) remain explicitly excluded. Species 599 is the catalog's `吉米丽娅`; historical articles also write its name as `吉米利亚`.

## Contemporary sources

These are original player accounts published during the target period. They are primary evidence of the authors' play and contemporary role descriptions, not official server specifications or measured population statistics.

| Ref | Date and original author | Source | Relevant evidence |
| --- | --- | --- | --- |
| S1 | 2011-03-03, 小玩家 | [Inheritance tactics](https://news.7k7k.com/content/20110303/66457.html) | Describes the sacrifice support's speed/accuracy transfer, names Medusa as a leading recipient, lists its four moves, and expressly discusses the transfer into Rodlis. Also mentions Gaiyin as another possible recipient. |
| S2 | 2011-03-17, 4399冥 | [Tactics I](https://news.4399.com/seer/jingyanxinde/201103-17-89571.html) | Describes inheritance as common and Jessica as a fighting lead against Puni. The stated match odds are this author's opinion, not a dataset used here. |
| S3 | Page dated 2012-01-10, original author Messy | [Peak Battle season-four tactics](https://news.7k7k.com/51seer/dfzs/2012/0110/112055.html) | Lists Thales and Jessica among common physical cores; describes Thales/Gaia leads and priority clearing by Gabu. Explicitly says the self-destruct fatigue effect requires an engraving. Its introductory boilerplate also says August 24, so the exact original writing date is uncertain. |
| S4 | 2012-10-10, 吴明示 | [Peak Battle tactics collection](https://news.4399.com/seer/jingyanxinde/201210-10-202521.html) | Describes Thales leads and clearing roles for Gabu and Elmig's Egg-Yolk Pie. Explains why retaining a normal-priority clearing option can matter alongside priority clearing. Includes the author's battle screenshots. |
| S5 | 2012-11-06, 泪眼 | [Self-destruct teams](https://news.4399.com/seer/jingyanxinde/201211-06-210703.html) | Identifies Stel's priority self-destruct followed by setup recipients, expressly requiring an engraving for fatigue; includes Grano among associated choices and counters. |
| S6 | 2011-05-16, 星痕 | [Jessica analysis](https://news.4399.com/seer/jingyanxinde/201105-16-96748.html) | Explicitly describes Light-Speed Punch as a priority attack hitting three to five times. Gives separate HP/attack and speed-oriented four-move sets. |

The accepted 599-to-Rodlis concept is therefore supported directly by S1 rather than inferred merely from its modern skill description. The source also warns that some recipients need accuracy or defensive preparation. In particular, Medusa's petrification is not guaranteed after inheritance. A team sampled uniformly without replacement does not guarantee any particular pair will appear together.

## Five catalog mappings and legal move options

All listed moves occur in the exact species' natural level 1-100 learnset. This table matches the five implemented additions in `data/elite-roster.json`, including slot order. The Medusa set follows S1 directly, and the Jessica set follows S6 directly. The other selected sets are local, legal reconstructions of the cited roles; the sources do not specify every one of their four slots.

| Species | Raw BST | Contemporary role | Four legal moves and IDs |
| --- | ---: | --- | --- |
| 587 `墨杜萨` / Medusa | 579 | Inheritance recipient, defense setup and control (S1) | `石化之视` 20731; `石肤` 20730; `墨杜萨之力` 20732; `决然一击` 11470 |
| 990 `埃尔米格` / Elmig | 585 | Water special attacker with priority clearing (S4) | `蛋黄派` 12355; `天降之水` 11293; `补充营养` 21224; `流星蛋雨` 12358 |
| 826 `加布` / Gabu | 591 | Priority clearing and special offense (S3, S4) | `高昂龙吼` 11994; `龙之保护` 21020; `精神强化` 20538; `魔龙冲天` 11996 |
| 691 `泰勒斯` / Thales | 574 | Physical lead and priority pressure (S3, S4) | `能量解析` 11690; `闪光一击` 10321; `清除术` 20185; `破空裂击` 11691 |
| 432 `杰西卡` / Jessica | 590 | Fighting lead and priority finisher (S2, S3, S6) | `穿透打击` 11165; `光速刺拳` 11078; `怒发冲冠` 20535; `霸王冲锋拳` 11081 |

S6 also supplies a different speed-oriented Jessica set. The implemented set above instead selects its HP/attack approach, retaining the verified priority move and fixed-damage coverage.

Relevant retained mechanics:

- Medusa's 20730 raises both defenses by two stages; 20732 raises special attack by two; 20731 has 60 base accuracy and applies petrification on a hit. S1 itself warns about misses. The finisher's occasional 80 fixed damage is supplementary.
- Elmig's 12355 has priority +1 and clears positive foe stages; 11293 is a normal-priority clearing attack. Its setup raises special attack by two and accuracy by one.
- Gabu's 11994 has priority +1 and clears positive foe stages; 21020 grants temporary status immunity. The selected set omits 11907 `目空一切`, which retains a suspect fixed `multi_hit` import. Its occasional fatigue is incidental to this recommendation; the current description and stored duration have different turn-count wording.
- Thales's 10321 has priority +2; 11690 supplies 150 fixed damage and 20185 clears positive foe stages. These attack and clearing options are temporary battle actions, not permanent training bonuses.
- Jessica's 11078 is a **genuine multi-hit move**: the retained source effect is `31 [3,5]`, matching the lowered `multi_hit` operation and S6's independent historical description. It is not one of the 94 unsupported fixed-hit imports documented in [the AtkNum audit](skill-atknum-audit-v45.md). Its 20 power is per hit. Jessica's 11084 `开天辟地` is excluded from this set; do not use that suspect fixed four-hit import as a substitute.

The chosen exact Jessica exception must stay narrow: admitting verified 11078 does not make all imported `multi_hit` records safe. Existing facility sampling and slot-order rules still determine whether a support and its recipient actually meet in one team.

## Retained candidates and integration dependencies

| Species | Evidence | Required integration or review |
| --- | --- | --- |
| 832 `斯特尔` / Stel | S3 and S5 directly describe the historical self-destruct role. | Retained as an engraving-dependent candidate. Current 12009 uses `seer_eff_112`: 250-300 fixed damage, an opponent survival cap, and self-KO. Its missing engraving fatigue is an integration requirement, not a reason to exclude the historical role. The user's requested engraving work and the parallel source collection determine the final implementation. |
| 450 `格拉诺` / Grano | S4 and S5 list it in the self-destruct/counter environment. | Retained with its male priority role. Its signature 20472 `心灵能量` depends on gender; current `seer_eff_83` is explicitly `NOOP` in `battle/core/src/scripts/seer-tail.ts`. Gender and engraving-dependent improvements are integration dependencies, not grounds to remove the candidate. |
| 475 `该隐` / Gaiyin | S1 names it as another inheritance recipient. | Retained as a control and physical-evasion candidate. The physical-evasion script exists; its AI must value known physical threats separately from special and fixed damage before the proposed role is considered operational. |

## Candidate design appendix

The three following sets are approved design proposals, not implemented roster entries or tested AI policies. Every move is naturally legal for the exact species at level 100. The EV spreads are authored starting points, not claims of historical optimality. Use level 100, IV 31, neutral Hardy nature, and the stated two 255-point EV investments. Keep all three candidates in the review list while the parallel engraving research is pending; do not infer missing engraving parameters or silently discard their historical value.

| Candidate | EVs | Proposed four moves | Intended use |
| --- | --- | --- | --- |
| 832 Stel | HP 255, Attack 255 | 12009 `暗影自爆`; 12007 `暗尾刺`; 10008 `电光火石`; 21030 `黑暗入袭` | A reserve that disrupts an opposing setup attacker and prepares a living teammate's response. |
| 450 Grano | Special Attack 255, Speed 255 | 20472 `心灵能量`; 20248 `寒冬能量`; 11198 `暗影冰锥`; 11200 `死亡霜冻` | Male priority setup followed by strong special attacks, including the acted-first bonus. |
| 475 Gaiyin | HP 255, Special Attack 255 | 20499 `灵魂干涉`; 20484 `暗影护盾`; 20593 `暗影之力`; 11244 `暗黑地域` | Control and a physical shield create a safe setup window; it can also receive inheritance. |

**Stel: separate the unengraved and engraved roles.** The retained base 12009 currently performs priority +2 fixed damage of 250-300, caps the foe at at least one HP, and sacrifices the user. That is a base-runtime description, not a fatigue effect. Base-policy scoring can value damage and bringing in a living replacement; it must never invent a control window or treat the move as a direct KO. Prefer an available ordinary KO over unnecessary sacrifice, and avoid sacrifice with no living replacement. The HP/attack spread preserves ordinary physical attacks when sacrifice is wasteful; setup is considered only when survival and a meaningful follow-up justify it.

With the historical fatigue engraving, the intended additional benefit is a control window for a teammate. S3 and S5 attest that dependency. AI should then require an eligible target and a useful surviving recipient, compare the recipient's expected setup or KO with continuing to attack, and discount a window that already exists. It must inspect public battle state and permitted opponent information rather than read a hidden pending choice. Exact engraving identity, applicability, hit/miss behavior, status duration convention, immunity interactions, and whether any base behavior changes await the parallel source collection. The 2012 sources use differing shorthand for the base role, so these parameters must not be guessed from one tactical paragraph.

**Grano: preserve the male role and the engraving option.** A [2010-08-31 period discussion](https://m.news.4399.com/seer/jingyanxinde/201008-31-76399.html) explicitly identifies Grano as male and distinguishes the male next-two-turn priority effect from the female critical effect. [S4, page 3](https://news.4399.com/seer/jingyanxinde/201210-10-202521_3.html) describes its priority counter role; [S5, page 2](https://news.4399.com/seer/jingyanxinde/201211-06-210703_2.html) explicitly adds an engraving-enhanced Ice Spike variant. The base catalog's 11198 is 90 power, doubled when acting first; do not silently replace that with the guide's engraved 200-power shorthand.

The design requires usable gender information and a working 20472 effect. AI should not refresh an active priority window without a reason; use the short window to attack, and only spend a turn boosting special attack when the opponent cannot exploit it. Choose between 11198 and 11200 from expected action order, typing, accuracy, and damage, not from fixed move order. The exact priority rank, expiration timing, and engraving modification remain source-dependent. Current effect 83 being a no-op means this role is not yet operational; it does not invalidate Grano as a historical candidate.

**Gaiyin: make shield selection conditional.** The retained 20484 script creates temporary physical evasion, while 20499 has only 70 base accuracy. Give the shield value against known or revealed physical threats when the user can survive long enough to act. Its current gate checks the incoming skill's physical category before the hit: that can also stop fixed damage carried by a physical-category skill, but does not imply protection against special attacks or independent fixed-damage sources. Score the actual move category and damage path; do not refresh a shield that already covers the useful window. Account for accuracy, current status, and immunity before choosing control; boost special attack only when control or the physical matchup provides room. Inheritance may improve the opportunity but is not guaranteed by uniform team sampling. This design does not assume an engraving accuracy increase. Shield behavior exists, but the proposed AI decisions and their interactions still require implementation and focused validation.

## Local verification and limits

A read-only catalog assertion checked the twenty implemented move slots and twelve proposed candidate slots: every slot is naturally learned by its exact species at level 1-100, each four-move set has four unique IDs, and the only selected `multi_hit` operation is the independently corroborated Jessica 11078. Raw BST values above were recomputed from the six stored base stats. A separate runtime review instantiated every member of the current 124-species elite pool with legal four-move sets, confirmed all 103 previous high-BST species remain, verified both explicit exclusions, and exercised selection of the last pool index 123 (species 1499). Its six sampling bounds were `[0,123]` through `[5,123]`; the input catalog was unchanged. These are current-baseline checks, not validation of the three proposed AI policies. The reviewed source data fingerprints are:

| File | SHA-256 |
| --- | --- |
| `data/gamedata.json` | `9bfeeaeab685a30d6f6c337f2d691942bec698e6018cf563541985301ec40865` |
| `data/skills.json` | `59d08e47696c79ba6eedc96d9339f1e674adad904856092ff206b82dbfc4f2a2` |

This note does not independently certify final roster serialization, AI strength, encounter count, or every battle mechanic. Those require the final implementation checks. Engraving effects must be included in the historical evaluation and subsequent implementation scope. No production data or code was changed by this source review.
