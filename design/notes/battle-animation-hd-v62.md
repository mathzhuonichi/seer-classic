# First standby pose first, and a stroke-only gate (V62)

After V61 ([battle-animation-hd-redraw-v61](battle-animation-hd-redraw-v61.md)) the cells below one texel per device pixel at the reference display (280 CSS px box x zoom 1.5 x DPR 2, `audit_battle_hd_density.py`) were, in the first standby pose, 12 original-vector cells, 29 retained raster cells in 23 species and 9 V60 AI cells; over every frame, 773 retained raster cells. V61 left two decisions open, and on 2026-10-20 the user chose 「B」 for both:

1. **Budget priority.** Within each atlas's 128 MiB decoded budget, every first-pose cell (original vector, V60 AI tile, V61 redraw) reaches one texel per device pixel at the reference display before any attack or other-frame cell keeps a raise above its V44 multiplier. When the budget is short, other-frame V59 raises are given back first (the largest saving with the least visible loss first), never below a cell's V44 multiplier.
2. **Thin strokes.** A stroke-only gate, calibrated on true vector renders of thin-stroke cells so that about 95% of them pass, applies only to cells classified as thin strokes; every other class keeps the V60 gate. Every stroke cell accepted under it is reviewed by eye.

V62 rebuilt the 52 species where either changes a cell, as `<id>-v62.webp` and `<id>-v62.json.gz`; the V44, V59, V60 and V61 files stay. Metadata changes only in UVs and atlas size.

## Budget plan

`build_battle_hd_priority_atlases.py` starts from each species' published atlas and the report that produced it, proven as V60 and V61 prove theirs. Every cell that may change gets a ladder of multipliers from its highest level down to its floor, in one of four tiers:

| Tier | Cells | Highest level | Floor |
| --- | --- | --- | --- |
| first pose | drawn in the first standby pose and below the target there | the smallest multiplier that reaches the target in the first pose | its published multiplier |
| stroke | other retained rasters below the target in some frame, classified as thin strokes | the multiplier their frames need (up to 32x) | 1x (original pixels) |
| V59 raise | original vectors outside the first pose above their V44 multiplier | published | the V44 multiplier, read from the published `<id>-v44.json.gz` |
| AI or redraw | V60 AI tiles and V61 redraws outside the first pose above 1x | published | 1x (original pixels) |

A first-pose cell rises by its own method: an original vector is rendered again from its selected SVG by the pipeline's own renderer (`render_battle_shape_candidates.mjs`), now up to 32x for the first pose (V59 stopped at 8x); a V60 AI tile is upscaled again by the pinned model (up to 8x, V60's own levels); a retained raster tries the model and then the V61 redraw, or only the redraw when it is a thin stroke; complex art is not redrawn. A given-back vector is rendered again at the lower multiplier; a given-back AI tile or V61 redraw is the premultiplied box reduction of its tile (V60's 2x definition, V61's reductions) and is gated again.

Over budget one cell at a time moves down one level, tier by tier: stroke cells first (they only use what is left), then the V59 raises, then AI tiles and redraws, and the first-pose cells last. Within a tier the next step is the one with the most bytes saved per unit of visible loss, the loss being how far further the cell falls below one texel per device pixel at its largest on-screen size (device pixels per texel beyond one, after minus before); in the AI-or-redraw tier soft cells (glow, tiny) go first, as in V61. A level whose tile fails its gate or the visual review is dropped from its ladder and the plan is made again. A second pass then fixes each first-pose cell at the level the first pass left it and fits again, so a give-back that could not lift any first-pose cell to a higher level is undone. Pages are packed by the pipeline's MaxRects packer at the smallest of its canvas widths in steps of 256 (V59 to V61 took the first width that fitted).

## Stroke gate

