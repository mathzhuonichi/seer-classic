# Classic trainer roster redesign (v38)

The ten six-member teams replace the three mixed v37 rosters. The existing trainer IDs remain stable, but their foundation compositions are intentionally simpler. The default trained core brings original-form Rei, Gaia, and Hamoray together; it does not substitute their later evolved forms.

These are authored remake teams using the retained catalog, not recovered historical player teams. Group labels identify provenance and tactical roles rather than a proven difficulty ladder. The catalog originates from Nattsu39/seer_data H5 commit a00bcdd, so base stats can contain later revisions; this change does not claim exact 2009–2012 numerical balance.

## Fair encounter rules

- Every member is level 100, IV 31, neutral Hardy nature, total EV 510, and exactly four distinct equipped moves.
- HP, stats, PP, status effects, and damage use the same ordinary creature rules as the player.
- No boss phases, seals, immunities, extra lives, stat multipliers, or collection rewards are copied into these encounters.
- Only original-form Rei uses non-level training-reward moves. All other moves occur in the actual species learnset at an integer level from 1 through 100.
- Gaia and Hamoray use their natural signature setup moves. This does not add unverified training-stat bonuses.
- Each team has six distinct actual species. Shiny members are actual shiny species, separate from the appearance-only skin system.

## Original-form training provenance

| Species | Equipped special reward | Source |
| --- | --- | --- |
| 70 | 10825 | `data/bosses/boss_rei_training5.json` |
| 70 | 20364 | `data/bosses/boss_rei_training4.json` |
| 70 | 10823 | `data/bosses/boss_rei_training1.json` |

Rei also carries natural priority move 10166. Gaia uses 20312 for physical setup and 20309 for recovery; Hamoray uses 20269 for all-stat setup. Those three original forms retain their original species IDs 70, 261, and 216.

## Team roles and counterplay

### `trainer_offense` (foundation, order 1)

Early starters plus flying, electric, and psychic coverage; physical and special damage coexist. Slow grass/electric pivots and few direct recovery points can be pressured.

| Species ID | EV allocation | Equipped skill IDs | Tactical role |
| --- | --- | --- | --- |
| 3 | hp 255, atk 255 | 10003, 10014, 20008, 20009 | Slow physical setup, grass and ground coverage, and recovery |
| 6 | hp 255, spa 255 | 10027, 10024, 10023, 20011 | Bulky special water offense, priority, and physical defense setup |
| 9 | atk 255, spe 255 | 10030, 10031, 10033, 20014 | Fast physical fire setup and priority finishing |
| 12 | atk 255, spe 255 | 10039, 10033, 10008, 20017 | Fast flying physical pressure with speed setup and recoil risk |
| 15 | hp 255, atk 255 | 10041, 10015, 20018, 20011 | Bulky electric physical attacker with speed control |
| 79 | spa 255, spe 255 | 10222, 10221, 20101, 10193 | Psychic special setup with a safe attack beside a defense-lowering finisher |

### `trainer_control` (foundation, order 2)

Burn, poison, offense reduction, and boost removal create windows for special attackers. Status immunity and special bulk limit its largely special offense.

| Species ID | EV allocation | Equipped skill IDs | Tactical role |
| --- | --- | --- | --- |
| 42 | hp 255, spe 255 | 20048, 20049, 10102, 20050 | Burn and offensive debuffs with status protection |
| 67 | hp 255, spa 255 | 10156, 10151, 20080, 20081 | Ice boost removal with offensive and defensive setup |
| 24 | hp 255, spe 255 | 10056, 20027, 20026, 20016 | Physical suppression, speed control, and recovery |
| 85 | hp 255, spa 255 | 20020, 20110, 10237, 10241 | Poison, recovery, and grass special boost removal |
| 93 | spa 255, spe 255 | 10271, 10284, 20121, 10129 | Electric special setup, boost removal, and emergency priority |
| 110 | hp 255, spa 255 | 10326, 10321, 20142, 20125 | Water special setup and opposing special attack suppression |

### `trainer_attrition` (foundation, order 3)

Leech and finite recovery support defensive setup and counterattacks. Low speed and dependence on setup leave openings for burst damage and boost removal.

