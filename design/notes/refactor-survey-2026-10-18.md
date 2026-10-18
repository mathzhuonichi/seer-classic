# Repository refactor survey, 2026-10-18

A read-only survey of the repository at commit `3f332e7`, with the V57 planner retirement in progress. The user approved refactoring the whole repository (simpler, modular, efficient, YAGNI). Line numbers refer to that commit and may have shifted.

## A. Tooling and verification

- **A1. Missing scripts.**
  - `package.json` has no `typecheck`, `test` or `verify`.
  - Three `node --test` files are never run: `src/progression/brave-tower.test.mjs`, `src/audio/game-audio.test.mjs` and `src/audio/action-sounds.test.mjs`.
  - `battle/core/package.json:7-14` declares scripts whose targets do not exist (`test/`, `tools/`, `tsconfig.json`). `battle/core/src/data.ts:2` cites a missing `tools/load-data.ts`.
  - The whole-suite runner lives outside the repository (`../analysis/run-verification.mjs`).
  - Fix:
    - Add `typecheck`, `test` and `verify` scripts.
    - Move the runner in.
    - Delete the dead `battle/core/package.json` scripts.
- **A2. Boilerplate.** `tools/verification` has 85 files and about 11,700 lines, more than three times the size of the engines. The same code is repeated across them:

  | Pattern | Files |
  | --- | --- |
  | Vite `createServer` | 53 |
  | Report writing | 58 |
  | Hand-rolled `check()` (six variants) | 40 |
  | `localStorage` stubs | 25 |
  | Source hashes | 28 |

  Add `tools/verification/_harness.mjs` with `withSsr`, `suite()` (`check`, `witness`, `finish`), `memoryStorage`, `offlineFetch`, `sha256File` and `loadCatalogNode`. Migrate the scripts opportunistically.
- **A3. Stale suites.**
  - These already fail at V30: `challenge-navigation.ts`, `graphical-atlas.mjs`, `habitat-regions.mjs`, `puni-location-v38.mjs`, `solo-challenges.ts` and `trainer-teams.mjs`.
  - These need ignored assets: `battle-animation*`, `battle-hd-*`, `battle-offline-clip` and `skill-effects-hd-v44`.
  - These need `.cache`: `breeding.mjs`, `calculator-parity.ts` and `damage-official-v25.ts`.
  - These load fixed Git revisions: `switch-policy-v47`, `elite-recovery-v49`, `battle-observe-v58`, `boss-ai-isolation-v56` and `evolution-specials`.
  - Some pin brittle counts, for example `game-v3.ts:11` (1483 species).
  - Fix: add `tools/verification/MANIFEST.json` giving each suite a status: `gate`, `needs-assets`, `needs-cache`, `historical`, or `stale`. Only `gate` suites gate.
- **A4. Tests that rewrite production source text.** 11 suites use Vite `transform` hooks.
  - `boss-evidence-controller-v56`, `battle-supplies-v48` and `unlimited-access-v50` splice code before the literal `for(const event of battle.initialEvents)` in `src/game.ts`.
  - Other suites append exports to private functions, or rewrite React `useState`.
  - Fix: give tests a real seam, either `createGame(..., {onBattleCreated})` or a battle-setup module (C2).

## B. Duplication

- **B1. The catalog is assembled four ways.**
  - `src/mechanics/catalog.ts` is one.
  - Import-time globals in `src/progression/acquisition.ts:256-260` and `spt-recruitment.ts:95-96` are two more. They bypass the catalog passed to `createGame`.
  - 22 tools read `data/gamedata.json` by hand.
  - Fix:
    - Make the builders take the catalog.
    - Have one `assembleCatalog` shared by the browser and Node loaders.
  - Verify that `export-acquisition-status.mjs` still gives 453/1479.
- **B2. Controller re-implements raising rules.**
  - `game.ts:630-633` `reorderParty` duplicates the otherwise unused `raising/core/storage.ts:77` `setPartyOrder`.
  - `setEvs` (`game.ts:634-640`) and `cheatMonster` (`game.ts:783`) hard-code 255, 510, 31 and 100. `EV_STAT_CAP`, `EV_TOTAL_CAP`, `IV_MAX` and `MAX_LEVEL` already exist.
- **B3. Chinese label maps are defined repeatedly.**
  - Stat labels appear in 6 places: `game.ts:42`, `Modifier.tsx:6`, `Raising.tsx:14`, `Dex.tsx:11`, `EngravingShop.tsx:9` and `boss-evidence.ts:13`.
  - Status labels appear in 3 places, although `BUILTIN_CONDITIONS` carries `name.zh`.
  - Type labels appear in 2 places, and the two have already drifted (`steel`).
  - Fix: one `src/presentation/labels.ts`.
- **B4. Two damage estimators.**
  - `battle.ts` `estimateDamage` re-applies only `modify_damage_dealt`.
  - `probeDamage` runs the full pipeline.
  - Fix: after the AI work, define the estimate as the probe at the mean roll, or delete it. Re-measure Boss and wild AI.
