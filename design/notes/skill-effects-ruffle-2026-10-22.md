# Original skill effects played with Ruffle (2026-10-22)

Status: current. This note replaces the delivery path of [original-skill-effects](original-skill-effects.md) and [skill-effects-hd-v44](skill-effects-hd-v44.md) (67 WebP sheets and HD frames) and the paused WebP catalog export of the [2026-10-22 handoff](handoff-2026-10-22.md).

## Decision

On 2026-10-22 the user chose to play the original skill-effect SWFs at runtime with Ruffle instead of exporting WebP frames: first a complete, working version 1.0, then a redesign so that the player notices the loading as little as possible (尽量无感). This accepts that the original ActionScript runs. In all 5,273 effects that script only calls `stop()` (and `gotoAndPlay` in 21589 and 21770) and sets `hit` and `isEnd`; no effect has sound.

Version 1.0 is this note. Its loading has one module boundary (below) so that the redesign can change when things load without touching the placement or the battle screen.

## The original placement rule

From the official fight modules, decompiled with FFDec 26.3.0 (read-only research; the decompiled sources are not in the repository): `https://seer.61.com/dll/PetFightDLL_201308.swf` (the current line) and `https://seer.61.com/dll/PetFightDLL.swf` (the older line, built 2018-03-02). Both agree on everything here.

- **Placement.** `com.robot.petFightModule_201308.controller.UseSkillController.petPlay` runs when the attacker's clip reaches its hit frame:

  ```as3
  _loc4_ = SkillAssetsManager.getInstance().getAssetsByID(_loc5_);   // a new instance of the SWF's `skill` class
  _loc6_ = this.attackMC.localToGlobal(new Point());
  _loc4_.x = _loc6_.x;
  _loc4_.y = _loc6_.y;
  _loc4_.scaleX = this.attackMC.scaleX;
  this.attackMC.parent.parent.addChild(_loc4_);
  ```

  The effect sits at the attacking creature's registration point in stage coordinates, is never scaled, takes the attacker's `scaleX` (−1 for the right-hand creature, so it is mirrored), and is added above the attacker's own layer. The target is never used. The older line's `UseSkillController` (lines 273-278) has the same code.
- **Creature positions.** `BaseFighterPetView` and `PlayerPetView` give each creature a 180x280 box, the player's at (90, 115) and the opponent's at (690, 115), with the creature clip at (90, 145) inside it and the opponent's mirrored. The registration points are (180, 260) and (780, 260): 600 stage px apart, symmetric about the centre of the 960x560 stage, which clips everything.
- **Authoring frame.** Every skill symbol is drawn in its attacker's frame facing right: the attacker at (0, 0), the target at (+600, 0). 11006's beam runs from (18, 90) to an impact at (607, −2). The SWF's own root places the symbol at (58, 82.45) in 5,227 SWFs; that is the authoring template, which the client never shows. 4,499 of the 5,202 effects measured also carry a translucent full-stage rectangle: a tint over the whole battlefield, under the fight UI.
- **Loading.** `AssetsLoadManager` loads `fightResource/skill/swf/<id>.swf` behind the fight loading screen, and `BefLoad` (RobotCoreDLL) queues the same URL; the class is taken with `getDefinition("skill")`.
- **Playback.** `BaseAnimatorCon.playMovie` calls `startAllMovieClip` and `gotoAndPlay(1)`, then `gotoAndPlay(2)` on the next frame, and polls `hit` and `isEnd`; the effect ends when `isEnd` is 1. 398 effects call `stop()` on frame 1 and only run because of that `gotoAndPlay(2)`. `hit` is set on frame 1 in 4,874 effects, frame 2 in 379 and later in 20; every effect sets `isEnd` on its last frame.
- **Layering.** `PetFightController.addFightUI` adds the opponent's layer first and the player's last, so a player's effect is drawn over both creatures and an opponent's effect under the player's creature. The fight panels are drawn over every effect, tints included.

## Placement here

`skillEffectPlacement` (`src/features/battle/skill-effect-placement.ts`) maps that rule onto the arena:

