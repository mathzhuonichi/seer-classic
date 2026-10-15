# V45 skill AtkNum audit

The documented conversion of `AtkNum > 1` into repeated full-power hits against one opponent is an import error. `AtkNum` belongs to group-fight targeting metadata; it is not independent evidence for a single-target multi-hit effect. This audit records the finding without changing production data or the battle engine.

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
