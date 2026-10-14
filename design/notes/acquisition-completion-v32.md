# Initial-form acquisition completion, revision 32

The Claude handoff's requested initial-form acquisition work is complete in the development source. All 632 eligible initial forms have an executable normal acquisition entry. The independently replayed dependency closure reaches 1,402 of 1,479 eligible forms, supports all 34 fusion recipes and all eight breeding pairs, and leaves no blocked recruitment reward. NPC partner families 122–125 remain excluded from normal collection.

The original request concerns initial forms. Another 77 non-initial forms still lack an executable evolution or transformation route. Some are ordinary intermediate forms, including 60 and 72, whose ancestry metadata alone does not establish a forward evolution. This change does not claim complete acquisition of all 1,483 catalog species or implement those missing transitions.

## Delivered behavior

The source policy records all 632 initial roots, with overlapping paid, VIP, lottery, wild, task and breeding evidence. All 113 families with paid, VIP or lottery evidence now have explicit collection-essence rewards. The task scan includes annual membership names and the explicit `vip_limit` field; purchase discounts and psychic-type names do not imply VIP acquisition. See `acquisition-policy-v32.md` for source hashes and boundaries.

The unified registry contains 316 recruitment rewards. Each uses at most six total conditions: collected initial forms and named ordinary SPT victories. Collected prerequisites are permanent collection records and are not consumed. Divine beasts, Puni and NPC partner families are excluded from prerequisite selection. Claims grant an essence, which the player hatches through the existing inventory interface. Task search, status filtering, two-card pagination, creature links, boss travel, claim feedback and the hatch shortcut are connected to the actual controller.

The six-copy allowance includes held monsters and every pending essence or fusion-bead alias for the same species. Party members are already part of storage and are counted once. Captures, direct grants, recruitment claims, boss rewards, shop replenishment, fusion, breeding and evolution all respect this allowance. Hatching converts an existing reservation and cannot create a seventh held monster. Evolution frees the old form's allowance and checks the destination form. Blocked automatic evolution preserves the earned level and experience; it can be completed manually after freeing a destination slot. Ordinary supplies still allow purchases of up to 999 units.

Historical repeatability remains distinct from game policy: 24 initial roots have affirmative repeated-breeding evidence and 608 remain historically unknown. Unknown cases use an explicitly documented bounded-repeat remake rule. An individual encounter's once flag is not promoted to a whole-species lifetime limit. Existing oversized inventories and monsters are preserved. They block new additions; old surplus essences can hatch only while fewer than six monsters of that exact species are held.

Legacy direct-creature recruitment claims retain their monsters. Existing quest IDs recover a claim count of at least one and unlock the new corresponding essence product without granting a duplicate item. Claim counts and product unlocks survive reloads. Full storage does not prevent receiving an essence, but hatching rejects before consuming the item or RNG.

Fusion and breeding preserve their original outcome probabilities. If every possible result is full, the action rejects before drawing. If only some results are full, the original distribution is drawn once; a saturated result grants nothing and is not rerolled or replaced. Both parents remain unchanged. The existing free, immediate mechanics remain in place.

## Habitats and route fidelity

There are 29 new source-identified subregions on 21 existing planets. The generated habitat subset contains 201 species in 217 placements: 174 capture entries, 35 field challenges and eight collection-task entries. All prior placement identities and levels remain represented; eight broad location-only entries now open recruitment tasks. See `habitat-completion-v32.md` for map identity, artwork reuse, level derivation and navigation evidence.

The eight collection-only map entries are 406, 430, 560, 576, 760, 789, 818 and 831. Their `Foundin` records establish a location, not a free encounter on that map. They remain visible there, but their dialogue opens the corresponding task. The controller rejects direct field acquisition with or without a supplied location. The acquisition graph also excludes these locations as direct seeds, including when recruitment tasks are disabled for a baseline check. Independent actual wild, boss and breeding routes remain available.

