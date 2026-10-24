# Browser package (2026-10-23)

Status: current. It describes the version of the game common to Windows and macOS: one folder that runs in the player's own
browser, with the numbers measured on this Mac. Nothing in it has run on Windows yet (open points below).

## Decision

On 2026-10-23 the user said the game is for the user and a few friends, wants no backup, and needs Windows only to run, without
an installer and without testing. Asked whether an Electron-like build or a version for the local browser could serve both
systems, the user chose the **local browser version** as the version common to Windows and macOS, over Electron. The Tauri macOS
app ([desktop-package-2026-10-23](desktop-package-2026-10-23.md)) stays as it is.

Against Electron: the game already runs in browsers (the development launcher `../test.command` serves it at
http://127.0.0.1:1426/), one folder serves both systems with no per-system build, signing or cross-compilation, and the only
native code is Node.js's official, signed binaries (353 MiB for three platforms, where Electron would add a Chromium per system).

With it the user set the version to 0.9.0 and the Tauri app's minimum macOS version to 13.3 (Safari 16.4, whose
DecompressionStream the battle loader needs); `desktop-identity` keeps both.

## Layout

```
SeerClassic-<version>/
  启动游戏-Windows.bat          CRLF; runs runtime\win-x64\node.exe server.mjs
  启动游戏-macOS.command        LF, executable; runs runtime/darwin-arm64/node (or darwin-x64) server.mjs
  server.mjs                   the game server (tools/distribution/browser/server.mjs), Node's own modules only
  runtime/win-x64/node.exe, runtime/darwin-arm64/node, runtime/darwin-x64/node, each with Node's LICENSE
  game/                        the web build (index.html, assets/, ruffle/) and the desktop payload, with payload.json and
                               THIRD-PARTY-NOTICES.txt (which 关于 shows)
  请先阅读.txt                  the player README (tools/distribution/browser/player-readme.txt), UTF-8 with a BOM, CRLF
  THIRD-PARTY-NOTICES.txt
```

`game/` holds the same public files as the desktop app (`stage_desktop_payload.py` and its exclusion list), so the
`desktop-payload` gate that proves every requestable path is staged applies unchanged; the build is the default (web) mode, so
neither `desktop.ts` nor the save files of the desktop build are in it.

## The server (`server.mjs`)

- Listens on 127.0.0.1 only, on port **1426**, fixed: the browser keeps the save under the origin http://127.0.0.1:1426, the one
  `test.command` has always used, so the user's save in a browser is the browser package's save in that same browser.
- Serves `game/` with a strict resolver: one percent-decoding; a NUL, backslash, colon (drive letters, NTFS streams), empty,
  `.` or `..` segment refuses the path, so `C:\…`, `//server/share`, `..%5c` and `%2e%2e` cannot leave the folder; a folder or
  a missing file is a 404. Files are streamed, never read into memory.
- Content types for every extension the game requests; `.gz` files go out as `application/gzip` with no Content-Encoding (the
  game inflates them itself). Range (one range; 206, or 416 with `bytes */size`; If-Range), HEAD, ETag and Last-Modified with
  304; `Cache-Control: no-cache` except the content-hashed `/assets/`, which are immutable; `nosniff`. Other methods get 405.
- At startup it checks every file of `game/payload.json` for its size (64 at a time) and refuses an incomplete folder with a
  Chinese message: the ZIP puts payload.json last, so an extraction cut short lacks it and is refused too.
- `GET /__seer-classic` answers `{"app":"seer-classic","version":…}`. When port 1426 is taken, the server asks it: if this game
  answers, a second start only opens the browser (and says when that game is another version); otherwise it says in Chinese that
  another program holds the port (for example the development server of `test.command`) and waits for a key.
- Opens the game: on Windows Microsoft Edge as an app window (`msedge --app=`, from Program Files (x86), Program Files or
  LocalAppData), then `explorer.exe <url>`, which hands it to the default browser; on macOS `open`. It prints where the game runs,
  where the save lives and that closing the window stops the game, and sets the console title to say so.
- Stops on Ctrl+C, SIGTERM and SIGHUP (a closed Terminal window, and on Windows a closed console window, which Node raises as
  SIGHUP), and Ctrl+Break on Windows. After a failure it has explained and the player acknowledged, it exits with 3, so the
  Windows launcher does not pause a second time; any other failure makes the launcher show its own message and pause.

