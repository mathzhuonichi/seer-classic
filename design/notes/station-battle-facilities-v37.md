# Station battle facilities and AI liveness v37

## Requested scope

The user selected three repeatable space-station battle facilities near the existing Tower: a random six-member Lv100 opponent, a random six-member Lv100 opponent whose members each have a base-stat total of at least 600, and fixed six-member Lv100 teams with complementary classic species. These are authored remake facilities. They do not claim to reconstruct historical Seer trainer rosters or import Pokemon battle mechanics.

The runtime catalog contains 1,479 eligible species after excluding the four NPC-only entries 122 through 125. Of those, 103 have a base-stat total of at least 600. Teams must use ordinary species stat calculation and legal natural learnsets. Facility generation, controller integration, map placement, reward behavior, and visible labels are verified separately by the owning implementation agents; the initial focus of this note is whether the existing AI can stall or block execution.

## Audit boundary

The liveness audit started from v36 commit `f951d1c`. It reviewed `battle/core/src/tactics.ts`, `battle/core/src/battle.ts`, the result mapping in `src/game.ts`, and the result presentation in `src/components/Battle.tsx`. The reproducible harness is `tools/verification/battle-ai-liveness.mjs`; its current report is written to the ignored artifact path `artifacts/battle-ai-liveness/report.json`.

The audit distinguishes three different outcomes:

- A synchronous calculation that takes too long blocks the interface during that call.
- A battle that repeatedly heals, protects, restores PP, or switches can take many turns while still accepting input normally.
- A true nonterminating automatic battle would never produce a result. The engine's hard turn limit prevents this for the cases covered here.

## Confirmed defects and fixes

The existing engine has a default limit of 200 full turns. At that limit it finishes with `reason: 'turn_cap'`, `winner: null`, and `success: false`; a subsequent `resolveTurn()` returns no events and changes no state. The previous controller presented this outcome as a failed challenge and played the loss sound. The v37 implementation now identifies the limit explicitly as a draw. Controller wording, log output, reward isolation, and the sound branch are covered by the facility integration audit.

An independent execution exposed a data compatibility defect in the real Puni move Eternal, skill 20608. Its native operation is `restore_pp` with `amount: 'all'`. The former numeric addition concatenated that string and produced `NaN` for every equipped skill's PP; legal actions then collapsed to Struggle. The implementation now restores each skill to its finite maximum. The new regression uses species 300 and a naturally learned attack, and separately checks that ordinary numeric restoration adds exactly five PP after paying the move's own PP cost and caps at each maximum.

The prior scorer repeatedly reconstructed the same opponent move history for every attack, support effect, and reserve candidate. A six-member benchmark visited the entire public event log 65 times for one decision. The v37 scorer now records revealed moves in its existing public opponent projection and reuses that immutable view throughout the decision. The harness asserts one visit to each log entry per decision, including reserve evaluation, without changing battle state or consuming RNG.

## Measured validation

The post-fix run on this Mac passed ten focused check groups. Timings are local observations, not portable performance guarantees.

| Coverage | Result |
|---|---|
| Individual active decisions | All 1,479 eligible species produced a legal, repeatable, read-only Lv100 decision from a legal four-or-fewer-move build. |
| General random sixes | 124 complete six-versus-six battles rostered all 1,479 species. |
| High-stat random sixes | Nine additional complete battles rostered all 103 eligible species with base-stat total at least 600. |
| Fixed classic teams | Six Lv100 mirror/cross matches used the current six-member attrition, control, and offense rosters. |
| Adversarial battles | Eternal-only mirror, finite healing/protection, and renewable healing/PP cases all terminated. |
| Total full battles | 142; all terminated by turn 200. |
| Random-catalog duration | At most 25 turns in this fixed-seed sample. |
| Classic-team duration | 11–96 turns; the longest was the attrition mirror, with 60 healing events and 14 switches. |
| Longest measured resolution | 2.888 ms for one full automatic turn in this run. |
| Largest natural test log | 1,001 events. |

The random battle coverage means every species was rostered, not that every bench member entered every full battle. The separate individual decision check ensures every species actually acted as the active decision maker. Builds are deterministic samples of natural learnsets with at least one attacking option when available; this is not exhaustive coverage of all possible move combinations, effects, seeds, opponent pairings, traits, or item scripts.

The public-log benchmark used six-member teams, candidate switching, and 15 repeated decisions per size after warm-up. State and RNG snapshots remained identical before and after scoring.

