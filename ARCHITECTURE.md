# Architecture

Seer Classic is a TypeScript and React browser game, packaged for the desktop with Tauri. Game content is plain JSON under `data/`. Two pure rule libraries sit on top of it: the battle engine (`battle/core`) and the raising rules (`raising/core`). The application in `src/` is a controller kernel with feature modules, rendered with React. The rules themselves are in [battle/RULES.md](battle/RULES.md) and [raising/SPEC.md](raising/SPEC.md); the rules for changing code are in [AGENTS.md](AGENTS.md). This document describes the code as it is; [architecture-v2](design/notes/architecture-v2.md) is the wave-2 target.

## Principles

1. **Data is plain text.** Species, skills, natures, types, conditions, items, encounters and remake policies are JSON files under `data/`. Rule numbers that are not data are named constants (AGENTS.md rule 3).
2. **The battle engine is a pure, deterministic library.** Its input is two sides, a seed and actions; its output is a list of events. It has no UI, clock, I/O or global randomness, so the same seed and actions replay the same battle.
3. **Presentation is a thin client.** Screens render a snapshot and dispatch actions; they do not compute rules. Rule mirrors still left in components are debt that wave 2 moves into the snapshot.
4. **Skill effects are declarative ops**, with a named `script` escape hatch for unique effects.
5. **Headless first.** Every rule can be exercised from Node without a browser.

## Layers

Imports point down only (AGENTS.md rule 1):

```
src/app          the shell: App, navigation, panels, audio settings, the preview fixture
     ↓
src/kernel       the controller: createGame, dispatch, snapshot, saves
     ↓
src/features/*   battle, raising, collection, items, engravings, challenges, world
     ↓
src/domain       pure content and rules that several features use
     ↓
src/shared       view types, labels, display helpers; src/shared/ui is the UI kit
     ↓
battle/core   raising/core
     ↓
data/
```

The gate suite `tools/verification/architecture.mjs` checks every relative import under `src/`, `battle/` and `raising/` (full rules: architecture-v2 §4):

- `battle/core` imports only itself, `raising/core/stats.ts` and `data/`; `raising/core` only itself, `battle/core/src/rng.ts` and `data/`.
- Features use the kernel only through `contract.ts` (UI-facing), `api.ts` and `acquire.ts`, and feature UI only through `contract.ts`. Another feature is reached through its `index.ts` (headless) or `ui.ts` (screens, for UI code), along `FEATURE_DEPS`: `battle`, `raising`, `items` → `engravings`; `challenges` → `battle`; `world` → `battle`, `challenges`.
- The kernel never imports feature UI or `shared/ui`. Files stay at or under 400 lines, and lines at or under 160 characters.

`architecture-baseline.json` lists the existing offenders and may only shrink: remove fixed entries (`--write-baseline`), never add one. Its import violations (battle → challenges, collection and raising; challenges ↔ collection; items → challenges) are wave-2 work.

The engine never imports an AI policy: `createBattle` in `battle/core/src/battle.ts` injects `AI_POLICY` unless the caller passes one. Moving the policies to `battle/ai` is wave-2 work.

## Top-level directories

| Directory | Contents |
| --- | --- |
| `src/app/` | The shell: `App.tsx`, navigation, routes and panels, audio settings and action sounds, and `preview.tsx`, the fixture the root `preview.html` mounts. `src/main.tsx` is the entry point. |
| `src/kernel/` | `game.ts` (`createGame`), `context.ts` (`createGameContext`, the read-only `GameContext`), `contract.ts` (UI-facing types), `api.ts` (`Runtime`, the `GameContext` type and the action helpers), `acquire.ts` (storing new monsters), `features.ts` (the feature registry), dispatch, snapshot and structural sharing, and the saves (`save.ts`, `save-state.ts`, `persistence.ts`). |
| `src/features/<name>/` | `battle`, `raising`, `collection`, `items`, `engravings`, `challenges`, `world`: `feature.ts` (the registration: action union, slice type, handlers and slice builder; `world` registers nothing yet), `index.ts` (headless surface), `ui.ts` (screens), `ui/` (components and stylesheets), and the feature's actions, view builders and own rules. |
| `src/domain/` | `catalog/`, `acquisition/` (routes, six-copy limits, recruitment, skins), `recipes/` (fusion, breeding), `challenges/` (campaigns, Brave Tower, facilities, NPC training), `engravings/`, `world/` (galaxies, planets, habitats), `traits.ts`, `economy.ts`, `battle-supplies.ts`, `item-shop.ts`. |
| `src/shared/` | View types (`views.ts`), labels (`labels.ts`), view helpers, creature art, icons, display scaling, `audio/`; `ui/` is the UI kit (`GameWindow`, `MonsterCard`, `TypeIcon`, item tiles, `use-game.ts`, `use-pager.ts`). |
| `battle/core/` | The engine (`src/engine/`, wired to its AI in `src/battle.ts`), constants, data-set builder, RNG, type chart, capture, built-in conditions, scripts (`src/scripts/`, guide in `SCRIPTS.md`), and the AI: `ai.ts`, `legacy-ai.ts`, the search planner (`search-ai.ts`, `search/`) with its battle clone and opponent model (`clone.ts`, `observe.ts`). |
| `raising/core/` | Pure raising rules: stats, growth curves, monsters, storage, items, rewards, the dex and the shared RNG. `types.ts` defines the save shapes. |
| `data/` | The catalog and remake data; see [data/README.md](data/README.md). |
| `tools/` | `catalog.mjs` (`loadCatalogNode()`); `assets/` (data and asset generators); `audit/` (evidence ledgers); `distribution/` (packagers); `refactor/move-files.mjs` (file moves with import rewriting, kept until wave 2 ends); `verification/` (suites, `MANIFEST.json`, `run.mjs`, `_harness.mjs`, the architecture gate). |
| `public/` | Runtime assets. Large ones are ignored by Git and travel in a separate asset archive. |
| `src-tauri/`, `distribution/` | The Tauri desktop shell; files copied into the portable browser package (`start.py`, `PLAYTEST.md`). |
| `design/` | Design notes ([index](design/notes/INDEX.md)) and preserved source snapshots. |

