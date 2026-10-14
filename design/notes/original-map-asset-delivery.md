# Original official map background delivery

## Delivered artwork

The development asset set contains 133 original official map backgrounds under `public/maps/original/`: 91 JPEG files, 30 PNG files, and 12 SVG exports, totaling 31,375,377 bytes. `public/maps/original-manifest.json` records the offline path, original map ID, source URL, dimensions, output SHA-256 digest, and source identity for every file. The 125 distinct original map IDs exposed by the current `world.ts` fields and `world-expansion.ts` destination declarations are covered; eight supplementary recovered maps are also retained. The manifest has no unresolved IDs.

This includes the ship interiors, the starter planet regions, Rabol maps 441 and 515, and the newly exposed SPT habitats. The records describe official artwork recovered from the resource versions available during this delivery. Some early planets received later official redesigns. These files do not establish that a scene matches its 2009 version.

The assets contain the original static background artwork. Animated scenery, foreground display lists, scripted objects, event actors, and map UI are separate resources and are not reconstructed by this asset pass. No replacement bitmap artwork was generated, and no official art is presented as locally authored.

## Source recovery

The official H5 resource version table is [version/version.json](https://seerh5.61.com/version/version.json). It identifies hashed filenames beneath `resource/assets/map/<original-map-id>/`. Each map's resource table, `map_<id>.json`, names its standalone `bg_mc` background. The common source paths are `map_<id>_bg_mc.png` and `map_<id>_bg_mc.jpg`; the version table supplies a hashed variant where one exists. The delivered manifest selects [map 10's JPEG](https://seerh5.61.com/resource/assets/map/10/map_10_bg_mc.jpg), [map 31's versioned PNG](https://seerh5.61.com/resource/assets/map/31/map_31_bg_mc_6b99a4a3.png), and [map 441's JPEG](https://seerh5.61.com/resource/assets/map/441/map_441_bg_mc.jpg).

The 121 H5 images are copied without re-encoding, cropping, resizing, or repainting. Their bytes and native dimensions match the saved source. Most measure 960 by 560 pixels. Individual source dimensions are preserved: map 2 measures 1142 by 594, and map 726 measures 870 by 560. Several original sources differ by a few pixels from the common stage dimensions.

H5 resource tables were unavailable for maps 100, 102, 110, 402, 405, 406, 443, 500, 741, 744, 746, and 10032. The corresponding official Flash resources remained available at `https://seer.61.com/resource/map/<id>.swf`. FFDec 26.3.0 exported the first frame of each root instance named `bg_mc` to SVG without executing ActionScript. Each manifest entry records the SWF digest, exported XML digest, source symbol and frame, unregistered export digest, registered output digest, and viewport method.

These SVGs retain original vector geometry and embedded original bitmap content where present. The SVG viewport removes FFDec's normalization offset using the original root placement matrix and clips to the original 960 by 560 logical-unit SWF stage. This preserves the source's scene registration. Logical vector dimensions are not a claim that an embedded bitmap gained raster detail. Whole-frame exports were deliberately excluded after inspection showed live event characters and UI in the map 10 root frame.

## Original placement evidence

H5 map layout JSON records the background registration and an original `road` array. The manifest retains each layout URL, digest, and background registration. The official [MapModel source](https://seerh5.61.com/resource/app/mapModel/mapModel_b40be02f.js) sets the grid size to 10 and records only cells equal to 1 as allowed positions. The official [core source](https://seerh5.61.com/resource/app/core/core_88d1fe7c.js) uses `Boolean(data[x][y])` for traversable cells in AStar. Therefore, these original arrays use x-major indexing, 10-unit cells, 1 for open cells, and 0 for blocked cells. Their source digests are included under `movementSource` in the manifest.

Background image coordinates can differ from logical map coordinates. Map 2 has original background offsets of approximately -46.65 and -8.2 units. Any placement derived from a layout grid must account for the recorded background registration when displaying the source image at its natural dimensions. Runtime walking and encounter placement remain the responsibility of the presentation integration; recovering a background does not certify those interactions.

## Verification and handoff

All 133 offline files were checked against their manifest SHA-256 digests and dimensions. All 121 raster images decoded successfully; their source bytes were preserved. All 12 SVGs were parsed, checked for active or external content, and rendered with librsvg. The original SWF stage and root placement matrices were inspected during viewport reconstruction.

The recovered starter worlds, ship rooms, Rabol, and all 12 Flash exports were visually reviewed. Three additional contact sheets covering all 133 backgrounds were inspected for blank exports, inappropriate UI/event content, or obvious viewport displacement. Some official sources have dark or transparent margins, which remain part of the original artwork. Visual review confirms recognizable clean background assets, not a complete replay of the original animated maps.

Ignored working files are under `.cache/map-assets/`. Useful visual handoff files include `starter-contact-sheet.jpg`, `flash-background-contact-sheet.jpg`, and `all-backgrounds-1.jpg` through `all-backgrounds-3.jpg`. The source SWFs, XML exports, resource tables, layouts, runtime source snapshots, and source images are retained there. The public paths and manifest were frozen before runtime integration checks.

Reproduction requires Python with Pillow. Recover the currently modeled H5 map IDs with:

```sh
python3 tools/assets/download_original_maps.py
```

The downloader preserves existing manifest records and cached source versions. For H5-unavailable IDs, use the existing Java and FFDec installation:

```sh
python3 tools/assets/export_original_map_vectors.py \
  --java /path/to/java --ffdec /path/to/ffdec.jar
```

After changing the public manifest, refresh the small runtime projection:

```sh
python3 - <<'PY'
import json
from pathlib import Path
maps = json.loads(Path('public/maps/original-manifest.json').read_text())['maps']
runtime = {key: {field: value[field] for field in ('path', 'sha256')}
           for key, value in maps.items()}
Path('src/presentation/map-art-assets.json').write_text(
    json.dumps(runtime, indent=2) + '\n')
PY
```

The runtime connects all 129 current regions across 59 destinations. Of these, 123 regions use their explicitly declared original map ID and six custom staging/training regions reuse a parent official scene. This does not imply 129 distinct source maps or an original map for every custom region. The public provenance manifest remains separate from the bundled path/hash projection. Regional atlas previews and battle preparation load the same regional background as exploration.

The extractor downloads missing source SWFs and retains cached source files for subsequent deterministic exports. This delivery did not run a production build, package a native application, or repeat broad test suites.
