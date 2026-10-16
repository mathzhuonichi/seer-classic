# Compact station atlas, V53

The station page now exposes exactly four supported destinations: the station
hall (`resources`, original map 102), Brave Tower (`brave-tower`, 500), Dark Arena
(`dark-arena`, 110), and Mystery Realm (`mystery`, 10032). Each whole blue label
and GO control is one clickable region. The ship page retains only Transport,
Laboratory, and Captain's Room; its four obsolete staging controls are removed.
Compatibility redirects and world facilities are maintained by the separate
world-navigation change.

The former station exporter incorrectly bound `special_0` to Brave Tower and
`special_5` to Dark Arena. Those source controls visibly label Starry Arena and
King's Tower, respectively. V53 removes both assumptions and the unsupported
labels and empty yellow control circles from the active page.

## Artwork and source boundary

The architecture is the unchanged first-frame vector export of sprite 164 in
the official [StarMap102 SWF](https://seer.61.com/resource/map/starMap/102.swf).
The retained SWF has SHA-256
`8bb5e8f25587db885570331625175732b16b58b74af716f596d19cadf21f9aa0`.
The exact recovered SVG bytes are retained as
`public/ui/classic/maps/hd/station-v53-structure.svg`, with SHA-256
`bb263dbb589441eafeb4b7c9976e87df9eadc907beec6197910ee45d98352491`.
This source contains 1,217 vector paths and no bitmap images. It establishes
the illustration's identity, not the full geography or a particular historical
release date.

GO artwork reuses the existing vector export of StarMap102 button 186. The
return arrow reuses the existing official UI control. The blue frame, stars,
label typography, four label positions, and callout lines are an authored
remake layout. In particular, the Mystery Realm callout is not a recovered
source hotspot. No original callback or geographic claim is attached to these
new positions. No image generation or repainting of the station drawing was
used.

## Reproduction and checks

Run `python tools/assets/export_classic_atlas_regions_v28.py --ids 102` in the
project's Python environment. The retained structure SVG and existing GO
vector are sufficient for replay; the original cached sprite export is used
only if the retained structure file is absent. The exporter updates only
`planet-102` and the three-room ship projection in the two atlas JSON files.
Its general ship path also filters obsolete staging nodes from cached input.

The two atlas records agree on the four exact region IDs and original map IDs.
All five controls, including Back, are inside the stage and do not overlap.
All referenced assets exist; the public artwork hashes match their records.
The six V53 SVGs parse successfully and contain no raster images, scripts, or
external resource references. The original structure matches the recovered
sprite export byte for byte. A complete visual composite was inspected at
960 by 560 and rendered at 3840 by 2240; all artwork remains vector based.
TypeScript and whitespace checks pass. An independent browser on the isolated
port-1441 preview confirmed exactly four region buttons plus Back on the
station page, and three room buttons plus Back on the ship page, with no hidden
staging controls. Each station destination reached its named world scene; both
Back controls returned to the universe overview. The temporary tab and server
were closed afterward. This navigation check does not certify battle rules.
