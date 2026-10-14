# Laboratory facilities and breeding scroll layout

## Scene integration

The reported screenshot showed a flat standalone fusion box covering the laboratory floor beside Dr. Pat and a gold interaction marker above the doctor. The laboratory now uses the machinery already present in the original map-5 background. The left holographic platform opens fusion, the paired rear chambers open breeding, and the central blue wall console opens the item shop. Short Chinese labels identify each interaction. The gold marker is omitted in this laboratory; NPC markers in other scenes retain their existing behavior.

The background remains byte-for-byte unchanged. The cached official map-5 resource manifest lists the road JSON, EXML skin, and one background image. No separable machine bitmap is present in that table. The three new SVG emblems are locally authored interface graphics with translucent cyan accents, metallic edges, and amber indicators. They are explicitly not described as original recovered artwork.

Each facility has its own equipment footprint, keyboard focus outline, and approach point. Activation stops event propagation, closes any NPC dialogue, walks to the corresponding device, and invokes the existing navigation callback with `fusion`, `breeding`, or `shop`. Dr. Pat's dialogue also offers the shop action. The facility footprint z-index is below Dr. Pat and the player; the equipment and labels occupy the rear and left machinery rather than the doctor's floor location or the right-hand exit.

## Breeding layout

The breeding panel previously imposed a viewport-derived height independently of its containing game window. That could leave the list's apparent scroll extent beyond the clipped host. It now fills its actual host with `height: 100%`, `min-height: 0`, and a bounded grid row. The title and list heading do not shrink. The pair list retains its own vertical scroll track and a visible thin scrollbar, with overscroll contained inside the list.

## Verification boundary

Source inspection confirms separate callbacks and laboratory-only removal of the marker. The source table and the untouched background were inspected directly. Runtime facility placement, clicking, keyboard focus, and breeding scroll behavior require the parent task's browser verification. This pass performs no production build, package creation, or commit.
