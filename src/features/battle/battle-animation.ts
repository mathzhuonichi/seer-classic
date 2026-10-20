// Original battle clips: which species have one, the shared clip pool, and its diagnostics.
import type {SwfClipData} from '@seer-pet-anim/swf-bundle';
import index from '../../../public/battle-animations/runtime-index.json';
import hdIndex from '../../../public/battle-animations/hd/runtime-index.json';
import {loadBattleAnimation,type BattleAnimationAssetEntry} from './battle-animation-loader.ts';
import {createBattleClipPool,waitForClipLease} from './battle-clip-pool.ts';
import {clipAtlasBytes,clipGeometryBytes,disposeOfflineBattleClip} from './battle-offline-clip.ts';
import {battleRuntimeClock} from './battle-runtime-clock.ts';

export type OriginalAction='standby'|'attack'|'sa'|'cp'|'hited';
/** The actor's original clip for a move: its length and the time of its hit marker. */
export interface MoveTiming {durationMs:number;hitMs:number|null}
export interface PreparedBattleAnimation {clip:SwfClipData;releasePixelsAfterUpload:boolean}
export interface RetainedBattleAnimation {
  /** The clip to mount, or null when it is unavailable or was released meanwhile. */
  prepareForMount():Promise<PreparedBattleAnimation|null>;
  /** The renderer has uploaded the atlas. */
  uploaded():void;
  release(options?:{warm?:boolean}):void;
}
type Entry={meta:string;atlas:string;frameRate:number;atlasWidth:number;atlasHeight:number;sequences:{name:string;frames:number;hitFrame:number}[]};
type Asset={clip:SwfClipData;atlasBlob:Blob;geometryBytes:number;rehydrating?:Promise<void>};

const entries:Record<string,Entry>=index.species;
// Published entries pass source/atlas validation, with representative GPU and browser review. The index is tracked, so a
// static import turns a wrong path into a build error; the loader still falls back to the original clip per missing asset.
const hdEntries:Record<string,BattleAnimationAssetEntry>=hdIndex.species;
/** Atlases this large are copied per mount and give up their CPU pixels once every owner has uploaded them. */
const LARGE_ATLAS_BYTES=16*1024*1024;
/** Species warmed by one preload: the two opening combatants. */
const PRELOAD_LIMIT=2;
const ACTIONS:Record<string,OriginalAction>={physical:'attack',special:'sa',status:'cp',hit:'hited'};

const transientBitmaps=new Set<ImageBitmap>();
const diagnostics={decodes:0,decodeMs:0,rehydrations:0,atlasCopies:0,hdLoads:0,hdFallbacks:0};
const bitmapBytes=(bitmap:ImageBitmap)=>bitmap.width*bitmap.height*4;
const isLarge=(clip:SwfClipData)=>clipAtlasBytes(clip)>=LARGE_ATLAS_BYTES;
// Idle clips use the pool's limits: two clips, 32 MiB, 15 seconds.
const pool=createBattleClipPool<Asset>({
  async load(id,signal){
    const started=performance.now();
    const {clip,atlasBlob,usedHd,fellBack}=await loadBattleAnimation(id,entries[id],hdEntries[id],signal);
    diagnostics.decodes++;diagnostics.decodeMs+=performance.now()-started;
    if(usedHd)diagnostics.hdLoads++;
    if(fellBack)diagnostics.hdFallbacks++;
    return{clip,atlasBlob,geometryBytes:clipGeometryBytes(clip)};
  },
  dispose(asset){disposeOfflineBattleClip(asset.clip);},
  bytes:asset=>bitmapBytes(asset.clip.atlas)+asset.geometryBytes+asset.atlasBlob.size,
  onOwnership(asset,unuploaded){if(!unuploaded&&!asset.rehydrating&&isLarge(asset.clip))asset.clip.atlas.close();},
});

export const originalAction=(kind:string):OriginalAction=>ACTIONS[kind]||'standby';

