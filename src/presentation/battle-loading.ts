/** Load-gate work is cancellable so leaving a battle cannot update a later scene. */
export function waitForBattleLoad(milliseconds:number,signal:AbortSignal):Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(signal.reason);};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},milliseconds);
    signal.addEventListener('abort',abort,{once:true});
  });
}

export async function preloadBattleImages(sources:string[],signal:AbortSignal,onProgress:(loaded:number,total:number)=>void):Promise<void> {
  const unique=[...new Set(sources)];let loaded=0;
  signal.throwIfAborted();
  const group=new AbortController(),abortGroup=()=>group.abort(signal.reason);
  signal.addEventListener('abort',abortGroup,{once:true});
  const pendingSignal=group.signal;
  try{await Promise.all(unique.map(src=>new Promise<void>((resolve,reject)=>{
    pendingSignal.throwIfAborted();
    const image=new Image();
    const cleanup=()=>{clearTimeout(timer);pendingSignal.removeEventListener('abort',abort);image.onload=null;image.onerror=null;};
    const fail=(error:unknown)=>{cleanup();reject(error);};
    const abort=()=>{image.removeAttribute('src');fail(pendingSignal.reason);};
    const timer=setTimeout(()=>fail(new Error('战斗资源暂时无法载入，请重试。')),20000);
    pendingSignal.addEventListener('abort',abort,{once:true});
    image.onerror=()=>fail(new Error('战斗资源暂时无法载入，请重试。'));
    image.onload=()=>{void image.decode().then(()=>{
      pendingSignal.throwIfAborted();cleanup();onProgress(++loaded,unique.length);resolve();
    }).catch(fail);};
    image.src=src;
  })));}catch(error){group.abort(error);throw error;}
  finally{signal.removeEventListener('abort',abortGroup);}
}