`battle_hd_stroke_gate.py` classifies a cell as a thin stroke when it is hard-edged (redraw class flat or shaded) and its line-like thin parts hold at least half of its native coverage. A thin part is what a 3x3 opening removes (V61's `split_strokes`); it is line-like when its skeleton has at least 4 pixels, so dots, sparkles and particle fields are not strokes. The gate keeps V60's measurements of a tile reduced to native size against the original pixels (alpha IoU at alpha 16, premultiplied RGBA mean error, largest 3x3 block error, and the unchanged stable-interior colour check) with its own thresholds.

### Calibration

`calibrate_battle_hd_stroke_gate.py` samples published original-vector cells (at 2x or more, shorter side at least 8 px, longer side at most 1,024 px) whose native raster is a thin stroke: 400 cells from 226 species (seed `v62-stroke-gate`, at most three per species; 17 at 2x, 200 at 4x, 183 at 8x; 274 flat, 126 shaded). Each true vector render is measured with the gate against the Unity raster. A seeded shuffle splits the sample into a calibration half and a held-out validation half of 200 cells each. The thresholds are equal tails of the calibration half: the IoU minimum at its q-th percentile and both error maxima at their (100-q)-th, with the largest q (steps of 0.05) whose gate still passes 95% of the calibration renders on every check at once.

| Gate | IoU minimum | Error maximum | Block maximum | True renders pass: calibration | validation | all 400 | Redraws pass | Redraw error vs vector, accepted / rejected |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Stroke (q = 2.5)** | **0.7001** | **46.3354** | **70.4406** | 95.0% | 93.5% | 94.3% | 94.8% | 37.7 / 53.2 |
| V60 | 0.8664 | 21.5582 | 74.4794 | 60.0% | 57.5% | 58.8% | 57.5% | 31.9 / 47.4 |

The redraws are the V61 method run on the same Unity rasters at the true render's multiplier; their error against the vector truth (premultiplied, 0 to 255, aligned as in V60) is higher where the gate rejects them. A first calibration that took every thin part (dots included, as V61's stroke sample did) gave 0.6561 / 46.2163 / 71.951 at q = 2; its build accepted dot and particle fields as strokes (species 293's particle spray, 299's star field), which are not thin strokes, so the line-like rule replaced it and the gate was calibrated again. The block maximum is close to V60's (70.4 against 74.5); the stroke gate is looser in IoU and mean error only.

**Reference: 闪光波克尔 (166).** Its four hairline speed lines (39, 40, 56, 58; 528 to 560 by 56 to 64 px) are thin strokes (line-like share 0.999). Their published V61 redraws pass both gates. The original shapes the V44 matcher picked for them (`53-full` to `56-full`, which failed its source gate) rendered at 2x, 4x and 8x fail both gates (IoU 0.57 to 0.67, error 62 to 105, block 122 to 149): the stroke gate does not admit those mismatched source renders. 166 has no first-pose cell below the target and its speed lines are already V61 redraws outside the first pose, which the budget plan does not raise, so 166 is not rebuilt; its sheets are the reference in the review below.

### Visual review

`tools/verification/battle-hd-stroke-sheets.py` draws, for every cell accepted under the stroke gate, the original runtime pixels and the published tile at game size (the cell's largest on-screen size at the reference display, with the shader's bilinear fetch) on dark and light grounds: the whole cell, windows at both ends, and the densest part enlarged 4x with an alpha overlay. Each cell was looked at, with landscape strips of original, published and overlay for the tall ones. Of 66 stroke-gate cells, 46 were accepted and 20 rejected:

- species 692, 693 and 1154 (nine cells of one speed-line effect): faint grey lines and dashes redrawn brighter and thinner; 692 cell 11, faint dots brightened;
- 430 cells 52, 59, 88 and 119 (4-pixel-tall motion-dash strips): separate dashes joined by new lines, a streak turned into a disc, an end blob enlarged;
- 278 cell 2, 544 cell 45 and 858 cell 13: soft glows turned into hard capsules, discs or invented strokes;
- 340 cell 10: rungs added between the two strands of a lightning bolt; 426 cell 44: thin streaks turned a darker orange; 1280 cell 73: a green line made thinner and brighter.

