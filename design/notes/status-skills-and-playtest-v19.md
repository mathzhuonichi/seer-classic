# Status-skill symbols and revision 18 playtest follow-up

## Delivered changes

Ordinary status moves now display the original six-point property symbol in battle skill cards, battle details and learned-skill lists. Equipped-slot labels also identify them as property moves. Creature element icons and physical/special attack icons retain their existing artwork. The selection helper preserves every explicitly non-normal status type, as requested. This is a presentation change; no element, damage category or combat calculation is changed by icon selection.

## Source audit and retained exceptions

The cached official [RobotCoreDLL](https://seer.61.com/dll/RobotCoreDLL.swf), decoded in the earlier dual-type audit, contains all 5,325 retained skill IDs. All 1,850 retained status skills have source Type 8 (normal); there are zero explicitly typed exceptions in the current catalog. The source `NormalSkillBtn.init` chooses `Icon_PetType_prop` for category 4. The existing offline `/type-icons/prop.svg` is that original symbol, with SHA-256 `c8a4c4125f2a7b2937683b79d6f111a9c421f39a82f935c23c484c1a39d67561`. No replacement artwork was generated.

The larger current official configuration contains the following 19 category-4 records with non-normal types, including one explicitly named test record. All are outside the retained catalog and were neither imported nor modified. Source type names and skill names below are preserved verbatim. This audit concerns the cached official client, not an authenticated pre-2013 server build.

| Source ID | Original skill name | Source element |
|---|---|---|
| 24071 | 至阳之盾 | 飞行 |
| 24072 | 神炎护体 | 飞行 |
| 24073 | 圣火之甲 | 飞行 |
| 26254 | 魔王契约 | 邪灵 神秘 |
| 26255 | 虚无异界 | 邪灵 神秘 |
| 26976 | 汲存八荒 | 混沌 |
| 27126 | 烟雨青花 | 战斗 自然 |
| 27127 | 升临恩泽 | 圣灵 光 |
| 27128 | 禁灵领域 | 圣灵 光 |
| 27129 | 蔷薇信风 | 暗影 神秘 |
| 27130 | 繁郁相簇 | 暗影 神秘 |
| 27131 | 自然清气 | 自然 神秘 |
| 27132 | 归来无声 | 自然 神秘 |
| 27133 | 去亦无息 | 自然 神秘 |
| 27137 | 春溪清冽 | 战斗 自然 |
| 27183 | 飞星之助 | 电 |
| 28810 | 魂·天忤太虚 | 神秘 轮回 |
| 40001 | 浓尘翻涌 | 王 |
| 40006 | 测试技能4 | 王 |

The source/output audit is retained under ignored `artifacts/playtest-v19/status-icon-source-audit.json`. The source move-table SHA-256 is `c6043808a53cc041b52a999a139aedc4c7063e25620e773f7fd096f4550b7347`; see [dual-type-mechanics-audit.md](dual-type-mechanics-audit.md) for extraction provenance.

## Playtest report triage

The user supplied `Seer-Classic-v18-试玩报告.docx` from Library. Its complete document text, including table cells, was read from the provided temporary preview before that preview expired. It reports a Linux/PySide6 playtest through 20:47 UTC on 3 October 2026, seven completed Puni seals and an uncompleted six-life body. Its findings are external observations; the report alone does not establish a source-level diagnosis. The attached checkpoint is mentioned in the report but was not supplied or imported here.

| Report item | Local finding and disposition |
|---|---|
| BUG-001: grass target accepts Leech Seed | Confirmed in the engine: no grass immunity check existed. Status application now rejects leech on any target with a grass component. Non-grass application and HP-limited drain remain intact. |
| BUG-002: lethal Flare Collision skips recoil | Confirmed: the first lethal damage finalized the battle before the move effect list. Result settlement now encloses the whole move, including recoil and drain. Simultaneous knockouts retain the existing player-loss rule. |
| UX-003: potion defaults to the former lead | Confirmed: target state was initialized only once. It now resets when the active creature changes. Descriptions say selected creature. The engine excludes full-HP, full-PP and ineffective status cures from legal item targets; the battle UI disables ineffective use and explains it. No item or turn is consumed by rejected commands. |
| CONTENT-004: Icarne advice names unavailable moves | Confirmed against the actual learnset. Hamo advice now uses Lisa's learnable Flower and Grass Protection and recovery supplies. Lisa already has a fusion acquisition route. Full victory with that strategy was not replayed. |
| UX-006: energy-bead conflict exposes English | The game adapter now names the active bead, remaining battles, replacement restriction and lack of item consumption in Chinese. Item descriptions explain one bead per creature, expiry and the existing battle countdown. The underlying mutual-exclusion rule is unchanged. |
| OBS-007: Puni rejects self boosts/protection | Confirmed scope error in both encounter immunity scripts. They now require a move targeting the condition holder. All 28 retained pure effect-52 protection moves, including Avoidance, were incorrectly marked foe-targeted despite installing protection on the user; both synchronized catalogs now mark them self-targeted. The complete six-life initialization still keeps rules local to each member. |
| OBS-008: Dragon King Shattering Array fatigue duration | Its retained operation and official effect-22 argument both specify one turn. The skill description now agrees with that field. There is no encounter-specific reduction responsible for the reported one-turn result. |
| OBS-005: Photosynthesis heals twice | Preserved pending historical/mode calibration. Official skill 20009 contains both effect 43 with divisor 2 and effect 201 with divisor 3. The engine executes both, matching the current imported description. This does not prove the classic single-opponent mode should apply the group-healing extension. |
| Normal restocking | Confirmed content gap in the current application: inventory consumes supplies but there is no normal purchasing/restocking action. Recovery restores team HP/PP without replenishing inventory. No unsupported prices or new economy were invented in this patch. |
| Qt responsiveness and accessibility warnings | Remain target-environment observations. No Linux/PySide6 session was run here, so this patch makes no compatibility claim about that wrapper. |

The original [4399 seventh-seal guide](https://news.4399.com/seer/zenmezhua/201103-16-89472.html) explicitly uses self-boosting and Avoidance. The author's [2011 body playthrough](https://news.4399.com/seer/jingyanxinde/201102-09-86081.html) also uses those moves on the first life. These period reports corroborate the targeting correction; they are not recovered server code and do not settle every body statistic. The [2012 Hamo analysis](https://m.news.4399.com/seer/jingyanxinde/201206-16-168856.html) describes one-turn fatigue, agreeing with the stored effect argument. Other encounter calibrations remain outside this change.

## Verification and delivery boundary

- `tools/verification/playtest-v18-regressions.ts` passed through Vite SSR with actual retained skill records and the actual Puni seal/body encounters. It covers grass and dual-grass immunity, valid leech and capped drain, ordinary/lethal recoil, simultaneous knockouts, replacement enemies, ineffective potion rejection, Puni self boosts/healing/protection, continued enemy-targeting restrictions, energy-bead messages and the corrected strategy learnset.
- The affected existing `battle-v3` and `campaign-mechanics` checks passed. Their scope includes member-local rules, six-member replacement, HP/PP/status carry, revival, rewards, retreat, bench-item targets and ordinary critical hits. The existing damage audit passed all 28 cases.
- `npm run build` passed, including TypeScript and a fresh production browser export. Vite reports the existing large catalog chunk advisory. No native Tauri package was built.
- Browser checks use an independent test origin; the user's port-1425 save was not imported or changed. The learned-skill list and exported battle card both displayed the original property symbol for Withdraw, with a loaded `prop.svg`; Tackle retained its normal-element symbol. Screenshots are retained in `artifacts/playtest-v19/skill-management.png` and `battle-status-icon.png`.
- Revision 19 is a separate ZIP under ignored `releases/`; revision 18 remains unchanged. Archive extraction and all 1,857 manifest file hashes passed. All 1,854 exported game files were independently fetched over HTTP and matched their manifest hashes.
- In the exported browser game, switching from the healthy grass starter to the injured fire starter reset the potion target to the current combatant. Selecting the full-HP former lead displayed a Chinese explanation and disabled Use. Screenshot: `artifacts/playtest-v19/ineffective-potion.png`.
- No complete six-life gameplay victory, final Puni essence claim, supplied checkpoint import or target Linux session was performed. Resume those checks from the report's 7/8 checkpoint after the target receives revision 19.

Package archive SHA-256: `ee13b3226a6a5a36463310b65273087bae4fd3bac7d3c2d9da9691f51bf432f5`. Content identity: `21ab636812e75370580846053d59465a1ec8bf002d86f23e0249381c6c3fee94`. Detailed evidence is under ignored `artifacts/playtest-v19/` and `releases/seer-classic-linux-playtest-v19-verification.json`.
