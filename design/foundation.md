# Seer Classic: Foundation Design

Status: **v1.0, for Johnny's approval**. Owner: the "Game foundation design" thread.
v0.2 added the platform choice (section 2) and the battle thread's change
requests (`battle/RULES.md` section 12). v0.3 folds in the raising thread
(`raising/SPEC.md`) and catalog thread corrections. v1.0 adds the boss
research (`design/notes/mechanics.md`): section 7.2 and the remake decisions
in section 10. Sections marked `[PENDING]` wait on
mechanics research (`design/notes/mechanics.md`) and may still change. The data model below is stable enough for the catalog,
battle engine and raising threads to start on. If you need a change, ask the
foundation thread (via the coordinator) instead of editing this file.

## 0. Scope (from Johnny)

- Single-player remake of pre-2013 赛尔号, PvE only, classic bosses included.
- Core = battle engine + monster raising (等级/经验, 学习力, 个体/潜力, 性格, 技能, 进化).
- All pre-2013 monsters. Original art is fine.
- No world map, no story, no social or multiplayer.

## 1. Architectural principles

1. **Data is plain text, engine-independent.** Every monster, skill, nature,
   type, boss and item lives in JSON files under `data/`, validated by JSON
   Schema (`design/schema/`). No game content is hard-coded.
2. **The battle core is a pure, deterministic library.** Input: two sides +
   seed + player actions. Output: a list of battle events. No UI, no clock, no
   global RNG. Same seed + same actions = same battle (replays, tests, balance
   simulation).
3. **Presentation is a thin client** that renders the event stream and sends
   actions back. It can be replaced without touching rules.
4. **Skill effects are declarative ops** (section 5) with a small named
   `script` escape hatch for the truly unique ones.
5. **Headless first.** A CLI simulator runs any battle from data so every rule
   is testable in CI without a display.

## 2. Platform and repository layout

**Platform: TypeScript monorepo.** A pure, deterministic `core` package (rules
only) runs in Node, tests and the browser. A React UI renders it. Desktop ships
via Tauri 2 (Electron as fallback), web as a static PWA, mobile later via Tauri 2
mobile or Capacitor. Toolchain: Node 22 LTS, TypeScript 7, npm workspaces, zod 4
(schemas → types + JSON Schema), Vitest, Vite, React 19, Biome.
Why, and the alternatives weighed (Godot 4.7 was runner-up, Unity, Bevy):
`design/notes/platform.md`. Main reason: nearly all of this game is data, rules and
menus, and every task (build, test, data validation, battle sims, replays) runs
headless on plain Node, which is how agents build it.

Layers, dependencies pointing down only:
`apps/desktop`, `apps/web`, `cli` → `ui` (React) → `game` (save, roster, bag,
progress) → `core` (battle, raising, effects, AI, RNG; no IO, DOM, Date or
Math.random) → `schema` (zod) → `data/` JSON.

```
data/
  types.json          type list + effectiveness chart
  natures.json        25 性格
  growth.json         4 EXP curves
  potential.json      潜力 tiers from 个体值
  monsters/           one file per species: 0001.json ...
  skills.json         all skills in one file (5,325)
  scripts_needed.md   effects still expressed as `script` ops
  conditions.json     timed battle conditions used by skill effects
  bosses/             one file per boss encounter
  items.json          raising and battle items
packages/schema/      zod schemas; exports JSON Schema to data/_schema/
packages/core/        battle engine + raising rules (pure logic)
packages/game/        save/load, roster, progress
packages/ui/          React presentation
packages/cli/         `seer` CLI: data validate, sim, replay --verify, matrix, smoke-skills
apps/desktop/         Tauri 2 shell
apps/web/             PWA
```

`data:build` validates every file, checks cross-references (skill ids, evolution
targets, effect ops, script ids) and compiles a hashed `gamedata.json` the app and
CLI load. Code the sibling threads write now in `/mnt/project-files/battle/` and
`/mnt/project-files/raising/` moves into `packages/core/` when the repo exists.

Until a GitHub repo exists, catalog data goes in `/mnt/project-files/data/`
with the same layout.

## 3. Shared vocabulary

