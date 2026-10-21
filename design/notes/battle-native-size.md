# Battle creatures at their native size

The 2026-10-21 playtest found 丽莎布布 (303) the right size in battle and 哈莫雷特 (216) too small. The battle scaled every clip so the largest side of its first standby pose filled `physicalScale * .9` of the square creature box. `physicalScale` is art direction per evolution stage (.48, .72, .96 and so on), so 216 and 303 both filled .864 of the box. In clip units, though, 216's pose is 1.58 times the size of 303's. The original game drew each clip at its native size: every clip has 100 pixels per unit.

## Rule

```
extent(species) = min(standbySize(species) * calibrationExtent / standbySize(calibrationSpecies), maxExtent)
```

The extent is the share of the creature box that the largest side of the first standby pose fills. `battleCreatureExtent` in `src/features/battle/battle-creature-size.ts` computes it for the displayed species (`appearanceOf`, so skins included). Three things use it, so nothing jumps when the clip becomes ready:

- the clip mount, through `fixedAnimationTransform`;
- the portrait fallback, through `creatureArtStyle` with `fill` set to the extent and `scaleByStage: false`;
- the ground shadow (`BattleCombatant`).

The pet bag and other screens keep `physicalScale`.

- **Native size.** `standbySize` is the largest side, in clip units, of the visible box of the first standby frame. A texel counts as visible at alpha 16 of 255, the threshold that `visibleStandbyBounds` uses for registration at runtime. `tools/assets/measure_battle_standby_size.py` measures it from the original metadata and atlas. It records the value in `public/battle-animations/manifest.json` and in its projection `runtime-index.json`. `export_battle_animation.mjs` runs the tool after each export, and `optimize_battle_atlases.py` keeps the field when it rewrites the index. All 1,483 clips have a visible first pose. The values have a median of 1.68 units, p95 2.73, p99 3.22 and a maximum of 32.72 (311). The next largest is 4.58 (1263).
- **Why not the mesh or the portrait.** The standby mesh box is 1.024 times the visible box at the median, but 1.28 times or more for 5% of species: transparent rectangles and later standby frames inflate it. Portrait bounds differ from the clip by 2 to 4 times for about 5% of species (HD vector portraits).
- **Calibration.** 303 keeps its former extent: `calibrationExtent` is .864 (.96 x .9) and `calibrationSpecies` is 303. That gives .4311 of a creature box per clip unit. The median extent becomes .724. Compared with the former extents, the median creature grows by 11%: 771 species grow by more than 10% and 219 shrink by more than 10%.
- **Cap.** `maxExtent` is 1.35. The binding case is the smallest supported viewport, 1000x650, with the HUD of 2026-10-21. The creature box there is 260 px, and its center is 1.356 half-boxes below the ally HP panel, so a tall creature larger than that would overlap the panel. The cap applies to 21 species (`standbySize` above 3.131 units), among them 216 (1.365 becomes 1.35) and 谱尼 300 (1.358 becomes 1.35). Moves still travel inside the arena, because `battle-animation-path.ts` contains the path in clip units under the larger transform. Capping at one creature box would hold 244 species, 216 included, at the box size, which would undo the fix.
- **Constants.** The three constants are in `src/features/battle/battle-creature-size.json`. `battle-creature-size.ts`, `audit_battle_hd_density.py` (with the HD builders that import it) and `battle-hd-display.mjs` all read that file.

## Sizes

Largest side of the first standby pose, at 1280x800 (creature box 288.9 px). "Before" is the former extent times the box. "After" is measured in Chrome, reduced motion, DPR 2:

| Species | standbySize | Extent before | Extent after | Before (px) | After (px) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 丽莎布布 303 | 2.004 | .864 | .864 | 250 | 251 |
| 哈莫雷特 216 | 3.166 | .864 | 1.35 | 250 | 391 |
| 布布种子 1 | 0.872 | .432 | .376 | 125 | 109 |
| 谱尼 300 | 3.150 | .756 | 1.35 | 218 | 390 |

