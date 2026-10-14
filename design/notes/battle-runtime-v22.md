# Battle timeline runtime, revision 22

The runtime retains the pinned original-material renderer and original timeline clocks. It now controls their resource ownership and rendering cadence with repository-owned modules. Creature geometry, atlas files, action timing, facing, alpha-silhouette registration and command behavior are preserved. The full catalog asset delivery and integrated browser checks are documented separately.

## Renderer choice and measured cadence

`@seer-pet-anim/swf-renderer` 0.3.1 handles original mesh colors, alpha, blend modes, stencil masks, framebuffer effects and large-atlas tiling. Replacing it with a minimal shader renderer would require independent equivalence checks for those material classes. This pass preserves that implementation and mounts it with `clock: 'manual'`.

The previous standalone player started each Pixi application's automatic ticker/render loop and additionally rendered in `renderCurrentFrame()` on source-frame changes. The new `battle-runtime-clock.ts` advances both original clocks from one shared requestAnimationFrame callback. It draws when a source frame changes, or when an explicit sequence/layout invalidation needs a fresh frame. Paused scenes do not keep an active RAF. Completion and destruction stop their individual registrations. Original marker dispatch still comes from the vendor `PlaybackClock`.

The deterministic ten-second benchmark uses two original `PlaybackClock` instances with Rei's 24 fps, 75-frame attack and source hit/end offsets. At 600 simulated screen callbacks, the production scheduler performs **480 source-frame draws**, rather than the **1,200 minimum draws** implied by two 60 Hz application render loops: **60% fewer draws** against that conservative baseline. The previous additional source-frame renders are excluded from the baseline. This is a scheduler simulation, not a measured browser GPU-time improvement. All source hit markers remain dispatched. Raw results are in ignored `artifacts/battle-runtime-v22/lifecycle-benchmark.json`.

Per-frame geometry construction still belongs to the vendor renderer. It destroys and rebuilds meshes/geometries when a source frame changes. This pass removes redundant canvas drawing rather than claiming to eliminate that construction cost. Two native WebGL contexts remain; a combined renderer would require a separate layout/material-equivalence integration.

## Atlas and geometry ownership

`battle-clip-pool.ts` serializes decode work and shares one source clip between same-species owners. Acquiring a lease happens before asynchronous work. The final owner disposes its source unless an explicit short-lived preload/recovery lease requests warm reuse. Idle resources have a **two-entry, 32 MiB byte limit** and a **15-second expiry**; the budget includes decoded atlas pixels, typed geometry buffers and the compressed atlas Blob. Active players may exceed this idle budget because original large atlases are kept at full resolution.

The repository-owned `battle-offline-clip.ts` converts the exported offline JSON directly to Float32 and Uint16 mesh arrays, and the loader decodes ImageBitmap with `premultiplyAlpha: 'none'`. Only vendor TypeScript types are imported by this decoder. Its behavior matches the vendor's `atlasPrepared: true` conversion, without importing Unity bundle parsers, material extraction tools or parser workers into the runtime. This avoids the old full-atlas canvas readback, RGBA edge processing and bitmap recreation. In particular, an 8192-square atlas represents **256 MiB** of raw RGBA pixels. The runtime no longer intentionally alters the exported atlas pixels during loading.

For atlases of at least 16 MiB, each mounting player receives a temporary private ImageBitmap. The vendor synchronously uploads its textures and then closes its bitmap/tile pixels through `releaseAtlasAfterUpload`. This keeps one renderer from closing another player's pending source bitmap. Once every current source owner has finished uploading, the shared CPU bitmap closes too. The compressed Blob and typed geometry remain available. A later owner rehydrates the shared bitmap once, with concurrent requests sharing the same rehydration promise, and creates its private upload bitmap from that source.

After two large same-species players finish uploading, their large atlas CPU bitmaps should be zero, while their independent GPU textures remain allocated. Two 8192-square players necessarily retain approximately **512 MiB of atlas GPU storage** before driver overhead, render targets or mip/texture bookkeeping. Private upload copies increase transient decode/upload memory; they are explicitly tracked and are not presented as a peak-memory reduction. Geometry buffers are shared across same-species players. Browser-observed memory and pixel equivalence remain separate from the ownership simulation.

