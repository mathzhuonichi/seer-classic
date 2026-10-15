# Challenge presentation and Mystery Realm platform

The Mystery Realm contained a white cutout underneath Puni because the previous map export retained only `bg_mc`. The source bitmap itself contains that cutout; the missing content belongs to the separate original `animator_mc` layer. Revision 40 restores that layer's first frame and makes the shared challenge interface opaque.

## Original platform recovery

- Source: `https://seer.61.com/resource/map/10032.swf`.
- Source SHA-256: `657a73d6b79d5c03bce08f05bc92319854e080a2e87e5a4d06a80aae014f8920`.
- Original viewport: 960 by 560 pixels, with identity root placement for `bg_mc` (symbol 3, depth 1) and `animator_mc` (symbol 19, depth 3).
- The retained animator contains the original energy surface, metal platform and upper-right machine. Shape paths, colors, gradients, mask, depth order and placement matrices come from the source SWF. The first-frame zero-strength glow and fully transparent glow sprite have no visible contribution.
- `control_mc`, `top_mc`, scripted events and later animation frames are excluded. This is a static source-frame restoration, not a reconstruction of historical event animation.

The delivered SVG is `public/maps/original/10032.svg`. Both the provenance manifest and runtime artwork hash are updated so existing clients request the corrected file.

The source-specific recovery tool can reproduce the composition from a background-only export:

```sh
python tools/assets/restore_mystery_realm_floor.py \
  --swf /path/to/10032.swf \
  --background /path/to/background-only.svg \
  --output /path/to/restored.svg \
  --evidence /path/to/evidence.json
```

`tools/assets/export_original_map_vectors.py` also invokes the recovery for map 10032 and refreshes the runtime artwork index after successful exports. No additional art is generated.

## Shared challenge interface

Opaque blue headers and navigation bars, pale illustration/detail panels and cream reward cards replace the translucent surfaces. Locked stages remain legible through explicit disabled colors. The map remains a subdued backdrop only in panel gutters.

All seven campaigns use this component: Xuanwu, Qinglong, Baihu, Zhuque, Qilin, Rei training and Puni, covering 30 stages. Stage selection, dispatches, availability, rewards and persistence are unchanged. At widths up to 560 pixels, the decorative portrait is hidden and the header and stage rail are compact, preserving space for the keyboard-focusable scrolling details.

## Verification

- TypeScript and whitespace checks pass.
- The recovery tool reproduces the delivered SVG byte for byte (SHA-256 `5076e708ffc8f1f491c64859f1438d6a43833308e5f5fb68d2574c6fe250cb32`, 225843 bytes). Seven focused checks cover reproduction, in-place use and rejection of invalid or conflicting inputs without replacing existing output.
- The original embedded background bitmap is unchanged, the recovered layer appears exactly once, and both manifests match the delivered file. The retained preview at port 1432 serves those same bytes. The complete FFDec export pipeline was not rerun in this pass.
- Independent rendering checks cover all 30 stages and five additional completion/locking/empty/reset states. Opponents, requirements, rewards and disabled controls remain present; rendering leaves saved data unchanged.
- Browser checks at 1280 by 720 show the recovered platform and opaque Puni interface. The initial seal remains available and the body remains locked.
- At 520 pixels wide, the detail pane is approximately 152 pixels high; at 640 pixels it is approximately 146 pixels high. Scrolling reaches the reward and prerequisite message while the disabled start button stays visible.
- Browser console checks report no warnings or errors. Screenshots are retained in the local analysis directory under `browser-v40`.

This pass changes presentation and asset export only. It does not claim a new full campaign playthrough or change combat balance.

## Revision 41: center Puni on the recovered platform

The previous 55-percent vertical position grounded Puni near the platform's front edge. The contact also included its name label in normal layout, offsetting the visible feet from its scene coordinate. The contact now anchors the art directly at the top-face center, approximately (446.5, 225.5) in the 960 by 560 source image, with the label positioned separately below it. Other creature placements are unchanged.

Browser geometry at 1280 and 640 pixels wide places the art's bottom center within 0.02 source pixels of that point, and the label stays below the feet. The updated placement check and TypeScript pass. Screenshots are retained under `browser-v41` in the local analysis directory.
