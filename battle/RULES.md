# Seer Classic: Battle Rules Spec

Owner: the "Battle engine" thread. Status: **v1.0**, implemented by `battle/core/` (checks: section 13).
Every number here is a named constant in `core/src/constants.ts`, so a rule that
turns out to be wrong is a one-line change. Confidence tags:
**[sourced]** = found in a Seer guide, **[recalled]** = from memory of the game,
**[chosen]** = our decision where the original is unknown or not worth copying.

Data shapes are defined in `core/src/types.ts` (see `ARCHITECTURE.md`). The additions
this spec requested from the original data model are listed in section 14.

## 1. Battle format

- 1 active monster per side, up to 6 in the party. [recalled]
- Each turn both sides pick one action: `move`, `switch`, `item`, `capture`
  (wild only), `flee`. Switching or using an item costs the turn. [recalled]
- When the active monster faints, its owner picks a replacement before the next
  turn. That replacement does not cost a turn. [recalled]
- A side loses when every monster in its party has fainted. Fleeing always
  succeeds and counts as a loss for the fleeing side. [chosen]
- HP and PP carry over after battle (the caller writes them back to the save);
  statuses, stat stages and conditions do not. [recalled]

## 2. Stats

Stats come from the raising rules (`raising/SPEC.md` section 1). The battle core
accepts either a raised monster (it then calls the same `computeStats`) or
precomputed stats (bosses with `hp_override`, tests).

```
hp    = floor((2*base + iv + floor(ev/4)) * L / 100) + L + 10
other = floor((floor((2*base + iv + floor(ev/4)) * L / 100) + 5) * nature)
```
[sourced: jiangshibiao PVE 百科 gives the L=100 form, "(2·种族值+学习力/4+个体值+偏移量)×性格修正", offset 110 for HP and 5 otherwise, IV 0–31, nature 0.9/1.0/1.1]

### 2.1 Stat stages (能力等级)

`atk, def, spa, spd, spe` range −6..+6. [sourced: 7k7k 2010-10-15 浅蓝, Wayback 2010-10-18; 7k7k 2011-03-29]

| stage | +n | −n |
|---|---|---|
| multiplier | (2+n)/2 → +1 ×1.5, +2 ×2 … +6 ×4 | 2/(2+n) → −1 ×0.667, −2 ×0.5 … −6 ×0.25 |

[sourced for both: "每提升一个等级，现有能力比原始能力提高0.5倍" with the table 1.5 … 4 and 2/3, 1/2, 0.4, 1/3, 0.286,
0.25, each end "极限封顶" (7k7k 2010-10-15, 2011-03-29); later summaries say "乘或除 (1+0.5n)"]

`acc` (命中) also ranges −6..+6. `eva` (闪避) is an engine extension, not a period stage (period sources list six
stages: the five above and 命中); only the Boss rule `evasion_bonus` sets it. Effective accuracy stage = user `acc` −
target `eva`, clamped to ±6.

| stage | −1 | −2 | −3 | −4 | −5 | −6 |
|---|---|---|---|---|---|---|
| hit multiplier | 0.85 | 0.70 | 0.55 | 0.45 | 0.35 | 0.25 |

Positive: (2+n)/2, as other stats: +1 ×1.5 … +6 ×4. [sourced: the September 2010 accuracy update, 4399 2010-09-01
and 7k7k 2010-10-15 (0.25 … 0.85, 1, 1.5 … 4); before it, drops followed 2/(2+n) (4399 2010-08-26)]

Switching out resets all stages. [recalled]

### 2.2 Energy beads (能量珠)

