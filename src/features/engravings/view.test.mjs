import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENGRAVING_STAT_TABS,engravingCapNote,engravingMoveChoices,engravingShopProducts,engravingSlotCandidates,equipButtonLabel,matchesEngravingTab,transferHolder,
} from './view.ts';

const option=fields=>({id:'1',name:'体力刻印',slot:'ability',effect:'体力+60',levelMin:1,bound:false,statKeys:['hp'],era:'2013',ready:true,
  maxOwned:2,stock:0,equipped:0,equippedHere:false,equipMode:'stock',owned:0,canBuy:true,...fields});
const holders=[{uid:'a',name:'甲'},{uid:'b',name:'乙'}];
const noFilter={slot:'all',kind:'all',stat:'',move:'',group:'',search:''};

test('a transfer moves the chosen holder\'s copy, else the first holder\'s',()=>{
  const moving=option({equipMode:'transfer',transferFrom:holders});
  assert.equal(transferHolder(moving,'b'),holders[1]);assert.equal(transferHolder(moving,'gone'),holders[0]);
  assert.equal(transferHolder(option({equipMode:'stock'}),'a'),undefined);
  assert.deepEqual([moving,option({}),option({equippedHere:true})].map(equipButtonLabel),['确认移装','确认装备','已装备']);
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

test('PetBag candidates exclude unready engravings and those it cannot equip, and tabs combine scope with stats or groups',()=>{
  const listed=engravingSlotCandidates([option({id:'stock'}),option({id:'here',equippedHere:true,equipMode:'blocked'}),option({id:'none',equipMode:'blocked'}),
    option({id:'unready',ready:false}),option({id:'bound',bound:true,equipMode:'unlimited'}),option({id:'skill',slot:'skill'})],'ability');
  assert.deepEqual(listed.map(o=>o.id),['bound','stock','here']);
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
