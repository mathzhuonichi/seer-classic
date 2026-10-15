import type { WorldPlanet, WorldRegion } from '../world';

export interface ScenePoint { x: number; y: number }
export interface SceneBossActor {
  src:string;
  /** Original actor crop dimensions, as percentages of the displayed scene. */
  width:number;
  height:number;
  /** Bottom center of the source crop in the same scene coordinate system. */
  anchor:ScenePoint;
}
export interface SceneLayout {
  /** The interaction plane covers 96% of the image; terrain does not block clicks. */
  walk: readonly ScenePoint[];
  /** Wildlife stays on its source-derived or explicitly authored terrain. */
  habitat?: readonly ScenePoint[];
  homes: readonly ScenePoint[];
  entry: ScenePoint;
  npc: ScenePoint;
  boss: ScenePoint;
  /** Source-verified contacts, keyed by encounter ID rather than species. */
  bossHomes?: Readonly<Record<string,ScenePoint>>;
  bossActors?: Readonly<Record<string,SceneBossActor>>;
  gates: readonly [ScenePoint, ScenePoint];
  roam: ScenePoint;
  /** Optional local territory keeps a crowded authored composition readable. */
  homeRoam?: ScenePoint;
  creatureSize?: number;
}
const point=(x:number,y:number):ScenePoint=>({x,y});
// Source identities, original matrices, masks, crop bounds and hashes are kept
// in public/maps/actors/manifest.json. These are original map poses, not battle
// portraits enlarged to a shared size.
const originalBossActors:Record<number,Readonly<Record<string,SceneBossActor>>>={
  17:{
    'boss_spt_liaosi':{src:'/maps/actors/17-liaosi.svg',width:63/960*100,height:94/560*100,anchor:point(813.5/960*100,243/560*100)},
  },
  22:{
    'boss_spt_gangyasha':{src:'/maps/actors/22-steeltooth-shark.svg',width:84/960*100,height:98/560*100,anchor:point(871/960*100,133/560*100)},
  },
  40:{
    'boss_spt_akexiya':{src:'/maps/actors/40-akexiya.svg',width:131/960*100,height:158/560*100,anchor:point(602.5/960*100,165/560*100)},
  },
  348:{
    'boss_spt_takelin':{src:'/maps/actors/348-takelin.svg',width:99/960*100,height:66/560*100,anchor:point(807.5/960*100,219/560*100)},
    'boss_spt_saiweier':{src:'/maps/actors/348-saiweier.svg',width:109/960*100,height:104/560*100,anchor:point(632.5/960*100,188/560*100)},
    'boss_spt_taxiya':{src:'/maps/actors/348-taxiya.svg',width:78/960*100,height:93/560*100,anchor:point(450.0/960*100,177/560*100)},
    'boss_spt_hamoleite':{src:'/maps/actors/348-hamoleite.svg',width:140/960*100,height:137/560*100,anchor:point(194.0/960*100,167/560*100)},
  },
  507:{
    'boss_buleike':{src:'/maps/actors/507-buleike.svg',width:70/960*100,height:135/560*100,anchor:point(414.0/960*100,227/560*100)},
  },
  731:{
    'boss_spt_pulante':{src:'/maps/actors/731-pulante.svg',width:60/960*100,height:96/560*100,anchor:point(504.0/960*100,335/560*100)},
  },
  799:{
    'boss_spt_luolasike':{src:'/maps/actors/799-luolasike.svg',width:84/960*100,height:74/560*100,anchor:point(155.0/960*100,312/560*100)},
  },
  803:{
    'boss_spt_yisuoli':{src:'/maps/actors/803-yisuoli.svg',width:77/960*100,height:86/560*100,anchor:point(653.5/960*100,419/560*100)},
  },
  10032:{
    'campaign:puni':{src:'/maps/actors/10032-puni.svg',width:165/960*100,height:165/560*100,anchor:point(439.5/960*100,245/560*100)},
  },
};
// Maps 54, 314 and 325 retain their nonstandard original background viewport;
// convert source stage coordinates by its origin and extent, recorded in the manifest.
const originalBossHomes:Record<number,Readonly<Record<string,ScenePoint>>>={
  12:{
    'boss_spt_moguguai':point(694.00000000/960*100,125.00000000/560*100),
  },
  17:{
    'boss_spt_liaosi':point(813.50000000/960*100,243.00000000/560*100),
  },
  22:{
    'boss_spt_gangyasha':point(871.00000000/960*100,133.00000000/560*100),
  },
  27:{
    'boss_spt_tiyasi':point(334.50000000/960*100,393.00000000/560*100),
  },
  32:{
    'boss_rei':point(760.50000000/960*100,271.00000000/560*100),
  },
  40:{
    'boss_spt_akexiya':point(602.50000000/960*100,165.00000000/560*100),
  },
  46:{
    'boss_spt_sibinsai':point(844.50000000/960*100,141.00000000/560*100),
  },
  49:{
    'boss_spt_leinaduo':point(480.00000000/960*100,197.00000000/560*100),
  },
  53:{
    'boss_spt_moshidilu':point(391.00000000/960*100,162.00000000/560*100),
  },
  54:{
    'boss_spt_kelaifen1':point((164+1)/961*100,129/560*100),
    'boss_spt_kelaifen2':point((254+1)/961*100,129/560*100),
  },
  61:{
    'boss_spt_eersaila':point(621.79200000/960*100,482.27200000/560*100),
  },
  106:{
    'boss_spt_naduolei':point(459.00000000/960*100,275.00000000/560*100),
  },
  314:{
    'boss_spt_younasi':point((621.5+1.65)/962*100,294/560*100),
  },
  325:{
    'boss_spt_nainifenduo':point((599+3.65)/970.3*100,(302.0006408691406+1)/561*100),
  },
  348:{
    'boss_spt_hamoleite':point(194.00000000/960*100,167.00000000/560*100),
    'boss_spt_takelin':point(807.50000000/960*100,219.00000000/560*100),
    'boss_spt_taxiya':point(450.00000000/960*100,177.00000000/560*100),
    'boss_spt_saiweier':point(632.50000000/960*100,188.00000000/560*100),
  },
  402:{
    'boss_trial_brave_qigesa':point(566.40000000/960*100,464.80000000/560*100),
  },
  423:{
    'boss_spt_laokemengde':point(634.00000000/960*100,290.00000000/560*100),
  },
  429:{
    'boss_spt_yalunsi':point(510.52800000/960*100,393.68000000/560*100),
  },
  435:{
    'boss_spt_kelanite1':point(324.50000000/960*100,342.00000000/560*100),
    'boss_spt_kelanite2':point(414.50000000/960*100,342.00000000/560*100),
  },
  438:{
    'boss_spt_moduosa':point(501.77500000/960*100,242.60000000/560*100),
  },
  441:{
    'boss_spt_kenpeide':point(601.00000000/960*100,241.00000000/560*100),
  },
  445:{
    'boss_kaxiusi':point(736.92990341/960*100,207.91623383/560*100),
  },
  450:{
    'boss_spt_difute':point(612.00000000/960*100,300.00000000/560*100),
  },
  464:{
    'boss_spt_ajiasha':point(789.50000000/960*100,265.00000000/560*100),
  },
  479:{
    'boss_spt_minuosi':point(664.50000000/960*100,270.00000000/560*100),
  },
  486:{
    'boss_spt_delasa':point(817.00000000/960*100,217.00000000/560*100),
  },
  495:{
    'boss_spt_sipulinte':point(476.00000000/960*100,228.00000000/560*100),
  },
  507:{
    'boss_buleike':point(414.00000000/960*100,227.00000000/560*100),
  },
  666:{
    'boss_campaign_xuanwu_body':point(189.31200000/960*100,408.24000000/560*100),
    'boss_campaign_qinglong_body':point(333.31200000/960*100,408.24000000/560*100),
    'boss_campaign_baihu_body':point(477.31200000/960*100,408.24000000/560*100),
    'boss_campaign_zhuque_body':point(621.31200000/960*100,408.24000000/560*100),
  },
  676:{
    'boss_spt_guerzhadi':point(292.00000000/960*100,494.00000000/560*100),
  },
  684:{
    'boss_spt_pitesaluo':point(583.00000000/960*100,485.00000000/560*100),
  },
  686:{
    'boss_spt_anyebinghu':point(451.00000000/960*100,158.00000000/560*100),
  },
  688:{
    'boss_spt_ruiersi':point(480.45000000/960*100,189.95000000/560*100),
  },
  702:{
    'boss_spt_lansite':point(629.00000000/960*100,298.00000000/560*100),
  },
  706:{
    'boss_spt_kawoer':point(646.36800000/960*100,434.33600000/560*100),
  },
  710:{
    'boss_spt_kailuoya':point(638.50000000/960*100,426.00000000/560*100),
  },
  717:{
    'boss_spt_kalunni':point(680.50000000/960*100,389.00000000/560*100),
  },
  722:{
    'boss_paluodiya':point(677.61600000/960*100,490.33600000/560*100),
  },
  724:{
    'boss_spt_silipu':point(695.00000000/960*100,359.00000000/560*100),
  },
  731:{
    'boss_spt_pulante':point(504.00000000/960*100,335.00000000/560*100),
  },
  735:{
    'boss_spt_bokate':point(610.50000000/960*100,373.00000000/560*100),
  },
  746:{
    'boss_spt_basuoer':point(735.00000000/960*100,182.00000000/560*100),
  },
  762:{
    'boss_spt_palisi':point(355.50000000/960*100,258.00000000/560*100),
  },
  780:{
    'boss_spt_sikelu':point(608.00000000/960*100,404.00000000/560*100),
  },
  782:{
    'boss_ailike':point(353.56800000/960*100,474.20800000/560*100),
  },
  784:{
    'boss_spt_nate':point(155.50000000/960*100,231.00000000/560*100),
  },
  789:{
    'boss_spt_situerte':point(254.50000000/960*100,491.00000000/560*100),
  },
  795:{
    'boss_spt_kuli':point(282.50000000/960*100,407.00000000/560*100),
  },
  799:{
    'boss_spt_luolasike':point(155.00000000/960*100,312.00000000/560*100),
  },
  803:{
    'boss_spt_yisuoli':point(653.50000000/960*100,419.00000000/560*100),
  },
  810:{
    'boss_spt_fuxisi':point(148.50000000/960*100,432.00000000/560*100),
  },
  10032:{
    'campaign:puni':point(439.50000000/960*100,245.00000000/560*100),
  },
};
const rectangle=(left:number,top:number,right:number,bottom:number)=>[
  point(left,top),point(right,top),point(right,bottom),point(left,bottom),
];
const common:SceneLayout={
  walk:rectangle(10,56,90,90),
  homes:[point(24,70),point(44,66),point(64,70),point(32,85),point(54,84),point(76,85)],
  entry:point(16,87),npc:point(66,77),boss:point(66,78),
  gates:[point(8,76),point(92,76)],roam:point(5,3),
};
const themeLayouts:Record<string,SceneLayout>={
  station:{...common,walk:rectangle(13,59,87,88),entry:point(28,84),npc:point(63,75),gates:[point(10,75),point(90,75)]},
  grass:{...common,walk:[point(14,64),point(71,58),point(86,76),point(86,91),point(14,91)],homes:[point(25,74),point(45,72),point(63,72),point(31,87),point(54,85),point(75,86)]},
  cloud:{...common,walk:[point(17,67),point(74,61),point(85,75),point(79,88),point(24,88)],homes:[point(28,73),point(45,71),point(63,71),point(34,84),point(53,83),point(71,82)],entry:point(25,86),gates:[point(18,76),point(83,77)],roam:point(4,2)},
  volcano:{...common,walk:[point(16,66),point(76,60),point(87,84),point(81,90),point(16,90)],homes:[point(27,74),point(46,72),point(65,73),point(33,86),point(52,85),point(74,85)],entry:point(22,87),roam:point(4,2.5)},
  ocean:{...common,walk:rectangle(15,63,86,90),homes:[point(27,72),point(47,71),point(67,72),point(33,86),point(55,85),point(75,86)],entry:point(22,87)},
};