`MonsterInput.beads` (from raising's `activeBeads`) applies for the whole
battle: `stats` are added flat to the computed stats; `crit_rate_add`,
`damage_dealt_multiplier`, `damage_taken_multiplier` and
`damage_taken_and_dealt_multiplier` become a permanent `energy_bead` condition
that is not removed by switching.

## 3. Turn order

1. `flee`, `capture`, `item`, `switch` resolve before any move, player side first. [chosen]
2. Moves: higher skill `priority` (先制) first. [recalled]
3. Same priority: higher effective speed (stats × stage) first. [recalled]
4. Speed tie: coin flip from the battle RNG. [chosen]

**先手权.** The side whose move resolves first holds 先手权 (先出手); the other
moves last (后出手). A side that switches, uses an item or throws a capsule
gives it up: when only one side uses a move, that move is 先出手 although it
resolves after the other side's action. Every 先出手/后出手 effect reads this
(effects 30/40 and the templates 73, 116, 117, 122, 138, 147, 148, 170, 172,
173, 186, 196, 402, 405). Whether a monster has acted yet this turn (status
durations, 急速闪避) still follows the resolution order. [sourced: 赛学必修9
先手权, Bilibili cv34358166: 「通过切换，嗑药等操作放弃获得先手权时，会默认为后手方」;
no period counter-evidence; user decision 2026-10-21]

## 4. Using a move

In order:

1. **Can act?** Control statuses (麻痹, 害怕, 疲惫, 睡眠, 石化, 冰封) skip the
   move. 混乱: 80% chance the move fails, plus 5% chance to take 50 damage.
   [sourced]
2. **PP**: −1 when the move is attempted (also on a miss; not when the monster
   could not act). A skill at 0 PP cannot be chosen. If every equipped skill is
   at 0 PP the monster can still choose `struggle` (挣扎, power 50 typeless
   physical, 1/4 recoil). [chosen; the original had no reliable rule] A Boss
   side never struggles: with every skill at 0 PP it stands still (`cant_act`,
   reason `no_pp`). [sourced: 4399 2010-11-23 「只到哈默不动了」; 7k7k
   2010-08-05 「当谱尼不会动了的时候，说明PP耗完了」] Boss sides with
   `unlimited_pp` spend no PP.
3. **Accuracy**: a 必中 move (`accuracy: null`, or a force-hit accuracy hook
   such as `cond_sure_hit` or the Boss rule `always_hit`) always hits, and the
   evasion conditions of effects 78 and 106 (「n回合内物理/特殊攻击对自身必定miss」)
   and the trait 虚无 do not stop it; 圣洁 (effect 86, status moves) still does.
   [sourced: 赛学必修1, cv34339526: 「闪避：非必中技能必定miss（对必中技能不影响）」;
   圣洁 kept by user decision 2026-10-21] Otherwise
   hit if `rng < accuracy/100 × stage multiplier × condition multipliers`.
   [sourced formula shape]
4. **Damage** (attack skills, power > 0), section 5.
5. **Effects** in listed order, each with its own `chance`. Effects run even if
   damage was 0 because of type immunity only if the op is `target: self`.
   [chosen]
6. **Faint checks** after each damage instance.

Status skills (`category: status`) skip step 4 and always apply effects on a
hit.

Scripted skills (section 12) can change power, priority, crit, accuracy, PP
cost and damage at fixed points of this sequence, and conditions on either
monster can cancel the move (`on_foe_move`), evade or block it (`before_hit`),
or react once it has reached the target, before its damage and effects
(`on_foe_hit`, as the 反击 traits do).

## 5. Damage formula

```
base   = floor( (0.4*L + 2) * power * A / D / 50 ) + 2
damage = floor( base × STAB × type × rand(217..255)/255 × crit × first × burn × mods )
```
The algebraic shape is a historical reconstruction. The inner floor, discrete
uniform roll and exact modifier boundaries are retained remake conventions;
they are not a recovered server specification. See
[the source review](../design/notes/damage-formula-research.md) for dated
evidence, contradictory claims and unresolved integer boundaries. The displayed
formula summarizes the ordinary multiplier stage; scripted final adjustments
are sequential and can introduce further floors.

- `L` attacker level. `A`/`D` = attacker 攻击 vs defender 防御 for physical,
  特攻 vs 特防 for special, each after stage multipliers.
- `STAB` 本系加成 = **1.5** when the skill type is one of the attacker's types.
  The alleged 1.1 guides repeat the same example using 1.5 and do not establish
  an independent historical alternative.
- `type` = effectiveness, section 6.
- `rand` = integer 217..255 inclusive, divided by 255. [sourced]
- `crit` 致命一击 = **2**. The local rate is `crit_rate`/16, default 1/16.
  An ordinary damaging critical hit uses the existing attack/defense stages,
  then clears only a positive corresponding defense stage (physical: `def`,
  special: `spd`). Other stages remain. Explicit clearing-block hooks are
  honored. The reconstruction clears once after all powered hits in a move;
  historical multi-hit clearing timing is unverified.
- `first` = the skill's `damage_if` multiplier when its 先出手/后出手 condition
  holds (effects 40/30, ×2): the period effect doubles the damage, not the
  power. [sourced: 赛学选修1 增伤, cv34369402; user decision 2026-10-21]
- `burn` = 0.5 if the attacker is 烧伤, for physical and special attacks.
  A 2010 reported test supports both categories; placement after the additive
  term remains a reconstruction choice rather than a proved integer boundary.
- `mods` = product of condition hooks `modify_damage_dealt` (attacker) and
  `modify_damage_taken` (defender), including 衰弱.
- The local minimum is 1 for positive attack damage with `type > 0`, unless a
  matching modifier explicitly set damage to zero. Such shields still block
  their last charge. Inactive modifiers do not suppress the minimum. Final
  scripted shields may also reduce damage to zero. Type immunity remains zero.
- Damage never exceeds the target's current HP in events (overkill is
  reported separately as `overkill`).
  Popups and battle logs display `amount + overkill`, while HP loss, drain,
  reflection and the engine's damage-based effects use the actual HP loss.
  The battle screen shows a move's damage to one creature (every hit and every
  rider; on the user its recoil and the counters it draws) as one number that
  counts up with each hurt and one line of the total. Status damage and other
  damage after `turn_end` (section 8) show one number per event. The engine
  still emits one `damage` event per hit (design/notes/damage-display-2026-10-23.md).

