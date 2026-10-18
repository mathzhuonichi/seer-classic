import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createGame} from '../../src/kernel/game.ts';
import {loadCatalog} from '../../src/domain/catalog/catalog.ts';
import {newSave} from '../../src/kernel/save.ts';
import {STARTER_LEVEL,STARTER_SPECIES,STARTING_ITEM_STOCK} from '../../src/domain/economy.ts';
import {root,suite} from './_harness.mjs';

/** The seed of the fixture's journey; a new journey would seed itself from the clock. */
const JOURNEY_SEED=0x9a3e3;
const potion='item_potion_hp_20';

const t=suite('game-v3');
const catalog=await loadCatalog() as any;
const journey=newSave(JOURNEY_SEED);journey.items[potion]=STARTING_ITEM_STOCK;
const game=createGame(structuredClone(catalog),JSON.stringify(journey));
for(const species of STARTER_SPECIES)game.dispatch({type:'cheatAcquire',species,level:STARTER_LEVEL});
const initial=game.snapshot();
const keys=['hp','atk','def','spa','spd','spe'] as const;
t.check('all1483 base-stat views',()=>{
  assert.equal(initial.species.length,1483);
  for(const sp of initial.species){const original=catalog.species.find((x:any)=>x.id===sp.id);assert.deepEqual(sp.baseStats,original.base);assert(keys.every(k=>Number.isInteger(sp.baseStats[k])))}
});
const uid=initial.party[0];
game.dispatch({type:'setEvs',uid,evs:{hp:0,atk:255,def:0,spa:0,spd:0,spe:255}});
const trained=game.snapshot().monsters.find(m=>m.uid===uid)!;
t.check('direct EV edit and recalculation',()=>{assert.equal(trained.evs.atk,255);assert.equal(trained.evs.spe,255);assert(trained.stats.atk>initial.monsters[0].stats.atk);});
t.check('reject overbudget/fractional EVs without changes',()=>{
  game.dispatch({type:'setEvs',uid,evs:{hp:1,atk:255,def:0,spa:0,spd:0,spe:255}});
  assert.deepEqual(game.snapshot().monsters.find(m=>m.uid===uid)!.evs,trained.evs);
  assert(game.snapshot().notices[0].includes('超过 510'));
  game.dispatch({type:'setEvs',uid,evs:{hp:0,atk:1.5,def:0,spa:0,spd:0,spe:0}});
  assert.deepEqual(game.snapshot().monsters.find(m=>m.uid===uid)!.evs,trained.evs);
});
const order=[...initial.party].reverse();game.dispatch({type:'reorderParty',uids:order});
const saved=game.exportSave();const restored=createGame(structuredClone(catalog),saved);
t.check('party order and save roundtrip',()=>{assert.deepEqual(game.snapshot().party,order);assert.deepEqual(restored.snapshot().party,order);assert.deepEqual(restored.snapshot().monsters.find(m=>m.uid===uid)!.evs,trained.evs);});
const beforeItems=restored.snapshot().items.find(i=>i.id===potion)!.count;
t.check('live battle inventory count',()=>{
  restored.dispatch({type:'startTraining',species:10,level:3});assert(restored.snapshot().battle);
  const beforeIneffectivePotion=restored.snapshot().battle!.log;
  restored.dispatch({type:'battleItem',itemId:potion,targetUid:uid});assert.equal(restored.snapshot().items.find(i=>i.id===potion)!.count,beforeItems);
  assert.deepEqual(restored.snapshot().battle!.log,beforeIneffectivePotion,'A full-HP potion must not advance combat.');
  const injuredSave=JSON.parse(saved);injuredSave.storage.find((monster:any)=>monster.uid===uid).hp=1;
  const injured=createGame(structuredClone(catalog),JSON.stringify(injuredSave));
  injured.dispatch({type:'startTraining',species:10,level:3});
  const offered=injured.snapshot().items.find(i=>i.id===potion)!,turnLog=injured.snapshot().battle!.log;
  assert(offered.unlimited,'Battle supplies are unlimited for the player.');assert(offered.useTargets!.includes(uid));
  injured.dispatch({type:'battleItem',itemId:potion,targetUid:uid});
  assert.equal(injured.snapshot().items.find(i=>i.id===potion)!.count,beforeItems,'An unlimited potion keeps the saved count.');
  assert(injured.snapshot().battle!.log.length>turnLog.length,'A potion used on an injured target takes the turn.');
});
t.check('retreat without rewards and close',()=>{
  const coins=restored.snapshot().coins,exp=restored.snapshot().expPool;
  restored.dispatch({type:'flee'});assert.equal(restored.snapshot().battle!.won,false);assert.equal(restored.snapshot().coins,coins);assert.equal(restored.snapshot().expPool,exp);assert(restored.snapshot().battle!.log.some(l=>l.includes('本次不发放战斗奖励')));
  restored.dispatch({type:'closeBattle'});assert.equal(restored.snapshot().battle,null);
});
// Find one ordinary random critical hit through the actual game adapter.
let criticalSeed=0;
t.check('ordinary catalog critical hit reaches an adapter frame',()=>{
  const seedSave=JSON.parse(game.exportSave());
  for(let seed=1;seed<=96;seed++){
    const raw=structuredClone(seedSave);raw.seed=seed;raw.rng_state=null;raw.party=[uid,...raw.party.filter((id:string)=>id!==uid)];
    const candidate=createGame(structuredClone(catalog),JSON.stringify(raw));
    candidate.dispatch({type:'cheatMonster',uid,level:100,traitId:null});candidate.dispatch({type:'heal'});
    const before=candidate.exportSave();candidate.dispatch({type:'startTraining',species:10,level:100});
    const attack=candidate.snapshot().battle!.player.skills.find(skill=>skill.category==='物理')!;
    candidate.dispatch({type:'move',skillId:attack.id});
    if(candidate.snapshot().battle!.animation.frames.some(frame=>frame.kind==='hit'&&frame.critical)){
      criticalSeed=seed;const out=path.join(root,'artifacts/presentation-v3');fs.mkdirSync(out,{recursive:true});
      fs.writeFileSync(path.join(out,'critical-visual-save.json'),before);fs.writeFileSync(path.join(out,'critical-visual-info.json'),JSON.stringify({seed,species:10,level:100,skill:attack.id}));break;
    }
  }
  assert(criticalSeed>0);
});
t.finish({traits:restored.snapshot().traits.length,ordinaryCatalogCriticalSeed:criticalSeed});
