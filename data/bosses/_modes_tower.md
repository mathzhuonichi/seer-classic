# Pre-2013 repeatable PvE ladders (category `tower`)

These are the original rules of the Flash-era (2009–2012) challenge ladders, gathered for the remake's tower
and arena encounters. Encounter files are in `data/bosses/`; the remake's tower progression rules are in
`src/domain/challenges/brave-tower.ts`.

Sources were read through a summarising web fetcher, so short Chinese quotes may be slightly paraphrased.
Where a value was estimated, the encounter file lists it in `confidence.uncertain` and explains it in
`engine_notes`.

## 1. 勇者之塔 (Tower of the Brave)

**Files:** `boss_tower_brave_f001` … `f070`, `boss_tower_brave_mystery`

| item | original rule | source |
|---|---|---|
| Location | 精灵太空站, 资源区. The two switches/lamps beside the tower later opened 谱尼's 神秘领域 line. | baidu jingyan; 4399 谱尼 page (see `boss_puni_seal1`) |
| Opened | Floors 1–30 in 2009. The 2009-11 video series covers floors 1–60. Floors 51–60 were new in Dec 2009. Floors 61–70 were added around Oct 2010. Floors 71–80 came in 2013, so they are out of scope. | 4399 2009-12-28, 4399 2010-10-10, 4399 2013-04-03, bilibili BV16d4y1d7N6 |
| Structure | One battle per floor, climbed in order. Floors 1–50 have one enemy each. From floor 51 there are 2–3 enemies per floor (两只以上一起上), and from floor 66 there are four. | 4399 2010-04-13, 2009-12-28, 2010-10-10 |
| Levels | 1F Lv30, rising 2 per floor, then 3–4 per floor to 30F Lv100. Floors 31–60 show "??"/"???": 能力高于100, 比玩家精灵高二十、三十级. Floors 61–65 are Lv230–270 with HP 1150–1350 (HP = 5×Lv per monster). | 4399 2010-04-13; 聚侠 2011-09-23 |
| Healing / loss | No healing between floors. 如果挑战失败，要重新从一层开打, so a loss sends you back to floor 1. Fleeing did not reset progress: 只剩一只精灵时除非胜券在握，最好逃跑. | 4399 2010-04-13 |
| Team | The normal six-pet bag. The source has no level cap. The 2013 guide for 71–80 says 战斗过程中不可以换精灵，所以一定要用6只精灵通关. Treat that as later behaviour. | 4399 2013-04-03 |
| Rewards | Floors 1–9 and 11–19 give 10×floor 赛尔豆. 6F also gives 1 扭蛋币. 10F: 2 高级体力药剂. 20F: 2 中级精灵胶囊. 21–29: 10×floor 豆. 30F: 300 豆 + 闪光套装. 31–39: 310 豆. 40F: 2 中级活力药剂. 41–49: 320 豆. 50F: 1 初级体力药剂. 51–59: not listed. **60F: new monster 肯** (encoded as `essence_ken` → 141). **70F: 呆呆蛹** (`essence_daidaiyong` → 366). Achievements are at 10/30/40/50/60/70 floors, and 60F gives the title 勇者. | 4399 2010-04-13, 2009-12-28, 2010-10-10; client `achievements.json` |
| Reset | No daily limit or weekly reset is recorded for the Flash tower. The only reset rule found is that a loss sends you back to 1F. Whether floor rewards could be collected again on a second climb is not stated. | — |
| 神秘领域 | You need six Lv100 pets to enter (需要带上6只100级精灵才能进入). The enemy is a ???-level 谱尼 (圣光系), and there is **no reward**. This is the early 神秘领域 fight. The 谱尼 seal and capture line written by another worker starts from the same place. | 4399 2010-04-13 |

**Remake progression (V53/V54).** The remake keeps the in-order climb but not the 2010 loss rule. Clearing
floors 10, 20, … unlocks the starting points 1, 11, …, 61. A loss, retreat or cancelled load keeps the attempted
floor, and the party may recover between floors. The floor-30 suit and the 60F and 70F essences are granted on the
first clear. Floors 61–70 keep their source levels, so 呆呆蛹 also has an ordinary collection recruitment
(`collection-recruitment-366`), and its line does not depend on clearing floor 70. See [station-tower-v53](../../design/notes/station-tower-v53.md) and
[tower-floor-flow-v54](../../design/notes/tower-floor-flow-v54.md).

