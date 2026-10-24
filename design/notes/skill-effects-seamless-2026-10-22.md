# Skill effects that load unnoticed: version 2 (2026-10-22)

Status: current. It supersedes the loading boundary, the per-battle host and the effect timing of version 1.0 in [skill-effects-ruffle-2026-10-22](skill-effects-ruffle-2026-10-22.md). That note stays current for the placement rule, the host SWF, the publication and the fidelity issues.

## Decision

On 2026-10-22 the user chose to play the original skill-effect SWFs with Ruffle 0.7.1 in two steps. The first was a working version 1.0. The second was a redesign so that the player notices the loading as little as possible (尽量无感). Three design studies measured the options for the redesign:

- **Lifecycle:** where the Ruffle host lives and how long.
- **Warm-up:** when Ruffle starts.
- **Timing:** how an effect lines up with the attacker's clip, and what happens when the host fails.

This note records what each study measured, the one design built from them (version 2), its in-situ numbers and its limits.

What the player could notice in version 1.0 (measured; numbers are median/p90 unless stated):

- The first battle's loading screen waited 0.26 s (Chrome) to 0.53 s (WebKit) longer than without effects, because Ruffle's first start outlasted the screen's own pauses.
- Every battle screen built its own host after it appeared: ready 300-650 ms after the reveal. In Chrome it added one or two long tasks of 53-74 ms right as the battle appeared.
- The target flinched 17-30 ms before the effect's first frame and about 55 ms before its first pixels.
- A battle host that failed after the first warm-up kept durations defined, so moves waited out the effect length with nothing drawn: 2.62-2.75 s per long-effect move. In WebKit a lost WebGL context painted Ruffle's red panic screen over the arena.
- After a resize that changes only the display zoom (1920x1080 to 1280x720 at DPR 2), the effect layer kept its old size.

## What the studies measured

All three ran in the built app, silent, in headless Chrome 155 and Playwright WebKit 26.0 on an Apple M4, at 1280x800@1 and 1920x1080@2, against the same build with Ruffle blocked.

### Lifecycle: one host for the page

- **Moving a player.** Ruffle 0.7.1's element ends its instance in `disconnectedCallback`, so a plain append and Chrome's `Element.moveBefore` both destroyed it. WebKit 26.0 has no `moveBefore`. A "kept" element, which skips that destroy, survived every move, a 1 s detach and `display:none` in both engines (6/6 plays after each). A subclass of Ruffle's own element class did the same with no global patch.
- **One host, moved into each battle (P1).** In later battles the host was in the arena at the reveal (0 ms), against v1's host ready 317-335 ms after it. The prototype's parked player kept Ruffle's default 550x400 box, so that figure does not show when its canvas took the arena's size; version 2 measures that below. Their loading screens equalled the Ruffle-blocked build: WebKit 1416/1430 ms against 1420/1449 blocked and 1479/1516 in v1. WebKit's longest loading-screen frame fell to the blocked build's: 66-77 ms, against 119-132 ms in v1. Chrome's battle entry had as many long tasks as the blocked build: 1.0 per battle against v1's 1.15. A move on its own costs no long task: its longest frame was 17-32 ms, and the canvas had the arena's size within one frame.
- **Layering.** An effect layer outside the arena can only be above or below the whole arena, because `.classic-arena` is a stacking context (isolation and size containment). A probe layer in `.game-stage` covered the HUD: the player panel changed by 69/255. Keeping the layer where v1 put it, inside `.classic-creatures`, left the HUD unchanged under 叶绿光束's full-arena tint (8.8-8.95/255) while the arena changed by 55.
- **Between battles.** A 1x1 px parked, suspended host costs about what a destroyed one does: Chrome 515 against 506 MiB, WebKit 228 against 227 at 1280x800. Parked at full size it costs 80-165 MiB more.
- **Memory per effect.** Each distinct loaded effect costs 1.1-1.6 MiB that `Loader.unloadAndStop` never gives back. Unloading 150 effects returned 1-5 MiB. Rebuilding the host does reclaim it: the next 150 effects cost Chrome 834 MiB against 1,049 when unloading. A rebuild takes 284-302 ms.
- **Rejected:** a persistent layer in `.game-stage` (it covers the HUD); keeping the battle layer mounted and hidden between battles (works, but moves the arena into a persistent shell: the fallback if a future Ruffle breaks the kept element); mounting the battle behind the loading screen (it starts playback, audio and input early, and keeps a build per battle); `moveBefore` alone (it destroys the shipped player too); an `fxUnload` callback (it frees nothing).

