# Playable game integration

The React client consumes `GameController` from `src/game.ts`. Its snapshot and action union are defined in `src/game-types.ts`; methods are safe to pass directly to React subscriptions and event handlers. The controller reuses the recovered battle engine and raising rules rather than implementing alternative combat formulas.

The application loads the recovered compiled catalog once and loads every recovered encounter file. The initial save contains the three classic starters at level 5. Browser local storage persists the roster, party, inventory, raising progress, numeric IV, classic trait assignment, quest flags, boss clear records, and resources. Export and import use the recovered save validator. Battle state is transient; after a restart, the roster resumes at the last saved out-of-battle state.

All encounters are listed without calendar or story unlock requirements. Encounter-specific party and level rules still apply. Targeted searches route species with an available SPT or legendary encounter through that encounter. Other non-wild acquisition routes become named SPT recruitment challenges. A first victory in an ordinary targeted wild encounter grants that species at level 1. A first boss victory grants a species essence alongside original encounter item rewards. Essences hatch immediately through the item action; runtime metadata preserves their species binding across save reloads. Encounters without an original essence reward receive a documented remake essence reward. This acquisition route, the three starter gifts, the three explicit introductory quests, free healing, and battle currency and pooled-EXP bonuses are remake decisions. They should not be described as original acquisition rules. The integrated editor changes this same save.

## Mechanics modules

| module | holds |
|---|---|
| `catalog.ts` | the catalog loader (bundle plus every encounter file) |
| `traits.ts` | all 48 classic traits: `traits` (definitions) and `traitScripts` (their hooks), from one table keyed by the original effect id |
| `campaign-rules.ts` | `campaignScripts`, the campaign encounter rules |
| `npc-training.ts` | `npcTrainingScripts`, the NPC trainer Gaia's seal passives |
| `boss-encounter.ts` | the attempt-based boss level rule, applied before battle creation |
| `engravings.ts` | the 2013 ability and skill engravings: applicability, stat bonuses and the skill Effect-code table |
| `engraving-access.ts` | remake ownership limits for generic ability engravings |
| `persistence.ts` | the browser local-storage save slot |

The game registers `{...SEER_SCRIPTS, ...traitScripts, ...campaignScripts, ...npcTrainingScripts}`. The three game registries are built with the engine's script builders and helpers (`battle/core/src/scripts/builders.ts` and `util.ts`, described in `battle/core/SCRIPTS.md`); campaign `status_on_attacker` shares the engine boss rule's hook and keeps one condition per repeated rule.

Newly obtained monsters receive a seeded random implemented zero-star classic trait; the one retained definition with an outstanding limitation (effect 503) is not assigned randomly. `traits.ts` preserves all 48 original definitions, source parameters, behavior hooks, and any implementation limitations. Engravings are active: `engravings.ts` installs the 2013 ability and skill engravings. The shop's 刻印 tab sells one copy per purchase, and the shop or the PetBag 能力 tab equips one of each per monster from that stock (`design/notes/engravings-2013.md`).

Validation performed: TypeScript compilation and production build; a direct controller smoke run covering new game, targeted wild battle and win, first acquisition, quest reward, EXP allocation, EV training, healing, integrated editor edits, and save roundtrip; a separate successful Mushroom Monster SPT encounter covering targeted-search routing, clear records, essence rewards, save reload before hatching, and trait assignment after instant hatching. All 1,483 species have a level-1 learnset entry, so level-1 acquisition does not create an empty equipped skill list. These checks establish the sampled integrated flow; they do not certify every encounter, scripted effect, or source-derived mechanic.
