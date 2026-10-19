import type { FusionHabitat, WorldGalaxy, WorldPlanet, WorldRegion } from './types.ts';

// Authored world data: the classic planets, their galaxies and the region
// adjustments applied once in assemble.ts. Expanded destinations live in
// ../world-expansion.ts and source-backed subregions in ../world-habitat-regions.ts.

export const WORLD_GALAXIES: WorldGalaxy[] = [
  {id:'pano',name:'帕诺星系',subtitle:'经典启航航线',color:'#89d5e2',originalId:1},
  {id:'kalan',name:'卡兰星系',subtitle:'光暗迷城与龙族圣殿',color:'#c1b3eb',originalId:2},
  {id:'rogue',name:'罗格星系',subtitle:'密林、熔岩与石化遗迹',color:'#efc184',originalId:3},
  {id:'likong',name:'裂空星系',subtitle:'炫彩山与异能秘境',color:'#b6c4f2',originalId:4},
  {id:'helix',name:'螺旋星系',subtitle:'巨石、海礁与天空之门',color:'#c5d799',originalId:5},
];
/**
 * Primary membership evidence: https://seer.61.com/dll/RobotCoreDLL.swf embedded XML.
 * Official Client.swf net/DLLLoader.as decodes its seven-byte prefix plus zlib payload.
 * Source chain: https://seer.61.com/Client.swf -> config/seer.xml -> config/dll.xml.
 * Encoded SWF SHA-256: 2405e1cb24f4a44fa6183c03a51357f58895a0a9ff1e5376a6506be53cfc493f.
 * Extracted source snapshots: .cache/atlas-source/original-galaxy-{13,79}.xml.
 * DefineBinaryData 13 gives planet->galaxy IDs; 79 gives galaxy ID->name.
 * Decoded SWF SHA-256: ca040870b9150463f5858ac42d0e0c347380010e12ae16d02068dc78048ccd40.
 * Binary 13 XML SHA-256: 82c9670ebb8604febd0516c20afb49b468ea431e2fd07e5ece57d416efed786a.
 * Binary 79 XML SHA-256: 35eeefdff45d3de72d456b1ed79681e463d379c5cae4ac19190fc42b7a31af9d.
 * Kalan: Tuck 60, Eddy 325, Hamo 338; Rogue: Big 404, Dase 436, Modusa 437.
 * The original tables establish membership, not the authored scenery or encounter layout.
 * Expanded planet identities and aliases use SuperMapXMLInfo symbol157; see
 * design/notes/challenge-location-expansion-sources.md for the complete source audit.
 */
