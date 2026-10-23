# Desktop package (2026-10-23)

Status: current. It describes how the desktop app is built, served, saved and checked, with the numbers measured on the
macOS package. Windows uses the same shell and payload but has not been built or run yet (open points below).

## Decision

On 2026-10-23 the user asked for stable software that can be packaged for Windows and macOS. Five read-only studies and a
critic produced a merged plan; the coordinator then fixed these points:

- Keep the bundle identifier `local.chizhuoni.seer-classic` and Tauri's own page origin (`tauri://localhost` on macOS,
  `http://tauri.localhost` on Windows; `useHttpsScheme` stays off). The 0.2 app's real save lives under that origin in the web
  view's storage, so a new scheme or identifier would strand it.
- On the desktop, saves are files and the primary store (the design of [platform](platform.md) §4.8).
- The first package ships the original battle-animation fallback (622.9 MiB).
- Windows ships as a portable ZIP. Nothing in this run cross-compiles Windows: that needs `brew install llvm`, which waits for
  the user's approval.
- Version, minimum macOS version and architecture (arm64) stay as they are until the user answers; the in-game modifier stays.

Before this work, `npm run package` would have tried to compile all of `public/` (2.8 GiB) into the executable: Vite copies
`public/` into the build, and Tauri embeds every file of `frontendDist` (brotli, then `include_bytes!`). The desktop study
projected about 18.5 GiB of compiler memory, more than this 16 GiB Mac has, and Windows cannot link an image over 2 GB.

## Architecture

```
dist-desktop/                 vite build --mode desktop: index.html, assets/, ruffle/ (36.5 MiB, 30 files), embedded
releases/desktop-payload/public/   the staged payload: public/ without the exclusion list, plus payload.json and
                              THIRD-PARTY-NOTICES.txt (15,626 files, 2,812.0 MiB), shipped beside the executable
Seer Classic.app/Contents/    MacOS/seer-classic (19.7 MiB) and Resources/public/ (the payload)
```

### Code build and payload

- `npm run build:desktop` is `tsc --noEmit && vite build --mode desktop`: `build.copyPublicDir` false, `outDir` dist-desktop.
  `tauri.conf.json` embeds dist-desktop and builds it with that script. The web build, `npm run dev` and `test.command` are
  unchanged; the Tauri development window runs the dev server in desktop mode.
- `npm run stage:desktop` writes THIRD-PARTY-NOTICES.txt, then `tools/distribution/stage_desktop_payload.py` clones `public/`
  into the payload (APFS clones: no disk space on this Mac), leaving out `tools/distribution/desktop-payload-exclusions.json`:
  `.DS_Store`, `*.md` and 262 named paths from the asset study's 277 never-requested files (provenance and manifest JSON, the
  five runtime indexes that are compiled into the bundle, 1x baselines and superseded interface art, the original map rasters,
  superseded portrait vectors, AI source bitmaps, the branding source of the icon, the retired laboratory emblems). The release
  gate found six small superseded HD toolbar SVGs (bag, close, dex, raising, restore, spt) possibly requestable through a
  template, so they ship. `payload.json` records the app version and every file's size and SHA-256.
- `src-tauri/tauri.bundle.conf.json` adds the payload as `bundle.resources`, and only `npm run package` passes it, so a
  development build never copies 2.8 GiB into `target/` (a full copy on Windows).

### Serving (`src-tauri/src/public_assets.rs`)

- `Context::set_assets` wraps the embedded build in `GameAssets`: a path that is not embedded is read from
  `<resource dir>/public` (Contents/Resources on macOS, the executable's folder on Windows). Tauri's own protocol serves both, so
  the origin and the IPC rules stay as they were. Tauri runs each request on its async runtime, not the main thread.
- The resolver percent-decodes the path; rejects NUL, backslashes, colons (drive letters, streams), `..` and paths absolute
  after the leading slash; canonicalizes; and requires a regular file inside the canonical root. cargo tests cover
  Windows-style paths (`/C:/Windows/win.ini`, `C:\…`, `\\server\share`, `..%5c`, `C%3A`) and a link that leaves the root.
- **Missing files are a real 404.** Tauri's protocol answers a missing path with index.html and status 200. A web resource
  handler on the main window (`on_web_resource_request`, which Tauri calls after it built the response) turns that answer into
  404 `text/plain` when the path is neither the page, an embedded file nor a payload file. Measured in the package: a missing
  portrait 404, a present one 200 `image/png`.
- **Startup check (`payload.rs`).** payload.json must exist, parse and carry the app's version (from `package_info`, which
  `tauri.conf.json` reads from package.json); otherwise a native dialog says 资源不完整，请重新解压或安装。, the window is never
  created and the app quits once the dialog closes. A background thread then checks every listed file's size; a missing or
  changed file shows the same dialog. On this Mac reading payload.json takes 5.6 ms and the 15,626 stats 44.9 ms. Development
  runs skip the check.

