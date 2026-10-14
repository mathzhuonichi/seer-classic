# Repeatable paid acquisition audit, revision 24

The retained paid registry contains 42 initial families and 63 fixed premium-product evidence rows representing 59 unique product IDs. **Two paid families have a confirmed source-supported repeat parental breeding route: 史克 (596) and 米娅 (598).** Separately, 31 families have an exact purchased hatch-item route that conditionally supports repeated hatching; 11 purchase-route investigations remain unresolved. Within the 31 hatch candidates, the two confirmed breeding families leave 29 families whose repeatability remains conditional. Unlimited purchases and lifetime one-copy restrictions are not established. No reward, claim, breeding, or game rule was changed. The registry in `data/repeatable-paid-acquisition.json` is an evidence inventory only and is not imported into the game.

“Conditional” means the official item definition identifies the hatch output, and the item can represent multiple stored copies. Repeated acquisition still requires a repeatable supply and an exchange or purchase route without an ownership or lifetime restriction. Neither `Max > 1` nor a surviving premium product row alone establishes those conditions. “Unresolved” means the retained named product establishes a paid option but the recovered binding does not establish a repeatable hatch route. No row is labeled confirmed unlimited or confirmed lifetime one-time.

## Confirmed source-supported repeated parental breeding

The official core's `EggsXMLInfo`, symbol **166**, contains this exact row:

```xml
<Egg Id="6" MaleMon="597" FemaleMon="599" OutputMons="596 598 600" Probs="50 45 5" />
```

Thus male **史密斯 (597)**, whose initial paid-registry family is **史克 (596)**, and female **吉米丽娅 (599)**, whose initial paid-registry family is **米娅 (598)**, produce 史克 at 50%, 米娅 at 45%, or 安洛达斯 (600) at 5%. This is a parental breeding formula, independent of any second premium purchase. Each desired offspring remains random; a cycle does not guarantee a particular species. The exact symbol-166 XML SHA-256 is `33696cb59dd78cd7ead6ef1072aa3c314a30a797e6dfc611188ecff679befaec`.

