import {useEffect,useRef,useState} from 'react';
import {getCreatureArt,creatureArtStyle} from '../../presentation/creature-art.ts';
import {mountCreatureAnimation,RecoveryBudget,type CreatureAnimation} from './creature-animation-mount.ts';
import './BattleCreatureAnimation.css';

/** The original clip over the portrait; the portrait shows until the clip is ready. */
export default function BattleCreatureAnimation({species,name,kind,eventKey,resting}:{
  species:number;name:string;kind:string;eventKey:number|string;resting:boolean;
}){
  const host=useRef<HTMLDivElement>(null),animation=useRef<CreatureAnimation|null>(null),recoveries=useRef<RecoveryBudget|null>(null);
  const budget=recoveries.current??=new RecoveryBudget();
  budget.track(species);
  const [ready,setReady]=useState(false),[recovery,setRecovery]=useState(0);
  const motion=useRef({kind,resting});motion.current={kind,resting};
  useEffect(()=>{
    if(!host.current)return;
    const mounted=mountCreatureAnimation(host.current,{species,extent:getCreatureArt(species).physicalScale*.9,motion:()=>motion.current,onReady:setReady,
      allowRecovery:()=>budget.take(species),remount:()=>setRecovery(value=>value+1)});
    animation.current=mounted;
    return()=>{animation.current=null;mounted.dispose();};
  },[species,recovery]);
  useEffect(()=>animation.current?.play(),[kind,eventKey,resting]);
  const art=getCreatureArt(species);
  return <div className={`original-battle-creature ${ready?'is-ready':''}`} data-original-animation={ready?'ready':'fallback'} aria-label={name}>
    <img src={art.src} alt={name} style={creatureArtStyle(species,undefined,{scaleByStage:true,verticalAlign:'center'})}/>
    <div ref={host} className="original-battle-canvas" aria-hidden="true"/>
  </div>;
}