- the registration point is the acting creature's box centre (`.classic-combatant`), since the original feet hang about 125 stage px below the registration point and ours sit about as far below the box centre;
- one stage px is the creatures' separation / 600 CSS px (0.80 at 1000x650, 1.005 at 1280x800, 1.357 at 1920x1080), so the effect's target point (+600, 0) lands on the other creature;
- the right-hand side's effect is mirrored (negative scaleX), and the target is never used;
- the arena clips the layer, as the 960x560 stage clipped the original. The arena is wider than the original stage, so oversized tints and content past the old edges show.

One layer draws every effect over both creatures and under the damage numbers, popups, capsule and the HUD (caption, health panels, round status). The original's "an opponent's effect is drawn under the player's creature" is not reproduced: it needs a second Ruffle host (one more WebGL context, about 12-19 MB of WASM memory and a canvas of the arena's size, 60-100 ms to start warm), and this remake already draws the acting creature in front of the other, where the original drew the whole opponent layer under the player's.

The layer has an effective CSS zoom of 1 inside the zoomed game display, so Ruffle renders at the screen's pixel density (3190x1656 device px for the 1920x1080 arena at DPR 2) and its stage px are screen CSS px. The geometry comes from layout offsets scaled by the display zoom: under a CSS zoom WebKit's `getBoundingClientRect` leaves the zoom out and Chrome's does not, so rectangles would place the layer differently in the two engines.

## Architecture