## Saves

The save is the browser's `localStorage` for http://127.0.0.1:1426 (the web build's save store), so:

- the same browser keeps the same save across versions of the folder, and a new folder unzipped beside or over the old one finds
  it; another browser, a private window or a cleared "browsing data" has none. Edge's app window uses Edge's own profile.
- 导出存档 and 导入存档 in settings carry a save between browsers and machines; the README asks players to export often.
- Nothing migrates: the key and format are those of the web build.

## Launchers and the operating systems

- `启动游戏-Windows.bat` is ASCII up to its first label, so the console's code page does not matter; its two messages (a missing
  `node.exe`, which is what running it from inside the ZIP window gives, and an unexpected stop) switch the console to UTF-8 first
  (`chcp 65001`). Paths are `%~dp0…` in quotes (folders with spaces, Chinese names, `&` or `%`), with no `cd` (a UNC folder has
  none) and no delayed expansion (a `!` in a folder name).
- `启动游戏-macOS.command` picks `darwin-arm64` when `hw.optional.arm64` is 1, also in a Terminal under Rosetta, else `darwin-x64`,
  and `exec`s node.
- **Gatekeeper.** The macOS node binaries are signed `Developer ID Application: Node.js Foundation (HX7739G8FX)` with the hardened
  runtime, and `spctl -t install` reports them as `Notarized Developer ID`. A copy given a browser's quarantine attribute ran from
  the shell (1.4 s for its first start, the online check, then at once), and keeps the attribute: the launcher removes nothing.
  The `.command` itself is an unsigned script (`spctl`: rejected, no usable signature), so its first start needs Control-click
  > 打开 on macOS 13 and 14, and 系统设置 > 隐私与安全性 > 仍要打开 on macOS 15 and later, which the README says.
- Node 24 needs Windows 10 or later and macOS 13.5 or later, which the README names as the minimum.

## The packer (`npm run package:browser`)

`tools/distribution/pack_browser.mjs`, through `heavy.sh` on this Mac:

1. The Node.js runtime from `.cache/node-runtime/v<version>/`, downloaded when missing: `tools/distribution/browser/node-runtime.json`
   pins Node 24.22.1 (the latest LTS, Krypton) with the SHA-256 of `win-x64/node.exe` and the two macOS tarballs from the release's
   `SHASUMS256.txt`, whose GPG signature checked out against nodejs/release-keys when pinned; a file of another sum is refused.
   The macOS binaries and LICENSE are extracted from the tarballs.
