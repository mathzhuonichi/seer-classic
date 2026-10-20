# Peak Duel roster, loadouts and tactical behavior

The original-Boss self-KO exclusion described below was superseded by V47. Contemporary encounter evidence confirms Tower 61's original sacrifice move, which is restored without the V46 replacement policy. See [the V47 source review](boss-loadout-fidelity-v47.md) and [the V47 integration record](combat-fidelity-v47.md) for the current behavior and verification.

Revision 46 renames the former raw-BST facility to **巅峰对决 (Peak Duel)** while keeping its stable ID `elite`. The currently implemented pool contains **124 species**: the original 103 collectible species with raw BST at least 600, plus the 21 entries below. Bafro (177) and Brook (110) are excluded as requested. Each match still samples six distinct species uniformly without replacement; an inheritance donor and a particular recipient are not forced into the same team.

The user has separately requested engraving research from Claude. Engraving-dependent roles remain part of the design scope. The three retained candidate plans and their dependencies are recorded in [the source review](classic-pvp-sources-v46.md). Their pending implementation is not a judgment that they lack competitive value. No new engraving effects or parameters are invented in this revision.

## Implemented additional loadouts

Every entry uses level 100, IV 31 and a neutral nature. Move IDs appear beside their exact catalog labels. All moves are exact-species natural moves except Rei's already source-checked task rewards. The data source is `data/elite-roster.json`.

