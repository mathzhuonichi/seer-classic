# Original artwork recovery for v44

The source pass preserves the existing game geometry, artwork selections, palette, labels, and navigation metadata. It adds 47 interface assets, 19 leaf-map SVGs, and 56 atlas assets beside their existing baseline files. These are exports from pinned official Flash files, not enlarged copies of the old PNGs. AI enhancements are a separate pass and must retain separate provenance.

## Interface artwork

`public/ui/classic/hd/manifest.json` records 54 distinct baseline assets. Every baseline crop was reproduced byte-for-byte in RGBA from the current pinned source before an HD replacement was accepted. The published replacements are 42 SVGs and five PNGs rendered directly at 4x from the source display list. Two SVG battle HUDs contain original bitmap layers; the manifest distinguishes mixed assets from pure vectors.

The direct 4x assets are the pet-bag projector, battle command rail, breeding title, breeding grid, and breeding bottom rail. SVG export was unsuitable for the command rail because the Flash scale-nine bitmap behavior left visible gaps. The source-rendered PNG preserves that behavior. Rendering at 4x improves original curves and text; it cannot recover additional detail inside an embedded bitmap.

Seven baseline assets remain bitmap-limited in the source pass:

| Baseline | Original bitmap material |
| --- | --- |
| `petbag-well.png`, `petbag-header-circuit.png`, `petbag/frame.png` | Crops of the same 647-by-471 pet-bag bitmap |
| `battle-skill-rail.png` | 419 by 141 |
| `battle-log-panel.png` | 299 by 163 |
| `map.png` | 111-by-100 bitmap plus vector decoration |
| `new-spt.png` | 53 by 53 |

The public manifest intentionally records these as retained rather than presenting an SVG wrapper as recovered detail. Runtime substitutions and any AI restoration of these surfaces belong to the integration pass.

## Leaf-map source review

The 134 original source backgrounds inspected in this pass comprise 46 pure-vector sources, 39 mixed sources, and 49 bitmap-only sources. Source classification alone does not establish that the retrieved Flash snapshot reproduces the already-shipped H5 scene. Animated child states, different terrain variants, props, and lighting can differ.

Nineteen additional pure-vector maps passed the source-fidelity review: 2, 20, 25, 42, 43, 52, 53, 54, 106, 325, 328, 450, 463, 484, 494, 664, 683, 685, and 775. Their unchanged source curves are published under `public/maps/original/`, with source hashes and registration evidence in `public/maps/original-hd-manifest.json`. Existing verified SVG maps 402, 406, and 443 are preserved. Map 1's original `1.jpg` is 960 by 560; its final reviewed AI replacement is 1642 by 958. Map 10032 has a separate original vector platform over its bitmap background, retained independently in the final composite.

Registration uses the existing H5 background viewport after applying the inverse source background placement, rather than assuming that every H5 image begins at source stage coordinate zero. Map 54 remains 961 by 560 with local viewport `[-1, 0, 961, 560]`; map 325 retains viewport `[-3.65, -1, 970.3, 561]` and the existing 970-by-561 image extent. The source drawing and runtime actor coordinates must use the same registration. Maps 664 and 775 retain their existing opaque black exterior behind the original vector paths.

The source pass rejects visibly different reconstructions, even when the source is all vector. Examples include changed floor holes on 41, 326, and 762; an incomplete platform on 333; changed desert props on 61; and different floor or opening geometry on 348 and 676. Those assets enter the appearance-preserving enhancement queue using the shipped H5 image as the edit target. Rejected source snapshots are not silently substituted.

The completed runtime map set contains all 134 maps: 22 verified source SVGs and 112 AI-enhanced backgrounds, with the original vector platform retained in the 10032 hybrid. These final runtime counts are distinct from the source classification and source-only acceptance counts above.

## Atlas source review

`public/ui/classic/maps/hd/manifest.json` covers all 59 unique PNG paths referenced by the atlas at the start of this pass. Thirteen complete page selections were replayed from the original source display lists, including the original supported-node filtering. All thirteen replay PNGs match their baseline RGBA pixels exactly. The other verified assets comprise 35 labeled planet icons, the GO control, five galaxy selectors, the fortress control, and the return arrow. Their 43 baseline crops also match exactly.

The resulting 56 source replacements are seven SVGs and 49 direct 4x PNGs. Forty derive entirely from vectors; sixteen contain original bitmap material. The five galaxy pages retain their baked headings by using source PNG rendering. Their SVG exports omitted those headings. SVG export also changed the 726-page text and the 102-page background filters, so those pages use direct source rendering. Many small planet icons and galaxy selectors have Flash glow filters whose SVG export produces visibly incorrect rectangular glow regions; direct source rendering preserves their composition and text. At 4x, the source renderer makes some glows sharper than the old 2x render. These differences were visually reviewed and receive explicit per-asset comparison bounds in the source specification.

Three baseline atlas assets remain unchanged in the source-only pass: the space backdrop, the colored ship-blueprint composite, and the station-hub icon. The isolated ship symbol does not reproduce the existing colored composite, and a matching source symbol for the station-hub icon was not established. Their current appearances are the correct references for a separate enhancement pass. Subsequent layer inspection recovered the exact space-backdrop display-list selection, as described below.

