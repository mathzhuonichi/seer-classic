# V45 skill AtkNum audit

The documented conversion of `AtkNum > 1` into repeated full-power hits against one opponent is an import error. `AtkNum` belongs to group-fight targeting metadata; it is not independent evidence for a single-target multi-hit effect. The audit below recorded the finding without changing production data or the battle engine. The repair section records how it was closed.

## Repair (2026-10-19)

**Source.** The pinned moves table was recovered: `resource/config/xml/moves.json` of `Nattsu39/seer_data` at `a00bcdd5800e3bae5df881b4994a170a87541115`, Git blob `03f89e417f0cb114baa6d92372fc79de5ab3ffd8`, SHA-256 `855526c92a09b0fd1b07a8c76cd56c134ae7623bb08523d038fc0e550d3b3268`, cached in the ignored `.cache/seer-data-a00bcdd/`. Of its 26,467 records, 116 carry `AtkNum` (values 2 to 6), 94 of them in the retained skill windows, and 303 carry `SideEffect` 31. No record carries both.

**Classification.** Every one of the 305 retained `multi_hit` ops has exactly one origin:

- 211 come from `SideEffect` 31, and each op's `min`/`max` equals the effect's two arguments. This includes the fixed two-hit 10774, 10802 and 10818 and ranges such as 10238 `[2, 3]`.
- 94 come from `AtkNum` alone (`AtkNum > 1`, no `SideEffect` 31, op `min = max = AtkNum`). They are exactly the 94 suspects counted below. Four of them (20432, 20434, 20440, 20444) are status moves, on which the op never ran.

The source shows none of the 94 as a genuine multi-hit move: none has effect 31, and no effect text or `info` field names a hit count. Names such as 左右开弓 or 群魔乱舞 describe the animation; the table gives them no repeat. No skill outside the 94 needs a change: no retained skill has `AtkNum > 1` without an op, and no effect-31 skill lacks its op.

**Changes.**

- `data/skills.json`: the `multi_hit` op is removed from the 94 skills. Power, accuracy, PP and the other effects are unchanged, so 10175 is power 120 with a 5% paralysis chance, 10961 power 100 with a 10% special-defence drop, and 11657 and 13219 single hits of 105 and 110. The skill importer is still missing, so the data was edited directly. `data/README.md` now states the rule: `multi_hit` comes only from effect 31, and `AtkNum` is not imported.
- Removed workarounds: `unsourcedMultiHits` in `src/domain/challenges/battle-facilities.ts` (elite automatic loadouts now exclude only recovery-only moves), its fixture check and per-build assertions in `elite-roster-v46`, and the multi-hit exclusions of `elite-sub600-audit`. That audit's 12-opponent panel now samples every elite species, so it differs from the panel recorded in [elite-candidates-v45](elite-candidates-v45.md).
- `tools/verification/skill-atknum-v45.mjs` (gate) checks that every `multi_hit` op matches an effect 31 and the reverse, the dealt hits of the four examples (one), the three fixed two-hit skills (two) and 10238 (two or three), and that the Boss AI ranks each of them at power times mean hit count. All its checks fail on the old data.

**Consequences.** The damage probe was already one hit; only the hit count changed, which the Boss policy multiplies in and the trainer planner simulates.

