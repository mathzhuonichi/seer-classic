# Holder ownership, original Boss moves, and voluntary switching

Revision 47 checks that switching and support transfers preserve individual ownership, restores an encounter-specific original Boss move removed by V46, and requires a voluntary trainer switch to repay its opportunity cost. These changes retain the separate authored Peak Duel builds and the pending engraving designs.

## Individual ownership

No production ownership defect was found in the inspected paths. The engine stores conditions on each `Mon`; trait definitions can share immutable hook definitions, but their condition instances are separate. Owned creatures enter through their individual UID records. An ordinary creature of the same species does not acquire another member's training seal or equipment.

The dedicated regression verifies:

- An assigned Gaia's evil seal adds 30 fixed damage, switching to an unassigned Gaia adds zero, and returning to the assigned Gaia restores the same 30-point effect. The seal stays attached to its owner while benched.
- The blood seal heals only its active holder. It neither heals an ordinary teammate nor ticks on the bench.
- After switching away from a sealed Gaia, Jimi's actual inheritance script gives the next entrant speed and accuracy +1 each. It copies neither the donor's other stages or ordinary trait nor the earlier Gaia seal.
- The two-attack critical gift intentionally shares its charge pool across surviving team members. Its condition instances remain separate, and this explicit team benefit does not transfer the donor's trait or another member's Gaia seal.
- Fainting clears the departed holder's conditions; its replacement receives none of its private effects. Energy-bead stat bonuses and attack/defense hooks remain with the equipped individual.
- The complete 48-definition trait registry is checked for condition-instance isolation. Representative deterministic modifiers and forced-probability trigger cases cover accuracy, critical effects, on-hurt status, on-hit status, recovery and damage. Forcing probability isolates ownership; it does not measure historical trigger probabilities.

There are 47 implemented ordinary traits; the multi-target-only Luan Wu record remains unimplemented. This is structural coverage of all definitions and representative effect-path coverage, not 48 separate end-to-end controller certifications. The ownership harness passes 13 checks and leaves the source catalog and trait definitions unchanged.

## Original Boss preservation

