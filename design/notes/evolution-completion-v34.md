# Special evolution completion v34

Historical policy: revision 35 supersedes the automatic special transitions and three Lv.1 gates described below. See [evolution-skins-v35.md](evolution-skins-v35.md) for the current manual policy and Lv.60 overrides.

## Result and approved policy

The user approved simplifying the 32 remaining special and super-evolution forms into level evolution, using original target-specific source levels where available. These forms now have executable forward transitions. The independently exported acquisition closure reaches all 1,479 eligible forms; the four existing NPC-only forms remain excluded. All 632 initial forms, 34 fusion recipes, eight breeding recipes, and 316 collection rewards remain reachable.

This adds 32 transitions from 30 predecessors and preserves every v33 mechanical and traditional branch rule. The runtime catalog, per-species records, and catalog index are generated together. `data/evolution-rules.json` retains the original 32-form omission list as `resolvedHistoricalMissingForms`, with each exact resolution; its current `deferredMissingForms` list is empty.

- Six item-trigger conversions retain the literal original levels: 63, 34, 1, 40, 1, and 1. They now evolve automatically without their original item costs.
- Twenty-six conversions have no target-specific level in the pinned configuration. Their explicit remake threshold is 60, then 70 and 80 for successive special stages.
- The two genuine special forks, from 67 and 739, require a manual choice at level 60. Their initial forms are 65 and 738. Existing repeat acquisition and six-per-species limits still apply.
- Other special conversions use one mature predecessor and automatic evolution, preserving normal family chains. The sole reverse-ancestry adjustment is 1459: runtime predecessor 79 replaces source `EvolvesFrom=77`, with the original value retained in provenance.

## Source evidence and its limits

The pinned official source is `https://seer.61.com/dll/RobotCoreDLL.swf`, retrieved on 2026-10-14. The original wrapper/payload hashes and the two v33 XML hashes remain unchanged. Binary 160 was extracted from that same cached core without executing ActionScript:

| Binary | Symbol / file | SHA-256 |
|---|---|---|
| 23 | `PetXMLInfo_xmlClass` / `23-PetXMLInfo_xmlClass.xml` | `bc1fd07bdad0f5086807a8c91d6e27e9638f8ec6fed28c44468a15281d08214d` |
| 44 | `EvolveXMLInfo_xmlcls` / `44-EvolveXMLInfo_xmlcls.xml` | `f88fa14c15e7fe725e848c152de4a30bdd3e4bb2988429be66290ba6184ad80d` |
| 160 | `SuperEvoXMLInfo_xmlCls` / `160-SuperEvolves.xml` | `9fb8c3a1b0c8ee38b0c8f052060ad00f5bfdec54aff757d10505658b748b8b85` |

For the six item conversions, `PetXMLInfo.EvolvFlag` selects a record in `EvolveXMLInfo`; that record's `Branch.MonTo` matches the target and the parent's `EvolvingLv` is the specific source gate. The three literal values of 1 belong to item-gated conversions. Removing the item requirement makes those conversions immediately level-eligible once the predecessor exists; it does not establish that the original game had ordinary level-one evolution. This consequence is an explicit part of retaining the source values.

`SuperEvolves` supplies an explicit forward `Origin`/`Target` relation for 17 of the 32 targets, including two also covered by conditional item branches. None of those applicable records supplies a level. The other 11 targets have only reverse `EvolvesFrom` evidence in these pinned tables; converting that relation into a forward level transition is a remake decision. Original item IDs, counts, raw attributes, and overlapping retained-client entries remain in the policy JSON. Later entries in the retained client do not establish a 2012 availability date.

Complete activity-script and server-side restrictions were not recovered or verified in this pass. Absence of a level in these tables therefore means no verified target-specific level in the inspected evidence, not proof that every historical activity had no level restriction. The source JSON distinguishes `source-gate` from `remake-fallback`, preserving `originalLevel: null` for the latter.

## Exact transitions

"Source gate" means the literal item-conversion level from binaries 23/44. "Remake fallback" is not an original level assertion. Only the two paired forks are manual.

