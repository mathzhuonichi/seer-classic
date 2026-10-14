# Battle-core performance review, version 22

Date: 2026-10-03. Scope: the current lower battle engine, raising lookup paths, catalog ownership, and representative deterministic controller initialization. Existing revision-19/20 changes are preserved. This pass changes rule lookup mechanics without changing combat formulas, capture behavior, acquisition routes, or save structure.

## Delivered change

`battle/core/src/battle.ts` previously constructed a new combined member/side rule array for every `rulesFor` lookup. Damage application, status blocking, end-of-turn recovery, flee rules, and trait/script queries repeatedly allocated and copied that array, including ordinary battles with empty rule sets.

The eleven first-match sites now use `findRule`, scanning the current member rules before the current side rules. Boolean checks similarly short-circuit across the two current arrays. The implementation retains member-rule precedence, notices additions to either array during combat, and introduces no rule cache or invalidation requirement. The arrays and rule objects retain their previous ownership and mutation behavior.

## Measurement

A local Node/Vite SSR benchmark alternates baseline and changed engines over nine batches after warmup. Each batch runs 600 battles across four deterministic scenarios: ordinary attacks/status, layered member/side rules, status/residual rules, and rules added during an active battle. Battles run for up to 60 turns; poison can end some cases earlier. Fixture HP is asserted finite.

| Measurement | Baseline | Changed |
| --- | ---: | ---: |
| Median elapsed milliseconds per 600-battle mixed batch | 130.63 | 98.60 |
| Ratio of changed to baseline elapsed | 1.000 | 0.755 |

This sample uses approximately 24.5% less elapsed time. It measures this engine workload in the local Node runtime; it is not a browser frame-rate, startup, memory-usage, or full-game speed guarantee. Raw batch variability is preserved in [profile.json](../../artifacts/core-performance-v22/profile.json).

## Behavior verification

- Four fixture scenarios across 32 seeds produce **128 exact baseline/changed trace matches**. Comparisons include full event lists, HP, PP, conditions, stages, live rule arrays, RNG state, turn, and result. The live-mutation scenario adds rules on turn two, before later turns execute.
- Five current source encounters across sixteen seeds produce **80 additional exact trace matches**: `boss_buleike`, `boss_campaign_xuanwu_guardians`, `boss_puni_zhenshen`, `boss_spt_hamoleite`, and `boss_spt_liaosi`. They use current catalog species/skills and actual Seer/campaign scripts; comparisons additionally include per-monster persistent script state. These are controlled battle traces, not a campaign-completion claim.
- Existing focused `battle-v3.ts` and `campaign-mechanics.ts` checks pass through Vite SSR.
- `npx tsc --noEmit` passed after the engine edit. Root integration owns the final build, browser checks, and package checks.

## Catalog/controller finding

The initial `loadCatalog` shallow spread shares the imported bundle's definition arrays and eager encounter objects. Before the controller ownership repair, repeated `createGame(loadCatalog())` calls append synthesized recruitment/fusion/cure items to the shared `items` array and write generated encounter rewards into the shared boss objects. The nine-controller probe left the shared registry with **10,211 items** and changed both original item and encounter JSON. That cumulative registry is not a new content dataset; it is reproduced controller-induced duplication.

The root integration owns the correction at the `createGame` boundary: copy the item array and clone mutable encounter records while retaining read-only species/skill/nature/type definitions. A whole-bundle deep clone or shared mutable dataset cache was not added in this lower-engine pass. The pre-repair snapshot is preserved in [catalog-before-ownership.json](../../artifacts/core-performance-v22/catalog-before-ownership.json); the post-repair probe passed and is summarized below.

The pre-repair nine-sample median timings are 0.195 ms for the warmed catalog loader, 0.664 ms for battle indexes, 0.329 ms for raising indexes, and 5.565 ms for controller creation. Index/initialization timings depend on that duplicated registry and are diagnostic evidence, not a clean startup comparison.

