# Original player walking cycle

The player previously displayed one complete standing SVG per direction. Its walking class translated that entire image upward by two pixels; neither leg changed pose. The component now displays the original nested walking frames, with the same `direction`, `walking`, and `role` props. Captain and scientist images retain their standing assemblies.

## Source and reconstruction

The existing `public/robots/classic/manifest.json` and `ASSEMBLY.md` establish the original equipment, complete placement matrices, and direction-specific layer order. Inspection of the cached `SkeletonClothPreview.as` confirms that the client starts the movement child at frame 2, loops past frame 1, and returns to frame 1 when stopped. `ChangeClothAction.as` applies the same movement/stop behavior to equipment children. The player direction children contain 13 frames: standing frame 1 and walking frames 2–13. The official UI source records 24 frames per second.

`tools/assets/build_classic_robot_walk.py` reuses the standing compositor's XML display-list reader and immutable original FFDec vector leaves. It advances each direction's immediate movement child, preserving its full source matrix and the standing compositor's slot order. Feet, color, waist, default details and head are present in every frame. Walking foot/waist artwork is recovered from the original equipment clips, rather than synthesized by translating or rotating the standing image.

Eight `player-*-walk.svg` strips contain the standing cell followed by all 12 walking cells. Definitions are shared within each strip. `walking-manifest.json` records hashes, direction frames, original render orders, the source manifest hash, source script hashes, frame rate and an ignored placement audit. Measured alpha bounds across all 104 cells produce a common viewport of `[-25, -47, 48.6, 61.2]`, including padding; the wider walking viewport avoids clipping the sideways swing of either foot. Idle and walking use this same viewport.

The dedicated stylesheet exposes one cell at a time with 12 discrete steps over 0.5 seconds. Removing `walking` immediately exposes the original standing cell. The renderer has no added whole-body bob, flip or rotation; the restrained body motion comes from the recovered frames. Reduced-motion presentation slows the cycle to 0.75 seconds while retaining the visible locomotion cue. Asset URLs include their strip hash. `data-gait` exposes the current player state for browser inspection.

## Verification and boundaries

- Reconstructed and rasterized all 104 cells with offline librsvg. Every frame has nonempty alpha bounds inside the measurement stage.
- Checked all eight strips for 13 ordered source frames, all five rendered slots in their original order, matching movement frames across those slots, and matching output hashes.
- Compared resolved immutable foot leaf definitions in the first and second halves of every direction's cycle; opposite phases differ, and each direction uses seven distinct original foot drawings. Compared every strip's standing body subtree byte-for-byte with its existing standing SVG; all eight match. Visually reviewed a contact sheet covering idle and five walking poses per direction. Both legs alternate, while waist and head remain attached. In front/back views, the source perspective intentionally allows feet to overlap during passing poses.
- `npx tsc --noEmit` passed after the component change. No frontend production build or native package was created.

The contact sheet, individual original-frame SVGs/PNGs and full placement audit are under ignored `.cache/classic-robots/walking-audit/`. The parent visually inspected the contact sheet and operated the integrated development map on an isolated origin. During a back-right crossing, the live strip exposed `classicRobotWalk` with a nonzero matrix offset and visible alternating foot artwork. On arrival it returned to the zero-offset standing cell. A later rightward creature approach exposed the walking state and restored idle on reaching its dialogue. Screenshots and UI samples are under `artifacts/map-interaction-v14/`. These live checks cover representative directions; the offline reconstruction check covers all eight.

## Rebuilding

The generator requires the standing compositor's cached XML and leaf exports, Pillow, and `rsvg-convert`. Its additional ignored `walking-exports/` contains FFDec `sprite:svg` exports of item 100001 symbols `2,4,12,20,28`, item 100002/100003 symbols `8,16,24,32,40`, and UI symbols `5325,5338,5346,5354,5205`. These exports provide the movement leaf geometry absent from the outer direction exports. Run the generator with a Python runtime containing Pillow; it does not change the existing standing assets or manifest.
