# Period evidence for six open battle points (2026-10-24)

Scope: the six open points of `design/notes/handoff-2026-10-22.md` that need period evidence (two Boss points and
the four "unclear, not to change" engine points). Base: `claude/refactor` at 1a6cc11. Nothing in the repository was
changed. Period means 2009-2013 mainland (淘米, 大陆服); later sources are marked as such and only support.

Search notes: Baidu, Sogou, Bing and DuckDuckGo all served captchas or garbled results through the proxy after one or
two queries, so discovery used the WebSearch tool plus direct crawling: all 123 4399 SPT guide pages
(`news.4399.com/seer/spt/`, 2009-2015), the 4399 经验心得 lists for 2012-2013, Wayback CDX listings of 7k7k
(2012-05-18..25, sparse) and of `seer.61.com/dll/`, Baidu Zhidao pages, and three client DLLs decoded offline (no
ActionScript run): the archived **2013-07-06** `RobotAppDLL.swf` and `RobotCoreDLL.swf` (Wayback; the core is
`../analysis/engravings-2013/sources/RobotCoreDLL-20130706-encoded.swf`), the 2013-07-06 skill XML
(`../analysis/engravings-2013/sources/skills-20130706.xml`) and the live `PetFightDLL_201308.swf` (a later build: it
holds 2016 and 2023 classes, so it is not period). No TW-only source was used. The copies of the quoted pages were
kept in the session's scratch folder only; every quote names its URL.

| # | Question | Period evidence | Confidence | Recommendation |
|---|---|---|---|---|
| 1 | 普兰特 and 吸能 | two 4399 guides, 2012-05-18/19 | medium (clears), low (what 吸能 means) | user decision; recommended: status moves also cannot clear or steal its boosts |
| 2 | 幻化之轮's control exception | 7k7k 2013-09-04, 4399 2013-09-27 / 10-04 | high (facts) | no change: the two pets are not in the dex |
| 3 | First-mover KO and turn end | none | none | keep |
| 4 | Simultaneous faints | indirect only (2013 client, 2013 skill texts) | low | keep the outcome; user may relabel as a draw |
| 5 | Multi-hit into a revived life | none | none | keep |
| 6 | Wild monsters fleeing | 7k7k 2010, 4399 2010, Zhidao 2011-2013 | medium | user decision; data below |

---

## 1. 普兰特: is it immune to 吸能, and how?

**Current behaviour.** `data/bosses/boss_spt_pulante.json`: `immune_stage_down {except_attacks: true}` (RULES.md
10.1): a drop from the player's status move, condition or trait is refused; a drop that an attacking skill makes as
its own effect lands. Its innate atk+2 (first-turn phase) can be cleared by any clear, status moves included (净化,
清除术, 时空感应, 燃烧殆尽, 八荒, 高温熔解 are status moves with effect 33). The engine note says "吸能 (drain) is not
modelled beyond stat drops". Boost steals (effect 85: 能力吞噬 20589 status, 乾坤反转 11924 and 圣洁光芒 12263 attacks)
go through `moveStages` (`battle/core/src/scripts/util.ts`, called from `seer-main.ts` `seer_eff_85`), which zeroes the
foe's stages directly and never fires `on_stage_incoming`, so no Boss rule can refuse a steal (see "Incidental" below).

