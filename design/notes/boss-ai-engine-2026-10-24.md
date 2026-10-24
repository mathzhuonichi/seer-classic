# Boss AI and engine follow-ups (2026-10-24)

Status: current. The Boss AI and engine open points of [handoff-2026-10-22](handoff-2026-10-22.md), after
[boss-ai-raw-damage-2026-10-21](boss-ai-raw-damage-2026-10-21.md) and [engine-fixes-2026-10-21](engine-fixes-2026-10-21.md),
and the user's 2026-10-24 rule for status moves in place (section 6). Checks: `boss-ai-isolation-v56`, `battle/ai/src/ai.test.mjs`.

## 1. boss-ai-isolation-v56 no longer depends on its seeds

The suite held the status chance to fixed seeds. A change in the random draws, such as a new draw at a turn's open or a fix
that skips a status move, moves every later draw, and several checks would then fail by chance. Rerun with every seed shifted
by 1000, 2000, ..., 8000, the old suite failed on seven of the eight sets: the trainer check five times, the oracle comparison
three times, 提亚斯 twice, the heal share and the status sweep once each. The causes and the changes:

- **The longest run of status moves** was capped at 6 over about 3500 open turns, a chance of about n x 0.2^7 = 4% to fail on
  any new set of draws (哈莫雷特: 1%). The cap is gone. Instead, among the open turns right after a status pick, the share of
  status picks must also be the status chance: independent draws keep it at 20%, while a loop like the old reuse rule (ten
  boosts in a row) makes it near 100%. This proves more than a cap: no status pick makes the next one likelier.
- **The share bounds** were fixed margins, 2.1 standard deviations for the hurt-Boss heal over 200 seeds (a 3.5% false alarm).
  `nearChance` now accepts a share within 4.5 standard deviations of the binomial (a false alarm below 1e-5 per bound) and
  asserts that the sample is large enough for that band to fit the margin the check claims (0.03 for the sweep, 0.05 for
  哈莫雷特, 0.06 for 厄尔塞拉 and the heal), so a smaller sample cannot widen it silently. The samples grew to fit: two
  battles per encounter in the sweep (7033 open turns), 50 哈莫雷特 battles counted on open turns only (1492), 1000 heal seeds.
- **蘑菇怪's re-poison after a switch** was seen 4 times over 24 battles (a 2% chance of none); 96 battles see it 16 times.
- **The oracle comparison** asked for the priorities again after the oracle had decided. 普兰特's `random_priority` rule draws
  on every `priority` call, so a second ask could answer differently and call a knockout "slower". The suite now records the
  priorities the oracle saw while deciding; both policies ask in the same order and see the same values.
- **The trainer check** ("the planner does not pick 厄尔塞拉's light attacks") passed on two lucky seeds. Its Lv80 厄尔塞拉 had
  no `hp_override`, could not last against a 20000 HP 丽莎布布, every action scored a certain loss (-1) and the planner's uniform
  mix picked a light attack on 35 of 360 turns. It now fields the member as the Boss does (3000 HP), and no light attack is
  picked on any of 24 seeds x 6 turns (0 of 360 on 60 seeds).
- 提亚斯's and 奈尼芬多's checks submitted 木之振奋 without checking its PP; on some seeds it ran out. They now fall back to the
  foe's first legal action, as the sweep did.
- The unit test of the status share in `battle/ai/src/ai.test.mjs` had the same flaw (±0.05 over 400 seeds, 2.5 standard
  deviations); 1300 seeds put it at 4.5.

The recorded oracle decisions (`ORACLE_POLICIES`, `ORACLE_HP_PHASE` and the others) stay fixed on purpose: they replay the
decisions recorded from d7e87e9 and must change only with a reviewed recording.

Witnesses at this point: sweep 1383 status picks in 7033 open turns (19.7%), 258 in 1217 right after one (21.2%), longest
run 4; 哈莫雷特 300 of 1492 (20.1%), 61 of 288 right after one, longest run 5, 14 of 50 battles open with 龙之意志; 厄尔塞拉
234 of 1120; 蘑菇怪 107 re-poisons, 16 after a switch. With the same eight shifts and 9000, every check passes except
`ORACLE_HP_PHASE`, the recording of seed 124.

## 2. 药剂反噬 is never re-cast while it is in place

