# Original Seer portrait assets

The official static resource URL is `https://seerh5.61.com/resource/assets/fightResource/pet/<species-id>.png`. Its numeric IDs are the original species IDs. The companion head-image path is `https://seerh5.61.com/resource/assets/pet/head/<species-id>.png`; full-body images are used here so both battle scenes and catalog cards can share the original artwork.

`download_portraits.py` downloads and validates PNG signatures and image dimensions with eight concurrent requests. It uses `data/monsters/*.json` as the species list when available. Before catalog recovery, it checks IDs 1 through 1487, plus 1498 and 1499. Existing valid downloads are reused.

The first retrieval saved 1,483 images under `public/portraits/<species-id>.png`, totaling 22,255,152 bytes. The six missing numeric slots are 835, 836, 837, 838, 839, and 1001; each returned HTTP 404 after three attempts. The count matches the documented catalog size, but the recovered catalog should be checked for an exact ID-set match. No generated replacement art was needed.

`public/portraits/manifest.json` maps each successful ID to its app path, original URL, dimensions, byte count, and SHA-256 digest. Failures are recorded separately. The URL convention was discovered through https://www.bilibili.com/opus/697166788097474613 and verified directly against the official host. Species 1 was inspected visually and shows the original transparent-background 布布种子 artwork. Original raster sizes vary by species and should retain their aspect ratios in the UI.

## Original vector upgrades and shared sizing

The official H5 body image for species 1 is only 54 by 87 pixels. Stretching this raster cannot recover detail. The original combat Flash asset remains available at `https://seer.61.com/resource/fightResource/pet/swf/1.swf`; the numeric convention also works for the other reviewed species. Guessed H5 body variants (`pet/big`, `pet/body`, `pet/normal`, `pet/stand`, `pet/bigPet`) returned 404 for species 1. The separate `https://seer.61.com/resource/pet/swf/1.swf` front-view file is also available, but the combat source was selected to preserve the existing body pose.

`export_vector_portraits.py` extracts the named `pet` sprite's first frame with JPEXS FFDec 26.3.0. It reads the original display list without running ActionScript and exports the original curves, fills and gradients to SVG. Active content is prohibited; embedded bitmap layers require separate classification. The first PNG measurement is provisional. `calibrate_vector_viewports.mjs` measures the SVG's own alpha with native resvg, expands the viewport before measuring, and retains at least one logical vector-unit of transparent padding. It does not launch a browser. SWF/PNG and SVG placements can differ, so the PNG crop cannot establish a correct SVG origin. Exports marked `viewport_pending` are excluded by the profile builder until calibrated. Original H5 PNG bytes are retained.

`public/portraits/vectors/manifest.json` records source/output SHA-256, symbol/frame, dimensions, geometry preservation and pixel comparisons. The initial 143 SVG files remain byte-identical. The full V44 source pass recovered all 1,483 official combat SWFs and selects 1,343 SVGs at runtime: 1,336 pure vector images and seven vector bodies with original bitmap effects. Another 139 portraits use direct original-SWF PNG renders: 70 at 4x and 69 at 2x where 4x changed scale-sensitive Flash effects. Their visible dimensions are at least 1.94 times the original H5 raster's longest visible edge; they were rendered from the source display list, never enlarged from those H5 pixels. Eight of these direct renders retain original bitmap effect layers. Species 910 has a bitmap main body and remains outside this source-only upgrade; its separately approved reconstruction belongs to the AI asset workflow. The exact source selection is in `public/portraits/source-audit.json`. An original animation's first pose can differ from the H5 snapshot's phase, so this is faithful source recovery rather than a claim of pixel identity with every H5 snapshot.

To reproduce selected pure vector exports with Pillow, Java, FFDec and native resvg:

```sh
python3 tools/assets/export_vector_portraits.py --java /path/to/java --ffdec /path/to/ffdec.jar 1 2 3
node tools/assets/calibrate_vector_viewports.mjs --resvg /path/to/@resvg/resvg-js/index.js --ids 1,2,3
python3 tools/assets/build_art_profiles.py --preserve-layout
```

