# Architecture v2: feature modules (target design)

Status: **approved by the user, 2026-10-18** (feature modules and AI turn preparation). This is the target that the wave-2 refactor implements. `ARCHITECTURE.md` describes the code as it is today and is updated as each step lands.

## 1. Why a second architecture step

Wave 1 split the two monoliths (`src/game.ts`, `battle/core/src/battle.ts`) and removed most duplication inside each file, but kept the technical layering:

- `controller/`
- `presentation/`
- `progression/`
- `mechanics/`
- `components/`

One feature is therefore spread across four directories. Engravings, for example, live in 7 files:

- `mechanics/engravings.ts`
- `controller/engravings.ts` and `controller/engraving-actions.ts`
- `presentation/engraving-views.ts`
- `components/EngravingShop.tsx`, `EngravingSlots.tsx` and `EngravingTransferSource.tsx`

Components still re-derive rules the snapshot should carry, which is why wave 1 got more modular but not shorter. The target groups code by **feature**, behind one public `index.ts` per feature, and fixes the contracts between layers before more implementation is written.

## 2. Experience budgets

These are measured on the 10-core development Mac. The ones marked *gate* become checks in `tools/verification`.

| Path | Budget | Today |
| --- | --- | --- |
| Non-battle action → new snapshot (dispatch + snapshot + save write) | p95 ≤ 4 ms (*gate*) | p50 0.8 ms, max 2.4 ms |
| Player clicks a move → first battle frame | ≤ 50 ms (*gate*) | +91 ms p50 / +176 ms p95: the search AI decides synchronously inside `resolveTurn` |
| Search AI decision, run while the player is choosing | p95 ≤ 250 ms (*gate*) | 91 / 176 ms |
| Cold start: catalog load + `createGame` | ≤ 100 ms (*gate*) | 7 + 29 ms |
| Screen re-render | Only screens whose snapshot slice changed | The whole tree re-renders on every emit |
| Saves | Never lost: versioned migrations, and a backup of an unreadable save | Done in wave 1 |

The battle row is the only budget the game misses today, and it is the one the player feels on every turn.

## 3. Module map

```
src/
  main.tsx
  app/              shell: App, window manager, navigation, audio, dev preview
  kernel/           the controller kernel; no feature rules
    contract.ts     GameAction, GameSnapshot, DispatchResult, GameController, Feature
    game.ts         createGame: composes the registered features
    runtime.ts  dispatch.ts  snapshot.ts  journey.ts (save load/migrate/write)  context.ts
    catalog/        assembleCatalog, browser loader, enrichment
  shared/           feature-agnostic and reusable
    labels.ts  view-helpers.ts  monster-views.ts  creature-art.ts  element-types.ts  item-icons.ts
    ui/             Pager, TypeIcon, TypeFilter, CreatureArt, ItemIcon, ItemTile, ItemTooltip,
                    ItemCategoryTabs, MonsterCard, GameWindow, useGame (snapshot slice hook)
  features/
    battle/         setup, session, settlement, playback frames, log, HUD, animation runtime, ui/
    raising/        raising actions and views, EV draft, ui/ (PetBag, Raising tabs, Modifier)
    collection/     acquisition, recruitment, fusion, breeding, skins, dex, ui/
    items/          inventory, shop, battle supplies, item actions and views, ui/
    engravings/     rules, loadout, actions, views, ui/
    challenges/     campaigns, facilities, Brave Tower, quests, NPC training, boss evidence, ui/
    world/          planets, maps and scenes, roaming, atlas, ui/
battle/core/        the engine: rules, turn, damage, effects, scripts; defines BattlePolicy
battle/ai/          policies: search planner, legacy boss/wild AI, dispatcher; implements BattlePolicy
raising/core/       raising rules
data/               JSON content
tools/              verification (+ _harness), catalog loader for Node, assets, distribution
```

### Feature layout

Each feature folder has the same shape:

- `index.ts`: its whole public surface. This is the `feature` registration object, the feature's action and slice types, and its screen components.
- `rules/` or `rules.ts`: pure domain rules (no React, no kernel).
- `actions.ts`: handlers `(rt, action) => DispatchResult`.
- `view.ts`: the snapshot slice builder, pure. It carries every derived rule outcome the screens need.
- `ui/`: React components that render the slice and dispatch actions.

## 4. Dependency rules

These are enforced by a new gate suite, `tools/verification/architecture.mjs`. It parses imports and checks size limits against a baseline that may only shrink.

1. **`battle/core`** imports only itself, `raising/core/stats.ts` and `data/`. It never imports `battle/ai` or `src/`.
2. **`battle/ai`** imports only `battle/core`.
3. **`raising/core`** imports only itself and `battle/core/src/rng.ts`.
4. **`src/shared`** imports only `shared`, the cores and `data`.
5. **`src/features/X`** imports `shared`, `kernel/contract.ts` (types only), the cores and `data`.
   - It may import another feature only through `features/Y/index.ts`, and only along this DAG:
     - `battle` ← `challenges`, `world`
     - `collection` ← `items`, `raising`, `challenges`
     - `engravings` ← `raising`, `items`, `battle`
   - It must not create cycles.
6. **`features/X/ui`** imports React, `shared`, `shared/ui` and its own feature's `view.ts` types and `index.ts`. It never imports rules, actions or the kernel runtime.
7. **`src/kernel`** imports `features/*/index.ts` (the registry), `shared`, the cores and `battle/ai` (to inject the policy).
8. **`src/app`** imports `kernel`, `features/*/index.ts` (screens) and `shared`.
9. **Size limits:**
   - New or changed files stay at or under 400 lines, and lines at or under 160 characters.
   - Existing offenders are listed in the baseline and may only shrink.

