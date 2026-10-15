# High-definition artwork and interaction integration

Revision 44 replaces the low-resolution scene and interface references with source-derived artwork or reviewed conservative AI restorations. Original files remain available beside the new assets. AI restorations preserve the reviewed composition and flat Flash style, but are not pixel-identical original drawings.

## Integrated artwork

- All 134 scene backgrounds now resolve to 22 source SVGs and 112 AI restorations. The latter include the Mystery Realm bitmap inside a wrapper that retains the original vector platform. Map 1 starts from a 960-by-560 source and uses a 1642-by-958 restoration. Map 726 retains its unusual 870:560 scene ratio; the user's requested forest extension replaces its black exterior gaps in a separately versioned `726-v44b.png`.
- The 1,483 static creature portraits use 1,343 SVGs, 139 direct source renders, and one reviewed AI restoration. Evolution ancestry, stage, and physical-scale fields are unchanged. Source filters sometimes require a faithful raster render instead of SVG.
- The UI source manifest contains 47 accepted native exports; seven additional UI restoration entries cover the bitmap-limited surfaces. The two mixed battle HUDs additionally replace their three shared low-resolution bitmap strips while keeping every original vector path, gradient and placement. The atlas resolves all 59 original assets through 40 native exports, 17 mixed compositions, and two independent AI restorations. All 51 atlas pages preserve their node geometry and navigation targets.
- All 67 original skill effects use 2,128 individual source-rendered frames. The application limits live or pending decoded frames to three across move changes and releases them at completion. Embedded original bitmap layers retain the source-detail limits documented in `skill-effects-hd-v44.md`.

Source hashes, generation prompts, rejected candidates, alpha handling, viewport registration, and per-asset reviews are stored in the respective public manifests and asset specifications. Larger generated images and embedded-image SVGs are gitignored. This local development checkout includes those files; Git metadata alone is not a complete artifact transfer. Source recovery tools and pinned manifests are under `tools/assets/`; reviewed AI pixels must be transferred with their manifests to reproduce the exact local result.

## Placement and the four reported problems

Scene identity now has an explicit background asset map ID, so replacing a filename cannot change terrain registration. Wild creatures stay inside the scene habitat. Original source actors restore boss placement where a verified display-list instance exists, including Steeltooth Shark at its cave entrance and Puni on the original platform. Retained or adapted placements remain distinguished from exact source contacts in `map-placement-v44.md`.

The pet-bag portrait and party cards now use the physical scale of the selected appearance. A level-60 Fish Dragon King using the Baby Carp skin retains its level, statistics, and skills while displaying the infant's size and vector image. In the 1280-by-720 browser check, the main image changed from approximately 205 pixels wide to 111 pixels wide, and loaded `/portraits/vectors/346.svg`.

Clicking a capsule immediately submits one capture action. The synchronous action lock prevents repeated clicks from spending multiple capsules while the animation runs. Recovery and status items retain their target-selection workflow. A real local battle consumed exactly one master capsule, changed the turn from zero to one, ran the capture sequence, and added the captured Shiny Pipi to the party.

Approaching an actor now stops on the incoming side of its contact point in screen space. The distance includes the robot and target width; an already-near click freezes the current visible position and opens the interaction immediately. Reduced-motion mode has no invisible walking delay and does not leave the target's roaming lock active after closing the dialogue. The live right-side check stopped at x=795.7 beside a target at x=757.6, rather than passing to its left, and opened the dialogue.

The fourth reported issue, map 726's black gaps, is resolved by the reviewed forest extension. Original source pixels and the earlier conservative restoration remain available; the manifest records the revised output and its edit reference. Its six wild creatures also use separated homes and short local routes on the newly visible forest floor. A deterministic replay covered 7,200 positions across 60 seconds, including interaction pause/resume and repeated label separation checks.

## Verification

The static asset audit passed 10 groups without pending entries: 7,355 unique file hashes, original tracked assets, pinned sources, all integrated manifest references, portrait scale invariants, atlas and HUD vector geometry, quiet Java launch flags, and ignored generated assets. This verifies provenance and consistency, not the artistic identity of every pixel.

Focused regressions passed 14 display and interaction groups across 11 viewports, 15 scene-placement groups, 13 capsule groups, and 11 skill-frame-buffer groups. TypeScript checking passed. Additional placement refinements and dynamic battle texture recovery are recorded by their own follow-up reports.

Browser checks used a separate local origin at port 1437, preserving the user's port-1432 save. Evidence under ignored `artifacts/` includes the corrected skin, capsule regression, approach from the right, native Shark and four-dragon interactions, Puni's retained platform, source portraits at 4K, the final seamless map 726, the integrated atlas, and production effect playback at 300% zoom. The effect probe recorded a peak of three pending/live image decodes and zero retained bitmaps after completion, replacement, reduced-motion playback, and unmount.

The selected Baby Carp appearance also completed an actual battle using a special move and a physical move while retaining Fish Dragon King's statistics. The opponent's source-rendered skill effect appeared on its production canvas. A verified 3840-by-2160 viewport resized each animation canvas to 1326-by-1326 pixels at device ratio 1 and layout zoom 3 after the resolution observer settled; both original animation components remained ready. The viewport override was reset after testing.

All asset export launchers run Java with headless and macOS UI-element flags, plus the CLI entry point. The owned Java processes no longer appear as foreground applications. Development work does not run a production build, package the application, push, or change the user's live save.
