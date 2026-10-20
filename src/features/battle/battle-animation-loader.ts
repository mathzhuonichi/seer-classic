// Fetch and decode one species' original clip, preferring an accepted HD repack.
import type {SwfClipData,SwfClipJson} from '@seer-pet-anim/swf-bundle';
import {decodeOfflineBattleClip} from './battle-offline-clip.ts';

export interface BattleAnimationAssetEntry {
  meta:string;
  atlas:string;
  atlasWidth:number;
  atlasHeight:number;
  /** Offline provenance hashes; transport may transparently decompress metadata. */
  metaSha256?:string;
  atlasSha256?:string;
}
type Loaded={clip:SwfClipData;atlasBlob:Blob;usedHd:boolean;fellBack:boolean};

/** Fetch already decodes Content-Encoding; static portable servers may send raw gzip.
 * Inspect the actual response bytes so either transport decodes exactly once.
 */
export async function decodeBattleAnimationResponse(response:Response):Promise<SwfClipJson>{
  if(!response.ok)throw Error('Unavailable timeline');
  const bytes=new Uint8Array(await response.arrayBuffer());
  const compressed=bytes[0]===0x1f&&bytes[1]===0x8b;
  return compressed
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json() as SwfClipJson
    : JSON.parse(new TextDecoder().decode(bytes)) as SwfClipJson;
}

function validHdEntry(entry:unknown):entry is BattleAnimationAssetEntry {
  if(!entry||typeof entry!=='object')return false;
  const value=entry as Partial<BattleAnimationAssetEntry>;
  return typeof value.meta==='string'&&value.meta.startsWith('/battle-animations/hd/')&&
    typeof value.atlas==='string'&&value.atlas.startsWith('/battle-animations/hd/')&&
    [value.atlasWidth,value.atlasHeight].every(size=>typeof size==='number'&&Number.isSafeInteger(size)&&size>0&&size<=8192);
}

async function loadEntry(species:number,entry:BattleAnimationAssetEntry,signal:AbortSignal){
  signal.throwIfAborted();
  // Abort the sibling fetch when one request fails. This controller belongs to
  // one attempt; it must never abort a different owner's shared pool request.
  const attempt=new AbortController(),abort=()=>attempt.abort(signal.reason);
  signal.addEventListener('abort',abort,{once:true});
  let bitmap:ImageBitmap|undefined;
  try{
    const [meta,atlasBlob]=await Promise.all([
      fetch(entry.meta,{signal:attempt.signal}).then(decodeBattleAnimationResponse),
      fetch(entry.atlas,{signal:attempt.signal}).then(response=>{if(!response.ok)throw Error('Unavailable atlas');return response.blob();}),
    ]);
    signal.throwIfAborted();
    bitmap=await createImageBitmap(atlasBlob,{premultiplyAlpha:'none'});
    signal.throwIfAborted();
    const clip=decodeOfflineBattleClip(meta,bitmap,{species,width:entry.atlasWidth,height:entry.atlasHeight});
    return {clip,atlasBlob};
  }catch(error){
    bitmap?.close();
    signal.throwIfAborted();
    throw error;
  }finally{
    attempt.abort();
    signal.removeEventListener('abort',abort);
  }
}

/** An accepted HD entry is optional. Failed attempts release pixels before fallback. */
export async function loadBattleAnimation(species:number,original:BattleAnimationAssetEntry,hd:unknown,signal:AbortSignal):Promise<Loaded>{
  signal.throwIfAborted();
  if(validHdEntry(hd)){
    try{return {...await loadEntry(species,hd,signal),usedHd:true,fellBack:false};}
    catch(error){
      signal.throwIfAborted();
      // Browser/decode cancellation must not become an original-asset retry.
      if(error&&typeof error==='object'&&'name' in error&&error.name==='AbortError')throw error;
    }
  }
  return {...await loadEntry(species,original,signal),usedHd:false,fellBack:hd!==undefined};
}
