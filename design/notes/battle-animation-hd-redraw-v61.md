# Locally redrawn battle raster cells (V61)

V62 settles the two open points below (budget priority and thin strokes) as the user decided on 2026-10-20; see [battle-animation-hd-v62](battle-animation-hd-v62.md).

After V60 ([battle-animation-hd-ai-v60](battle-animation-hd-ai-v60.md)) the soft parts of the battle art at the reference display (280 CSS px box x zoom 1.5 x DPR 2) were 72 first-pose retained raster cells in 59 species and 9 first-pose AI cells held below the target; over every frame, 1,144 raster cells in 180 species and 446 AI cells. The raster cells are the ones the V60 model failed (thin lines it thins and brightens), the ones the budget gave no room, and the ones too small for the model. On 2026-10-20 the user approved redrawing them ("你可以重绘"). V61 redraws them locally from their own native pixels, gates every redraw like V60, and publishes `<id>-v61` atlases. No model, no network and no generative AI is used: the classes V61 redraws are handled by local methods, and the class they do not handle (a creature's many-coloured body) is left as published. Redrawn cells are counted apart from source and AI cells everywhere (mode `redrawn`).

## Classes and methods

`battle_hd_redraw.py` classifies a cell from its pixels and redraws it by the method that fits:

| Class | Rule | Method |
| --- | --- | --- |
| tiny | a side under 4 px or under 64 px (V60's minimum) | smooth field |
| glow | alpha transitions wider than 1.2 px on average (2.0 for a cell of 8 or more colours) | smooth field |
| complex | hard-edged, 8 or more flat colours (a creature's body) | not redrawn |
| flat | hard-edged, palette residual at most 2.5, mixing width at most 0.75, shorter side at least 8 px | traced vector, palette colours |
| shaded | hard-edged otherwise (gradients, small cells) | traced vector outline, smooth colour |

The transition width is the number of alpha-transition pixels (10 to 90% of the 5x5 peak) per pixel of the half-peak contour: an antialiased hard edge changes within about one pixel, a glow over several. The mixing width is the number of opaque pixels that mix two palette colours per pixel of boundary between colours: about a pixel or less for flat art, more for a gradient that a palette could only posterize.

**Traced vector (flat, shaded).** Each native pixel is unmixed into at most two palette colours and transparency, in premultiplied RGBA. The palette is taken from stable pixels near each part's alpha peak, so a faint part keeps its faintness instead of becoming a thinner, brighter line. The membership fields are interpolated (cubic spline, pixel-centre aligned) to an 8x analysis grid and lightly smoothed (0.35 native px; 0.6 for cells under 16 px and between two colours). Coverage is extrapolated linearly across the cell border, so an outline cut by the cell keeps its direction; colour shares are replicated, as the atlas extrudes the cell.
- *Regions* (parts a 3x3 opening keeps): the silhouette is the iso-contour whose area equals each connected part's native coverage; a colour region is where its membership dominates. The silhouette and each colour region are traced to closed polygons (marching squares, scikit-image `find_contours`, Douglas-Peucker 0.03 px) and written as SVG paths. The coverage comes from the silhouette path alone and the colour from the coverage-weighted colour regions, so a hairline gap between two traced regions cannot show as a seam.
- *Strokes* (thinner parts, such as speed lines and lightning): the skeleton (`skeletonize`) is traced to polylines, each pixel moved to the coverage centroid of its 3x3 neighbourhood and simplified (Douglas-Peucker 0.3 px, which straightens a pixel staircase and keeps a real zig-zag corner). The width along the line is the native coverage of the pixels nearest to each sample per unit length, smoothed, and at least one native pixel: a sub-pixel line keeps the width it shows and is made fainter, never thinner and brighter. The variable-width stroke is drawn as convex pieces (a disc per sample, a quadrilateral between samples) in one nonzero path, so the pieces form their union with round joins and caps.
- Every path is rendered by the pipeline's resvg (`@resvg/resvg-js` 2.6.2, `render_battle_redraw_svgs.mjs`) as a coverage mask; strokes are drawn over the regions. Where the native art is fainter than the drawing (a stroke that fades out), a smooth opacity factor (at most 1) fades it. What the vector leaves out (a faint fringe beside a hard stroke) is added back as a smooth field of the positive remainder (Gaussian 0.6 px, two back-projection rounds, so it cannot bring back pixel steps).
- Flat cells take the palette colours; shaded cells take the cubic interpolation of the native colour (colour bled under transparent pixels).

**Smooth field (glow, tiny).** Bilinear interpolation of the premultiplied pixels, a Gaussian of 0.5 native px, and eight rounds of back-projection towards the native pixels. A glow has no detail to invent; the field is clean (no bilinear diamonds or pixel steps) and band-free.

Every tile is finally clamped, per channel, to the range of each native pixel's 3x3 neighbourhood (bled colour and alpha), as V60 does, with the bound interpolated bilinearly so that it draws no pixel blocks itself: a redraw may sharpen a transition but cannot add a line, ring, halo or brighter stroke. A texel under zero alpha keeps the interpolated colour beside it (the shader interpolates straight RGBA).

The SVG of every traced cell is kept with its report; it is the vector drawing of the cell and renders sharp at any multiplier.

## Gate

Every redraw is reduced to the native cell size with the premultiplied box filter and compared with the original pixels exactly as V60 does, with V60's thresholds unchanged for every class: alpha IoU (alpha > 16) at least 0.8664, premultiplied RGBA mean error at most 21.5582, largest 3x3 block error at most 74.4794, and the stable-interior colour check (`battle_hd_local_fidelity.py`, unchanged). No new threshold is introduced and none is relaxed. A cell that fails keeps its published pixels, and its measurements stay in the report.

### Calibration against original vectors

`calibrate_battle_hd_redraw.py` runs the redraw on known-good original-vector cells, which have both the Unity raster and a real render of their vector source: V60's calibration sample (360 cells from 120 species, seed `v60-calibration`, 4x and 8x) and a second sample of 120 cells whose thin parts hold at least half of the coverage (strokes). Each cell is classified as the redraw does, redrawn at its vector render's multiplier, gated, and compared with the vector render at full resolution (aligned by the best integer shift, as in V60). Means per class (premultiplied error and gradient error on 0 to 255; "true renders pass" is the share of the real vector renders that pass the same gate):

| Sample, class | Cells | True renders pass | Redraws pass | Redraw error vs vector | Lanczos | V60 model | Closer than Lanczos |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| general, flat, 4x | 50 | | | 8.03 | 13.18 | 7.30 | |
| general, flat, 8x | 49 | | | 30.25 | 32.82 | 27.04 | |
| general, flat | 99 | 83.8% | 80.8% | 19.03 | 22.90 | | 87.9% |
| general, shaded, 4x | 94 | | | 8.11 | 8.47 | 6.70 | |
| general, shaded, 8x | 55 | | | 21.99 | 24.28 | 18.24 | |
| general, shaded | 149 | 95.3% | 97.3% | 13.23 | 14.31 | | 69.1% |
| general, glow | 23 | 73.9% | 100% | 8.46 | 8.93 | 8.78 | 95.7% |
| general, complex (not redrawn) | 89 | 89.9% | | | | | |
| strokes, flat | 75 | 49.3% | 29.3% | 42.43 | 43.51 | | 72.0% |
| strokes, shaded | 45 | 84.4% | 82.2% | 38.25 | 38.20 | | 55.6% |

On flat art at 4x the redraw is much closer to the vector than an interpolation (error 8.0 against 13.2, gradient error 11.4 against 17.0) and close to the V60 model (7.3); on shaded art and glows it is a little closer than Lanczos. The V60 model stays closer than the redraw at the same multiplier, which is why V60 AI tiles are not redrawn. Thin strokes are hard for every method: the gate rejects half of even the true vector renders of stroke-dominated cells (their alpha IoU at alpha 16 is dominated by the antialiasing pattern of one-pixel lines), and 29% of the stroke redraws pass. The full rows are in `artifacts/battle-hd-redraw-v61/calibration.json`, whose digest is in the provenance.

## Selection and budget

`build_battle_hd_redraw_atlases.py` works from each species' published atlas (V60, V59 or V44) and the report that produced it, as V60 does: the base metadata must equal the original metadata remapped by that layout, and a target's published tile must be byte-identical to its original Unity crop. A target is a retained raster cell below one texel per device pixel at the reference display, in any frame; it is redrawn at the smallest of 2x, 4x, 8x, 16x and 32x that reaches the target (32x when none does), within the renderer's tile limits. V60 AI tiles are not redrawn: on the calibration cells the model is closer to the vector truth than the redraw at the same multiplier.

Source cells (original vectors, constants) and hard-edged V60 AI tiles keep their published size. The redraws share the 128 MiB decoded budget with the soft V60 AI tiles (glow or tiny class), where a lower multiplier loses no visible detail. Over budget, one cell at a time moves down one level, outside the first standby pose first, soft cells first, the largest first; a cell at 1x returns to its original pixels. A soft AI tile that gives up budget is the premultiplied 2x2 box reduction of its published tile (V60's own 2x definition) and passes V60's gate again. Each target is planned at the multiplier the packing can keep before it is redrawn, so it is drawn once at the size it is published. The species whose published atlas already uses the original-size budget exception (375, 382, 431, 498, 502, 811, 1202) are left out, as in V60. Metadata changes only in UVs and atlas size.

## Outputs and publication

`<id>-v61.webp` (lossless WebP that keeps the colour under zero alpha, as V60) and `<id>-v61.json.gz` in `public/battle-animations/hd/`; V44, V59 and V60 files stay. Per-species reports, the redraw SVGs (`redraw/<cell>.svg`) and the base source record are in `.cache/battle-hd-v61/species/<id>/`. Each redrawn cell records its class, method, the redraw tool's code digests and library versions (NumPy, SciPy, scikit-image, Pillow, resvg-js), the native input and base-tile digests, the full redraw and output digests, the SVG digest, its gate scores, the multiplier its density needed and the one the budget left it, and whether it reaches the target.

The publisher (`publish_battle_hd_atlases.py`, kind `redrawn-raster-override`) validates a V61 report against its base as it does V60: original inputs and outputs by digest, the exact UV-only metadata change, the standard budget, every untouched tile equal to the base tile with the base report's mode, and every pixel and padding byte of the atlas. A redrawn cell must replace a published retained raster; the publisher recomputes the redraw from the native pixels with the pinned method (same code, libraries and renderer), and the tile, the SVG digest, the recorded class and the recomputed gate must all match. A soft AI tile that gave up budget must be the box reduction of its published tile, pass V60's gate, and be soft by the classifier. Tampered copies of the 166 report (changed gate metrics, an original-vector cell relabelled as redrawn, a loosened gate, another method parameter, another class, an unsupported multiplier, a changed base, a changed SVG digest, changed redraw pixels) are each rejected, and the unchanged copy passes (`publisher-tamper-166.json`). The manifest counts `redrawnCells` and `firstPoseRedrawnCells` per species and in total (`redrawn`); `public/battle-animations/hd/redraw-provenance-v61.json` lists the method, gate, calibration digest and, per species, the report digest, base atlas, every redrawn cell with its class, multiplier, method and digests, the cells not used and why, and the AI cells that gave up budget.

## Results

The V60 audit left 1,144 retained raster cells below the target in 180 species, 72 of them in the first standby pose of 59 species. V61 published 106 atlases (90 over a V60 base, 16 over a V59 or V44 base); every one passed the publisher. Each target cell ended as:

| Outcome | Any frame | First standby pose |
| --- | ---: | ---: |
| Redrawn, reaching one texel per device pixel | 345 (101 species) | 43 (38 species) |
| Redrawn, held below it by the budget | 27 (9) | 0 |
| Redraw failed the gate | 232 (73) | 25 (19) |
| Failed the gate or no budget (6 species with both, not told apart) | 111 | 0 |
| No budget above 1x | 163 (16) | 1 (99 cell 377) |
| Complex art, not redrawn | 102 (25) | 2 (86 cell 24, 462 cell 2) |
| In an original-size budget exception (375, 382, 431, 502) | 164 (4) | 1 (502 cell 106) |

The 372 redrawn cells by class: 245 tiny and 67 glow (smooth fields), 34 flat and 26 shaded (traced vectors); in the first pose 36 tiny, 5 glow, 1 flat and 1 shaded. Multipliers: 99 at 2x, 100 at 4x, 69 at 8x, 99 at 16x, 5 at 32x. Fifteen soft V60 AI cells gave up budget: 6 glow streaks of 166 and 7 cells of 410 from 4x to 2x, 1 cell of 432 from 8x to 4x, and 1 cell of 410 (481x608 px) from 2x back to its original pixels.

Density audit at the reference display, cells below one texel per device pixel (cells in species):

| Cause | First pose, V60 | First pose, V61 | Any frame, V60 | Any frame, V61 |
| --- | ---: | ---: | ---: | ---: |
| Original-vector cell, multiplier too low | 12 in 12 | 12 in 12 | 2,507 in 330 | 2,507 in 330 |
| Retained raster cell | 72 in 59 | 29 in 23 | 1,144 in 180 | 773 in 112 |
| AI-upscaled cell | 9 in 8 | 9 in 8 | 446 in 176 | 458 in 176 |
| Redrawn cell | — | 0 | — | 27 in 9 |

The twelve more AI cells below the target are the soft cells that gave up budget. The 9 first-pose AI cells are creature bodies (6 complex, 3 flat) that V60 drew at 2x or 4x because their atlases are full of source cells; V61 does not redraw AI tiles and finds no budget for them either. Every nonconstant first-pose cell is now above its native resolution in 1,422 species (1,385 after V60).

The manifest's cell modes are 37,638 original-vector, 6,244 `ai-upscaled`, 1,833 retained original, 372 `redrawn`, 92 constant, 2 microstrips and 1 `ai-source-bitmap`. The decoded size of the 106 atlases rose from 7,118 to 7,170 MiB in total; none exceeds 128 MiB. The 212 V61 files take 234 MB; because they replace V60 and V59 files of about the same size, the selected HD assets went from 1,668,952,399 to 1,668,942,045 bytes. The reports and SVGs take 56 MB in the cache. A full build takes about 15 minutes with two jobs on an idle machine, and the publisher, which recomputes every redraw, about as long.

### 166 and the first pose

闪光波克尔 (166): its four speed-line cells (528 to 560 x 56 to 64 px, horizontal one-pixel lines) are flat strokes: the redraws reduce back to the native pixels with alpha IoU 0.97 to 0.98 and a mean error of 1.1 to 1.6, and keep each line one native pixel thick, sharp, and as bright as the original, where the V60 model thinned and brightened them. The atlas is full of source cells, so they could have 2x and 4x, not the 8x their density needs (0.20 before, 0.40 after at their largest); six glow-streak AI cells went from 4x to 2x to make that room. Its first pose had no raster cell below the target; in the browser its lowest first-pose density is unchanged (1.23 at 1920x1080, the vector body).

In the first pose, the 43 redrawn cells are 36 tiny parts (dots, short streaks and fragments a cell border cuts, under 4 px on a side or 64 px in area), five glows (800, 978 twice, 755, 1365), the sparkles and dots of 1305 and the star field of 131. The 25 that failed are faint star fields and sparkles (278 four times, 279 twice, 280 twice, 299, 341, 342, 343 twice, 617), thin lightning, hairlines and dashes (592, 603, 1353), soft rings (546), a cell with no pixel above alpha 15 (1354), and tiny fragments whose antialiasing the gate does not accept from a smooth field (559, 780, 1074, 1171, 1376, 1441).

### Evidence

- `artifacts/battle-hd-redraw-v61/crops/`: software before/after device-pixel renders (`battle-hd-ai-crops.py --version v61`) of the first pose and the attack frame with the most redrawn area for 1305, 755, 978, 131, 74, 906, 144, 149, 432, 950 and 462, and of 166's speed-line frame (`sa` 40) with a 2x zoom of its lines. Reviewed, with every traced redraw and a sample of the glows: silhouettes, colours and line thickness match at game size; edges are sharp where the native edge is hard, glows stay soft and lose their bilinear diamonds; no halo, ring or new line. Two kinds of redraw are visibly a guess: tiny particles become crisp discs, and the soft flare of 1200 cell 8 becomes a hard-edged shape; both passed the gate.
- `artifacts/battle-hd-redraw-v61/browser/`: `battle-hd-display.mjs` (Chrome, DPR 2) for 166, 1305, 755, 978, 74 and 131 in four viewports: 24 of 24 passed, each loads its `-v61` atlas with no page or console error. Lowest first-pose density at 1920x1080 against the audit before V61: 1305 0.53 to 1.15, 755 0.22 to 1.58, 978 0.68 to 1.48, 131 0.85 to 1.81, 74 0.09 to 0.89 (now held by its vector cell 17, which needs 16x).
- `artifacts/battle-hd-redraw-v61/webkit/`: Playwright WebKit loads and draws the lossless WebP atlases of 166, 1305 and 755 with no error.
- Battle suites `battle-animation-hd-loader`, `battle-hd-memory`, `display-resolution`, `battle-display-lifecycle` and `battle-animation-registration` pass; `npm run typecheck` and `npm test` (178 tests) pass. The full `npm run verify` was not run.
- Audits `audit-before.json` and `audit-after.json`, `outcomes.json` (every target cell's outcome and class), the calibration, and the build, publication and summary logs are in `artifacts/battle-hd-redraw-v61/`.

## Limits and open points

- **Budget.** 163 target cells found no room above 1x and 27 redrawn cells stay below the target, and the 9 first-pose AI bodies have the same cause: their atlases are full of V59 vector cells raised for attack frames. Letting first-pose cells take budget from those raises (rendering the vectors at their V44 multiplier) could make room for 99 cell 377 and the 9 AI bodies; it changes published source cells and is left for a decision.
- **Thin strokes.** The V60 gate rejects half of the true vector renders of stroke-dominated cells; thresholds calibrated on those cells alone (IoU 0.748, error 36.7, block 63.3 at the 5th/95th percentiles) would accept more stroke redraws but are looser than the existing gate, so they are not used.
- **Complex art** (102 cells) is not redrawn by local methods; the V60 model is the better tool for it, given budget.
- **Tiny and glow** redraws are smooth reconstructions: cleaner than the bilinear magnification, but they add no detail.
- The species with an original-size budget exception (375, 382, 431, 498, 502, 811, 1202) are unchanged.
- The V44 cache provenance gap described in the V59 note is unchanged.

## Reproduction

```sh
python3 tools/assets/audit_battle_hd_density.py --jobs 2 --output artifacts/battle-hd-redraw-v61/audit-before.json
python3 tools/assets/calibrate_battle_hd_redraw.py
python3 tools/assets/build_battle_hd_redraw_atlases.py --audit artifacts/battle-hd-redraw-v61/audit-before.json --scope all --jobs 2
python3 tools/assets/publish_battle_hd_atlases.py --cache .cache/battle-hd-v61 --ids <built ids>
python3 tools/assets/summarize_battle_hd_coverage.py --verify-hashes --ids <built ids>
python3 tools/assets/build_battle_hd_redraw_atlases.py --provenance
python3 tools/assets/audit_battle_hd_density.py --jobs 2 --output artifacts/battle-hd-redraw-v61/audit-after.json
python3 tools/verification/battle-hd-ai-crops.py 166 --version v61
HD_DISPLAY_SPECIES=166 node tools/verification/battle-hd-display.mjs
```

The tools need NumPy, SciPy, scikit-image (0.26) and Pillow, and the resvg-js runtime in `.cache/portrait-v44/runtime/`. `--scope first-pose` limits the build to cells below the target in the first standby pose; the built species are the keys of `.cache/battle-hd-v61/atlas-manifest.json`. A redraw is deterministic for the pinned code, libraries and renderer; another version of any of them changes the method digest, and the publisher then refuses the reports until they are rebuilt.
