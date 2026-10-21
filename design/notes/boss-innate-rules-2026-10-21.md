# Boss innate rules: stat-drop immunity and innate boosts (2026-10-21)

Status: current. Data: `data/bosses/*.json` (`{"rule": "immune_stage_down"}` and the opening `first_turn` `stat_stage`
phase, each with an engine note naming its basis); rules: `battle/RULES.md` 10.1 and 10.2; check: `boss-rules-v56`
("Hamorait stands at attack +2 before the first command …").

## Why

The user, 2026-10-21: 「哈莫雷特及以后多数boss我记得都免疫弱化和自带攻击+2，我认为你现在没有实装，实测它可以被减命中。」
哈莫雷特 had neither trait, and its accuracy could be lowered.

## Decision rule

- 哈莫雷特: the user's own testimony decides it: immune to stat drops, innate atk+2.
- Every SPT Boss from 2010-05 on: immune to stat drops and innate atk+2 by default ("default per user 2026-10-21"), unless a
  period mainland source contradicts it. A guide that lowers its stats, or says weakening works, removes the immunity. A
  documented boost (another stat or size, or 没有强化) replaces the atk+2, following the earlier rule: an unstated innate
  boost is atk+2, a named stat without a size gets +2.
- Other Bosses of the era (legendary, campaign, dark door, tower): changed only where a mainland source says so.
- Taiwan-only sources (T客邦) do not count; none bore on these traits in this pass. Later sources (2013 S级 mode, 2017
  赛尔号启航, 2018+ videos) are supporting only.

## Supporting data: the Boss trait index

`../analysis/seer-data-a00bcdd/maps.json` (modern client) gives each Boss a `NewSeIdxs` list. The meaning of rows 1–97 is
public in a c. mid-2010 client's `new_se.xml` (PetEffectXMLInfo; mirrored byte-identical in GitHub `hex3f/Reseer` and
`BaiSugar/kose_seer` `config/data/xml/skill_effects.xml`): idx 1 = Eid 1 免疫"能力(battle_lv)下降", idx 2 = Eid 2
免疫"异常状态", 58 = unlimited PP, 79 = sure-hit, 89 + 90 = 哈莫雷特's 水→火→草 order and its five immune moves. Rows 98 and
up are server-only and undecoded. The current lists are a later configuration, so they only support period sources:

- idx 1 is on 哈莫雷特, 塔克林, 克拉尼特 (both fights), 墨杜萨, 肯佩德, 斯普林特, 迪符特, 古尔扎迪, 米诺斯, 斯宾塞, 暗夜冰狐,
  阿加莎, 卡伦尼, 普兰特, 博卡特, 斯克鲁, 库里, 洛拉斯克, 弗希斯, 克莱芬 (难度2), Thursday's 厄尔塞拉 and 德拉萨-虚弱.
- It is absent on 塔西亚, 劳克蒙德, 亚伦斯, 德拉萨, 皮特萨罗, 瑞尔斯, 兰斯特, 卡沃尔, 凯洛亚, 斯利普, 巴索尔, 帕里斯, 纳特,
  斯图尔特, 伊索里 and 克莱芬 (难度1). Several of these are immune by period guides (塔西亚, 瑞尔斯, 帕里斯, 纳特, 斯图尔特,
  伊索里), so its absence is not evidence.
- No Eid sets a stage at the start of a battle, so the lists say nothing about innate boosts.

## Engine

- `immune_stage_down` already refused every stage the foe lowers, accuracy and evasion included: all drops go through
  `changeStage` with `byFoe`, and acc/eva are stages there. 哈莫雷特 lacked the rule. `boss-rules-v56` now lowers its
  accuracy with 扔沙 and 精神干涉, and its evasion and other stats directly, and checks that each is refused while its
  own drops still apply.
- Phases now also run when a Boss monster enters, the battle start included (`switchIn`; before, only member phases did).
  A `first_turn` boost is therefore in place, logged and shown as a stage badge before the first command, and the Boss
  AI's first choice sees it. This closes the 2026-10-20 handoff point about 厄尔塞拉's Saturday badge.
- 劳克蒙德's energy-field clear in `boss-variants` now shields the player's member: with its boost seen from the start,
  the Boss strikes first for double damage.
- A variant rule needs player text (`encounter-variants.ts`): `immune_stage_down` reads 首领免疫能力下降（命中、闪避在内）.
  厄尔塞拉's Thursday is labelled 周四：天生强化、免疫弱化，每回合回复1000体力 and lists 开场时，首领攻击+2.

## Per-Boss basis

### SPT, era 2010-05 and later

