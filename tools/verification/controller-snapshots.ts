import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGame,loadCatalog} from '../../src/kernel/game.ts';
import type {CatalogData} from '../../src/domain/catalog/catalog.ts';
import type {GameAction} from '../../src/kernel/contract.ts';
import {readLocalSave,UNREADABLE_SAVE_PREFIX,writeLocalSave} from '../../src/kernel/persistence.ts';
import {memoryStorage} from './_harness.mjs';

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
  const catalog=await loadCatalog(),game=createGame(catalog,'');
  game.dispatch({type:'dismissNotice'});
  const settled=game.snapshot();
  game.dispatch({type:'dismissNotice'});
  const repeated=game.snapshot();
  assert.equal(repeated,settled,'An action that changes nothing keeps the snapshot object.');
  const [first,second]=settled.monsters;
  game.dispatch({type:'rename',uid:first.uid,name:'Identity'});
  const renamed=game.snapshot();
  assert.equal(renamed.monsters.find(mon=>mon.uid===first.uid)!.name,'Identity');
  assert.notEqual(renamed.monsters,settled.monsters,'The changed slice is new.');
  assert.equal(renamed.monsters.find(mon=>mon.uid===second.uid),second,'An unchanged row keeps its identity.');
  for(const key of ['party','campaigns','braveTower','facilities','bosses','species','quests','items','shopItems','natures','traits','engravingStock'] as const)
    assert.equal(renamed[key],settled[key],`Unchanged slice ${key} keeps its identity.`);
  // A new species rebuilds the quest memo with equal rows, which it then returns on every build: the shared rows stay.
  game.dispatch({type:'cheatAcquire',species:2,level:5});game.dispatch({type:'dismissNotice'});
  assert.equal(game.snapshot().quests,settled.quests,'Quest rows rebuilt equal keep their identity.');
  game.dispatch({type:'cheatAcquire',species:19,level:5});
  const progressed=game.snapshot().quests;
  assert.notEqual(progressed,settled.quests,'Changed quest rows are new.');
  assert.deepEqual(progressed,createGame(catalog,game.exportSave()).snapshot().quests,'Shared quest rows equal a fresh build of the save.');
  const unknown=game.dispatch({type:'noSuchAction'} as unknown as Parameters<typeof game.dispatch>[0]);
  assert.equal(unknown.ok,false,'An unregistered action type is rejected.');
  return {checks:['unregistered action rejected','no-op action keeps the snapshot','changed slice is new','unchanged rows and slices keep identity',
    'memo rebuilt equal keeps the shared rows']};
}

/**
 * Slice builders rebuild rows only when their inputs change (monster rows, quests, recipes). After each step the snapshot equals
 * the one a new controller builds from the exported save, and exactly the monster rows listed as changed are new; `maybe` rows
 * may change either way.
 */