export const CLASSIC_PLANETS: WorldPlanet[] = [
  {id:'station',originalMapId:1,galaxyId:'ship',name:'赛尔号飞船',subtitle:'启航与补给',theme:'station',color:'#63d8f2',background:'/maps/station.svg',regions:[
    {id:'transport',originalMapId:1,name:'传送舱',description:'准备好精灵伙伴，选择一颗星球出发。传送管理员提供挑战档案；尚未定位的任务对手会在这里接洽。',x:24,y:62,creatures:[],levels:[1,100],facility:'challenges',challengeStaging:true},
    {id:'lab',originalMapId:5,name:'实验室',description:'派特博士负责精灵研究。后方左舱进行精灵融合，右舱进行精灵繁殖；中央补给终端免费提供道具。博士可以恢复全队体力和技能 PP。',x:53,y:47,creatures:[],levels:[1,100],facility:'recovery'},
    {id:'captain',originalMapId:4,name:'船长室',description:'查看航行任务，完成目标后在这里领取精灵奖励。',x:79,y:62,creatures:[],levels:[1,100],facility:'missions'},
  ]},
  {id:'klose',originalMapId:10,galaxyId:'pano',name:'克洛斯星',subtitle:'草原 · 沼泽 · 林间',theme:'grass',color:'#8dd756',background:'/maps/klose.svg',regions:[
    {id:'plain',originalMapId:10,name:'克洛斯星草原',description:'皮皮在草地上嬉戏。寻找伙伴，迈出星际探索的第一步。',x:24,y:68,creatures:[10],levels:[3,6]},
    {id:'swamp',originalMapId:11,name:'克洛斯星沼泽',description:'穿过湿润的沼泽，仙人球与小豆芽藏在植物丛间。',x:53,y:51,creatures:[16,27],levels:[8,12]},
    {id:'forest',originalMapId:12,name:'克洛斯星林间',description:'依依在林间嬉戏，蘑菇怪守候在巨大的蘑菇旁。与依依对战后，可以直接使用胶囊捕捉。',x:79,y:65,creatures:[83],levels:[15,15],bossIds:['boss_spt_moguguai']},
  ]},
  {id:'cloud',originalMapId:25,galaxyId:'pano',name:'云霄星',subtitle:'浮空岛 · 最高层',theme:'cloud',color:'#bed6ff',background:'/maps/cloud.svg',regions:[
    {id:'ground',originalMapId:25,name:'云霄星地面',description:'从浮空草地出发，观察毛毛与偶尔出现的莫比。',x:24,y:67,creatures:[22,53],levels:[3,8]},
    {id:'high',originalMapId:26,name:'云霄星高空',description:'幽浮与小莹蜂在浮岛之间穿行。与它们对战后，可以直接使用胶囊捕捉。',x:53,y:50,creatures:[25,153],levels:[12,16]},
    {id:'summit',originalMapId:27,name:'云霄星最高层',description:'最高处的风暴里，提亚斯等待挑战。留意它的精神干涉。',x:79,y:63,creatures:[],levels:[45,45],bossIds:['boss_spt_tiyasi']},
  ]},
  {id:'ocean',originalMapId:20,galaxyId:'pano',name:'海洋星',subtitle:'浅水 · 深水 · 海底',theme:'ocean',color:'#5ddce3',background:'/maps/ocean.svg',regions:[
    {id:'shallows',originalMapId:20,name:'海洋星浅水区',description:'贝尔栖息在浅水与珊瑚之间，适合新伙伴练习对战。',x:24,y:65,creatures:[30],levels:[5,8]},
    {id:'deep',originalMapId:21,name:'海洋星深水区',description:'进入深水后可以遇见利牙鱼，也能寻找布鲁。',x:53,y:49,creatures:[33,108],levels:[15,18]},
    {id:'seabed',originalMapId:22,name:'海洋星海底',description:'沉船旁的海底通道通向钢牙鲨。准备好再进入挑战。',x:79,y:65,creatures:[],levels:[25,25],bossIds:['boss_spt_gangyasha']},
  ]},
  {id:'volcano',originalMapId:15,galaxyId:'pano',name:'火山星',subtitle:'熔岩 · 山洞 · 火山深处',theme:'volcano',color:'#ffa55e',background:'/maps/volcano.svg',regions:[
    {id:'foot',originalMapId:15,name:'火山星山脚',description:'火炎贝生活在温暖的岩石间，远处传来火山的轰鸣。',x:24,y:68,creatures:[38],levels:[7,10]},
    {id:'cave',originalMapId:16,name:'火山星山洞',description:'沿着岩壁进入山洞，寻找吉尔并挑战新的对手。',x:53,y:52,creatures:[35],levels:[15,18]},
    {id:'depths',originalMapId:17,name:'火山星深处',description:'炽热熔岩照亮了里奥斯的巢穴。胜利后可获得首领精元。',x:79,y:66,creatures:[],levels:[35,35],bossIds:['boss_spt_liaosi']},
  ]},
  {id:'helka',originalMapId:30,galaxyId:'pano',name:'赫尔卡星',subtitle:'入口 · 遗迹 · 荒地',theme:'helka',color:'#f9da73',background:'/maps/helka.svg',regions:[
    {id:'waste',originalMapId:30,name:'赫尔卡星入口',description:'古代机械文明的残骸中，比比鼠仍活跃在电流之间。',x:24,y:67,creatures:[13],levels:[9,12]},
    {id:'ruins',originalMapId:31,name:'赫尔卡星遗迹',description:'残存的能量驱动着遗迹装置，罗奇与吉斯在这里活动。',x:53,y:50,creatures:[43,145],levels:[18,22]},
    {id:'temple',originalMapId:32,name:'赫尔卡星荒地',description:'循着电光前往第三层荒地，迎接雷伊的挑战。此处随时开放。',x:79,y:65,creatures:[],levels:[70,70],bossIds:['boss_rei']},
    // The training lake is named in the five encounter location records. It
    // reuses the parent Helka backdrop; its lake identity is a remake layout.
    {id:'training-lake',name:'雷伊特训湖边',description:'雷伊在湖边等候特训。与它交谈，带上自己的雷伊，按顺序完成五项技能特训。',x:65,y:57,creatures:[],levels:[1,100],campaignId:'rei-training'},
  ]},
  {id:'cecilia',originalMapId:40,galaxyId:'pano',name:'塞西利亚星',subtitle:'冰面 · 冰窟 · 冰原',theme:'ice',color:'#9de5fa',background:'/maps/cecilia.svg',regions:[
    {id:'snow',originalMapId:40,name:'塞西利亚星冰面',description:'冰雪覆盖着星球表面，玄冰兽与卡卡在冰原上游走，可以在野外对战中使用胶囊捕捉。',x:24,y:67,creatures:[51,116],levels:[15,18]},
    {id:'cavern',originalMapId:41,name:'塞西利亚星冰窟',description:'幽蓝的冰窟里藏着林克。与它对战，结识新的伙伴。',x:53,y:50,creatures:[65],levels:[20,25]},
    {id:'peak',originalMapId:40,name:'塞西利亚星冰原',description:'雪山深处的阿克希亚守护着冰原，考验你的精灵战队。',x:79,y:64,creatures:[],levels:[65,65],bossIds:['boss_spt_akexiya']},
  ]},
  // Legacy authored backgrounds remain fallbacks. Recovered official artwork
  // replaces them below; encounter placement and levels remain remake choices.
  {id:'tuck',originalMapId:60,galaxyId:'kalan',name:'塔克星',subtitle:'地面 · 光之迷城 · 地底古迹',theme:'helka',color:'#bba5e1',background:'/maps/helka.svg',sceneAttribution:'Reuses the locally authored Helka ruins scene as illustrative Tuck scenery.',sources:['https://www.taptap.cn/moment/204979098668239520'],regions:[
    {id:'landing',originalMapId:60,name:'塔克星地面',description:'从塔克星地面出发，结识伊娃，准备进入光暗迷城。',x:24,y:67,creatures:[232],levels:[16,20]},
    {id:'light-city',originalMapId:61,name:'光之迷城',description:'沿光芒进入迷城，寻找吉宝并挑战厄尔塞拉。',x:53,y:50,creatures:[237],levels:[20,25],bossIds:['boss_spt_eersaila']},
    {id:'underground',originalMapId:495,name:'地底古迹',description:'古迹深处的斯普林特等待挑战。首领精元可以带回飞船孵化。',x:79,y:65,creatures:[],levels:[80,80],bossIds:['boss_spt_sipulinte']},
  ]},
  {id:'eddy',originalMapId:325,galaxyId:'kalan',name:'艾迪星',subtitle:'地面 · 暮色之城 · 虚幻的地下城市',theme:'cloud',color:'#d2a8da',background:'/maps/cloud.svg',sceneAttribution:'Reuses the locally authored floating-island scene as illustrative Eddy scenery.',sources:['https://www.taptap.cn/moment/174545728348097978'],regions:[
    {id:'landing',name:'艾迪星地面',originalMapId:325,description:'在艾迪星寻找帕尼，与奈尼芬多互动开始挑战。',x:24,y:67,creatures:[265],levels:[15,20],bossIds:['boss_spt_nainifenduo']},
    {id:'twilight',originalMapId:326,name:'暮色之城',description:'暮色笼罩着城门，乌凯在通道之间飞行。',x:53,y:50,creatures:[267],levels:[20,25]},
    {id:'music',name:'虚幻的地下城市',originalMapId:327,description:'沿着艾迪星的地下通道继续探索。',x:79,y:65,creatures:[],levels:[1,100]},
  ]},
  {id:'hamo',originalMapId:338,galaxyId:'kalan',name:'哈莫星',subtitle:'入口 · 白沙罗域 · 龙王圣殿',theme:'helka',color:'#d9c092',background:'/maps/helka.svg',sceneAttribution:'Reuses the locally authored ancient-mechanical scene as illustrative Hamo scenery.',sources:['https://www.taptap.cn/moment/143776072423442972'],regions:[
    {id:'landing',originalMapId:338,name:'哈莫星入口',description:'抵达龙族的故土，寻找萨拉并为深入探索做准备。',x:24,y:67,creatures:[399],levels:[20,25]},
    {id:'white-sand',originalMapId:342,name:'白沙罗域',description:'穿过白沙罗域，与乌鲁相遇。携带胶囊可在野外战斗中捕捉伙伴。',x:53,y:50,creatures:[414],levels:[25,30]},
    {id:'dragon-temple',originalMapId:348,name:'龙王圣殿',description:'哈莫雷特、塔克林、塔西亚与塞维尔的挑战入口。带上准备充分的出战阵容。',x:79,y:65,creatures:[],levels:[70,80],bossIds:['boss_spt_hamoleite','boss_spt_takelin','boss_spt_taxiya','boss_spt_saiweier']},
  ]},
  {id:'big',originalMapId:404,galaxyId:'rogue',name:'比格星',subtitle:'地面 · 觅食林 · 沃尔夫洞穴',theme:'grass',color:'#b1d777',background:'/maps/klose.svg',sceneAttribution:'Reuses the locally authored forest scene as illustrative Big scenery.',sources:['https://www.taptap.cn/moment/212576452351100972'],regions:[
    {id:'landing',originalMapId:404,name:'比格星地面',description:'进入罗格星系，寻找霹雳兽与洛洛斯。',x:24,y:67,creatures:[454,491],levels:[16,22]},
    {id:'foraging',originalMapId:414,name:'觅食林',description:'茂密的树林里，伊特等待与新的伙伴相遇。',x:53,y:50,creatures:[471],levels:[20,25]},
    {id:'wolf-cave',originalMapId:423,name:'沃尔夫洞穴',description:'在洞穴中挑战劳克蒙德。挑战随时开放，胜利后获得精元。',x:79,y:65,creatures:[],levels:[80,80],bossIds:['boss_spt_laokemengde']},
  ]},
  {id:'dase',originalMapId:435,galaxyId:'rogue',name:'戴斯星',subtitle:'地面 · 熔岩峡谷 · 死亡之河',theme:'volcano',color:'#e79973',background:'/maps/volcano.svg',sceneAttribution:'Reuses the locally authored lava scene as illustrative Dase scenery.',sources:['https://www.taptap.cn/moment/141231707956183368'],regions:[
    {id:'landing',originalMapId:435,name:'戴斯星地面',description:'热浪翻涌，紫炎虫在岩石之间活动。',x:24,y:67,creatures:[547],levels:[20,25]},
    {id:'lava-canyon',originalMapId:436,name:'熔岩峡谷',description:'沿峡谷探索并训练伙伴，为克拉尼特的挑战准备阵容。',x:53,y:50,creatures:[547],levels:[25,30]},
    {id:'death-river',name:'死亡之河',description:'这里连接克拉尼特的两场挑战，可根据阵容直接选择。',x:79,y:65,creatures:[],levels:[50,80],bossIds:['boss_spt_kelanite1','boss_spt_kelanite2']},
  ]},
  {id:'modusa',originalMapId:437,galaxyId:'rogue',name:'墨杜萨星',subtitle:'地面 · 石化之城 · 极冻边缘',theme:'helka',color:'#b9c9ae',background:'/maps/helka.svg',sceneAttribution:'Reuses the locally authored stone-and-mechanical ruins scene as illustrative Modusa scenery.',sources:['https://www.taptap.cn/moment/141231707956183368'],regions:[
    {id:'landing',originalMapId:437,name:'墨杜萨星地面',description:'在巨石环绕的地面寻找丫丫，开启石化遗迹的探索。',x:24,y:67,creatures:[553],levels:[18,23]},
    {id:'stone-city',originalMapId:438,name:'石化之城',description:'石柱遮挡着远方的视线，墨杜萨在遗迹深处等待挑战。',x:53,y:50,creatures:[827],levels:[25,30],bossIds:['boss_spt_moduosa']},
    {id:'frozen-edge',originalMapId:443,name:'极冻边缘',description:'沿遗迹边缘继续寻找尖嘴鸟，通过顶部地图选择下一颗星球。',x:79,y:65,creatures:[827],levels:[30,35]},
  ]},
];