For the complete resumable workflow, use `recover_portrait_sources.py` for its `download`, `export`, and `prepare` phases; `classify_mixed_portraits.mjs` to separate bitmap effects from bitmap bodies; `validate_source_portraits.py` for independent pixel comparisons; and `render_source_portraits.py` for direct source rasters. `publish_source_portraits.py --check-only` validates the complete selection before publication. Candidate files stay in ignored `.cache/portrait-v44/` until publication. Java launchers use both `-Djava.awt.headless=true` and `-Dapple.awt.UIElement=true`, followed by FFDec `-cli`, to avoid repeatedly creating macOS GUI applications. See [the V44 source audit](../../design/notes/portrait-source-recovery-v44.md) for the bounded-render exception, validation thresholds and reproduction records.

The new generated SVG/PNG payloads are local and gitignored; the existing tracked 143 SVGs remain tracked. Tracked manifests, profiles, and recovery scripts pin their source and output digests. A fresh checkout requires the generated asset recovery before it has the same full offline coverage as the verified local runtime.

`build_art_profiles.py` measures the alpha-channel bounds of all 1,483 original rasters and writes `src/shared/creature-art-data.json`. Selected source assets provide measured alpha bounds. `--preserve-layout` retains every existing evolution root, stage and physical scale during artwork upgrades; the V44 pass verified all 1,483 entries against the pre-upgrade profiles. Without that option, the builder follows recovered `evolves_from` relationships. Starters have explicit profiles: grass 0.48/0.72/0.98, water 0.50/0.73/0.98, and fire 0.48/0.73/1.00. Other evolving families interpolate from 0.52 at their first stage to 0.96 at their final stage; species without an evolution family use 0.84. These ratios are remake art-direction choices, not canonical physical heights.

Cards and battle scenes share `getCreatureArt` and `creatureArtStyle` from `src/shared/creature-art.ts`. The image sits inside a square relative wrapper; measured visible bounds are centered horizontally and grounded at the bottom. Percentage positioning follows responsive wrappers, and wrapper transforms can independently mirror or animate the creature. This prevents transparent canvas margins or unrelated intrinsic raster dimensions from determining apparent body size. Battle sizes the portrait by the clip's native size instead of `physicalScale` (`battleCreatureExtent`, [battle-native-size](../../design/notes/battle-native-size.md)).

Focused verification checked the exact 1,483-species profile set, source/output hashes for all 143 exports, nonempty rendered silhouettes and uncropped edge padding, corrected SVG viewports, complete coverage of the 114 tiny original rasters, and monotone starter sizes. The selected starter families, species 10, 13, 70 and the five largest dimension deviations were visually reviewed. TypeScript compilation passed. Browser verification additionally found and corrected the exporter zoom/viewBox mismatch before delivery and confirmed species 3 and 10 render visibly. A fresh export of species 1 with the corrected tool produced the identical SVG SHA-256. Successful file generation alone was insufficient to establish visible rendering.


## SVG viewport correction

The earlier PNG-based crop did not verify all exported SVG origins. Species 70 exposed this limitation: its viewport size was correct, but the crop origin `(771, 786)` cut away most of the body. Direct SVG rendering located the complete silhouette at the corrected origin `(671, 662)` with the same `219 × 438` exported-coordinate extent. All 143 selected SVGs were recalibrated from their own rendered alpha, their hashes and profiles were regenerated, and the full original design now appears in every shared-renderer context.

Focused visual checks compared the corrected species-70 SVG with its official raster and checked tall species 70, wide species 25, small species 1 and evolved species 3 through the shared responsive component. The unsized component now explicitly fills both dimensions of its square host. Scene testing confirmed a complete species-70 body and complete dialogue portrait. This correction concerns viewport placement, not additional raster detail or replacement artwork.

## Classic Seer character directions and NPCs