export async function verifySnapshotInputs(){
  const catalog=await loadCatalog(),game=createGame(catalog,''),checks:string[]=[];
  const act=(...actions:GameAction[])=>()=>actions.forEach(action=>{const result=game.dispatch(action);assert(result.ok,`${action.type}: ${result.notice}`);});
  const uids=(species:number)=>game.snapshot().monsters.filter(mon=>mon.species===species).map(mon=>mon.uid);
  const row=(uid:string)=>game.snapshot().monsters.find(mon=>mon.uid===uid)!;
  const step=(label:string,run:()=>void,changed:string[],maybe:string[]=[])=>{
    const before=new Map(game.snapshot().monsters.map(mon=>[mon.uid,mon]));
    run();
    const {notices,...current}=game.snapshot(),{notices:fresh,...rebuilt}=createGame(catalog,game.exportSave()).snapshot();
    assert.deepEqual(current,rebuilt,`${label}: every slice is current.`);
    for(const mon of current.monsters)if(before.has(mon.uid)&&!maybe.includes(mon.uid))
      assert.equal(mon!==before.get(mon.uid),changed.includes(mon.uid),`${label}: ${mon.name} ${changed.includes(mon.uid)?'is new':'keeps its row'}.`);
    checks.push(label);
  };
  act({type:'cheatResources',coins:100000},...[15,15,19,20,20,20,20,20,97,14].map((species):GameAction=>({type:'cheatAcquire',species,level:100})))();
  const [a,b]=uids(15),[m]=uids(19),[c]=uids(20),[x]=uids(14),traitId=game.snapshot().traits.find(trait=>trait.id!==row(a).traitId)!.id;
  step('notice dismissed',act({type:'dismissNotice'}),[]);
  step('rename',act({type:'rename',uid:m,name:'Identity'}),[m]);
  step('party',act({type:'party',uid:m,add:false}),[m]);
  step('trait',act({type:'cheatMonster',uid:a,traitId}),[a]);
  step('engraving stock',act({type:'buyEngraving',engravingId:'10031'},{type:'buyEngraving',engravingId:'10031'}),[]);
  step('equip',act({type:'setEngraving',uid:a,slot:'ability',engravingId:'10031'}),[a]);
  step('second holder',act({type:'setEngraving',uid:b,slot:'ability',engravingId:'10031'}),[a,b]);
  step('holder renamed',act({type:'rename',uid:b,name:'Holder'}),[a,b]);
  step('unequip',act({type:'setEngraving',uid:a,slot:'ability',engravingId:null}),[a,b]);
  step('engraving moved',act({type:'setEngraving',uid:a,slot:'ability',engravingId:'10031',fromUid:b}),[a,b]);
  step('bead used on a cloned save',act({type:'useItem',uid:c,itemId:'item_bead_reduce_damage'}),[c]);
  step('bead ended',act({type:'startTraining',species:10,level:3},{type:'flee'},{type:'closeBattle'}),[c],game.snapshot().party);
  assert.deepEqual(row(c).boosts,[],'The one-battle bead has ended.');
  step('capacity reached',act({type:'cheatAcquire',species:20,level:100}),[m]);
  assert(row(m).evolutionChoices[0].blockedReason,'Six copies block the evolution.');
  step('evolution frees capacity',act({type:'evolve',uid:c}),[c,m]);
  step('evolution into a fusion parent',act({type:'evolve',uid:x}),[x]);
  assert.equal(game.snapshot().fusion.recipes.find(recipe=>recipe.recipe.id==='fusion-401')!.pairs.length,3,'The evolved form pairs with the secondary.');
  act(...[450,447].map((species,index):GameAction=>({type:'cheatAcquire',species,level:49+index*11})))();
  const [male]=uids(450);
  step('breeding level reached',act({type:'cheatMonster',uid:male,level:50}),[male]);
  assert.equal(game.snapshot().breeding.recipes.find(recipe=>recipe.recipe.id==='breeding-1')!.pairs.length,1,'A Lv 50 male breeds.');
  step('quest reward capacity',act(...Array.from({length:6},():GameAction=>({type:'cheatAcquire',species:10,level:5}))),[]);
  assert(game.snapshot().quests.find(quest=>quest.rewardSpecies===10)!.blockedReason,'Six copies block the quest reward.');
  const quest=game.snapshot().quests.find(quest=>quest.prerequisites?.some(condition=>condition.kind==='species'&&!condition.complete))!;
  const saved=JSON.parse(game.exportSave()),missing=quest.prerequisites!.find(condition=>condition.kind==='species'&&!condition.complete)!;
  saved.dex.owned.push(missing.species);
  step('import with one more owned species',()=>game.importSave(JSON.stringify(saved)),[]);
  assert.notEqual(game.snapshot().quests.find(entry=>entry.id===quest.id),quest,'The quest row follows the owned species.');
  return {checks};
}

/** Each monster lists the player-wide boosts and only its own energy bead; a settled battle counts every boost down. */
export async function verifyMonsterBoosts(){
  const game=createGame(await loadCatalog(),''),[a,b]=game.snapshot().monsters;
  for(const itemId of ['item_exp_x2','item_bead_atk_20'])assert(game.dispatch({type:'useItem',uid:a.uid,itemId}).ok,itemId);
  const boosts=(uid:string)=>game.snapshot().monsters.find(mon=>mon.uid===uid)!.boosts;
  assert.deepEqual(boosts(a.uid),[{name:'双倍经验加速器',battlesLeft:50},{name:'攻击能量珠',battlesLeft:20}]);
  assert.deepEqual(boosts(b.uid),[{name:'双倍经验加速器',battlesLeft:50}],'Another monster\'s energy bead stays hidden.');
  game.dispatch({type:'startTraining',species:10,level:3});
  assert(game.snapshot().battle,'A training battle starts.');
  game.dispatch({type:'flee'});game.dispatch({type:'closeBattle'});
  assert.deepEqual(boosts(a.uid),[{name:'双倍经验加速器',battlesLeft:49},{name:'攻击能量珠',battlesLeft:19}]);
  assert.deepEqual(boosts(b.uid),[{name:'双倍经验加速器',battlesLeft:49}]);
  return {checks:['player-wide boost on every monster','energy bead on its own monster only','boosts count down after a settled battle']};
}

