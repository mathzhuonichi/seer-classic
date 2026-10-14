# Initial-form acquisition entries, version 23

Date: 2026-10-03. Scope: encyclopedia acquisition navigation and its initial-form route model. This development change preserves existing internal species routes, retained IDs, named adult rewards, and implemented forward evolution rules. Source-backed paid initial-form quests add their own seed routes through the existing dependency closure.

## Behavior

Every encyclopedia acquisition button now targets a real initial form's own direct acquisition action. Later-form entries display the initial form and its acquisition action, with subsequent evolution requirements in a separate paragraph. A selected adult's direct challenge reward is never substituted for an unavailable initial form.

For example, the existing challenge reward for 21 电击兔 remains represented internally. Its ancestry leads to initial form 19 利利. Without a real acquisition action for 19, the entries for 19, 20 绵绵, and 21 show that the initial acquisition entry is unimplemented; they do not link the adult challenge as an infant route. No reverse evolution or generic remote recruitment is introduced.

The same rule applies to starter evolutions and fusion lines: 3 targets gift 1; 6 targets gift 4; 9 targets gift 7; 303 targets fusion infant 301, 306 targets 304, and 309 targets 307. A source ancestry link with no implemented forward level transformation displays an unimplemented evolution requirement, rather than asserting that the target follows from its available root.

## Model and integration API

`buildInitialFormAcquisitionIndex(catalog, acquisition)` builds a directed predecessor graph from both `evolves_from` and explicit forward evolution edges. For each selected species, breadth-first traversal identifies ancestor roots and retains the shortest path to each root. Multiple ancestor roots remain distinct choices. An unrelated sibling never supplies an entry, and a rootless cycle does not invent an initial form.

Each initial entry contains its species ID, name, direct routes whose `entrySpecies` equals that root, and a separate evolution path. `getInitialFormAcquisition(id)` exposes the current model to the encyclopedia. `Dex` passes the initial ID and original initial route to `onLocate`; it does not manufacture a new route or invoke controller recruitment directly.

`buildAcquisitionIndex` additionally accepts a fourth `additionalSeeds` parameter containing `{species, route}` records. Seeds are inserted before the existing fusion/evolution least-fixed-point computation. A real paid initial-form quest can therefore unlock that initial species and its executable descendants without relabeling an adult challenge reward. Unknown species IDs are ignored through the existing catalog guard, so fixture catalogs do not acquire external entries. The default seed set is now supplied by `buildPaidAcquisitionSeeds(catalog)`, which delegates to the source-backed `buildPaidSPTRecruitments` registry. All required named ordinary SPT records must exist, and a zero-prerequisite task supplies no route. The current registry contributes 42 initial-form quest seeds. Supplying an explicit empty fourth parameter disables these extra seeds for baseline and miniature fixture checks; it does not alter normal runtime defaults.

## Verification

The focused `tools/verification/base-form-acquisition.ts` runner passed checks for all 1,483 initial models and these specific cases:

- 19/20/21: adult route retained internally, unavailable initial entry hidden.
- Starter and fusion infant navigation.
- Split source branches with the correct ancestor root.
- Multiple roots, differing path lengths, and shortest paths to each root.
- Ancestry without an executable transformation, unsupported rootless cycles, and sibling adult reward rejection.
- Injected paid initial quest followed by executable forward evolution; out-of-catalog seed exclusion; all 42 current default paid seeds appear as matching quest routes; no automatic paid seed in an empty miniature SPT catalog.
- Explicit NPC exclusions and every advertised route's initial species identity.

Rendered encyclopedia checks also passed for 19, 20, 21, 3, 303, 306, 309, and 413: the number of navigation buttons exactly matches the real initial-form route count. The unavailable 19 entry displays no navigation button on any of 19/20/21, while starter/fusion examples each display their initial acquisition action. The ignored render-check runner retains HTML snapshots and its result JSON.

TypeScript passed after the initial implementation. The ignored `artifacts/base-form-acquisition-v23/run.mjs` replays the focused tracked test through Vite SSR; `checks.json` preserves the result. No package or production build was requested for this development pass.

## Recruitment exclusion cross-check