The original [Client](https://seer.61.com/Client.swf) names `config/seer.xml`, whose asset/config entries lead to the official [RobotCoreDLL](https://seer.61.com/dll/RobotCoreDLL.swf). Its public loader strips a seven-byte release header and decompresses the remaining zlib stream. The recovered `MainManager` loads [UI.swf](https://seer.61.com/dll/UI.swf); its skeleton classes compose the original colour layer, `defaultCloth` details and clothing/equipment parts. Flash bytecode is read as source/display-list data and is never executed during extraction.

The UI display-list symbols used here are colour sprite 4435 and `defaultCloth` sprite 6508. Their original labelled standing frames are `down=1`, `leftdown=8`, `left=16`, `leftup=24`, `up=32`, `rightup=40`, `right=48`, and `rightdown=56`. The three original default equipment resources are IDs 100001, 100002 and 100003 under `resource/item/cloth/swf/`. The player uses all eight complete original composites, rather than rotating one front portrait. The configurable original body colour is set to blue.

The official [NPC configuration](https://seer.61.com/resource/xml/npc.xml) records Roger's colour and equipment IDs 100358–100361, and Pat's colour and equipment IDs 100354–100357. The source item metadata assigns the head, hand, waist and foot slots; slot registration offsets come from the original `empty_body` compose display list. These original layers form the two NPC composites. Their standing pose is front-left. The player requires eight views; the stationary captain and scientist retain a standing pose.

`public/robots/classic/manifest.json` records source URLs, source and output SHA-256 digests, frame/symbol IDs, slot registrations, original slot orders and the shared player viewport. Full placement records are retained in the ignored assembly audit, whose path and hash are recorded in the manifest. `build_classic_robots.py` reconstructs display lists recursively from cached SWF XML, including scale, skew, registration and depth; cached FFDec exports supply the leaf vector shapes. Direction frames select their original nested standing frame 1. Foot equipment remains behind the body, and original skeleton scripts determine upper-slot order. This corrects the previous compositor's boot overlap. See `public/robots/classic/ASSEMBLY.md` for the source diagnosis. The common player viewport was measured from rendered alpha using librsvg, with two logical units of edge padding. NPC viewports were measured separately. A contact sheet of all eight player views and both NPCs was visually inspected.

The asset-work directory is the ignored `.cache/classic-robots/`. It contains official SWFs, the statically exported client/skeleton source, the NPC and item metadata, and FFDec SVG exports. FFDec sprite exports use `-format sprite:svg -export sprite`; `-selectid` selects the source symbol. The player source directories are `color-svg/DefineSprite_4435*` and `ui-svg/DefineSprite_6508*`; equipment directories are `item-<id>/`. Once those original exports and `npc-cloth-metadata.json` are available, run:

```sh
python3 tools/assets/build_classic_robots.py
```

This rebuilds the ten offline SVG composites and manifest. It also requires the cached `UI.xml`, item XML exports and skeleton scripts; FFDec's `-swf2xml` command creates XML from the cached SWFs. The program reads the specified cached sources, rather than silently substituting a different current official asset version. Source hashes and the manifest identify the input version.


## Unity animation and SWF source verification

A bounded official Unity download now supplies a verified Rei animation specimen: 24 fps, five sequences and an offline atlas. Two independent decoders agree on every atlas pixel. A fresh FFDec replay also confirms the existing Flash extraction path. SWF reconstruction remains incompatible with the tested original Rei transform layout. The subsequent source pass successfully displays all five Rei sequences in the browser and decodes 38 official audio clips. The one official single-type coefficient difference has been corrected under the user's authority instruction, with its historical boundary still unresolved. See [the initial source audit](../../design/notes/unity-and-swf-source-audit.md) and [the game-feel resource handoff](../../design/notes/official-game-feel-resources.md) for pinned tools, actual operations, source identities and integration limits.

## Classic developer fonts and sharp navigation icons

`prepare_classic_development_font.py` validates and copies a locally installed matching Chinese TTF into ignored `.cache/classic-ui-v27/`, with family, glyph count, digest and raw embedding metadata. Its default family is SimSun; use `--family SimHei` for the laboratory logo captions, or `--source` for another local copy of the selected family. The app imports the corresponding font stylesheet only in Vite developer mode. Fonts are neither globally installed nor copied into public/tracked assets. The recovered original UI refers to device-font SimSun but supplies no general Chinese glyph set; historical font-version identity remains unverified.

`export_classic_ui_vectors.mjs` preserves original navigation paths and outlined caption lettering; `export_classic_ui_icons_hd.py` renders source vectors directly at four-times logical resolution. The selected SPT shortcut uses the original `newSpt` badge and caption composition. The map-ring body remains the original mixed bitmap/vector artwork. See `design/notes/ui-typography-source-v27.md` for source hashes, exact symbol selection, rendering differences and independent replay checks.

## Graphical classic atlas

`export_classic_atlas_v28.py` exports the five original 960-by-560 galaxy stages and selector artwork from the cached official module. `export_classic_atlas_regions_v28.py` exports the eight available native region diagrams, source title fields and source-coordinate targets; `--ids 1 30` permits focused replay. Its ship bindings use the actual transmission current-room graphic, while Helka keeps the complete 661-by-390 chrome. The publisher preserves the 29 composed pages, overview and separate small-Phantom route through ignored reproduction records. Original sources, missing endpoints, sprite IDs, adaptation boundaries and final digest records are documented in `design/notes/official-ui-source-v28.md` and `public/ui/classic/maps/manifest.json`.

Run `node tools/verification/graphical-atlas.mjs` to check canonical traversal of the complete retained world, artwork presence, viewport rectangles and introduced hit-area overlap without modifying any save. The report is written under ignored `artifacts/ui-v28/`. Geometry checks do not certify glyph extents or historical pixel identity.

## Revision 44 integrated artwork

See [the integration report](../../design/notes/hd-integration-v44.md) for all scene, portrait, UI, atlas and skill-effect coverage. The public manifests pin original source hashes, accepted output hashes, AI prompts and viewport registration. Generated large files are ignored by Git and must accompany their manifests when moving this development checkout; rerunning an AI prompt does not reproduce identical pixels.

Two scripts register reviewed AI restorations without changing their pixels. `register_hd_map.py <metadata.json>` copies one restored scene background to `public/maps/hd/<map>-v44.png` after checking that it is a PNG larger than the original in both dimensions with the same aspect ratio, and records its prompt, review and source hashes in `public/maps/hd/manifest.json`. `register_hd_composites_v44.py` reads the reviewed jobs in ignored `.cache/hd-ui-v44/root-art-final.json`: it embeds the map-10032 background in that map's original vector platform (`public/maps/hd/10032-v44.svg`) and copies the atlas restorations to `public/ui/classic/maps/hd/`, recorded in `independent-ai-manifest.json`.

The mixed battle HUDs use three shared restored bitmap strips inside the untouched original vector layout. After the three accepted PNGs and original source SVG wrappers are present, rebuild only their composite wrappers with:

```sh
python3 tools/assets/register_hd_hud_v44.py public/ui/classic/hd/hud-ai-manifest.json --destination public/ui/classic/hd
```

This checks the pinned input hashes, retains generated PNG bytes and registers their visible bounds through SVG. It does not resample the PNGs. `tools/verification/hd-assets-v44.py` checks these composites alongside the other static asset manifests and their runtime references.

## Item and engraving icons

`download_item_icons_v50.py` (Pillow required) pins the official per-id icons of every runtime item and engraving. It first runs `collect_item_icons_v50.mjs`, which lists through the real controller, without a browser or a player save, every item a screen can show (catalog items, Boss and recruitment essences, fusion beads) into ignored `.cache/item-icons-v50/runtime-items.json`. It resolves essence and soul-bead ids through `../analysis/seer-data-a00bcdd/items.json`, downloads the PNGs to `public/item-icons/original/`, writes the authored category fallbacks to `public/item-icons/fallback/`, and writes `public/item-icons/manifest.json` and `src/shared/item-icon-assets.json`. See [item-icons-access-v50](../../design/notes/item-icons-access-v50.md).
