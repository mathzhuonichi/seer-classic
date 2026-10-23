import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {NEUTRAL_NATURE_TEXT,appearanceOf,natureEffect,speciesNamer,speciesNumber,statTotal} from './monster-views.ts';

test('monster views: appearance, names and totals', () => {
  const s={species:[{id:7,name:'小火猴'}]};
  assert.deepEqual([appearanceOf({species:7}),appearanceOf({species:7,appearanceSpecies:3})],[7,3]);
  const name=speciesNamer(s.species);
  assert.deepEqual([name(7),name(8)],['小火猴','精灵 8']);
  assert.equal(speciesNamer(s.species),name,'The lookup keeps its identity while the list is unchanged.');
  assert.equal(speciesNumber(7),'0007');
  assert.equal(statTotal({hp:4,atk:252,def:0,spa:0,spd:0,spe:252}),508);
});

test('a nature reads the stat it raises and the one it lowers, by the raising rules', () => {
  assert.equal(natureEffect({plus:'atk',minus:'def'}),'攻击 +10%，防御 -10%');
  assert.equal(natureEffect({plus:'spe',minus:'spa'}),'速度 +10%，特攻 -10%');
  assert.equal(natureEffect({plus:'def',minus:'def'}),NEUTRAL_NATURE_TEXT);
  const natures=JSON.parse(fs.readFileSync(new URL('../../data/natures.json',import.meta.url),'utf8'));
  const neutral=natures.filter(nature=>natureEffect(nature)===NEUTRAL_NATURE_TEXT).map(nature=>nature.name.zh);
  assert.equal(natures.length,25);
  assert.equal(neutral.length,5,`neutral natures: ${neutral.join('、')}`);
});
