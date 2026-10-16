import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import type { GameController, GameSnapshot, SpeciesView } from '../game-types';
import { WORLD_PLANETS, findChallengeLocation, findSceneChallenges, findSpeciesLocation, readWorldPreference, resolveWorldLocation, writeWorldPreference, type WorldPlanet, type WorldRegion } from '../world';
import { CreatureArt } from './CreatureArt';
import { buildWorldPopulation } from '../presentation/world-population';
import { constrainScenePoint, constrainHabitatPoint, creatureSceneHome, getSceneBossActor, getSceneBossHome, getSceneLayout, type SceneLayout } from '../presentation/map-presentation';
import {getSceneExits,type SceneExit} from '../presentation/scene-exits';
import {contactApproachPoint} from '../presentation/world-interaction';
import {BRAVE_TOWER_FLOORS,braveTowerBossId,normalizeBraveTowerProgress} from '../progression/brave-tower';
import ClassicRobot from './ClassicRobot';
import BossEvidence from './BossEvidence';
import {encounterLevelText} from '../presentation/encounter-level';
import '../world.css';

export interface WorldDestination { planetId: string; regionId: string }
export interface WorldMapProps {
  s: GameSnapshot; c: GameController; onNavigate?: (page: string) => void; focusSpecies?: number;
  travelTo?: { planetId: string; regionId?: string; bossId?: string; requestId?: number };
  onInteract?: (event: { kind: 'species'; species: number } | {kind:'quest';questId:string}) => void;
  onSceneChange?: (scene: {src:string;name:string}) => void;
}
type Selection = { kind: 'creature'; id: number; instanceId?: string; level?: number } | { kind: 'boss'; id: string } | { kind: 'campaign'; id: string } | { kind: 'facility' };

type WorldPoint = { x:number; y:number };
type SceneTerminal = WorldPoint & {page:string;name:string;hint:string;width:number;height:number;approach:WorldPoint;captionAbove?:boolean};
// One interaction on each retained piece of equipment. These footprints are
// visual adaptations of the original backgrounds, not additional map rooms.
const stationTerminals:Record<string,SceneTerminal>={
  resources:{page:'facilities:random',name:'对战终端',hint:'随机 · 巅峰 · 经典',x:74,y:18,width:17,height:36,approach:{x:69,y:44}},
  'dark-arena':{page:'challenge:dark',name:'暗黑挑战终端',hint:'选择挑战之门',x:49,y:93,width:16,height:12,approach:{x:49,y:78},captionAbove:true},
};
type RobotDirection = 'front'|'back'|'left'|'right'|'front-left'|'front-right'|'back-left'|'back-right';
type RoamLeg = { from:WorldPoint; to:WorldPoint; control:WorldPoint|null; elapsed:number; duration:number };
type RoamState = { position:WorldPoint; rest:number; leg:RoamLeg|null; facing:'left'|'right' };
const between=(minimum:number,maximum:number)=>minimum+Math.random()*(maximum-minimum);
const clamp=(value:number,minimum:number,maximum:number)=>Math.max(minimum,Math.min(maximum,value));
function robotDirection(dx:number,dy:number):RobotDirection {
  const views:RobotDirection[]=['right','front-right','front','front-left','left','back-left','back','back-right'];
  return views[(Math.round(Math.atan2(dy,dx)/(Math.PI/4))+8)%8];
}

