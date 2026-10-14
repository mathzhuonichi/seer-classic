# Dual-type skill import and battle consumption

The catalog contained a substantive import error: **294 of 5,325 retained skills had an official dual type, but every one had been reduced to its first component**. The 217 dual-type species were already represented as constituent arrays, and the existing defender aggregation already ran during ordinary battles. Restoring the skill types activates the previously unreachable dual-attacker path; it does not introduce additional species or skills.

## Official configuration evidence

The primary resource is the official [RobotCoreDLL](https://seer.61.com/dll/RobotCoreDLL.swf), statically recovered under `.cache/classic-robots/`. Its wrapper SHA-256 is `2405e1cb24f4a44fa6183c03a51357f58895a0a9ff1e5376a6506be53cfc493f`; the decoded SWF SHA-256 is `ca040870b9150463f5858ac42d0e0c347380010e12ae16d02068dc78048ccd40`. No ActionScript was executed.

`core-script/scripts/com/robot/core/config/xml/SkillXMLInfo.as` loads the embedded `SkillXMLInfo_xmlClass` bytes, decompresses them, calls `readObject`, and indexes ordinary moves by their `ID`. The associated embedded resource is DefineBinaryData character 324. Its 2,628,053 decompressed bytes decode to 29,246 AMF entries, including moves and effect templates. The audit reader consumed the complete byte stream, rather than stopping after a selected prefix. `getTypeID` returns the move's stored `Type` field directly. The original skill button uses that returned ID to select its `Icon_PetType` artwork; status-category buttons use the separate property icon.

The embedded type table, preserved as `type-ids.xml`, contains 139 records: 26 single types and 113 composites. Composite records explicitly carry constituent IDs. Its SHA-256 is `b5e670b3fb76d29429211fcef5ff04dfa44519d07e90ce09f415540e151ce220`. The import aliases are normalized consistently: steel → mechanical, fight → fighting, dark → shadow, myth → mystic, saint → holy, and demon → evil.

All 5,325 retained skill IDs occur in the official decoded table. Before restoration, exactly 294 type fields disagreed with the official constituents, and every disagreement retained only the first constituent. There were no other skill-type disagreements. Of these 294 skills, 134 are physical and 160 are special; none are status skills.

| Retained skill | Official type ID | Restored components | Previous field |
|---|---:|---|---|
| 11146 沙暴铁碎阵 | 37 | mechanical, ground | mechanical |
| 11154 幻影冲刺 | 30 | flying, psychic | flying |
| 11161 黑水碰撞 | 25 | water, shadow | water |
| 11166 火焰突刺 | 47 | fighting, fire | fighting |
| 11185 水龙击 | 26 | water, dragon | water |

The moves span **29** composite pairs. Twenty-eight match the pairs already present among retained species. The additional evil/mystic pair belongs to moves 11660, 11661 and 11662, which have no retained learnset owner. Nine of the restored skills in total have no retained learnset owner. This distinction prevents the incorrect claim that every restored move is currently learnable by a retained species.

The cached official client is not an authenticated pre-2013 server build. It includes later content and protocol branches. Its configuration establishes the preserved skill IDs and type fields, not the historical server's entire damage implementation. The already-retained 2013 Kylin extension skills remain within the existing content scope; this repair does not change the catalog cutoff or add moves.

Ignored research artifacts are `.cache/dual-type-audit/decode.py`, `official-moves.json`, the pre-restoration `comparison.json`, `restoration.json`, and `partial-stab-learnsets.json`. The decoded move JSON SHA-256 is `c6043808a53cc041b52a999a139aedc4c7063e25620e773f7fd096f4550b7347`. The comparison preserves the original flattened values alongside each official record.

## Type effectiveness and STAB boundaries

The [2011-03-31 article by jason](https://news.7k7k.com/content/20110331/82888.html) describes its own type table and reported battle results. It explicitly distinguishes dual skills from single-component attacks. Its example of water/shadow attacking fighting/fire yields **1.25**, whereas water alone against the same defender yields **1.5**. It also identifies 沙暴铁碎阵 as a dual-type attack. This provides period evidence for both the actual skill distinction and the direction of aggregation; it is a player report, not official server source.

The [2018-02-01 controlled experiment by Orange](https://news.4399.com/gonglue/seer/jingyanxinde/825548.html) independently supports the same grouping direction with matched defense values and twelve recorded battles. Combine the attacking components against each defending component first, then average those results. Do not transpose the grouping or substitute Pokémon's multiplicative rule.

The repair preserves the existing `seer_average` calculation:

- For one attacker component against two defender components, or two attacker components against one defender component, use their mean; two coefficients of 2 produce 4, and a zero coefficient changes the mean to half that mean.
- For a dual skill against a dual defender, apply the preceding combination against each defender component and average the two results. For example, fire/ground against grass/flying remains 0.75 under the retained chart.
- Base-chart values are unchanged. The chart's previously recorded provenance and disputed cells remain separate unresolved questions.

The official packet reader `AttackValue.as` reads lost HP, actual hurt HP, remaining HP and the critical flag from the server. It supplies no recovered STAB calculation. The available [2023 author-written PVE guide](https://jiangshibiao.github.io/Summary-of-Game-Mechanism-in-Seer/index.html) states 1.5 for same-type attacks and recognizes either single component of a dual creature, but does not settle every partially overlapping dual-skill case with an authenticated classic experiment.

Accordingly, the declared remake STAB model is **one 1.5 multiplier when every attack component is present among the creature's types**. A dual creature receives that bonus for its full pair or either constituent. A dual skill sharing only one component with the creature receives no bonus. The partial-overlap rule is a declared calibration, not a recovered historical server constant. The retained learnsets contain 383 dual-skill entries across 161 species and 285 distinct skills; **none have partial component overlap**. Thus this unresolved boundary changes no retained learnset case, while avoiding an accidental bonus for a foreign dual skill in synthetic or externally edited cases.

## Implementation and focused verification

`Skill.type` remains a string. `TypeData.composites` maps normalized composite identifiers such as `mechanical_ground` to the official component array. The registry is synchronized in `data/types.json` and the runtime `gamedata.json`; both skill catalogs restore the same 294 fields. A semantic comparison against the pre-repair Git state confirms that every other skill field, including power, accuracy, PP and effects, is unchanged. Existing JSON formatting is retained.

The central helpers in `typechart.ts` resolve attack components, match a base-type rule against either component, and canonicalize full type identity. Damage hooks, type-gated encounter rules, final-KO type objectives, and type-triggered status reactions use the component-aware helper. A requested composite rule matches the complete pair. Consecutive-type restrictions compare canonical complete identities, so reversed component ordering cannot evade them. Constituent matching for these hooks is the stated remake model; the official configuration alone does not establish every historical trait or encounter exception.

The game adapter resolves the registry for compact Chinese skill labels, including `机械·地面`. Animation frames retain the complete composite identifier. The UI/icon work is performed separately from this mechanics repair.

`tools/verification/dual-types.ts` passed as a Node bundle under the ignored audit directory. Its focused checks cover composite resolution, zero/four-times aggregation, complete and partial STAB, the second component's damage/status hooks, encounter eligibility, final-KO type objectives, canonical consecutive-type identity, all 294 restored skill records and 29 registry entries, and an actual controller skill label. A real retained skill, 11161 黑水碰撞, now calculates **1.25** against species 426's fighting/fire types; the former water-only field calculates **1.5**. With the same level, stats, power and expected random factor, the corresponding expected raw damage values are approximately **93.7059** and **112.4471**. This demonstrates a changed attack calculation, beyond icon presentation.

The affected source also passes `npx tsc --noEmit`. No broad historical test suite, production frontend bundle or native package was built. These checks establish the focused local behavior and configuration restoration, not complete certification of every historical type-chart cell or skill effect.

## Interface and live delivery

The shared attribute renderer now accepts a constituent array or a formatted composite identifier. Canonical and reversed component orders resolve to the same original button artwork. The 29 composite symbols cover the 217 dual-type species and all 294 restored dual skills, including the three skill-only evil/mystic entries. Single types retain their original artwork and tooltip labels. Dex list cards and details, management cards and details, learned-skill lists, battle health panels and battle skill buttons use the shared renderer. A scoped image rule keeps card icons at their intended size instead of inheriting the old 118-pixel creature-image height. The original symbol provenance and hashes remain in `public/type-icons/manifest.json`.

Dex and storage filters offer single-only, dual-only, constituent and exact-pair selections. The supported live browser observed 217 dual-type and 1,266 single-type dex entries. Selecting mechanical/ground returned Bast alone; both its list and detail icons loaded, and hovering the detail icon immediately displayed the complete Chinese dual-type description. Pair selection uses canonical names, so reversed source order does not create duplicate choices. These are UI checks in addition to the configuration and battle checks above.

An isolated browser origin/save acquired Bast through the regular modifier, raised it to level 100, equipped skill11146 through the ordinary learned-skill interface and made it the lead creature. The SPT archive traveled to Reinado's Beta wasteland; Challenge displayed the regular loading screen. The health panel and Sandstorm Iron Crush skill card both displayed the original mechanical/ground symbol. Using the skill spent one PP and dealt 276 damage, lowering Reinado from 1,500 to 1,224 HP. Reinado then used Attribute Copy: its health-panel icon changed from mechanical to the player's complete mechanical/ground type. No image failed to load. Retreat returned through the ordinary battle-end flow. Evidence is retained under the ignored `artifacts/dual-v12/` directory; the player's port-1425 save was not used for these test changes or battle.

Two existing GPT-6.1-sol contributors with high reasoning effort completed the independent mechanics/source audit and original-symbol extraction. Their files are integrated; the main task implemented the shared UI/filter changes and performed live verification. The delivery remains a development preview, with no production bundle or native package.