/** Timing of a loaded clip's sequence for this frame kind; null until the clip is in the pool. */
export function battleAnimationTiming(species:number,kind:string):MoveTiming|null{
  if(!pool.peek(species)?.clip)return null;
  const entry=entries[species],sequence=entry?.sequences.find(s=>s.name===originalAction(kind));
  if(!sequence)return null;
  return{durationMs:sequence.frames/entry.frameRate*1000,hitMs:sequence.hitFrame>=0?sequence.hitFrame/entry.frameRate*1000:null};
}

/** Decode the atlas again from its compressed bytes after a large atlas gave up its CPU pixels. */
async function ensureBitmap(asset:Asset){
  if(asset.clip.atlas.width)return;
  if(!asset.rehydrating){
    diagnostics.rehydrations++;
    asset.rehydrating=createImageBitmap(asset.atlasBlob,{premultiplyAlpha:'none'}).then(bitmap=>{asset.clip.atlas=bitmap;}).finally(()=>{asset.rehydrating=undefined;});
  }
  await asset.rehydrating;
}

/** Retain before await; release only after the owner's renderer is destroyed. */
export function retainBattleAnimation(species:number):RetainedBattleAnimation{
  const lease=entries[species]?pool.acquire(species):null;
  let privateBitmap:ImageBitmap|null=null;
  const dropPrivate=()=>{if(!privateBitmap)return;privateBitmap.close();transientBitmaps.delete(privateBitmap);privateBitmap=null;};
  return{
    async prepareForMount(){
      if(!lease||lease.released)return null;
      const asset=await lease.resource;
      if(!asset||lease.released)return null;
      // This extra hold protects asynchronous bitmap cloning even if React cancels its owner.
      const hold=pool.acquire(species);
      try{
        await ensureBitmap(asset);
        if(lease.released)return null;
        const large=isLarge(asset.clip);
        if(large){privateBitmap=await createImageBitmap(asset.clip.atlas,{premultiplyAlpha:'none'});transientBitmaps.add(privateBitmap);diagnostics.atlasCopies++;}
        if(lease.released){dropPrivate();return null;}
        return{clip:privateBitmap?{...asset.clip,atlas:privateBitmap}:asset.clip,releasePixelsAfterUpload:large};
      }finally{hold.release();}
    },
    uploaded(){if(privateBitmap)transientBitmaps.delete(privateBitmap);lease?.uploaded();},
    release(options){dropPrivate();lease?.release(options);},
  };
}

/** Entry preload is cancellable; unused ready clips have a 32 MiB idle byte budget. */
export async function preloadBattleAnimations(species:number[],options:{signal?:AbortSignal}={}){
  const warmed:number[]=[];
  try{
    for(const id of [...new Set(species)].slice(0,PRELOAD_LIMIT)){
      options.signal?.throwIfAborted();
      if(!entries[id])continue;
      const lease=pool.acquire(id);
      try{
        await waitForClipLease(lease,options.signal);
        options.signal?.throwIfAborted();
        lease.uploaded();lease.release({warm:true});warmed.push(id);
      }finally{if(!lease.released)lease.release();}
    }
  }catch(error){for(const id of warmed)pool.dropIdle(id);throw error;}
}

export function clearIdleBattleAnimations(){pool.clearIdle();}

/** Read-only diagnostics for browser QA and benchmarks; no global or product UI. */
export function getBattleAnimationRuntimeStats(){
  const state=pool.snapshot(),assets=state.entries.map(row=>pool.peek(row.species)).filter((x):x is Asset=>!!x);
  const sum=(bytes:(asset:Asset)=>number)=>assets.reduce((n,asset)=>n+bytes(asset),0);
  return{...state,...diagnostics,
    cpuBitmapBytes:sum(asset=>bitmapBytes(asset.clip.atlas)),geometryBytes:sum(asset=>asset.geometryBytes),compressedAtlasBytes:sum(asset=>asset.atlasBlob.size),
    transientBitmapBytes:[...transientBitmaps].reduce((n,bitmap)=>n+bitmapBytes(bitmap),0),clock:battleRuntimeClock.snapshot()};
}