/**
 * Offline placements from the official 10-unit, x-major road masks (1 = open).
 * Each rectangle consists entirely of open cells. Runtime uses only these four
 * numbers, with manual terrain refinements below; no road-grid engine is added.
 * Source and extraction evidence: public/maps/original-manifest.json.
 */
const originalFloors:Record<number,readonly [number,number,number,number]>={
  1:[15.4,51.4,91.9,91.4],
  2:[17.9,41.4,72.6,70.7],
  4:[52.9,55.0,80.4,91.4],
  5:[24.8,69.4,91.9,91.6],
  7:[41.5,76.4,80.4,91.4],
  8:[38.3,38.9,70.0,91.4],
  9:[23.8,49.6,75.2,91.4],
  10:[16.5,38.9,75.2,91.4],
  11:[29.0,49.6,89.8,73.6],
  12:[8.1,78.6,78.3,91.8],
  15:[8.1,42.5,41.9,91.4],
  16:[31.0,38.9,50.2,84.3],
  17:[69.6,38.9,91.9,61.1],
  19:[15.4,63.9,83.5,91.4],
  20:[42.5,49.6,78.3,78.9],
  21:[8.1,39.1,91.9,91.6],
  22:[8.1,38.9,91.9,91.4],
  25:[8.1,74.6,60.6,91.4],
  26:[8.1,38.9,91.9,91.4],
  27:[8.1,38.9,61.7,84.3],
  29:[36.2,63.9,65.8,91.4],
  30:[43.5,76.4,91.9,91.4],
  31:[11.2,38.9,20.0,91.4],
  32:[30.0,51.4,67.9,64.6],
  40:[17.5,53.2,64.8,77.1],
  41:[18.7,81.8,91.6,89.6],
  43:[22.7,38.9,75.2,91.4],
  46:[8.1,58.6,31.5,68.2],
  49:[8.1,63.9,29.4,91.4],
  51:[29.0,47.9,65.8,73.6],
  52:[47.7,60.4,76.2,68.2],
  53:[17.5,65.7,51.2,80.7],
  54:[31.1,71.1,77.3,91.4],
  55:[8.1,65.7,32.5,91.4],
  56:[45.6,62.1,67.9,91.4],
  57:[14.4,65.5,88.3,91.1],
  60:[8.1,78.2,91.9,91.4],
  61:[41.5,78.2,77.3,91.4],
  74:[46.7,55.0,69.0,77.1],
  82:[15.4,38.9,56.5,50.4],
  95:[23.8,38.8,44.0,75.3],
  106:[34.2,38.9,58.5,77.1],
  314:[11.4,38.9,55.5,71.8],
  315:[25.8,38.9,66.9,68.2],
  325:[36.3,65.8,71.7,79.0],
  326:[28.9,47.9,71.0,66.4],
  327:[28.0,38.9,67.8,89.1],
  328:[8.1,65.7,45.0,91.4],
  338:[9.2,63.9,82.5,91.4],
  342:[44.6,53.2,78.3,91.4],
  348:[46.7,69.3,91.9,91.4],
  350:[43.5,76.4,65.8,91.4],
  356:[61.3,80.0,84.6,91.4],
  404:[29.0,49.6,50.2,91.4],
  411:[8.1,38.9,91.9,73.6],
  414:[34.2,60.4,86.7,75.4],
  423:[14.4,83.6,70.0,91.4],
  424:[8.1,72.9,34.6,91.4],
  429:[23.8,38.8,69.0,91.3],
  435:[13.3,71.1,54.4,91.4],
  436:[8.1,38.9,15.8,91.4],
  437:[30.0,56.8,76.2,84.3],
  438:[35.2,78.2,91.9,91.4],
  439:[8.1,42.5,23.1,78.9],
  441:[8.1,76.4,55.4,91.4],
  445:[13.7,78.2,71.4,91.4],
  450:[23.8,62.1,47.1,91.4],
  451:[8.1,56.8,72.1,91.4],
  459:[8.1,65.7,31.4,80.7],
  463:[70.6,71.1,82.5,91.4],
  464:[15.4,63.9,36.7,91.4],
  479:[21.7,65.7,57.5,91.4],
  481:[23.8,40.7,65.8,87.9],
  486:[57.1,53.2,67.9,91.4],
  494:[8.1,81.8,36.7,91.4],
  495:[30.0,44.3,67.9,78.9],
  497:[42.5,69.3,91.9,91.4],
  507:[22.7,71.1,76.2,91.4],
  515:[8.1,74.6,48.1,91.4],
  662:[46.7,74.6,80.4,91.4],
  664:[22.7,62.1,76.2,86.1],
  666:[19.6,63.9,54.4,78.9],
  668:[9.2,69.3,71.0,82.5],
  677:[18.5,71.1,91.9,91.4],
  683:[8.1,53.2,37.7,77.1],
  684:[37.3,60.4,67.9,75.4],
  685:[42.5,69.3,79.4,78.9],
  686:[51.9,74.6,91.9,91.4],
  688:[17.5,47.9,38.8,71.8],
  699:[34.2,55.0,80.4,73.6],
  702:[8.1,65.7,38.8,91.4],
  706:[21.7,56.8,91.9,91.4],
  710:[18.5,63.9,39.8,82.5],
  717:[45.6,69.3,65.8,91.4],
  722:[31.0,81.8,91.9,91.4],
  724:[8.1,78.2,82.5,89.6],
  726:[35.4,74.6,78.4,91.4],
  731:[43.5,63.9,58.5,91.4],
  735:[32.1,63.9,48.1,91.4],
  736:[62.3,55.0,91.9,91.4],
  748:[8.1,85.4,87.7,91.4],
  762:[48.8,55.0,80.4,62.9],
  775:[8.1,72.9,73.1,87.9],
  780:[29.0,85.4,67.9,91.4],
  782:[8.1,74.6,52.3,91.4],
  784:[8.1,44.3,30.4,82.5],
  786:[8.1,72.9,45.0,89.6],
  789:[79.0,47.9,91.9,73.6],
  795:[44.6,55.0,58.5,62.9],
  799:[35.2,55.0,53.3,87.9],
  803:[9.2,72.9,91.9,91.4],
  810:[52.9,55.0,81.5,91.4],
  929:[23.8,53.1,54.4,77.1],
  948:[39.3,76.4,91.8,91.4],
  // The following floors are visually placed where H5 road masks are absent.
  42:[20,55,85,87],
  47:[10,76,55,90],
  100:[10,55,90,87],
  102:[25,43,68,73],
  105:[30,52,74,85],
  110:[34,51,73,73],
  333:[70,40,88,59],
  402:[20,68,80,93],
  405:[18,44,82,82],
  406:[25,55,66,83],
  430:[57,58,84,78],
  443:[23,54,57,81],
  484:[40,78,70,90],
  500:[28,55,78,82],
  676:[32,64,57,80],
  741:[24,62,75,83],
  744:[45,67,79,87],
  746:[17,55,58,80],
  10032:[22,55,76,86],
};

