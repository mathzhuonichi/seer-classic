# Seer Classic: Battle Rules Spec

Owner: the "Battle engine" thread. Status: **v1.0**, implemented by `battle/core/` (tests: `node --test test/*.test.ts`).
Every number here is a named constant in `core/src/constants.ts`, so a rule that
turns out to be wrong is a one-line change. Confidence tags:
**[sourced]** = found in a Seer guide, **[recalled]** = from memory of the game,
**[chosen]** = our decision where the original is unknown or not worth copying.

Data shapes follow `design/foundation.md` (v0.1). Additions this spec needs are
listed in section 12 as change requests.

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

Stats come from the raising rules (`foundation.md` 6.1). The battle core
accepts either a raised monster (it then calls the same `computeStats`) or
precomputed stats (bosses with `hp_override`, tests).

```
hp    = floor((2*base + iv + floor(ev/4)) * L / 100) + L + 10
other = floor((floor((2*base + iv + floor(ev/4)) * L / 100) + 5) * nature)
```
[sourced: jiangshibiao PVE 百科 gives the L=100 form, "(2·种族值+学习力/4+个体值+偏移量)×性格修正", offset 110 for HP and 5 otherwise, IV 0–31, nature 0.9/1.0/1.1]

### 2.1 Stat stages (能力等级)

`atk, def, spa, spd, spe` range −6..+6. [recalled]

| stage | +n | −n |
|---|---|---|
| multiplier | (2+n)/2 → +1 ×1.5, +2 ×2 … +6 ×4 | 2/(2+n) → −1 ×0.667, −2 ×0.5 … −6 ×0.25 |

[sourced for positive: "(1+0.5n)"; negative mirrors it, chosen]

`acc` (命中) and `eva` (闪避) also range −6..+6. Effective accuracy stage =
user `acc` − target `eva`, clamped to ±6.

| stage | −1 | −2 | −3 | −4 | −5 | −6 |
|---|---|---|---|---|---|---|
| hit multiplier | 0.85 | 0.70 | 0.55 | 0.45 | 0.35 | 0.25 |

Positive: (3+n)/3. [sourced for negatives; positive chosen]

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

## 4. Using a move

In order:

1. **Can act?** Control statuses (麻痹, 害怕, 疲惫, 睡眠, 石化, 冰封) skip the
   move. 混乱: 80% chance the move fails, plus 5% chance to take 50 damage.
   [sourced]
2. **PP**: −1 when the move is attempted (also on a miss; not when the monster
   could not act). A skill at 0 PP cannot be chosen. If every equipped skill is
   at 0 PP the monster can still choose `struggle` (挣扎, power 50 typeless
   physical, 1/4 recoil). [chosen; the original had no reliable rule] Boss sides with
   `unlimited_pp` spend no PP; with `no_struggle` a boss at 0 PP cannot act.
3. **Accuracy**: `accuracy: null` always hits. Otherwise
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
monster can cancel the move (`on_foe_move`), evade or block it (`before_hit`).

## 5. Damage formula