Notable floor rules encoded in the files:
- **50F 水晶鸭**: below 100 HP it refills to 900 (`heal_full_below {hp:100}`).
- **60F 洛比特/艾迪希洛/肯扎特**: each takes damage only from its own type, 普通系 skills and 属性 skills (classic answer: 同生共死). Encoded as script `damage_only_from_own_type_normal_or_status`.
- **61F+ grass types** fully heal whenever they drop below 1/5 HP; the source sets no limit. Encoded as per-member
  `heal_full_below {pct:20, member}` without `times`, on 62F, 65F, 69F and 70F.
- **64F 查尔顿** crits every hit after turn 8. Encoded as script `always_crit_after_turn`.
- **66F 闪光尼尔** knows only 念力射线, the one psychic move of its learnset (闪尼只会超能技能).
- **70F 橡木蝶** heals 200 per turn. Encoded as per-member `heal_each_turn {amount:200}`.
- Several floors were classically won by draining the boss's PP (34F 急冻兽, 40F 布林克斯 月光闪, 41F 派鲁基达). PP is finite on every floor.

Gaps:
- HP is unpublished for floors 1–60, except 50F (900) and 57F 艾斯菲亚 (750). Floors 1–30 use the stat formula. Floors 31–49 are estimated at 600, and floors 51–60 at 750.
- Floors 66–68 are only partly named, and their unidentified opponents are omitted: 66F fields three of its four
  enemies, and 67F (SRX) and 68F (嘟噜噜王) one each.
- No source names the monsters of 69F. The remake fields the four floor-70 species at Lv310 with 1550 HP as a
  labelled substitute (`remake_note`), including 橡木蝶's 61F+ grass heal.
- In 62F/64F/65F, the names 艾斯帕/米洛隆/利爪蟹 don't match any species. They are mapped to 艾斯菲格 (418), 米洛尼 (236) and 刺爪蟹 (231) as guesses.

## 2. 暗黑武斗场 — 试炼之门 and 暗黑之门

**Files:** `boss_dark_trial_katesi`, `boss_dark_door1_*` … `boss_dark_door9_*` (21 bosses)

| item | original rule | source |
|---|---|---|
| Location | 精灵太空站 (lower-right entrance), built by 派特博士 / 肖恩博士's dark-spirit research. | 9game; hly.com; client `dialog.json` |
| Entry | 超能NoNo owners loaded the 反物质芯片. Other players needed NoNo AI level 10 and a crafted 反物质芯片 (in practice VIP-gated: 暗黑武斗场只有vip才可以进去). | hly.com z-40425; 9game |
| Doors | 试炼之门 (卡特斯), then 暗黑第一门 … 第九门. Before 2013 that made ten gates (总共十门). Each door holds 1–3 dark bosses fought layer by layer (第六门 一层/二层/三层). | hly.com; 4399 2010-06-04 |
| Line-up | 1: 魔牙鲨 L50 300HP · 2: 贝鲁基德 L60 500 · 3: 巴弗洛 L70 700, 奇拉塔顿 L75 750 · 4: 西萨拉斯 L80 800, 克林卡修 L85 800 · 5: 卡库 L90 900, 赫德卡 L95 950, 伊兰罗尼 L100 1000 · 6: 斯加尔卡 L100 1200, 艾尔伊洛 L100 1500, 布林克克 2000 · 7: 魔花使者 1800, 莫尔加斯 2000, 萨诺拉斯 2000 (all L100) · 8: 帕多尼 ~1600, 加洛德 ~1700, 萨多拉尼 ~1500 · 9: 迪普利德 ~1500, 拜洛亚斯 ~1200, 阿克诺亚 2500 (two lives) | 4399 暗黑武斗场 第1–9门攻略 (2011-05-28/30) |
| Opened | Gates 1–5 and the 试炼之门 by 2010-02-25. Door 6 on 2010-06-04. Door 7 by 2010-08-25. Door 8 on 2011-02-18. Door 9 around May 2011. Doors 10–12 came later (12 = 暗黑布莱克, nine natures → 暗黑布莱克 精元); they are not in this set, and 布莱克 belongs to the legendary worker. | 7k7k 2010-02-25, 2011-02-17; 4399 2010-06-04, 2010-08-25, 2011-05-30; hly.com z-51403 |
| Rewards | Each beaten door boss gives its 暗黑精灵's 精元 (通关后获得精元), which hatches the line's first stage, e.g. 魔牙鲨 → 利齿鱼. No reward is recorded for the 试炼之门. | 4399 2010-06-04 |
| Team / healing | Normal six-pet bag, and switching was allowed (strategies rotate several pets). Sources don't say whether HP carries between a door's layers. The remake fights each door boss as its own encounter and keeps per-boss progress. | 4399 door guides |
| Reset | Beaten bosses stay beaten (each 精元 once). No daily cap is recorded. | — |

