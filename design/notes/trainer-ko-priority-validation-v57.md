# V57 independent trainer KO-priority validation

The independent regression is `tools/verification/trainer-ko-priority-v57.mjs`. It initially reproduced the defect before the production change, then passed all 27 groups against the V57 implementation.

The saved pre-fix witness uses a level-50, IV-15 neutral opponent whose actual stats match the public model. It has 30 HP and both defense stages at +6. The trainer has a sure-hit, priority-one, power-80 physical attack and a status move that clears boosts. The old policy chose the clearing move. Forcing the attack through the real engine knocked out the opponent before it acted in all 32 tested seeds. A separate forced minimum noncritical roll deals 31 damage, so the successful branch does not depend on an average roll or a critical hit.

The post-fix checks cover:

- All four styles and 12 combinations of competing clear, boost-theft, control, recovery and shield moves, with legal reserve switches and HP/PP medicine available.
- PP exhaustion, the engine-legal last PP, strict speed ordering at equal priority, higher observed attack priority, observed priority status moves, and unknown priority scripts. Actual tied-speed turns produce both first movers across seeds; they do not qualify as certain first actions.
- Less-than-certain accuracy, evasion, minimum damage below the target's HP, OHKO lotteries, variable multi-hit counts and probabilistic power increases.
- Deterministic fixed damage, type/fixed immunity, public protection, zero incoming damage, per-hit caps, damage-category restrictions, invulnerable turns, action prevention and move-failure probability.
- The evil seal's own active-holder condition. Species identity, an expired seal, a benched teammate's seal, an opposing seal, fixed-damage immunity or a fully blocked initial attack do not create the bonus KO. Across 24 matched seed pairs, the sealed attacker knocks out the 50-HP target while the same-species unassigned attacker does not.
- Throwing getters for hidden opposing stats, loadout, PP, pending input, inventory and reserves. Public decisions remain identical when hidden defensive stats or unannounced protection differ. Repeated decisions preserve state and RNG and never invoke live damage/stat/priority/script callbacks.
- Boss dispatch still reaches the historical live-evaluation policy and does not acquire the trainer-only hard-priority branch.

Six additional negative groups use real engine turns to establish sequential-effect boundaries. A powered attack followed by 50% of current HP leaves 15 HP in the fixture, while two successive 50% current-HP effects leave 8 HP. A fixed follow-up conditional on the target remaining above 90% HP is skipped after the powered attack. A 1.99-point maximum-HP percentage base is floored to 1 before the sixfold modifier, dealing 6 rather than 11. Recoil can faint the seal holder before its extra 30 damage, and an earlier own on-hit healing effect can restore the target before that seal resolves. Skill-dependent priority/power predicates receive no skill context in those engine paths: the fixture's actual priority remains 0 and its weak powered hit deals only 2. None of these cases receives absolute KO priority; the original simple boosted-defense knockout still does.

The verifier exports the private qualification helper and public-opponent builder through a Vite transform in memory. No production export or source edit is required. Negative tests distinguish failing the absolute-KO qualification from the ordinary planner still choosing a risky move for other reasons. The baseline report remains at `artifacts/trainer-ko-priority-v57/baseline.json`; the current result and source hashes are at `artifacts/trainer-ko-priority-v57/regression.json`.

The server uses middleware mode, no listening port, no WebSocket or watcher, an independent cache, and a blocked HTTP function. No user save, browser, build or package operation is used. The guarantee is relative to public information; these tests do not claim that hidden opponent builds or unrevealed moves have been predicted.