```
base   = floor( (0.4*L + 2) * power * A / D / 50 ) + 2
damage = floor( base × STAB × type × rand(217..255)/255 × crit × burn × mods )
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
receive the preceding transform's result, in condition order. The AI's raw
estimate filters ordinary outgoing multipliers by their kind, condition and
level without consuming charges; it is not a complete simulation of all shields.

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

The chart itself lives in `data/types.json` (catalog thread). A draft chart
found during research is in `battle/research/type_chart_draft.json` for the
catalog thread to verify.

## 7. Statuses (异常状态)

A monster can carry several different statuses at once; re-applying one it
already has fails. Default duration 2–3 turns (rolled) unless the skill gives
`turns`. Durations count the afflicted monster's own turns: if it has not
acted yet this turn, this turn is the first one affected and the status ticks
at this turn's end; if it already acted, the first tick is next turn's end.
A status applied this turn does no damage at this turn's end. It is removed
at 0. Switching out and fainting remove all statuses. [sourced durations and
effects; switching rule recalled; counting chosen]

| id | 中文 | effect |
|---|---|---|
| `paralysis` | 麻痹 | cannot act |
| `poison` | 中毒 | lose 1/8 max HP at turn end |
| `burn` | 烧伤 | lose 1/8 max HP at turn end; attack damage ×0.5 |
| `leech` | 寄生 | lose 1/8 max HP at turn end, the opponent heals that much; 5 turns |
| `freeze` | 冻伤 | lose 1/8 max HP at turn end |
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

In order, player side first: [chosen order]
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

## 10. PvE bosses

A boss encounter (`data/bosses/*.json`, `foundation.md` section 7) builds side 1
from `team` (`hp_override`, `stat_multipliers` per member) and adds rules,
phases, objectives and AI. `validateEncounter` checks the player team first.

### 10.1 Rules

| rule | effect |
|---|---|
| `immune_status` / `immune_status_list {statuses}` | statuses fail |
| `immune_crit` | never takes a critical hit |
| `immune_ohko` | `ohko` op fails |
| `immune_stage_down` | foe cannot lower its stages |
| `immune_fixed_damage` / `immune_percent_damage` | those damage kinds do 0 |
| `damage_cap_per_hit {amount}` | each hit capped (not `true` damage) |
| `damage_only_from {types?, skills?, categories?, crit?, super_effective?, sure_hit?, kinds?}` | all other damage from the foe does 0 |
| `no_repeat_type` | an attack of the same type as the previous attack that hit it does 0 |
| `hp_floor_until {skill \| skills}` | cannot drop below 1 HP until hit by one of those skills |
| `heal_full_below {hp, times?}` | heals to full when HP drops below `hp` (up to `times`) |
| `heal_each_turn {pct_max_hp}` | turn end heal |
| `reflect_damage {pct, min_damage?}` | attacker takes pct of each hit of at least `min_damage` |
| `invulnerable_turns {turns}` | takes 0 damage for the first N turns |
| `clear_debuffs_each_turn` | removes its own negative stages at turn end |
| `strip_player_boosts_each_turn` | removes the foe's positive stages at turn end |
| `block_heal` | the player cannot heal (items, drain) |
| `unlimited_pp` / `no_struggle` | section 4 step 2 |
| `flee_after_skill {skill \| skills, count?}` | the boss leaves after using it `count` times: result `boss_fled`, no winner |
| `ohko_below_pct {pct}` / `always_crit_below_pct {pct}` | below that HP its attacks KO / always crit |
| `lives {count}` | on fainting, revive to full HP and PP `count` times (multi-life bosses) |
| `player_level_cap {level}` / `player_team_size {max}` | checked by `validateEncounter` before the battle |
| `no_capture` / `no_items` / `no_switch` | disable those actions for the player |
| `script {id, params}` | a boss rule script (`src/scripts/boss.ts`), or an alias of a native rule (`infinite_pp`, `immune_pct_damage`, `reflect_damage`) |

Boss rule scripts: `drain_each_turn`, `stages_unclearable`,
`immune_skill_list`, `foe_stage_each_turn`, `copy_foe_boosts_on_switch_in`,
`mirror_status_to_attacker`, `lifesteal`, `escalate_vs_same_foe`,
`status_on_attacker`, `random_heal`, `ignore_player_damage_reduction`,
`foe_status_each_turn`, `random_priority`, `skill_effect_override`,
`damage_cap_breaks_on_dot`, `foe_cannot_boost`.

### 10.2 Phases

`{ when, do, once }`. `when` uses the condition language of effect ops
(`self_hp_below_pct`, `turn`, `turn_ge`, `on_faint`, `lives_left`, `all`,
`any`, `not`, ...). Phases are checked after each hit and at turn end. `do` is
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
| `script {id}` | script returns true |

Lose: `turn_limit {turns}` (the player loses at the end of turn N), `script`.

**Variants** (`encounter.variants[]`, chosen by the player with `variant`):
each adds `rules` and may replace `win` / `lose`.

**Result** (`BattleResult`): `winner`, `reason` (`ko`, `flee`, `capture`,
`objective`, `lose_condition`, `turn_cap`, `boss_fled`), `success`,
`objectives`, `captured`, `turns`, and `defeated`: one entry per foe the
player knocked out, `{ foe: { species, level, boss? }, participants }`, where
participants are the player monsters (uid, else `slot<n>`) that were on the
field against it. This is the input of raising's `applyBattleRewards`.

### 10.4 AI

`sequence`, `weighted`, `random` (wild default: uniformly among usable
skills), `smart` (boss and trainer default), `script`. A forced skill from
`counter_skill` overrides all of them.

The smart profile uses pure local scoring for estimated useful damage, accuracy,
priority, recovery, statuses, relevant stat stages and known conditions. It knows
its own team; the active opponent uses a neutral IV15/zero-EV species-and-level
stat estimate, visible HP ratio/stages/statuses, announced conditions and resolved
move history. It does not read pending actions, hidden builds or reserve teams.
Unknown script effects are not executed during scoring. Scores use stable ties
and do not consume RNG or modify live battle state.

Only `smart` with explicit `allow_switch: true` considers voluntary switching
and tactical faint replacements. A voluntary switch needs two completed active
turns, a substantial matchup improvement, entry-hit survival and a chance to act
before a second lethal hit; free faint replacements pay no entry-hit cost and
bypass trapping. Existing historical encounters do not opt in. Optional styles
`offense`, `control`, and `attrition` adjust supported effect preferences; they
do not alter stats or damage rules. See `design/notes/offline-battle-ai-v36.md`.

The public opponent view records revealed moves once per decision and reuses
that immutable observation for all candidate evaluations. There is no search
tree or unbounded retry loop. The existing default limit of 200 completed turns
ends prolonged recovery/status battles with `winner: null`, `reason: turn_cap`.
The UI identifies this as a draw and grants no victory bonus. Full PP restoration
(`amount: "all"` or omitted) fills each existing move to its finite maximum.

Space Station facilities generate six distinct ordinary Lv.100 opponents with
exactly six seeded partial-Fisher-Yates draws; the elite pool includes base-stat
totals equal to 600. Fixed teams use the separate trainer catalog. Facility
encounters forbid capture but do not add boss ability overrides, boss progress,
essences or collection unlocks. See `design/notes/station-battle-facilities-v37.md`.

## 11. Determinism

One seeded PRNG per battle (`sfc32`, seed from `createBattle`). The order of
draws is fixed by the code path above, so the same seed and actions replay the
same battle. Every random draw is a call to `rng.next()`; no `Math.random`.

## 12. Scripted skill effects

Skill effects with no declarative op are `{ op: "script", id: "seer_eff_<n>",
params }`, where `<n>` is the original Seer effect template. Implementations
are in `core/src/scripts/`; `core/SCRIPTS.md` is the authoring guide (entry
points, condition hook points, helpers and argument encodings).

## 13. Verification tools (`battle/core/tools`)

| tool | what it does |
|---|---|
| `load-data.ts` | bundles `data/` into `.cache/gamedata.json` (rerun after catalog changes) |
| `smoke.ts` | uses every catalog skill for a few turns; reports crashes and warnings |
| `bosses.ts [n]` | fights every boss and variant n times with a strong team |
| `fuzz.ts [n] [seed]` | random battles with real data; checks state invariants each turn and replays each battle to check determinism |
| `sim.ts --boss <id> --seed <n>` | plays one battle and prints a readable log (`--json` for raw events) |

## 14. Change requests for the foundation data model

1. Skill `crit_stage` → `crit_rate` (numerator over 16, default 1). Seer skill
   text states rates as "x/16" directly. The engine reads `crit_rate` and
   falls back to `1 + crit_stage`.
2. `types.json.dual_rule` = `"seer_average"` (section 6).
3. Items used in battle carry `battle_effects` (effect ops, e.g. `heal
   {amount}`, `restore_pp {amount}`, `cure_status`) and capsules carry
   `capture_multiplier`.
4. Effect ops added by the engine: `restore_pp`, `struggle` is built in,
   `heal {amount}` (flat), `status {level}` for 衰弱, `force_switch`.
5. Boss rule and objective additions listed in section 10 beyond the v0.1
   vocabulary: `reflect_damage`, `invulnerable_turns`,
   `clear_debuffs_each_turn`, `lives`, `no_capture`, `no_items`, `no_switch`,
   `immune_percent_damage`, `finish_with_crit`.
