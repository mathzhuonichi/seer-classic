# SPT Boss movesets (2026-10-19)

Status: current. Data: `data/bosses/boss_spt_*.json` (`team[].skills`, `ai.skills`, the `skills:` engine note); provenance:
`data/boss-evidence-v56.json`, built by `tools/audit/build_boss_evidence_v56.py`.

## Why

The user found that 厄尔塞拉 had no normal-type attack, although the original Boss used the normal-type 时空裂隙 (catalog name
时空裂痕, skill 11139), and said that other SPT Bosses were wrong too. The requirement is the original moveset of each fight, as
closely as sources allow, not the strongest set and not a guess. Original sets are often weak; that is kept.

## How a set is chosen

For each SPT fight, in this order:

1. Moves named for that fight by period mainland sources: 4399, 7k7k, 聚侠, 百度知道/百科, sina blogs, and 2010-2012 fight videos
   and battle-log screenshots. Every quote and screenshot used here was re-read on its page in this pass; a finding whose quote could
   not be confirmed was dropped. A Taiwan-server source (T客邦) only corroborates.
2. The fight's Boss-only form, when the server map table (`maps.json`) uses one: its own move list.
3. For the slots no source names, the species' last four moves learnt at or below the fight level (the level is inclusive). This
   is inferred from data, not read from server code. In all 20 SPT fights that a period guide or battle log fully documents, the
   set equals this last four, including the level boundaries (蘑菇怪 Lv10 has 毒粉@10 but not 弹跳踢@13; 钢牙鲨 Lv25 lacks
   咬碎@26; 哈莫雷特 Lv80 has 龙王灭碎阵@80). The earlier notes said "top learnset", which is wrong at these boundaries.

Moves are never picked for strength. Name variants are matched against `data/skills.json`: 时空裂隙 = 时空裂痕 (11139; the
catalog has no 时空裂隙), 黑色旋涡 = 黑色漩涡 (11544), 狂暴裂袭 = 狂暴烈袭 (12284), 疯狂彗星 = 疯狂慧星, 镜像术 = 镜影术,
风沙尘暴 = 风尘沙暴, 药物反噬 = 药剂反噬, 黑暗撕裂 = 暗黑撕裂.

## Changes

| Boss | Before | After | Basis |
| --- | --- | --- | --- |
| 肯佩德 | 暗流深渊 / 勇猛 / 暗黑狂流 / 暗影之力 | 黑色漩涡 / 暗黑狂流 / 暗影之力 / 暗流深渊 | 4399 2011-01-18 lists 常用技能 暗流深渊，暗影之力，暗黑狂流，黑色旋涡. 勇猛 entered the learnset after the debut (7k7k 2011-01-24). |
| 斯利普 | 龙怒乾坤 / 展翅冲锋 / 混沌惩戒 / 打盹 | 混沌惩戒 / 震怒之魂 / 展翅冲锋 / 龙怒乾坤 | All four in the battle log of a 2012 4399 fight video (id 120526). 打盹 was a guess. |
| 塔克林 | 潜龙伏地啸 / 灰飞烟灭 / 龙之威仪 / 猛龙陷地步 | 龙之威仪 / 猛龙陷地步 / 咆哮震九天 / 潜龙伏地啸 | Solo fight = species 274 Lv80. Screenshots show 潜龙伏地啸 and 咆哮震九天 (4399, 7k7k 2010). 灰飞烟灭 is the team-fight form 5001's only move. |
| 克莱芬（酒醉） | 酒火回体 / 醉酒燃烧 / 暴火焚烧 / 怒火咆哮 | 魔火邪力 / 致命漏洞 / 酒火回体 / 醉酒燃烧 | Form 5029 at Lv55. A 2011-07-22 screenshot of the Lv55 fight shows 醉酒燃烧 and 致命漏洞; the old 暴火焚烧@57 and 怒火咆哮@61 are above the level. |
| 克拉尼特（第一战） | 火光四溅 / 火龙的咆哮 / 火龙红莲击 / 进攻意识 | 火龙的咆哮 / 龙族之力 / 进攻意识 / 火龙红莲击 | The release-day video's Lv50 log shows 龙族之力 and 火龙的咆哮; 4399 2010-11-22 names 火龙红莲击 for this fight. |
| 普兰特 | 混沌绿光 / 蚀梦术 / 虚空魔刺 / 灵光缠绕 | 破魂射线 / 灵光缠绕 / 虚空魔刺 / 混沌绿光 | 2012 battle logs show all four. One guide sentence names 蚀梦术, but no log does, including that guide's own videos. |
| 厄尔塞拉 (proposal; another unit edits the file) | 奇幻光芒 / 光芒附体 / 光能聚合 / 金光闪烁 | 时空裂痕 / 光能聚合 / 光芒附体 / 奇幻光芒 | Weekday fights use species 421 at Lv80, so the set is its last four. 百度知道 2010-09-26 (copying the 2010 百科 entry): against grass 「它只会用光芒附体与时空裂痕」 and 「对于草系只会用属性和100攻击的普通」. 金光闪烁 belongs to the 盖亚特训 form 2519. |

