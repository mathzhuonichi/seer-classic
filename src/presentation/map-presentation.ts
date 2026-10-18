import type { WorldPlanet, WorldRegion } from '../world.ts';
import { ACTOR_CROPS, CONTACT_ANCHORS, ORIGINAL_FLOORS, SCENE_VIEWPORTS, STAGE_VIEWPORT, type SceneRect } from './map-sources.ts';
import { constrainToPolygon, insidePolygon, point, polygonBounds, rectangle, type ScenePoint } from './scene-geometry.ts';

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
  habitat: readonly ScenePoint[];
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
/** An authored composition: everything except the free player plane and the source contacts. */
type ScenePlacement = Omit<SceneLayout,'walk'|'bossHomes'|'bossActors'>;

const PLAYER_PLANE=rectangle(1,1,99,99);
/** Spacing between contacts that have no source position. */
const BOSS_SPACING=15;

const viewportOf=(mapId:number)=>SCENE_VIEWPORTS[mapId]??STAGE_VIEWPORT;
const stagePoint=(mapId:number,[x,y]:readonly [number,number])=>{
  const [left,top,width,height]=viewportOf(mapId);
  return point((x-left)/width*100,(y-top)/height*100);
};
function byMap<T,U>(table:Record<number,Readonly<Record<string,T>>>,build:(mapId:number,id:string,value:T)=>U):Record<number,Readonly<Record<string,U>>> {
  return Object.fromEntries(Object.entries(table).map(([mapId,entries])=>
    [mapId,Object.fromEntries(Object.entries(entries).map(([id,value])=>[id,build(Number(mapId),id,value)]))]));
}
const BOSS_HOMES=byMap(CONTACT_ANCHORS,(mapId,_id,anchor)=>stagePoint(mapId,anchor));
const BOSS_ACTORS=byMap(ACTOR_CROPS,(mapId,id,{src,size:[width,height]}):SceneBossActor=>{
  const viewport=viewportOf(mapId);
  return {src,width:width/viewport[2]*100,height:height/viewport[3]*100,anchor:BOSS_HOMES[mapId][id]};
});

const common:ScenePlacement={
  habitat:rectangle(10,56,90,90),
  homes:[point(24,70),point(44,66),point(64,70),point(32,85),point(54,84),point(76,85)],
  entry:point(16,87),npc:point(66,77),boss:point(66,78),
  gates:[point(8,76),point(92,76)],roam:point(5,3),
};
const themeLayouts:Record<string,ScenePlacement>={
  station:{...common,habitat:rectangle(13,59,87,88),entry:point(28,84),npc:point(63,75),gates:[point(10,75),point(90,75)]},
  grass:{...common,habitat:[point(14,64),point(71,58),point(86,76),point(86,91),point(14,91)],
    homes:[point(25,74),point(45,72),point(63,72),point(31,87),point(54,85),point(75,86)]},
  cloud:{...common,habitat:[point(17,67),point(74,61),point(85,75),point(79,88),point(24,88)],
    homes:[point(28,73),point(45,71),point(63,71),point(34,84),point(53,83),point(71,82)],entry:point(25,86),gates:[point(18,76),point(83,77)],roam:point(4,2)},
  volcano:{...common,habitat:[point(16,66),point(76,60),point(87,84),point(81,90),point(16,90)],
    homes:[point(27,74),point(46,72),point(65,73),point(33,86),point(52,85),point(74,85)],entry:point(22,87),roam:point(4,2.5)},
  ocean:{...common,habitat:rectangle(15,63,86,90),homes:[point(27,72),point(47,71),point(67,72),point(33,86),point(55,85),point(75,86)],
    entry:point(22,87)},
};

