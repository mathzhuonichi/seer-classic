# Seer Classic browser playtest

This package contains the browser game and its local artwork. The game interface is Chinese. It requires Python 3.8 or newer and a modern browser with JavaScript and local storage enabled. It contains architecture-independent browser assets; it is not a native Linux application. The target Linux environment must still be checked before reporting a successful Linux playtest.

## Revision 30 interface and integrated content

Revision 30 packages the current development source, including the expanded
nine-slice PetBag party frames, original-art universe/galaxy/planet navigation,
compact creature details, classified free laboratory shop, and eight source-backed
breeding pairs. Fusion uses the left rear laboratory chamber; breeding uses the
separate right rear chamber. The central wall console opens the item shop. The
encyclopedia identifies initial acquisition entries and their subsequent evolution.

The current executable acquisition closure reaches 453 of 1,479 eligible forms,
with 1,026 still lacking a normal route; four NPC-partner forms remain excluded.
This is a dependency audit, not a complete natural-progression playthrough.
Developer-only cached fonts are excluded from the package; typography uses the
browser's available fallback fonts.

## Complete creature motion and runtime

This revision contains original battle motion for all 1,483 retained encyclopedia
species, including idle, physical, special, property and hit-reaction timelines. It
retains official battle music, eight interaction/result sounds, persisted audio
settings and 67 original skill effects. Source atlases preserve their original RGBA
pixels through exact lossless compression. The complete offline animation library
is approximately 623 MiB before the other game files and archive compression.

The runtime shares decoded sources, serializes loading, limits idle cache bytes,
cancels abandoned battle entry and draws when original source frames change. Large
atlas CPU pixels release after GPU upload, and lost canvases have bounded recovery.
Controller catalog records are isolated per game; collection views update when
ownership changes. Complete motion coverage does not add missing collection routes.

During the visual/audio playtest, check physical, special and property moves, damage
feedback, switching, successful and failed captures, and automatic scene return. Open
Settings to check mute and both volume controls, then reload to check persistence.
Music should stop on leaving combat; a started victory/defeat cue should finish once.
Seven original atlases are 8,192 square: each needs approximately 256 MiB of GPU
texture storage at full resolution, before driver overhead. The CPU copies release
after upload, while transient upload memory still depends on the browser. Failed
resource loads or exhausted canvas recovery use the existing portrait fallback.

## Start

1. Extract the complete archive.
2. In the extracted package directory (identified in `PACKAGE.json`), run `python3 start.py`.
3. Open `http://127.0.0.1:1427/` in the browser. Keep the terminal open while playing.
4. Press Ctrl+C in the terminal to stop the server.

Run `python3 start.py --port 1428` if the default port is occupied. Game assets use root-relative URLs, so serve the `game` directory at the server root. Opening `game/index.html` directly with `file://` will not work correctly. No npm install, Node runtime, Tauri, or internet connection is required after extraction.

For a Linux container whose browser cannot reach container loopback, run `python3 start.py --host 0.0.0.0 --port 1427` and use the environment's port-forwarded browser address. This makes the server listen on all container interfaces; the default launcher uses loopback. Record the actual browser address in a bug report, omitting private access tokens.

## Saves

The archive contains no player save. The game saves automatically in the browser profile, separately for each origin (host and port). Returning to the same browser profile and address restores that save. Changing the port, hostname, or forwarded URL creates a different save location. Use the game's settings or item window to export a save before changing environments and import it through the game afterward. Browser private mode or cleared site data can discard a save.

## Playtest ownership

- Dot checks mechanics, navigation, acquisition, rewards, progression, fusion, and save persistence. Use `BUG_REPORT.md` for reproducible findings.
- The user checks interface layout, artwork, scale, animation, visual hierarchy, and interaction feel. Record a screenshot and the scene or window where the issue appears.

Begin with normal movement and atlas travel, ordinary capsule capture, a challenge battle and return to its triggering scene, reward hatching, and save reload. For fusion, travel to the laboratory and use the left rear chamber. Check that the output bead hatches, both parents remain unchanged, and reload preserves the result. The registry covers 33 fusion infant forms through 34 recipes; 23 recipes have normally obtainable parents. Breeding has eight pairs, of which one currently has normal routes to both eligible parents. An unavailable parent is a documented content gap rather than proof that fusion or breeding execution is broken. Check the separate breeding chamber, scroll through all eight pairs, and use the central free shop to replenish an ordinary supply.

This is a development playtest. Historical damage rounding and some acquisition routes remain incomplete. Packaging and successful HTTP delivery do not establish mechanics correctness or end-to-end Linux compatibility.
