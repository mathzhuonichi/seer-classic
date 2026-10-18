import assert from 'node:assert/strict';
import test from 'node:test';
import {appearanceOf,speciesName,speciesNamer,speciesNumber,statTotal} from './monster-views.ts';

test('monster views: appearance, names and totals', () => {
  const s={species:[{id:7,name:'小火猴'}]};
  assert.deepEqual([appearanceOf({species:7}),appearanceOf({species:7,appearanceSpecies:3})],[7,3]);
  assert.deepEqual([speciesName(s,7,'精灵'),speciesName(s,8,'精灵')],['小火猴','精灵']);
  const name=speciesNamer(s.species);
  assert.deepEqual([name(7),name(8)],['小火猴','精灵 8']);
  assert.equal(speciesNamer(s.species),name,'The lookup keeps its identity while the list is unchanged.');
  assert.equal(speciesNumber(7),'0007');
  assert.equal(statTotal({hp:4,atk:252,def:0,spa:0,spd:0,spe:252}),508);
});
