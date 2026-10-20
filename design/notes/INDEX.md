# Design notes index

Design notes are history. The current rules are in [`battle/RULES.md`](../../battle/RULES.md) and [`raising/SPEC.md`](../../raising/SPEC.md), and the code layout is in [`ARCHITECTURE.md`](../../ARCHITECTURE.md). When a note and the code disagree, the code wins. Revision numbers (`-vNN`) match [`CHANGELOG.md`](../../CHANGELOG.md).

**Active work:** [`refactor-survey-2026-10-18.md`](refactor-survey-2026-10-18.md) is the wave-1 refactor plan, [`architecture-v2.md`](architecture-v2.md) is the target architecture for wave 2, [`handoff-2026-10-20.md`](handoff-2026-10-20.md) is the current handoff (the 2026-10-19 playtest fixes), [`handoff-2026-10-19.md`](handoff-2026-10-19.md) is the previous one (waves 3 to 7 merged), [`handoff-2026-10-18-wave3.md`](handoff-2026-10-18-wave3.md) is the wave-3 plan, [`handoff-2026-10-18-wave2.md`](handoff-2026-10-18-wave2.md) is the wave-2 plan and its run, and [`handoff-2026-10-18.md`](handoff-2026-10-18.md) is the previous one.

Statuses:

| Status | Meaning |
| --- | --- |
| current | Still describes a rule, policy, data source or design in force. Read it before changing that area. |
| historical | A dated delivery, audit or investigation record. Counts and file references are a snapshot. |
| superseded by X | A later note replaced the decision or design; read X instead. |
| plan | Open work. |
| done | A plan or handoff whose work is complete. |

Add every new note to this index with a status (AGENTS.md rule 9).

## Project, process and packaging

| Note | Summary | Status |
| --- | --- | --- |
| [handoff-2026-10-20](handoff-2026-10-20.md) | The 2026-10-19 playtest fixes: console alignment, 3 s damage numbers, attackers kept in the arena, skill/性格/特性 hover cards, merged stage lines, Boss AI and SPT movesets, the type-matchup indicator, HD atlases loading again with V59/V60; open points. | current handoff |
| [handoff-2026-10-19](handoff-2026-10-19.md) | Waves 3 to 7 merged: the PvE functional audit and its fixes, the user's 2026-10-19 decisions, the Boss variant choice, 麒麟空间, no 放生 or box limit, Boss evidence for development only, original Boss HP, level, skills and team; load and review rules; open Boss rule differences. | done (superseded by handoff-2026-10-20) |
| [handoff-2026-10-18-wave3](handoff-2026-10-18-wave3.md) | Wave 2 and unit E merged: state, contracts, worker rules, open work for wave 3 (playtest first, code and test follow-ups, performance, product decisions). | done (superseded by handoff-2026-10-19) |
| [playtest-2026-10-18-wave3](playtest-2026-10-18-wave3.md) | First browser playtest since the refactor (HEAD `1ff8fac` vs base `88cad12`): no regression; 30 pre-existing findings and the wave-3 unit that took each. | historical |
| [handoff-2026-10-18-wave2](handoff-2026-10-18-wave2.md) | Wave 1 merged; Step 0 procedure, the wave-2 units and their run, follow-ups, load budget. | done (superseded by handoff-2026-10-18-wave3) |
| [architecture-v2](architecture-v2.md) | Target feature-module architecture: experience budgets, dependency rules, kernel/feature contracts, AI turn preparation. | plan (active) |
| [refactor-survey-2026-10-18](refactor-survey-2026-10-18.md) | Repository refactor survey (items A–E and a ranked plan); the source of the AGENTS.md rules. | plan (active) |
| [handoff-2026-10-18](handoff-2026-10-18.md) | Branch state, search-AI measurements, open items, and refactor progress after the move to the new machine. | historical (previous handoff; item 1 resolved, open items continue in [handoff-2026-10-18-wave2](handoff-2026-10-18-wave2.md)) |
| [codex-takeover-v31](codex-takeover-v31.md) | Codex takeover at `04d6196`: starting acquisition metrics and the decisions recorded in `approved-plan.json`. | done |
| [platform](platform.md) | 2026-10-02 platform proposal: TypeScript, React and Tauri, with Godot as runner-up. Its planned monorepo was never built. | historical |
| [mechanics](mechanics.md) | Research on pre-2013 boss rule patterns, contradictions with the rule specs, types and dual types. | current (research reference) |
| [experience-v2](experience-v2.md) | Feedback on the 0.2 desktop build and the responses (vector portraits, stage scaling, battle panels). | historical |
| [experience-v3](experience-v3.md) | 0.3 completion audit: fixed game frame, in-scene windows, base stats, editable learning values. | historical |
| [linux-playtest-package-v18](linux-playtest-package-v18.md) | Revision 18 portable Linux browser package with a Python launcher. | historical |
| [browser-playtest-package-v30](browser-playtest-package-v30.md) | Revision 30 browser playtest package and its cloud upload. | historical |
| [source-package-v30](source-package-v30.md) | Revision 30 editable source package made by `tools/distribution/pack_source.py`. | historical |

