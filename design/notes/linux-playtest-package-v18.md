# Linux browser playtest package, revision 18

## Scope and runtime

The user requested a compressed game package for Dot to play under Linux. The package contains production browser assets and a Python standard-library HTTP launcher. It preserves the current Mac development servers and their origin-specific saves. No native Linux or Tauri build, macOS application, `node_modules`, source history, cache, credentials, or player save is included.

The proposed runtime is Python 3.8 or newer plus a modern browser with JavaScript and local storage. The launcher binds `127.0.0.1:1427` by default and serves the bundled `game` directory at the HTTP root, preserving absolute asset paths. Its host and port are configurable for an environment that requires browser port forwarding. Dot's target environment and actual Linux/browser execution remain to be verified.

## Rebuild and package

After the frontend source is ready and the approved production build succeeds, run:

```sh
python3 tools/distribution/pack_linux_playtest.py --revision 18
```

The archive is `releases/seer-classic-linux-playtest-v18.tar.gz`. Use `--format zip` for a ZIP archive with the same root directory. The packager never invokes a build. It rejects missing or changed public assets by comparing their SHA-256 digests with `dist`, preventing use of the existing outdated build. It copies only the frontend entry point, compiled assets, complete public tree, launcher, playtest instructions, bug template, and content manifest. Generated archives and staging files stay under the ignored `releases/` directory.

`PACKAGE.json` records the content identity, per-file hashes and sizes. The archive has a separate `.sha256` sidecar. The archive root is always `seer-classic-linux-playtest-v18` and contains `game/`, `start.py`, `PLAYTEST.md`, `BUG_REPORT.md`, and `PACKAGE.json`.

## Initial inventory

The current public tree contains 1,851 files and 61,128,071 bytes, including 145 map files, 1,628 portrait files, 21 robot files, 52 type-icon files, and five branding files. These include metadata and provenance records as well as artwork. The existing pre-task `dist` contains 1,646 files and 32,563,981 bytes; it lacks the recovered maps, current robots, and type icons, so it cannot be delivered as this revision.

## Playtest responsibility and limits

Dot checks mechanics, navigation, acquisition, rewards, progression, fusion and persistence. The user checks interface layout, artwork, scale, animation and interaction feel. `distribution/BUG_REPORT.md` provides a shared reproduction template and identifies the package by its content manifest. The package starts without a player save; browser saves remain local to the chosen profile and origin, and the existing game export/import controls transfer saves deliberately.

Asset completeness, archive integrity, HTTP smoke checks, browser behavior and mechanics correctness are separate verification claims. Record each completed check below without treating packaging as Linux acceptance. The final archive must use the build containing the laboratory fusion equipment beside Dr. Pat.

## Verification status

- Distribution templates and packager prepared; both Python files passed AST syntax checks.
- Initial asset inventory completed; the existing `dist` is unsuitable.
- The packager rejected the outdated `maps/README.md` in the existing `dist` without creating an archive.
- A targeted search of public SVG, HTML and CSS found no remote `href`, `src` or CSS `url` asset references. Bibliographic source URLs remain in provenance metadata.
- The root completed the fresh frontend TypeScript check and Vite build before packaging. Both archives contain 1,854 game files, including all 1,851 public files, and three distribution support files plus `PACKAGE.json`.
- Both archives were independently extracted. Every manifested file matched its recorded byte length and SHA-256 hash; the inventory content identity and archive checksum sidecars also matched. ZIP CRC validation passed.
- The extracted launcher from each archive served the entry HTML and all 1,854 bundled game files over loopback HTTP. Every response returned status 200 and the expected SHA-256 digest. The HTML referenced the bundled production JavaScript and CSS. The ordinary occupied-port error exited cleanly with status 1. Both temporary servers were terminated after these checks.
- No development dependencies, native application, source history, hidden cache, log, source map, or player save was present in the extracted package inventory. Generated extraction directories were cleaned up.
- Dot target runtime, actual Linux browser launch, and gameplay checks are pending.

The user subsequently chose to send the package to dot personally. No cross-chat inspection or playtest request was sent. The suggested Debian distribution remains unconfirmed; both archive formats are supplied for the recipient's actual environment.

The verification above ran on the current Mac using Python's standard library. It verifies artifact contents and local HTTP delivery; it does not certify a Linux browser session. The root separately checks the fresh frontend's visible laboratory interaction.

## Delivered artifacts

| Archive | Bytes | SHA-256 |
| --- | ---: | --- |
| `releases/seer-classic-linux-playtest-v18.tar.gz` | 53,135,254 | `2da14f8e84eab56ea86e686c83cb3ec20d8e1198cd03fa2932f77ac8db70c6a1` |
| `releases/seer-classic-linux-playtest-v18.zip` | 53,443,229 | `5d0d8e57d47648e6528c4555ed684b5ff7030b868c4663465d8e4486fa97d408` |

Both archives contain identical game and support-file contents with content identity `8270ee937bffb00f6e0cd27090de0bdf5582f70359350f18420528852d0dd956`. Their `PACKAGE.json` creation timestamps and archive metadata can differ. Each archive has a `.sha256` sidecar, and `releases/seer-classic-linux-playtest-v18-verification.json` records the extraction and HTTP check results. The archive sizes are approximately 50.67 MiB for tar.gz and 50.97 MiB for ZIP.
