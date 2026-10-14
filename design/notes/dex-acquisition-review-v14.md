# Encyclopedia acquisition review, version 14

Date: 2026-10-03. Scope: all 1,483 retained species and the actions that a player can actually execute through the world, challenge archive, campaigns, missions, inventory, and raising panel. The explicit modifier, imported collections, and arbitrary remote training targets do not count as normal acquisition routes.

## Result and completeness boundary

**The acquisition gap should be assessed by evolution family, rather than treating every missing form as an independent acquisition task.** The earlier species count already included every executable forward evolution of an obtainable seed; it did not omit evolutions. Source-defined ancestry groups the 1,483 retained forms into 634 families. After the first simplified habitat batch, **79 families are fully obtainable, 60 are partially obtainable, and 493 have no normal acquisition route**; two families are wholly excluded. The family denominator is therefore 632, and 139 families have at least one obtainable form.

| Final family coverage | Count | Meaning |
| --- | ---: | --- |
| Fully obtainable | 79 | Every eligible form has an executable route |
| Partially obtainable | 60 | Some forms have routes, while a base acquisition or transformation is missing |
| Entirely missing | 493 | No eligible form has a normal route |
| Wholly excluded | 2 | The complete Incaros-linked 122–124 family and Saggros 125 |
| Eligible families | 632 | Full, partial, and missing families combined |

The complete [family list](../../artifacts/dex-acquisition-v14/acquisition-families.md) reports all member IDs and names, obtainable and missing forms, and excluded forms in each group. The graph joins actual forward evolution rules and the source's `evolves_from` relationships for classification. A relationship used to group forms never creates an executable evolution or acquisition action. Branches and upgraded forms remain in their source-defined family, so a classic three-stage line can be obtainable while a later retained branch makes its wider family partially obtainable.

The subordinate final form count is 279 of 1,479 eligible forms obtainable, with 1,200 forms missing. Those 1,200 forms belong to fewer families; they do not imply that 1,200 new habitats must be created. The user's collection scope excludes both complete example families: 122 达尔, 123 希路达, and 124 英卡洛斯 form the Incaros-linked family; 125 萨格罗斯 forms the Saggros family. All four forms remain available through the explicit modifier, but do not count toward ordinary collection or missing-family coverage. This is a collection design policy, not a new historical universal-negative claim. Zero catch rate alone is not an exclusion rule.

| Measure | Count | Meaning |
| --- | ---: | --- |
| Retained encyclopedia entries | 1,483 | The actual runtime species bundle |
| Deliberate NPC exclusions | 4 | Both complete example families: IDs 122–125 |
| Collection denominator | 1,479 | Retained entries minus deliberate exclusions |
| Species with implemented routes | 279 | Dedicated acquisition plus executable forward evolution |
| Species with direct acquisition | 160 | At least one gift, mapped capture, named reward, campaign, or mission route |
| Species reachable only by evolution | 119 | No direct acquisition action is implemented |
| Species still missing | 1,200 | All IDs and names are retained in the complete generated list |
| Reachable only through authored fallback challenge essences | 49 | Remake rewards, not evidence of original historical acquisition |
| Reachable without fallback challenge essences | 230 | This narrower count still includes authored world layout and remake simplifications |

Direct-route categories overlap: 33 species have mapped wild capture, 119 have a named non-campaign essence challenge, six have a final campaign essence, three have mission rewards, and three have initial gifts. The seven campaign definitions include six collection campaigns and Rei's skill training; the latter does not grant a new species. There are 179 current encounter files, rather than the historical 162 embedded in the original bundle.

The pre-correction implementation reached 190 species under the same route definition. The fixes, YiYi placement, and four simplified base habitats add 89 reachable species, with no species losing its implemented route. This comparison removes the three repaired evolution edges and the five added base habitats, and emulates the old final-enemy essence binding; it is a reconstructed implementation baseline, not a historical player-save measurement.

## Form-level detail and complete lists

The family list is the primary planning view. The complete, unabridged missing-form IDs and recovered Chinese names are in [missing-species.md](../../artifacts/dex-acquisition-v14/missing-species.md). The machine-readable [audit.json](../../artifacts/dex-acquisition-v14/audit.json) contains every encyclopedia entry, its normal routes or missing status, source hashes, all tested habitats, every explicit essence binding, and reachable evolution edges. These bulk outputs are intentionally ignored by Git and can be regenerated with the tracked runner below.

