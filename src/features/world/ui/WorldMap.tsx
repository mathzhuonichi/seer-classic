import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import type { GameController } from '../../../kernel/contract.ts';
import { getSceneExits, type SceneExit } from '../scene-exits.ts';
import { percentIn, type ScenePoint } from '../scene-geometry.ts';
import { buildWorldPopulation } from '../world-population.ts';
import {
  buildWorldDialogue, buildWorldScene, sceneTitle, type SceneEquipment, type WorldSceneView, type WorldSelection,
} from '../world-scene.ts';
import { ARROW_STEPS, visiblePlayerPoint } from '../world-walk.ts';
import { BRAVE_TOWER_LOCATION, findChallengeLocation, isWorldLocation, resolveWorldLocation, type WorldPlanet, type WorldRegion } from '../../../domain/world/world.ts';
import { useGame } from '../../../shared/ui/use-game.ts';
import ClassicRobot from './ClassicRobot.tsx';
import { nameplateClass } from './nameplate.ts';
import { SceneContacts, at } from './SceneContacts.tsx';
import { TowerHud } from './TowerHud.tsx';
import { sceneCovered } from './scene-cover.ts';
import { useSceneKeys } from './useSceneKeys.ts';
import { useSceneFit, useTowerLanding, useWorldWalk } from './useWorldWalk.ts';
import { WorldDialogue, type WorldInteraction } from './WorldDialogue.tsx';
import './world.css';

export interface WorldMapProps {
  c: GameController; onNavigate?: (page: string) => void;
  /** `variant`: the Boss variant picked in the challenge archive, preselected in its dialogue (null: the practice fight). */
  travelTo?: { planetId: string; regionId?: string; bossId?: string; variant?: string | null; requestId?: number };
  onInteract?: (event: WorldInteraction) => void;
  onSceneChange?: (scene: {src:string;name:string}) => void;
}
/** Wildlife shown per scene, before scarce species stay single. */
const SCENE_POPULATION = 6;
const ARRIVAL_FLASH_MS = 380;
const sceneClass = ({ planet, official, tower }: WorldSceneView) => `world-scene theme-${planet.theme} ${official?'world-original-scene':'world-authored-scene'}`
  +`${planet.id==='space-station'?' world-station-scene':''}${tower?' world-tower-scene':''}`;

