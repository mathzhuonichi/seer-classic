import assert from 'node:assert/strict';
import test from 'node:test';
import {bagItems,itemUseAction,itemUseFeedback,pocketItems} from './inventory-views.ts';
import {BATTLE_SUPPLY_CATEGORIES,battleSupplyLabel,itemCategoryOptions,itemKindLabel,itemPocket} from '../../shared/item-categories.ts';
import {partyFirstMonsters,partyMonsters} from '../../shared/party-order.ts';

const item=fields=>({id:'item_level_up_1',name:'等级药',kind:'raising',count:1,description:'',battleUsable:false,...fields});
const mon=(uid,inParty=true)=>({uid,name:`m${uid}`,inParty,level:5});

test('pockets and item groupings come from one source',()=>{
  assert.deepEqual(['raising','battle','capsule','essence','collectible'].map(itemPocket),['raising','battle','capsule','essence','other']);
  assert.deepEqual(BATTLE_SUPPLY_CATEGORIES.map(([id])=>id),['recovery','capsule','status']);
  assert.deepEqual(['capsule','other','collectible'].map(itemKindLabel),['胶囊','其他','其他道具']);
  assert.equal(battleSupplyLabel({kind:'battle'}),'体力 / PP 恢复');
  assert.equal(battleSupplyLabel({kind:'battle',battleCategory:'status'}),'异常解除');
  assert.deepEqual(itemCategoryOptions('battle',[{id:'item_potion_pp_5',kind:'battle'}]),[['all','全部'],['pp','PP']]);
  assert.deepEqual(itemCategoryOptions('capsule',[{id:'x',kind:'capsule'}]),[]);
});

test('the bag lists a pocket by name, with recovery supplies before status cures',()=>{
  const items=[item({id:'c',name:'乙',kind:'battle',battleCategory:'status'}),item({id:'b',name:'丙',kind:'battle'}),item({id:'a',name:'甲',kind:'battle',battleCategory:'recovery'}),
    item({id:'t',kind:'collectible'})];
  assert.deepEqual(bagItems(pocketItems(items,'battle'),'battle','all','').map(i=>i.id),['b','a','c']);
  assert.deepEqual(pocketItems(items,'other').map(i=>i.id),['t']);
  assert.deepEqual(bagItems(pocketItems(items,'battle'),'battle','all','甲').map(i=>i.id),['a']);
});

test('the confirm action follows the controller\'s use action and targets',()=>{
  const raising=item({useAction:'use',useTargets:['a']});
  assert.deepEqual(itemUseAction(raising,'a',false),{type:'useItem',uid:'a',itemId:'item_level_up_1'});
  assert.equal(itemUseAction(raising,'b',false),undefined,'only targets the controller lists');
  assert.equal(itemUseAction(raising,undefined,false),undefined);
  const supply=item({id:'pot',kind:'battle',useAction:'use',useTargets:['a']});
  assert.deepEqual(itemUseAction(supply,'a',false),{type:'battleItem',itemId:'pot',targetUid:'a'});
  const capsule=item({id:'cap',kind:'capsule',useAction:'capture'});
  assert.deepEqual(itemUseAction(capsule,undefined,true),{type:'capture',itemId:'cap'});
  assert.equal(itemUseAction(capsule,undefined,false),undefined,'the battle blocks a capture the engine still lists');
  const essence=item({id:'e',kind:'essence',useAction:'hatch'});
  assert.deepEqual(itemUseAction(essence,'a',false),{type:'useItem',uid:'a',itemId:'e'});
  assert.equal(itemUseAction(essence,undefined,false),undefined,'useItem always names a monster');
  assert.equal(itemUseAction(item({kind:'battle',useAction:null}),'a',true),undefined);
});

test('party order puts the party first',()=>{
  const roster={party:['c','a','gone'],monsters:[mon('b',false),mon('a'),mon('c')]};
  assert.deepEqual(partyMonsters(roster).map(m=>m.uid),['c','a']);
  assert.deepEqual(partyFirstMonsters(roster).map(m=>m.uid),['c','a','b']);
});

test('use feedback is the controller notice, else what was used',()=>{
  assert.equal(itemUseFeedback({ok:false,notice:'不能使用。'},item(),mon('a')),'不能使用。');
  assert.equal(itemUseFeedback({ok:true,notice:'捕捉成功！'},item({kind:'capsule',useAction:'capture'})),'捕捉成功！');
  assert.equal(itemUseFeedback({ok:true},item({useAction:'use'}),mon('a')),'已对ma使用等级药。');
  assert.equal(itemUseFeedback({ok:true},item({name:'胶囊',kind:'capsule',useAction:'capture'})),'已使用胶囊，本次捕捉未成功。');
});