| Missing group | Count | Diagnosis |
| --- | ---: | --- |
| Explicit boss infant rewards still unbound | 0 | The existing source hatch bindings are now respected |
| Unimplemented evolution of an obtainable predecessor | 17 | Reverse ancestry exists, but no executable transformation is supplied |
| Inferred-wild metadata without a mapped habitat | 284 | A positive catch rate does not create an encounter location |
| Missing base acquisition | 287 | No implemented seed gift, mission, habitat, or named reward |
| Descendants of unavailable predecessors | 612 | A retained ancestry relationship cannot supply an absent seed |

The groups partition the 1,200 missing entries. The immediately actionable transformation group is complete here: 367 海纹蝶; 368 炽翼蝶; 1121 巨石灵王; 1143 鲁迪诺斯; 1192 巨蘑怪; 1216 魔域仙子; 1230 巨齿鲨; 1237 洛拉托兹; 1266 萨帕罗亚; 1277 雷纳尔多; 1297 布鲁卡卡; 1298 里奥杰斯; 1316 寒冰之魂; 1317 裂冰之魂; 1346 格鲁斯特; 1361 阿克妮丝; 1464 吉纳波斯. Their transformations need individual acquisition decisions; they must not all be recast as ordinary level evolution.

Familiar missing seeds also include 19 利利, 62 格林, 71 派派, 74 果冻鸭, 77 尼尔, 91 悠悠, 119 莱尼, and 178 达比拉. The wider generated list remains authoritative for this implementation audit. These examples are priorities for acquisition research, not a claim that each has the same original mechanism.

## What counts as an executable route

The audit follows forward actions, rather than trusting `obtain`, `catch_rate`, `evolves_from`, a boss team member, or an essence template in isolation.

1. Initial gifts are the actual fresh-save species 1, 4, and 7, at level 5.
2. A wild route requires a species in an actual region's `creatures` list, positive capture support, no controller redirection to a named boss, and a successful real capsule action. All 33 mapped species passed that capture probe. Ordinary knockouts do not recruit their target.
3. A challenge route requires an essence reward on a named encounter or an existing, explicitly labeled remake fallback reward. The runtime item registry must bind that essence to a real species, victory must place it in inventory, and the inventory action must hatch it. A boss opponent alone does not grant every member of its team.
4. A campaign route follows the existing ordered stages and final reward. Intermediate guardians, avatars, seals, and skill training do not independently supply collection rewards. The essence metadata is inspected alongside the campaign definitions; full original-difficulty clears of every campaign were not performed in this review.
5. Missions use the three actual `claimQuest` actions and their controller prerequisites. The current SPT mission checks any recorded boss clear, which is broader than a strict SPT-category clear; this is the implemented prerequisite.
6. Evolution only extends an already obtainable seed through a forward rule accepted by `evolutionOptions` at a valid level. Reverse ancestry and unused special-evolution metadata do not count. Newly restored chamber evolutions require manual confirmation.

## Focused corrections

### Original infant essence bindings

`src/game.ts` previously created essence items from the last enemy species and ignored `reward_hatches`. The inventory then hatched the adult opponent, leaving numerous infant forms without a normal route. It now uses `resolveEncounterEssenceSpecies`, which honors the original reward binding first. All 53 explicit runtime essence bindings were checked; 49 bind a species different from the final enemy.

For example, defeating the named Liaosi encounter now grants its existing essence and hatches 41 胡里亚, which can evolve into 42 里奥斯. The real reward, inventory consumption, hatch, and reload transaction passed with a one-HP opponent fixture and a guaranteed-hit player move. Those fixture edits isolate reward wiring from combat randomness. The fixture establishes action wiring and reward identity; it does not establish that the original boss is balanced or normally beatable with the initial team. Existing chance and timing simplifications are retained.

### Three omitted manual evolution edges

The modern source uses an evolution branch table for several classic chamber evolutions. Their forward `EvolvesTo` value is zero, so importing only that field omitted the path. The existing official client snapshot supplies both the minimum level and branch target:

| Source species | Minimum level | EvolvFlag | Branch target | Executable correction |
| --- | ---: | ---: | --- | --- |
| 111 雷格 | 19 | 11 | 112 雷顿塔 | Manual level evolution |
| 112 雷顿塔 | 39 | 12 | 113 雷纳多 | Manual level evolution |
| 671 冰妖 | 26 | 35 | 672 亚伦斯 | Manual level evolution |

