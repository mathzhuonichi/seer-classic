# Original-source HD battle animation

The V44 battle upgrade replaces matched texture cells with fresh renders of the original Flash vector geometry. It retains the official Unity animation metadata: frame count, frame rate, sequence names, labels, vertex positions, transforms, colors, materials, and action timing. Only atlas dimensions and UV coordinates change. The general recovery pipeline uses the original sources. A separately reviewed exception reconstructs one original bitmap body cell of species 910 with AI, as described below.

The original runtime catalog contains 1,483 species. All 1,483 corresponding official combat SWFs were recovered and hashed; static inspection exported 49,634 shapes without running Flash or ActionScript. Sixty-three source files contain morph characters, and 23 contain bitmap definitions. A bitmap definition does not imply that the creature body is a bitmap: many are shared glow or particle effects. Species 910 does have original bitmap body parts, so a static portrait reconstruction cannot be substituted into its moving animation.

The compact public coverage manifest is `public/battle-animations/hd/manifest.json`. Its state counts distinguish source recovery, a generated candidate, actual resolution improvement, failed candidates using the original runtime, and entries selected by `public/battle-animations/hd/runtime-index.json`. Each species records source, original-input, generated-output, and detailed-report hashes, cell counts by source mode and scale, retained-cell reasons, and first-standby-pose coverage. A recovered SWF or a source-vector cell rendered at 1x is not counted as a resolution improvement. The complete per-cell records remain in ignored `.cache/battle-hd-v44/species/<id>/report.json`; the accepted initial species 346 uses its separately recorded prototype report.

## Final published coverage

The final HD index selects all 1,483 species, with a matching pixel-and-metadata validation record for every entry. Of those species, 525 use only original-vector cells and optional constant-color cells, 957 combine original vectors with retained original pixels, and species 910 combines original vectors, retained pixels, and its one approved AI body cell. Selecting an HD atlas does not imply that every cell in it has new high-resolution detail.

The 46,182 unique atlas cells are classified as follows:

| Cell source | Count | Actual resolution |
| --- | ---: | --- |
| Original vectors | 37,637 | 30,674 at 4x; 6,509 at 2x; 454 at 1x |
| Retained original pixels, including two native microstrips | 8,452 | Native 1x |
| Exact constant RGBA values | 92 | 91 at 4x; one at 1x; no new image detail |
| Independently reviewed AI bitmap | 1 | 2x; separately identified reconstruction |

Thus 37,183 cells gain actual original-vector resolution. All nonconstant cells of the first standby pose are higher resolution in 981 species; all nonconstant cells throughout the atlas are higher resolution in 524 species. The local color gate recovered 32 cells through a distinct passing original-source alternative. No original bitmap qualifies for a native-source resolution increase in this catalog.

The accepted atlas PNGs and compressed metadata total 1,568,189,395 bytes, or about 1.46049 GiB. This excludes source exports, render caches, and additional AI evidence. The final manifest was generated with `--verify-hashes`, and all 1,483 entries have `validatedPixelsAndMetadata: true`. The standard publisher validated and added 1,470 entries in its final pass; the twelve prior accepted entries and the separately published species 910 complete the catalog. The original runtime index remains unchanged.

## Source matching and fidelity limits

The exporter uses JPEXS FFDec 26.3.0 in headless CLI mode with `java.awt.headless=true` and `apple.awt.UIElement=true`. It extracts original curves, fills, gradients, and source display-list state. Native resvg renders those vectors with system-font loading disabled; these assets use paths rather than device-font substitution.

Candidates include complete source shapes, disconnected components, statically composed vector children with original depth and matrices, and the exact morph ratios found in the source timeline. Morph recovery produced 2,220 states across the 63 applicable species. Unsupported masks, filters, color transforms, or bitmap compositions are not invented by the static-composite helper. Their unmatched runtime cells retain the original pixels.

Matching compares compatible source bounds and normalized premultiplied RGBA fingerprints, then renders the selected vector at the original cell dimensions for a second silhouette and color comparison. It fits a uniform source-to-Unity scale rather than assuming powers of two: original outer-sprite matrices and Unity raster density produce factors such as 1.5 or 1.57. Both fitted dimensions must still agree within two native pixels. Near-duplicate candidates are checked in the region where they differ. Candidates whose contours or colors cannot be distinguished reliably remain original raster cells. Different component groups of one Flash character undergo the same ambiguity test; only identical vector bytes can bypass it.

A final local check protects small interior details from being diluted in a whole-cell average. It selects original opaque 3-by-3 neighborhoods whose channel ranges are at most 24, then searches within one pixel of each candidate position for an opaque color match. A four-connected region of six or more pixels whose best mean RGB error exceeds 24 rejects that replacement. After such a rejection, the generator can test the other source candidates from its bounded top-four shortlist through the same silhouette, overall-color, and local-color gates. Multiple visibly distinct passing alternatives remain ambiguous and retain the original pixels.