| Part | Where | What |
|---|---|---|
| Scope and sources | `tools/assets/skill_effect_sources.mjs` | The 5,273 in-scope skill IDs: every learnset skill and every skill named by bosses, trainers, the elite roster and NPC profiles. Probes and caches the official SWFs into `.cache/skill-effects/sources/` with `probe.json` (polite: at most four requests at once). |
| Publication | `tools/assets/publish_skill_effect_swfs.py` | Reads each SWF without running it (the `skill` sprite's frame count, the frames that set `hit` and `isEnd`, a frame-1 `stop()`), rewrites overlay/hardlight blend modes to normal in the 16 effects that use them, hard-links the rest, and writes the ignored `public/battle-effects/swf/<id>.swf` (5,273 files, 130.6 MB), the runtime index `index.json` (end frame and version per skill, 158 KB) and the provenance `manifest.json` (source hashes, stage, frame rate, frames, script facts, patched hashes). All 5,273 publish. |
| Host SWF | `tools/assets/skill-effect-host/FxHost.as`, `tools/assets/build_skill_effect_host.py` → `src/features/battle/skill-effect-host.swf` | The effect stage, compiled with FFDec's AS3 compiler (labelled experimental; the 3,344-byte output is tracked and rebuilds byte-identical). It does what `petPlay` and `BaseAnimatorCon` did, loading each SWF into its own ApplicationDomain (every one defines `skill`). JS calls `fxLoad`, `fxPlay` and `fxStop` through ExternalInterface; the host answers with `trace()` lines (`fx|ready`, `fx|loaded`, `fx|error`) read through Ruffle's trace observer. It never uses `ExternalInterface.call` (which evaluates JS). Its stage runs at 25 fps, the rate of 5,271 of the 5,273 SWF headers; a loaded SWF plays at its host's rate. |
| Ruffle | `@ruffle-rs/ruffle` 0.7.1 (exact), `vite.config.ts` (`ruffleFiles`) | The self-hosted build is served in development and emitted unchanged under `ruffle/` in the build (ruffle.js loads its core chunk and WASM by name). Nothing comes from a CDN. ruffle.js is added by a script tag on the first battle, configured first so that it never scans the page for Flash embeds. |
| Placement | `src/features/battle/skill-effect-placement.ts` | The rule above, pure, with unit tests. |
| Ruffle protocol | `src/features/battle/skill-effect-host.ts` | The script, the player options (transparent, no input or Ruffle UI, `wgpu-webgl`, `noScale`, volume 0) and the host protocol. |
| Loading boundary | `src/features/battle/battle-skill-effects.ts` | `prepareSkillEffects`, `getSkillEffectDurationMs` and `createSkillEffectStage` (below). |
| Battle screen | `src/features/battle/ui/BattleSkillEffects.tsx` | The layer in `.classic-creatures`: covers the arena, holds one stage per battle screen, plays the cue's effect at the cue's delay and stops it when the cue ends. |

**Timing.** The presentation contract is unchanged (`planBattleFrame`, `use-battle-playback.ts`): a move's effect starts at the attacker clip's hit marker and lasts `getSkillEffectDurationMs`, the effect's timeline up to the frame that sets `isEnd` at the host's frame rate, plus the frame the host waits before it starts a clip. Damage numbers and the log keep their timing; a multi-hit move keeps its one effect through its hits. The host removes a clip itself at `isEnd`; the battle screen stops it when its cue ends or the screen goes.

**Reduced motion** holds the effect's middle frame for the 160 ms cue, at 72% opacity, as the WebP still did.

**Failure.** If ruffle.js, the WASM, WebGL or the first host fails, one console warning is logged, `getSkillEffectDurationMs` stays undefined, so no move waits for an effect, and the creatures' own CSS status ring, projectile and impact show instead. A skill whose SWF fails to load is warned about once and skipped. A host that stops answering (a Ruffle panic shows its own message in the player) is hidden. A battle that ends or is left removes its player.

**Audio.** The SWFs have no sound tags and the host sets Ruffle's volume to 0. Ruffle still creates an AudioContext per instance.

## The loading boundary, and what the redesign can change

`battle-skill-effects.ts` decides when everything loads; the placement and the battle screen only call `createSkillEffectStage(container)` and `stage.play(skillId, placement, still)`, and the presentation only reads `getSkillEffectDurationMs`.

What v1 does:

1. The first battle's loading screen calls `prepareSkillEffects()` beside the image preloads and holds the battle until it is done, at most 3 s after it started (`SKILL_EFFECTS_WAIT_MS` in `src/app/useBattlePreparation.ts`). It loads the index chunk (127 KB, 46 KB gzip), ruffle.js and the WASM (14.3 MB), and runs a first host out of sight. That compiles the WASM and starts the renderer (the first run on a machine also fills the GPU shader cache: 2.2 s once in the Tauri spike) behind the loading screen, with its 130-200 ms main-thread block. Later battles find it ready.
2. Each battle screen starts its own host (Ruffle destroys an instance when its element leaves the document): 60-100 ms with the WASM compiled, plus Ruffle's hidden 200 ms wait while the AudioContext is not running (WebKit and Chrome before a user gesture; the Tauri spike's WKWebView reported it running). It then loads both creatures' moves (8 effects in 30-50 ms); any other move loads when it is cued, 0.8 s or more before its hit marker.

Levers for the redesign, with their measured costs from the spikes:

- Warm Ruffle at app start, on idle after the first scene paints, instead of in the first battle: removes the 0.26-0.53 s the first battle waits today (below), and the first-run shader cache, from every battle.
- Keep one host alive across battles. It needs a player element that outlives the battle screen; today the layer lives in the arena so that the HUD and numbers draw over it.
- Build hosts without an AudioContext (temporarily replacing the constructor, then restoring it): −200 ms per instance in WebKit. App audio created in that window would need a guard.
- Send `fxPlay` one host frame (40 ms) before the hit marker: frame 1 is empty in about 94% of effects, so the first content shows 60-75 ms after the call.
- Preload the whole party's moves in the loading gate (48 effects in 245-290 ms), or in small idle chunks (16 at once gave one late frame at p90).
- `quality: 'medium'` or `'low'` at DPR 2 or more: −25-35% GPU memory with the same pacing; check its look first.
- A second host under the player's creature for the original opponent-effect layering (costs above).

## Spike measurements (2026-10-22)

Three spikes measured Ruffle 0.7.1 before this work (headless Playwright WebKit 26.0 and Chrome 155 on an Apple M4, and the real Tauri 2.12.1 WKWebView); numbers are median/p90.