Accepted cells include arcs whose beaded antialiasing the redraw draws as the continuous tapered arc it samples (34 cells 1 and 150), rings (546 cell 7, 96's ellipses), lightning (340 cells 24 and 64, 362, 371, 455, 681, 714, 717, 1193), small sparks (402, 403, 501) and the speed-line arcs of 579, 593, 614, 616 and 948. The verdicts are `tools/assets/battle_hd_stroke_review_v62.json`, each bound to the cell's native pixels; the builder drops a rejected cell, and the publisher refuses a stroke-gate tile without an accepting verdict for its native pixels. After the rejections the 10 affected species were planned again: 8 of them no longer change and keep their published atlas.

## Outputs and publication

`<id>-v62.webp` (lossless WebP keeping the colour under zero alpha, as V60 and V61) and `<id>-v62.json.gz` in `public/battle-animations/hd/`. Per-species reports, the redraw SVGs, clones (`cp -c`) of the selected source SVGs and the base source record are in `.cache/battle-hd-v62/species/<id>/`. Every planned cell records its tier, ladder, chosen level and method, its V44 and published multipliers, its densities before and after, the gate it was held to (`v60` or `stroke`) with thresholds and scores, and its failed attempts; a first-pose cell also records whether it reaches the target and, if not, why.

The publisher (`publish_battle_hd_atlases.py`, kind `first-pose-priority-override`) checks the pinned policy (tiers, scales, budget and the digests of the builder, the stroke gate and the renderer), methods and gates, the original inputs and outputs by digest, the UV-only metadata change and the standard budget. It derives the plan again from the base: every ladder must be its rule's ladder less levels with a recorded failed attempt, and the packing of those ladders must give the recorded steps, layout and levels; in the first pass a first-pose cell may only move down after every other tier has given back all it may. Each changed tile is recomputed by its method: a vector is rendered again from the base cell's selected SVG and must equal the atlas tile byte for byte, a raised AI tile is run again through the pinned model (deterministic on the building machine) and must equal the atlas tile and pass V60's gate, a redraw is redrawn with the same class, method, SVG and gate scores, and a reduction is reduced again and re-gated. A tile accepted under the stroke gate needs an accepting visual review of its native pixels. Every untouched tile must equal the base tile with the base mode, and every atlas pixel and padding byte must match. Tampered copies of the 12 and 546 reports (a loosened stroke gate, a reversed reduction order, changed gate scores, a first-pose cell relabelled as a V59 raise, a given-back cell claiming its raise, a ladder level dropped without an attempt, a vector ladder below its V44 multiplier, a swapped gate, another selected SVG, a stroke cell without review) are each rejected, and the unchanged copies pass (`publisher-tamper.json`). The manifest's `redrawn` block records the stroke gate and a `firstPosePriority` block counts the V62 species; `public/battle-animations/hd/priority-provenance-v62.json` lists the policy, both gates, the calibration and review digests and, per species, the report digest, base atlas, first-pose outcomes, raised and given-back cells and every gate used with its scores.

## Results

52 species are published as V62 atlases: 22 for first-pose cells and 30 only for thin-stroke redraws. Every one passed the publisher.

| Raised cells | Cells | Multipliers |
| --- | ---: | --- |
| First-pose original vectors, rendered again | 11 | 1 from 2x to 4x, 8 from 8x to 16x, 2 from 8x to 32x |
| First-pose V60 AI tiles, model again | 6 | 2 from 2x to 4x, 2 from 2x to 8x, 2 from 4x to 8x |
| First-pose retained rasters, model | 2 | 86 cell 24 (complex) and 99 cell 377, both 1x to 2x |
| First-pose retained rasters, stroke redraw | 4 | 546 cell 7 and 603 cell 32 to 4x, 592 cell 0 and 1353 cell 4 to 2x |
| Other-frame thin-stroke redraws | 42 | 10 at 2x, 14 at 4x, 8 at 8x, 8 at 16x, 2 at 32x; 30 reach the target in every frame |

### Attack-frame losses

Seven cells in six species gave up budget, all of them seen only in attack frames. Densities are texels per device pixel at the cell's largest on-screen size at the reference display:

| Species | First-pose cell raised | Attack cell given back | Multiplier | Density |
| --- | --- | --- | --- | ---: |
| 12 | AI 48, 2x to 4x (0.56 to 1.13) | vector 4 (V59 raise) | 4x to 2x (V44) | 1.13 to 0.57 |
| 107 | AI 46, 2x to 8x (0.49 to 1.97) | vectors 54 and 61 (V59 raises) | 8x to 4x (V44) | 1.97 to 0.98 |
| 144 | AI 134, 2x to 8x (0.41 to 1.62) | vectors 125 and 141 (V59 raises) | 8x to 4x (V44) | 1.63 / 1.62 to 0.82 / 0.81 |
| 149 | AI 24, 4x to 8x (0.99 to 1.97) | vector 47 (V59 raise) | 8x to 4x (V44) | 1.98 to 0.99 |
| 171 | vector 1, 2x to 4x (0.73 to 1.46) | V60 AI tile 129 | 8x to 4x (box reduction, re-gated) | 1.19 to 0.59 |

90, 86, 87 and 99 found room without a give-back once pages were packed at their smallest width, and the second pass undid the give-backs that could not lift any first-pose cell (for example 20, where giving back V61 redraw 63 still left no room for AI cell 38). In software crops of the attack frames with the most given-back area (`crops-given-back/`), the after frames are a little softer in those parts and otherwise the same.

### First-pose cells still below the target

22 of the 50 first-pose cells below the target reach it; 28 do not:

- **Budget, held at the V44 floor (6).** 290 cell 54 (vector, 2x, density 0.85, needs 4x), 20 cell 38 (AI, 2x, 0.73), 54 cells 55 and 96 (AI, 2x, 0.73), 462 cell 2 (complex raster, 1x, 0.46; the model passes at 2x and 4x) and 99 cell 377 (raised from 1x to 2x by the model, 0.67; 4x passes). Every vector of these five atlases is already at its V44 multiplier: no V59 raise exists to give back, the other-frame AI tiles and redraws free at most 0.9 MiB (none in 99) against the 0.55 to 2.8 MiB the raise needs, and the padded cells already fill 120 to 122 MiB of the 128 MiB page. Reaching the target needs either a cell below its V44 multiplier or a larger page, both outside the decision.
- **Every method fails its gate (21).** Faint star fields and sparkles of 278 (cells 8, 26, 27, 33), 279 (10, 20), 280 (15, 24), 343 (28, 35) and 617 (14): the model fails on IoU (0.70 to 0.85), mean error (up to 36) or block error (up to 83), the redraw on IoU (0.55 to 0.80); 278 cells 27 and 33 are thin strokes and their redraws fail the stroke gate's IoU (0.55 to 0.61 against 0.7001). Soft shaded art of 299 (13), 341 (5) and 342 (6): IoU 0.67 to 0.83 against 0.8664. Tiny cells of 2 to 5 px (559 cell 0, 780 cell 36, 1074 cell 8, 1171 cell 2, 1376 cell 0, 1441 cell 7): the smooth field's IoU is 0.68 to 0.86, the antialiasing of a few pixels. 1354 cell 7 has no pixel above alpha 16. The scores per attempt are in `first-pose-shortfalls.json`.
- **Original-size budget exception (1).** 502 cell 106: the seven species with an original 8,192-square atlas are left out, as in V60 and V61.

### Density audit

Cells below one texel per device pixel at the reference display (cells in species), before and after V62:

| Cause | First pose, V61 | First pose, V62 | Any frame, V61 | Any frame, V62 |
| --- | ---: | ---: | ---: | ---: |
| Original-vector cell, multiplier too low | 12 in 12 | 1 in 1 | 2,507 in 330 | 2,503 in 329 |
| Retained raster cell | 29 in 23 | 23 in 17 | 773 in 112 | 725 in 89 |
| AI-upscaled cell | 9 in 8 | 4 in 3 | 458 in 176 | 454 in 171 |
| Redrawn cell | 0 | 0 | 27 in 9 | 39 in 14 |

The any-frame vector count loses ten raised first-pose cells and gains the six given-back attack cells; the AI count loses six raised first-pose tiles and gains 171's given-back tile and 99's 2x tile; the redrawn count gains the twelve stroke redraws that the budget holds below the target in some frame. Every nonconstant first-pose cell is above its native resolution in 1,427 species (1,422 after V61). The manifest's cell modes are 37,638 original-vector, 6,246 `ai-upscaled`, 418 `redrawn`, 1,785 retained original, 92 constant, 2 microstrips and 1 `ai-source-bitmap`.

The decoded size of the 52 atlases fell from 4,068 to 3,897 MiB, because pages are now packed at their smallest width; the largest is 127.99 MiB. The 104 V62 files take 105 MB; the selected HD assets went from 1,668,942,045 to 1,670,593,519 bytes. The reports, SVGs and source clones take 38 MB in the cache. A build of the candidate species takes about 10 minutes with two jobs, and the publisher, which repacks every plan and recomputes every changed tile, about 25 minutes.

### Evidence

- `artifacts/battle-hd-v62/`: `audit-before.json` and `audit-after.json`; `stroke-calibration.json` (since 2026-10-23 tracked as `tools/assets/battle_hd_stroke_calibration_v62.json`; and the superseded `stroke-calibration-all-thin-parts.json`); `reference-166.json`; `stroke-review/` (a sheet per stroke cell and the four 166 references, review mosaics, `strips/`, `sheets.json` with the measurements); `outcomes.json` (raised, given-back and first-pose cells per species, with the sequences of the given-back cells); `first-pose-shortfalls.json`; `crops/` (first pose, before and after) and `crops-given-back/` (attack frames); `publisher-tamper.json`; the build, publication and summary logs.
- `artifacts/battle-hd-v62/browser/`: `battle-hd-display.mjs` (Chrome, DPR 2) for 166, 107, 74, 355 and 546 in four viewports: 20 of 20 passed, each loads its HD-index atlas (`166-v61`, the others `-v62`) with no page or console error. Lowest first-pose density at 1920x1080: 166 1.23 (unchanged), 107 2.13, 74 1.24, 355 1.53, 546 1.10 (the audit before V62: 0.49, 0.82, 0.37 and 0.42 for their raised cells).
- `artifacts/battle-hd-v62/webkit/`: Playwright WebKit decodes the atlases of 12, 74, 355, 430, 546 and 1265 at their recorded size and parses their metadata with no error; opaque texels and alpha equal the PIL decode. WebKit's `createImageBitmap` premultiplies (the colour under zero alpha and some low-alpha colours differ), the same for the V61 atlases of 166 and 12 checked alongside.
- Suites `battle-animation-hd-loader`, `battle-hd-memory`, `display-resolution`, `battle-display-lifecycle`, `battle-animation-registration` and `battle-attack-reach` pass; `npm run typecheck` and `npm test` (178 tests) pass. The full `npm run verify` was not run.

## Limits and open points

- **First-pose cells held by the V44 floor.** The six budget shortfalls above sit in atlases whose vectors are all at their V44 multipliers. Lifting them needs a further decision: other-frame vectors below their V44 multiplier, or a page above 128 MiB.
- **Thin strokes stay a judgement.** The stroke gate passes about 95% of true renders but also redraws that differ more from the vector truth than V60's gate allows (error 37.7 against 31.9 on the calibration sample); the visual review is what keeps faint speed lines and soft glows from becoming brighter, thinner or harder. The review bound each verdict to the cell's native pixels; a later rebuild that redraws a reviewed cell at another multiplier keeps its verdict.
- **Other-frame cells did not gain.** The plan raises first-pose cells and thin-stroke redraws only; other-frame AI tiles and V61 redraws below the target (for example 166's speed lines at 2x and 4x, which need 8x) keep their published multipliers, and a first-pose cell is raised only to what the first pose needs.
- **WebKit premultiplies decoded atlases** in the ImageBitmap path the check uses, so the colour kept under zero alpha does not reach a WKWebView there; this applies to V60 and V61 atlases as much as to V62.
- The model output and therefore the publisher's model check are byte-reproducible on this machine only; transfer the V62 atlases, metadata and cache reports together.
- The species with an original-size budget exception (375, 382, 431, 498, 502, 811, 1202) and the 346 prototype are unchanged. The V44 cache provenance gap described in the V59 note is unchanged.

## Reproduction

```sh
python3 tools/assets/audit_battle_hd_density.py --jobs 2 --output artifacts/battle-hd-v62/audit-before.json
python3 tools/assets/calibrate_battle_hd_stroke_gate.py
python3 tools/assets/build_battle_hd_priority_atlases.py --audit artifacts/battle-hd-v62/audit-before.json --jobs 2
python3 tools/verification/battle-hd-stroke-sheets.py      # review, then record verdicts in battle_hd_stroke_review_v62.json
python3 tools/assets/build_battle_hd_priority_atlases.py --ids <species with rejected cells> --jobs 2
python3 tools/assets/publish_battle_hd_atlases.py --cache .cache/battle-hd-v62 --ids <built ids>
python3 tools/assets/summarize_battle_hd_coverage.py --verify-hashes --ids <built ids>
python3 tools/assets/build_battle_hd_priority_atlases.py --provenance
python3 tools/assets/audit_battle_hd_density.py --jobs 2 --output artifacts/battle-hd-v62/audit-after.json
HD_DISPLAY_SPECIES=166,107,74,355,546 node tools/verification/battle-hd-display.mjs
```

The tools need NumPy, SciPy, scikit-image (0.26) and Pillow, the resvg-js runtime in `.cache/portrait-v44/runtime/`, the pinned Real-ESRGAN tool in `.cache/tools/` and the V59 or V44 source caches of the rebuilt species. The built species are the keys of `.cache/battle-hd-v62/atlas-manifest.json`. A species whose plan changes nothing is left out; when a rebuild drops a species, delete its `-v62` files and cache directory before publishing.
