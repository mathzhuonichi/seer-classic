# Brave Tower source floor inspection

## Implemented scope

V54 keeps the existing map 500 background and places the current opponent in the
central platform. The opponent position is an authored remake layout, not a
recovered official spawn coordinate. The source floor assets below are retained
only as ignored inspection artifacts; the runtime does not load them.

## Pinned official source

- URL: <https://seer.61.com/resource/map/500.swf>
- Local source: `.cache/hd-ui-v44/map-sources/500.swf`
- SHA-256: `3752cfe0cb2fc22693ff825d4b87d2faa7af268f1fad9f577d7dfe6d7749928f`
- SWF stage: 960 by 560; version 15; one root frame.
- Embedded metadata creation date: 2009-07-30; modification date: 2016-01-19.

The modification date prevents treating this complete file as an unchanged
2009–2013 interface. These observations describe the pinned official artifact,
not a reconstruction of every historical client or server rule.

## Display lists and coordinates

The static background is `bg_mc`, sprite 56, with one frame. Its existing export
is `public/maps/original/500.svg`, SHA-256
`63c4434300b7ed89b89c5792a3babd89a62a1585c56767ce50d9c458acc66a65`.
The SVG viewBox is `182.05 120.35 960 560`; its matching root translation is
`182.05,120.35`. Together they retain the original 960 by 560 stage coordinates.

The separate `animator_mc` sprite 71 contains `floorMc`, sprite 70, at
`(226.55,192.15)`. Sprite 70 has six frames with a shared clipping shape 57.
The clipping shape bounds in stage coordinates are approximately
`[227.5,193.5,750.45,417.5]`. Its six child sprites and fills are:

| Source frame | Child sprite | Original fill |
| --- | --- | --- |
| 1 | 59 | `#3cecff` |
| 2 | 61 | `#a7fc50` |
| 3 | 63 | `#03c952` |
| 4 | 65 | `#5e9eff` |
| 5 | 67 | `#e6e6e6` |
| 6 | 69 | `#f5ad5c` |

These are six masked floor variants, not six separate interior backgrounds.
No controller mapping from game floor to animation frame was recovered in the
bounded local inspection. In particular, this evidence does not establish that
the color changes every ten floors. Asset frame numbers are not game floors.

The existing background already draws the complete cyan platform and grid.
The separate floor animation is absent from the background-only export, but
this does not leave a missing platform. Overlaying source frame 1 replaces part
of the center grid with a larger plain cyan area. A 960 by 560 raster comparison
found 95,185 nontransparent overlay pixels and 24,129 changed composite pixels;
the layer remains inside pixel bounds `[228,194,750,417]`. V54 keeps the existing
background rather than adding that optional overlay.

`control_mc.lvmc1`, `lvmc2`, and `lvmc3` use sprites 132, 131, and 133, each with
eleven frames: an initially empty frame followed by ten digit drawings.
The `buttonLevel` display list contains bag, cure, VIP and exit buttons and
numeric counters; its name alone does not establish a floor-selection menu.

`control_mc.mosterMc` is DefineButton2 88. Rendering its Up state shows a small
yellow-orange creature-face button. It is positioned at `(187.05,429.25)` with
approximately 1.60 scaling. It is not a recovered opponent spawn marker and
must not be used to move the battle opponent to the left edge of the platform.

## Replay and checks

Run `python3 tools/assets/export_tower_floor_v54.py` from this
checkout. The exporter requires the pinned cached SWF and the existing local
JPEXS FFDec 26.3.0/Java toolchain; it performs no download. Optional `--source`,
`--java`, `--ffdec`, `--cache`, and `--output` arguments support relocated tools.

The default output is the ignored directory
`artifacts/tower-v54/source-floor-frames/`, containing `floor-frame-1.svg`
through `floor-frame-6.svg` and a provenance/hash manifest. Each transparent
SVG has viewBox `0 0 960 560` and retains the original floor placement, clipping
path, source shapes, colors, strokes and frame-six one-pixel vertical offset.
Only FFDec's generated white stage backdrop is removed. No artwork is redrawn.

Checks cover the pinned source hash, source frame identities and placement,
all six SVG hashes, original vector attributes, absence of raster or external
references, stage dimensions, transparency bounds and the rendered frame-1
comparison. Inspection images remain under `.cache/tower-v54/`, including
`frame-1-comparison.png` and `button-inspection/DefineButton2_88/1_up.png`.
No runtime presentation or gameplay file was changed by this source inspection.
