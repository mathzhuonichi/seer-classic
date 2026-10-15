# Seer Classic catalog (data/)

Owner: the "Monster and boss catalog" thread. Shapes follow `design/foundation.md` v0.2.
`natures.json`, `growth.json` and `potential.json` belong to the raising thread.

## Files

| path | what |
|---|---|
| `monsters/NNNN.json` | 1,483 species, one file each, id = original 精灵 number |
| `skills.json` | 5,325 skills (array), id = original skill id |
| `conditions.json` | timed conditions referenced by skill `add_condition` ops |
| `types.json` | 18 base types and 29 composite mappings; all 324 single-type coefficients match the official Unity configuration (see `_note`) |
| `bosses/*.json` | PvE boss encounters (section 7 shape + `capture`, `strategy_notes`, `engine_notes`, `confidence`, `sources`) |
| `bosses/_modes_tower.md` | rules of the repeatable challenge modes |
| `scripts_needed.md` | skill effects that need an engine script, with original template text |
| `items.json` | 51 pre-2013 items: capsules, HP/PP potions, 能量珠, 学习力/性格/level items, EXP/EV boosters (`_build/build_items.py`) |
| `catalog_index.json` | one-line index of every species (name, types, stat total, evolutions, tags) |
| `_build/` | the scripts that generated monsters/skills/conditions/types |

## Source

Monsters, skills and effect templates come from the 赛尔号 client config tables
(`monsters`, `moves`, `effectInfo`, `skillTypes`, `SptPetInfo`) as dumped by
github.com/Nattsu39/seer_data (commit a00bcdd). That dump is the modern client, but it
keeps the Flash-era ids, and the classic data is still in it:

- **Stats check:** the base-stat totals of 16 classic monsters (雷伊, 盖亚, 卡修斯, 布莱克,
  谱尼, 魔狮迪露, 哈莫雷特, 里奥斯, 阿克希亚, 提亚斯, 布布花, 伊优, 烈焰猩猩, 尤纳斯, 纳多雷,
  雷纳多) all match a 种族值 table published 2011-12-19 (blog.sina.com.cn/s/blog_9a2f1f160100w2qj.html).
- **Learnset check:** 雷伊's level-up list (抓 … 极电千鸟 Lv64, 瞬雷天闪 Lv70) matches the classic game.

## Pre-2013 cutoff

- **Monsters:** id ≤ 1487, plus 1498/1499 (银角, dated Dec 2012, tagged `boundary_2013`).
  The boundary comes from 4399's guide dates: #1486 is Dec 2012, #1488 is Jan 2013.
- **Skills:** ids 10001–13443 (attacks) and 20001–21828 (status). Skill ids were issued
  in release order, so these windows end exactly where the first 2013 monster's skills begin.
  Learnset entries outside the windows were added after 2012 and are dropped (5 entries,
  on 英卡洛斯 and 萨格罗斯), as are ExtraMoves/第五技能.

Each species also carries `existed_by` (YYYY-MM): the earliest 4399 guide date for that
id or any later id, i.e. a month by which the monster certainly existed. All 1,483 are
2012-12 or earlier.

## Mapping notes

- `ev_yield` = original YieldingEV (order hp atk def spa spd spe). `growth` = original
  GrowthType mapped to the raising curves (0 medium, 2 fluctuating, 3 medium_slow,
  4 medium, 5 slow). `growth_type` keeps the raw value; GrowthType 4 is Pokémon's "fast"
  slot, which raising has no curve for yet.
- `crit_rate` = original CritRate (x/16, default 1). `accuracy: null` = original 必中.
  Fixed hit counts (AtkNum) become `multi_hit {min=max}`.
- Every skill keeps `seer_effects` (original effect id + args) next to the converted
  `effects`, so any op mapping can be re-derived. 490 ops (on 484 skills) are
  `script` ops named `seer_eff_<n>`; `scripts_needed.md` lists each with its text.
  Ops marked `"inferred": true` come from Flash effects with no template text
  (21 counter, 41 fire resistance, 42 charge, 31 without args), read from the skill text.
- Learnset entries with `"method": "special"` were task-taught in Flash (雷伊特训:
  极光刃, 元气电光球, 雷神天明闪, 雷神觉醒); the modern client moved them to later forms.

## Items

From the client's 精灵道具 table (ids 3000xx). Capsules carry `capture_multiplier` (original
Bonus; 256 = always catches = `null`). Raising items use the raising SPEC ops plus three new
ones: `boost` (EXP/学习力 multiplier for N battles), `energy_bead` (能量珠: flat stat or crit
bonus for N PvE battles) and a negative `levels` for 降级秘药. Items marked `era: "uncertain"`
(升级秘药, 性格转换剂) could not be dated to before 2013 but are kept for the raising rules.
The initial recovered item table omitted fusion spirit beads, traits, engravings,
automation and event items. The current application supplies spirit beads at
runtime through `src/progression/fusion.ts`, reusing essence hatching with the
user-approved material-free rules. Traits and engraving interfaces are provided
by the application mechanics modules rather than this original item table.
The initial recovered bundle omitted conditional evolution tables. The official retained
`EvolveXMLInfo` table does contain item-triggered evolutions, including branch choices.
Revisions 33 through 35 apply the approved mechanical, branch and special-evolution simplification through
`tools/assets/build_evolution_rules.py`; original trigger flags and item costs remain
recorded in `data/evolution-rules.json`. Meaningful source levels take priority. Revision 35 replaces the three original
item-trigger Lv.1 gates with explicit remake Lv.60 thresholds, preserving the raw
values in provenance, and makes all 32 special transitions manual. Missing target-specific
levels use documented remake thresholds of 60, then 70 and 80 for later special stages.
These forward evolution rules are separate from the ordinary item table; they do not
claim that the original game offered material-free level evolution.

## Known gaps

- `obtain` is inferred from catch rate (wild if > 0, `boss` for SPT bosses, else `event`).
- `desc` (flavour text) is not in the source tables; skills carry effect text only.
- Other task-taught skills of legendary monsters may still be missing; boss research
  adds them where found.
- All retained single-type coefficients have been checked against the official Unity
  configuration. The current official coefficients take precedence by user request;
  their pre-2013 dates and the exact server-side dual-type arithmetic remain unverified.
