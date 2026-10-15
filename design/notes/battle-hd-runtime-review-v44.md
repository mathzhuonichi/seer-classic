# HD battle runtime ownership review

The optional HD loader uses the dimensions of the decoded, validated HD clip for CPU ownership, large-atlas handling, and renderer accounting. It does not reuse the original runtime index dimensions for memory decisions. Original sequence metadata remains the timing source because the HD publication contract preserves every sequence and frame.

The targeted review found one cancellation boundary in `prepareForMount`: when an owner released its lease while a warm atlas was being decoded again, the completed decode was still copied into a private bitmap before the existing cancellation check closed both bitmaps. There was no persistent bitmap leak, but this allocated one unnecessary full-size HD copy. The method now checks `lease.released` immediately after `ensureBitmap` resolves. Its existing `finally` releases the protective hold, which closes the late decoded bitmap when no owner remains.

The production-module fixture uses the accepted species 346 entry, its real timeline, and its actual compressed atlas bytes. `ImageBitmap` creation and closure are controlled so each outstanding owner can be asserted. The following values were observed:

| Measurement | Bytes |
| --- | ---: |
| Original 4096 by 2048 atlas pixels | 33,554,432 |
| Repacked 5376 by 5782 atlas pixels | 124,336,128 |
| Pool peak during initial preload, including geometry and compressed atlas | 126,707,289 |
| Warm idle residency after CPU atlas pixels close | 2,371,161 |
| Private copy avoided after cancellation during rehydration | 124,336,128 |

The three targeted checks in `tools/verification/battle-hd-memory.mjs` pass: warm preload charges the new dimensions and releases CPU pixels; a subsequent mount accounts for the shared and private HD bitmaps separately and releases them after upload; cancellation during rehydration creates no private copy and leaves zero resources, leases, or open bitmaps. The recorded result is `artifacts/battle-hd-loader-v44/memory-review.json`.

Source inspection also confirms that failed HD attempts close decoded pixels before original-asset fallback, caller cancellation cannot trigger a fallback request, a stale completed pool load is disposed, and partial tile decoding closes its already-created tiles. Those paths were covered by the earlier loader and browser checks; the 22 loader groups were not repeated for this one-line change.

These numbers are runtime ownership accounting, not an operating-system heap measurement. The pool peak excludes private copies and GPU allocations; both are exposed separately by runtime diagnostics. Driver allocation overhead, browser decode temporaries, render targets, and the one-pixel overlap of tiled textures are outside this fixture. The separate real-browser acceptance covers upload, tiling, and visual playback.

The following publication measurements are an intermediate index snapshot from 2026-10-15, not a claim about final generation or publication coverage. At inspection, `public/battle-animations/hd/runtime-index.json` contained three entries, occupied 1,083 bytes, and had SHA-256 `652515d7fcf478e278703a086d51e3923a5f721bb016d515f656f75354550c12`.

| Published species in this snapshot | Atlas dimensions | Logical RGBA bytes | Logical MiB |
| --- | ---: | ---: | ---: |
| 346 | 5376 by 5782 | 124,336,128 | 118.58 |
| 729 | 2558 by 5398 | 55,232,336 | 52.67 |
| 1 | 592 by 4180 | 9,898,240 | 9.44 |

The eager import reads only the index JSON. Atlas and animation metadata requests originate in the pool's per-species loader; adding index entries does not fetch every atlas. The battle preparation call passes its two combatants, `preloadBattleAnimations` deduplicates and takes at most two IDs, and the pool serializes loads. Idle reuse remains limited to two entries, 32 MiB including retained pixels, geometry and compressed atlas blobs, and 15 seconds.

For this snapshot, the largest distinct pair is species 346 and 729. Its logical GPU atlas pixels total 179,568,464 bytes (171.250 MiB). The renderer's actual tile plan at a 4096 texture-side limit adds overlap pixels, giving 179,623,332 bytes (171.302 MiB) across six textures. A conservative sum of explicitly owned source pixels, private or tiled pixels, and uploaded pixels during mounting is 513.854 MiB for that pair with this tile limit. After both uploads, these large CPU atlases are closed. This estimate excludes compressed blobs, geometry, framebuffers, browser decoding temporaries and driver overhead; it is not a total-process memory upper bound. Small atlases below the large-atlas threshold may retain their CPU pixels.

At the time of this snapshot, the publication validator rejected an HD atlas larger than 8192 on either side or above 128 MiB of logical RGBA pixels. The unchanged original index contains seven 8192 by 8192 atlases (species 375, 382, 431, 498, 502, 811 and 1202), each representing 256 MiB of logical RGBA pixels. A fallback battle must be accounted for using its actual original dimensions.

The subsequently authorized final policy permits only those seven named species to use at most their original decoded RGBA size, up to 256 MiB, while all other species retain the 128 MiB limit. The final audit must verify the exact exception whitelist, the original and new dimensions and RGBA byte counts, and that no exception exceeds its original memory use. A universal 128 MiB HD limit or 256 MiB two-actor texture limit therefore does not describe the final policy. Two exception species can total up to 512 MiB of logical atlas pixels before tile overlap and other allocations; this preserves their existing original atlas bound rather than increasing it. The three-entry measurements above remain valid only for their recorded snapshot.

After every generator and publisher was frozen, `tools/verification/battle-hd-final-index.py --frozen` passed for all 1,483 published species. The audit read every published metadata and atlas digest, every PNG size and metadata load identity, and joined the final index, coverage manifest, source reports and publication-validation records. It confirmed that the original runtime index is byte-identical to baseline `00a93ec` and that all audited indices and manifests remained unchanged during the run. The recorded result is `artifacts/battle-animation-hd-v44/final-index-audit.json`.

The final HD index SHA-256 is `05b1cf1914fbcbf642ab9fa553fbe54dc7e21602cd30aa2b2352f9a8b71d9553`; the final coverage manifest SHA-256 is `d466346ad295dcf44f15227744e2b4ef15addd672f64be90c4a670815408212a`. All 1,483 manifest entries are `published-hd`. The cell classification is 37,637 original-vector cells, 8,450 retained original cells, 92 constant-RGBA cells, two retained native microstrips and one accepted AI bitmap. Species 910 uses only approved head bitmap 19, with eight original-vector cells and 17 retained cells; its source-only report and output bytes remain intact.

All seven memory exceptions have verified original dimensions of 8192 by 8192, or 268,435,456 decoded RGBA bytes each. Their final atlas sizes are:

| Species | Final atlas dimensions | Final logical RGBA bytes |
| --- | ---: | ---: |
| 375 | 8192 by 8192 | 268,435,456 |
| 382 | 7680 by 8191 | 251,627,520 |
| 431 | 8189 by 8192 | 268,337,152 |
| 498 | 8185 by 8186 | 268,009,640 |
| 502 | 8192 by 8192 | 268,435,456 |
| 811 | 7936 by 8192 | 260,046,848 |
| 1202 | 7936 by 8187 | 259,888,128 |

Every other published atlas is at most 128 MiB. The largest distinct pair, species 375 and 502, therefore retains the existing 512 MiB logical atlas-pixel bound before tile overlap and other allocations. This final audit links the completed pixel and metadata validation through exact whole-file hashes; it does not repeat those reconstructions. Actual GPU and browser review remains representative rather than individual visual certification of all 1,483 species.