## Battle rules and calculation

| Note | Summary | Status |
| --- | --- | --- |
| [damage-formula-research](damage-formula-research.md) | Damage formula sources: the shape is supported, exact server rounding is not recovered; STAB and critical-hit findings. | current |
| [damage-implementation-audit](damage-implementation-audit.md) | 28-case audit of the damage chain, with fixes for criticals, shields, sequential reductions and self-costs. | historical |
| [damage-official-v25](damage-official-v25.md) | Type, composite and nature arithmetic checked against the official Flash client; the impish label fix. | historical |
| [calculator-parity-audit](calculator-parity-audit.md) | Comparison with the 4399 and other calculators: 324 single-type cells and twelve examples agree. | historical |
| [dual-type-mechanics-audit](dual-type-mechanics-audit.md) | Restores the second type of 294 skills from official configuration and uses dual types in damage and conditions. | current |
| [unity-and-swf-source-audit](unity-and-swf-source-audit.md) | First check that official Unity bundles and Flash SWFs decode; found the fighting-vs-evil chart difference. | historical |
| [official-game-feel-resources](official-game-feel-resources.md) | Source discovery for motion, skill effects and audio; the fighting-vs-evil 0.5 correction. | historical |
| [capture-official-v25](capture-official-v25.md) | Capsule factors and CatchRate checked against the official client; the capture equation stays a remake calibration. | current |
| [critical-traits](critical-traits.md) | Remake calibration for the 会心 and 免爆 critical-rate traits, whose original probabilities are unknown. | current |
| [skill-atknum-audit-v45](skill-atknum-audit-v45.md) | `AtkNum > 1` was imported as multi-hit by mistake; finding, and the 2026-10-19 repair of 94 skills against the pinned moves table. | done |
| [status-skills-and-playtest-v19](status-skills-and-playtest-v19.md) | Six-point status-skill symbol and fixes from the revision 18 playtest (leech, recoil, Puni immunity, potions). | historical |
| [core-performance-v22](core-performance-v22.md) | Battle-core rule-lookup performance (`findRule`) without rule changes. | historical |

## Battle AI and trainer encounters

