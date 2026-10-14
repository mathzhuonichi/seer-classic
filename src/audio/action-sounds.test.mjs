import assert from 'node:assert/strict';
import test from 'node:test';
import {actionSound,battleLevelGained} from './action-sounds.ts';
const base=()=>({monsters:[{uid:'a',species:1,level:5}],items:[{id:'essence_2',kind:'essence',count:1},{id:'fusion_bead_3',kind:'essence',count:1},{id:'exp',kind:'raising',count:1}],quests:[{id:'q',claimed:false}],expPool:100});
const updated=change=>({...base(),...change});
test('rejected actions and editor actions produce no outcome cue',()=>{
 for(const action of [{type:'claimQuest',questId:'q'},{type:'fuse',recipeId:'r',primaryUid:'a',secondaryUid:'b'},{type:'evolve',uid:'a'},{type:'useItem',uid:'a',itemId:'essence_2'},{type:'allocateExp',uid:'a',amount:100}])assert.equal(actionSound(action,base(),base()),null);
 assert.equal(actionSound({type:'cheatMonster',uid:'a',level:100},base(),updated({monsters:[{uid:'a',species:1,level:100}]})),null);
 assert.equal(actionSound({type:'cheatAcquire',species:2},base(),updated({monsters:[...base().monsters,{uid:'b',species:2,level:5}]})),null);
});
test('confirmed claims, fusion beads, hatching and evolution receive reward cue',()=>{
 assert.equal(actionSound({type:'claimQuest',questId:'q'},base(),updated({quests:[{id:'q',claimed:true}]})),'reward');
 assert.equal(actionSound({type:'claimQuest',questId:'q'},updated({quests:[{id:'q',claimed:true}]}),updated({quests:[{id:'q',claimed:true}]})),null);
 assert.equal(actionSound({type:'fuse',recipeId:'r',primaryUid:'a',secondaryUid:'b'},base(),updated({items:[...base().items,{id:'fusion_bead_4',kind:'essence',count:1}]})),'reward');
 for(const itemId of ['essence_2','fusion_bead_3']){
  const after=updated({items:base().items.filter(item=>item.id!==itemId),monsters:[...base().monsters,{uid:'b',species:2,level:1}]});
  assert.equal(actionSound({type:'useItem',uid:'a',itemId},base(),after),'reward');
  assert.equal(actionSound({type:'useItem',uid:'a',itemId},base(),updated({items:after.items})),null,'consumption without hatch is insufficient');
 }
 assert.equal(actionSound({type:'evolve',uid:'a'},base(),updated({monsters:[{uid:'a',species:2,level:5}]})),'reward');
});
test('level cue requires actual level gain from valid item or allocation',()=>{
 const monsters=[{uid:'a',species:1,level:6}];
 assert.equal(actionSound({type:'allocateExp',uid:'a',amount:100},base(),updated({monsters,expPool:0})),'level-up');
 assert.equal(actionSound({type:'allocateExp',uid:'a',amount:100},base(),updated({expPool:0})),null);
 assert.equal(actionSound({type:'useItem',uid:'a',itemId:'exp'},base(),updated({monsters,items:base().items.filter(item=>item.id!=='exp')})),'level-up');
 assert.equal(actionSound({type:'useItem',uid:'a',itemId:'exp'},base(),updated({monsters})),null);
 assert.equal(battleLevelGained(new Map([['a',5]]),monsters),true);
 assert.equal(battleLevelGained(new Map([['a',5]]),base().monsters),false);
 assert.equal(battleLevelGained(new Map([['a',5]]),[{uid:'b',level:100}]),false,'new acquisition is not a party level gain');
});
