import {useEffect,useRef,useState} from 'react';
import type {SwfPlayer} from '@seer-pet-anim/swf-renderer';
import {retainBattleAnimation,originalAction} from '../presentation/battle-animation.ts';
import {battleRuntimeClock} from '../presentation/battle-runtime-clock.ts';
import {getCreatureArt,creatureArtStyle} from '../presentation/creature-art.ts';
import {fixedAnimationTransform,visibleStandbyBounds} from '../presentation/battle-animation-registration.ts';
import {getDisplayResolution,observeDisplayResolution} from '../presentation/display-resolution.ts';
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
    let canvas:HTMLCanvasElement|undefined,recoveryTimer:ReturnType<typeof setTimeout>|undefined,stopResolution:()=>void=()=>{},releaseGraphics:()=>void=()=>{};
    const controller=new AbortController(),retained=retainBattleAnimation(species);
    const dispose=(warm=false)=>{try{ownedDriver?.destroy();}finally{ownedDriver=null;try{owned?.destroy();}finally{owned=null;try{releaseGraphics();}finally{retained.release({warm});}}}};
    setReady(false);
    const retry=()=>{if(cancelled||retried||recoveryBudget.current.species!==species||recoveryBudget.current.attempts>=2)return;retried=true;recoveryBudget.current.attempts++;recovering=true;clearTimeout(recoveryTimer);battleRuntimeClock.recovered();setRecovery(value=>value+1);};
    const lost=(event:Event)=>{event.preventDefault();contextUnavailable.current=true;recovering=true;setReady(false);ownedDriver?.running(false);owned?.pause();recoveryTimer=setTimeout(retry,1000);};
    const restored=()=>retry();
    void(async()=>{try{
      const [prepared,{SwfPlayer},{WebGLRenderer,Container}]=await Promise.all([retained.prepareForMount(),import('@seer-pet-anim/swf-renderer'),import('pixi.js')]);
      if(cancelled||!prepared||!host.current)return;
      const renderer=new WebGLRenderer(),stage=new Container(),renderCanvas=document.createElement('canvas');
      let initializing=true,graphicsDisposed=false,disposeRequested=false;
      releaseGraphics=()=>{if(initializing){disposeRequested=true;return;}if(graphicsDisposed)return;graphicsDisposed=true;
        try{stage.destroy({children:true});}finally{
          const gl=renderer.gl;
          try{renderer.destroy(true);}catch(error){gl?.getExtension('WEBGL_lose_context')?.loseContext();throw error;}
          finally{renderCanvas.remove();renderCanvas.width=0;renderCanvas.height=0;}
        }
      };
      try{await renderer.init({canvas:renderCanvas,width:Math.max(1,host.current.clientWidth),height:Math.max(1,host.current.clientHeight),resolution:getDisplayResolution(host.current),autoDensity:true,background:0,backgroundAlpha:0,antialias:true,preferWebGLVersion:2});}finally{initializing=false;}
      if(cancelled||disposeRequested){releaseGraphics();return;}
      // The public embedding API keeps the source player and uploaded atlas alive on density changes.
      class BattlePlayer extends SwfPlayer{
        private hostDisposed=false;
        override getCanvas(){return renderCanvas;}
        override draw(){if(!this.hostDisposed)renderer.render({container:stage});}
        override destroy(){if(this.hostDisposed)return;this.hostDisposed=true;try{super.destroy();}finally{releaseGraphics();}}
      }
      owned=new BattlePlayer();host.current.appendChild(owned.getCanvas());
      // mountInto is always manual/fixed; only battleRuntimeClock advances and draws it.
      await owned.mountInto(stage,renderer,prepared.clip,{transparent:true,signal:controller.signal,releaseAtlasAfterSplit:prepared.releasePixelsAfterUpload,releaseAtlasAfterUpload:prepared.releasePixelsAfterUpload});
      if(cancelled){owned.destroy();owned=null;return;}
      renderer.resize(Math.max(1,host.current.clientWidth),Math.max(1,host.current.clientHeight),getDisplayResolution(host.current));
      retained.uploaded();canvas=owned.getCanvas();canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
      ownedDriver=battleRuntimeClock.attach(owned,()=>lost(new Event('webglcontextlost',{cancelable:true})),prepared.clip.atlasWidth*prepared.clip.atlasHeight*4);
      const standby=prepared.clip.sequences.find(s=>s.name==='standby')||prepared.clip.sequences[0];
      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(const frame of standby.frames)for(let i=0;i<frame.mesh.positions.length;i+=2){minX=Math.min(minX,frame.mesh.positions[i]);maxX=Math.max(maxX,frame.mesh.positions[i]);minY=Math.min(minY,frame.mesh.positions[i+1]);maxY=Math.max(maxY,frame.mesh.positions[i+1]);}
      let bounds={minX,maxX,minY,maxY};
      try{const visible=host.current.clientWidth>0&&host.current.clientHeight>0?visibleStandbyBounds(owned,bounds,host.current.clientWidth,host.current.clientHeight):null;if(visible){bounds=visible;host.current.dataset.registration='visible-alpha';}else host.current.dataset.registration='standby-mesh';}catch{host.current.dataset.registration='standby-mesh';}
      const layout=()=>{if(!host.current||!owned||contextUnavailable.current)return;const width=host.current.clientWidth,height=host.current.clientHeight;if(width<=0||height<=0)return;const resolution=getDisplayResolution(host.current);if(renderer.screen.width!==width||renderer.screen.height!==height||renderer.resolution!==resolution)renderer.resize(width,height,resolution);const transform=fixedAnimationTransform(bounds,width,height,getCreatureArt(species).physicalScale*.9);owned.setFixedTransform(transform.position,transform.scale);ownedDriver?.draw();};
      contextUnavailable.current=false;player.current=owned;driver.current=ownedDriver;layout();observer=new ResizeObserver(layout);observer.observe(host.current);stopResolution=observeDisplayResolution(host.current,layout);play();if(!contextUnavailable.current)setReady(true);
    }catch(error){if(!cancelled)console.warn(`Battle animation unavailable for species ${species}:`,error);observer?.disconnect();stopResolution();canvas?.removeEventListener('webglcontextlost',lost);canvas?.removeEventListener('webglcontextrestored',restored);player.current=null;driver.current=null;dispose();}})();
    return()=>{cancelled=true;controller.abort();clearTimeout(recoveryTimer);observer?.disconnect();stopResolution();canvas?.removeEventListener('webglcontextlost',lost);canvas?.removeEventListener('webglcontextrestored',restored);player.current=null;driver.current=null;dispose(recovering);};
  },[species,recovery]);
  useEffect(play,[kind,eventKey,resting]);
  const art=getCreatureArt(species);
  return <div className={`original-battle-creature ${ready?'is-ready':''}`} data-original-animation={ready?'ready':'fallback'} aria-label={name}>
    <img src={art.src} alt={name} style={creatureArtStyle(species,undefined,{scaleByStage:true,verticalAlign:'center'})}/>
    <div ref={host} className="original-battle-canvas" aria-hidden="true"/>
  </div>;
}
