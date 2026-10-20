# Battle animation texel density (V59)

V60 upscales the retained raster cells described below with a local AI model; see [battle-animation-hd-ai-v60](battle-animation-hd-ai-v60.md).

The 2026-10-19 playtest reported 丽莎布布 (303) and 闪光波克尔 (166) as blurry in battle. This note records the cause, the density audit of the whole catalog and the V59 re-render. The V44 pipeline, its source-matching gates and its budget rules are in [battle-animation-hd-v44](battle-animation-hd-v44.md); V59 changes only the multiplier of matched vector cells.

## Cause: the HD index was never loaded

The 2026-10-18 move of `src/battle` to `src/features/battle` rewrote the static import of the original runtime index but not the `import.meta.glob` of `public/battle-animations/hd/runtime-index.json`. The glob still named `../../public/...`, which matched nothing, so the HD index was empty and every species loaded its original 1x atlas. `battle-hd-memory.mjs` (needs-assets) has failed since that commit; no gate covered it. The index is tracked, so `battle-animation.ts` now imports it statically: a wrong path is a typecheck and build error.

`tools/verification/battle-hd-display.mjs` (needs-browser) measures the running game at DPR 2 in four viewports with 303 and 166 leading a wild battle:

| | 1000x650 | 1280x800 | 1440x900 | 1920x1080 |
| --- | ---: | ---: | ---: | ---: |
| 303 before (303.webp), lowest first-pose texels per device pixel | 0.48 | 0.44 | 0.39 | 0.32 |
| 303 with the V44 HD atlas | 1.94 | 1.74 | 1.55 | 1.29 |
| 166 body before (166.webp) | 0.46 | 0.41 | 0.37 | 0.31 |
| 166 body with the V44 HD atlas | 1.84 | 1.66 | 1.47 | 1.23 |
| 166 glow streak (retained source bitmap, both) | 0.72 | 0.65 | 0.58 | 0.48 |

The WebGL backing store already follows the device pixel ratio times the CSS zoom: in every run its width equals the canvas's displayed device pixels (884, 982, 1105 and 1326). Canvas resolution is not a cause for any species. The HP-panel portraits of both species are the vector `/portraits/vectors/<id>.svg`, so they were sharp.

## Density audit

`tools/assets/audit_battle_hd_density.py` computes the same density for every species without a browser. The battle scales a clip so the visible alpha box of its first standby pose fills the creature box times `physicalScale * .9`; from the original metadata and atlas alpha the tool derives device pixels per clip unit, and per atlas cell its texels per device pixel at its largest on-screen size, in the first standby pose and in any frame. For 303 and 166 its scale agrees with the browser within 1%.

The reference display is the largest creature box: 280 CSS pixels (`.classic-creature-motion`), zoom 1.5 (a 1920x1080 viewport) and DPR 2, 840 device pixels. The target is one atlas texel per device pixel. With the V44 atlases selected:

| Cells below 1 texel per device pixel | First standby pose | Any frame |
| --- | ---: | ---: |
| Original-vector cells (multiplier too low) | 417 cells in 178 species | 6,652 cells in 777 species |
| Retained raster cells | 999 cells in 471 species | 7,390 cells in 916 species |

Of the 417 first-pose vector cells, 313 needed 8x instead of 4x, 80 needed 4x and 14 needed 8x instead of 2x, and 10 needed 16x or more.

## V59 re-render

`build_battle_hd_atlases.py` (revision 7) records each cell's original density at the reference display and renders a matched original-vector cell at the smallest power of two that reaches the target, from its V44 default (4x up to 256 pixels, otherwise 2x) up to 8x. A tile stays within 8,192 pixels per side and the renderer's 33,554,432-pixel limit. When the 128 MiB decoded budget is exceeded, the packer first gives back raises of cells outside the first pose, then raises of first-pose cells, and only then the V44 order, so no cell falls below its V44 multiplier. Selection, gates, metadata and validation are unchanged; retained raster cells keep their original pixels.

Outputs are `<id>-v59.png` and `<id>-v59.json.gz`; the V44 files stay in place. Generation uses its own cache, `.cache/battle-hd-v59`, which starts each species from the V44 source export (`--inputs`), so the V44 reports and validation records stay as published. The publisher validates every pixel and the metadata transformation as before, and writes the V59 validation records into that cache. `summarize_battle_hd_coverage.py --ids` refreshes only the republished species; the other manifest entries are kept, and their aggregates are added from the kept entries.