Changed sets are listed in learn order; no source gives the order inside a set.

## Per-Boss basis

"guide (all four)" and "video (all four)" mean that period sources name the whole set for that fight. "rule; N seen" means the
set is the last four and N of its moves appear in period battle logs; "named" means a period text names them. Each Boss's
`skills:` engine note gives the sources.

| Boss | Lv | Final set | Was | Basis |
| --- | --- | --- | --- | --- |
| 阿加莎 (`ajiasha`) | 80 | 绿光冲击 / 花雨漫天 / 藤蔓抽打 / 魔幻花种 | same | guide (all four) |
| 阿克希亚 (`akexiya`) | 65 | 圣灵闪 / 冰天雪地 / 冰封 / 凝冻冰雹 | same | guide (all four) |
| 暗夜冰狐 (`anyebinghu`) | 80 | 暗夜冰袭 / 末日冰封 / 黯灭幻影 / 无极之冰 | same | guide (all four) |
| 巴索尔 (`basuoer`) | 80 | 螺旋光裂斩 / 金光迸射 / 破甲重击 / 光之兵刃 | same | last-four rule |
| 博卡特 (`bokate`) | 80 | 极限冲击炮 / 装甲突进 / 导弹追击 / 火力锁定 | same | last-four rule |
| 德拉萨 (`delasa`) | 70 | 极寒龙刺爪 / 浩劫之力 / 寒冰龙息 / 双爪强化 | same | rule; 1 named |
| 迪符特 (`difute`) | 80 | 尖峰号角 / 山神护体 / 封印镇压 / 炫彩神力 | same | rule; 1 named, 2 described |
| 厄尔塞拉 (`eersaila`) | 80 | 时空裂痕 / 光能聚合 / 光芒附体 / 奇幻光芒 | 奇幻光芒 / 光芒附体 / 光能聚合 / 金光闪烁 | proposal (file edited by another unit): last-four rule; 2010 Zhidao names 光芒附体 and 时空裂痕 |
| 弗希斯 (`fuxisi`) | 100 | 残影叶刃闪 / 幽暗魔花 / 黑叶针尖 / 盘绕根茎 | same | last-four rule |
| 钢牙鲨 (`gangyasha`) | 25 | 冰之牙 / 虚张声势 / 猛击 / 噪音 | same | guide (all four) |
| 古尔扎迪 (`guerzhadi`) | 80 | 大地之怒 / 巨石身躯 / 乱石风暴 / 混乱之雨 | same | guide (all four) |
| 哈莫雷特 (`hamoleite`) | 80 | 龙王灭碎阵 / 龙爪闪空破 / 龙王波 / 龙之意志 | same | guide (all four) |
| 凯洛亚 (`kailuoya`) | 80 | 异光幻流 / 断流怒啸 / 破浪念闪 / 水之结界 | same | guide (all four) |
| 卡伦尼 (`kalunni`) | 80 | 黑暗魔影草 / 异界毒蔓 / 魔雾缠绕 / 暗能吸收 | same | guide + video (all four) |
| 卡沃尔 (`kawoer`) | 80 | 闪电冰暴 / 零度冰封 / 雷霆横扫 / 冰雷幻阵 | same | rule; 3 seen |
| 克莱芬（酒醉） (`kelaifen1`) | 55 | 魔火邪力 / 致命漏洞 / 酒火回体 / 醉酒燃烧 | 酒火回体 / 醉酒燃烧 / 暴火焚烧 / 怒火咆哮 | form 5029 last four; 2 seen |
| 克莱芬 (`kelaifen2`) | 80 | 酒火回体 / 醉酒燃烧 / 暴火焚烧 / 怒火咆哮 | same | rule; 2 seen |
| 克拉尼特（第一战） (`kelanite1`) | 50 | 火龙的咆哮 / 龙族之力 / 进攻意识 / 火龙红莲击 | 火光四溅 / 火龙的咆哮 / 火龙红莲击 / 进攻意识 | 2 seen + 1 named; 4th by rule |
| 克拉尼特（第二战） (`kelanite2`) | 80 | 火龙红莲击 / 赤色龙息 / 进攻意识 / 自我暗示 | same | video (all four) |
| 肯佩德 (`kenpeide`) | 80 | 黑色漩涡 / 暗黑狂流 / 暗影之力 / 暗流深渊 | 暗流深渊 / 勇猛 / 暗黑狂流 / 暗影之力 | guide (all four); fear conflict |
| 库里 (`kuli`) | 80 | 星光奔腾击 / 复仇漩涡 / 昂首嘶鸣 / 勇往直前 | same | rule; 1 named |
| 兰斯特 (`lansite`) | 80 | 陨星破天击 / 巨岩之拳 / 陨石坠落 / 大地崩裂 | same | guide (all four) |
| 劳克蒙德 (`laokemengde`) | 80 | 旋风爪击 / 规则掌控 / 极限领域 / 愤怒一击 | same | last-four rule |
| 雷纳多 (`leinaduo`) | 75 | 属性复制 / 野蛮横扫 / 魔动能量 / 激光四射 | same | guide (all four) |
| 里奥斯 (`liaosi`) | 35 | 密集火网 / 引诱 / 回击 / 报复 | same | guide (all four) |
| 洛拉斯克 (`luolasike`) | 100 | 巨岩开山击 / 地崩山摧 / 蛮力重击 / 岩石武装 | same | last-four rule |
| 米诺斯 (`minuosi`) | 80 | 魂之审判 / 狂暴烈袭 / 皮毛强化 / 暗之迷宫 | same | guide (all four) |
| 墨杜萨 (`moduosa`) | 80 | 源力气场 / 念力碰撞 / 墨杜萨之力 / 决然一击 | same | rule; 2 named |
| 蘑菇怪 (`moguguai`) | 10 | 针刺 / 撞击 / 毒粉 / 瞪眼 | same | guide (all four) |
| 魔狮迪露 (`moshidilu`) | 50 | 崩山震 / 疯狂慧星 / 镜影术 / 魔眼 | same | guide (all four) |
| 纳多雷 (`naduolei`) | 70 | 属性反转 / 风沙暴击 / 风尘沙暴 / 空掌破 | same | guide (all four) |
| 奈尼芬多 (`nainifenduo`) | 60 | 药剂反噬 / 跳跃践踏 / 寰宇劲乐 / 临危一击 | same | guides (all four) |
| 纳特 (`nate`) | 80 | 爆裂岩浆拳 / 岩浆喷射 / 巨石飞掷 / 火之神力 | same | rule; 3 seen |
| 帕里斯 (`palisi`) | 100 | 深渊之爪 / 兽神之怒 / 狂暴冲击 / 暗流涌动 | same | rule; 3 seen |
| 皮特萨罗 (`pitesaluo`) | 65 | 破空长鸣 / 羽翼利刃 / 怒鸣 / 绝灭射线 | same | guide (all four) |
| 普兰特 (`pulante`) | 80 | 破魂射线 / 灵光缠绕 / 虚空魔刺 / 混沌绿光 | 混沌绿光 / 蚀梦术 / 虚空魔刺 / 灵光缠绕 | logs (all four); guide names 蚀梦术 |
| 瑞尔斯 (`ruiersi`) | 80 | 风林火山 / 势如破竹 / 撼地震击 / 气贯长虹 | same | guide (all four) |
| 塞维尔 (`saiweier`) | 80 | 龙翔天驱 / 不灭意志 / 龙腾裂天震 / 紫光龙鳞镜 | same | rule; 2 named |
| 斯宾塞 (`sibinsai`) | 80 | 暗黑撕裂 / 黑暗迷雾 / 湮灭之球 / 生命汲取 | same | guide (all four) |
| 斯克鲁 (`sikelu`) | 80 | 寒冰破碎拳 / 冰封时刻 / 重拳连击 / 冰之领悟 | same | rule; 1 seen |
| 斯利普 (`silipu`) | 80 | 混沌惩戒 / 震怒之魂 / 展翅冲锋 / 龙怒乾坤 | 龙怒乾坤 / 展翅冲锋 / 混沌惩戒 / 打盹 | video (all four) |
| 斯普林特 (`sipulinte`) | 80 | 紫雾霜冻 / 虚空之身 / 黑冰 / 黑暗遮蔽 | same | Boss form 5022 |
| 斯图尔特 (`situerte`) | 80 | 混元归气斩 / 震慑之光 / 幻舞天尊 / 金刚罩 | same | rule; 3 seen |
| 塔克林 (`takelin`) | 80 | 龙之威仪 / 猛龙陷地步 / 咆哮震九天 / 潜龙伏地啸 | 潜龙伏地啸 / 灰飞烟灭 / 龙之威仪 / 猛龙陷地步 | rule; 2 seen, 1 described |
| 塔西亚 (`taxiya`) | 70 | 魔龙咒 / 龙之结界 / 真龙灭世咒 / 狂化龙舞 | same | rule; 2 seen |
| 提亚斯 (`tiyasi`) | 45 | 飞空斩 / 精神干涉 / 飞空俯冲 / 飞翔之光 | same | guide (all four) |
| 亚伦斯 (`yalunsi`) | 80 | 交错冰柱 | same | Boss form 5012 |
| 伊索里 (`yisuoli`) | 100 | 巨力猛爪击 / 威猛战气 / 狂战之力 / 无畏勇者 | same | rule; 2 seen |
| 尤纳斯 (`younasi`) | 70 | 黑暗之门 / 黑暗之核 / 瞬影烈刃 / 暗影魔球 | same | guide (all four) |

