# Full retained dex battle motion delivery, revision 22

The offline battle motion manifest now contains all **1,483 retained species**, including the **1,099** species that were not included in the earlier 384-species delivery. No retained species is represented by a synthesized pose or substituted creature. Each entry preserves the original official source identity, source action sequence names, frame rate, action hit markers and original atlas pixels.

## Source and export process

The source is official PetAnimPackage version `20260924034650`, manifest SHA-256 `0cc084c17aff787208dc33f4ffe898785173fecf7b5f9eb35f216cc5ee303184`. The preceding [full dex source audit](full-dex-animation-audit.md) freshly checked the version and manifest and verified all 1,483 official CDN URLs with matching HTTP content lengths. All retained IDs match both their prefab and named pet bundle; the actual catalog includes IDs through 1499 and is not a contiguous range.

The resumable exporter now supports `--all`, targeting the actual retained catalog. It preserves ready entries, prefetches at most four source bundles, parses one species at a time, and publishes timeline files, atlas files and the full manifest through temporary-file replacement. New entries record the manifest file hash, source size, source SHA-256 and original decoded RGBA hash. Cached and newly fetched sources are checked against official manifest size and MD5, as well as the UnityFS signature. The source-size exceptions are restricted to IDs 431 and 502; both have independently verified official inputs. Missing requested clips cause the completed export command to fail.

The renderer imports a compact `runtime-index.json` projection containing only source-independent runtime paths, frame rate, atlas dimensions and sequence summaries. The authoritative `manifest.json` retains complete provenance, hashes and explicit catalog coverage. Export checkpoints and subsequent atlas optimization regenerate the projection; any later timeline-format migration must regenerate both.

Atlas optimization retains exact original RGBA pixels. A candidate lossless WebP is decoded and compared against the recorded RGBA SHA-256; it replaces PNG only when smaller. PNG remains otherwise. File and manifest publication is atomic, and generated PNGs are removed only after verified replacement is published. The optimizer no longer requires an aggregate savings threshold, so resumed or small incremental passes retain every individually beneficial verified conversion.

## Verified asset coverage and measured size

The completed export has **1,483 ready species**, **zero failed or missing species**, **zero material warnings**, and all five standard source actions for every species. Full structural replay passed for **340,780 mesh frames** and **4,447 action hit markers**, including all timeline, atlas and cached official source hashes.

Before any subsequent compact timeline migration, gzip JSON timelines total **188,775,266 bytes**, and optimized atlases total **464,354,931 bytes**, for **653,130,197 bytes** of timeline and atlas content. Atlases comprise **1,452 exact lossless WebP files and 31 retained PNG files**. The final optimization pass reduced its compared atlas inputs from 409,871,739 to 288,731,969 bytes (29.56%); previously optimized atlases were preserved. These are measured artifact sizes, rather than a package estimate.

## Atlas memory distribution

Full conversion exposes seven 8,192 × 8,192 atlases: IDs **375, 382, 431, 498, 502, 811 and 1202**. Each occupies **256 MiB** as decoded RGBA. IDs **132, 292 and 1181** have 8,192 × 4,096 atlases, and ID **1201** has a 4,096 × 8,192 atlas; each occupies **128 MiB** as decoded RGBA. Most other atlases are 512-square, 1,024-square or 2,048-square.

These dimensions are genuine source properties. Lossless file compression reduces download and disk size but does not reduce decoded RGBA memory. Existing GPU texture tiling handles device texture-size limits; bounded loading, cache disposal and releasing temporary decoded image storage are separate runtime requirements. Actual browser playback and renderer memory changes are checked and described in the integrated revision-22 handoff.

## Asset verification and reproduction

The source/asset verifier checks timeline and atlas SHA-256, cached source size/MD5/SHA-256, clip identity, frame rate, original sequence hit markers, vertex/index bounds, UV and color array lengths, finite mesh numbers, and submesh index/material structure. Independent Pillow replay passed atlas dimensions and every recorded decoded RGBA hash for all 1,483 species. This checks source authentication, structural consistency and lossless image conversion; it does not independently certify all visual compositions or historical client behavior.

The export and verification records are retained under ignored `artifacts/battle-media-v22/`; downloaded source bundles stay in `.cache/battle-animation/`. The existing revision-20 release is preserved. No revision-22 package is created by this asset pass.

```sh
node tools/assets/export_battle_animation.mjs --all
node tools/verification/battle-animation.mjs
```

Measured final counts, sizes and verification output are recorded in `artifacts/battle-media-v22/full-dex-assets.json` and the verification log. The integrated handoff should use final artifact measurements, not the earlier linear package-size estimate.
