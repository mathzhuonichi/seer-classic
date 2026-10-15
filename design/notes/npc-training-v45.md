# Classic NPC ability training

Revision 45 adds explicit training profiles to the two authored trained teams. The former implementation equipped Rei's task-earned skills but still computed ordinary stats. Gaia's setup skill likewise changed battle stages without granting a permanent training trait. Skill access, permanent ability additions, and temporary battle stages now remain separate concepts.

## Encounter scope

`trainer_trained_core` and `trainer_fast_pressure` select `rei-classic-full` for Rei. Their Gaia members select `gaia-blood-seal` and `gaia-evil-seal`, respectively. Only an explicitly marked level-100, neutral-nature member in an authored trained-group trainer or an elite facility encounter may use these profiles. Both the direct trainer route and the facility route normalize the encounter before combat; repeated normalization is idempotent.

Original boss encounters retain their authored HP overrides, phases, rewards and other rules. They receive no new ability-training profile. Ordinary random encounters, foundation teams and player monsters also receive no new profile. In particular, completing Rei's existing five skill challenges still grants those skills only; this change does not invent a player ability-training progression. The random elite facility continues to draw from its original 103 species with raw base-stat total at least 600. Candidate additions are a separate review deliverable, not an automatic pool expansion.

The profiles are pinned to the retained species bases and reject unexpected species, levels, natures, unrelated stat overrides and stacked training rules. Gaia's conditions belong to the equipped member, survive switching, and do not benefit the rest of its team.

## Rei

The retained base stats are HP 71, Attack 108, Defense 70, Special Attack 101, Special Defense 77 and Speed 105, totaling 532. The [2010 training guide](https://news.7k7k.com/content/20100604/8365.html) explicitly gives maximum actual-stat additions of 60, 20, 30, 10, 20 and 20; a [2011 analysis](https://news.4399.com/seer/jingyanxinde/201107-06-102970.html) independently corroborates the training limits.

| Stat | Ordinary trained-team build | Ability addition | New trained-team build |
| --- | ---: | ---: | ---: |
| HP | 283 | 60 | 343 |
| Attack | 315 | 20 | 335 |
| Defense | 176 | 30 | 206 |
| Special Attack | 238 | 10 | 248 |
| Special Defense | 190 | 20 | 210 |
| Speed | 309 | 20 | 329 |

Both teams use level 100, IV 31, a neutral nature, and 255 Attack / 255 Speed learning values. The six additions total 160 actual stat points. At this level and nature, two actual stat points correspond to one base-stat point, so the retained catalog gives an equivalent base total of $532 + 160/2 = 612$. This is a display and comparison metric; Rei's species base and encyclopedia entry remain 532.

The 2010 article also prints a separate derived total of 610 whose underlying values differ from the retained catalog. This implementation uses its explicit ability additions and does not silently replace the catalog with that inconsistent table. Historic nature ordering and lower-level scaling have not been established; the profile is deliberately restricted to the supported level-100 neutral case.

## Gaia

Gaia's retained base total remains 590. Its [2011 training description](https://news.7k7k.com/content/20110427/85061.html) supplies three mutually exclusive second traits that can be replaced outside combat. These are not three simultaneous stat bonuses.

| Profile | Selected team | Implemented effect |
| --- | --- | --- |
| Blood seal | Trained core | At the end of a turn, the active living owner recovers floor(maximum HP / 20), capped at full HP. |
| Evil seal | Fast pressure | A physical or special skill that hits and causes damage appends one 30-point fixed-damage follow-up. |
| Sky seal | None | Recorded alternative: 5% chance to double attack-skill power. Not installed on either authored team. |

The blood profile preserves the core build's ordinary stats: HP 414, Attack 337, Defense 210, Special Attack 228, Special Defense 192 and Speed 246. The fast build retains HP 351 and Speed 309, with the other stats unchanged. Blood cannot heal a reserve or revive a fainted member. Evil does not trigger on misses, immunity, protection, status moves or damage-over-time ticks, and triggers only once for a multi-hit move. Its follow-up respects existing fixed-damage defenses. These exact timing and rounding choices are documented remake behavior; the historic server ordering is not recovered.

The normalizer rejects multiple equipped seals. No equivalent base-stat total is assigned to Gaia's passive effects, because their value depends on turns, damage and the matchup.

## Source boundaries

The profile data includes dated links and the implementation assumptions. Later original-form training such as Cassius's 2013 defensive additions falls beyond the current classic dataset's period and has not been imported. Temporary setup moves, including Gaia's attack/accuracy buff and Hamoret's five-stat buff, remain normal battle-stage effects. They are not evidence of permanent species-stat training.

## Verification

The focused NPC-training harness passes 24 checks, including both controller entry routes, idempotent normalization after a JSON round trip, exact Rei stats, both Gaia effects, switch ownership, invalid stacking, immunity/protection, pure fixed-damage attacks, lethal damage and player-save preservation. The existing classic-team harness passes 26 checks, including rendered raw-532/equivalent-612 labels and skill provenance. The facility harness passes 35 checks, including all 1,479 collectible forms and the unchanged 103-member elite boundary. TypeScript and whitespace checks pass.

An isolated local origin at port 1437 verified the actual interface at 1280 by 720 and 640 by 720. Rei's raw base total, equivalent total and all four skills remain accessible; the narrow panel scrolls through the complete member details and challenge controls. The two Gaia cards display only their selected trait. Starting the fast-pressure team through the real interface produces a level-100 Rei with 343 HP and no initial stage boosts. The browser recorded no warnings or errors. The user's port-1432 save was not used for fixtures.

Evidence is in `artifacts/npc-training-v45/regression.json`, `rei-browser.png`, `gaia-narrow-browser.png`, `gaia-narrow-bottom.png`, and `rei-battle-hp343.png`. The candidate audit separately identifies a pre-existing group-target-count import error; see [the bounded source audit](skill-atknum-audit-v45.md). This training revision does not correct that broader skill dataset and does not claim a fully validated combat balance.

No production build, package or remote push is part of this revision.
