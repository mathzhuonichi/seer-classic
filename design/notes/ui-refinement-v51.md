# V51: compact item categories and PetBag content

## Reference and scope

Follow the original `UI.swf` PetBag frame, four tabs and navy content well documented in `official-ui-source-v26.md`. The bag and shop controls use the corresponding blue-and-white content treatment: thin separators, small text tabs and one selected state. This revision changes presentation components only.

## Changes

- Isolate the shared icon under `seer-item-icon`. The old global `.item-icon` rule forced a 45 px wrapper inside a 38 px art area and clipped its right and bottom edges. The new image and wrapper are centered, size constrained and contained. Item tiles use a single border.
- Share compact text categories across Inventory, ItemShop and Raising. Main category buttons are 24 px high; PetBag uses its smaller navy variant. Hide empty categories and unnecessary pagination. If a selected category disappears after consumption, immediately show all remaining items and clear the stale selection.
- Divide all 32 raising items into level (5), nature (7), learning points (7), energy beads (12) and restoration (1).
- Show six compact ability rows by default. Expand learning-point inputs only on request; retain presets, per-stat clearing, total clearing, cancellation, validation and explicit saving. Display the two engraving slots in one row below the table.
- Add short engraving candidate categories and scroll the expanded picker and confirmation into the PetBag content viewport.
- Move engraving shop filters above both columns, remove repeated headings and large stock cards, and give the icon list approximately half of the content width.
- Reduce Inventory target cards to 36 px portraits, keeping the ordinary confirmation button entirely visible at 1280 x 720.

## Verification

- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
- PostCSS parsed all six new or modified CSS files.
- Production components ran against an isolated in-memory controller on port 1439; no player save was loaded or written.
- Confirmed every raising category through the UI: 32 / 5 / 7 / 7 / 12 / 1 items.
- Confirmed learning-point cancellation preserves saved values and explicit saving returns to the compact summary with the new value.
- Confirmed engraving candidates and confirmation scroll into view after opening or selection.
- Consumed the last fusion bead in a synthetic two-category fixture. The remaining essence immediately stayed visible after the obsolete category row disappeared.
- Measured centered, contained icon boxes in Raising, Inventory, ItemShop, EngravingShop, EngravingSlots and battle item controls. No measured item image exceeded its art box or deviated from its center by more than 0.1 px.
- Checked 1280 x 720, 640 x 480 and 3840 x 2160 layouts. Inventory and shop had no horizontal overflow at 640 x 480. At 4K, the shell uses layout zoom 3 and the raising art/image boxes measure 120 / 108 px.
- Browser warning/error log was empty. Both existing previews, ports 1426 and 1432, returned HTTP 200 and served the V51 Raising component.

The retained original item raster assets have their original resolution (for example 55 x 55). The 4K check establishes layout and containment, not newly authored high-resolution artwork.

## Local evidence

Ignored acceptance artifacts live under `artifacts/ui-refinement-v51/`:

- `ui/`: isolated preview source and server.
- `screenshots/ability-1280x720.png`: compact ability overview.
- `screenshots/items-1280x720.png`: compact category strip and centered energy-bead icons.
- `screenshots/items-640x480.png` and `items-3840x2160.png`: responsive checks.
- `screenshots/engraving-shop-1280x720.png`: engraving filters and list.
- `screenshots/measurements.json`: bounded icon and category measurements.

No production build, app packaging or remote push was performed.
