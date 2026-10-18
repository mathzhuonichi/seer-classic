import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGame,loadCatalog} from '../../src/game.ts';
import type {CatalogData} from '../../src/mechanics/catalog.ts';
import {readLocalSave,UNREADABLE_SAVE_PREFIX,writeLocalSave} from '../../src/mechanics/persistence.ts';

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