function floorLayout([left,top,right,bottom]:readonly [number,number,number,number]):SceneLayout {
  const width=right-left,height=bottom-top;
  const columns=width<18?1:width<30?2:3,rows=6/columns;
  const homes=Array.from({length:6},(_,index)=>point(
    left+width*(.16+.68*((index%columns+.5)/columns)),
    top+height*(.1+.84*(Math.floor(index/columns)+.5)/rows),
  ));
  return {
    walk:rectangle(left,top,right,bottom),homes,
    entry:point(left+width*.12,bottom-height*.12),
    npc:point(left+width*.66,top+height*.68),
    boss:point(left+width*.65,top+height*.6),
    gates:[point(left+width*.02,top+height*.65),point(right-width*.02,top+height*.65)],
    roam:point(Math.min(5,width/columns*.15),Math.min(3,height/rows*.15)),
    // The shared renderer preserves species scale: a 13cqw host displays the
    // ordinary .52-scale silhouettes at roughly 65–75px in a desktop scene.
    creatureSize:13,
  };
}

/** Manual compositions use visible floor beyond the conservative rectangles.
 * These are remake placements, not a reconstruction of the complete road mask.
 */
const originalOverrides:Record<number,Partial<SceneLayout>>={
  // The recovered platform's top face is centered near (446.5,225.5) on
  // the 960x560 stage. The campaign contact anchors its visible feet here;
  // its name is outside the art box and cannot shift that ground point.
  10032:{boss:point(446.5/960*100,225.5/560*100),entry:point(74,78)},
  4:{entry:point(58,87),npc:point(70,76)},
  5:{entry:point(33,86),npc:point(67,81)},
  25:{walk:[point(10,44),point(37,35),point(50,43),point(50,64),point(59,83),point(55,91),point(10,91)],
    homes:[point(20,49),point(35,47),point(43,63),point(19,81),point(36,82),point(51,85)],
    entry:point(14,86),boss:point(42,78),gates:[point(12,69),point(56,84)],roam:point(3,2),creatureSize:13},
  // The recovered ruin background leaves stone passages around the mechanical
  // hand. Place six readable silhouettes around those passages, rather than
  // stacking six hosts in the original mask's narrow left-hand rectangle.
  31:{walk:[point(3,55),point(10,55),point(35,73),point(35,91),point(26,98),point(3,98)],
    homes:[point(7,65),point(8,79),point(6,94),point(17,96),point(28,91),point(27,77)],
    entry:point(20,81),npc:point(31,84),boss:point(26,88),
    gates:[point(3,49),point(35,95)],roam:point(1.5,1.2),creatureSize:13},
  // The broad central ice field supports a staggered composition. Reserve the
  // lower-left landing and the right ice-cave approach for player and exit.
  40:{walk:[point(17,55),point(33,42),point(62,48),point(78,70),point(64,88),point(27,86)],
    homes:[point(28,60),point(44,58),point(59,63),point(32,77),point(49,80),point(65,79)],
    entry:point(24,74),npc:point(44,74),boss:point(54,73),
    gates:[point(20,56),point(79,69)],roam:point(2.5,2),creatureSize:13},
  // The forest clearing has staggered ground between the giant mushrooms.
  // Separate local territories keep six independently moving residents readable.
  726:{walk:[point(41,70),point(65,66),point(77,72),point(85,84),point(69,97),point(42,97),point(29,89),point(32,80)],
    homes:[point(49,71),point(64,76),point(79,81),point(36,84),point(51,88),point(66,94)],
    roam:point(2.2,1.5),homeRoam:point(2.2,1.5)},
};