### Warm-up: when Ruffle starts

- **The cost** is building the first instance, not fetching or compiling the WebAssembly. In Chrome after a click it is one long task of 161-170 ms. Before any click it is 250-284 ms, because Ruffle's AudioContext is still suspended. WebKit's instantiate and build take a 150-165 ms frame, and WebKit also froze for 154-173 ms while the 14.3 MB WASM downloaded on the world map.
- **At boot** (from `main.tsx`), the world map appeared 0.4 s later and froze for 250-460 ms.
- **On world-map idle**, the first battle did not wait, but the roaming scene froze once: 8-24 missed frames. It also held 100-460 MiB for players who never fight.
- **On the approach to a creature**, the freeze landed while the robot walked.
- **Beside the image preloads in the first loading screen** (v1's order), the build slowed the art and animation preloads, and the screen lasted +317 ms (Chrome) and +375-529 ms (WebKit).
- **Late order: after the art and animations, in the screen's last pauses.** The host starts at "部署出战精灵…" (90 %), during the screen's own DEPLOY 600 ms + START 350 ms. The first battle then lasted as long as with Ruffle blocked: Chrome 1317/1333 against 1316/1317 ms, WebKit 1364/1393 against 1364/1379 ms. The host was ready 316-628 ms before the reveal, and the world map was untouched (0 missed frames). The build's main-thread stretch, 150 ms in Chrome and 327-341 ms in WebKit, falls in that static step, where the screen already stalls 222 ms in WebKit without Ruffle.
- **A network-only prefetch on idle** cost Chrome no frame but froze WebKit's world map for 166-178 ms. **Letting the effects follow after the reveal** put the build in the battle intro: 15 missed frames against 6 in Chrome.
- **AudioContext.** Ruffle 0.7.1 has no audio option, and a temporary constructor swap would leak into the game's own audio unlock. The 200 ms wait it adds in WebKit falls inside the pauses.
- **Effects into a running host:** both parties' effects loaded in 26-54 ms in the loading screen.

### Timing: the original fight module's frame relation

From the decompiled PetFightDLL_201308 (UseSkillController, BaseAnimatorCon, MainManager) and RobotCoreDLL:

- **Stage rate.** The fight stage runs at 24 fps: PetFightController's `_startFrames = 24`, and all four DLL headers say 24. A loaded SWF plays at its host's rate, so the original played every effect at 24 fps, although 5,271 effect headers say 25.
- **Label-timed species.** 450 species (446 of ours) are in PetLabelXMLInfo. For them, the effect's frame 1 shows in the same stage frame as the attacker clip's hit frame. For every other species, the clip's frame script sets `hit` and the module sees it on the next frame, so frame 1 comes one stage frame (41.7 ms) later. Frame 1 is empty in 245 of 246 sampled effects.
- **Hurt.** The target is hurt when `check()` first runs, two stage frames (83 ms) after frame 1, or on a later hit frame for the 20 effects that set `hit` after frame 2. The damage number and HP bar came only after the effect ended (`isEnd`) in the original.
- **v1 against that.** Effect frame 1 came 8-17 ms after the drawn hit frame: label-timed species 8-17 ms late, others 25-34 ms early. The target flinched before the effect appeared in 20 of 20 damaging moves. At 25 fps the last visible frame came 49-54 ms early, and 133-150 ms early for 83-frame effects.
- **Options measured.** Sending `fxPlay` one host frame early put frame 1 before the hit frame for every species (rejected). A per-species start offset centred frame 1 at 33-45 ms against a 41.7 ms target. A 24 fps host cut the end error to −7 to −20 ms (p50 −8). Aligning the hurt with the effect put it 61-73 ms after frame 1, against the original's 83.
- **Robustness.** Durations answered only by a live host, and a cue that can skip, took host-loss stalls from 2.62-2.75 s to 1-4 ms in both engines. Removing the player at `webglcontextlost` or at Ruffle's `#panic` node left no panic frame in WebKit. Ruffle names its fallback renderer only in a console line. On `webgl` or `canvas`, effects keep their pacing and lose glow and blur.

## The design

### Loading

Nothing of Ruffle runs before the first battle's loading screen: no script, no WASM, no player and no memory.

1. **The first battle's loading screen** loads the backdrop, creature art and animations as before. Then, at "部署出战精灵…", `prepareSkillEffects(battle)` starts the page's one host in a hidden 1x1 px parking place on `document.body`. It loads the effects of every creature in the battle, both parties (`battleSkillIds(battle).all`). The screen's last pauses, 600 ms and then 350 ms, run meanwhile. The reveal waits for the host and for the effects of the two creatures that open the battle (`lead`); the other creatures' effects follow behind the battle. It waits at most `SKILL_EFFECTS_WAIT_MS` (3 s, in `skill-effect-session.ts`) from that point. After that the battle opens without effects and takes the host when it runs.
2. **Every later loading screen** makes the same call at the same point. The host already runs, so the call only loads what it does not hold yet: tens of ms inside the pauses.
3. **No loading screen waits twice for the same work.** Each start and each load is waited for at most `SKILL_EFFECTS_WAIT_MS` after it began. A start or a load that held one loading screen to its limit, such as a request that never answers, therefore holds no later one. Once a start has held a screen to its limit, no later start on the page is waited for either: the page's requests are too slow for it, and a restart there would most likely hold its screen to the limit again. The first such screen warns once ("this battle's effects"). An effect asked for again (below, under Loads) is not waited for by any loading screen.
4. **Builds happen only there,** never on the world map or while a battle shows. A loading screen left before its art is in starts nothing. One left after the start lets the build finish in the parking place.

### One host for the page

`skill-effect-host.ts` defines the host's element, `seer-skill-effect-player`. It is a subclass of the class Ruffle defines on its first `createPlayer()`. While kept, its `disconnectedCallback` skips Ruffle's destroy, and a no-op `connectedMoveCallback` lets Chrome's `moveBefore` move it. WebKit and the Tauri WKWebView, which have no `moveBefore`, get a plain append, which the kept element survives. `end()` un-keeps it and ends the instance.

The player fills its container, so the container's box sizes the canvas: the arena in a battle, 1x1 px while it waits.

- **Suspended stays suspended.** Ruffle's own tab-visibility handler plays a movie again when the page shows if it played when the page was hidden. A host given back to its parking place while the page was hidden is therefore suspended again when the page shows.
- **No play button.** Ruffle's `pause()`, which the host's `suspend()` calls, shows Ruffle's large orange play button. A style in the kept element's shadow root hides it (`#play-button`), so a suspend never shows it, parked or in the arena.
- **The start's time limit.** `startSkillEffectHost` gives Ruffle's script, its WebAssembly, the host SWF and the host's first frame `HOST_START_TIMEOUT_MS` (20 s) together. A start that has not finished by then fails and ends its player; a player load that answers later is ended too. A script that neither loaded nor failed by then is requested again by the next start. Before, the timeout was only looked at once Ruffle's load had resolved, and a WebAssembly request that never answered held the start forever.

`skill-effect-session.ts` (`SkillEffectSession`) holds the rules:

- **Taking and giving back.** A battle screen's stage (`createSkillEffectStage`, in a layout effect of `BattleSkillEffects`) takes the host into its arena layer and resumes it before the battle's first paint. Its layout-effect cleanup runs before React detaches the layer: it stops the stage's plays, moves the host back to the parking place and suspends it. A stage disposed before the host runs takes nothing, and a host a stage holds is never replaced.
- **Loads.** Loaded effects stay loaded across battles. A suspended host does not load, so a loading screen resumes it while its loads run and suspends it after, unless a battle screen took it meanwhile.
- **Asking again.** A load that failed, or that was neither in nor failed `SKILL_EFFECTS_WAIT_MS` after it was asked for (it went stale), is asked for once more on the effect's next request: a loading screen, the battle screen's creatures, or a move's use, which plays without it. The host takes each key once (`fxLoad` answers false for a key it was asked for), so the second load has a key of its own (`<skillId>.2`) and a URL of its own (`&attempt=2`), so that no browser cache holds it behind the request it replaces. Nothing waits for it: no move and no loading screen. `EFFECT_LOAD_ATTEMPTS` (2) bounds the loads of one effect on one host, so a broken or unanswered SWF is not asked for in a loop; the next host asks once more.
- **Recycle.** When a loading screen would take the host past `RECYCLE_EFFECTS` (64) distinct effects, it replaces the host first and loads only its battle's effects. Ruffle 0.7.1 never gives back the 1.1-1.6 MiB an effect costs, so 64 effects (about 70-100 MiB) set the high-water mark, unless one battle needs more. A replacement is the same 0.3 s build, inside the same pauses.
- **Failure.** A host fails when it cannot start within its time limit or when it dies. It dies when an ExternalInterface call answers nothing or throws, when Ruffle reloads the movie, when Ruffle shows its `#panic` node, or when its canvas loses its WebGL context. A host that dies ends at once, so Ruffle neither reloads it with its canvas renderer nor paints its panic screen over the arena. Its plays end, and their cues skip. The next loading screen starts a new one. After `HOST_FAILURES` (2) failures on a page, the page plays no effects. Each reason is warned about once.

### Timing

`getSkillEffectTiming(skillId, species)` answers only while the effect can play now:

- a battle screen holds a host that answers a ping (`fxStop(0)`),
- the effect is loaded,
- the page shows.

Otherwise it is undefined, and the move is planned without an effect: the creatures' own status ring, projectile and impact show, and nothing waits. A miss starts the effect's load, or its second load after one that failed or went stale, so its next use plays.

When defined, `skillEffectTiming` (in `skill-effect-session.ts`) gives the effect's timing from the attacker clip's hit marker, at the host's frame rate:

- **Start.** Frame 1 is due with the hit frame for a species in `data/original-fight-timing.json`, and one stage frame later for the others. `fxPlay` is sent `PLAY_LATENCY_MS` (15 ms, the measured time to the next host frame) before frame 1 is due.
- **Duration.** It plays to the frame that sets `isEnd`, plus the frame before it starts.
- **Hurt.** The target is hurt two stage frames after frame 1, or on a later hit frame.

The host SWF runs at 24 fps, the original fight stage's rate (`tools/assets/build_skill_effect_host.py`). The effect index's rows carry each effect's hit frame (`publish_skill_effect_swfs.py`, schema 2). `tools/assets/extract_fight_timing.py` writes the label-timed species from PetLabelXMLInfo with its source and hash.

The presentation (`planBattleFrame`) starts the cue at the hit marker plus the start. With an effect, a move followed by its hit hands over when the effect hurts the target (`hurtDelayMs`). The hit frame still holds its 490 ms and waits for the effect's end. The damage number and HP bar still come with the hurt, not after the effect as in the original: that would add about 0.46 s per damaging move, and is left to the user.

An effect that cannot start at its cue's delay skips its cue (`SkillEffectCue.skip`): no placement, the host gone, the page hidden, or the effect not loaded. So does a playing effect when the page is hidden, the host dies, or the arena moves or changes size. The frame on screen then hands over without the effect: the move at its hit marker, and a later frame without waiting for the effect's end.

A cue now stays until another move's frame or the turn's end. Before, it cleared when the effect ended, and the creature's own status ring or projectile popped up for the rest of a move whose clip outlasts its effect.

### The arena layer

The layer, its z-order and its CSS are v1's. `useArenaCover` also re-covers the arena when an ancestor's inline style changes (`MutationObserver`). That is how the game display's zoom changes on a resize that leaves the arena's layout box alone.

When the cover changes the layer's place, size or zoom while effects play, the stage stops them (`SkillEffectStage.stopAll`) and their cues skip. The host places a clip once, in stage px, and Ruffle draws with `noScale`, so the rest of an effect would be drawn at the old place and scale: after a resize from 1280x800 to 1000x650 during 叶绿光束, its beam started below 丽莎布布 and its impact cloud landed past 皮皮, larger than it should be. Moving the running clips would need a new host callback (an `fxMove`) and a host SWF rebuild; a window resized mid-effect is rare (maximizing or going fullscreen in Tauri), so the effect ends instead. The next move's effect is placed in the new arena.

### Not taken

- **Building the host at boot, on world idle or on the approach:** a visible hitch on the world map, and memory held before any battle.
- **The idle network prefetch:** WebKit froze on the world map, and it would only help the browser build on a slow network.
- **Letting the effects follow after the reveal:** the build lands in the battle intro.
- **`fxUnload` and an LRU of loaded effects:** Ruffle frees nothing on unload. Replacing the host behind a loading screen does free the memory.
- **Sending `fxPlay` one host frame early:** early for every species.
- **The original's damage numbers after the effect:** a pace change, for the user to decide.
- **Detecting the fallback renderer from Ruffle's console line:** effects play the same on it, and Ruffle already logs the renderer it used.
- **A fallback to one host per battle** if the kept element stops working: version 2 replaces version 1.0's path. The browser suite fails if Ruffle's element changes.

## Architecture

| Part | Where | What |
|---|---|---|
| Loading boundary | `src/features/battle/battle-skill-effects.ts` | `prepareSkillEffects(battle)`, `getSkillEffectTiming(skillId, species)` and `createSkillEffectStage(container)`, wired to the real page: the parking place, the lazy index and timing data, the page's visibility, one warning per reason. |
| Session rules | `src/features/battle/skill-effect-session.ts` | `SkillEffectSession`: which screen holds the host, when it starts, is replaced or is given up, the loads, how long a loading screen waits (`SKILL_EFFECTS_WAIT_MS`), the stages, `skillEffectTiming`, `battleSkillIds`. Pure, with unit tests on a fake host and a fake clock. |
| Ruffle protocol | `src/features/battle/skill-effect-host.ts` | The script, the kept player element, the start's time limit, `moveTo`/`suspend`/`resume`, the death watchers and the host protocol. |
| Battle screen | `src/features/battle/ui/BattleSkillEffects.tsx` | Takes the host in a layout effect, plays each cue at its delay and stops it after its duration; follows zoom-only resizes, and stops the effects playing when the arena moves. |
| Presentation | `battle-playback.ts`, `battle-player.ts`, `ui/use-battle-playback.ts` | `SkillEffectTiming`, `hurtDelayMs` and `SkillEffectCue.skip`. |
| Loading screen | `src/app/useBattlePreparation.ts` | Calls `prepareSkillEffects(battle)` at 90 %, after the art and animations, and waits for it with its last pauses; the session bounds that wait. |
| Data | `data/original-fight-timing.json`, `tools/assets/extract_fight_timing.py` | The 450 species PetLabelXMLInfo times, with source URL, binary-data id and hash. |
| Host SWF and index | `tools/assets/build_skill_effect_host.py`, `tools/assets/publish_skill_effect_swfs.py` | The host at 24 fps (FxHost.as unchanged; the rebuild differs only in the header's rate byte), index rows `[end frame, version, hit frame]`. |

## In situ

Measured on 2026-10-22 in the built app at `3f92221`, silent, in headless Chrome 155 and Playwright WebKit 26.0 on this Mac (Apple M4, load 2-3). Version 1.0 is `8be3689` and the baseline is version 2 with Ruffle blocked. Each fresh page has a quiet 3 s on the world map and the walk to the first creature. Then come battles in a row, all wild 丽莎布布 against 皮皮: one turn of 缩头, then 叶绿光束, which ends it. Version 2 ran 4 pages of 4 battles, the others 3 pages of 3. Numbers are median/p90.

Two harness notes:

- Files come through Playwright's request interception. WebAudio is kept suspended.
- Memory is the phys_footprint of all browser processes, ±30 MiB. WebKit's XPC services are counted only when they appeared during the run.

**Loading screens**, in ms from the fight click to the battle's first frame (version 2 / version 1.0 / blocked):

| | Chrome 1280x800@1 | Chrome 1920x1080@2 | WebKit 1280x800@1 | WebKit 1920x1080@2 |
|---|---|---|---|---|
| First battle | 1362/1444 / 1611/1728 / 1363/1459 | 1366/1447 / 1612/1715 / 1360/1453 | 1453/1460 / 1934/1953 / 1439/1441 | 1433/1455 / 1947/1955 / 1443/1444 |
| Later battles | 1357/1367 / 1359/1368 / 1355/1367 | 1357/1361 / 1356/1366 / 1358/1368 | 1456/1468 / 1504/1508 / 1458/1474 | 1476/1483 / 1509/1535 / 1474/1498 |
| First battle, "部署出战精灵…" to the reveal | 950/950 / 950/967 / 950/950 | 950/967 / 950/950 / 950/967 | 973/980 / 1142/1144 / 974/975 | 946/976 / 1156/1158 / 971/977 |

- The first battle now waits no longer than without effects, against +248 to +504 ms in version 1.0. In version 1.0 the Chrome wait fell before the 90 % step, beside the images.

**The host:**

- In version 2 it is in the arena layer at every battle's first frame, and its canvas has the arena's size by the next frame. In Chrome that is 17 ms (p50; p90 17-50). In WebKit it is 296-302 ms in first battles and 239-269 ms in later ones (p50). That is exactly WebKit's first battle frame, the battle's own mount, which lasts 292-304 ms with Ruffle blocked too.
- Version 1.0's host was ready 333 ms after the reveal in Chrome. In WebKit it took 537-575 ms in first battles and 300-321 ms in later ones (p50).
- Version 2 created one Ruffle instance per page, always while a loading screen showed, and destroyed none. Version 1.0 created and destroyed four per page, three of them while a battle showed.

**Main thread.** Chrome has the long-task API; WebKit shows only frame gaps.

- **On the world map,** no variant had a long task, and the longest frame was 17 ms (Chrome) and 18-21 ms (WebKit), quiet or walking.
- **In the first loading screen in Chrome,** version 2's build is one long task of 130-145 ms in the static step: [101, 144], [130], [133], [133] at 1280x800, against [111], [], [] blocked. Version 1.0 had two or three tasks, up to 143 ms.
- **WebKit's longest frame in that first screen** is 178/193 ms (1280x800) and 173/251 ms (1920x1080@2), against 61-70 ms blocked and 202-214 ms in version 1.0. Its later loading screens equal the blocked build: 80/89 against 81/86 ms, and 96/99 against 99/117 ms. Version 1.0's were 124-155 ms.
- **Battle entry,** in the first 1.5 s after the reveal, Chrome 1280x800:
  - First battles: one long task of 54-68 ms in each of 4 (blocked: one of 70 ms in 1 of 3), and the longest frame 67/67 ms against 67/83 blocked.
  - Later battles: 1.0 long task per battle, at most 58 ms, against 1.0 and 54 ms blocked.
  - At 1920x1080@2 later battles had 1.5 per battle, at most 74 ms, against 2.0 and 69 ms blocked.
- **WebKit's battle entry** equals the blocked build: later battles' longest frame 239/253 against 237/240 ms at 1280x800.

**Effects against the attacker's hit marker** (丽莎布布 is label-timed: the original shows the first pixels, frame 2, 41.7 ms after the hit frame, and hurts the target 83 ms after it):

| | Chrome 1280x800@1 | Chrome 1920x1080@2 | WebKit 1280x800@1 | WebKit 1920x1080@2 |
|---|---|---|---|---|
| First pixels after the hit marker, 缩头 / 叶绿光束, v2 | 43/60 / 37/53 | 43/60 / 53/53 | 44/57 / 48/67 | 45/62 / 35/66 |
| The same in version 1.0 | 60/77 / 70/87 | 43/77 / 53/87 | 56/84 / 62/84 | 60/63 / 54/72 |
| 皮皮's hurt after the hit marker, v2 / v1 | 87/87 / 3/20 | 87/87 / 3/20 | 85/88 / 3/5 | 84/89 / 4/15 |
| Hurt minus first pixels, v2 / v1 | +50/+67 / −67/−33 | +33/+67 / −50/−33 | +33/+56 / −62/−38 | +49/+67 / −51/−29 |

- **Turn length.** A turn lasted the same in every variant: 缩头 10.19-10.22 s and 叶绿光束 10.20-10.22 s. The hit frame waits for the clip either way.
- **Pacing in 丽莎布布's effect windows.** Chrome had no frame over 34 ms in about 1,640 frames, as in version 1.0. WebKit had 6 such frames in 1,635 at 1280x800 (at most 38-39 ms), against 2 in 883 (35-37 ms) in version 1.0. At 1920x1080@2 it had 17 in 1,624 (at most 41-44 ms), against 1 in 886. All 17 came in later battles, 1-3 per battle, none in a page's first battle.

**Memory, MiB:**

| | Chrome 1280x800@1 | Chrome 1920x1080@2 | WebKit 1280x800@1 | WebKit 1920x1080@2 |
|---|---|---|---|---|
| In battle, v2 / v1 / blocked | 1193 / 1194 / 1043 | 1658 / 1643 / 1289 | 1001 / 1007 / 862 | 1485 / 1489 / 1099 |
| After each battle closed, v2 | 801, 796, 819, 824 | 919, 932, 956, 959 | 746, 624, 645, 626 | 993, 1023, 973, 876 |
| After each battle closed, v1 | 828, 822, 820 | 1063, 1048, 1027 | 687, 677, 644 | 1105, 812, 1038 |
| After each battle closed, blocked | 692, 676, 686 | 776, 745, 760 | 528, 531, 517 | 915, 886, 894 |

- The world map before the first battle is the same as blocked: 753 against 721 MiB, 825 against 800, 465 against 458, 668 against 639, within the noise.
- Between battles the parked host costs about +100-200 MiB over blocked; in WebKit at 1920x1080@2 the difference is within the noise. That is no more than version 1.0 kept after destroying its hosts. Memory does not grow beyond the noise over four battles.

The harness is `insitu-v2.mjs`, after the version 1.0 in-situ script and the lifecycle study's harness. It stayed in the session's scratch directory, with its raw JSON and `table.py`.

### After the independent check

An independent check of version 2 at `cc1416f` found that a request that never answers held every later loading screen to the cap, that a resize mid-effect left the rest of the effect misplaced, and five smaller points. The fixes are in the design above. They were measured on 2026-10-22 with the check's own harness, silent, headless, at 1280x800@1, on the same page flow: three wild battles in a row against 皮皮, 缩头 then 叶绿光束.

**Loading screens**, in ms from the fight click to the battle's first frame, battles 1/2/3 on one page:

| | Chrome, before | Chrome, now | WebKit, before | WebKit, now |
|---|---|---|---|---|
| Ruffle's WebAssembly never answers | 3386/3412/3409 | 3410/1379/1360 | 3457/3480/3468 | 3475/1430/1416 |
| 11006.swf (叶绿光束) never answers | 3487/3413/3408 | 3502/1349/1337 | | |
| Ruffle blocked (the baseline) | 1336-1450 in both engines | 1478/1365/1363 | | 1418/1437/1420 |
| Party battle, a bench creature's 20004.swf held back (one battle) | 3490 | 1451 | 3464 | 1452 |

- With the WebAssembly hung, the page warns twice: "this battle's effects" when the first screen gives up, and "Ruffle unavailable: the skill-effect host did not start in time" 20 s after the start. Before, nothing was warned until the page closed.
- With the WebAssembly 4.5 s late, only the first screen waits: Chrome 3412/1352/1363, WebKit 3461/1440/1408. The host comes in the first battle (one frame of 117 ms and a 146 ms long task in Chrome, 189 ms in WebKit) and serves the later two.
- **A resize during 叶绿光束,** 267 ms (Chrome) and 284 ms (WebKit) after its first pixels, from 1280x800 to 1000x650: its last frame with pixels came 16 ms after the resize, and the turn settled as without the resize (4975 against 4990 ms; WebKit 5010 against 5001). Without a resize the effect drew for 817 ms in both engines, as before the fix.
- **A page hidden during a battle that closes while hidden:** the parked host is suspended after the page shows again, in both engines (before: playing).
- **A suspend while the host is in the arena:** Ruffle's play button stays hidden (`display: none`) in both engines.
- In the party battle, the held-back 瞪眼 played without its effect at its first use, while its SWF was still held, and with it at its second use, as before the fix.

That harness also stayed in the session's scratch directory.

## Known limits

- **Pinned Ruffle internals.** The kept element relies on Ruffle 0.7.1's internals: `disconnectedCallback` ends the instance, `connectedCallback` only updates styles, and the element class is reachable through `customElements.get` after the first `createPlayer()`. The version is pinned exactly, and an upgrade must pass `battle-skill-effects` (one instance over two battles, none destroyed).
- **One long-lived WebGL context.** A GPU reset ends the host until the next loading screen, so that battle has no effects. A second failure turns effects off for the page.
- **The 3 s cap.** On Tauri's first run on a machine, the GPU shader-cache fill (2.2 s in the Tauri spike) lengthens that one loading screen, up to the cap. A slow first download in the browser build can reach the cap too. The battle then opens without effects. It takes the host when the build finishes, which can land in the battle's first seconds: with the WebAssembly 4.5 s late, about 1.5 s after the reveal, one frame of 117-133 ms (Chrome, with a 146-153 ms long task) or 188-189 ms (WebKit) in the first turn. Deferring that build to the next loading screen is not possible from outside Ruffle: the WebAssembly arrives and builds in one step. Tauri WKWebView was not measured in situ.
- **Requests that never answer.** In the browser build a stalled request for ruffle.js or the WebAssembly holds the first loading screen to the cap; later screens do not wait for that start again. The start fails at its 20 s limit, is warned about and counted, and the next loading screen tries once more without waiting for it. A second failure turns effects off for the page. A restart after a host death on such a page is not waited for either, so its build can land in the battle's first seconds. A stalled effect SWF of the opening creatures holds one loading screen to the cap. It is asked for once more on its first request after it went stale, usually its next use, which plays without it; when that request answers, the effect plays from its following use. A second stall or failure leaves it missing until the host is replaced. A stalled request keeps its connection until the page closes: the host SWF cannot cancel a `Loader` without an `fxCancel` callback and a host rebuild, which was not taken. Tauri reads local files.
- **The static step.** The build's main-thread stretch is hidden only while the "部署出战精灵…" step stays static. Adding a main-thread animation to the loading screen would show it.
- **Phase-change moves.** A Boss's moves that would only appear after a phase change are not in the loading screen's set: they load when they show (the battle screen asks for its creatures' moves), and their first use right after the change may play without its effect. No encounter has such moves (checked 2026-10-24): no Boss, variant, member phase or trainer in `data/` uses `set_skills`, a `transform` with `skills`, or `counter_skill`, the engine's three ops that give a creature moves it did not start with. So no loading is added for them; an encounter that adds one should add its phase skills to `battleSkillIds`.
- **Pending loads.** A loading screen left after the host started lets the build finish in the parking place, on the world map. Left right at the 90 % step, the build lands there as a visible hitch: one frame of 117 ms with a 133 ms long task in Chrome, and of 145 ms in WebKit, in the 4 s after leaving. Left before the step or 400 ms after it, the world map shows none (17-25 ms frames).
- **Hidden pages.** Real hidden tabs could not be produced headless. Hiding was checked with the session's own listener on a fake host, and in the browser with `document.hidden` overridden and a `visibilitychange` event. A page hidden mid-effect drops that effect.
- **Damage numbers** still come with the hurt, about 0.8 s before the original showed them.
- **The canvas resize at the reveal.** The host is in the arena layer from the battle's first frame. WebKit gives its canvas the arena's size on the frame after its 240-400 ms battle-mount frame, which the blocked build has too. Chrome does it within two frames. The canvas is transparent until the first effect, which is due 1.4 s or more into the first move.
- **WebKit pacing at 1920x1080@2.** In our effect windows a host had 1-3 frames of 35-52 ms per battle, against 0-1 in version 1.0. The in-situ run had them only in later battles, but an independent run of five battles in a row had them in the first battle too: 2/358, 3/359, 3/180, 2/304 and 1/306 frames over 34 ms (at most 41-52 ms). So it is not tied to reusing the host. The cause was not isolated. Chrome had none.
- **Replaced hosts stay reachable.** Every Ruffle 0.7.1 element adds a `pointerdown` listener on `document.documentElement` and a `visibilitychange` listener on `document` that it never removes (inner.js, the InnerPlayer constructor). So the element and shadow DOM of each dead or replaced host, and of the throwaway element that `keptPlayer` makes through `createPlayer()` to find Ruffle's class, stay reachable; their WebAssembly instances are destroyed. That is a few elements per page, against one per battle in version 1.0. Reusing one kept element across replacements with a second `load()` would avoid it, at the cost of a second start path; it was not taken.

## Checks

- **Unit tests** (in `npm test`):
  - `skill-effect-session.test.mjs`: the original timing, both parties' skills and the opening pair's, one host over battles (taken, parked, suspended, loads kept), timing only while it can play, plays that cannot start or that a hidden page stops, death and the next host, Ruffle blocked and the failure limit, the recycle rule, a stage disposed before the host runs, and the label-timed data against the catalog. On a fake clock: a start that never answers holds only the screen that began it, fails, is counted and is tried once more without being waited for; a start that lands after its screen gave up loads that battle's effects into the battle screen; a load that never answers holds only one screen and is asked for once more, under its own key; a stalled load plays from the use after the one that found it stale, under its own URL; a failed load is asked for once more and then no more; a screen waits only for the opening pair's effects; `stopAll` ends the stage's plays.
  - `battle-playback.test.mjs`: the start offset and the hurt hand-over.
  - `battle-player.test.mjs`: the hurt hand-over, the cue that stays while its move shows, and skips at the start, during the hit, stale and after a cancel.
- **`tools/verification/battle-skill-effects.mjs`** (`needs-browser`), in Chrome 1280x800@1 and 1920x1080@2 and WebKit 1280x800@1:
  - Before the first battle there is no Ruffle on the page.
  - Two battles in a row use one instance, created while a loading screen showed, never destroyed.
  - The loading screen waits at most 250 ms past its own last pauses.
  - The host is in the arena layer at each battle's first frame, and its canvas covers the arena within 1 s, before the first move's effect can start.
  - Placement and mirroring, and the HUD unchanged under 叶绿光束's tint (at most 20/255) while the arena changes (at least 25).
  - The host waits parked and suspended after each battle.
  - At 1920x1080@2, the layer follows a zoom-only resize and back.
  - In both engines, a lost WebGL context ends the host with no panic frame and one warning. The next move plans no effect: the status ring shows. The next loading screen starts a host.
  - In Chrome: reduced motion; Ruffle blocked (one warning, no player); leaving the first loading screen early starts nothing; a WebAssembly request that never answers holds the first loading screen at most to its cap and the next one not at all, with one warning; a first request for 叶绿光束's SWF that never answers holds the first loading screen at most to its cap, is followed by one more request with `attempt=2`, and the effect plays in the next battle, whose loading screen does not wait for it.
- **`tools/verification/_browser.mjs`** launches Chrome with `--disable-updater-scheduler`. Otherwise system Chrome wakes GoogleUpdater a few seconds after it starts, the updater inherits Chrome's stdio and outlives it (its requests are blocked here), and `browser.close()` waits for it forever. Any Chrome session past that point hung there, such as a battle with motion on.
