# Browser playtest package, revision 30

Date: 2026-10-14. The user requested a package of the latest local revision-30 source for ChatGPT Space/Library, replacing older cloud releases. Local packaging, cloud upload, downloaded-byte verification and removal of the three identified revision-18 cloud files are complete.

## Package scope

The existing portable-browser packager was run against a fresh production build of the current working tree. The package includes the development changes through the revision-30 PetBag nine-slice frame correction, including original-art navigation, the laboratory shop and breeding integration. Earlier revision notes that state no build or package was made describe their original development deliveries; those historical statements remain unchanged.

The package preserves all current offline game assets. It includes `game/`, `start.py`, `PLAYTEST.md`, `BUG_REPORT.md`, and `PACKAGE.json`. It contains 5,083 game files, including 5,067 public files. The launcher requires Python 3.8 or newer and a modern browser, serving the game at `http://127.0.0.1:1427/` by default. No npm installation, Node runtime or internet access is required after extraction. Existing local releases, development servers, origin-specific saves and unrelated working-tree changes were preserved; no commit was created.

Bundled playtest instructions were updated from revision 22 to revision 30. The current acquisition exporter independently replayed the executable closure: 453 of 1,479 eligible forms are reachable, 1,026 lack a normal route, and four NPC-partner forms are excluded. Twenty-three fusion recipes have normally obtainable parents, covering 22 infant outputs; one of eight breeding pairs has normal routes to eligible parents. These are dependency checks, not complete natural-progression playthroughs.

## Canonical archives

| Archive | Bytes | SHA-256 |
| --- | ---: | --- |
| `releases/seer-classic-linux-playtest-v30.zip` | 757,285,875 | `97323e8db638472512fcd657d7a4a40e61354a7d1249c7d92cf9023122b28e8c` |
| `releases/seer-classic-linux-playtest-v30.tar.gz` | 756,998,763 | `8e7cb13b150335279a29917614d9e35727c746a4992839ee91770fa5e42f1c07` |

Both archives have the same manifested content identity, `29733266f30838c0345b725d822d378d5b5d98bdde66a9e2999901b0853831fd`. Each archive has an adjacent `.sha256` sidecar. Their manifest timestamps and archive metadata differ; every manifested game and support file is identical.

## Verification

- `npm run build` passed TypeScript checking and the Vite production build. Vite reported the existing warning about a large JavaScript chunk; the build succeeded.
- The packager checked SHA-256 equality between every public source asset and its production-build copy before packaging.
- Both archives were independently read, and every manifest entry matched its recorded byte count and SHA-256 digest. Exact archive membership, content identity, sidecar checksums and ordinary-file paths were checked. ZIP reads validated member CRCs. ZIP and tar.gz have identical manifested contents.
- The ZIP was independently extracted. All 5,086 manifested files matched their hashes, and every packaged game file matched the current `dist` file. A snapshot of 1,801 relevant source/configuration files remained unchanged during packaging and verification.
- The extracted launcher served all 5,083 game files over loopback HTTP. Every response returned status 200 and the exact expected SHA-256 digest. The entry HTML references present production JavaScript and CSS. The temporary verification server was terminated.
- The production CSS includes the revision-30 nine-slice frame definition. Vite correctly minifies equivalent four-value border shorthand to three values; the artifact check accepts that equivalent representation.
- Archive membership follows the explicit frontend/support-file allowlist and contains no hidden cache, development dependency, source history, log, source map, credential/key file or player save. Developer-only font imports are removed from the production build, and cached font files are excluded. The browser uses its available fallback fonts.

Ignored verification scripts, source hashes, extraction and reports are under `artifacts/package-v30/`. `verification.json` records canonical archive and complete HTTP delivery checks. `acquisition/status.json` records the current executable inventory and source identities. Archive/HTTP validation on macOS does not certify actual Linux/browser execution, full gameplay correctness, or visual acceptance on another platform.

## ChatGPT-compatible distribution

The ChatGPT upload interface rejected the complete ZIP with a 512 MB per-file limit. The canonical archives remain unchanged. The complete ZIP was partitioned into two ordinary ZIP archives at file boundaries, with the same top-level directory and unchanged game-file contents. Both parts must be extracted into the same destination directory. Each part contains its own uniquely named instruction file, and `releases/seer-classic-linux-playtest-v30-DOWNLOAD.md` provides startup instructions and both hashes.

| Archive | Bytes | SHA-256 |
| --- | ---: | --- |
| `releases/seer-classic-linux-playtest-v30-part-1-of-2.zip` | 378,643,776 | `957d814680ae0ab3356e56bbff739397f439f8749ba3aae518a3cb1c5bbd0526` |
| `releases/seer-classic-linux-playtest-v30-part-2-of-2.zip` | 378,643,744 | `ec42faf1e431bae3c18d807630b6ea52b4112ea055626b8b000a0b4250a57650` |

An independent read of both part archives verified CRCs and byte lengths/SHA-256 hashes for the exact union of all 5,087 canonical members, including `PACKAGE.json`. No member path is duplicated within or between the parts. The only added files are `PART-1-OF-2.md` and `PART-2-OF-2.md`. Both ZIP parts are below 500,000,000 bytes; the canonical complete ZIP retained its original hash. `artifacts/package-v30/library-parts-verification.json` records these checks.

## Cloud delivery and replacement

The ordinary Space upload menu was disabled. The two ZIP parts and download instructions were uploaded through ChatGPT's file attachment control and appeared independently in Space/Library without sending a chat message. The saved Library entries are:

- [Revision 30, part 1 of 2](https://chatgpt.com/space/file/libfile_82cf706539e0819189e56c0f9ce83675).
- [Revision 30, part 2 of 2](https://chatgpt.com/space/file/libfile_636201cb603c8191ba29ae4322e2bb6c).
- [Revision 30 download instructions](https://chatgpt.com/space/file/libfile_32571131e0ec8191addd098298c8f0df).

The instructions rendered in the Library preview with the expected filenames, sizes, SHA-256 values and extraction procedure. Both ZIP parts were downloaded again from their saved Library entries. Their byte lengths and SHA-256 hashes exactly matched the local upload files listed above. The results are preserved in ignored `artifacts/package-v30/cloud-download-verification.json`.

After that verification, the following three older cloud files were selected by exact filename and deleted together: `seer-classic-linux-playtest-v18.zip`, `Seer-Classic-v18-试玩报告.md`, and `Seer-Classic-v18-复现资料.zip`. The confirmation explicitly stated that the files would move to Trash and be permanently deleted after 30 days. The resulting Library search retained the three new revision-30 files and no longer listed those revision-18 files. Unrelated image results and historical local release archives were preserved. No sharing or audience settings were changed.