## Data flow

1. **Catalog load.** `loadCatalog()` in `src/domain/catalog/catalog.ts` assembles the catalog from the per-file data (`data/monsters/`, the `skills`, `natures`, `types`, `conditions` and `items` tables, every encounter in `data/bosses/` and `data/trainers/`); `loadCatalogNode()` does the same in plain Node. Other `data/` files are imported by the module that owns them. `data/gamedata.json` is a legacy aggregate that some suites and generators still read; the `catalog-loaders` gate checks that its tables equal the per-file data, so a generator that changes them writes both until wave 2 deletes it.
2. **createGame.** `createGame(catalog, save?)` in `src/kernel/game.ts` builds the read-only `GameContext` once with `createGameContext` (`context.ts`: the enriched catalog, the engine data set, the dex, the acquisition routes and families, and lookup indexes), opens the save, and returns a `GameController`: `snapshot()`, `subscribe()`, `dispatch(action)`, `engravingOptions(uid)`, `exportSave()`, `importSave()` and `reset()`. Its methods are unbound closures, so they are safe to pass directly (`useGame` passes `store.subscribe` unbound).
3. **Dispatch.** Each feature registers a `Feature` (`kernel/api.ts`): its action handlers, the action types allowed while a battle is unresolved, and its slice builder. `kernel/features.ts` lists them, and `contract.ts` composes `GameAction` and `GameSnapshot` from the features' action unions and slice types. `dispatch.ts` routes each action to the one feature that registered it (an unknown or doubly registered type is an error), and accepts only the in-battle actions while a battle is unresolved. It returns a `DispatchResult`: `{ ok: true, notice?, created? }`, where `created` is what the handler reported creating (a bred monster's `uid`, a fusion bead's `itemId`), or `{ ok: false, notice }` when the handler threw. The controller then writes the save and notifies subscribers.
4. **Snapshot.** `snapshot.ts` merges the registered features' slices into one view of everything the UI shows (two features building the same field is an error). `reuseUnchanged` (`structural-sharing.ts`) keeps every unchanged slice and row identical to the previous snapshot's, and the snapshot object itself when nothing changed: `engravingOptions`, the one controller read beside the snapshot, changes only with the monsters and engravingStock slices. So that a dispatch stays within its budget with 200 monsters, the monster rows (`features/raising/view.ts`) are memoised per row and rebuilt only when their record or save fields change; the quests and the fusion and breeding recipes are kept while a key of the save fields they read is unchanged; and the campaign stages build their catalogue parts once per game.
5. **Screens.** Screens subscribe with `useGame(c, select)` (`src/shared/ui/use-game.ts`) and re-render only when their selection changes identity.

`setupBattle` (`features/battle/battle-setup.ts`) creates each battle through `ctx.createBattle` with the game's script registry ([SCRIPTS.md](battle/core/SCRIPTS.md#game-registries)). `playTurn` submits the player's action and calls `resolveTurn()`, in which the engine asks the policy for each automatic side. The events become the battle log and presentation frames, and when the battle ends `settlement.ts` writes HP, PP, experience, captures and rewards back to the save.

## Battle engine