/**
 * EngravingShop and EngravingSlots memoise `engravingOptions` on the monsters and engravingStock slices, so the options may change
 * only when one of them does; buying, equipping, moving and unequipping, and renaming a holder, do change them.
 */
export async function verifyEngravingOptionInputs(){
  const game=createGame(await loadCatalog(),'');
  for(let i=0;i<2;i++)game.dispatch({type:'cheatAcquire',species:15,level:100});
  const [a,b]=game.snapshot().monsters.filter(mon=>mon.species===15).map(mon=>mon.uid),starter=game.snapshot().party[0];
  const options=()=>JSON.stringify(game.snapshot().monsters.map(mon=>game.engravingOptions(mon.uid)));
  // Each action, and whether it must change the options (undefined: either way).
  const steps:[GameAction,boolean?][]=[[{type:'dismissNotice'},false],[{type:'buyItem',itemId:'item_level_up_1',quantity:1},false],
    [{type:'buyEngraving',engravingId:'10031'},true],[{type:'setEngraving',uid:a,slot:'ability',engravingId:'10031'},true],
    [{type:'setEngraving',uid:b,slot:'ability',engravingId:'10031',fromUid:a},true],[{type:'rename',uid:b,name:'Holder'},true],
    [{type:'useItem',uid:starter,itemId:'item_level_up_1'}],[{type:'heal'}],[{type:'setEngraving',uid:b,slot:'ability',engravingId:null},true]];
  for(const [action,changes] of steps){
    const before=game.snapshot(),seen=options(),result=game.dispatch(action),after=game.snapshot(),changed=options()!==seen;
    assert(result.ok,`${action.type}: ${result.notice}`);
    if(changed)assert(after.monsters!==before.monsters||after.engravingStock!==before.engravingStock,`${action.type} changed the options, not their slices.`);
    if(changes!==undefined)assert.equal(changed,changes,`${action.type} ${changes?'changes':'keeps'} the engraving options.`);
  }
  return {checks:steps.map(([action])=>action.type)};
}

/** A collection of `size` monsters: mixed species and levels, every fifth raised to Lv 100 with an engraving, an EXP boost and a bead. */
function collectionSave(catalog:CatalogData,size:number):string{
  const game=createGame(catalog,''),species=catalog.species.map(row=>Number(row.id));
  for(let i=0;game.snapshot().monsters.length<size&&i<size*4;i++)
    game.dispatch({type:'cheatAcquire',species:species[Math.floor(i/3)*7919%species.length],level:1+i*37%100});
  for(const mon of game.snapshot().monsters.filter((_,index)=>index%5===4)){
    game.dispatch({type:'cheatMonster',uid:mon.uid,level:100});
    const option=game.engravingOptions(mon.uid).find(option=>option.ready&&(option.equipMode==='unlimited'||option.canBuy));
    if(option?.canBuy)game.dispatch({type:'buyEngraving',engravingId:option.id});
    if(option)game.dispatch({type:'setEngraving',uid:mon.uid,slot:option.slot,engravingId:option.id});
  }
  const monsters=game.snapshot().monsters;
  for(const itemId of ['item_exp_x2','item_bead_atk_20'])assert(game.dispatch({type:'useItem',uid:monsters[0].uid,itemId}).ok,itemId);
  assert.equal(monsters.length,size);
  assert(monsters.filter(mon=>mon.engravings.ability||mon.engravings.skill).length>=size/10,'A tenth of the collection is engraved.');
  return game.exportSave();
}

/**
 * Budget: a non-battle action, its snapshot and the save write take at most 4 ms at the 95th percentile (architecture-v2 §2),
 * on a new journey and on a collection of 200 monsters, for a mix of common actions. The write runs after the frame, so each
 * action is timed with the write it schedules; `dispatchP95` is the action and its snapshot alone. It counts this thread's CPU
 * time, so other suites running in parallel do not fail it; the best of three rounds counts.
 */