| Public log events | Previous median / maximum decision time | Updated median / maximum decision time | Updated full scans |
|---:|---:|---:|---:|
| 1,000 | 1.153 / 2.013 ms | 0.288 / 0.570 ms | 1 |
| 5,000 | 5.061 / 6.286 ms | 0.514 / 0.728 ms | 1 |
| 20,000 | 21.502 / 38.846 ms | 1.043 / 2.135 ms | 1 |

The 20,000-event case is an intentionally oversized public history, much longer than any full battle in this sample. The table isolates decision cost; it does not measure animation duration, rendering, asset loading, or slower devices.

## What can still take a long time

A real Eternal-only Puni mirror revisits the same combat state for 199 successive turns and ends as a draw at turn 200. This is a genuine strategic stalemate, not an unbounded loop. A synthetic low-damage battle with healing and replenishable PP also reaches the limit. Finite healing and protection instead ended by knockout on turn 64 after consuming its resources.

The revised fixed attrition teams ended their mirror on turn 96. Their longest consecutive interval without a health change was six turns. Across all automatic full battles, voluntary switches respected the two-action cooldown: successive voluntary switches by one side were at least three turns apart. Forced replacements or effects are not classified as voluntary tactical switches.

These findings support retaining the explicit 200-turn draw and current switch cooldown. No additional automatic stalemate rule or broad penalty on useful recovery is justified by this sample. A player can still deliberately prolong a battle with a renewable support loop, and animations make a long battle take longer in wall-clock time than the headless measurements suggest. The UI should make the draw and return path clear; it should not promise that every legal matchup ends quickly.

## Reproduction

Run `node tools/verification/battle-ai-liveness.mjs` from the project root. It writes the complete coverage, battle durations, repeated-state observations, switch counts, timing samples, and any failures to `artifacts/battle-ai-liveness/report.json`. It does not change production data or persist a save. Related facility generation and controller checks live in `tools/verification/battle-facilities.mjs`.

## Facility and world integration

The generator samples without replacement, using exactly six seeded draws per random team. The complete 1,479-form pool includes initial forms; the 103-form elite pool includes all 44 forms with base-stat total exactly 600. Four NPC-only forms are excluded. Natural Lv1–100 learnsets provide four distinct moves; every random build uses IV31, 510 total EVs, a standard nature, and ordinary calculated stats. Move selection prefers effective ordinary attacks, a second damage type, priority where available, and supported utility. It is a bounded heuristic, not an optimal competitive-team search.

The fixed teams preserve offense, control and attrition styles with eighteen legal Lv100 builds. They are authored combinations of classic species, not historically recovered trainer teams. No player team is level-normalized: the real party, current HP and PP, and inventory are used. Six player members are recommended by the encounter size, but entry remains open with any living party member.

Facilities are accessed through the Space Station resource hub. The random, elite and classic rooms each have a hub entrance and return. These authored rooms reuse retained map 102 artwork and do not take over the Brave Tower, Dark Arena or Mystery region. Existing boss destinations remain reachable. The panel exposes pool counts and full fixed rosters, permits party preparation and recovery, and preloads the actual generated team before battle.

A facility win grants the existing trainer bonus of 500 coins and 1,000 pooled experience plus ordinary knockout experience. Facility entry, retreat, draw and victory do not write boss attempts/completions, add essences, alter collection records, or unlock recruitment/shop routes. Invalid start actions leave the save and RNG unchanged. Existing challenge-archive trainer history remains available through its original entry point.

The facility regression passed 21 groups: 247 generation batches cover all eligible ordinary builds; 24 seeded random-team cases and 10 controller/save cases cover generation, restart determinism, rejection atomicity, victory, retreat, and the 200-turn draw return path. The trainer regression passed 14 groups and nine six-versus-six Lv100 simulations. A separate UI/world review passed nine checks for the three panels, complete rosters, disabled empty-party start, reciprocal room routes and unchanged boss destinations. TypeScript, the existing battle and campaign suites, and the solo-challenge SSR check also passed. These checks do not certify competitive balance or every scripted skill combination.

## Browser acceptance

An isolated development origin at port 1431 used a fresh save, preserving the user's existing port-1426 session. UI navigation reached Space Station resources, the random room, its administrator, and the three-mode panel. Starting a random match revealed six distinct Lv100 opponents; one real turn resolved, the ordinary Lv5 player lead fainted, and the replacement screen still permitted withdrawal back to the same room. The elite tab showed 103 eligible species and the inclusive 600 threshold. The classic tab showed all six offense members with Lv100 and base totals. The six-member preview uses one row within the scaled classic frame and remains scrollable in the current narrow app window. Browser console warnings and errors were empty. The temporary tab and server were closed after verification; the existing preview was retained.