**Rule** (user, 2026-10-21): a status move only when it still changes something, and 奈尼芬多 re-casts 药剂反噬 whenever the
foe is not under it.

**Before.** 药剂反噬 (skill 20314) is the script `seer_eff_69`, and `idle-moves.ts` counted every script as a change. While the
foe was under it, the second phase gave 奈尼芬多 the Boss policy, whose status chance re-cast 药剂反噬 on one turn in five, since
it was its only status move: 40 times in the isolation witness, spending its 5 PP early.

**After.** `changesSomething` treats a `seer_eff_69` op as no change while its condition (same id) is on the foe: casting it
again would only renew its turns (`attach` refreshes). So the status chance never picks it in place, and no draw is made when
nothing else is useful. With every other move at 0 PP it is still spent, as any move with PP (RULES.md 10.4). The exception is
named for this one script; the general question (any condition already in place) is an open point below.

**Checks.** `boss-ai-isolation-v56`: over 16 battles of both 奈尼芬多 encounters, 224 turns under 药剂反噬 with another move
left and no re-cast in place (the old policy fails on the first battle, turn 4); 32 re-casts on expiry and 32 after a switch,
each on the first turn it is not in place. `ai.test.mjs`: in place, a Boss with an attack and 药剂反噬 attacks without a draw.

## 3. After a faint replacement, 药剂反噬 comes on time

**Suspicion** (2026-10-21 note): phases run at turn end, before the replacement, and at turn start, after the actions are
chosen, so 奈尼芬多 would re-cast 药剂反噬 one turn late against a monster that replaced a fainted one.

**Reproduced, not a bug.** A scripted battle with a 40 HP lead: 奈尼芬多 casts 药剂反噬 on turn 1, knocks the lead out on turn
2, the player sends the second monster, and on turn 3 奈尼芬多 casts 药剂反噬 again, in both encounters and on every seed. A
fainted monster keeps no conditions (`damage.ts` `handleFaint` clears them), and the turn-end phase check (`turn.ts`
`endOfTurn`) still runs for the living Boss against it, so the `not foe_condition` phase sets the sequence before the
replacement arrives. The same holds when the lead faints at turn end, since damage over time ticks before that phase check.

**Check.** The 奈尼芬多 check of `boss-ai-isolation-v56` gained a fainting team: in all 16 battles the replacement's first turn
is 药剂反噬 (`afterFaint` 16), and the not-under assertion covers it. No engine change.

## 4. The `when.ts` turn-order fallback for AI estimates: studied, deferred

`acted_first` and `acted_last` read the move's own flag (`MoveCtx.actedFirst`, 先手权, RULES.md 3) and fall back to
`b.turnOrder[0] === self.side`, the previous turn's execution order, when none is given. Every real move passes its flag, the
journal records it and `observe.ts` probes with it. The fallback is reached only by damage estimates made without one:

- the Boss policy (`legacy-ai.ts`, `estimateDamage` at turn open);
- the trainer planner's leaf evaluation (`search/evaluate.ts`, `expectedDamage` in `race`) and rollout policy
  (`search/playout.ts`, the mean estimate and the minimum-roll probe of a sure knockout);
- verification tools that call `estimateDamage` or `probeDamage` without the flag.

Only the 102 skills whose `power_if` or `damage_if` reads the order are affected (effects 40 and 30). Three Boss encounters
carry one: 勇者之塔 57 (库博, 绝一闪, x2 when first), 58 (蝠迪, 疾风追击, x2 when first, `always_moves_first`) and 67 (鲁比克,
丘波复仇, x2 when last); among the trainers, `trainer_fusion_specialists` (风之羽翼), and the random Space Station facility,
whose members take their moves from their learnsets (468 species can learn one of the 102).

**Is it wrong?** Yes, where the last order says nothing about this one: on turn 1 (`turnOrder` is empty, so neither side
"acted first" and both count 后出手 doubling), after a switch, item or capsule (the non-move resolved first), after a faint
replacement, and after a speed or priority change. Measured on the three Bosses against six Lv100 species (speed 28 to 103),
6 seeds each, the player using ordinary moves and switching on 15% of turns: the fallback was wrong for 76 of 302 (57), 119 of
820 (58) and 46 of 156 (67) estimates of an order-reading skill, 36 of them on turn 1; ranking the Boss's move against the
player's last move (priority, then speed) was never wrong. **Would a player notice?** Rarely: the attack with the highest
estimate changed on 0, 11 and 2 of those turns (with 电光火石 mixed in: 4, 11 and 1). The typical case is 蝠迪 opening with
天翔连闪 because on turn 1 it does not count 疾风追击's doubling, although it always moves first.

