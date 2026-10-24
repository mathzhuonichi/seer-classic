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
named for this one script; the general question (any condition already in place) is open, see "Open decisions".

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