function RoamingCreature({species,instanceId,level,index,count,layout,frozen,battle,onApproach}: {
  species:SpeciesView;instanceId:string;level:number;index:number;count:number;layout:SceneLayout;frozen:boolean;battle:boolean;
  onApproach:(event:MouseEvent<HTMLButtonElement>,x:number,y:number)=>void;
}) {
  const button=useRef<HTMLButtonElement>(null),freeze=useRef(frozen);
  const state=useRef<RoamState|null>(null);
  freeze.current=frozen;
  const home=creatureSceneHome(layout,index,count);
  useEffect(()=>{
    let frame=0,last=0;
    const habitat=layout.habitat??layout.walk;
    const habitatBounds={left:Math.min(...habitat.map(p=>p.x)),right:Math.max(...habitat.map(p=>p.x)),
      top:Math.min(...habitat.map(p=>p.y)),bottom:Math.max(...habitat.map(p=>p.y))};
    if(layout.homeRoam){
      habitatBounds.left=Math.max(habitatBounds.left,home.x-layout.homeRoam.x);
      habitatBounds.right=Math.min(habitatBounds.right,home.x+layout.homeRoam.x);
      habitatBounds.top=Math.max(habitatBounds.top,home.y-layout.homeRoam.y);
      habitatBounds.bottom=Math.min(habitatBounds.bottom,home.y+layout.homeRoam.y);
    }
    const resetClock=()=>{last=0};
    document.addEventListener('visibilitychange',resetClock);
    const tick=(now:number)=>{
      const element=button.current;
      if(!element)return;
      const sceneElement=element.closest<HTMLElement>('.world-scene')!;
      const scene={width:sceneElement.clientWidth,height:sceneElement.clientHeight};
      const visible=!!element.getClientRects().length&&scene.width>0&&scene.height>0;
      const blocked=battle||document.hidden||!visible||
        !!document.querySelector('.scene-window,.scene-window-shield,.modal-backdrop,.battle-loading');
      const paused=freeze.current||blocked;
      const delta=last?Math.min(80,now-last):0;last=now;
      if(visible){
        // The host ends at the creature's feet; its name is outside the art box.
        // Reserve space for the separate label when fitting a small viewport.
        const padding=Math.min(12,Math.max(1,Math.min(scene.width,scene.height)*.04));
        const labelHeight=(element.querySelector<HTMLElement>('.world-character-name')?.offsetHeight??0)+4;
        const fit=Math.min(1,(scene.width-padding*2)/element.offsetWidth,(scene.height-padding*2)/(element.offsetHeight+labelHeight));
        element.style.setProperty('--roam-size',String(Math.max(.01,fit)));
        const width=element.offsetWidth*Math.max(.01,fit),height=element.offsetHeight*Math.max(.01,fit);
        const bounds={left:(width/2+padding)/scene.width*100,right:100-(width/2+padding)/scene.width*100,
          top:(height+padding)/scene.height*100,bottom:100-(padding+labelHeight*Math.max(.01,fit))/scene.height*100};
        const constrain=(point:WorldPoint):WorldPoint=>constrainHabitatPoint(layout,{
          x:clamp(layout.homeRoam?clamp(point.x,habitatBounds.left,habitatBounds.right):point.x,bounds.left,bounds.right),
          y:clamp(layout.homeRoam?clamp(point.y,habitatBounds.top,habitatBounds.bottom):point.y,bounds.top,bounds.bottom)});
        const center=constrain(home);
        const randomHabitatPoint=()=>{
          const left=Math.max(bounds.left,habitatBounds.left),right=Math.min(bounds.right,habitatBounds.right);
          const top=Math.max(bounds.top,habitatBounds.top),bottom=Math.min(bounds.bottom,habitatBounds.bottom);
          if(right<=left||bottom<=top)return center;
          for(let attempt=0;attempt<24;attempt++){
            const candidate={x:between(left,right),y:between(top,bottom)},projected=constrain(candidate);
            if(Math.hypot(candidate.x-projected.x,candidate.y-projected.y)<.001)return candidate;
          }
          return center;
        };
        if(!state.current)state.current={position:constrain({x:home.x+between(-7,7),y:home.y+between(-5,5)}),rest:between(150,1400),leg:null,facing:'right'};
        const roam=state.current;
        roam.position=constrain(roam.position);
        if(!paused){
          if(!roam.leg){
            roam.rest-=delta;
            if(roam.rest<=0){
              // Independent routes stay inside the creature habitat; the player's
              // unrestricted interaction plane is deliberately separate.
              const choice=Math.random();
              const target=choice<.45
                ? constrain({x:roam.position.x+between(-layout.roam.x,layout.roam.x),y:roam.position.y+between(-layout.roam.y,layout.roam.y)})
                : choice<.9
                  ? randomHabitatPoint()
                  : constrain({x:center.x+between(-layout.roam.x,layout.roam.x),y:center.y+between(-layout.roam.y,layout.roam.y)});
              const dx=target.x-roam.position.x,dy=target.y-roam.position.y;
              const distance=Math.hypot(dx*scene.width/100,dy*scene.height/100);
              if(distance>3){
                const bend=between(-.55,.55);
                const control=Math.random()<.65?constrain({x:(target.x+roam.position.x)/2-dy*bend,
                  y:(target.y+roam.position.y)/2+dx*bend}):null;
                roam.leg={from:{...roam.position},to:target,control,elapsed:0,duration:clamp(distance/between(scene.width*.035,scene.width*.075)*1000,900,18000)};
                element.dataset.path=control?'curved':'straight';
              }else roam.rest=between(600,1700);
            }
          }
          if(roam.leg){
            const leg=roam.leg;leg.elapsed=Math.min(leg.duration,leg.elapsed+delta);
            const fraction=(1-Math.cos(Math.PI*leg.elapsed/leg.duration))/2;
            leg.from=constrain(leg.from);leg.to=constrain(leg.to);
            if(leg.control)leg.control=constrain(leg.control);
            const next=leg.control?{
              x:(1-fraction)**2*leg.from.x+2*(1-fraction)*fraction*leg.control.x+fraction**2*leg.to.x,
              y:(1-fraction)**2*leg.from.y+2*(1-fraction)*fraction*leg.control.y+fraction**2*leg.to.y,
            }:{x:leg.from.x+(leg.to.x-leg.from.x)*fraction,y:leg.from.y+(leg.to.y-leg.from.y)*fraction};
            const horizontal=next.x-roam.position.x;
            if(Math.abs(horizontal)>.001)roam.facing=horizontal<0?'left':'right';
            roam.position=constrain(next);
            if(leg.elapsed>=leg.duration){roam.leg=null;roam.rest=between(450,2600)+(Math.random()<.18?between(1700,4300):0)}
          }
        }
        element.style.left=`${roam.position.x}%`;element.style.top=`${roam.position.y}%`;
        element.dataset.direction=roam.facing;
      }
      element.dataset.motion=paused?'paused':state.current?.leg?'walking':'idle';
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',resetClock)};
  },[index,count,instanceId,battle,layout]);
  function approach(event:MouseEvent<HTMLButtonElement>){
    event.stopPropagation();freeze.current=true;
    event.currentTarget.dataset.motion='paused';
    const scene=event.currentTarget.closest('.world-scene')!.getBoundingClientRect();
    const actual=event.currentTarget.getBoundingClientRect();
    onApproach(event,(actual.left+actual.width/2-scene.left)/scene.width*100,
      (actual.bottom-scene.top)/scene.height*100);
  }
  return <button ref={button} className="world-creature world-roamer" style={{left:`${home.x}%`,top:`${home.y}%`,'--scene-creature-size':layout.creatureSize??9} as CSSProperties}
    data-species={species.id} data-instance={instanceId} data-level={level} data-direction="right" data-motion="idle" aria-label={`与${species.name}互动`} onClick={approach}>
    <span className="world-creature-shadow"/><span className="world-roaming-footsteps" aria-hidden="true"><i/><i/></span>
    <div className="world-sprite-art"><div className="world-roaming-turn"><div className="world-roaming-step"><CreatureArt species={species.id} name={species.name}/></div></div></div>
    <span className="world-character-name">{species.name}<small>Lv.{level}</small></span>
  </button>;
}

function Facility({kind}:{kind:NonNullable<WorldRegion['facility']>}) {
  return <div className="world-facility-art world-original-npc"><ClassicRobot direction="front" walking={false} role={kind==='missions'?'captain':kind==='recovery'?'scientist':'player'}/></div>;
}

export function WorldMap({s,c,onNavigate,focusSpecies,travelTo,onInteract,onSceneChange}:WorldMapProps) {
  const [preference,setPreference]=useState(readWorldPreference);
  const [selection,setSelection]=useState<Selection|null>(null);
  const [approachingInstance,setApproachingInstance]=useState<string|null>(null);
  const [moving,setMoving]=useState(false);
  const [playerDirection,setPlayerDirection]=useState<RobotDirection>('front');
  const player=useRef<HTMLDivElement>(null);
  const [duration,setDuration]=useState(650);
  const [showDetails,setShowDetails]=useState(false);
  const [arrival,setArrival]=useState(false);
  const viewport=useRef<HTMLElement>(null);
  const [imageSize,setImageSize]=useState({source:'',width:1000,height:580});
  const [sceneSize,setSceneSize]=useState({width:1000,height:580});
  const movementTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const {planet,region}=resolveWorldLocation(preference.planetId,preference.regionId);
  const layout=useMemo(()=>getSceneLayout(planet,region),[planet,region]);
  const inTower=planet.id==='space-station'&&region.id==='brave-tower';
  const towerProgress=s.braveTower??normalizeBraveTowerProgress(undefined,s.bosses.filter(boss=>boss.cleared).map(boss=>boss.id));
  const towerFloor=towerProgress.resumeFloor??BRAVE_TOWER_FLOORS;
  const towerComplete=inTower&&towerProgress.resumeFloor===null;
  const towerBoss=inTower?s.bosses.find(boss=>boss.id===braveTowerBossId(towerFloor)):undefined;
  const towerOpponents=towerBoss?.opponents?.length?towerBoss.opponents:towerBoss?[{species:towerBoss.species,name:s.species.find(species=>species.id===towerBoss.species)?.name??towerBoss.name,level:towerBoss.level,evidence:towerBoss.evidence}]:[];
  const sceneName=inTower?`勇者之塔 · 第 ${towerFloor} 层`:region.name;
  const sceneKey=`${planet.id}/${region.id}${inTower?`/${towerFloor}/${towerComplete?'complete':'ready'}`:''}`;
  const background=region.background??planet.background;
  const official=region.backgroundKind==='official'||region.backgroundKind==='remastered'||background.includes('/maps/original/');
  const aspect=imageSize.source===background?imageSize.width/imageSize.height:1000/580;
  const playerPosition=constrainScenePoint(layout,{x:preference.x,y:preference.y});
  const exits=getSceneExits(planet,region);
  // Every image point accepts a click. At the image edge, keep the complete
  // robot visible without moving the requested point onto a terrain mask.
  const playerWidth=clamp(sceneSize.width*.06,40,72),playerHeight=clamp(sceneSize.width*.075,50,90)+17;
  const visiblePlayerPosition={
    x:clamp(playerPosition.x,(playerWidth/2+3)/sceneSize.width*100,100-(playerWidth/2+3)/sceneSize.width*100),
    y:clamp(playerPosition.y,(playerHeight*.95+3)/sceneSize.height*100,100-(playerHeight*.05+3)/sceneSize.height*100),
  };
  const habitatSpecies=region.creatures.map(id=>s.species.find(sp=>sp.id===id)).filter(sp=>!!sp);
  const localCreatures=buildWorldPopulation(`${planet.id}/${region.id}`,habitatSpecies,6,region.levels,region.creatureLevels,region.scarceCreatures);
  const localBosses=inTower?(towerBoss?[towerBoss]:[]):findSceneChallenges(planet.id,region.id,s.bosses,travelTo?.bossId);
  const campaignContact=s.campaigns.find(campaign=>campaign.id===region.campaignId);
  const campaignContactName=s.species.find(species=>species.id===campaignContact?.species)?.name??'挑战精灵';
  const nextCampaignStage=campaignContact?.stages.find(stage=>stage.id===campaignContact.nextStageId);
  const campaignProgress=campaignContact?.finished?'全部挑战已完成':nextCampaignStage?`当前挑战：${nextCampaignStage.name}`:'查看挑战进度';
  const selectedCampaign=selection?.kind==='campaign'&&selection.id===campaignContact?.id?campaignContact:undefined;
  const creature=selection?.kind==='creature'?s.species.find(sp=>sp.id===selection.id):undefined;
  const creatureRecruitment=creature&&region.recruitmentSpecies?.includes(creature.id)?s.quests.find(quest=>quest.group==='spt-recruitment'&&quest.rewardSpecies===creature.id):undefined;
  const creatureLevel=selection?.kind==='creature'?(selection.level??region.levels[0]):region.levels[0];
  const boss=selection?.kind==='boss'?(inTower?localBosses:s.bosses).find(b=>b.id===selection.id):undefined;
  const bossName=inTower&&boss?towerOpponents[0]?.name??boss.name:boss?.name;
  const activeFacility=region.facility;
  const facilityName=region.facility==='missions'?'罗杰船长':region.facility==='recovery'?'派特博士':region.facility==='battle'?'对战管理员':'传送管理员';
  const laboratory=planet.id==='station'&&region.id==='lab';
  const stationTerminal=planet.id==='space-station'?stationTerminals[region.id]:undefined;
  // The original map contains the equipment: bind interaction to its actual footprint.
  const laboratoryFacilities=[
    {page:'fusion',name:'精灵融合舱',x:8.5,y:33.5,width:14,height:34,approach:{x:17,y:58}},
    {page:'breeding',name:'精灵繁殖舱',x:28.2,y:34.6,width:14,height:33,approach:{x:31,y:58}},
    {page:'shop',name:'道具商城',x:48,y:28,width:22,height:23,approach:{x:48,y:58}},
  ];
  useEffect(()=>writeWorldPreference(preference),[preference]);
  useEffect(()=>onSceneChange?.({src:background,name:sceneName}),[background,sceneName,onSceneChange]);
  useEffect(()=>{
    const element=viewport.current;if(!element)return;
    const fit=()=>{
      const width=Math.min(element.clientWidth,element.clientHeight*aspect);
      setSceneSize({width,height:width/aspect});
    };
    fit();const observer=new ResizeObserver(fit);observer.observe(element);
    return()=>observer.disconnect();
  },[aspect]);
  useEffect(()=>()=>{if(movementTimer.current)clearTimeout(movementTimer.current)},[]);
  useEffect(()=>{if(!arrival)return;const timer=setTimeout(()=>setArrival(false),380);return()=>clearTimeout(timer)},[arrival]);

  function cancelWalk(){if(movementTimer.current)clearTimeout(movementTimer.current);movementTimer.current=null;setMoving(false);setApproachingInstance(null)}
  useEffect(()=>{
    if(s.battle){cancelWalk();setSelection(null);setShowDetails(false)}
  },[!!s.battle]);
  useEffect(()=>{
    if(!inTower)return;
    cancelWalk();setDuration(0);setSelection(null);setShowDetails(false);setArrival(true);
  },[inTower,towerFloor,towerComplete]);
  function visit(p:WorldPlanet,r:WorldRegion,entry?:WorldPoint) {
    cancelWalk();setDuration(0);setPlayerDirection('front');setSelection(null);setShowDetails(false);setArrival(true);
    const destinationLayout=getSceneLayout(p,r),landing=constrainScenePoint(destinationLayout,entry??destinationLayout.entry);
    setPreference(old=>({...old,planetId:p.id,regionId:r.id,...landing,visited:[...new Set([...old.visited,`${p.id}/${r.id}`])]}));
  }
  useEffect(()=>{
    if(!travelTo)return;
    const targetBoss=travelTo.bossId?s.bosses.find(b=>b.id===travelTo.bossId):undefined;
    const landing=targetBoss?findChallengeLocation(targetBoss):travelTo;
    const target=resolveWorldLocation(landing.planetId,landing.regionId??'');visit(target.planet,target.region);
    if(targetBoss&&!(target.planet.id==='space-station'&&target.region.id==='brave-tower'))
      setSelection(target.region.campaignId?{kind:'campaign',id:target.region.campaignId}:{kind:'boss',id:targetBoss.id});
  },[travelTo?.planetId,travelTo?.regionId,travelTo?.bossId,travelTo?.requestId]);
  useEffect(()=>{
    if(!focusSpecies)return;
    const habitat=findSpeciesLocation(focusSpecies);
    const contactCampaign=s.campaigns.find(campaign=>campaign.species===focusSpecies);
    const contactPlanet=contactCampaign?WORLD_PLANETS.find(p=>p.regions.some(r=>r.campaignId===contactCampaign.id)):undefined;
    const contactRegion=contactPlanet?.regions.find(r=>r.campaignId===contactCampaign!.id);
    const linkedBoss=s.bosses.find(b=>b.species===focusSpecies);
    const bossPlanet=linkedBoss?WORLD_PLANETS.find(p=>p.regions.some(r=>r.bossIds?.includes(linkedBoss.id))):undefined;
    const bossRegion=bossPlanet?.regions.find(r=>r.bossIds?.includes(linkedBoss!.id));
    const target=habitat??(contactPlanet&&contactRegion?{planet:contactPlanet,region:contactRegion}:undefined)??(bossPlanet&&bossRegion?{planet:bossPlanet,region:bossRegion}:undefined);
    if(!target)return;
    visit(target.planet,target.region);
    setSelection(target.region.campaignId?{kind:'campaign',id:target.region.campaignId}:!habitat&&bossPlanet&&bossRegion?{kind:'boss',id:linkedBoss!.id}:{kind:'creature',id:focusSpecies,instanceId:`${target.planet.id}/${target.region.id}:${focusSpecies}:0`});
  },[focusSpecies]);
  function walk(x:number,y:number,after?:()=>void) {
    cancelWalk();setSelection(null);setShowDetails(false);
    const target=constrainScenePoint(layout,{x,y}),targetX=target.x,targetY=target.y;
    const element=player.current,scene=element?.closest('.world-scene')?.getBoundingClientRect();
    const current=element?.getBoundingClientRect();
    const actual=current&&scene&&scene.width&&scene.height?{x:(current.left+current.width/2-scene.left)/scene.width*100,
      y:(current.top+current.height*.95-scene.top)/scene.height*100}:{x:preference.x,y:preference.y};
    const dx=(targetX-actual.x)*(scene?.width??100)/100,dy=(targetY-actual.y)*(scene?.height??100)/100;
    if(Math.hypot(dx,dy)>.5)setPlayerDirection(robotDirection(dx,dy));
    const elapsed=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:
      Math.max(320,Math.hypot(dx,dy)/Math.max(90,(scene?.width??1000)*.22)*1000);
    setDuration(elapsed);setMoving(elapsed>0);setPreference(old=>({...old,x:targetX,y:targetY}));
    if(elapsed===0){after?.();return false;}
    movementTimer.current=setTimeout(()=>{setMoving(false);movementTimer.current=null;after?.()},elapsed);
    return true;
  }
  function walkClick(event:MouseEvent<HTMLDivElement>){const rect=event.currentTarget.getBoundingClientRect();walk((event.clientX-rect.left)/rect.width*100,(event.clientY-rect.top)/rect.height*100)}
  function walkKey(event:KeyboardEvent<HTMLDivElement>){
    if(event.key==='Escape'){cancelWalk();setSelection(null);return;}
    if(event.target!==event.currentTarget)return;
    const deltas:Record<string,[number,number]>={ArrowLeft:[-4,0],ArrowRight:[4,0],ArrowUp:[0,-4],ArrowDown:[0,4]};
    const d=deltas[event.key];if(d){event.preventDefault();walk(playerPosition.x+d[0],playerPosition.y+d[1])}
  }
  useEffect(()=>{
    const key=(event:globalThis.KeyboardEvent)=>{
      if(event.defaultPrevented||s.battle||document.querySelector('.scene-window,.modal-backdrop')||/^(INPUT|TEXTAREA|SELECT)$/.test((event.target as HTMLElement)?.tagName))return;
      const deltas:Record<string,[number,number]>={ArrowLeft:[-4,0],ArrowRight:[4,0],ArrowUp:[0,-4],ArrowDown:[0,4]};
      const delta=deltas[event.key];if(delta){event.preventDefault();walk(playerPosition.x+delta[0],playerPosition.y+delta[1])}
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[preference.x,preference.y,s.battle,layout]);
  function approach(event:MouseEvent<HTMLButtonElement>,target:Selection,x:number,y:number){
    event.stopPropagation();
    const robot=player.current?.getBoundingClientRect();
    const scene=event.currentTarget.closest('.world-scene')!.getBoundingClientRect();
    const actual=robot?{x:(robot.left+robot.width/2-scene.left)/scene.width*100,
      y:(robot.top+robot.height*.95-scene.top)/scene.height*100}:visiblePlayerPosition;
    const contact=event.currentTarget.getBoundingClientRect();
    const clearance=Math.max(scene.width*.025,Math.min(scene.width*.08,(contact.width+(robot?.width??scene.width*.06))*.35));
    const stop=contactApproachPoint(actual,{x,y},scene,clearance);
    const interact=()=>{setApproachingInstance(null);setSelection(target)};
    if(Math.hypot((stop.x-actual.x)*scene.width/100,(stop.y-actual.y)*scene.height/100)<1){
      // A nearby click opens immediately, and also stops an interrupted walk.
      cancelWalk();setDuration(0);setShowDetails(false);
      setPreference(old=>({...old,x:actual.x,y:actual.y}));interact();return;
    }
    const walking=walk(stop.x,stop.y,interact);
    if(walking&&target.kind==='creature')setApproachingInstance(target.instanceId??null);
  }
  function gate(event:MouseEvent<HTMLButtonElement>,exit:SceneExit){event.stopPropagation();const next=planet.regions.find(candidate=>candidate.id===exit.targetRegionId)!;walk(exit.anchor.x,exit.anchor.y,()=>visit(planet,next,exit.entry))}
  function details(){if(creature&&onInteract)onInteract({kind:'species',species:creature.id});else if(boss&&onInteract)onInteract({kind:'species',species:boss.species});else setShowDetails(v=>!v)}
  function chooseTowerStart(){cancelWalk();setSelection(null);onNavigate?.('tower:choose')}
  function challenge(){if(selectedCampaign){setSelection(null);onNavigate?.(`campaign:${selectedCampaign.id}`);}else if(creatureRecruitment)onInteract?.({kind:'quest',questId:creatureRecruitment.id});else if(creature)c.dispatch({type:'startTraining',species:creature.id,level:creatureLevel,planetId:planet.id,regionId:region.id});else if(boss){if(inTower){if(!towerComplete&&boss.id===towerBoss?.id)c.dispatch({type:'startTower',floor:towerFloor});}else c.dispatch({type:'startBattle',bossId:boss.id});}}
  const sceneStyle={'--world-color':planet.color,'--walk-duration':`${duration}ms`} as CSSProperties;
  const at=(point:WorldPoint):CSSProperties=>({left:`${point.x}%`,top:`${point.y}%`});
  return <section ref={viewport} className={`world-exploration ${arrival?'world-arrival':''}`} style={sceneStyle} aria-label="星球探索">
    <div key={sceneKey} className={`world-scene theme-${planet.theme} ${official?'world-original-scene':'world-authored-scene'}${planet.id==='space-station'?' world-station-scene':''}${inTower?' world-tower-scene':''}`} style={{width:sceneSize.width,height:sceneSize.height}} data-background-kind={region.backgroundKind??(official?'official':'authored')} data-map-id={region.originalMapId??planet.originalMapId} data-tower-floor={inTower?towerFloor:undefined} data-tower-complete={inTower?towerComplete:undefined} tabIndex={0} aria-label={`${sceneName}。点击地面或方向键移动，点击精灵、设施或出口走过去互动。`} onClick={walkClick} onKeyDown={walkKey}>
      <img className="world-background" src={background} alt="" draggable={false} onLoad={event=>{const image=event.currentTarget;setImageSize({source:background,width:image.naturalWidth,height:image.naturalHeight})}}/>
      {!official&&<div className="world-authored-light" aria-hidden="true"/>}
      <div className="world-location-hud" title={inTower?`最高通过 ${towerProgress.highestCleared} / ${BRAVE_TOWER_FLOORS} 层`:`${planet.subtitle} · ${region.facility?'飞船设施':`Lv.${region.levels[0]}–${region.levels[1]}`}`}><strong>{sceneName}</strong></div>
      {inTower&&<button className="world-tower-choose" data-tower-action="choose" onClick={event=>{event.stopPropagation();chooseTowerStart()}}>选择起点</button>}
      {towerComplete&&<div className="world-tower-complete" role="status">已通过全部 70 层 · 选择起点再次挑战</div>}
      {exits.map(exit=><button key={exit.id} className={`world-gate world-gate-${exit.facing}${exit.anchor.y>78?' world-gate-caption-above':''}`} style={at(exit.anchor)} aria-label={exit.ariaLabel} onClick={event=>gate(event,exit)}><span className="world-gate-arrow" aria-hidden="true">{{left:'←',right:'→',up:'↑',down:'↓'}[exit.facing]}</span><span className="world-gate-caption"><small>前往</small><strong>{exit.caption}</strong></span></button>)}
      {localCreatures.map(({species,instanceId,level},index)=><RoamingCreature key={instanceId} species={species} instanceId={instanceId} level={level} index={index} count={localCreatures.length} layout={layout}
        frozen={approachingInstance===instanceId||(selection?.kind==='creature'&&selection.instanceId===instanceId)} battle={!!s.battle}
        onApproach={(event,x,y)=>approach(event,{kind:'creature',id:species.id,instanceId,level},x,y)}/>)}
      {localBosses.map((b,index)=>{
        const actor=inTower?undefined:getSceneBossActor(layout,b.id),home=inTower?{x:50,y:58}:getSceneBossHome(layout,b.id,index,localBosses.length);
        const name=inTower?towerOpponents[0]?.name??b.name:b.name;
        return <button key={b.id} className={`world-creature world-boss${actor?' world-native-actor':''}`} data-boss={b.id} data-species={b.species}
          style={{...at(home),...(actor?{width:`${actor.width}%`,height:`${actor.height}%`}:{})}}
          aria-label={`与${name}互动`} onClick={event=>approach(event,{kind:'boss',id:b.id},home.x,home.y)}>
          {actor?<img className="world-native-actor-art" src={actor.src} alt="" draggable={false}/>:<><span className="world-creature-shadow"/><div className="world-sprite-art"><CreatureArt species={b.species} name={name}/></div></>}
          <span className="world-character-name"><b>{inTower?(towerComplete?'已通关':`第 ${towerFloor} 层`):b.category==='SPT首领'?'SPT':'挑战'}</b> {name}<small>{encounterLevelText(b.level,b.evidence?.hasInferredLevel,b.evidence?.displayLevelUnknown)}{inTower&&towerOpponents.length>1?` · 队伍 ${towerOpponents.length} 只`:''}</small></span>
        </button>;
      })}
      {campaignContact&&(()=>{
        const actor=getSceneBossActor(layout,`campaign:${campaignContact.id}`),home=actor?.anchor??layout.boss;
        return <button className={`world-creature world-boss world-campaign-contact${actor?' world-native-actor':''}`} data-campaign={campaignContact.id}
          style={{...at(home),...(actor?{width:`${actor.width}%`,height:`${actor.height}%`}:{})}}
          aria-label={`与${campaignContactName}互动，查看挑战进度`} onClick={event=>approach(event,{kind:'campaign',id:campaignContact.id},home.x,home.y)}>
          {actor?<img className="world-native-actor-art" src={actor.src} alt="" draggable={false}/>:<><span className="world-creature-shadow"/><div className="world-sprite-art"><CreatureArt species={campaignContact.species} name={campaignContactName}/></div></>}
          <span className="world-character-name">{campaignContactName}<small>{campaignProgress}</small></span>
        </button>;
      })()}
      {region.facility&&<button className="world-npc" style={at(layout.npc)} aria-label={`与${facilityName}互动`} onClick={event=>approach(event,{kind:'facility'},layout.npc.x,layout.npc.y)}><Facility kind={region.facility}/>{!laboratory&&<span className="npc-interaction-mark">{region.facility==='missions'?'!':'✦'}</span>}<span className="world-character-name">{facilityName}</span></button>}
      {laboratory&&laboratoryFacilities.map(facility=><button key={facility.page}
        className={`world-lab-facility world-lab-${facility.page}`}
        style={{...at(facility),width:`${facility.width}%`,height:`${facility.height}%`}}
        aria-label={`使用${facility.name}`}
        onClick={event=>{event.stopPropagation();setSelection(null);walk(facility.approach.x,facility.approach.y,()=>onNavigate?.(facility.page))}}>
        <span className="world-lab-equipment-outline" aria-hidden="true"/>
        <span className="world-character-name">{facility.name}</span>
      </button>)}
      {stationTerminal&&<button className={`world-station-terminal${stationTerminal.captionAbove?' world-station-terminal-caption-above':''}`}
        style={{...at(stationTerminal),width:`${stationTerminal.width}%`,height:`${stationTerminal.height}%`}}
        aria-label={`使用${stationTerminal.name}`} data-station-action={stationTerminal.page}
        onClick={event=>{event.stopPropagation();setSelection(null);walk(stationTerminal.approach.x,stationTerminal.approach.y,()=>onNavigate?.(stationTerminal.page))}}>
        <span className="world-station-terminal-outline" aria-hidden="true"/>
        <span className="world-station-terminal-caption"><strong>{stationTerminal.name}</strong><small>{stationTerminal.hint}</small></span>
      </button>}
      <div ref={player} className="world-player" style={at(visiblePlayerPosition)}><ClassicRobot direction={playerDirection} walking={moving} role="player"/><span>赛尔</span></div>
      {moving&&<div className="world-walk-marker" style={at(playerPosition)} aria-hidden="true"/>}
      <div className="world-ground-hint" aria-live="polite">{moving?'正在前往…':inTower?(towerComplete?'本轮挑战已完成 · 可选择起点重新登塔':'点击中央对手挑战本层 · 胜利后前往下一层'):'点击地图任意位置移动 · 点击精灵互动'}</div>
    </div>
    {selection&&(!inTower||boss)&&<section className="world-dialogue" role="dialog" aria-label={selectedCampaign?`与${campaignContactName}交谈`:creature?`与${creature.name}交谈`:boss?`与${bossName}交谈`:'设施互动'}>
      <button className="world-dialogue-close" aria-label="离开对话" onClick={()=>setSelection(null)}>×</button>
      <div className="world-dialogue-body">{selectedCampaign?<div className="world-dialogue-portrait"><CreatureArt species={selectedCampaign.species} name={campaignContactName}/></div>:(creature||boss)?<div className="world-dialogue-portrait"><CreatureArt species={creature?.id??boss!.species} name={creature?.name??bossName!}/></div>:<div className="world-dialogue-portrait"><Facility kind={activeFacility!}/></div>}
        <div className="world-dialogue-copy"><small>{selectedCampaign?'封印挑战':creatureRecruitment?'收集招募':creature?(creature.wildCapture===false?'野外挑战':'野生精灵'):boss?(inTower?sceneName:`${boss.category}${region.challengeStaging?' · 挑战接驳':''}`):'飞船联络'}</small><h3>{selectedCampaign?campaignContactName:creature?.name??bossName??facilityName}</h3>
          <p>{selectedCampaign?`${region.description} ${campaignProgress}。已完成 ${selectedCampaign.completed} / ${selectedCampaign.stages.length} 关。`:creature?`Lv.${creatureLevel} · ${creature.types.join(' / ')}系 · ${creature.owned?'已经结识的伙伴':'还未加入收集档案'}。${creatureRecruitment?'完成精灵招募的收集与首领条件后领取精元。':creature.wildCapture===false?'战胜后领取精元，在道具背包孵化。':creature.id===416?'捕捉时需派出尼尔、菲斯利、艾斯菲亚或其闪光形态。':'在战斗道具中使用精灵胶囊捕捉。'}`:boss?(inTower?(towerComplete?'本轮已通过全部 70 层。选择起点后可重新登塔。':`本层共有 ${towerOpponents.length} 只精灵。${towerFloor<BRAVE_TOWER_FLOORS?`全部战胜后进入第 ${towerFloor+1} 层。`:'全部战胜后完成本轮登塔。'}退出或失败后保留当前层。`):`${encounterLevelText(boss.level,boss.evidence?.hasInferredLevel,boss.evidence?.displayLevelUnknown)} · ${boss.cleared?'已经挑战成功，随时可以再次切磋。':'准备好你的战队，点击下方挑战开始战斗。'}${region.challengeStaging?' 接驳平台已就绪，确认后进入战场。':''}`):activeFacility==='missions'?'欢迎回来，赛尔！看看航行日志，继续我们的探索吧。':activeFacility==='recovery'?'把精灵交给恢复舱，体力与技能 PP 会完全恢复。':activeFacility==='battle'?region.description:'选择下一站，或者从挑战档案寻找新的对手。'}</p>
          {inTower&&boss&&<ul className="world-tower-opponents" aria-label={`第 ${towerFloor} 层对手队伍`}>{towerOpponents.map((opponent,index)=><li key={`${index}-${opponent.species}`}><span>{index+1}. {opponent.name}</span><small>{encounterLevelText(opponent.level,opponent.evidence?.hasInferredLevel,opponent.evidence?.displayLevelUnknown)}</small></li>)}</ul>}
          <BossEvidence evidence={boss?.evidence}/>
          {inTower&&boss?.rewardText&&<p className="world-dialogue-detail">通关奖励：{boss.rewardText}</p>}
          {showDetails&&<p className="world-dialogue-detail">{selectedCampaign?.description??boss?.description??(creature?`精灵编号 #${creature.id}，等级 Lv.${creatureLevel}。${creature.wildCapture===false?'击败后通过精元孵化获得，不能使用胶囊。':'先削弱野生精灵的体力，再从战斗道具使用精灵胶囊。'}`:region.description)}</p>}
        </div>
      </div>
      <div className="world-dialogue-actions">{(creature||boss||selectedCampaign)?<><button className="primary" disabled={towerComplete} onClick={challenge}>{selectedCampaign?'查看封印进度':creatureRecruitment?'查看招募任务':towerComplete?'本轮已通关':inTower?`挑战第 ${towerFloor} 层`:'挑战'}</button>{towerComplete&&<button onClick={chooseTowerStart}>选择起点</button>}<button onClick={details}>详情</button></>:<>
        {activeFacility==='recovery'&&<button className="primary" onClick={()=>c.dispatch({type:'heal'})}>恢复全队</button>}
        {laboratory&&<button onClick={()=>{setSelection(null);onNavigate?.('fusion')}}>精灵融合</button>}
        {laboratory&&<button onClick={()=>{setSelection(null);onNavigate?.('breeding')}}>精灵繁殖</button>}
        {laboratory&&<button onClick={()=>{setSelection(null);onNavigate?.('shop')}}>道具商城</button>}
        {activeFacility==='missions'&&<button className="primary" onClick={()=>onNavigate?.('quests')}>航行任务</button>}
        {activeFacility==='challenges'&&<button className="primary" onClick={()=>onNavigate?.('challenge')}>挑战档案</button>}
        {activeFacility==='battle'&&region.battleFacility&&<button className="primary" onClick={()=>{setSelection(null);onNavigate?.(`facilities:${region.battleFacility}`)}}>选择对战</button>}
      </>}<button className="subtle" onClick={()=>setSelection(null)}>离开</button></div>
    </section>}
  </section>;
}
export default WorldMap;
