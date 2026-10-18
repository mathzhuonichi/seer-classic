import assert from 'node:assert/strict';
import test from 'node:test';
import {fitQuantity,shopBagLink,shopOrder,shopSearch} from './shop-views.ts';

test('shop orders stay within the product limit',()=>{
  const product={id:'e',name:'精元',kind:'essence',description:'',count:0,price:0,maxQuantity:999};
  assert.deepEqual(shopOrder(product,'10',false),{maximum:999,count:10,valid:true,presets:[1,5,10,99],locked:false,canBuy:true,hint:'免费补给，无需等待'});
  const hatch=shopOrder({...product,hatches:12,maxQuantity:4},'5',false);
  assert.deepEqual([hatch.valid,hatch.presets,hatch.hint],[false,[1,3,4],'数量须为 1 至 4 的整数']);
  assert.equal(shopOrder({...product,maxQuantity:0},'1',false).hint,'当前无法补充');
  const blocked=shopOrder({...product,blockedReason:'已达上限。'},'1',true);
  assert.deepEqual([blocked.locked,blocked.canBuy,blocked.hint],[true,false,'请先结束当前战斗']);
  assert.equal(shopOrder(undefined,'1',false).canBuy,false);
});

test('the typed quantity follows the product maximum',()=>{
  assert.equal(fitQuantity('4',0),'0','an exhausted allowance shows 0, not the last order');
  assert.equal(fitQuantity('0',3),'1','ordering opens again at 1');
  assert.equal(fitQuantity('5',3),'3');
  assert.equal(fitQuantity('2',3),'2');
  assert.equal(fitQuantity('',3),'','a cleared field stays cleared');
});

test('shop search matches names or the hatched species number',()=>{
  const product={id:'e',name:'Alpha精元',kind:'essence',hatches:12};
  assert(shopSearch(' #12 ').matches(product));
  assert(shopSearch('alpha').matches(product));
  assert(!shopSearch('13').matches(product));
  assert.equal(shopSearch('#').query,'');
});

test('the bag link shows only while the bag holds a copy of the product',()=>{
  const essence={id:'e',name:'精元',kind:'essence',description:'',count:0,price:0,hatches:12,maxQuantity:6};
  assert.equal(shopBagLink(essence),undefined,'an essence the bag does not hold has nothing to hatch');
  assert.equal(shopBagLink({...essence,count:1}),'前往道具背包孵化');
  assert.equal(shopBagLink({...essence,id:'s',kind:'battle',hatches:undefined,unlimited:true}),'前往背包取用','unlimited stock is always held');
  const finite={...essence,hatches:undefined};
  assert.equal(shopBagLink(finite),undefined);
  assert.equal(shopBagLink({...finite,count:2}),'查看道具背包');
});
