/** An image that has neither loaded nor failed by then counts as failed. */
const IMAGE_TIMEOUT_MS=20000;
const unavailable=()=>new Error('战斗资源暂时无法载入，请重试。');

/** Load-gate work is cancellable so leaving a battle cannot update a later scene. */
export function waitForBattleLoad(milliseconds:number,signal:AbortSignal):Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(signal.reason);};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},milliseconds);
    signal.addEventListener('abort',abort,{once:true});
  });
}

/** Load and decode one image; an abort drops its request. */
function loadImage(src:string,signal:AbortSignal):Promise<void> {
  return new Promise<void>((resolve,reject)=>{
    signal.throwIfAborted();
    const image=new Image();
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);image.onload=null;image.onerror=null;};
    const fail=(error:unknown)=>{cleanup();reject(error);};
    const abort=()=>{image.removeAttribute('src');fail(signal.reason);};
    const timer=setTimeout(()=>fail(unavailable()),IMAGE_TIMEOUT_MS);
    signal.addEventListener('abort',abort,{once:true});
    image.onerror=()=>fail(unavailable());
    image.onload=()=>{void image.decode().then(()=>{signal.throwIfAborted();cleanup();resolve();}).catch(fail);};
    image.src=src;
  });
}

/** Decode every distinct image; the first failure cancels the rest. */
export async function preloadBattleImages(sources:string[],signal:AbortSignal,onProgress:(loaded:number,total:number)=>void):Promise<void> {
  const unique=[...new Set(sources)];let loaded=0;
  signal.throwIfAborted();
  const group=new AbortController(),abortGroup=()=>group.abort(signal.reason);
  signal.addEventListener('abort',abortGroup,{once:true});
  try{await Promise.all(unique.map(src=>loadImage(src,group.signal).then(()=>onProgress(++loaded,unique.length))));}
  catch(error){group.abort(error);throw error;}
  finally{signal.removeEventListener('abort',abortGroup);}
}