V59 re-rendered and published the 777 species that had a vector cell below the target in any frame, except four: 346 (the reviewed prototype) and 375, 431 and 502 (the original-budget exceptions, which `recover_original_budget_battles.py` owns). For these 773 species:

- 5,311 vector cells rose above their V44 multiplier, 4,404 of them to 8x; no cell fell below it. 58 atlases reached the budget and gave some raises back.
- Every atlas passed the publisher's pixel, padding and metadata checks.
- Decoded atlas memory rose from 26,980 to 35,848 MiB in total, with the median from 23.7 to 32.5 MiB. 98 atlases are now above 120 MiB, against 40 before; none is above 128 MiB.
- The V59 files add 1,142,677,721 bytes on disk (1,546 files), and the V44 files stay. The bytes of the selected assets rose from 1,568,189,395 to 1,712,112,799.

The audit of the V59 selection:

| Cells below 1 texel per device pixel | First standby pose | Any frame |
| --- | ---: | ---: |
| Original-vector cells | 12 cells in 12 species | 2,507 cells in 330 species |
| Retained raster cells | 999 cells in 471 species | 7,389 cells in 916 species |

Of the 12 remaining first-pose vector cells, 10 would need 16x or more and 2 (species 171 and 290) are held at 2x by the budget. The remaining any-frame cells are held back by the 8x cap or the budget. 303 and 166 load `303-v59` and `166-v59` in the browser check, with the same standby densities as V44 (their first-pose cells already reached the target at 4x).

The V59 cache renders the candidate fingerprints again, and they differ slightly from the V44 ones. This changed the selection of 13 cells in 10 species. In 12 of them, an exact score tie between duplicate source characters now goes the other way (for example species 94 cells 50, 52 and 57). Both choices are original vectors that pass every gate, with fidelity metrics equal to three or four digits. In the 13th, species 71 cell 28 (outside the first pose), V44 kept the original pixels because the local separation from a near candidate missed its margin by 0.00006. In V59 it passes that margin, so the cell is now an original vector.

## Retained raster cells

No AI redraw or generic upscaler is used. For 166, all 20 retained cells stay raster:

- 15 glow-streak cells come from the embedded 150x147 bitmap (character 3). Flash already places it about 2x enlarged and rotated per frame, and Unity baked each rotated instance into its own cell. There is no vector source and no bitmap with more pixels than the cell. One of them is in the first pose.
- 4 speed-line cells (39, 40, 56, 58) match original shapes 53 to 56 by fingerprint, but the native-size renders of these hairlines fail the silhouette and colour gate (alpha IoU 0.59 to 0.67). Their parent sprite only fades them with an animated alpha colour transform, which the runtime applies through vertex colours, so applying it cannot change the cell match.
- 1 sparkle cell (9, 22x19 pixels) has a best candidate scoring 0.096 against the 0.065 limit.

Across the catalog, the 999 first-pose raster cells below the target were retained because the source comparison score exceeded its limit (398), the native-size render failed its fidelity gate (352), source candidates were ambiguous (145), no compatible original vector exists (101), or the source is an embedded bitmap without more pixels (3).

## Reproduction

The audit lists the species to re-render (`anyFrame` -> `vector-multiplier` -> `ids`). Generation, publication and the manifest refresh then take those IDs:

```sh
python3 tools/assets/audit_battle_hd_density.py --jobs 2 --output artifacts/battle-hd-density/audit.json
python3 tools/assets/build_battle_hd_atlases.py --jobs 2 --ids <ids>
python3 tools/assets/publish_battle_hd_atlases.py --ids <ids>
python3 tools/assets/summarize_battle_hd_coverage.py --verify-hashes --ids <ids>
node tools/verification/battle-hd-display.mjs
```

V59 ran these steps for 773 species in about 25 minutes with two jobs. The generator writes into the checkout's `public/battle-animations/hd`. The four species left out (346, 375, 431, 502) need their own paths: the prototype report of 346, and `recover_original_budget_battles.py` for the exceptions.

## Known gap: V44 cache provenance

The shared `.cache/battle-hd-v44` no longer matches its pins. 1,480 species reports, and the species 910 override report and verification, were rewritten after the V44 manifest pinned their hashes on 2026-10-18. 1,480 candidate manifests and 1,139 sprite-study manifests were rewritten after the reports recorded their hashes. `battle-hd-final-index.py` therefore fails on the first V44 species ("report hash differs"), before and after V59. The 710 V44 atlases and metadata files still selected still match their pins. The V59 species have a fresh, consistent chain in `.cache/battle-hd-v59`.
