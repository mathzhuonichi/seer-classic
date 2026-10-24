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

The recorded oracle decisions (`ORACLE_POLICIES`, `ORACLE_HP_PHASE` and the others) stay fixed on purpose: they replay the
decisions recorded from d7e87e9 and must change only with a reviewed recording.

Witnesses at this point: sweep 1383 status picks in 7033 open turns (19.7%), 258 in 1217 right after one (21.2%), longest
run 4; 哈莫雷特 300 of 1492 (20.1%), 61 of 288 right after one, longest run 5, 14 of 50 battles open with 龙之意志; 厄尔塞拉
234 of 1120; 蘑菇怪 107 re-poisons, 16 after a switch. With the same eight shifts and 9000, every check passes except
`ORACLE_HP_PHASE`, the recording of seed 124.
