# Revision 20 official combat media delivery

The game now plays original creature action timelines, selected original skill effects and official battle audio. The user's narrowed scope leaves scene artwork, scene music and scene objects unchanged and excludes battle countdowns. Current official configuration takes precedence for the retained type chart. The portable revision-20 archive includes this delivery and preserves revision 19.

## Integrated behavior

- **Creature motion:** 384 offline clips cover every species in the 382-species union of currently obtainable creatures and encountered opponents, plus two earlier exports. Idle, physical, special, property and hit sequences use source frame rates and hit markers. Unsupported archival species retain the portrait fallback. This is not animation coverage for all 1,483 catalog species.
- **Skill effects:** 67 original effects include all 60 most frequent skills in the implemented acquisition/encounter set and seven further selected skills. Source skill IDs and the engine's actual self/foe target side travel through the presentation adapter. Effects remain keyed to their move while subsequent damage frames appear; their center follows the target combatant, and exported effects suppress redundant generic flashes. The remaining 5,258 skill IDs retain their previous presentation.
- **Audio:** one official battle theme and eight short interaction/result cues cover selection, tabs, healing, successful acquisition, reward, level gain, victory and defeat. Both volume controls and mute persist. Failed actions and editor changes do not earn reward cues. Battle level gains play once after normal scene return. Original short-cue assignments are documented remake mappings, not a certification of every historical controller binding.
- **Timing and ownership:** native action tails continue while HP/damage feedback follows the source hit phase. Decoding is serial, only the first two combatants are preloaded, and mounted clips retain ownership until their players are destroyed. Unclaimed preloads expire. Failed resources use the previous motion durations. Delayed loads cannot resurrect a closed fight; battle music stops on exit, and an already started victory/defeat cue finishes naturally unless another battle, mute, hide or unmount interrupts it.
- **Official type correction:** fighting against evil is 0.5. Both standalone and runtime catalogs contain it; all 324 retained single-type cells match the directly decoded official table. Damage rounding and the dual-type combination rule are unchanged.

The status-skill six-point symbols and the earlier playtest mechanics fixes remain in place. No world, map, atlas or progression source was changed by this media pass. Repository source records are English; game controls remain Chinese.

## Source and extraction evidence

See [the resource discovery audit](official-game-feel-resources.md), [original motion delivery](original-battle-motion.md), [original skill-effect delivery](original-skill-effects.md) and [audio delivery](battle-audio.md). Their manifests identify official CDN URLs, source versions, original byte counts and hashes. The motion parser/player is pinned to version 0.3.1 with PixiJS 8.19.0. FFDec 26.3.0 exports skill display lists without executing ActionScript. UnityPy 1.24.2 decodes the audio specimens.

All 384 animation resources passed artifact and structural replay, including 100,735 mesh frames and 1,151 hit markers. Every optimized atlas preserves the complete decoded RGBA digest. Exact lossless WebP saves 55.24 MiB against the generated PNG set; compressed timelines and atlases together occupy approximately 247.18 MiB. The 67 effect sheets preserve 2,128 delivered RGBA frames exactly against the corresponding rasterized exports and occupy 36.25 MiB. Audio adds approximately 696 KiB. These are source/extraction checks, not complete visual certification of all creatures, palettes and masking modes.

Generated PNG/WebP/gzip/audio files remain under explicit ignore rules; manifests and reproduction tools are source records. The included archive has every required offline asset. Species 502, Dorag, has an 8192-square atlas requiring approximately 256 MiB of decoded RGBA memory. It successfully loaded in the tested browser, but that does not remove the source memory requirement on smaller devices.

## Bugs found and resolved during integration

1. Vite adds `Content-Encoding: gzip` for compressed timeline paths, while the portable launcher sends raw gzip. A second decompression caused silent portrait fallback. The production decoder now checks actual response bytes and decodes exactly once. Live Vite and portable-launcher responses both passed.
2. Measuring the animation host with `getBoundingClientRect()` during switch-in included a transient CSS scale. Barlus remained tiny and displaced after the scale ended. Transform-independent layout dimensions and a single first-pose alpha calibration now keep bodies centered across switching and all subsequent action poses. Before/after screenshots are retained.
3. Exported skill effects were initially positioned against the entire arena. The final overlay is centered inside the actual target combatant; live observations put effect and target centers within 0.01 pixels in the tested layout. Self-target Withdraw stayed on the player; the enemy's Growl also targeted the player, and Tackle targeted the enemy.
4. Successful-acquisition audio must not play on a failed capture, and a normal retreat must not play defeat audio. Capture feedback is success-only at the displayed resolution point; the adapter now carries the actual result reason, and retreat/capture suppress unrelated victory/defeat cues.
5. The 700 ms automatic scene return truncated native victory/defeat sounds. Started result sources may finish once after ordinary exit; pending result loads are cancelled, and all other battle sources are stopped.
6. The portable launcher's default five-request listen backlog reset a connection during eight-worker asset verification. Its backlog is now 64. The same eight-worker verification subsequently retrieved every game file with exact manifest bytes.