The post-repair probe creates nine controllers from the same loader-owned definitions and confirms that both the item array and encounter JSON remain byte-equivalent. The original catalog remains **51 items** after all nine controllers. The five actual encounters again pass all **80 exact trace comparisons**. The warmed loader median is 0.191 ms; battle indexes 0.559 ms; raising indexes 0.370 ms; controller creation 7.396 ms. These small timings are diagnostic and include root's current controller implementation, rather than isolating a lower-engine effect.

## Other inspected paths

Both battle `buildDataSet` and raising `makeDex` already index species, skills, and natures with maps. Raising creation sorts and deduplicates a short learnset on each call; changing this to a permanent species cache would introduce invalidation/ownership questions for mutable catalog fixtures. No measured evidence here justifies that added state. Controller snapshot/view rebuilding is owned by the root integration and is separate from these combat-rule measurements.

## Reproduction and handoff

The ignored [profile runner](../../artifacts/core-performance-v22/profile.mjs) compares the changed engine to an exact source snapshot taken before this edit, retained as `artifacts/core-performance-v22/battle-before.ts`. That snapshot includes the user's existing dirty combat fixes. Run `node artifacts/core-performance-v22/profile.mjs` from the repository root. The [catalog/controller runner](../../artifacts/core-performance-v22/catalog-profile.mjs) profiles the live catalog and compares actual encounter traces; its isolation booleans distinguish a passed engine comparison from a repaired ownership boundary.

Generated source snapshots and bulk measurements remain ignored. This pass made no commit, added no species acquisition routes, and did not alter artwork or presentation tools.

## Independent controller snapshot and presentation review

The final controller changes were reviewed separately from battle physics. `createCatalogViews` preserves row values while reusing unchanged metadata and collection rows. Its collection cache follows the current save contract: normal actions append owned species, while imports and resets replace the ledger array. `persist` rebuilds its owned/seen sets on reference or length changes and appends newly evolved/current storage species before refreshing the controller snapshot. No normal internal path swaps ownership IDs in place without changing the ledger reference or length.

`advanceBattlePresentation` copies the affected team array and member, and copies nested stages/status/type data when it changes those fields. Irrelevant events leave the current presentation state intact. `recordAnimation` can therefore retain earlier event states directly without changing their displayed historical values. Species lookup accepts either the original array API or the battle dataset's map.

The independent baseline/current verification passed:

- **336 complete controller snapshot comparisons** across seven controlled scenarios and sixteen seeds: enemy knockout/switch/drain, bench revive/heal/player switch, extra-life revival, three-hit attacks, stage boosts/clears, transformation, and lethal recoil. Assertions confirm the intended events actually occur; this is not merely equivalent rejection of invalid actions.
- **1408 retained animation frames** remain value-identical after later actions. Comparisons include each intermediate party/enemy-party snapshot, visible active member, HP, stages/statuses, frame metadata, logs, item state, and collection rows.
- **Twenty synthetic presentation events** replay identically through the old deep-clone implementation and the new implementation with both species-array and species-map inputs. Earlier states are recursively frozen and remain unchanged. Coverage includes slot-specific bench events, name routing, invalid slots, maximum-HP clamping, revive/lives resets, status removal, stage clears, switch-out/in, transformation, and skipped message events.
- Imports with equal-length different ownership sets (adult 21 versus seed 19), partial/full 19–21 family membership, and reduced collections produce identical snapshots and saved ledgers. Reset produces identical fresh collection state. Five additional action comparisons cover both forward starter evolutions, a fixture level preparation, acquisition-ledger append, and unchanged refresh.

No correctness counterexample was found in these checks. Controlled preparation/modifier actions isolate ledger/presentation behavior; they do not expand normal acquisition coverage. The ignored [controller equivalence runner](../../artifacts/core-performance-v22/controller-equivalence.mjs) and [results](../../artifacts/core-performance-v22/controller-equivalence.json) preserve the exact verification scope. The comparison baseline is `.cache/battle-media-v22/baseline-game.ts`; both controllers use the same current battle core, so this review isolates controller/view changes rather than changing or re-certifying battle formulas.
