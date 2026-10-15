# Offline battle AI and coordinated NPC teams v36

## Scope and status

The user selected smarter offline opponents and coordinated NPC teams as the next improvement. Other proposed progression, collection, and record systems are deferred. This note records primary-source research, the initial policy and the delivered implementation, researched on 2026-10-14 in America/Los_Angeles. The implementation and verification section below distinguishes tested behavior from balance or full-script-modeling claims.

The existing free shop, free immediate fusion and breeding, open boss access, ordinary capture routes, and optional modifier remain part of the design. New trainer teams are authored remake encounters, not reconstructions of historical Seer trainers. Their purpose is to make current moves, statuses, types, and team choices matter without adding inflated boss stats or new resource gates.

## Baseline inspected

The v35 catalog has 180 encounter definitions: 178 select `smart`, one selects `sequence`, and one selects `weighted`. There are already seven campaigns with 30 ordered stages, continuous guardian teams, multi-life bodies, and special damage rules. These encounters must not be treated as interchangeable trainer teams.

Before revision 36, `battle/core/src/ai.ts` prioritized an estimated knockout, then each unused status move once, then the greatest raw estimated damage. Automatic replacement took the first surviving party member. `legalActions` already supplied valid moves, switches, and items. `Mon.usedSkills` records skills actually used during the battle and survives ordinary switching. `Side.pending` contains the submitted action and must not become an AI input.

The existing `estimateDamage` is a raw estimate rather than a complete effect simulator. It can call script power and stat hooks; for example, `seer_eff_113` caches an estimated IV in `user.persist`. Repeated scoring or hypothetical switch evaluation must therefore not call arbitrary live hooks under an assumption of purity.

## Primary sources and transferable ideas

The sources were inspected at these commits. The design below is an independent adaptation; no upstream implementation is copied.

