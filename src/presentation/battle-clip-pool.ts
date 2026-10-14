/** Lease ownership, serialized loading and byte-bounded idle reuse without browser dependencies. */
export interface ClipLease<T>{resource:Promise<T|null>;release(options?:{warm?:boolean}):void;uploaded():void;readonly released:boolean}
interface Slot<T>{id:number;status:'queued'|'loading'|'ready';value:T|null;controller:AbortController;owners:Set<{uploaded:boolean}>;promise:Promise<T|null>;resolve:(value:T|null)=>void;timer?:ReturnType<typeof setTimeout>;used:number}
export function createBattleClipPool<T>(options:{load:(id:number,signal:AbortSignal)=>Promise<T>;dispose:(value:T)=>void;bytes:(value:T)=>number;onOwnership?:(value:T,unuploaded:number)=>void;maxIdleEntries?:number;maxIdleBytes?:number;idleMs?:number}){
  const slots=new Map<number,Slot<T>>(),queue:Slot<T>[]=[];let loading=0,serial=0;
  const totals={loads:0,hits:0,aborts:0,failures:0,disposed:0,peakBytes:0};
  const bytes=()=>[...slots.values()].reduce((sum,s)=>sum+(s.value?options.bytes(s.value):0),0);
  const ownership=(slot:Slot<T>)=>{if(slot.value)options.onOwnership?.(slot.value,[...slot.owners].filter(owner=>!owner.uploaded).length);};
  function remove(slot:Slot<T>){if(slots.get(slot.id)!==slot)return;slots.delete(slot.id);clearTimeout(slot.timer);if(slot.status!=='ready'){slot.controller.abort();totals.aborts++;slot.resolve(null);}if(slot.value){options.dispose(slot.value);slot.value=null;totals.disposed++;}}
  function trim(){const idle=[...slots.values()].filter(s=>!s.owners.size&&s.status==='ready').sort((a,b)=>a.used-b.used);let size=idle.reduce((n,s)=>n+options.bytes(s.value!),0);while(idle.length>(options.maxIdleEntries??2)||size>(options.maxIdleBytes??32*1024*1024)){const slot=idle.shift()!;size-=options.bytes(slot.value!);remove(slot);}}
  async function pump(){if(loading)return;let slot:Slot<T>|undefined;while((slot=queue.shift()))if(slots.get(slot.id)===slot&&!slot.controller.signal.aborted)break;if(!slot)return;
    loading=1;slot.status='loading';totals.loads++;
    try{const value=await options.load(slot.id,slot.controller.signal);if(slot.controller.signal.aborted||slots.get(slot.id)!==slot){options.dispose(value);totals.disposed++;slot.resolve(null);}else{slot.value=value;slot.status='ready';ownership(slot);totals.peakBytes=Math.max(totals.peakBytes,bytes());slot.resolve(value);if(!slot.owners.size)remove(slot);}}
    catch{if(!slot.controller.signal.aborted)totals.failures++;if(slots.get(slot.id)===slot)slots.delete(slot.id);slot.resolve(null);}
    finally{loading=0;void pump();}}
  function acquire(id:number):ClipLease<T>{let slot=slots.get(id);if(slot){totals.hits++;clearTimeout(slot.timer);}else{let resolve!:(value:T|null)=>void;const promise=new Promise<T|null>(done=>{resolve=done;});slot={id,status:'queued',value:null,controller:new AbortController(),owners:new Set(),promise,resolve,used:++serial};slots.set(id,slot);queue.push(slot);queueMicrotask(()=>void pump());}
    const active=slot,owner={uploaded:false};active.owners.add(owner);active.used=++serial;let released=false;
    return{resource:active.promise,get released(){return released;},uploaded(){if(released)return;owner.uploaded=true;ownership(active);},release({warm=false}={}){if(released)return;released=true;active.owners.delete(owner);ownership(active);if(active.owners.size)return;if(active.status!=='ready'||!warm){remove(active);return;}active.used=++serial;active.timer=setTimeout(()=>{if(!active.owners.size)remove(active);},options.idleMs??15000);trim();}};
  }
  return{acquire,dropIdle(id:number){const slot=slots.get(id);if(slot&&!slot.owners.size)remove(slot);},peek:(id:number)=>slots.get(id)?.value??null,clearIdle(){for(const slot of slots.values())if(!slot.owners.size)remove(slot);},snapshot(){const values=[...slots.values()];return{...totals,pending:values.filter(s=>s.status!=='ready').length,queue:values.filter(s=>s.status==='queued').length,loading,resources:values.length,leases:values.reduce((n,s)=>n+s.owners.size,0),idle:values.filter(s=>!s.owners.size).length,residentBytes:bytes(),entries:values.map(s=>({species:s.id,status:s.status,leases:s.owners.size,bytes:s.value?options.bytes(s.value):0}))};}};
}
/** Cancel this caller promptly without aborting a different owner's shared request. */
export async function waitForClipLease<T>(lease:ClipLease<T>,signal?:AbortSignal):Promise<T|null>{
  if(!signal)return lease.resource;
  if(signal.aborted){lease.release();signal.throwIfAborted();}
  let abort!:()=>void;
  const cancelled=new Promise<never>((_resolve,reject)=>{abort=()=>{lease.release();reject(signal.reason??new DOMException('Animation preload cancelled','AbortError'));};signal.addEventListener('abort',abort,{once:true});});
  try{return await Promise.race([lease.resource,cancelled]);}finally{signal.removeEventListener('abort',abort);}
}
