# Boss AI: the 裸伤 model (2026-10-21)

Status: current. Code: `battle/ai/src/legacy-ai.ts` (`legacySmartPick`), `battle/ai/src/ai.ts` (spent `sequence`),
`battle/core/src/engine/move.ts` (`canAct`: a Boss stands still), `BOSS_STATUS_CHANCE` in `battle/core/src/constants.ts`;
rules: `battle/RULES.md` 4 step 2, 10.2 and 10.4; checks: `battle/ai/src/ai.test.mjs`, `boss-ai-isolation-v56`,
`boss-rules-v56`. It replaces the deterministic status reuse of the 2026-10-19 refinement
([boss-ai-isolation-v56](boss-ai-isolation-v56.md) keeps the oracle comparison, now allowing the status chance).

## The report

The user, 2026-10-21: the Boss AI is too rigid. 哈莫雷特 always opens with 龙之意志; the player clears it with 叶绿光束,
and it boosts again every turn until 龙之意志's PP is gone.

The cause was the policy itself. It drew no random number: a status move "not used yet, or whose effect had been undone"
(`idle-moves.ts` `effectUndone`) ranked above every attack. 哈莫雷特 is 3 speed points faster than a Lv100 丽莎布布, so
龙之意志 always landed first and was always cleared, and at every turn open it was "undone" again: ten boosts in a row, the
same in every battle and with every seed. 107 of 247 Boss members carry a self-boost and looped the same way against any
stage-clearing move. The same rule broke two documented mechanics: 提亚斯 used 精神干涉 only once (a stage drop on the foe
was never renewed), so its flee after the second use never happened, and 奈尼芬多 used 药剂反噬 (a script effect) only once.

## Evidence

**No official code.** Move choice was made by the server; the client data has no AI fields, and the client only shows the
move the server chose. Emulators guess: Reseer and NyxEver/Classic_Seer pick uniformly among moves with PP, niaogo prefers
attacks at random, Seer-golang always uses 撞击. None claims to copy the official server.

**The community model, from tests on the modern server** (medium confidence; it reaches back only to 2019):