| Boss | immune | boost | basis |
|---|---|---|---|
| 哈莫雷特 2010-05 | **added** | **atk+2 added** | the user's testimony 2026-10-21; idx 1 in the modern list supports |
| 厄尔塞拉 2010-08 | **added (Thu)** | **atk+2 added (Thu)** | 7k7k 2010-08-16 星期四 天生强化、免疫弱化 (idx 1 on Thursday only); the 4399 2010-08-13 Thursday plan spams 减防 (conflict); drops land on Wed, Sat, Sun |
| 塞维尔 2010-08 | no | **atk+2 added** | 4399 2010-08-03 天生强化，可减攻击消除强化; drops land (7k7k 2010-08-16 -2攻丢给塞维尔) |
| 塔克林 2010-08 | **added** | atk+2 (kept) | 4399 2010-08-09 免疫属性下降; 7k7k 2010-07-30 天生强化物攻+2 |
| 塔西亚 2010-08 | yes | none | unchanged: 7k7k/4399 2010-07-30 免疫弱化技能; 4399 2010-08-09 its boost comes at a quarter HP (not encoded) |
| 劳克蒙德 2010-10 | no | atk+2 (kept) | release guides lower its stats (4399 2010-10-15 消强化，弱化技能; 7k7k 2010-10-16 虚弱光线命中6次); 天然强化 |
| 克拉尼特（第一战） 2010-11 | **added** | **atk+2 added** | default; nothing either way for the Lv50 fight |
| 克拉尼特（第二战） 2010-11 | **added** | **atk+1 added** | default immunity; 4399 2010-12-08 火龙天生强化一个等级 (stat unstated) |
| 肯佩德 2011-01 | **added** | **spa+2** (was atk+2) | 7k7k 2011-01-14 肯佩特不吃弱化; 4399 2011-01-18 天生特攻强化 |
| 墨杜萨 2011-01 | **added** | **atk+2 added** | default; 4399 2011-01-12 先上一个消强化的 (stat unstated) |
| 亚伦斯 2011-02 | partial (kept) | **removed** | Zhidao 2011-03-02 亚伦斯无天生强化; only 龙之威仪 lands (7k7k 2011-02-28), kept as immune_skill_list |
| 德拉萨 2011-03 | no | atk+2 (kept) | a 4399 问答 answer (2011-03-29) advises 降他属性 / 破甲; normal mode has no idx 1 (weak; open) |
| 斯普林特 2011-04 | **added** | atk+2 (kept) | default; 4399 2011-04-29 先用盖亚消强化 |
| 迪符特 2011-06 | **added** | **atk+2 added** | default; 4399 2011-08-23 先消强 (stat unstated) |
| 克莱芬（酒醉） 2011-07 | no | none | left: weak Lv55 fight, no period statement; modern 难度1 has no idx 1; 赛尔号启航 2017 says not immune (open) |
| 克莱芬 2011-07 | **added** | **atk+2 added** | default; no period statement either way; 难度2 has idx 1 |
| 古尔扎迪 2011-09 | **added** | none | default immunity; 4399 2011-09-17 没有强化 |
| 米诺斯 2011-10 | **added** | **atk+2 added** | 4399 2011-10-25 天生强化2…弱化无效; 2011-10-27 有天生攻击强化…免疫所有异常和能力下降技能 |
| 斯宾塞 2011-10 | yes | atk+2 | unchanged: 4399 2011-10-08 弱化技能基本无效, 天生有强化 (doyo 2011-12-26 "没有强化" is one later run) |
| 皮特萨罗 2011-11 | no | spa+2 | unchanged: 4399 2011-11-21 弱化技能有效，但是BOSS的"绝灭射线"能够消除我方对它的弱化; 天生特攻强化 |
| 暗夜冰狐 2011-12 | **added** | def+2 spd+2 | default immunity; 4399 2011-12-05 天生强化双防 replaces atk+2 |
| 瑞尔斯 2011-12 | yes | atk+2 | unchanged: 4399 2011-12-26 弱化无效 |
| 阿加莎 2012-01 | **added** | none | default immunity; 4399 2012-01-10 没有天生强化 |
| 兰斯特 2012-02 | **added** | atk+1 | default immunity; 4399 2012-02-08 天生攻击强化+1 replaces atk+2 |
| 凯洛亚 2012-03 | no | atk+2 | unchanged: 7k7k 2012-03-16 吃弱化技能，可以先用封印6次降它攻击; 4399 2012-03-17 龙之威仪 |
| 卡沃尔 2012-03 | **added** | atk+2 | default; 4399 2012-03-05 天生强化 (stat unstated) |
| 卡伦尼 2012-04 | **added** | none | default immunity; 4399 2012-04-07 由于卡伦尼没有强化 |
| 斯利普 2012-04 | no | none | unchanged: 4399 2012-04-27 spams 水之结界 on it; 没啥强化 |
| 普兰特 2012-05 | yes | atk+2 | unchanged; 4399 2012-05-19 says the immunity is partial (open) |
| 博卡特 2012-06 | yes | atk+2 def+1 | unchanged: 4399 2012-06-02 不吃属性减弱, 天生攻击等级+2，防御等级+1 |
| 巴索尔 2012-07 | no | atk+2 | unchanged: 7k7k 2012-07-10 消强，然后弱化; 4399 2012-07-07 天生攻击等级+2 |
| 帕里斯 2012-08 | yes | atk+2 | unchanged: 4399 2012-08-10 不吃属性消弱技能, 天生攻击等级+2 |
| 斯克鲁 2012-09 | yes | atk+2 | unchanged: 4399 2012-09-21 弱化无效, 天生攻击强化+2 |
| 纳特 2012-10 | yes | atk+2 | unchanged: 4399 2012-10-12 不吃弱化, 天生攻击等级+2，无法消强化 |
| 斯图尔特 2012-10 | yes | atk+2 | unchanged: 4399 2012-10-26 弱化无效, 天生攻击强化+2 |
| 库里 2012-11 | **added** | atk+2 | default immunity; 7k7k 2012-11-12 攻击+2 |
| 洛拉斯克 2012-11 | no | **removed** | 4399 2012-11-24 没有天生强化; 7k7k 2012-11-26 吃弱化 (both in the 简单模式 week) |
| 弗希斯 2012-12 | **added** | **atk+2 added** | default; four period trait lists name neither |
| 伊索里 2012-12 | yes | atk+2 def+2 spd+2 | unchanged: 4399 2012-12-10 不吃属性弱化技能, 天生强化攻击、防御和特防等级+2 |

