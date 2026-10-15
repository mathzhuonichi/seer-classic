import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import type { GameController, GameSnapshot, SpeciesView } from '../game-types';
import { WORLD_PLANETS, findChallengeLocation, findSceneChallenges, findSpeciesLocation, readWorldPreference, resolveWorldLocation, writeWorldPreference, type WorldPlanet, type WorldRegion } from '../world';
import { CreatureArt } from './CreatureArt';
import { buildWorldPopulation } from '../presentation/world-population';
import { constrainScenePoint, creatureSceneHome, getSceneLayout, type SceneLayout } from '../presentation/map-presentation';
import {getSceneExits,type SceneExit} from '../presentation/scene-exits';
import ClassicRobot from './ClassicRobot';
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
        // The full host includes the portrait, its bob margin and the name badge.
        // Uniform host fitting is only needed when the viewport is unusually small.
        const padding=Math.min(12,Math.max(1,Math.min(scene.width,scene.height)*.04));
        const fit=Math.min(1,(scene.width-padding*2)/element.offsetWidth,(scene.height-padding*2)/element.offsetHeight);
        element.style.setProperty('--roam-size',String(Math.max(.01,fit)));
        const width=element.offsetWidth*Math.max(.01,fit),height=element.offsetHeight*Math.max(.01,fit);
        const bounds={left:(width/2+padding)/scene.width*100,right:100-(width/2+padding)/scene.width*100,
          top:(height+padding)/scene.height*100,bottom:100-padding/scene.height*100};
        const constrain=(point:WorldPoint):WorldPoint=>constrainScenePoint(layout,{
          x:clamp(point.x,bounds.left,bounds.right),y:clamp(point.y,bounds.top,bounds.bottom)});
        const center=constrain(home);
        if(!state.current)state.current={position:constrain({x:home.x+between(-7,7),y:home.y+between(-5,5)}),rest:between(150,1400),leg:null,facing:'right'};
        const roam=state.current;
        roam.position=constrain(roam.position);
        if(!paused){
          if(!roam.leg){
            roam.rest-=delta;
            if(roam.rest<=0){
              // Mix short meanders, long excursions and occasional returns.
              // Each new leg starts from the current position, without a loop
              // around a fixed home or a shared timing pattern.
              const choice=Math.random();
              const target=choice<.45
                ? constrain({x:roam.position.x+between(-layout.roam.x,layout.roam.x),y:roam.position.y+between(-layout.roam.y,layout.roam.y)})
                : choice<.9
                  ? constrain({x:between(bounds.left,bounds.right),y:between(bounds.top,bounds.bottom)})
                  : constrain({x:center.x+between(-12,12),y:center.y+between(-10,10)});
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
  const background=region.background??planet.background;
  const official=region.backgroundKind==='official'||background.includes('/maps/original/');
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
  const localBosses=findSceneChallenges(planet.id,region.id,s.bosses,travelTo?.bossId);
  const campaignContact=s.campaigns.find(campaign=>campaign.id===region.campaignId);
  const campaignContactName=s.species.find(species=>species.id===campaignContact?.species)?.name??'挑战精灵';
  const nextCampaignStage=campaignContact?.stages.find(stage=>stage.id===campaignContact.nextStageId);
  const campaignProgress=campaignContact?.finished?'全部挑战已完成':nextCampaignStage?`当前挑战：${nextCampaignStage.name}`:'查看挑战进度';
  const selectedCampaign=selection?.kind==='campaign'&&selection.id===campaignContact?.id?campaignContact:undefined;
  const creature=selection?.kind==='creature'?s.species.find(sp=>sp.id===selection.id):undefined;
  const creatureRecruitment=creature&&region.recruitmentSpecies?.includes(creature.id)?s.quests.find(quest=>quest.group==='spt-recruitment'&&quest.rewardSpecies===creature.id):undefined;
  const creatureLevel=selection?.kind==='creature'?(selection.level??region.levels[0]):region.levels[0];
  const boss=selection?.kind==='boss'?s.bosses.find(b=>b.id===selection.id):undefined;
  const activeFacility=region.facility;
  const facilityName=region.facility==='missions'?'罗杰船长':region.facility==='recovery'?'派特博士':region.facility==='battle'?'对战管理员':'传送管理员';
  const laboratory=planet.id==='station'&&region.id==='lab';
  // The original map contains the equipment: bind interaction to its actual footprint.
  const laboratoryFacilities=[
    {page:'fusion',name:'精灵融合舱',x:8.5,y:33.5,width:14,height:34,approach:{x:17,y:58}},
    {page:'breeding',name:'精灵繁殖舱',x:28.2,y:34.6,width:14,height:33,approach:{x:31,y:58}},
    {page:'shop',name:'道具商城',x:48,y:28,width:22,height:23,approach:{x:48,y:58}},
  ];
  useEffect(()=>writeWorldPreference(preference),[preference]);
  useEffect(()=>onSceneChange?.({src:background,name:region.name}),[background,region.name,onSceneChange]);
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
    if(targetBoss)setSelection(target.region.campaignId?{kind:'campaign',id:target.region.campaignId}:{kind:'boss',id:targetBoss.id});
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
    const elapsed=Math.max(320,Math.hypot(dx,dy)/Math.max(90,(scene?.width??1000)*.22)*1000);
    setDuration(elapsed);setMoving(true);setPreference(old=>({...old,x:targetX,y:targetY}));
    movementTimer.current=setTimeout(()=>{setMoving(false);movementTimer.current=null;after?.()},elapsed);
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
    event.stopPropagation();walk(x-7,y+3,()=>{setApproachingInstance(null);setSelection(target)});
    if(target.kind==='creature')setApproachingInstance(target.instanceId??null);
  }
  function gate(event:MouseEvent<HTMLButtonElement>,exit:SceneExit){event.stopPropagation();const next=planet.regions.find(candidate=>candidate.id===exit.targetRegionId)!;walk(exit.anchor.x,exit.anchor.y,()=>visit(planet,next,exit.entry))}
  function details(){if(creature&&onInteract)onInteract({kind:'species',species:creature.id});else if(boss&&onInteract)onInteract({kind:'species',species:boss.species});else setShowDetails(v=>!v)}
  function challenge(){if(selectedCampaign){setSelection(null);onNavigate?.(`campaign:${selectedCampaign.id}`);}else if(creatureRecruitment)onInteract?.({kind:'quest',questId:creatureRecruitment.id});else if(creature)c.dispatch({type:'startTraining',species:creature.id,level:creatureLevel,planetId:planet.id,regionId:region.id});else if(boss)c.dispatch({type:'startBattle',bossId:boss.id});}
  const sceneStyle={'--world-color':planet.color,'--walk-duration':`${duration}ms`} as CSSProperties;
  const at=(point:WorldPoint):CSSProperties=>({left:`${point.x}%`,top:`${point.y}%`});
  return <section ref={viewport} className={`world-exploration ${arrival?'world-arrival':''}`} style={sceneStyle} aria-label="星球探索">
    <div key={`${planet.id}/${region.id}`} className={`world-scene theme-${planet.theme} ${official?'world-original-scene':'world-authored-scene'}`} style={{width:sceneSize.width,height:sceneSize.height}} data-background-kind={official?'official':'authored'} data-map-id={region.originalMapId??planet.originalMapId} tabIndex={0} aria-label={`${region.name}。点击地面或方向键移动，点击精灵、设施或出口走过去互动。`} onClick={walkClick} onKeyDown={walkKey}>
      <img className="world-background" src={background} alt="" draggable={false} onLoad={event=>{const image=event.currentTarget;setImageSize({source:background,width:image.naturalWidth,height:image.naturalHeight})}}/>
      {!official&&<div className="world-authored-light" aria-hidden="true"/>}
      <div className="world-location-hud" title={`${planet.subtitle} · ${region.facility?'飞船设施':`Lv.${region.levels[0]}–${region.levels[1]}`}`}><strong>{region.name}</strong></div>
      {exits.map(exit=><button key={exit.id} className={`world-gate world-gate-${exit.facing}${exit.anchor.y>78?' world-gate-caption-above':''}`} style={at(exit.anchor)} aria-label={exit.ariaLabel} onClick={event=>gate(event,exit)}><span className="world-gate-arrow" aria-hidden="true">{{left:'←',right:'→',up:'↑',down:'↓'}[exit.facing]}</span><span className="world-gate-caption"><small>前往</small><strong>{exit.caption}</strong></span></button>)}
      {localCreatures.map(({species,instanceId,level},index)=><RoamingCreature key={instanceId} species={species} instanceId={instanceId} level={level} index={index} count={localCreatures.length} layout={layout}
        frozen={approachingInstance===instanceId||(selection?.kind==='creature'&&selection.instanceId===instanceId)} battle={!!s.battle}
        onApproach={(event,x,y)=>approach(event,{kind:'creature',id:species.id,instanceId,level},x,y)}/>)}
      {localBosses.map((b,index)=>{const home=constrainScenePoint(layout,{x:layout.boss.x+(index-(localBosses.length-1)/2)*15,y:layout.boss.y});return <button key={b.id} className="world-creature world-boss" style={at(home)} aria-label={`与${b.name}互动`} onClick={event=>approach(event,{kind:'boss',id:b.id},home.x,home.y)}><span className="world-creature-shadow"/><div className="world-sprite-art"><CreatureArt species={b.species} name={b.name}/></div><span className="world-character-name"><b>{b.category==='SPT首领'?'SPT':'挑战'}</b> {b.name}<small>Lv.{b.level}</small></span></button>})}
      {campaignContact&&<button className="world-creature world-boss world-campaign-contact" data-campaign={campaignContact.id} style={at(layout.boss)} aria-label={`与${campaignContactName}互动，查看挑战进度`} onClick={event=>approach(event,{kind:'campaign',id:campaignContact.id},layout.boss.x,layout.boss.y)}><span className="world-creature-shadow"/><div className="world-sprite-art"><CreatureArt species={campaignContact.species} name={campaignContactName}/></div><span className="world-character-name">{campaignContactName}<small>{campaignProgress}</small></span></button>}
      {region.facility&&<button className="world-npc" style={at(layout.npc)} aria-label={`与${facilityName}互动`} onClick={event=>approach(event,{kind:'facility'},layout.npc.x,layout.npc.y)}><Facility kind={region.facility}/>{!laboratory&&<span className="npc-interaction-mark">{region.facility==='missions'?'!':'✦'}</span>}<span className="world-character-name">{facilityName}</span></button>}
      {laboratory&&laboratoryFacilities.map(facility=><button key={facility.page}
        className={`world-lab-facility world-lab-${facility.page}`}
        style={{...at(facility),width:`${facility.width}%`,height:`${facility.height}%`}}
        aria-label={`使用${facility.name}`}
        onClick={event=>{event.stopPropagation();setSelection(null);walk(facility.approach.x,facility.approach.y,()=>onNavigate?.(facility.page))}}>
        <span className="world-lab-equipment-outline" aria-hidden="true"/>
        <span className="world-character-name">{facility.name}</span>
      </button>)}
      <div ref={player} className="world-player" style={at(visiblePlayerPosition)}><ClassicRobot direction={playerDirection} walking={moving} role="player"/><span>赛尔</span></div>
      {moving&&<div className="world-walk-marker" style={at(playerPosition)} aria-hidden="true"/>}
      <div className="world-ground-hint" aria-live="polite">{moving?'正在前往…':'点击地图任意位置移动 · 点击精灵互动'}</div>
    </div>
    {selection&&<section className="world-dialogue" role="dialog" aria-label={selectedCampaign?`与${campaignContactName}交谈`:creature?`与${creature.name}交谈`:boss?`与${boss.name}交谈`:'设施互动'}>
      <button className="world-dialogue-close" aria-label="离开对话" onClick={()=>setSelection(null)}>×</button>
      <div className="world-dialogue-body">{selectedCampaign?<div className="world-dialogue-portrait"><CreatureArt species={selectedCampaign.species} name={campaignContactName}/></div>:(creature||boss)?<div className="world-dialogue-portrait"><CreatureArt species={creature?.id??boss!.species} name={(creature??boss)!.name}/></div>:<div className="world-dialogue-portrait"><Facility kind={activeFacility!}/></div>}
        <div className="world-dialogue-copy"><small>{selectedCampaign?'封印挑战':creatureRecruitment?'收集招募':creature?(creature.wildCapture===false?'野外挑战':'野生精灵'):boss?`${boss.category}${region.challengeStaging?' · 挑战接驳':''}`:'飞船联络'}</small><h3>{selectedCampaign?campaignContactName:creature?.name??boss?.name??facilityName}</h3>
          <p>{selectedCampaign?`${region.description} ${campaignProgress}。已完成 ${selectedCampaign.completed} / ${selectedCampaign.stages.length} 关。`:creature?`Lv.${creatureLevel} · ${creature.types.join(' / ')}系 · ${creature.owned?'已经结识的伙伴':'还未加入收集档案'}。${creatureRecruitment?'完成精灵招募的收集与首领条件后领取精元。':creature.wildCapture===false?'战胜后领取精元，在道具背包孵化。':creature.id===416?'捕捉时需派出尼尔、菲斯利、艾斯菲亚或其闪光形态。':'在战斗道具中使用精灵胶囊捕捉。'}`:boss?`Lv.${boss.level} · ${boss.cleared?'已经挑战成功，随时可以再次切磋。':'准备好你的战队，点击下方挑战开始战斗。'}${region.challengeStaging?' 接驳平台已就绪，确认后进入战场。':''}`:activeFacility==='missions'?'欢迎回来，赛尔！看看航行日志，继续我们的探索吧。':activeFacility==='recovery'?'把精灵交给恢复舱，体力与技能 PP 会完全恢复。':activeFacility==='battle'?region.description:'选择下一站，或者从挑战档案寻找新的对手。'}</p>
          {showDetails&&<p className="world-dialogue-detail">{selectedCampaign?.description??boss?.description??(creature?`精灵编号 #${creature.id}，等级 Lv.${creatureLevel}。${creature.wildCapture===false?'击败后通过精元孵化获得，不能使用胶囊。':'先削弱野生精灵的体力，再从战斗道具使用精灵胶囊。'}`:region.description)}</p>}
        </div>
      </div>
      <div className="world-dialogue-actions">{(creature||boss||selectedCampaign)?<><button className="primary" onClick={challenge}>{selectedCampaign?'查看封印进度':creatureRecruitment?'查看招募任务':'挑战'}</button><button onClick={details}>详情</button></>:<>
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
