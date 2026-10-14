# Laboratory and official-mechanics debug integration, revision 25

Date: 2026-10-04. This pass addresses the reported collection-credit and breeding-scroll bugs, implements the requested classified free laboratory shop, integrates scene-matched facility interfaces, and audits capture, type, nature and damage/stat calculations against original official clients. It remains a development delivery, with no production build or package.

## Collection repair

Obtaining an advanced form now credits every directed lower ancestor to the owned and seen ledgers. The static ancestry index uses both explicit forward evolution edges and source `evolves_from` records, with visited sets to terminate cycles. Siblings and unrelated starters are not credited, and no extra actual monsters are created. This collection policy is distinct from physically obtaining an infant or establishing a missing executable transformation.

Direct pooled experience and level-editor changes follow normal automatic evolution. The level editor does not force evolution for an IV-only edit, and source manual-evolution flags are respected. Raising species 1 directly to level 100 produces species 3 and immediately marks 1, 2 and 3 collected. Initial persistence now precedes the first snapshot so older saves containing an advanced form receive the repair immediately, including the formerly omitted middle form. Earlier snapshots remain immutable.

## Unified free laboratory shop

The original laboratory wall console and Dr. Pat's dialogue open one classified shop. It includes every ordinary raising item, battle supply and capsule, even at zero stock. Every essence or fusion bead present in inventory enters the shop, remains unlocked after consumption, and survives export/reload. Existing first-clear rewards restore known essence metadata for older saves whose stock was consumed. Unearned hidden generated recruit essences are not exposed merely because they exist in the internal catalog; the user's request concerns backpack items.

All prices are zero. A purchase adds 1–999 units directly to the existing inventory, consuming no currency, monster or RNG state. Unknown/unearned products, invalid quantities, unsafe integer overflow and purchases during active combat are rejected without changing the save. Immutable stock views reuse unchanged rows. The UI supports the five existing backpack categories, search, quantity presets, stock display and direct travel to the corresponding backpack pocket for use/hatching.

## Facility presentation and scrolling

The laboratory's original background bytes are unchanged. The existing left holographic platform opens fusion, rear paired chambers open breeding, and central blue wall console opens shopping. Locally authored SVG interface emblems follow the surrounding blue/gray/amber palette. They are documented as new interface artwork, not official separated machine sprites. Dr. Pat's gold overhead interaction marker is removed in the laboratory; his character layers remain intact. See [facility provenance](laboratory-facilities-v25.md).

The breeding panel now takes its actual window-content height and constrains the left index's scroll track. Browser inspection recorded content height597, client height509, and scrollTop changing from0 to88.5 when selecting the eighth pair. The selected recipe is 哲尔尼, confirming that the previously clipped final row is accessible.

## Official alignment and limits

The live official RobotCoreDLL and PetFightDLL were downloaded and pinned by hash. Seven retained capsule factors match original item configuration. Four species CatchRate records required correction: 1034 红色雪球→20, 1036 紫色雪球→5, 1038 蓝色雪球→5 and 1040 酷雪球→1. Standalone records and the compact runtime bundle now agree with all 1,483 original species CatchRate values. Their `obtain` metadata follows the existing inferred-wild convention; this correction adds no speculative map placement.

Original ordinary-fight code requires active species 77,78,79,310,311 or312 to attempt catching416 尼奥. Both the battle core and UI now enforce this prerequisite; rejection consumes neither capsule nor RNG and the interface explains the required family. The battle core preserves ordinary/boss/no-capture distinctions. The current client receives a server `catchType` as well, and that complete server encounter classification is not recoverable from species CatchRate alone.

Full capture probability is not source-certified: the official client sends command 2409 and a capsule ID, then receives capture success/failure. The existing chosen HP/status equation remains an explicitly labeled reconstruction. No unsupported replacement equation or undocumented level modifier was introduced. See [capture evidence and probability boundary](capture-official-v25.md).

The official coefficient comparison passes324 single-type cells and 29,241 singleton/unordered-dual combinations by executing the actual inspected ActionScript composite operations. All25 nature names and 150 multiplier cells agree after correcting `impish` from 淘气 to 顽皮 in both standalone and bundled data. The complete stat and damage packet values arrive from the server. STAB details, stage arithmetic, critical/random behavior and exact damage/stat rounding are not proven by these coefficient checks; the retained reconstruction and floors are unchanged. See [damage and stat source audit](damage-official-v25.md).

## Verification

Three GPT-6.1 Sol medium workers independently handled capture evidence/rules, damage/stat evidence, and facility artwork/scrolling plus collection/shop controller checks. Root integrated the controller, shop UI, ancestor credit, level editing, bundled source corrections and capture UI explanation. All changes remain in the shared development source without a release build.

- Independent ancestry checks cover all 1,483 species plus reverse-only, branching and cyclic fixtures. Collection checks cover direct level 100 XP/edit paths, no extra monsters, old-save repair, unrelated forms and immutable snapshots.
- Shop checks cover all ordinary source items and every defined/generated essence or bead when known, zero stock, persistent unlocks, legacy first-clear recovery, quantities 1 and 999, free transactions and unchanged-save/RNG rejection cases.
- Source capture checks cover the six accepted Niao partner forms, failed prerequisites without consumption, boss/no-capture modes and unchanged reconstructed probability boundaries. The existing eight-category capture integration replay passes.
- Damage checks cover official coefficients/natures,375 raising/battle stat bridge cases, the existing eight critical-hit cases and 28 damage-audit cases. These bridge/regression cases are not proof of unknown official server arithmetic.
- The existing42 paid recruitment transactions and 24 breeding-result branches still pass. TypeScript and `git diff --check` pass.

Browser checks on isolated port 1441 verify original-machine facility entry, marker removal, the eighth breeding row, direct XP growth to species 3 with all 1/2/3 flags true and three actual monsters, zero-coin purchase of ten ordinary capsules from zero stock, purchase of five known spirit beads, pocket navigation, actual hatching and exported-save reload. Visible diagnostics and screenshots remain under ignored `artifacts/laboratory-v25/`; controller and official-source evidence remain under their respective revision25 artifact directories. The XP pool and initial spirit bead are prepared fixtures, not a claim of a complete natural campaign playthrough.

The existing port 1425 save was not reset or imported during testing. Port1440 now runs as an independent local development service so the user's referenced preview survives task completion. Tests used a separate port 1441 origin with fixture gameplay persistence disabled.