Mixed atlas assets are not claimed to be wholly scalable. The galaxy pages share a 960-by-560 star-field bitmap; four also contain small decorative planet clusters, including a 189-by-165 cluster on the Pano page. The labeled, interactive planet illustrations are primarily vectors. The five region diagrams for 484, 702, 29, 717, and 726 contain 661-by-390 bitmaps carrying the core terrain, region illustrations, and frame; their text and GO overlays are separate source layers. In the ship page, the 1381-by-662 bitmap is mostly transparent and its central white ship blueprint occupies only a small part of that canvas. The five selectors contain a 250-by-115 star-field texture and small planet-cluster bitmaps alongside vector framing, titles, and central artwork. Larger source rendering alone does not recover detail in these components. The manifest records every embedded image size so the integration pass can distinguish recovered curves from remaining source-limited detail.

## Mixed atlas composition

The sixteen mixed atlas surfaces and the separate space backdrop use twelve distinct source bitmap definitions. SVG export exposes seventeen distinct RGBA images because five are color-transformed versions of the same source definitions: four selector planet clusters and one selector star field. The original Flash color transforms reproduce those variants; they do not require separate AI-generated artwork.

`tools/assets/hd_atlas_bitmap_bindings_v44.json` binds each raw bitmap to its pinned source group, character ID, decoded RGBA hash, and affected surfaces. `compose_atlas_bitmap_hd.py` replaces those definitions using premultiplied ARGB lossless storage and compensates the bitmap fill matrices for the new pixel dimensions. It retains the source shapes, text, display-list positions, masks, color transforms, layering, and crop. Four region pages whose source SVG rendering was already verified keep their original vector SVG and replace only its embedded image. Other mixed surfaces use the original display-list renderer at 4x.

The five region-diagram bitmaps retain their original alpha masks. AI candidates introduced uneven partial transparency into formerly opaque blue grid cells, which exposed bright blocks from the original white backing layer. The composition therefore uses enhanced RGB with source alpha: SVG clears the candidate alpha and applies the original image as an alpha mask, while native rendering samples the original alpha in the same normalized bitmap coordinates. The original generated PNG files remain unchanged. This preserves original opacity and outer boundaries without presenting interpolated mask pixels as newly recovered color detail.

The independent space backdrop is the original first-frame placement subset at depths 1, 2, 11, 20, and 117 of sprite 2718, without the sidebar. Replaying it matches the shipped 1920-by-1120 RGBA image exactly, including the central pink artwork and orbit decorations. The blue background bitmap alone is not the complete space-backdrop composition.

Before using enhanced pixels, all twelve unmodified raw bitmaps were inserted through the same pipeline. Sixteen of the seventeen complete surfaces reproduce their original RGBA pixels exactly. The ship page has a documented premultiplied-alpha conversion difference: its maximum mean channel error is 0.00858 on the 0–255 scale, its maximum individual RGB difference is 7, and alpha is unchanged. This is recorded separately rather than called pixel-identical. The source-only ship-page replay, which does not re-encode the bitmap, remains exact. The mixed-composition report records the measured round-trip result for every surface.

## Reproduction and validation

The source specifications are `tools/assets/hd_ui_sources_v44.json`, `hd_map_sources_v44.json`, and `hd_atlas_sources_v44.json`. They pin the official source URL and SHA-256, the original baseline hash, source symbol or stage selection, crop, and comparison limits. A changed official source or changed baseline is rejected instead of being accepted implicitly.

Run with the repository environment, or the configured base Python environment when the repository has none:

```sh
python tools/assets/export_original_ui_hd.py --export --publish
python tools/assets/export_original_map_hd.py --export --publish
python tools/assets/export_original_atlas_hd.py --prepare --export --publish
python tools/assets/compose_atlas_bitmap_hd.py --replay --prepare --export
python tools/assets/compose_atlas_bitmap_hd.py --prepare --export
# After reviewing the composed artwork:
python tools/assets/compose_atlas_bitmap_hd.py --publish
```

The scripts use the cached JPEXS FFDec 26.3.0 toolchain and `rsvg-convert`. All Java launches include `-Dapple.awt.UIElement=true` and `-Djava.awt.headless=true`, and FFDec is invoked with `-cli`; this prevents command-line export from registering a foreground Java application on macOS. No ActionScript is executed.

Mixed composition consumes the reviewed image-generation manifest in `.cache/hd-ui-v44/atlas-ai/manifest.json`, verifies each enhanced bitmap hash, and publishes a separate `public/ui/classic/maps/hd/mixed-manifest.json`. The reviewed bitmap inputs must be retained to reproduce these compositions; generating a new AI image is not deterministic. The separate manifest avoids overwriting independently enhanced ship-blueprint or station-hub entries during integration.

Validation includes pinned-source hashing, exact original RGBA replay for interface and atlas crops, registration-aware map comparisons, raster comparisons of candidate SVGs, direct 4x render comparisons at the baseline size, and visual contact-sheet review. The public manifests include final output hashes. Runtime reference coverage, actor registration, build verification, and AI-output review remain separate integration responsibilities.