| Note | Summary | Status |
| --- | --- | --- |
| [trainer-search-ai-v58](trainer-search-ai-v58.md) | Design and verification of the engine-simulated search planner that trainer encounters use. | current |
| [battle-ai-redesign-handoff-v58](battle-ai-redesign-handoff-v58.md) | Codex discussion handoff (`BATTLE-AI-REDESIGN-HANDOFF.md`) on the AI information model. | superseded by [trainer-search-ai-v58](trainer-search-ai-v58.md) |
| [trainer-ko-priority-v57](trainer-ko-priority-v57.md) | V57 tier that put a reliable first-action knockout above all other trainer utility. | superseded by [trainer-search-ai-v58](trainer-search-ai-v58.md) |
| [trainer-ko-priority-validation-v57](trainer-ko-priority-validation-v57.md) | Independent 27-group validation of the V57 knockout tier. | superseded by [trainer-search-ai-v58](trainer-search-ai-v58.md) |
| [offline-battle-ai-v36](offline-battle-ai-v36.md) | First offline tactical AI and three Lv.80 trainer teams, with their research. | superseded by [trainer-search-ai-v58](trainer-search-ai-v58.md) (AI) and [classic-teams-v38](classic-teams-v38.md) (teams) |
| [station-battle-facilities-v37](station-battle-facilities-v37.md) | Three station facilities (random, BST ≥ 600, fixed classic teams), the 200-turn draw and AI liveness. | current |
| [classic-teams-v38](classic-teams-v38.md) | The ten authored Lv.100 trainer teams in four tactical groups and their fair-build rules. | current |
| [npc-training-v45](npc-training-v45.md) | Rei's and Gaia's ability-training profiles for the two trained teams. | current |
| [elite-candidates-v45](elite-candidates-v45.md) | Read-only audit of sub-600 BST candidates for the elite pool. | historical |
| [elite-integration-v46](elite-integration-v46.md) | Peak Duel (`elite`) pool of 124 species with authored four-move builds. | current for the roster; its AI is superseded by [trainer-search-ai-v58](trainer-search-ai-v58.md) |
| [classic-pvp-sources-v46](classic-pvp-sources-v46.md) | Player-account evidence for five more Peak Duel species. | current |
| [combat-fidelity-v47](combat-fidelity-v47.md) | Per-holder ownership checks, the Tower 61 move restoration and voluntary-switch pricing. | historical; switch pricing superseded by [trainer-search-ai-v58](trainer-search-ai-v58.md) |
| [battle-supplies-v48](battle-supplies-v48.md) | Catalog evidence for the 250-HP, 20-PP and status-cure trainer supplies. | current |
| [battle-supply-integration-v48](battle-supply-integration-v48.md) | Unlimited battle-only supplies in trainer and facility battles. | current for the rules; AI use superseded by [trainer-search-ai-v58](trainer-search-ai-v58.md) |
| [engraving-integration-v49](engraving-integration-v49.md) | Integrates the 546 engravings, their shop and two-slot UI; elite recovery-move replacements. | current; AI recovery policy superseded by [trainer-search-ai-v58](trainer-search-ai-v58.md) |

## Bosses, campaigns and towers

| Note | Summary | Status |
| --- | --- | --- |
| [boss-user-policies-v57](boss-user-policies-v57.md) | User decisions: four waived Boss mechanics and Moshidilu's forced execution below 25% HP. Bosses are outside the V58 planner. | current |
| [boss-ai-isolation-v56](boss-ai-isolation-v56.md) | Restores the pre-V36 Boss policy (`legacy-ai.ts`) and limits the planner to trainer sides. | current |
| [boss-evidence-v56](boss-evidence-v56.md) | Field-level evidence ledgers for all 180 Boss encounters and 240 members. | current |
| [boss-rules-v56](boss-rules-v56.md) | Execution audit of every Boss rule, phase and objective (`data/boss-rule-support-v56.json`). | current; five entries updated by [boss-user-policies-v57](boss-user-policies-v57.md) |
| [boss-audit-integration-v56](boss-audit-integration-v56.md) | V56 checkpoint joining the evidence and rule audits with the UI. | historical |
| [boss-evidence-controller-validation-v56](boss-evidence-controller-validation-v56.md) | Independent evidence and controller validation (18 groups). | historical |
| [spt-movesets-2026-10-19](spt-movesets-2026-10-19.md) | Original SPT Boss movesets: period sources first, then Boss forms, then the species' last four moves at the fight level; five sets corrected, a basis for every Boss. | current |
| [boss-loadout-fidelity-v47](boss-loadout-fidelity-v47.md) | Source review of original Boss loadouts; restores Tower 61's sacrifice move. | current |
| [classic-challenge-campaign-sources](classic-challenge-campaign-sources.md) | Sources and reconstruction of the seven campaigns (divine beasts, Qilin, Rei training, Puni). | current |
| [campaign-delivery](campaign-delivery.md) | Campaign routes with 30 stages, archive sorting by species number, official attribute icons. | historical |
| [solo-challenges-v23](solo-challenges-v23.md) | Seville as an ordinary solo SPT encounter; Qigesa as a direct challenge. | current |
| [puni-location-v38](puni-location-v38.md) | Puni's single campaign contact on the Mystery Realm platform, with entry driven by seal progress. | historical |
| [challenge-presentation-v40](challenge-presentation-v40.md) | Restores the Mystery Realm platform layer (`animator_mc`) and makes challenge panels opaque. | historical |
| [station-tower-v53](station-tower-v53.md) | Four station scenes, ship rooms, redirects and Brave Tower checkpoints. | current; tower entry superseded by [tower-floor-flow-v54](tower-floor-flow-v54.md) |
| [tower-floor-flow-v54](tower-floor-flow-v54.md) | Walkable Brave Tower floor with one guardian per floor and first-clear milestone rewards. | current |
| [tower-floor-source-v54](tower-floor-source-v54.md) | Inspection of the pinned official map 500 SWF and its floor assets. | current (source record) |

