# Boss boosts that cannot be cleared (2026-10-24)

Status: current. Follows the user decision of 2026-10-24 in [handoff-2026-10-22](handoff-2026-10-22.md): 「哪有boss无法消强，我认为是你的错误」.
The five `stages_unclearable` rules were recorded in `data/boss-evidence-v56.json` as inferred and unverified, with no source.
Rule: remove each unless a 2009-2013 mainland source says outright that the player could not clear that Boss's boosts; model a
narrower statement exactly. Section 5 records the 必中 change of the same day, section 6 counts the Boss rules still recorded with no
source. Checks: `boss-rules-v56`, `campaign-mechanics`.

## 1. Where the five rules came from

| Boss | Added | From |
|---|---|---|
| 纳特 (`boss_spt_nate`) | 21a1567 (revision-30 import, 2026-10-14) | its `source_note`: 4399 2012-10-12, 「天生攻击+2无法消强化」 |
| 伊索里 (`boss_spt_yisuoli`), def/spd | 21a1567 | its `source_note` (聚侠 2012-12-07) and the 2026-10-19 SPT pass |
| 暗夜冰狐 (`boss_spt_anyebinghu`) | 21a1567 | its engine note 「天生强化双防并且不可消去」 (4399 2011-12-05) |
| 白虎·战虎 (`boss_campaign_baihu_avatars`) | 3ab8c88 (2026-10-19) | boss-fidelity pass, `../analysis/boss-rules-catalogue-2026-10-19.json` row #48 |
| 迪普利德 (`boss_dark_door9_dipulide`), atk | de815b8 (2026-10-19) | the same pass, row #66: 百科 「自动提升攻击等级+6，无法消除」 |

Four of the five had a period source in the Boss data all along. The evidence ledger said "no source" because its builder
(`tools/audit/build_boss_evidence_v56.py`) gives every rule the default "inferred, unverified" unless a claim is curated for it,
and none was. The support ledger listed three of the notes as approximations only because its pattern matched "unclear" inside
`stages_unclearable`.

## 2. Period evidence

Pages re-read on 2026-10-24 (current pages and, for 4399 98372, the Wayback copies).

