# Architecture

Seer Classic is a TypeScript and React browser game, packaged for the desktop with Tauri. Game content is plain JSON under `data/`. Two pure rule libraries sit on top of it: the battle engine (`battle/core`) and the raising rules (`raising/`). The application in `src/` adds progression and presentation and renders the result. The rules themselves are in [battle/RULES.md](battle/RULES.md) and [raising/SPEC.md](raising/SPEC.md); the rules for changing code are in [AGENTS.md](AGENTS.md). This document describes how the pieces fit together.

## Principles

These come from the original foundation design and still hold:

1. **Data is plain text.** Species, skills, natures, types, conditions, items, encounters and remake policies are JSON files under `data/`. Rule numbers that are not data are named constants (AGENTS.md rule 3).
2. **The battle engine is a pure, deterministic library.** Its input is two sides, a seed and actions; its output is a list of events. It has no UI, clock, I/O or global randomness, so the same seed and actions replay the same battle.
3. **Presentation is a thin client.** Components render a snapshot and dispatch actions; they never compute rules.
4. **Skill effects are declarative ops**, with a named `script` escape hatch for unique effects.
5. **Headless first.** Every rule can be exercised from Node without a browser.

## Layers

Imports point down only (AGENTS.md rule 1):

```
src/components/            React components: render the snapshot, dispatch actions
        ↓
src/game.ts                the controller: createGame, actions, snapshot, persistence
        ↓
src/presentation/          pure view builders, labels, animation and map presentation
        ↓
src/progression/           acquisition, recruitment, evolution, fusion, breeding, shop, towers, facilities
src/mechanics/             catalog loading, save storage, engine extensions (traits, engravings, campaign rules)
        ↓
raising/core/   battle/core/   the pure rule libraries
        ↓
data/                      JSON content
```

Presentation modules never import the controller; components may import them directly. The engine must not import an AI policy; the policy is to be injected when a battle is created. Today `battle.ts` still imports the AI dispatcher (survey item C1 removes it). Existing exceptions are debt to remove, not precedent.

## Top-level directories

| Directory | Contents |
| --- | --- |
| `src/` | The application. `App.tsx` is the game shell and `main.tsx` its entry point; `game.ts` is the controller and `game-types.ts` the snapshot and action types. `world*.ts` hold the world graph (galaxies, planets, regions, habitats), and the shell and window stylesheets sit beside them. |
| `src/components/` | React components and their own stylesheets. Shared hooks such as `use-pager.ts` live here. |
| `src/presentation/` | View builders, Chinese labels (`labels.ts`), shared view helpers (`view-helpers.ts`), battle animation loading and the runtime clock, map and scene presentation, asset manifests. |
| `src/progression/` | Progression rules on top of the raising core: acquisition and recruitment, collection ancestry, skins, fusion, breeding, the item shop, battle supplies, NPC training, the Brave Tower and battle facilities. |
| `src/mechanics/` | The catalog loader, local save storage, and extensions that plug into the engine: trait and engraving modules, campaign and NPC-training scripts. |
| `src/audio/`, `src/dev/` | Audio playback; the fixture that the root `preview.html` mounts. |
| `battle/core/` | The battle engine (`src/battle.ts`), its constants, data-set builder, RNG, type chart, capture, built-in conditions, skill and Boss scripts (`src/scripts/`, guide in `SCRIPTS.md`), and the AI policies. |
| `raising/core/` | Pure raising rules: stats, growth curves, monsters, storage, items, rewards, the dex and the shared RNG. `types.ts` defines the save shapes. |
| `raising/game/` | The save format: create, validate, migrate and serialise. |
| `data/` | The catalog and remake data; see [data/README.md](data/README.md). |
| `tools/assets/` | Generators and exporters for data and assets (habitats, evolution rules, engravings, portraits, animations, maps, UI art). |
| `tools/audit/`, `tools/distribution/` | Evidence-ledger builders; the source and playtest packagers. |
| `tools/verification/` | Verification suites, `MANIFEST.json`, the `run.mjs` runner and the shared `_harness.mjs`. |
| `public/` | Runtime assets. Large ones are ignored by Git and travel in a separate asset archive. |
| `src-tauri/` | The Tauri desktop shell. |
| `distribution/` | Files copied into the portable browser package (`start.py`, `PLAYTEST.md`). |
| `design/` | Design notes ([index](design/notes/INDEX.md)) and preserved source snapshots. |

## Data flow

1. **Catalog load.** One loader in `src/mechanics/` returns the catalog: the prebuilt `data/gamedata.json` bundle (species, skills, natures, types, conditions, items) plus every encounter in `data/bosses/` and `data/trainers/`. Other `data/` files (habitats, acquisition policy, breeding, engravings, traits, elite roster, NPC training profiles) are imported by the module that owns them. The split catalog files (`monsters/`, `skills.json`, `natures.json`, `conditions.json`, `items.json`, `types.json`) are identical readable copies of the bundle. No tool rebuilds the bundle from them, so editing only a split file changes nothing at runtime: a generator that changes catalog data writes both, as `tools/assets/build_evolution_rules.py` does. The loader replaces the bundle's own `bosses` list with the files in `data/bosses/`.
2. **createGame.** `createGame(catalog, save?)` in `src/kernel/game.ts` builds the engine data set, the script registry and the progression views, and reads or creates the save. It returns a `GameController`: `snapshot()`, `subscribe()`, `dispatch(action)`, `exportSave()`, `importSave()` and `reset()`.
3. **Snapshot.** The snapshot is one view of everything the UI shows: party and storage, items, quests, the world, the current battle and its presentation frame.
4. **Components.** `App.tsx` subscribes with `useSyncExternalStore`, renders the snapshot, and turns user input into `GameAction`s.
5. **Dispatch.** Each action runs raising or progression rules, or drives the battle, then persists the save and notifies subscribers.