**Period sources.**
- 4399 西野, 2012-05-18, [赛尔号普兰特怎么打](https://news.4399.com/seer/jingyanxinde/201205-18-160964.html), repeated on
  the SPT page of 2012-05-19 ([161367](https://news.4399.com/seer/spt/201205-19-161367.html)):
  「4、海洋之心无效，属性消弱吸能无效（攻击技能附带属性消弱OK）。」 Every plan clears its boost with an attack: 「雷伊先上，消强化」
  with 极光刃 (10823, physical, effect 33).
- 4399 player 银翼, 2012-05-19, [赛尔号普兰特多种打法](https://news.4399.com/seer/jingyanxinde/201205-19-161214.html):
  「海洋之心无效，属性消化无效，攻击消化有效」, 「消化精灵：盖亚或雷伊」, and in the fight
  ([page 2](https://news.4399.com/seer/jingyanxinde/201205-19-161214_2.html)) 「先上消化精灵，必须攻击消化才行」.
  Here 消化 is 消强化 (the 盖亚/雷伊 role), and 属性 is 属性技能 (status move). This statement is new: the Boss data
  cites only 西野's line.
- How 西野 uses 属性消弱 elsewhere: 帕里斯 2012-08-22 「不吃属性消弱技能」, 2013-05-07 「所有属性消弱技能无效」, 2012-06-18
  「凯洛亚用来消弱克伦曼尔的属性」: it means lowering stats, so 「属性消弱」 and 「吸能」 are two separate things in his line.
- 吸能 occurs nowhere else in the 123 4399 SPT pages. In period 4399 usage it otherwise means charging a fusion orb
  (「赛尔号蓝紫色元神珠融合公式_在哪吸能」, [2012-01-20](https://news.4399.com/seer/jingyanxinde/201201-20-139586.html)), not
  a battle effect. No 7k7k, 多玩 or 17173 普兰特 Boss page was found (Wayback has no 7k7k pages for 2012-05-18).
  The 7k7k [普兰特解析](http://news.7k7k.com/content/20120522/173046.html) of 2012-05-22 covers the player's pet.

**Reading.** Taken together: what the player's *status moves* do to its stat stages fails (drops per 西野, clears per
银翼), while the same effects riding on an attack land (both). 吸能 is most likely the boost steal 「吞噬了能力提升效果」
(能力吞噬, effect 85), the only "absorb" effect that touches stages and the obvious alternative to clearing its atk+2.
The weaker reading, HP drain, is unlikely: 普兰特 is grass, 寄生 already fails on grass, and the parenthesis scopes the
sentence to stat effects.

**Recommendation (user decision).** Options: (a) keep as is; (b) also refuse boost clears from status moves, which 银翼
states outright (a `stages_unclearable` parameter mirroring `immune_stage_down`'s `except_attacks`); (c) (b) plus route
the effect-85 steal through the same check, so 能力吞噬 fails on it while 乾坤反转/圣洁光芒 (attacks) still steal.
Recommended: (c), labelled sourced for clears and inferred for 吸能.

**Incidental.** Because `seer_eff_85` bypasses `on_stage_incoming`, the five Bosses with `stages_unclearable`
(白虎's avatars, 暗黑第九门, 暗夜冰狐, 纳特 「无法消强化」, 伊索里) can still have their boosts stolen by 能力吞噬 (伊洛花,
布莱卡恩), 乾坤反转 (卡修/卡修斯) and 圣洁光芒 (奥尔德). That looks like a gap rather than a choice.

## 2. 麒麟·幻化之轮: the exception for control moves

**Current behaviour.** `data/bosses/boss_campaign_qilin_wheel5.json`: `immune_status` (every status fails, control
ones included) and `immune_stage_down`; the engine note records the exception as not encoded.

**Period sources.**
- 7k7k 神佑哥哥, 2013-09-04, [赛尔号麒麟幻化之轮打法攻略](https://news.7k7k.com/51seer/20130904-603192.html):
  「天生攻击+2，不吃弱化和异常（但是火车和米队的控场有效），受到伤害超过1000，我方精灵自动挂掉、、、PP无限，不撸和杰恩斯神马的比例扣血技能依旧没用……麒麟使用强化技能有几率回复1/3血量……麒麟使用“森罗万象”这个技能的时候，我方会在~~好像是3回合吧，每回合扣除200血量」.
  The fight: 「最后就是凯普特收场了……之后米队，盾牌猛击，之前6次就一直用一直用，只要你成功用过6次，那么你就已经胜利了一大半」,
  「在米队准备控场的前一回合被麒麟放了森罗万象」, and 「另一种类似的方法就是用勇气号……火车DD倒是觉得成功率不是很高」.
- What the two moves are (BWIKI, modern data, used only to identify the skills): 米队 = 凯普特 (#1689), 盾牌猛击 (13997):
  120 power, 40% 疲惫 for 2 turns, +10% per use up to 100%, which is why the guide counts six uses. 火车 = 火车侠
  勇气号 (#1657), 旋风破: +2 priority, 40% 害怕, +20% if the target has boosts (麒麟 has atk+2). A later copy of a 2013
  guide (sheitao, posted 2023) reads 「目前麒麟第五封印没有太好的打法，只能通过勇气号有一定的概率获胜……勇气号登场，使用旋风破控场，如果麒麟害怕3回合，则我方使用一次强化技能」.
- 4399, 2013-10-04, [赛尔号麒麟真身怎么打](https://news.4399.com/gonglue/seer/jingyanxinde/305908.html), links the
  2013-09-27 [第六轮回](https://news.4399.com/gonglue/seer/jingyanxinde/304371.html) guide as 「（适合5、6轮回，打法基本相同）」;
  that guide controls with 斯蒂亚's 风神灵动斩: 「上斯蒂亚大招风神灵动斩控场。当麒麟害怕2-3回合时……」. The body's fifth life
  reads 「“幻化”特性，体力：15000 特性效果：伤害超过1千，我方精灵全属性-1，PP无限」.

**Reading.** The status immunity covers the ordinary ailments; the named exceptions are the control riders (疲惫, 害怕)
of specific new attacks: 盾牌猛击, 旋风破, and by 4399's "same method" also 风神灵动斩. No source says which other control
moves pass; it looks like newer effect codes slipping past the immunity, not a stated rule.

**Recommendation.** No change now: 凯普特, 勇气号 and 斯蒂亚 and their moves are not in the remake (1,483 species, highest
id 1499; none of the three skills in `data/skills.json`), so the exception cannot arise. If they are ever added,
encode it per skill (an `except_skills_zh` list on the status immunity). The note should drop 304371 as a direct
wheel-5 source (it is the sixth wheel's guide). Not modelled and outside this question: the 7k7k traits above (a hit
over 1000 kills the attacker, unlimited PP, percentage damage fails, 1/3 heal on its boosts).

## 3. First-mover knockouts and end-of-turn effects

**Current behaviour** (`battle/core/src/engine/turn.ts`). The knocked-out side's queued move is skipped. If the battle
goes on, `endOfTurn` runs: the surviving active takes its poison, burn, freeze and 寄生 ticks and its regeneration and
other `turn_end` hooks; the fainted active is skipped; the 寄生 heal to a fainted foe is 0. Replacements enter after
the turn end (automatic sides) or in the next replacement phase (the player), so they get no tick that turn. If the
knockout ends the battle, there is no turn end.

**Period sources.** None found that state it. Closest: 4399 2009-12-29 魔狮迪露 「先寄生+后毒粉，然后让它被打死或者换皮皮都行，BOSS这时候应该是寄生+中毒，所以被耗死了」
(the Boss's DoT keeps working after the player's pet is knocked out, on later turns). The 2013-07 client packet
(`UseSkillInfo` = `firstAttackInfo` + `secondAttackInfo`, each with `lostHP`, `remainHp`, status bytes) has no separate
turn-end record, so the client cannot tell either.

**Modern only (2024, not period).** 赛学必修2 时点 (Bilibili cv34338437):
「如果在先手方出手流程内出现任意一方死亡时，会自动跳过后手方的出手流程，也就是跳过回合结束时的判定」, and DoT there ticks at
「行动开始时…冻伤烧伤中毒流血被寄生的扣血结算在该节点结算」, not at turn end. 赛学选修5 回合结束 (cv34789644): most turn-end
effects check only their holder's HP; 「先出手防止跳过回合结束」. Under those rules the surviving first mover would still
have taken its DoT (at its action) but no regeneration.

**Recommendation.** Keep. There is no period evidence, and the user's decision (DoT at turn end) differs from the modern
timing anyway.

## 4. Simultaneous faints

**Current behaviour.** `battle/core/src/engine/rules.ts` `checkEnd`: when neither side has a monster left, the player
loses (`finish(b, 1, 'ko')`, comment "simultaneous: the player loses"). The check waits until the whole move has
resolved (`damageDepth`), so recoil, drain, reflection and counters settle first. At turn end the player side ticks
first, so if the player's last monster dies of poison the battle ends before the foe's DoT. When both actives faint
but both sides have reserves, both replace. Pinned by `tools/verification/playtest-v18-regressions.ts` (BUG-002:
`hp 1, userHp 1` gives `winner 1`). RULES.md section 1 does not state the rule (it says only that a side loses when
all its monsters have fainted).

**Period sources (indirect).**
- The archived 2013-07-06 `RobotAppDLL` (the 元素对战 event, `forApp/elementFight.swf`: rounds against others, then a
  Boss) holds 「你第一轮打成平手，不过很遗憾，按照规则，你还是失败了」: the server could return a draw, and in that mode a draw
  counted as the player's failure. The later fight module's
  `FightOverController` maps `FightOverInfo.reason` 3 to 「这场战斗双方打成平手！^_^」 with `isWin = false`.
- Period skill texts avoid a double knockout explicitly, which suggests no general rule for it: 暗影自爆 (effect 112)
  「牺牲全部体力造成对手250~300点伤害，造成致命伤害时，对手剩下1点体力」 and effect 479 「损失自身n点体力，给对手造成m点固定伤害，若自身体力不足200则剩下1点体力」
  (2013-07-06 skill XML).
- 4399 2012-06-02 [博卡特](https://news.4399.com/seer/spt/201206-02-165052.html) (reflects 100%): the plan ends
  「最后上魔焰猩猩，2次觉醒强化后，大招打之，在1000+的伤害。获得博卡特的精元！」. The reflection should kill the attacker,
  but the page does not say it was the last pet, so it proves nothing.

**Modern only.** 赛学必修2: 「双方精灵在先手方出手流程内同时死亡时，获得先手权的一方残留1点体力」, 「双方精灵在后手方出手流程内同时死亡时，未获得先手权的一方残留1点体力」,
and the third death point 「同样具有反同归机制」: the acting side keeps 1 HP.

**Recommendation (user may decide).** Keep the outcome (no win, no rewards). Optionally relabel it a draw (`winner:
null`, as for `turn_cap`), which matches the period server's draw result and its "a draw is still a failure". Do not
adopt the modern 1-HP rule: the 2013 skill texts suggest it did not exist yet.

## 5. Multi-life Boss revives under a multi-hit move

**Current behaviour.** `battle/core/src/engine/move.ts` `strike` hits while `!target.fainted`. A `lives` revive
(`damage.ts` `handleFaint`: full HP and PP, stages reset, statuses cleared) or an `on_faint` `revive` phase (麒麟·重生之轮,
麒麟真身; `effects.ts`) never marks the Boss fainted, so the remaining hits and the move's later effects land on the
new life. The lethal hit's overkill is discarded (damage is capped at current HP). 谱尼真身's lives are separate team
members, so its hits stop at the faint. Applies to 谱尼第五封印「轮回」, 阿克诺亚, 勇者之塔70层, 厄尔塞拉 (Friday) and the two
麒麟 revives.

**Period sources.** None about multi-hits. 4399 2010-10-16
[谱尼第五封印轮回](https://news.4399.com/seer/pngl/201010-16-78982.html): 「有两条命，第一条死掉后第二条自动复活，满血满PP」, with the
plan 「用龙王波之类的小技能把谱尼第一条命打死，保留大招的PP，等第2条命出来后，直接大招打到死」. 4399 2013-09-27 重生之轮:
「第一条命被打死后，会回满血，并且全属性+6」 and 「直接连续两个瞬杀解决战斗」 (each life needs its own knockout). Neither
bears on carried hits. The 2013 packet sends one `lostHP` and `atkTimes` per move, so the client shows one total.

**Recommendation.** Keep.

## 6. Wild monsters fleeing after n turns

**Current behaviour.** Wild monsters never flee: the wild policy (`random`, RULES.md 10.4) picks only usable skills.
尼奥's period flee is approximated by a capture gate (`battle/core/src/capture.ts`, `NIAO_CAPTURE_PARTNERS`, from the
official client).

**Period sources.**

| Species (id) | Flees | Source |
|---|---|---|
| 尼尔 (77) | after 10 turns as of 2010-04 | 7k7k 2010-04-16 [野生精灵大全](https://news.7k7k.com/content/2010/0416/44585.html): 「会变身的超能系精灵。现在改到10回合才逃跑。已经十分罕见。」 |
| | about 8 turns (2012) | [Zhidao 2012-05-27](https://zhidao.baidu.com/question/429505505.html): 「尼尔现在8回合左右后会逃跑，要注意，不能打持久仗。」 |
| | 5 or 10 (2013) | [Zhidao 2013-09-03](https://zhidao.baidu.com/question/588268672.html): 「记住他会5回合逃跑」; 「五回合还是十回合会逃跑」 |
| 该伊 (474) | after 5 turns | 4399 2010-12-07 [仙人掌抓五回合逃跑精灵方法测试](https://news.4399.com/seer/jingyanxinde/201012-07-82196.html) (tested on 该伊); [Zhidao 2011-08-13](https://zhidao.baidu.com/question/304347806.html): 「值得注意的是，该伊5回合后会逃跑。」 |
| 尼奥 (416) | at once unless 尼尔's line is out | 7k7k 2010-08-03 [尼奥捕捉指南](https://news.7k7k.com/content/20100803/11999.html): 「如果你换了别的精灵，尼奥就会马上逃跑的。不换，捉到明天它都不会跑。」; 4399 2010-08-02 likewise |
| 2011 Spring Festival event pets | yes, count unknown | 7k7k 2011-02-09 [防止到手后逃跑](https://news.7k7k.com/content/20110209/62131.html) |
| 布鲁 (108) | unclear | 7k7k 2010-04-16: 「稀有随机逃跑，要带上NONO才能看见」 (may mean leaving the map) |
| 闪光皮皮 (164) | does not flee | 4399 2009-12-04: 「不会逃跑，出现的时间和次数应该是和稀有精灵一样的」 |

How it worked: control statuses stopped the flee, so it is the monster's own action. The 2010 test used 催眠粉 sleep
(「确实，该伊是不会逃跑了」); 7k7k 2011: 「上谱尼或该隐灵魂干涉，疲惫后两个胶囊……如果你的灵魂干涉一旦MISS掉了精灵就会逃跑掉哦」. The battle ends
with no win: the fight module maps `FightOverInfo.reason` 5 to 「很可惜，这只精灵逃跑了！」.

**Recommendation (user decision).** Options: (a) keep (no flee); (b) add a wild flee rule: 该伊 flees on its 5th turn and
尼尔 on its 10th (2010 value; 8 is the 2012 alternative), not while it cannot act, ending the battle with no reward;
(c) also replace 尼奥's capsule gate by an immediate flee. Recommended: (b) with 该伊 5 and 尼尔 10, if the user wants the
period feel; otherwise (a).
