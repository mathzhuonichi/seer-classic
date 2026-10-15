# Seer (赛尔号) pre-2013 mechanics: research notes

Scope, per coordinator: (a) boss rule patterns, (b) contradictions with
`battle/RULES.md` and `raising/SPEC.md`, (c) pre-2013 types and dual types,
(d) what existed before 2013 vs later. Stats, damage, statuses and EXP curves are
covered by those two files and are not repeated here, except where this research
confirms or disputes them.

Confidence: **H** = stated plainly by a dated period source; **M** = one source, or
a later source describing old behaviour; **L** = from memory, unverified, or the
source is weak (summary pages, spinoff games). Web pages were read through a
summarising fetcher, so short quotes may be paraphrased.

## 1. Boss rule patterns (for the data model)

Each pattern lists the bosses that show it. "SPT" = 赛尔先锋队 boss line
(蘑菇怪 → 尤纳斯, 2009–2010). Main sources: 7k7k boss guide 2011 [S1], 4399 SPT
guide 2011 [S2], 4399 Q&A on 盖亚 [S3], 4399 魔狮迪露 2010 [S4], 18183 怀旧服 尤纳斯
[S5], 4399 Q&A on 尤纳斯 [S6], 7k7k 谱尼 2010 [S7], sohu/TapTap 谱尼 summaries [S8],
4399 勇者之塔 2010 [S9], bilibili "boss特性" (modern) [S10].

### 1.1 Encounter-level rules

| # | pattern | examples | conf |
|---|---|---|---|
| E1 | Boss level and HP override; level may be above 100 (shown as "???") | 纳多雷 L70 HP 1400; 雷纳多 L75 HP 1500; 尤纳斯 L70 HP 2800 [S1] (怀旧服 says 6000 [S5]); 哈莫雷特 L80 HP 3000 [S1]; 勇者之塔 31–60F enemies "???级", 20–30 levels above the player [S9] | H |
| E2 | Time window: boss only appears at set times | 雷伊: first 10 min of every hour, 赫尔卡星 3F [S1, baidu jingyan]; 盖亚: Fri 13:00–13:30 & 20:00–20:30 火山星, Sat 11:00 & 16:00 双子阿尔法星, Sun 15:00 & 18:00 露希欧星 (7k7k 2012) | H |
| E3 | Reward only on certain weekdays | 雷伊 精元 only Fri–Sun (2011) [S2] | M |
| E4 | Objective depends on weekday | 盖亚: Mon/Fri win within 2 turns; Tue/Thu/Sun finishing blow must be a 致命一击; Wed/Sat survive 10 of its turns, then KO it [S3] | H |
| E5 | Reward is a 精元 (essence) item, hatched into the monster; beating the boss without meeting the objective gives no 精元 | 雷伊, 盖亚, 尤纳斯, 里奥斯 (精元 → 胡里亚), 阿克希亚 (→ 索拉), 提亚斯 (→ 米拉美) [S1, S3] | H |
| E6 | Other rewards: items, 赛尔豆, titles, honour points | 蘑菇怪 → 退化小蘑菇; 钢牙鲨 → 黑晶矿 [S1]; 尤纳斯 → 20 荣誉 + title [S5] | M |
| E7 | Daily attempt limit | 谱尼真身 once per day [S8, spinoff]; general daily caps recalled for 精元 bosses | L |
| E8 | Gauntlet / tower: consecutive fights, no healing between floors, a loss restarts at floor 1, rewards at milestones | 勇者之塔 ≥60 floors, 1F 天雷鼠 L30 … 30F 塔奇拉顿 L100; 1F 10 赛尔豆 … 30F 300 赛尔豆, later floors 中级活力药剂 [S9] | H |
| E9 | Unlock prerequisite (quest / map action) | 谱尼: light two lamps beside 勇者之塔 (4399 谱尼 page); 盖亚 needs the 战神联盟 storyline (7k7k 2012) | M |
| E10 | Multi-stage boss across separate battles (seals), each stage its own rules; progress may need several days | 谱尼: 4 seals in May 2010 (虚无, 元素, 能量, 生命) [S7], later 7 seals + 真身 [S8] | H (4 seals) / M (7) |
| E11 | Shared or cumulative HP across many battles | 魔狮迪露 "HP 300万" (L50) [S4] = server-wide pool, must be done before HP reaches 1/4 [S1]; 光之灵S (modern) "cumulative damage across battles" | M |
| E12 | Party restrictions (solo only, level cap) | 谱尼 第七封印 "must solo" [S8]; 勇者之塔 implies fixed team | M |

