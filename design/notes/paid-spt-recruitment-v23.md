# Paid-option initial-form SPT recruitment, revision 23

The source-backed registry contains **42 initial-form recruitment rewards**, supported by **63 positive-priced original client product records**. Each reward is gated by five explicitly named, distinct ordinary SPT challenges whose opponent species numbers precede the initial reward species. This is an authorized remake acquisition rule, not a recovered historical SPT reward schedule.

The registry identifies fixed premium-currency acquisition options evidenced by the recovered official client. It does **not** establish that these families were historically paid-exclusive, or that all historical paid offers survive in the current tables. A historical acquisition taxonomy remains partially unresolved. No family was classified as paid solely because its catch rate is zero, its inferred catalog label is `event`, or its current acquisition route is missing.

## Official source and currency verification

A fresh download of the official [RobotCoreDLL.swf](https://seer.61.com/dll/RobotCoreDLL.swf) returned HTTP 200, **9,178,617 bytes**, SHA-256 `2405e1cb24f4a44fa6183c03a51357f58895a0a9ff1e5376a6506be53cfc493f`, identical to the cached official encoded core. The existing decoded core is SHA-256 `ca040870b9150463f5858ac42d0e0c347380010e12ae16d02068dc78048ccd40`. Its original embedded symbols were independently extracted from the SWF tag stream.

| Original symbol | Owning client class | Actual parsed evidence |
|---|---|---|
| 23 | `PetXMLInfo` | Original species IDs, ancestry and explicit rare/VIP fields |
| 108 | `ItemXMLInfo` | Compressed AMF3; **36,096** item records, complete byte consumption; exact `BreedMonID` hatch bindings and named acquisition items |
| 175 | `MoneyProductXMLInfo` | XML explicitly labeled as purchases with Mi coins; product 200000 buys item 5, named diamonds, at price 1 with `gold=10` |
| 253 | `VipPetShopXMLInfo` | Current VIP shop listings; retained dex has no matching active rows |
| 310 | `GoldProductXMLInfo` | Compressed AMF3; **24,178** premium product records, complete byte consumption |

Currency classification uses the owning client code, rather than treating every positive `Price` field as real-money evidence. `GoldProductXMLInfo` registers the symbol-310 AMF alias and identifies its configuration as `product_diamond.xml`. The original purchase listener reads this registry in `onBuyGoldProduct`, decodes `GoldBuyProductInfo`, and associates it with `CommandID.GOLD_BUY_PRODUCT`. Its command switch distinguishes ordinary `ITEM_BUY` from gold, Mi-coin and shopping-cart purchase commands. Symbol 175 provides the Mi-coin-to-diamonds purchase mapping. These are premium product prices, rather than ordinary Seer-bean shop prices. Premium currency may also be available through promotions; the tables do not establish paid exclusivity for every acquisition option.

The [official historical currency guide](https://seer.61.com/main/guide/cycc.html) separately distinguishes ordinary Seer beans from premium gold beans and their Mi-coin conversion. Its older terminology is not treated as a current diamond-price table.

The freshly fetched [shop_config.xml](https://seer.61.com/resource/xml/shop_config.xml) has SHA-256 `9d0d094b47bd36153e62a41d6c5dc16e3937683341d49387654e4e8554b29091`. Its active pet-shop records concern species beyond the retained catalog. This source therefore cannot establish complete classic paid membership. The freshly fetched [SptPetInfoOld.xml](https://seer.61.com/resource/xml/SptPetInfoOld.xml) is **19,828 bytes**, SHA-256 `d698ee3b9cd2be361cb1c068d9b130057c73d6bbb2fe3d531fab0df51324483c`, identical to the cached official SPT table.

The web browsing tool could not render the binary core or shop XML. Direct HTTPS downloads of those official URLs succeeded; their source hashes and sizes are retained. No unofficial mirror was used as authority for the paid registry.

## Membership selection and exclusions

Accepted evidence consists of a positive-priced premium product with an exact original named pet acquisition item, or a concrete product-to-item-to-`BreedMonID` linkage. Shop adult forms are traced through actual directed source ancestry to their initial form, and duplicate products/family roots are consolidated. Original product and species names remain verbatim in `data/paid-spt-recruitment.json`; each evidence row retains the product ID, item IDs, source species, price, premium currency and binding kind.

The initial source join identified 44 families. Two were excluded from replacement rewards: **205, Az (`阿兹`)**, which already has a mapped free wild capsule route, and **807, Aipai (`艾派`)**, marked as an original rare wild creature by official `IsRareMon=1`. Its separately offered paid level-100 form does not replace its wild membership. No existing ordinary SPT, campaign or free-fusion family appeared among the remaining accepted roots. Ambiguous random hatch products, substring name matches, furniture, skins, paid challenge shortcuts, zero-price records and unverified direct-purchase descriptions remain in the ignored candidate audit rather than becoming rewards.

Both NPC partner families, species **122–125**, are excluded. Divine/Puni exclusions derive from every non-Rei campaign's species and its entire ancestry family; campaign encounter IDs are also excluded. The current catalog's ordinary SPT species 945, 997 and 1477 are Spencer (`斯宾塞`), Pitesalo (`皮特萨罗`) and Fuxisi (`弗希斯`), respectively. They are not divine-beast IDs and remain valid ordinary SPT candidates. Current campaign metadata labels species 505, Ares (`阿瑞斯`), as the Qilin campaign species; this existing historical identity mismatch is preserved and excluded conservatively by campaign membership, rather than silently relabeling it.

## Recruitment rule and API

`src/progression/spt-recruitment.ts` exports `PAID_SPT_RECRUITMENTS`, `buildPaidSPTRecruitments(catalog)`, `getPaidSPTRecruitment(questId)` and `getSPTRecruitmentProgress(quest, clearedBossIds)`. The acquisition index can call the pure builder with its actual catalog; the helper has no runtime dependency on acquisition UI or controllers.

Eligible prerequisites must match the original official SPT species table, have category `spt`, have a normal `boss_spt_` encounter ID, contain one opponent, and satisfy the campaign/divine/NPC exclusions. Numbered alternatives for one opponent species contribute one stable final encounter ID. The selection takes the last five eligible opponent species strictly below the **initial reward species number**. All 42 current reward quests have five gates. The actual prerequisite IDs are present in the generated quest record; a generic victory counter never grants a reward.

The progress helper counts cleared named IDs with sets. Repeating one challenge, clearing unrelated challenges, or clearing a guardian campaign cannot satisfy another missing prerequisite. Empty prerequisite lists remain incomplete. Adult, unknown, excluded and duplicate initial-form definitions are rejected. The stable quest ID is `paid-spt-recruitment-<initial-species-id>`; the game controller owns persistent one-time claiming and reward creation.

## Verification and limits

The focused verifier passed **42** source-backed initial quests, distinct lower-number SPT gates, complete/partial/empty/repeated/unrelated-clear cases, source ancestry, and divine/NPC/adult exclusions. `tsc --noEmit` passed. The independent raw source readers consumed both complete AMF3 payloads. Independent source-controller verification now also passed all 42 quests through Vite SSR using the actual catalog and game controller. It checks incomplete and partial named gates, repeated/unrelated/Puni/divine clears, snapshot prerequisite IDs, one initial Lv1 reward, unchanged coins/items/experience, unchanged existing creatures, one-time claiming after save/reload, and full-party delivery to storage. Rejected incomplete, duplicate and unknown claims preserve the entire serialized save, including RNG.

A ready claim with six party members and 1,000 boxed creatures initially refused the reward but consumed RNG before the storage exception. The root integration corrected `acquire()` to check `PARTY_MAX` and `BOX_MAX` before generating a monster. The focused runner now verifies that this capacity rejection also preserves the entire save and RNG.

A controlled final-prerequisite battle against the actual `boss_spt_delasa` record passed real engine settlement: before the battle the reward is incomplete; the actual victory records the final named clear and makes the quest ready; claiming then adds one initial form without another currency or item change. The fixture preserves the source encounter identity, opponent, rules and phases, strengthens skill 10001 for one bounded turn, and removes random starting traits from this test battle. It verifies settlement and recruitment integration, rather than authentic boss difficulty.

Seven unique source transformation links remain unimplemented in the current executable evolution graph: **347→729**, **373→375**, **539→540**, **810→811**, **1318→1319**, **1329→1330** and **1388→1389**. Eleven accepted evidence rows traverse those links. The initial form still has a real reward route; these ancestry links must not be advertised as completed executable transformations without further source-backed implementation.

Ignored evidence under `artifacts/paid-spt-recruitment-v23/` includes `source-chain.json`, live source snapshots, complete product/item rows, exact hatch-product joins, all broader candidates, excluded free families, `verified-quests.json` with every prerequisite ID and unresolved transformation, `verification.log`, and the complete `controller-verification.json` / `controller-verification.log` transaction evidence. Cached extraction and replay files stay under `.cache/paid-spt-recruitment-v23/`.

To repeat the focused implementation checks without building or packaging:

```sh
node tools/verification/paid-spt-recruitment.mjs
node tools/verification/paid-spt-controller.mjs
./node_modules/.bin/tsc --noEmit
```

This pass changes only the source-backed registry, reusable progression helper, focused verification and documentation. No paid run, production build, release package, publication or commit was performed.
