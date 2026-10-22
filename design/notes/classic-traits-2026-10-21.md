# Classic trait fixes and the damage/evasion rules beside them (2026-10-21)

Status: current. Implemented on branch `fix/engine-b`. Code: `src/domain/traits.ts` (traits), `battle/core/src/engine/damage.ts`,
`move.ts`, `when.ts`, `battle/core/src/scripts/builders.ts`; rules: `battle/RULES.md` 4 (step 3) and 5.

## Why

Two 赛学机制论 audits (Bilibili readlist rl826604) compared the engine with modern write-ups of the classic mechanics. On
2026-10-21 the user approved five trait fixes and the engine fixes "翻倍改伤害" and "闪避类护盾挡不住必中", and rejected two
others (精准/回避 multiplicative; a 强攻 miss also costing HP), which stay as they are. The project rule is to install only
mechanics of the 2009–2013 mainland era; a period source beats a modern article. Where no period source exists, the modern
article is the evidence and the user's decision settles it. The quotes below are those collected by the audit.

Sources, short names used below:

- **2010 client**: the mid-2010 client pet-effect file, mirrored as BaiSugar/kose_seer `config/data/xml/skill_effects.xml`. It
  defines effect ids up to 40, so Eids 61 and 64 are not in it.
- **必修1**: 赛学机制论 必修1 基础知识, Bilibili cv34339526 (2024).
- **必修6**: 赛学机制论 必修6 精灵特性, Bilibili cv25902667.
- **选修1**: 赛学机制论 选修1 增伤, Bilibili cv34369402.
- **选修9**: 赛学机制论 选修9 免死检测, Bilibili cv35782914.

## Engine fixes in this unit

### 先出手/后出手 ×2 doubles damage (effects 40/30)

- Sources: 选修1 states that the early 「先出手威力翻倍」 effects are a separate damage multiplier, not a power change. No period
  counter-evidence. Effects 40 and 30 are 2009 templates.
- Before: the 102 skills (69 with effect 40, 33 with effect 30) carried `power_if {when: {acted_first}, multiplier: 2}`, so the
  power doubled before the base floor: `floor(2Q) + 2` instead of `2 × (floor(Q) + 2)`.
- Now: the op is `damage_if` (`data/skills.json`, only those 102 op names changed), a modifier op read by `calcAttack`, which
  multiplies it into the damage before burn, the condition multipliers and the single floor (RULES.md 5, `first`). The read-only
  probe, the AI estimate and the journal observer follow without further change, and `Attack.base` and `Attack.power` are
  unchanged.
- Blast radius: 1 to 2 more base points when the condition holds, about 1 to 12 HP after STAB, type, roll and crit. At level 50
  with equal stats and the maximum roll, 疾风追击 (power 70) deals 96 instead of 94 and 冲撞 (power 45) 63 instead of 61. 434 of the
  1483 species learn at least one of the skills; Bosses: 勇者之塔 floors 57, 58 and 67; trainers: the fusion specialists (风之羽翼).

### Evasion shields do not stop 必中 moves (effects 78/106); 圣洁 does

- Sources: no period source. 必修1: 「闪避：非必中技能必定miss（对必中技能不影响）」. Effects 78 and 106 carry exactly the
  闪避 wording 「n回合内物理/特殊攻击对自身必定miss」. The classic content already lets 必中 skills through 谱尼's 虚无 and 战虎's
  「消强化技能MISS」.
- 必中 is one notion in the engine: `MoveCtx.sureHit`, set when the move starts, is true when the skill's accuracy is `null`
  or the user has a force-hit `modify_accuracy` hook (`cond_sure_hit`, from 15 skills, or the Boss rule `always_hit` from
  `campaign-rules.ts`, on 6 encounters). The accuracy roll and every evasion reads it. The narrower reading (only `accuracy: null`) was considered
  and not chosen: the force-hit hooks say 「必定命中」 too.