### 1.2 In-battle boss traits

| # | pattern | examples | conf |
|---|---|---|---|
| B1 | Innate stat stages at battle start | 尤纳斯 攻击 +2 [S5]; 哈莫雷特 龙之意志: all stats +1 [S1]; 谱尼 虚无 attack +2 [S8] | H |
| B2 | Heals to full once HP falls below a threshold | 阿克希亚: below 100 HP → full HP [S1]; 谱尼 第五封印 2nd life refills below 1000 [S8] | H |
| B3 | Fixed heal every turn | 谱尼 生命封印: 200 / 1000 / 1200 / 2000 per turn depending on source [S8] | M (amount L) |
| B4 | Damage only from listed types (others do 0) | 哈莫雷特: only 水/火/草 skills hurt it [S1]; 谱尼 元素: only certain types (sources disagree which) [S8] | H / M |
| B5 | No repeating the same type in a row (each type must alternate) | 哈莫雷特 "每种属性只能打一次" (rotate 水/火/草) [S1] | M |
| B6 | Damage only from sure-hit (必中) skills | 谱尼 虚无 [S8] | M |
| B7 | Stays at 1 HP; only a specific skill can land the last point | 尤纳斯: last HP only removable by 幻影 (fixed-damage skill) [S6] | M |
| B8 | Must be finished by status / DoT | 谱尼 元素: last blow from burn/freeze; 能量: poison it to death (水草蛙 毒粉) [S7, S8] | M |
| B9 | Status immunity (all or listed); some sources say it kicks in after the first hit | 尤纳斯 "不吃属性技能了" [S6]; 谱尼 圣洁 [S8]; modern rule: immunity activates on your first hit [S10] | H |
| B10 | Weak to statuses explicitly (useful for "must DoT" fights) | 魔狮迪露 takes 冻伤/烧伤/中毒/寄生 normally [S4] | H |
| B11 | Ignores type effectiveness (all hits ×1) | 魔狮迪露 "不受任何系精灵克制" [S4] | H |
| B12 | Several different statuses must be on it at the same time | 魔狮迪露 [S1] | M |
| B13 | Enrage / execute below HP threshold | 魔狮迪露: below 50% HP, every attack KOs, ignoring speed/level [S4]; attack rises as HP falls [S4]; 雷纳多: below 1/8 HP every hit is a crit [S1] | H |
| B14 | Unlimited PP, or the PP-exhaust win: stall until the boss has no PP, then it is harmless | 谱尼 虚无/元素/能量: 查尔顿 固若金汤 until "耗完谱尼的招" [S7]; 永恒 seal: infinite PP [S8]; 尤纳斯 黑暗之门 unlimited [S1] | H |
| B15 | Boss flees after using a skill N times (fight lost / no reward) | 提亚斯 flees after 2× 精神干涉 [S1] | H |
| B16 | Type reversal (属性反转) skill swaps types | 纳多雷 [S1]; modern: −33.3% damage [S10] | M |
| B17 | Blocks healing: player healing skills and 药剂 do nothing | 奈尼芬多 "药物反噬" [S1] | M |
| B18 | Multiple lives: revives full HP (and PP) N times | 谱尼 轮回: 2 lives; 谱尼真身 6 lives [S8]; modern cap 16 revivals [S10] | M |
| B19 | Punishes a damage threshold: a single hit over X triggers a KO of your monster (or of the boss, sources disagree) | 谱尼 能量 ">100 / >500 damage" [S8] | L |
| B20 | Turn-limited fight; the boss KOs everything after turn N | 谱尼 能量: if it uses more than 2 skills your team is KO'd [S8] | L |
| B21 | High evasion / low player accuracy | 提亚斯 "容易MISS" [S1]; 尤纳斯 "miss率高" [S5] | M |
| B22 | Counter skill used at low HP (always moves last) | 里奥斯 回击 [S1] | M |
| B23 | Removes the player's stat boosts | 谱尼 圣堂之门 "消除对方能力增强"; 雷伊 needs boosts cleared (叶绿光束) | M |
| B24 | Immune to stat drops (modern; first hit activates) | [S10] | L for pre-2013 |

### 1.3 Win objectives seen