This caught the species 201 hit-state cell whose green oval had been replaced by a brown sprite combination. The original complete `13-full` shape passes all checks and has zero mismatched stable interior pixels; the competing empty-slot shapes fail. That original vector now replaces the rejected combination, preserving the green oval while recovering its real vector detail. The publisher recomputes the local check independently from the saved generation result.

This is source-faithful reconstruction with a documented raster comparison, not a claim of pixel identity with Unity's original antialiasing. Source filters, tightly clipped outlines, subpixel registration, tiny texture strips, or a Unity-precomposed image can prevent a reliable match. The manifest reports these remaining cells instead of labelling them as new HD detail. A bitmap-fill rectangle is not counted as vector art. A proven original bitmap with more intrinsic pixels than the Unity cell can use a separate native-source recovery mode, capped by those actual pixels. Equal-resolution bitmaps and unproven mixed compositions retain their original cells. In particular, the green-lightning bitmaps in species 214, 288, and 338 already have their original pixel dimensions in the Unity atlas, so rendering their SVG wrappers at 2x or 4x would not be new detail and is not accepted.

## Scale, atlas layout, and unchanged animation

Matched cells whose longest original dimension is at most 256 pixels normally render at 4x; larger cells normally render at 2x. Every output atlas is limited to 8,192 pixels per side. The standard decoded RGBA budget is 128 MiB. Exactly seven pinned species, 375, 382, 431, 498, 502, 811, and 1202, already have original 8,192-square atlases using 256 MiB. Their separate recovery pass may use up to their verified original decoded byte count, never more. It searches the existing width/order packings for the smallest result at the accepted cell resolutions and records old and new dimensions and bytes. The publisher requires the pinned ID, actual original 8,192-square pixels, and explicit exception provenance; the larger budget is not available to another species.

Two simultaneous standard atlases can therefore use up to 256 MiB of GPU texture storage, while two of the seven original-budget exceptions can use up to 512 MiB. Those figures exclude other scene textures and transient loading buffers. The exception permits the original budget; each actual output size is recorded separately.

To fit its applicable budget, the packer reduces large transient cells before small or first-pose body parts. The selected multiplier is recorded per cell, including vector renders reduced to 1x. Unmatched raster cells stay at native resolution. A genuinely constant RGBA cell can extend its exact constant value, which adds no new image detail and is counted separately. First-pose coverage counts every UV cell and separately identifies constant cells; the nonconstant completeness fields do not silently omit small details.

Packing preserves orientation and the original UV rectangles, with no rotation. Every cell receives two pixels of edge extrusion, including the original alpha channel. A verifier compares every content and padding RGBA byte with its expected tile and proves non-overlap. The UV conversion follows the renderer's `UV * (atlasSize - 1)` sampling convention; pixel boundaries use the corresponding half-pixel offset. The exact remapped metadata is compared against the output metadata, so any change beyond UVs and atlas dimensions fails validation.

The optional loader validates the HD metadata and decoded atlas before selecting them. A missing or invalid HD asset falls back to the original assets; cancellation does not initiate a fallback load. Shared CPU atlas pixels close after GPU upload, and large atlases use the renderer's existing texture splitting. See [the runtime ownership review](battle-hd-runtime-review-v44.md) for the verified preload, cancellation, private-copy, and resource-release boundaries.

## Validation and publication

Generation never adds an asset to the runtime index. The separate publisher requires explicit reviewed species IDs, rechecks actual source and output hashes, rejects changed candidate manifests or additional candidate dependencies, and verifies that the selected SVG still has the digest saved when the atlas was built. It then checks the exact metadata transformation and every atlas pixel, including transparent padding. An atlas with no verified original-source cell above 1x cannot be published through this publisher as an HD improvement. The original runtime index remains byte-identical.

The initial browser acceptance covers species 1, 346, and 729, including poses and expression states. Species 346 was also exercised through the real battle flow with a skin, two attacks, and a completed battle. A forced 4,096-pixel texture limit exercised four split textures and completed playback without retaining CPU decoded pixels. Its 340 offline frames, 1,394 quad occurrences, and 96 unique cells preserve the original animation metadata. Browser sampling establishes those inspected playback cases; the full-catalog structural checks do not claim visual inspection of every frame of every species.

The final revision 6 source-only browser review freezes ten representative candidates: 10, 78, 86, 164, 201, 214, 291, 300, 910, and 1249. For each candidate it compares the first, middle, and last pose of five actions, totaling 150 original/HD pose pairs. The acceptance record binds the exact source-only report, metadata, and atlas digests. Species 910 then undergoes the separate AI-body review described below; that later composition does not alter the frozen source-only candidate.

Independent checks include the publisher's rejection of changed or missing candidate provenance, resume invalidation after source-policy or output changes, selected expression and near-duplicate candidates, retained-cell pixel identity, and RGBA padding. Evidence lives under ignored `artifacts/battle-hd-v44/`, `artifacts/battle-animation-hd-v44/`, and `artifacts/battle-hd-loader-v44/`. Final published coverage and remaining original cells must be read from the manifest generated with the accepted index.

