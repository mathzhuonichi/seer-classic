# Platform & architecture choice

Status: proposal (2026-10-02). Scope assumed: single-player, offline, battle engine + monster raising,
~1000 monsters / ~1500 skills / classic bosses, no world map. Built mostly by AI agents in headless
Linux containers (no GPU, no display).

## 1. What was actually verified in the agent container

| Check | Result |
|---|---|
| `node` / `npm` | v22.22.0 / 10.9.4 preinstalled |
| `bun`, `cargo`/`rustc`, `go`, `java` | bun 1.3.14, Rust 1.97.0, Go 1.24.7, Java present |
| `python3` | 3.11.15 |
| npm registry | reachable. Installed `typescript` (7.0.2), `vitest` (5.0.3), `zod` (4.x) in a scratch dir |
| TS battle probe | 100k toy battles in 14 ms with `node --experimental-strip-types`; vitest test run 0.2 s |
| Godot | `Godot_v4.7.2-stable_linux.x86_64.zip` (78 MB) downloads from GitHub releases in ~1 s; `--headless -s sim.gd` ran a seeded loop plus CJK JSON parse in 0.27 s wall, exit 0. Export templates and the mono build URLs answer as well |
| GUT (Godot test lib) | `git ls-remote github.com/bitwes/Gut` works |
| .NET SDK (`builds.dotnet.microsoft.com`) | blocked; Godot C# and Unity C# cannot be built here as-is |
| Unity Hub / editor CDN | blocked; Unity also needs licence activation for batchmode |
| crates.io API | 403, but `index.crates.io` + `static.crates.io` work, so cargo builds work |
| Headless browser (Playwright CDN, Chrome-for-Testing) | **blocked** (403 on `cdn.playwright.dev`, `storage.googleapis.com`). In-container UI tests must use jsdom; screenshot/e2e tests run in GitHub Actions or after the environment allowlists `cdn.playwright.dev` |
| apt `libwebkit2gtk-4.1-dev` | available (needed only to build the Tauri Linux bundle) |