`ko` (plain), `within_turns N` (盖亚 Mon/Fri, N=2), `finish_with_crit` (盖亚 Tue/Thu/Sun),
`survive_then_ko N` (盖亚 Wed/Sat, N=10: must survive N boss turns AND then KO),
`finish_with_skill` (尤纳斯 幻影), `finish_with_status_damage` (谱尼 元素/能量),
`hp_pool_before_threshold` (魔狮迪露), `exhaust_boss_pp` (谱尼 seals), seal
sub-goals from the spinoff such as "heal 500 HP with a 草 monster", "use 5 龙 skills",
"use 5 priority skills" (TapTap 赛尔号星球大战, L for PC).

## 2. Contradictions and gaps vs RULES.md / SPEC.md

1. **`survive_turns` ends the battle as success** (RULES 10). 盖亚 Wed/Sat needs
   "survive 10 turns, *then* defeat it" [S3]. Needs a `min_turns` / `survive_then_ko`
   objective that does not end the fight. (H)
2. **Boss traits missing from RULES 10**: B2 heal-at-threshold, B5 no type repeat,
   B6 only sure-hit, B7 stay-at-1-HP until skill X, B11 ignore type chart,
   B12 multiple statuses at once, B13 enrage/execute and always-crit below X%,
   B14 unlimited PP and "boss out of PP" win, B15 boss flees, B16 type reversal,
   B17 block player healing, and E2–E4 weekday/time-window rules and E11
   cumulative HP saved across battles. Most fit as `phases` + condition hooks;
   B5, B7, E4 and E11 need new vocabulary.
3. **PP-exhaust (B14)** was the standard pre-2013 strategy against 谱尼. RULES 4
   gives every monster `struggle` at 0 PP, which would break it. Bosses with 0 PP
   should probably do nothing (or a weak typeless hit) unless they have unlimited PP. (M)
4. **特性 existed before 2013.** SPEC "Scope … no 特性" is wrong as history: a blog
   post dated 2011-06-22 lists 特性 (流水/叶绿/蓄电/威严 = +5% damage of that type,
   坚硬 = −5% damage taken, 反击 = 5% chance of 攻击+1 when hit) made from fusion
   materials (海洋能量, 大地之核, 熔岩晶体, 纯净能量). Omitting them is a fine
   remake choice, but it is a choice. (M)
5. **个体 roll range**: a 2016 4399 guide says new monsters roll **1–31**; 0 only
   appears after a 个体 re-roll item. SPEC rolls uniform 0–31. Minor. (M)
6. **Bosses are not captured**: classic rewards were 精元 items hatched later, and
   only when the objective was met (E5). If the engine's boss reward is "capture",
   it should be "grant 精元/item on success". (H)
7. **Type chart**: `data/types.json` matches the BWIKI chart for 赛尔号手游 (the
   mobile game), not a dated PC source. A second modern page (playbyone 2023) differs
   for 草 (lists 冰 as 0.5x, not 机械/圣灵/远古) and 水 (冰 0.5x). Unresolved; the BWIKI
   version agrees with my memory of PC (草 weak vs 机械). It also includes 自然,
   which is post-2012 (section 3). (M)
8. **Dual rule confirmed**: 4399 "单双属性克制系数计算方法": both 2 → 4; any 0 →
   sum/4; otherwise sum/2. Same as RULES 6. Generalised form on page 2:
   `sum/n × (1 + count of 2s if repeated) / (1 + count of 0s)`, giving a range of
   0.125–4. (H)
9. **Confirmed, no conflict**: stat formula, 个体 single value applied to all stats
   (BWIKI: "每有1点天赋，各项能力…提高1点"), 学习力 255/510, natures (`data/natures.json`
   matches the 4399 2010 list: 孤独 勇敢 固执 调皮 / 大胆 悠闲 淘气 无虑 / 胆小 急躁 开朗 天真 /
   保守 稳重 冷静 马虎 / 沉着 温顺 狂妄 慎重, neutral 实干 坦率 认真 害羞 浮躁), and the four
   EXP curves (the 7k7k per-level formula 3.6n²−26.4n+86 is exactly the medium-slow
   step). Speed tie random: 4399 先制 guide "顺序不定". (H)
10. **Capture formula**: no source gives one. Known capsules: 普通/中级/高级精灵胶囊,
    plus later 超级, 异能 (crafted from 5 中级 + materials), 无敌 (sure catch). Lower HP
    and a status raise the rate (modern guides). RULES' Pokémon-style choice is fine. (L)