- **Structure.** `engine/battle.ts` is the `Battle` class (state and public API); its methods delegate to the rule modules beside it (`turn`, `move`, `damage`, `effects`, `conditions`, `rules`, …). Automatic sides are decided by the injected `BattlePolicy` (`{ chooseAction, chooseReplacement }`).
- **Rules and numbers.** Turn order, damage, statuses, capture and Boss rules follow [battle/RULES.md](battle/RULES.md). Battle numbers are named in `battle/core/src/constants.ts`, and damage comes from the one engine pipeline (AGENTS.md rule 2); the AI's estimate is its read-only probe (RULES.md section 5.1).
- **Data shapes.** `battle/core/src/types.ts` is the source of truth for species, skills, natures, type data, items, conditions, encounters, battle input, actions and events (`BattleEvent` is not yet a union).
- **Ids and text.** Species ids are the original 精灵 numbers and skill ids the original skill ids; encounters, items, conditions and natures use lowercase slugs (`boss_rei`). Display text is `{ zh, en? }`. Stat keys are `hp atk def spa spd spe`; `acc` and `eva` exist only as battle stages.
- **Types.** The chart is asymmetric: always read `chart[attacker][defender]`. Dual types are stored as arrays, and composite skill types map to their base types.
- **Effects.** Skill effects are ordered ops `{ op, chance?, when?, ... }`, applied after damage unless the op says otherwise. `target` is `self` or `foe`, and `when` takes conditions such as `foe_status`, `self_hp_below_pct`, `first_turn`, `foe_type` or `acted_first`. A `script` op `{ id, params }` names an implementation in `battle/core/src/scripts/`, where `seer_eff_<n>` is original effect template `<n>`. The declarative skill ops:

  | Op | Effect |
  | --- | --- |
  | `stat_stage`, `clear_stages`, `swap_stages`, `copy_stages` | change, clear (`up`, `down`, `all`), swap or copy stat stages |
  | `status`, `cure_status` | inflict a status (a list picks one at random; `level` for 衰弱), or remove it |
  | `add_condition`, `remove_condition` | add a timed condition from `conditions.json` (`turns`, `charges`), or remove it |
  | `heal`, `recoil` | restore HP by `pct_max_hp`, `pct_damage_dealt` or `amount`; the user takes recoil damage |
  | `restore_pp`, `pp_drain` | restore the target's PP; drain the foe's PP |
  | `fixed_damage`, `pct_damage`, `ohko`, `multi_hit` | fixed, percentage and one-hit-KO damage; `min`..`max` hits |
  | `power_if`, `priority_if` | conditional power or priority |
  | `force_switch`, `protect` | force the foe out; block this turn's attacks |

  Boss phases also use `transform`, `set_skills`, `set_ai`, `revive`, `say`, `swap_types`, `counter_skill`, `ohko_below_pct` and `always_crit_below_pct`. The `OPS` table in `engine/effects.ts` is every op the effect interpreter runs (skill effects after the attack, Boss phases, hooks and items); `MODIFIER_OPS` beside it names the four attack modifiers (`multi_hit`, `power_if`, `priority_if`, `crit_if`), which modify the attack instead of running after it and are applied in `damage.ts` and `move.ts`.
- **Conditions.** Timed modifiers are hooks on fixed engine extension points (`turn_end`, `modify_damage_taken`, `on_hit`, …). Statuses are conditions with `kind: "status"`, so there is one mechanism.
- **Encounters.** An encounter has a `team`, `rules`, `win`/`lose` objectives, `phases` and an `ai` spec; side kinds are `player`, `wild`, `boss` and `trainer`.
- **Determinism.** One seeded `sfc32` RNG per battle, consumed in a fixed order. The search planner simulates on clones and draws from the live RNG only once, when its chosen strategy is mixed.

### AI policies

`ai.ts` dispatches on the `ai` spec (`sequence`, `weighted`, `random`, `script` or `smart`).

| Side | Policy |
| --- | --- |
| Wild | `random` among usable moves, unless the encounter sets an `ai` spec. |
| Boss | `smart` is the project's historical policy (`legacy-ai.ts`), plus each encounter's authored sequence, weights, phases and scripts ([boss-ai-isolation-v56](design/notes/boss-ai-isolation-v56.md)). |
| Trainer | `smart` is the search planner (`search-ai.ts`, `search/`): it runs the real engine on isolated copies of the battle, models the player only from what has been observed, and plays a mixed-strategy equilibrium ([trainer-search-ai-v58](design/notes/trainer-search-ai-v58.md)). With `allow_switch` it also picks faint replacements. |

## Remake decisions

These are remake decisions, not original rules; do not describe them as original. Later product decisions are in `approved-plan.json` and the design notes.

