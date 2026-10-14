# Laboratory rear chamber placement

## Equipment binding

The original map-5 image is 960 × 559 pixels. Its rear wall contains two separately painted chambers: the left chamber has an opening approximately bounded by x = 18–145 and y = 137–280, and the right chamber by x = 208–335 and y = 147–280. Revision 26 binds fusion to the left chamber and breeding to the right chamber. The foreground holographic pedestal is no longer a fusion control, and breeding no longer spans both rear chambers.

The interactive footprints include each chamber's original blue title panel, opening, and amber steps. Fusion uses center (8.5%, 33.5%) and size (14%, 34%); breeding uses center (28.2%, 34.6%) and size (14%, 33%). Their footprints are disjoint. Short Chinese labels sit on the existing title panels. The previous authored SVG emblems are removed from the rendered scene, leaving the original painted machinery visible. Hover and keyboard focus reveal a restrained outline around the selected opening.

The approach points are (17%, 58%) for fusion and (31%, 58%) for breeding. The left point sits to the right of the foreground holographic pedestal; the right point sits in front of the rear-right chamber. Activation retains the existing walk-then-open callback and closes any NPC dialogue first. The central wall console retains its shop footprint and callback. Dr. Pat retains the original NPC interaction and has no overhead marker in this laboratory.

The original background is unchanged. No movement geometry, battle background, fusion rule, breeding rule, or save behavior is modified. The retained SVG files are historical authored assets; they are not used as facility equipment in the revised scene.

## Scene frame and title

The scene title uses the recovered navy-and-cyan trapezoid from official `UI.swf` shape 2799, under `public/ui/classic/map-nameplate.png`. It contains no baked text; the current region name is rendered inside it. The plate is centered at the scene's upper edge, and the surrounding margin uses a flat blue field with a narrow cyan-and-navy frame. The source and extraction metadata are recorded separately in `public/ui/classic/manifest.json`. This changes the presentation of the existing fitted scene, without resizing or cropping the source background.

## Verification boundary

The original image was inspected directly, and `npx tsc --noEmit` passed after the placement change. Runtime facility activation, labels, viewport scaling, and the surrounding interface are reserved for the parent task's isolated browser verification. No production build, package, or commit is produced by this pass.
