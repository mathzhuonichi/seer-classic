import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BRAVE_TOWER_FLOORS,BRAVE_TOWER_CHECKPOINTS,braveTowerFloor,braveTowerBossId,
  normalizeBraveTowerProgress,braveTowerCheckpoints,canStartBraveTowerFloor,clearBraveTowerFloor,braveTowerRewards,
} from './brave-tower.ts';

const fresh=()=>normalizeBraveTowerProgress(undefined,[]);
const unlocked=progress=>braveTowerCheckpoints(progress).filter(row=>row.unlocked).map(row=>row.floor);

test('explicit rewards separate repeatable supplies from first-clear milestones',()=>{
  assert.deepEqual(braveTowerRewards(undefined),[]);
  assert.deepEqual(braveTowerRewards({items:{}}),[]);
  const source=Object.freeze({items:Object.freeze({item_seer_beans:300,item_suit_flash:1,essence_ken:1,item_potion_hp_100:2})});
  assert.deepEqual(braveTowerRewards(source),[
    {id:'item_seer_beans',count:300,firstClear:false},{id:'item_suit_flash',count:1,firstClear:true},
    {id:'essence_ken',count:1,firstClear:true},{id:'item_potion_hp_100',count:2,firstClear:false},
  ]);
  assert.deepEqual(braveTowerRewards({first_clear:true,items:{item_seer_beans:10}}),[{id:'item_seer_beans',count:10,firstClear:true}]);
  assert.deepEqual(braveTowerRewards({items:{zero:0,negative:-1,fraction:0.5,infinite:Infinity}}),[]);
});

test('a fresh tower opens only floor 1, with fixed ten-floor checkpoints',()=>{
  const progress=fresh();
  assert.equal(BRAVE_TOWER_FLOORS,70);
  assert.deepEqual(BRAVE_TOWER_CHECKPOINTS,[1,11,21,31,41,51,61]);
  assert.deepEqual(progress,{highestCleared:0,resumeFloor:1});
  assert.deepEqual(unlocked(progress),[1]);
  assert.equal(canStartBraveTowerFloor(progress,1),true);
  for(let floor=2;floor<=70;floor++)assert.equal(canStartBraveTowerFloor(progress,floor),false);
});

test('clearing the tenth floor unlocks 11, and a saved climb resumes there',()=>{
  let progress=fresh();
  for(let floor=1;floor<=9;floor++){
    assert.equal(canStartBraveTowerFloor(progress,floor),true);
    progress=clearBraveTowerFloor(progress,floor);
  }
  assert.deepEqual(progress,{highestCleared:9,resumeFloor:10});
  assert.deepEqual(unlocked(progress),[1]);
  assert.equal(canStartBraveTowerFloor(progress,10),true);
  assert.equal(canStartBraveTowerFloor(progress,11),false);
  progress=clearBraveTowerFloor(progress,10);
  assert.deepEqual(unlocked(progress),[1,11]);
  assert.deepEqual(normalizeBraveTowerProgress(JSON.parse(JSON.stringify(progress)),[]),{highestCleared:10,resumeFloor:11});
  assert.equal(canStartBraveTowerFloor(progress,10),false,'arbitrary cleared floors are not new starting points');
});

test('floor 17 survives a save roundtrip, while restarting lower keeps the record',()=>{
  const progress=Object.freeze({highestCleared:16,resumeFloor:17});
  assert.deepEqual(normalizeBraveTowerProgress(JSON.parse(JSON.stringify(progress)),[]),progress);
  assert.equal(canStartBraveTowerFloor(progress,17),true);
  assert.equal(canStartBraveTowerFloor(progress,18),false);
  assert.equal(canStartBraveTowerFloor(progress,16),false);
  assert.equal(canStartBraveTowerFloor(progress,11),true);
  const resumed=clearBraveTowerFloor(progress,17);
  assert.deepEqual(resumed,{highestCleared:17,resumeFloor:18});
  const restarted=clearBraveTowerFloor({...progress,resumeFloor:11},11);
  assert.deepEqual(restarted,{highestCleared:16,resumeFloor:12});
  assert.deepEqual(progress,{highestCleared:16,resumeFloor:17});
});

