# Challenge destination expansion: source audit

The current catalog has **48 `spt` records, representing 46 species**, plus 31 `legendary` records after the campaign additions. All 48 SPT records match both official SPT XML files by the first enemy's species ID. Their complete encounter IDs, official local map IDs, and habitat labels are retained in `.cache/atlas-source/spt-encounter-locations.json`. The implementation baseline had only Pano, Kalan, and Rogue, with twelve planetary destinations and the ship. The required expansion adds Rift and Helix, the missing destinations below, and a separate space-station route. No current encounter requires the sixth galaxy, Titan.

## Primary evidence and identity rules

The official source chain is [Client.swf](https://seer.61.com/Client.swf), `config/seer.xml` → `config/dll.xml` → [RobotCoreDLL.swf](https://seer.61.com/dll/RobotCoreDLL.swf). The original `net/DLLLoader.as` removes seven wrapper bytes and inflates the remaining payload. The cached encoded core SHA-256 is `2405e1cb24f4a44fa6183c03a51357f58895a0a9ff1e5376a6506be53cfc493f`; the decoded SWF hash is `ca040870b9150463f5858ac42d0e0c347380010e12ae16d02068dc78048ccd40`.

The following tables were extracted from that core. These are current mutable official snapshots containing both legacy and later records; a legacy record's survival does not establish that the entire snapshot existed before 2013.

| Cached source | Meaning | SHA-256 |
| --- | --- | --- |
| `original-galaxy-13.xml` | Landing labels and galaxy IDs | `82c9670ebb8604febd0516c20afb49b468ea431e2fd07e5ece57d416efed786a` |
| `original-galaxy-79.xml` | Galaxy names, IDs 1–6 | `35eeefdff45d3de72d456b1ed79681e463d379c5cae4ac19190fc42b7a31af9d` |
| `original-maps-155.xml` | `MapConfig_xmlCls`; 2,947 map nodes, region names, `super` IDs and navigation edges | `8e21341bb8189be99e9d0dc7cafd1c53bac184a2fffa955feca716ee6961567f` |
| `original-157.xml` | `SuperMapXMLInfo`; actual planet names and explicit `galaxy` membership | `19853be64a2883696e4ef85e45420a28111fb9886b8246a502bdb758d11d0ff1` |
| `official-h5-133.xml` | `Starmap_h5`; corroborating planet names and submaps | `be3e80d4e9d69963fa35989423e1a782338ca9a170ae0a0b0d8876da519160ab` |
| `official-h5-257.xml` | `Starmaplist_h5`; explicit galaxy-to-planet lists | `dba4b70412b835ed02840ccad119b38832cc93064cf3545207ba88860a9dbe3c` |
| `official-h5-46.xml` | `Map_h5`; H5 map-to-original-art `pic` IDs | `47706f607d310a191b8cf72a4ab3ad1f24ee226d5d514a247bb10b2bf42dead6` |

`original-maps-156.xml` is **not a map table**: its root contains item/gift records. It is excluded from location evidence. The SPT sources are [SptPetInfoOld.xml](https://seer.61.com/resource/xml/SptPetInfoOld.xml), SHA-256 `d698ee3b9cd2be361cb1c068d9b130057c73d6bbb2fe3d531fab0df51324483c`, and [SptPetInfo.xml](https://seer.61.com/resource/xml/SptPetInfo.xml), SHA-256 `47dffe9a43e592506bd87ee21152d0730f4a980edb38a73b0f6ec3347ecb5df6`. They agree on all 48 matched encounter map/habitat pairs.

Use `SuperMapXMLInfo` for planet tiles, `MapConfig` for landing regions, and the SPT table for encounter destinations. Planet names and landing names often differ without either being erroneous: 推特星 contains 加利部落; 巨石星 contains 巨石岛. `super` is useful evidence but is not universally reliable: 恶灵深渊 784 has `super=107`, while both its navigation edge and the official H5 planet list place it with 魔神星 775. Resolve that specific exception through the corroborating lists rather than moving it to the VIP room.

## Missing named destinations required by current encounters

Numbers below are **original map IDs**, not H5 IDs or modern SPT local-copy IDs. Except for the explicitly qualified small Phantom row, galaxy membership and canonical planet names are directly recorded in `SuperMapXMLInfo` and corroborated by H5 tables. The table contains 22 directly identified missing planet/group destinations and one historically qualified small-Phantom destination.

| Galaxy | Planet/group tile and main landing ID | Required encounter regions and aliases | Current opponents |
| --- | --- | --- | --- |
| 1 帕诺 / Pano | 双子阿尔法星 105 | 阿尔法星岩地 106; 海盗能源站 46 | 纳多雷; 斯宾塞 |
| 1 | 双子贝塔星 47 | 贝塔星荒原 49 | 雷纳多 |
| 1 | 拜伦号 314 | 拜伦号 314; retain catalog “幽灵飞船” as a descriptive alias, not 幽灵号 420–422 | 尤纳斯 |
| 1 | 露希欧星 54 | Accept catalog 露西欧星 alias | Both 克莱芬 records |
| 1 | 斯诺星 51 | 斯诺岩洞 53 | 魔狮迪露 |
| 1 | 卡酷星 463 | 卡酷星丛林 464 | 阿加莎 |
| 2 卡兰 / Kalan | 推特星 688 | 加利部落 688 | 瑞尔斯 |
| 3 罗格 / Rogue | 拓梯星 429 | 活力源泉 430 | 亚伦斯 |
| 3 | 拉铂尔星 441 | Main landing 441; optional connected regions 秘境 515, 地下之城 681, 仙境 693 | 肯佩德 |
| 4 裂空 / Rift | 怀特星 484 | 怀特矿场 486; 魔窟 479; 山神圣殿 450; 炫彩山山脚 445 for 卡修斯 | 德拉萨; 米诺斯; 迪符特; 卡修斯 |
| 4 | 格雷斯星 451 | 黯夜之城 451; 光明圣坛 507 | 布莱克 |
| 4 | Y星 662 | 菲尼克斯神殿 664; 菲尼克斯禁地 666 | Existing four-beast campaign entrance |
| 4 | 异能星 668 | 异能部落 668; 守护部落 676 | 古尔扎迪 |
| 4 | 泰若星 683 | 晶石山谷 683; 丛林秘境 684; 冰封洞窟 685; 神兽谷 686. Catalog 丛林之境 is an alias of 684 | 皮特萨罗; 暗夜冰狐 |
| 5 螺旋 / Helix | 巨石星 702 | 巨石岛 702; 石源密林 706; source-conflict candidate 黑风崖 708, discussed below | 兰斯特; 卡沃尔 |
| 5 | 艾伦星 29 | 浅滩海岛 29; 珊瑚海礁 710 | 凯洛亚 |
| 5 | 巴斯星 717 | 雾气石林 717; 上古龙殿 724; 星辰龙境 722 | 卡伦尼; 斯利普; anniversary 帕罗狄亚 |
| 5 | 莱恩那星 726 | Landing 726 is 蘑草绿洲 in legacy galaxy XML and 蘑菇绿洲 in H5; 米娜村落 731; 海盗研究基地 735 | 普兰特; 博卡特 |
| 5 | 小幻影星 / 圣灵峰 741, qualified historical grouping | 圣灵峰 741 → 恶魔旋涡 744 → 守护残殿 746. Catalog 恶魔漩涡 is a spelling alias. Do not replace this chain with 幻梦迷境 736 | 巴索尔 |
| 5 | 恶魔星 748 | 天空之门 748; 兽神瀑布 762 | 帕里斯 |
| 5 | 魔神星 775 | 魔神陵墓 775; 通天塔 780; 九霄魔神殿 782; 恶灵深渊 784 | 斯克鲁; 魔神艾里克; 纳特 |
| 5 | 南瓜星 786 | 南瓜山谷 786; 藏宝室 789, alias 藏宝密室 | 斯图尔特 |
| 5 | 天马星 795 | 浮空仙岛 795; 晶蛇魔窟 799; 冰晶奇宫 803; 神树之巅 810 | 库里; 洛拉斯克; 伊索里; 弗希斯 |

**Kenpeide is unambiguous:** catalog `boss_spt_kenpeide`, species 617, matches official SPT map **11092**, named 拉铂尔星. The original landing is **441**, with explicit galaxy **3** membership. The SPT local node has no `super`, so connect it by the matching official name and parent/group tables; do not interpret 11092 as a new planet or route it to a ship dock.

## Existing planets still needing exact-region resolution

These do not require additional planet tiles. Preserve their source-backed regions when assigning an encounter: 克洛斯星林间 **12** (蘑菇怪), 火山星山洞深处 **17** (里奥斯), 海洋星海底 **22** (钢牙鲨), 云霄星最高层 **27** (提亚斯), 塞西利亚星 **40** (阿克希亚), 塔克星光之迷城 **61** (厄尔塞拉) and 地底古迹 **495** (斯普林特), 艾迪星 **325** (奈尼芬多), 哈莫星龙王圣殿 **348** (哈莫雷特/塔克林/塔西亚), 比格星沃尔夫洞穴 **423** (劳克蒙德), 戴斯星 **435** (both 克拉尼特 records), and 墨杜萨星石化之城 **438** (墨杜萨). Legacy galaxy XML labels 戴斯 with 436, but `SuperMapXMLInfo`, H5 and map names identify **435** as 戴斯星 and **436** as 熔岩峡谷; do not conflate the two.

## Legendary and facility routes

| Encounter/route | Verified destination | Boundary |
| --- | --- | --- |
| 布莱克 | 格雷斯星 → 光明圣坛 **507**, `super=451`, Rift 4 | Catalog “单挑战” describes a battle requirement, not a place. A [May 2013 first-person SPT guide](https://news.4399.com/gonglue/seer/jingyanxinde/262812.html) names the SPT GO route and location; an [August 2011 screenshot walkthrough](https://news.4399.com/seer/saiergonglue/201108-10-109161.html) corroborates the same place. |
| 帕罗狄亚, catalog anniversary variant | 巴斯星 → 星辰龙境 **722**, `super=717`, Helix 5 | The [April 2012 acquisition walkthrough](https://news.4399.com/seer/zenmezhua/201204-24-155723.html) explicitly teleports to 星辰龙境 for 小布VS帕罗狄亚. H5 now spells this region 星尘龙境; preserve 星辰 as the period alias. Do not choose 上古龙殿 solely because other story scenes occurred there. |
| 魔神艾里克 | 魔神星 → 九霄魔神殿 **782** | Direct catalog name and original `super=775`. |
| 谱尼 seals/body | 精灵太空站 **102** → 太空站左翼 **108** → 勇者之塔 **500** → 勇者之塔神秘领域 **10032** | Map10032 contains all seven named seal components. Map108 has the 勇者之塔 interaction; this is a space-station route, not the ship. |
| Brave tower | 勇者之塔 **500**, `super=102` | Keep catalog floor records under this facility. |
| Dark arena | 暗黑武斗场 **110**, `super=102` | Exact original spelling; separate from the tower. |
| Four divine beasts | Existing campaign entrance at Y星 → 菲尼克斯禁地 **666** | Named battle spaces **401 玄武空间**, **403 青龙空间**, **483 白虎空间**, **318 朱雀空间** also exist. Do not fabricate new planets from those arena names. |
| 麒麟 campaign | 麒麟空间 **73** | The map name/ID is confirmed. Its node has no `super`, and the recovered group tables do not assign it to a galaxy. Keep the dedicated campaign destination; its physical parent/entrance is unresolved in this audit. The later 麒麟之峰1281 must not silently replace this 2013 space. |
| 雷伊 / training | Existing 赫尔卡星荒地 **32**, plus current source-named training lake | No missing planet. Preserve the campaign's dedicated training interaction. |
| 盖亚 | Pano's existing planetary routes | Catalog explicitly says random appearance among Pano planets. No source here establishes one permanent landing. |

Treat the space station as a facility tile/button. The original maps **102**, **108**, **405** (太空站扩展), **500**, and **110** form its own group; they are not additional galaxies. Several modern nodes have `replaceMapId=1147` (贾斯汀太空站). That later replacement does not justify rewriting the classic route or labeling the ship as the station.

## Historical qualifications and unresolved details

- **Small Phantom:** the official SPT row verifies 巴索尔 → local **11118 守护残殿**, and map155 verifies original **746** connected through **744** to **741**. Neither legacy `SuperMapXMLInfo` nor the modern H5 planet list gives 741 a galaxy attribute. However, the [July 6, 2012 first-person task walkthrough](https://news.7k7k.com/content/20120706/180529.html) locates the task at 守护残殿 and reports the transfer of 幻影星 to 螺旋星系. A Helix small-Phantom route is therefore historically supported, while treating **741** as its primary landing is an explicit navigation reconstruction. Do not invent a distinct official small-planet numeric ID or put this 2012 route permanently in Rogue.
- **Kawoer source disagreement:** both official SPT XMLs say habitat **石源密林** but point to local **11109**, whose official map name is **黑风崖**. Original **706** is 石源密林 and **708** is 黑风崖; both belong to 巨石星702. The catalog supports706. Preserve the disagreement in provenance rather than claiming the local node proves706 exactly.
- **Nate correction:** the catalog's parenthetical 火山口 is inconsistent with the official SPT habitat 恶灵深渊 and original map784's route to775. Use 魔神星/恶灵深渊 for the encounter; do not send it to 火山星15.
- **Historical aliases:** the [September 2013 actual map walkthrough](https://news.4399.com/news/seerwenda/299757.html) confirms 泰若星 in Rift and the 丛林秘境 → 冰封洞窟 → 神兽谷 sequence. Official group157 now directly corroborates the planet identity. Thus 泰若星, 推特星 and 巨石星 are valid planet labels, not catalog mistakes.
- No unsupported English transliterations or unrelated modern planets are required. The absent sixth galaxy is not needed for the current catalog. Exact server-era map replacement dates and the physical entrance to 麒麟空间 remain unresolved.

## Verification boundary

This audit read every current SPT/legendary location, checked the 48 matched SPT rows against the 2,947-node map table, and cross-checked planet membership in group157 and the three independently embedded H5 tables. XML parsing and SHA-256 checks succeeded. No world/UI source, runtime rule, player save, production package or legacy test suite was changed. The parent task owns implementing these routes and checking them in the live game.

## Implemented delivery

The scene's redundant route button is removed; the top map tool remains the general navigation entry. `world-expansion.ts` adds destinations from the complete first-five-galaxy index in group157, preserving the first canonical label when the source also repeats a landing alias. Together with the existing twelve planetary destinations, these are all 55 unique indexed destinations. The qualified small-Phantom route and the ship, space station and fortress bring the selectable total to 59. The sixth galaxy is outside this delivery. Each additional destination has a walkable scene and a valid original landing ID; source-backed SPT regions and encounter IDs are explicitly placed. Indexed destinations without modeled encounters expose their landing only, without invented wildlife. Backgrounds continue to reuse the existing seven authored scenes. Original background art and complete original submap/wildlife reconstruction remain future work.

All 48 current SPT encounters now resolve to their mapped habitats and appear on regular atlas arrival. Kenpeide resolves to Rogue/Rabol441; both Klai Fen variants use the Lucio alias, and the small-Phantom route remains separate from large Phantom736. Nai Ni Fen Duo moves from the authored Music Sanctuary label to the documented Eddy landing; the old `music` navigation ID now names its genuine underground city. Tower and dark-arena categories resolve to separate space-station facilities. Puni's original mystery region and the fortress trial are also available from the atlas. Y-star includes the existing four-beast campaign entrance; interacting with its selected body uses the established campaign scene rather than bypassing stage progression. Original encounter text and game saves retain their previous format.

Project TypeScript checking and whitespace checks passed. The focused navigation runner checked every one of the 179 current encounter views, all 48 explicit SPT placements, alias-supported routes, unique valid destinations, selected-opponent visibility, actual space-station facilities and unchanged battle state during route resolution. It reported 170 mapped encounters and nine retained staging routes. A separate check against the independent group157 snapshot verified all 55 indexed destinations and galaxy memberships, and every newly assigned region ID exists in map155. This is route/data verification, not certification of historical artwork or battle balance.

The supported live browser used an isolated origin/save. The SPT archive displayed Rabol as Kenpeide's destination; its travel action arrived at that scene with dialogue and no battle yet. Choosing Challenge showed the initial 0-percent loading screen, then the actual Kenpeide battle with a complete 10,000-HP opponent and no missing images. Retreat returned through the normal battle-end flow. The atlas displayed all five galaxy tabs and the three base buttons without obscuring its landing confirmation. Search and landing to Pegasus's Crystal Snake Cave produced the expected Luola Sike actor with loaded artwork. Space-station navigation was also checked. Evidence is retained under the ignored `artifacts/location-v11/` directory.

Two existing GPT-6.1-sol contributors with high reasoning effort performed the independent official-source audits; both reports were integrated. The main task implemented the navigation, destination catalog and focused verification. No production frontend bundle, native package, broad legacy suite or paid asset-generation run was performed. The existing port-1425 development service remains independent of the task, and the player's origin was not used for test combat.
