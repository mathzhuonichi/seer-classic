# Handoff, 2026-10-18 (second session): wave 2 merged, wave 3 next

Continue on branch `claude/refactor`. The target design is still [architecture-v2.md](architecture-v2.md), which the user approved; [ARCHITECTURE.md](../../ARCHITECTURE.md) describes the code as it is. The previous handoff is [handoff-2026-10-18-wave2.md](handoff-2026-10-18-wave2.md).

## State at the end of this session

- **Head:** `3922a74` is the last code commit, with every wave-2 unit merged; this handoff and the changelog entry follow it. The merge commits since `88cad12` are listed by `git log --first-parent 88cad12..HEAD`.
- **Checks at the head:**
  - typecheck clean, `npm test` 92/92, build passes;
  - `npm run verify` 64/64 gate suites, in 2 min 24 s with the default jobs; the base had 57;
  - the architecture gate lists no import violations and 39 oversized files.
- **Status counts:** 5 suites stay `known-failure` (`elite-recovery-v49`, `holder-ownership-v47` and `potion-ai-v48` are the search-AI weaknesses, plus `capture-v3` and `evolution-specials`), 1 is `stale` (`solo-challenges`) and 2 are `historical`.
- **Size:**
  - production code (src, battle and raising without tests): 1,958,004 bytes when Step 0 began (`128c7fd`), 1,977,635 at the wave-2 base (`88cad12`), 1,958,568 now;
  - data and tools went from 16.15 MB to 12.42 MB, mostly through the deletion of `data/gamedata.json`.

## What landed

**Step 0** (coordinator), up to `88cad12`:
- `useGame(c, select)` and structural sharing of snapshot slices;
- the feature registry: `kernel/features.ts` plus one `feature.ts` per feature, with a compile-time completeness check;
- `DispatchResult.created`;
- the screens moved onto `useGame`;
- `ARCHITECTURE.md` rewritten, with `INTEGRATION.md` folded into it.

**Wave 2 and unit E**, in merge order:
- **D** (challenges, world, app):
  - the tower position and floor count, campaign rewards, category ids and one quest-claim rule move into the challenges slice;
  - the world screens are narrowed;
  - one reduced-motion helper;
  - boss evidence and the shared encounter rows move to `domain/challenges` and `shared/ui`;
  - a shell state hook.
- **C2** (items, engravings):
  - `EngravingView` gains `equipMode`, `transferFrom`, `owned` and `canBuy`, and there is an `engravingStock` slice;
  - `ItemView` gains `useAction` and `useTargets`;
  - item and engraving feedback comes from the dispatch result.
- **C1** (collection, raising):
  - acquisition views are built from the game's catalog, and the import-time getters and `bundledCatalog` are deleted;
  - dex, fusion and breeding rows are in the slice;
  - monster rows carry boosts;
  - monster display helpers live in `shared`, and action sounds in the app.
- **E3** (distribution): the packers list the docs, `DELIVERY.md` is folded into `CHANGELOG.md`, the stale `SOURCE-MANIFEST.json` is deleted, and `--revision` is required.
- **E2:** `data/gamedata.json` is deleted; suites and generators load the per-file data.
- **E4b** (follow-ups): alias re-exports, one source each for the journey species and the regular-boss filter, action sounds from the dispatch result, the arrow keys no longer walk the map behind the modifier, dead CSS deleted, and fusion recipes moved to `data/fusion.json`.
- **B** (battle):
  - `battle/ai` is split out, and the kernel injects the policy;
  - `BattleEvent` is a union of 48 events;
  - `battle.prepare` decides at turn open, in an idle slot, guarded by the `battle-prepare-replay`, `battle-ai-latency` and `battle-turn-latency` gates;
  - tower, campaign, facility and training starts and settlement go through `startSession` and per-session hooks in challenges and world.
- **E1** (suites): `game-v3`, `acquisition-limits-controller`, `collection-shop-v25` and a seeded `paid-spt-controller` are fixed and gated; `battle-capsule-click` (a source-reading suite) is deleted; `game-display-v43` gets a pure seam; a harness sweep.
- **E4a** (dispatch budget):
  - monster rows, quest rows, campaign stages and recipe pairs are rebuilt only when their inputs change, and engraving holders come from one ledger per pass;
  - the snapshot keeps its identity when nothing changed;
  - on a 200-monster save, p95 fell from 7.5 ms to under 2 ms of thread CPU time, and `controller-snapshots` gates that save as well as a new journey;
  - a 600-monster save still measures 5.5–6 ms (see Performance).

## Rules for the next session

- **Load.** The user allows up to 8 agents at once while the machine is idle. Load stayed at 3–10 with 6 agents plus a coordinator verify.
  - Workers run `nice -n 10` and `run.mjs --jobs 2`.
  - Only the coordinator runs `npm run verify`, `battle-clone-fidelity-v58` and `battle-ai-liveness`. Run the full verify with `--jobs 3` while workers are busy.