The V46 blanket self-KO replacement policy was incorrect for Tower 61 and has been removed. A [contemporary first-person account dated 2010-06-23](https://news.4399.com/seer/yzzt/201006-23-71411.html) explicitly describes the first opponent using its sacrifice move and strengthening the next opponent. The original stored skill `眼球的掌控` (20330) is therefore restored at runtime; it is not replaced with 20328. Only provenance metadata changes in the Tower 61 JSON.

All 180 stored Boss encounters retain their skill arrays, explicit AI references, ordering, phases, HP, levels and rules through preparation. The NPC-training normalizer changes none of them. The real Tower 61 controller exposes `[10748,10744,10747,20330]` on species 270 with HP 1150 and the original three-member lineup. Explicitly executing 20330 faints species 270 and brings in species 271 with defense and special defense +1 each, exactly the existing effect-59 parameters `[1,3]`. This is distinct from Jimi's speed/accuracy inheritance.

The revised Boss/support harness passes 18 checks, including actual controller entry and the sacrifice/next-entrant mechanics. An explicitly selected move verifies execution, not historical AI selection frequency. Authored elite support builds and trainer-only ability profiles remain separate from original Boss encounters.

Historical fidelity remains bounded by evidence: 108 of the 180 imported records explicitly mark their skills uncertain. Preservation of those records does not certify all original four-move sets. The [source review](boss-loadout-fidelity-v47.md) records the inventory, one fully corroborated four-move set, the confirmed Tower 61 sacrifice, and the remaining per-encounter limits. The other three Tower 61 moves are not newly certified by this change.

## Voluntary-switch analysis

The previous policy already required two active turns, a substantial matchup improvement, no immediate knockout, and reserve survival through entry. Its defect was not an unrestricted switch loop: the matchup threat term divided by current HP, so danger grew without bound near zero HP. It also lacked a direct comparison with spending the current action and, after fainting, bringing in the same reserve without an entry hit.

The new policy adds that comparison while retaining the existing safety gates. A switch gives up the current attack, control, recovery or setup; the reserve pays the opponent's entry attack and known control risk; leaving discards removable stages and buffs. Remaining HP losses are bounded by the HP actually available and normalized against maximum HP. A fallen lead permits a free replacement in the stay branch, and an attack it can execute first reduces the opponent's projected HP. Permanent traits, energy beads, Gaia seals and the shared critical gift are not charged as lost resources.

The model is a short public-information heuristic, not a full battle search or a claim about historical AI. Unrevealed opponent moves, hidden builds, reserves and pending input are excluded. Unknown move scripts are not executed during scoring. Lower switching frequency is a measured consequence to inspect, not a target rate to tune toward.

For each candidate reserve, the additional comparison uses the following structure:

$$
V_{\mathrm{stay}}=U_{\mathrm{action}}-L_{\mathrm{current}}+X_{\mathrm{stay\ or\ free\ replacement}},
\qquad
V_{\mathrm{switch}}=-L_{\mathrm{entry}}+X_{\mathrm{paid\ replacement}}-I_{\mathrm{lost}}.
$$

Here each HP-loss term is the expected loss capped by available HP, divided by that creature's maximum HP and multiplied by 100. The current action uses the existing move-utility weights, adjusted for its opportunity to execute; control and recovery are therefore not treated as zero-value attacks. The continuation term estimates one following attack opportunity and the opponent's reply. The investment term prices removable positive stages and beneficial conditions that a surviving lead would retain. These are heuristic utility points, not win probabilities or an exact common currency for all battle resources.

A voluntary switch requires `V_switch - V_stay > 0`, in addition to the previous gates: at least two active turns, no immediate knockout, matchup improvement greater than 35, current best-move score below 70, entry HP greater than 1.25 times estimated damage, and either acting before the next threat or retaining more than 1.1 times that damage. The old matchup ranking remains; its near-zero-HP term can no longer authorize a switch without passing the independent cost comparison. No desired switching percentage or arbitrary per-match switch quota is introduced.

Independent review found and closed three concrete timing errors in the initial comparison: one remaining immunity turn must protect entry without inventing control before a faster next-turn knockout; an attack-only shield must not reduce a fixed-damage threat; and direct non-waking control must preserve its supported next-turn benefit. The real fear move 20172 now keeps the lead active in the reproduced case. Explicit one-turn control expires before the following opportunity; an explicit inclusive duration range `[1,3]` contributes a two-thirds continuation probability, while the actual default `[2,3]` contributes one. Continued control suppresses the enemy's next control action as well as its attack, without erasing status already suffered on entry.

## Verification and delivery

The fixed comparison uses six real six-member roster pairs at seeds 7 and 29, with the previous policy pinned to V46 commit `ff528860160c7739c78b4be6b41f0eadf67db4cd`. The ordinary player reference team does not inherit NPC-only training profiles. Both sides use the corresponding old or new policy, so these are descriptive switch-frequency comparisons, not an isolated strength or win-rate experiment.

| Fixed 12-battle sample | V46 | V47 |
| --- | ---: | ---: |
| Total turns / NPC decisions | 212 | 185 |
| NPC voluntary switches | 11 | 6 |
| NPC voluntary switches per decision | 5.19% | 3.24% |
| NPC faint replacements | 50 | 51 |
| Both sides' voluntary switches | 25 | 14 |
| Other forced switches | 0 | 0 |
| Consecutive voluntary A-to-B-to-A sequences | 0 | 0 |

The old sample already showed occasional voluntary switching rather than widespread oscillation. The new comparison removes some poor exchanges without disabling switching: a separate durable type-advantage case still selects a switch. The sample covers the selected rosters and seeds only. It does not establish optimal play, a universal switch rate or comparative strength against human opponents.

The final checks pass:

| Check | Result |
| --- | --- |
| Holder ownership | 13 checks; all 48 trait definitions structurally isolated, with 21 representative implemented trait IDs exercised |
| Original Boss preservation and support transfers | 18 checks; all 180 Boss records unchanged by preparation |
| New voluntary-switch regression | 15 checks, including the fixed 12-battle comparison, real control replay, useful-switch positive cases, free-faint negative cases, read-only state/RNG and hidden-state traps |
| Existing AI regression | 39 checks and 120 real NPC cases |
| Existing liveness regression | 10 checks, 191 battles, all 1,479 eligible species covered |
| Existing elite tactics | 11 checks |
| Independent final control recheck | 4 cases on the frozen source: actual 20172, explicit one-turn control, explicit `[1,3]` duration, and expiring entry immunity |
| Integration | TypeScript `--noEmit` and `git diff --check` pass |

The final `tactics.ts` SHA-256 is `72d0fa9749eb224b073825ca6958153a8c995716c6308cb604640a0000d4e92a`. The initial independent ten-case review and the final four-case recheck remain separately identified in the ownership artifact directory. The latter and the main fifteen-case report match this final source. The forced-replacement function and the V46 damage/gift estimator prefix are byte-for-byte unchanged.

The remaining model limits are explicit: it mixes expected damage with deterministic survival branches, considers only the current decision and one following attack opportunity, and does not fully project every setup effect, newly applied shield across later turns, or script chain. The observed-opponent model does not know actual hidden training values or unrevealed moves. The completed checks establish the stated ownership, preservation and decision boundaries; they do not certify global battle balance or optimal play.

Generated reports live under `artifacts/holder-ownership-v47/`, `artifacts/boss-and-support-v46/`, and `artifacts/switch-policy-v47/`. This remains local development work; no distributable build or package is produced.
