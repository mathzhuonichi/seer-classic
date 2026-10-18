import assert from 'node:assert/strict';
import test from 'node:test';
import {createCatalogViews} from './catalog-views.ts';

const species=[{id:1,name:'布布种子'},{id:2,name:'布布草'},{id:3,name:'布布花'}];
const bosses=[{id:'a',name:'A'},{id:'b',name:'B'}];
const views=()=>createCatalogViews(species,bosses,(view,attempts)=>({...view,decorated:attempts}));

test('species rows keep their identity until the owned set changes',()=>{
  const catalog=views(),ledger=[2];
  const first=catalog.species(ledger);
  assert.deepEqual(first.map(row=>row.owned),[false,true,false]);
  assert.equal(catalog.species(ledger),first,'the same ledger array returns the cached rows');
  assert.equal(catalog.species([2]),first,'a replaced ledger with the same ids reuses the rows');
  ledger.push(3);
  const second=catalog.species(ledger);
  assert.notEqual(second,first,'appending in place is detected by length');
  assert.deepEqual(second.map(row=>row.owned),[false,true,true]);
  assert.equal(second[1],first[1],'unchanged rows keep their identity');
  assert.equal(catalog.species([]).every(row=>!row.owned),true);
});

test('boss rows are decorated once per progress change and otherwise reused',()=>{
  const catalog=views();
  const first=catalog.bosses([],{});
  assert.deepEqual(first.map(row=>[row.cleared,row.attempts,row.decorated]),[[false,0,0],[false,0,0]]);
  assert.equal(catalog.bosses([],{}),first);
  const second=catalog.bosses(['b'],{b:2});
  assert.notEqual(second,first);
  assert.equal(second[0],first[0],'an unchanged boss keeps its decorated row');
  assert.deepEqual([second[1].cleared,second[1].attempts,second[1].decorated],[true,2,2]);
  assert.equal(catalog.bosses(['b'],{b:2}),second);
});
