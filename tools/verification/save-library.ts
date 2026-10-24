/**
 * The save library (design/notes/save-slots-2026-10-24.md) on a memory backend: the pre-slot save opens as the active slot, a new
 * save and an import go into new slots and leave the others as they were, loading a slot rebuilds the game from that slot's save
 * alone and is refused while a battle is open, an unreadable slot is kept, listed and never written, and a collection of 3000
 * monsters is written and opened again.
 */
import assert from 'node:assert/strict';
import {Rng} from '../../battle/core/src/index.ts';
import {addMonster,createMonster} from '../../raising/core/index.ts';
import {loadCatalog,type CatalogData} from '../../src/domain/catalog/catalog.ts';
import {STARTING_COINS} from '../../src/domain/economy.ts';
import {rollTrait} from '../../src/kernel/acquire.ts';
import {createGameContext} from '../../src/kernel/context.ts';
import {createGame} from '../../src/kernel/game.ts';
import {LEGACY_SAVE_KEY,saveWriteProblem} from '../../src/kernel/persistence.ts';
import {openSaveLibrary,SWITCH_IN_BATTLE,type SaveLibrary} from '../../src/kernel/save-library.ts';
import {startJourney} from '../../src/kernel/save-state.ts';
import {openSlotStore,type SlotBackend} from '../../src/kernel/save-slots.ts';
import {serialize,SAVE_VERSION} from '../../src/kernel/save.ts';
import {memoryBackend} from '../../src/kernel/slot-backends.ts';
import {memoryStorage} from './_harness.mjs';

/** Resolves once the slot writes started so far have settled: the memory backend settles them in microtasks. */
const settled=()=>new Promise(resolve=>setImmediate(resolve));
const LARGE_COLLECTION=3000;
const MAX_LEVEL=100;

async function open(catalog:CatalogData,backend:SlotBackend=memoryBackend()){
  const store=await openSlotStore(backend),saves=await openSaveLibrary(catalog,store,{idle:()=>{}});
  return {store,saves,backend};
}
const game=(saves:SaveLibrary)=>saves.current().game;
const slotNamed=(saves:SaveLibrary,name:string)=>saves.slots().find(slot=>slot.name===name)!;
/** A settled save with `coins`, its lead named `name`. */
function savedJourney(catalog:CatalogData,coins:number,name:string){
  const journey=createGame(catalog,''),lead=journey.snapshot().party[0];
  journey.dispatch({type:'cheatResources',coins});journey.dispatch({type:'rename',uid:lead,name});
  return journey.exportSave();
}
const names=(saves:SaveLibrary)=>game(saves).snapshot().monsters.map(mon=>mon.name);

/** The pre-slot save opens as the active 存档 1 with no notice; its slot holds the same save, and local storage is untouched. */
export async function verifyLegacyAdoption(){
  const catalog=await loadCatalog(),legacy=savedJourney(catalog,4321,'Legacy'),memory=memoryStorage({[LEGACY_SAVE_KEY]:legacy});
  const {store,saves}=await open(catalog);await settled();
  assert.deepEqual(saves.slots().map(slot=>[slot.name,slot.unreadable]),[['存档 1',null]]);
  assert.equal(saves.current().slotId,store.activeId());
  assert.deepEqual(game(saves).snapshot().notices,[]);assert.equal(game(saves).snapshot().coins,4321);
  assert.equal(await store.read(store.activeId()!),legacy,'A current save is stored unchanged.');
  assert.deepEqual(saves.slots()[0].summary,{monsters:3,topLevel:5,owned:3,cleared:0});
  assert.deepEqual([...memory],[[LEGACY_SAVE_KEY,legacy]],'The pre-slot key stays as it was.');
  return {checks:['pre-slot save active as 存档 1','stored unchanged','summary written','local storage untouched']};
}

/**
 * 新存档 starts a new journey in a new slot and keeps the first; 读取 rebuilds the game from the slot's save alone, survives a
 * reload as the active slot, and is refused, like 新存档 and an import, while a battle is open.
 */
