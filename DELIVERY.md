# Playable game delivery

## Current patch: 0.3.2 classic navigation and presentation

Boss combat omits capsules, battle portraits no longer repeat the health-panel names, and the cylindrical capsule arrives before drawing in the creature. The actual outcome is shown after closure/shaking; combat settlement toasts no longer announce it early. Creature turns use immediate mirroring, with randomized bounded routes. The player uses eight recovered original Seer direction composites, and captain/scientist art follows official NPC equipment records.

The scene-window atlas supports Pano, Kalan and Rogue, with 13 destinations and 39 landing regions. Representative real-interface checks landed in each galaxy, observed non-flattening turns and narrow-window bounds, and measured capture arrival/draw-in/outcome checkpoints. Original vector composites and integrated TypeScript checks passed. Additional planet scenery remains explicitly authored theme reuse. Full evidence and scope are in `design/notes/classic-navigation-and-presentation.md`. No packaging was performed.

## Earlier patch: 0.3.1 capture and roaming

Ordinary wild encounters now expose the seven recovered capsules and transfer an actually captured creature into the party or storage with its encounter level, individual value, nature, HP and skills. Battle items have HP/PP recovery, capsules, and status-removal categories. A simple authored status-cure supply fills a gap in the recovered item catalogue; it is not represented as an original item record. Scene creatures roam bounded routes and pause for interactions. The reported missing portraits/backgrounds/logo were reproduced as an unavailable port-1421 server; that server now runs as an independent local launchd job rather than a turn-scoped process.

A full isolated-interface capture of Mao Mao, save reload, all three categories and Rios battle loading were checked. Focused controller checks passed capture success/failure consumption, party/storage placement, boss restrictions, ordinary KO without automatic recruitment, and actual poison removal. Roaming uses original 2D portraits with projected directional poses, not four newly recovered original views. No packaging was performed. Details and evidence are in `design/notes/capture-and-roaming.md`.

## Earlier delivery: 0.3 development preview

The current source game is served by `npm run dev:preview` at `http://127.0.0.1:1421/`. No production frontend bundle, native package, application launch or release replacement was performed for this revision, following the user's explicit development-only request. Version identifiers are 0.3.0; the older packaged application remains historical.

The scene now fills one bounded game frame. Map, creatures, items, dex, missions, SPT, recovery and settings remain visible and open draggable windows. Selection and confirmation replace immediate management actions; battles load their actual portrait resources and preserve the exploration scene on return. All 1,483 species expose their base stats. Six learning values are editable in the ordinary creature window with explicit saving and recalculated attributes. All 143 original vector viewports were calibrated against their own rendered alpha; Rei now renders completely. Critical hits use the actual engine outcome for their label, stronger impact and damage popup. The replacement-phase retreat bug is fixed, and retreat does not award encounter rewards.

TypeScript checking and the two focused v3 regression programs passed. A real-interface playthrough used the captain's dialogue, opened SPT, defeated Mushroom Monster, returned to the same ship scene, hatched the essence, claimed Pipi and observed both creatures in the party. Separate interface checks saved and restored learning values, rejected an over-budget draft, replaced a learned skill, applied a raising item to its selected target, and retreated after an active creature fainted. An ordinary critical hit was shown using the real catalog/controller and Battle component with an isolated deterministic save. These are representative integrated checks; they do not claim that every encounter was played.

All three contributing subagents used GPT-6.1-sol with high reasoning effort. Their asset, management/world, and battle work is integrated. The requirement-by-requirement audit, evidence paths and remaining agreed content boundaries are recorded in `design/notes/experience-v3.md`.

## Historical desktop release: 0.2

The current desktop build incorporates the feedback recorded in `design/notes/experience-v2.md`. All three contributing agents used GPT-6.1-sol with high reasoning effort.