export async function verifyDispatchBudget(){
  const catalog=await loadCatalog(),saves={journey:'',collection:collectionSave(catalog,200)},p95:Record<string,number>={};
  const dispatchP95:Record<string,number>={},ms=(used:NodeJS.CpuUsage)=>(used.user+used.system)/1000;
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),memory=new Map<string,string>();
  const storage={getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>{memory.set(key,value);}};
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
  try{
    for(const [name,save] of Object.entries(saves)){
      const slots:(()=>void)[]=[],game=createGame(catalog,save,{scheduleSave:write=>{slots.push(write);return true;}}),uid=game.snapshot().party[0];
      game.dispatch({type:'cheatResources',coins:1000000});game.dispatch({type:'cheatMonster',uid,level:50});
      const skills=game.snapshot().monsters.find(mon=>mon.uid===uid)!.skills.map(skill=>skill.id),member=game.snapshot().party.at(-1)!;
      const mix=(i:number):GameAction=>[{type:'rename',uid,name:`Budget${i%7}`},{type:'dismissNotice'},
        {type:'equip',uid,skills:i%12<6?[...skills].reverse():skills},{type:'train',uid,stat:'atk',amount:1},{type:'party',uid:member,add:i%12>=6},
        {type:'buyItem',itemId:'item_level_up_1',quantity:1}][i%6] as GameAction;
      const rounds:number[]=[],dispatchRounds:number[]=[],at95=(times:number[])=>times.sort((a,b)=>a-b)[Math.floor(times.length*0.95)];
      for(let round=0;round<3;round++){
        const times:number[]=[],dispatchTimes:number[]=[];
        for(let i=0;i<240;i++){
          const action=mix(i),started=process.threadCpuUsage(),result=game.dispatch(action),dispatched=process.threadCpuUsage(started);
          slots.splice(0).forEach(write=>write());
          const used=process.threadCpuUsage(started);
          assert(result.ok,`${name} ${action.type}: ${result.notice}`);
          if(i>=40){times.push(ms(used));dispatchTimes.push(ms(dispatched));}
        }
        rounds.push(at95(times));dispatchRounds.push(at95(dispatchTimes));
      }
      p95[name]=Math.min(...rounds);dispatchP95[name]=Math.min(...dispatchRounds);
      assert(p95[name]<=4,`${name}: dispatch p95 ${p95[name].toFixed(2)} ms of CPU time exceeds the 4 ms budget.`);
      assert.equal(memory.size,1,`${name}: the save is written to storage.`);memory.clear();
    }
  }finally{
    if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete (globalThis as {localStorage?:unknown}).localStorage;
  }
  return {p95,dispatchP95};
}