## 3. Types before 2013

| type | status by end of 2012 | conf |
|---|---|---|
| 草 水 火 飞行 电 机械 地面 普通 | from launch (2009) | H |
| 冰 超能 战斗 光 暗影 神秘 龙 | present by 2010: the official dex page (© 2008–2010) lists them | H |
| 圣灵 | present by 2010 (谱尼 #300, 圣灵, on that same page; 谱尼 out by May 2010) | H |
| 次元 | probably 2011–2012; not on the 2010 dex page | L |
| 远古 | probably 2012 | L |
| 邪灵 | 2012 or 2013, unsure | L |
| 自然, 王, 混沌, 神灵, 轮回, 虫, 虚空 | after 2012 | M (自然) / H (the rest) |

So a safe pre-2013 set is the 16 types on the 2010 official page, optionally adding
次元 and 远古 once the catalog shows monsters of those types dated ≤2012.

**Dual types**: the 2010 official dex shows no dual types. No dated source was found
for when they arrived. My recollection: the first dual-type monsters came in about
2012, rare until 2013–2014 (L). The dual rule is in section 2 item 8. Before dual
types existed, every monster had one type and the chart was 2 / 1 / 0.5 / 0 only.

Single-type chart (BWIKI 手游 version = `data/types.json`), pre-2013 types only,
for reference:

| atk | 2x | 0.5x | 0x |
|---|---|---|---|
| 草 | 水 光 地面 | 草 火 飞行 机械 圣灵 远古 | |
| 水 | 火 地面 | 草 水 圣灵 | |
| 火 | 草 机械 冰 | 水 火 圣灵 | |
| 飞行 | 草 战斗 | 电 机械 次元 邪灵 | |
| 电 | 水 飞行 暗影 次元 | 草 电 圣灵 神秘 | 地面 |
| 机械 | 冰 战斗 邪灵 远古 | 水 火 电 机械 次元 | |
| 地面 | 火 电 机械 | 草 暗影 龙 超能 圣灵 | 飞行 |
| 普通 | | | |
| 冰 | 草 地面 飞行 次元 远古 | 水 火 机械 冰 圣灵 | |
| 超能 | 战斗 神秘 | 机械 超能 | 光 |
| 战斗 | 机械 冰 龙 圣灵 | 暗影 战斗 超能 | |
| 光 | 暗影 超能 | 机械 冰 光 圣灵 邪灵 | 草 |
| 暗影 | 暗影 超能 次元 | 机械 冰 光 圣灵 邪灵 | |
| 神秘 | 神秘 圣灵 电 | 战斗 邪灵 地面 | |
| 龙 | 龙 冰 邪灵 圣灵 | 草 水 火 电 远古 | |
| 圣灵 | 草 水 火 电 冰 远古 | 龙 战斗 神秘 | |
| 次元 | 超能 机械 邪灵 飞行 | 冰 | 暗影 |
| 远古 | 草 飞行 龙 神秘 | 冰 机械 | |

(entries vs 自然 dropped.) Note the chart is not symmetric: 地面 hits 电 2x but 电
hits 地面 0x, and 草 hits 光 2x while 光 hits 草 0x.

## 4. Existed before 2013 vs later

| feature | pre-2013? | evidence | conf |
|---|---|---|---|
| 6-monster party, 4 equipped skills | yes | all period guides; 怀旧服 "4个主动技能槽位" | H |
| 第五技能 (5th skill) | **no**, 2014 | official news 2014-06-13: 丽莎布布 super-evolution "with a new fifth skill" | H |
| 魂印 | no (about 2014+) | absent from every pre-2013 guide found; RULES/SPEC already exclude it | M |
| 刻印 | **yes**, by 2011 (ability and skill engravings); universal engravings from mid-2014 | 7k7k articles 2011-03-05 and 2011-05-16; 2013-07-06 client table (`engravings-2013.md`) | H |
| 特性 | **yes**, by June 2011, via fusion materials | Sina blog 2011-06-22 | M |
| 精灵融合 / 元神珠 hatching | yes (2011) | same blog; 怀旧服 guides (元神珠孵化) | M |
| 超进化 | yes, by July 2012 (雷纳尔多, 圣光天马, 巨石灵王, 仙女龙, 魔域仙子, 巨齿鲨, 巨蘑怪, 鲁迪诺斯) | 4399 2012-07-28 | H |
| 战神联盟 super-evolutions (卡修斯, 布莱克, 雷伊) | no, Apr–Jun 2014 | official news 10924 / 11155 | H |
| 个体 shown as a number (天赋) | probably not; players computed it from stats | 2011 guides give formulas to back-solve 个体 | M |
| 天赋改造药剂 / 精灵还原药剂 | unclear; documented 2016 | 4399 2016 | L for pre-2013 |
| 学习力 accelerators (双倍) + 自动战斗器 | yes in 怀旧服; dates unclear | ali213 怀旧服 | L |
| Boss status immunity | yes (尤纳斯 changed to it, 2010–2011) | [S6] | M |
| 先制 (priority) levels | yes | 4399 先制 guide (modern, describes long-standing rule) | M |
| 致命一击 boosting gear (titles, suits, 能量石) | 致命能量石 yes in 2012 (盖亚 guide) | 7k7k 2012 | M |
| 年费/套装/称号 stat bonuses | 套装/称号 existed; stat bonuses mostly later | jiangshibiao (modern) | L |

## 5. Catalog scope (end of 2012)

- ID anchors: 雷伊 = #70-ish SPT era (L); 谱尼 = **#300** (2010, H); official 2010 dex
  page tops out at #321 on its first listing (H); 圣光天马 = **#1122** and was already
  a 超进化 by July 2012 (H for both facts).
- So the highest ID by end of 2012 is probably **about 1150–1400** (L). IDs have
  gaps and include boss-only and form entries, so obtainable species are fewer
  (rough guess 600–900, L). No dated skill count was found; skill IDs are
  5-digit (1xxxx), and a few thousand skills is a reasonable bound (L).

## Sources

- [S1] 7k7k 赛尔号boss攻略大全 (2011-03-16): news.7k7k.com/content/20110316/76862.html
- [S2] 4399 SPT+BOSS全攻略 (2011-07-21): news.4399.com/seer/jingyanxinde/201107-21-105242.html
- [S3] 4399 问答 盖亚精元: wenda.4399.com/question/2/24032.html
- [S4] 4399 魔狮迪露 (2010-06-05): news.4399.com/seer/spt/201006-05-70398.html
- [S5] 18183 怀旧服 尤纳斯: m.18183.com/gonglue/202209/4132152.html
- [S6] 4399 问答 尤纳斯: wenda.4399.com/question/4/42732.html
- [S7] 7k7k SPT及谱尼攻略 (2010-05-19): news.7k7k.com/content/20100519/7615.html
- [S8] sohu.com/a/882650863_267471, sohu.com/a/882428673_267471, taptap.cn/moment/15207740754364428 (赛尔号星球大战 spinoff)
- [S9] 4399 勇者之塔1–60层 (2010-04-13): news.4399.com/seer/yzzt/201004-13-66291.html
- [S10] bilibili 赛学必修10 boss特性: bilibili.com/opus/945126507212177417
- 7k7k 盖亚出现地点 (2012-06-27): news.7k7k.com/content/20120627/178956.html
- 511du 雷伊: 511du.com/p/7130.html; baidu jingyan 雷伊: jingyan.baidu.com/article/ff41162571735a12e5823742.html
- 4399 双属性系数: news.4399.com/gonglue/seer/jingyanxinde/825548.html and _2.html (2018)
- BWIKI 手游 属性: wiki.biligame.com/seerm/属性; playbyone.com/article/5440.html
- 4399 先制系统: news.4399.com/gonglue/seer/jingyanxinde/770102.html
- 4399 性格大全 (2010): news.4399.com/seer/jingyanxinde/201001-07-62103.html
- Sina blog 特性表 (2011-06-22): blog.sina.com.cn/s/blog_3e44419b0100saef.html
- 4399 超进化解析 (2012-07-28): news.4399.com/gonglue/seer/jingyanxinde/181965.html
- 淘米 news 2014-04-11 / 2014-06-13: game.61.com/news/10924.shtml, game.61.com/news/11155.shtml
- 4399 谱尼图鉴 (#300): news.4399.com/seer/tujian/63646.htm; official dex: seer.61.com/main/spirit/index.html
- 4399 个体值 (2016): news.4399.com/seer/xinshouzhinan/201601-12-592620.html; BWIKI 培养机制
