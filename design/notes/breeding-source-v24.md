# Source-backed classic breeding, revision 24

The breeding registry contains **eight exact mature-form pairs** and **24 initial-form outcome entries**, with original probability weights. It does not infer compatibility from species families, elements, or arbitrary male/female combinations. All eight rows fit the retained 1,483-species catalog. Two further official rows require species outside that catalog and are excluded in their entirety.

## Official source chain

The official encoded [RobotCoreDLL.swf](https://seer.61.com/dll/RobotCoreDLL.swf) was downloaded again for this investigation. SHA-256 `2405e1cb24f4a44fa6183c03a51357f58895a0a9ff1e5376a6506be53cfc493f` matches the previously recovered encoded source. The corresponding decoded core is SHA-256 `ca040870b9150463f5858ac42d0e0c347380010e12ae16d02068dc78048ccd40`.

`EggsXMLInfo_xmlClass` embeds original symbol **166**. Independent SWF tag-stream extraction recovered its complete ten-row `Eggs` XML. Its `MaleMon`, `FemaleMon`, `OutputMons` and `Probs` fields provide exact parent IDs, initial offspring IDs and percentage weights. `EggsXMLInfo.as` reads `MaleMon` and `FemaleMon` as the egg's actual parents, and its spouse lookups use exact species equality. This is direct client configuration evidence for the allowlist. Original server code and authenticated server responses were not recovered.

The freshly downloaded official [PetBreedPanel.swf](https://seer.61.com/module/com/robot/module/app/PetBreedPanel.swf), SHA-256 `6b8c3ddfc2f23bfc4376338f77085ccf645db2d00ca840256b50bea2b15e4fae`, contains `BreedPanel.as`. The male selector explicitly requires species-fixed male gender, **level >= 50**, and **generation == 0**. Female choices come from the server's `GET_BREED_PET` list of compatible owned capture identities and are filtered by **level >= 50**. The client does not expose an additional female generation restriction; the remake therefore does not invent one. Server-side restrictions beyond the recovered exact table and client filters remain unverified.

The original embedded species XML, symbol **23**, documents `Gender` as 0 unspecified, 1 male and 2 female. `PetXMLInfo.getPetGender()` reads it directly, defaulting to zero. The registry includes all 1,483 retained species' original gender values. These are species properties and do not require randomly assigning sex to owned creatures.

The official [PetBreedBook.swf](https://seer.61.com/module/com/robot/module/book/PetBreedBook.swf), SHA-256 `d42207c5bb360ae52e2953332708a4aac804b19a2f84ed49df6bda5c9a17ed2a`, explicitly describes fixed breeding combinations, a minimum level, 24 hours of breeding and 72 hours of chamber recharge. The panel additionally requires 5,000 Seer beans. The formula book's text says greater than 50, while the executable panel and the introductory handbook permit level 50; the implemented threshold follows the executable `>= 50` check.

## Exact retained registry

The output columns preserve the original XML order and weights. Every output is a retained initial form, including the two parental-family infants.

| Egg ID | Male mature form | Female mature form | Initial outputs and weights |
|---|---|---|---|
| 1 | 450 格拉诺 | 447 格兰诺 | 445 兰妮 35%; 448 卡拉 35%; 512 格多 30% |
| 2 | 253 嘟噜噜王 | 256 嘟咕噜王 | 252 嘟噜噜 35%; 254 嘟咕噜 35%; 519 绿毛球 30% |
| 3 | 516 奈落达尔 | 470 米奈希尔 | 515 奈落 35%; 469 米奈 35%; 517 小艾 30% |
| 4 | 525 咕咕果 | 295 迷你果 | 523 咕咕芽 35%; 293 迷你芽 35%; 533 古鲁芽 30% |
| 5 | 337 赤西西比 | 549 妮洛娜 | 335 赤甲虫 35%; 547 紫炎虫 35%; 550 托托 30% |
| 6 | 597 史密斯 | 599 吉米丽娅 | 596 史克 50%; 598 米娅 45%; 600 安洛达斯 5% |
| 7 | 67 布林克斯 | 606 克斯莉 | 65 林克 30%; 604 莎莉 30%; 607 尼洛 40% |
| 8 | 962 奈哲尔 | 965 奈尼尔 | 960 哲克 5%; 963 尼坦 5%; 977 哲尔尼 90% |

Original rows 9 and 10 require females 1786 and 1517 and hybrid offspring 1787 and 2182, respectively. They cannot be represented as complete retained-catalog breeding recipes. NPC partner species 122–125, divine campaign families and Puni are absent from all accepted parent and offspring IDs; the focused verifier independently checks the existing conservative exclusion set.

The cached official configuration names the ice-family female initial form **莎莉**, not the informal guide spelling 莎莎. UI names follow the original retained catalog. No Seer 2 or Pokemon compatibility, egg groups, or inheritance rules were imported.

## Remake behavior and pure API

The user explicitly selected immediate random acquisition of a parental infant or the combined offspring, preserving original weighted outcomes. The controller combines breeding and hatching into one immediate acquisition of a level-1 creature, preserves both parents, and records generation 1 on the child. The user separately and explicitly selected free breeding, following the existing fusion simplification. Currency, materials, breeding/hatching waits and chamber recharge are omitted. These are authorized remake simplifications, not recovered historical mechanics.

`src/progression/breeding.ts` exports `BREEDING_RECIPES`, `getBreedingGender(species)`, `findBreedingRecipe(firstSpecies, secondSpecies)`, `canBreedParents(recipe, first, second)`, `chooseBreedingOutcome(recipe, roll)` and `breedingEggItemId(species)`. Recipe parents are readonly arrays containing only each row's single exact mature form. `offspringSpecies` identifies the combined offspring for titles; `outcomes` lists all three actual random rewards. `maleInitialSpecies` and `femaleInitialSpecies` identify the parental-family infants independently of XML order.

The pure eligibility helper requires distinct nonempty owned-creature identities, exact official species compatibility, original species-fixed opposite genders, integer levels at least 50, and male generation zero. The game controller remains responsible for current ownership, storage capacity, reward creation, save persistence and RNG transaction behavior. Missing generation on existing saves means zero. The female generation policy follows the exposed client check; the full historical server policy cannot be established from this extraction.

The handbook states qualitatively that descendants inherit their parents' abilities. Neither the extracted XML nor the recovered panel contains a numerical inheritance formula. This pass does not claim historical IV, nature, trait or move inheritance, and the pure registry exports no invented inheritance formula. Controller-generated offspring follow the existing remake creature generation behavior.

## Verification and handoff

`node tools/verification/breeding.mjs` passes all eight exact parent joins against the independently extracted original XML, original probability weights, all 24 retained initial offspring entries, all 1,483 gender values' coverage, level-50 eligibility and level-49 rejection, reversed selection order, distinct identity rejection, immature-form rejection, male generation-one rejection, and the exposed client female generation-one eligibility. NPC/divine examples and invalid RNG rolls are rejected. Each cumulative-probability interval produces its exact corresponding outcome.

The focused verifier records its registry evidence under ignored `artifacts/breeding-v24/registry-verification.json`; direct original downloads, decompiled modules and symbol-166 XML remain under ignored `.cache/breeding-v24/`. It requires the extracted XML cache when replayed. This pure registry verification is separate from controller settlement, persistence and acquisition-route verification performed by integration workers. No build, package, publication, paid run or commit was performed by this source investigation.

Independent controller verification now passes `node tools/verification/breeding-controller.mjs` through Vite SSR using the actual game controller and catalog. Controlled original RNG states exercise every one of the 24 weighted branches across all eight pairs. Every reward is level 1, generation 1, has the original species-fixed gender in its view, and records acquisition by breeding. Existing parents remain byte-equivalent, coins/items/experience remain unchanged, and the same valid parents can breed again through save/reload. The check also advances a real male parental infant through `gainLevels` and `autoEvolve` to its level-50 mature form and confirms that its retained generation 1 still excludes it from breeding. Female generation 1 remains eligible under the exposed client policy.

Controller rejection checks preserve the complete serialized save, including RNG, for active battles, unknown recipes, non-owned identities, identical parent identities, immature species, level 49, second-generation males and full storage. Full parties receive the child in storage. Missing generation on legacy creatures displays zero. Malformed negative, fractional, string and null generation values fail deserialization and explicit import without changing the existing game. The original source catalog remains unchanged across all test fixtures. Startup's pre-existing invalid-save fallback is distinct from explicit import rejection and was not altered. Complete controller evidence is saved under `artifacts/breeding-v24/controller-verification.json` and its log. `tsc --noEmit` passed after integration converted acquisition dependencies to the finalized readonly-array recipe API.
