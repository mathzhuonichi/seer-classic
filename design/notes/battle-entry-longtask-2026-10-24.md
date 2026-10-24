# Battle-entry long task: how common it is, and the options

Status: current. Measurement only, 2026-10-24 (the user asked for it on 2026-10-24); the fix is not chosen. Measured on a
throwaway worktree at a48f2d8 plus five measurement hooks (switched by localStorage keys), not committed. The battle-entry path
(`battle-animation.ts`, `ui/creature-animation-mount.ts`, `useBattlePreparation.ts`) is unchanged between a48f2d8 and b0f2827,
and the one `App.tsx` line the warm-up variant touches (`{battleOpen&&!preparation&&<div className="battle-layer">`) is also
unchanged at b0f2827 (App.tsx otherwise gained save slots and map music, which this path does not use).

## Answer in brief

- **Mechanism.** Every battle mounts each combatant into its own WebGL renderer and uploads its **whole** HD atlas (not just the
  standby cells, which are a median 36% of the atlas and 4.1% for 皮皮). The synchronous mount block is texImage2D (main-thread
  copy) + the first draw (Pixi's program link check is a GPU sync point that waits for the upload) + `visibleStandbyBounds`
  (readPixels of the whole canvas, a second sync, then a JS scan of every pixel). Its cost is linear in the atlas size:
  - Chrome 1280x800@1: **block = 9.1 + 0.322 ms/MiB** (r² = 0.99, n = 108).
  - Chrome 1920x1080@2: **block = 23.4 + 0.342 ms/MiB** (r² = 0.97, n = 108). DPR 2 adds about 15-20 ms per mount, from the
    readback and scan of a 4x larger canvas, so even a 0.9 MiB atlas costs 24-28 ms there.
  - WebKit 1280x800@1: block = 25 + 1.02 ms/MiB (r² = 0.97); its texImage2D from an ImageBitmap alone is 0.78 ms/MiB.
- **How common (Chrome, threshold 50 ms, idle machine).**
  - 1280x800@1: a long task holds the opponent's mount from about 95 MiB. That is 8-12% of all species (120-180 of 1,483),
    4% of wild encounters and 25-38% of Boss species.
  - 1920x1080@2: from about 55-60 MiB, so 32% of species, 23% of wild encounters and 58% of Boss species. Counting any
    ≥ 50 ms task after the reveal (the player's own mount too), that rises to 38% / 29% / 61%.
  - A second battle against the same species repeats it, because nothing survives between battles.
  - So the user's guess holds for the large-atlas species but not for "most species" at 1280x800@1. It comes much closer at
    DPR 2, and in WebKit it holds for nearly all species.
- **The first battle of each session** has a separate 85-116 ms frame (median 104-106 ms) at the reveal for **every** species. It is
  mostly **not** the Pixi import. A Chrome trace shows the main thread parsing three large battle-UI SVGs that are requested
  only when the battle layer mounts: `battle-log-panel-v44.svg` 1.7 MB, `battle-hud-player-v44.svg` and
  `battle-hud-opponent-v44.svg` 2.65 MB each, all with embedded base64 PNGs. Their parses take 21 + 31 + 29 ms. Evaluating the
  Pixi chunk adds 15-20 ms. Preimporting Pixi on the loading screen trims the frame only to 89-93 ms.
- **The player's pet** follows the same law as the opponent and costs the same on every battle. The starters (1, 4, 7: 9-37
  MiB) never produce a long task at 1280x800@1. Leads of 100 MiB or more (70, 6, 300, 502) cause one in every battle: 50-103 ms
  at 1280x800@1 and 63-195 ms at 1920x1080@2.
- **WebKit** (the Safari fallback of the browser package) is 3-4x worse. The second-battle worst frame is ≈ 19 + 2.9 ms/MiB at
  1280x800@1 and ≈ 37 + 3.0 ms/MiB at 1920x1080@2: 皮皮 234-276 ms, 502 750-810 ms, and 104-123 ms already at 24.5 MiB. The
  first battle has 150-325 ms frames. Removing the readback (mesh) or deferring it does not help in WebKit.
- **Recommendation: (c3) prewarm.** Mount the battle hidden during the loading screen's last step ("部署出战精灵…", which
  already waits 950 ms). Measured in Chrome at both viewports for 301, 10 and 502, first and second battles alike, it leaves
  **zero long tasks after the reveal, a worst frame of 16.8 ms**, and **no change in loading time**. It also removes the
  first-battle SVG frame. In WebKit it brings 皮皮 from 234-276 ms down to 31-50 ms. The cost moves into the loading screen,
  where one task of the block's size runs (40-170 ms). Follow-up if pet switches mid-battle matter: (b2) registration
  precomputed offline, which halves every mount, including the ones prewarm cannot reach.

