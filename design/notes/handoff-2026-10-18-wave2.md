# Handoff, 2026-10-18: refactor wave 1 merged, wave 2 ready to start

Continue on branch `claude/refactor`. The target is `architecture-v2.md`, which the user approved on 2026-10-18: feature modules, a `domain/` layer and AI turn preparation.

## Rules for the next session

- **Load budget.** The 10-core, 16 GB Mac stalled when 11 worktree agents each ran Vite suites.
  - Run at most 4–5 agents at once, each with `nice -n 10` and `run.mjs --jobs 2`.
  - Only the coordinator runs `npm run verify`, `battle-clone-fidelity-v58` and `battle-ai-liveness`, one at a time.
- **Architecture first.** Contracts, the module tree and the gate land before implementation agents start (§6 Step 0).
- **Worktrees.** Agent worktrees were created from `main` (04d6196), not from the current branch. Every worker had to `git reset --hard <base>`. Tell workers the exact base commit.
- **No remote.** `origin` is a read-only git bundle and `gh` is missing. Workers commit locally, and the coordinator merges.
- **No localhost in workers.** Workers cannot connect to localhost: a Vite smoke test over HTTP fails with EPERM. Use Vite `transformRequest` in-process instead.

## State at the end of this session

- **Wave 1 is merged:** 11 units, see `CHANGELOG.md` and the merge commits since 837d84e.
  - The engine is split into `battle/core/src/engine/` with an injected `BattlePolicy` and a single estimator.
  - The scripts are table-driven.
  - The controller is in `src/controller/`, about 25 modules.
  - Saves are version 2, with migrations and a backup of an unreadable save.
  - One catalog assembly and pure acquisition builders.
  - The battle UI, shell, world, raising, collection, shop and challenge screens are split into hooks and pure presentation modules.
  - Docs: `INDEX.md`, `ARCHITECTURE.md`, `CHANGELOG.md`.
- **Checks at the last code commit:**
  - typecheck clean, `npm test` 88/88, build passes.
  - `npm run verify` passes 56/57 in 2 min 15 s. That run includes clone-fidelity, now 81 s, and liveness, 134 s.
  - The one failure is `paid-spt-controller`, which is now `known-failure`; its note gives the cause.
- **Code size:**
  - Wave 1 made the code modular but not smaller: `src` production code grew from 616 KB to about 713 KB, and the engine from 235 KB to 257 KB.
  - Wave 2 is where it is meant to shrink: the UI rule mirrors, the transitional getters, `gamedata.json`, and the suite boilerplate and superseded suites.

## Step 0 (coordinator, before any wave-2 worker)

The tools are in `tools/refactor/`. They are one-off; delete them after Step 0.

1. Run `node tools/refactor/feature-moves.mjs . --apply`.
   - It moves files with `git mv`.
   - It rewrites the relative imports, globs and `new URL` specifiers.
   - It also rewrites the `/src/...` and `src/...` path strings in suites, Python tools and docs.
   - It was rehearsed on a clone, but before the domain rules were added and before unit 1 merged. That rehearsal gave typecheck clean, 83/83 tests, a passing build and 49/54 gate suites; the 5 failures were only the git-ignored HD maps, which a clone lacks.
   - Run it without `--apply` first to see the table. The only unmatched file is `src/mechanics/INTEGRATION.md`; fold it into `ARCHITECTURE.md`.
2. Commit the move alone.
3. Run `node tools/refactor/feature-indexes.mjs .`.
   - It writes `src/features/*/index.ts` from what outside code imports, and points those importers at the index.
   - Then rename `kernel/runtime.ts` usage to `kernel/api.ts` as needed (the move already lands `runtime.ts` as `api.ts`), and make `api.ts` re-export the `GameContext` and `GameSave` types.
4. Split the contract:
   - Move `MonsterView`, `SkillView`, `ItemView`, `BossEvidenceView` and the opponent views into `src/shared/views.ts`.
   - Put each feature's slice and action types in `features/X/types.ts`.
   - `kernel/contract.ts` composes them.
   - `dispatch` returns `DispatchResult` (`{ok, notice?, created?}`).
   - Add a `useGame(selector)` hook in `shared/ui`.
5. Move the gate:
   - Move `tools/refactor/architecture.mjs` to `tools/verification/`.
   - Run it with `--write-baseline` and register it as `gate`.
   - On the rehearsed layout it found about 114 import violations and 57 oversized files after step 3.
6. Update `AGENTS.md` rule 1 to the new layers, and rule 4 so that feature `index.ts` and `kernel/api.ts` are the only re-export modules. Rewrite `ARCHITECTURE.md` from `architecture-v2.md`.
7. Run typecheck, tests, build, the full verify and the gate, then commit.

## Wave 2 units (at most 4 agents at once, disjoint directories)

- **B. Battle:**
  - split `battle/ai` out of `battle/core`;
  - make `BattleEvent` a union and type its consumers;
  - turn preparation (`battle.prepare` at turn open), with a replay-identity gate and a decision-latency gate;
  - move the start-challenge actions (`startTower`, `startFacility`, `startCampaignStage`) to challenges and the wild `startTraining` to world, through a battle session API plus settlement hooks;
  - the battle UI on typed events.
