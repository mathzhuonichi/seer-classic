# Evolution and ancestral skins v35

## Confirmed special-evolution policy

The user confirmed that special evolution must be optional and must no longer be available at level 1. All 32 special and super-evolution transitions introduced in v34 now have `automatic: false`. Reaching the required level makes the transition eligible; the player must explicitly confirm it. The four transitions belonging to the two special forks still require selection of the intended target.

The three original item-trigger values of 1 are overridden by remake level 60:

| From | To | Original source gate | Current remake gate |
|---|---|---:|---:|
| 347, Ancient Fish Dragon | 729, Fish Dragon King | 1 | 60, manual |
| 601, Fire Blade | 881, Blazing Blade | 1 | 60, manual |
| 55, Lugas | 1143, Ludinos | 1 | 60, manual |

These level-60 thresholds are explicit remake overrides. They are not presented as original-source levels. Each affected rule retains `source.monster.EvolvingLv: "1"`, its original trigger flag, the matching forward branch, and original item requirements. Its `levelEvidence` now has `kind: "remake-override"`, `originalLevel: 1`, and `remakeLevel: 60`.

The other target-specific source gates remain unchanged:

| From | To | Retained source level | Current behavior |
|---|---|---:|---|
| 398 | 432 | 63 | Manual confirmation |
| 651 | 652 | 34 | Manual confirmation |
| 810 | 811 | 40 | Manual confirmation |

The remaining 26 special transitions retain the previously approved remake levels of 60, 70, and 80, with `originalLevel: null` and `kind: "remake-fallback"`. They also require manual confirmation. The successive special chains remain 821 to 1017 at 60, 1017 to 1018 at 70, 1018 to 1019 at 80; 37 to 1237 at 60, then 1237 to 1238 at 70; and 500 to 1278 at 60, then 1278 to 1279 at 70.

The two special forks remain 67 to 1316/1317 and 739 to 1428/1429, all at level 60. Every v33 mechanical and traditional-branch rule is unchanged. Ordinary automatic chains, including 77 to 78 at 17 and 78 to 79 at 37, remain automatic. The mature predecessor and reverse ancestry for 1459 remain 79; its level-60 transition is now manual.

## Data and provenance

`tools/assets/build_evolution_rules.py` remains the single generator for `data/evolution-rules.json`, the affected `data/monsters/NNNN.json` records, `data/gamedata.json`, and `data/catalog_index.json`. The policy version is v35 and the schema remains version 2. The original 32-form omission list remains in `resolvedHistoricalMissingForms`, with its resolutions updated to the current policy; `deferredMissingForms` stays empty.

The generator still pins the same three official XML files and hashes documented in [v34](evolution-completion-v34.md): PetXMLInfo binary 23, EvolveXMLInfo binary 44, and SuperEvoXMLInfo binary 160. No raw source evidence is changed. The effective policy now comprises 62 source-level transitions, 26 fallback-level transitions, and three explicit level overrides. Its 91 transitions include the unchanged 43 mechanical and 16 traditional-branch transitions, plus the 32 manual special transitions.

Complete historical activity-script and server restrictions remain unverified. The new confirmation requirement and the three level-60 overrides are user-approved remake behavior. They supersede v34's automatic-special and literal-level-1 runtime behavior; the v34 document remains a historical record of that revision.

## Data validation

Generation and an immediate `--check` run pass with zero remaining changes:

```sh
python3 tools/assets/build_evolution_rules.py --source-dir /path/to/extracted-xml
python3 tools/assets/build_evolution_rules.py --source-dir /path/to/extracted-xml --check
```

A field-level comparison against v34 commit `619c510` confirms:

- Exactly the three source-level-1 transitions change level, all to 60; every other transition retains its level and target.
- All 32 special transitions are manual and have thresholds greater than 1.
- Every non-special policy rule and every raw source-evidence object is identical to the baseline.
- Only the 30 special predecessors' evolution arrays and provenance notes change in the catalog. Stats, learnsets, skills, acquisition metadata, ancestry, and other sections are unchanged.
- Standalone species records agree with the bundled catalog. The catalog index remains byte-identical because its target relationships do not change.

## Per-individual cosmetic skins

The skin feature applies to every owned individual in the complete 1,483-species catalog, including initial forms, ordinary and mechanical evolution families, branch families, special forms, and modifier-only NPC forms. There is no species-category allowlist. A form without an earlier directed ancestor still has the same selector with its default appearance; the rule does not invent an extra costume or permit a higher or sibling form.

The optional `Monster.skinSpecies` field stores an ancestor appearance for one owned individual. Leaving it absent selects the current species. `buildSkinOptions` derives legal choices from the executable forward evolution graph, starting with the current form and walking directed parents. It never grants permission from shared family labels, art stages, sibling branches, or unrelated reverse metadata. For example, 729 can display 347 or 346; 93 can display 91 but not sibling 92 or 94.

`setSkin` validates the requested integer against this ancestry and changes only that individual. Explicit `null` or the current species restores the default. Missing or illegal values are rejected without changing the stored monster. Active battles block cosmetic management. Names, real species, types, stats, skills, collection credit, capture prerequisites, breeding/fusion identity, generation, and six-copy accounting continue to use the real species.