| What | WebKit | Chrome | Tauri WKWebView |
|---|---|---|---|
| Cold start to host ready | 585-629 ms (352-412 without AudioContext) | 252-308 ms | about 190 ms; first run ever 2.2 s (shader cache) |
| Main-thread block of a cold start | one stretch of about 190 ms | one long task of 128-137 ms | |
| Second instance, WASM compiled | 60-103 ms; 258-302 with a suspended AudioContext | 45-63 ms | 68-83 ms per fresh player |
| Preload 8 / 48 effects by URL | 52 / about 282 ms | 31 / about 247 ms | 30-48 / about 160 ms |
| Play call to first frame run / first visible pixels | 18-25 / 58-73 ms (p90 77-88) | same | 17.5-26.5 / about 35 ms |
| Frame pacing, 1 and 4 effects | no missed 25 fps slot | no missed 25 fps slot | 60.0 fps, worst 1% gaps 19-23 ms |
| Memory, host started (1280x800 / 1920x1080@2) | +361 / +505 MiB | +155 / +348 MiB | web page 320-435 MB after 48 preloads |

The alternatives were worse: `load()` per effect rebuilds the whole instance (97-353 ms) and cannot run the frame-1 stoppers; paused players hit the 16-WebGL-context limit and fall back to the canvas renderer (GB-scale memory); two players ping-pong at 81-110 ms per effect.

## Fidelity and known issues

A frame-locked comparison of 246 sampled effects (6,743 frames) between Ruffle and FFDec's renderer found 213 correct, 14 degraded and 7 wrong, all wrong ones hardlight; Chrome and WebKit gave pixel-identical output.

- **Renderer.** Only `wgpu-webgl` draws the blur and glow filters that 1,053 effects use; the legacy `webgl` and `canvas` renderers drop them. The host asks for `wgpu-webgl`. Ruffle's API does not say which renderer it fell back to, so v1 does not check it.
- **Overlay and hardlight** (16 effects) turn black on a transparent canvas; the publisher rewrites them to normal, which matches FFDec within 5.5% of cells. Add, lighten and screen (about 80 effects) composite as normal over the arena instead of blending with it, as in FFDec and the old WebP frames; the original blended with the battlefield.
- **Gradient glow** is unsupported in Ruffle 0.7.1 (all 8: 12699, 12951, 13273, 13292, 13337, 13384, 21748, 21758).
- **Knockout inner glow** differs in 21592 and 21584; 13231 loses its shadow edges (Ruffle skips cacheAsBitmap for its huge bounds); 12623 has broken hairlines (thin strokes, worse at DPR 2).
- In all, about 10 effects (0.19%) look wrong before the blend patch and about 20 (0.4%) remain visibly different after it; none is broken.

## Version 1.0 in situ

