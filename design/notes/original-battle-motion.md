# Original battle motion delivery

The battle presentation now plays original Unity pet mesh timelines in the existing combatant positions. Scene artwork, combat calculations, command availability rules and encounter waiting deadlines are unchanged. Battle countdowns are excluded.

## Delivered resources and boundaries

The offline manifest contains **384** independently parsed creatures: every species in the **382-species union** of currently obtainable creatures and encountered opponents, plus two previously exported boss records. All first 30 starter-era species are included. The manifest explicitly describes each of the complete retained catalog's **1,483** species as ready, failed or not exported. This is not a claim of complete animation coverage for that catalog.

Original packages come from the official `newseer.61.com` PetAnimPackage manifest version `20260924034650`. Its cached source SHA-256 is `0cc084c17aff787208dc33f4ffe898785173fecf7b5f9eb35f216cc5ee303184`. Each exported record includes the source URL, source bundle hash, compressed timeline hash, atlas hash, frame rate and original action markers. The parser and player are pinned to `@seer-pet-anim/swf-bundle` and `@seer-pet-anim/swf-renderer` 0.3.1, with PixiJS 8.19.0. The standalone manifest reader is adapted from the MIT-licensed Nattsu39/seer-pet-viewer source, commit `b2135046c48245795bc218726fcbad1ea005f02d`.

No source geometry, colors or frame rates are quantized. Timeline JSON is compressed losslessly with gzip. The loader inspects response bytes: browser-decoded transport responses are parsed directly, while raw gzip from the portable static server is decoded once with native `DecompressionStream`. Atlases preserve original RGBA pixels as exact lossless WebP when smaller, retaining PNG otherwise. A decoded pixel-hash replay verifies every atlas. The delivered timelines total approximately **79.35 MiB**, and optimized atlases total **167.82 MiB**. The initial uncompressed timeline JSON occupied 661.48 MiB. Generated PNG, WebP and gzip assets live under the ignored public asset rules, while the coverage manifest is retained as source.

The source downloader limits concurrency to four and parses bundles sequentially. New source bundles have an 8 MiB size cap; the already recovered Dorag bundle, species 502, is the documented exception at 9,377,161 bytes. Its 8192-square atlas needs approximately 256 MiB of decoded RGBA memory. Complete palette, masking, camera choreography and visual fidelity across all 384 resources have not been independently certified. The parser reported no material warnings for the exported set.

## Lossless atlas optimization

Pillow 12.3.0 encoded WebP with `lossless=True`, `exact=True`, and `method=2`. Every result was decoded independently and compared with the original PNG RGBA digest, including RGB values under fully transparent pixels. The full sequential batch took approximately 212 seconds. Of 384 atlases, 380 became smaller WebP files and four retained their smaller PNG representation. Combined atlas bytes decreased from **233,903,848** to **175,975,333**, a **24.77%** reduction (approximately 55.24 MiB saved). Source Unity bundles and source bundle hashes were preserved. Only superseded generated PNG files were removed after all comparisons passed and the manifest was replaced atomically.

The representative sample independently compared full RGBA byte strings, rather than dimensions alone: starter species 1 and 6, Rei 70, species 132 and Dorag 502. Sample encodes took 0.1–0.7 seconds for smaller atlases, 7.3 seconds for species 132, and 15.0 seconds for Dorag. Dorag decreased from 19,699,125 to 9,673,088 bytes without changing its 8192-square decoded atlas or runtime memory requirement.

`tools/assets/optimize_battle_atlases.py` reproduces the optimization and performs pixel-hash replay with `--verify`. Atlas path changes are consumed by the existing manifest-based ImageBitmap loader.

## Runtime behavior

`standby`, `attack`, `sa`, `cp` and `hited` map to idle, physical attack, special attack, status action and hit reaction respectively. A missing sequence falls back to `standby`; missing assets or renderer initialization failures retain the existing still portrait and CSS motion. Reduced-motion settings pause source playback and retain the existing abbreviated presentation queue.

The native timeline uses one fixed scale and registration calibrated from the visible alpha silhouette of its first original standby pose. The player renders that pose once and reads a small canvas RGBA buffer; it does not copy the complete source atlas. A standby mesh-union registration is the fallback when GPU readback is unavailable. Attack and hit frames retain that registration rather than refitting on every frame. The existing enemy facing wrapper mirrors the source exactly once. A padded transparent canvas admits source action excursions without changing the creature's apparent resting size. Canvas layout uses `clientWidth` and `clientHeight`, which exclude transient CSS transforms: using `getBoundingClientRect()` during a switch-in scale animation had incorrectly positioned and shrunk species 6 until this correction. No species-specific manual offset was introduced.

When an action is followed by a hit record, damage feedback begins at the original `action_hit` offset where available. The source attacker continues through the remaining action tail while the defender plays its reaction. The visual queue waits for that source action tail before advancing. Native source timing is selected only while the live clip pool contains a decoded resource, so missing or failed resources retain the existing shorter CSS presentation durations. Source markers change presentation timing only; the combat engine still creates and settles the same mechanical events.

Entry preloading accepts only the first two initial opponents, and decoded atlas construction is serialized. A player acquires its clip before awaiting the load and releases it after destroying its renderer. Reference counts prevent closing an atlas shared by both combatants. Unclaimed preloads expire after 15 seconds; unused entries are explicitly disposed, including their ImageBitmap, rather than merely removed from a cache. Mounted creatures can retain the same species clip while independent players perform different actions.

Battle audio is scheduled with visual events through the shared audio service. The parent integration owns original skill effects and final outcome/capture sound semantics; those are reported in their respective delivery records.

## Reproduction and verification

- `node tools/assets/export_battle_animation.mjs --playable` reuses cached official sources and the current playable target list. Numeric species IDs can be supplied explicitly. The exporter checkpoints successes and failures in the public manifest, then runs exact atlas optimization. Set `SEER_ASSET_PYTHON` to a Python interpreter with Pillow if the cached extraction environment is unavailable.
- `node tools/verification/battle-animation.mjs` independently checks 384 source identities, all timeline/atlas hashes, decoded atlas dimensions and recorded RGBA pixel hashes, 100,735 valid mesh frames, 1,151 source hit markers and the explicit 1,483-species coverage matrix. Rei's physical/special impact offsets agree with the earlier browser specimen.
- `node tools/verification/battle-animation-transport.mjs` exercises the production decoder with raw gzip, already decoded gzip and plain JSON. Additional live tests passed against Vite at port 1421 and an isolated copy of the unmodified `distribution/start.py` launcher: the former sends `Content-Encoding: gzip`, and the latter serves unencoded gzip bytes. The temporary launcher was stopped after the check.
- `node tools/verification/battle-animation-registration.mjs` checks production transform centering and silhouette extent for species 1, 6, 70 and 502, and tests Retina alpha-readback orientation. This is a numerical helper check; integrated GPU/browser placement remains a separate check.
- `npx tsc --noEmit` passed after the component and ownership implementation.

These checks establish offline asset integrity and type correctness. Live two-combatant placement, battle return and renderer teardown require the integrated browser checks recorded by the parent delivery pass.
