# Browser package (2026-10-23), release 0.0.1 (2026-10-24)

Status: current. The release note of 0.0.1 and of the only release form, for Windows and macOS alike: one folder that runs in
the player's own browser, with the numbers measured on this Mac. Nothing in it has run on Windows yet (open points below).

## Decision

On 2026-10-23 the user said the game is for the user and a few friends, wants no backup, and needs Windows only to run, without
an installer and without testing. Asked whether an Electron-like build or a version for the local browser could serve both
systems, the user chose the **local browser version** as the version common to Windows and macOS, over Electron. The Tauri macOS
app ([desktop-package-2026-10-23](desktop-package-2026-10-23.md)) stayed for the moment.

Against Electron: the game already runs in browsers (the development launcher `../test.command` serves it at
http://127.0.0.1:1426/), one folder serves both systems with no per-system build, signing or cross-compilation, and the only
native code is Node.js's official, signed binaries (353 MiB for three platforms, where Electron would add a Chromium per system).

With it the user first set the version to 0.9.0 (and the Tauri app's minimum macOS version to 13.3).

On 2026-10-24 the user made the local browser version **the** version for Windows and macOS: the Tauri app is not needed and
was removed (below), the version restarts at **0.0.1**, and a Markdown guide makes running it easy for players
(`运行说明.md`, below). 0.0.1 is lower than the 0.2, 0.3.2 and 0.9.0 before it, but nothing orders app versions: the server's
probe of a running game and the payload check test equality, and the save's format version (`SAVE_VERSION` 5) is its own.

## Layout

```
SeerClassic-<version>/
  启动游戏-Windows.bat          CRLF; runs runtime\win-x64\node.exe server.mjs
  启动游戏-macOS.command        LF, executable; runs runtime/darwin-arm64/node (or darwin-x64) server.mjs
  server.mjs                   the game server (tools/distribution/browser/server.mjs), Node's own modules only
  runtime/win-x64/node.exe, runtime/darwin-arm64/node, runtime/darwin-x64/node, each with Node's LICENSE
  game/                        the web build (index.html, assets/, ruffle/) and the payload, with payload.json and
                               THIRD-PARTY-NOTICES.txt (which 关于 shows)
  运行说明.md                    the player guide (tools/distribution/browser/运行说明.md), UTF-8 without a BOM, CRLF
  THIRD-PARTY-NOTICES.txt
```

`game/` holds the files of `public/` the game can request: `stage_payload.py` leaves out the list in `payload-exclusions.json`,
and the `payload` gate proves every path the build can request is staged and none is excluded. The build is Vite's web build.

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
- Answers only a Host whose name is `127.0.0.1` or `localhost` (any port), else 403: a page that rebinds its own name to
  127.0.0.1 (DNS rebinding) cannot read the game's files. It could never read the save, which is the 127.0.0.1:1426 origin's.
- `GET /__seer-classic` answers `{"app":"seer-classic","version":…}`. When port 1426 is taken, the server asks it: if this game
  of the same version answers, a second start only opens the browser (on Windows its console closes at once, which the guide
  says); if another version answers, it names both versions, says to close that window first and waits for a key, without
  opening the browser, which would show the other version; otherwise it says in Chinese that another program holds the port
  (for example the development server of `test.command`) and waits for a key.
- When the system refuses the port (`EACCES`, `EADDRNOTAVAIL`) and no game server answers there, it says so in Chinese and waits
  for a key. On Windows, `EACCES` is WSAEACCES: 1426 inside a range Hyper-V, WSL 2 or Docker reserved (`netsh int ipv4 show
  excludedportrange protocol=tcp`), or a program holding the port exclusively. As the save's origin fixes the port, the message
  says a restart usually frees it, or `net stop winnat` and `net start winnat` in an administrator's console.
- When reading `payload.json` fails with `EPERM` or `EACCES`, the folder is not called incomplete: on macOS, Terminal (which runs
  node) needs the player's consent for Downloads, Documents and Desktop, and after a denial the message points to 系统设置 >
  隐私与安全性 > 文件和文件夹 > 终端; elsewhere it asks for a local folder. The guide says to allow Terminal's request.
- Opens the game: on Windows Microsoft Edge as an app window (`msedge --app=`, from Program Files (x86), Program Files or
  LocalAppData), then `explorer.exe <url>`, which hands it to the default browser; on macOS Google Chrome, else Microsoft Edge
  (`open -a`, from the system's or the user's Applications folder), else the default browser (Saves, below). It prints
  where the game runs, where the save lives and that closing the window stops the game, and sets the console title to say so.
- Stops on Ctrl+C, SIGTERM and SIGHUP (a closed Terminal window, and on Windows a closed console window, which Node raises as
  SIGHUP), and Ctrl+Break on Windows. On Windows the console and the guide name only closing the window: after Ctrl+C, cmd asks
  `终止批处理操作吗(Y/N)?` (either answer closes it). After a failure it has explained and the player acknowledged, it exits with 3,
  so the Windows launcher does not pause a second time; any other failure makes the launcher show its own message and pause.

## Saves

The save is the browser's `localStorage` for http://127.0.0.1:1426 (the web build's save store), so:

- the same browser keeps the same save across versions of the folder, and a new folder unzipped beside or over the old one finds
  it; another browser, a private window or a cleared "browsing data" has none. Edge's app window uses Edge's own profile.
- 导出存档 and 导入存档 in settings carry a save between browsers and machines; the guide says how and that clearing browser data deletes the save.
- Nothing migrates: the key and format are those of the web build.
- **Safari.** WebKit's tracking prevention deletes all of a site's script-writable storage, localStorage included, after 7 days of
  Safari use without the user interacting with the site ([webkit.org/blog/10218](https://webkit.org/blog/10218/)); whether an IP
  literal such as 127.0.0.1 is exempt is not documented and was not tested. A friend who pauses for a week in Safari could lose the
  journey, so on macOS the server opens Chrome or Edge when installed, and the guide recommends them, warns about Safari, asks a
  Safari-only player to export after every session and says how to carry a Safari save to Chrome. This Mac's default browser is
  Chrome, so `test.command` (which opens the default browser) and the package keep using the same save here.
- **A newer save format.** The package and `test.command` share the origin and the key. Once a later version raises
  `SAVE_VERSION`, an older folder in the same browser cannot read the save: the shell keeps it aside (设置 > 无法读取的存档,
  exportable) and starts a new journey in the main slot. The guide says to start only the newest folder after an update. With
  the next format change, the new folder should reach the friends at once, and an older folder should not be opened in a browser
  where a newer version has played.

## Launchers and the operating systems

- `启动游戏-Windows.bat` is ASCII up to its first label, so the console's code page does not matter; its two messages (a missing
  `node.exe`, which is what running it from inside the ZIP window gives, and an unexpected stop) switch the console to UTF-8 first
  (`chcp 65001`). Paths are `%~dp0…` in quotes (folders with spaces, Chinese names, `&` or `%`), with no `cd` (a UNC folder has
  none) and no delayed expansion (a `!` in a folder name).
- `启动游戏-macOS.command` picks `darwin-arm64` when `hw.optional.arm64` is 1, also in a Terminal under Rosetta, else `darwin-x64`,
  and `exec`s node.
- **Privacy controls (TCC).** Archive Utility extracts next to the ZIP, usually in Downloads, and the guide names 下载, 文稿 and 桌面; reading
  the game there makes macOS ask once whether Terminal may access that folder (above).
- **Gatekeeper.** The macOS node binaries are signed `Developer ID Application: Node.js Foundation (HX7739G8FX)` with the hardened
  runtime, and `spctl -t install` reports them as `Notarized Developer ID`. A copy given a browser's quarantine attribute ran from
  the shell (1.4 s for its first start, the online check, then at once), and keeps the attribute: the launcher removes nothing.
  The `.command` itself is an unsigned script (`spctl`: rejected, no usable signature), so its first start needs Control-click
  > 打开 on macOS 13 and 14, and 系统设置 > 隐私与安全性 > 仍要打开 on macOS 15 and later, which the guide says.
- Node 24 needs Windows 10 or later and macOS 13.5 or later (the binaries' own minimum), which the guide names as the minimum.

## The packer (`npm run package`)

`tools/distribution/pack_browser.mjs`, through `heavy.sh` on this Mac:

1. The Node.js runtime from `.cache/node-runtime/v<version>/`, downloaded when missing: `tools/distribution/browser/node-runtime.json`
   pins Node 24.22.1 (the latest LTS, Krypton) with the SHA-256 of `win-x64/node.exe` and the two macOS tarballs from the release's
   `SHASUMS256.txt`, whose GPG signature checked out against nodejs/release-keys when pinned; a file of another sum is refused.
   The macOS binaries and LICENSE are extracted from the tarballs.
2. The web build without `public/` and without source maps (Vite's API, `copyPublicDir: false`).
3. THIRD-PARTY-NOTICES.txt (`third-party-notices.mjs`, 885 KiB): the 18 npm packages of the web build, Ruffle,
   the 255 Rust crates of Ruffle's WebAssembly and the 5 npm packages of its ruffle.js, and Node.js with its LICENSE.
4. `stage_payload.py` (APFS clones, payload.json) and the `payload` gate on this build and payload.
5. The folder (the build and payload moved, the runtime cloned), then the ZIP (`tools/distribution/zip.mjs`): UTF-8 names
   (general purpose bit 11, so Windows Explorer shows 启动游戏-Windows.bat on a Chinese or English Windows), Unix modes (the
   `.command` and the node binaries 755), deflate where it saves space and stored bytes for images, audio and `.gz`. It
   deliberately writes no ZIP64: it refuses more than 65,535 entries or 4 GiB. The packer also refuses names Windows cannot
   create, names that differ only in case, and paths over 180 characters.
6. The player guide again beside the ZIP, `releases/运行说明.md`.

Measured (2026-10-23, Apple M4): `releases/SeerClassic-0.9.0-browser.zip` is 2,973,183,804 B (2.77 GiB), 15,668 entries (1,828
deflated), for 3.10 GiB unpacked (game/ 2.8 GiB, runtime/ 353 MiB). 4 min 50 s with the runtime downloads, 56 s with a warm cache
(the ZIP itself 42-45 s). Rebuilt after the independent check (below): 2,973,185,942 B, the same entries, the ZIP in 43 s.

**Release 0.0.1** (2026-10-24, the main checkout after the Tauri app's removal): `releases/SeerClassic-0.0.1-browser.zip` is
2,973,183,902 B (2.77 GiB, 2.97 GB), 15,666 entries (1,826 deflated), SHA-256
`036dcae5efe114671b6f317eaaa0f5cf7e00cb4b85d0a0610680ee243fb2811d`, for 3,332,420,322 B unpacked (3.10 GiB, 3.33 GB): the
payload's 15,626 files (2,812.4 MiB), the web build, the runtime and the root files. Two fewer entries than 0.9.0: Pixi's
chunks without its unsafe-eval entry. The guide beside it is 6,965 B. About 7 min with the runtime downloads (a fresh
`.cache/node-runtime/`) and a 91 s watchdog stop; the ZIP itself 41 s. Staging printed no stale exclusion. The 0.9.0 ZIP was
deleted once this one passed its gate. Rebuilt after its independent check (below), with the new `server.mjs` and guide:
2,973,184,482 B, the same 15,666 entries (1,826 deflated), SHA-256
`abae85a5c88e5e822a44ccc45e69a7d73f03d6ad85099f33fe472dca56e7ff54`, for 3,332,422,142 B unpacked; the guide beside it is
8,174 B; the ZIP in 41 s.

**Ruffle's own third-party code.** `tools/distribution/ruffle_licenses.mjs --work <scratch>` writes
`tools/distribution/ruffle-licenses.json` (737 KiB, 161 distinct texts) for the installed Ruffle: a sparse checkout of Ruffle's
manifests at its tag (v0.7.1, 89a7049), `cargo tree` of `ruffle_web` for wasm32-unknown-unknown with the release build's features
(`jpegxr`, as `CARGO_FEATURES` in Ruffle's release.yml), the crates' license files from their sources (for a crate of a git
repository, the repository's root, as for nihav's relicensing COPYING), and the npm packages among ruffle.js.map's sources, whose
tarballs are checked against Ruffle's package-lock.json. The five symphonia crates (MPL-2.0) ship no license text, so the first
gets the SPDX text and the others share it; their repository is named beside them. `third-party-notices.mjs` refuses the file
when it is of another Ruffle than the installed one.

## Checks

- `tools/distribution/browser/server.test.mjs` and `tools/distribution/zip.test.mjs` in `npm test`: the resolver (POSIX and
  `path.win32`), content types, Range, HEAD, 304s, refusals, the Host check and the probe through Node's HTTP client and the
  server over in-memory connections; the startup check and `payload.json` read, missing, broken or denied; a server whose listen
  fails with `EACCES` or `EADDRNOTAVAIL`, and the Windows message about it; Edge, its fallback, Chrome or Edge on macOS, the
  console's lines and the stop signals with a mocked platform; the ZIP's names, modes, bytes and its refusal of ZIP64. One test,
  the probe over a real port, is skipped where local TCP connections are refused.
- `main()` itself, run with a preload in place of the system: a listen failing with `EACCES` (on macOS and with the platform set
  to `win32`), a `payload.json` of mode 0 and a missing one each print their Chinese message and exit with 3. So does a game
  server of another version answering on the port (in a pseudo-terminal it waits for a key first), while one of the same version
  gets the browser opened (the spawn stubbed) and exit 0; run with the package's own server.mjs and node.
- `browser-package` (status `release`), after `npm run package`, on the ZIP as a player gets it: the ZIP's limits, names,
  modes and order; unzipped with `ditto` (Archive Utility's engine), the launchers statically (CRLF, ASCII and code page, quoted
  paths, no `cd`, the exit code), node.exe's PE header and pinned SHA-256, the guide, the notices, the node signatures, this Mac's
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

After the fixes of the independent check (2026-10-24, the rebuilt ZIP): 10 of 11, with `battle-skill-effects` 9 of 9,
`browser-regressions` 56 of 56 and the WebKit smoke passing. The Chrome smoke's battle did not end within its 30 s after the load
watchdog had stopped the gate for 91 s at a load of 12.4: every request of the page goes through the stopped process. Rerun with
`--skip-suites`: 9 of 9, the smoke in both engines. `npm test` runs 260 tests, one skipped here (above).

Release 0.0.1 (2026-10-24): 10 of 11 in the first run, with `battle-skill-effects` 9 of 9, `browser-regressions` 56 of 56, the
static checks, the guide and the WebKit smoke passing. The Chrome smoke saw 14 world-map image requests fail (toolbar icons,
portraits, the scene) while the load watchdog stopped the gate twice for 91 s at loads of 8.3 and 9.9, as the page's requests
go through the stopped process. Rerun with `--skip-suites` and no stop: 9 of 9, the smoke in both engines. `npm test` runs 259
tests, one skipped.

The rebuilt 0.0.1 (after its independent check): 10 of 11, with `battle-skill-effects` 9 of 9, `browser-regressions` 56 of 56,
the static checks, the guide and the Chrome smoke passing; the WebKit smoke's click timed out after the watchdog had stopped the
gate for 56 s at a load of 8.1. A rerun with `--skip-suites` lost the Chrome smoke the same way (a 71 s stop at 8.5); the next,
with no stop, passed 9 of 9. `npm test` runs 260 tests, one skipped.

## Player guide (`运行说明.md`)

`tools/distribution/browser/运行说明.md` is the guide for the user's friends, in Chinese (the one Chinese text file of the
repository besides the game's own). The packer writes it at the package root and again beside the ZIP as `releases/运行说明.md`,
to send along, in UTF-8 without a BOM and with CRLF line ends: Notepad (Windows 10 1903 and later) and TextEdit read UTF-8 without a
BOM, and CRLF keeps older Notepad's lines apart. It reads the same rendered and as plain text: `#` headings, short numbered steps
and `-` lists, one line each, with no table, HTML or emphasis.

It covers what the game is and needs (Windows 10/11 64-bit or macOS 13.5 and later; about 7 GB free for a ZIP and a folder of
about 3 GB each, the ZIP deletable after unzipping), unzipping the whole ZIP (全部解压缩 on Windows, which puts the folder inside
one named after the ZIP and may take over ten minutes (not timed), or another unzip program; Safari may have unzipped it), the
Windows launcher
(SmartScreen's 更多信息 > 仍要运行, the attachment warning, Edge's app window, the console that must stay open, Ctrl+C's Y/N
question), the macOS launcher (Control-click > 打开 on macOS 13 and 14, 系统设置 > 隐私与安全性 > 仍要打开 on 15 and later,
Terminal's folder request, Chrome, Edge or the default browser, closing Terminal), the save (the browser's site data for
http://127.0.0.1:1426, 设置 > 导出存档 and 导入存档, which replaces the browser's save without asking, clearing browser data,
Safari's 7-day deletion, updating after closing the old console; the 0.9.0 ZIP never left this machine, so the guide does not
name it), and what to do on each message of
`server.mjs` and the launchers and on an antivirus program's block, with a screenshot for whoever gave the game. Every
message and label it quotes is copied from `server.mjs`, the launchers or the settings panel (`ShellPanels.tsx`), so a change to
one of them changes the guide in the same commit. The release gate checks its version, the launchers' names, the game's address,
the asset notice and that the copy beside the ZIP is the same file. The macOS 15 and Windows dialogs it names were not clicked
through here (open points). Neither Windows 10 nor macOS has a default app for `.md` files, so the message that sends the ZIP
says how to open it: `运行说明.md 用记事本（Mac：文本编辑）打开`.

## The Tauri app's removal (2026-10-24)

Removed: `src-tauri/` (the shell, its save files, payload serving, smoke build and generated icons; the branding source art moved
to `design/branding/`), `src/app/desktop.ts` and `desktop-saves.ts` with every `DESKTOP` branch, Vite's desktop mode, the
`build:desktop`, `desktop`, `stage:desktop`, `package:smoke` and `smoke:macos` scripts and `@tauri-apps/cli` (`package:browser` is
now `npm run package`), the DMG packer, the packaged smoke test and the DMG's README, the `desktop-shell` and `desktop-identity`
gates with the `needs-rust` status, golden-saves' desktop store check, and the notices' desktop mode with the 239 crates of the
app executable. `persistence.ts` keeps the save in local storage only, as its replaceable store had no other caller.
`pixi.js/unsafe-eval` went too: only the desktop app's content security policy needed it, and neither `server.mjs`, the page nor
the development server sets one. `_browser.mjs` lost `SEER_PUBLIC`, whose one use was the staged desktop payload. The payload
staging and its gate stay, as `stage_payload.py`, `payload-exclusions.json` and `payload.mjs`.

Kept from the desktop work, as the browser build uses it: refused save writes reported until a later one succeeds, unreadable saves
kept and exportable from settings, the root error boundary with 导出存档, 关于 with the version, the asset notice and the license
texts, and export by download with import by file pick.

The ignored desktop outputs were deleted: `releases/SeerClassic-0.3.2-macos-arm64.dmg` (2,881,340,598 B), `src-tauri/target`
(1.3 GiB) and `src-tauri/gen`; `dist-desktop/`, `releases/desktop-payload` and `releases/desktop-notices` were already gone.

## Independent check (2026-10-23)

An independent check of the package found two medium and seven low issues. Fixed: the port Windows refuses (a stack trace
before), Safari's 7-day deletion of the save (Chrome or Edge first on macOS, the README), the folder macOS's privacy controls
deny (called incomplete before), the Host check, the Windows Ctrl+C question (the console and the README), and the README line
about keeping to the newest version. Not changed:

- **Symlinks inside `game/` are followed** (`fs.stat` and the read stream): reaching a file outside needs write access to
  `game/`, and the ZIP has no symlink entries. A `realpath` check per request would walk every path component on Windows, where
  nothing can be tried here, for no gain against a player's own files.
- **One WebKit run found no clickable skill within 30 s** at the first turn (load 5-6), and three runs after it passed. If it
  comes back in this gate, record the command deck's and the battle's state (busy, finished, needsSwitch) on failure.
- **18 paths in the exclusion list were no longer in the main checkout's `public/`** after its cleanup (the HD map
  and selector `-4x` files, `maps/hd/726-v44.png`), and staging warned. The checkout that packed the 0.9.0 ZIP was made before
  the cleanup and still held them, so the list was pruned later in the main checkout, where removing an entry cannot ship a
  file (2026-10-24, with the 0.0.1 release).

## Independent check of 0.0.1 (2026-10-24)

A second independent check, of the 0.0.1 ZIP, found nothing high, two medium and four low issues. Fixed: a start that finds
another version running now explains it and waits for a key instead of opening that version (on Windows its console closed at
once, so the guide's line about the message described text nobody saw), and the guide says to close the old window before an
update; the guide says that 导入存档 replaces the browser's save without asking, that Windows' Extract All adds a folder level
and may take over ten minutes (or another unzip program), that Safari may have unzipped the download, and what to do when an
antivirus program blocks the launcher; its intro is one line. Not changed in the package: a `.md` file has no default app on
Windows 10 or macOS, and the guide must stay Markdown, so the message sending the ZIP says how to open it (Player guide, above).

## Open points (untested)

- **Windows has not run anything.** Checked only statically or with a mocked platform: cmd's reading of the `.bat` (CRLF,
  `chcp 65001` inside a batch, `%~dp0` with spaces and Chinese characters), Edge's app window and the `explorer.exe` fallback,
  the console close reaching Node as SIGHUP, Chinese text in the console, SmartScreen and the downloaded-file warning (the guide
  says how to pass them), Defender's cost on the first start and on unzipping 15,666 files, Explorer's extraction time and its
  path limit (the longest path inside the ZIP is about 70 characters), OneDrive folders. node.exe is the pinned file; its own
  Authenticode signature was not checked here.
- **No real port was used.** The sandbox here refuses local TCP connections, so the listening server on 127.0.0.1:1426 with a real
  browser, the probe of a taken port and `main()`'s opening of the browser did not run; the suites reach the same server code over
  in-memory connections. A reserved port was only simulated (a listen failing with `EACCES`); `net stop winnat` was not run.
- **macOS.** The Gatekeeper dialog of a quarantined `.command` was not clicked through (no window is opened on this screen), nor
  Terminal's request for Downloads or Documents, nor `open -a` with Chrome or Edge; the Intel node was only signature-checked;
  Firefox was not tried. Whether Safari's 7-day deletion applies to 127.0.0.1 is unknown.
- The save lives in one browser's site data; clearing it deletes the journey. The guide says so and how to export.
- **The guide's dialog wording** (SmartScreen, 打开文件 - 安全警告, 全部解压缩 and 提取, macOS 15's 完成 and 仍要打开, Terminal's
  终止) follows those systems' Chinese wording as documented and remembered, not as seen here: no such dialog was opened.
