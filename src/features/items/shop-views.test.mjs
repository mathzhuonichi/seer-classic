import assert from 'node:assert/strict';
import test from 'node:test';
import {shopOrder,shopSearch} from './shop-views.ts';

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

test('shop search matches names or the hatched species number',()=>{
  const product={id:'e',name:'Alpha精元',kind:'essence',hatches:12};
  assert(shopSearch(' #12 ').matches(product));
  assert(shopSearch('alpha').matches(product));
  assert(!shopSearch('13').matches(product));
  assert.equal(shopSearch('#').query,'');
});
