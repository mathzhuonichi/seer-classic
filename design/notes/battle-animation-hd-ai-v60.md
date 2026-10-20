# AI-upscaled battle raster cells (V60)

After V59 ([battle-animation-hd-density-v59](battle-animation-hd-density-v59.md)) the soft parts of the battle art are the retained original raster cells: Unity bitmaps that no original vector or larger source bitmap can replace. On 2026-10-19 the user approved AI redraws where no original source can sharpen a part ("高清素材如果没有的话可以ai重绘"). V60 upscales those cells with a local super-resolution model, keeps only results that reduce back to the original pixels, and publishes `<id>-v60` atlases. Original-vector cells, constant cells and the species 910 AI bitmap keep their published pixels and multipliers. AI cells are counted apart from original-source cells everywhere (mode `ai-upscaled`), as the [species 910 exception](battle-animation-hd-v44.md#species-910-bitmap-exception) is.

## Tool

Real-ESRGAN, ncnn-Vulkan build 20220424 from the xinntao/Real-ESRGAN v0.2.5.0 release (`realesrgan-ncnn-vulkan-20220424-macos.zip`, SHA-256 `e0ad0558…c333a`), model `realesrgan-x4plus-anime` (param `2b8fb6e0…27ed4`, bin `fe01c269…bacc`), binary `c1c35d92…b7cc`. It runs on the Mac GPU through MoltenVK (`-j 1:1:1`, so CPU load stays low), from `.cache/tools/realesrgan-ncnn-vulkan-20220424/`. No image leaves the machine. `battle_hd_ai_upscale.py` pins every hash and refuses to run when one differs; the full values are in `UPSCALER` and in the public provenance.

## Method

`battle_hd_ai_upscale.py`, per cell, in image orientation:

1. **Input.** The model sees an opaque RGB image whose pixels below alpha 4 take the alpha-weighted colour of the nearest visible pixels (colour bleeding), so no dark fringe enters an edge, and the alpha channel as a separate grey image. Both are padded by 8 edge-replicated pixels, as the atlas extrudes its cells, and the padding is cropped after the model. The model always runs at 4x.
2. **Alpha (`edge` mode).** The model's alpha is used where the native alpha changes by at least 160 within a 3x3 neighbourhood (a silhouette edge), Lanczos-interpolated alpha where it changes by at most 64 (glows and soft gradients), linear between. The anime model hardens soft alpha and rounds faint alpha to zero: with its alpha alone the 166 glow streak lost its faint tail (native alpha IoU 0.943, against 0.998 in `edge` mode).
3. **Source-range clamp.** Every channel of the 4x result is clamped to the minimum and maximum of the native pixel's 3x3 neighbourhood (bled colour and alpha). The model may move and sharpen a transition but not overshoot it. Without the clamp it drew new dark orange lines along the plate edges of species 259; with it they are gone.
4. **Multiplier.** 4x is the model output; 2x is its premultiplied 2x2 box reduction; 8x is the 4x result enlarged 2x by Lanczos and clamped again. The model's own detail stops at 4x: a second model pass measured worse against the vector renders (below) and costs four times the GPU time.
5. **Colour under zero alpha.** The battle shader interpolates straight RGBA (`swf-renderer`, texel fetch then `rgb *= a`), so a transparent texel's colour bleeds into the edge. V60 tiles keep the model's (bled) colour under zero alpha instead of black; the lossless WebP output keeps it (`exact`).

### Calibration against original vectors

`calibrate_battle_hd_ai_gates.py` samples 360 known-good original-vector cells from 120 species (seed `v60-calibration`; 230 rendered at 4x, 130 at 8x; native size 8 to 256 px). For each it has the Unity raster and the real vector render at the same multiplier. It upscales the raster with each method and compares the result with the vector render. The Unity raster and the vector render can differ by a subpixel registration, which rewards blur in a plain error, so each pair is aligned by the integer shift (within half a native pixel) that best matches the Lanczos baseline. Means over the cells (alpha IoU at alpha 16; premultiplied RGBA error and gradient error on 0 to 255; sharpness ratio is the gradient magnitude against the vector render's):

| Method | Cells | Alpha IoU | Premultiplied error | Gradient error | Sharpness ratio | Closer than Lanczos | Gate pass |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lanczos, 4x | 230 | 0.957 | 8.72 | 10.77 | 0.894 | | |
| Model alpha, 4x | 230 | 0.978 | 7.84 | 9.32 | 1.086 | 41.7% | 100% |
| `edge` alpha, 4x | 230 | 0.979 | 7.69 | 9.36 | 1.086 | 47.0% | 100% |
| **`edge` alpha + clamp, 4x (V60)** | 230 | **0.979** | **6.31** | **8.77** | 0.925 | **97.8%** | **100%** |
| Lanczos, 8x | 130 | 0.802 | 24.76 | 18.96 | 0.775 | | |
| `edge`, second model pass, 8x | 130 | 0.895 | 21.48 | 21.21 | 0.980 | 67.7% | 86.9% |
| `edge`, 4x + Lanczos, 8x | 130 | 0.900 | 19.77 | 19.83 | 0.993 | 81.5% | 93.1% |
| **`edge` + clamp, 4x + Lanczos, 8x (V60)** | 130 | **0.898** | **19.77** | **19.17** | 0.882 | **90.8%** | **92.3%** |

The full table, including the `blend` and `lifted` alpha modes, is in `artifacts/battle-hd-ai-v60/calibration.json`. The 8x cells are small or thin parts at native size, so every method is further from the vector render there.

## Gate

Each tile is reduced to the native cell size with the same premultiplied box filter and compared with the original pixels:

- alpha IoU (alpha > 16) at least **0.8664**,
- premultiplied RGBA mean error over the foreground at most **21.5582** (0 to 255),
- largest mean error of a 3x3 block at most **74.4794**,
- the pipeline's stable-interior colour check (`battle_hd_local_fidelity.py`, unchanged limits) passes.

The three thresholds are the 5th (IoU) and 95th (errors) percentiles of the same measurements on the 360 vector renders of the calibration: an AI tile must agree with the original raster at least as well as 95% of real source renders do. (Their 1st/99th percentiles, 0.795/32.99/108.8, were the first candidate; the tighter tail was chosen because an AI tile is derived from the raster itself.) A cell that fails keeps its original pixels, and its measurements stay in the report. On the calibration cells the V60 method passes 100% at 4x and 92.3% at 8x.

## Selection and budget

`build_battle_hd_ai_atlases.py` works from the published HD atlas of each species (V59, V44, or the 910 composition) and the report that produced it. The base metadata must equal the original metadata remapped by that report's layout, so the base placements are proven. A cell is eligible only if its published tile is byte-identical to its original Unity crop (a retained raster; the report mode must agree) and its largest on-screen size at the reference display (280 CSS px x zoom 1.5 x DPR 2, `audit_battle_hd_density.py`) is below one texel per device pixel. It is upscaled to the smallest of 2x, 4x and 8x that reaches the target, 8x when none does. Cells under 4 px on a side or 64 px in area keep their original pixels ("too small").

Source cells keep their published size; AI cells use only the decoded budget they leave (128 MiB, packed by the generator's `pack_rows`). Over budget, the largest AI cell outside the first standby pose halves first, then first-pose cells; at 1x a cell returns to its original pixels. The three species whose published atlas already uses the original-size budget exception (375, 431, 502) are left out. Metadata changes only in UVs and atlas size.

## Outputs and publication

`<id>-v60.webp` (lossless WebP that keeps the colour under zero alpha, about 60% of the size of a PNG of the same pixels) and `<id>-v60.json.gz` in `public/battle-animations/hd/`; V44 and V59 files stay. Per-species reports are in `.cache/battle-hd-v60/species/<id>/report.json`. The publisher (`publish_battle_hd_atlases.py`) validates a V60 report against its base: original inputs and outputs by digest, exact UV-only metadata change, standard budget, every non-AI tile equal to the base tile with the base report's mode, every AI tile replacing a published original raster at 2x/4x/8x, its gate recomputed from the published atlas and equal to the recorded one, the pinned method and gate, and every atlas pixel and padding byte. Tampered copies of the 166 report (changed metrics, a vector cell relabelled as AI, a loosened gate, another model digest, a changed base, a 16x scale, a changed mode) are each rejected. The manifest counts `aiUpscaledCells`, `firstPoseAiUpscaledCells` and `firstPoseNonconstantFullyAboveNative` per species and in total (`aiUpscaled`); `public/battle-animations/hd/ai-upscale-provenance-v60.json` lists the method, gate, calibration digest and, per species, the report digest, base atlas and AI cells with their multipliers.

## Results

The V59 density audit found retained raster cells below the target in 916 species. V60 published 878 of them; every one passed the publisher's checks.

| | Cells | First standby pose |
| --- | ---: | ---: |
| AI-upscaled and published | 6,245 (3,209 at 4x, 2,039 at 2x, 997 at 8x) | 980 |
| ... reaching one texel per device pixel | 5,799 | |
| ... still below it (255 at the 8x cap, 191 reduced by the budget) | 446 | 9 |
| Original pixels: failed the gate | 303 | 16 |
| Original pixels: passed, but no room above 1x in the budget | 290 | 1 |
| Original pixels: too small | 278 | 32 |

Thirty-eight species got no V60 atlas: in 19 no AI cell survived the gate and the budget, 15 have only cells that are too small, and 4 (375, 382, 431, 502) use the original-size budget exception. Species 910 had no cell below the target, so its AI head cell is unchanged.

Density audit at the reference display, cells below one texel per device pixel (cells in species):

| Cause | First pose, V59 | First pose, V60 | Any frame, V59 | Any frame, V60 |
| --- | ---: | ---: | ---: | ---: |
| Original-vector cell, multiplier too low | 12 in 12 | 12 in 12 | 2,507 in 330 | 2,507 in 330 |
| Retained raster cell | 999 in 471 | 72 in 59 | 7,389 in 916 | 1,144 in 180 |
| AI-upscaled cell | — | 9 in 8 | — | 446 in 176 |

The 72 first-pose raster cells left are 32 too small, 16 gate failures, 1 budget drop, and 23 in species without a V60 atlas. Every nonconstant first-pose cell is now above its native resolution in 1,385 species (981 with source renders alone).

The manifest's cell modes are 37,638 original-vector, 6,245 `ai-upscaled`, 2,204 retained original, 92 constant, 2 microstrips and 1 `ai-source-bitmap`. The decoded size of the 878 atlases rose from 35,425 to 40,535 MiB in total; none exceeds 128 MiB. The 1,756 V60 files take 1,143 MB (1,006 MB WebP); because lossless WebP is smaller than the PNGs it replaces, the selected HD assets shrank from 1,712,112,799 to 1,668,952,399 bytes. The reports take 232 MB in the cache and the tool 119 MB. With the build's overlapped model runs the whole catalog took about 40 minutes on the M4 GPU.

### 166 and 303

闪光波克尔 (166) keeps 16 of its 20 raster cells as AI tiles: the 15 glow streaks of its embedded 150x147 bitmap and the sparkle. The first-pose glow streak is at 4x (native gate IoU 0.998, error 0.54); the budget holds 8 glow streaks outside the first pose at 2x; the 4 speed lines fail the gate. The glow is soft in the original, so the AI tile is cleaner and slightly crisper rather than sharp, with no halo: on a dark ground the before/after renders differ by 0.03 (first pose) and 0.04 (attack frame 41) in mean luminance, and the count of pixels darker than the ground changes by at most one. In the browser at 1920x1080 and DPR 2 its lowest first-pose density is 1.23 texels per device pixel (the vector body); the glow streak was 0.48 before.

丽莎布布 (303) has no raster cell below the target: its V59 atlas already reaches 1.29 to 1.94 texels per device pixel, and V60 does not change it.

### Evidence

- `artifacts/battle-hd-ai-v60/crops/`: software before/after device-pixel renders (`battle-hd-ai-crops.py`) of the first pose and the attack frame with the most AI area for 166, 36, 259, 11, 29, 549, 1256, 912, 300, 96, 614, 1486 and 1092 on dark and light grounds, with 3x zooms of 166, 259, 36, 11, 614 and 1092. Reviewed: faces and eyes keep their shapes, edges are crisper, motion-blurred and glow parts stay soft, cell borders that cut the original art stay cut, and after the clamp no new lines or halos appear.
- `artifacts/battle-hd-ai-v60/browser/`: `battle-hd-display.mjs` for 303, 166, 36, 259 and 11 in four viewports at DPR 2 (20 of 20 passed, no page or console errors, each loads its HD-index atlas), with the 166 V59/V60 browser crops side by side.
- Battle suites `battle-animation-hd-loader`, `battle-hd-memory`, `display-resolution`, `battle-display-lifecycle` and `battle-animation-registration` pass; `npm run typecheck` and `npm test` (154 tests) pass. The full `npm run verify` was not run.
- Audits `audit-before.json` and `audit-after.json`, the calibration, the build and publication logs and `publisher-tamper-166.json` are in `artifacts/battle-hd-ai-v60/`.

## Limits and open points

- The model output is not byte-reproducible on another GPU or driver. Transfer the V60 atlases, metadata and cache reports together; a regeneration must be revalidated by the publisher.
- Thin lines often fail the gate: the model thins or brightens them (the four 166 speed lines reach native IoU 0.64 to 0.80). They keep their original pixels.
- 8x tiles carry the model's 4x detail, enlarged; 517 cells would need more than 8x.
- AI cells only use budget left by source cells, so in atlases already near 128 MiB some stay at a lower multiplier or at 1x.
- The software crops follow the shader's sampling and colour transform but not WebGL multisampling; browser evidence is `battle-hd-display.mjs`.
- The calibration evidence (`artifacts/battle-hd-ai-v60/calibration.json`) is an ignored artifact; its digest is in the provenance.
- The V44 cache provenance gap described in the V59 note is unchanged.

## Reproduction

```sh
python3 tools/assets/calibrate_battle_hd_ai_gates.py
python3 tools/assets/audit_battle_hd_density.py --jobs 2 --output artifacts/battle-hd-ai-v60/audit-before.json
python3 tools/assets/build_battle_hd_ai_atlases.py --audit artifacts/battle-hd-ai-v60/audit-before.json --scope all --jobs 2
python3 tools/assets/publish_battle_hd_atlases.py --cache .cache/battle-hd-v60 --ids <built ids>
python3 tools/assets/summarize_battle_hd_coverage.py --verify-hashes --ids <built ids>
python3 tools/assets/build_battle_hd_ai_atlases.py --provenance
python3 tools/verification/battle-hd-ai-crops.py 166 --frames standby:0,attack:auto
HD_DISPLAY_SPECIES=303,166 node tools/verification/battle-hd-display.mjs
```

The builder needs the pinned tool in `.cache/tools/realesrgan-ncnn-vulkan-20220424/` (unpack the release archive there) and Pillow and NumPy. `--scope first-pose` limits it to cells below the target in the first standby pose. It runs one model batch per about 3 million native pixels of eligible cells, then the atlases, and deletes the batch's model outputs.
