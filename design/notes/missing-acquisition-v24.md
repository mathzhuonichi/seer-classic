# Current missing acquisition inventory, revision 24

Date: 2026-10-03. The inventory is generated from the current retained catalog, mapped habitats, named reward bindings, paid SPT recruitment, fusion dependencies, and executable forward level evolutions. The generated files are ignored bulk artifacts; this note records the method and interpretation.

Run `node tools/verification/export-acquisition-status.mjs` from the repository, or invoke that script by absolute path from another directory. An optional output directory argument overrides `artifacts/acquisition-v24`. Regenerate after changing acquisition sources; the JSON contains the generation time and source hashes.

## Baseline before breeding integration

The fresh source audit reproduces revision 23: 451 of 1,479 eligible species have a normal route, and 1,028 lack one. The four excluded NPC forms are 122 达尔, 123 希路达, 124 英卡洛斯, and 125 萨格罗斯. The retained catalog therefore contains 1,483 forms.

Among 632 eligible ancestry families, 147 are complete, 69 are partial, and 416 have no obtainable form. Only 170 of 632 true initial forms have their own direct acquisition entry. Direct acquisition exists for 237 species; 46 forms have a direct boss, campaign, or quest reward while their initial form has no entry. These adult rewards remain valid collection routes, but they never become infant acquisition buttons.

The mutually exclusive missing-form categories are:

| Category | Forms | Interpretation |
| --- | ---: | --- |
| `missingBase` | 220 | A directed initial form lacks an implemented entry. |
| `unmappedWild` | 261 | Wild metadata exists without a usable mapped capsule route. |
| `unsupportedTransform` | 27 | An immediate source predecessor is obtainable, but no executable forward rule reaches this form. |
| `unavailableParents` | 520 | An immediate predecessor or required fusion parents lack a normal route. |

These categories explain the immediate obstruction, rather than asserting four independent root causes. Classification tests an available predecessor first, then a blocked fusion recipe, wild metadata, unavailable predecessors, and finally a missing initial entry. A downstream form may therefore depend ultimately on a missing initial entry while its own category is `unavailableParents`. The JSON retains all directed initial roots and explicit paths so that this distinction can be inspected.

## Current inventory after breeding integration

The final model reaches 453 eligible forms, leaving 1,026 missing. It has 171 direct initial entries and 238 directly obtainable species; the 46 direct reward forms without an initial entry remain unchanged. Family coverage is 147 complete, 70 partial, and 415 missing, with the two NPC families excluded.

Only `breeding-6` currently has reachable parents: first-generation 597 史密斯 and 599 吉米丽娅, both raised to level 50. Its exact source outcomes are 596 史克 (50%), 598 米娅 (45%), and 600 安洛达斯 (5%). The first two already have routes; the new reachable forms are 600 安洛达斯 and its executable level-32 evolution 601 火刃. The seven other retained recipes remain blocked by missing parents. The model never supplies those parents from their own possible offspring.

The current missing categories are 211 `missingBase`, 250 `unmappedWild`, 28 `unsupportedTransform`, and 537 `unavailableParents`. Twenty source initial outcomes now have a recorded blocked breeding dependency and therefore move from generic missing-entry or wild-metadata classifications to `unavailableParents`; this classification change does not itself grant them. The source-fixed breeding parents require a first-generation male, while female generation is unrestricted. Every breeding offspring and its evolved forms retain their recipe identity so that a second-generation male cannot unlock another recipe. Fusion hatching supplies a new first-generation creature, consistent with its controller route.

## Deliverables and verification

`artifacts/acquisition-v24/status.json` contains the full species and family inventory, direct routes, initial-entry availability, forward-path implementation flags, missing immediate predecessors, blocked fusion dependencies, source hashes, and independent closure witnesses. `missing-species.csv` lists every missing eligible ID and recovered Chinese name once. `missing-initial-families.md` groups missing forms and absent initial entries under their actual directed initial forms, showing obtainable siblings or adult forms separately. `excluded-npc.csv` preserves the four exclusions separately.

The exporter asserts a complete source partition, checks that the source catalog remains unchanged, and independently computes the least fixed point of direct seed acquisition, executable forward level evolution, reachable fusion parent pairs, and breeding parent pairs with the actual male-generation restriction. Both its complete obtainable set and its first-generation set agree exactly with the production acquisition model. Source ancestry is used only for family grouping and directed initial paths. It never grants a transformation. No modifier grants or generic remote recruitment enter the inventory.

This is source and dependency verification. It does not certify boss difficulty, execute every gameplay route, or establish that later source acquisition methods have been implemented. The original runtime-mutating audit is not required by this exporter; reporting does not depend on `createGame` modifying caller-owned records.