### 3.1 Stat keys

| key | 中文 | meaning |
|---|---|---|
| `hp` | 体力 | HP |
| `atk` | 攻击 | physical attack |
| `def` | 防御 | physical defense |
| `spa` | 特攻 | special attack |
| `spd` | 特防 | special defense |
| `spe` | 速度 | speed |

Battle-only: `acc` 命中, `eva` 闪避 (stage-only, no base value).

### 3.2 Type ids

Lowercase English slugs. The 16 types of the 2010 official index:

`grass 草, water 水, fire 火, flying 飞行, electric 电, mechanical 机械,
ground 地面, normal 普通, ice 冰, psychic 超能, fighting 战斗, light 光,
shadow 暗影, mystic 神秘, dragon 龙, holy 圣灵`

plus `dimension 次元` (two species) and `evil 邪灵` (three boss skills, no
species): 18 types. `ancient 远古` is out (no pre-2013 species uses it), as are
`nature 自然` and later types. The 草/水 cells are still unverified (see the
`_note` in `data/types.json`). The chart is asymmetric (地面→电 2×, 电→地面 0×), so always read
`chart[attacker][defender]`.

Dual types are stored as a two-element array; how dual-type effectiveness is
computed is set by `types.json` `dual_rule`: `"seer_average"` (mean of the two
coefficients; both 2 → 4; any 0 → mean/2). Details: `battle/RULES.md` section 6.

### 3.3 Status ids

`paralysis 麻痹, poison 中毒, burn 烧伤, freeze 冻伤, sleep 睡眠,
fear 害怕, fatigue 疲惫, petrify 石化, confusion 混乱, weaken 衰弱,
leech 寄生, flammable 易燃, frozen_solid 冰封`. Effects and durations:
`battle/RULES.md` section 7. Statuses are built-in conditions
(`kind: "status"`); `conditions.json` may override one by id.

### 3.4 Ids

- Species `id`: integer, **the original 精灵 number** where known, so the
  catalog maps 1:1 to the original. Forms or ids we invent start at 90000.
- Skill `id`: integer, original skill id where known, otherwise 900000+.
- Boss, item, condition, nature ids: lowercase slug strings (`boss_rei`,
  `item_ev_reset`, `cond_reduce_damage_50`, `adamant`).
- All display text is an object `{ "zh": "...", "en": "..." }`; `zh` is
  required, `en` optional.

## 4. Static data schemas

### 4.1 Species (`data/monsters/0001.json`)

```json
{
  "id": 1,
  "name": { "zh": "布布种子", "en": "Bubu Seed" },
  "types": ["grass"],
  "base": { "hp": 50, "atk": 50, "def": 50, "spa": 50, "spd": 50, "spe": 50 },
  "ev_yield": { "spa": 1 },
  "exp_yield": 64,
  "growth": "medium",
  "catch_rate": 45,
  "learnset": [
    { "level": 1, "skill": 10001 },
    { "level": 7, "skill": 10002 }
  ],
  "evolution": [
    { "to": 2, "method": "level", "level": 16 }
  ],
  "obtain": ["wild"],
  "tags": [],
  "desc": { "zh": "..." },
  "art": "m0001",
  "source_note": "where the stats came from / confidence"
}
```

- `base` = 种族值. `ev_yield` = 学习力 given when this species is defeated
  (only non-zero keys).
- `evolution.method`: `level` | `item` (`item` id) | `special`
  (free-text `condition` + optional `script`). Multiple entries allowed for
  branching evolutions.
- `obtain`: any of `wild`, `boss`, `gift`, `event`, `egg`, `shop`,
  `unobtainable` (for the remake we will make every species obtainable
  somehow; this records the original route).
- `tags`: e.g. `legendary`, `boss_only`, `starter`.

### 4.2 Skill (an entry in `data/skills.json`)

```json
{
  "id": 10001,
  "name": { "zh": "撞击" },
  "type": "normal",
  "category": "physical",
  "power": 40,
  "accuracy": 100,
  "pp": 35,
  "priority": 0,
  "crit_rate": 1,
  "target": "foe",
  "effects": [],
  "seer_effects": [],
  "desc": { "zh": "..." }
}
```

