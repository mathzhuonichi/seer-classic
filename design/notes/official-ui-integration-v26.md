# Official-source interface integration, revision 26

Date: 2026-10-04. This development pass implements the requested separate laboratory chambers and official visual appearance while retaining the remake's efficient mechanics. It does not produce an application build or distribution package.

## Integrated behavior and appearance

The original laboratory background remains unchanged. Fusion occupies the left rear chamber, breeding the right rear chamber, and the free item shop remains on the central wall console. Each chamber has its own bounded interaction footprint and approach point; its label occupies the original painted title plate. Floating authored equipment emblems and Dr. Pat's overhead marker are absent. Encyclopedia routes and the doctor's existing actions continue to open the corresponding laboratory function. The scene description now identifies the two chambers and the shop explicitly.

The generic header toolbar is replaced by the official client's blue bottom rail and recovered map, item, creature, encyclopedia and healing artwork. Official mission and SPT artwork provides the upper shortcuts. Settings uses an original profile glyph with a live settings caption; this is an explicit adaptation, not a recovered gear icon. The modifier remains accessible through settings. There are no social chat, player-base, advertising or unsupported commercial controls. Ship and station navigation destinations remain available.

One 960-by-650 game frame scales to its actual host dimensions. The source scene keeps its original aspect ratio within that frame; surrounding letterboxing stays outside the scene. Windows retain their existing drag, close, Escape and bounded content scrolling behavior. Their chrome, source nameplate and shared management, atlas, fusion, breeding, shop, quest and audio surfaces reuse the recovered official skins. The breeding panel specifically reuses the original branding, navy grid and metallic machine rail. The more detailed management controls and immediate/free flows retain their efficient layouts and behavior.

Combat uses the standard official `PetFightDLL.swf` skins: live portraits and health values sit inside the original mirrored HUD frames, source health fill reflects actual HP, and the lower area contains the left record, two-by-two skills and right five-command diamond. Capture opens the existing capsule selection and confirmation flow. Item and creature actions retain their existing explicit confirmations and event-driven animation locks. The record expands and scrolls through the existing complete action history. Settings sits above the command deck, clear of both HP frames. Battle countdowns and source quality/VIP controls are omitted.

A live interaction check found that the center diamond's rectangular HTML hit box intercepted neighboring commands. Its actual clickable region now uses the diamond polygon, so all five command centers reach their intended buttons. Earlier pale status/special skill backgrounds were also overridden to retain readable source-blue skill wells, and remaining-team counts retain visible contrast against the new navy HUD.

## Provenance and fidelity boundary

`public/ui/classic/manifest.json` identifies 41 PNG selections and four static SVG alternatives from the official UI, breeding and standard battle libraries. The delivered directory is approximately 848 KiB. `tools/assets/export_classic_ui.py` reproduces the selected source display lists and crops without executing ActionScript. The source worker independently replayed all 41 PNGs; the final manifest hashes were checked again during integration. See `official-ui-source-v26.md` for exact source identities, extraction, original skill positioning and limitations.

The reused machinery, skins, icons and battle arrangement are source-derived. Detailed remake panels still have their efficient layouts, live typography and additional numerical information. This pass therefore aligns the appearance using official material; it is not a pixel-exact certification of every window in one historical release. Current official scene/library artwork can include later retained revisions. No new scene images, gameplay probability formula, acquisition rule, economy restriction or battle countdown was added.

## Verification actually performed

- TypeScript passed with `node node_modules/typescript/bin/tsc --noEmit`; `git diff --check` passed.
- PostCSS parsed ten affected stylesheets; all 33 official-skin URL references exist. All 41 delivered PNG hashes match their provenance manifest.
- The existing focused collection/shop controller verification passed: 1,483 directed ancestry closures, all ordinary zero-stock products, 1,196 known essence/bead products, free transactions, persistence and unchanged-state rejection cases. The test uses isolated in-memory storage.
- A dedicated developer origin at port 1441 hosted visible fixtures whose controller writes to the normal save key were disabled. The fixture initially held the original starters and two first-generation Lv50 breeding parents. User origins were not reset, imported or modified with test grants.
- Both chamber buttons opened their separate functions. Selecting the eighth breeding pair scrolled the left index to its bottom. The wide list measured 362 pixels of visible height against 597 pixels of content, with scroll position 235.5; the 738-pixel frame measured 196 against 597, with scroll position 401. The detail area remained independently scrollable.
- Selecting the eligible breeding pair and confirming produced a Lv1 Shike, retained the selected parents, raised the monster count from five to six, and kept coins at zero. The immediate/free flow remained functional inside the new skin.
- The shop exposed ordinary capsules at zero stock. Buying ten ordinary capsules changed the visible stock from zero to ten with zero coins. All five categories remained available.
- The atlas opened and traveled to Klose Grassland. Creature management, encyclopedia, inventory, quests, SPT, recovery and settings all opened and closed within the 738-pixel game frame. Source images reported no broken resources.
- A real wild encounter used the displayed entry scene as its battle background. A status-skill turn changed PP from 40 to 39, raised defense by one and displayed actual HP 19/21. Measured fill width agreed with 19/21; the opposing full-health fill occupied its entire track.
- The capture shortcut opened capsules without consuming one. Explicit confirmation consumed exactly one capsule, from ten to nine; the actual failed-capture result and subsequent enemy attack appeared in the record. A separate creature selection and confirmation switched to Yiyou and updated both the original HUD portrait and active battle creature.
- Expanded history contained 13 lines, with 277 pixels visible against 496 pixels of content. The five command-center hit tests each resolved to their own button in wide and 738-pixel frames. Withdrawal returned to the scene.
- Narrow combat displayed two approximately 140-pixel skill columns, contained the source command cluster and reported no broken images. Developer origins 1425 and 1440 returned HTTP 200. The user preview was inspected read-only after integration.

Screenshots and visible fixture observations are retained under ignored `artifacts/ui-v26/`, including `lab-final.png`, `user-preview.png`, `breeding-success.png`, `breeding-narrow.png`, `fusion.png`, `shop.png`, `atlas.png`, `monsters.png`, `battle-capture.png`, `battle.png`, `battle-narrow.png` and `window-smoke.json`. These establish the listed representative flows and layouts, not a full campaign playthrough or exhaustive screenshot equality for all catalog content.

## Work allocation and handoff

The root integrated shell, shared window and battle presentation, corrected actual hit regions, and performed developer-browser checks. Three GPT-6.1 Sol workers at medium reasoning effort handled official asset extraction, laboratory geometry and management/atlas styling. All worker changes were integrated in the shared checkout; their English handoffs are `official-ui-source-v26.md`, `laboratory-slots-v26.md` and `management-ui-v26.md`.

Existing unrelated dirty changes, saved user progress and historical releases were preserved. Only the dedicated verification preview is stopped at cleanup; the independently running development services remain available. No production build, package, commit or publication was performed.
