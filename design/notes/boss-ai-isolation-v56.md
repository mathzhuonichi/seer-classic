# Boss and trainer AI isolation

V56 restores the project's pre-V36 Boss policy and confines the later tactical planner to encounters whose runtime side kind is `trainer`. This category includes the ten authored NPC teams and the random, elite, and classic battle facilities. Tower, dark-door, legendary, SPT, story, and event encounters remain Boss encounters.

The restored implementation comes from `battle/core/src/ai.ts` at Git commit `d7e87e9821e232398d434c4b2fe223545d9c7218`, immediately before `f951d1c` introduced the tactical planner. It is historical local project behavior. It is not recovered official Seer server AI, and does not establish an official move-selection probability.

## Dispatch and policy

`ai.ts` sends smart trainer actions to the existing `tacticalAction`. Other smart sides use `legacySmartPick` from `legacy-ai.ts`:

1. Among attacks whose estimated raw damage can knock out the target, choose the highest priority, then highest raw damage. Preserve equipped order for remaining ties.
2. Otherwise choose the first equipped status skill that has not been used.
3. Otherwise choose the greatest positive raw-damage attack, preserving equipped order for ties.
4. If no damaging candidate exists, select a usable move with the existing seeded RNG.

This intentionally retains the old evaluation through `estimateDamage` and `priority`, including actual opponent stats and applicable live hooks. Trainer scoring retains its public-information, read-only calculations. The two policy contracts are different; the oracle checks that the Boss contract matches the old source on the current engine.

Random, weighted, sequence, script, and forced-skill branches remain in place. A Boss with no usable PP uses Struggle. Only a smart trainer may invoke tactical medicine planning for exhausted PP. Existing encounter `choose_action` hooks still run before generic move selection, and existing HP-phase policy changes remain effective.

`chooseAiReplacement` applies the same trainer-category boundary to both engine replacement paths: automatic replacement after a knockout and explicit replacement-phase action dispatch. Bosses use the first living reserve in team order, even if an encounter accidentally carries `allow_switch: true`. Trainers retain tactical reserve selection. A Boss cannot gain voluntary tactical switching or medicine use through that flag.

The tactical scoring module, item effects, species stats, skills, and passive ownership rules are unchanged by this AI isolation. The evil seal's extra 30 fixed damage continues to belong only to the actual holder with an active `npc_gaia_evil_seal` condition; neither a Gaia species identity nor a teammate's seal grants it. The legacy raw-damage estimator itself does not add that on-hit fixed-damage bonus.

## Validation

Run the new regression from the repository root:

```sh
node tools/verification/boss-ai-isolation-v56.mjs
```

The V56 test loaded the complete historical AI module directly from Git into a separate Vite virtual module. It did not derive its expected decisions by copying the new helper. Both policies ran against equivalent current-engine states; actions, RNG state, cursor changes, forced-skill consumption, and other decision state were compared.

Since wave 3 (2026-10-18) the suite is a self-contained gate and no longer reads Git. The decisions that module made on the synthetic fixtures are recorded in the suite with their RNG draw counts: the random, weighted, sequence, script and default wild policies, the no-damage fallback and the weighted HP phase. Every catalog Boss member is held to `legacySmartPick` on an identical battle, with equal RNG draws, no other decision side effects and no planner decision.

The V56 run passed all 12 check groups:

- All 180 catalog Boss encounters, comprising 240 members, match the oracle in six states each: full HP, injured, previously used skills, a one-HP target, partial PP depletion, and total PP depletion. This gives 1,440 comparisons.
- Synthetic cases distinguish old setup/heal behavior from trainer planning, preserve KO priority and equipped-order ties, and exercise fallback randomness, random/weighted/sequence/script/forced policies, exhausted PP, accidental Boss switch flags, and both engine replacement paths.
- Actual Moduosa `choose_action` behavior and the existing weighted Boss HP phase remain active.
- All ten authored trainers plus one generated random and one generated elite facility team retain tactical dispatch for every member: 72 member cases. Decisions remain read-only.

The existing `battle-ai.mjs` regression also passed 39 groups and 120 authored-trainer states. The existing `holder-ownership-v47.mjs` regression passed 13 groups across all 48 trait definitions and selected dynamic effects. Its same-species Gaia switch test observes fixed damage `30, 0, 30`, and its team-gift tests do not transfer the seal.

These runs used middleware-only Vite servers, disabled WebSockets and file watching, and separate cache directories under `artifacts/.validation-cache`. They did not open a listening port, run the desktop app, change a browser save, or restart a user development server. Generated reports are under `artifacts/boss-ai-isolation-v56`, `artifacts/battle-ai`, and `artifacts/holder-ownership-v47`.

The evidence establishes the intended category separation and equivalence to the local historical policy for the covered states. It does not certify official historical AI, every battle script combination, or every possible long battle. Boss level/stat evidence is tracked separately by the encounter audit.