/** An unreadable stored save is backed up before a new journey replaces it; version-1 repairs run once, on load. */
export async function verifyControllerSaveRecovery(){
  const catalog=await loadCatalog(),previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const memory=memoryStorage(),storage=globalThis.localStorage,setItem=storage.setItem;
  try{
    writeLocalSave('{"version":99}');
    const game=createGame(catalog);
    assert.deepEqual(game.snapshot().notices,['旧存档无法读取，已创建新存档。']);
    const backups=[...memory.keys()].filter(key=>key.startsWith(UNREADABLE_SAVE_PREFIX));
    assert.deepEqual(backups.map(key=>memory.get(key)),['{"version":99}'],'The unreadable save is kept under its own key.');
    assert.equal(readLocalSave(),game.exportSave(),'The new journey is written under the save key.');
    // Without room for a backup, progress stays in memory until the player replaces the save explicitly.
    memory.clear();writeLocalSave('{"version":99}');
    storage.setItem=(key:string,value:string)=>{if(key.startsWith(UNREADABLE_SAVE_PREFIX))throw new Error('QuotaExceededError');setItem(key,value);};
    const exits:(()=>void)[]=[],unsaved=createGame(catalog,undefined,{onPageExit:flush=>exits.push(flush)});
    assert.equal(unsaved.snapshot().notices.length,1);assert.notEqual(unsaved.snapshot().notices[0],'旧存档无法读取，已创建新存档。');
    unsaved.dispatch({type:'heal'});unsaved.exportSave();exits.forEach(flush=>flush());
    assert.equal(readLocalSave(),'{"version":99}','The unreadable save is never overwritten.');
    unsaved.reset();assert.equal(readLocalSave(),unsaved.exportSave(),'A new journey chosen by the player replaces it.');
    storage.setItem=setItem;
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

/**
 * Saves are written at most once per scheduled slot: a burst of actions writes once, an action that changes nothing writes
 * nothing, and a page exit or an export writes the latest state at once. An export still returns the latest state when storage
 * refuses the write, and the slot is reserved before the action, ahead of the turn preparation a battle action schedules.
 */
export async function verifyCoalescedSaveWrites(){
  const catalog=await loadCatalog(),previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  memoryStorage();
  const storage=globalThis.localStorage,setItem=storage.setItem,slots:(()=>void)[]=[],exits:(()=>void)[]=[],order:string[]=[];
  let writes=0,full=false;
  storage.setItem=(key:string,value:string)=>{if(full)throw new Error('QuotaExceededError');writes++;setItem(key,value);};
  const runSlots=()=>slots.splice(0).forEach(write=>write());
  try{
    const scheduleSave=(write:()=>void)=>{order.push('save');slots.push(write);return true;},idle=()=>{order.push('prepare');};
    const game=createGame(catalog,'',{scheduleSave,idle,onPageExit:flush=>exits.push(flush)}),uid=game.snapshot().party[0];
    const stored=()=>JSON.parse(readLocalSave()!),nicknameIn=(text:string)=>JSON.parse(text).storage.find((mon:{uid:string})=>mon.uid===uid).nickname;
    const nickname=()=>nicknameIn(readLocalSave()!);
    assert.equal(writes,1,'A new journey is written at once.');assert.equal(exits.length,1,'The page exit flushes the save.');
    for(let i=0;i<10;i++)game.dispatch({type:'rename',uid,name:`Burst${i}`});
    game.dispatch({type:'cheatResources',coins:4321});
    assert.equal(writes,1,'A burst of actions waits for its slot.');assert.equal(slots.length,1,'A burst of actions schedules one write.');
    runSlots();
    assert.equal(writes,2,'The slot writes the burst once.');assert.equal(nickname(),'Burst9');assert.equal(stored().game.coins,4321);
    game.dispatch({type:'dismissNotice'});runSlots();
    assert.equal(writes,2,'An action that changes nothing writes nothing.');
    game.dispatch({type:'rename',uid,name:'Exit'});exits[0]();
    assert.equal(writes,3,'A page exit writes at once.');assert.equal(nickname(),'Exit','A page exit writes the latest state.');
    runSlots();exits[0]();
    assert.equal(writes,3,'Neither the flushed slot nor a second exit writes again.');
    game.dispatch({type:'rename',uid,name:'Export'});
    const exported=game.exportSave();
    assert.equal(writes,4);assert.equal(readLocalSave(),exported,'An export writes the latest state first.');
    runSlots();game.exportSave();
    assert.equal(writes,4,'An export with nothing pending writes nothing.');
    full=true;game.dispatch({type:'rename',uid,name:'Full'});
    assert.equal(nicknameIn(game.exportSave()),'Full','An export returns the latest state when storage refuses the write.');
    full=false;game.dispatch({type:'rename',uid,name:'Retry'});runSlots();
    assert.equal(writes,5,'The next action writes again.');assert.equal(nickname(),'Retry');
    game.dispatch({type:'rename',uid,name:'Reset'});game.reset();
    assert.equal(writes,6,'A new journey replaces the pending write at once.');assert.equal(readLocalSave(),game.exportSave());
    runSlots();assert.equal(writes,6);
    order.length=0;assert(game.dispatch({type:'startBattle',bossId:'boss_spt_liaosi'}).ok,'The battle starts.');
    assert.deepEqual(order,['save','prepare'],'A battle start reserves its write before it schedules its turn preparation.');
    runSlots();order.length=0;
    const skillId=game.snapshot().battle!.player.skills[0].id;
    assert(game.dispatch({type:'move',skillId}).ok);
    assert(!game.snapshot().battle!.finished,'Three starters outlast one turn.');
    assert.deepEqual(order,['save','prepare'],'A turn reserves its write before the next turn preparation.');
    return {checks:['burst writes once','unchanged save not written','page exit writes the latest state','export writes the latest state',
      'export returns the latest state when storage refuses it','reset writes at once','write reserved before turn preparation']};
  }finally{
    if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete (globalThis as {localStorage?:unknown}).localStorage;
  }
}