export async function verifyNewSaveAndLoad(){
  const catalog=await loadCatalog();
  memoryStorage({[LEGACY_SAVE_KEY]:savedJourney(catalog,4321,'Kept')});
  const {store,saves,backend}=await open(catalog),first=saves.current();await settled();
  const firstText=await store.read(first.slotId!);
  await saves.newSave();
  const second=saves.current();
  assert.notEqual(second.game,first.game);assert.equal(second.serial,first.serial+1);
  assert.deepEqual(saves.slots().map(slot=>slot.name),['存档 1','存档 2']);assert.equal(store.activeId(),second.slotId);
  assert.deepEqual(game(saves).snapshot().notices,['新存档「存档 2」已开始。']);
  assert.equal(game(saves).snapshot().coins,STARTING_COINS);assert(!names(saves).includes('Kept'));
  game(saves).dispatch({type:'rename',uid:game(saves).snapshot().party[0],name:'Second'});await settled();
  assert.equal(await store.read(first.slotId!),firstText,'The first slot keeps its save.');
  await saves.load(first.slotId!);await settled();
  const {notices,...loaded}=game(saves).snapshot(),{notices:fresh,...rebuilt}=createGame(catalog,firstText!).snapshot();
  assert.deepEqual(notices,['已读取「存档 1」。']);assert.deepEqual(fresh,[]);
  assert.deepEqual(loaded,rebuilt,'The loaded game is the first slot\'s save alone.');
  assert(names(saves).includes('Kept')&&!names(saves).includes('Second'));
  assert(JSON.parse((await store.read(second.slotId!))!).storage.some((mon:{nickname:string|null})=>mon.nickname==='Second'));
  const reopened=await open(catalog,backend);
  assert.equal(reopened.saves.current().slotId,first.slotId,'A reload opens the slot loaded last.');assert.equal(game(reopened.saves).snapshot().coins,4321);
  game(saves).dispatch({type:'startTraining',species:10,level:3});assert(game(saves).snapshot().battle,'A training battle starts.');
  for(const refused of [()=>saves.load(second.slotId!),()=>saves.newSave(),()=>saves.importSave(firstText!)]){
    await assert.rejects(refused(),{message:SWITCH_IN_BATTLE});
  }
  game(saves).dispatch({type:'flee'});game(saves).dispatch({type:'closeBattle'});
  await saves.load(second.slotId!);assert(names(saves).includes('Second'));
  return {checks:['new save in a new slot','first slot kept','load rebuilds from the slot alone','active slot survives a reload','no switch in battle']};
}

/**
 * An unreadable active slot is kept, listed with its reason and never written; a new journey opens in a new slot. Loading an
 * unreadable slot is refused and keeps the game; an emptied pre-slot save is unreadable, not absent; an import that cannot be read
 * changes nothing; when storage refuses the new slot, the journey stays in memory and the refusal is reported.
 */