- **纳特.** 4399 西野, 2012-10-12, [赛尔号纳特怎么打](https://news.4399.com/seer/jingyanxinde/201210-12-203269.html):
  「1、体力8000，天生攻击等级+2，无法消强化。」「这只火系精灵纳特拥有着之前很少有的新特性，不能被消强化，不能弱化」「既然无法消强，又无法弱化」;
  page 2: 「因为不能消强化，纳特大招的伤害还是很恐怖的」. **Kept** (all stats).
- **白虎·战虎.** 4399, 2011-03-11, [白虎泰格尔击败全程攻略](https://news.4399.com/seer/saiergonglue/201103-11-88984.html):
  「第二只白虎是战斗系的，血量3000……无法消强化，消强化技能MISS！」. 7k7k, 2011-03-28,
  [白虎那些事](https://news.7k7k.com/content/20110328/82522.html): 「战斗虎速度先制加1，先天强化无法消除（有人说盖亚的日月有一定的命中几率，可以消除它的强化。）」;
  of 电虎 only 「先天强化，消除很难」. 7k7k, 2011-04-26, [白虎和白虎守护兽怎么打](https://news.7k7k.com/content/20110426/84954.html):
  「战虎:先用盖亚日月皆伤消强化」. The undated [百科 泰格尔](https://wapbaike.baidu.com/item/%E6%B3%B0%E6%A0%BC%E5%B0%94) rewords the
  4399 line as 「消强化技能（除必中外）会MISS」, the only source of the sure-hit exception. **Kept**, with both exceptions; 电虎
  keeps no rule.
- **伊索里.** 4399, 2012-12-10, [BOSS伊索里介绍及攻略](https://news.4399.com/seer/spt/201212-10-220873.html), and 聚侠, 2012-12-07,
  [伊索里在哪怎么打](https://m.juxia.com/news/2012-12-7/70413.html), same text: 「天生强化攻击、防御和特防等级+2，并且正常消强化技能不可消除双防强化」.
  Both then use 帕罗狄亚's 禁制领域: 「可以有效的消除伊索亚的强化，并且在5回合，伊索亚不管怎么用强化技能，也只有当回合有效」. **Kept** for
  def/spd. 禁制领域 is `seer_eff_156`, which disables boosts for 5 turns through `modify_stat` and clears nothing, so the rule
  does not stop it, as the guides describe.
- **暗夜冰狐.** 4399, 2011-12-05, [BOSS暗夜冰狐介绍及攻略](https://news.4399.com/seer/spt/201112-05-130110.html):
  「2、双防非常高，天生强化双防并且不可消去。」 The same page has it boost its speed with 无极之冰 and says nothing of clearing that.
  **Kept, narrowed** to def/spd: before, the rule protected every boost, 无极之冰's included.
- **迪普利德.** Only [百科 暗黑武斗场](https://wapbaike.baidu.com/item/%E6%9A%97%E9%BB%91%E6%AD%A6%E6%96%97%E5%9C%BA/9200029):
  「特性：自动提升攻击等级+6，无法消除」, with its door-9 section cited to 「暗黑9门攻略·4399赛尔号·2013-08-19」. The 4399 door-9 guide
  ([98372](https://news.4399.com/seer/ahwdc/201105-30-98372.html), byline 2011-05-30; Wayback copies of 2011-05-31 and 2013-03-28,
  the same text) names its HP, speed and moves and says 「迪普利德大招伤害值很高，基本秒杀我方精灵」, but nothing of a boost or of clearing.
  No other 4399 暗黑武斗场 page names it; search engines served captchas or unrelated results. **Removed.** Its atk +6 stays (the
  same 百科 line is its only source) and can now be cleared.

Clear immunity was a period trait, not a remake invention: besides these, 4399 2011-08-18
([四大神兽详解](https://news.4399.com/seer/jingyanxinde/201108-18-110516.html)) says of 青龙 「血量低于特定值会自动提速，无法消除」 and of
玄武 「血量低于一定数值时会提升自己速度(你消除了还是会提升)」. Neither speed boost is modelled (catalogue rows #45, #46: no threshold).

## 3. Changes

- `boss_dark_door9_dipulide`: the rule is gone; its note says why.
- `boss_spt_anyebinghu`: `stages_unclearable {stats: [def, spd]}`.
- The notes of 纳特, 伊索里, 暗夜冰狐 and 战虎 quote their sources; 伊索里 and 战虎 list the pages they cite.
- Evidence ledger: `STATED_RULES` in the builder records 纳特, 伊索里 and 暗夜冰狐 as observed in a period report, and 战虎 as an
  observed mechanic with inferred parameters (the exceptions rest on hearsay, advice and an undated wiki). A claim that no longer
  matches its Boss's configuration stops the build.
- Support ledger: `stages_unclearable` no longer counts as an approximation (`unclear(?!able)`).
- `boss-rules-v56`: a clear by 时空感应 leaves 纳特's atk +2, 暗夜冰狐's and 伊索里's double defence, and nothing of 迪普利德's atk +6;
  暗夜冰狐's speed boost and 伊索里's atk +2 are cleared.

## 4. Not changed

- **战虎's MISS.** The 2011 report says 「消强化技能MISS」 and 百科 「（除必中外）会MISS」; 7k7k gives 日月皆伤 「一定的命中几率」. Read
  literally, a clearing move misses 战虎 entirely, damage included, unless it is 必中. The remake refuses only the clear and keeps the
  damage (a status clear is the same either way). **User decision 2026-10-24: keep it so.** A clearing move is refused only its
  clear and still deals its damage; there is no whole-move MISS (`battle/RULES.md` section 10.1, `stages_unclearable`).
- **伊索里's drops.** Both guides say 「伊索亚不吃属性弱化技能」 (status moves' drops fail), while the Boss has the full
  `immune_stage_down`. **User decision 2026-10-24: 伊索里 keeps the full `immune_stage_down`.**
- **Effect 85 steals** still bypass `on_stage_incoming` (user 2026-10-24: leave the bypass).

## 5. 必中 in the Boss rules

User decision of 2026-10-24 (option b of [boss-ai-engine-2026-10-24](boss-ai-engine-2026-10-24.md) section 5): 虚无封印
(`only_sure_hit_moves_land`), `damage_only_from {sure_hit}` and `stages_unclearable {except_sure_hit}` read the engine's one 必中,
`ctx.sureHit` (`isSureHit` in `engine/move.ts`: accuracy null, or a force-hit effect such as `cond_sure_hit` or the rule
`always_hit`). Before, each tested the skill's own `accuracy === null`.

- `DamageInfo.sureHit` carries it from the move into its damage: the attack hit, the effect ops `fixed_damage`, `pct_damage` and
  `ohko`, the scripted riders (`hitFoe`, effect 34) and the AI's damage probe. Damage outside a move (statuses, reflection, hooks)
  carries none, as before.
- A move's clear, the critical-hit defence clear included, passes its move context to `on_stage_incoming`.
- Effect: an attack after 气机锁定, 光能蓄积, 冰霜锁定 or another of the 15 `cond_sure_hit` skills lands on 谱尼第一封印 and on
  谱尼真身's first and fifth lives, and deals its damage and its fixed or percent riders; without the boost it still misses. Under
  the boost, a clear such as 金光闪烁 (accuracy 100) works on 战虎.
- Checks: `boss-rules-v56` ("After 气机锁定 a move is 必中 ...", on the real Bosses and skills) and `campaign-mechanics` (the rule
  pair on a fixture). Rules: `battle/RULES.md` section 4 step 3 and section 10.1.

## 6. Boss rules still recorded with no source

Of the evidence ledger's 440 rule nodes (rules, member rules, variant rules and phase ops of the 180 encounters), 422 on 110
encounters are still `inferred`, `unverified`, with no source (2026-10-24, read-only count). The other 18: 7 observed in a period
report (纳特, 伊索里, 暗夜冰狐, 劳克蒙德's three fields, 魔狮迪露's type chart), 2 user policies, and 9 inferred with a source attached
(战虎's clear immunity among them). As with the five clear immunities, "no source" is the builder's default for a rule nobody curated:
every one of the 422 is on an encounter whose data lists period source URLs, so how many rest on no evidence at all is open until
each is read against them.

| Rule id | Nodes | Encounters | Examples |
|---|---|---|---|
| `stat_stage` (phase op: innate and triggered boosts) | 75 | 67 | 布莱克, 白虎·战虎与电虎, 麒麟·阿瑞斯真身 |
| `immune_stage_down` | 42 | 41 | 白虎·五大守护兽, 麒麟·日月之轮, 麒麟·天地之轮 |
| `immune_skill_list` | 29 | 29 | 白虎·战虎与电虎, 白虎·泰格尔, 白虎·五大守护兽 |
| `immune_status_list` | 24 | 23 | 白虎·泰格尔, 白虎·五大守护兽, 青龙·朵拉格 |
| `unlimited_pp` | 19 | 13 | 白虎·五大守护兽, 麒麟·阿瑞斯真身, 卡修斯 |
| `immune_status` | 18 | 18 | 白虎·战虎与电虎, 白虎·五大守护兽, 麒麟·炽天之轮 |
| `player_team_size` | 17 | 17 | 布莱克, 盖亚, 谱尼·第一封印 |
| `always_moves_first` | 13 | 13 | 布莱克, 白虎·战虎与电虎, 白虎·泰格尔 |
| `immune_pct_damage` / `immune_percent_damage` | 10 / 8 | 10 / 8 | 巴索尔, 凯洛亚, 卡伦尼 / 白虎·战虎与电虎, 麒麟·炽天之轮 |
| `heal_full_below` | 9 | 9 | 布林克克, 谱尼真身, 阿克希亚 |
| `immune_ohko` | 9 | 9 | 白虎·五大守护兽, 厄尔塞拉, 哈莫雷特 |
| `status_on_attacker` | 9 | 7 | 白虎·战虎与电虎, 白虎·泰格尔, 青龙·四大守护兽 |
| `always_hit` | 8 | 7 | 白虎·五大守护兽, 厄尔塞拉, 克拉尼特 |
| `always_crit_below_pct` | 7 | 2 | 青龙·四大守护兽, 玄武·六大守护兽 |
| `reflect_damage` | 7 | 7 | 白虎·五大守护兽, 朱雀·三重影, 帕多尼 |
| `campaign_qilin_damage_filter`, `crit_rate_up`, `damage_only_from`, `foe_accuracy_penalty` | 6 each | 4, 6, 4, 6 | 麒麟 wheels; 米诺斯; 谱尼 seals; 塔西亚 |
| `always_crit`, `lives`, `require_player_species`, `set_ai` | 5 each | 5, 3, 5, 3 | 雷纳多; 朱雀·三重影; 雷伊特训; 奈尼芬多 |
| `heal_flat_each_turn`, `status_moves_always_miss` | 4 each | 4, 2 | 青龙·朵拉格; 谱尼真身 |
| 7 ids with 3 nodes, 8 with 2 | 37 | | `drain_each_turn`, `only_sure_hit_moves_land`, `ko_attacker_on_big_hit`, `revive`, `level_drops_per_attempt`, ... |
| 29 ids with 1 node | 29 | | 哈莫雷特's `no_repeat_type` and `type_rotation`, 尤纳斯's barrier, 普兰特's `random_priority`, ... |