The current retained catalog identifies 945 as 斯宾塞, 997 as 皮特萨罗, and 1477 as 弗希斯. Their corresponding encounter records are ordinary SPT challenges. They are distinct from the divine collection campaigns: 501 巴斯特, 502 朵拉格, 503 泰格尔, 504 菲尼克斯, 505 阿瑞斯, and 300 谱尼. The recruitment registry derives its exclusions from the actual non-Rei collection campaign species plus both NPC partner families and their ancestry. Ordinary SPTs are not removed on a numerical guess about divine identity.

## Final controller and task-panel consistency review

The actual controller and task panel now match all **42** default recruitment definitions. For each task, a controlled save-progress fixture verifies its exact ID, initial reward species, prerequisite IDs, rejection of repeated victories on only one required boss, rejection while one prerequisite is missing, one successful initial-form reward after all required clears, collection registration, rejection of a second claim, and persistence of both claimed status and owned species after reload. Prepared progress isolates the task transaction; this review does not defeat the prerequisite battles.

Server-rendered focused task-panel checks pass for every recruitment task: one focused task article and its five exact prerequisite encounter buttons. All **36** recruitment roots with an executable next evolution also pass rendered adult encyclopedia checks that identify the correct initial form and its initial quest link. The starter, fusion, missing 19/21, and Seville 413 → 412 examples retain their previously verified initial-only navigation. App source inspection confirms that a quest route opens its exact `questId`, and each prerequisite button travels using the actual existing boss view. These are source/SSR checks, not a live pointer-interaction browser test.

The ignored [controller/task review](../../artifacts/base-form-acquisition-v23/controller-quest-review.json) and its runner preserve the complete 42-task evidence.

## Current acquisition coverage

This post-integration count includes actual initial recruitment tasks, the Seville initial essence route, and executable forward level evolution/fusion dependencies. Ancestry used for display/family grouping does not itself grant acquisition.

| Species coverage | Version 21 | Current version 23 |
| --- | ---: | ---: |
| Retained species | 1,483 | 1,483 |
| Excluded NPC forms | 4 | 4 |
| Eligible species | 1,479 | 1,479 |
| Species with implemented normal routes | 367 | 451 |
| Missing eligible species | 1,112 | 1,028 |
| Direct acquisition species | 193 | 237 |
| Evolution-only species | 174 | 214 |

| Eligible family coverage | Version 21 | Current version 23 |
| --- | ---: | ---: |
| Complete | 110 | 147 |
| Partial | 62 | 69 |
| Entirely missing | 460 | 416 |
| Total eligible families | 632 | 632 |

The 84 additional obtainable species comprise two Seville forms and 82 species added by the recruitment dependency closure, including newly enabled fusion/evolution outputs. Without the new recruitment seeds, the current source reaches 369 species. Fusion now supports 23 of 34 recipes and 22 of 33 infant outputs, compared with 22 recipes and 21 outputs previously. Fifty-five species depend on fusion, compared with 53 previously.

The 1,028 missing forms partition into 27 unsupported transformations from obtainable predecessors, 263 wild-metadata forms without an executable habitat, 229 missing base acquisitions, and 509 descendants with unavailable predecessors. No explicit named infant reward binding remains missing. The unsupported-transformation group can grow when newly available predecessors expose previously unreachable missing upgrades; this does not mean the change removed an existing transformation.

A complete current [missing-species CSV](../../artifacts/dex-acquisition-v23/missing-species.csv), [family list](../../artifacts/dex-acquisition-v23/acquisition-families.md), [route audit](../../artifacts/dex-acquisition-v23/audit.json), and [independent dependency closure](../../artifacts/dex-acquisition-v23/dependency-audit.json) are retained under ignored artifacts. Current counts sum exactly to 1,483 = 4 excluded + 451 obtainable + 1,028 missing.

The exhaustive legacy runner formerly depended on `createGame` mutating its caller's catalog. The corrected controller ownership boundary invalidates that verifier assumption. A focused ignored copy derives essence-binding metadata independently while retaining actual selected victory/hatch/reload fixtures. This adapted audit passes 234 executable level-edge checks, all mapped captures, current named encounter destinations, and an independent least-fixed-point matching all 451 available IDs. Derived binding metadata is distinguished from a complete natural victory/hatch replay. The ordinary Seville route remains a period-source/user-approved solo adaptation; it is not added to the stricter original-client-table prerequisite whitelist on an unverified boss-number/map claim. Recruitment prerequisite definitions remain unchanged.
