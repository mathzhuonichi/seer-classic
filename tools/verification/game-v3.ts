import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createGame} from '../../src/game';
import type {CatalogData} from '../../src/mechanics/catalog';
const root=process.cwd();
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/gamedata.json'),'utf8'));
catalog.bosses=fs.readdirSync(path.join(root,'data/bosses')).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(fs.readFileSync(path.join(root,'data/bosses',n),'utf8')));
const game=createGame(structuredClone(catalog) as CatalogData);
const initial=game.snapshot();
assert.equal(initial.species.length,1483);
const keys=['hp','atk','def','spa','spd','spe'] as const;
for(const sp of initial.species){const original=catalog.species.find((x:any)=>x.id===sp.id);assert.deepEqual(sp.baseStats,original.base);assert(keys.every(k=>Number.isInteger(sp.baseStats[k])))}
const uid=initial.party[0];
game.dispatch({type:'setEvs',uid,evs:{hp:0,atk:255,def:0,spa:0,spd:0,spe:255}});
const trained=game.snapshot().monsters.find(m=>m.uid===uid)!;
assert.equal(trained.evs.atk,255);assert.equal(trained.evs.spe,255);assert(trained.stats.atk>initial.monsters[0].stats.atk);
game.dispatch({type:'setEvs',uid,evs:{hp:1,atk:255,def:0,spa:0,spd:0,spe:255}});
assert.deepEqual(game.snapshot().monsters.find(m=>m.uid===uid)!.evs,trained.evs);
assert(game.snapshot().notices[0].includes('超过 510'));
game.dispatch({type:'setEvs',uid,evs:{hp:0,atk:1.5,def:0,spa:0,spd:0,spe:0}});
assert.deepEqual(game.snapshot().monsters.find(m=>m.uid===uid)!.evs,trained.evs);
const order=[...initial.party].reverse();game.dispatch({type:'reorderParty',uids:order});assert.deepEqual(game.snapshot().party,order);
const saved=game.exportSave();const restored=createGame(structuredClone(catalog),saved);assert.deepEqual(restored.snapshot().party,order);assert.deepEqual(restored.snapshot().monsters.find(m=>m.uid===uid)!.evs,trained.evs);
const potion='item_potion_hp_20',beforeItems=restored.snapshot().items.find(i=>i.id===potion)!.count;
restored.dispatch({type:'startTraining',species:10,level:3});assert(restored.snapshot().battle);
const beforeIneffectivePotion=restored.snapshot().battle!.log;
restored.dispatch({type:'battleItem',itemId:potion,targetUid:uid});assert.equal(restored.snapshot().items.find(i=>i.id===potion)!.count,beforeItems);
assert.deepEqual(restored.snapshot().battle!.log,beforeIneffectivePotion,'A full-HP potion must not advance combat.');
const injuredSave=JSON.parse(saved);injuredSave.storage.find((monster:any)=>monster.uid===uid).hp=1;
const injured=createGame(structuredClone(catalog),JSON.stringify(injuredSave));
injured.dispatch({type:'startTraining',species:10,level:3});
assert(injured.snapshot().items.find(i=>i.id===potion)!.usableTargetUids.includes(uid));
injured.dispatch({type:'battleItem',itemId:potion,targetUid:uid});
assert.equal(injured.snapshot().items.find(i=>i.id===potion)!.count,beforeItems-1,'A potion used on an injured target is consumed.');
const coins=restored.snapshot().coins,exp=restored.snapshot().expPool;
restored.dispatch({type:'flee'});assert.equal(restored.snapshot().battle!.won,false);assert.equal(restored.snapshot().coins,coins);assert.equal(restored.snapshot().expPool,exp);assert(restored.snapshot().battle!.log.some(l=>l.includes('本次不发放战斗奖励')));
restored.dispatch({type:'closeBattle'});assert.equal(restored.snapshot().battle,null);
console.log(JSON.stringify({passed:['all1483 base-stat views','direct EV edit and recalculation','reject overbudget/fractional EVs without changes','party order and save roundtrip','live battle inventory count','retreat without rewards and close'],traits:restored.snapshot().traits.length}));
// Find one ordinary random critical hit through the actual game adapter.
const seedSave=JSON.parse(game.exportSave());let criticalSeed=0;
for(let seed=1;seed<=96;seed++){
 const raw=structuredClone(seedSave);raw.seed=seed;raw.rng_state=null;raw.party=[uid,...raw.party.filter((id:string)=>id!==uid)];
 const candidate=createGame(structuredClone(catalog),JSON.stringify(raw));
 candidate.dispatch({type:'cheatMonster',uid,level:100,traitId:null});candidate.dispatch({type:'heal'});
 const before=candidate.exportSave();candidate.dispatch({type:'startTraining',species:10,level:100});
 const attack=candidate.snapshot().battle!.player.skills.find(skill=>skill.category==='物理')!;
 candidate.dispatch({type:'move',skillId:attack.id});
 if(candidate.snapshot().battle!.animation.frames.some(frame=>frame.kind==='hit'&&frame.critical)){
  criticalSeed=seed;fs.mkdirSync(path.join(root,'artifacts/presentation-v3'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/presentation-v3/critical-visual-save.json'),before);fs.writeFileSync(path.join(root,'artifacts/presentation-v3/critical-visual-info.json'),JSON.stringify({seed,species:10,level:100,skill:attack.id}));break;
 }
}
assert(criticalSeed>0);console.log(JSON.stringify({ordinaryCatalogCriticalSeed:criticalSeed,adapterCriticalFrame:true}));