At 1000x650, 216 and 300 end 0.3 px and 1.3 px below the ally panel. 216's attack still reaches 皮皮 inside the arena.

## HD density

The V59 to V62 atlases were sized for the former extents. `audit_battle_hd_density.py` now uses the battle extent. The reference display is unchanged: a 280 CSS px box at zoom 1.5 and DPR 2, which is 840 device pixels, with a target of one atlas texel per device pixel. The table compares the V62 audit (`artifacts/battle-hd-v62/audit-after.json`) with the new one (`artifacts/battle-native-size/audit.json`) and gives cells below the target, in species:

| Cause | First pose, before | First pose, after | Any frame, before | Any frame, after |
| --- | ---: | ---: | ---: | ---: |
| Original-vector cell, multiplier too low | 1 in 1 | 215 in 97 | 2,503 in 329 | 3,997 in 574 |
| Retained raster cell | 23 in 17 | 77 in 32 | 725 in 89 | 1,046 in 130 |
| AI-upscaled cell | 4 in 3 | 120 in 68 | 454 in 171 | 1,478 in 325 |
| Redrawn cell | 0 | 4 in 4 | 39 in 14 | 97 in 40 |

- **Species.** 172 species have a first-pose cell below the target, against 21 before; 151 of them are new. 684 species have a cell below the target in some frame, against 404 before.
- **How far below.** Of the 416 first-pose cells, 210 are at .9 or more and 116 are between .75 and .9. Another 74 are between .5 and .75. The 16 below .5 are mostly the retained rasters that were already short: 278 to 280, 299, 341, 343, 617 and 780.
- **Fix for the vector cells.** 161 vector cells need 8x instead of 4x, 38 need 4x instead of 2x, 15 need 16x instead of 8x, and one needs more than 16x.
- **哈莫雷特 216.** Its lowest first-pose density falls from 1.18 to .75. One cell is short: AI tile 18 at 2x.
- **谱尼 300.** It falls from 1.03 to .58. Six cells are short: retained raster 37 at .58, and AI tiles at .73 to .93.
- **Other notable species.** 多戈 1002 has 20 short cells (.59), 阿瑞斯 505 has 11 (.59) and 赤西西比 337 has 10 (.66).

No atlas was regenerated. The next HD build (`build_battle_hd_atlases.py` and its AI, redraw and priority stages) sizes cells for the new extents, because those stages read `battle_extents()`.

## Open points

- **HD atlases.** Regenerating the atlases for the new extents is a separate decision. It concerns 151 newly short species and the 128 MiB budget pages.
- **闪光菲斯利 311.** Its first standby pose contains a faint element about 32 units to the left of the creature. The visible box is therefore 32.7 x 8.9 units, and the cap draws the creature tiny, as the former rule also did. Fixing it needs a registration rule for stray off-stage elements.
- **HUD changes.** The cap follows the current HUD at 1000x650. If the HP panels or the creature box move, revisit it.
- **Ground shadow.** The shadow still uses the portrait's aspect for the creature's height.

## Checks

- `npm run typecheck` passed, and `npm test` passed 177 of 177.
- `battle-hd-display.mjs` (needs-browser) now includes 216. In every viewport it checks that the drawn first pose fills its battle extent within 2%. It passed 12 of 12; for example 303 fills .8635 to .8657 and 216 fills 1.350 to 1.351. Each species loads its HD-index atlas. The lowest first-pose density at 1920x1080 is 1.29 for 303 (unchanged), 1.18 for 166 (1.23 before, its extent having grown from .864 to .902) and .81 for 216.
- `battle-attack-reach.mjs` (needs-browser) passed 3 of 3.
- Silent observation runs had 303, 216, 1, 300, 1263 and 311 lead wild battles at 1000x650, 1280x800 and 1920x1080. In every run the lead stayed inside the arena and its registration read the visible alpha. A further run played 216's 龙爪 at 1000x650.

```sh
python3 tools/assets/measure_battle_standby_size.py --jobs 2
python3 tools/assets/audit_battle_hd_density.py --jobs 2 --output artifacts/battle-native-size/audit.json
```

The tools need NumPy and Pillow.