The official [PetBreedPanel.swf](https://seer.61.com/module/com/robot/module/app/PetBreedPanel.swf) supplies affirmative repeat-use evidence. In `com.robot.module.app.petBreed.BreedPanel.onStart`, a positive `breedCoolTime` displays a 72-hour repair message and explicitly says the chamber can be used again afterwards. The other branch checks 5,000 ordinary Seer beans, then sends `CommandID.START_BREED` with the male and female **catch times**. The male selection filter requires level at least 50 and `generation == 0`; matching females are returned by `GET_BREED_PET`, and the client requires level at least 50. The success branch subtracts 5,000 beans and reports a new egg. It does not remove either parent, change its generation, or set a species-level claimed flag in the visible client code.

`HatchPanel.onGetPet` sends `GET_HATCH_PET`, receives the output species and catch time, calls `GetPetController.getPet`, and creates a fresh `HatchPanel` that retrieves `GET_BREED_INFO`. No lifetime owned-species exclusion appears in this flow. The official [PetBreedBook.swf](https://seer.61.com/module/com/robot/module/book/PetBreedBook.swf), text symbol 79, independently states that fixed combinations and level-50 parents are required, each breeding takes 24 hours, and the chamber recharges for 72 hours before use again. These affirmative repeat-cycle instructions support **confirmed source-supported repeated parental breeding**, rather than merely an inference from missing shop limits.

This classification establishes the mechanism intended by the recovered official client and formula. Actual historical or current server transactions, parent retention on the server, and operational availability were not replayed. It does not assert unlimited purchases or guaranteed offspring. The source extraction and family/formula verification are also recorded in `design/notes/breeding-source-v24.md` and `data/breeding.json`.

## Official sources and exact controls

The official [RobotCoreDLL.swf](https://seer.61.com/dll/RobotCoreDLL.swf) was downloaded again in this pass: HTTP 200, 9,178,617 bytes, SHA-256 `2405e1cb24f4a44fa6183c03a51357f58895a0a9ff1e5376a6506be53cfc493f`. It is byte-identical to the prior source extraction. The decoded core SHA-256 is `ca040870b9150463f5858ac42d0e0c347380010e12ae16d02068dc78048ccd40`. The original classes and symbols used are:

- `GoldProductXMLInfo`, symbol 310: `productID`, `itemID`, `price`, `productType`, `malldiscount`. The `ProductInfo` schema and `GoldProductXMLInfo.parseXML2Obj` have no `Limit` or `LimitedCount` field. Sixty evidence rows have `productType=0`; the three 98-diamond rows 245358–245360 have `productType=-1`. Missing limit fields are not evidence that the server has no limit.
- `ItemXMLInfo`, symbol 108, AMF alias `com.robot.core.config.xmlInfo.ItemInfo`: exact `Max`, `IsMidle`, `ExchangeId`, `TargetId`, `BreedMonID`, `BreedMonLv`, `UseMax`, `BreedTime`, and `VipBreedTime` fields. `getMaxNum` returns the item's `Max` and otherwise defaults to 999. This is an item capacity; no lifetime creature-count interpretation is supplied. `UseMax=1` is retained verbatim and is not converted into a lifetime limit.
- `ItemCmdListener.parseBuyMoneyProduct` in the original application client: an intermediate item (`IsMidle`) with `ExchangeId` dispatches `KTool.doExchange` for quantity 1 and `KTool.doMultiExchange` for larger quantities. This demonstrates that the generic purchase/exchange protocol accepts quantities, but does not prove that any particular historical product bypassed server restrictions. `TargetId` is read but the server exchange result is not recoverable merely from that read.
- `ExchangeXMLInfo` and `ExchangeCitXMLInfo`, symbol 275, and `ExchangeActXmlInfo`, symbol 154: explicit `Limittype`, `LimitCnt`, and `UserInfoId` controls exist in the client. The retained purchase tokens' historical `ExchangeId` values do not join to a row in either recovered table. Therefore no specific limit can be assigned from these tables. The raw XML extractions are retained for replay.

The official [shop_config.xml](https://seer.61.com/resource/xml/shop_config.xml) was freshly fetched: HTTP 200, 37,531 bytes, SHA-256 `9d0d094b47bd36153e62a41d6c5dc16e3937683341d49387654e4e8554b29091`. Its original configuration comments explicitly define `productType=4` as a limited purchase, `checkown` as preventing sale when the listed items are already owned, and `checkBuy` as a bit/value predicate using daily state. **None of the 59 unique retained product IDs is an active row in this current shop configuration.** Consequently its lack of matching rows cannot establish historical unlimited sale or current availability. A search of official web pages did not supply a family-specific duplicate-ownership policy. The [official species page for 猛虎王](https://seer.61.com/main/spirit/289.html) confirms the family identity, not its purchase limits.

## Family-by-family evidence

All product and item references below originate in the official core URL above. `P` is a diamond product ID, `I` an acquisition item ID, `E` its `ExchangeId`, `T` its exact `TargetId`, and `H` a hatch item. `M` is item `Max`, not a lifetime limit. `B` is `BreedMonID`. Direct hatch outputs can be evolved members of the family: 729 belongs to root 346; 811 belongs to root 809. The registry preserves all product prices, source species and full relevant item fields. For bundle products, only the hatch item bound to the row's family is shown here.

| Initial ID | Original name | Status | Exact product/item and hatch evidence |
|---|---|---|---|
| 143 | 卡塔 | unresolved | P200797: I1200714(M=999, E=920) |
| 298 | 迅牙虎 | conditional | P200257: H400119(M=99, B=298); P200260: H400119(M=99, B=298) |
| 346 | 宝贝鲤 | conditional | P200892: I1200812(M=999, E=1249, T=400127) → H400127(M=99, B=729); P245359: I1706584(M=1, E=missing) |
| 373 | 莫顿 | unresolved | P200796: I1200713(M=999, E=922) |
| 506 | 诺特 | conditional | P201028: I1200952(M=1, E=1245, T=400230) → H400230(M=99, B=506) |
| 526 | 托克 | conditional | P201158: I1700141(M=2, E=1411, T=400152) → H400152(M=99, B=526) |
| 539 | 艾克 | conditional | P201027: I1200951(M=1, E=1244, T=400438) → H400438(M=99, B=539) |
| 596 | 史克 | confirmed source breeding; purchase conditional | P201111: I1700078(M=2, E=1348, T=400158) → H400158(M=99, B=596); P201172: I1700164(M=2, E=1406, T=400158) → H400158(M=99, B=596) |
| 598 | 米娅 | confirmed source breeding; purchase conditional | P201025: I1200949(M=1, E=1242, T=400159) → H400159(M=99, B=598) |
| 677 | 草莓多多 | conditional | P200396: H400552(M=99, B=677); P200401: H400552(M=99, B=677) |
| 680 | 蜜桃多多 | conditional | P200398: H400553(M=99, B=680); P200401: H400553(M=99, B=680) |
| 682 | 苹果多多 | conditional | P201040: I1200970(M=1, E=missing); P200399: H400554(M=99, B=682); P200401: H400554(M=99, B=682) |
| 684 | 葡萄多多 | conditional | P200397: H400555(M=99, B=684); P200401: H400555(M=99, B=684) |
| 686 | 蜜瓜多多 | conditional | P200400: H400556(M=99, B=686); P200401: H400556(M=99, B=686) |
| 734 | 电雪球 | conditional | P200353: H400214(M=99, B=734); P200355: H400214(M=99, B=734) |
| 760 | 炎魔 | conditional | P200891: I1200811(M=999, E=1248, T=400133) → H400133(M=999, B=760); P245360: I1706585(M=1, E=missing) |
| 809 | 灵驹 | conditional | P200890: I1200810(M=999, E=1031, T=400207) → H400207(M=99, B=811); P245358: I1706583(M=1, E=missing); P200344: H400207(M=99, B=811); P200346: H400207(M=99, B=811) |
| 818 | 安吉 | unresolved | P201041: I1200971(M=1, E=missing) |
| 831 | 隐形蝶 | conditional | P201026: I1200950(M=1, E=1243, T=400295) → H400295(M=99, B=831) |
| 864 | 托达 | conditional | P200827: I1200738(M=99, E=940, T=400215) → H400215(M=99, B=864); P200360: H400215(M=99, B=864) |
| 897 | 赛特 | conditional | P200831: I1200742(M=99, E=944, T=1500081) → H1500081(M=99, B=897) |
| 917 | 布克 | unresolved | P201044: I1200974(M=1, E=missing) |
| 928 | 瑞诺 | conditional | P200829: I1200740(M=99, E=942, T=1500080) → H1500080(M=99, B=928) |
| 984 | 桑奇 | unresolved | P201043: I1200973(M=1, E=missing) |
| 1002 | 多戈 | conditional | P201154: I1700137(M=2, E=1407, T=400240) → H400240(M=999, B=1002) |
| 1114 | 威尔 | conditional | P201029: I1200953(M=1, E=1246, T=400281) → H400281(M=99, B=1114); P201127: I1700101(M=2, E=1351) |
| 1155 | 威克 | conditional | P201030: I1200954(M=1, E=1247, T=400293) → H400293(M=99, B=1155); P201128: I1700102(M=2, E=1352) |
| 1178 | 蒙奇 | conditional | P200785: I1200702(M=999, E=913, T=400303) → H400303(M=999, B=1178) |
| 1205 | 琳诺 | unresolved | P201039: I1200969(M=1, E=missing) |
| 1226 | 瑞格 | conditional | P200786: I1200703(M=999, E=914, T=400324) → H400324(M=999, B=1226) |
| 1246 | 萨吉 | unresolved | P201042: I1200972(M=1, E=missing) |
| 1259 | 纳尼 | conditional | P200787: I1200704(M=999, E=915, T=400338) → H400338(M=99, B=1259); P201126: I1700100(M=2, E=1344) |
| 1318 | 罗比 | unresolved | P200800: I1200717(M=999, E=925) |
| 1329 | 罗伊 | unresolved | P200799: I1200716(M=999, E=924) |
| 1333 | 闪光迈迈 | unresolved | P201045: I1200975(M=1, E=missing) |
| 1372 | 小娥 | conditional | P200788: I1200705(M=999, E=916, T=400415) → H400415(M=999, B=1372) |
| 1388 | 罗迪 | unresolved | P200801: I1200718(M=999, E=923) |
| 1394 | 魔化瑞诺 | conditional | P200830: I1200741(M=99, E=943, T=400426) → H400426(M=99, B=1394) |
| 1419 | 布尼 | conditional | P200789: I1200706(M=999, E=917, T=400439) → H400439(M=99, B=1419); P201125: I1700099(M=2, E=1342) |
| 1446 | 金翅托达 | conditional | P200828: I1200739(M=99, E=941, T=400457) → H400457(M=99, B=1446) |
| 1481 | 金角 | conditional | P200790: I1200707(M=999, E=918, T=400481) → H400481(M=99, B=1481) |
| 1483 | 合金赛特 | conditional | P200832: I1200743(M=99, E=945, T=400478) → H400478(M=99, B=1483); P200676: H400478(M=99, B=1483); P200677: H400478(M=99, B=1483) |

## Interpretation and remaining work

For the 31 conditional families, the strongest recovered route is premium product → hatch item, or premium product → intermediate item → exact `TargetId` hatch item. Those routes are relevant candidates for repeated collection. The token capacities of 1 or 2 in some routes do not prove a once-per-account cap: an exchanged consumable token may be replenishable, while an account flag may independently block repeat purchase. Conversely capacities of 99 or 999 do not prove repeat sales or repeat exchanges.

The 11 unresolved roots are 143, 373, 818, 917, 984, 1205, 1246, 1318, 1329, 1333, and 1388. Their named items remain valid paid-option evidence; absence of an exact hatch binding is not evidence that duplicates are prohibited. The three 98-diamond tokens 1706583–1706585 have `Max=1`; their limits remain unresolved, and they must not be generalized to the separate older full-price/egg routes for roots 346, 760, and 809.

Breeding two parents and hatching purchased essences are distinct operations. `BreedMonID` binds an essence to its output and does not by itself certify a parental breeding recipe. The official row-6 parental breeding route is separately verified above; other parental recipes are not inferred from purchase items.

To promote a conditional family to confirmed repeatable, recover a family-specific official shop/event module with its `checkown`, `checkBuy`, claimed flags and repeat purchase branch, an explicit official duplicate-acquisition statement, or an official transaction result showing another acquisition after ownership. To establish unlimited acquisition requires stronger evidence than one successful repeat. To label a family lifetime one-time, recover the specific permanent claimed/owned rule and its route scope. Live game purchases were not attempted.

## Validation and handoff

The generated evidence inventory was checked against all 42 existing paid family IDs and all 63 retained evidence records (59 unique product IDs). All product IDs join exactly to symbol 310. Item references and hatch targets join exactly to the full symbol-108 extraction; the purchase-route counts are 31 conditional and 11 unresolved, with zero matching active shop rows. The parental formula adds two confirmed source-supported breeding families (596 and 598), yielding an overall classification of two confirmed source breeding, 29 conditional, and 11 unresolved. This validation checks source semantics and identity, not live server transactions. Raw retained rows, fresh downloads, extracted exchange/item-use XML and the replay script are under ignored `artifacts/repeatable-paid-v24/`. No package, production build, paid run, publication, memory update, or gameplay-policy modification was performed.