| From | To | Runtime level | Level evidence | Selection |
|---|---|---:|---|---|
| 398 杰拉德 | 432 杰西卡 | 63 | Source gate | Automatic |
| 651 诺奇 | 652 诺拉德 | 34 | Source gate | Automatic |
| 347 远古鱼龙 | 729 鱼龙王 | 1 | Source gate; original item gate removed | Automatic |
| 810 灵光兽 | 811 始祖灵兽 | 40 | Source gate | Automatic |
| 601 火刃 | 881 炽焰之刃 | 1 | Source gate; original item gate removed | Automatic |
| 821 烈焰火狐 | 1017 三尾火狐 | 60 | Remake fallback | Automatic |
| 1017 三尾火狐 | 1018 四尾火狐 | 70 | Remake fallback | Automatic |
| 1018 四尾火狐 | 1019 九尾火狐 | 80 | Remake fallback | Automatic |
| 1120 阿洛比斯 | 1121 巨石灵王 | 60 | Remake fallback | Automatic |
| 999 珀伽索斯 | 1122 圣光天马 | 60 | Remake fallback | Automatic |
| 55 鲁加斯 | 1143 鲁迪诺斯 | 1 | Source gate; original item gate removed | Automatic |
| 47 蘑菇怪 | 1192 巨蘑怪 | 60 | Remake fallback | Automatic |
| 1214 尤米尔 | 1215 尤米娜 | 60 | Remake fallback | Automatic |
| 29 魔花仙子 | 1216 魔域仙子 | 60 | Remake fallback | Automatic |
| 34 钢牙鲨 | 1230 巨齿鲨 | 60 | Remake fallback | Automatic |
| 37 洛吉拉斯 | 1237 洛拉托兹 | 60 | Remake fallback | Automatic |
| 1237 洛拉托兹 | 1238 炽翼火龙 | 70 | Remake fallback | Automatic |
| 400 萨帕克 | 1266 萨帕罗亚 | 60 | Remake fallback | Automatic |
| 113 雷纳多 | 1277 雷纳尔多 | 60 | Remake fallback | Automatic |
| 500 阿尔比零 | 1278 阿诺比零 | 60 | Remake fallback | Automatic |
| 1278 阿诺比零 | 1279 时空之零 | 70 | Remake fallback | Automatic |
| 110 布鲁克克 | 1297 布鲁卡卡 | 60 | Remake fallback | Automatic |
| 42 里奥斯 | 1298 里奥杰斯 | 60 | Remake fallback | Automatic |
| 67 布林克斯 | 1316 寒冰之魂 | 60 | Remake fallback | Manual branch |
| 67 布林克斯 | 1317 裂冰之魂 | 60 | Remake fallback | Manual branch |
| 64 格鲁奇高 | 1346 格鲁斯特 | 60 | Remake fallback | Automatic |
| 50 阿克希亚 | 1361 阿克妮丝 | 60 | Remake fallback | Automatic |
| 739 哈德萨 | 1428 哈德罗卡 | 60 | Remake fallback | Manual branch |
| 739 哈德萨 | 1429 哈德莱斯 | 60 | Remake fallback | Manual branch |
| 79 艾斯菲亚 | 1459 艾菲德斯 | 60 | Remake fallback | Automatic |
| 239 吉娜斯 | 1464 吉纳波斯 | 60 | Remake fallback | Automatic |
| 197 亚梅丝 | 1473 亚梅迪丝 | 60 | Remake fallback | Automatic |

## Canonical predecessor for 1459

Binary 160, `SuperEvolve ID=13`, explicitly lists `Origin="77 78 79"` and `Target="1459"`. Choosing mature 79 is therefore supported by the original forward configuration. The remake keeps 77 to 78 at level 17 and 78 to 79 at level 37, then adds 79 to 1459 at remake level 60. The ordinary level 17 is not reused as evidence for the super-evolution.

The source target's reverse `EvolvesFrom=77` is preserved under `source.targets[].targetMonster` and `ancestryAdaptation`. The runtime reverse link becomes 79 so the acquisition graph and the executable forward chain agree. Keeping the raw 77 link in the runtime catalog would create a shorter, unimplemented path in the initial-form view. No other reverse-ancestry field is changed.

The same mature-predecessor policy is used for the other super-evolution origin lists. It does not add shortcuts from their infant or intermediate forms, so ordinary automatic chains do not become artificial manual branch points.

## Reproduction and checks

```sh
python3 tools/assets/build_evolution_rules.py --source-dir /path/to/extracted-xml
python3 tools/assets/build_evolution_rules.py --source-dir /path/to/extracted-xml --check
```

The directory must contain all three pinned XML files above. The existing default remains `.cache/evolution-v33`. The generator verifies source hashes, matching conditional targets, every selected super-evolution predecessor, literal source gates, and the exact six-source / twenty-six-fallback partition. It records 91 total policy transitions: the original 43 mechanical and 16 traditional branch transitions plus these 32 special transitions.

The second generator run reports zero changed files. A field-level comparison against v33 commit `6e92e09` verifies that all previous v33 rule objects are identical, only the 30 new parent evolution arrays and notes change, and only species 1459 additionally changes reverse ancestry and its note. All other catalog fields, including stats, learnsets, types, and acquisition metadata, remain unchanged. The updated per-species records match their bundled catalog records.

The independent acquisition exporter reports 1,479/1,479 eligible forms, 632 complete non-NPC families, and no missing forms, blocked fusion recipes, blocked breeding recipes, or blocked collection rewards. Controller and browser checks are separate from this data/source audit.

## Final gameplay verification

- `evolution-specials.mjs`: 79 checks passed for all 32 transitions, source/remake level evidence, target caps across essence aliases, legacy level-100 instances, interrupted automatic chains, immutable snapshots, and preservation of identity and existing save fields. Both new branch families pass actual repeated capsule captures from their existing maps, with the six-copy cap and slots released by evolution. All prior catalog fields and forward transitions are independently compared with commit `6e92e09`; only the declared evolution fields and the one ancestry adjustment change.
- `evolution-branches.mjs`: all 82 existing mechanical and traditional-branch checks passed. `dex-acquisition.ts` checks 847 executable evolution edges, 205 mapped capture species and 54 original essence bindings, with no previously obtainable form losing its route. An actual hatched 111 reaches 113 through ordinary pooled experience at level 39 and 1277 at level 60; the unrelated 671-to-672 manual transition remains unchanged.
- The fresh independent exporter at `../analysis/codex-takeover-2026-10-14/evolution-v34-final/` confirms 1,479/1,479 eligible forms, 632/632 initial entries, 34/34 fusion recipes, 8/8 breeding pairs and 316/316 recruitment rewards. These are executable-route and controller checks, not a claim of completing every campaign at normal difficulty.
- TypeScript and generator checks passed. Acquisition-policy regeneration changes only the catalog SHA-256, and habitat regeneration changes only its policy SHA-256; all 217 existing placements remain identical.
- An isolated browser test origin confirms that a level-60 67 waits for selection and evolves into the selected second branch, 1317. A held 347 can also be manually evolved to 729 without an evolution item under its retained level-1 gate. Test fixtures were prepared through the visible modifier; the controller tests separately exercise normal acquisition. Browser warnings and errors are empty. Screenshots are retained in `../analysis/codex-takeover-2026-10-14/browser-v34/`, and the main preview save remains untouched.

This revision updates development source only. No production package or remote push was made.
