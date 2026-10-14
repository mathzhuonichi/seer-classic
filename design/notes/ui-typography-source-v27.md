# Original UI typography and sharp icon exports, revision 27

## Result and scope

Original navigation and utility icons now have calibrated SVG and direct
four-times-resolution FFDec PNG alternatives. The correct SPT shortcut is
`newSpt` symbol 5585, the “勇者之路” badge. Its default state uses a bitmap
cache; a composition of its original vector badge and caption provides a
sharp standing variant while excluding its unrelated new-creature banner.
Original live Chinese fields use SimSun/宋体. The UI library's SimSun reference
has no embedded glyphs, but the installed Office SimSun font has been inspected
and copied only to ignored cache for the local developer preview.

This pass changes source assets, extraction tools and this record. It does
not change application components, styles, mechanics, saves, builds or packages.
Integrated browser appearance remains the integration owner's verification.

## Source typography and ordinary labels

Evidence comes from the cached [official UI library](https://seer.61.com/dll/UI.swf)
and [core library](https://seer.61.com/dll/RobotCoreDLL.swf), their original
FFDec XML and the recovered core classes. No guessed font download is used.

| Field or label | Original evidence | Settings |
| --- | --- | --- |
| Ordinary player nickname | `BasePeoleModel.as` 211–230 | `宋体`, 12 logical pixels, letter spacing 0.5, center alignment and auto-size center; no explicit bold or color override |
| NPC nickname | `NpcModel.as` 74–80, inheriting the base constructor | `宋体`, 14 pixels, blue 0x0000ff, white `GlowFilter(0xffffff,1,3,3,5)`; y offset increases by 15 plus source `nameY` |
| Scripted robot nickname | `RobotModel.as` 43–49 | Same 14-pixel blue nickname and white glow |
| Map title | UI `DefineEditText` 2804, font 7 | SimSun, 14 pixels, centered, yellow 0xffff00, `useOutlines=false` |
| Skill name, power and PP | UI `DefineEditText` 6498/6499, font 7 | SimSun, 12 pixels, white 0xffffff, `useOutlines=false` |
| Pet-bag creature name | UI `DefineEditText` 785, font 7 | SimSun, 14 pixels, centered, white 0xffffff |

The ordinary nickname constructor creates a TextField and a plain container.
It does not draw a plaque, enable a text background or add a rounded button.
The annual-fee branch separately loads `AnnualVipName`; that ornament is not
evidence for adding backing to ordinary player or NPC labels. Ordinary player
black is a TextField-default inference, not an explicit recovered color
constant. NPC blue and white glow are explicit. Neither recovered nickname
format explicitly enables bold. Globally replacing these fields with a
sans-serif family would contradict the source.

UI font 7 is a `DefineFont3` named `SimSun` with empty `glyphShapeTable` and
`codeTable`, referenced by 177 EditText records. Bold `宋体` font 5141 is also
empty. These device-font references cannot supply a complete Chinese web font.
Embedded `SimHei` font 4397 has two glyphs, while bold `SimHei` 4717 and bold
`黑体` 5077 each have four. Such subsets cannot cover arbitrary live text.
Outlined icon captions survive SVG export without a runtime font. Exact live
labels cannot be synthesized from an empty original device-font record.
The ignored `.cache/classic-ui-v27/font-audit.json` records the audit.

## Genuine local SimSun for developer preview

An initial narrow search found only Songti in standard font directories. The
integration audit then identified the installed application resource
`/Applications/Microsoft Word.app/Contents/Resources/DFonts/SimSun.ttf`.
Its OpenType family/full/PostScript names are `SimSun` in English and `宋体`
in Chinese, with style `Regular`. It has 28,762 glyphs and is 9,087,416 bytes.
Its SHA-256 is
`e72e26043ece0a899366f93e3fd48ca0aa9f285f9e81e3573f076813bb96d0ff`.
The raw `OS/2.fsType` value is 8; no redistribution authorization is inferred
from that flag. All 32 sample Chinese characters, including NPC names and the
SPT caption, map to nonzero Unicode cmap glyph IDs.

An exact copy is held only at ignored
`.cache/classic-ui-v27/local-simsun.ttf`; the audit JSON is likewise ignored.
No Office font is added to `public/` or tracked source. The integration owner
uses a developer-only route to the ignored cache. A production delivery must
not distribute this Office resource. Chromium accepted it through FontFace,
loaded it successfully and confirmed the sample Chinese text coverage.
The family matches the recovered source, but the historical client's exact
font-version binary has not been recovered or compared. Without this developer
face, `Songti SC`/`STSong` is a Mac fallback with potentially different metrics.

## Icon provenance

All symbols come from the official UI library, retaining their original art.

| Asset | Symbol | Material and role |
| --- | --- | --- |
| `spt` | 3019 | Vector dragon-head reference; not the selected SPT shortcut |
| `new-spt` | 5585 / button 5584 | Correct SPT badge; default/up is a 53 by 53 bitmap cache |
| `new-spt-over`, `new-spt-down` | Button 5584 | Genuine vector interaction states, including original red new-creature banner |
| `new-spt-vector` | Original placements 5580 and 5582 | Vector badge and outlined “勇者之路” caption; only banner placement 5581 excluded |
| `mission` | 1648 | Original vectors and outlined main-story caption |
| `profile` | 5969 | Original vectors |
| `map` | 5931 / button 5930 | Vectors plus original 111 by 100 bitmap content |
| `bag` | 3139 | Original vectors and outlined item caption |
| `creatures` | 3520 | Original vectors and outlined bag caption |
| `dex`, `restore`, `close` | 752, 745, 4965 | Original vectors |

The map sprite has one frame. Its up/down states use shape 5925, its over
state uses 5929 and it shares caption sprite 5927. The inspected states do not
supply a bitmap-free version of the same artwork. Mixed SVG preserves original
vector edges and caption, but cannot restore missing source bitmap detail.
The final bounded map-state check exported nested button 5930's up, over, down
and hit-test states separately. Every export still contains a 111 by 100 bitmap
body. Shape 5925 maps bitmap 5924; shape 5929 maps bitmap 5928; both use clipped
bitmap fill type 65. The shared caption sprite 5927 nests 5926. No matching
vector ring/body was recovered from these states. The mixed `map.svg` remains
the delivered map asset; no ring is redrawn and no bitmap-free map variant is
claimed. State exports remain ignored at `.cache/classic-ui-v27/map-states`,
and the manifest records the exact state audit.

The correct SPT sprite 5585 nests button 5584. Its up state is shape 5567,
which maps bitmap 5566 at 53 by 53 with non-smoothing fill type 67. That bitmap
contains the entire default badge and caption. Over/down states instead use
vector badge 5580 and caption 5582, plus banners 5581/5583. The selected
`new-spt-vector.svg` starts from the exact over-state export and removes only
the `use` placement for banner 5581. Every remaining placement matrix is
unchanged. It contains no images or runtime text. Its full alpha is fitted
uniformly into the original 54.5 by 53.5 logical viewport, preventing control
size changes and glyph clipping. This is a documented source composition, not
a generated redraw or a claim that the cached bitmap gained detail. Source
interaction-state colors can differ from the default cached bitmap.

## Rendering, reproducibility and verification

`tools/assets/export_classic_ui_vectors.mjs` exports original standing/up and
selected SPT interaction states with FFDec 26.3.0, measures actual SVG alpha in
headless Chromium and calibrates viewports. Ordinary icons retain their exact
previous PNG logical boxes. The SPT composition and state references fit
uniformly into the registered up-state box without distorting source curves.
The manifest records source symbols, states, composition, alpha bounds,
viewBoxes, hashes, material counts and logical sizes. The selected vector
caption glyphs were visually checked; no SVG contains runtime `<text>`,
`<script>` or `<foreignObject>` elements.

FFDec SVG and PNG filter handling differ; no pixel-identical glow/shadow claim
is made. The bag caption is a visible example. For the original PNG renderer's
filter treatment, `tools/assets/export_classic_ui_icons_hd.py` directly renders
source curves at four-times logical resolution. It alpha-crops and centers
base icons without resizing their rasters, and preserves two original SPT
interaction-state raster alternatives. Neither this rendering nor SVG export
adds detail to the map or default SPT bitmaps.

The initial comparison `.cache/classic-ui-v27/icon-comparison.png` contrasts
previous two-times PNGs, calibrated SVGs and direct four-times PNGs at browser
DPR 2. All caption glyphs are present. The SPT comparison
`.cache/classic-ui-v27/spt-comparison.png` contrasts the original cached up
bitmap, original over vector and selected badge-plus-caption composition.
All delivered variants have digest and dimension records in the manifest.
A complete initial export-plus-calibration replay reproduced nine SVG hashes;
the final expanded source selection and composition passed replay checks for
all 25 delivered variant hashes and dimensions. The source SVG pipeline also
preserves verified interaction-state PNG metadata when run separately. These
checks establish original-source assets and font evidence, not
an exact historical font binary or identical filter pixels across renderers.
