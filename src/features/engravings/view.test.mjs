import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENGRAVING_STAT_TABS,engravingAccessView,engravingCapNote,engravingMoveChoices,engravingShopProducts,engravingSlotCandidates,matchesEngravingTab,setEngravingAction,
} from './view.ts';

const option=fields=>({id:'1',name:'体力刻印',slot:'ability',effect:'体力+60',levelMin:1,bound:false,statKeys:['hp'],era:'2013',ready:true,
  maxOwned:2,stock:0,equipped:0,equippedHere:false,...fields});
const holders=[{uid:'a',name:'甲'},{uid:'b',name:'乙'}];
const noFilter={slot:'all',kind:'all',stat:'',move:'',group:'',search:''};

test('finite engravings move from another holder when stock is empty or the equip cap is reached',()=>{
  const empty=engravingAccessView(option({equipped:1,equippedHolders:holders}),'a');
  assert.deepEqual(empty.holders,[holders[1]]);
  assert.equal(empty.moving,true);assert.equal(empty.source,holders[1]);assert.equal(empty.canEquip,true);
  const capped=engravingAccessView(option({stock:1,equipped:2,equippedHolders:holders}),'c','a');
  assert.equal(capped.moving,true);assert.equal(capped.source,holders[0]);
  assert.equal(capped.owned,3);assert.equal(capped.full,true);
  const stocked=engravingAccessView(option({stock:1,equipped:1,equippedHolders:holders}),'c');
  assert.equal(stocked.moving,false);assert.equal(stocked.full,true);
});

test('equipped, unlimited and unavailable engravings never transfer',()=>{
  assert.equal(engravingAccessView(option({equipped:1,equippedHere:true,equippedHolders:holders}),'a').moving,false);
  const unlimited=engravingAccessView(option({unlimited:true,equipped:5,equippedHolders:holders}),'c');
  assert.deepEqual([unlimited.moving,unlimited.canEquip,unlimited.full],[false,true,false]);
  const none=engravingAccessView(option({}),'a');
  assert.deepEqual([none.moving,none.canEquip,none.source],[false,false,undefined]);
});

test('setEngraving names a source only for a transfer',()=>{
  assert.deepEqual(setEngravingAction('a','ability','1'),{type:'setEngraving',uid:'a',slot:'ability',engravingId:'1'});
  assert.deepEqual(setEngravingAction('a','skill',null,'b'),{type:'setEngraving',uid:'a',slot:'skill',engravingId:null,fromUid:'b'});
});

test('shop products follow the slot-specific filters and list bound engravings first',()=>{
  const generic=option({id:'g',statKeys:['atk']}),six=option({id:'six',statKeys:['hp','atk','def','spa','spd','spe']}),bound=option({id:'b',bound:true});
  const skill=option({id:'s',slot:'skill',statKeys:[],moveIds:[7],moveName:'火花',group:'power'});
  const all=[generic,six,bound,skill];
  assert.deepEqual(engravingShopProducts(all,noFilter).map(o=>o.id),['b','g','six','s']);
  assert.deepEqual(engravingShopProducts(all,{...noFilter,slot:'ability',stat:'all6'}).map(o=>o.id),['six']);
  assert.deepEqual(engravingShopProducts(all,{...noFilter,stat:'all6'}).length,4,'the stat filter needs the ability slot');
  assert.deepEqual(engravingShopProducts(all,{...noFilter,slot:'skill',move:'7',group:'power'}).map(o=>o.id),['s']);
  assert.deepEqual(engravingShopProducts(all,{...noFilter,kind:'generic',search:' 火花 '}).map(o=>o.id),['s']);
  assert.deepEqual(engravingMoveChoices(all),[[7,'火花']]);
});

test('PetBag candidates exclude unready or unavailable engravings, and tabs combine scope with stats or groups',()=>{
  const listed=engravingSlotCandidates([option({id:'stock',stock:1}),option({id:'held',equipped:1}),option({id:'none'}),option({id:'unready',stock:1,ready:false}),
    option({id:'bound',bound:true,unlimited:true}),option({id:'skill',slot:'skill',stock:1})],'ability');
  assert.deepEqual(listed.map(o=>o.id),['bound','stock','held']);
  assert(matchesEngravingTab(option({statKeys:['spe']}),'ability','spe'));
  assert(!matchesEngravingTab(option({statKeys:['spe']}),'skill','spe'),'skill tabs are effect groups');
  assert(matchesEngravingTab(option({slot:'skill',group:'power'}),'skill','power'));
  assert(matchesEngravingTab(option({bound:true}),'skill','bound'));
  assert.deepEqual(ENGRAVING_STAT_TABS.map(([id])=>id),['hp','atk','def','spa','spd','spe']);
});

test('tile notes show the cap and the holders',()=>{
  assert.equal(engravingCapNote(option({equippedHolders:holders})),'每种上限 2 · 装备于 甲、乙');
  assert.equal(engravingCapNote(option({unlimited:true,equippedHolders:[]})),'无限装备');
});
