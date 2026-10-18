import assert from 'node:assert/strict';
import test from 'node:test';
import {isShopItemAvailable} from './item-shop.ts';

const definitions=[{id:'potion',kind:'battle'},{id:'essence_a',kind:'essence'},{id:'essence_b',kind:'essence'}];

test('essences become products only once unlocked',()=>{
  assert(isShopItemAvailable(definitions[0],new Set()));
  assert(!isShopItemAvailable(definitions[1],new Set()));
  assert(isShopItemAvailable(definitions[1],new Set(['essence_a'])));
});
