# Display density and large-window calibration

The target is comfortable use on a 27-inch 4K display. The browser exposes viewport size and device pixel ratio, not a trustworthy physical diagonal or operating-system scaling label. Verification therefore measures CSS dimensions and actual canvas backing pixels separately.

## Layout and rendering

The original 960:650 game frame is retained. Above a fitted height of 720 CSS pixels, layout zoom grows with the frame, preserving readable relative sizes for text, windows and controls. Smaller windows retain the previous responsive layout. Text and SVG artwork are painted at the resulting display density rather than enlarged from an application screenshot.

Window dragging converts pointer distances to layout coordinates. Roaming bounds use the same layout coordinate system as actor dimensions. Body-mounted type menus and tooltips receive the source element's layout zoom and convert their positions accordingly. Existing battle movement transforms do not increase canvas density.

Battle animation uses the installed renderer's public `mountInto` API with a host-owned Pixi renderer. Its resolution is device pixel ratio multiplied by effective layout zoom. Resize, display-density changes and layout-zoom changes resize the existing renderer; they retain the player, source sequence, atlas and registered creature bounds. Cleanup covers initialization failure, cancellation and GPU disposal.

The mission, inventory and creature toolbar buttons now select their existing pure SVG originals instead of exported PNG copies. No new or generated artwork is introduced.

## Verification

Automated checks cover 11 viewport/coordinate groups, nine resolution-observer groups and seven component-lifecycle groups. The latter mock GPU boundaries; they do not substitute for browser rendering. Test caches are isolated from the running development preview.

The actual browser checks use an isolated fresh save and cover all eight bottom navigation entries at 3840 by 2160 CSS pixels. Encyclopedia, creature management and the atlas were inspected visually. Additional checks cover 2560 by 1440, 1920 by 1080, the native Retina viewport, and 640 by 760. At 4K, dragging a window by 150 horizontal and 15 vertical screen pixels moved it by exactly those distances. The type menu stayed aligned with its trigger and selected the requested filter; a focused tooltip resized and repositioned when the viewport changed.

| Viewport in CSS pixels | Layout zoom | Rendered ordinary-window width in CSS pixels |
| --- | ---: | ---: |
| 3840 by 2160 | 3 | 2760 |
| 2560 by 1440 | 2 | 1840 |
| 1920 by 1080 | 1.5 | 1380 |

In an actual Steeltooth Shark battle, both animation hosts measured 442 by 442 layout pixels. At 1920 by 1080 with DPR 1 and zoom 1.5, each canvas had 663 by 663 backing pixels. Resizing the same battle to 3840 by 2160 increased each to 1326 by 1326; returning to the native 1280 by 720 viewport with DPR 2 produced 884 by 884. Both retained `ready` and visible-alpha registration, while turn, health and PP stayed unchanged across resizing. A real attack round, forced replacement and retreat then completed successfully. The replacement also initialized at the correct density.

An initial browser run exposed an expired Vite dynamic-import cache shared with verification scripts. The three new verification scripts now use separate disposable caches inside ignored project artifacts, and the preview was restarted before the successful GPU run. The corrected run produced no further browser warnings or errors. Non-cancellation animation initialization errors now retain a console diagnostic instead of silently losing the cause.

Screenshots, browser geometry and resource classifications are retained under the task analysis directory in `browser-v43/` and `display-v43/`. The focused verification entry points are `tools/verification/game-display-v43.mjs`, `display-resolution.mjs` and `battle-display-lifecycle.mjs`.

## Source-art limits

This change does not claim native 4K detail for all original assets. Of 134 selected maps, 122 are raster images and nine of the 12 SVG files still embed bitmaps. Most scene backgrounds are 960 by 560. Of 1,483 static creature portraits, 143 use true vectors and 1,340 use PNGs; the PNG visible silhouette's median longest dimension is about 175 pixels. The map control also contains original bitmap imagery, and some interface frames are raster exports. Enlarging these sources does not add detail.

The original animation atlases retain their source texture limits even when their meshes and framebuffer render at higher density. No physical 27-inch monitor, color profile, sharpness setting or refresh-rate performance was certified. No production package was created in this pass.