- BWIKI 赛尔号PVE概论 (https://wiki.biligame.com/seer/赛尔号PVE概论): 「BOSS会优先使用对我方精灵裸伤更高的攻击技能，如果所有技能
  裸伤都是0，则BOSS只会使用第一个技能。」「如果BOSS选择的攻击技能裸伤大于我方精灵当前体力值，BOSS将会优先使用该技能进行攻击，
  而不会使用属性（一般属性概率为20%）。」「69（药剂反噬代码）无视该逻辑，并且在药剂反噬结束后再次打出该技能循环。」
- jiangshibiao, PVE百科全书 (2023, https://jiangshibiao.github.io/Summary-of-Game-Mechanism-in-Seer/): proposed in 2019,
  completed in 2021, 「可见多年来赛尔号一直未改裸伤判定」; and 「boss 有药剂反噬技能（代码 69）且我方未处于药剂反噬状态时，boss 会
  优先使用这一技能」.

**Period mainland guides (2010–2011)** fit "the strongest attack, sometimes a status move by chance", and fit neither a fixed
order nor status moves first:

- Chance: 7k7k 2010-06-02 (https://news.7k7k.com/content/20100602/8159.html), 盖亚: 「他强化（碰运气）」; 4399 布莱克 (by
  2011-08): 「如果它选择强化」; 4399 问答 2010-11-16 (https://wenda.4399.com/question/2/28746.html), 厄尔塞拉: 「1次叶绿光束消强化
  （他不强化可以不用）」「他要是之前强化了」, so its boost was not certain.
- Clearing in reply, never in advance: 4399 2010-06-01
  (https://news.4399.com/seer/seertuijiangonglue/sptgonglue/201006-01-69998.html): 「哈莫雷特使用龙之意志时，就用叶绿光束」.
  The 4399 图鉴 line behind the 2026-10-19 reuse rule, 「如果他马上强化，你下一次就叶绿」, says "if". No period source says a
  clear makes the Boss boost again, or describes a boost, clear, boost loop.
- 哈莫雷特's drain order follows damage: 4399 2010-06-01 (same page): 「耗完…龙爪闪空破和龙王灭碎阵，直到哈莫雷特用龙王波」;
  7k7k 2011-03-16 (https://news.7k7k.com/content/20110316/76862.html): 「20次后，哈莫雷特就会用龙王波了」「哈莫雷特没技能前会用
  很多招龙之意志」.
- Out of PP the Boss did nothing: 4399 2010-11-23 (https://news.4399.com/seer/jingyanxinde/201011-23-81330.html):
  「只到哈默不动了」; 7k7k 2010-08-05 (https://news.7k7k.com/content/20100805/12217.html), 谱尼: 「当谱尼不会动了的时候，说明PP
  耗完了」. No source mentions 挣扎 for a Boss.
- Repeated status moves made documented mechanics work: 4399 2010-06-05
  (https://news.4399.com/seer/spt/201006-05-70393.html), 提亚斯: 「只要它两次精神干涉就自动逃跑」; 4399 2010-06-01 (69998
  above), 奈尼芬多: 「换任意100J的精灵，它就会连续用药剂反噬」.

**Taomee's own code from the period, in another game** (low weight): the 摩尔勇士 battle server (github chenbk85/taomee,
`mole2/batrserv`) picks monster skills by configured random weights (`get_beast_skill`, `rand_rate`), and its Boss scripts
use percentage weights and HP conditions (2010-11). Configured random choice was the house style.

## The user's decisions (2026-10-21)

1. The 裸伤 model is the default Boss policy. A knockout comes first. While an attack can hurt the foe, one seeded draw gives a
   flat 20% (`BOSS_STATUS_CHANCE`, the same for every Boss) to a status move that still changes something, and otherwise the
   attack with the highest expected damage. No draw without a real choice. The project's two deviations stay: no status move
   that changes nothing (a boost at +6, a status on an immune foe), and no 0-damage attack while a useful move is left (the
   2026-10-19 fix). With no attack that hurts: a useful status move, else any move with PP, so PP drains toward the end state.
   `effectUndone` is deleted.
2. 奈尼芬多 re-casts 药剂反噬 whenever the foe is not under it, expressed in data.
3. A Boss with finite PP stands still at 0 PP (no 挣扎) by default; the `no_struggle` rule kind, now always true, is deleted.
4. 提亚斯 must flee after its second 精神干涉, checked in simulation.

## Implementation

```
scored := usable moves with priority and expected damage (probe x hit chance x mean hits, capped at the foe's HP)
kos    := scored with d > 0 whose fewest-hit estimate >= foe HP
if kos: return the best by priority, then expected damage, then single-hit estimate        (no draw)
attacks := scored with d > 0
useful  := scored that deal no damage and change something (idle-moves.ts changesSomething)
if no attacks: return rng.pick(useful, or scored when none is useful)
if useful: roll := rng.next(); if roll < BOSS_STATUS_CHANCE: return useful[floor(roll / BOSS_STATUS_CHANCE * |useful|)]
return the best attack by expected damage, then single-hit estimate, then equipped order
```

- The draw is inside the turn-open decision that `prepare` replays (RULES.md 11), so prepared turns stay identical.
- Struggle by a side of kind `boss` is refused in `canAct` with `cant_act`, reason `no_pp`; `unlimited_pp` Bosses never
  reach it. The `no_struggle` rule is removed from `NATIVE_BOSS_RULE_FIELDS` and from the ten encounters that carried it
  (白虎 guardians, 谱尼 seals 1–5 and 真身, 哈莫雷特, 克拉尼特 1 and 2), whose engine notes now say "stands still".
- `effectUndone` and its helpers are deleted from `idle-moves.ts`; `healAmount` in `effects.ts` lost its last outside caller
  and is no longer exported.
- A `sequence` whose listed skills are all spent falls back to the side's default policy: `random` for a wild side, the
  Boss policy for a Boss, the planner for a trainer. It used to pick at random for every side.
- 奈尼芬多 (`boss_spt_nainifenduo.json`, and slot 0 of `boss_campaign_qinglong_guardians.json` as a member phase): two
  phases with `once: false`. When the foe lacks condition `seer_eff_69`, `set_ai` to `sequence [20314]`; when it has it,
  `set_ai` to `smart`. Phase conditions gained `not` and `foe_condition` in the `boss-rules-v56` audit.
- 提亚斯 needed no data change: the status chance re-uses 精神干涉, and `flee_after_skill {count: 2}` does the rest.

## Numbers

Before is the 2026-10-19 policy; after is this one. Headless engine runs.

| Scenario | Before | After |
| --- | --- | --- |
| 哈莫雷特 vs a 丽莎布布 that clears every turn (100 seeds x 30 turns): 龙之意志 share / longest run / damage per turn | 33% / 10 / 41 | 19.7% / 5 / 54 |
| The same, openings | WWWW in 100/100 | AAAA in 43/100 |
| 丽莎布布 clearing only while a boost stands | 33% / 2 / 36 | 20.6% / 4 / 39 |
| Mean SPT Boss damage per turn, first 12 turns, 49 Bosses vs an idle dummy | 762 | 534 |
| 提亚斯 flees | never (精神干涉 used once) | in every run; mean turn 9.5, median 9, max 24 |
| 奈尼芬多 casts of 药剂反噬 | 1 | all 5 PP (for example turns 1, 5, 6, 10, 11) |

- 哈莫雷特's drain order is 龙王灭碎阵 > 龙爪闪空破 > 龙王波 > 龙之意志 in 50 of 50 runs, and it then stands still in 50 of 50.
- The isolation witnesses (`boss-ai-isolation-v56`): 哈莫雷特 uses 龙之意志 on 244 of 1200 turns over 40 seeds, longest run 5,
  11 of 40 battles open with it; 提亚斯 flees at turns 5, 9, 15, 8, 4, 4, 4, 4, 13, 5, 12, 8, 4, 3, 3, 7, 5, 17, 8, 8;
  奈尼芬多 re-casts 10 times after expiry, 14 after a switch and 40 while still in place; the status-loop sweep has 713
  status picks in 3534 open turns (20.2%), longest run 5; 厄尔塞拉 boosts on 234 of 1120 open turns (146 after a clear, 88
  while a boost stood); 蘑菇怪 re-poisons 33 times, 4 after a switch.
- Against a player who keeps clearing, the Boss now hits harder (54 against 41 per turn); against passive play it is gentler
  early, because boosts are spread out instead of front-loaded.

## Open points

- 药剂反噬 while already in place: it is a script effect, so `changesSomething` counts it as a change, and the 20% chance also
  re-casts it while it is in place (40 times in the witness), spending PP. Refining that is out of scope.
- After a faint replacement the re-cast probably comes one turn late: phases run at turn end before the replacement, and at
  turn start after actions are chosen. The voluntary-switch case is tested; the faint case is not.
- The `once: false` phases of 奈尼芬多 emit `phase_triggered` at every check. The UI skips empty message frames, so only the
  log grows.
- The spent-sequence fallback affects every `sequence` AI; in data that is `boss_rei_training5` and 奈尼芬多.
- Deferred to the next data check: 哈莫雷特's skill PP (period sources: 龙之意志 20, 龙爪闪空破 10; the catalog has 10 and 15,
  and skill PP is global), and the opening date of 龙王圣殿 (late 2010 to 2011, not 2010-05).
