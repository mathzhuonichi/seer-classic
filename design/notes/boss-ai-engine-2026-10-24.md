# Boss AI and engine follow-ups (2026-10-24)

Status: current. The Boss AI and engine open points of [handoff-2026-10-22](handoff-2026-10-22.md), after
[boss-ai-raw-damage-2026-10-21](boss-ai-raw-damage-2026-10-21.md) and [engine-fixes-2026-10-21](engine-fixes-2026-10-21.md).
Checks: `boss-ai-isolation-v56`.

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

## Open points

- **Any condition already in place.** Only 药剂反噬 counts as no change while it is in place. Some 50 other Boss status moves
  carry an `add_condition` or a script effect (圣光气 on the 谱尼 seals, 冲天霸气, 光之壁, 充电, 白雾, 海洋之心, ...); where
  that is a condition already in place, casting it again renews it, and the status chance may do so. A renewal does change the
  remaining turns or charges, so this follows the rule as written; making every renewal count as no change would be a new
  decision.
- **`random_priority` rolls on every `priority` call.** The Boss policy calls `priority` for each usable skill to rank
  knockouts, so 普兰特's knockout choice uses a separately rolled priority per skill, and each decision adds up to four draws
  before `orderActions` rolls the one that counts. Deterministic, so replays hold, but an estimate should not roll.
- **The trainer planner in a lost position.** When every action scores a certain loss, the equilibrium is uniform and the
  planner picks moves the foe is immune to (section 1, 35 of 360 turns). A tie-break by expected damage would avoid it.