- **B5. Saves.**
  - `raising/game/save.ts` has an empty `MIGRATIONS` and `SAVE_VERSION = 1`.
  - Real repairs run in `game.ts:229-264` on every `persist()`.
  - A parse failure silently replaces the save.
  - Fix: a versioned one-time migration, plus a backup of an unreadable save.

## C. Layering and module size

- **C1. The engine imports the AI.**
  - `battle.ts` imports `chooseAiAction`/`chooseAiReplacement` from `ai.ts`, which is a cycle.
  - Fix: inject the policy through `BattleOptions`, wired by `index.ts`. This also replaces the tournament's source transform.
- **C2. `src/game.ts`** is 75 KB, and `createGame` is one closure with 42 actions.
  - The `snapshot` line at `game.ts:395` is about 2,350 characters long.
  - Battle assembly lives in `start()` (`537-564`): engraving math, encounter normalisation, script registry merge, wild level `0.85`, and traits pushed into `mon.conditions`.
  - The reward economy (`493`, `524`) and the starter values (`113`, `238-240`) are inline numbers.
  - Extract, each in its own step:
    1. `battle-setup.ts`, with traits passed as `MonsterInput`.
    2. `rewards-economy.ts`, with named constants.
    3. The snapshot builders.
- **C3. `battle/core/src/battle.ts`** is about 94 KB. After C1, move the effect-op interpreter to `effects.ts` and the damage pipeline to `damage.ts`, keeping one-line method delegates for scripts.
- **C4.** `game-types.ts:37` marks `facilities?` and `braveTower?` as optional although they are always set. Three components re-normalise them as a result. Make both required.
- **C5.** `BattleEvent` is `{type: string; [k: string]: any}` (`types.ts:230`). Make it a discriminated union, and type `variants`.

## D. Dead code and magic numbers

- **D1. Unreferenced code:**
  - `BURN_DAMAGE_MULTIPLIER` and `STATUS_DOT_FRACTION`: use them in `builtin-conditions.ts` rather than delete them.
  - `raising/core/potential.ts`
  - `partyOf` and `swapWithBox`
  - `hasSkillEffect`, `hasBattleAnimation`, `findFusionRecipe`, `getPaidSPTRecruitment` and `clearLocalSave`
  - The empty `fifthSkills`/`soulMarks` module placeholders, and `moduleCounts` / `snapshot.modules`
  - The alias `loadGameData`
- **D2. Encounter variants:** the engine supports them, three Boss files use them, but the game never passes `variant`. Decide whether to expose them or delete them.
- **D3. Magic numbers:**
  - The damage formula constants (`battle.ts:861`)
  - The default catch rate 45
  - The wild level 0.85
  - The economy values
  - `encounter-level.ts:3` uses 100 instead of `MAX_LEVEL`

## E. Documentation

- **E1.** `design/foundation.md` describes a monorepo that does not exist, and says there is no world map. Rewrite it as a short `ARCHITECTURE.md`.
- **E2.** `design/notes` holds 121 notes with no index.
  - Add `INDEX.md` with each note's status.
  - Move the README revision log to `CHANGELOG.md`.
  - Mark the V57 notes as superseded.
- **E3.** `src` has 257 extensionless relative imports. Standardise on explicit `.ts`/`.tsx`, so that pure modules run under `node --test`.

## Ranked plan

1. A1 scripts, and moving the runner in
2. A3 manifest
3. D1 + C4 dead code and required snapshot fields
4. B2 + D3 rule constants
5. A2 harness
6. B1 single catalog
7. A4 + C2 step 1 battle setup and test seam
8. B3 labels + C5 typed events
9. C1 policy injection + B4 one estimator
10. E docs, then C3 `battle.ts` split and B5 migrations

## Proposed `AGENTS.md` rules

1. **Imports point down only:** components → presentation → controller → progression/mechanics → `raising/core` and `battle/core` → `data/`.
   - The engine does not import the AI; the policy is injected.
   - Components render the snapshot and dispatch actions. Existing exceptions are debt; add none.
2. **One source per rule:** stats from `raising/core/stats.ts`; damage from the engine pipeline; limits from the raising constants; the catalog from one loader; labels from `labels.ts`.
3. **No unnamed rule numbers.** Battle numbers go in `constants.ts`, economy numbers in `economy.ts`, and data-driven values in `data/`.
4. **YAGNI:**
   - No placeholders, single-value options or alias exports.
   - Delete code with its last caller.
   - Replace an old version instead of adding a version switch.
5. **No test hooks in production, and no source-rewriting tests.**
6. **Verification:**
   - New checks use the harness and are registered in `MANIFEST.json`.
   - A behaviour change updates or deletes the old assertions in the same commit.
   - Run `typecheck`, `test` and the gate `verify` before committing.
7. **Saves:** change the format through `MIGRATIONS` with a version bump. Never overwrite an unreadable save.
8. **Size:**
   - New or changed functions stay under about 80 lines, and lines under about 160 characters.
   - Do not grow `game.ts` or `battle.ts`; extract instead.
9. **Documentation:** design notes are history, and `RULES.md`/`SPEC.md` are the current truth. Index every note with a status.
10. **Concurrency:** keep commits small, use one worktree per agent, and do not reformat whole files.