2. The web build without `public/` and without source maps (Vite's API, `copyPublicDir: false`).
3. THIRD-PARTY-NOTICES.txt (`third-party-notices.mjs --package browser`, 885 KiB): the 18 npm packages of the web build, Ruffle,
   the 255 Rust crates of Ruffle's WebAssembly and the 5 npm packages of its ruffle.js, and Node.js with its LICENSE.
4. `stage_desktop_payload.py` (APFS clones, payload.json) and the `desktop-payload` gate on this build and payload.
5. The folder (the build and payload moved, the runtime cloned), then the ZIP (`tools/distribution/zip.mjs`): UTF-8 names
   (general purpose bit 11, so Windows Explorer shows 启动游戏-Windows.bat on a Chinese or English Windows), Unix modes (the
   `.command` and the node binaries 755), deflate where it saves space and stored bytes for images, audio and `.gz`. It
   deliberately writes no ZIP64: it refuses more than 65,535 entries or 4 GiB. The packer also refuses names Windows cannot
   create, names that differ only in case, and paths over 180 characters.

Measured (2026-10-23, Apple M4): `releases/SeerClassic-0.9.0-browser.zip` is 2,973,183,804 B (2.77 GiB), 15,668 entries (1,828
deflated), for 3.10 GiB unpacked (game/ 2.8 GiB, runtime/ 353 MiB). 4 min 50 s with the runtime downloads, 56 s with a warm cache
(the ZIP itself 42-45 s).

**Ruffle's own third-party code.** `tools/distribution/ruffle_licenses.mjs --work <scratch>` writes
`tools/distribution/ruffle-licenses.json` (737 KiB, 161 distinct texts) for the installed Ruffle: a sparse checkout of Ruffle's
manifests at its tag (v0.7.1, 89a7049), `cargo tree` of `ruffle_web` for wasm32-unknown-unknown with the release build's features
(`jpegxr`, as `CARGO_FEATURES` in Ruffle's release.yml), the crates' license files from their sources (for a crate of a git
repository, the repository's root, as for nihav's relicensing COPYING), and the npm packages among ruffle.js.map's sources, whose
tarballs are checked against Ruffle's package-lock.json. The five symphonia crates (MPL-2.0) ship no license text, so the first
gets the SPDX text and the others share it; their repository is named beside them. `third-party-notices.mjs` refuses the file
when it is of another Ruffle than the installed one. The desktop notices now carry the same Ruffle sections (998 KiB).

## Checks

- `tools/distribution/browser/server.test.mjs` and `tools/distribution/zip.test.mjs` in `npm test`: the resolver (POSIX and
  `path.win32`), content types, Range, HEAD, 304s, refusals and the probe through Node's HTTP client and the server over in-memory
  connections; the startup check; Edge, its fallback and the stop signals with a mocked platform; the ZIP's names, modes, bytes
  and its refusal of ZIP64. One test, the probe over a real port, is skipped where local TCP connections are refused.
- `browser-package` (status `release`), after `npm run package:browser`, on the ZIP as a player gets it: the ZIP's limits, names,
  modes and order; unzipped with `ditto` (Archive Utility's engine), the launchers statically (CRLF, ASCII and code page, quoted
  paths, no `cd`, the exit code), node.exe's PE header and pinned SHA-256, the README, the notices, the node signatures, this Mac's
  node version, and server.mjs's own startup check; then the smoke (`_browser-package-smoke.mjs`) in Chrome and WebKit; then
  `battle-skill-effects` and `browser-regressions` with `SEER_PACKAGE`.
- `SEER_PACKAGE=<unzipped package>` makes `_browser.mjs` skip its build and answer every request with the package's own server.mjs
  in the package's own macOS node (`_package-server.mjs`): this machine's sandbox refuses local TCP connections, so the requests
  travel over the child's IPC channel and through Node's HTTP client and the package's HTTP server over in-memory connections.
- The smoke: a journey of 丽莎布布 at Lv 100 opens on the world map; the page gets the probe, a 404, a `.gz` file as its own
  bytes and a 206; a wild battle starts, 叶绿光束 is used and Ruffle draws its effect; the battle writes the save, which is the same
  after a reload; no page or console error and no failed request besides the 404 asked for.

Results (2026-10-23, through `heavy.sh`): `browser-package` 11 of 11 in 10 min: the smoke in Chrome and WebKit,
`battle-skill-effects` 9 of 9 and `browser-regressions` 56 of 56 against the package in both engines. In an earlier run, with the
load average at 8.8, one turn of `battle-skill-effects` at 1920x1080@2 did not settle within its 30 s; it passed in the next run.
`npm test` runs 254 tests, one skipped here (above).

## Open points (untested)

- **Windows has not run anything.** Checked only statically or with a mocked platform: cmd's reading of the `.bat` (CRLF,
  `chcp 65001` inside a batch, `%~dp0` with spaces and Chinese characters), Edge's app window and the `explorer.exe` fallback,
  the console close reaching Node as SIGHUP, Chinese text in the console, SmartScreen and the downloaded-file warning (the README
  says how to pass them), Defender's cost on the first start and on unzipping 15,668 files, Explorer's extraction time and its
  path limit (the longest path inside the ZIP is about 70 characters), OneDrive folders. node.exe is the pinned file; its own
  Authenticode signature was not checked here.
- **No real port was used.** The sandbox here refuses local TCP connections, so the listening server on 127.0.0.1:1426 with a real
  browser, the probe of a taken port and `main()`'s opening of the browser did not run; the suites reach the same server code over
  in-memory connections.
- **macOS.** The Gatekeeper dialog of a quarantined `.command` was not clicked through (no window is opened on this screen); the
  Intel node was only signature-checked; Firefox was not tried.
- The save lives in one browser's site data; clearing it deletes the journey. The README says so and asks for exports.