## Acquisition, evolution, fusion and breeding

| Note | Summary | Status |
| --- | --- | --- |
| [acquisition-policy-v32](acquisition-policy-v32.md) | `data/acquisition-policy.json`: evidence classes for all 632 initial roots. | current |
| [acquisition-completion-v32](acquisition-completion-v32.md) | Every initial form gets an entry; the unified 316-reward registry and the six-copy allowance. | current; its non-initial gaps are closed by [evolution-completion-v34](evolution-completion-v34.md) |
| [habitat-placement-v31](habitat-placement-v31.md) | Initial-form habitats generated from the original map configuration (`build_habitats.mjs`). | current |
| [habitat-completion-v32](habitat-completion-v32.md) | 29 source-identified subregions, 59 placements, and location entries that open collection tasks. | current |
| [base-form-acquisition-v23](base-form-acquisition-v23.md) | Encyclopedia acquisition links go to the initial form's own entry and show evolution separately. | current |
| [paid-spt-recruitment-v23](paid-spt-recruitment-v23.md) | 42 paid-option initial forms as rewards gated by five named SPT clears, with product evidence. | superseded by [acquisition-completion-v32](acquisition-completion-v32.md) |
| [debug-acquisition-battle-v23](debug-acquisition-battle-v23.md) | Revision 23 integration record: initial-form links, paid recruitment, Seville, frozen battle backdrop. | historical |
| [missing-acquisition-v24](missing-acquisition-v24.md) | How `export-acquisition-status.mjs` builds the missing-acquisition inventory; the revision 24 baseline. | historical |
| [repeatable-paid-acquisition-v24](repeatable-paid-acquisition-v24.md) | Repeatable routes for the paid families: breeding for 史克 and 米娅, conditional hatch items. | current |
| [breeding-source-v24](breeding-source-v24.md) | Eight breeding pairs and outcome weights from the official `Eggs` table. | current |
| [breeding-integration-v24](breeding-integration-v24.md) | Breeding rules: Lv.50 mature parents, first-generation male, immediate free offspring. | current; entry point moved by [laboratory-slots-v26](laboratory-slots-v26.md) |
| [dex-acquisition-review-v14](dex-acquisition-review-v14.md) | Revision 14 coverage review by evolution family. | superseded by [dex-acquisition-review-v21](dex-acquisition-review-v21.md) |
| [dex-acquisition-review-v21](dex-acquisition-review-v21.md) | Revision 21 coverage: 367 species with routes, 1,112 without. | historical |
| [evolution-simplification-v33](evolution-simplification-v33.md) | Automatic mechanical evolution and explicit branch choices at source levels. | current; its deferred special forms now follow [evolution-skins-v35](evolution-skins-v35.md) |
| [evolution-completion-v34](evolution-completion-v34.md) | 32 special evolutions as level evolutions; the closure reaches all 1,479 eligible forms. | superseded by [evolution-skins-v35](evolution-skins-v35.md) |
| [evolution-skins-v35](evolution-skins-v35.md) | Manual special evolution with Lv.60 overrides, and ancestral skins. | current |
| [fusion-source-v17](fusion-source-v17.md) | The 34 fusion recipes recovered from the official client. | current |
| [fusion-acquisition-v17](fusion-acquisition-v17.md) | Fusion in the acquisition graph; 22 of 34 recipes were reachable then. | historical |
| [fusion-delivery-v17](fusion-delivery-v17.md) | First fusion UI as a creature-window tab, and the approved fusion rules (parents kept, 5% Karu and Hige). | historical; entry superseded by [laboratory-slots-v26](laboratory-slots-v26.md) |
| [fusion-laboratory-v18](fusion-laboratory-v18.md) | Fusion moved to a laboratory entry beside Dr. Pat. | superseded by [laboratory-slots-v26](laboratory-slots-v26.md) |
| [capture-and-roaming](capture-and-roaming.md) | 0.3.1: capsule capture of wild creatures, battle-item categories, roaming scene creatures. | historical |
| [engravings-2013](engravings-2013.md) | Which 546 engravings (through 2013) are installed, and how `build_engravings.py` regenerates them. | current |
| [item-icons-access-v50](item-icons-access-v50.md) | Icon grids; unlimited raising items, supplies and capsules; per-item caps for generic engravings. | current |
| [debug-integration-v25](debug-integration-v25.md) | Revision 25: ancestor collection credit, the free laboratory shop, official mechanics audits. | historical |
| [collection-shop-verification-v25](collection-shop-verification-v25.md) | Independent controller check of ancestor credit and the item shop. | historical |