export function WorldMap({c,onNavigate,travelTo,onInteract,onSceneChange}:WorldMapProps) {
  const bosses=useGame(c,s=>s.bosses),species=useGame(c,s=>s.species),campaigns=useGame(c,s=>s.campaigns),quests=useGame(c,s=>s.quests);
  const braveTower=useGame(c,s=>s.braveTower),battle=useGame(c,s=>!!s.battle);
  const world=useMemo(()=>({bosses,species,campaigns,braveTower,quests}),[bosses,species,campaigns,braveTower,quests]);
  const viewport=useRef<HTMLElement>(null);
  const walker=useWorldWalk(),{planet,region,layout,position,motion}=walker;
  const [dialogue,setDialogue]=useState<{selection:WorldSelection;details:boolean;variant?:string|null}|null>(null);
  const [arrival,setArrival]=useState(false);
  const scene=buildWorldScene(world,planet,region,travelTo?.bossId),{tower}=scene;
  const {size,onLoad}=useSceneFit(viewport,scene.background);
  const visiblePosition=visiblePlayerPoint(position,size);
  const exits=useMemo(()=>getSceneExits(planet,region),[planet,region]);
  const creatures=useMemo(()=>{
    const habitat=region.creatures.map(id=>species.find(row=>row.id===id)).filter(row=>!!row);
    return buildWorldPopulation(`${planet.id}/${region.id}`,habitat,SCENE_POPULATION,region.levels,region.creatureLevels,region.scarceCreatures);
  },[planet,region,species]);
  const view=dialogue?buildWorldDialogue(world,scene,dialogue.selection):undefined;
  const open=(selection:WorldSelection,variant?:string|null)=>setDialogue({selection,details:false,variant});
  const close=()=>setDialogue(null);

  function walkTo(x:number,y:number,after?:()=>void){close();walker.walkTo(x,y,after)}
  function visit(p:WorldPlanet,r:WorldRegion,entry?:ScenePoint){walker.visit(p,r,entry);close();setArrival(true)}
  useEffect(()=>onSceneChange?.({src:scene.background,name:scene.name}),[scene.background,scene.name,onSceneChange]);
  useEffect(()=>{if(!arrival)return;const timer=setTimeout(()=>setArrival(false),ARRIVAL_FLASH_MS);return()=>clearTimeout(timer)},[arrival]);
  useEffect(()=>{if(battle){walker.stop();close()}},[battle]);
  useTowerLanding(tower,()=>visit(planet,region),()=>{walker.stop({duration:0});close();setArrival(true)});
  useEffect(()=>{
    if(!travelTo)return;
    const targetBoss=travelTo.bossId?bosses.find(boss=>boss.id===travelTo.bossId):undefined;
    const landing=targetBoss?findChallengeLocation(targetBoss):travelTo;
    const target=resolveWorldLocation(landing.planetId,landing.regionId??'');visit(target.planet,target.region);
    if(targetBoss&&!isWorldLocation(target.planet,target.region,BRAVE_TOWER_LOCATION))
      open(target.region.campaignId?{kind:'campaign',id:target.region.campaignId}:{kind:'boss',id:targetBoss.id},travelTo.variant);
  },[travelTo?.planetId,travelTo?.regionId,travelTo?.bossId,travelTo?.variant,travelTo?.requestId]);
  const step=(key:string)=>{const delta=ARROW_STEPS[key];walkTo(position.x+delta[0],position.y+delta[1])};
  useSceneKeys(battle,{step,dismiss:()=>{walker.stop();close()}});

  function walkClick(event:MouseEvent<HTMLDivElement>){
    const target=percentIn(event.currentTarget.getBoundingClientRect(),event.clientX,event.clientY);
    walkTo(target.x,target.y);
  }
  function walkKey(event:KeyboardEvent<HTMLDivElement>){
    if(event.target===event.currentTarget&&ARROW_STEPS[event.key]&&!sceneCovered()){event.preventDefault();step(event.key)}
  }
  function approach(event:MouseEvent<HTMLButtonElement>,selection:WorldSelection,contact:ScenePoint){
    event.stopPropagation();close();
    const approaching=selection.kind==='creature'?selection.instanceId:null;
    walker.approach(event.currentTarget,contact,{arrive:()=>open(selection),approaching,fallback:visiblePosition});
  }
  function gate(event:MouseEvent<HTMLButtonElement>,exit:SceneExit){
    event.stopPropagation();
    const next=planet.regions.find(candidate=>candidate.id===exit.targetRegionId)!;
    walkTo(exit.anchor.x,exit.anchor.y,()=>visit(planet,next,exit.entry));
  }
  function operate(event:MouseEvent<HTMLButtonElement>,equipment:SceneEquipment){
    event.stopPropagation();
    walkTo(equipment.approach.x,equipment.approach.y,()=>onNavigate?.(equipment.page));
  }
  function chooseTowerStart(){walker.stop();close();onNavigate?.('tower:choose')}

  const selection=dialogue?.selection;
  const frozen=(instanceId:string)=>motion.approaching===instanceId||(selection?.kind==='creature'&&selection.instanceId===instanceId);
  const sceneStyle={'--world-color':planet.color,'--walk-duration':`${motion.duration}ms`} as CSSProperties;
  return <section ref={viewport} className={`world-exploration ${arrival?'world-arrival':''}`} style={sceneStyle} aria-label="星球探索">
    <div key={`${scene.key}#${walker.landings}`} className={sceneClass(scene)} style={{width:size.width,height:size.height}}
      data-background-kind={region.backgroundKind??(scene.official?'official':'authored')} data-map-id={region.originalMapId??planet.originalMapId}
      data-tower-floor={tower?.floor} data-tower-complete={tower?.complete} tabIndex={0}
      aria-label={`${scene.name}。点击地面或方向键移动，点击精灵、设施或出口走过去互动。`} onClick={walkClick} onKeyDown={walkKey}>
      <img className="world-background" src={scene.background} alt="" draggable={false} onLoad={onLoad}/>
      {!scene.official&&<div className="world-authored-light" aria-hidden="true"/>}
      <div className={nameplateClass(scene.name)} title={sceneTitle(scene)}><strong>{scene.name}</strong></div>
      {tower&&<TowerHud tower={tower} onChooseStart={chooseTowerStart}/>}
      <SceneContacts scene={scene} layout={layout} exits={exits} creatures={creatures} battle={battle} frozen={frozen}
        onGate={gate} onApproach={approach} onOperate={operate}/>
      <div ref={walker.player} className="world-player" style={at(visiblePosition)}>
        <ClassicRobot direction={motion.direction} walking={motion.moving} role="player"/><span>赛尔</span>
      </div>
      {motion.moving&&<div className="world-walk-marker" style={at(position)} aria-hidden="true"/>}
      <div className="world-ground-hint" aria-live="polite">{motion.moving?'正在前往…':scene.hint}</div>
    </div>
    {view&&<WorldDialogue view={view} showDetails={!!dialogue?.details} c={c} onNavigate={onNavigate} onInteract={onInteract} onClose={close}
      onToggleDetails={()=>setDialogue(old=>old&&{...old,details:!old.details})} onChooseStart={chooseTowerStart}
      variant={dialogue?.variant} onChooseVariant={variant=>setDialogue(old=>old&&{...old,variant})}/>}
  </section>;
}
export default WorldMap;