export function getSceneLayout(planet:WorldPlanet,region:WorldRegion):SceneLayout {
  const source=region.background??planet.background;
  const originalId=region.backgroundAssetMapId??Number(source.match(/\/maps\/original\/(\d+)\./)?.[1]);
  const placement=originalFloors[originalId]
    ? {...floorLayout(originalFloors[originalId]),...originalOverrides[originalId]}
    : themeLayouts[planet.theme]??common;
  // Player navigation remains free. Wildlife uses the separate terrain polygon
  // and its local roaming radius instead of inheriting the full click plane.
  return {...placement,bossHomes:originalBossHomes[originalId],bossActors:originalBossActors[originalId],habitat:placement.habitat??placement.walk,walk:rectangle(1,1,99,99)};
}

export function creatureSceneHome(layout:SceneLayout,index:number,count:number):ScenePoint {
  if(count===1)return constrainHabitatPoint(layout,layout.homes[1]??layout.boss);
  // Keep the original six-position composition for ordinary populations. Rich
  // habitats need distinct anchors rather than wrapping onto occupied homes.
  if(count>layout.homes.length) {
    const polygon=layout.habitat??layout.walk;
    const xs=polygon.map(home=>home.x),ys=polygon.map(home=>home.y);
    const left=Math.min(...xs),top=Math.min(...ys);
    const width=Math.max(...xs)-left,height=Math.max(...ys)-top;
    const columns=Math.max(1,Math.ceil(Math.sqrt(count*width/Math.max(height,1))));
    const rows=Math.max(1,Math.ceil(count/columns));
    // Sample inside the polygon, rather than projecting a wide grid onto its
    // boundary. Denser grids also cover narrow and concave authored terrain.
    for(let density=1;density<=8;density++){
      const candidates:ScenePoint[]=[];
      for(let y=0;y<rows*density;y++)for(let x=0;x<columns*density;x++){
        const candidate=point(left+width*(x+.5)/(columns*density),top+height*(y+.5)/(rows*density));
        if(insideScenePolygon(polygon,candidate))candidates.push(candidate);
      }
      if(candidates.length>=count)return candidates[Math.floor(((index%count)+.5)*candidates.length/count)];
    }
  }
  return constrainHabitatPoint(layout,layout.homes[index%layout.homes.length]??layout.boss);
}

