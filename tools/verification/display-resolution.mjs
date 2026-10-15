/** Run with node tools/verification/display-resolution.mjs. No browser or save mutations. */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {CanvasSource} from '../../node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/CanvasSource.mjs';

const cacheRoot=fileURLToPath(new URL('../../artifacts/.validation-cache/',import.meta.url));
mkdirSync(cacheRoot,{recursive:true});
const cacheDir=mkdtempSync(join(cacheRoot,'display-resolution-'));
const server=await createServer({cacheDir,server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',logLevel:'error'}).catch(error=>{rmSync(cacheDir,{recursive:true,force:true,maxRetries:3,retryDelay:100});throw error;});
const original=new Map(['window','requestAnimationFrame','cancelAnimationFrame','MutationObserver','getComputedStyle'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
const checks=[];
function pass(name,run){run();checks.push(name);}
const callbacks=new Map(),windowListeners=new Map(),queries=[],mutations=[];
let frameId=0;
const screen={devicePixelRatio:1,
  addEventListener(type,callback){if(!windowListeners.has(type))windowListeners.set(type,new Set());windowListeners.get(type).add(callback);},
  removeEventListener(type,callback){windowListeners.get(type)?.delete(callback);},
  matchMedia(media){const listeners=new Set(),query={media,listeners,addEventListener(type,callback){assert.equal(type,'change');listeners.add(callback);},removeEventListener(type,callback){assert.equal(type,'change');listeners.delete(callback);}};queries.push(query);return query;},
};
globalThis.window=screen;
globalThis.requestAnimationFrame=callback=>{const id=++frameId;callbacks.set(id,callback);return id;};
globalThis.cancelAnimationFrame=id=>callbacks.delete(id);
globalThis.MutationObserver=class{constructor(callback){this.callback=callback;this.observed=[];this.disconnected=false;mutations.push(this);}observe(element,options){this.observed.push({element,options});}disconnect(){this.disconnected=true;}};
globalThis.getComputedStyle=element=>({zoom:element.zoom??'1',transform:element.transform??'none'});
const root={parentElement:null,zoom:'1'},host={parentElement:root,clientWidth:170,clientHeight:170};
Object.defineProperty(host,'getBoundingClientRect',{get(){throw Error('Motion transforms must not enter resolution calculations');}});
const flush=()=>{const pending=[...callbacks.values()];callbacks.clear();for(const callback of pending)callback(0);};
const resize=()=>{for(const callback of windowListeners.get('resize')??[])callback();};
try{
  const {getDisplayResolution,observeDisplayResolution}=await server.ssrLoadModule('/src/presentation/display-resolution.ts');
  const {visibleStandbyBounds}=await server.ssrLoadModule('/src/presentation/battle-animation-registration.ts');
  pass('DPR multiplied by currentCSSZoom, including fractional density',()=>{
    host.currentCSSZoom=1.5;screen.devicePixelRatio=2;assert.equal(getDisplayResolution(host),3);
    screen.devicePixelRatio=1.25;assert.equal(getDisplayResolution(host),1.875);delete host.currentCSSZoom;
  });
  pass('Ancestor CSS zoom fallback excludes entrance transforms',()=>{
    root.zoom='150%';host.zoom='2';host.transform='scale(.2)';screen.devicePixelRatio=2;assert.equal(getDisplayResolution(host),6);
    host.zoom='1';root.zoom='1';screen.devicePixelRatio=NaN;assert.equal(getDisplayResolution(host),1);screen.devicePixelRatio=0;assert.equal(getDisplayResolution(host),1);
  });
  screen.devicePixelRatio=1;
  const canvas={width:0,height:0,style:{}},source=new CanvasSource({resource:canvas,width:170,height:170,resolution:1,autoDensity:true}),changes=[];
  const stop=observeDisplayResolution(host,resolution=>{changes.push(resolution);source.resize(host.clientWidth,host.clientHeight,resolution);});
  pass('The observer watches each ancestor style and class without a subtree scan',()=>{
    assert.deepEqual(mutations[0].observed.map(row=>row.element),[host,root]);
    for(const row of mutations[0].observed)assert.deepEqual(row.options,{attributes:true,attributeFilter:['style','class']});
  });
  pass('DPR-only changes update physical pixels and rearm the media query',()=>{
    screen.devicePixelRatio=2;for(const callback of queries[0].listeners)callback();flush();
    assert.deepEqual(changes,[2]);assert.equal(canvas.width,340);assert.equal(canvas.height,340);assert.equal(canvas.style.width,'170px');
    assert.equal(queries[0].listeners.size,0);assert.equal(queries.at(-1).media,'(resolution: 2dppx)');
  });
  pass('CSS zoom updates the same backing source with unchanged layout size',()=>{
    root.zoom='300%';mutations[0].callback();flush();assert.deepEqual(changes,[2,6]);assert.equal(canvas.width,1020);assert.equal(canvas.height,1020);assert.equal(source.width,170);
  });
  pass('Resize and mutation notifications coalesce and ignore unchanged density',()=>{
    resize();mutations[0].callback();assert.equal(callbacks.size,1);flush();assert.deepEqual(changes,[2,6]);
    screen.devicePixelRatio=1.5;root.zoom='125%';resize();mutations[0].callback();assert.equal(callbacks.size,1);flush();assert.equal(changes.at(-1),1.875);assert.equal(canvas.width,319);
  });
  pass('Cleanup removes observers, listeners and a pending frame',()=>{
    root.zoom='2';mutations[0].callback();assert.equal(callbacks.size,1);stop();assert.equal(callbacks.size,0);assert.equal(mutations[0].disconnected,true);
    assert.equal(windowListeners.get('resize').size,0);assert.equal(queries.at(-1).listeners.size,0);const count=changes.length;mutations[0].callback();resize();flush();assert.equal(changes.length,count);
  });
  source.destroy();
  pass('Legacy matchMedia listeners receive the same cleanup',()=>{
    const modern=screen.matchMedia;
    screen.matchMedia=media=>{const listeners=new Set();const query={media,listeners,addListener(callback){listeners.add(callback);},removeListener(callback){listeners.delete(callback);}};queries.push(query);return query;};
    const stopLegacy=observeDisplayResolution(host,()=>{});assert.equal(queries.at(-1).listeners.size,1);stopLegacy();assert.equal(queries.at(-1).listeners.size,0);screen.matchMedia=modern;
  });
  pass('Alpha registration remains in logical coordinates at densities 1, 1.5, 2, 3 and 6',()=>{
    for(const resolution of [1,1.5,2,3,6]){
      const width=170,height=170,pixelWidth=width*resolution,pixelHeight=height*resolution;
      const gl={RGBA:1,UNSIGNED_BYTE:2,readPixels(_x,_y,_w,_h,_rgba,_type,pixels){for(let y=40*resolution;y<120*resolution;y++)for(let x=60*resolution;x<110*resolution;x++)pixels[(y*pixelWidth+x)*4+3]=255;}};
      const player={pause(){},setSequence(){},gotoFrame(){},setFixedTransform(){},draw(){},getCanvas(){return{width:pixelWidth,height:pixelHeight,getContext(){return gl;}};}};
      assert.deepEqual(visibleStandbyBounds(player,{minX:-1,maxX:1,minY:-1,maxY:1},width,height),{minX:-.5,maxX:.5,minY:-.9,maxY:.7});
    }
  });
  console.log(JSON.stringify({passed:checks.length,checks,scope:'Production density observer, installed Pixi CanvasSource and registration math. Real GPU continuity is checked separately in the browser.'},null,2));
}finally{
  for(const [key,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  try{await server.close();}finally{rmSync(cacheDir,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
}
