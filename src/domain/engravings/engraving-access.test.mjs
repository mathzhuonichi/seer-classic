import assert from 'node:assert/strict';
import test from 'node:test';
import {engravingAccess,equipMode} from './engraving-access.ts';

const speed15={id:'10031',slot:'ability',stats:{spe:15},species:[],maxOwned:99};

test('finite engravings take a spare copy below the cap, else move one from another holder',()=>{
  assert.deepEqual(engravingAccess(speed15),{unlimited:false,maxOwned:2});
  assert.equal(equipMode(speed15,1,1,1),'stock');
  assert.equal(equipMode(speed15,0,1,1),'transfer','no spare copy in stock');
  assert.equal(equipMode(speed15,3,2,1),'transfer','every allowed copy is equipped');
  assert.equal(equipMode(speed15,0,0,0),'blocked');
  assert.equal(equipMode(speed15,1,2,0),'blocked','at the cap without another holder');
});

test('bound and skill engravings need no copy',()=>{
  assert.equal(equipMode({...speed15,species:[15]},0,4,0),'unlimited');
  assert.equal(equipMode({...speed15,slot:'skill',stats:{}},0,0,0),'unlimited');
});