| Species ID | EV allocation | Equipped skill IDs | Tactical role |
| --- | --- | --- | --- |
| 3 | hp 255, def 255 | 20007, 20009, 10003, 10014 | Physical defensive pivot with leech, recovery, and ground coverage |
| 32 | hp 255, spd 255 | 10027, 20036, 20037, 10069 | Protection, special setup, and self-debuff clearing |
| 88 | hp 255, def 255 | 20078, 20112, 10247, 10224 | Defensive ground pivot with recovery and speed pressure |
| 177 | hp 255, atk 255 | 20027, 20026, 10502, 10008 | Flying physical recovery pivot with attack suppression and priority |
| 52 | hp 255, atk 255 | 10215, 10046, 20063, 20064 | Ice physical counter with opposing special attack reduction |
| 61 | hp 255, spa 255 | 10140, 10105, 20074, 20072 | Mechanical special setup, electric coverage, and speed control |

### `trainer_trained_core` (trained, order 1)

Three original trained heroes share a team with the fusion starter trio for water, grass, and fire coverage. Removing boosts and isolating recovery users prevents repeated setup.

| Species ID | EV allocation | Equipped skill IDs | Tactical role |
| --- | --- | --- | --- |
| 70 | atk 255, spe 255 | 10825, 20364, 10823, 10166 | Reward-trained original-form electric setup, boost removal, and priority finishing |
| 261 | hp 255, atk 255 | 10715, 10710, 20312, 20309 | Physical setup, opposing boost removal, and recovery |
| 216 | hp 255, atk 255 | 10618, 20269, 10617, 10622 | Original-form all-stat setup and reliable dragon pressure |
| 303 | hp 255, spa 255 | 20007, 20009, 11071, 11006 | Leech, direct healing, draining damage, and opposing boost removal |
| 306 | hp 255, atk 255 | 11014, 20010, 11013, 11008 | Physical water setup, dragon coverage, and priority |
| 309 | atk 255, spe 255 | 11021, 11017, 20509, 10033 | Physical setup, fire priority, and neutral coverage without one-hit KO moves |

### `trainer_fast_pressure` (trained, order 2)

Speed investment, multiple priority moves, and boost removal support rapid physical pressure. Heavy physical bias and limited recovery make burns and physical walls useful.

| Species ID | EV allocation | Equipped skill IDs | Tactical role |
| --- | --- | --- | --- |
| 70 | atk 255, spe 255 | 10825, 20364, 10823, 10166 | Reward-trained original-form electric setup, boost removal, and priority finishing |
| 261 | atk 255, spe 255 | 10715, 10710, 20312, 20309 | Physical setup, opposing boost removal, and recovery |
| 798 | atk 255, spe 255 | 11925, 11926, 20982, 10223 | Ground-shadow physical offense, speed setup, boost removal, and priority |
| 875 | atk 255, spe 255 | 12112, 11919, 12110, 21090 | Shadow physical pressure, all-stat setup, priority, and boost removal |
| 865 | atk 255, spe 255 | 12079, 10060, 12080, 21070 | Fast flying physical offense, priority, boost removal, and defensive setup |
| 309 | atk 255, spe 255 | 11021, 11017, 20509, 10033 | Physical setup, fire priority, and neutral coverage without one-hit KO moves |

### `trainer_resilient_counter` (trained, order 3)

HP investment, offense reduction, recovery, and speed control prepare bulky attackers. Several members lack direct recovery; sustained special and type pressure can separate the defensive core.

| Species ID | EV allocation | Equipped skill IDs | Tactical role |
| --- | --- | --- | --- |
| 216 | hp 255, atk 255 | 10618, 20269, 10617, 10622 | Original-form all-stat setup and reliable dragon pressure |
| 303 | hp 255, def 255 | 20007, 20009, 11071, 11006 | Leech, direct healing, draining damage, and opposing boost removal |
| 306 | hp 255, atk 255 | 11014, 20011, 11013, 11008 | Physical water attacker with defense setup and priority |
| 318 | hp 255, atk 255 | 11038, 20514, 20513, 20066 | Ground physical counter with attack and speed reduction |
| 429 | hp 255, spa 255 | 11160, 11159, 20092, 20144 | Physical mitigation, offensive debuffs, and opposing boost removal |
| 393 | hp 255, atk 255 | 10984, 10982, 10981, 20455 | Bulky fire physical setup, fighting coverage, and priority |