/**
 * Small, source-supported prerequisite batch for classic fusion pairs.
 * Capsule encounters intentionally omit historical gear, timers and puzzles.
 * Region identities and source guides are audited in fusion-acquisition-v17.md.
 * Bosses keep their own encounter levels; these ranges describe wild seeds.
 */
export const FUSION_HABITATS: FusionHabitat[] = [
  { planetId: 'klose', regionId: 'plain', species: [164], levels: [3, 6], description: '皮皮与闪光皮皮在草原活动，携带胶囊就能结识新伙伴。' },
  { planetId: 'ocean', regionId: 'deep', species: [77], levels: [15, 18], description: '利牙鱼、布鲁与尼尔在深水区活动。这里的尼尔可以直接使用胶囊捕捉。' },
  { planetId: 'ocean', regionId: 'seabed', species: [198], levels: [15, 16], description: '小鳍鱼栖息在海底，使用胶囊可以捕捉。钢牙鲨的挑战仍在沉船附近。' },
  { planetId: 'volcano', regionId: 'cave', species: [133], levels: [15, 18], description: '吉尔与巴多在火山山洞活动，可以直接使用胶囊捕捉。' },
  { planetId: 'cloud', regionId: 'summit', species: [249], levels: [9, 10], description: '浮空苗在最高层漂浮，可以使用胶囊捕捉。提亚斯在风暴中等待挑战。' },
  { planetId: 'snow', regionId: 'cave', species: [178], levels: [15, 16], description: '达比拉在斯诺岩洞活动，可以直接使用胶囊捕捉。魔狮迪露在洞穴深处等待挑战。' },
  { planetId: 'byron', regionId: 'deck', species: [136], levels: [15, 16], description: '卢比在拜伦号甲板活动，可以直接使用胶囊捕捉。尤纳斯的挑战仍在这里开放。' },
  { planetId: 'alpha', regionId: 'surface', species: [188], levels: [20, 21], description: '加格在阿尔法星岩地活动，可以使用胶囊捕捉。纳多雷仍在岩地等待挑战。' },
  { planetId: 'lucio', regionId: 'surface', species: [205], levels: [16, 17], description: '阿兹在露希欧星活动，可以使用胶囊捕捉。这里也连接克莱芬的挑战。' },
  { planetId: 'lucio', regionId: 'marsh', species: [203, 208], levels: [16, 17], description: '晶岩兽与火晶兽在露希欧泥潭活动，可以直接使用胶囊捕捉。' },
  { planetId: 'tuck', regionId: 'landing', species: [480], levels: [16, 20], description: '伊娃与埃尔特在塔克星地面活动，可以直接使用胶囊捕捉。' },
];

/** Authored regions appended to an existing planet after its source regions. */
export const EXTRA_REGIONS: { planetId: string; region: WorldRegion }[] = [
  // The canonical second Nigu'er scene is a necessary habitat for the classic
  // Charlton fusion parent. Its original map 58 artwork is recovered separately.
  { planetId: 'planet-57', region: {
    id: 'cliff', originalMapId: 58, name: '尼古尔峭壁', description: '查斯在尼古尔峭壁活动，可以直接使用胶囊捕捉。',
    x: 72, y: 62, creatures: [228], levels: [20, 21],
  } },
];
