import assert from 'node:assert/strict';
import test from 'node:test';
import {createItemShopViews,isShopItemAvailable} from './item-shop.ts';

const definitions=[{id:'potion',kind:'battle'},{id:'essence_a',kind:'essence'},{id:'essence_b',kind:'essence'}];

test('essences become products only once unlocked',()=>{
  assert(isShopItemAvailable(definitions[0],new Set()));
  assert(!isShopItemAvailable(definitions[1],new Set()));
  assert(isShopItemAvailable(definitions[1],new Set(['essence_a'])));
});

test('rows are reused while stock is unchanged, also when the unlock list grows in place',()=>{
  const views=createItemShopViews(definitions),unlocked=[];
  const first=views({potion:2},unlocked);
  assert.deepEqual(first,[{id:'potion',kind:'battle',count:2}]);
  assert.equal(views({potion:2},unlocked),first);
  unlocked.push('essence_b');
  const second=views({potion:2},unlocked);
  assert.deepEqual(second.map(row=>row.id),['potion','essence_b']);
  assert.equal(second[0],first[0],'an unchanged row keeps its identity');
  const third=views({potion:3},unlocked);
  assert.equal(third[1],second[1]);
  assert.equal(third[0].count,3);
});