### `trainer_fusion_specialists` (specialist, order 1)

Six confirmed fusion results divide freezing, poison, boost removal, and defensive setup. The special attack bias and status dependence are visible weaknesses.

| Species ID | EV allocation | Equipped skill IDs | Tactical role |
| --- | --- | --- | --- |
| 315 | hp 255, spa 255 | 11033, 11032, 20512, 20049 | Mystic special setup and offensive suppression |
| 321 | hp 255, spa 255 | 11048, 11043, 20027, 20020 | Flying special pressure, recovery, poison, and emergency priority |
| 324 | spa 255, spe 255 | 11054, 11053, 20150, 20519 | Ice special offense, freezing, speed setup, and special priority |
| 340 | hp 255, spa 255 | 10140, 10828, 20073, 20366 | Mechanical special setup, electric coverage, and defensive reinforcement |
| 343 | spa 255, spe 255 | 10836, 10223, 20170, 20368 | Shadow special setup, physical mitigation, and emergency priority |
| 429 | spa 255, spe 255 | 11160, 11159, 20577, 11157 | Fast dual-type special offense and opposing boost removal |

### `trainer_dragon_sanctuary` (specialist, order 2)

A dragon theme combines physical and special offense, priority, debuffs, and recovery. Shared dragon typing concentrates weakness to ice and makes boost removal valuable.

| Species ID | EV allocation | Equipped skill IDs | Tactical role |
| --- | --- | --- | --- |
| 216 | hp 255, atk 255 | 10618, 20269, 10617, 10622 | Original-form all-stat setup and reliable dragon pressure |
| 274 | hp 255, atk 255 | 10760, 10758, 20337, 20338 | Dragon physical priority, full recovery, and all-stat suppression |
| 391 | hp 255, spa 255 | 10979, 10977, 20448, 10761 | Dragon special pressure, fire coverage, and opposing offense suppression |
| 413 | atk 255, spe 255 | 11115, 11114, 20553, 11118 | Dragon physical setup, flying coverage, and boost removal |
| 400 | hp 255, spa 255 | 11090, 11089, 20538, 20537 | Dragon special setup, temporary damage mitigation, and paralysis |
| 626 | atk 255, spe 255 | 11569, 10321, 20718, 11447 | Flying-dragon physical setup, priority, and boost removal |

### `trainer_shining_team` (specialist, order 3)

Actual shiny species cover flying, electric, psychic, ground, grass, and water with mixed offense. Several members need setup or defensive turns before they exert full pressure.

| Species ID | EV allocation | Equipped skill IDs | Tactical role |
| --- | --- | --- | --- |
| 166 | atk 255, spe 255 | 10486, 10033, 10008, 20210 | Flying physical pressure, defensive setup, and priority |
| 286 | hp 255, spa 255 | 10795, 20348, 20024, 20018 | Electric special setup, speed control, and special mitigation |
| 312 | spa 255, spe 255 | 11026, 10193, 20101, 20510 | Psychic special setup, physical mitigation, and emergency priority |
| 411 | hp 255, spa 255 | 11110, 20078, 20550, 20068 | Ground special setup, recovery, and special attack suppression |
| 444 | hp 255, atk 255 | 11181, 20020, 20110, 10236 | Grass physical poison and recovery pivot with priority |
| 1250 | atk 255, spe 255 | 12919, 10185, 20094, 21522 | Water physical pressure, speed setup, priority, and freeze-based debuffs |

### `trainer_legendary` (legendary, order 1)

Retained legendary forms combine mixed types, boost removal, recovery, and powerful ordinary moves. Recovery and control have finite PP; type-specific counters are more reliable than unprotected setup.

| Species ID | EV allocation | Equipped skill IDs | Tactical role |
| --- | --- | --- | --- |
| 300 | hp 255, spa 255 | 10999, 10998, 20607, 20500 | Holy special pressure, boost removal, and finite full recovery |
| 501 | hp 255, atk 255 | 11145, 11144, 20569, 20565 | Mechanical and ground physical setup with opposing offense suppression |
| 502 | hp 255, spa 255 | 11187, 11184, 10622, 20467 | Water-dragon special setup, priority, and reliable dragon coverage |
| 503 | hp 255, atk 255 | 11712, 11711, 20853, 20852 | Electric-fighting physical pressure, draining damage, and speed setup |
| 504 | spa 255, spe 255 | 12095, 12093, 21076, 21078 | Fire-flying special pressure, boost removal, recovery, and broad debuffs |
| 1000 | spa 255, spe 255 | 12264, 12260, 21173, 21172 | Mystic special priority, sleep-based debuffs, and timed regeneration |