The information tab exposes the skin selector. Owned-instance cards, the main pet portrait, warehouse, item targets, modifier, fusion/breeding parents, battle health portraits, team previews, motion, physical scaling, animation timing and preloading all consume `appearanceSpecies`. Static encyclopedia records and wild encounters retain their actual appearance.

## Persistence and battle precedence

The save format remains version 1 with an optional cosmetic field. Import removes an invalid cosmetic field and keeps the rest of an otherwise valid save; it does not turn a cosmetic error into a fresh journey. Existing saves without the field use the real appearance. Evolution retains a legal ancestor selection, including across special confirmation, and same-species restoration retains it when resetting training to level 1.

A battle records each player slot's starting appearance separately from gameplay state. Real transformation events override that appearance, including a transformation whose target equals the original species. Event-ordered animation frames preserve earlier appearances; ordinary switching preserves the selected skin. Transformation never writes its temporary form or appearance back to the owned monster.

## Integration validation

- TypeScript and generated-data checks pass. Acquisition-policy and habitat regeneration change only their catalog/provenance hashes; all 217 habitat placements and source classifications stay unchanged.
- The independent acquisition export in `analysis/codex-takeover-2026-10-14/evolution-skins-v35-final/` still reaches all 1,479 eligible forms, all 632 initial forms and families, 34 fusion recipes, eight breeding pairs and 316 collection rewards.
- `tools/verification/evolution-specials.mjs` passes 79 checks across all 32 manual transitions, their boundaries, destination-copy limits, legacy saves and the two repeat-capture special forks. `tools/verification/skins.mjs` passes 25 controller checks covering directed choices, invalid input/import, identity isolation, per-individual persistence, restoration, evolution, caps, fusion/breeding, capture and campaign gates, battle switching and same-species/different-species transformations. The campaign skin-isolation test supplies a bounded ancestor fixture because production species-specific campaign gates currently have no legal ancestor skin.
- Existing branch/mechanical regression checks pass all 82 groups, including 43 automatic mechanical edges, 16 traditional branch targets and six repeat-acquisition routes. All 25 boss-essence initial-form bindings also pass their nine focused check groups.
- The full `dex-acquisition.ts` audit passes eight groups, including 205 actual map captures, eight location-only collection gates, 847 evolution edges and 54 original reward bindings, with no route regressions. Its mechanical fixture reaches 113 automatically, stays 113 at Lv.60, then explicitly confirms 1277. The legacy report key `automaticEvolutionChecks` includes this complete mixed chain; the assertions distinguish its manual tail.
- Ten scoped server-rendered UI checks verify appearance-aware cards, portraits, selectors, battle views, fallback behavior, actual-identity metadata, static encyclopedia isolation and disabled controls in battle.
- Independent browser verification used a separate origin and save on port 1429. A Lv.59 Ancient Fish Dragon could not evolve; one upgrade item brought it to Lv.60 without converting it. Explicit confirmation produced Fish Dragon King. Its Baby Carp skin changed the main portrait and party slot while keeping species 729 and its stats. Reload retained the selection, and a real wild battle displayed the Baby Carp animation and portrait with Fish Dragon King's name, level, HP and skills. Browser warning/error logs were empty.
- Screenshots are stored under `analysis/codex-takeover-2026-10-14/browser-v35/`: `special-manual-lv60.png`, `ancestor-skin-selected.png`, and `ancestor-skin-battle.png`. The independent test server and tab were closed; the original port-1426 preview remains available with its separate save.

This is a development/debug delivery. No production or native release was built or pushed. Historical activity/server restrictions remain outside the verified source evidence. The development server continues to emit its existing public-JSON import warnings; these are separate from the clean browser console observed in this test.


## Full-catalog skin coverage follow-up

The user explicitly required the feature for every creature. A second read-only UI audit found no category, level, evolution-kind, or party/warehouse restriction. The selector is available on the information/details tab for every owned individual; only active battle prevents editing.

Independent server rendering checked 31 real controller instances across the petbag details, standalone raising details, and complete monster-management panel (93 renders). Coverage included initial and ordinary forms, mechanical forms, independent single forms, every one of the 20 branch destinations, special forms, and all four modifier-only NPC forms. Thirty fixtures were stored outside the party. Every surface exposed the selector and its current-form option. All 1,483 catalog art profiles resolve to existing local image files.

The expanded `tools/verification/skins.mjs` passes all 27 groups. Its independent oracle walks forward from every potential ancestor, then checks the real controller for all 1,483 species in 24 batches at level 1. All 1,483 selections and 1,483 resets preserve actual identity and restore the entire batch save byte-for-byte. Coverage includes 144 party instances and 1,339 warehouse instances; all four NPC forms additionally pass after actual modifier acquisition. There are 635 forms with only their own default appearance and 848 with at least one earlier directed ancestor. The ignored `artifacts/skins/controller.json` report records each species, complete option list, tested ancestor, and storage location. Production behavior already met this global scope; this follow-up adds exhaustive verification and records the requirement explicitly.
