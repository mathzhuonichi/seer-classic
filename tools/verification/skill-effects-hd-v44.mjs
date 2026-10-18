/** Bounded original-frame playback: ordering, cancellation, decode lifetime and cache. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../../',import.meta.url));
const cacheRoot=path.join(root,'artifacts/.validation-cache');fs.mkdirSync(cacheRoot,{recursive:true});
const cacheDir=fs.mkdtempSync(path.join(cacheRoot,'skill-effects-hd-v44-'));
const checks=[],failures=[];let server;
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve))};
const check=async(name,run)=>{try{await run();checks.push(name)}catch(error){failures.push({name,error:String(error.stack)});console.error(`FAIL ${name}: ${error.message}`)}};
function harness(Buffer,frames=9){
  const requests=[],draws=[],closed=[],errors=[],pixels={frame:undefined};
  const buffer=new Buffer({frames,load:(frame,signal)=>new Promise((resolve,reject)=>requests.push({frame,signal,resolve,reject})),clear:()=>{pixels.frame=undefined},draw:frame=>{draws.push(frame);pixels.frame=frame},onError:()=>errors.push('failed')});
  const resolve=request=>request.resolve({image:{width:2048,height:2048},close:()=>closed.push(request.frame)});
  return {buffer,requests,draws,closed,errors,resolve,pixels};
}
const originalFetch=globalThis.fetch,originalDecode=globalThis.createImageBitmap;
try{
  server=await createServer({root,configFile:false,cacheDir,server:{middlewareMode:true,watch:null,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',logLevel:'error'});
  const {SkillFrameBuffer}=await server.ssrLoadModule('/src/features/battle/skill-frame-buffer.ts');
  await check('Only the current source frame is drawn even when future decodes finish first',async()=>{
    const h=harness(SkillFrameBuffer);h.buffer.seek(0);await flush();assert.deepEqual(h.requests.map(r=>r.frame),[0,1,2]);h.resolve(h.requests[2]);await flush();assert.deepEqual(h.draws,[]);h.resolve(h.requests[0]);await flush();assert.deepEqual(h.draws,[0]);h.buffer.seek(1);await flush();assert(h.closed.includes(0));assert.deepEqual(h.requests.map(r=>r.frame),[0,1,2,3]);h.resolve(h.requests[1]);await flush();assert.deepEqual(h.draws,[0,1]);h.buffer.dispose();h.resolve(h.requests[3]);await flush();assert.deepEqual(h.closed.sort(),[0,1,2,3]);assert.deepEqual(h.errors,[]);
  });
  await check('A new clock frame clears old pixels while its source decode is still pending',async()=>{
    const h=harness(SkillFrameBuffer);h.buffer.seek(0);await flush();h.resolve(h.requests[0]);await flush();assert.equal(h.pixels.frame,0);h.buffer.seek(1);await flush();assert.equal(h.pixels.frame,undefined);h.resolve(h.requests[1]);await flush();assert.equal(h.pixels.frame,1);h.buffer.dispose();h.requests.slice(2).forEach(h.resolve);await flush();assert.equal(h.pixels.frame,undefined);
  });
  await check('A time jump aborts stale work and never draws skipped or late source frames',async()=>{
    const h=harness(SkillFrameBuffer);h.buffer.seek(0);await flush();h.buffer.seek(6);await flush();assert.equal(h.requests.length,3);assert(h.requests.every(r=>r.signal.aborted));h.requests.slice(0,3).forEach(h.resolve);await flush();assert.deepEqual(h.closed.sort(),[0,1,2]);assert.deepEqual(h.requests.map(r=>r.frame),[0,1,2,6,7,8]);h.requests.slice(3).forEach(h.resolve);await flush();assert.deepEqual(h.draws,[6]);h.buffer.dispose();assert.equal(h.closed.length,6);
  });
  await check('Finishing or unmounting closes ready and late asynchronous frames exactly once',async()=>{
    const h=harness(SkillFrameBuffer);h.buffer.seek(0);await flush();h.resolve(h.requests[0]);await flush();h.buffer.dispose();h.buffer.dispose();h.requests.slice(1).forEach(h.resolve);await flush();h.buffer.seek(2);await flush();assert.equal(h.requests.length,3);assert.deepEqual(h.closed.sort(),[0,1,2]);assert.deepEqual(h.draws,[0]);assert.deepEqual(h.errors,[]);
  });
  await check('One genuine loading failure releases all frames before the atlas fallback notification',async()=>{
    const h=harness(SkillFrameBuffer);h.buffer.seek(0);await flush();h.resolve(h.requests[0]);await flush();h.requests[1].reject(new Error('decode failure'));await flush();assert.deepEqual(h.errors,['failed']);assert.deepEqual(h.closed,[0]);assert(h.requests[2].signal.aborted);h.resolve(h.requests[2]);await flush();assert.deepEqual(h.closed,[0,2]);assert.equal(h.requests.length,3);
  });
  await check('Repeated seeks do not duplicate loads and the final frame does not request beyond the timeline',async()=>{
    const h=harness(SkillFrameBuffer,4);h.buffer.seek(3);h.buffer.seek(3);await flush();assert.deepEqual(h.requests.map(r=>r.frame),[3]);h.resolve(h.requests[0]);await flush();h.buffer.seek(99);await flush();assert.equal(h.requests.length,1);assert(h.draws.every(f=>f===3));h.buffer.dispose();assert.deepEqual(h.closed,[3]);
  });
  await check('Decoded slots are shared across moves and never exceed three live or pending images',async()=>{
    const {loadSkillFrame}=await server.ssrLoadModule('/src/features/battle/skill-frame-buffer.ts?pool=shared');let live=0,peak=0;const decodes=[];
    globalThis.fetch=async()=>new Response(new Blob(['source']));globalThis.createImageBitmap=()=>new Promise(resolve=>{live++;peak=Math.max(peak,live);decodes.push(()=>resolve({width:2048,height:2048,close:()=>live--}))});
    const controllers=Array.from({length:6},()=>new AbortController());const pending=controllers.map((c,i)=>loadSkillFrame(`/pool/${i}`,c.signal));await flush();assert.equal(decodes.length,3);decodes.slice(0,3).forEach(done=>done());const first=await Promise.all(pending.slice(0,3));assert.equal(live,3);first[0].close();first[0].close();await flush();assert.equal(decodes.length,4);first.slice(1).forEach(x=>x.close());await flush();assert.equal(decodes.length,6);decodes.slice(3).forEach(done=>done());const rest=await Promise.all(pending.slice(3));rest.forEach(x=>x.close());assert.equal(live,0);assert.equal(peak,3);
  });
  await check('An aborted move cannot double memory while its old decodes are still completing',async()=>{
    const {loadSkillFrame}=await server.ssrLoadModule('/src/features/battle/skill-frame-buffer.ts?pool=cancel');let live=0,peak=0;const decodes=[];
    globalThis.fetch=async()=>new Response(new Blob(['source']));globalThis.createImageBitmap=()=>new Promise(resolve=>{live++;peak=Math.max(peak,live);decodes.push(()=>resolve({close:()=>live--}))});
    const oldControllers=Array.from({length:3},()=>new AbortController());const old=oldControllers.map((c,i)=>loadSkillFrame(`/old/${i}`,c.signal).catch(error=>error));await flush();oldControllers.forEach(c=>c.abort());const currentControllers=Array.from({length:3},()=>new AbortController());const current=currentControllers.map((c,i)=>loadSkillFrame(`/new/${i}`,c.signal));await flush();assert.equal(decodes.length,3);decodes.slice(0,3).forEach(done=>done());await Promise.all(old);await flush();assert.equal(decodes.length,6);decodes.slice(3).forEach(done=>done());(await Promise.all(current)).forEach(x=>x.close());assert.equal(live,0);assert.equal(peak,3);
  });
  await check('Queued decode cancellation removes its request without leaking a shared slot',async()=>{
    const {loadSkillFrame}=await server.ssrLoadModule('/src/features/battle/skill-frame-buffer.ts?pool=queued');let decoded=0,closed=0;
    globalThis.fetch=async()=>new Response(new Blob(['source']));globalThis.createImageBitmap=async()=>{decoded++;return {close:()=>closed++}};
    const frames=await Promise.all([0,1,2].map(i=>loadSkillFrame(`/queue/${i}`,new AbortController().signal)));const controller=new AbortController();const queued=loadSkillFrame('/queue/3',controller.signal).catch(error=>error);await flush();controller.abort();assert((await queued)instanceof Error);frames.forEach(f=>f.close());await flush();assert.equal(decoded,3);const next=await loadSkillFrame('/queue/4',new AbortController().signal);next.close();assert.equal(decoded,4);assert.equal(closed,4);
  });
  await check('The compressed cache reuses recent frames and evicts old bytes beyond sixteen MiB',async()=>{
    const {loadSkillFrame}=await server.ssrLoadModule('/src/features/battle/skill-frame-buffer.ts?pool=cache');const fetched=[];
    globalThis.fetch=async url=>{fetched.push(url);return new Response(new Blob([new Uint8Array(8*1024*1024)]))};globalThis.createImageBitmap=async()=>({close(){}});
    for(const url of ['/cache/a','/cache/b','/cache/c','/cache/b','/cache/a']){const frame=await loadSkillFrame(url,new AbortController().signal);frame.close()}
    assert.deepEqual(fetched,['/cache/a','/cache/b','/cache/c','/cache/a']);
  });
  await check('HTTP and pre-aborted requests fail without allocating decoded pixels',async()=>{
    const {loadSkillFrame}=await server.ssrLoadModule('/src/features/battle/skill-frame-buffer.ts?pool=http');let decoded=0;
    globalThis.fetch=async()=>new Response('',{status:404});globalThis.createImageBitmap=async()=>{decoded++;return {close(){}}};await assert.rejects(loadSkillFrame('/missing',new AbortController().signal),/404/);const controller=new AbortController();controller.abort();globalThis.fetch=async()=>new Response(new Blob(['x']));await assert.rejects(loadSkillFrame('/aborted',controller.signal));assert.equal(decoded,0);
  });
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/battle-effects/manifest.json')));
  const published=JSON.parse(fs.readFileSync(path.join(root,'public/battle-effects/hd/manifest.json')));
  await check('All 67 original effects expose complete HD timelines with unchanged source provenance',async()=>{
    assert.deepEqual(Object.keys(published.effects),Object.keys(manifest.effects));assert.equal(Object.keys(published.effects).length,67);
    let frameCount=0;for(const [id,effect]of Object.entries(manifest.effects)){
      const record=published.effects[id];for(const key of ['sourceUrl','sourceSha256','sourceSymbol','sourceViewport','fps','representativeFrame'])assert.deepEqual(record[key],effect[key],`${id}: ${key}`);
      assert.equal(record.frames.length,effect.frames);assert.equal(record.originalFrames,effect.frames);assert.deepEqual(record.frames.map(f=>f.n),Array.from({length:effect.frames},(_,i)=>i));
      assert.equal(effect.hd.path,record.path);assert.equal(effect.hd.sha256,record.sha256);assert.equal(effect.hd.width,record.frames[0].width);assert.equal(effect.hd.height,record.frames[0].height);
      assert.equal(Math.max(effect.hd.width,effect.hd.height),2048);assert(record.maxFrameDecodedBytes<=16*1024*1024);assert.equal(record.quality.blankMismatches,0);assert.equal(record.quality.frames,effect.frames);
      if(record.quality.reviewFrames.length)assert.equal(record.visualReview.decision,'accepted');if(record.filteredPlacements)assert.equal(record.boxBlurPixelsLimit,1_000_000_000);
      frameCount+=record.frames.length;
    }assert.equal(frameCount,2128);assert.equal(published.summary.frames,2128);assert.equal(published.actionScriptExecuted,false);
  });
  await check('Every published source frame is lossless, has its recorded SHA-256 and fits the shared pixel budget',async()=>{
    let totalBytes=0;const sha=data=>createHash('sha256').update(data).digest('hex');
    for(const [id,record]of Object.entries(published.effects)){
      const files=fs.readdirSync(path.join(root,'public',record.path)).filter(name=>name.endsWith('.webp'));assert.equal(files.length,record.frames.length);
      for(const frame of record.frames){const file=path.join(root,'public',record.path,`${frame.n}.webp`);const bytes=fs.readFileSync(file);assert.equal(bytes.length,frame.bytes);assert.equal(sha(bytes),frame.sha256,`${id}/${frame.n}`);assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,16).toString(),'WEBPVP8L');assert.equal(bytes[20],0x2f);const dimensions=bytes.readUInt32LE(21);assert.equal((dimensions&0x3fff)+1,frame.width);assert.equal(((dimensions>>>14)&0x3fff)+1,frame.height);assert(frame.width*frame.height*4*4<=64*1024*1024);totalBytes+=bytes.length}
      assert.equal(sha(record.frames.map(frame=>`${frame.n}:${frame.sha256}\n`).join('')),record.sha256);
      const fallback=manifest.effects[id];assert.equal(sha(fs.readFileSync(path.join(root,'public',fallback.path))),fallback.sha256,`${id}: original fallback changed`);
    }assert.equal(totalBytes,published.summary.encodedBytes);
  });
}finally{
  globalThis.fetch=originalFetch;globalThis.createImageBitmap=originalDecode;
  try{await server?.close()}finally{fs.rmSync(cacheDir,{recursive:true,force:true,maxRetries:3,retryDelay:100})}
  const report={passed:checks.length,checks,failures,pixelBudget:{maximumDecodedFrames:3,maximumFrameEdge:2048,decodedMiB:48,canvasMiB:16,compressedCacheMiB:16}};const output=path.join(root,'artifacts/skill-effects-hd-v44');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'regression.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:checks.length,failures},null,2));if(failures.length)process.exitCode=1;
}
