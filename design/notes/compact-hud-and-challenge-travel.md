# Compact HUD and challenge travel

The main game frame now gives more space to the scene and creature silhouettes. The eight existing tools share one 42-pixel header with the optional modifier. The logo and resource counters are removed from that header; coins and accumulated experience appear in the inventory window.

## Battle presentation

At the final verified 772 × 886 viewport, each normal battle information panel is approximately 71 pixels high. The compact name row contains attribute icons and level. A red HP fill sits on a blue track, with white, dark-outlined numeric HP inside the bar. The separate HP line and combatant-role labels are removed. Attribute icons expose Chinese descriptions through native hover titles and accessible labels.

The party indicators display only the remaining/total counts. Hovering or focusing either count opens a bounded overlay containing that team's portraits, levels, HP, active creature and fainted state. The overlays do not increase the health panel's height. Rosters and counts continue to use presentation frames, preserving the previous animation-order behavior.

Battle creature silhouettes occupy a centered region below the panels. Living idle combatants receive a subtle breathing animation, paused throughout attack sequences and for immobilizing states. A shared, uniformly scaled breathing wrapper also covers world creatures, dialogues, loading art, management cards and previews. Walking creatures retain their existing stride rather than combining it with the idle animation. Reduced-motion preferences disable these idle effects.

## Travel and loading

The challenge archive's primary action requests travel instead of dispatching a battle. Arrival selects the corresponding scene opponent and opens its dialogue. The scene's challenge command then enters the shared battle-loading path.

All 162 original encounter location strings are retained in the encounter view. Existing explicit encounter IDs take precedence over location text. Sixteen encounters use those explicit world placements. Five Rei training encounters resolve from their catalog location, `赫尔卡星 雷伊特训（湖边）`, to the added Helka training-lake region. Only the selected training encounter appears there. Its name comes from the catalog; its scenery reuses the locally authored Helka backdrop and its layout is an authored remake, rather than recovered original lake art.

The remaining 141 encounters use four authored ship rendezvous regions for tower, dark-arena, task and other challenges. These are playable staging areas, not claims that the original encounter habitats have been reconstructed. The archive shows the landing destination before travel. Adding missing planets and their original encounter placements remains future map work.

The shared loader paints a connection phase before preparing resources. It loads and decodes the current planet background and both teams' portrait resources, then shows deployment and completion phases. A cached-resource transition lasts at least approximately 1.2 seconds, plus rendering and decode time, so the progress screen remains perceptible. Wild encounters and scene challenges use the same wrapper. No new battle engine or save format was introduced.

## Verification

- TypeScript completed without errors. Diff whitespace checks passed.
- The focused challenge-navigation runner checked all 162 retained location strings, valid destinations, interactable selected opponents, representative explicit routes, all five training-lake routes, staging categories, absent-planet fallback and explicit-ID precedence. It reported 21 map destinations and 141 staged encounters.
- An isolated port-1425 browser preview demonstrated challenge-archive travel to Helka before combat, a visible initial loading screen and the completed Rei battle. The live header measured approximately 42 pixels and the normal health panels approximately 71 pixels. Rei's complete silhouette remained below the HUD. Party details opened and closed without resizing the panels; both idle combatants had running breathing animations.
- The same isolated preview demonstrated Nadorei's rendezvous arrival with its dialogue and no battle or loading screen yet. Inventory resources and a world creature's shared idle animation were observed in the live DOM.
- Screenshots and DOM snapshots are stored outside tracked source under `artifacts/hud-v8/`. The user's port-1424 browser save was not used for test battles.

The work used three GPT-6.1-sol high subagents for battle presentation, shared idle art and world travel. The main agent integrated the shell, inventory resource placement and loader, and performed browser verification. No legacy large suite, production frontend build or native package was run.

Run the focused route verification from the project root with `npx tsx tools/verification/challenge-navigation.ts`. This is a navigation and catalog check, not certification of battle mechanics or original map fidelity.