- **No real-time clock.** Hourly windows, weekday-only fights and daily attempt limits are dropped. Weekday objectives become encounter `variants`, although the game does not yet let the player pick one (survey item D2). Every encounter is open at any time; party and level rules, the attempt-based Boss level rule and campaign and tower order still apply.
- **New journey.** Three gift starters at Lv 5 and 1000 coins. Ordinary raising, battle and capsule items cost no stock, healing is free, and victories pay coins and pooled experience.
- **Acquisition.** Wild species are captured with capsules; defeating one does not recruit it. A world-map contact (`startTraining`) is a targeted search: the species' regular Boss encounter (an SPT first), else a capturable wild monster, else a recruit-only challenge that rewards its essence; species listed for recruitment come from SPT recruitment quests. Three journey quests grant one species each. Every capture, essence claim, shop replenishment, fusion or breeding result and evolution respects a six-copy allowance per species, counting unhatched essences.
- **Bosses are never captured.** A victory that meets the objectives grants the Boss's 精元 essence with its item rewards, and a repeat clear only for a repeatable species. Other Bosses without an original essence or skill reward, except tower floors and intermediate campaign stages, get a remake essence (`domain/catalog/enrichment.ts`). Using an essence from the bag hatches it at once into a Lv 1 monster.
- **Traits and engravings.** Every new monster draws one implemented zero-star classic trait (effect 503 is never drawn). Each monster has an ability and a skill slot for the 2013 engravings ([engravings-2013](design/notes/engravings-2013.md)); generic ability engravings are bought one copy at a time, capped at 1 to 6 copies by stat gain, and the others are unlimited (`domain/engravings/engraving-access.ts`, applied when buying, equipping and moving engravings).
- **The editor** (the modifier in settings) changes the same save through the `cheat*` actions.

The game extends the engine when it sets up a battle (`features/battle/battle-setup.ts`): the trait, campaign and NPC-training script registries ([SCRIPTS.md](battle/core/SCRIPTS.md#game-registries)), the attempt-based Boss level rule (`bossEncounterForAttempt` in `domain/challenges/boss-encounter.ts`), the NPC training profiles (`normalizeNpcTrainingEncounter` in `domain/challenges/npc-training.ts`), and the engravings' stat bonuses and engraved skills (`domain/engravings/engravings.ts`).

## Raising and saves

`raising/core` holds the pure rules of [raising/SPEC.md](raising/SPEC.md); stats come from `raising/core/stats.ts` and are always derived, never stored. A save is the core's `Save` (`raising/core/types.ts`: party, storage, items, pooled experience, progress, the dex and the RNG state) plus the game's `GameExtras` (`src/kernel/save.ts`: coins, traits, quests, engravings, campaign and tower progress, shop listings, recruitment claims). `save.ts` validates saves and upgrades old ones through `MIGRATIONS`, one step per `SAVE_VERSION`; `save-state.ts` starts, opens and writes the journey into the `localStorage` slot of `persistence.ts`. An unreadable save is backed up before a new journey replaces it; if the backup fails, progress stays in memory. A battle in progress is not saved, apart from its item use and attempt count. The settings and item windows export and import saves as JSON. Change the format only through a migration (AGENTS.md rule 7).

## Verification

- `npm run typecheck` runs `tsc --noEmit`. `npm test` runs the `node --test` unit tests (`*.test.mjs` under `src/`, `battle/` and `raising/`).
- `npm run verify` runs `tools/verification/run.mjs`, which runs every suite whose status in `MANIFEST.json` is `gate`. The other statuses say why a suite does not gate: `needs-assets`, `needs-cache`, `historical`, `known-failure`, `stale` and `tool`. `--status all` runs every registered suite except `tool` scripts, `--jobs N` limits parallelism, and suites can also be named. Logs and `SUMMARY.json` go to `artifacts/verification/`.
- `.ts` suites load through Vite SSR. Suites marked `shards: N` run on N cores through `parallel-shards.mjs`.
- `_harness.mjs` provides Vite SSR loading, a check-and-report `suite()`, memory storage, an offline `fetch`, file hashing and the legacy `readGameData`. New suites must be registered in `MANIFEST.json`. A behaviour change updates or deletes the old assertions in the same commit.

## Assets

Runtime assets are in `public/`: portraits, battle animations and their HD atlases, skill effects, maps, interface art and audio, each with a manifest that records its source and hashes. Large binaries are ignored by Git and travel in a separate asset archive. Research inputs and HD-generation caches live in the ignored `.cache/`, and research data in the sibling `../analysis` directory (see the workspace layout in [AGENTS.md](AGENTS.md#workspace-layout)). The design notes record where each asset came from.
