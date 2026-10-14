import {useEffect,useRef,useState} from 'react';
import type {SwfPlayer} from '@seer-pet-anim/swf-renderer';
import {retainBattleAnimation,originalAction} from '../presentation/battle-animation';
import {battleRuntimeClock} from '../presentation/battle-runtime-clock';
import {getCreatureArt,creatureArtStyle} from '../presentation/creature-art';
import {fixedAnimationTransform,visibleStandbyBounds} from '../presentation/battle-animation-registration';
import './BattleCreatureAnimation.css';
type Driver=ReturnType<typeof battleRuntimeClock.attach>;
export default function BattleCreatureAnimation({species,name,kind,eventKey,resting}:{species:number;name:string;kind:string;eventKey:number|string;resting:boolean}){
  const host=useRef<HTMLDivElement>(null),player=useRef<SwfPlayer|null>(null),driver=useRef<Driver|null>(null);
  const contextUnavailable=useRef(false),recoveryBudget=useRef({species,attempts:0});
  if(recoveryBudget.current.species!==species)recoveryBudget.current={species,attempts:0};
  const [ready,setReady]=useState(false),[recovery,setRecovery]=useState(0);
  const current=useRef({kind,eventKey,resting});current.current={kind,eventKey,resting};
  const play=()=>{const p=player.current,d=driver.current;if(!p||!d||contextUnavailable.current)return;const action=originalAction(current.current.kind),selected=p.getSequences().some(s=>s.name===action)?action:'standby';
    const active=!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&(selected!=='standby'||current.current.resting);
    p.playSequence(selected,{loop:selected==='standby'});if(!active)p.pause();d.running(active);d.draw();};
  useEffect(()=>{
    let cancelled=false,recovering=false,retried=false,observer:ResizeObserver|undefined,owned:SwfPlayer|null=null,ownedDriver:Driver|null=null;
    let canvas:HTMLCanvasElement|undefined,recoveryTimer:ReturnType<typeof setTimeout>|undefined;
    const controller=new AbortController(),retained=retainBattleAnimation(species);
    setReady(false);
    const retry=()=>{if(cancelled||retried||recoveryBudget.current.species!==species||recoveryBudget.current.attempts>=2)return;retried=true;recoveryBudget.current.attempts++;recovering=true;clearTimeout(recoveryTimer);battleRuntimeClock.recovered();setRecovery(value=>value+1);};
    const lost=(event:Event)=>{event.preventDefault();contextUnavailable.current=true;recovering=true;setReady(false);ownedDriver?.running(false);owned?.pause();recoveryTimer=setTimeout(retry,1000);};
    const restored=()=>retry();
    void(async()=>{try{
      const [prepared,{SwfPlayer}]=await Promise.all([retained.prepareForMount(),import('@seer-pet-anim/swf-renderer')]);
      if(cancelled||!prepared||!host.current)return;
      owned=new SwfPlayer();await owned.mount(host.current,prepared.clip,{clock:'manual',mode:'fixed',transparent:true,signal:controller.signal,releaseAtlasAfterSplit:prepared.releasePixelsAfterUpload,releaseAtlasAfterUpload:prepared.releasePixelsAfterUpload});
      if(cancelled){owned.destroy();owned=null;return;}
      retained.uploaded();canvas=owned.getCanvas();canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
      ownedDriver=battleRuntimeClock.attach(owned,()=>lost(new Event('webglcontextlost',{cancelable:true})),prepared.clip.atlasWidth*prepared.clip.atlasHeight*4);
      const standby=prepared.clip.sequences.find(s=>s.name==='standby')||prepared.clip.sequences[0];
      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(const frame of standby.frames)for(let i=0;i<frame.mesh.positions.length;i+=2){minX=Math.min(minX,frame.mesh.positions[i]);maxX=Math.max(maxX,frame.mesh.positions[i]);minY=Math.min(minY,frame.mesh.positions[i+1]);maxY=Math.max(maxY,frame.mesh.positions[i+1]);}
      let bounds={minX,maxX,minY,maxY};
      try{const visible=visibleStandbyBounds(owned,bounds,host.current.clientWidth,host.current.clientHeight);if(visible){bounds=visible;host.current.dataset.registration='visible-alpha';}else host.current.dataset.registration='standby-mesh';}catch{host.current.dataset.registration='standby-mesh';}
      const layout=()=>{if(!host.current||!owned)return;const transform=fixedAnimationTransform(bounds,host.current.clientWidth,host.current.clientHeight,getCreatureArt(species).physicalScale*.9);owned.setFixedTransform(transform.position,transform.scale);ownedDriver?.draw();};
      contextUnavailable.current=false;player.current=owned;driver.current=ownedDriver;layout();observer=new ResizeObserver(layout);observer.observe(host.current);play();if(!contextUnavailable.current)setReady(true);
    }catch{ownedDriver?.destroy();ownedDriver=null;owned?.destroy();owned=null;player.current=null;driver.current=null;retained.release();}})();
    return()=>{cancelled=true;controller.abort();clearTimeout(recoveryTimer);observer?.disconnect();canvas?.removeEventListener('webglcontextlost',lost);canvas?.removeEventListener('webglcontextrestored',restored);player.current=null;driver.current=null;ownedDriver?.destroy();owned?.destroy();retained.release({warm:recovering});};
  },[species,recovery]);
  useEffect(play,[kind,eventKey,resting]);
  const art=getCreatureArt(species);
  return <div className={`original-battle-creature ${ready?'is-ready':''}`} data-original-animation={ready?'ready':'fallback'} aria-label={name}>
    <img src={art.src} alt={name} style={creatureArtStyle(species,undefined,{scaleByStage:true,verticalAlign:'center'})}/>
    <div ref={host} className="original-battle-canvas" aria-hidden="true"/>
  </div>;
}
