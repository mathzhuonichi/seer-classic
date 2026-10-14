/** Adversarial lifecycle transactions using production pool/clock and original PlaybackClock. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {PlaybackClock} from '../../node_modules/@seer-pet-anim/anim-export/dist/playback.js';
const module=async path=>import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(readFileSync(path,'utf8'))).toString('base64'));
const {createBattleClipPool,waitForClipLease}=await module('src/presentation/battle-clip-pool.ts');
const {createBattleRuntimeClock}=await module('src/presentation/battle-runtime-clock.ts');
const deferred=()=>{let resolve;return{promise:new Promise(done=>{resolve=done}),resolve:value=>resolve(value)};};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
let disposed=0,loads=0,concurrent=0,peakConcurrent=0;
const gate=deferred();
const pool=createBattleClipPool({load:async(id,signal)=>{loads++;concurrent++;peakConcurrent=Math.max(peakConcurrent,concurrent);await gate.promise;concurrent--;return{id,cpu:256*1024*1024,geometry:1024};},dispose:()=>disposed++,bytes:a=>a.cpu+a.geometry,onOwnership:(a,pending)=>{if(!pending)a.cpu=0;},maxIdleEntries:2,maxIdleBytes:4096,idleMs:20});
const first=pool.acquire(502),second=pool.acquire(502);await flush();assert.equal(loads,1);gate.resolve();const asset=await first.resource;assert.equal(await second.resource,asset);first.uploaded();assert.equal(asset.cpu,256*1024*1024,'second owner still needs original bitmap');second.uploaded();assert.equal(asset.cpu,0,'all uploaded owners release large CPU pixels');first.release();assert.equal(disposed,0);second.release({warm:true});assert.equal(pool.snapshot().idle,1);const reused=pool.acquire(502);assert.equal(await reused.resource,asset);reused.release();assert.equal(disposed,1);assert.equal(pool.snapshot().resources,0);
// Cancelling a preload must settle immediately while a mounted owner keeps its load alive.
const sharedGate=deferred();let sharedSignal;
const shared=createBattleClipPool({load:async(_id,signal)=>{sharedSignal=signal;return await sharedGate.promise;},dispose(){},bytes:()=>1});
const mountedOwner=shared.acquire(431),preloader=shared.acquire(431),abort=new AbortController();
const interrupted=waitForClipLease(preloader,abort.signal);await flush();abort.abort();await assert.rejects(interrupted,error=>error.name==='AbortError');assert.equal(sharedSignal.aborted,false);sharedGate.resolve({id:431});assert.equal((await mountedOwner.resource).id,431);mountedOwner.release();assert.equal(shared.snapshot().resources,0);
// Cancellation before dispatch performs no load, even during repeated navigation.
const cancelled=createBattleClipPool({load:async()=>{throw Error('must not load');},dispose(){},bytes:()=>1});for(let i=0;i<1000;i++){const lease=cancelled.acquire(i);lease.release();}await flush();assert.equal(cancelled.snapshot().loads,0);assert.equal(cancelled.snapshot().pending,0);
// A cancelled decoder that ignores AbortSignal must not delete a newer same-species slot.
const late=deferred();let calls=0,staleDisposed=0;
const race=createBattleClipPool({load:async()=>{calls++;return calls===1?await late.promise:{token:'new'};},dispose:()=>staleDisposed++,bytes:()=>1});const obsolete=race.acquire(70);await flush();obsolete.release();assert.equal(await obsolete.resource,null);const replacement=race.acquire(70);late.resolve({token:'obsolete'});assert.equal((await replacement.resource).token,'new');assert.equal(race.peek(70).token,'new');assert.equal(staleDisposed,1);replacement.release();assert.equal(race.snapshot().resources,0);
// Byte limits evict idle entries but never a resource owned by a mounted combatant.
const budget=createBattleClipPool({load:async id=>({id}),dispose(){},bytes:()=>3,maxIdleEntries:2,maxIdleBytes:5,idleMs:20});const mounted=budget.acquire(1);await mounted.resource;for(let id=2;id<20;id++){const lease=budget.acquire(id);await lease.resource;lease.release({warm:true});assert.ok(budget.snapshot().idle<=1);assert.ok(budget.peek(1));}mounted.release();budget.clearIdle();assert.equal(budget.snapshot().resources,0);
// Advance two independent original clocks for ten seconds at a simulated 60 Hz.
let now=0,callback,id=0,draws=0;const scheduler=createBattleRuntimeClock(cb=>{callback=cb;return++id;},()=>{callback=undefined;},()=>now);
const markerRecords=[];
function player(){const clock=new PlaybackClock();clock.select({name:'attack',duration:75/24,playable:true,markers:[{name:'action_hit',time:22/24},{name:'action_end',time:74/24}]});clock.loop=true;clock.playing=true;clock.subscribe(event=>markerRecords.push(event));return{advance:dt=>clock.advance(dt),draw:()=>draws++,getFrameIndex:()=>Math.min(74,Math.floor(clock.time*24+1e-9)),subscribe:fn=>clock.subscribe(fn)};}
const a=scheduler.attach(player()),b=scheduler.attach(player());a.running(true);b.running(true);for(let frame=1;frame<=600;frame++){now=frame*1000/60;const next=callback;assert.ok(next);next(now);}const clockStats=scheduler.snapshot();assert.ok(draws<=480&&draws>=470,`source fps draws ${draws}`);assert.ok(markerRecords.filter(e=>e.marker?.name==='action_hit').length>=6);a.destroy();b.destroy();assert.equal(scheduler.snapshot().players,0);assert.equal(scheduler.snapshot().scheduled,false);
const report={pool:pool.snapshot(),cancelled:cancelled.snapshot(),race:race.snapshot(),budget:budget.snapshot(),clock:clockStats,simulatedSeconds:10,vendorBaselineMinimumDraws:1200,sourceAwareDraws:draws,drawReductionAgainstBaseline:1-draws/1200,markerRecords:markerRecords.length,peakConcurrent};mkdirSync('artifacts/battle-runtime-v22',{recursive:true});writeFileSync('artifacts/battle-runtime-v22/lifecycle-benchmark.json',JSON.stringify(report,null,2)+'\n');
console.log(`Lifecycle passed: 1000 cancellations; shared ownership; stale-load race; idle byte limits; ${draws} draws/10s for two original24fps clocks; all leases/RAF cleaned.`);