A battle is created with `createBattle(options)`. The controller submits the player's action, the engine asks the AI policy for each AI side, and `resolveTurn()` returns the turn's events. The controller turns events into the battle log and presentation frames, and when the battle ends writes HP, PP and rewards back to the save.

## Battle engine

- **Rules and numbers.** Turn order, damage, statuses, capture and Boss rules follow [battle/RULES.md](battle/RULES.md). Battle numbers are named in `battle/core/src/constants.ts`, and damage comes from the one engine pipeline (AGENTS.md rule 2).
- **Data shapes.** `battle/core/src/types.ts` is the source of truth for species, skills, natures, type data, items, conditions, encounters, battle input, actions and events.
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

  `multi_hit`, `power_if`, `priority_if` and `crit_if` modify the attack instead of running after it. Boss phases also use `transform`, `set_skills`, `set_ai`, `revive`, `say`, `swap_types`, `counter_skill`, `ohko_below_pct` and `always_crit_below_pct`. The engine's effect-op interpreter (`applyOp`) is the complete list.
- **Conditions.** Timed modifiers are hooks on fixed engine extension points (`turn_end`, `modify_damage_taken`, `on_hit`, …). Statuses are conditions with `kind: "status"`, so there is one mechanism.
- **Encounters.** An encounter has a `team`, `rules`, `win`/`lose` objectives, `phases` and an `ai` spec; side kinds are `player`, `wild`, `boss` and `trainer`.
- **Determinism.** One seeded `sfc32` RNG per battle, consumed in a fixed order.

### AI policies

| Side | Policy |
| --- | --- |
| Wild | A random usable move unless the encounter sets an `ai` spec. |
| Boss | The project's historical policy (`legacy-ai`) plus each encounter's authored sequence, weights, phases and scripts ([boss-ai-isolation-v56](design/notes/boss-ai-isolation-v56.md)). |
| Trainer | The search planner: it runs the real engine on isolated copies of the battle, models the player only from what has been observed, and plays a mixed-strategy equilibrium ([trainer-search-ai-v58](design/notes/trainer-search-ai-v58.md)). |

## Settled remake decisions

These decisions from the foundation design still hold; later product decisions are in `approved-plan.json` and the design notes.

- **No real-time clock.** Hourly windows and weekday-only fights are dropped, and there are no daily attempt limits. Weekday objectives become encounter `variants`, although the game does not yet let the player pick one (survey item D2).
- **Bosses are never captured.** Their collection reward is a 精元 essence, granted only when the encounter's objectives are met, which hatches into the monster.

## Raising and saves

`raising/core` holds the pure rules of [raising/SPEC.md](raising/SPEC.md); stats come from `raising/core/stats.ts` and are always derived, never stored. A save holds the party (ordered uids), storage, items, accumulated experience, progress, the dex and the shared RNG state; `raising/core/types.ts` defines it. `src/kernel/save.ts` validates saves and upgrades old ones through `MIGRATIONS`, one step per `SAVE_VERSION`. The browser stores the serialised save in `localStorage`, and the settings and item windows export and import it as JSON. Change the format only through a migration, and never overwrite an unreadable save (AGENTS.md rule 7).

## Verification

- `npm run typecheck` runs `tsc --noEmit`. `npm test` runs the `node --test` unit tests (`*.test.mjs` under `src/`, `battle/` and `raising/`).
- `npm run verify` runs `tools/verification/run.mjs`, which runs every suite whose status in `MANIFEST.json` is `gate`. The other statuses say why a suite does not gate: `needs-assets`, `needs-cache`, `historical`, `known-failure`, `stale` and `tool`. `--status all` runs every registered suite except `tool` scripts, and suites can also be named. Logs and `SUMMARY.json` go to `artifacts/verification/`.
- `.ts` suites load through Vite SSR. Suites marked `shards: N` run on N cores through `parallel-shards.mjs`.
- `_harness.mjs` provides Vite SSR loading, a check-and-report `suite()`, memory storage, an offline `fetch`, file hashing and the catalog reader. New suites must be registered in `MANIFEST.json`. A behaviour change updates or deletes the old assertions in the same commit.

## Assets

Runtime assets are in `public/`: portraits, battle animations and their HD atlases, skill effects, maps, interface art and audio, each with a manifest that records its source and hashes. Large binaries are ignored by Git and travel in a separate asset archive. Research inputs and HD-generation caches live in the ignored `.cache/`, and research data in the sibling `../analysis` directory (see the workspace layout in [AGENTS.md](AGENTS.md#workspace-layout)). The design notes record where each asset came from.