- **C1. Collection and raising:**
  - acquisition views from the controller's catalog (`buildAcquisitionViews`), then delete the import-time getters and `bundledCatalog`;
  - dex, fusion and breeding recipe rows in the snapshot, then delete `dex-view`, `fusion-view` and `breeding-view` rule calls;
  - active boosts in the snapshot;
  - nickname `maxLength={NICKNAME_MAX}`;
  - consolidate `monster-views`, `party-order` and `speciesNamer` into `shared`.
- **C2. Items and engravings:**
  - add `EngravingView.equipMode/transferFrom/canBuy/owned`, then delete `engravingAccessView`;
  - add `ItemView.useTargets/useAction`, then delete `itemUse`;
  - the `DispatchResult` feedback replaces `notices[0]`;
  - make `engravingOptions` and `ShopItemView.maxQuantity` required;
  - one source for the supply-category labels.
- **D. Challenges, world, app:**
  - `BraveTowerView.position`, `CampaignView.reward`, and encounter category ids from `CHALLENGE_CATEGORY`, with a shared quest-claimable predicate;
  - remove the literal "70 层";
  - `WorldMap` uses `braveTowerPosition`;
  - one reduced-motion helper.
- **E. Tools** (after one of the above finishes):
  - **Harness sweep** over the remaining suites.
  - **Remove `data/gamedata.json`:**
    - move the 12 battle-side readers to `loadCatalogNode`;
    - `build_evolution_rules.py` stops writing the file, and `export_original_skill_effects.py` reads `skills.json`;
    - regenerate the `acquisition-policy.json` provenance;
    - delete `readGameData`.
  - **Suite fixes and pruning:**
    - drop the `SeededRng` alias, which 9 suites import;
    - delete or rewrite `battle-capsule-click`, which reads `Battle.tsx` source;
    - give `game-display-v43` a pure seam for the TypeFilter/TypeIcon handlers;
    - seed `paid-spt-controller`;
    - delete superseded historical, stale and known-failure suites;
    - consider `needs-assets` for challenge-navigation, station-navigation-v53, puni-location-v38 and graphical-atlas.

## Smaller follow-ups found by wave-1 workers

**Documentation:**
- `raising/SPEC.md` (lines 5, 182, 187) and `data/README.md:3` cite the deleted `foundation.md`.
- `data/scripts_needed.md` is cited by `battle/core/SCRIPTS.md` and the script headers, but the file does not exist.
- `battle/RULES.md` §5.1 should describe the probe-based AI estimate.
- `SCRIPTS.md`'s `power` row should say that the probe calls it with `c.estimate = true`.
- Mark `handoff-2026-10-18.md` item 1 resolved.

**Distribution:**
- `tools/distribution/pack_source.py` `SOURCE_FILES` misses `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `CHANGELOG.md` and `preview.html`. Then fold `DELIVERY.md` into `CHANGELOG.md`.
- `SOURCE-MANIFEST.json` lists deleted files.
- `tools/assets/download_original_maps.py` must also scan the world `classic-planets.ts`.

**Code:**
- Move `scripts/constants.ts` into `battle/core/src/constants.ts`.
- `game-types` `StatKey`/`Stats` duplicate `raising/core`.
- `setEvs` should use `STAT_KEYS` and `evTotal`.
- `EvolutionChoiceView.ready` is redundant.
- The controller should use `bossEssenceRewards`, `interceptedFieldSpecies`, `STARTER_SPECIES` and `JOURNEY_QUEST_SPECIES` instead of its inline copies.
- `battle-presentation.ts` is pure and belongs in the battle feature.
- `MonsterInput` cannot carry permanent conditions, so traits are still pushed into `mon.conditions`. This is an engine decision.
- `downloadSave` revokes the blob URL synchronously.
- The version string "0.3.2" duplicates `package.json`.

**Known UI quirks kept on purpose:**
- the EngravingShop filter persists across a monster switch;
- the PetBag picker tab has no fallback;
- 移装至 and 移装到 are both used;
- Raising tab drafts reset on a tab switch (accepted).

**Search AI weaknesses** (handoff item 2): `potion-ai-v48`, `holder-ownership-v47` and `elite-recovery-v49` stay `known-failure`.

## Product review at the end of this session

The user asked whether the game is reasonable yet in four areas: architecture, player guidance, UI design and appearance, and gameplay. The scope is PvE and simulated PvP only, with no story. The answer is in the session summary; the open product gaps are:

- **No onboarding.** The repository has no tutorial, guide or first-run hint. The only guidance is the three journey quests (first win, three wins, any SPT).
- **No difficulty curve check.** The game starts with starters at Lv 5 and coins 1000. Facility opponents are full Lv 100 parties. No suite checks that a new player can progress, by level or team strength, from the first SPT to the campaigns, the tower and the facilities.
- **No visual review.** No screenshots or browser playtest were taken during the refactor. The first item for the next session is a manual playtest with screenshots, using claude-in-chrome or the Tauri build.
