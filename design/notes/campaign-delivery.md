# Challenge campaigns and interface delivery

The SPT archive now sorts by the displayed opponent's numeric species ID, including the seven long campaign entries. The entries show their species numbers so the ordering is visible. Individual campaign stages are grouped under their parent campaign rather than exposed as independent encounters that bypass prerequisites.

## Interface

Original attribute button artwork was extracted from the official UI SWF and replaces the previous authored SVG symbols. Health panels and skill cards share these assets. Chinese explanations appear immediately in a custom tooltip above the icon, with a fixed-position portal so skill-card clipping cannot hide it. The help cursor and delayed native title are removed. Keyboard focus receives the same explanation. `public/type-icons/README.md` and its manifest retain the extraction details and hashes.

Idle animation periods were divided by 1.5, increasing their frequency by 50 percent without increasing deformation. The global bottom status row is removed. Battle records expand the existing middle dialogue strip into a bounded scrolling area. A persistent upper-right collapse control sits outside its scroll body; no modal history window is created.

## Campaigns and runtime

Seven dedicated scene routes provide 30 ordered stages: Xuanwu, Qinglong, Baihu, Zhuque, Qilin, Rei skill training and Puni seals/body. Seventeen new encounter records add the five divine-beast bodies and their guardians, avatars and wheels. Existing Rei and Puni records are retained with focused source corrections. The archive contains 156 parent entries backed by 179 encounter records.

Within each guardian or avatar chain, the engine carries the player's team, HP, PP and statuses across successive opponents. Puni's six lives and Qilin's six named lives plus final revival remain single encounters. Enemy-member rules, types and once-only phases now belong to each member; they do not leak into subsequent members. Event playback retains the actual avatar types. The missing campaign scripts supply damage filters, retaliation, regeneration, restricted moves and revival hooks.

Completed stages persist in the existing save's optional game metadata. Later stages remain unavailable until their predecessor is completed. Rei training selects the player's qualified Rei from the party without changing the saved party order. Victories teach the documented skill, rather than awarding an essence. Only final body victories award the campaign essence, once. Restarting a campaign clears stage progress while preserving already learned skills and collected rewards.

Conditional learnset records with a null level no longer count as ordinary level-up skills when creating a monster. Existing learned skills remain in imported saves. This corrects the previous JavaScript null-comparison behavior that could grant special training skills without training.

The shared resource-loading screen remains between the campaign scene and combat. Returning from combat reveals the same campaign scene and its updated progress. Original source rules and numeric/variant limitations are recorded in `classic-challenge-campaign-sources.md`; authored scenery and calibrated guardian statistics are not claimed to be recovered original implementations.

## Checks

- TypeScript and diff whitespace checks passed.
- `tools/verification/campaign-mechanics.ts` checks 14 groups covering local rules/phases, uninterrupted opponent teams, retaliation, reward predicates, avatar types, revive PP, Qilin damage categories and initialization of all 17 new encounters without missing script warnings. These focused fixtures verify engine behavior, not every historical number.
- `tools/verification/campaign-progression.ts` checks all seven campaigns and 30 stage references, sequence and entry restrictions, automatic Rei-only selection, conditional learning, skill rewards, absence of premature training essences, save reload and explicit restart. Its one-HP training opponent is a deterministic adapter fixture, not a full-difficulty boss clear.
- The updated navigation runner checks all 179 catalog encounter destinations while retaining the representative original location assertions. Campaign stages use their dedicated scene routes at the interface layer.

Browser verification uses an isolated port-1425 origin and records evidence under ignored `artifacts/campaign-v9/`. The user's port-1424 game save is not used for test battles. No legacy large suite, production frontend build or native package is run.

The live archive displayed ascending species IDs, including an earlier higher-level encounter before a later lower-level one. The Xuanwu scene showed the original body portrait and its six ordered guardian opponents; selecting the locked body displayed its prerequisite and disabled start. The guardian start displayed the location-specific loading screen before combat with all six opponents.

Actual pointer movement over the original health-panel icon produced the Chinese attribute tooltip repeatedly, with a default cursor and no native title. Both skill-card attribute markers used the original assets. Battle idle periods measured 2.53333 seconds. The bottom status row was absent.

A real first Rei training battle used a level-100 Rei prepared through the optional modifier in the isolated save, without reducing the opponent's normal 1,000 HP. After equipping White Blade through the creature manager, four turns defeated Rios. The result explicitly taught Aurora Blade; the creature's learned-skill list contained it, the saved party still contained all four test creatures, and the campaign returned at 1/5 with Tiyas unlocked. Withdrawal before equipping the required move returned to the same campaign without advancing it.

The post-victory record body contained 471 pixels of content in a 165-pixel scroll area and used static in-flow positioning. The corner collapse control displayed only `×`, remained enabled, and passed a DOM hit-target check. Clicking it collapsed the record. No dialog was present in the expanded record. These browser checks cover representative flows; the entire high-difficulty set of 30 stages was not cleared through the browser.

Three GPT-6.1-sol high subagents handled official artwork, battle presentation/mechanics, and source-backed encounter definitions. The main agent integrated the controller, progression, rewards, archive, loading and scene navigation, corrected a campaign-portrait sizing declaration found in live review, and performed the browser checks.