- `category`: `physical` 物理 | `special` 特殊 | `status` 属性.
- `accuracy`: 0–100, or `null` for 必中.
- `priority`: integer, higher acts first (先制 +1, +2, ...).
- `crit_rate`: 致命一击 chance as a numerator over 16 (default 1 = 1/16), as Seer
  skill text states it.
- `power`: 0 for status skills.
- `effects`: ordered list of effect ops (section 5). Applied after damage
  unless an op says otherwise.
- `seer_effects`: the original raw Seer effect records, kept on every skill so
  any encoding can be re-checked or redone.

### 4.3 Nature (`data/natures.json`)

```json
[{ "id": "adamant", "name": { "zh": "固执" }, "plus": "atk", "minus": "spa" }]
```
25 entries; neutral natures have `plus` = `minus` (no effect). ×1.1 / ×0.9.

### 4.4 Types (`data/types.json`)

```json
{
  "types": [{ "id": "grass", "name": { "zh": "草" } }],
  "chart": { "grass": { "water": 2, "fire": 0.5, "ground": 2 } },
  "dual_rule": "seer_average"
}
```
`chart[attacker][defender]`; missing pairs = 1. Values: 2, 1, 0.5, 0.

### 4.5 Growth curves (`data/growth.json`)

Exactly four Seer curves (no "fast"); `exp` to reach level n:

| id | formula | total EXP Lv1→100 |
|---|---|---|
| `medium` | n³ | 999,999 |
| `slow` | 5n³/4 | 1,249,999 |
| `medium_slow` | 6n³/5 − 15n² + 100n − 140 | 1,059,914 |
| `fluctuating` | unfloored variant | 1,640,000 |

Species carry `growth` (one of these ids) plus the raw Seer `growth_type`
number. Seer GrowthType 4 maps to `medium` (inferred; `raising/SPEC.md` 5.1).

Exact definitions and per-level tables: `raising/SPEC.md` section 5.1. 潜力 display tiers
live in `data/potential.json` (raising thread).

## 5. Skill effect ops

Every effect is an object with an `op`, optional `chance` (0–100, default 100)
and optional `when` condition. The battle-engine thread implements these; the
catalog thread encodes skills with them. If a skill can't be expressed, use
`script` and list it in `data/scripts_needed.md` (490 at catalog v1) so the engine thread can add
an op or a script.

| op | fields | meaning |
|---|---|---|
| `stat_stage` | `target`, `stats` `{atk:+1,...}` | 能力等级 change (±6 cap) |
| `status` | `target`, `status` (id or list), `turns?`, `level?` | inflict a status (a list = one picked at random; `level` 1–5 for 衰弱) |
| `cure_status` | `target` | remove status |
| `clear_stages` | `target`, `which` (`up`/`down`/`all`) | 消除能力变化 |
| `heal` | `target`, `pct_max_hp`, `pct_damage_dealt` or `amount` | restore 体力 (吸血 = pct_damage_dealt on self) |
| `restore_pp` | `target`, `amount` | restore PP |
| `force_switch` | `target` | force the foe to switch |
| `recoil` | `pct_damage_dealt` | 反伤 to user |
| `fixed_damage` | `amount` | 固定伤害 |
| `pct_damage` | `pct_current_hp` or `pct_max_hp` | 百分比伤害 |
| `multi_hit` | `min`, `max` | 连续攻击 |
| `power_if` | `when`, `power` or `multiplier` | conditional power change |
| `priority_if` | `when`, `priority` | conditional 先制 |
| `add_condition` | `target`, `condition` id, `turns` (int or `[min,max]`), `charges?` | timed effect from `conditions.json` (e.g. "5回合内受到伤害减少50%"); `charges` = hits it absorbs (防护罩) |
| `remove_condition` | `target`, `condition` | |
| `pp_drain` | `amount` | 削减对方 PP |
| `protect` | `turns?` | 免疫本回合攻击 |
| `ohko` | | 秒杀 (bosses normally immune) |
| `swap_stages` / `copy_stages` | | |
| `script` | `id`, `params` | escape hatch, implemented in code |

