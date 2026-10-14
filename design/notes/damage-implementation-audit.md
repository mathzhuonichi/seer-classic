# Damage implementation audit

The focused audit reproduced twelve failing cases in the pre-change engine and verified all twenty-eight cases after the targeted damage-chain corrections. These results establish consistency with the declared reconstruction rules and the loaded catalog effects. They do not certify equivalence with an unrecovered original Seer server routine.

The audit covers `battle/core/src/battle.ts`, the type chart, built-in and catalog conditions, original-template skill scripts, and the application's zero-star trait adapter. Historical formula research is recorded separately in [damage-formula-research.md](damage-formula-research.md). No player save was loaded, changed, or reset. No application package or large historical test suite was built or rerun.

## Reproduced defects and corrections

| Case | Before | After / required result |
|---|---:|---:|
| Last shield charge, incoming damage 100 | 1 | 0 |
| Two shield charges, three incoming hits of 100 | 0, 1, 100 | 0, 0, 100 |
| Inactive fire-only zero multiplier, normal incoming damage 0.4 | 0 | 1 |
| Fire-only outgoing buff, estimated normal attack | 127 | 63 |
| Level-two outgoing multiplier, estimated normal attack | 63 | 127 |
| Outgoing scripts: halve 100, then subtract 10 | 90 | 40 |
| Final scripts: halve 100, then subtract 10 | 90 | 40 |
| Actual damage-reduction trait, then shield budget 80, incoming 100 | 20 | 15 |
| True damage 100 with a scripted condition reducer | 50 | 100 |
| True damage 100 with a skill final-damage reducer | 50 | 100 |
| Actual self-sacrifice template with the damage-reduction trait, initial HP 1000 | HP 50, alive | HP 0, fainted |
| True self-cost with an unbroken boss HP floor, initial HP 1000 | HP 1 | HP 0 |

**Shield consumption and minimum damage.** The old minimum-damage check inspected the target's remaining conditions after consuming the shield charge. Once the final charge removed the condition, a fully blocked attack incorrectly became one damage. The same scan also treated a zero multiplier as active when its predicate rejected the current skill. Damage resolution now tracks zero multipliers actually applied to the current hit before consuming their charges. The normal nonimmune minimum remains one. The catalog contains 42 skills using `cond_block_attacks`, including protection skills 20036 and 20055, so this is an active gameplay defect rather than an unused extension case.

**Scripted transform composition.** `fire()` collected callback results while giving every callback the original input amount; taking its numeric results in order did not compose the transforms. A damage-specific helper now passes each transform's result to the next active condition, preserving condition order, predicate evaluation, and per-transform integer flooring. Generic event-hook dispatch is unchanged. The catalog's zero-star trait 1024, `坚硬`, reduces damage by five percent. Combining its actual adapter with the actual `seer_eff_49` shield demonstrates the error without relying only on synthetic scripts: 100 becomes 95, then the shield absorbs 80, leaving 15. Previously the shield independently saw 100 and overwrote the trait's result with 20. The relative ordering of differently inserted conditions remains the project's existing reconstruction policy.

**True-damage costs.** Section 5.1 of `battle/RULES.md` declares true damage unmodified. The old path bypassed declarative multipliers but still ran skill and condition final-damage scripts. This reduced actual self-sacrifice template 59, used by catalog skill 20175, even though its text requires the user's HP to reach zero. True damage now bypasses these transforms as well. A non-OHKO true self-cost also bypasses the boss HP floor. Explicit foe OHKO damage still respects `immune_ohko` and an unbroken HP floor; the regression runner checks both protections. Existing revival or extra-life handling is preserved.

**AI estimates.** The estimate path applied outgoing multipliers without their predicates and ignored `multiplier_by_level`. It now evaluates the same kind and predicate constraints as damage resolution and selects the active condition's level multiplier. Estimation still performs no random draw or charge consumption. Its existing raw-damage scope is retained; this change does not introduce a complete defensive simulation for AI selection.

## Formula and type-chart checks