## Method

- **Harness.** `scripts/bench.mjs` serves `dist` (the vite build of the worktree) through request interception. For each case it
  opens a fresh headless context with a seeded save (lead at level 100) and runs two battles against the same wild species,
  fleeing in between.
  - Instruments: Long Tasks API, Long Animation Frames (LoAF), rAF frame gaps after the reveal (`maxFrame`), timing hooks on
    WebGL calls (≥ 0.5 ms), and phase marks per mount. `init → started` is the synchronous mount block: one task, microtasks
    only.
  - Silence: `--mute-audio`, the game muted, AudioContext suspended and media muted, so Ruffle got no sound.
  - Engines: Chrome 156 (channel chrome, headless; DPR 2 through CDP `Emulation.setDeviceMetricsOverride`) and Playwright
    WebKit 2215 (DPR through `deviceScaleFactor`).
- **Opponent sample.** 18 species from 0.9 to 256 MiB, 3 pages x 2 battles = 108 battles per viewport; the lead is 303 (6.8 MiB).
- **Machine.** One browser at a time through the load gate, and every section started with a 1-minute load below 3. The one
  Chrome itself kept the load at 2.2-3.9 during runs; Spotlight indexing delayed one section start. Swap held at 1.77-1.83 of
  3 GiB and memory stayed ≥ 69% free, including during the 240/256 MiB atlases at DPR 2, which ran last.
- **Data quality.** No failed rows and no page or console errors in any new file (333 bench rows plus 18 micro-benchmark rows).
- **The earlier 1280x800 data were inflated by load.** The `opp-1280.jsonl` data from the morning, taken while other lanes
  loaded the machine, give a slope of 0.65 ms/MiB instead of 0.32 ms/MiB on the idle machine.
  - 皮皮's task: 90 and 88 ms loaded, 56 and 54 ms idle. Species 22 (64 MiB): 85 and 62 ms loaded, no long task idle.
  - The species shares fell from 29% / 19% / 56% to 8% / 4% / 25%.
  - The idle spot check (`idle-1280`: 301, 210, 22, 10 and 502) agrees with the full idle rerun (`opp-1280-idle`), which
    replaces the loaded data.

## 1. What blocks at entry

The timeline of the opponent's mount (皮皮, Chrome 1280x800@1, idle, medians) is about 145-290 ms after the reveal, depending
on the decode:

| step (inside one task) | 皮皮 98 MiB | 502 256 MiB | 301 0.9 MiB |
|---|---|---|---|
| texImage2D in `mountInto` (`releaseAtlasLayoutPixels`, atlases ≥ 16 MiB) | 14.3 ms | 35.3 ms | (at first draw) 0 |
| program link check `getProgramParameter`, which waits for the upload | 7.6 | 22.4 | 0.9 |
| readPixels in `visibleStandbyBounds` | 11.0 | 26.5 | 1.8 |
| registration total (draw + readPixels + JS scan) | 25.2 | 52.3 | 8.9 |
| **block (init → started)** | **43.0** | **91.8** | **11.5** |
| long task holding it | 0 / 57 / 56 ms (#1), 0 / 51 / 54 (#2) | 95-98 | none |

The Chrome trace (`runs/trace.303-10-base-p0.trace.json`) shows the same: the main thread waits about 40 ms in
`CommandBufferHelper::Finish` while the GPU process runs 12-14 ms WebGL flushes (the upload).

On a blank page (`runs/upload-micro.jsonl`), Chrome's texImage2D takes 13.5-14 ms for 98 MiB and 35-37 ms for 256 MiB, and
the next sync then waits 10 and 23 ms. Waiting two frames before the sync does not shrink it (15 and 38 ms), because Chrome
uploads when the commands are flushed, not in the background.

## 2. How common, per viewport (Chrome, opponent, idle)

| | 1280x800@1 | 1920x1080@2 |
|---|---|---|
| block fit | 9.1 + 0.322 ms/MiB (r² 0.99) | 23.4 + 0.342 ms/MiB (r² 0.97) |
| ≥ 50 ms task holding the opponent mount, by atlas bin ≤16 / 16-40 / 40-60 / 60-90 / 90-135 / >135 MiB | 0 / 0 / 0 / 0 / 63 / 100 % | 8 / 17 / 33 / 89 / 100 / 100 % |
| battles per bin (n, two battles per page) | 24 / 18 / 6 / 18 / 30 / 12 | 24 / 18 / 6 / 18 / 30 / 12 |
| threshold | ≈ 95 MiB | ≈ 55-60 MiB |
| share of all species (1,483) | **8%** (bins) - 12% (≥ 95 MiB) | **32%** (any task after reveal 38%) |
| share of wild encounters (266 region x species pairs) | **4%** | **23%** (29%) |
| share of Boss species (154) | **25%** (bins) - 38% | **58%** (61%) |
| task length when it happens | 51-64 ms (90-135 MiB), 90-98 ms (240/256 MiB) | 50-87 ms (55-135 MiB), 104-191 ms (240/256 MiB) |
| ≥ 50 ms frame (LoAF) holding the opponent mount | 30% / 24% / 52% of species / wild / Boss | 79% / 83% / 82% |
| second battle, same species | repeats (皮皮 0/51/54 ms; 502 95-97 ms) | repeats (皮皮 62-68 ms; 502 111-116 ms) |
| every first battle: frame at the reveal | 75-116 ms, median 106 (all species) | 76-115 ms, median 104 |

The size distribution behind the shares: the median atlas is 24.5 MiB, p90 is 112 MiB, and 11% of species are ≥ 100 MiB.
Wild species are smaller (12% ≥ 60 MiB) and Boss species larger (49% ≥ 60 MiB). The fit files are `runs/opp-1280-idle.fit.json`
and `runs/opp-1920-all.fit.json`; `rates.n` is now a count.

At DPR 2 even small pairs show a frame at the reveal: the two mounts (25-35 ms each) land in one frame, which takes 65-85 ms on
second battles (301: 79 ms). With `mesh` (no readback) that drops to a worst frame of 16.8 ms.

## 3. The first battle of a session

Every first battle has one 85-116 ms animation frame right at the reveal (LoAF with blocking 0: several tasks each under 50 ms),
whatever the species. The trace (`runs/trace.303-301-base-p0.trace.json`) shows its content:

- The battle layer requests its UI SVGs about 20 ms before the reveal.
- `SVGImage::DataChanged → IsolatedSVGDocumentHost::load` parses three of them on the main thread at +64, +85 and +117 ms, for
  21, 31 and 29 ms: `battle-log-panel-v44.svg` (1.7 MB) and `battle-hud-player-v44.svg` / `battle-hud-opponent-v44.svg`
  (2.65 MB each). They wrap base64 PNGs, so they decode further PNGs once parsed.
- Evaluating the Pixi chunk `lib-*.js` adds 15-20 ms. Its parse runs in the background.

How the warm-up variants change it:

| variant | first-battle frame at the reveal |
|---|---|
| base | 101-102 ms |
| preimport (Pixi on the loading screen) | 89 ms at 1280x800@1, 93 ms at DPR 2 |
| prerender (also a 1x1 renderer on the loading screen) | 107-123 ms |
| prewarm | none |

Preimport and prerender also make loading 30-50 ms longer.

## 4. The player's pet (LEADS: lead vs 301, 2 pages x 2 battles)

| lead | MiB | lead block 1280x800@1 | task 1280x800@1 | lead block 1920x1080@2 | task 1920x1080@2 |
|---|---|---|---|---|---|
| 303 | 6.8 | 9-14 ms | none | 24-47 ms | 60 ms once in 4 (both mounts in one task) |
| 1 | 9.4 | 10-18 | none | 24-35 | none |
| 7 | 17.1 | 13-16 | none | 31-36 | none |
| 3 | 17.5 | 12-16 | none | 29-38 | none |
| 216 | 28.1 | 16-18 | none | 30-38 | 53 ms once in 4 |
| 4 | 37.2 | 19-26 | none | 33-36 | none |
| 70 | 102.3 | 41-44 | 50 (3 of 4) | 56-59 | 63-66 |
| 6 | 126.7 | 50-51 | 54-57 | 62-68 | 68-83 |
| 300 | 128.0 | 52-56 | 58-68 | 69-74 | 79-86 |
| 502 | 256.0 | 91-97 | 96-103 | 122-189 | 132-195 |

The lead uploads on every battle, so a player whose main pet is a ≥ 100 MiB species (11% of species) gets the task in every
battle, whatever the opponent.

## 5. WebKit (Playwright WebKit 2215; no Long Tasks or LoAF API, so these are rAF frame gaps)

| | 1280x800@1 | 1920x1080@2 |
|---|---|---|
| mount block | 25 + 1.02 ms/MiB (r² 0.97) | 43 + 1.01 ms/MiB (r² 0.97) |
| texImage2D(ImageBitmap) | 6 + 0.78 ms/MiB | 9 + 0.77 ms/MiB |
| worst frame, second battle | 19 + 2.88 ms/MiB (r² 0.98); 301 20 ms, 1402 104, 210 175, 皮皮 234-237, 96 425, 502 750-769 | 37 + 2.96 ms/MiB; 301 38-40, 1402 121-123, 皮皮 253-276, 502 783-810 |
| worst frame, first battle | 150-185 ms (301) to 574-668 (502) | 180-240 (301) to 679-685 (502) |
| ≥ 50 ms frame from about | 11 MiB: 79% of species, 67% of wild encounters, 93% of Boss species | 5 MiB: 95% / 92% / 99% |
| mesh / defer (皮皮, second battle) | 226-234 ms (no gain) | 257-331 ms (no gain) |
| prewarm (皮皮) | first 97-98, second 31-36 ms | first 106-107, second 47-50 ms |

In the upload micro-benchmark, WebKit's texImage2D from an ImageBitmap takes 62-95 ms for 98 MiB and 166-256 ms for 256 MiB.
From raw pixels (Uint8Array) it takes 7 and 18 ms, plus a sync of 23 and 49 ms.

## 6. Options

Effects are measured unless marked *estimated*. Chrome numbers are medians over 3 pages (first and second battle);
"after reveal" is the window that matters to the player.

| option | Chrome 1280x800@1 | Chrome 1920x1080@2 | WebKit | cost | risks |
|---|---|---|---|---|---|
| **(a) nothing** | 8-12% of species / 4% wild / 25-38% Boss: 51-98 ms task; every first battle: a ~105 ms frame | 32-38% / 23-29% / 58-61%: 50-191 ms; 65-85 ms reveal frames even for small pairs | nearly all species: 100-800 ms frames | none | none |
| **(b1) defer** (registration on the next frame) | 皮皮 block 27-31 ms plus 10-13 ms deferred, so no ≥ 50 task; 502 still 67-70 ms plus 29 ms; first-battle frame unchanged | 皮皮 25 ms plus 23-29 ms deferred (one 53 ms task in 6); 502 70-78 ms (once 140) plus 46 ms; reveal frames still 63-82 ms | no gain (texImage2D dominates) | ~15 lines in `creature-animation-mount.ts`; keep `onReady(false)` until the deferred registration, or the clip jumps by one frame | a one-frame placement jump if done carelessly; large atlases still block |
| **(b2) registration precomputed offline** (runtime cost measured as `mesh`) | 皮皮 block 26 ms (-17), no task; 502 62 ms, tasks 66-70; 301 2 ms; second battles' worst frame 17-50 ms | 皮皮 26 ms (-30), no task; 301 2-9 ms (-20): the DPR-2 penalty is gone and second-battle reveal frames are 17-33 ms; 502 63-66 ms, tasks 68-75 | -10-15 ms of 110-150 (no visible gain) | small to medium; see below | box differs slightly from today's runtime measurement, which moves creatures by a pixel or so; must be checked over all species |
| (c1) preimport Pixi chunk on the loading screen | first-battle frame 101 → 89 ms; nothing else | 102 → 93 ms | not measured | ~5 lines | loading +30-50 ms |
| (c2) prerender (1x1 renderer on the loading screen) | no gain (107 ms) | worse (123 ms) | not measured | ~10 lines | none, but useless |
| **(c3) prewarm** (mount the battle hidden from the deploy step) | **after reveal: 0 long tasks, worst frame 16.8 ms for 301, 10 and 502, first and second battle; loading unchanged (1,328-1,626 ms vs 1,319-1,627 ms)**; on the loading screen: one 40-103 ms mount task | **same: 0 tasks, 16.8 ms frames**; loading-screen task 58-68 ms (皮皮), 119-169 ms (502) | 皮皮 first 97-107 ms, second 31-50 ms (from 234-276) | ~30-60 lines: App.tsx, the BattlePreparation type, useBattlePreparation, a verification suite | early side effects of a hidden Battle; one stall of the progress bar at "部署出战精灵…"; mid-battle mounts (pet switch) unchanged |
| (c4) kept renderer / shared WebGL context across battles (*estimated*) | removes the lead's re-upload after the first battle (9-14 ms; 50-100 ms for ≥ 100 MiB leads) and the opponent's only when the same species repeats | lead 30-35 ms (63-195 for big leads) | lead 25-270 ms | medium-large: renderer outlives the battle layer, canvas moves between hosts, context-loss path, pool | GPU memory held between battles (lead atlas up to 256 MiB) |
| **(d) downsized atlases** (d2 = half side, 1/4 bytes; d4 = 1/16) | 10d2 18 ms, 10d4 9-16 ms; 502d2 27-30 ms (one 50 ms task), 502d4 12-13 ms | 10d2 29-31 ms, 10d4 26-32 ms; 502d2 42-46 ms (tasks 52-78 ms in 3 of 6), 502d4 34 ms | not measured (≈ 1 ms/MiB) | an asset pipeline pass and a review of 1,483 species; to stay sharp on Retina it needs per-DPR atlas sets (+ payload), chosen at load | at DPR 2 a uniform downsize keeps a median 100% of bytes for ≥ 60 MiB species, so there is no gain without visible blur; at DPR 1 a median 18.5% would do |
| (e) upload in strips across frames (texStorage2D + texSubImage2D, micro-benchmark) | 皮皮 8 strips, each ≤ 2.6 ms plus ≤ 5.5 ms sync per frame; 502 5.5-17 ms plus ≤ 3 ms | same per frame | 皮皮 10-11 ms plus 3-4 ms (first 26 ms); 502 25-30 ms plus 6-7 ms (first 65 ms) | large: change `@seer-pet-anim/swf-renderer` 0.3.1 (`prepareAtlasTiles`, `releaseAtlasLayoutPixels`) or a custom Pixi texture source; the creature appears about 8 frames later (portrait meanwhile); needs (b2), since the first draw needs the whole texture | Pixi internals; an external package release |
| (f) WebKit: upload raw RGBA instead of an ImageBitmap (micro-benchmark) | no gain (9-13 ms plus 10-13 ms) | no gain | 皮皮 7 ms plus 23 ms (vs 62-95 plus 22); 502 18 ms plus 49 ms (vs 166-256 plus 46) | medium: worker decode to raw pixels, an engine-specific path | memory of a raw copy; Safari is only the fallback |
| (g) upload the standby cells first / split atlases per animation (*estimated*) | entry upload -64% median (皮皮 -96%) | same | same | large: re-pack atlases, multi-atlas bundle format, renderer support, preload of the move atlases before their first use | a hitch moves to the first move unless preloaded in idle frames |
| (h) battle-UI SVGs decoded on the loading screen, or shipped as PNG/WebP (*estimated from the trace*) | first-battle frame about -60-80 ms (of ~105) | same | likely larger (WebKit first-battle frames 150-325 ms) | tiny: add the three URLs to the loading-screen preload with `decode()`, or convert the three files | none known; already covered by (c3) |
| (i) compressed GPU textures, KTX2/Basis (*estimated*) | 4-8x less upload and GPU memory | same | same | very large: pipeline, transcoder worker, per-platform formats | quality and format support |

## 7. Recommendation: (c3) prewarm, then (b2) if mid-battle mounts matter

(c3) is the only option that removes the long task and the long frames at the reveal for every atlas size (up to 256 MiB), at both
viewports, for the opponent and the player's pet. It also removes the first-battle SVG frame. It costs no loading time, because the
deploy step already waits `DEPLOY_MS` + `START_MS` = 950 ms, and the mounts (≤ 170 ms) finish inside that wait. The work does not
disappear; it moves under the loading screen, which the player sees as a static progress bar.

### Implementation sketch

Size: about 30-60 lines of product code plus one verification suite.

1. **`src/features/battle/ui.ts` (`BattlePreparation`) and `src/app/useBattlePreparation.ts`.** Give the preparation a named
   stage, for example `deploying: true` set together with `report(90, '部署出战精灵…')`, instead of App testing `progress >= 90`
   (no unnamed numbers).
2. **`src/app/App.tsx`.** Render the battle layer while `!preparation || preparation.deploying`. While preparing, give it
   `visibility:hidden`, `inert` and `aria-hidden`. `display:none` would not do: the hosts need their layout size for the
   renderer and the ResizeObserver. BattleLoading stays on top (rendered after it). The layer element must stay the same across
   the reveal, so that React does not remount the Battle; the bench hook did exactly this with one condition and one style.
3. **`src/features/battle/ui/Battle.tsx` and its hooks.** Check what starts on mount: playback timers, sound cues, messages,
   focus. Gate anything user-visible on a `revealed` flag. The bench ran the hidden Battle for about 950 ms with no errors,
   and the commands were ready after the reveal; there is no entrance animation on the battle layer. `useShellAudio` is keyed
   to the preparation, so the music is unaffected.
4. **Verification.** Add a browser suite (registered in `tools/verification/MANIFEST.json`) on the model of `bench.mjs` without
   the hooks. It should assert that both creature animations report ready before the reveal, and that the 1.5 s after the
   reveal has no long task and no frame over 50 ms for a large species (10 or 96). It must be silent and headless.
5. **The leave path.** `leave()` dispatches `abandonBattle`, which closes `battleOpen`, so the hidden Battle unmounts and
   releases its renderers. Test leaving during the deploy step.

### Risks

- One 40-170 ms task now falls on the loading screen; the progress bar may stall once there.
- A hidden Battle has effects that start about 950 ms early (step 3).
- Mid-battle mounts (a pet switch, a Boss's or trainer's next pet) still cost the full block, because prewarm cannot cover them.
- WebKit keeps a ~100 ms frame on first battles and 31-50 ms frames on later ones.

### Follow-up (b2): when switches or WebKit matter

`tools/assets/measure_battle_standby_size.py` already computes the visible box of the first standby pose
(`visible_box`, alpha ≥ 16, the same threshold as `visibleStandbyBounds`). Today it records only its largest side
(`standbySize`).

- Record the whole box, measured on the atlas the runtime mounts (the HD entry where one is published), into the runtime
  index(es).
- Have `registrationBounds` read it, and delete the readPixels path in `battle-animation-registration.ts` together with its
  tests.
- Size: tens of lines plus a data regeneration.
- Effect: about -17 ms per mount at DPR 1 and -20-30 ms at DPR 2 (measured as `mesh`), in battle and on the loading screen.
- Before switching, compare the offline box with the runtime one over all species.

(h) is a 5-minute complement if (c3) is not taken. (d) is not worth it for Retina players.

## 8. Files

The harness, the data and the traces stayed in a session scratch folder and are not tracked; the paths below are relative to it,
as the tables cite them. Rerunning needs a worktree at a48f2d8 with the hooks again.

- **Scripts:** `bench.mjs` (the harness); `section.sh`, `runner.sh` (the gated serial runs); `analyze.mjs` (per-battle
  summaries); `fit.mjs` (fits and shares); `blocks.py` (the per-mount block, its WebGL calls, task and frames); `compare.py`;
  `upload-micro.mjs` (the WebGL upload micro-benchmark); `trace.mjs`, `trace.py`, `trace2.py` (the Chrome trace);
  `downsize.mjs` (the d2/d4 atlases).
- **Runs:** opponent `opp-1280-idle` and `opp-1920-all` (54 rows each, with fits); lead `leads-1280`, `leads-1920`,
  `leads-1920-big`; variants `vars-1280`, `vars-1920`, `vars-1920-big`, `pre-1280`, `pre-1920`; WebKit `webkit-1280`,
  `webkit-1920`, `webkit-1920-big`; `upload-micro`, the idle spot check `idle-1280`, two Chrome traces. The morning's
  `opp-1280` (taken under load) is superseded.
- **Inventory:** 1,483 atlases and the world's encounters, generated from the runtime indexes.