### Other Bosses changed (mainland source)

| Boss | change | source |
|---|---|---|
| 谱尼 第四封印「生命」 2010-05 | immune added | 7k7k 2010-07-21 不受状态下降影响; 52pk 2013-02-05 免疫状态和弱化 |
| 谱尼 第五封印「轮回」 2010-07 | immune added | 7k7k 2010-07-21; 52pk 2013-02-05 |
| 谱尼 第六封印「永恒」 2010-07 | immune added, atk+2 added | 7k7k 2010-07-21; 52pk 2013-02-05 同时天生有强化 (stat unstated) |
| 谱尼 第七封印「圣洁」 2010-08 | immune added | 7k7k 2010-07-21 不受属性下降影响（已确定）; 52pk 2013-02-05 |
| 谱尼真身 2010-09 | immune added (every life) | 7k7k 2010-07-21 tested: 又用肯札特迷惑减命中无效 (a 2018 video says otherwise; later) |
| 麒麟·幻化之轮 2013 | immune added | 7k7k 2013-09-04 不吃弱化和异常 |

### Other Bosses left as they are

- Drops land by mainland sources: 谱尼 第三封印 (4399 2010-04-05 命中-2), 朱雀 avatars and guardians (4399 2011-08-10 都吃…弱化技能),
  玄武 guardians (7k7k 2010-08-07 命中 drops), 青龙's guardian 塔西亚 (7k7k 2011-01-20 封印6次), 白虎's guardian 肯佩德 (7k7k
  2011-03-31 接受弱化), 卡修斯 (doyo 2011-12-19, weak), 麒麟·重生之轮 (4399 2013-09-27 迷惑之光弱化), 麒麟真身 (4399
  2013-10-04), 勇者之塔 68层 (4399 2010-06-28).
- Already immune and confirmed: 麒麟 wheels 2–4 (4399 2013 弱化无效), 艾尔伊洛 (user decision), 白虎's guardian 劳克蒙德 (4399
  2011-03-12 弱化双防无效、减双攻无效), 勇者之塔 60层 (4399 2009-11-23).
- No mainland statement either way: 谱尼 seals 1–2, the four 神兽 bodies, 布莱克, 帕罗狄亚, 艾里克, 阿洛比斯, 奇格萨,
  麒麟·炽天之轮, dark doors 6–9 other than 艾尔伊洛. Their boosts are unchanged (青龙 spa+2 and 朱雀 none are documented).

## Open points

- 哈莫雷特 follows the user's testimony, but no period source states either trait. One 4399 guide (2010-07-01, copied by
  7k7k 2011-03-16) lowers its defence (降他防的也用3次), the guides clear boosts only after it uses 龙之意志, and a 2010-06-01
  player read its attack as about 270, near an unboosted Lv80 value. Its modern trait list does carry idx 1.
- The modern list gives 哈莫雷特 idx 10, a 45% damage reduction (Eid 3), which the remake does not encode.
- Partial immunities the engine cannot express yet: 普兰特 (status-move drops fail, drops riding on attacks land), 厄尔塞拉
  on Wednesday (accuracy drops only). Both would need a parameter on `immune_stage_down`.
- Left for the user: 克莱芬（酒醉） (no default applied), 德拉萨 (one player's advice taken as contrary), 洛拉斯克 (its
  only sources are the 简单模式 week; its placeholder `immune_pct_damage` also conflicts with 7k7k's 海洋之心 strategy),
  厄尔塞拉's Thursday (two period sources disagree).
- Found but out of scope: 米诺斯's other traits (sure-hit moves, unlimited PP, all stats +1 below half HP, the player's
  pets start at accuracy -2; 4399 2011-10-27), 塔西亚's quarter-HP boost, 麒麟·幻化之轮's status immunity.