### 5.1 Damage kinds

| kind | source | reduced by type/crit/mods | notes |
|---|---|---|---|
| `attack` | skill power | yes | "红伤" |
| `fixed` | `fixed_damage` op | only by `modify_damage_taken` with `kinds` incl. fixed | "固伤" |
| `percent` | `pct_damage`, poison, burn, freeze, leech | same as fixed | "百分比伤害" |
| `true` | scripts only | never | bypasses damage reducers and final shield scripts; explicit encounter restrictions still govern opponent attacks |

Boss rules filter on kind (`immune_fixed_damage`, `immune_percent_damage`,
`damage_only_from`).
Non-OHKO true self-costs also bypass encounter HP floors so sacrifice effects
actually consume the specified HP. Multiple outgoing/final script transforms
receive the preceding transform's result, in condition order.

The AI's damage estimate is a read-only probe of this same pipeline
(`probeDamage`): one attack hit at a fixed roll and crit, by default the mean
roll `MEAN_ROLL` without a crit (`estimateDamage`). It draws no RNG, emits no
events and consumes no charges; apart from caches kept by estimate-mode power
scripts, it changes no state. Condition multipliers and boss rules apply as
in a real hit; the skill's `power` scripts run with `c.estimate = true` and its
`defense` scripts run as usual; other scripts (`modifyDamage`, `finalDamage`,
scripted hooks) are skipped; chance-gated `power_if` and a damage-cap break
count as not triggered. The
search planner also probes the minimum roll to find sure knockouts, and the
opponent model probes both roll limits to bound unseen stats. The probe is
therefore not a complete simulation of scripted shields.

## 6. Type effectiveness

Single type: `chart[attacker][defender]`, missing = 1. Values 2 / 1 / 0.5 / 0.

Single attacking type against a dual defender:

