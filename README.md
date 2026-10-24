# Seer Classic

A local, single-player remake of pre-2013 Seer (赛尔号), focused on PvE battles and monster raising. The interface is Chinese. It keeps the recovered battle and raising engines, the complete recovered classic catalog, and the original portraits, battle motion, scenes and interface art. It runs in the browser, ships as a browser package for Windows and macOS, and as a Tauri app for macOS.

## Documentation

| Document | Contents |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Binding rules for every agent and contributor: commands, workspace layout, layering and size rules. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers, top-level directories, data flow, the battle engine, saves and verification. |
| [battle/RULES.md](battle/RULES.md) | The battle rules (current truth). |
| [raising/SPEC.md](raising/SPEC.md) | The raising rules (current truth). |
| [data/README.md](data/README.md) | The catalog files and their sources. |
| [design/notes/INDEX.md](design/notes/INDEX.md) | Every design note with a one-line summary and its status. |
| [CHANGELOG.md](CHANGELOG.md) | What each revision changed, newest first. |

[`design/approved-plan.json`](design/approved-plan.json) records the user's product decisions through revision 50; later decisions are in the design notes.

## Run and check

Requires Node.js 22.18 or newer and npm. The workspace layout around this repository (the `../analysis` research data, the ignored runtime assets in `public/`, the `.cache/` inputs) is described in [AGENTS.md](AGENTS.md#workspace-layout).

```sh
npm ci
npm run dev -- --port 1426   # development game at http://127.0.0.1:1426/
npm run typecheck            # tsc --noEmit
npm test                     # node --test unit tests
npm run verify               # every gate suite in tools/verification/MANIFEST.json
```

Run `typecheck`, `test` and `verify` before committing. `node tools/verification/run.mjs --status all` runs every registered suite except `tool` scripts; logs go to `artifacts/verification/`.

- `npm run dev` serves port 1420, which the Tauri development window uses; `npm run dev:preview` serves port 1421. Browser saves belong to the origin, so each port keeps its own save.
- `/preview.html` mounts the full game shell with a six-creature fixture for UI inspection ([full-shell-preview-v52](design/notes/full-shell-preview-v52.md)).
- The game saves automatically. Settings and the item window export and import saves. The optional modifier in settings edits collection, resources, level, individual value, nature and traits; learning values are also editable in the creature window.
- The developer stylesheet optionally uses locally installed SimSun and SimHei, or copies prepared under the ignored `.cache/classic-ui-v27/` by `tools/assets/prepare_classic_development_font.py`. Production builds omit this font import and fall back to system fonts.

## Build and package

```sh
npm run build                    # typecheck, then the production bundle in dist/
npm run preview -- --port 1426   # serve dist/
npm run desktop                  # Tauri development window (dev server in desktop mode)
npm run build:desktop            # typecheck, then the desktop app's code only, in dist-desktop/
npm run stage:desktop            # THIRD-PARTY-NOTICES.txt, then the payload in releases/desktop-payload/public/
npm run package                  # the macOS app and DMG in releases/ (needs Rust and the Tauri prerequisites)
npm run package:smoke            # the same app with the smoke driver, under its own identifier
npm run smoke:macos              # the packaged smoke test, silent and in the background
npm run package:browser          # the browser package for Windows and macOS: releases/SeerClassic-<version>-browser.zip
node tools/verification/browser-package.mjs   # its release gate: the unzipped package, a smoke and two browser suites
```

The browser package ([browser-package-2026-10-23](design/notes/browser-package-2026-10-23.md)) is the version common to Windows 10/11 x64 and macOS 13.5+ (Apple silicon and Intel): one folder with `启动游戏-Windows.bat` and `启动游戏-macOS.command`, the official Node.js 24 binaries in `runtime/` (pinned with their SHA-256 in `tools/distribution/browser/node-runtime.json`, downloaded into `.cache/node-runtime/`), the dependency-free `server.mjs` and `game/` (the web build and the desktop payload). The server listens on http://127.0.0.1:1426/, the origin of `test.command`, so the save in a browser's storage stays the same; it opens Edge as an app window on Windows, and on macOS Chrome or Edge when installed (Safari may delete a site's storage after 7 days without a visit), else the default browser. Behind a proxy, run the packer with `NODE_USE_ENV_PROXY=1`. The player README is `tools/distribution/browser/player-readme.txt`.

The desktop app ([desktop-package-2026-10-23](design/notes/desktop-package-2026-10-23.md)) embeds only the code build; the payload, the files of `public/` the game can request, ships beside the executable and is checked at startup against its `payload.json`. Its saves are files in the app data folder. `npm run package` builds the code, stages the payload, runs the `desktop-payload` release gate, builds the ad-hoc signed arm64 `.app` and packs `releases/SeerClassic-<version>-macos-arm64.dmg` with the player README (`tools/distribution/player-readme.txt`, 请先阅读.txt) and THIRD-PARTY-NOTICES.txt. A Windows build of the same shell (a portable ZIP) has not been built; Windows players use the browser package.

## Content

- 1,483 species and 5,325 skills from the recovered classic catalog, with original official portraits and battle motion for every species.
- 180 encounter definitions in `data/bosses`: SPT bosses, legendary challenges and campaigns, the Brave Tower and Dark Arena, story and task battles. Bosses are available at any time, and Boss victories grant essence items that hatch immediately.
- Three station battle facilities: random Lv.100 teams, random teams from the 124-species Peak Duel pool, and the tactical room with the ten fixed teams in `data/trainers`. Trainer encounters use the search planner; they grant currency and experience and are not acquisition routes.
- Ordinary wild creatures are obtained with capsules in battle; defeating them does not recruit them. Since revision 34 every eligible form (all but the four NPC-only species) has an executable route through capture, Boss essences, collection tasks, fusion, breeding or evolution.
- The trait registry keeps the 48 original classic trait records. Hui Xin and Mian Bao use the labeled remake calibration in [critical-traits](design/notes/critical-traits.md); Luan Wu needs multi-target combat and is unavailable.
- The 2013 engravings are installed: 147 ability and 399 skill engravings, equipped one of each per monster ([engravings-2013](design/notes/engravings-2013.md)).
- The original floor-69 tower record had an empty opponent team; its copy is kept in `design/source-snapshots/`. The playable floor uses the four documented floor-70 species at the preceding floor's level and HP, as an explicit remake choice.
