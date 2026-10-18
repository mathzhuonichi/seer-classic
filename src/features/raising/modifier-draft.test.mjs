import assert from 'node:assert/strict';
import test from 'node:test';
import {monsterDraft,monsterEdit} from './modifier-draft.ts';

const monster={level:45,iv:31,natureId:'bold',traitId:undefined,evs:{hp:4,atk:252,def:0,spa:0,spd:0,spe:252}};

test('the modifier keeps number fields as typed and converts them on apply',()=>{
  const draft=monsterDraft(monster);
  assert.deepEqual([draft.level,draft.iv,draft.trait,draft.evs.atk],['45','31','','252']);
  assert.deepEqual(monsterEdit(draft),{total:508,edit:{level:45,iv:31,nature:'bold',evs:monster.evs,traitId:null}});
  assert.deepEqual(monsterEdit({...draft,level:''}),{total:508,edit:undefined},'a cleared field is invalid, not 0');
  assert.equal(monsterEdit({...draft,iv:'32'}).edit,undefined);
  assert.deepEqual(monsterEdit({...draft,evs:{...draft.evs,hp:''}}),{total:undefined,edit:undefined},'no 学习力 total while a field is blank');
  assert.equal(monsterEdit({...draft,level:'100',trait:'t1'}).edit?.traitId,'t1');
});
