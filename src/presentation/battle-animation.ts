import {disposeOfflineBattleClip} from './battle-offline-clip.ts';
import type {SwfClipData} from '@seer-pet-anim/swf-bundle';
import {loadBattleAnimation,type BattleAnimationHdIndex} from './battle-animation-loader.ts';
import {createBattleClipPool,waitForClipLease} from './battle-clip-pool.ts';
import {battleRuntimeClock} from './battle-runtime-clock.ts';
import index from '../../public/battle-animations/runtime-index.json';
export type OriginalAction='standby'|'attack'|'sa'|'cp'|'hited';
type Entry={meta:string;atlas:string;frameRate:number;atlasWidth:number;atlasHeight:number;sequences:{name:string;frames:number;hitFrame:number}[]};
type Asset={clip:SwfClipData;atlasBlob:Blob;geometryBytes:number;rehydrating?:Promise<void>};
const entries:Record<string,Entry>=index.species;
// Published entries pass source/atlas validation, with representative GPU and
// browser review. The optional manifest keeps source-only checkouts usable.
const hdIndexes=import.meta.glob<BattleAnimationHdIndex>('../../public/battle-animations/hd/runtime-index.json',{eager:true,import:'default'});
const hdEntries=hdIndexes['../../public/battle-animations/hd/runtime-index.json']?.species??{};
const LARGE_ATLAS_BYTES=16*1024*1024;
const transientBitmaps=new Set<ImageBitmap>();
const diagnostics={decodes:0,decodeMs:0,rehydrations:0,atlasCopies:0,hdLoads:0,hdFallbacks:0};
const bitmapBytes=(bitmap:ImageBitmap)=>bitmap.width*bitmap.height*4;
const geometryBytes=(clip:SwfClipData)=>clip.sequences.reduce((total,s)=>total+s.frames.reduce((sum,f)=>sum+f.mesh.positions.byteLength+f.mesh.uvs.byteLength+f.mesh.addColors.byteLength+f.mesh.mulColors.byteLength+f.mesh.indices.byteLength,0),0);
const pool=createBattleClipPool<Asset>({
  maxIdleEntries:2,maxIdleBytes:32*1024*1024,idleMs:15000,
  async load(id,signal){const started=performance.now();
    const {clip,atlasBlob,usedHd,fellBack}=await loadBattleAnimation(id,entries[id],hdEntries[id],signal);
    diagnostics.decodes++;diagnostics.decodeMs+=performance.now()-started;
    if(usedHd)diagnostics.hdLoads++;if(fellBack)diagnostics.hdFallbacks++;
    return{clip,atlasBlob,geometryBytes:geometryBytes(clip)};
  },
  dispose(asset){disposeOfflineBattleClip(asset.clip);},
  bytes:asset=>bitmapBytes(asset.clip.atlas)+asset.geometryBytes+asset.atlasBlob.size,
  onOwnership(asset,unuploaded){if(!unuploaded&&!asset.rehydrating&&asset.clip.atlasWidth*asset.clip.atlasHeight*4>=LARGE_ATLAS_BYTES)asset.clip.atlas.close();},
});
export const originalAction=(kind:string):OriginalAction=>({physical:'attack',special:'sa',status:'cp',hit:'hited'}as Record<string,OriginalAction>)[kind]||'standby';
export function hasLoadedBattleAnimation(species:number){return!!pool.peek(species)?.clip;}
export function battleAnimationTiming(species:number,kind:string){if(!hasLoadedBattleAnimation(species))return null;const e=entries[species],s=e?.sequences.find(s=>s.name===originalAction(kind));return s?{durationMs:s.frames/e.frameRate*1000,hitMs:s.hitFrame>=0?s.hitFrame/e.frameRate*1000:null}:null;}
async function ensureBitmap(asset:Asset){if(asset.clip.atlas.width)return;if(!asset.rehydrating){diagnostics.rehydrations++;asset.rehydrating=createImageBitmap(asset.atlasBlob,{premultiplyAlpha:'none'}).then(bitmap=>{asset.clip.atlas=bitmap;}).finally(()=>{asset.rehydrating=undefined;});}await asset.rehydrating;}
/** Retain before await; release only after the owner's renderer is destroyed. */
export function retainBattleAnimation(species:number){
  const lease=entries[species]?pool.acquire(species):null;let privateBitmap:ImageBitmap|null=null;
  return{clip:lease?.resource.then(asset=>asset?.clip??null)??Promise.resolve(null),
    async prepareForMount(){if(!lease||lease.released)return null;
      // This extra hold protects asynchronous bitmap cloning even if React cancels its owner.
      const asset=await lease.resource;if(!asset||lease.released)return null;
      const hold=pool.acquire(species);
      try{await ensureBitmap(asset);if(lease.released)return null;
        const large=asset.clip.atlasWidth*asset.clip.atlasHeight*4>=LARGE_ATLAS_BYTES;
        if(large){privateBitmap=await createImageBitmap(asset.clip.atlas,{premultiplyAlpha:'none'});transientBitmaps.add(privateBitmap);diagnostics.atlasCopies++;}
        if(lease.released){privateBitmap?.close();if(privateBitmap)transientBitmaps.delete(privateBitmap);privateBitmap=null;return null;}
        return{clip:privateBitmap?{...asset.clip,atlas:privateBitmap}:asset.clip,releasePixelsAfterUpload:large};
      }finally{hold.release();}
    },
    uploaded(){if(privateBitmap)transientBitmaps.delete(privateBitmap);lease?.uploaded();},
    release(options?:{warm?:boolean}){privateBitmap?.close();if(privateBitmap)transientBitmaps.delete(privateBitmap);privateBitmap=null;lease?.release(options);},
  };
}
/** Entry preload is cancellable; unused ready clips have a 32 MiB idle byte budget. */
export async function preloadBattleAnimations(species:number[],options:{signal?:AbortSignal}={}){
  const warmed:number[]=[];
  try{for(const id of [...new Set(species)].slice(0,2)){options.signal?.throwIfAborted();if(!entries[id])continue;const lease=pool.acquire(id);
    try{await waitForClipLease(lease,options.signal);options.signal?.throwIfAborted();lease.uploaded();lease.release({warm:true});warmed.push(id);}finally{if(!lease.released)lease.release();}}
  }catch(error){for(const id of warmed)pool.dropIdle(id);throw error;}
}
export function clearIdleBattleAnimations(){pool.clearIdle();}
/** Read-only diagnostics for browser QA and benchmarks; no global or product UI. */
export function getBattleAnimationRuntimeStats(){const state=pool.snapshot();const assets=state.entries.map(row=>pool.peek(row.species)).filter((x):x is Asset=>!!x);return{...state,...diagnostics,cpuBitmapBytes:assets.reduce((n,a)=>n+bitmapBytes(a.clip.atlas),0),geometryBytes:assets.reduce((n,a)=>n+a.geometryBytes,0),compressedAtlasBytes:assets.reduce((n,a)=>n+a.atlasBlob.size,0),transientBitmapBytes:[...transientBitmaps].reduce((n,b)=>n+bitmapBytes(b),0),clock:battleRuntimeClock.snapshot()};}
