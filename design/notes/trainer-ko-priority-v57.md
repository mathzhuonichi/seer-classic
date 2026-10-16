# V57 immediate knockout priority

A reliable first-action knockout now takes precedence over all ordinary trainer utility. Previously a knockout only added a weighted bonus; clearing enough positive stages could outscore a move that immediately removed the active opponent. The independent baseline reproduces this with a 30-HP opponent at defense +6 and special defense +6: the old planner clears boosts although the priority attack's minimum noncritical damage is 31.

`tacticalAction` checks `immediateKoAction` before ordinary move scoring, voluntary switches or medicine. A qualifying legal move returns immediately. All four trainer styles follow this tier, including when healing, control, stealing boosts or reserves would otherwise be attractive. The generic chooser still handles forced skills first. Bosses retain their separate historical project AI; Moshidilu's user-adopted execution rule is an encounter mechanic, not this trainer policy.

The qualification reads only the existing public opponent model and visible effects. It requires certain modeled accuracy and strict action order against every observed move, including status moves. Equal speed at equal priority is random and does not qualify. Unknown priority, stat or interception callbacks are not executed to obtain a proof.

Damage uses the engine's minimum 217/255 roll without a critical hit. The narrow supported subset includes single-hit ordinary attacks, unconditional fixed/maximum-HP percentage damage and the pinned Sea Heart effect. Native percentage rounding happens before damage multipliers. Current-HP percentages, condition-dependent follow-ups, average multi-hit counts and lucky damage boosts do not establish the lower bound. Unknown effect chains fall back to ordinary scoring.

The evil seal adds 30 only for the current attacker's own active, installed before-move/on-hit script, with its real registry hook. Species identity, another individual, a stale condition or an absent callback does not grant it. Recoil and unknown earlier effect changes cannot supply a guaranteed seal follow-up. The existing ordinary utility and passive execution rules remain unchanged.

The priority is a guarantee relative to the public neutral-build estimate. It does not read hidden opponent IVs, EVs, exact stats, unannounced traits, reserves or pending inputs, and cannot certify a knockout against unknown builds or unrevealed moves. A candidate outside this conservative tier may still be selected by the ordinary planner.

## Validation

The independent [validation note](trainer-ko-priority-validation-v57.md) records 27 passing groups, the pre-fix failing witness, actual engine turns, forced minimum-roll damage, all styles and six sequential-effect negative cases. Existing smart AI passes 39 groups and 120 trainer states; elite tactics, medicine and passive ownership checks also pass. The historical Boss oracle is rerun against the integrated core. No production build, package, user save access or user-server restart is involved.

The current Boss decisions and their provenance are documented separately in [Boss user policies, V57](boss-user-policies-v57.md). Four declined mechanics are explicitly waived; Moshidilu uses the strict current-HP threshold below 25%. Neither policy is presented as recovered official server behavior.
