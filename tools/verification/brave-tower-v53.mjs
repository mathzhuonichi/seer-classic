/** V53 tower progression through public controller actions and real battle settlement. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root,sha256File,suite,withSsr} from './_harness.mjs';

const limits=[
  'Numbered tower enemies have 1 HP in the in-memory catalog to isolate progression; their teams, skills, rules, AI and rewards remain intact.',
  'All wins and the loss use actual controller moves and engine settlement; no battle result or progression field is patched during combat.',
  'Loading cancellation is checked as the controller lifecycle start, flee, close; browser preloading and navigation are outside this script.',
];
const witnesses=[];
let fixture;
const parse=game=>JSON.parse(game.exportSave());
const floorId=floor=>`boss_tower_brave_f${String(floor).padStart(3,'0')}`;
const progress=game=>parse(game).game.braveTower;
const sourceFiles=['src/kernel/game.ts','src/kernel/contract.ts','src/domain/challenges/brave-tower.ts'];
const hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,sha256File(file)]));
const sourceHashes=hashes();
let storageReads=0,storageWrites=0,networkRequests=0;
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>{storageReads++;return null;},setItem:()=>{storageWrites++;},removeItem:()=>{}}});
globalThis.fetch=()=>{networkRequests++;throw new Error('Tower verification must not make HTTP requests.');};
await withSsr('brave-tower-v53',async load=>{
  const t=suite('brave-tower-v53'),{check}=t;
  const [{createGame},{loadCatalog},{makeDex,createMonster},{Rng}]=await Promise.all([
    load('/src/kernel/game.ts'),load('/src/domain/catalog/catalog.ts'),load('/raising/core/index.ts'),load('/battle/core/src/rng.ts'),
  ]);
  const original=await loadCatalog(),originalBytes=JSON.stringify(original),catalog=structuredClone(original);
  let alteredMembers=0;
  for(const boss of catalog.bosses)if(/^boss_tower_brave_f\d{3}$/.test(boss.id))for(const mon of boss.team){mon.hp_override=1;alteredMembers++;}
  const fixtureBytes=JSON.stringify(catalog),dex=makeDex(catalog),rng=new Rng(53),FAST=10166,WAIT=20001;
  const base=parse(createGame(catalog,''));
  base.storage=Array.from({length:6},(_,index)=>{
    const mon=createMonster(dex,70,100,rng,{uid:`tower-v53-${index}`,iv:31,nature:'hardy'});
    assert(mon.learned.includes(FAST));mon.skills=[FAST];mon.pp={[FAST]:dex.skill(FAST).pp};return mon;
  });
  base.party=base.storage.map(mon=>mon.uid);base.game.traits={};base.game.modules={};base.game.engravingStock={};base.rng_state=[53,106,159,212];
  const make=(save=base)=>createGame(catalog,JSON.stringify(structuredClone(save)));
  const withProgress=(highestCleared,resumeFloor)=>{const save=structuredClone(base);save.game.braveTower={highestCleared,resumeFloor};return save;};
  function reject(game,action,label){
    const before=game.exportSave(),battle=JSON.stringify(game.snapshot().battle),rngBefore=parse(game).rng_state;
    game.dispatch(action);assert.equal(game.exportSave(),before,`${label}: save unchanged`);assert.deepEqual(parse(game).rng_state,rngBefore,`${label}: RNG unchanged`);assert.equal(JSON.stringify(game.snapshot().battle),battle,`${label}: battle unchanged`);
  }
  function start(game,action){game.dispatch(action);assert(game.snapshot().battle&&!game.snapshot().battle.finished,JSON.stringify(game.snapshot().notices));return game.snapshot().battle;}
  function leave(game){game.dispatch({type:'flee'});assert.equal(game.snapshot().battle.resultReason,'flee');assert.equal(game.snapshot().battle.won,false);game.dispatch({type:'closeBattle'});assert.equal(game.snapshot().battle,null);}
  function win(game,floor){
    const entry=start(game,{type:'startTower',floor});assert(entry.enemyParty.every(mon=>mon.hp===1));assert.equal(progress(game).resumeFloor,floor);
    let actions=0;
    while(!game.snapshot().battle.finished&&actions++<30){
      const battle=game.snapshot().battle;
      if(battle.needsSwitch){const next=battle.party.find(mon=>!mon.fainted&&mon.hp>0&&mon.uid!==battle.player.uid);assert(next,'a replacement remains');game.dispatch({type:'switch',uid:next.uid});}
      else game.dispatch({type:'move',skillId:FAST});
    }
    const battle=game.snapshot().battle;assert.equal(battle.finished,true,`${floor}: bounded real battle`);assert.equal(battle.won,true,`${floor}: ${battle.result}`);assert.equal(battle.resultReason,'ko');
    assert(parse(game).progress.bosses_cleared.includes(floorId(floor)));
    witnesses.push({kind:'victory',floor,opponents:battle.enemyParty.length,turns:battle.turn,progress:progress(game)});
    game.dispatch({type:'closeBattle'});assert.equal(game.snapshot().battle,null);
  }

  check('Fresh controller exposes seven checkpoints and permits only the first floor',()=>{
    const game=make();assert.deepEqual(progress(game),{highestCleared:0,resumeFloor:1});
    const {milestones,honors,...view}=game.snapshot().braveTower;
    assert.deepEqual(view,{highestCleared:0,resumeFloor:1,totalFloors:70,position:{floor:1,bossId:floorId(1),climbComplete:false,conquered:false,entrance:1},
      checkpoints:[1,11,21,31,41,51,61].map(floor=>({floor,unlocked:floor===1}))});
    assert.deepEqual(milestones.map(row=>row.floor),[30,60,70]);assert.deepEqual(honors,[]);
    assert.equal(game.snapshot().battle,null);
  });
  check('Both public entry actions reject locked and malformed floors atomically',()=>{
    const game=make();
    for(const floor of [2,10,11,21,70,0,71,-1,1.5,NaN,Infinity,'1',undefined])reject(game,{type:'startTower',floor},`startTower ${floor}`);
    for(const floor of [2,10,11,21,70,0,71])reject(game,{type:'startBattle',bossId:floorId(floor)},`legacy ${floor}`);
    assert.deepEqual(parse(game).progress.boss_attempts,{});
  });
  let afterTen;
  check('Ten actual victories unlock floor 11 and retain ordinary battle resource consumption',()=>{
    const game=make(),initialPp=parse(game).storage[0].pp[FAST];
    for(let floor=1;floor<=10;floor++){
      win(game,floor);assert.deepEqual(progress(game),{highestCleared:floor,resumeFloor:floor+1});
      assert.deepEqual(game.snapshot().braveTower.checkpoints.filter(row=>row.unlocked).map(row=>row.floor),floor<10?[1]:[1,11]);
      assert.equal(parse(game).progress.boss_attempts[floorId(floor)],1);
    }
    afterTen=parse(game);assert.deepEqual(afterTen.progress.bosses_cleared,Array.from({length:10},(_,index)=>floorId(index+1)));
    assert(afterTen.storage[0].pp[FAST]<initialPp,'real moves consume PP across floors');
    assert.equal(afterTen.game.battlesWon,base.game.battlesWon+10);
  });
  check('Export/import and controller reconstruction resume floor 11 without rewriting progress',()=>{
    assert(afterTen,'ten-floor fixture completed');const text=JSON.stringify(afterTen),game=make(afterTen),reloaded=make();reloaded.importSave(text);
    for(const restored of [game,reloaded]){
      assert.deepEqual(progress(restored),{highestCleared:10,resumeFloor:11});assert.deepEqual(parse(restored).progress,afterTen.progress);assert.deepEqual(parse(restored).rng_state,afterTen.rng_state);
      start(restored,{type:'startTower',floor:11});leave(restored);assert.deepEqual(progress(restored),{highestCleared:10,resumeFloor:11});
    }
  });
  check('Retreat and the loading-cancel lifecycle retain attempted floor 17 across reload',()=>{
    const game=make(withProgress(16,17));start(game,{type:'startTower',floor:17});
    reject(game,{type:'closeBattle'},'unfinished close');reject(game,{type:'startTower',floor:11},'change floor during active battle');
    leave(game);assert.deepEqual(progress(game),{highestCleared:16,resumeFloor:17});
    const restored=make(parse(game));assert.deepEqual(progress(restored),{highestCleared:16,resumeFloor:17});assert(!parse(restored).progress.bosses_cleared.includes(floorId(17)));
    start(restored,{type:'startTower',floor:17});leave(restored);assert.deepEqual(progress(restored),{highestCleared:16,resumeFloor:17});
    witnesses.push({kind:'retreat-and-cancel',floor:17,attempts:parse(restored).progress.boss_attempts[floorId(17)],progress:progress(restored)});
  });
  check('An actual knockout loss retains floor 17 rather than resetting or advancing',()=>{
    const save=withProgress(16,17),mon=createMonster(dex,1,100,rng,{uid:'tower-v53-loss',iv:31,nature:'hardy'});
    assert(mon.learned.includes(WAIT));mon.hp=1;mon.skills=[WAIT];mon.pp={[WAIT]:dex.skill(WAIT).pp};save.storage=[mon];save.party=[mon.uid];
    const game=make(save);start(game,{type:'startTower',floor:17});let actions=0;
    while(!game.snapshot().battle.finished&&actions++<20)game.dispatch({type:'move',skillId:WAIT});
    const battle=game.snapshot().battle;assert.equal(battle.finished,true);assert.equal(battle.won,false);assert.equal(battle.resultReason,'ko');assert.equal(parse(game).storage[0].hp,0);
    assert.deepEqual(progress(game),{highestCleared:16,resumeFloor:17});assert.deepEqual(parse(game).progress.bosses_cleared,[]);
    game.dispatch({type:'closeBattle'});const restored=make(parse(game));assert.deepEqual(progress(restored),{highestCleared:16,resumeFloor:17});
    witnesses.push({kind:'knockout-loss',floor:17,turns:battle.turn,progress:progress(restored)});
  });
  check('Selecting an older checkpoint preserves the highest clear and saves the new attempt',()=>{
    const game=make(withProgress(45,46));start(game,{type:'startBattle',bossId:floorId(11)});
    assert.deepEqual(progress(game),{highestCleared:45,resumeFloor:11});leave(game);
    const restored=make(parse(game));assert.deepEqual(progress(restored),{highestCleared:45,resumeFloor:11});win(restored,11);
    assert.deepEqual(progress(restored),{highestCleared:45,resumeFloor:12});assert.deepEqual(parse(restored).progress.bosses_cleared,[floorId(11)]);
    reject(restored,{type:'startTower',floor:13},'skip resumed floor');reject(restored,{type:'startBattle',bossId:floorId(13)},'legacy skip resumed floor');
  });
  check('Actual multi-opponent victories at 69 and 70 complete the climb without floor 71',()=>{
    const game=make(withProgress(68,69));win(game,69);assert.deepEqual(progress(game),{highestCleared:69,resumeFloor:70});win(game,70);
    assert.deepEqual(progress(game),{highestCleared:70,resumeFloor:null});assert(game.snapshot().braveTower.checkpoints.every(row=>row.unlocked));
    assert.deepEqual(game.snapshot().braveTower.position,{floor:70,bossId:floorId(70),climbComplete:true,conquered:true,entrance:1});
    const restored=make(parse(game));assert.deepEqual(progress(restored),{highestCleared:70,resumeFloor:null});
    reject(restored,{type:'startTower',floor:71},'completed tower 71');reject(restored,{type:'startBattle',bossId:floorId(71)},'legacy completed tower 71');
    start(restored,{type:'startTower',floor:61});assert.deepEqual(progress(restored),{highestCleared:70,resumeFloor:61});leave(restored);
  });
  check('Sparse legacy saves with and without game extras recover access without fabricated clears',()=>{
    for(const floor of [60,70])for(const withoutGame of [false,true]){
      const save=structuredClone(base);save.progress.bosses_cleared=[floorId(floor),'boss_spt_liaosi'];save.progress.boss_attempts={[floorId(floor)]:3};
      if(withoutGame)delete save.game;else delete save.game.braveTower;
      const expected={highestCleared:floor,resumeFloor:floor===70?null:61},game=make(save);
      assert.deepEqual(progress(game),expected);assert.deepEqual(parse(game).progress,save.progress);assert(game.snapshot().braveTower.checkpoints.every(row=>row.unlocked));
      const imported=make();imported.importSave(JSON.stringify(save));assert.deepEqual(progress(imported),expected);assert.deepEqual(parse(imported).progress,save.progress);
      witnesses.push({kind:'legacy-migration',floor,withoutGame,progress:progress(game),clears:parse(game).progress.bosses_cleared});
    }
  });
  check('Failed start validation leaves checkpoint choice, attempts and RNG unchanged',()=>{
    const save=withProgress(45,46);for(const mon of save.storage)mon.hp=0;const game=make(save);
    reject(game,{type:'startTower',floor:11},'exhausted team new action');reject(game,{type:'startBattle',bossId:floorId(11)},'exhausted team legacy action');
    assert.deepEqual(progress(game),{highestCleared:45,resumeFloor:46});assert.deepEqual(parse(game).progress.boss_attempts,{});
  });
  check('Ordinary bosses and the unnumbered Mystery Realm bypass only the tower checkpoint gate',()=>{
    const game=make();
    for(const bossId of ['boss_spt_liaosi','boss_tower_brave_mystery']){
      const before=progress(game),battle=start(game,{type:'startBattle',bossId});assert.equal(battle.name,catalog.bosses.find(boss=>boss.id===bossId).name.zh);assert.deepEqual(progress(game),before);leave(game);assert.deepEqual(progress(game),before);
      assert.equal(parse(game).progress.boss_attempts[bossId],1);assert(!parse(game).progress.bosses_cleared.includes(bossId));
    }
  });
  check('Floor notes and the tower mode note describe this progression and cite only files that exist',()=>{
    const floors=original.bosses.filter(boss=>/^boss_tower_brave_f\d{3}$/.test(boss.id));assert.equal(floors.length,70);
    for(const boss of floors)for(const note of boss.engine_notes){
      assert.doesNotMatch(note,/restart_on_loss/,`${boss.id}: a loss keeps the attempted floor`);
      for(const file of note.match(/data\/[\w./-]+\.json/g)??[])assert(fs.existsSync(path.join(root,file)),`${boss.id} cites ${file}`);
    }
    const modes=fs.readFileSync(path.join(root,'data/bosses/_modes_tower.md'),'utf8');
    for(const file of modes.match(/chains\/[\w.-]*/g)??[])assert(fs.existsSync(path.join(root,'data/bosses',file)),`the mode note cites ${file}`);
  });
  check('The verification stays offline, uses explicit saves, and preserves both catalog inputs',()=>{
    assert.equal(storageReads,0,'no controller reads any original local save');assert(storageWrites>0,'save writes reached only the installed no-op adapter');assert.equal(networkRequests,0,'no HTTP or remote save requests');
    assert.equal(JSON.stringify(original),originalBytes);assert.equal(JSON.stringify(catalog),fixtureBytes);
    assert.deepEqual(hashes(),sourceHashes,'controller sources stayed stable during this run');
    fixture={alteredTowerEnemyMembers:alteredMembers,playerSpecies:70,prioritySkill:FAST,storageReads,discardedStorageWrites:storageWrites,networkRequests};
  });
  t.finish({limits,sourceHashes,fixture,witnesses});
});
