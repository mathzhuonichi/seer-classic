import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGame,loadCatalog} from '../../src/kernel/game.ts';
import type {CatalogData} from '../../src/domain/catalog/catalog.ts';
import {readLocalSave,UNREADABLE_SAVE_PREFIX,writeLocalSave} from '../../src/kernel/persistence.ts';

/** Collection caches must follow evolution/import/reset without changing earlier snapshots. */
export async function verifyControllerSnapshots(){
  const catalog=await loadCatalog(),original=JSON.stringify(catalog);
  const game=createGame(catalog,'');
  createGame(catalog,'');
  assert.equal(JSON.stringify(catalog),original,'Controllers must not mutate the shared source catalog.');
  const initial=game.snapshot(),initialSave=game.exportSave(),species=initial.species;
  game.dispatch({type:'heal'});game.dispatch({type:'dismissNotice'});
  assert.equal(game.snapshot().species,species,'Unchanged collection reuses its catalog view.');
  game.dispatch({type:'cheatAcquire',species:19,level:100});
  const infant=game.snapshot(),uid=infant.monsters.find(mon=>mon.species===19)!.uid;
  assert(infant.species.find(row=>row.id===19)!.owned);
  assert(!initial.species.find(row=>row.id===19)!.owned,'Earlier snapshot remains unowned.');
  game.dispatch({type:'evolve',uid});
  const middle=game.snapshot();assert(middle.species.find(row=>row.id===20)!.owned);
  assert(!infant.species.find(row=>row.id===20)!.owned);
  game.dispatch({type:'evolve',uid});assert(game.snapshot().species.find(row=>row.id===21)!.owned);
  game.importSave(initialSave);
  assert(!game.snapshot().species.find(row=>row.id===19)!.owned,'Import can remove collection entries.');
  game.dispatch({type:'startBattle',bossId:'boss_spt_liaosi'});
  if(game.snapshot().battle){game.dispatch({type:'flee'});game.dispatch({type:'closeBattle'});}
  game.reset();
  assert(!game.snapshot().species.find(row=>row.id===20)!.owned,'Reset invalidates collection and challenge caches.');
  assert.equal(new Set(catalog.items.map(item=>item.id)).size,catalog.items.length,'Source item IDs remain unique.');
  const output={checks:['catalog ownership across controllers','unchanged catalog identity','explicit acquisition ownership','two forward evolutions and immutable earlier views','save import removes owned forms','reset invalidates derived views'],catalogSpecies:catalog.species.length,sourceItems:catalog.items.length};
  fs.mkdirSync('artifacts/battle-media-v22',{recursive:true});
  fs.writeFileSync('artifacts/battle-media-v22/controller-snapshots.json',JSON.stringify(output,null,2)+'\n');
  return output;
}

/** Unchanged slices and rows keep their identity, so screens that select them skip rendering (architecture-v2 §5). */
export async function verifySnapshotIdentity(){
  const game=createGame(await loadCatalog(),'');
  game.dispatch({type:'dismissNotice'});
  const settled=game.snapshot();
  game.dispatch({type:'dismissNotice'});
  assert.equal(game.snapshot(),settled,'An action that changes nothing returns the same snapshot.');
  const [first,second]=settled.monsters;
  game.dispatch({type:'rename',uid:first.uid,name:'Identity'});
  const renamed=game.snapshot();
  assert.equal(renamed.monsters.find(mon=>mon.uid===first.uid)!.name,'Identity');
  assert.notEqual(renamed.monsters,settled.monsters,'The changed slice is new.');
  assert.equal(renamed.monsters.find(mon=>mon.uid===second.uid),second,'An unchanged row keeps its identity.');
  for(const key of ['party','campaigns','braveTower','facilities','bosses','species','quests','items','shopItems','natures','traits'] as const)
    assert.equal(renamed[key],settled[key],`Unchanged slice ${key} keeps its identity.`);
  return {checks:['no-op action keeps the snapshot','changed slice is new','unchanged rows and slices keep identity']};
}