test('floor 70 completes a climb and leaves all seven restart points available',()=>{
  const progress=clearBraveTowerFloor({highestCleared:69,resumeFloor:70},70);
  assert.deepEqual(progress,{highestCleared:70,resumeFloor:null});
  assert.deepEqual(normalizeBraveTowerProgress(progress,[]),progress);
  assert.deepEqual(unlocked(progress),[1,11,21,31,41,51,61]);
  assert.equal(canStartBraveTowerFloor(progress,70),false);
  assert.equal(canStartBraveTowerFloor(progress,71),false);
  assert.equal(canStartBraveTowerFloor(progress,61),true);
  assert.deepEqual(clearBraveTowerFloor({...progress,resumeFloor:61},61),{highestCleared:70,resumeFloor:62});
});

test('sparse legacy clears retain earned access without changing the clear ledger',()=>{
  const cleared=Object.freeze(['boss_tower_brave_f060','boss_tower_brave_f003','boss_tower_brave_mystery','boss_dark_door9_1']);
  assert.deepEqual(normalizeBraveTowerProgress(undefined,cleared),{highestCleared:60,resumeFloor:61});
  assert.deepEqual(normalizeBraveTowerProgress({highestCleared:10,resumeFloor:11},cleared),{highestCleared:60,resumeFloor:11});
  assert.deepEqual(normalizeBraveTowerProgress({highestCleared:65,resumeFloor:66},cleared),{highestCleared:65,resumeFloor:66});
  assert.deepEqual(normalizeBraveTowerProgress(undefined,['boss_tower_brave_f070']),{highestCleared:70,resumeFloor:null});
  assert.deepEqual(cleared,['boss_tower_brave_f060','boss_tower_brave_f003','boss_tower_brave_mystery','boss_dark_door9_1']);
});

test('malformed saved values cannot unlock floors or skip the next uncleared floor',()=>{
  for(const value of [undefined,null,[],17,'17',{}, {highestCleared:-1},{highestCleared:71},{highestCleared:1.5},{highestCleared:'70'},{highestCleared:Infinity}]){
    assert.deepEqual(normalizeBraveTowerProgress(value,[]),fresh());
  }
  for(const resumeFloor of [0,-1,18,71,1.5,'17',Infinity,NaN,null,undefined]){
    assert.deepEqual(normalizeBraveTowerProgress({highestCleared:16,resumeFloor},[]),{highestCleared:16,resumeFloor:17});
  }
  assert.deepEqual(normalizeBraveTowerProgress({highestCleared:70,resumeFloor:71},[]),{highestCleared:70,resumeFloor:null});
  assert.deepEqual(normalizeBraveTowerProgress({highestCleared:70,resumeFloor:70},[]),{highestCleared:70,resumeFloor:70});
});

test('only exact numbered tower identifiers participate, excluding the Mystery Realm',()=>{
  for(let floor=1;floor<=70;floor++)assert.equal(braveTowerFloor(braveTowerBossId(floor)),floor);
  for(const id of ['boss_tower_brave_f000','boss_tower_brave_f071','boss_tower_brave_f100','boss_tower_brave_f01','boss_tower_brave_f0001','boss_tower_brave_f001_extra','boss_tower_brave_mystery','boss_puni','boss_tower_brave_f001\n']){
    assert.equal(braveTowerFloor(id),undefined,id);
  }
});

test('invalid requested floors fail without mutating progression',()=>{
  const progress=Object.freeze({highestCleared:70,resumeFloor:17});
  for(const floor of [0,-1,71,1.5,NaN,Infinity,-Infinity,'1',null,undefined]){
    assert.equal(canStartBraveTowerFloor(progress,floor),false);
    assert.throws(()=>braveTowerBossId(floor),RangeError);
    assert.throws(()=>clearBraveTowerFloor(progress,floor),RangeError);
  }
  assert.deepEqual(progress,{highestCleared:70,resumeFloor:17});
});