- Boss AI (local scoring), with all status moves used, against a 20000-HP neutral fixture or an ordinary Lv.100 雷伊: 雷伊 (`boss_rei`) leads with 瞬雷天闪 instead of 极电千鸟; 塔克林 (`boss_spt_takelin`, and the third 青龙 guardian) with 潜龙伏地啸 instead of 灰飞烟灭; 巴索尔 with 螺旋光裂斩 instead of 金光迸射; 帕里斯 with 深渊之爪 instead of 兽神之怒; 瑞尔斯 with 风林火山 instead of 撼地震击; 帕罗狄亚 with 无界念光波 instead of 幻刃冲撞; 奇格萨 (Brave trial) with 奔雷 or 幻雷冰袭 instead of 霜寒落雷; 塔西亚 (`boss_spt_taxiya`, and the second 青龙 guardian) with 真龙灭世咒 instead of 魔龙咒. 兰斯特 still prefers 陨石坠落. No Boss file was changed.
- `boss_rei_training3` still requires the final knockout by 极电千鸟, which is now one 120-power hit.
- `trainer_dragon_sanctuary` keeps 真龙灭世咒, now one 150-power hit instead of two.
- Elite automatic loadouts of five original elite species return to their ordinary selection: 塔克林 (274) takes 灰飞烟灭 instead of 锋利之牙; 塔西亚 (391) 真龙灭世咒 and 魔龙咒 instead of 元素喷吐 and 百万吨拳击; 加鲁德 (622) 无影拳 instead of 黑月极闪; 卡迪达克 (886) 螺旋双臂转 instead of 绝地突击; 纳斯琪 (1480) 水流波动 instead of 念光破. Authored elite builds, NPC training profiles and ordinary random loadouts are unchanged. Two authored builds avoided a suspect import ([classic-pvp-sources-v46](classic-pvp-sources-v46.md)): 加布 (826) omits 目空一切 (11907) and 杰西卡 (432) omits 开天辟地 (11084). Both are now ordinary single hits; the builds were not revisited.
- Engravings 20031, 20077, 20160, 20207 and 20307 apply to repaired skills; none of them edits a hit count.

## Evidence and limits

