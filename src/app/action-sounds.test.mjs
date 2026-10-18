import assert from 'node:assert/strict';
import test from 'node:test';
import {actionSound,battleLevelGained} from './action-sounds.ts';
const base=()=>({monsters:[{uid:'a',species:1,level:5}],items:[{id:'essence_2',kind:'essence',count:1},{id:'fusion_bead_3',kind:'essence',count:1},{id:'exp',kind:'raising',count:0}]});
const updated=change=>({...base(),...change});
const ok={ok:true},rejected={ok:false,notice:'任务奖励尚不可领取。'};
const fuse={type:'fuse',recipeId:'r',primaryUid:'a',secondaryUid:'b'},breed={type:'breed',recipeId:'r',firstUid:'a',secondUid:'b'};
test('rejected actions and editor actions produce no outcome cue',()=>{
 const levelled=updated({monsters:[{uid:'a',species:2,level:6}]});
 for(const action of [{type:'claimQuest',questId:'q'},fuse,breed,{type:'evolve',uid:'a'},{type:'useItem',uid:'a',itemId:'essence_2'},{type:'allocateExp',uid:'a',amount:100}]){
  assert.equal(actionSound(action,rejected,base(),levelled),null,action.type);
 }
 assert.equal(actionSound({type:'cheatMonster',uid:'a',level:100},ok,base(),updated({monsters:[{uid:'a',species:1,level:100}]})),null);
 assert.equal(actionSound({type:'cheatAcquire',species:2},ok,base(),updated({monsters:[...base().monsters,{uid:'b',species:2,level:5}]})),null);
});
test('claims, created beads and offspring, hatching and evolution receive the reward cue',()=>{
 assert.equal(actionSound({type:'claimQuest',questId:'q'},ok,base(),base()),'reward');
 const repeatable=claimCount=>({...base(),quests:[{id:'q',repeatable:true,claimed:false,claimCount}]});
 assert.equal(actionSound({type:'claimQuest',questId:'q'},ok,repeatable(1),repeatable(2)),'reward','a repeated recruitment claim still rewards');
 assert.equal(actionSound(fuse,{ok:true,created:{itemId:'fusion_bead_4'}},base(),base()),'reward');
 assert.equal(actionSound(breed,{ok:true,created:{uid:'b'}},base(),base()),'reward');
 for(const action of [fuse,breed])assert.equal(actionSound(action,{ok:true,notice:'已达到六份上限'},base(),base()),null,`${action.type}: nothing created`);
 for(const itemId of ['essence_2','fusion_bead_3'])assert.equal(actionSound({type:'useItem',uid:'a',itemId},ok,base(),base()),'reward');
 assert.equal(actionSound({type:'evolve',uid:'a'},ok,base(),base()),'reward');
});
test('level cue requires a level gain from a successful item or allocation',()=>{
 const monsters=[{uid:'a',species:1,level:6}];
 assert.equal(actionSound({type:'allocateExp',uid:'a',amount:100},ok,base(),updated({monsters})),'level-up');
 assert.equal(actionSound({type:'allocateExp',uid:'a',amount:100},ok,base(),base()),null);
 assert.equal(actionSound({type:'useItem',uid:'a',itemId:'exp'},ok,base(),updated({monsters})),'level-up','an unlimited item keeps its count');
 assert.equal(actionSound({type:'useItem',uid:'a',itemId:'exp'},ok,base(),base()),null);
 assert.equal(battleLevelGained(new Map([['a',5]]),monsters),true);
 assert.equal(battleLevelGained(new Map([['a',5]]),base().monsters),false);
 assert.equal(battleLevelGained(new Map([['a',5]]),[{uid:'b',level:100}]),false,'new acquisition is not a party level gain');
});
