/** Bounded full battles using every authored addition as a lead. Not a balance benchmark. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {withSsr} from './_harness.mjs';

const report={battles:[],failures:[]};
await withSsr('elite-battles-v46',async load=>{
  const [{loadCatalog},{createFacilityEncounter},{createBattle},{buildDataSet,Rng},{SEER_SCRIPTS},{npcTrainingScripts}]=await Promise.all([
    '/src/domain/catalog/catalog.ts','/src/domain/challenges/battle-facilities.ts','/tools/verification/_battle.ts','/battle/core/src/index.ts','/battle/core/src/scripts/index.ts','/src/domain/challenges/npc-training-scripts.ts',
  ].map(load));
  const catalog=await loadCatalog(),before=JSON.stringify(catalog),data=buildDataSet(catalog);
  const ids=JSON.parse(fs.readFileSync('data/elite-roster.json','utf8')).additions.map(row=>row.species);
  for(let index=0;index<ids.length;index++) {
    const seed=4600+index,group=Array.from({length:6},(_,offset)=>ids[(index+offset)%ids.length]);
    const authored=createFacilityEncounter({...catalog,species:catalog.species.filter(mon=>group.includes(mon.id))},'elite',new Rng(seed));
    authored.team.sort((a,b)=>group.indexOf(a.species)-group.indexOf(b.species));
    const sampled=createFacilityEncounter(catalog,'elite',new Rng(seed+100));
    const battle=createBattle({data,scripts:{...SEER_SCRIPTS,...npcTrainingScripts},seed,maxTurns:200,
      sides:[{kind:'trainer',team:sampled.team,ai:sampled.ai}],encounter:authored});
    let calls=0;
    while(!battle.result&&calls++<250)battle.resolveTurn();
    assert(battle.result,`Lead ${ids[index]} failed to finish`);
    assert(battle.turn<=200);assert.deepEqual(battle.warnings,[]);
    for(const side of battle.sides)for(const mon of side.team) {
      assert(Number.isFinite(mon.hp)&&mon.hp>=0&&mon.hp<=mon.maxHp);
      assert(Object.values(mon.pp).every(pp=>Number.isFinite(pp)&&pp>=0));
      assert(Object.values(mon.stages).every(stage=>Number.isFinite(stage)&&stage>=-6&&stage<=6));
    }
    report.battles.push({seed,lead:ids[index],authoredTeam:group,sampledTeam:sampled.team.map(mon=>mon.species),turns:battle.turn,result:battle.result.reason,winner:battle.result.winner});
  }
  assert.equal(JSON.stringify(catalog),before);
}).catch(error=>{report.failures.push(String(error.stack));});
fs.mkdirSync('artifacts/elite-roster-v46',{recursive:true});fs.writeFileSync('artifacts/elite-roster-v46/full-battles.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({battles:report.battles.length,turns:report.battles.map(row=>row.turns),failures:report.failures},null,2));
if(report.failures.length)process.exitCode=1;