The [official RobotCoreDLL](https://seer.61.com/dll/RobotCoreDLL.swf), decoded from the retained official download, exposes `AtkNum` through `SkillXMLInfo.getGpFtSkillAtkNum` (exported source lines 697-717). It returns that field or one by default, next to the group-fight `AtkType` and animation `Url` accessors. The method name and context establish that this is group-fight metadata.

The [period Todd skill table](https://news.4399.com/seer/tujian/203233.htm) identifies skill 13219, Thunderstorm, as power 110, PP 10, and able to affect five targets in group battles. This supplies an explicit target-count interpretation for the same five-count value. The [official Rei table](https://seer.61.com/main/spirit/70.html) lists skill 10175 as power 120 and PP 5; the [2012 skill guide](https://news.7k7k.com/content/20120928/141.html) describes its additional effect as a 5% paralysis chance, with no five-hit effect.

The [official GroupFightDLL](https://seer.61.com/dll/GroupFightDLL.swf) was also inspected. `group-targeted/scripts/com/robot/groupFight/control/SkillActionPase.as:100` groups multiple server result records from the same attacking position as a mass attack. `group-targeted/scripts/com/robot/groupFight/control/skill/SkillPlayInfo.as:22` resolves each record's defender by its own side and position. The client consumes server-calculated results rather than calculating damage as power times `AtkNum`.

The current group-fight DLL does not call `getGpFtSkillAtkNum` in the 71 exported group-fight classes. The server target-cap implementation was not obtained. Therefore, this audit does not claim to recover that exact execution path, historical per-target damage scaling, or a cryptographically dated 2012 binary. The source semantics plus the period target description are sufficient to reject the blanket single-target hit conversion.

## Exact repository path

- `data/README.md:54` documents the problematic import rule: fixed `AtkNum` values become `multi_hit {min=max}`.
- `data/skills.json` retains the resulting effects, and `data/gamedata.json` packages the runtime catalog.
- `battle/core/src/battle.ts:650-672` reads `multi_hit`, then calls `calcAttack` with the unchanged skill once per hit. Thus an erroneous five-count record causes up to five full-power attacks against the same target, subject to fainting and immunity.
- `battle/core/src/tactics.ts:127-130` multiplies estimated damage by mean hit count, so the same import error also affects AI move scoring and candidate evaluation.

The README names `data/_build/` as the original generator location, but that directory and the skill importer are absent from both the recovered working tree and original V30 source tree. No original importer filename or line can be verified. The documented rule, its output, and its runtime consumers are the precise available chain; a future repair must restore or replace the missing generator explicitly.

| Skill ID | Current power | Imported hit count | Independent retained effect |
|---:|---:|---:|---|
| 10175 | 120 | 5 | 5% paralysis; no effect 31 |
| 10961 | 100 | 3 | 10% special-defence reduction; no effect 31 |
| 11657 | 105 | 5 | None |
| 13219 | 110 | 5 | None |

## Retained-data count

The read-only count covers all 5,325 retained skills. There are 305 skills with one `multi_hit` op each. Of these, 211 carry a separate original `seer_effects` entry with effect ID 31; in all 211, its arguments exactly match the converted minimum and maximum hit count. This includes 208 variable-count skills and three fixed two-hit skills: IDs 10774, 10802, and 10818, each retaining effect 31 with arguments `[2, 2]`. These records must not be removed merely because their hit count is fixed.

The remaining 94 records all have fixed counts and no retained effect 31. They are the bounded suspect set for a source-backed follow-up, not 94 individually proven errors. The broad conservative upper bound from fixed counts alone is 97. The pinned original `moves` table was not retained locally and was not downloaded for this count, so the exact `AtkNum`-derived subset remains unresolved. Source-effect matches distinguish provenance; they do not certify every effect-31 skill's full mechanics.

## Source pins and reproducibility

The original catalog provenance identifies `Nattsu39/seer_data` commit `a00bcdd5800e3bae5df881b4994a170a87541115`. Its raw moves table is not part of this audit's local evidence. The official DLLs and exported inspection files are pinned below. Paths are relative to the repository root; generated evidence under `artifacts/` is ignored.

| Artifact | Local path | SHA-256 |
|---|---|---|
| Official core download | `../analysis/codex-takeover-2026-10-14/provenance/RobotCoreDLL.download.swf` | `4fdde653317cf81ad34bcd87e0a4e01c2f518bfe4cfadcc396bbad6b698b1e1e` |
| Decoded official core | `../analysis/codex-takeover-2026-10-14/provenance/RobotCoreDLL.decoded.swf` | `e97b3f53a5f0242e89018bee91be508dc8fc6f41ae5e4bc5818d8f5161e81c42` |
| Official group-fight download | `artifacts/skill-atknum-audit/GroupFightDLL.download.swf` | `3b77ce1bcf1e482e190f88c8969bbf58f81647de4701fbcee90812d8cc65a384` |
| Exported SkillXMLInfo | `artifacts/skill-atknum-audit/scripts/com/robot/core/config/xml/SkillXMLInfo.as` | `40f7237c45628e2a9904518c7159412ed0131564eafd5b23ef48538ddd99ed42` |
| Reviewed runtime skill catalog | `data/skills.json` | `59d08e47696c79ba6eedc96d9339f1e674adad904856092ff206b82dbfc4f2a2` |

`artifacts/skill-atknum-audit/findings.json` contains the four complete skill examples and source hashes. `retained-skills-count.json` records all 305 multi-hit IDs, the 94 suspect IDs, and the three independently effect-backed fixed-count examples. The targeted group-fight export completed for all 71 classes. An initial broader export included unrelated application classes and was interrupted; it is not used as complete evidence.

## Bounded follow-up

A repair should recover the pinned moves/effect tables, identify the exact `AtkNum`-only conversions, retain independently supported multi-hit effects, update the recovered generator and its mapping documentation, and regenerate both skill catalogs. Regression checks should cover the four examples above, the three legitimate fixed two-hit records, and variable effect-31 ranges, in both actual damage and AI estimates. NPC teams and skill recommendations should then be re-evaluated against corrected data.

The V45 candidate audit excludes all `multi_hit` moves from its shortlisted four-move plans and benchmark opponents. That avoids relying on this known import problem for those comparisons. It does not establish complete game balance, validate other imported effects, or prove that every candidate is competitive across full teams, items, boss rules, or untested matchups.