/** Use an encounter-specific source point, or the existing remake arrangement. */
export function getSceneBossHome(layout:SceneLayout,bossId:string,index:number,count:number):ScenePoint {
  return layout.bossActors?.[bossId]?.anchor??layout.bossHomes?.[bossId]??constrainScenePoint(layout,point(layout.boss.x+(index-(count-1)/2)*15,layout.boss.y));
}

export function getSceneBossActor(layout:SceneLayout,bossId:string):SceneBossActor|undefined {
  return layout.bossActors?.[bossId];
}

function insideScenePolygon(polygon:readonly ScenePoint[],position:ScenePoint):boolean {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a.y>position.y)!==(b.y>position.y)&&position.x<(b.x-a.x)*(position.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}

function constrainPolygonPoint(polygon:readonly ScenePoint[],position:ScenePoint):ScenePoint {
  if(insideScenePolygon(polygon,position))return position;
  let nearest=polygon[0],distance=Infinity;
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((position.x-a.x)*dx+(position.y-a.y)*dy)/(dx*dx+dy*dy)));
    const candidate=point(a.x+t*dx,a.y+t*dy),d=(candidate.x-position.x)**2+(candidate.y-position.y)**2;
    if(d<distance){distance=d;nearest=candidate}
  }
  return nearest;
}

/** Project a player click onto the free scene interaction plane. */
export function constrainScenePoint(layout:SceneLayout,position:ScenePoint):ScenePoint {
  return constrainPolygonPoint(layout.walk,position);
}

/** Keep wildlife inside its own terrain without changing player navigation. */
export function constrainHabitatPoint(layout:SceneLayout,position:ScenePoint):ScenePoint {
  return constrainPolygonPoint(layout.habitat??layout.walk,position);
}