Niao's route explicitly requires a qualifying active partner. Its graph entry becomes reachable only after one of the six accepted partner forms is reachable. Actual capture without the partner preserves the capsule, turn and RNG; capture with a qualifying active partner succeeds.

All 59 destinations and 159 landing areas are reachable through the atlas. Existing native artwork is preserved; composed navigation and reused parent-map backgrounds are explicitly attributed. Scenes with more than six creatures use distinct initial anchors.

## Completion evidence

| Requirement | Current evidence |
| --- | --- |
| Every eligible initial form has a normal entry | Independent export: 632/632 initial entries; no missing initial family |
| Every converted source family has a collection-essence task | Controller registry: 113/113 classified families, all 316 rewards tested |
| At most six named prerequisites, without false unconditional task seeds | `recruitment-acquisition.ts`: positive and negative fixed-point fixtures, missing/invalid gates, ungrounded cycles |
| Native dependencies remain usable | 34/34 fusion recipes and 8/8 breeding pairs have obtainable parents; first-generation male routes retained |
| No location-only paid/VIP shortcut | Eight controller entry rejections and graph exclusions; independent native-route preservation fixtures |
| Six-copy behavior and state preservation | `acquisition-limits-controller.mjs`: 17 grouped cases, all aliases, legacy surplus, full storage, RNG, fusion/breeding and evolution |
| Actual victory unlocks a reward | Real Delasa settlement completes the last named prerequisite; claim grants only an essence and survives reload |
| Habitat navigation and real acquisition | `habitat-regions.mjs`: 78 map transactions, including 67 captures, three field challenges and eight gated claims/hatches |
| Existing mapped captures and evolutions | `dex-acquisition.ts`: 205 actual captures, eight map gates, 763 executable evolution edges |
| Atlas completeness | `graphical-atlas.mjs`: 51 pages, 222 controls, 159 landing leaves; no missing destinations or introduced overlaps |
| Static and integration checks | TypeScript and whitespace checks; 12 focused controller, campaign, capture, fusion, shop, reward and navigation verifiers passed |
| Real interface behavior | Capture → task readiness → essence claim → hatch → shared shop/task cap; creature and boss links; Angie map-to-task redirect; Helka and Ability Space navigation |

The production graph and the independent exporter agree exactly. Recruitment-only dependencies use earlier initial forms. Broader breeding dependencies contain structural cycles, but existing external acquisition entries resolve them; the fixed point leaves zero blocked rewards. This is route and transaction verification, not a complete unmodified-difficulty playthrough of every campaign.

The previous source-binding repair is retained: all 25 affected boss essences use the documented infant reward target, and 1220 has the recovered level-40 manual transition to 1221. Its provenance and verification are recorded in `codex-takeover-v31.md`.

## Reproduction and local evidence

Run `npx tsc --noEmit`, `node tools/assets/build_acquisition_policy.mjs --check`, and the `.mjs` verifiers named above from the worktree. The TypeScript verifiers expose `verify` functions and are loaded through Vite SSR. Run `node tools/verification/export-acquisition-status.mjs <output-directory>` for the full species table, initial-form report and independent closure.

Final local reports are under `../analysis/codex-takeover-2026-10-14/`: `final-integration-validation/`, `final-gates-validation/`, `graph-map-gates-final/`, and `browser-v32/`. Per-verifier transaction reports are also generated under ignored `artifacts/acquisition-v32/`. Browser evidence includes the task claim, shared six-copy cap, Angie map redirection, Helka landing diagram and Ability Space. The final browser console contained no warnings or errors.

An older source-extraction verifier, `breeding.mjs`, requires missing historical `.cache/breeding-v24/eggs-166.xml` and therefore could not run in this handoff. Current breeding controller checks, exact partial-pool RNG tests and all eight recipe dependency checks passed. No claim is made that every historical test suite was rerun.

This remains development/debug work on `codex/seer-takeover`. The original source checkout, existing releases and player saves are preserved. No production build, package or remote push was made. The local preview serves the worktree at port 1426.