/** Budget: a non-battle action, its snapshot and the save write take at most 4 ms at the 95th percentile (architecture-v2 §2). */
export async function verifyDispatchBudget(){
  const game=createGame(await loadCatalog(),''),uid=game.snapshot().monsters[0].uid,times:number[]=[];
  for(let i=0;i<240;i++){
    const started=performance.now();
    game.dispatch(i%2?{type:'rename',uid,name:`Budget${i%7}`}:{type:'dismissNotice'});
    if(i>=40)times.push(performance.now()-started);
  }
  times.sort((a,b)=>a-b);
  const p95=times[Math.floor(times.length*0.95)];
  assert(p95<=4,`Dispatch p95 ${p95.toFixed(2)} ms exceeds the 4 ms budget.`);
  return {p50:times[times.length>>1],p95};
}

/** An unreadable stored save is backed up before a new journey replaces it; version-1 repairs run once, on load. */
export async function verifyControllerSaveRecovery(){
  const catalog=await loadCatalog(),memory=new Map<string,string>();
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const storage={getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>{memory.set(key,String(value));},removeItem:(key:string)=>{memory.delete(key);}};
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
  try{
    writeLocalSave('{"version":99}');
    const game=createGame(catalog);
    assert.deepEqual(game.snapshot().notices,['旧存档无法读取，已创建新存档。']);
    const backups=[...memory.keys()].filter(key=>key.startsWith(UNREADABLE_SAVE_PREFIX));
    assert.deepEqual(backups.map(key=>memory.get(key)),['{"version":99}'],'The unreadable save is kept under its own key.');
    assert.equal(readLocalSave(),game.exportSave(),'The new journey is written under the save key.');
    // Without room for a backup, progress stays in memory until the player replaces the save explicitly.
    memory.clear();writeLocalSave('{"version":99}');
    storage.setItem=(key:string,value:string)=>{if(key.startsWith(UNREADABLE_SAVE_PREFIX))throw new Error('QuotaExceededError');memory.set(key,String(value));};
    const unsaved=createGame(catalog);
    assert.equal(unsaved.snapshot().notices.length,1);assert.notEqual(unsaved.snapshot().notices[0],'旧存档无法读取，已创建新存档。');
    unsaved.dispatch({type:'heal'});assert.equal(readLocalSave(),'{"version":99}','The unreadable save is never overwritten.');
    unsaved.reset();assert.equal(readLocalSave(),unsaved.exportSave(),'A new journey chosen by the player replaces it.');
    storage.setItem=(key:string,value:string)=>{memory.set(key,String(value));};
    const quest=game.snapshot().quests.find(row=>row.group==='spt-recruitment')!;
    const legacy=JSON.parse(game.exportSave());
    delete legacy.items.item_status_cure;legacy.game.quests=[quest.id];legacy.game.recruitmentClaims={};legacy.game.shopUnlocked=[];
    const migrated=JSON.parse(createGame(catalog,JSON.stringify({...legacy,version:1})).exportSave());
    assert.equal(migrated.version,2);assert.equal(migrated.items.item_status_cure,5);
    assert.equal(migrated.game.recruitmentClaims[quest.id],1);assert(migrated.game.shopUnlocked.includes(quest.rewardItemId));
    const current=JSON.parse(createGame(catalog,JSON.stringify(legacy)).exportSave());
    assert.equal(current.items.item_status_cure,undefined,'A current save is not granted the version-1 supply again.');
    assert.deepEqual(current.game.recruitmentClaims,{},'A current save is not repaired again.');
    const output={checks:['unreadable save backed up','new journey written','unbackable save kept in memory only','version-1 supply granted once','version-1 recruitment claims repaired once']};
    fs.mkdirSync('artifacts/battle-media-v22',{recursive:true});
    fs.writeFileSync('artifacts/battle-media-v22/controller-save-recovery.json',JSON.stringify(output,null,2)+'\n');
    return output;
  }finally{
    if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete (globalThis as {localStorage?:unknown}).localStorage;
  }
}
