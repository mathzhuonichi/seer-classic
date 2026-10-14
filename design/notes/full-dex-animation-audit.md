# Full retained dex official animation audit

All **1,483 retained dex species** have matching pet prefabs and animation bundle entries in the current official Unity PetAnimPackage. A fresh bounded HTTP audit returned **1,483/1,483 HTTP 200** responses, with every reported content length equal to its manifest size. There are no manifest-missing or HTTP-unavailable IDs in this snapshot. This establishes a complete official source route; it does not establish successful conversion or runtime playback of every species.

The current offline battle animation manifest contains **384 ready species**, zero failed entries, and **1,099 species not exported**. The first unexported ID is 56, Qiluo (`奇洛`). The retained catalog is not the contiguous range 1–1483; its final IDs include 1487, 1498 and 1499. Matching used the actual `data/gamedata.json` species IDs.

## Source snapshot and evidence

The audit ran on **2026-10-04 03:31 UTC** (2026-10-03 in the workspace's America/Los_Angeles time zone). The official [version endpoint](https://newseer.61.com/Assets/StandaloneWindows64/PetAnimPackage/PackageManifest_PetAnimPackage.version) returned `20260924034650`. The freshly downloaded [official binary manifest](https://newseer.61.com/Assets/StandaloneWindows64/PetAnimPackage/PackageManifest_PetAnimPackage_20260924034650.bytes) was 731,222 bytes, with SHA-256 `0cc084c17aff787208dc33f4ffe898785173fecf7b5f9eb35f216cc5ee303184`. This equals the existing exporter snapshot. The manifest contains 6,326 assets and 6,246 bundles; those totals include resources beyond the retained dex.

Every retained species matched both `Assets/Pets/<id>.prefab` and `ppets_<id>`. Official CDN URLs are constructed from the manifest file hash beneath `https://newseer.61.com/Assets/StandaloneWindows64/PetAnimPackage/`. Eight concurrent workers issued HEAD requests, with a 20-second request timeout and at most two attempts. All requests succeeded on the first attempt. HTTP error, timeout and size-mismatch sets are empty. HEAD availability and size agreement do not authenticate each full response body. Five additional specimens received full-body download and decode verification, as recorded below.

Ignored evidence:

- `artifacts/full-dex-animation-audit/audit.json`: full ID/name matching, official URLs, hashes, sizes, export status, HEAD status and timestamp, and summary counts.
- `artifacts/full-dex-animation-audit/coverage.csv`: the same 1,483-species coverage table in spreadsheet-readable form.
- `artifacts/full-dex-animation-audit/samples.json`: complete sample source SHA-256 and MD5 values, atlas RGBA hashes, action frame counts and parser output measurements.
- `.cache/full-dex-animation-audit/current-manifest.bytes`: the freshly fetched manifest.
- `.cache/full-dex-animation-audit/audit.mjs` and `samples.mjs`: bounded audit/replay scripts; raw specimen bundles are stored beside them.

The web browsing tool could not render the binary manifest. The actual version, manifest and CDN checks above used direct HTTPS requests to the official host, rather than treating that browsing limitation as a source failure.

## Full-body conversion specimens

The audit used the already installed `@seer-pet-anim/swf-bundle` 0.3.1 parser and actual shared material bundle. Each specimen had a UnityFS signature, exact manifest byte length, and full-body MD5 equal to the manifest file hash. Each decoded to the requested pet identity with an RGBA atlas, five standard source sequences (`standby`, `attack`, `sa`, `cp`, `hited`), and zero material warnings. The physical, special and property sequences have source hit markers. No specimen was added to the public game manifest or runtime.

| Species | Source bytes | Frame rate | Atlas dimensions | Decoded RGBA memory | Gzip timeline bytes |
|---|---:|---:|---:|---:|---:|
| 56, Qiluo (`奇洛`) | 109,295 | 24 fps | 512 × 512 | 1 MiB | 34,477 |
| 431, Luerdini (`鲁尔蒂尼`) | 9,002,204 | 25 fps | 8,192 × 8,192 | 256 MiB | 369,872 |
| 1487, Huodisi (`霍迪斯`) | 153,354 | 25 fps | 2,048 × 2,048 | 16 MiB | 41,915 |
| 1498, Silver Horn (`银角`) | 54,990 | 25 fps | 256 × 256 | 0.25 MiB | 47,733 |
| 1499, Silver Horn Demon King (`银角大魔王`) | 116,103 | 25 fps | 1,024 × 1,024 | 4 MiB | 64,433 |

These specimens cover the first unexported species, the source-cap outlier and the catalog tail. They strengthen feasibility evidence but do not certify all 1,099 unexported conversions, all visual geometry/layering, or browser playback of these specimens. Compressed atlas output sizes were not generated or measured in this audit.

## Completion cost and concrete boundaries

Manifest source sizes total **478,624,982 bytes (456.452 MiB)** for all 1,483 species, excluding shared dependencies. Sources for the 1,099 unexported species total **301,540,783 bytes (287.572 MiB)** before subtracting any pre-existing cached downloads. These are actual indexed source sizes, not predicted delivered asset sizes.

Only two retained source bundles exceed the exporter's current 8 MiB cap: **431, Luerdini (`鲁尔蒂尼`), 9,002,204 bytes**, and **502, Dorag (`朵拉格`), 9,377,161 bytes**. ID 502 already has an explicit cap exception and is delivered. ID 431 successfully decoded in this isolated audit, but its 8,192-square atlas consumes 256 MiB before GPU upload or additional copies. The installed renderer already splits atlases into tiles using `gl.MAX_TEXTURE_SIZE`; an 8,192-square source is therefore not inherently unsupported. The current mount uses `releaseAtlasAfterSplit: false`, so GPU tiling does not eliminate the original 256 MiB CPU atlas or GPU allocations. Dorag, ID 502, already has an 8,192-square atlas and successful browser evidence in the existing revision-20 delivery. ID 431 still needs its own browser playback and peak-memory checks, including a battle with two large atlases. A scoped size exception alone is not a complete runtime check.

The existing 384-species optimized delivery is approximately 247.177 MiB. Scaling that size solely by species count predicts approximately 954.595 MiB for 1,483 species. This is a rough planning estimate: source complexity and atlas dimensions differ considerably, and no full export was performed. The actual final package size requires conversion, lossless atlas optimization and final file measurement.

A feasible completion pass should target the explicit 1,099-ID remainder, preserve existing ready records, authenticate each downloaded bundle against its indexed hash and size, parse sequentially with bounded prefetch, and record conversion failures separately from source absence. It should handle ID 431's atlas deliberately, retaining source pixels while checking texture tiling, cache disposal and peak memory. After lossless export, replay manifest/hash/pixel checks and verify representative real battles, including physical attack, special attack, property action and hit reaction, before measuring and packaging the completed library. Every species should retain an explicit ready/failed status; a source index match alone should not be promoted to ready.

This audit changed no runtime code, public animation assets, battle calculations, game saves or release packages. No whole-dex export or publication occurred.