Measured on 2026-10-22 in the built app, silent, in headless Chrome 155 and Playwright WebKit 26.0 on this Mac (Apple M4, load 2-4), in a real wild battle of 丽莎布布 against 皮皮. Each configuration ran once with Ruffle and once with Ruffle blocked as the baseline: a first battle on a fresh page, twelve turns of 缩头 (24 effects, our move and 皮皮's), 叶绿光束, then a second battle. Files come through Playwright's request interception (no localhost here), so fetches include that overhead; WebAudio is kept suspended, so every Ruffle instance pays its hidden 200 ms wait. Memory is the phys_footprint of all browser processes (noisy, about ±30 MiB).

| | Chrome 1280x800@1 | Chrome 1920x1080@2 | WebKit 1280x800@1 | WebKit 1920x1080@2 |
|---|---|---|---|---|
| First battle: loading screen, Ruffle vs none | 1,706 vs 1,445 ms (+261) | 1,704 vs 1,435 ms (+269) | 1,986 vs 1,452 ms (+534) | 1,971 vs 1,448 ms (+523) |
| Later battle: loading screen | +4 ms | +21 ms | +63 ms | +50 ms |
| Long tasks in the first battle's entry (Chrome) | 106, 141, 80 ms vs 101 | 101, 143, 62, 61 vs 106, 61 | no long-task API | no long-task API |
| Long tasks in a later battle's entry (Chrome) | 73, 53 ms vs none | 74, 72 vs 56, 64 | | |
| Battle's host ready after the battle appears, first / later battle | 317 / 317 ms | 300 / 317 ms | 611 / 296 ms | 626 / 305 ms |
| Move start to first effect pixels, minus the attacker's hit marker | 58-77 ms | 53-75 ms | 27-76 ms | 28-43 ms |
| Frame pacing in our effect's windows (12 windows) | every frame 16.7 ms (max 16.8) | every frame 16.7 ms | p50 17, max 31 ms (battle max 33; baseline 38) | p50 17, max 26 ms (battle max 40; baseline 41) |
| Memory at battle start, Ruffle vs none | 1,322 vs 1,146 MiB (+176) | 1,723 vs 1,423 (+300) | 1,053 vs 866 (+187) | 1,486 vs 1,224 (+262) |
| Memory after 12 turns (24 effects) | 1,212 vs 1,049 (+163) | 1,741 vs 1,289 (+452) | 884 vs 693 (+191) | 1,438 vs 1,010 (+428) |
| Memory after the battle closed | 829 vs 665 (+164) | 981 vs 789 (+192) | 672 vs 556 (+116) | 1,170 vs 947 (+223) |

What it means for the redesign:

- **Entering a battle.** The first battle's loading screen waits 0.26 s (Chrome) to 0.53 s (WebKit) longer, because Ruffle's first start outlasts the screen's own pauses; later battles cost 4-63 ms. Each battle screen's host is ready 0.3 s after the battle appears (0.6 s in WebKit's first battle), well before the first move's effect is due (its hit marker is 1.4 s or more into the move). In Chrome a later battle's host build adds one or two long tasks of 53-74 ms right as the battle appears.
- **A move to its effect.** The first effect pixels appear 27-77 ms after the attacker's hit marker: the host's next frame, then the clip's frame 1, which is empty in most effects.
- **Pacing.** No frame over 34 ms during any effect, in any configuration; headless rendering is not the Tauri window, which the Tauri spike measured at 60.0 fps.
- **Memory.** One host costs 160-190 MiB at 1280x800 and 260-450 MiB at 1920x1080@2 while a battle runs (mostly GPU), and 116-223 MiB stays after the battle closes (the compiled WASM and Ruffle's JS). It does not grow with the number of effects played.
- Bundle: the main JS chunk shrinks by 83 KB (7.75 to 7.67 MB, 1,049 to 1,029 KB gzip) as the WebP manifest and frame buffer leave it; the effect index is a lazy 127 KB chunk (46 KB gzip). Ruffle adds 29.2 MB under `ruffle/` in the build (two 14.3 MB WASM builds, of which a page fetches one, 5.0 MB gzip), and the SWFs 130.6 MB to `public/`. The superseded WebP sheets and HD frames (36.3 MiB and 330.8 MiB, ignored) still sit in `public/battle-effects/` and would ship with the app until they are removed.

## Checks

- `src/features/battle/skill-effect-placement.test.mjs` (in `npm test`): the anchor, the separation scale, the mirror, the target point landing on the other creature from either side, independence from box sizes and target, and nothing before layout.
- `tools/verification/battle-skill-effects.mjs` (`needs-browser`): a real wild battle of 丽莎布布 against 皮皮 in Chrome at 1280x800@1 and 1920x1080@2 and in WebKit at 1280x800@1. The effect canvas covers the arena at the screen's density; 皮皮's attack is drawn mirrored onto 丽莎布布; 叶绿光束 beams from 丽莎布布 to 皮皮 and tints at least 90% of the arena; no effect outlives its move and no player outlives the battle. Under reduced motion the effect shows briefly and clears; with Ruffle blocked the battle plays on with one warning. Screenshots of each effect are in `artifacts/battle-skill-effects/`.
- The publisher's census matches the spikes' independent one on every effect (frames, hit frame, end frame, frame-1 stop) and its blend patch hits exactly the 16 effects the fidelity spike listed.
