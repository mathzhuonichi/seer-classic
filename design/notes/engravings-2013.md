# Engravings (刻印) through 2013

The user decided on 2026-10-15 to install every 2013 engraving whose bound species is in the catalog and to exclude the 2014 universal engravings (全能刻印). `data/engravings.json` holds 546 engravings: 147 ability engravings (能力刻印) and 399 skill engravings (技能刻印). This includes 10157 炽焰强化刻印 (炽焰之刃 #881), which falls between 2013-12-28 and 2014-01-08; it is an old-style ability engraving and its species is in the catalog.

## Source

`~/.venvs/base/bin/python -I tools/assets/build_engravings.py` regenerates the file from the research dataset `../analysis/engravings-2013/engravings-2013.json`. That folder's README records the method and keeps the evidence files.

- 534 rows come from `CountermarkXMLInfo` in the official `RobotCoreDLL.swf` archived on 2013-07-06. This is the only archived core DLL. The 2013 `DLLLoader` decodes it by skipping 7 bytes and zlib-uncompressing the rest.
- 12 rows were added between July and December 2013. They are dated by ID order against 4399 species dates, and their values come from the current H5 table because no 2013 copy is archived.
- Engravings existed by 2011 (7k7k articles from March and May 2011). The earlier "no 刻印" scope notes were wrong.
- Universal engravings started in mid-2014: the icon of the first one, 40001 睿智, has XMP `CreateDate 2014-06-12`.
- The 2013 values are kept. Later official tables cut 46 species-exclusive ability engravings to about half.
- Three 2013 MoveIDs point at a neighbouring move. 20072, 20084 and 20250 are bound to the move named by the engraving; the original ID is kept as `sourceMoveId`.

## Rules

- **Slots.** The 2013 client `PetInfo` carries one `abilityMark` and one `skillMark` per monster. A third `commonMark` slot has no data before the 2014 overhaul and is not offered.
- **Gates.** An engraving applies only when the monster meets its original `Level` (100, or 50 for the species-exclusive ability engravings), is the exact bound species, and, for a skill engraving, has learned the move. An engraving that stops qualifying after evolution or 降级秘药 stays equipped but has no effect, and the panel shows why.
- **Access** (revised user decision, V50). Skill and species-exclusive ability engravings are unlimited and equip directly. Generic ability engravings retain finite, separate per-item caps based on stat gains, including one Speed +18 and two Speed +15 marks. Original `Max` values remain source metadata. Finite copies live in `game.engravingStock` or on a holder; equipping can directly move one from another holder. Old surplus stock is preserved, with the current simultaneous equipment cap enforced. See [the V50 access rules](item-icons-access-v50.md). Universal engravings are not offered.
- **Classifier.** The shop page first selects a monster. It lists only the engravings that monster can equip now (bound species, level and learned move); engravings blocked only by level appear as a count. Filters cover slot, exclusive or generic, the raised stat for ability engravings, and the move and effect group for skill engravings (`ENGRAVING_EFFECT_GROUPS`), plus text search. The PetBag uses icon tiles and includes eligible unlimited marks, finite stock and marks available to move from another holder.
- **Ability engravings.** Their stats are added to battle stats, as the original 刻印加成 does. Saved HP and PP retain their base scale. Revision 49 additionally stores each holder's spent bonus resources in `game.modules[uid].engravingDeficit`; this prevents a new battle or save reload from replenishing partly exhausted bonus HP/PP. Removing a mark or losing eligibility preserves the shortfall without reducing base resources. Recovery clears it.
- **Skill engravings.** These become a per-monster battle override of the engraved skill (`MonsterInput.skill_overrides`). Catalog skills are not mutated. Revision 49 makes battle resolution and AI evaluation use the holder's own overrides, including power, priority, effects and PP costs. Public-opponent estimates still do not read hidden opposing equipment.

## Effect codes

`engraveSkill` in `src/mechanics/engravings.ts` maps the original `Effect`/`Arg` values:

| Code | Effect | Implementation |
|---|---|---|
| 101 | power +n | `power_bonus`, applied after power ops and power scripts |
| 102 | fixed damage +n | raise the existing unconditional `fixed_damage` op, or append one |
| 103 / 112 | priority +n (112: costs 2 PP) | `priority` and `priority_if` +n; 112 also sets `pp_cost: 2` |
| 104 | accuracy +n | `accuracy` +n at the original value, not capped at 100: the surplus offsets the user's lowered accuracy stages (Seer has no evasion stat; no catalog skill changes `eva`) |
| 105 | hit count +n | `multi_hit` min and max +n |
| 106 | sure hit | `accuracy: null` |
| 107 | duration +n | `turns` of conditions and statuses, or the duration parameter of the listed condition scripts |
| 108 | remove self damage | drop `recoil`; `seer_eff_80` gets a no-self-loss flag |
| 109 / 110 | remove own stat drops / own fatigue | drop the negative self `stat_stage` entries / the self fatigue status |
| 111 | PP +n | `pp` +n |
| 113 / 114 | fixed power n / maximum hit count at power n | 20131: drop `seer_eff_70` and use power 220; 20133: 8 hits at power 28 |
| 115 | also clear the foe's boosts | append `clear_stages` foe `up` |
| 116 | stat effects doubled | double every `stat_stage` delta |
| 117 | status chance +n | raise op chances and the chance parameter of `seer_eff_121/152/176`; 20297 follows `Arg` 10 although its text says 20% |
| 118 | fatigue the foe | append a 2-turn foe fatigue (20179 暗影自爆, Stel #832) |
| 119 | crit +n/16 | `crit_rate` +n |
| 120–126 | script parameter changes | `seer_eff_9` cap, remove `seer_eff_161`, `seer_eff_142` ratio, `seer_eff_419` damage, `seer_eff_154` ratio, heal 1/n, `seer_eff_125` cap |
| 127 | extra attack stage | +n on the self attack `stat_stage` |

All 399 skill engravings change their skill. `tools/verification/engravings-2013.mjs` checks this, along with the data gates, representative transforms, the engine overrides and the controller loadout round trip. The 399-row structural check is not a claim that every individual effect has received a separate historical and live-battle audit. Revision 49's additional controller and tactical checks are recorded in `design/notes/engraving-integration-v49.md`.

## Use by NPC teams

Trainer and boss members are `MonsterInput`, so they can carry `skill_overrides: {[move]: engraveSkill(skill, def)}` and pre-added stats. Two of the engraving-dependent v46 candidates are covered: 20179 暗影自爆刻印 (Stel #832, 12009) and 20032 暗影冰锥刻印 (Grano #450, 11198, power +10).