## Types a final set cannot damage

Checked against the 14 common single types with the engine's type chart:

- 纳多雷: only ground attacks, so 0 against flying. The original was the same: 4399 2010-06-05 names all four moves. Its
  属性反转 swaps its type with the foe's, which is the classic answer.
- 厄尔塞拉 before this pass: only light attacks, so 0 against grass. The proposal restores 时空裂痕 (normal special 100).
- No other SPT Boss has a common type it cannot damage.

## Evidence ledger

`build_boss_evidence_v56.py` records the new period sources. Skills that are now `observed` (all four named or logged):
卡伦尼, 克拉尼特（第二战）, 米诺斯, 斯利普, 皮特萨罗, 瑞尔斯, 斯宾塞. Partial claims (`verifiedMoveIds`, status `inferred`) were
added for 肯佩德, 克莱芬 (both fights), 塔克林, 塔西亚, 卡沃尔, 墨杜萨, 库里, 纳特, 帕里斯, 塞维尔, 斯克鲁, 斯图尔特, 伊索里,
德拉萨 and 迪符特 (the last two from an undated 百科 section, marked `verified-secondary`). 肯佩德 and 普兰特 stay `inferred`
because a period source conflicts with part of the set. Member skill statuses: 210 inferred / 32 observed / 5 official before,
203 / 39 / 5 after.

## Open points

- 肯佩德: fear was reported in the debut week (7k7k 2011-01-14, 4399 2011-01-18). In this learnset only 黯然一击 (Lv49) causes
  fear, so 黯然一击 may have held the 黑色漩涡 slot.
- 克拉尼特（第一战）: the fourth slot (进攻意识 kept, 火光四溅 dropped) is not attested. 4399's 火龙红莲击 sentence could be a
  mix-up with the Lv80 PP drain, but the video does not contradict it (the Boss faced only a water pet at Lv50).
- 普兰特: the 4399 guide's 蚀梦术 sentence conflicts with the logs. 破魂射线 is read from one low-resolution screenshot.
- 塔克林: 猛龙陷地步 is named only for the Lv80 story fight; 龙之威仪 is described, not named, by mainland sources.
- 斯利普 and 普兰特 put the player's pet to sleep through a Boss effect (server effect index 107), not a move. Only 普兰特's
  混沌绿光 sleep is modelled.
- 厄尔塞拉: no source says whether the weekday variants had different moves.
- `maps.json` is a post-2013 table; period guides confirm the levels used here wherever they state one.
