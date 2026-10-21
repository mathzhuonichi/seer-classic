import {useEffect,useRef,useState,type RefObject} from 'react';
import {getCreatureArt,creatureArtStyle} from '../../../shared/creature-art.ts';
import {battleCreatureExtent} from '../battle-creature-size.ts';
import {mountCreatureAnimation,RecoveryBudget,type CreatureAnimation} from './creature-animation-mount.ts';
import './BattleCreatureAnimation.css';

/**
 * The original clip over the portrait; the portrait shows until the clip is ready. A move keeps the creature inside `arena`;
 * `mirrored` says the creature is drawn facing left.
 */
export default function BattleCreatureAnimation({species,name,kind,eventKey,resting,arena,mirrored}:{
  species:number;name:string;kind:string;eventKey:number|string;resting:boolean;arena:RefObject<HTMLElement|null>;mirrored:boolean;
}){
  const host=useRef<HTMLDivElement>(null),animation=useRef<CreatureAnimation|null>(null),recoveries=useRef<RecoveryBudget|null>(null);
  const budget=recoveries.current??=new RecoveryBudget();
  const extent=battleCreatureExtent(species);
  budget.track(species);
  const [ready,setReady]=useState(false),[recovery,setRecovery]=useState(0);
  const motion=useRef({kind,resting});motion.current={kind,resting};
  useEffect(()=>{
    if(!host.current)return;
    const mounted=mountCreatureAnimation(host.current,{species,extent,motion:()=>motion.current,onReady:setReady,
      room:()=>arena.current?.getBoundingClientRect()??null,mirrored,allowRecovery:()=>budget.take(species),remount:()=>setRecovery(value=>value+1)});
    animation.current=mounted;
    return()=>{animation.current=null;mounted.dispose();};
  },[species,extent,recovery,arena,mirrored]);
  useEffect(()=>animation.current?.play(),[kind,eventKey,resting]);
  const art=getCreatureArt(species);
  return <div className={`original-battle-creature ${ready?'is-ready':''}`} data-original-animation={ready?'ready':'fallback'} aria-label={name}>
    <img src={art.src} alt={name} style={creatureArtStyle(species,undefined,{fill:extent,scaleByStage:false,verticalAlign:'center'})}/>
    <div ref={host} className="original-battle-canvas" aria-hidden="true"/>
  </div>;
}