| Source | Inspected behavior | Application here |
|---|---|---|
| [pret/pokeemerald battle AI scripts](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/data/battle_ai_scripts.s) | `AI_CheckBadMove`, `AI_CV_Heal`, `AI_CV_AttackUp`, and `AI_TryToFaint` separate failure checks, contextual utility, and finishing attacks. | Replace the unconditional first-use status bonus with effect-aware scores. |
| [pret/pokeemerald switch and item AI](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/battle_ai_switch_items.c) | Switching has separate triggers and candidate selection; some checks use the last landed move. | Decide whether leaving is worthwhile separately from which teammate should enter. |
| [Expansion AI flags](https://github.com/rh-hideout/pokeemerald-expansion/blob/73b3fbeb574327cd9420c89e56bef5aa3c08fead/docs/tutorials/ai_flags.md) | Basic flags combine bad-move, viability, and knockout checks. The documented smart composite also includes omniscience. Sequence switching preserves authored party order. | Borrow the modular checks, explicitly exclude omniscience, and make tactical switching opt-in. |
| [Expansion move scoring](https://github.com/rh-hideout/pokeemerald-expansion/blob/73b3fbeb574327cd9420c89e56bef5aa3c08fead/src/battle_ai_main.c) | `AI_CheckBadMove`, `AI_TryToFaint`, `AI_CompareDamagingMoves`, and `AI_CalcMoveEffectScore` handle different parts of a decision. Recovery is penalized at full or nearly full HP. | Score damaging effects and useful secondary effects separately, then combine them conservatively. |
| [Expansion switch scoring](https://github.com/rh-hideout/pokeemerald-expansion/blob/73b3fbeb574327cd9420c89e56bef5aa3c08fead/src/battle_ai_switch.c) | Mid-battle and replacement choices use distinct contexts. Candidates account for defensive survival, offensive pressure, and expected hits to win. | Charge an incoming hit for voluntary switches; do not charge it for a free replacement. |
| [Expansion observed battle history](https://github.com/rh-hideout/pokeemerald-expansion/blob/73b3fbeb574327cd9420c89e56bef5aa3c08fead/src/battle_ai_record.c) | Used moves, revealed abilities, and item effects have explicit recording paths. | Base opponent knowledge on resolved public events rather than reading the entire player build. |

## Fair and deterministic information boundary

The AI may know its own team's complete builds, remaining PP, rules, and HP. For the opposing side, use the active real species, level, visible HP and maximum HP, types, displayed stages, revealed conditions, and previously used moves. Skin appearance never substitutes for actual battle identity.

Do not read the player's submitted action, unshown equipped or learned moves, hidden bench builds, exact IV/EV/nature values, future random results, or save metadata. Estimate hidden opponent stats from a documented neutral species-and-level model. For an opponent that has not demonstrated an attack, use a modest same-type attack assumption or a type-only threat estimate; do not obtain its actual best attack through the engine object. Observations describe what happened, not what must happen next. A revealed move must remain known after switching, while an unrevealed replacement starts with no move knowledge.

Evaluation is read-only: it must not consume PP, advance battle RNG, change conditions or caches, fire events, or alter action history. Prefer a pure projection over the minimal fields needed for scoring. A dry run against a cloned battle is acceptable only if cloning also isolates RNG, scripts, logs, and mutable nested condition data. Calling a live effect or hook and trying to undo selected fields is not a sufficient guarantee.

Use a stable score ordering and stable move/slot tie-breaks. If ties are randomized, draw once after all scores are complete, through `battle.rng`; never draw separately while evaluating each candidate. Identical public history, own state, and seed should produce the same action regardless of the player's pending action or hidden build changes.

## Proposed scoring policy

Scores below describe relative priorities, not historical Seer behavior. Concrete constants belong to the implementation and should be tuned with small decision fixtures before complete fights.

1. Start from the engine's legal actions. Preserve forced moves, authored sequences, weighted behavior, and explicit encounter action scripts. An exhausted moveset still falls back to Struggle.
2. Mark effects with no current benefit as poor choices: healing at full HP, reapplying an unrefreshable status, raising an already capped useful stat, lowering an already floored stat, or using an attack into an established immunity. Do not remove a damaging move merely because its secondary effect would fail.
3. Compare attacks using estimated useful damage capped at current foe HP, accuracy, relevant type multipliers, direct self-cost, and known secondary effects. A reliable immediate knockout gets the largest positive bonus. Priority matters when it changes whether that knockout occurs before an observed threat; low accuracy should prevent an uncertain hit from being treated as a guaranteed knockout.
4. Add contextual value for recovery, status, setup, and cleansing. Then compare the best move with an allowed voluntary switch, including the cost of giving the opponent a turn.

| Effect | Positive value | Reasons to reduce or remove the bonus |
|---|---|---|
| Direct recovery or drain | Actual recoverable HP, whether recovery changes survival through the next observed hit, and continued offensive pressure from drain. | Full HP, mostly wasted healing, a faster lethal threat, or a safe knockout already available. Recovery should become useful again later; first use is not a lifetime allowance. |
| Control status | A new actionable condition, with greater value when acting first can deny an otherwise dangerous turn. | The same effective condition is already active, a publicly established immunity, very low success chance, or an easy finishing attack. |
| Poison, burn, or leech | Expected value over a short remaining fight; combine attrition with useful defensive or healing effects. | A nearly defeated target or insufficient survival time to realize the delayed benefit. Use Seer's actual status mechanics rather than importing Pokemon type immunities or burn formulas. |
| Offensive setup | Uncapped attack stat that supports at least one equipped damaging move; a safe turn and enough remaining enemy HP to repay setup. | A physical boost on a purely special attacker, low survival probability, already sufficient damage, or saturation of the relevant stat. |
| Defensive setup or speed control | A material survival or move-order improvement against an observed threat. | No relevant threat, boosts that do not change the outcome, or an immediate knockout available. |
| Stage clearing or cleansing | Remove actual harmful own stages/statuses or meaningful opposing positive stages. | No eligible stage/status exists. Respect which side and which signs the effect actually clears. |
| Protection and reactive effects | A short, observable purpose such as an imminent damaging turn while residual damage progresses. | Consecutive purposeless use, no observed benefit, or preventing one's own progress toward a knockout. |

Support the native effect operations first. Add a small explicit semantic mapping for scripted effects used by the selected NPC teams; documented unknown effects receive a conservative fallback rather than arbitrary execution or optimistic guesses. Every NPC move should have a meaningful scoring path. Avoid assigning a broad bonus to every `category: 'status'` move.

## Switching and coordinated teams

Tactical switching is an explicit trainer option. Existing campaigns, multi-life bodies, guardian chains, and fixed encounter sequences keep their authored order. Ordinary wild behavior and the existing `sequence` and `weighted` profiles remain distinct.

For each living, legal bench candidate, estimate its position after entry. A voluntary switch takes an incoming observed attack before earning future damage. A replacement after a knockout does not. Clear switch-removed stages and conditions in the candidate projection according to engine rules; do not score a returned creature as if it kept its previous boosts. Reject trapped switches and candidates that are likely to be knocked out on entry when staying or another candidate has a useful action.

Prefer staying when it can safely finish the foe. Otherwise, require a material improvement in survival and useful damage over the best current move. Include the value lost by giving up positive stages. Apply a short switch penalty or cooldown and a stronger penalty for immediately returning to the previous slot. This should stop repeated A-to-B-to-A switching without preventing a necessary escape from an established immunity. After a knockout, choose the best viable replacement instead of the lowest party index, but only for opted-in trainer teams.

Start with three authored team archetypes using existing species and verified level-legal moves:

| Archetype | Complementary roles | Visible decision being tested |
|---|---|---|
| Balanced | Durable recovery user, speed or status controller, coverage attacker or priority finisher. | Heal at a useful moment, preserve a teammate through a favorable switch, then finish a weakened target. |
| Setup offense | Physical and special attackers with complementary coverage; one has a useful setup option and another handles its bad matchup. | Take a genuinely safe setup turn, attack after setup, and switch when the active attacker cannot make progress. |
| Attrition | Status or leech user, durable recovery user, and a direct attacker. | Apply a useful condition once, realize its value while surviving, and close the fight instead of stalling indefinitely. |

Use normal stat calculation, explicit legal IV/EV/nature choices, at most four legal moves, and no unexplained HP multipliers or infinite PP. Do not invent teammate-wide buffs, weather, abilities, or Pokemon mechanics that the Seer engine does not implement. Show the trainer's intended style and team composition in the challenge UI. New trainers do not grant existing recruit essences by accident or become prerequisites for existing collection routes.

## Acceptance boundaries for the implementation audit

Focused decision fixtures should cover useful versus wasted recovery, duplicate status, stage caps, physical/special setup relevance, reliable knockout and priority selection, accuracy tradeoffs, observed immunity, and all-PP exhaustion. Scoring must leave a complete battle snapshot and RNG state unchanged. Equivalent public states with different pending actions and unshown player moves must yield the same decision.

Switch checks should cover a losing matchup with a safe counter, a lethal switch-in, a faster knockout available by staying, trapping, lost boosts, replacement selection, and repeated-switch prevention. A real event sequence should confirm that legal opponent switches render and settle correctly. Historical continuous encounters need a regression showing that their fixed order remains unchanged.

Each authored NPC team needs data validation for learnsets, move count, usable roles, reachable entry, and reward isolation, followed by a bounded complete fight. Passing these checks establishes behavior, not competitive strength. Any unmodeled scripted effects and remaining difficulty uncertainty should be recorded in the delivery report.

## Delivered implementation and verification

The implementation uses a pure, bounded scorer in `battle/core/src/tactics.ts`. It consumes no RNG and calls no live damage, stat, priority or effect scripts. Own builds remain available; the active opponent uses IV15, zero EVs and neutral nature, public HP ratio, stages and displayed statuses. Other conditions require a public announcement, so silently attached energy beads and innate traits do not reveal hidden builds. Resolved move announcements are associated with party slots and retained through ordinary switches.

Native damage and support operations have explicit estimates, including accuracy, priority, type immunity, fixed/percentage damage, multi-hit damage, recovery, status, stage changes and clearing, PP recovery, recoil and common condition hooks. Immunity cancels foe-facing secondary effects in the same situations as the core. Self-targeted actions do not receive an accuracy penalty. Unknown script effects are deliberately not simulated; for example, the extra scripted component of Solar Synthesis is not included in its heal estimate. The scorer is an approximation, not a complete battle solver.

Voluntary switching is enabled only on the three new trainer definitions. It requires two completed active turns and a substantial matchup advantage. Candidate scoring deducts the expected entry hit; a slower reserve must also survive the following hit long enough to act. Faint replacement has a separate path without entry damage or trapping restrictions. Both normal automatic replacement and the explicit replacement phase use that path. Existing `sequence`, `weighted`, `random`, `script` and forced-move behavior remain separate.

The shipped teams are offense (species 9, 70 and 6), control (42, 67 and 24), and attrition (3, 88 and 32), using their catalog names in the Chinese interface. All nine members are level 80 with IV31, legal 510 total EVs, Hardy nature, four naturally learned moves, ordinary stat calculation and finite PP. They load through `CatalogData.trainers` from `data/trainers`, while acquisition and recruitment continue to receive the original boss list. Victories grant standard currency and experience and record completion; they add no essences, collection credit or shop entries.

Validation completed:

- TypeScript `--noEmit` and Git whitespace checks passed.
- `tools/verification/battle-ai.mjs`: 39 decision regression groups passed, including 18 real trainer-member cases. Forbidden player fields are guarded by throwing getters; complete state/RNG equality checks establish read-only planning and pending-input independence.
- `tools/verification/trainer-teams.mjs`: 14 legality, catalog isolation, controller, SSR and real-switch checks passed. Nine unmodified full fights across three seeds finished in 5–18 turns. The reference team lost all three offense matches, won all three control matches, and won two attrition matches; this is a smoke sample, not a balance certification. Reward-only controller fixtures explicitly use one-HP opponents and are kept separate from those real fights.
- A natural real-roster switch trace uses a level-80 Barus with legal HP/Defense EVs. After defense setup and a displayed Water Jet, the offense trainer voluntarily switches on turn three from its still-living lead (116 HP) to Rei; Rei absorbs the actual entry hit and remains at 180 HP. No HP, history, turn counter or NPC action is injected for this trace.
- Existing `battle-v3.ts`, `campaign-mechanics.ts` and `solo-challenges.ts` passed, including the 17 campaign encounter initializations, ordered six-member chains, retreat, critical hits, member-local rules and reward predicates.

Reports are in ignored `artifacts/battle-ai/`. The AI needs no network service or model API. Other proposed features remain deferred; this is a development preview change without a new distributable build or package.

Browser verification used a separate port-1430 save, leaving the user's port-1426 save untouched. The trainer tab, three-member roster, travel, dialogue and battle entry rendered correctly. With a legal level-80 Barus, defense setup followed by Water Jet made the offense trainer switch on turn three while its lead still had 118/236 HP. Rei then took 59 damage and remained at 169/228 HP. The actual animation, species/type portrait, team count and chronological battle log agreed. Console warnings/errors were empty. Screenshots are saved under `../analysis/codex-takeover-2026-10-14/browser-v36/` as `trainer-roster.png` and `trainer-voluntary-switch.png`. The temporary tab and development server were closed; the original port-1426 preview remains available.

The development server still reports the pre-existing public-JSON import warnings for animation and robot manifests. They did not prevent this browser check and were outside the AI change.