## Species 910 bitmap exception

The original species 910 body uses embedded bitmaps. Its Unity atlas already enlarges those source pixels, so another source render cannot recover finer body detail. The accepted separate reconstruction uses only the AI redraw of source bitmap 19, the large head/body component. Two redraw attempts for additional small parts introduced highlights, heavier outlines, or shading; those parts retain their original pixels. The final composition contains eight original-vector cells, seventeen retained original cells, and one AI-reconstructed bitmap cell. AI reconstruction is counted separately from original-source resolution recovery.

The composition preserves the frozen source-only atlas cell registration and every non-AI cell pixel, including transparent RGBA values. It retains all 197 animation frames and 2,434 quad occurrences, with the same non-UV metadata. The accepted atlas is 3,323 by 3,751 pixels. Actual WebGL comparison covered fifteen original/HD pose pairs from five actions; the minimum alpha intersection-over-union was 0.9888 and the largest mean premultiplied RGB error was 4.86275 on a 0–255 scale. The review also confirmed that CPU decoded pixels closed after upload. This is sampled playback evidence, not a claim that AI reproduces the original vector geometry or that every frame was individually inspected.

The separate composition report and verification are under `.cache/battle-ai-910/composition/`; compact public provenance is `public/battle-animations/hd/910-ai-provenance-v44.json`. Browser evidence is `artifacts/battle-animation-hd-v44/species-910-ai-head-review.json` and its contact image. The runtime override binds the accepted report, verification, source-only report, metadata, and atlas by digest. A prompt does not reproduce the accepted AI pixels byte for byte: transfer the accepted generated bitmap, atlas, and provenance together.

## Reproduction and transfer

Use the project's Python environment when present, otherwise `~/.venvs/base/bin/python`, with Pillow and NumPy managed through `uv`. Native resvg and the pinned Java/FFDec runtime are recorded in the existing portrait toolchain cache.

The following commands document the candidate-production order used before publication in a prepared workspace. They require the recovered source SWFs, toolchain and resvg caches, and `.cache/battle-vector-prototype-346/all-source-inventory.json`; they are not a clean-checkout bootstrap script. The delivered HD index freezes published species: the normal generator skips them, and the seven-species exception helper refuses to overwrite them. Independent regeneration therefore needs an isolated worktree with its own candidate-only empty HD index and the recovered inputs. Do not clear the delivered index in the active checkout.

```sh
~/.venvs/base/bin/python tools/assets/recover_battle_shapes.py \
  --java /path/to/pinned/java --ffdec /path/to/pinned/ffdec.jar --jobs 2
~/.venvs/base/bin/python tools/assets/battle_morph_candidates.py --ids all-morph
~/.venvs/base/bin/python tools/assets/battle_morph_candidates.py --ids all-morph --verify-payloads
node tools/assets/battle_morph_candidates.mjs all-morph
~/.venvs/base/bin/python tools/assets/build_battle_hd_atlases.py --resume --jobs 2 --skip-ids 910
~/.venvs/base/bin/python tools/assets/recover_original_budget_battles.py
~/.venvs/base/bin/python tools/assets/publish_battle_hd_atlases.py --ids <reviewed-comma-separated-ids> --check-only
~/.venvs/base/bin/python tools/assets/publish_battle_hd_atlases.py --ids <reviewed-comma-separated-ids>
~/.venvs/base/bin/python tools/assets/summarize_battle_hd_coverage.py --verify-hashes
```

The generator prepares static sprite candidates for each species before matching and merges the pinned morph candidates. Its resume check includes source and original-input hashes, merged and additional candidate manifests, the actual generator/helper source hashes, generation policy, budget, and actual output digests. Published entries are frozen and skipped by generation. Source hashes must match the recorded versions before a regenerated result can be treated as the same recovery. Publication validation is bound to the exact report, atlas, and metadata hashes; a changed candidate cannot inherit an earlier check-only validation.

The separate species 910 composition can be rebuilt from the accepted public bitmap and provenance together with its frozen source-only cache, original source PNG, parts manifest, and browser evidence. The finalizer prefers the accepted public PNG, so the original image-generation home directory is not required. The following command recomposes and seals that already reviewed one-part choice; it neither generates another AI image nor publishes the runtime index:

```sh
~/.venvs/base/bin/python tools/assets/build_battle_ai_910.py \
  --parts .cache/battle-ai-910/first-three.json --bitmap-ids 19 --scale 2 --finalize
```

Large PNG atlases, compressed animation metadata, exports, fingerprints, render caches, and full cell reports are ignored generated data. Git stores the source tools and compact provenance/index files. To move the exact accepted result, transfer these generated assets and their matching cache reports with the checkout. A clean source-only checkout needs regeneration and validation before its optional HD entries become available; the loader retains original-asset fallback during that boundary. Regeneration from unchanged vectors and pinned tools is reproducible at the source level, while a future renderer or toolchain version can change antialiasing and must be revalidated.
