# Graphical map and management integration, revision 28

Date: 2026-10-04. This source revision continues the developer/debug workflow. Existing user-origin saves and historical releases are preserved. No production build, package or commit is produced.

## Implemented presentation

The map is a single graphical tree: overview, selected galaxy, and a planet's landing diagram. Each level retains its own original artwork and a return arrow. Simultaneous ancestor tabs, generic planetary orbs, the right scene preview and the separate landing-confirmation footer are removed. Native original positions are used where recovered; composed overview and unavailable region-map adaptations are distinguished in the source manifest. Canonical target IDs take precedence over original numeric map IDs, avoiding the shared-map-40 Cecilia-region collision. The existing world catalogue remains authoritative; source artwork alone does not create a new habitat.

The creature window uses the actual original PetBag frame at its recovered 647:471 aspect ratio, with eight staggered left controls, central alpha-bound normalized portrait, four source-labeled right tabs and six bottom party slots. The original title replaces the duplicate generic visible title while the accessible dialog title, close and header-drag controls remain. The warehouse is a searchable, eight-item paged overlay. A scoped hover correction prevents the older generic background shorthand from clipping source tab glyphs. The central portrait uses a square stage and retains the original image ratio; other art presentations keep their existing defaults.

Journey and SPT recruitment cards show two tasks per page with persistent previous/next and page selection. Focused encyclopedia task links still open the actual task and retain challenge and reward actions. The encyclopedia attribute menu shows original single/composite icons in its options and selected value, retaining native filter markup for other callers. Its fixed popup opens above when the available lower space is insufficient and keeps a bounded scroll area. Laboratory facility captions are raised Hei-style cream/gold logos following the original item-menu treatment; source machinery and interaction targets remain in place.

## Isolated browser checks completed

The developer fixtures use explicit separate controllers on a root-owned preview origin, rather than granting monsters or changing resources in the user's normal browser saves.

- Journey cards cover three tasks across two pages. SPT recruitment exposes all 42 tasks across 21 pages; the last page contains Gold Horn and Alloy Seit with all ten required challenge controls.
- The encyclopedia entry for species 143 opens the focused Kata recruitment task with its five actual prerequisites and a disabled reward while incomplete. Returning to the task list restores the full 42-task, 21-page recruitment group.
- The attribute menu exposes 48 options and 45 loaded original icon images. Grass filtering returns 134 species; the Grass/Psychic combination returns 11 species with its original composite icon. The normal popup remains within the viewport. In a bottom-anchored 400-pixel fixture, it opens upward from a trigger at y=632.5: the 320-pixel menu occupies y=308.5 through 628.5.
- A 21-monster fixture produces six party slots and 15 stored monsters across two warehouse pages. The second-page Arctic Beast can be selected; admission is disabled while the party is full. Depositing a party member, searching the warehouse, admitting the stored creature and making it the lead all update the correct UID and slot.
- Learning values of Attack 255 and Speed 255 save to the selected Bubu. Renaming it and allocating 1,000,000 pooled experience produces the same held UID as species 3, level 98, with the nickname preserved. All three Bubu ancestry entries are owned. This exercises the existing collection/evolution policy through the new regular interface.
- Earthquake replaces the first move through the actual learned-skill selection and confirmation. Exchanging the selected creature with the second slot and recovering the full team update the displayed order and current HP/PP.
- At the 738-by-499.69 game frame, the source PetBag window is 557.34 by 405.73, inside its scene. Its central portrait stage is square, all eight controls remain within bounds, and all four tab images retain 100-percent sizing under selection and hover. Six base stats and the experience meter are visible in the information well.

## Final map verification

The frozen metadata passes `node tools/verification/graphical-atlas.mjs`: 43 pages, 185 registered diagram controls, all 59 destinations and 130 landing leaves, 51 referenced artwork resources, 29 decorations and eight native title rectangles. All 168 audited control pairs involving adapted hit areas are clear; there are no missing resources or unreachable leaves. Every registered diagram digest matches the delivered file. TypeScript and affected stylesheet parsing pass.

Final isolated browser checks confirm the original Pano diagram, the three navigation-base entries, complete native Helka chrome and live title, original return arrows, and adapted Klose and fortress branches. The ship transport graphic lands in the actual transmission chamber; Klose's swamp node lands in the actual swamp. Returning from a planet restores its galaxy with no ancestor tabs or preview panel. Space-station and fortress branch controls are visible and usable. Both matching developer font faces reach `loaded`.

Visual inspection corrected the ship's power-room misbinding, source-current-room transmission target and challenge-port overlap. The ship blueprint remains at its original source placement. Four staging controls are separated; the final rightmost caption stays within the blue well. The native Helka viewport now includes the complete original frame, title and return control. The maintained exporter accepts focused `--ids` replay and its publisher preserves all adapted pages, the overview and the small-Phantom route.

Eight original region diagrams were available; the remaining 29 endpoints returned HTTP 404. Their pages use genuine source planet illustrations and original controls in documented compositions. The overview arrangement and small-Phantom marker are also adaptations. These limits do not remove existing landing routes or create extra habitats.

Screenshots and fixture diagnostics are ignored under `artifacts/ui-v28/`. These are current developer-interface checks, not a packaged-application test or a claim of historical pixel identity.
