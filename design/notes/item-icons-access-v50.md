# Icon grids, unlimited supplies and engraving balance

Revision 50 replaces long item and engraving list cards with compact icon tiles in the PetBag raising page, inventory, laboratory shop, engraving selection and battle supplies. Names, effects, restrictions, ownership and transfer sources appear on hover or keyboard focus. Selection and confirmation remain explicit where they were already required; battle capsule use still takes one click.

The creature-backpack navigation artwork is derived from the recovered official `creatures.svg`. Only its two top-level circular backing instances are omitted in `creatures-no-circle-v50.svg`; the gold backpack, label, definitions, viewport and registration remain intact. The source asset is unchanged. Battle command controls use a bounded two-by-two grid, with independent name and power/PP rows and the old conflicting forced borders removed.

## Availability

The player can use all installed raising items, battle supplies and capsules without a stock limit, including when a saved finite count is zero or absent. The interface displays infinity, while legacy finite quantities stay unchanged in the save. The raising core's default finite-consumption behavior remains available to other callers; the controller explicitly opts into unlimited access. Capsule legality and consumption now respect the existing per-side unlimited set as medicine already did.

Skill engravings and species-exclusive ability engravings are unlimited. Their original species, level and learned-move gates and the one-ability/one-skill slot rule remain. Generic ability engravings have finite, separate per-item balance limits. The user chose separate limits rather than one shared quota across different marks.

The authored gain score is the sum of Attack, Defense, Sp. Attack and Sp. Defense bonuses, plus 0.8 times HP and twice Speed. This keeps larger numerical HP bonuses comparable and gives turn-order gains more weight. Compound engravings count all their gains. The caps are remake balance choices, not historical server limits or a calibrated competitive ranking.

| Gain score | Copies per engraving |
| --- | ---: |
| At least 35 | 1 |
| At least 30, below 35 | 2 |
| At least 25, below 30 | 3 |
| At least 20, below 25 | 4 |
| Below 20 | 6 |

This gives generic Speed +18 a cap of one and Speed +15 a cap of two, as requested. Attack +35 / HP +45 each have a cap of one; Attack +30 / HP +40 each have a cap of two. `src/mechanics/engraving-access.ts` owns the rule. The complete 62-row runtime table is exported in `artifacts/unlimited-access-v50/generic-ability-caps.csv` and the associated regression report.

Finite stock and equipped copies count together when obtaining another copy. A finite mark can move directly from another monster, with a selectable source when several holders exist. Validation occurs before removing it from the source. Old stock exceeding a new cap is preserved; reaching the simultaneous equipment cap makes the next equip a transfer, rather than creating another active copy. Replacing a finite mark returns it to stock. Each monster retains its own spent engraving-resource state.

Essences and fusion beads retain their acquisition gates, finite quantities and six-copy allowance. NPC trainer supplies remain the selected HP250/PP20/status-cure set. Original Boss and wild NPCs receive no new grant. Encounter bans on items and capture remain effective. Retired HP3000 and PP40 definitions stay excluded at runtime.

## Artwork

`public/item-icons/manifest.json` records the official resource URLs, fetched bytes, hashes, identity bindings and unresolved cases. There are 968 downloaded official PNGs and 2,205 mappings, covering 1,659 runtime items and 546 engravings. Every installed engraving has its own official numbered icon; their 546 IDs use 532 distinct image hashes because the official server itself reuses some artwork. Every ordinary item except the authored status cure has an official identity image.

Some remake-created essences have no original item identity, and one fusion-bead color lacks a usable official image. These and the authored status cure use explicit category-icon fallbacks; they are not represented as recovered historical item images. The official PNGs are from the current static resource server. Their bytes are not claimed to have been archived in 2013.

## Verification

- New access regression: 16 checks, including seven consecutive zero-stock raising uses, repeated capsule attempts and two actual captures, per-item limits, direct transfers, rejected transfers, old stock preservation and all 546 engraving qualification gates.
- Existing suites adapted only where the requested access policy changed: supplies 18 checks across 22 public encounter entries; engraving mechanics 11 checks; engraving-resource boundaries 15 checks.
- TypeScript, CSS parsing and whitespace validation pass. Asset checks verify all 2,205 paths and image hashes, plus a visual sample.
- Browser checks use an isolated port-1439 synthetic save. The player's port-1426 and port-1432 saves are not used. Four skill slots and their footer text remain within the command content at 1280 x 720, 640 x 480 and 3840 x 2160. The 4K shell and tooltip use zoom 3, and the tooltip stays inside the viewport.
- Actual UI checks verify icon descriptions, zero-stock raising and battle use, highest-Speed cap one, rejected second-copy replenishment, and direct transfer from one monster to another without increasing ownership. Narrow inventory has no horizontal overflow; its details and confirmation controls remain scrollable.

Screenshots and layout measurements are under `artifacts/icon-ui-v50/`. No production build, distribution package or remote push is part of this revision.
