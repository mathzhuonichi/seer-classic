/** Exercise the production component lifecycle with controlled renderer failures. */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const stateKey='__battleDisplayLifecycle';
const globals=['window','document','getComputedStyle','ResizeObserver','MutationObserver','requestAnimationFrame','cancelAnimationFrame',stateKey];
const saved=new Map(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
const modules={
  react:`const h=()=>globalThis.${stateKey};export const useRef=value=>{const state=h(),ref={current:state.refIndex++===0?state.host:value};return ref;};export const useState=value=>[value,()=>{}];export const useEffect=effect=>h().effects.push(effect);`,
  player:`export const SwfPlayer=class{constructor(){this.h=globalThis.${stateKey};this.h.players.push(this);this.frame=0;}async mountInto(){this.h.mountCalls++;if(this.h.failMount)throw Error('mount failed');}getSequences(){return[{name:'standby'},{name:'attack'}];}pause(){}setSequence(){}gotoFrame(frame){this.frame=frame;}setFixedTransform(position,scale){this.position=position;this.scale=scale;}playSequence(){this.h.plays++;this.frame=0;}getFrameIndex(){return this.frame;}destroy(){this.h.playerDestroys++;if(this.h.failPlayerDestroy)throw Error('player destroy failed');}};`,
  pixi:`export const WebGLRenderer=class{constructor(){this.h=globalThis.${stateKey};this.h.renderers.push(this);this.screen={width:0,height:0};this.gl={RGBA:1,UNSIGNED_BYTE:2,getExtension:()=>({loseContext:()=>this.h.lostContexts++}),readPixels:(_x,_y,w,h,_format,_type,pixels)=>{this.h.alphaReads++;for(let y=Math.floor(h/3);y<Math.floor(2*h/3);y++)for(let x=Math.floor(w/3);x<Math.floor(2*w/3);x++)pixels[(y*w+x)*4+3]=255;}};}async init(options){this.h.initCalls++;this.canvas=options.canvas;this.canvas.gl=this.gl;if(this.h.delayInit)await new Promise(resolve=>this.h.finishInit=resolve);if(this.h.failInit)throw Error('init failed');this.resize(options.width,options.height,options.resolution);}resize(width,height,resolution){this.screen={width,height};this.resolution=resolution;this.canvas.width=Math.round(width*resolution);this.canvas.height=Math.round(height*resolution);this.h.resizeCalls++;}render(){this.h.draws++;}destroy(){this.h.rendererDestroys++;if(this.h.failRendererDestroy)throw Error('renderer destroy failed');}};export const Container=class{constructor(){this.h=globalThis.${stateKey};}destroy(){this.h.stageDestroys++;if(this.h.failStageDestroy)throw Error('stage destroy failed');}};`,
  pool:`export const originalAction=kind=>kind==='physical'?'attack':'standby';export const retainBattleAnimation=()=>{const h=globalThis.${stateKey};let released=false;h.leases++;return{prepareForMount:async()=>({clip:{atlasWidth:512,atlasHeight:512,sequences:[{name:'standby',frames:[{mesh:{positions:[-1,-1,1,1]}}]}]},releasePixelsAfterUpload:true}),uploaded(){h.uploads++;},release(){if(!released){released=true;h.releases++;}}};};`,
  clock:`export const battleRuntimeClock={attach(player){const h=globalThis.${stateKey};h.clockAttaches++;return{running(){},draw(){player.draw();},destroy(){h.clockDestroys++;}};},recovered(){}};`,
  art:`export const getCreatureArt=()=>({src:'/fixture.svg',physicalScale:1});export const creatureArtStyle=()=>({});`,
};
const substitutions={'react':'react','@seer-pet-anim/swf-renderer':'player','pixi.js':'pixi','../presentation/battle-animation':'pool','../presentation/battle-runtime-clock':'clock','../presentation/creature-art':'art'};
const cacheRoot=fileURLToPath(new URL('../../artifacts/.validation-cache/',import.meta.url));
mkdirSync(cacheRoot,{recursive:true});
const cacheDir=mkdtempSync(join(cacheRoot,'battle-display-lifecycle-'));
const server=await createServer({cacheDir,server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',logLevel:'error',plugins:[{name:'battle-display-lifecycle-boundaries',enforce:'pre',transform(code,id){if(!id.split('?')[0].endsWith('/BattleCreatureAnimation.tsx'))return;for(const [source,target] of Object.entries(substitutions))code=code.replaceAll(`'${source}'`,`'virtual:battle-display-${target}'`);return code;},resolveId(id){if(id.startsWith('virtual:battle-display-'))return '\0battle-display-'+id.slice('virtual:battle-display-'.length);},load(id){if(id.startsWith('\0battle-display-'))return modules[id.slice('\0battle-display-'.length)];}}]}).catch(error=>{rmSync(cacheDir,{recursive:true,force:true,maxRetries:3,retryDelay:100});throw error;});
const checks=[];
function createState(options={}){
  const h={...options,refIndex:0,effects:[],players:[],renderers:[],canvases:[],resizeObservers:[],mutationObservers:[],queries:[],raf:new Map(),nextFrame:0,windowListeners:new Set(),leases:0,releases:0,uploads:0,initCalls:0,mountCalls:0,plays:0,alphaReads:0,draws:0,resizeCalls:0,clockAttaches:0,clockDestroys:0,playerDestroys:0,rendererDestroys:0,stageDestroys:0,lostContexts:0};
  h.root={parentElement:null,zoom:'1.5'};
  h.host={parentElement:h.root,clientWidth:170,clientHeight:170,dataset:{},appendChild(canvas){canvas.parent=this;}};
  h.window={devicePixelRatio:2,matchMedia(media){const q={media,matches:false,listeners:new Set(),addEventListener(_type,fn){this.listeners.add(fn);},removeEventListener(_type,fn){this.listeners.delete(fn);}};h.queries.push(q);return q;},addEventListener(_type,fn){h.windowListeners.add(fn);},removeEventListener(_type,fn){h.windowListeners.delete(fn);}};
  return h;
}
function install(h){
  globalThis[stateKey]=h;globalThis.window=h.window;
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');const canvas={width:0,height:0,style:{},listeners:new Map(),getContext(){return this.gl;},addEventListener(type,fn){this.listeners.set(type,fn);},removeEventListener(type,fn){if(this.listeners.get(type)===fn)this.listeners.delete(type);},remove(){this.removed=true;this.parent=null;}};h.canvases.push(canvas);return canvas;}};
  globalThis.getComputedStyle=element=>({zoom:element.zoom??'1'});
  globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;h.resizeObservers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
  globalThis.MutationObserver=class{constructor(callback){this.callback=callback;h.mutationObservers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
  globalThis.requestAnimationFrame=fn=>{const id=++h.nextFrame;h.raf.set(id,fn);return id;};globalThis.cancelAnimationFrame=id=>h.raf.delete(id);
}
const flush=h=>{const callbacks=[...h.raf.values()];h.raf.clear();for(const fn of callbacks)fn(0);};
async function waitFor(predicate){for(let i=0;i<80;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Lifecycle did not settle');}
try{
  const initial=createState();install(initial);
  const {default:BattleCreatureAnimation}=await server.ssrLoadModule('/src/components/BattleCreatureAnimation.tsx');
  const start=h=>{install(h);BattleCreatureAnimation({species:6,name:'Fixture',kind:'physical',eventKey:1,resting:true});const cleanup=h.effects[0]();h.effects[1]();return cleanup;};
  const assertReleased=h=>{assert.equal(h.releases,1);assert.equal(h.stageDestroys,1);assert.equal(h.rendererDestroys,1);assert.equal(h.canvases[0].width,0);assert.equal(h.canvases[0].height,0);assert.equal(h.canvases[0].removed,true);};
  const h=createState(),cleanup=start(h);await waitFor(()=>h.plays===1);
  assert.equal(h.renderers[0].resolution,3);assert.equal(h.canvases[0].width,510);h.players[0].frame=11;
  h.root.zoom='2';h.mutationObservers[0].callback();flush(h);
  assert.equal(h.renderers[0].resolution,4);assert.equal(h.canvases[0].width,680);assert.equal(h.players[0].frame,11);
  h.window.devicePixelRatio=1;for(const fn of h.queries.find(q=>q.media.includes('resolution')).listeners)fn();flush(h);
  assert.equal(h.renderers[0].resolution,2);assert.equal(h.canvases[0].width,340);assert.equal(h.players[0].frame,11);
  h.host.clientWidth=200;h.host.clientHeight=200;h.resizeObservers[0].callback();assert.equal(h.canvases[0].width,400);assert.equal(h.players[0].frame,11);
  assert.equal(h.players.length,1);assert.equal(h.renderers.length,1);assert.equal(h.mountCalls,1);assert.equal(h.uploads,1);assert.equal(h.alphaReads,1);assert.equal(h.plays,1);assert.equal(h.clockAttaches,1);
  cleanup();assertReleased(h);assert.equal(h.clockDestroys,1);assert.equal(h.playerDestroys,1);assert.equal(h.windowListeners.size,0);assert.equal(h.resizeObservers[0].disconnected,true);assert.equal(h.mutationObservers[0].disconnected,true);
  checks.push('DPR, zoom and size changes preserve the mounted player, source frame, uploaded atlas and registration');
  const failed=createState({failInit:true}),failedCleanup=start(failed);await waitFor(()=>failed.releases===1);assertReleased(failed);assert.equal(failed.players.length,0);assert.equal(failed.clockAttaches,0);failedCleanup();assertReleased(failed);
  checks.push('Initialization failure releases graphics before a player exists');
  const cancelled=createState({delayInit:true}),cancelCleanup=start(cancelled);await waitFor(()=>cancelled.initCalls===1);cancelCleanup();assert.equal(cancelled.rendererDestroys,0);cancelled.finishInit();await waitFor(()=>cancelled.rendererDestroys===1);assertReleased(cancelled);assert.equal(cancelled.players.length,0);
  checks.push('Unmount during initialization waits for initialization then disposes without mounting');
  const mountFailed=createState({failMount:true}),mountCleanup=start(mountFailed);await waitFor(()=>mountFailed.releases===1);assertReleased(mountFailed);assert.equal(mountFailed.playerDestroys,1);assert.equal(mountFailed.clockAttaches,0);mountCleanup();assertReleased(mountFailed);
  checks.push('Rejected embedding disposes the player, renderer and retained clip');
  for(const [flag,message] of [['failStageDestroy','stage destroy failed'],['failRendererDestroy','renderer destroy failed'],['failPlayerDestroy','player destroy failed']]){
    const state=createState(),stop=start(state);await waitFor(()=>state.plays===1);state[flag]=true;assert.throws(stop,new RegExp(message));assertReleased(state);assert.equal(state.clockDestroys,1);assert.equal(state.playerDestroys,1);if(flag==='failRendererDestroy')assert.equal(state.lostContexts,1);checks.push(`${message}: subsequent cleanup still runs and the error remains visible`);
  }
  console.log(JSON.stringify({passed:checks.length,checks,scope:'Production component lifecycle with mocked GPU boundaries; actual GPU rendering is verified separately.'},null,2));
}finally{
  try{await server.close();}finally{rmSync(cacheDir,{recursive:true,force:true,maxRetries:3,retryDelay:100});for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}