Notable boss rules encoded in the files:
- **巴弗洛** uses 镇魂歌 (you faint unless it falls within 3 turns), and the player's 镇魂歌 has no effect on it.
- **艾尔伊洛 / 布林克克 / 帕多尼 / 加洛德** start with innate stat boosts.
- **布林克克** refills to full below 200 HP (100 in the 2010 article) and is immune to many statuses.
- **魔花使者** heals 300 per turn.
- **萨诺拉斯 / 萨多拉尼** always move first. 萨多拉尼 also has a high crit rate.
- **帕多尼** reflects damage. The amount is not stated; 25% is an estimate.
- **阿克诺亚** has two lives (2500 HP total).

暗黑武道会 (the PvP arena for dark spirits, achievements up to 500 wins, 已绝版) is PvP and is not encoded.

## 3. 王者之塔 (普通 / 极限) — documented only

- Opened early 2011; 4399 published the 极限 guide on 2011-02-05, and 多玩 has 11–20层 in 2011-03.
- The **极限** mode can't be entered with the 超能NoNo, so the team can't be changed inside (超NO不能进入而导致不能换精灵). The 普通 mode allows changes.
- Leaving resets to floor 1 (一旦退出需从第1层重新开始).
- Each of the first 9 floors is themed on a type: 1 冰, 2 机械, 3 飞行, 4 地面, 5 超能, 6 水, 7 火, 8 草, 9 战斗.
- 10F is a boss floor with three enemies: the first heals 150 per turn, the second hits hard, and the third is the boss.
- Clearing 10F gave **光明卡修装备**.
- Floors 11–20 exist in 极限 mode.
- No source available here names the monsters, so **no encounter files** were written. Source: 4399 赛尔号极限王者之塔攻略（Ⅰ） http://news.4399.com/seer/jingyanxinde/201102-05-86065.html; 多玩 http://web.duowan.com/1103/162994803337.html (not readable here).

## 4. Historical Brave Trial; current direct solo challenge

- The historical mode opened 2010-11-12 on 英佩恩堡垒 2F and required a multiplayer team. This is source context, not a current entry requirement.
- It had up to 50 floors (client achievements go to 60F; 50F gives the title 见习勇士).
- The new monster **奇格萨** appeared on a random floor 1–50 and gave 萨格 when beaten.
- **Current implementation:** `boss_trial_brave_qigesa` is a direct ordinary single-player challenge against one Qigesa, retaining the Sag essence reward. It implements no cooperative lobby, multiplayer formation or random-floor ladder.
- Source: 4399 赛尔号勇士试炼 https://m.news.4399.com/seer/saiergonglue/201011-12-80618.html

## 5. 试炼之塔 (新手) — documented only

- Only the client achievement table records it: 通过试炼之塔10层（已绝版）, and 30层 gives the title 新人.
- No floor data was found, so no files were written.

## Sources

- 4399 勇者之塔1–60层 (2010-04-13) https://news.4399.com/seer/yzzt/201004-13-66291.html
- 4399 勇者之塔51–60层 (2009-12-28) https://news.4399.com/seer/yzzt/200912-28-59900.html
- 4399 勇者之塔61–70层 (2010-10-10) https://news.4399.com/seer/jingyanxinde/201010-10-78575.html
- 聚侠 勇者之塔61–70层 (2011-09-23) https://www.juxia.com/news/2011-9-23/15944.html
- 4399 勇者之塔71–80层 (2013-04-03, out of scope) https://news.4399.com/gonglue/seer/jingyanxinde/253731.html
- 4399 暗黑武斗场 door guides: …/seer/ahwdc/201105-30-98433 (门1), 98434 (门2), 98436 (门3), 98438 (门4), 98439 (门5), 98440 (门6), 98441 (门7), 201105-28-98332 (门8), 201105-30-98372 (门9); 201006-04-70264, 201006-04-70326, 201006-07-70448 (门6, 2010); 201008-25-76095 (门7, 2010)
- 7k7k 暗黑之门1~5门 (2010-02-25) https://news.7k7k.com/content/20100225/5898.html; BOSS打法全攻略 (2010-06-02) https://news.7k7k.com/content/20100602/8159.html; 暗黑第8门预告 (2011-02-17) https://news.7k7k.com/content/20110217/62678.html
- 9game 暗黑武斗场 https://www.9game.cn/news/10271543.html; 欢乐园 https://www.hly.com/zixun/z-40425.html, https://www.hly.com/zixun/z-51403.html
- 511du 第九门 https://www.511du.com/p/6868.html
- Official 图鉴 卡特斯 https://seer.61.com/main/spirit/165.html
- Client config (H5 dump): `achievements.json` (勇者之塔 10–70, 试炼之塔 10/30, 勇者试炼 20–60, 暗黑武道会), `dialog.json`