- Now: the `evade` builder spares a sure hit unless `sureHitToo`; effects 78 (7 skills: 暗影护盾, 黑水护体, 虚空之身, 魂守干涉,
  急速回旋, 潜行, 柔化) and 106 (6 skills: 黑暗遮蔽, 海洋之盾, 水晶屏障, 冰棱镜, 暗之壁垒, 暴风之盾) use the default. 圣洁 (effect 86,
  status moves) passes `sureHitToo` and still stops 必中 status moves (user decision 2026-10-21).
- Blast radius: 175 attack skills have `accuracy: null`. 斯普林特 (`boss_spt_sipulinte`, 虚空之身 and 黑暗遮蔽) no longer evades
  the player's 必中 attacks, and `always_hit` Bosses now get through the player's 暗影护盾-type shields. The period guides that
  alternate 暗影护盾 against 雷伊, 盖亚 and 迪符特 are unaffected: those Bosses' attacks have accuracy 100 or 95.

## Trait fixes

Traits are permanent `trait-<id>` conditions (`battle-setup.ts`); each fix is in the `EFFECTS` table of `traits.ts`, keyed by the
original effect id (Eid), and every fix's note is appended to the trait card's description.

### 免爆 (1063, Eid 64): a critical hit has a 1/16 chance to deal 0

- Sources: not in the 2010 client. 必修6: 「免爆实际为当回合免疫受到的暴击伤害（对暴击进行一个挡伤效果），而不是降低暴击概率」,
  with 0 to 5 star rates 6.25 / 7.5 / 8.8 / 10 / 12 / 14 %.
- Before: it lowered the foe's crit rate by one sixteenth, so an ordinary 1/16 move never crit against it.
- Now: a `modify_damage_final` script zeroes a critical hit from the foe's attack with chance `EID64_CHANCE` = 100/16 (the zero
  star). It draws once per critical hit, only on real hits; the probe skips final scripts. A zeroed hit dealt nothing, so it does
  not clear the holder's defence boost, and the skill's effects still apply. The crit rate is the ordinary one again. The
  `modify_crit_rate_taken` hook point, its dispatch in `damage.ts` and `HookExtras.rate` had no other user and were deleted.
- Blast radius: holders take ordinary crits again. Hits on them become opaque to the journal (a defender final script), like
  坚硬 and 吸收. The log reads 「受到 0 点伤害，致命一击！」.

### 反击类 (1041 反击, 1042 抵抗, 1043 反攻, 1044 坚韧, 1045 借风; Eid 35): any foe move that reaches the holder

- Sources: 2010 client: 「受到任何攻击时有 n% 几率使 自身 battle_lv 提升1个等级」; in Seer, 攻击 covers physical, special and
  属性攻击. 必修6: 「①在技能命中时之前赋予能力提升，因此会被对方一些技能带有消强，吸强，反强补偿影响 ②属性技能可以触发该特性」.
- Before: an `on_hurt` script, so only attack damage above 0 triggered it.
- Now: a new hook point `on_foe_hit`, fired once per move for the holder when the foe's move targets and reaches it, after
  accuracy, evasion and blocks and before its damage and effects (RULES.md 4). It fires for physical, special and status moves,
  once for a multi-hit move, and even when the attack then proves type-immune; it does not fire on a miss, an evasion, a block or
  protection, a negation, or a self-targeting move. The raise lands before the hit, so 抵抗 and 坚韧 soften the triggering hit, and
  a clearing effect of the same move removes the raise, as 必修6 describes. The point is not one the journal reads.
- Blast radius: the 5% draw moves from "took attack damage" to "was reached by a foe move", so RNG streams change in battles
  where the player's monster has one of these traits (the facility and observe corpora carry no traits).

### 回神 (1028, Eid 33): 0 HP included, foe-move damage only

- Sources: 2010 client: 「精灵体力降低到 1/n 时有 m% 几率体力回满」. 必修6: 「体力降低到1/8时有3%几率体力回满（0体力也可以触发）
  …①与顽强同理，仅在战斗阶段触发，若是受到回合结束后的致死伤害，则会直接被击杀」. 选修9 checks it at 「对方出手流程结束时」.