The regression fixture has level 50 and physical attack/defense 100 with power 100. The declared base is 46; matching-type STAB 1.5 at the maximum damage roll gives 69, and a critical multiplier of two gives 138. A separate case changes special attack and special defense to ensure that special skills select those stats. Negative attack stages and positive defense stages are exercised together. Burn halves both powered attack categories in the current damage chain and does not halve fixed damage. The runner also checks all five weakened multipliers, type immunity, HP-limited damage events and overkill, fixed-damage caps, and true-damage cap bypass.

These are checks of the current declared formula and rounding implementation. They do not determine the original placement of every floor, the burn multiplier's server boundary, the historical random distribution, critical probability across a population, or multi-hit RNG correlation. The root's separately implemented post-hit critical defense-stage clearing is outside this subagent's patch; the runner's critical case checks the damage multiplier, not that stage-clearing sequence.

The dual-type implementation is intentionally unchanged. The existing chart returns 0.5 for electric against ground/flying, 4 for grass against water/ground, and 0.75 for fire/ground against grass/flying. An initial audit hypothesis that the last example should equal 0.8125 was rejected after checking the grouping direction. The original author's [2018 controlled dual-type experiment](https://news.4399.com/gonglue/seer/jingyanxinde/825548.html) explicitly splits the defending types, combines the attacking pair against each, and averages those two results. Its twelve-battle comparison supports that grouping. The current catalog has 217 dual-type species, but all 5,325 skill type fields are single type identifiers; the dual-attacker branch is an API capability rather than an active dual-type skill in this snapshot.

## Official-client verification boundary

The cached decoded official client confirms a packet boundary, not a recovered damage formula. `com/robot/core/info/fightInfo/attack/UseSkillInfo.as`, lines 12–16, constructs two `AttackValue` objects from received `IDataInput`. In `AttackValue.as`, lines 123–126 read `lostHP`, `realHurtHp`, and remaining HP from that input; line 143 reads the critical flag. These inspected parsers consume damage and critical results supplied by the server. They do not calculate the underlying power formula or its rounding order. This is a focused parser inspection, not an exhaustive proof that no client module contains any related calculation.

The artifact came from the official [RobotCoreDLL.swf endpoint](https://seer.61.com/dll/RobotCoreDLL.swf), referenced through the official client/configuration loader chain. The encoded file's SHA-256 is `2405e1cb24f4a44fa6183c03a51357f58895a0a9ff1e5376a6506be53cfc493f`; the decoded file's SHA-256 is `ca040870b9150463f5858ac42d0e0c347380010e12ae16d02068dc78048ccd40`. Decoding skips the seven-byte loader prefix and then inflates the compressed payload. Both artifacts and extracted scripts are retained under ignored `.cache/classic-robots/`. This retrieved client snapshot does not by itself date or identify a pre-2013 server implementation.

## Reproduction and retained evidence

The reusable focused runner is [damage-audit.ts](../../tools/verification/damage-audit.ts). Run it from the repository root using the existing Vite dependency:

```sh
node --input-type=module - <<'JS'
import {createServer} from 'vite';
const server = await createServer({server: {middlewareMode: true}, appType: 'custom'});
try {
  const {runDamageAudit} = await server.ssrLoadModule('/tools/verification/damage-audit.ts');
  const result = runDamageAudit();
  process.exitCode = result.failed ? 1 : 0;
} finally {
  await server.close();
}
JS
```

The before/after comparison used the same runner and fixtures. The baseline is `battle/core/src/battle.ts` from commit `f22f5926509c233a4449e478f17e7138e084b7ea`, with source SHA-256 `db6c17518150824549f1f5ee6c142c884d893e8a5cead6beb9a7fe40977061e4`. A copy with import paths relocated for loading is cached at `.cache/damage-audit/battle-before.ts`. JSON observations are retained at `.cache/damage-audit/before.json` and `.cache/damage-audit/after.json`: baseline 16 passed / 12 failed; patched implementation 28 passed / 0 failed.

`npx tsc --noEmit` passed for the project's configured source scope. The runner was executed through Vite SSR; it is outside that TypeScript configuration. A separate attempt to type-check the runner could not resolve Node type declarations in the current dependency set. No new dependency was installed. Successful execution verifies the recorded cases, while the configured project type check verifies the affected core through its application imports.
