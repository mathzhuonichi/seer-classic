/** Focused production runtime audit: repacked dimensions and cancellation after warm preload. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('../../',import.meta.url)),species=346;
const original=JSON.parse(fs.readFileSync(path.join(root,'public/battle-animations/runtime-index.json'))).species[species];
const hd=JSON.parse(fs.readFileSync(path.join(root,'public/battle-animations/hd/runtime-index.json'))).species[species];
assert(hd,'A reviewed repacked entry is required for this targeted audit');
const expectedBytes=hd.atlasWidth*hd.atlasHeight*4,oldBytes=original.atlasWidth*original.atlasHeight*4;
assert.notEqual(expectedBytes,oldBytes,'The fixture must distinguish old and repacked dimensions');
const savedFetch=globalThis.fetch,savedBitmap=globalThis.createImageBitmap;
const cacheRoot=path.join(root,'artifacts/.validation-cache');fs.mkdirSync(cacheRoot,{recursive:true});
const cache=fs.mkdtempSync(path.join(cacheRoot,'hd-memory-'));
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return{promise,resolve};};
const live=new Set(),created=[],events=[],checks=[],observations=[];
let pendingDecode,decodeEntered,server;
function bitmap(kind,width=hd.atlasWidth,height=hd.atlasHeight){
 const value={kind,width,height,close(){if(this.width||this.height){this.width=0;this.height=0;live.delete(this);events.push(`closed:${kind}`);}}};
 created.push(value);live.add(value);events.push(`created:${kind}`);return value;
}
try{
 globalThis.fetch=async(url,{signal})=>{signal.throwIfAborted();assert([hd.meta,hd.atlas].includes(url),'Reviewed HD requests must not silently use the old atlas');return new Response(fs.readFileSync(path.join(root,'public',url)),{headers:{'Content-Type':url===hd.atlas?'image/png':'application/gzip'}});};
 globalThis.createImageBitmap=async(source,options)=>{
  assert.equal(options.premultiplyAlpha,'none');
  if(source instanceof Blob){decodeEntered?.resolve();if(pendingDecode)await pendingDecode.promise;return bitmap('decoded');}
  assert(source.width>0&&source.height>0,'Cloning requires live source pixels');return bitmap('private-copy',source.width,source.height);
 };
 server=await createServer({root,configFile:false,cacheDir:cache,server:{middlewareMode:true,watch:null,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',logLevel:'error'});
 const runtime=await server.ssrLoadModule('/src/presentation/battle-animation.ts');
 const check=async(name,run)=>{await run();checks.push(name);};
 await check('Warm preload accounts for repacked pixels before releasing CPU bitmap ownership',async()=>{
  await runtime.preloadBattleAnimations([species]);const stats=runtime.getBattleAnimationRuntimeStats();
  assert.equal(stats.idle,1);assert.equal(stats.leases,0);assert.equal(stats.cpuBitmapBytes,0);assert.equal(live.size,0);
  assert(stats.peakBytes>=expectedBytes+stats.geometryBytes+stats.compressedAtlasBytes);
  assert.equal(stats.residentBytes,stats.geometryBytes+stats.compressedAtlasBytes);assert(stats.residentBytes<=32*1024*1024);
  observations.push({case:'warm-preload',oldAtlasBytes:oldBytes,repackedAtlasBytes:expectedBytes,peakBytes:stats.peakBytes,residentBytes:stats.residentBytes});
 });
 await check('Mounting a warm HD clip tracks both actual large bitmap copies and releases them after upload',async()=>{
  const retained=runtime.retainBattleAnimation(species),prepared=await retained.prepareForMount();assert(prepared);
  const stats=runtime.getBattleAnimationRuntimeStats();assert.equal(stats.cpuBitmapBytes,expectedBytes);assert.equal(stats.transientBitmapBytes,expectedBytes);assert.equal(live.size,2);
  assert.equal(prepared.clip.atlasWidth,hd.atlasWidth);assert.equal(prepared.clip.atlasHeight,hd.atlasHeight);assert(prepared.releasePixelsAfterUpload);
  prepared.clip.atlas.close();retained.uploaded();assert.equal(live.size,0);retained.release();assert.equal(runtime.getBattleAnimationRuntimeStats().resources,0);
 });
 await check('Cancellation during warm rehydration closes every late HD bitmap and returns no clip',async()=>{
  await runtime.preloadBattleAnimations([species]);const beforeCopies=runtime.getBattleAnimationRuntimeStats().atlasCopies;
  pendingDecode=deferred();decodeEntered=deferred();const retained=runtime.retainBattleAnimation(species),prepared=retained.prepareForMount();
  await decodeEntered.promise;retained.release();pendingDecode.resolve();assert.equal(await prepared,null);
  pendingDecode=undefined;decodeEntered=undefined;const stats=runtime.getBattleAnimationRuntimeStats();
  assert.equal(live.size,0);assert.equal(stats.resources,0);assert.equal(stats.leases,0);assert.equal(stats.transientBitmapBytes,0);assert.equal(stats.cpuBitmapBytes,0);
  assert.equal(stats.atlasCopies,beforeCopies,'A cancelled owner must not allocate a private copy after late rehydration');
  observations.push({case:'cancel-during-rehydration',unnecessaryPrivateCopies:stats.atlasCopies-beforeCopies,bytesPerPrivateCopy:expectedBytes});
 });
 const report={passed:true,checks,species,observations,createdBitmaps:created.length,openBitmaps:live.size,
  limitations:['Production TypeScript and real asset metadata/blob sizes are used; ImageBitmap allocations are controlled lifetime fixtures, not OS memory measurements.','GPU tiling/upload is covered by the separate real-browser check.']};
 const output=path.join(root,'artifacts/battle-hd-loader-v44/memory-review.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{globalThis.fetch=savedFetch;globalThis.createImageBitmap=savedBitmap;await server?.close();fs.rmSync(cache,{recursive:true,force:true});for(const value of live)value.close();}