Versions checked on the web: Godot 4.7 (June 2026, 4.7.2 Aug 2026); Godot C# web export is still
not merged (PR #106125 is WIP); Bevy is at 0.19 (pre-1.0, breaking API every ~4 months); Tauri CLI 2.12.1;
Electron 44.5.1; React 19.3.

## 2. Comparison

Scores 1-5 (5 = best for *this* project).

| Option | Headless agent build/test | Data + schema tooling | Deterministic UI-free core | Agent fluency | Desktop / mobile / web | Simple 2D menu UI | Cost/licence |
|---|---|---|---|---|---|---|---|
| **TypeScript core + React UI, Tauri 2 shell (+ PWA/web)** | 5: just Node; verified | 5: zod/JSON Schema, ajv, tsc type-checks the data | 5: plain TS package, Node CLI | 5 | desktop 5, web 5, mobile 4 (Tauri 2 iOS/Android or Capacitor) | 5: DOM/CSS is the best menu toolkit | MIT/Apache, free |
| Godot 4.7 + GDScript | 4: 78 MB binary, headless verified; GUT/GdUnit4 for tests | 2: no schema validation built in, needs an external validator in another language | 4: possible with `extends RefCounted` classes, but things like `Resource` and `Node` creep in | 3: LLMs mix up Godot 3/4 APIs; `.tscn` layout is hard to check blind | desktop 5, web 4, mobile 5 | 4 | MIT, free |
| Godot 4.7 + C# | 2: .NET SDK blocked here; heavier toolchain | 4 (System.Text.Json + JSON Schema libs) | 5 | 4 | **no web export** (still WIP), mobile OK | 4 | free |
| Unity 6 (C#) | 1: editor not downloadable here, licence activation, multi-GB | 3 | 4 | 4 | 5 / 5 / 4 | 3 | Personal is free under a revenue cap; proprietary |
| Bevy 0.19 (Rust) | 4: cargo works | 4 (serde + schemars) | 5 | 3: API changes every release, so the training data is stale | desktop 4, web 3, mobile 2 | 2: UI is still immature | MIT/Apache |
| TS + Electron instead of Tauri | 5 | 5 | 5 | 5 | desktop 5 (150 MB+ bundles), no mobile | 5 | free |
| Others: Defold (Lua), LÖVE (Lua), Phaser (TS, canvas) | 3-4 | 2-3 | 3 | 3 | varied | 2-3: you write menu widgets yourself | free |

Why not Godot (the strongest runner-up): it would be a fine engine for a human-led team. Here,
though, about 90% of the work is data, rules and menus, and very little needs the scene editor,
physics or rendering pipeline. Agents also cannot see the editor, so `.tscn` files would be written
blind. Godot's main win is easy native mobile export, and Tauri 2 / Capacitor cover that well enough
for a turn-based menu game. If animation ambitions grow, the TS core can still be embedded later
(it is pure logic with JSON in and out), and the presentation layer could be swapped without
touching the rules.

## 3. Recommendation

**TypeScript monorepo. A pure, deterministic `core` package runs everywhere (Node CLI, tests,
browser). A React UI renders it. Ship desktop builds with Tauri 2 and web as a static PWA. Mobile
comes later via Tauri 2 mobile (Capacitor is the fallback).**

- One language end to end (data schemas, rules, effect scripts, UI, tools). Agents are most fluent in
  TS and React.
- Everything an agent needs runs on plain Node: typecheck, unit tests, data validation, 100k-battle
  balance runs and replay checks. Nothing needs a GPU, a display or a licence. This was verified above.
- Schemas are written once in zod. They give runtime validation, static types and exported JSON Schema
  (for editor autocompletion on the data files) from a single source.
- Tauri 2 bundles are small (~10 MB) and use the OS webview. The Rust toolchain is already in the
  container, but bundles are built per OS in CI. Electron is a drop-in fallback if webview
  inconsistencies bite (mainly WebKitGTK on Linux).
- Pin the toolchain: Node 22 LTS, TypeScript 7.x (native `tsc`), Vite, Vitest, React 19, zod 4,
  Biome (lint and format, one tool), npm workspaces (no extra package manager needed).

## 4. Architecture

### 4.1 Layers (dependencies point downward only)

```
app-desktop (Tauri)   app-web (PWA)        cli (node)
        \                 |                  /
         +------- ui (React, presentation) -+      <- only reads state, dispatches intents, animates events
                          |
                     game (session)               <- save/load, roster, bag, progress, boss unlock, uses core
                          |
                     core (rules)                 <- battle engine, raising math, effects, AI, RNG. No IO, no DOM, no Date
                          |
                     schema (zod)                 <- types + validators for all data and saves
                          |
                     data/ (JSON files)           <- content, never imported raw at runtime, compiled first
```

Rules for `core`: no `Math.random`, `Date`, `fetch`, `fs`, `window` or `console` (enforced by a lint
rule and an import-boundary test). It uses integer arithmetic only, with explicit `Math.floor` after
every multiply/divide. Float transcendentals (`Math.pow`, `Math.sqrt`) are banned because they are not
guaranteed bit-identical across JS engines. Game data is passed in as an object (`GameData`), never
loaded by `core` itself.

### 4.2 Repo layout

```
/data                      source content (one entity per file, diff/merge friendly)
  monsters/0001.json ...   id, name{zh,en}, element(s), baseStats, learnset, evolution, catchable, ...
  skills/10001.json ...    id, name, element, category, power, acc, pp, priority, crit, effects[]
  bosses/*.json            boss id, team, rules[], phases[], rewards, unlock condition
  tables/                  elements.json (type chart), natures.json, exp-curves.json, statuses.json
  i18n/zh.json en.json     UI strings
/assets                    sprites/<monsterId>.webp, icons, sfx (art pipeline is separate)
/packages
  schema/   src/*.ts       zod schemas -> TS types; `export-json-schema` script -> /data/_schema/*.json
  core/     src/
    rng.ts                 sfc32/xoshiro128** seeded PRNG; state is serialisable (4 x u32)
    data.ts                GameData type + indexes (byId maps), built from the compiled pack
    raising/               stats.ts (base/IV/EV/nature/level), exp.ts, evolve.ts, learnset.ts, ev-gain.ts
    battle/
      state.ts             BattleState (plain JSON-serialisable object)
      engine.ts            createBattle(), submitAction(), step() -> {state, events[]}
      turn.ts              order resolution (priority, speed, ties via rng)
      damage.ts            damage formula, type chart, crit, random spread
      hooks.ts             hook points and dispatcher
      effects/ops/*.ts     one file per declarative op (stat_stage.ts, status.ts, heal.ts ...)
      effects/scripts/*.ts escape-hatch scripts, registry keyed by string id
      status/*.ts          paralysis, poison, burn, freeze, sleep, fear, fatigue, confusion ...
    ai/                    enemy policies (random, greedy, scripted boss AI), deterministic via rng
    replay.ts              run(seed, dataHash, teams, actions[]) -> final state + events
  game/     src/           Session, Roster, Save (serialize/migrate), SaveStore interface, boss progress
  ui/       src/           React components: BattleScreen, TeamView, MonsterDetail, BossList ...
  cli/      src/           `seer` command (see 4.7)
  data-build/ src/         validate + cross-check + compile /data -> dist/gamedata.json
/apps
  web/                     Vite app (PWA manifest + service worker), IndexedDB SaveStore
  desktop/                 Tauri 2 (src-tauri/), fs SaveStore in the app data dir
/tests                     cross-package golden replays, fuzz, balance baselines
/.github/workflows         ci.yml, release.yml
```

### 4.3 Data pipeline

1. Authors (agents) edit `/data/**/*.json`. The `$schema` field points at the generated JSON Schema,
   so editors validate as you type.
2. `npm run data:build` (packages/data-build):
   - parses every file with its zod schema, reporting `file:path: message` for each error;
   - checks cross references: learnset skill ids exist, evolution targets exist, boss teams are valid,
     every `effects[].op` is a known op with valid params, every `script` id is registered in core,
     elements exist in the type chart, ids are unique, no evolution cycles;
   - normalises the data (defaults filled in, sorted by id) and writes `dist/gamedata.json` plus a
     `dataHash` (sha256 of the canonical JSON).
3. Runtime: the UI or CLI loads `gamedata.json` (statically imported, around 2-4 MB, gzips small),
   builds the indexes once, and hands `GameData` to core. Saves and replays record the `dataHash`.
4. Imports from wiki tables or spreadsheets happen in one-off scripts under `tools/import/`
   (Node or Python) that emit `/data` files. They are never a runtime dependency.

### 4.4 Skill effects: declarative ops first, scripts as the escape hatch

A skill's `effects` is an ordered list. Each entry is `{ op, when?, chance?, target?, if?, ...params }`.

```json
{ "id": 10234, "name": {"zh": "雷神天明闪"}, "element": "electric", "category": "special",
  "power": 120, "accuracy": 100, "pp": 5, "priority": 0,
  "effects": [
    { "op": "stat_stage", "target": "self", "stats": {"spAtk": 1, "speed": 1}, "chance": 100 },
    { "op": "status", "target": "foe", "status": "paralysis", "chance": 20 },
    { "op": "power_mul", "when": "beforeDamage", "if": {"foeHpBelowPct": 50}, "mul": 2 }
  ] }
```

- Hook points (`when`): `onUse` (default), `beforeDamage`, `afterDamage`, `onHit`, `onMiss`, `turnStart`,
  `turnEnd`, `onSwitchIn`, `onFaint`, `onStatusApply`, `modifyDamageTaken`, `modifyPriority`.
- Core op set (aim for 40-60 ops covering 90%+ of skills): `damage_fixed`, `damage_pct_hp`,
  `power_mul`, `multi_hit`, `crit_rate`, `stat_stage`, `clear_stages`, `steal_stages`, `reverse_stages`,
  `status`, `cure_status`, `heal_pct`, `drain`, `recoil`, `pp_drain`, `ohko`, `endure`,
  `protect_next`, `add_effect` (timed field/side effect with `turns` and nested modifiers, e.g.
  "for 5 turns, damage taken -50%"), `immune_to`, `reflect_pct`, `priority`, `force_switch`.
- Conditions (`if`) are typed objects (`foeHpBelowPct`, `selfHasStatus`, `foeElement`, `turnNumberGte`,
  `firstToMove` ...), combined with `all`/`any`/`not`. There are no string expressions and no `eval`.
- Escape hatch: `{ "op": "script", "id": "boss.leiyi.rebirth", "args": {...} }` resolves to a TS function
  in `core/battle/effects/scripts/` with signature `(ctx: EffectCtx, args) => void`. It gets the same
  hook API and the same RNG. data-build fails if a script id is unregistered. Rule of thumb: when 3+
  skills need the same script, promote it to an op.
- Every op is a pure function `(ctx, params) -> mutations + events`. That makes each op unit-testable
  in isolation, and every skill gets smoke-tested automatically (see 4.7, 4.9).

Bosses use the same machinery. `rules[]` holds hook-bound ops or scripts that run for the whole battle
(e.g. `immune_to` unless a condition holds, "only damage from skill X counts", HP phases that swap moves
or stats, per-turn damage caps, a forced first move). Boss AI is a script or a priority list in `ai/`.

### 4.5 Battle engine contract

```ts
createBattle(data, setup: {seed, sides, rules}) -> BattleState
legalActions(state, side) -> Action[]                 // use skill i / switch to j / item / flee
submitAction(state, side, action) -> BattleState      // pure; collects both sides' choices
step(state) -> { state: BattleState, events: BattleEvent[] }   // resolves one full turn
```

- `BattleState` is plain JSON (including RNG state), so it can be snapshotted, diffed and saved mid-battle.
- `BattleEvent` is a discriminated union (`move_used`, `damage`, `crit`, `miss`, `stat_stage`,
  `status_applied`, `faint`, `switch`, `text`, `battle_end` ...). The UI only animates events and
  never computes rules. Logs, replays and golden tests all use the same stream.
- Replay = `{dataHash, seed, setup, actions[]}`. Re-running it must reproduce identical events
  (checked in CI).

### 4.6 Raising (pure functions in `core/raising`)

Stat calc (base, IV 0-31, EV, nature ±10%, level 1-100) with formulas and caps (total/per-stat EVs,
EV yield per defeated monster) defined in one `formulas.md` plus constants in `tables/`. Also exp
curves, level-up learnset, evolution checks (level, item or other condition types as a union), and
nature table. The `game` layer applies these to the roster after battles. `core` itself never mutates
the save.

### 4.7 Headless CLI (`packages/cli`, run via `npx seer ...`)

```
seer data validate                       # = data:build without writing
seer sim --a 0123@lv100:nature=adamant --b boss:leiyi --seed 7 --n 10000 --ai greedy --json
seer replay replays/xyz.json --verify    # re-run and compare event hash
seer matrix --pool tier1 --n 200         # win-rate matrix for balance, CSV out
seer stats 0123 --lv 100 --iv 31 --ev atk=255,spe=255
seer smoke-skills                        # every skill used once by a dummy, asserts no throw
```

This is how agents "play" the game: they can reproduce a bug from a seed, check a boss is beatable
by the intended strategy, and catch balance regressions without any UI.

### 4.8 Saves

- Format: one JSON document `{ schemaVersion, dataHash, createdAt, roster[], storage[], bag{}, progress{}, settings{} }`.
  A monster instance stores `{uid, speciesId, level, exp, nature, ivs, evs, skills[4], ppUsed?, nickname}`.
  Derived stats are recomputed and never stored.
- `SaveStore` interface (`list/load/save/delete`) with adapters: Tauri fs (app data dir, write to tmp
  then rename, keep the last 3 backups), web IndexedDB (localStorage fallback), Node fs (CLI/tests).
- Migrations: `migrations/v{n}.ts` functions run in order on load. The result is validated by the zod
  save schema, and an invalid save is never overwritten. Export/import as a file for backup.
- Saves embed `dataHash` so content changes (e.g. a removed skill) can be repaired by a migration.

### 4.9 Testing and CI

| Layer | Tooling | Runs in container |
|---|---|---|
| Unit: ops, damage, stats, RNG | vitest | yes |
| Golden replays: fixed seeds → event-log snapshot | vitest snapshots in `/tests/golden` | yes |
| Property/fuzz: random teams across all monsters, N turns; invariants (HP bounds, PP ≥ 0, termination, no throw, replay equals original) | vitest + fast-check | yes |
| Data: schema + cross-ref + smoke-skills + every boss beatable by its reference strategy | `seer` CLI | yes |
| Boundary: core has no forbidden imports/globals | Biome rule + a test scanning imports | yes |
| UI components | vitest + @testing-library/react + jsdom | yes |
| E2E + screenshots | Playwright (headless Chromium) | GitHub Actions only, until `cdn.playwright.dev` is allowlisted for the container |
| Bundles | `tauri build` matrix (windows/macos/ubuntu) | GitHub Actions `release.yml` |

`ci.yml` on every PR runs `npm ci → biome check → tsc -b → data:build → vitest run → seer smoke-skills →
seer replay tests/replays/*.json --verify → vite build`. The target is under 3 minutes.
`release.yml` builds the Tauri bundles and deploys the PWA (any static host) on a tag.

## 5. Risks and mitigations

- **WebView differences (Tauri)**: keep the UI to standard CSS and test on WebKit in CI (Playwright
  webkit). Electron is the fallback, and the UI code does not change.
- **Effect DSL sprawl**: op catalogue documented in `docs/effects.md`, generated from the zod schemas.
  Scripts are capped, and data-build reports a script-usage count.
- **Determinism bugs**: the integer-only rule, a single RNG passed explicitly, and replay verification
  in CI. Object iteration order never drives logic (always sort by id).
- **Content volume**: the data files are the product. Lean on importer scripts and per-entity files
  so many agents can work in parallel without merge conflicts.
- **Rich animation later**: if it is needed, add PixiJS inside `BattleScreen` only. Core and events
  stay unchanged.