The source species JSON, catalog index, and executable `gamedata.json` now agree on these three edges. `automatic: false` preserves confirmation in the raising panel. Actual named-boss reward fixtures produced the infant forms; after fixture leveling, the controller executed both chains and retained them across reload. `autoEvolve` left the infant form unchanged. The test fixture levels isolate transformation wiring from experience grind.

Primary evidence is the official [RobotCoreDLL.swf](https://seer.61.com/dll/RobotCoreDLL.swf), already recovered through the official client loader chain. `PetXMLInfo_xmlClass.as` identifies binary 23, and `EvolveXMLInfo_xmlcls.as` identifies binary 44. Binary 23 retains `EvolvingLv` and `EvolvFlag`; binary 44 maps flags 11, 12, and 35 to the targets above. None of those three branch records specifies an evolution resource. The decoded SWF SHA-256 is `ca040870b9150463f5858ac42d0e0c347380010e12ae16d02068dc78048ccd40`. The extracted XML hashes are `bc1fd07bdad0f5086807a8c91d6e27e9638f8ec6fed28c44468a15281d08214d` for pets and `f88fa14c15e7fe725e848c152de4a30bdd3e4bb2988429be66290ba6184ad80d` for evolution branches. Extracted snapshots are retained under ignored `.cache/dex-acquisition-v14/`. The [2010 original evolution guide](https://news.7k7k.com/content/20100408/40765.html) independently states the 19/39-level 雷格 chain. The retrieved official client is a later retained configuration; it is not by itself a dated 2009 server snapshot.

### Encyclopedia collection status and real destinations

The controller now adds current roster species to saved `seen` and `owned` records before persisting, so manual or automatic evolution can register a newly held form. Prior collection records remain intact, and existing saves gain entries for their current roster. This does not reconstruct an evolved intermediate that was never recorded and is no longer held.

`src/progression/acquisition.ts` supplies route descriptions for actual habitats, named challenges, campaigns, missions, initial gifts, and obtainable evolution seeds. The encyclopedia exposes those specific actions and explicitly states when a route is absent or intentionally excluded. Its callback passes the selected route to `App.tsx`; evolution entries retain the destination of their obtainable seed.

The old encyclopedia shortcut was a real bypass: it could select a catalog entry without a habitat, place an invisible remote selection at the ship, and call `startTraining`. That action either spawned any inferred-wild species or synthesized `recruit-<species>` and its essence. This made most unimplemented catalog entries appear collectible through normal-looking UI. The revised encyclopedia does not advertise that fallback. Root integration also removes the map's remote-selection fallback. Normal recruitment rejects all four forms in the two excluded NPC-partner families; explicit modifier acquisition remains available.

YiYi is exactly 83 依依, with ordinary level evolutions to 84 依丁丝 at 17 and 85 依卡莱恩 at 35. Root places 83 in `klose/forest` at level 15. The [original 4399 capture guide](https://news.4399.com/seer/xyjl/201009-11-77224.html) places it in Klose forest and describes the flame-projector setup and five-turn capture limit. This delivery uses the existing ordinary capsule interaction there; the equipment setup and original escape timer are not claimed as implemented. The separate shiny line 442–444 is not substituted for classic YiYi.

## Exclusion evidence and limits

The family-level exclusion implements the user's explicit collection scope for the two example NPC-partner families. The cited historical evidence provides context rather than establishing a universal absence of earlier player acquisition. The [March 2012 Incaros event announcement](https://games.sina.com.cn/w/n/2012-03-01/1610589262.shtml) describes Justin's partner and a challenge rewarding individual-value improvements and experience. The [original September 2014 Saggros guide](https://news.4399.com/gonglue/seer/saiergonglue/201409-10-426515.html) describes player acquisition by evolving 萨罗德; that later event is outside the retained pre-2013 catalog cutoff. The 2014 guide does not prove a universal negative for every earlier event. Incaros-related infant forms are excluded here because the user grouped initial and advanced forms into one collection family; no additional historical claim about 122 or 123 is inferred. No other family is excluded solely from catch rate or reverse ancestry.

This is a complete implementation coverage audit with representative transaction fixtures and complete mapped-capture probes. It is not a catalog-wide historical acquisition reconstruction or a full campaign-difficulty playthrough. Forty-nine reachable species rely wholly on authored fallback rewards; their labels must retain that qualification. The remaining missing families and incomplete family branches need reviewed content or a supported deliberate exclusion; a generic remote encounter would conceal the gap. A base-form placement can resolve several missing forms at once.

## Simplified, source-supported habitat batch

The user's current direction is to simplify acquisition and put base forms on their correct maps when practical. Historical equipment, lotteries, timers, and lengthy task chains do not need to be reproduced. The delivered first batch uses four existing scenes and four already capturable base forms; their ordinary forward level-evolution chains are intact. Root integrated the world and scene changes. The actual captured seeds then passed controller evolution and reload probes for 105–106–107, 116–117–118, 128–129–130, and 153–154–155. Level-100 fixture preparation isolates evolution wiring from experience grind; the capture and subsequent evolve actions are real controller transactions.

| Base form | Implemented destination | Source-supported map identity | Simplification |
| --- | --- | --- | --- |
| 116 卡卡 | `cecilia/snow`, original map 40 | Cecilia's first surface layer | Visible ordinary capsule encounter |
| 105 丁格 | `beta/surface`, original map 49 | Beta wasteland | Visible ordinary capsule encounter |
| 128 波古 | `byron/space`, original map 315 | Byron's mysterious space | No eye-mask or shadow-collection prerequisite |
| 153 小莹蜂 | `cloud/high`, original map 26 | Cloud's second/high layer | No freezing-gun prerequisite |

The original [December 2009 distribution guide](https://news.4399.com/seer/jingyanxinde/200912-26-59738.html) identifies 卡卡 on Cecilia's first layer and 丁格 in Beta's wasteland. The original [October 2009 波古 capture guide](https://www.07073.com/webgame/yangcheng/saierhao/xinde/327083.html) identifies Byron's mysterious space and describes the original equipment and collection steps. The original [November 2009 小莹蜂 capture guide](https://www.07073.com/webgame/yangcheng/saierhao/xinde/334291.html) identifies Cloud's second layer. These original guides support map identity; direct visible capture is the requested remake simplification. Region level ranges remain remake balance choices. No unsupported habitats are introduced for evolved forms.

The familiar 19 利利 and 62 格林 families remain future options. Original guides establish their early habitats, but also state that those wild routes were discontinued. They are not included in this batch. There is also no new claim that the missing 74 果冻鸭 belongs in Helka ruins: the period source places it in the distinct underground creature plaza, which is not a modeled region here.

The 17 missing transformations of available predecessors were checked against the official primary XML snapshots. None is an additional simple level branch to restore: 呆呆蛹's branches to 367/368/369 require 30 units of specific resources under flag 23 at level 30; 鲁加斯's branch to 1143 requires item 1200047 under flag 48. The other 14 missing target forms have no forward branch/level rule in this recovered snapshot. Their reverse ancestry supports family grouping, not a fabricated level evolution. The complete field-by-field comparison is retained in [special-transformation-review.json](../../artifacts/dex-acquisition-v14/special-transformation-review.json). This review adds no resource framework.

## Next-batch priorities

1. Select a small group of missing families whose original base-form habitats match existing modeled scenes. Add visible capsule capture and let the already implemented evolution rules provide the rest of each line.
2. Fill partial classic families by adding their missing base forms on source-supported maps. An existing adult challenge reward does not replace a sensible family entry point.
3. For special transformations, choose a clearly labeled simple remake route after checking its canonical location and family identity. Avoid lengthy historical equipment or resource-collection reproductions unless the user asks for them.
4. Keep accepted fallback rewards labeled and continue reviewing batches against sources. Do not create hundreds of arbitrary habitats or turn every encyclopedia entry into remote recruitment.

## Reproduction and checks

Run from the repository root using the existing Vite dependency:

```sh
node --input-type=module - <<'JS'
import {createServer} from 'vite';
const server = await createServer({server: {middlewareMode: true}, appType: 'custom'});
try {
  const {runDexAcquisitionAudit} = await server.ssrLoadModule('/tools/verification/dex-acquisition.ts');
  console.log(JSON.stringify(runDexAcquisitionAudit(), null, 2));
} finally {
  await server.close();
}
JS
```

The focused runner verifies every mapped capture, all explicit essence bindings, 139 reachable forward evolution edges, source/bundle consistency for the three repaired species, actual victory-to-hatch and reload transactions, manual confirmation and collection registration, and normal NPC-recruitment rejection with modifier access retained. Large outputs stay in ignored artifacts. No production bundle, native package, broad legacy test suite, or paid run is part of this review. Browser interaction verification belongs to the root integration and is reported separately.

Final integrated TypeScript checking (`npx tsc --noEmit`) and whitespace checking (`git diff --check`) passed. The family partition, all 33 mapped captures, and the four added families' capture/evolution/reload transactions passed in the final runner snapshot.