## Verification scope

The authoring pass checks all 240 equipped slots against the live retained species learnsets or the exact species-matched training rewards before writing any trainer JSON. Independent runtime tests cover roster structure, move execution, reward isolation, switching, and bounded simulated battles. Simulations demonstrate execution and sampled tactical behavior; they do not certify competitive balance or a universal group strength ordering.

### Browser verification

An isolated localhost origin was exercised through the ordinary world controls.
The classic room opened the trained group and `trainer_trained_core` by default.
All four groups displayed their expected 3/3/3/1 team counts. Selecting Gaia and
Hamoray showed their actual setup and recovery moves; Rei displayed the three
species-matched training reward badges. The six member cards and four move slots
were visible together at the current 1280 by 720 viewport, with a separate fixed
start area and scrollable team detail pane.

Starting the selected team produced the same six original-form members at level
100, with ordinary HP totals. Retreat returned to the classic room. Browser
warning and error logs were empty. The user's separate existing preview origin
and save were not used for these interactions. Screenshots are retained in the
task analysis directory under `browser-v38/` as `trained-core-roster.png` and
`trained-core-battle.png`.

## Focused simulation results

A read-only 90-battle run used the unmodified ten production rosters against three disclosed six-member references, each at seeds 7, 29, and 101. Both sides used the same smart AI with switching enabled. No items, HP edits, action overrides, or trainer stat changes were used.

References were the early balanced roster; the trained core roster; and an independently assembled special-control roster containing species 67, 303, 110, 315, 61, and 42. All references used the same level-100, IV-31, EV-510, neutral-nature rules and individually legal skills. Two mirror matchups are included deliberately.

All 90 battles reached ordinary battle results within 10–44 turns, with no bounded stops or draws. Every authored team made at least one voluntary switch across its nine samples. These results show distinct sampled matchups and runnable compositions; three seeds per matchup are not a competitive balance certification.

| Authored team | Wins vs early balanced (of 3) | Wins vs trained core (of 3) | Wins vs special control (of 3) | Turn range | Voluntary switches across 9 battles |
| --- | --- | --- | --- | --- | --- |
| `trainer_attrition` | 1 | 0 | 0 | 18–42 | 21 |
| `trainer_control` | 3 | 0 | 1 | 13–19 | 18 |
| `trainer_offense` | 2 | 0 | 0 | 10–39 | 13 |
| `trainer_fast_pressure` | 3 | 3 | 3 | 10–17 | 8 |
| `trainer_resilient_counter` | 2 | 3 | 3 | 12–22 | 16 |
| `trainer_trained_core` | 3 | 2 | 2 | 10–44 | 18 |
| `trainer_dragon_sanctuary` | 3 | 0 | 3 | 10–21 | 7 |
| `trainer_fusion_specialists` | 3 | 2 | 2 | 10–17 | 5 |
| `trainer_shining_team` | 3 | 1 | 1 | 11–38 | 11 |
| `trainer_legendary` | 3 | 3 | 3 | 13–16 | 6 |

The fast-pressure team won all nine samples without choosing a status move; its immediate physical and priority damage was sufficient in these particular matchups. That result does not prove setup is unnecessary in general. The legendary team also won all nine samples, while the theme teams had mixed results against the trained reference. The foundation teams lost all nine aggregate games against the trained reference, consistent with separating the simpler starting pool from trained heroes.

The full report stores all 90 outcomes, reference builds, seeds, and SHA-256 hashes of the ten trainer definitions in `analysis/codex-takeover-2026-10-14/classic-roster-simulations-v38.json` beside the takeover worktree. The companion `classic-roster-simulations-v38.mjs` is rerunnable from the repository root via `node --input-type=module < ../analysis/codex-takeover-2026-10-14/classic-roster-simulations-v38.mjs`.
