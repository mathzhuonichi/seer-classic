# Typography and modifier integration, revision 27

Date: 2026-10-04. This is a developer-source revision. No production build, package, commit or historical-release update was made.

## Result

Live names follow the recovered SimSun/Songti source, including ordinary player size 12 and centered black text, NPC size 14 and explicit blue/white glow, and the original yellow size-14 map title. Authored rounded backing cards are removed. Static icon lettering comes from the original vector outlines. Mission and bag art use fresh four-times source rendering; the correct SPT badge uses the original vector badge and caption, without its unrelated new-creature banner. The original map-ring bitmap remains inside its mixed SVG; its missing source detail is not represented as recovered vector detail.

The installed Office SimSun face is validated and copied only to ignored developer cache. A DEV-only imported stylesheet serves it from Vite's existing project-root static route; no server configuration change, public font copy or global font installation is needed. The later raised laboratory logo captions additionally use the local matching SimHei face prepared by the same helper. Historical binary/font-version and exact cross-renderer filter equality remain unverified. Source and icon extraction evidence are recorded in `ui-typography-source-v27.md`.

Settings use a light content well with readable navy text and original unfilled nine-slice panel rails. Source slices are top 35, right 55, bottom 37 and left 54 pixels. Audio, save, developer and full-screen controls share a bounded scrolling body.

The modifier covers the whole game frame above the bottom navigation. Its persistent target area contains an explicit held-instance selector, portrait, current name, species number, level and party/storage position. Identical species instances remain distinct by UID and position. The keyed editor resets drafts when the target changes and applies to that selected UID. Validation feedback names the resulting creature, including its evolved form. Resource and acquisition controls retain their previous dispatch actions. A scoped dialog focus loop, initial selector focus, Escape closing and focus restoration support keyboard use.

## Actual verification

TypeScript, affected stylesheet parsing and whitespace checks pass. Browser checks use a separate developer origin and explicit isolated controllers, preserving the user's existing origin saves.

- A fourth duplicate Bubu instance was changed to level 20 and IV 31. It became species 2, Bubu Grass, with the same UID. The first three instances remained byte-for-byte equal in the visible diagnostics. Switching back restored the first instance's actual level 5 and IV 19 drafts.
- The actual SimSun FontFace reached `loaded`, and the original UI/name font stack was confirmed. The source audit separately verified 32 sample characters through the font cmap.
- Modifier resources were set to 12,345 and a fifth Bubu was added. The target selector immediately included the new instance. At the smaller frame, resources were set to 3,210 through the bottom controls.
- At the 1,022-by-692 frame, the 680-by-650 dialog stayed inside the game frame. At the 738-by-499.69 frame, the dialog was 680 by 475.69 with a bounded body; its target header stayed fixed while the body scrolled. Hit testing at the footer reached the modifier overlay rather than the toolbar.
- Smaller-frame settings had 362 visible pixels of a 613-pixel body and remained scrollable. Explanatory copy used navy `#476c86` over `#f5fbff`.

Ignored screenshots and diagnostics are under `artifacts/ui-v27/`. These checks establish current developer behavior and source-backed artwork; they are not a historical pixel-fidelity certificate or packaged-application test.
