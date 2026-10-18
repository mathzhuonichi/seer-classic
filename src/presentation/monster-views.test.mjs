import assert from 'node:assert/strict';
import test from 'node:test';
import {appearanceOf,partyFirst,partyMonsters,speciesName,speciesNumber,statTotal} from './monster-views.ts';

test('monster views: party order, party-first roster, appearance, names and totals', () => {
  const mon=(uid,inParty,extra={})=>({uid,inParty,species:7,...extra});
  const s={party:['c','a','gone'],monsters:[mon('a',true),mon('b',false),mon('c',true)],species:[{id:7,name:'小火猴'}]};
  assert.deepEqual(partyMonsters(s).map(m=>m.uid),['c','a']);
  assert.deepEqual(partyFirst(s).map(m=>m.uid),['c','a','b']);
  assert.deepEqual([appearanceOf(mon('x',true)),appearanceOf(mon('x',true,{appearanceSpecies:3}))],[7,3]);
  assert.deepEqual([speciesName(s,7,'精灵'),speciesName(s,8,'精灵')],['小火猴','精灵']);
  assert.equal(speciesNumber(7),'0007');
  assert.equal(statTotal({hp:4,atk:252,def:0,spa:0,spd:0,spe:252}),508);
});