| Species | Raw BST | Learning values | Four moves | Tactical purpose |
| --- | ---: | --- | --- | --- |
| 70 雷伊 | 532 | Attack 255 / Speed 255 | 雷神天明闪 (10825); 雷神觉醒 (20364); 极光刃 (10823); 风驰电掣 (10166) | Exact-species reward moves: attack/speed +2, priority +2, clear boosts; permanent training is a separate NPC profile. |
| 261 盖亚 | 590 | Attack 255 / Speed 255 | 石破天惊 (10715); 返璞归真 (20312); 破元闪 (10710); 神经修复 (20309) | Attack 119, speed 105; attack/accuracy +2, 150-power boost removal, priority, healing; optional single seal is separate. |
| 421 厄尔塞拉 | 581 | Sp. Attack 255 / Speed 255 | 奇幻光芒 (11140); 光芒附体 (20564); 金光闪烁 (10632); 瞬闪 (11135) | Special attack 112, speed 103; five-stat setup and direct removal of opposing boosts. |
| 468 罗德利斯 | 576 | Sp. Attack 255 / Speed 255 | 天火凤凰 (11224); 幻化之火 (20486); 火之意志 (20488); 音速火拳 (11017) | Special attack 114, speed 108; 90-accuracy sleep plus special attack +2 and a 150-power finisher. |
| 774 亚兰洛 | 581 | Sp. Attack 255 / Speed 255 | 烈火精灵 (11884); 幻化之火 (20486); 战火复燃 (20957); 暗算 (10981) | HP 123, special attack 113, speed 102; sleep and special attack/accuracy +2. |
| 798 卡修斯 | 592 | Attack 255 / Speed 255 | 量子绝灭波 (11925); 连山绝壑 (20982); 乾坤反转 (11924); 快攻 (10223) | Attack 118, speed 101; sure-hit 150 power, offense/speed setup, priority and source-pinned theft of useful opposing boosts. |
| 865 托鲁克 | 597 | Attack 255 / Speed 255 | 飓风利袭 (12079); 坚硬体格 (21070); 速度神爪 (12080); 快击 (10060) | Speed 115; attack +2 and both defenses +1, priority +2, boost removal; scripted blind-wind utility requires separate AI work. |
| 875 布莱克 | 597 | Attack 255 / Speed 255 | 双重暗影 (12112); 暗夜守护 (21090); 夜魔之球 (11919); 邪灵击 (12110) | Attack 117, speed 102; five-stat setup, 130-power boost removal, 85-power priority. |
| 927 迪诺恩 | 595 | Attack 255 / Speed 255 | 无尽之火 (12217); 凌厉 (20114); 燃烧瞬袭 (12216); 浴火重生 (20116) | Attack/speed +2, priority, full heal with self-fatigue cost; slower initial speed 91. |
| 1260 纳扎 | 598 | Attack 255 / Speed 255 | 无极燎原枪 (12937); 幻化之火 (20486); 青鸾火凤 (21533); 念火突刺 (12934) | Attack 119, speed 105; sleep, attack/speed setup and 75-power priority. |
| 1447 金翅托鲁克 | 597 | Attack 255 / Speed 255 | 飓风利袭 (12079); 坚硬体格 (21070); 速度神爪 (12080); 快击 (10060) | The catalog base stats, types and learnset equal species 865; separate identity, same battle build. |
| 1477 弗希斯 | 598 | Sp. Attack 255 / Speed 255 | 残影叶刃闪 (13423); 自然之怒 (21817); 幽暗魔花 (13422); 瞬域影杀 (13421) | Special attack 116, speed 103; special attack +2, 75-power special priority and boost removal; full heal is an alternative fifth move. |
| 359 布林克克 | 592 | Attack 255 / HP 255 | 海洋之心 (20143); 混沌潮汐 (10882); 海妖之力 (20397); 闪光一击 (10321) | Sea Heart percent-HP support paired with aligned physical STAB, attack setup and priority. |
| 356 斯加尔卡 | 575 | Attack 255 / HP 255 | 电闪光华阵 (20398); 蓄能炸弹 (10876); 虚体闪电 (10874); 迅雷击 (10289) | Team critical support with a strong physical finisher, psychic coverage and electric priority; the AI requires a useful living reserve before sacrificing. |
| 755 斯普林特 | 590 | Sp. Attack 255 / Speed 255 | 灵魂寄托 (20932); 紫雾霜冻 (11841); 黑暗能量 (20931); 黑暗突击 (11837) | Team critical support paired with dual-type special offense, special-attack setup and special priority; the AI requires a useful living reserve before sacrificing. |
| 599 吉米丽娅 | 575 | HP 255 / Speed 255 | 传承 (20749); 星火爆 (11508); 火焰掌控 (20750); 火之意志 (20488) | Skill 20749 sacrifices the owner and gives the next entrant speed and accuracy +1 each (effect 59 parameters 4 and 5). It does not copy current stages. HP/speed investment prioritizes surviving and completing the handoff. Fire attack with its fixed 50 damage, special-attack setup and defensive/speed setup remain alternatives while it stays active. |
| 587 墨杜萨 | 579 | HP 255 / Sp. Attack 255 | 石化之视 (20731); 石肤 (20730); 墨杜萨之力 (20732); 决然一击 (11470) | A period inheritance recipient: petrification, dual-defense setup, special-attack setup, and a neutral special attack. The four-move plan is usable without the support donor as well. |
| 990 埃尔米格 | 585 | HP 255 / Sp. Attack 255 | 蛋黄派 (12355); 天降之水 (11293); 补充营养 (21224); 流星蛋雨 (12358) | Period priority boost-removal role. Authored legal build combines priority clearing, stronger reliable clearing, special-attack/accuracy setup and a water finisher. |
| 826 加布 | 591 | HP 255 / Sp. Attack 255 | 高昂龙吼 (11994); 龙之保护 (21020); 精神强化 (20538); 魔龙冲天 (11996) | Period priority boost-removal role. Authored legal build combines priority clearing, status immunity, special-attack setup and a dragon finisher. |
| 691 泰勒斯 | 574 | Attack 255 / Speed 255 | 能量解析 (11690); 闪光一击 (10321); 清除术 (20185); 破空裂击 (11691) | Period common lead and physical core. Authored legal build combines 150 fixed damage, priority, removal of opposing boosts and an aligned physical finisher. |
| 432 杰西卡 | 590 | HP 255 / Attack 255 | 穿透打击 (11165); 光速刺拳 (11078); 怒发冲冠 (20535); 霸王冲锋拳 (11081) | Period attack/HP set: flat-damage pressure, genuine effect-31 three-to-five-hit priority, attack setup and a fighting finisher. Skill 11078 has independent source multi-hit evidence and is not an inferred AtkNum-only operation. |

Rei receives the existing full ability-training profile: HP 343, Attack 335, Defense 206, Sp. Attack 248, Sp. Defense 210 and Speed 329 for this build. Its raw base total stays 532 and its supported level-100 neutral equivalent is 612. Gaia equips only the evil seal, adding the existing 30-point follow-up to qualifying attacks. These profiles apply to the selected high-difficulty opponents, not original bosses or ordinary random opponents.

Jimi's HP/Speed investment gives HP 420, Sp. Attack 272 and Speed 301. Its previous HP/Sp. Attack alternative would have Sp. Attack 335 and Speed 238. The speed investment prioritizes completing inheritance; the fixed 50-point component of its attack remains available. This is an authored build choice, not a historical server-stat claim.

