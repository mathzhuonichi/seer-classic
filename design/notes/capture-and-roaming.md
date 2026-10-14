# Capture, roaming and preview availability

Version 0.3.1 addresses four follow-up reports: absent ordinary-wild capture, unclassified battle supplies, stationary scene creatures, and unavailable images that prevented entry into Rios combat. This source revision remains in development mode and does not replace the previous native package.

## Delivered behavior

The recovered engine already had capsule probabilities and a capture result. The game adapter now exposes that action, plays the actual capture outcome, consumes the selected capsule, and transfers the spawned creature's identity, level, individual value, nature, skills, PP and remaining HP into the save. New partners join the party when it has a free slot and otherwise enter storage. Capture does not grant knockout coins or experience. Ordinary knockout victories no longer automatically recruit an uncaptured species. Remote recruitment and complex acquisition retain their existing essence/task routes; all boss and recruitment encounters reject capsule capture without consuming it.

The battle item panel has three categories: HP/PP recovery, capsules, and status removal. Each keeps the selection/target/confirmation flow. The recovered catalogue supplies 12 recovery items and seven capsules but no status-removal consumables. This patch introduces an explicitly authored `item_status_cure` supply that removes status conditions without clearing stat stages. New saves receive five; existing saves missing this item record receive five once. It is not claimed to be an original Seer item record.

Ordinary map creatures follow short local routes with stride and footfall feedback. Direction changes use left/right mirroring and front/back perspective changes of the retained original 2D portrait. These are simulated directional poses, not newly recovered original rear/side artwork. Clicking freezes the selected creature and walks the player to its current visible anchor. Scene overlays, combat and hidden documents pause the routes. Region changes reset them, and bosses remain anchored.

## Asset failure and development process

At diagnosis, no process listened on port 1421 and requests for an original portrait and the game logo returned connection failure. The previous turn-scoped Vite process had stopped while the loaded page remained open, leaving subsequent asset requests unavailable. No source portrait file was missing for the reported species.

The live development server now runs independently under launchd label `local.chizhuoni.seer-classic-dev`, bound to `127.0.0.1:1421`, with project logs in the ignored `.cache/` directory. This keeps it available when a Codex turn ends; it is a local development process rather than a packaged application or a scheduled task. To stop it, run `launchctl remove local.chizhuoni.seer-classic-dev`. A foreground replacement can then be started with `npm run dev:preview`.

The actual workstation command used to start the independent process was:

```sh
launchctl submit -l local.chizhuoni.seer-classic-dev \
  -o /Users/chizhuoni/Codex/seer-classic/.cache/dev-preview.log \
  -e /Users/chizhuoni/Codex/seer-classic/.cache/dev-preview-error.log \
  -- /opt/homebrew/bin/node \
  /Users/chizhuoni/Codex/seer-classic/node_modules/vite/bin/vite.js \
  /Users/chizhuoni/Codex/seer-classic --host 127.0.0.1 --port 1421 --strictPort
```

## Verification

`tools/verification/capture-v3.ts` passed with the recovered catalogue and real game controller: the three category counts, actual capture and capsule decrement, level/HP transfer, save roundtrip, storage placement with a full party, boss rejection without item consumption, ordinary knockout without recruitment, failed-capture consumption persisted immediately, and removal of poison actually applied by the battle engine. Failure and status tests use isolated deterministic catalogue fixtures. No player save was replaced.

An isolated full-interface playthrough traveled to Cloud Planet, interacted with Mao Mao, entered combat, selected the capsule category and master capsule, confirmed capture, returned to the scene and found the level-3 partner in the party. Reloading preserved it. Rios then loaded normally into combat; the boss capsule tab displayed the acquisition explanation and a disabled capture button. The displayed three categories included the usable status-removal supply. `artifacts/presentation-v4/capsule-panel.png` records the complete battle/capture panel.

Supported in-app browser sampling observed all four directional states and changing route positions. The creature window held both routes fixed; clicking Mobi paused that target while Mao Mao kept walking. Combat held the hidden routes fixed, and an exit to the upper Cloud Planet region mounted its new creature with a reset route. No visible image was broken in that region. Samples are saved in `artifacts/presentation-v4/roaming-ui-check.json`.

TypeScript checking passed on the integrated source.

After the server fix, the reported Mao Mao, Mobi and Rios image resources, all seven map backgrounds and the logo returned HTTP 200 with image content types. The real interface also decoded and displayed the reported portraits. These checks concern availability and interaction; they do not create higher-resolution raster detail or certify every encounter.
