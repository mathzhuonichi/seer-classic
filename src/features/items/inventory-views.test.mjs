import assert from 'node:assert/strict';
import test from 'node:test';
import {bagItems,itemTargets,itemUse,itemUseAction,itemUseFeedback,pocketItems} from './inventory-views.ts';
import {BATTLE_SUPPLY_CATEGORIES,battleSupplyLabel,itemCategoryOptions,itemKindLabel,itemPocket} from '../../shared/item-categories.ts';
import {partyFirstMonsters,partyMonsters} from '../../shared/party-order.ts';

const item=fields=>({id:'item_level_up_1',name:'等级药',kind:'raising',count:1,description:'',battleUsable:false,...fields});
const mon=(uid,inParty=true)=>({uid,name:`m${uid}`,inParty,level:5});
const battle=fields=>({finished:false,canCapture:true,turn:1,party:[{uid:'a'}],...fields});

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

test('raising and essence items are used outside battle; supplies and capsules only during one',()=>{
  const out={battle:null};
  assert.deepEqual(itemUse(out,item(),mon('a')),{picksTarget:true,captures:false,confirmable:true,enabled:true});
  assert.equal(itemUse(out,item({count:0}),mon('a')).enabled,false);
  assert.equal(itemUse(out,item({count:0,unlimited:true}),mon('a')).enabled,true);
  assert.equal(itemUse(out,item(),undefined).enabled,false);
  const supply=item({kind:'battle',battleUsable:true,usableTargetUids:['a']});
  assert.deepEqual(itemUse(out,supply,mon('a')),{picksTarget:false,captures:false,confirmable:false,enabled:true});
  assert.deepEqual(itemUseAction(out,item(),mon('a')),{type:'useItem',uid:'a',itemId:'item_level_up_1'});
  const s={battle:battle()};
  assert.deepEqual(itemUse(s,supply,mon('a')),{picksTarget:true,captures:false,confirmable:true,enabled:true});
  assert.equal(itemUse(s,supply,mon('b')).enabled,false,'only targets the controller lists');
  assert.deepEqual(itemUseAction(s,supply,mon('a')),{type:'battleItem',itemId:supply.id,targetUid:'a'});
  const capsule=item({id:'cap',kind:'capsule'});
  assert.deepEqual(itemUseAction(s,capsule),{type:'capture',itemId:'cap'});
  assert.equal(itemUseAction({battle:battle({canCapture:false})},capsule),undefined);
  assert.equal(itemUseAction(out,capsule,mon('a')),undefined);
});

test('targets are the battle party during a battle; party order puts the party first',()=>{
  const monsters=[mon('b',false),mon('a'),mon('c')];
  assert.deepEqual(itemTargets({battle:battle(),monsters}).map(m=>m.uid),['a']);
  assert.equal(itemTargets({battle:battle({finished:true}),monsters}),monsters);
  const roster={party:['c','a','gone'],monsters};
  assert.deepEqual(partyMonsters(roster).map(m=>m.uid),['c','a']);
  assert.deepEqual(partyFirstMonsters(roster).map(m=>m.uid),['c','a','b']);
});

test('use feedback reports a catch, a hatch, a use or the controller notice',()=>{
  const before={battle:null,items:[item()],monsters:[mon('a')],notices:[]};
  assert.equal(itemUseFeedback(before,{...before,items:[]},item(),mon('a')),'已对ma使用等级药。');
  assert.equal(itemUseFeedback(before,{...before,notices:['不能使用。']},item(),mon('a')),'不能使用。');
  const essence=item({kind:'essence'});
  assert.equal(itemUseFeedback(before,{...before,items:[],monsters:[mon('a'),mon('n',false)]},essence,mon('a')),'孵化成功：mn已加入仓库。');
  const unlimited=item({unlimited:true});
  assert.equal(itemUseFeedback(before,{...before,monsters:[{...mon('a'),level:6}]},unlimited,mon('a')),'已对ma使用等级药。');
  const inBattle={...before,battle:battle()},capsule=item({kind:'capsule',name:'胶囊',unlimited:true});
  assert.equal(itemUseFeedback(inBattle,{...inBattle,battle:battle({turn:2})},capsule),'已使用胶囊，本次捕捉未成功。');
});
