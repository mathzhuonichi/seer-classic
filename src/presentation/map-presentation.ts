import type { WorldPlanet, WorldRegion } from '../world';

export interface ScenePoint { x: number; y: number }
export interface SceneLayout {
  /** The interaction plane covers 96% of the image; terrain does not block clicks. */
  walk: readonly ScenePoint[];
  homes: readonly ScenePoint[];
  entry: ScenePoint;
  npc: ScenePoint;
  boss: ScenePoint;
  gates: readonly [ScenePoint, ScenePoint];
  roam: ScenePoint;
  creatureSize?: number;
}
const point=(x:number,y:number):ScenePoint=>({x,y});
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
  // Official map 10032 places top_mc.puli_mc at (439.95,160.45) on a
  // 960x560 stage. Its first frame is empty: this is an animation origin,
  // not a foot point. Keep that x and fit our bottom-anchored contact to the
  // central portal. See design/notes/puni-location-v38.md for the distinction.
  10032:{boss:point(45.828125,55),entry:point(74,78)},
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
};

export function getSceneLayout(planet:WorldPlanet,region:WorldRegion):SceneLayout {
  const source=region.background??planet.background;
  const originalId=Number(source.match(/\/maps\/original\/(\d+)\./)?.[1]);
  const placement=originalFloors[originalId]
    ? {...floorLayout(originalFloors[originalId]),...originalOverrides[originalId]}
    : themeLayouts[planet.theme]??common;
  // Retain useful artwork anchors, but make the whole map usable. Original
  // road masks are placement references and no longer restrict interaction.
  return {...placement,walk:rectangle(1,1,99,99),roam:point(25,20)};
}

export function creatureSceneHome(layout:SceneLayout,index:number,count:number):ScenePoint {
  if(count===1)return layout.homes[1]??layout.boss;
  // Keep the original six-position composition for ordinary populations. Rich
  // habitats need distinct anchors rather than wrapping onto occupied homes.
  if(count>layout.homes.length) {
    const xs=layout.homes.map(home=>home.x),ys=layout.homes.map(home=>home.y);
    const width=Math.max(60,Math.max(...xs)-Math.min(...xs));
    const height=Math.max(32,Math.max(...ys)-Math.min(...ys));
    const left=Math.max(8,Math.min(92-width,(Math.min(...xs)+Math.max(...xs)-width)/2));
    const top=Math.max(38,Math.min(92-height,(Math.min(...ys)+Math.max(...ys)-height)/2));
    const columns=Math.ceil(Math.sqrt(count*1.5)),rows=Math.ceil(count/columns);
    const row=Math.floor(index/columns),inRow=Math.min(columns,count-row*columns);
    return point(left+width*(index%columns+.5)/inRow,top+height*(row+.5)/rows);
  }
  return layout.homes[index%layout.homes.length];
}

/** Project a click onto the nearest edge when it falls outside the scene floor. */
export function constrainScenePoint(layout:SceneLayout,position:ScenePoint):ScenePoint {
  let inside=false;
  const polygon=layout.walk;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a.y>position.y)!==(b.y>position.y)&&position.x<(b.x-a.x)*(position.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  if(inside)return position;
  let nearest=polygon[0],distance=Infinity;
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((position.x-a.x)*dx+(position.y-a.y)*dy)/(dx*dx+dy*dy)));
    const candidate=point(a.x+t*dx,a.y+t*dy),d=(candidate.x-position.x)**2+(candidate.y-position.y)**2;
    if(d<distance){distance=d;nearest=candidate}
  }
  return nearest;
}