## 5. Contracts

The contracts are written as real types in `src/kernel/contract.ts` before any feature is filled in.

**Kernel boundary.** The kernel exposes exactly two modules:

- `src/kernel/contract.ts` is the UI-facing contract: `GameSnapshot` (the composition of the feature slices), `GameAction` (the union of the feature actions), `DispatchResult` and `GameController`.
  - The app, the feature UIs and the kernel import it.
- `src/kernel/api.ts` is the feature-facing API, imported by feature code that is not UI:
  - the types `Runtime`, `GameContext` and `Feature`;
  - the helpers `notice`, `commit`, `replaceMonster`, `requireSession`, `battleInProgress`, `ok` and `fail`.
  - Features never import other kernel modules.
- Display types used by several features live in `src/shared/views.ts`:
  - `SkillView`, `MonsterView`, `ItemView`, `BossEvidenceView`, and the encounter and opponent views.
  - The kernel and the features both import them, so `shared` never imports the kernel.

**Feature indexes.** `features/X/index.ts` is the only module that re-exports. It lists exactly what other features, the kernel and the app use, and AGENTS rule 4 ("no alias exports") applies to every other file.

**Dispatch result.** `dispatch(action)` returns `DispatchResult`:

```
type DispatchResult =
  | { ok: true; notice?: string; created?: { uid?: string; itemId?: string; species?: number } }
  | { ok: false; notice: string }
```

This replaces the 9 components that read `notices[0]` or diff snapshots before and after an action.

**Feature registration:**

```
interface Feature<A extends { type: string }, S> {
  actions: { [K in A['type']]: (rt: Runtime, action: Extract<A, { type: K }>) => DispatchResult | void };
  inBattle?: readonly A['type'][];   // actions allowed while a battle is unresolved
  view(ctx: GameContext, rt: Runtime): S;  // must return the previous object when nothing it reads changed
}
```

- `GameAction` is the union of the features' action unions.
- `GameSnapshot` is the intersection of their slices.
- The kernel's `dispatch` and snapshot are a fold over the registry.
- Adding a feature means adding a folder and one registry line.

**Slices carry rule outcomes.** These fields move from components into the snapshot:

- **Brave Tower:** `position` (floor, boss, climbComplete, conquered, entrance) and `totalFloors`.
- **Engravings:** per monster and engraving, `equipMode` (`unlimited`, `stock`, `transfer` or `blocked`), `transferFrom`, `canBuy` and `owned`.
- **Items:** `useTargets` and `useAction` (`use`, `hatch`, `capture` or null).
- **Collection:**
  - `dex.entries[species]` with its acquisition view;
  - `fusion.recipes` (ready, collectible);
  - `breeding.recipes` (ready, routesMissing).
- **Campaigns:** `reward`. Encounters carry a `category` id from `CHALLENGE_CATEGORY` and a display label.
- **Raising:** the active boosts (EXP/EV boost, energy bead) per monster.

**Battle engine:**

- `BattleEvent` is a discriminated union, and `variants` are typed.
- `BattlePolicy` is `{ chooseAction(b, side); chooseReplacement(b, side) }`, injected by the kernel.
- **Turn preparation:** when a turn opens, the kernel asks the policy to decide for automatic sides in an idle slot after the frame. This is `battle.prepare(side)`, which sets `side.pending`, and the decision is ready when the player clicks.
  - The search plans a simultaneous-move equilibrium. Its planning world clears the opponent's `pending` (`search/world.ts`), so it never reads the player's submitted action.
  - Submitting an action consumes no random numbers. A decision made when the turn opens therefore sees exactly the battle RNG state that `resolveTurn` would see, and gives the same action and the same RNG consumption.
  - Preparation must run before anything else can consume `b.rng` in that turn.
  - A gate checks that prepared and unprepared turns replay identically.

**React:** `useGame(selector)` subscribes a screen to its slice. Slices keep their identity when unchanged, so unaffected screens skip rendering.

## 6. Implementation plan

The work runs as at most 4 agents, and each unit reports its net byte change. The target is a net reduction.

**Step 0 (coordinator, before any worker starts):**
- Move files to the target tree with an import-rewrite script. This is a move-only commit with no logic change.
- Write `kernel/contract.ts` and the feature registry.
- Add `architecture.mjs` with its baseline.
- Workers then start from the final layout and fixed contracts.

**Wave 2 units, filled in against the contracts:**
- **A. Kernel:** registry-based dispatch and snapshot, `DispatchResult`, `useGame` selectors, memoised slices; components stop reading `notices[0]`.
- **B. Battle:**
  - `battle/ai` split out of `battle/core`;
  - `BattleEvent` union;
  - turn preparation with its own planner random stream, plus the replay gate;
  - battle UI on the typed events.
- **C. Collection, items, engravings:**
  - the slices above, deleting the UI rule mirrors (`engravingAccessView`, `itemUse`, the fusion/breeding/dex view rule calls);
  - finish B1: acquisition views from the controller's catalog, delete the import-time getters and `data/gamedata.json`.
- **D. Challenges, world, tools:**
  - the tower and category fields;
  - the harness sweep over the remaining suites;
  - delete superseded suites (historical, stale, and known-failure suites that no longer protect anything);
  - remove the `SeededRng` alias.
