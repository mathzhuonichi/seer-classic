# Original skill effects at high resolution

All 67 existing original skill effects now use individual lossless source frames with a 2,048-pixel longest edge. The 2,128-frame timeline, frame rate, representative frame, fixed viewport, actual battle target, scheduler duration and reduced-motion behavior remain tied to the existing effect metadata. The old sprite sheets remain available when a frame cannot load or decode.

## Source and fidelity

The original 67 SWFs total 1,610,579 bytes. Their SHA-256 hashes match the established source manifest. Frames are rendered from the named original display-list symbols without executing ActionScript. No generated artwork, recoloring, sharpening or particle reconstruction is used. Nine effects include embedded source bitmaps, whose original detail remains limited: `10038`, `10048`, `10076`, `10088`, `10129`, `10825`, `20016`, `20040`, `20181`.

FFDec 26.3.0's default blur performance limit reduces filter radii on sufficiently large renders. The exporter sets `boxBlurPixelsLimit=1000000000` for each command so the original scaled blur/glow parameters survive. This argument does not save a global FFDec setting. The behavior is documented by the pinned original [filter implementation](https://github.com/jindrapetrik/jpexs-decompiler/blob/version26.3.0/libsrc/ffdec_lib/src/com/jpexs/decompiler/flash/types/filters/Filtering.java), [configuration](https://github.com/jindrapetrik/jpexs-decompiler/blob/version26.3.0/libsrc/ffdec_lib/src/com/jpexs/decompiler/flash/configuration/Configuration.java), and [command parser](https://github.com/jindrapetrik/jpexs-decompiler/blob/version26.3.0/src/com/jpexs/decompiler/flash/console/CommandLineArgumentParser.java). Java runs with `-Dapple.awt.UIElement=true -Djava.awt.headless=true`.

The raster export's one-pixel viewport padding does not grow proportionally with zoom. Published frames therefore receive transparent right/bottom padding to the ceiling of the original fixed viewport times the source scale. Original painted pixels are neither moved nor resampled. The canvas keeps the old displayed aspect ratio and target placement.

Every frame was compared at the established source viewport. The 29 effects containing filtered placements were compared to a separate source-scale render with the same corrected filter limit; other effects were compared to their original published raster. All 2,128 source frames are present, with zero blank/nonblank mismatches. The comparison retains foreground color error, alpha mass, and two-pixel tolerant support coverage. Six effects triggered review in 14 frames (`10002`, `10250`, `20007`, `20015`, `20065`, `20500`); side-by-side and enlarged comparisons show thin particle edges or faint fade fragments. Their numeric flags and specific visual decisions remain in the HD manifest. This is source-fidelity review, not a claim that different-resolution rasters are pixel-identical.

SVG frame export was also evaluated. Some exports contain nonfinite filter values or duplicate resource IDs, and a source glow effect loses its filled appearance. Those candidates are not used by the game.

## Playback and bounded memory

`SkillFrameBuffer` requests the current frame and at most two following frames. A shared semaphore counts pending decodes and live `ImageBitmap` objects across moves, preventing a move change from briefly doubling decoded storage. Superseded frames are aborted; late results are closed; changing the clock frame clears previous pixels until the correct source frame is ready. Completion and unmount release bitmaps and reset the canvas backing store. Frame errors dispose the buffer before activating the existing sprite-sheet fallback.

At the maximum square frame size, three decoded frames use at most 48 MiB of pixel storage and one canvas uses 16 MiB. A separate compressed-frame LRU holds at most 16 MiB. These are explicit application-managed pixel/cache budgets, not a measurement or bound on total browser RSS, GPU copies or decoding overhead. All compressed frames total 302,346,508 bytes on disk; the application does not preload that inventory.

## Reproduction and checks

`tools/assets/export_skill_effects_hd.py` stages candidates only. It accepts a verified Java/FFDec toolchain, checks each official source hash, exports the exact source sequence, applies transparent viewport padding, and records every frame's dimensions and SHA-256. Use `--source-scale 1` for independent reference renders. Its resume check requires matching source, scale, filter policy, normalization and all frame hashes.

`tools/assets/publish_skill_effects_hd.py` requires complete numeric and visual-review reports. It validates all candidates and source hashes before writing public files or enabling HD metadata. `public/battle-effects/hd/manifest.json` records source identity, frame order, dimensions, bytes, per-frame hashes, the aggregate frame hash, viewport normalization and fidelity decisions. Existing atlas hashes remain unchanged.

Run `node tools/verification/skill-effects-hd-v44.mjs` for ordering, cancellation, cross-move decode limits, disposal, error fallback, compressed-cache eviction, all 67 source timelines, and all 2,128 published frame hashes/dimensions. Run `npx tsc --noEmit` for the component integration. The production exporter was also exercised on effect `10005` after its viewport normalization change.

An independent browser probe confirmed visible original fireball/glow frames, a peak of three live/pending decoded images during normal playback and move changes, and complete bitmap release at completion. Final integrated battle and accessibility-motion checks are recorded separately by the main task's browser validation.