The desktop study's alternative, a `seer` scheme with its own handler, was measured there but not needed: the first muted launch
of the packaged game showed no problem with `set_assets`, and the 404 answer came from the web resource handler instead.

### Shell (`src-tauri/src/shell.rs`, `main.rs`)

- Plugins: single-instance first (a second launch focuses the running game; two instances would overwrite each other's save),
  log (the platform log folder, 1 MiB per file, three kept, with a panic hook, the page's errors and unhandled rejections through
  `log_web`, and the macOS web content process ending), window-state (size, position, maximized, fullscreen; not visibility,
  whose restore would also take focus) and dialog. `capabilities/default.json` grants `core:default`; the page's own calls are
  app commands. `app.withGlobalTauri` gives the page `window.__TAURI__.core.invoke`, so no npm package is added.
- The window is built in setup from its configuration (`create: false`, `visible: false`) at the largest 960:650 inner size
  within 90 % of the primary monitor's work area, never below the configured minimum (1000x700), with `preventOverflow`, then the
  window-state plugin restores the saved state and the window is shown. Example sizes: 1255x850 on a 1512x982 MacBook, 1085x734
  for 1920x1080 at 125 %.
- `src/app/desktop.ts` (only in the desktop build: `import.meta.env.MODE === 'desktop'`) blocks F5, Ctrl/Cmd+R, Ctrl/Cmd+P and
  the context menu, which offers reload and print, and forwards page errors to the log. The settings fullscreen button calls
  `toggle_fullscreen`, which sets the window fullscreen: WebView2 does not resize the window for HTML fullscreen.
- Devtools stay off in release (no `devtools` feature).
- **CSP.** `default-src 'self'`; `script-src 'self' 'wasm-unsafe-eval'` (Ruffle); `style-src 'self' 'unsafe-inline'`;
  `img-src`, `media-src` and `worker-src` with `blob:` (and `data:` for images and fonts); `connect-src 'self' ipc:
  http://ipc.localhost`. Pixi 8 compiles shader and uniform code with `new Function`, so `creature-animation-mount.ts` imports
  `pixi.js/unsafe-eval` with Pixi itself (both builds). Measured in the package: `eval` is blocked and both battle creatures
  animate.

### Saves

Both builds write through a save store (`src/kernel/persistence.ts`): the browser's `localStorage` by default, or the store the
entry point sets.

- **Desktop files (`src-tauri/src/saves.rs`, `src/app/desktop-saves.ts`).** `<app data>/saves/save.json` (macOS
  `~/Library/Application Support/local.chizhuoni.seer-classic/saves/`, Windows `%APPDATA%\local.chizhuoni.seer-classic\saves\`).
  One writer thread takes the latest save it was given and writes it through `save.tmp`, fsync, rename and an fsync of the folder;
  a burst of actions costs one write. Each run's first write, and then at most one write every 10 minutes, first copies the save
  it replaces into `backup-1.json` and shifts the older ones (three kept); save.json itself is always in place. `write_save`
  resolves once that save or a later one is on disk, or with the error of the write that failed for it. On exit the app waits
  for the last write. `read_save` waits for a pending write first, so a reload reads what the page last wrote. Development runs
  use `saves-dev/`.
- `src/main.tsx` awaits `read_save` before the game opens. With no save file, the save in this origin's `localStorage` (the
  0.2 app's) becomes the journey, and its first write creates save.json: the import happens once. If the files cannot be read,
  the boot screen says so and nothing is written.
- Unreadable saves stay as files (`unreadable-<time>-<n>.json`, AGENTS rule 7). The page names them; the shell refuses any
  other name and never overwrites one. Because each run's first write backs up the file it replaces, an unreadable save.json is
  also in `backup-1.json`.
- Export uses the native save dialog (`export_save`): the macOS web view cancels `<a download>` when the app has no download
  handler, and the game used to say 航行存档已导出 anyway. The message now appears only after the file is written. Import stays
  an `<input type=file>`.
- **Both builds.** A refused write no longer escapes from a microtask or from `createGame`: the game keeps running, the
  persistent notice `SaveProblem` (存档未能写入…) offers 导出存档 until a later write succeeds, and the next action tries again; an
  import whose write is refused is still adopted. Settings lists the kept unreadable saves, each with 导出. A save from a newer
  game says so with its format version (存档来自更新版本的游戏（存档格式 N，本游戏为 5）…). A root error boundary offers 导出存档 (the
  journey is still in memory) and 重新载入.
- `golden-saves` (gate) opens the 0.2 app's version-1 save (copied read-only out of
  `~/Library/WebKit/local.chizhuoni.seer-classic`; it holds game state only: three Lv 5 starters, no nickname) and a version-5
  save of 0.3.2 with a Chinese nickname, from the save store, with no notice; the current one exports unchanged. Add a fixture
  for every release that changes the format.

### Identity and notices

- `tauri.conf.json` reads its version from package.json. The `desktop-identity` gate keeps Cargo.toml, Cargo.lock and
  package-lock.json equal to it, and keeps the identifier, Tauri's own protocol and `useHttpsScheme` off. Versions are unchanged
  (0.3.2) until the coordinator sets them.
- `tools/distribution/third-party-notices.mjs` writes THIRD-PARTY-NOTICES.txt (512 KiB) from what ships: the 18 npm packages
  whose modules Rolldown bundles into the desktop build (an in-memory build with the project's configuration, not `npm ls`:
  `@seer-pet-anim/swf-bundle`'s AGPL dependency `@arkntools/unity-js` is not among them), Ruffle with its LICENSE_MIT and
  LICENSE_APACHE, and the 239 Rust crates the executable links for the target (`cargo metadata --filter-platform`, normal
  dependencies). Each license text is printed once with the packages it covers; a package without a license file gets the MIT
  text with its authors, or the same license's text from another package of the set (15 crates, `@pixi/colord`). Vite's
  `LICENSE.md` is cut before its own bundled dependencies, which never reach the game.
- The asset notice (`src/app/asset-notice.txt`: unofficial fan remake, original art, sound and SWFs © 上海淘米网络科技有限公司,
  not for sale) heads THIRD-PARTY-NOTICES.txt, is in the player README and shows in settings under 关于 with the version.
  关于 also shows the license texts, which the packaged game serves from its payload.

## The macOS package

`npm run package` (through `heavy.sh` with `CI=true CARGO_BUILD_JOBS=4` on this Mac):

1. `build:desktop`; `stage:desktop` (notices, then the payload);
2. the `desktop-payload` gate;
3. `tauri build --bundles app --config src-tauri/tauri.bundle.conf.json`: ad-hoc signed, arm64, `LSMinimumSystemVersion` 12.0;
4. `tools/distribution/pack_macos_dmg.py`: `codesign --verify --deep --strict`, then a UDZO DMG with the .app (an APFS clone of the
   signed bundle), a link to /Applications, 请先阅读.txt and THIRD-PARTY-NOTICES.txt, checked with `hdiutil verify`.

Measured (2026-10-23, Apple M4): 154.6 s for the whole script with an incremental Rust build (39.7 s); a cold Rust build of the
shell took 76 s. Executable 20,641,344 B (19.7 MiB). .app 2.77 GiB, 15,628 sealed files, valid ad-hoc signature (flags
adhoc, runtime). DMG 2,881,846,283 B (2.68 GiB; the payload is already compressed, so UDZO saves little). `syspolicy_check
distribution` reports the expected "Adhoc Signed App" and "Notary Ticket Missing": other Macs need Open Anyway.

## Release gate

In order:

1. `npm ci`, `npm run typecheck`, `npm test`, `npm run verify` (the gate suites, now with `golden-saves` and
   `desktop-identity`), and `node tools/verification/run.mjs --status needs-rust` (`desktop-shell`: the shell's cargo tests).
2. `desktop-payload` (status `release`; `npm run package` runs it):
   - dist-desktop holds only index.html, assets/ and ruffle/, with no source map;
   - payload.json is of this version and matches the staged files (count, sizes, SHA-256);
   - the payload is `public/` without the exclusion list, with no .DS_Store or .md;
   - every path the minified build can request is staged and none is excluded. The gate reads the build's strings from rolldown's
     syntax trees (inlined JSON included) and its styles, fills its template paths (`/portraits/${…}.png`, a `<skillId>`
     placeholder) with every known file whose filled-in parts are numbers or strings of the build, and follows the references of
     requested SVG, CSS and JSON files. A dynamic path it cannot read fails it. All 15,626 staged files are requestable.
3. The needs-assets and needs-browser suites, the latter with `SEER_PUBLIC=releases/desktop-payload/public` so that the browser
   harness serves the staged payload instead of `public/` (Chrome with `--mute-audio`, and Playwright WebKit when installed).
4. The packaged smoke test below.
5. Windows: the static checks and the checklist on a real PC (open points).
6. Equal versions (the identity gate), a CHANGELOG entry, the notices present, a git tag.

### Packaged smoke test (`npm run package:smoke`, `npm run smoke:macos`)

The smoke build is the same app built with `--features smoke` under its own identifier (`local.chizhuoni.seer-classic.smoke`), so
the player's data is never touched. `src-tauri/src/smoke.rs`, compiled only into that build, adds the page driver
(`src-tauri/smoke/driver.js`) as an initialization script, exports to a fixed file instead of the dialog, and keeps the app from
ever activating itself: its window stays above other windows but almost entirely off screen, because WebKit stops animation
frames in a window it cannot see (a first run with the window behind others stalled at the battle loading screen's first
`requestAnimationFrame`). The driver mutes the game before it loads (the game's mute setting, silent WebAudio, muted media) and
clicks with untrusted events, so the game never unlocks audio. `tools/distribution/smoke_macos.py` launches the executable as
its own process, reads the driver's lines from the app's log, and deletes the smoke identifier's data (Application Support,
Logs, WebKit, Caches) before and after.

Phases and results (all passed, 2026-10-23):

| Phase | Checks |
| --- | --- |
| import | first start: the 0.2 app's version-1 save in local storage becomes save.json (migrated, same seed) |
| battle | world map with no broken image; origin tauri://localhost; a missing file 404, a present one 200; eval blocked by the CSP; a wild battle with both creatures animated and a skill effect drawn; export writes the save; quit; save.json holds the journey |
| relaunch | the save file loads (its export equals it), backup-1.json holds the previous run's save, 关于 shows the license texts |
| unreadable | a broken save.json is kept as unreadable-*.json and in backup-1.json, the notice says so, settings lists it, a new journey starts |
| refuse | without payload.json, and without one listed file, the payload check logs its refusal and shows its dialog |

Times in the packaged app (spawn to world map; the fight button to the battle's commands; a skill command to the first frame the
Ruffle canvas draws, which follows the move's hit marker):

| Measure | Result |
| --- | --- |
| startup, first launch of a newly built app | 5.9-6.5 s (macOS checks a new 2.8 GiB bundle once; a fresh profile with a known binary took 0.40 s) |
| startup, later launches | 0.40-0.48 s |
| battle entry | 1.42-1.53 s |
| first skill effect | 1.96-2.70 s after the command |

The effect path in WKWebView, an open point of [handoff-2026-10-22](handoff-2026-10-22.md), works in the package: Ruffle's
host starts behind the first loading screen and the first move's effect draws. The shader-cache cost of a new binary is inside
the first-launch time above; it was not isolated.

## Player README (请先阅读.txt)

`tools/distribution/player-readme.txt`, shipped as 请先阅读.txt in the DMG (and to be shipped in the Windows ZIP). Its text:

```
赛尔经典 · Seer Classic — 请先阅读

赛尔经典（Seer Classic）是非官方的爱好者重制版，与上海淘米网络科技有限公司无关。游戏中的原版美术、音效、动画与 SWF 素材版权归 © 上海淘米网络科技有限公司所有。本作免费提供，仅供个人怀旧与学习，不得出售或用于任何商业用途。

一、安装前
- 安装过程中请预留约 5.5 GB 可用磁盘空间（安装包约 2.7 GB，游戏本身约 2.8 GB）。
- 游戏完全离线运行，不需要网络。

二、macOS（Apple 芯片的 Mac）
1. 打开 .dmg，把“Seer Classic”拖进“应用程序”文件夹。
2. 第一次打开时，系统会提示无法验证开发者。请打开“系统设置 > 隐私与安全性”，在页面下方找到 Seer Classic，点“仍要打开”，再确认一次。之后即可正常打开。
3. 请不要修改“应用程序”中 Seer Classic 包内的任何文件，否则系统会认为它已损坏。

三、Windows 10 / 11（64 位）
1. 解压前，在 ZIP 文件上右键 > 属性，勾选“解除锁定”，再点“确定”。
2. 解压到本地文件夹，例如 C:\Games\SeerClassic。不要解压到 OneDrive 同步的“桌面”或“文档”中：同步会上传约 2.8 GB 文件，还可能让文件只留在云端。
3. 必须完整解压整个文件夹：Seer Classic.exe 要和 public 文件夹放在一起。如果提示“资源不完整，请重新解压或安装。”，请删除这个文件夹后重新完整解压。
4. 双击 Seer Classic.exe。如果出现“Windows 已保护你的电脑”，点“更多信息 > 仍要运行”。
5. 游戏需要 Microsoft Edge WebView2 运行时（Windows 11 和多数 Windows 10 已自带）。如果打开时提示缺少 WebView2，请从 https://developer.microsoft.com/microsoft-edge/webview2/ 安装 Evergreen 运行时后再打开。

四、把浏览器版的存档搬进来
1. 在浏览器版游戏中（双击 test.command 打开，地址为 http://127.0.0.1:1426/），打开“设置”，点“导出存档”，保存得到的 .json 文件。
2. 在本应用中打开“设置”，点“导入存档”，选择刚才的文件。

五、存档在哪里
游戏自动保存。存档是普通文件，删除或更新应用都不会删除它：
- macOS：~/Library/Application Support/local.chizhuoni.seer-classic/saves/
- Windows：%APPDATA%\local.chizhuoni.seer-classic\saves\
save.json 是当前存档，backup-1.json 到 backup-3.json 是较早的备份；无法读取的旧存档会以 unreadable-*.json 原样保留，也可以在“设置”中导出。
随时可以在“设置”中点“导出存档”另存一份。
想从头开始：先退出游戏并导出存档备份，再删除上面的 save.json（备份文件可以一并删除）。下次打开时会开始新的旅程。
日志在 macOS 的 ~/Library/Logs/local.chizhuoni.seer-classic/ 和 Windows 的 %LOCALAPPDATA%\local.chizhuoni.seer-classic\logs\，反馈问题时请一并附上。

六、开源许可
游戏使用的开源软件及其许可条款见同目录的 THIRD-PARTY-NOTICES.txt，也可以在游戏的“设置 > 关于”中查看。
```

## Open points

- **Windows** is not built or run. The shell code is shared and the resolver is tested with Windows-style paths, but nothing
  checked the cross-built executable, WebView2's custom-protocol speed, accelerator keys, fullscreen, DPI or Defender. The
  portable ZIP (`SeerClassic-<ver>-windows-x64\{Seer Classic.exe, public\, 请先阅读.txt, THIRD-PARTY-NOTICES.txt}`) and its
  packer are still to be written; cross-building needs `brew install llvm`, the msvc Rust target and cargo-xwin (user approval).
  The notices generator then needs `--target x86_64-pc-windows-msvc`.
- The native save dialog itself is not exercised by automation (the smoke build writes to a fixed file); try one export by hand.
- Gatekeeper's first check of a quarantined, downloaded DMG on another Mac was not timed.
- The minimum macOS version stays 12.0, but the build targets Safari 16.4 and the battle loader needs DecompressionStream
  (Safari 16.4): the critic recommends 13.3. The icon is still the upscaled official favicon. Both wait for the user.
- WebKit pauses animation frames while the window cannot be seen, so a battle's loading screen waits while the game is hidden,
  as in a background browser tab; it goes on when the window shows again.
- A catalog-id stability check against the previous release (gate item 5 of the merged plan) is not built; `golden-saves` covers
  the ids its fixtures use.