## World, maps and navigation

| Note | Summary | Status |
| --- | --- | --- |
| [map-placement-v44](map-placement-v44.md) | Boss contacts keyed by encounter and wildlife on local terrain, with evidence classes per contact. | current |
| [scene-exits-v14](scene-exits-v14.md) | Scene exits from the original MapConfig route graph. | current |
| [robot-walking-v14](robot-walking-v14.md) | The original twelve-frame player walking cycle. | current |
| [original-map-asset-delivery](original-map-asset-delivery.md) | 133 official map backgrounds and their manifest. | current; HD versions in [hd-integration-v44](hd-integration-v44.md) |
| [challenge-location-expansion-sources](challenge-location-expansion-sources.md) | Source audit for the 55 destinations of the first five galaxies and the SPT habitats. | current |
| [graphical-atlas-v28](graphical-atlas-v28.md) | Graphical universe, galaxy and planet atlas from official art. | current; station page revised by [station-atlas-v53](station-atlas-v53.md) |
| [station-atlas-v53](station-atlas-v53.md) | Station atlas with four destinations and corrected source labels. | current |
| [laboratory-slots-v26](laboratory-slots-v26.md) | Fusion in the left rear laboratory chamber, breeding in the right. | current |
| [laboratory-labels-v28](laboratory-labels-v28.md) | Raised cream-and-gold laboratory captions. | current |
| [laboratory-facilities-v25](laboratory-facilities-v25.md) | First use of the laboratory background's machinery for fusion, breeding and the shop. | superseded by [laboratory-slots-v26](laboratory-slots-v26.md) |
| [map-scene-layout-v13](map-scene-layout-v13.md) | Fits recovered backgrounds to the viewport and restricts characters to recovered floor geometry. | superseded by [map-interaction-v14](map-interaction-v14.md) |
| [map-interaction-v14](map-interaction-v14.md) | Map clicks across 96% of the scene, wider roaming, original doorway arrivals, simple base-form encounters. | historical; wildlife placement superseded by [map-placement-v44](map-placement-v44.md) |
| [encounter-labels-and-return-v15](encounter-labels-and-return-v15.md) | Level labels on scene creatures, sparse rare species, automatic return after battle. | historical |
| [classic-navigation-and-presentation](classic-navigation-and-presentation.md) | 0.3.2: three galaxies, eight-direction character art, capsule-free Boss panels, cylinder capture. | historical |
| [compact-hud-and-challenge-travel](compact-hud-and-challenge-travel.md) | One compact header for the eight tools; challenge travel to the scene before battle. | historical; header superseded by [official-ui-integration-v26](official-ui-integration-v26.md) |
| [graphical-management-integration-v28](graphical-management-integration-v28.md) | Revision 28 integration and browser checks for the atlas and the PetBag window. | historical |

## Battle presentation and media