## Cancellation, fallback and context loss

Last-owner cancellation aborts pending fetches and removes queued work before it starts. A decoder that cannot stop immediately may finish; its returned resource is disposed if its slot was cancelled or replaced. Its completion cannot remove a newer slot with the same species ID. Cancelling one preload resolves that caller promptly without aborting another owner's shared request. Partial warm entries from a cancelled preload are removed when they have no live owner.

The entry API is `preloadBattleAnimations(species, { signal })`; only the first two unique initial opponents are preloaded. Missing or failed resources continue to resolve to the existing portrait fallback. Native timing is selected only while the live pool contains a decoded source clip.

WebGL context loss pauses the player, stops its clock registration and reveals the still portrait. A restored event requests a fresh player; a one-second recovery fallback also handles lost contexts that never restore. Each species receives at most two recovery attempts, and a species switch resets that budget. The old renderer is destroyed before its lease releases. Source geometry and the compressed atlas may stay warm during recovery, so a large closed CPU bitmap can be rebuilt without a source-bundle fetch. Rendering failures follow the same bounded recovery path and increment diagnostic error counts.

## Diagnostics and verification

`getBattleAnimationRuntimeStats()` is a read-only module API for tests and browser QA. It exposes load/hit/abort/failure/disposal counters; pending/queued/loading work; live leases; byte-accounted resources; decoded bitmap, typed geometry, compressed Blob and transient bitmap bytes; shared-clock draws/frame changes; player mounts/unmounts; context recoveries; rendering errors; and an atlas-only GPU byte estimate. It creates no global production UI or debugging control.

`node tools/verification/battle-runtime-lifecycle.mjs` passed these transactions using the production pool and clock:

- Two same-species owners share one decode and keep the CPU source alive until both uploads finish.
- Cancelling a preload settles promptly while another owner keeps its shared load alive.
- One thousand queued acquisition/cancellation operations perform zero decodes and leave no pending resources.
- An obsolete decoder that ignores cancellation disposes its late result without deleting a newer same-species slot.
- Byte pressure evicts idle entries while preserving a mounted owner's resource.
- Two native 24 fps clocks preserve marker dispatch and produce 480 draws over ten simulated seconds; final destruction leaves zero players and no scheduled RAF.

`node tools/verification/battle-offline-clip.mjs` passed bit-for-bit parity against the pinned vendor offline conversion for the complete species 1, 6, 70, 431 and 502 clips: **7,460 typed arrays** have identical byte representations, labels and submesh records. A separate full-catalog decoder compatibility replay validated all **1,483** original JSON timelines with zero failures; it is reproduced by adding `--all` to that command. Seven malformed-input fixtures reject incorrect identity, bitmap dimensions, scalar values, vertex attribute lengths, indices and submesh ranges. Missing pixels-per-unit defaults to 100; repeated disposal closes the bitmap exactly once. The decoder is a small repository-owned format transformation, rather than a copied vendor parser. Build-size improvements are verified separately by the production build.

TypeScript passed after this implementation. Actual WebGL upload/clone memory, same-species large pairs, forced context loss, repeated switching, visual pixel parity and scene exit require the integrated browser checks. This record deliberately distinguishes deterministic lifecycle tests from those GPU/browser observations.

## Integrated browser observations supplied by the parent delivery pass

The parent browser checks observed both ordinary species 1/70 ready with visible-alpha registration, a species 431/502 pair with **zero retained atlas CPU bitmap bytes** and approximately **512 MiB atlas-only GPU storage**, and a same-species 431/431 pair sharing one source resource with two leases and zero retained CPU bitmap bytes. Forced loss of the left context recovered both visible players with one rehydration and no recorded errors. These observations concern the manual renderer/ownership implementation before the small offline decoder replacement; the subsequent production rebuild and fresh browser checks remain the parent delivery's responsibility.