- Before: any damage at or below 1/8 except to 0 HP (poison, burn, freeze and leech ticks, turn-end damage, recoil, self-costs).
- Now: damage from the foe's skill use only (`fromFoeMove`: a source on the other side, a skill, and not true damage). That covers
  the foe's hits and its move's own fixed or percent damage, and leaves out status ticks (no source), turn-end damage such as
  `foeDamageEachTurn` (no skill), reflections, recoil and self-costs, and true damage: the `ohko` op, the Boss forced execution
  and 镇魂歌. At 0 HP the heal prevents the knockout, because `on_hurt` runs before the faint check; `block_heal` still lets it
  faint.
- Decision: true damage stays out so that 回神 never undoes a 秒杀 or a Boss execution, which are encounter or effect guarantees.
- Blast radius: low. The battle shows HP 0, then a full heal.

### 单属性增伤 (1006 叶绿 to 1020 威严; Eid 28): no bonus for dual-type skills

- Sources: 2010 client: 「XX系技能伤害增加n% / Args: a1: mon_type(1,2,3, ...)」, a single type id; the official type table gives
  dual skills their own composite ids. 必修6: 「对指定单属性有效，双属性无效」 and 「实际上是某单属性技能造成的伤害额外提升n%」,
  which matches the damage (not power) multiplier the remake already uses.
- Before: the recovered hook's `skill_type` matched either component, so all 294 dual-type attacks got +5% from either
  component's trait.
- Now: `aliasTypes` rewrites the recovered `skill_type` to the new `when` key `skill_type_exact` (type identity: a dual skill is
  `a+b`, so it equals only the same pair). `skill_type` keeps its meaning for conditions and tests. `data/traits.json` and
  `build_traits.py` keep the recovered records; the card gets 「（双属性技能不加成）」.
- Blast radius: low; holders using dual-type skills lose those +5%.

### 虚无 (1060, Eid 61): dodges the foe's attacking skills, never damage over time

- Sources: not in the 2010 client. 必修6: 「虚无特性本质为有概率闪避对手攻击技能，而不是挡伤」. Its zero-star Args value 1% against
  the description's 3% is unsettled; the rate stays 3% (`EID61_CHANCE`).
- Before: a `modify_damage_final` script zeroed any damage instance (attacks, fixed, percent, ticks, recoil) at 3% each, and the
  move still counted as a hit.
- Now: a `before_hit` script evades the foe's physical and special moves that target the holder and passed accuracy, as a real
  miss: no damage and no effects, and `on_miss` / `on_foe_miss` fire. 必中 attacks (`ctx.sureHit`) are not dodged, as with the
  shields above. Damage over time, fixed, percent and self damage are never blocked. Bosses that ignore player protections ignore
  it too.
- Decision: the 2023 PVE 百科 says that against a 必中 attack 虚无 zeroes the damage instead. That needs a second hook and is not
  in the approved wording 「只闪避攻击技能」, so 虚无 has no damage-zeroing fallback.

## Verification

- `battle/core/src/scripts/scripts.test.mjs`: 78 and 106 evade non-必中 attacks of their category and let `accuracy: null` and
  `cond_sure_hit` attacks through; 86 still makes a 必中 status move miss.
- `tools/verification/battle-v3.ts`: 免爆 zeroes a forced crit and keeps the defence boost, lets it through when the chance fails,
  and no longer suppresses a 1/16 crit; 反击 rises before a status move's effect, 抵抗's raise is in the damage-time snapshot, and
  a miss, a self-targeting move, protection and 物理闪避 give no raise; 回神 heals at 0 HP without a faint, not after a poison tick,
  recoil, a self-cost or an ohko; 虚无 dodges an accuracy-95 attack with its effects, not a 必中 attack or a status move, and a
  poison tick deals its 1/8.
- `tools/verification/damage-audit.ts`: 疾风追击 and 冲撞 double the floored damage with power and base unchanged; every effect
  40/30 skill has exactly one `damage_if` (102); 叶绿 boosts grass but not grass_psychic or psychic; `skill_type_exact` with a
  composite matches only that pair.
- `tools/verification/holder-ownership-v47.mjs`: the 免爆 final hook and the 反击 `on_foe_hit` raise belong to the holder only.