/** Six homes on a grid inside an open source floor rectangle. */
function floorLayout([left,top,right,bottom]:SceneRect):ScenePlacement {
  const width=right-left,height=bottom-top;
  const columns=width<18?1:width<30?2:3,rows=6/columns;
  const homes=Array.from({length:6},(_,index)=>point(
    left+width*(.16+.68*((index%columns+.5)/columns)),
    top+height*(.1+.84*(Math.floor(index/columns)+.5)/rows),
  ));
  return {
    habitat:rectangle(left,top,right,bottom),homes,
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
const originalOverrides:Record<number,Partial<ScenePlacement>>={
  // The recovered platform's top face is centered near (446.5,225.5) on
  // the 960x560 stage. The campaign contact anchors its visible feet here;
  // its name is outside the art box and cannot shift that ground point.
  10032:{boss:stagePoint(10032,[446.5,225.5]),entry:point(74,78)},
  4:{entry:point(58,87),npc:point(70,76)},
  5:{entry:point(33,86),npc:point(67,81)},
  25:{habitat:[point(10,44),point(37,35),point(50,43),point(50,64),point(59,83),point(55,91),point(10,91)],
    homes:[point(20,49),point(35,47),point(43,63),point(19,81),point(36,82),point(51,85)],
    entry:point(14,86),boss:point(42,78),gates:[point(12,69),point(56,84)],roam:point(3,2),creatureSize:13},
  // The recovered ruin background leaves stone passages around the mechanical
  // hand. Place six readable silhouettes around those passages, rather than
  // stacking six hosts in the original mask's narrow left-hand rectangle.
  31:{habitat:[point(3,55),point(10,55),point(35,73),point(35,91),point(26,98),point(3,98)],
    homes:[point(7,65),point(8,79),point(6,94),point(17,96),point(28,91),point(27,77)],
    entry:point(20,81),npc:point(31,84),boss:point(26,88),
    gates:[point(3,49),point(35,95)],roam:point(1.5,1.2),creatureSize:13},
  // The broad central ice field supports a staggered composition. Reserve the
  // lower-left landing and the right ice-cave approach for player and exit.
  40:{habitat:[point(17,55),point(33,42),point(62,48),point(78,70),point(64,88),point(27,86)],
    homes:[point(28,60),point(44,58),point(59,63),point(32,77),point(49,80),point(65,79)],
    entry:point(24,74),npc:point(44,74),boss:point(54,73),
    gates:[point(20,56),point(79,69)],roam:point(2.5,2),creatureSize:13},
  // The forest clearing has staggered ground between the giant mushrooms.
  // Separate local territories keep six independently moving residents readable.
  726:{habitat:[point(41,70),point(65,66),point(77,72),point(85,84),point(69,97),point(42,97),point(29,89),point(32,80)],
    homes:[point(49,71),point(64,76),point(79,81),point(36,84),point(51,88),point(66,94)],
    roam:point(2.2,1.5),homeRoam:point(2.2,1.5)},
};

export function getSceneLayout(planet:WorldPlanet,region:WorldRegion):SceneLayout {
  const source=region.background??planet.background;
  const mapId=region.backgroundAssetMapId??Number(source.match(/\/maps\/original\/(\d+)\./)?.[1]);
  const floor=ORIGINAL_FLOORS[mapId];
  const placement=floor?{...floorLayout(floor),...originalOverrides[mapId]}:themeLayouts[planet.theme]??common;
  // Player navigation remains free. Wildlife uses the separate terrain polygon
  // and its local roaming radius instead of inheriting the full click plane.
  return {...placement,bossHomes:BOSS_HOMES[mapId],bossActors:BOSS_ACTORS[mapId],walk:PLAYER_PLANE};
}

/** Distinct grid anchors inside the habitat for populations larger than the six authored homes. */
function denseHome(polygon:readonly ScenePoint[],index:number,count:number):ScenePoint|undefined {
  const {left,top,right,bottom}=polygonBounds(polygon),width=right-left,height=bottom-top;
  const columns=Math.max(1,Math.ceil(Math.sqrt(count*width/Math.max(height,1))));
  const rows=Math.max(1,Math.ceil(count/columns));
  // Sample inside the polygon, rather than projecting a wide grid onto its
  // boundary. Denser grids also cover narrow and concave authored terrain.
  for(let density=1;density<=8;density++){
    const candidates:ScenePoint[]=[];
    for(let y=0;y<rows*density;y++)for(let x=0;x<columns*density;x++){
      const candidate=point(left+width*(x+.5)/(columns*density),top+height*(y+.5)/(rows*density));
      if(insidePolygon(polygon,candidate))candidates.push(candidate);
    }
    if(candidates.length>=count)return candidates[Math.floor(((index%count)+.5)*candidates.length/count)];
  }
  return undefined;
}

export function creatureSceneHome(layout:SceneLayout,index:number,count:number):ScenePoint {
  if(count===1)return constrainHabitatPoint(layout,layout.homes[1]??layout.boss);
  // Keep the original six-position composition for ordinary populations. Rich
  // habitats need distinct anchors rather than wrapping onto occupied homes.
  const dense=count>layout.homes.length?denseHome(layout.habitat,index,count):undefined;
  return dense??constrainHabitatPoint(layout,layout.homes[index%layout.homes.length]??layout.boss);
}

/** Use an encounter-specific source point, or the existing remake arrangement. */
export function getSceneBossHome(layout:SceneLayout,bossId:string,index:number,count:number):ScenePoint {
  return layout.bossActors?.[bossId]?.anchor??layout.bossHomes?.[bossId]
    ??constrainScenePoint(layout,point(layout.boss.x+(index-(count-1)/2)*BOSS_SPACING,layout.boss.y));
}

export function getSceneBossActor(layout:SceneLayout,bossId:string):SceneBossActor|undefined {
  return layout.bossActors?.[bossId];
}

/** Project a player click onto the free scene interaction plane. */
export function constrainScenePoint(layout:SceneLayout,position:ScenePoint):ScenePoint {
  return constrainToPolygon(layout.walk,position);
}

/** Keep wildlife inside its own terrain without changing player navigation. */
export function constrainHabitatPoint(layout:SceneLayout,position:ScenePoint):ScenePoint {
  return constrainToPolygon(layout.habitat,position);
}