- **Worktrees:**
  - A workflow worktree may start from the wrong commit. Pass every worker the **full** base sha: an abbreviated sha was mistyped once in this session.
  - Workers run `git reset --hard <sha>`, link `node_modules` with a relative symlink (now ignored), and end with `git branch -f wave2/<unit> HEAD` so the coordinator can merge.
  - The git-ignored map art and animations are missing in worktrees, so five gate suites fail there: `challenge-navigation`, `station-navigation-v53`, `puni-location-v38`, `graphical-atlas` and `habitat-regions`. They pass in the main checkout. Workers either symlink the ignored assets or confirm the failure at the base.
- **Never answer a running workflow agent with SendMessage:** it resumes a duplicate copy that edits the same checkout. Fix the blocker yourself, or relaunch.
- **No localhost in workers.** Use Vite `ssrLoadModule` in-process.
- **Merge one unit at a time.** After each merge:
  - regenerate the baseline and check that it only shrinks;
  - run typecheck and test;
  - run the full verify after every one or two merges.

## Open work (wave 3)

**First: the visual playtest.** No screenshot or browser playtest has been taken since the refactor began; it was the first item of the previous handoff too. Check in the real app:
- the narrowed screens update when their data changes: shop stock, engraving stock, quests, the tower and the world map after a battle;
- battle feedback and turn preparation: decisions are ready when the player clicks, and nothing changes in the replays;
- the CSS that B2 and D deleted (`battle.css`, `app.css`) did not remove visible styling;
- the arrow keys behind the modifier.

Use the Tauri build or the dev server from the coordinator. The WebKit idle fallback (`requestAnimationFrame` then `setTimeout`, used when `requestIdleCallback` is missing) is untested in a real browser.

**Code follow-ups** reported by the units, not yet done:
- `battle-hud.ts` still reads `ItemView.usableTargetUids`. Switch it to `useTargets`, then delete `usableTargetUids`.
- `features/world/training.ts` still takes `NPC_ONLY_SPECIES` through the `domain/acquisition/acquisition.ts` re-export. Import it from `acquisition-model.ts`, then delete the re-export.
- `domain/catalog/enrichment.ts` uses the `RecruitmentCatalog` alias. Switch to `AcquisitionCatalog` and delete the alias.
- `kernel/game.ts` re-exports `loadCatalog` for suites, which breaks AGENTS rule 4. Point the importers at `domain/catalog/catalog.ts`.
- `battle/core/src/types.ts` defines its own `StatKey`, duplicating `raising/core`. The script contexts are `ctx: any`, so script-emitted events are not type-checked against the `BattleEvent` union.
- **Battle styling and presentation:**
  - The battle-only evidence rules in `shared/ui/boss-evidence.css` belong in `battle.css`.
  - The tower and campaign backdrop helpers in `features/battle/battle-backdrop.ts` belong with challenges or the app.
- The capture rule is stated twice with different texts: `battle-actions` capture and `battle-view` `captureBlockedReason`.
- The `Number.isSafeInteger` guard in `buyItem` is unreachable.

**Tests:**
- **Lost with `battle-capsule-click`:** these behaviours have no check now. Give them a pure seam and a test:
  - the capture frames (success, and a failure that does not end the battle);
  - the `canAct` guard (busy, finished);
  - the double-submit lock in `use-battle-playback.ts`.
- **Second suite sweep** (the battle suites unit B owned):
  - drop the `SeededRng` alias, which 9 suites still import;
  - harness the battle suites;
  - triage `capture-v3`, `evolution-specials` (it reads `gamedata.json` from a fixed Git revision), `solo-challenges` and the two historical suites.
  - The three search-AI known-failures stay until the AI is improved (handoff item 2).

**Performance** at large saves (E4a's measurements):
- `raising/core` copies the whole save with `structuredClone` on each raising operation: 0.75 ms p95 at 200 monsters, 2.2 ms at 600.
- `writeJourney` serializes the whole save on every dispatch: 0.6 ms at 600.
- `recruitmentProgress` rebuilds its sets on every call: a quest rebuild costs about 1.2 ms at 200 monsters.

**Product gaps and decisions for the user:**
- **No difficulty-curve check.** A new player starts with Lv 5 starters and 1000 coins; facility opponents are full Lv 100 parties. Decide what "can progress" means first.
- Simulated PvP has no ladder.
- `download_original_maps.py` does not fetch the 27 habitat-region `originalMapId`s, which use their parent's art.
- `MonsterInput` cannot carry permanent conditions: an engine decision.
- **Known UI quirks kept on purpose:**
  - the EngravingShop filter persists across a monster switch;
  - the PetBag picker tab has no fallback;
  - 移装至 and 移装到 are both used;
  - Raising tab drafts reset on a tab switch.

**Cleanup:** the agent worktrees of waves 1 and 2 under `.claude/worktrees/` are merged. Remove them with `git worktree remove` once you have checked `git branch --no-merged claude/refactor`.
