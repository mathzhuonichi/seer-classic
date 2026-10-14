# Official-source management appearance, revision 26

Date: 2026-10-04. Scope: CSS presentation of creature management, the encyclopedia, inventory, raising, fusion, breeding, the item shop, quests and audio settings. The efficient remake command flows and authorized mechanical simplifications remain unchanged. No chat or base interface is introduced.

## Visual evidence and implementation

The implementation was based on direct inspection of exported official sprites rather than an inferred modern dashboard style. `UI.swf` sprite 812 (`PetBagPanel_UI`) provides the bright cyan shell, dark navy information wells, circuit motifs, projector pedestal and cyan controls. Sprite 1433 (`Panel_Background`) provides the pale metallic edge and cyan interior. Sprites 3494 and 3496 provide the contrasting white content wells with deep blue borders. `PetBreedPanel.swf` sprite 66 (`breed_ui`) provides the navy grid, cyan machinery outline, male cyan and female pink wells, illustrated title and metallic lower rail. The cached formula-book first-frame image was blank and was not used as visual evidence.

The source worker's exact, text-free extracts are reused directly through CSS URLs. Shared management chrome uses `panel-background.png`; headings and index bottoms use `petbag-header-circuit.png`. Raising's profile uses `petbag-well.png`, and raising and encyclopedia portrait areas use `petbag-projector.png`. Breeding uses `breeding-title.png`, `breeding-grid.png` and `breeding-bottom-rail.png`. Quest cards also use the original navy well. Asset provenance, crop rectangles, dimensions and hashes are recorded in `public/ui/classic/manifest.json` by the source worker.

Live controls remain React elements. The illustrated breeding title and original machinery surround the live selectors and commands; no original baked button labels cover interactive elements. Most detailed numerical and item content remains in readable light wells, with navy profile wells and stronger cyan frames, matching the official client's contrasting surfaces. Compact buttons, tabs, selection outlines, scrollbars and confirmation actions use the source-supported blue and cyan treatment. The appearance adapts the original materials to the retained compact layouts and is not a pixel-exact reproduction of one historical release.

## Preserved behavior and verification

Changes are confined to `src/management.css`, `src/fusion.css`, `src/components/Breeding.css`, `src/components/ItemShop.css`, `src/components/AudioSettings.css` and `src/components/QuestPanel.css`. No component markup, controller, progression, battle or save code was changed by this worker. Searching, pagination, parent selection, probabilities, generation and level restrictions, immediate free rewards, shopping quantities and saved state therefore retain their existing implementation.

The revision-25 bounded breeding scroll is preserved: the content grid retains `grid-template-rows: minmax(0, 1fr)`, the index retains `min-height: 0` and `overflow: hidden`, and its recipe list retains vertical scrolling and contained overscroll. The added title and bottom machinery occupy fixed surrounding space, allowing the existing flexible content row to shrink within the window.

PostCSS parsing passed for all six affected stylesheets. Every referenced `/ui/classic/` asset exists on disk. These are syntax and resource checks; live visual layout and interaction verification are performed separately by the parent task. No TypeScript or markup changed, so a new TypeScript check was not required for this CSS-only work. No build, package or commit was created by this worker.

## Atlas extension

The same presentation pass subsequently extends to `src/atlas.css`. The galaxy tabs and footer reuse the original circuit strip within the recovered cyan shell; the planet index reuses the breeding panel's original navy grid. Destination tiles and landing-region rows reuse the original pet-bag navy well. Blue controls and yellow selected tabs provide the official client's familiar contrast, while the landing description remains readable in a light well. Existing planet illustrations and recovered scene pictures are retained without new scenery or changes to image fitting.

This extension changes CSS only. All destinations, galaxy filters, search, landing choices, travel actions and navigation bases retain their existing component implementation and layout. Ship, station and temple entries remain available; they are navigation destinations, rather than the omitted social player-base interface. PostCSS parsing and asset-path verification pass for `src/atlas.css`; actual atlas browser verification remains the parent task's responsibility. The adaptation does not claim exact reproduction of a historical atlas.
