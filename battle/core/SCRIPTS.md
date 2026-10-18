# Writing scripted skill effects

Skills whose effect has no declarative op carry `{ "op": "script", "id": "seer_eff_<n>", "params": [...] }`.
`<n>` is the original Seer side-effect template; its Chinese text is quoted above each entry
(`params` = `{0}`, `{1}`, ... in order). Boss rules `{ "rule": "script", "id", "params" }` and phase ops
`{ "op": "script", "id", "params" }` use the same registry. Pass `scripts: SEER_SCRIPTS` in the battle options;
the game adds its own registries (see [Game registries](#game-registries)).

## Modules (`src/scripts/`)

| module | holds |
|---|---|
| `index.ts` | `SEER_SCRIPTS`, the merged registry |
| `seer-main.ts` | the 42 most used templates (3+ skills each) |
| `seer-tail.ts` | the other templates, with the interpretations and engine gaps they rely on |
| `boss.ts` | boss rules (`install`) and phase ops (`apply`); exports `statusOnAttacker` for campaign rules |
| `builders.ts` | entry factories: `timedScripts`, `ruleScripts` and the template families |
| `context.ts` | the context type of each entry member (`ApplyCtx`, `HookCtx`, ...) |
| `util.ts` | argument encodings, predicates, damage, stage and condition helpers |

A number quoted in a template's text stays next to that quote. Any other number (formulas, AI estimates,
interpretations) goes in the skill script section of `src/constants.ts`, with the other battle numbers.

## Game registries

`src/features/battle/battle-setup.ts` creates every battle with
`BATTLE_SCRIPTS = { ...SEER_SCRIPTS, ...traitScripts, ...campaignScripts, ...npcTrainingScripts }`:

| module | holds |
|---|---|
| `src/domain/traits.ts` | all 48 classic traits: `traits` (definitions, source parameters, implementation limitations) and `traitScripts` (their hooks), from one table keyed by the original effect id |
| `src/domain/challenges/campaign-rules.ts` | `campaignScripts`, the campaign encounter rules |
| `src/domain/challenges/npc-training-scripts.ts` | `npcTrainingScripts`, the seal passives of the NPC trainer's Gaia |

The game registries are built with the builders and helpers below (`builders.ts`, `util.ts`); campaign
`status_on_attacker` reuses the boss rule's hook, `statusOnAttacker` from `boss.ts`.

## Entry shape

An entry is a function (treated as `apply`) or an object with any of the members below. Each member's context is typed
in `context.ts`, so what a script emits (`battle.emit`) is checked against the `BattleEvent` union.

| member | called | context `c` | return |
|---|---|---|---|
| `apply(c, p)` | effect phase, after damage, in effect order; also a `script` AI spec's decision (`user` is the active monster) | `battle, user, foe, ctx` | ignored (the AI's action) |
| `power(c, p, power)` | before damage; also by the read-only probe behind the AI's damage estimate, with `c.estimate = true`: **no RNG draws then** | `battle, user, foe, skill, ctx, estimate` | new power |
| `priority(c, p)` | turn ordering | `battle, user, foe, skill` | new priority |
| `crit(c, p)` | crit roll | `battle, user, foe, skill, ctx` | `{ force?, add? }` (add = x/16) |
| `accuracy(c, p)` | accuracy check | `battle, user, foe, skill, ctx` | `true` sure hit, `false` miss |
| `defense(c, p, D)` | damage formula | `battle, user, foe, skill` | defender's effective def/spd |
| `modifyDamage(c, p, dmg)` | per hit, before condition multipliers | `battle, user, foe, skill, ctx` | damage |
| `finalDamage(c, p, dmg)` | per hit, after all multipliers | `battle, user, foe, skill, info` | damage |
| `ppCost(c, p)` | PP deduction | `battle, user, foe, skill` | PP spent |
| `onMiss(c, p)` | the skill missed | `battle, user, foe, skill, ctx` | ignored |
| `install(c, p)` | boss rule, once per matching team member at battle start | `battle, mon, side` | ignored |
| `objective(c, p)` | a `script` win or lose objective | `battle` | `true` when met |
| `hook(c, p)` | a condition hook `{ on, script: id, params }` fired | see below | see below |

`ctx` (MoveCtx): `skill, hit, crit, damageDealt` (total this move), `effectiveness, actedFirst, user, target`, and `data`, state
that a skill's members share during one move (seer_eff_185 remembers in `modifyDamage` what `apply` reads).

## Tables and builders

Most templates are one of two table shapes, so an entry only states its data:

- **Timed templates** ("{0}回合内…") go in a `TIMED` table and become entries through `timedScripts`.
  Each is `{ name, on, hook }`: the skill attaches condition `<id>` (the script id) to the user for `p[0]` turns,
  and `hook(c, p)` runs at the `on` points with the skill's params. Options: `foe` (attach to the foe, kind
  `debuff`), `kind`, `turns(p)`, `when(c, p)` (attach only if), `data(c, p)` (initial `cond.data`), `cover`
  (this turn counts as the first one). Families such as `evade`, `hurtStatus`, `drain`, `boostEachTurn`,
  `dropEachTurn`, `hurtDropsFoe` and `foeDamageEachTurn` return ready-made specs.
- **Rule conditions** (boss, campaign and NPC rules) are `{ on, hook }` tables turned into `install` + `hook`
  entries by `ruleScripts(table, install)`; each registry passes its own install policy (condition id,
  name, guards). Their `params` become `cond.data`.

