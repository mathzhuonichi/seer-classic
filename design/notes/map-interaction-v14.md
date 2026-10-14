# Map interaction and simplified acquisition delivery

The user's current priority is direct interaction, broad movement, readable scene connections, and simple acquisition of a base form that supplies its evolution family. This revision supersedes the version-13 terrain restriction and the earlier proposal to reproduce complex historical recruitment tasks.

## Movement and roaming

Every scene accepts map clicks across a uniform plane from 1% to 99% on both axes, covering 96.04% of the image. Source road masks remain references for initial artwork placement; they no longer block player clicks or constrain creatures to a small floor rectangle. The complete player image remains visible at the frame edge. Informational location badges and transparent creature portrait padding pass ground clicks through, while visible creatures and their labels remain interactive.

Wild creatures select independent short meanders, broad excursions and occasional returns, from their current position. Straight and curved trajectories, speed variation, staggered initial offsets and unequal rests replace repeated tiny routes around a fixed home. Full portrait hosts stay inside the scene frame. Clicking a creature pauses that instance while the player approaches it; other creatures continue roaming. Existing windows, dialogue and battles retain their pause behavior. Player travel time follows actual screen distance, so a long crossing does not compress into a one-second slide.

## Scene connections and arrow presentation

The renderer consumes `getSceneExits` instead of treating the preceding region as left and the next region as right. It uses recovered doorway positions and arrival points where available, with explicit authored links preserving access elsewhere. Klose grassland to swamp and swamp to forest point left; reciprocal exits point right. Rabol to its secret area points left, with the return on the right. See `scene-exits-v14.md` for 76 recovered directed routes, 64 authored routes and source boundaries.

Only a glowing directional arrow is visible at rest. Its destination appears on hover or keyboard focus. There is no resting panel, border or background. The arrow layer is 3, below creature/NPC layer 6 and player layer 8, and above the map image. Captions near the bottom appear above their arrow to remain readable.

## Acquisition and player animation

YiYi, species 83, now appears in Klose forest as an ordinary capsule encounter. Four additional source-supported base forms appear on their corresponding maps: Kaka on Cecilia's surface, Dingge on Beta wasteland, Bogu in Byron's mysterious space, and the small luminous bee in Cloud's high layer. Their existing level evolutions supply the subsequent forms. Equipment gates, timed captures and historical collection tasks are simplified into visible encounters. Scene levels are remake balance choices. Sources and the complete family coverage audit are in `dex-acquisition-review-v14.md`.

The encyclopedia presents evolution families, specific implemented acquisition routes and explicit missing-family/branch status. It no longer advertises an arbitrary remote encounter as a normal route. The two requested NPC family exclusions apply to the whole Incaros and Saggros lines, while the modifier remains available. Original infant essence bindings, three omitted manual evolutions, and evolved-form collection registration are corrected in the acquisition delivery.

The player uses original twelve-frame walking cycles in all eight directions, with the complete original waist and foot assemblies. The gait returns to the original standing cell on arrival. See `robot-walking-v14.md` for reconstruction, original matrices, the 104 rendered cells and source-frame validation.

## Integrated verification

The parent task used an isolated development origin at port 1426. A map click at approximately `(92%,18%)` reached that point above the previous terrain restriction. The live robot exposed `classicRobotWalk` with a nonzero strip offset during movement and returned to the zero-offset standing cell at rest. Source contact sheets were visually inspected for alternating feet in all eight directions. Independent roam samples showed broad changes in both coordinates and a mixture of straight and curved routes.

The arrow's background is transparent, its border is zero, its caption is hidden at rest and visible on hover, and its layer is below wildlife. Actual arrow clicks traversed Klose grassland to swamp to forest with the expected directions and distinct backgrounds. Forest inspection showed six independently selectable YiYi instances alongside the mushroom boss. Clicking a visible moving YiYi paused only that instance and opened its normal dialogue; the challenge displayed the battle loading screen. An existing invincible capsule in the isolated QA save completed capture, consumed one capsule, returned to the forest, and showed YiYi as collected in the encyclopedia. The evolved YiKalaiEn entry showed its basic-form capture plus level-17/35 evolution route; its button traveled to the forest without spawning a remote evolved-form opponent. The acquisition audit separately exercised all 33 mapped captures and the four added capture/evolution/collection/reload chains.

Screenshots and UI samples remain ignored under `artifacts/map-interaction-v14/`. Three new GPT-6.1-sol agents at high reasoning effort handled route recovery, acquisition review and original robot walking reconstruction. The parent integrated the map, appearance and route callbacks. No production build, native package or broad historical suite was run. Acquisition coverage remains incomplete; the family audit documents the complete remaining list.