| Note | Summary | Status |
| --- | --- | --- |
| [battle-animation-hd-v44](battle-animation-hd-v44.md) | HD battle atlases re-rendered from original Flash vectors, keeping the Unity metadata. | current |
| [battle-animation-hd-density-v59](battle-animation-hd-density-v59.md) | Why the HD atlases stopped loading, a catalog texel-density audit, and vector cells re-rendered up to 8x. | current |
| [battle-animation-hd-ai-v60](battle-animation-hd-ai-v60.md) | Retained raster battle cells upscaled by a local AI model, gated against the original pixels; `<id>-v60` atlases. | current |
| [battle-animation-hd-redraw-v61](battle-animation-hd-redraw-v61.md) | Raster battle cells V60 left soft, redrawn locally as vector traces, strokes and smooth fields, gated against the original pixels; `<id>-v61` atlases. | current |
| [battle-animation-hd-v62](battle-animation-hd-v62.md) | The first standby pose first within each atlas's budget (other-frame raises given back), and a stroke-only gate for thin-stroke redraws with a visual review; `<id>-v62` atlases. | current |
| [full-dex-motion-v22](full-dex-motion-v22.md) | Offline battle motion for all 1,483 species: source and export process. | current; HD atlases in [battle-animation-hd-v44](battle-animation-hd-v44.md) |
| [battle-runtime-v22](battle-runtime-v22.md) | Shared animation clock, resource pool and canvas recovery for battle timelines. | current |
| [original-skill-effects](original-skill-effects.md) | 67 original skill effects from the official CDN, with provenance. | current; HD frames in [skill-effects-hd-v44](skill-effects-hd-v44.md) |
| [skill-effects-hd-v44](skill-effects-hd-v44.md) | HD source frames for the 67 skill effects with bounded decoding. | current |
| [battle-audio](battle-audio.md) | Official battle music and interface cues, with the source manifest. | current |
| [original-battle-motion](original-battle-motion.md) | First original Unity battle motion, for 384 species. | superseded by [full-dex-motion-v22](full-dex-motion-v22.md) |
| [full-dex-animation-audit](full-dex-animation-audit.md) | Audit that official animation bundles exist for all 1,483 species. | historical |
| [battle-media-v20](battle-media-v20.md) | Revision 20 media delivery: motion, skill effects, audio, type-chart fix. | historical |
| [battle-media-v22](battle-media-v22.md) | Revision 22 full-catalog media and engine integration, with performance checks. | historical |
| [battle-hd-runtime-review-v44](battle-hd-runtime-review-v44.md) | Review of HD loader memory ownership; one cancellation fix. | historical |
| [battle-presentation](battle-presentation.md) | Four-command battle layout from the official beginner guide. | historical; layout revised by [official-ui-integration-v26](official-ui-integration-v26.md) |
| [combat-visibility](combat-visibility.md) | Centered silhouettes, team portrait strips and full damage numbers including overkill. | historical |

## Interface and artwork

| Note | Summary | Status |
| --- | --- | --- |
| [hd-integration-v44](hd-integration-v44.md) | Revision 44 HD scenes, portraits and UI; asset transfer requirements. | current |
| [hd-original-art-v44](hd-original-art-v44.md) | Source exports of UI, leaf-map and atlas art for revision 44. | current |
| [portrait-source-recovery-v44](portrait-source-recovery-v44.md) | Original portrait source selection for every species; the species 910 reconstruction. | current |
| [ui-ai-v44](ui-ai-v44.md) | Seven conservative AI-restored UI images and their manifest. | current |
| [official-ui-source-v26](official-ui-source-v26.md) | Extraction of official toolbar, window, PetBag, breeding and battle skins. | current |
| [official-ui-source-v28](official-ui-source-v28.md) | Official sources for the graphical atlas and the PetBag window. | current |
| [ui-typography-source-v27](ui-typography-source-v27.md) | Original typography (SimSun) and sharp icon exports. | current |
| [display-density-v43](display-density-v43.md) | Layout zoom and device-pixel-ratio canvases for 4K and HiDPI displays. | current |
| [full-shell-preview-v52](full-shell-preview-v52.md) | `preview.html` mounts the full production shell for UI inspection. | current |
| [official-ui-integration-v26](official-ui-integration-v26.md) | Revision 26 integration: bottom navigation rail, official skins, laboratory chambers. | historical |
| [management-ui-v26](management-ui-v26.md) | Official-source styling of the management windows. | historical |
| [typography-contrast-v27](typography-contrast-v27.md) | Live typography, scene name labels and settings contrast (CSS only). | historical |
| [typography-modifier-integration-v27](typography-modifier-integration-v27.md) | Revision 27 integration of typography and the modifier layout. | historical |
| [official-petbag-v28](official-petbag-v28.md) | Creature window rebuilt on the original PetBag layout. | historical |
| [petbag-preview-v29](petbag-preview-v29.md) | Compact PetBag previews, and the revision 30 nine-slice frame. | historical |
| [ui-calibration-v42](ui-calibration-v42.md) | Bottom-rail map seat, centered window titles and short-window layouts. | historical |
| [ui-refinement-v51](ui-refinement-v51.md) | Compact item categories and PetBag content tabs. | historical |
