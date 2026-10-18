import assert from 'node:assert/strict';
import test from 'node:test';
import {checkEvDraft,clearedDraft,draftEvs,EV_PRESETS,evDraft,isEvValue,presetDraft,sameEvs} from './ev-draft.ts';

const evs={hp:4,atk:252,def:0,spa:0,spd:0,spe:252};

test('a 学习力 draft round-trips and knows when it differs from the saved values', () => {
  const draft=evDraft(evs);
  assert.deepEqual(draft,{hp:'4',atk:'252',def:'0',spa:'0',spd:'0',spe:'252'});
  assert.deepEqual(draftEvs(draft),evs);
  assert(sameEvs(draft,evs));
  assert(!sameEvs({...draft,hp:'5'},evs));
  assert.deepEqual(clearedDraft(),{hp:'0',atk:'0',def:'0',spa:'0',spd:'0',spe:'0'});
});

test('presets put 255 on two stats', () => {
  for(const [name,keys] of Object.entries(EV_PRESETS)){
    const draft=presetDraft(name);
    for(const [key,value] of Object.entries(draft))assert.equal(value,keys.includes(key)?'255':'0',`${name} ${key}`);
    assert.deepEqual(checkEvDraft(draft),{valid:true,total:510,over:false,fits:true});
  }
});

test('checkEvDraft: whole numbers 0-255 per stat, at most 510 in total', () => {
  assert.equal(checkEvDraft({...clearedDraft(),atk:' 7 '}).valid,true);
  for(const bad of ['','  ','256','-1','1.5','x'])assert.equal(checkEvDraft({...clearedDraft(),atk:bad}).valid,false,JSON.stringify(bad));
  assert.deepEqual(checkEvDraft({hp:'255',atk:'255',def:'1',spa:'0',spd:'0',spe:'0'}),{valid:true,total:511,over:true,fits:false});
  assert.deepEqual([isEvValue(0),isEvValue(255),isEvValue(256),isEvValue(2.5)],[true,true,false,false]);
});
