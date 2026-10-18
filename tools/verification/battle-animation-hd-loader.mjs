/** Production loader regression: optional HD, original fallback, cancellation, and bitmap ownership. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('../../',import.meta.url));
const baselineIndex=fs.readFileSync(path.join(root,'public/battle-animations/runtime-index.json'));
const original=JSON.parse(baselineIndex).species['346'];
const nativeMeta=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'public',original.meta))));
const hd={meta:'/battle-animations/hd/fixture-346.json.gz',atlas:'/battle-animations/hd/fixture-346.png',atlasWidth:5376,atlasHeight:5782,metaSha256:'0'.repeat(64),atlasSha256:'1'.repeat(64)};
const hdMeta={...nativeMeta,atlasWidth:hd.atlasWidth,atlasHeight:hd.atlasHeight};
const savedFetch=globalThis.fetch,savedBitmap=globalThis.createImageBitmap;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const checks=[];
const cacheRoot=path.join(root,'artifacts/.validation-cache');fs.mkdirSync(cacheRoot,{recursive:true});
const cache=fs.mkdtempSync(path.join(cacheRoot,'hd-loader-'));
let server;
function setup(config={}){
  const calls=[],events=[],bitmaps=[];
  const controller=new AbortController();
  const makeBitmap=(kind,size)=>{
    const entry=kind==='hd'?hd:original;
    const bitmap={kind,width:size?.[0]??entry.atlasWidth,height:size?.[1]??entry.atlasHeight,closeCalls:0,
      close(){this.closeCalls++;this.width=0;this.height=0;events.push(`close:${kind}`);}};
    bitmaps.push(bitmap);return bitmap;
  };
  const fixture={calls,events,bitmaps,controller,makeBitmap};
  const normalResponse=url=>{
    if(url===hd.meta)return new Response(JSON.stringify(config.hdMeta??hdMeta));
    if(url===original.meta)return new Response(JSON.stringify(config.originalMeta??nativeMeta));
    if(url===hd.atlas)return new Response('fake HD bitmap',{headers:{'Content-Type':'image/x-hd'}});
    if(url===original.atlas)return new Response('fake original bitmap',{headers:{'Content-Type':'image/x-original'}});
    throw Error(`Unexpected request ${url}`);
  };
  globalThis.fetch=async(url,options)=>{
    calls.push(url);events.push(`fetch:${url}`);options.signal.throwIfAborted();
    const custom=config.fetch?.(url,options,fixture);
    return custom===undefined?normalResponse(url):await custom;
  };
  globalThis.createImageBitmap=async(blob,options)=>{
    assert.equal(options.premultiplyAlpha,'none');
    const kind=blob.kind??(blob.type==='image/x-hd'?'hd':'original');events.push(`decode:${kind}`);
    return config.bitmap?await config.bitmap(kind,fixture):makeBitmap(kind);
  };
  return fixture;
}
function pending(signal,onAbort){return new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>{onAbort?.();reject(signal.reason);},{once:true});});}
const originalCalls=f=>f.calls.filter(url=>url===original.meta||url===original.atlas);
const originalSucceeded=(result,f)=>{assert.equal(result.usedHd,false);assert.equal(result.clip.petId,346);assert.equal(result.clip.atlasWidth,original.atlasWidth);assert.equal(originalCalls(f).length,2);assert.equal(f.bitmaps.at(-1).closeCalls,0);result.clip.atlas.close();};
try{
  server=await createServer({root,configFile:false,cacheDir:cache,server:{middlewareMode:true,watch:null,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',logLevel:'error'});
  const {loadBattleAnimation}=await server.ssrLoadModule('/src/features/battle/battle-animation-loader.ts');
  const check=async(name,run)=>{await run();checks.push(name);};
  await check('No HD entry uses the original asset without extra requests',async()=>{
    const f=setup(),result=await loadBattleAnimation(346,original,undefined,f.controller.signal);
    assert.equal(f.calls.length,2);assert.equal(result.fellBack,false);originalSucceeded(result,f);
  });
  await check('Accepted HD preserves timing and hands off one open bitmap without loading original assets',async()=>{
    const f=setup(),result=await loadBattleAnimation(346,original,hd,f.controller.signal);
    assert.equal(result.usedHd,true);assert.equal(result.fellBack,false);assert.equal(originalCalls(f).length,0);
    assert.equal(result.clip.atlasWidth,hd.atlasWidth);assert.equal(result.clip.atlasHeight,hd.atlasHeight);
    assert.equal(result.clip.frameRate,nativeMeta.frameRate);assert.deepEqual(result.clip.sequences.map(s=>[s.name,s.frames.length]),nativeMeta.sequences.map(s=>[s.name,s.frames.length]));
    assert.equal(f.bitmaps.length,1);assert.equal(f.bitmaps[0].closeCalls,0);result.clip.atlas.close();
  });
  for(const failing of [hd.meta,hd.atlas])await check(`HTTP failure cancels its pending sibling before original fallback: ${failing}`,async()=>{
    let siblingCancelled=false;
    const other=failing===hd.meta?hd.atlas:hd.meta;
    const f=setup({fetch:(url,{signal})=>url===failing?new Response('missing',{status:404}):url===other?pending(signal,()=>{siblingCancelled=true;}):undefined});
    const result=await loadBattleAnimation(346,original,hd,f.controller.signal);
    assert(siblingCancelled);assert.equal(result.fellBack,true);assert.equal(f.bitmaps.length,1);originalSucceeded(result,f);
  });
  for(const payload of ['not JSON',new Uint8Array([0x1f,0x8b,1,2,3])])await check(`Malformed HD timeline falls back (${typeof payload==='string'?'JSON':'gzip'})`,async()=>{
    const f=setup({fetch:url=>url===hd.meta?new Response(payload):undefined});
    const result=await loadBattleAnimation(346,original,hd,f.controller.signal);assert.equal(result.fellBack,true);originalSucceeded(result,f);
  });
  await check('HD image decoding failure falls back without a leaked bitmap',async()=>{
    const f=setup({bitmap:(kind,fixture)=>{if(kind==='hd')throw Error('Invalid image');return fixture.makeBitmap(kind);}});
    originalSucceeded(await loadBattleAnimation(346,original,hd,f.controller.signal),f);assert.equal(f.bitmaps.length,1);
  });
  for(const [name,meta]of [['species',{...hdMeta,petId:347}],['timeline dimensions',{...hdMeta,atlasWidth:hd.atlasWidth+1}],['invalid mesh',{...hdMeta,sequences:[{name:'standby',frames:[{...nativeMeta.sequences[0].frames[0],indices:[65536,1,0]}]}]}]])await check(`HD ${name} failure closes pixels before original fetch`,async()=>{
    const f=setup({hdMeta:meta,fetch:(url,_options,fixture)=>{if(url===original.meta)assert.equal(fixture.bitmaps[0].closeCalls,1);}});
    const result=await loadBattleAnimation(346,original,hd,f.controller.signal);assert.equal(f.bitmaps[0].closeCalls,1);originalSucceeded(result,f);
  });
  await check('Decoded HD image dimensions must match both timeline and index',async()=>{
    const f=setup({bitmap:(kind,fixture)=>fixture.makeBitmap(kind,kind==='hd'?[16,16]:undefined)});
    originalSucceeded(await loadBattleAnimation(346,original,hd,f.controller.signal),f);assert.equal(f.bitmaps[0].closeCalls,1);
  });
  await check('Malformed or oversized HD entries fall back before any HD request',async()=>{
    for(const entry of [null,{...hd,meta:4},{...hd,atlas:'/outside/atlas.png'},{...hd,atlasWidth:0},{...hd,atlasHeight:8193}]){
      const f=setup(),result=await loadBattleAnimation(346,original,entry,f.controller.signal);assert.equal(f.calls.length,2);assert.equal(result.fellBack,true);originalSucceeded(result,f);
    }
  });
  await check('Already cancelled work performs no request and preserves the exact abort reason',async()=>{
    const f=setup(),reason=Error('Caller cancelled before loading');f.controller.abort(reason);
    await assert.rejects(loadBattleAnimation(346,original,hd,f.controller.signal),error=>error===reason);assert.equal(f.calls.length,0);
  });
  await check('Cancellation during HD fetch aborts both requests and never retries original',async()=>{
    let aborted=0;const entered=deferred();
    const f=setup({fetch:(_url,{signal},fixture)=>{if(fixture.calls.length===2)entered.resolve();return pending(signal,()=>{aborted++;});}});
    const reason=new DOMException('Navigation cancelled','AbortError');
    const rejected=assert.rejects(loadBattleAnimation(346,original,hd,f.controller.signal),error=>error===reason);
    await entered.promise;f.controller.abort(reason);await rejected;assert.equal(aborted,2);assert.equal(originalCalls(f).length,0);assert.equal(f.bitmaps.length,0);
  });
  await check('Cancellation during an uncancellable image decode closes its late bitmap without fallback',async()=>{
    const entered=deferred(),finish=deferred();
    const f=setup({bitmap:async(kind,fixture)=>{entered.resolve();await finish.promise;return fixture.makeBitmap(kind);}});
    const reason=new DOMException('Cancelled during decoding','AbortError');
    const rejected=assert.rejects(loadBattleAnimation(346,original,hd,f.controller.signal),error=>error===reason);
    await entered.promise;f.controller.abort(reason);finish.resolve();await rejected;
    assert.equal(f.bitmaps.length,1);assert.equal(f.bitmaps[0].closeCalls,1);assert.equal(originalCalls(f).length,0);
  });
  await check('An AbortError without an already-aborted parent signal is still never retried',async()=>{
    const reason=new DOMException('Fetch cancelled','AbortError');
    const f=setup({fetch:url=>{if(url===hd.meta)throw reason;}});
    await assert.rejects(loadBattleAnimation(346,original,hd,f.controller.signal),error=>error===reason);assert.equal(originalCalls(f).length,0);
  });
  await check('A cancellation concurrent with an HD HTTP failure takes precedence over fallback',async()=>{
    const reason=Error('Caller cancellation wins');
    const f=setup({fetch:(url,_options,fixture)=>{if(url===hd.meta){fixture.controller.abort(reason);return new Response('missing',{status:404});}}});
    await assert.rejects(loadBattleAnimation(346,original,hd,f.controller.signal),error=>error===reason);assert.equal(originalCalls(f).length,0);
  });
  await check('Cancellation during original fallback also releases the attempt and propagates abort',async()=>{
    const entered=deferred();let aborted=0;
    const f=setup({fetch:(url,{signal},fixture)=>{
      if(url===hd.meta)return new Response('missing',{status:404});
      if(url===original.meta||url===original.atlas){if(originalCalls(fixture).length===2)entered.resolve();return pending(signal,()=>{aborted++;});}
    }});
    const reason=new DOMException('Cancel fallback','AbortError');const rejected=assert.rejects(loadBattleAnimation(346,original,hd,f.controller.signal),error=>error===reason);
    await entered.promise;f.controller.abort(reason);await rejected;assert.equal(aborted,2);assert.equal(f.bitmaps.length,0);
  });
  await check('Two invalid identities close both attempt bitmaps and surface original failure',async()=>{
    const f=setup({hdMeta:{...hdMeta,petId:999},originalMeta:{...nativeMeta,petId:999}});
    await assert.rejects(loadBattleAnimation(346,original,hd,f.controller.signal),/identity or dimensions/);
    assert.equal(f.bitmaps.length,2);assert(f.bitmaps.every(b=>b.closeCalls===1));
  });
  const runtime=await server.ssrLoadModule('/src/features/battle/battle-animation.ts');
  const publishedIndex=path.join(root,'public/battle-animations/hd/runtime-index.json');
  const published=fs.existsSync(publishedIndex)?JSON.parse(fs.readFileSync(publishedIndex,'utf8')).species?.['346']:undefined;
  if(published)await check('Published HD selection integrates with the unchanged lease and large-bitmap ownership flow',async()=>{
    assert.equal(published.atlasWidth,hd.atlasWidth);assert.equal(published.atlasHeight,hd.atlasHeight);
    const f=setup({fetch:url=>url===published.meta?new Response(JSON.stringify(hdMeta)):url===published.atlas?new Response('fake HD bitmap',{headers:{'Content-Type':'image/x-hd'}}):undefined});
    const before=runtime.getBattleAnimationRuntimeStats(),retained=runtime.retainBattleAnimation(346),prepared=await retained.prepareForMount();
    assert(prepared);assert.equal(prepared.clip.atlas.width,hd.atlasWidth);assert.equal(prepared.releasePixelsAfterUpload,true);
    assert.equal(originalCalls(f).length,0);assert.equal(runtime.getBattleAnimationRuntimeStats().hdLoads,before.hdLoads+1);
    const attack=original.sequences.find(s=>s.name==='attack'),timing=runtime.battleAnimationTiming(346,'physical');
    assert.equal(timing.durationMs,attack.frames/original.frameRate*1000);
    // Mirror the renderer's explicit GPU upload ownership transfer.
    prepared.clip.atlas.close();retained.uploaded();
    assert.equal(runtime.getBattleAnimationRuntimeStats().cpuBitmapBytes,0);assert.equal(runtime.getBattleAnimationRuntimeStats().transientBitmapBytes,0);
    retained.release();assert(f.bitmaps.every(b=>b.width===0));assert.equal(runtime.getBattleAnimationRuntimeStats().resources,0);assert.equal(runtime.getBattleAnimationRuntimeStats().leases,0);
  });
  await check('Production runtime falls back through its existing pool and releases every bitmap',async()=>{
    const f=setup({fetch:url=>url.startsWith('/battle-animations/hd/')?new Response('missing',{status:404}):undefined});
    const before=runtime.getBattleAnimationRuntimeStats(),retained=runtime.retainBattleAnimation(346),prepared=await retained.prepareForMount();
    assert(prepared);assert.equal(prepared.clip.atlas.width,original.atlasWidth);assert.equal(originalCalls(f).length,2);
    if(published)assert.equal(runtime.getBattleAnimationRuntimeStats().hdFallbacks,before.hdFallbacks+1);
    prepared.clip.atlas.close();retained.uploaded();retained.release();
    assert(f.bitmaps.every(b=>b.width===0));assert.equal(runtime.getBattleAnimationRuntimeStats().resources,0);assert.equal(runtime.getBattleAnimationRuntimeStats().leases,0);
  });
  await check('The original runtime index remains byte-identical',async()=>{
    assert.deepEqual(fs.readFileSync(path.join(root,'public/battle-animations/runtime-index.json')),baselineIndex);
  });
  const report={passed:true,checks,originalIndexSha256:createHash('sha256').update(baselineIndex).digest('hex'),
    fixture:{species:346,originalFrameCount:nativeMeta.sequences.reduce((n,s)=>n+s.frames.length,0)},
    limitations:['Network responses and ImageBitmap decoding are controlled fixtures; browser GPU integration is verified separately.','Optional SHA fields are offline provenance; Content-Encoding may change the response bytes seen by JavaScript.']};
  const output=path.join(root,'artifacts/battle-hd-loader-v44/report.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,checks:checks.length,originalFrames:report.fixture.originalFrameCount},null,2));
}finally{globalThis.fetch=savedFetch;globalThis.createImageBitmap=savedBitmap;await server?.close();fs.rmSync(cache,{recursive:true,force:true});}