One-shot families (`randomPower`, `bonusDamageIf`, `selfStageIf`) build plain entries. Anything else is
written out in the registry's `ENTRIES` table with the helpers below.

## Condition hooks with scripts

Timed effects are conditions. Outside a table, attach one with `attach` from `util.ts`:

```ts
attach(battle, user, 'seer_eff_142', '血之狂躁', scriptHooks(['modify_priority'], 'seer_eff_142', p), 1);
```

`attach(battle, mon, id, name, hooks, turns?, { kind, persist, data, cover })` adds the condition or refreshes
its turns (a refresh keeps the first definition and merges `data`), and returns the active condition.
`ruleCondition` is the permanent, switch-proof form used by encounter rules; `armBench`/`disarm` arm the
next monster to switch in.

The hook's `c` has `battle, point, holder` (the monster carrying the condition),
`cond` (the ActiveCondition: `turns`, `charges`, `data` for your own state), `hook`,
`foe`, plus the point's extras. The types cannot tell the points apart, so every extra is typed as set: read only the
ones your points pass. `source`, `skill`, `turns` and `clear` can be unset even there (status damage has no source or skill).

| point | extras | return |
|---|---|---|
| `before_move` (holder about to act) | `skill, foe` | `'prevent'` |
| `modify_priority` | `skill, priority` | number |
| `pp_cost` | `skill` | number |
| `on_foe_move` (foe uses any move) | `foe` (the user), `skill, ctx, targetsHolder` | `'negate'` |
| `on_expire` (condition removed: expired or cured) | `expired` | |
| `before_hit` (holder is about to be hit) | `foe, skill, ctx` | `'evade'` (miss) / `'block'` |
| `on_miss` / `on_foe_miss` | `foe, skill` | |
| `modify_power` (holder attacking) | `skill, power, foe` | number |
| `modify_crit_rate` | `skill, foe` | `{ force?, add? }` |
| `modify_stat` | `stat, value` | number |
| `modify_damage_final` (holder taking damage) | `amount, info, source, skill` | number |
| `on_hurt` (holder took damage > 0) | `source, amount, info, skill` | |
| `on_hit` (holder's move hit) | `skill, ctx` | |
| `on_ko` (holder knocked out its target) | `target, info, skill` | |
| `on_status_incoming` | `status, source, fromFoe, turns` | `false` blocks |
| `on_stage_incoming` | `stat, delta, byFoe` | `false` blocks, number replaces delta |
| `on_heal_incoming` | `amount, item` | number (negative = damage instead) |
| `turn_start`, `turn_end`, `on_switch_in`, `on_faint` | | |

`info` (DamageInfo): `kind` (`attack`/`fixed`/`percent`/`true`), `source, skill, crit, effectiveness, status`.

Timing helpers for hooks: `counts(c)` (the condition ticks this turn), `expiring(c)` (it ends this turn),
`once(c)` (first reaction this turn).

## Battle helpers

`battle.rng` (`chance(pct)`, `int(a,b)`, `pick(xs)`, `next()`) is the only randomness.
`applyStatus(mon, id, { turns, level, source })`, `changeStage(mon, stat, delta, byFoe)`,
`clearStages(mon, 'up'|'down'|'all')`, `dealDamage(mon, n, { kind: 'fixed'|'percent', source, skill })`,
`heal(mon, n)`, `addCondition(mon, def, turns?, level?, charges?)`, `removeCondition(mon, id)`,
`foeOf(mon)`, `active(side)`, `effStat(mon, stat)`, `emit({ type, ... })`, `turn`, `sides`, `lastKo`, `result`.
Monster: `hp, maxHp, level, types, stats, stages, conditions, skills, pp, maxPp,
species, fainted, vol` (cleared on switch-out), `persist` (whole battle; `persist.lastTaken = { turn, amount }` is damage taken from the foe), `streak`
(`{ skill, count }` consecutive uses), `skillUses`, `lastActedTurn`, `side`, `slot`.

`util.ts` wraps the common forms: `hitFoe(c, n, kind?)` (extra damage only when the move landed),
`selfLoss`, `changeStages`, `raiseStagesTo`, `moveStages`, and the predicates `landed`, `fromFoeAttack`,
`hasStatus`, `hasAnyStatus`, `hasStageUp`, `hasStageDown`, `sameType`.

Scripts import `Battle` and `Mon` as types only and keep no state outside the battle (`cond.data`,
`vol`, `persist`), so `clone.ts` can copy a battle. The exceptions are two synchronous re-entrancy guards, set only
while their hook runs: seer-tail's `reflecting` (seer_eff_191) and seer-main's `mirroring` (seer_eff_91).

## Original arg encodings

- Status index: 0 麻痹 `paralysis`, 1 中毒 `poison`, 2 烧伤 `burn`, 3/4 寄生 `leech`,
  5 冻伤 `freeze`, 6 害怕 `fear`, 7 疲惫 `fatigue`, 8 睡眠 `sleep`, 9 石化 `petrify`,
  10 混乱 `confusion`, 11 衰弱 `weaken`, 13 易燃 `flammable`, 15 冰封 `frozen_solid`.
- Stat index: 0 `atk`, 1 `def`, 2 `spa`, 3 `spd`, 4 `spe`, 5 `acc`.

`status(i)` and `stat(i)` in `util.ts` decode both.