**The switch** cannot be anticipated, and should not be: the Boss decides when the turn opens (`prepare`), before the player
acts, and no policy reads the player's pending action. After the player's switch, item or capsule its lone move is 先出手; the
estimate assumes a move against a move.

**Why deferred.** The fix is not contained:

- Inside `probeDamage` script hooks are off (`fire` returns nothing while probing), so a prediction evaluated in `when.ts`
  would miss `always_moves_first` (蝠迪, 奈尼芬多). It has to be computed before the probe.
- Outside the probe, `random_priority` (普兰特) draws a fresh RNG value on every `priority` call. Ranking every estimated skill
  would add draws, and change replays, in battles where no skill reads the order; it would have to be limited to skills whose
  ops read it (a scan of `when` trees).
- The planner already has its own first-mover test (`playout.ts` `actsFirst`: the move's priority above the foe's best usable
  priority, or equal and faster), a worst case for sure knockouts. A third model would sit beside it and `orderActions`;
  unifying them changes every trainer rollout, far beyond the 102 skills.
- A predictor from the foe's last move keeps every steady-state answer, but not every answer that was right: after a switch,
  the stale order is sometimes right by chance (17 of 337 库博 estimates with 电光火石 mixed in), and those replays would change.

**If it is picked up:** one ranking (forced execution, priority, speed) shared by `orderActions` and an `expectedFirst(b, self,
foe, skill)` that ranks against the foe's last move (a plain move before its first) and keeps the last order on a speed tie;
`estimateDamage` and the minimum-roll probe pass it only for order-reading skills; and `random_priority` first gets a read-only
answer for estimates (it also makes the Boss policy's knockout ranking roll a separate priority per skill, see Open points).

## 5. 虚无封印 and `ctx.sureHit`: changed by user decision (option b)

`only_sure_hit_moves_land` (虚无封印, `src/domain/challenges/campaign-rules.ts`, on 谱尼's first seal and the first life of
谱尼真身) misses every move whose skill is not 必中 by its own accuracy (`accuracy !== null`). `ctx.sureHit`, the engine's one
notion, also counts a force-hit effect on the user (`cond_sure_hit`, the Boss rule `always_hit`). The two differ exactly when
the player has such an effect, and the player can: 15 skills add `cond_sure_hit` (下n回合自身攻击技能必定命中), among them
气机锁定, 光能蓄积, 冰霜锁定, 追踪魔影 and 捆绑缠绕, learnable by 30 species. 气机锁定 is a self-targeted status move, so
虚无封印 lets it through; with `ctx.sureHit` the next attacks would land instead of missing. The same seals pair 虚无封印 with
`damage_only_from {sure_hit: true}` (`rules.ts`, also `accuracy === null`), so they would land for 0 damage while their riders
apply, unless that filter changed too; `stages_unclearable {except_sure_hit}` (`scripts/boss.ts`) is a third such test. No
period source says whether a force-hit buff got through 谱尼's 虚无; the 2010 guides speak of 必中技能 such as 龙王波. Left
unchanged, returned to the user as a decision.

**Decision and change** (user, 2026-10-24: option b): all three read `ctx.sureHit`. `isSureHit` in `engine/move.ts` stays the one
definition; `DamageInfo.sureHit` carries it into the damage of the move and of its effects (fixed, percent, OHKO, the scripted
riders), and a move's clear passes its context to `on_stage_incoming`. An attack after 气机锁定 now lands on 谱尼第一封印 and on
谱尼真身's first and fifth lives, with its damage and its damage riders, and a clear under it works on 战虎. Rules in
`battle/RULES.md` section 4 step 3 and section 10.1; checks in `boss-rules-v56` and `campaign-mechanics`; record in
[boss-clear-immunity-2026-10-24](boss-clear-immunity-2026-10-24.md) section 5.

## 6. No status move is re-cast while its effect is in place

**Rule** (user, 2026-10-24): a Boss never re-casts a status move whose effect is still in place, as 药剂反噬 already did
(section 2). By rule, not by a list: an effect that puts a condition, shield, charge or the like on its target changes nothing
while that is there, whatever its remaining turns or counts. A stage change below its cap and a heal when hurt still change
something, and a move with several effects changes something if any of them does.

**Before.** `idle-moves.ts` counted an `add_condition` as a change unless the condition was already there with `stack: "fail"`
(none of the data conditions is: all refresh), and every script as a change except 药剂反噬 in place. So 51 Boss status moves
could be re-cast in place by the status chance, renewing turns or counts: on 8.1 of 100 Boss turns against a foe that only
heals itself, 7.2 against one that attacks (numbers below).

**After.**

- `add_condition`: no change while a condition of that id is on its target.
- A script answers for itself through a new read-only member of its entry, `changes(c, p)` (`types.ts`, SCRIPTS.md), which
  `idle-moves.ts` calls; a script without it still counts as a change. Every timed template gets it from `timedScripts`: its
  condition (the script id, plus `key`) on its holder, the user or with `foe` the foe, means no change. Other entries that put
  a condition on their user declare `placesCondition(id)` (`util.ts`): 55 属性反转, 56 属性复制, 90, 127, 142 and 183. Scripted
  heals declare when they heal something: 201 (光合作用) and the 1/{1} heal chance (438 六道轮回, 410) when the target is
  hurt. 63 (镜影术) changes something when its user has a stage drop to pass on. 28 (海洋之心, a quarter of the foe's max HP)
  and 59 (眼球的掌控 and 能量灌注: the user faints and boosts the next member) declare nothing: they always change something.
- `BACKFIRE_SCRIPT`, the one-script exception of section 2, is gone: 药剂反噬 (timed, `foe`) follows the rule.
- **属性复制 after the foe switches** (user decision 2026-10-24: left as it is). The copied types stay on the Boss while its
  condition is in place, so it does not cast 属性复制 again to copy a new foe's types, although that would change them; it may
  copy again once the condition has ended.
- **先手无效 (seer_eff_52, 融入黑暗 and 暗影跳跃 among the Bosses):** its condition outlived its window by one turn (from the
  turn it was used to `p[0] - 1` turns later), so it would have counted as in place on a turn in which it negated nothing. It now
  counts the turn it is used as its first (`cover`) and ends with its window; the window data is gone. The effect is unchanged:
  used first, it negates the foe's move that turn (`scripts.test.mjs`).
- Kept: with no attack that hurts and nothing that changes something, any move with PP is spent, an effect in place included
  (so with every other move at 0 PP a move with PP is still used); 奈尼芬多's `set_ai` phases; the knockout and highest-damage
  rules. This is the Boss policy only: the trainer planner does not read `idle-moves.ts` and is unchanged.

**Every Boss status move affected**, with how each effect is read (status moves that only raise or lower stages, heal or inflict
a status are unchanged and not listed):

| Move (id) | Bosses (`boss_` left out) | Effects: when each changes something |
| --- | --- | --- |
| 魔化羽翼 (21682) | ailike | spe+2: below the cap; `cond_force_crit` 1t on self: none while in place |
| 冲天霸气 (20854) | campaign_baihu_avatars, campaign_baihu_body | `cond_force_crit` 2t on self: none while in place |
| 雷光铠甲 (20475) | campaign_baihu_avatars | script 84, a condition on self: none while in place |
| 火龙的咆哮 (20457) | campaign_baihu_guardians, dark_door7_sanuolasi, spt_kelanite1 | `cond_force_crit` 2t on self: none while in place |
| 六道轮回 (21895) | campaign_qilin_body, campaign_qilin_wheel1-6 | atk, def, spa, spd, spe +1: below the cap; script 438, a 30% heal of 1/3: when hurt |
| 森罗万象 (21896) | campaign_qilin_body, campaign_qilin_wheel1-6 | script 439, a condition on self: none while in place |
| 药剂反噬 (20314) | campaign_qinglong_guardians, spt_nainifenduo | script 69, a condition on the foe: none while in place |
| 属性反转 (20113) | campaign_xuanwu_guardians, spt_naduolei | script 55, a condition on self: none while in place |
| 属性复制 (20145) | campaign_xuanwu_guardians, rei_training3, spt_leinaduo | script 56, a condition on self: none while in place |
| 浩劫之力 (20879) | campaign_zhuque_guardians, spt_delasa | script 104, a condition on self: none while in place |
| 融入黑暗 (20639) | campaign_zhuque_guardians, kaxiusi | script 52, a condition on self: none while in place |
| 镇魂歌 (20215) | dark_door3_bafuluo | script 62, a condition on self: none while in place |
| 海洋之心 (20143) | dark_door6_bulinkeke, tower_brave_f046, tower_brave_f059 | script 28, 1/4 of the foe's max HP: always (no `changes`) |
| 要害瞄准 (20461) | dark_door7_moerjiasi | `cond_crit_up_1` 5t on self: none while in place |
| 寒冷叠加 (20964) | dark_door9_akenuoya | script 109, a condition on self: none while in place |
| 圣光气 (20500) | puni_seal1-7, puni_zhenshen, tower_brave_mystery | `cond_force_crit` 2t on self: none while in place |
| 光之兵刃 (21538) | spt_basuoer | atk+2: below the cap; `cond_crit_up_1` 2t on self: none while in place |
| 火力锁定 (21479) | spt_bokate | `cond_force_crit` 2t on self: none while in place |
| 自我暗示 (20666) | spt_kelanite2 | script 91, a condition on the foe: none while in place |
| 镜影术 (20232) | spt_moshidilu | script 63, passes its stage drops to the foe: with a drop |
| 暗流涌动 (21591) | spt_palisi | `cond_force_crit` 2t on self: none while in place; script 169, a condition on self: none while in place |
| 不灭意志 (20554) | spt_saiweier | `cond_force_crit` 2t on self: none while in place |
| 冰之领悟 (21653) | spt_sikelu | def+2: below the cap; script 92, a condition on self: none while in place |
| 虚空之身 (20934) | spt_sipulinte | script 78, a condition on self: none while in place |
| 黑暗遮蔽 (20933) | spt_sipulinte | script 106, a condition on self: none while in place |
| 金刚罩 (21707) | spt_situerte | def, spd +1: below the cap; script 406, a condition on self: none while in place |
| 保护 (20036) | tower_brave_f004 | `cond_block_attacks` 1 charge on self: none while in place |
| 模仿术 (20029) | tower_brave_f005, tower_brave_f021, tower_brave_f043, tower_brave_f055 | script 45, a condition on self: none while in place |
| 光之壁 (20024) | tower_brave_f009, tower_brave_f025, tower_brave_f054 | `cond_halve_special` 5t on self: none while in place |
| 反击风暴 (20070) | tower_brave_f017, tower_brave_f030 | `cond_counter_1_4` 4-5t on self: none while in place |
| 充电 (20006) | tower_brave_f022, tower_brave_f033, tower_brave_f054 | `cond_electric_power_x2` 1t on self: none while in place |
| 光合作用 (20009) | tower_brave_f027, tower_brave_f038, tower_brave_f051 | heal: when hurt; script 201, a heal of 1/3: when hurt |
| 白雾 (20012) | tower_brave_f028 | `cond_immune_stage_down` 5t on self: none while in place |
| 水神护体 (20095) | tower_brave_f050, tower_brave_f052 | script 49, a condition on self: none while in place |
| 寒冰碎裂 (20151) | tower_brave_f056 | `cond_force_crit` 2t on self: none while in place |
| 电能聚合 (20122) | tower_brave_f058 | `cond_electric_power_x2` 2t on self: none while in place |
| 超能力 (20187) | tower_brave_f060 | `cond_dmg_dealt_x2` 2t on self: none while in place |
| 眼球的掌控 (20330) | tower_brave_f061 | script 59, faints and boosts the next member: always (no `changes`) |
| 地泉喷涌 (20333) | tower_brave_f061 | `cond_halve_special` 3t on self: none while in place |
| 真实残影 (20336) | tower_brave_f061 | script 45, a condition on self: none while in place |
| 狙击战术 (20355) | tower_brave_f063 | `cond_force_crit` 2t on self: none while in place |
| 心灵共鸣 (20295) | tower_brave_f063 | `cond_counter_1_3` 4-5t on self: none while in place |
| 固若金汤 (20279) | tower_brave_f064, tower_brave_f067 | script 49, a condition on self: none while in place |
| 无限再生 (20291) | tower_brave_f065 | heal: when hurt; `cond_regen_1_10` 5t on self: none while in place |
| 自然的掩护 (20359) | tower_brave_f065 | `cond_regen_1_5` 5t on self: none while in place |
| 能量灌注 (20264) | tower_brave_f067 | script 59, faints and boosts the next member: always (no `changes`) |
| 百变随心 (20304) | tower_brave_f068 | `cond_immune_stage_down` 5t on self: none while in place |
| 平行位面 (20341) | tower_brave_f069 | `cond_halve_physical` 5t on self: none while in place |
| 暗影跳跃 (20344) | tower_brave_f069 | script 52, a condition on self: none while in place |
| 蜃楼 (20412) | tower_brave_f070 | script 49, a condition on self: none while in place |
| 冰霜锁定 (20662) | trial_brave_qigesa | `cond_sure_hit` 3t on self: none while in place |

**Numbers.** Each Boss member carrying one of these moves, in all its variants, 40 battles of 30 turns, as the lead, against a
Lv100 巴鲁斯 of 20000 HP that only uses 木之振奋 (passive) or 撞击 (attacking): Boss status picks per 100 Boss turns, the same
per 100 open turns (an attack of the Boss can still hurt the foe, so the status chance decides), and re-casts in place per 100
Boss turns while another move would hurt or change something. Before is a48f2d8, after this change; a cell with one number is
unchanged. Where all PP is spent within the 30 turns (two attacks of 5 PP, as 德拉萨 or 麒麟's wheels), the share over all turns
cannot change: an in-place move skipped while attacks are left is spent at the end, when nothing else is.

| Moves | Bosses (`/n`: the team slot) | passive: status / 100 turns | / 100 open turns | in place | attacking: status / 100 turns | / 100 open turns | in place |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 魔化羽翼 | ailike | 40 | 19 → 16 | 3 → 0 | 40 | 20 → 18 | 1 → 0 |
| 冲天霸气 | campaign_baihu_avatars, campaign_baihu_body | 39 | 21 | 6 → 0 | 39 | 22 | 6 → 0 |
| 雷光铠甲 | campaign_baihu_avatars/1 | 40 | 22 → 21 | 8 → 0 | 40 | 20 | 9 → 0 |
| 火龙的咆哮 | campaign_baihu_guardians/1, dark_door7_sanuolasi, spt_kelanite1 | 29 → 28 | 20 → 17 | 4 → 0 | 27 → 25 | 20 → 17 | 4 → 0 |
| 六道轮回, 森罗万象 | campaign_qilin_body/0-5, campaign_qilin_wheel1-6 | 38 | 20 → 19 | 7 → 0 | 39 | 21 | 8 → 0 |
| 药剂反噬 | campaign_qinglong_guardians, spt_nainifenduo | 17 | 17 | 0 | 17 | 17 | 0 |
| 属性反转 | campaign_xuanwu_guardians/4, spt_naduolei | 19 → 11 | 19 → 11 | 11 → 0 | 19 → 10 | 19 → 10 | 12 → 0 |
| 属性复制 | campaign_xuanwu_guardians/5, rei_training3, spt_leinaduo | 19 → 10 | 19 → 10 | 12 → 0 | 20 → 10 | 20 → 10 | 12 → 0 |
| 浩劫之力 | campaign_zhuque_guardians, spt_delasa | 67 | 22 → 19 | 5 → 0 | 66 | 20 → 18 | 4 → 0 |
| 融入黑暗 | campaign_zhuque_guardians/1, kaxiusi | 43 | 20 | 3 → 0 | 43 | 20 | 3 → 0 |
| 镇魂歌 | dark_door3_bafuluo | 20 → 14 | 20 → 14 | 8 → 0 | 19 → 13 | 19 → 13 | 7 → 0 |
| 要害瞄准 | dark_door7_moerjiasi | 19 → 17 | 17 → 10 | 9 → 0 | 21 → 17 | 20 → 10 | 12 → 0 |
| 寒冷叠加 | dark_door9_akenuoya | 25 | 18 → 11 | 9 → 0 | 24 → 22 | 19 → 11 | 11 → 0 |
| 圣光气 | puni_seal1-7, puni_zhenshen/0-5, tower_brave_mystery | 21 → 17 | 20 → 14 | 7 → 0 | 19 → 14 | 19 → 14 | 6 → 0 |
| 光之兵刃 | spt_basuoer | 40 | 19 → 15 | 4 → 0 | 40 | 19 → 16 | 4 → 0 |
| 火力锁定 | spt_bokate | 40 | 18 → 13 | 5 → 0 | 40 | 21 → 13 | 6 → 0 |
| 自我暗示 | spt_kelanite2 | 67 | 21 → 20 | 4 → 0 | 67 | 21 | 6 → 0 |
| 镜影术 | spt_moshidilu | 20 → 14 | 20 → 14 | 11 → 0 | 20 → 16 | 20 → 16 | 11 → 0 |
| 暗流涌动 | spt_palisi | 40 | 20 → 15 | 5 → 0 | 22 → 15 | 22 → 15 | 8 → 0 |
| 不灭意志 | spt_saiweier | 16 → 13 | 16 → 13 | 4 → 0 | 20 → 14 | 20 → 14 | 6 → 0 |
| 冰之领悟 | spt_sikelu | 20 → 15 | 20 → 15 | 7 → 0 | 19 → 17 | 19 → 17 | 2 → 0 |
| 虚空之身, 黑暗遮蔽 | spt_sipulinte | 50 | 21 → 19 | 9 → 0 | 50 | 22 → 20 | 10 → 0 |
| 金刚罩 | spt_situerte | 20 | 20 | 0 | 20 | 20 | 0 |
| 保护 | tower_brave_f004 | 19 → 3 | 19 → 3 | 16 → 0 | 22 → 19 | 22 → 19 | 4 → 0 |
| 模仿术 | tower_brave_f005, f021, f043, f055/1 | 20 → 10 | 20 → 10 | 13 → 0 | 21 → 11 | 21 → 11 | 13 → 0 |
| 光之壁 | tower_brave_f009, tower_brave_f025, tower_brave_f054/1 | 18 → 10 | 18 → 10 | 10 → 0 | 21 → 11 | 21 → 11 | 12 → 0 |
| 反击风暴 | tower_brave_f017, tower_brave_f030 | 20 → 12 | 20 → 12 | 11 → 0 | 20 → 11 | 20 → 11 | 10 → 0 |
| 充电 | tower_brave_f022, tower_brave_f033, tower_brave_f054 | 20 → 16 | 20 → 16 | 4 → 0 | 20 → 18 | 20 → 18 | 4 → 0 |
| 光合作用 | tower_brave_f027, tower_brave_f038, tower_brave_f051/1 | 15 → 0 | 15 → 0 | 15 → 0 | 15 → 14 | 15 → 14 | 1 → 0 |
| 白雾 | tower_brave_f028 | 20 → 11 | 20 → 11 | 13 → 0 | 18 → 10 | 18 → 10 | 9 → 0 |
| 水神护体 | tower_brave_f050, tower_brave_f052/1 | 20 → 3 | 20 → 3 | 17 → 0 | 20 → 14 | 20 → 14 | 7 → 0 |
| 寒冰碎裂 | tower_brave_f056 | 21 → 15 | 21 → 15 | 7 → 0 | 20 → 14 | 20 → 14 | 7 → 0 |
| 电能聚合 | tower_brave_f058 | 20 → 14 | 20 → 14 | 8 → 0 | 22 → 15 | 22 → 15 | 9 → 0 |
| 超能力 | tower_brave_f060/1 | 20 → 15 | 20 → 15 | 7 → 0 | 20 → 15 | 20 → 15 | 6 → 0 |
| 地泉喷涌 | tower_brave_f061/1 | 20 | 18 → 13 | 8 → 0 | 20 | 16 → 14 | 7 → 0 |
| 真实残影 | tower_brave_f061/2 | 20 | 18 → 13 | 8 → 0 | 20 | 17 → 14 | 7 → 0 |
| 狙击战术 | tower_brave_f063 | 22 → 18 | 20 → 15 | 7 → 0 | 21 → 13 | 21 → 13 | 8 → 0 |
| 心灵共鸣 | tower_brave_f063/2 | 50 | 21 → 12 | 8 → 0 | 42 → 39 | 21 → 11 | 9 → 0 |
| 固若金汤 | tower_brave_f064/1, tower_brave_f067/2 | 19 → 8 | 19 → 8 | 11 → 0 | 20 → 10 | 20 → 10 | 11 → 0 |
| 无限再生 | tower_brave_f065 | 20 | 17 → 10 | 9 → 0 | 15 → 9 | 15 → 9 | 7 → 0 |
| 自然的掩护 | tower_brave_f065/1 | 21 → 11 | 21 → 11 | 13 → 0 | 14 → 9 | 14 → 9 | 6 → 0 |
| 百变随心 | tower_brave_f068/1 | 33 | 21 → 11 | 11 → 0 | 19 → 11 | 19 → 11 | 12 → 0 |
| 平行位面 | tower_brave_f069/1 | 33 | 20 → 11 | 10 → 0 | 20 → 11 | 20 → 11 | 13 → 0 |
| 暗影跳跃 | tower_brave_f069/3 | 33 | 21 | 3 → 0 | 19 | 19 | 4 → 0 |
| 蜃楼 | tower_brave_f070/1 | 22 → 17 | 21 → 4 | 17 → 0 | 20 → 7 | 20 → 7 | 16 → 0 |
| 冰霜锁定 | trial_brave_qigesa | 21 → 17 | 19 → 12 | 10 → 0 | 20 → 12 | 20 → 12 | 10 → 0 |

Over all 91 members: status picks per 100 open turns 19.4 → 13.4 (passive) and 19.5 → 15.2 (attacking); in-place re-casts
8.1 → 0 and 7.2 → 0 per 100 Boss turns. The largest drops are the long conditions and the shields and charges that only an attack
uses up: 保护, 水神护体, 固若金汤 and 蜃楼 are cast once per battle against the passive foe (3 per 100 turns), 14-19 per 100
against the attacking one. **No Boss now never uses a status move in a real fight.** Against the passive foe, the three 光合作用
floors of 勇者之塔 (f027, f038, f051's second member) never do: they are never hurt, and 光合作用 at full HP changed nothing
before either (it was picked on 15 of 100 turns only because its script counted as a change). Against the attacking foe they heal
on 14 of 100 turns, as before.

**Checks.** `boss-ai-isolation-v56` gained "No Boss re-casts a status move whose effect is still in place": 96 Boss members
carrying a status move with a condition or script, 8 battles each against the passive foe, reading "in place" independently of
`idle-moves.ts` (each effect a condition on its target, or a script's condition, named after it, on the Boss or its foe, or a stage
at its cap). On every turn on which the Boss policy decides and an attack can hurt, no move in place is used: 6058 such turns,
every move of the decision among them (圣光气 845, 光之壁 347, 水神护体 412, 冲天霸气 41, 充电 117, 白雾 103), and 2404
re-casts once the effect had ended. The assertion has no tolerance, so new random draws cannot break it; the old policy fails it on
the first Boss (魔神艾里克's 魔化羽翼, seed 3, turn 14). With fewer status picks in a row, the status-loop sweep runs three battles per
encounter (9106 open turns, 1810 status picks, 204 of 1178 right after one, longest run 5), so that the "right after" sample
still fits its 0.06 band. With the seeds of the sweep and of this check shifted by 10000, 20000, 30000 and 40000, all 23 checks pass.
`ai.test.mjs`: a condition (two turns), a charge and a shield, each about to run out, change nothing; a move with a boost and a
condition changes something while the stage can rise; a scripted heal only when hurt; 镜影术 only with a drop; with every other
move at 0 PP a move in place is still used.

## Open points

- **Any condition already in place.** Decided on 2026-10-24 and done in section 6.
- **属性复制 after the foe switches.** Decided on 2026-10-24: left as it is (section 6).
- **`random_priority` rolls on every `priority` call.** The Boss policy calls `priority` for each usable skill to rank
  knockouts, so 普兰特's knockout choice uses a separately rolled priority per skill, and each decision adds up to four draws
  before `orderActions` rolls the one that counts. Deterministic, so replays hold, but an estimate should not roll.
- **The trainer planner in a lost position.** When every action scores a certain loss, the equilibrium is uniform and the
  planner picks moves the foe is immune to (section 1, 35 of 360 turns). A tie-break by expected damage would avoid it.