`target`: `self` | `foe`. `when` examples:
`{ "foe_status": "paralysis" }`, `{ "self_hp_below_pct": 50 }`,
`{ "first_turn": true }`, `{ "foe_type": "water" }`, `{ "acted_first": true }`,
`{ "category": "physical" }`, `{ "skill_type": "fire" }` (of the incoming or
outgoing skill, inside condition hooks).

### 5.1 Conditions (`data/conditions.json`)

A condition is a named, timed modifier attached to a monster or a side. It is
expressed as hooks over a fixed set of engine extension points:

```json
{
  "id": "cond_reduce_damage_50",
  "name": { "zh": "减伤" },
  "stack": "refresh",
  "hooks": [{ "on": "modify_damage_taken", "multiplier": 0.5 }]
}
```

Hook fields beyond `multiplier`: `force_hit` (moves ignore accuracy),
`reflect_pct` (bounce part of damage taken), `consume_charge` (spend one of the
condition's `charges`; removed at 0).

Extension points (initial): `turn_start`, `turn_end`, `before_move`,
`modify_damage_dealt`, `modify_damage_taken`, `modify_stat`,
`on_hit`, `on_hurt`, `block_status`, `block_stage_down`, `on_switch_in`,
`on_faint`. Statuses (麻痹, 中毒, ...) are conditions with
`"kind": "status"` so there is one mechanism.

## 6. Raised monster (save data)

```json
{
  "uid": "a1b2c3",
  "species": 1,
  "nickname": null,
  "level": 5,
  "exp": 135,
  "iv": 15,
  "evs": { "hp": 0, "atk": 0, "def": 0, "spa": 0, "spd": 0, "spe": 0 },
  "nature": "adamant",
  "skills": [10001, 10002],
  "learned": [10001, 10002],
  "hp": 21,
  "pp": { "10001": 35, "10002": 30 },
  "status": null,
  "obtained": { "how": "wild", "at": "2026-10-02T00:00:00Z" }
}
```

- `iv` = 个体值, one value 0–31 applied to all stats (confirmed).
  潜力 is the display tier derived from `iv` (`data/potential.json`).
- `evs` = 学习力, per-stat cap 255, total cap 510 (confirmed).
- `exp` = EXP into the current level, not cumulative (Seer shows "exp / 升级所需").
- `skills` = equipped, max 4. `learned` = every skill it can re-equip.
- Stats are always **derived**, never stored.

### 6.1 Stat formula (confirmed by the battle thread's sources)

```
hp    = floor((2*base + iv + floor(ev/4)) * L / 100) + L + 10
other = floor((floor((2*base + iv + floor(ev/4)) * L / 100) + 5) * nature)
nature ∈ {1.1, 1.0, 0.9}, max level L = 100
```

### 6.2 Player save

```json
{
  "version": 1,
  "seed": 123456,
  "rng_state": null,
  "party": ["uid", "..."],
  "storage": [ { "...raised monster..." } ],
  "exp_pool": 0,
  "boosts": [],
  "items": { "item_ev_reset": 2 },
  "progress": { "bosses_cleared": ["boss_rei"], "boss_attempts": {} },
  "dex": { "seen": [1, 4], "owned": [1] }
}
```
`storage` holds every owned monster; `party` is 1–6 ordered uids from it (the box = storage minus party). `rng_state` is the shared `sfc32` state, `[u32, u32, u32, u32]` or `null`; battle and raising use the same PRNG. `exp_pool` = 积累经验 spent through the 经验分配器 (raising thread). `boosts` (optional) = active timed item effects, counted down per battle:
player-wide `{ kind: "exp" | "ev", item, multiplier, battles_left }`
(经验加速器, 学习力双倍仪) or per-monster
`{ kind: "energy_bead", item, uid, battles_left, stats?, crit_rate_add?, damage_taken_and_dealt_multiplier? }`
(能量珠, applied by the battle engine). Source of truth: `raising/core/types.ts`.

## 7. Bosses (`data/bosses/boss_rei.json`)

A boss is an encounter: one or more enemy monsters plus rules, win conditions
and rewards.

```json
{
  "id": "boss_rei",
  "name": { "zh": "雷伊" },
  "team": [
    {
      "species": 70,
      "level": 80,
      "iv": 31,
      "evs": { "spa": 255, "spe": 255 },
      "nature": "modest",
      "skills": [20001, 20002, 20003, 20004],
      "hp_override": 3000,
      "stat_multipliers": { "def": 1.5 }
    }
  ],
  "rules": [
    { "rule": "immune_status" },
    { "rule": "immune_crit" },
    { "rule": "immune_ohko" }
  ],
  "win": [{ "kind": "ko_all" }],
  "lose": [{ "kind": "turn_limit", "turns": 20 }],
  "phases": [
    { "when": { "self_hp_below_pct": 50 }, "do": [{ "op": "stat_stage", "target": "self", "stats": { "spa": 2 } }], "once": true }
  ],
  "ai": { "kind": "sequence", "skills": [20001, 20002, 20001, 20004] },
  "reward": { "items": { "essence_rei": 1 } },
  "variants": null,
  "limits": { "attempts_per_day": null },
  "unlock": { "requires": [] },
  "source_note": "..."
}
```

Rule vocabulary (sections 7 and 7.2):

- `rules`: `immune_status`, `immune_status_list {statuses}`,
  `immune_crit`, `immune_ohko`, `immune_stage_down`, `immune_fixed_damage`,
  `immune_percent_damage`, `damage_cap_per_hit {amount}`,
  `damage_only_from {types?, skills?, categories?, crit?, super_effective?}`,
  `heal_each_turn {pct_max_hp}`, `reflect_damage {pct}`,
  `invulnerable_turns {turns}`, `clear_debuffs_each_turn`, `lives {count}`,
  `player_level_cap {level}`, `player_team_size {max}`, `no_capture`,
  `no_items`, `no_switch`.
- `win` / `lose` kinds: `ko_all`, `turn_limit {turns}`,
  `finish_with_skill {skill}`, `finish_with_type {type}`, `finish_with_crit`,
  `survive_turns {turns}`, `deal_damage {amount}`, `script {id}`.
  Semantics: `battle/RULES.md` section 10.
- `phases`: HP-threshold or turn-number triggers running effect ops plus
  `transform {species}`, `set_skills {skills}`, `set_ai {ai}`,
  `revive {pct_max_hp}`, `say {text}`.
- `ai.kind`: `sequence` (fixed loop), `weighted` (`{skill: weight}`),
  `random` (wild default), `smart` (boss default), or `script`.

### 7.1 Items (`data/items.json`)

```json
{ "id": "item_capsule_basic", "name": { "zh": "初级精灵胶囊" }, "kind": "capsule",
  "capture_multiplier": 1 }
```
`kind`: `capsule` | `battle` | `raising` | `evolution` | `essence`
(boss 精元, carries `hatches: <species id>`). Battle items carry
`battle_effects` (effect ops, e.g. `heal {amount}`, `restore_pp`, `cure_status`);
capsules carry `capture_multiplier` (`null` = always succeeds); raising items
carry `raising_effect` ops: `exp`, `levels`, `ev_add`, `ev_reset`, `iv_reroll`,
`iv_set`, `nature_reroll`, `nature_set`, `restore` (`raising/SPEC.md` section 10).

### 7.2 Boss extensions from the pre-2013 research

Classic bosses were rule puzzles more than stat checks. Patterns and examples:
`design/notes/mechanics.md` section 1. Additions to express them:

- **Rules**: `no_repeat_type` (哈莫雷特: the same type can't hit twice in a row),
  `hp_floor_until {skill}` (尤纳斯 stays at 1 HP until 幻影 lands),
  `ignore_type_chart` (魔狮迪露), `heal_full_below {hp}` (阿克希亚),
  `block_heal` (奈尼芬多), `unlimited_pp`, `no_struggle` (a boss at 0 PP
  can't act, so running it out of PP wins), `flee_after_skill {skill, count}`
  (提亚斯), `strip_player_boosts_each_turn`, `damage_only_from {sure_hit: true}`
  (谱尼 虚无), `require_statuses {count}` (damage counts only while it has N
  statuses).
- **Phase actions**: `ohko_below_pct {pct}`, `always_crit_below_pct {pct}`,
  `swap_types {types}` (属性反转), `counter_skill {skill}` when low.
- **Objectives**: `ko_after_turn {turns}` (盖亚: survive 10 turns, then KO),
  `exhaust_pp` (win when the boss has no usable PP),
  `finish_with_status_damage {statuses}` (谱尼 seals: poison or burn).
- **Variants**: `variants: [{ id, label, win, lose, rules? }]`. 盖亚's weekday
  objectives (win in 2 turns / finish with a crit / survive 10 then KO) become
  variants the player picks. There is no real-time clock: hourly windows and
  weekday-only fights are dropped.
- **Chains** (`data/bosses/chains/*.json`): an ordered list of encounters.
  `carry_hp: true` keeps the boss's HP between battles (谱尼's seals,
  魔狮迪露's shared HP pool scaled down to one player); `no_heal_between: true`
  plus `restart_on_loss: true` gives a 勇者之塔-style tower. Levels above 100
  are allowed for tower bosses and shown as "???".
- **Rewards**: as in the original, a boss gives a 精元 item
  (`kind: "essence"`, `hatches: species`) only when every objective is met;
  hatching it yields the monster at level 1. Bosses are never captured
  (`no_capture` is implied).

## 8. Battle core interface (for the battle-engine thread)

```
createBattle({ sides: [Side, Side], rules, seed }) -> Battle
battle.legalActions(sideIndex) -> Action[]
battle.submit(sideIndex, Action)        // move / switch / item / flee
battle.resolveTurn() -> Event[]         // when both sides submitted
battle.state                            // read-only snapshot
battle.result                           // null | { winner, reason }
```

- `Action`: `{ kind: "move", skill }`, `{ kind: "switch", slot }`,
  `{ kind: "item", item, target }`, `{ kind: "flee" }`, `{ kind: "capture", item }`.
- `Event` examples: `turn_start`, `move_used`, `miss`, `damage {amount, crit,
  effectiveness}`, `heal`, `stat_stage`, `status_applied`, `condition_added`,
  `faint`, `switch_in`, `phase_triggered`, `battle_end`. The UI animates
  events in order and never computes rules itself.
- RNG: a single seeded `sfc32` PRNG owned by the battle, state serialisable,
  consumed in a fixed documented order. Damage, crit, accuracy and turn order:
  `battle/RULES.md` sections 3–5.

## 9. Raising rules interface (for the raising thread)

Pure functions over the save data:
`gainExp(mon, amount)`, `levelUp(mon)` (returns newly learnable skills and
evolution offers), `evolve(mon, to)` (carry-over rules: `raising/SPEC.md` section 7), `addEvs(mon, yield)` with caps,
`resetEvs(mon)`, `changeNature(mon, nature)`, `rerollIv(mon, rng)`,
`computeStats(mon)`, `potentialTier(iv)`.

## 10. Remake decisions (where faithful and practical differ)

- **No 特性, 第五技能, 魂印 in v1.** 特性 existed from mid-2011 (fusion
  bonuses) but is left out for v1; 第五技能 and 魂印 arrived after 2012.
  刻印 existed from 2011 and are now installed through 2013
  (`design/notes/engravings-2013.md`).
- **个体 rolls 1–31** for new monsters, as in the original; 0 is reachable only
  through raising items. (Raising thread: please change the roll.)
- **Bosses give 精元, not capture**, and only when the objective is met.
- **No real-time schedules.** Time windows and weekday objectives become
  selectable variants; there are no attempt limits per day by default.
- **Struggle**: normal monsters struggle at 0 PP; bosses with `no_struggle`
  don't, which keeps the classic out-of-PP wins.
- **Type chart**: `data/types.json` now has the 18 pre-2013 types. A few
  草/水 cells can't be verified against a dated 2011 source yet and are flagged
  in its `_note`.

## 11. Still open

- Exact highest species id at end of 2012 (estimated 1150–1400); the catalog
  sets it from its source data.
- When dual types arrived (likely 2012); the catalog keeps a species dual only
  if its pre-2013 version was.
