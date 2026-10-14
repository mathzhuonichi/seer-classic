# Writing scripted skill effects

Skills whose effect has no declarative op carry `{ "op": "script", "id": "seer_eff_<n>", "params": [...] }`.
`<n>` is the original Seer side-effect template; `data/scripts_needed.md` lists every
template with its Chinese text and example skills (`params` = `{0}`, `{1}`, ... in order).
Implementations live in `src/scripts/` and are merged into `SEER_SCRIPTS`
(`src/scripts/index.ts`). Pass `scripts: SEER_SCRIPTS` to `createBattle`.

## Entry shape

An entry is a function (treated as `apply`) or an object with any of:

| member | called | context `c` | return |
|---|---|---|---|
| `apply(c, p)` | effect phase, after damage, in effect order | `battle, user, foe, ctx` | ignored |
| `power(c, p, power)` | before damage (also by the AI with `c.estimate = true`: **no RNG draws then**) | `battle, user, foe, skill, ctx, estimate` | new power |
| `priority(c, p)` | turn ordering | `battle, user, foe, skill` | new priority |
| `crit(c, p)` | crit roll | `battle, user, foe, skill, ctx` | `{ force?, add? }` (add = x/16) |
| `accuracy(c, p)` | accuracy check | `battle, user, foe, skill, ctx` | `true` sure hit, `false` miss |
| `defense(c, p, D)` | damage formula | `battle, user, foe, skill` | defender's effective def/spd |
| `modifyDamage(c, p, dmg)` | per hit, before condition multipliers | `battle, user, foe, skill, ctx` | damage |
| `finalDamage(c, p, dmg)` | per hit, after all multipliers | `battle, user, foe, skill, info` | damage |
| `ppCost(c, p)` | PP deduction | `battle, user, foe, skill` | PP spent |
| `onMiss(c, p)` | the skill missed | `battle, user, foe, skill, ctx` | ignored |
| `hook(c, p)` | a condition hook `{ on, script: id, params }` fired | see below | see below |

`ctx` (MoveCtx): `skill, hit, crit, damageDealt` (total this move), `effectiveness, actedFirst, user, target`.

## Condition hooks with scripts

Timed effects ("N回合内…") are conditions. Create them inline:

```ts
battle.addCondition(user, {
  id: 'seer_eff_78', name: { zh: '物理闪避' }, kind: 'buff', stack: 'refresh',
  hooks: [{ on: 'before_hit', script: 'seer_eff_78', params: p }],
}, p[0]);   // turns
```

The hook's `c` has `battle, point, holder` (the monster carrying the condition),
`cond` (the ActiveCondition: `turns`, `charges`, `data` for your own state), `hook`,
`foe`, plus the point's extras:

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

## Battle helpers

`battle.rng` (`chance(pct)`, `int(a,b)`, `pick(xs)`, `next()`) is the only randomness.
`applyStatus(mon, id, { turns, level, source })`, `changeStage(mon, stat, delta, byFoe)`,
`clearStages(mon, 'up'|'down'|'all')`, `dealDamage(mon, n, { kind: 'fixed'|'percent', source, skill })`,
`heal(mon, n)`, `addCondition(mon, def, turns?, level?, charges?)`, `removeCondition(mon, id)`,
`foeOf(mon)`, `effStat(mon, stat)`, `emit({ type, ... })`, `turn`, `sides`.
Monster: `hp, maxHp, level, types, stats, stages, conditions, skills, pp, maxPp,
species, fainted, vol` (cleared on switch-out), `persist` (whole battle; `persist.lastTaken = { turn, amount }` is damage taken from the foe), `streak`
(`{ skill, count }` consecutive uses), `skillUses`, `lastActedTurn`, `side`, `slot`.

## Original arg encodings

- Status index: 0 麻痹 `paralysis`, 1 中毒 `poison`, 2 烧伤 `burn`, 3/4 寄生 `leech`,
  5 冻伤 `freeze`, 6 害怕 `fear`, 7 疲惫 `fatigue`, 8 睡眠 `sleep`, 9 石化 `petrify`,
  10 混乱 `confusion`, 11 衰弱 `weaken`, 13 易燃 `flammable`, 15 冰封 `frozen_solid`.
- Stat index: 0 `atk`, 1 `def`, 2 `spa`, 3 `spd`, 4 `spe`, 5 `acc`.

Helpers for both are exported from `src/scripts/util.ts`.