This release adds seven interactive destinations and 21 locations, walking, local creature interactions, SPT entry points, recovery and missions. Unplaced catalog species remain actionable through recruitment commissions, and mapped boss species open their actual destination. Creature management separates party and storage; item management separates essence, combat supplies, raising items, and retained capsules.

Classic battle, item, creature, and escape panels now sit below the battlefield and central dialogue. Physical, special, status, and hit modules play in the engine's event order with staged HP changes; enemy art is mirrored. The presentation does not rerun combat or change its formulas. Original official vectors replace 143 low-resolution portraits, covering all 114 original images below a 100-pixel longest edge; all 1,483 species have measured silhouette positioning and evolution-stage scaling.

The production-interface check entered Mushroom Monster's location from the map and defeated it in three physical-attack turns. During move playback, the physical motion module was present and all command buttons were locked; after playback, commands reopened and HP reflected the actual event result. The four command panels, categorized raising items, party management, and result return path were checked. The battle agent additionally verified status and special-attack playback; the exploration agent verified walking, region selection, boss interaction, and the unplaced-species recruitment route. The asset agent verified original vector provenance and visible, uncropped rendering.

`npm run package` passed and produced a 33.21 MiB macOS app at version 0.2.0. The copied release application launched successfully from `releases/Seer Classic.app`; its map and original starter vectors rendered in the native webview. Screenshots are retained under `artifacts/presentation-v2/`, including `production-battle.png`, `physical-action.png`, `native-map.jpeg`, and `native-monsters.jpeg`. The remaining 1,340 portraits retain their original raster resolution limits. Map scenery is authored for this remake, and the classic battle layout follows the official guide's command structure rather than a pixel-exact comparison with its unavailable historical screenshot.

## First delivery: 0.1

The original Claude project has been recovered into this independent local repository. Three GPT-6.1-sol agents completed the catalog and assets, game integration, and interface work; their changes are merged into the playable desktop build.

## Delivered behavior

- Chinese single-player interface for the party, creature raising, challenges, collection, inventory, and saves.
- Optional in-game modifier for level, numeric potential, learning values, nature, trait, collection, and resources.
- Offline catalog of 1,483 species, 5,325 skills, 162 encounters, and 1,483 original official portraits.
- Bosses available at any time; first-clear essence rewards hatch immediately. Ordinary recruitment challenges and explicit quest rewards replace complicated acquisition routes.
- Forty-five working classic traits. Fifth skills, soul marks, and engravings have extension interfaces and save fields ready for subsequent data work.

## Delivery checks

`npm run build` passed TypeScript checking and the production frontend build. `npm run package` produced an Apple Silicon macOS application, signed locally, with a bundle size of 31.85 MiB.

A manual production-interface playthrough modified a starter to level 35, set potential to 31 and learning values to 255 attack plus 255 special attack, evolved it from Bubu Seed through Bubu Grass to Bubu Flower, defeated the level-15 Mushroom Monster using the recovered battle engine, received its essence, and hatched a level-1 Mushroom Monster. Reloading preserved the evolved creature, four-member party, rewards, and quest progress. Separate controller checks covered recruitment, quest claims, save roundtrips, and first-clear reward behavior. Representative trait checks exercised the actual battle hooks.

The packaged application launched successfully at `tauri://localhost`, displaying its Chinese home screen and the three original starter portraits. Its save export created the actual `赛尔号-星际存档.json` file in Downloads. The native home screenshot is retained at `artifacts/native-home.jpeg`.

These checks exercise the integrated result. The earlier large source test suites were not rerun, and the 162 encounters were not all individually completed.

## Remaining content at the first delivery

The original probability mapping for the critical-rate traits Hui Xin and Mian Bao remains missing, and Luan Wu requires multi-target combat. Their three original records are preserved but are not offered as usable traits. Fifth-skill, soul-mark, and engraving datasets remain empty as agreed. Tower floor 69 uses the explicitly documented substitute in README because the recovered source team was empty.

Future work should expand gameplay and fill these concrete content gaps in the existing modules, starting from this working build.