## AI contract

The planner uses its own team plus public opponent information and observed moves. It must not inspect the opposing pending action, hidden move list, effort values or reserve builds. Planning must not run live effect scripts, mutate the battle, or consume extra RNG draws.

Inheritance is the retained effect 59 with parameters 4 and 5: the donor spends all HP and the next entrant gains exactly Speed +1 and Accuracy +1. It does not copy the donor's existing stages. The planner compares useful recipients, values accuracy-dependent control and speed thresholds, and selects a recipient using the projected benefit and matchup. There is no hard-coded Rodlis pairing. The donor's remaining HP is a cost; useful ordinary attacks and a secure direct KO can remain preferable.

The two critical-support sacrifices share two critical attacks across the receiving team. No donation is chosen when the donor is the last living member, no useful recipient remains, or an earlier gift is pending. If those unusable gifts are the only moves with PP, a smart trainer receives a legal Struggle fallback. Player-selected skills and non-smart scripted Boss choices retain their normal interfaces.

Sea Heart is valued as one quarter of the opponent's publicly modeled maximum HP, including percent-damage immunity and direct-KO alternatives. Other targeted estimates cover Cassius's boost theft, Gabu's immunity against observed control, and Gaia's active evil-seal follow-up. These are bounded deterministic heuristics, not a multi-turn minimax solver or a claim of historical trainer AI.

## Boss policy and source-data boundary

At the controller's encounter entry, non-trainer Boss loadouts remove literal all-HP sacrifice skills, including a miss-triggered self-KO. Skill definitions stay available for player and trainer battles. Partial recoil and partial-HP costs are not automatically classified as self-destruction.

Scanning all 180 existing Boss definitions finds one affected encounter: Tower 61's Chaloyan (270). Its all-HP transfer `眼球的掌控` (20330) becomes its naturally learned dual-offense debuff `失神之视` (20328), including the matching AI entry. The three-member team, HP 1150, phases and rewards stay intact. Existing Sgalka/Sprint bosses and all Puni seals/lives are unchanged.

Elite automatic loadouts omit unsupported fixed multi-hit imports identified by the earlier AtkNum audit. This changes five of the original 103 species' four-move selections, without changing their membership or ordinary stats. Genuine effect-31 multi-hit moves remain legal, including Jessica's three-to-five-hit priority. The broader skill-data import issue is not globally repaired here; ordinary random loadouts remain unchanged. The 2026-10-19 catalog repair removed those imports, and the exclusion with them ([AtkNum audit](skill-atknum-audit-v45.md)).

## Verification

The final checks pass:

- Elite roster: 29 checks covering the exact 103 + 21 union, exclusions, all 124 initialized builds, training profiles, four legal slots, source-backed multi-hit and seeded sampling.
- Boss and support: 17 checks, including all 180 original encounters, actual Tower 61 controller entry, six-member sacrifice/recipient witnesses, last-member guards and legal fallback behavior.
- Added tactical estimates: 11 checks for actual boost theft, observed-control immunity, burning/poisoned users, PP, existing protection, Gaia's priority KO with the fixed follow-up, immunity and damage-reduction counterexamples.
- Full six-versus-six battles: all 21 additions lead one complete battle against a seeded sampled elite team. All finish in 9-23 turns, without warnings, invalid HP/PP/stages or source mutation. This is a liveness and integration check, not a win-rate or balance claim.
- Existing facilities: 35 checks; NPC training: 24 checks; classic teams: 26 checks; battle AI: 39 checks and 120 trainer scenarios. The final changed AI also passes an independent review with hidden-data access and live calculation callbacks replaced by throwing getters/functions.
- TypeScript and whitespace checks pass. No production build, package or remote push is part of this revision.

The actual interface was inspected on the isolated port-1437 origin. The station exit, room, selected facility tab, description and **124** candidate count display the new identity. The browser recorded no warnings or errors. The user's existing port-1432 server also serves the updated facility module; its browser save was not used by these fixtures. The temporary validation tab and server were closed afterward.

Generated evidence is under `artifacts/elite-roster-v46/` (`regression.json`, `full-battles.json`, `complete-roster.csv`, `facility-browser.png`), `artifacts/boss-and-support-v46/regression.json`, and `artifacts/elite-tactics-v46/regression.json`. The CSV exports every admitted species, the exact current four moves, learning values, training profile and selection basis from the runtime factory.