Development hot reload invalidated some intermediate test fixtures, and centered clicks on roaming transparent sprite boxes missed the visible body. Final checks used stable source and a screenshot/DOM-grounded click on the creature body. These browser-operation retries are not reported as failed gameplay acceptance tests.

## Checks actually performed

| Check | Result and scope |
|---|---|
| Official binary type-table reader | Entire input consumed; 324/324 retained single cells match, zero differences |
| External-calculator replay | Exactly one documented official override; all other retained cells and existing representative/damage-boundary assertions pass; all 39 fighting/evil damage rolls exercise the real engine |
| Existing playtest regression replay | Leech immunity, recoil ordering, item usefulness, Puni targeting, bead messages and strategy catalog assertions pass |
| Damage presentation replay | Full overkill, actual-loss HP/drain, event-ordered knockout/switch, revival, bench targets and transformation assertions pass |
| Audio tests | Seven focused tests pass, including actual-success cue selection, editor/failure exclusion, gesture unlock, async cancellation, settings and result lifetime |
| Native registration tests | Source species 1, 6, 70 and 502 center/extent calculations and Retina alpha-readback orientation pass |
| Timeline transport tests | Raw gzip, already decompressed gzip and plain JSON pass; actual Vite and unmodified portable-launcher responses pass |
| Build | TypeScript and production Vite build pass; the large main-chunk and ineffective dynamic-import diagnostics remain informational |
| Actual browser integration | Two original combatants display; self/foe effects target correctly; Rei special action displays; Rei-to-Barlus switching is correctly centered; Dorag's large atlas loads; mute stops music; both volume settings and mute survive reload; victory and retreat return to the map and remove battle canvases |
| Real browser audio | All nine delivered clips decode through the native AudioContext. A battle theme starts once, mute/exit stops it, and a victory cue starts and ends naturally. Subjective audible balance was not certified by those observations |
| Packaged normal UI | Fresh portable package opens; a normal rare-creature interaction reaches the ordinary load gate and displays both original combatants; the master capsule succeeds through the real item UI, returns to the same scene, and the captured Shiny Pipi is visible as the fourth party member |
| ZIP and HTTP | All 2,723 manifest files match size/hash; all 2,720 game files match through the packaged HTTP server with eight parallel workers |

Screenshots, visible diagnostic traces, source verification and package/HTTP replay output remain under ignored `artifacts/battle-media-v20/` and `artifacts/gamefeel-resources/`. The browser fixture uses a separate local origin and synthetic setup; it does not overwrite the user's existing port-1425 save. The normal packaged UI is also checked on its own origin. Actual Linux execution and a complete long campaign playtest were not performed.

## Parallel work and integration ownership

The user explicitly requested GPT-6.1 Sol with medium reasoning. Three subagents used those settings: audio, creature motion and skill effects. Follow-up turns addressed cue integration, lossless size reduction, transport and registration issues within the same three workers. No additional model run, publication or original-game account operation was initiated.

All three deliverables were integrated into the shared workspace. The parent added exact skill/target/result fields, the final overlay lifecycle/placement, capture and retreat cue corrections, the battle-load gate, cancellation handling, bulk ignore rules and package verification. No Git commit was made. Exact per-worker token usage was not exposed by the collaboration interface, so no numerical quota estimate is claimed.

## Portable archive

`releases/seer-classic-linux-playtest-v20.zip` is **349,890,532 bytes** (approximately 333.68 MiB).

- Archive SHA-256: `3ba591e638c3dedc1f9ece8a0e225c2a580a12b4cab3ed4f4001e034711bbf24`
- Content SHA-256: `5eb8dc68f27f022df6d4dcac7be9454926376f9b9a8fdaf3b23dbae221260134`
- Earlier v19 SHA-256 remains `ee13b3226a6a5a36463310b65273087bae4fd3bac7d3c2d9da9691f51bf432f5`.

Extract the entire archive and run `python3 start.py` in its directory. The local page defaults to `http://127.0.0.1:1427/`. The archive needs no npm install or original Unity client. Packaging and Mac browser checks remain distinct from target Linux verification.