export async function verifyUnreadableSlots(){
  const catalog=await loadCatalog(),newer='{"version":99}';
  memoryStorage({[LEGACY_SAVE_KEY]:newer});
  const {store,saves}=await open(catalog),kept=slotNamed(saves,'存档 1');
  const reason=`来自更新版本的游戏（存档格式 99，本游戏为 ${SAVE_VERSION}）`;
  assert.deepEqual(game(saves).snapshot().notices,[`「存档 1」${reason}，已原样保留，可在设置中导出；已开始新存档「存档 2」。`]);
  assert.equal(kept.unreadable,reason);assert.equal(saves.current().slotId,slotNamed(saves,'存档 2').id);
  game(saves).dispatch({type:'heal'});await settled();
  assert.equal(await store.read(kept.id),newer,'The unreadable save is never written.');assert.equal(await saves.exportSlot(kept.id),newer);
  const serial=saves.current().serial;
  await assert.rejects(saves.load(kept.id),{message:`「存档 1」${reason}。`});
  assert.equal(saves.current().serial,serial,'The game stays.');
  await assert.rejects(saves.importSave('{"version":5,"party"'));assert.equal(saves.slots().length,2,'An unreadable import adds no slot.');
  memoryStorage({[LEGACY_SAVE_KEY]:''});
  const emptied=['「存档 1」无法读取，已原样保留，可在设置中导出；已开始新存档「存档 2」。'];
  assert.deepEqual(game((await open(catalog)).saves).snapshot().notices,emptied);
  memoryStorage({[LEGACY_SAVE_KEY]:newer});
  // Storage that refuses every new slot (a change that sets the active slot).
  const inner=memoryBackend(),refusal=()=>Promise.reject(new DOMException('','QuotaExceededError'));
  const full:SlotBackend={...inner,apply:change=>change.active?refusal():inner.apply(change)};
  const refused=await open(catalog,full);
  assert.equal(refused.saves.current().slotId,null);assert.equal(saveWriteProblem(),'QuotaExceededError');
  assert.deepEqual(game(refused.saves).snapshot().notices,[`「存档 1」${reason}，已原样保留，可在设置中导出。`]);
  game(refused.saves).dispatch({type:'heal'});await settled();
  assert.equal(await refused.store.read(refused.store.activeId()!),newer);
  return {checks:['unreadable active slot kept and listed','new journey in a new slot','unreadable slot never written','unreadable load refused',
    'unreadable import changes nothing','emptied save unreadable','refused new slot stays in memory']};
}

/** An import opens in a new slot and keeps the others; the active slot cannot be deleted, another can. */
export async function verifyImportAndRemove(){
  const catalog=await loadCatalog();
  memoryStorage();
  const {store,saves}=await open(catalog),first=saves.current().slotId!;await settled();
  assert.deepEqual([saves.slots().map(slot=>slot.name),game(saves).snapshot().notices],[['存档 1'],[]],'A first start opens 存档 1 quietly.');
  const firstText=await store.read(first);
  await saves.importSave(savedJourney(catalog,777,'Imported'));
  assert.deepEqual(saves.slots().map(slot=>slot.name),['存档 1','存档 2']);
  assert.deepEqual(game(saves).snapshot().notices,['存档已导入为「存档 2」。']);assert.equal(game(saves).snapshot().coins,777);
  assert.equal(await store.read(first),firstText);
  await assert.rejects(saves.remove(saves.current().slotId!),{message:'当前存档不能删除。'});
  await saves.remove(first);
  assert.deepEqual(saves.slots().map(slot=>slot.name),['存档 2']);assert.equal(await store.read(first),null);
  return {checks:['import in a new slot','other slots kept','active slot not deleted','other slot deleted']};
}

/** A collection of LARGE_COLLECTION monsters (every fifth at level 100) built with the raising code: its slot is written and loads again. */
export async function verifyLargeSlot(){
  const catalog=await loadCatalog(),ctx=createGameContext(catalog,{idle:()=>{}}),rng=new Rng(7),species=catalog.species.map(row=>Number(row.id));
  let {save}=startJourney(ctx);
  for(let i=0;save.storage.length<LARGE_COLLECTION;i++){
    const level=i%5===4?MAX_LEVEL:1+i*37%MAX_LEVEL,mon=createMonster(ctx.dex,species[Math.floor(i/3)*7919%species.length],level,rng,{how:'wild',at:''});
    save={...addMonster(save,mon),game:save.game} as typeof save;
    rollTrait(ctx,save,rng,mon.uid);
  }
  memoryStorage();
  const {store,saves}=await open(catalog),text=serialize(save);
  await saves.importSave(text);await settled();
  const large=saves.current().slotId!,stored=(await store.read(large))!;
  assert(stored.length>1_000_000,`${stored.length} characters`);
  const owned=JSON.parse(stored).dex.owned.length;
  assert.deepEqual(saves.slots().find(slot=>slot.id===large)!.summary,{monsters:LARGE_COLLECTION,topLevel:MAX_LEVEL,owned,cleared:0});
  await saves.load(slotNamed(saves,'存档 1').id);await saves.load(large);
  assert.equal(game(saves).snapshot().monsters.length,LARGE_COLLECTION);
  return {checks:['large slot written','large slot loads again'],characters:stored.length};
}