```
coefs = [chart[a][d1], chart[a][d2]]
result = mean(coefs)
if both coefs are 2       -> result = 4
if any coef is 0          -> result = mean / 2        (e.g. 2 & 0 -> 0.5, 1 & 0 -> 0.25)
```
For a dual attacking skill, apply that same `combine` operation to its two
attack types against each single defending type, then average the results over
the defending types. Do not transpose the grouping. A controlled 2018
[experiment by Orange](https://news.4399.com/gonglue/seer/jingyanxinde/825548.html)
supports this direction; its date is later than the classic target.

The chart itself lives in `data/types.json` (catalog thread); its single-type
coefficients match the official Unity configuration (`data/README.md`).

## 7. Statuses (异常状态)

A monster can carry several different statuses at once; re-applying one it
already has fails. Default duration 2–3 turns (rolled) unless the skill gives
`turns`. Durations count the afflicted monster's own turns: if it has not
acted yet this turn, this turn is the first one affected and the status ticks
at this turn's end; if it already acted, the first tick is next turn's end.
A status applied this turn does no damage at this turn's end. It is removed
at 0. Switching out and fainting remove all statuses. [sourced durations and
effects; switching rule recalled; counting chosen]

A monster of the matching type cannot get these statuses from any source, its
own effects included (`status_blocked`, reason `type_immunity`): 寄生 on grass,
烧伤 on fire, 冻伤 on ice. A dual-type monster is immune when either of its
types matches. 冰封 and 易燃 are not covered; the 烧伤 that 易燃 inflicts and
the 冻伤 that ends 冰封 are. [sourced: 寄生种子 「对草系无效」; 赛学扩展1
(cv39757579) on the 2009 templates 「对方精灵属性为草系（对应寄生）、火系（对应烧伤）、冰系（对应冻伤）的时候，必定不会触发异常」;
dual types follow the 寄生 rule: chosen]

| id | 中文 | effect |
|---|---|---|
| `paralysis` | 麻痹 | cannot act |
| `poison` | 中毒 | lose 1/8 max HP at turn end |
| `burn` | 烧伤 | lose 1/8 max HP at turn end; attack damage ×0.5; not on fire types |
| `leech` | 寄生 | lose 1/8 max HP at turn end, the opponent heals that much; 5 turns; not on grass types |
| `freeze` | 冻伤 | lose 1/8 max HP at turn end; not on ice types |
| `fear` | 害怕 | cannot act |
| `fatigue` | 疲惫 | cannot act (also used as the recharge turn after strong skills) |
| `sleep` | 睡眠 | cannot act; removed when hit by an attack |
| `petrify` | 石化 | cannot act |
| `confusion` | 混乱 | 80% chance the move fails; 5% chance to take 50 damage |
| `weaken` | 衰弱 | damage taken ×1.25 / 1.5 / 2 / 3.5 / 6 by level 1–5 (skill sets level) |
| `flammable` | 易燃 | accuracy ×0.7; fire attacks taken inflict 烧伤 |
| `frozen_solid` | 冰封 | cannot act; when it ends, becomes 冻伤 and speed −1 |

All of these are ordinary conditions (`kind: "status"`) defined in
`core/src/builtin-conditions.ts`; `data/conditions.json` may override any of
them by id.

## 8. Turn end

A textless `turn_end { turn }` event opens the turn's end, so the displays can tell
its damage from the last move's (section 5). Then, in order, player side first:
[chosen order]
1. Status damage (poison, burn, freeze, leech).
2. Condition `turn_end` hooks (scripted effects, boss rule scripts).
3. Boss side rules: `heal_each_turn`, `clear_debuffs_each_turn`,
   `strip_player_boosts_each_turn`.
4. Durations tick down; expired conditions are removed (`condition_removed`).
5. Boss phase triggers that watch HP or turn number.
6. Win / lose checks and ending objectives.

## 9. Capture (wild only)

```
a = (3*maxHP - 2*HP) * catch_rate * capsule / (3*maxHP) * statusBonus
capture if rng < a / 255 (always if a >= 255)
statusBonus = 2 for a control status, 1.5 for any other status, else 1
```
Capsule multipliers come from the item (`capture_multiplier`); a capsule with
`capture_multiplier: null` always succeeds. [chosen, Pokémon-style]

The equation and random draw are remake calibration, not recovered official
server probabilities. Official capture command 2409 sends a capsule ID and
receives the result. An ordinary Niao (species 416) encounter requires active
species 77, 78, 79, 310, 311 or 312 before any capsule can be used; this gate is
source-verified. The official server's separate `catchType` field is not modeled.
See `design/notes/capture-official-v25.md` for table/protocol evidence and limits.

A successful capture ends the battle as the player's win: `winner: 0`,
`reason: capture` and `success` (a wild battle has no objectives). The caught
monster was not knocked out, so it is not in `defeated`. The game settles a
capture as a victory: it counts as a won battle and pays the wild victory's
coins and pooled experience. [chosen]

## 10. PvE bosses

A boss encounter (`data/bosses/*.json`, shape `BossEncounter` in `core/src/types.ts`) builds side 1
from `team` (`hp_override`, `stat_multipliers` per member; `level_masked` only shows the level as ??) and adds rules,
phases, objectives and AI. `validateEncounter` checks the player team first: `partyRules`
reads the encounter's rules on the player's team as `PartyRule`s (`team_max`, `team_min`,
`level_max`, `level_min`, `species`), and each rule the team breaks comes back as a
`PartyRefusal` with the team size and the slots of the members that break it. The game words
both for the player.

### 10.1 Rules

| rule | effect |
|---|---|
| `immune_status` / `immune_status_list {statuses}` | statuses fail; the lists of several `immune_status_list` rules (a variant's and the top-level one) add up |
| `immune_crit` | never takes a critical hit |
| `immune_ohko` | `ohko` op fails |
| `immune_stage_down {stats?, except_attacks?}` | foe cannot lower its stages (only `stats` when listed; all, accuracy and evasion included, otherwise), a `stage_blocked` event; with `except_attacks`, a drop that an attacking (physical or special) skill makes as its own effect still lands, while drops from status moves, conditions and traits fail; its own drops still apply |
| `immune_fixed_damage` / `immune_percent_damage` | those damage kinds do 0 |
| `damage_cap_per_hit {amount}` | each hit capped (not `true` damage) |
| `damage_only_from {types?, skills?, categories?, crit?, super_effective?, sure_hit?, kinds?}` | all other damage from the foe does 0 |
| `no_repeat_type` | an attack of the same type as the previous attack that hit it does 0 |
| `hp_floor_until {skill \| skills}` | cannot drop below 1 HP until hit by one of those skills |
| `barrier_until_skill {skill}` | the foe's attacks do 0 until its hit by that skill breaks the barrier |
| `heal_full_below {hp, times?}` | heals to full when HP drops below `hp` (up to `times`) |
| `heal_each_turn {pct_max_hp}` | turn end heal |
| `reflect_damage {pct, min_damage?, not_on_ko?}` | attacker takes pct of each hit of at least `min_damage`; with `not_on_ko`, not of the hit that knocks the boss out |
| `invulnerable_turns {turns}` | takes 0 damage for the first N turns |
| `clear_debuffs_each_turn` | removes its own negative stages at turn end |
| `strip_player_boosts_each_turn` | removes the foe's positive stages at turn end |
| `block_heal` | the player cannot heal (items, drain) |
| `unlimited_pp` | section 4 step 2 |
| `flee_after_skill {skill \| skills, count?}` | the boss leaves after using it `count` times: result `boss_fled`, no winner |
| `ohko_below_pct {pct}` / `always_crit_below_pct {pct}` | below that HP its attacks KO / always crit |
| `lives {count}` | on fainting, revive to full HP and PP `count` times (multi-life bosses) |
| `player_level_cap {level}` / `player_team_size {max?, min?, min_level?}` | checked by `validateEncounter` before the battle |
| `script require_player_species {species}` | only those species may fight; checked by `validateEncounter` before the battle |
| `no_capture` / `no_items` / `no_switch` | disable those actions for the player |
| `script {id, params}` | a boss rule script (`core/src/scripts/boss.ts`), or an alias of a native rule (`infinite_pp`, `immune_pct_damage`, `reflect_damage`) |

Boss rule scripts: `drain_each_turn`, `stages_unclearable`,
`immune_skill_list`, `foe_stage_each_turn`, `copy_foe_boosts_on_switch_in`,
`mirror_status_to_attacker`, `lifesteal`, `escalate_vs_same_foe`,
`status_on_attacker`, `random_heal`, `ignore_player_damage_reduction`,
`foe_status_each_turn`, `random_priority`, `skill_effect_override`,
`damage_cap_breaks_on_dot`, `foe_cannot_boost`, `repeat_attack_damage_multiplier`,
`foe_stage_on_entry`.

`foe_stage_on_entry {stats}`: every foe monster's stages change by `stats`
(a foe drop) each time it enters, the battle start included, so the lead
starts at them before the first command. Switching out resets stages, so each
later entry, a faint replacement included, applies them again.

`repeat_attack_damage_multiplier {multiplier}`: when the foe's previous
move on the boss was an attack (physical or special), the attack damage of
its next attack is multiplied by `multiplier` and rounded down
(`modify_damage_final`), so every attack in a row after the first is reduced.
A status move breaks the chain. Only the moves the foe gets to use count
(the boss's `on_foe_move`, before accuracy): a missed attack extends the
chain, while a switch, an item or a turn in which the foe cannot act leaves
it as it was.

`stages_unclearable {stats?, except_sure_hit?, except_skills_zh?}`: the foe
cannot clear the boss's stages (only `stats`, when listed). A clear by a
sure-hit skill (`accuracy: null`) with `except_sure_hit`, or by a skill named
in `except_skills_zh`, still works. A move's clear, including the critical-hit
defence clear, passes its skill to `on_stage_incoming`; a clear outside a move
has none and is blocked.

`ignore_player_damage_reduction {skills_zh?, except_skills_zh?}`: the boss's
moves ignore the player's protections: damage reductions (`modify_damage_taken`
below 1), evasion and blocks (`before_hit`, `block_move`), and the negation of
its move (`on_foe_move` `negate` or `miss`, such as 虚无 and 空间跳跃; the
condition's other reactions still happen). With `skills_zh` it ignores only the
conditions that the effects of the player's skills with those names attach. The
conditions that the skills named in `except_skills_zh` attach still protect.

`barrier_until_skill {skill}`: until the foe hits the boss with that skill, the
foe's attacks do 0: `attack` damage and the fixed or percent damage of a
physical or special skill. Damage without a skill (statuses, reflection) still
works. The skill's own hit deals its damage and breaks the barrier for the rest
of the battle (a `boss_trait` event with trait `barrier_broken`).

### 10.2 Phases

`{ when, do, once }`. `when` uses the condition language of effect ops
(`self_hp_below_pct`, `turn`, `turn_ge`, `on_faint`, `lives_left`, `all`,
`any`, `not`, ...). Phases are checked when a boss monster enters (the battle
start included), at turn start, after each hit and at turn end, so a
`first_turn` phase, such as an innate boost (天生强化), is in place and shown
before the player's first command. A phase fires once unless `once: false`,
which runs it at every check where `when` holds. `do` is
a list of effect ops plus `transform {species, keep_hp?, full_heal?}`,
`set_skills {skills}`, `set_ai {ai}`, `revive {pct_max_hp}`, `say {text}`
(boss dialogue for the UI), `ohko_below_pct`, `always_crit_below_pct`,
`swap_types`, `counter_skill` and `script {id}` (`crit_rate_up`, `heal_flat`,
`always_crit`, `damage_dealt_multiplier`).

### 10.3 Objectives and results

`win` and `lose` lists. The battle ends when a side runs out of monsters, a
`lose` condition triggers, an ending objective is reached, or the boss flees.
`success` = player won **and** every `win` objective was met.

| win objective | met when |
|---|---|
| `ko_all` | every boss monster fainted |
| `turn_limit {turns}` | won within N turns |
| `finish_with_skill {skill \| skills}` / `finish_with_type {type \| types}` / `finish_with_crit` | the final KO was by that skill / type / a crit |
| `finish_with_status_damage {statuses?}` | the final KO was a status tick (default poison, burn, freeze, leech) |
| `ko_after_turn {turns}` | the final KO came after turn N |
| `survive_turns {turns}` | **ends** the battle as a win once reached |
| `deal_damage {amount}` | cumulative; **ends** the battle once reached |
| `exhaust_pp` | **ends** the battle once every boss skill is at 0 PP |
| `script {id}` | the script's `objective` returns true |

Lose: `turn_limit {turns}` (the player loses at the end of turn N), `script`.

**Variants** (`encounter.variants[]`, chosen by the player with `variant`):
each adds `rules` and `phases` and may replace `win` / `lose`. The game offers
the choice before the start and settles its rewards (ARCHITECTURE.md, remake
decisions).

**Result** (`BattleResult`): `winner`, `reason` (`ko`, `flee`, `capture`,
`objective`, `lose_condition`, `turn_cap`, `boss_fled`), `success`,
`objectives`, `captured`, `turns`, and `defeated`: one entry per foe the
player knocked out, `{ foe: { species, level, boss? }, participants }`, where
participants are the player monsters (uid, else `slot<n>`) that were on the
field against it. This is the input of raising's `applyBattleRewards`.

**Rewards** (paid by the game's settlement, not the engine): a victory pays
`reward.items`, and a first clear also pays `reward.first_clear_items` once
(里奥斯's 蓝武士装, a collectible like Brave Tower's 闪光套装).
`consolation_reward` is dropped: 阿洛比斯's 10万经验券 and B级技能石 on every
attempt, won or lost, would add nothing, because raising items are unlimited.

### 10.4 AI

The engine asks an injected `BattlePolicy` (`chooseAction`, `chooseReplacement`)
for every automatic side and never imports an AI. The game injects `AI_POLICY`
from `ai/src/` (`src/kernel/context.ts`); module paths below are relative to
`ai/src/`. `ai.ts` dispatches on the `ai` spec: `sequence`, `weighted`, `random`
(wild default: uniformly among usable skills), `script`, and `smart` (boss and
trainer default). A forced skill from `counter_skill` overrides all of them.
A `sequence` whose listed skills are all spent is decided by the side's default
policy (`random` for a wild side, `smart` otherwise). A side with no usable
skill uses Struggle (a Boss stands still instead, section 4), except that a
smart trainer plans first and may restore PP with an item instead.

`smart` has two implementations, chosen by side kind:

- **Boss and other non-trainer sides: the 裸伤 policy** (`legacy-ai.ts`;
  [boss-ai-raw-damage-2026-10-21](../design/notes/boss-ai-raw-damage-2026-10-21.md)).
  Each usable skill is scored by its priority and by its expected damage
  against the live foe: the damage probe (5.1) times the mean hit count of a
  `multi_hit` op, times the hit chance from accuracy and accuracy/evasion
  stages, and never more than the foe's HP. A skill whose estimate times its
  fewest hits knocks the foe out wins, highest priority first, then highest
  expected damage, and no random number is drawn. Otherwise, while some skill
  has a positive estimate and some non-attacking skill still changes something
  (`idle-moves.ts`: a stage not yet at its cap and not refused, a heal when
  hurt, a status the target neither has nor is immune to, something to clear
  or cure, a condition that can be added again; any other effect, such as a
  script, counts as a change), one RNG value decides: below
  `BOSS_STATUS_CHANCE` (0.2, the same for every Boss) it picks among those
  skills, scaled to their number; otherwise it uses the highest expected
  damage. With no such skill there is no draw and it uses the highest
  expected damage. Remaining ties go to the higher single-hit estimate, then
  to skill order. [chosen: the community model of the Boss AI, BWIKI
  赛尔号PVE概论 and jiangshibiao PVE百科全书, which period guides fit: 「他强化
  （碰运气）」「如果它选择强化」, and 哈莫雷特 「没技能前会用很多招龙之意志」]
  The project keeps two deviations from that model: a status skill that
  changes nothing is never picked, and no turn goes to an attack that cannot
  hurt the foe while a skill that changes something is left. When no skill
  has a positive estimate, it draws with one RNG value among the non-attacking
  skills that still change something, and among all usable skills only when
  none is left; so once its attacks are spent, 哈莫雷特 uses 龙之意志 until it
  too is at 0 PP, and then stands still (section 4). Per-Boss exceptions are
  data: 奈尼芬多 re-casts 药剂反噬 whenever the foe is not under it, through
  two `set_ai` phases with `once: false` (10.2) keyed on `foe_condition`. It
  never switches voluntarily, and a fainted active is replaced by the first
  living team member.
- **Trainer sides: the engine-simulated search planner** (`search-ai.ts`,
  `search/`; [trainer-search-ai-v58](../design/notes/trainer-search-ai-v58.md)).
  Every legal move, item and voluntary switch (after two active turns; HP
  medicine is barred after five turns of it in a row) is scored against each
  modeled player move by resolving real turns on isolated clones
  (`clone.ts`), with a short rollout and seeds derived from the live RNG state
  without drawing from it. The player is modeled only from public
  information (`observe.ts`): a neutral IV 31 / EV 85 baseline refined by
  observation, the visible HP bar, stages and announced conditions, and
  observed plus conventional moves; hidden builds, the inventory, pending
  actions and unrevealed reserves are never read. The planner solves the
  payoff matrix as a zero-sum game (`search/equilibrium.ts`) and plays the
  mixed strategy. When that strategy is impure (no action holds 95% of it
  after trimming), it draws one live RNG value to pick the action; that is
  its only live draw. With
  `allow_switch: true` (every authored trainer and facility opts in) it also
  picks faint replacements by simulation. Styles `offense`, `control` and
  `attrition` adjust the evaluation weights only; they do not alter stats or
  damage rules.

The existing default limit of 200 completed turns ends prolonged
recovery/status battles with `winner: null`, `reason: turn_cap`. The UI
identifies this as a draw and grants no victory bonus. Full PP restoration
(`amount: "all"` or omitted) fills each existing move to its finite maximum.

Space Station facilities generate six distinct ordinary Lv.100 opponents with
exactly six seeded partial-Fisher-Yates draws; the elite pool includes base-stat
totals equal to 600. Fixed teams use the separate trainer catalog. Facility
encounters forbid capture but do not add boss ability overrides, boss progress,
essences or collection unlocks. See `design/notes/station-battle-facilities-v37.md`.

## 11. Determinism

One seeded PRNG per battle (`sfc32`, `seed` in the battle options). The order of
draws is fixed by the code path above, so the same seed and actions replay the
same battle. Every random draw is a call to `rng.next()`; no `Math.random`.

**Turn preparation.** `battle.prepare(side)` decides for an automatic side when
its turn opens, so the planner can run while the player chooses, and stores the
action as the side's pending action. It runs `resolveTurn`'s own decision at the
same point of the RNG stream, so a prepared turn replays an unprepared one: same
action, draws, events, state and result. Submitting draws nothing, no decision
reads the opponent's pending action (the planner's world clears it), and
preparation runs before anything else draws in the turn, side 0 first; the
planner's one mixed-strategy draw therefore stays on the battle RNG. It declines,
leaving the decision to `resolveTurn`, outside the choose phase (automatic sides
replace at once), for side 1 before an automatic side 0, when the battle is
already decided, and for scripted decisions (a `script` AI, `choose_action`
hooks). A flee ends the battle before any decision is used: `resolveTurn` then
rewinds the RNG, which settlement copies into the save, and drops the prepared
events.

## 12. Scripted skill effects

Skill effects with no declarative op are `{ op: "script", id: "seer_eff_<n>",
params }`, where `<n>` is the original Seer effect template. Implementations
are in `core/src/scripts/`; `core/SCRIPTS.md` is the authoring guide (entry
points, condition hook points, helpers and argument encodings).

## 13. Verification

`battle/core` has no tool directory of its own. Battle checks are suites in
`tools/verification/`, each registered with a status in
`tools/verification/MANIFEST.json`. `npm run verify` runs the `gate` suites, and
`node tools/verification/run.mjs <suite>` runs any one (see `ARCHITECTURE.md`).
The suites that exercise this spec most directly:

| suite | what it checks |
|---|---|
| `boss-rules-v56.mjs` | every boss rule, phase and objective, with real-data smoke battles for every boss and variant |
| `damage-audit.ts`, `classic-damage.ts` | the damage chain, critical-hit stage clearing and shields |
| `dual-types.ts` | dual-type effectiveness and type-dependent conditions |
| `battle-v3.ts` | replacement after a faint, retreat, battle items and critical hits |
| `battle-clone-fidelity-v58.mjs` | determinism: a cloned battle resolves the same actions to the same events and state |
| `battle-ai-liveness.mjs` | AI battles over the full catalog end within the hard turn limit |
| `battle-prepare-replay.mjs` | turn preparation: game battles of each kind replay identically with and without `prepare` |
| `battle-ai-latency.mjs` | trainer search decisions stay within the p95 budget of architecture-v2 §2, in thread CPU time |

## 14. Data model additions

1. Skill `crit_rate` (numerator over 16, default 1): Seer skill text states
   rates as "x/16" directly.
2. `types.json.dual_rule` = `"seer_average"` (section 6).
3. Items used in battle carry `battle_effects` (effect ops, e.g. `heal
   {amount}`, `restore_pp {amount}`, `cure_status`) and capsules carry
   `capture_multiplier`.
4. Effect ops added by the engine: `restore_pp`, `struggle` is built in,
   `heal {amount}` (flat), `status {level}` for 衰弱, `force_switch`,
   `damage_if {when, multiplier}` (先出手/后出手 ×2, section 5).
5. Boss rule and objective additions listed in section 10: `reflect_damage`, `invulnerable_turns`,
   `clear_debuffs_each_turn`, `lives`, `no_capture`, `no_items`, `no_switch`,
   `immune_percent_damage`, `finish_with_crit`.
