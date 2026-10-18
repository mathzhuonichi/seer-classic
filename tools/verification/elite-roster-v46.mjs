/** Explicit elite admission, reviewed loadouts, sampling and ordinary-mode isolation. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';

const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error'});
const checks=[],failures=[],builds=[],changedOriginalEliteBuilds=[];
const check=(name,run)=>{try{run();checks.push(name);}catch(error){failures.push({name,error:String(error.stack)});console.error(`FAIL ${name}: ${error.message}`);}};
const keys=['hp','atk','def','spa','spd','spe'],sum=sp=>keys.reduce((n,key)=>n+sp.base[key],0),sorted=xs=>[...xs].sort((a,b)=>a-b);
const APPROVED={
  70:[10825,20364,10823,10166],261:[10715,20312,10710,10714],421:[11140,20564,10632,11135],468:[11224,20486,20488,11017],
  774:[11884,20486,20957,10981],798:[11925,20982,11924,10223],865:[12079,21070,12080,10060],875:[12112,21090,11919,12110],
  927:[12217,20114,12216,10254],1260:[12937,20486,21533,12934],1447:[12079,21070,12080,10060],1477:[13423,21817,13422,13421],
  359:[20143,10882,20397,10321],356:[20398,10876,10874,10289],755:[20932,11841,20931,11837],599:[20749,11508,20750,20488],
  587:[20731,20730,20732,11470],990:[12355,11293,21224,12358],826:[11994,21020,20538,11996],691:[11690,10321,20185,11691],432:[11165,11078,20535,11081],
};
try {
  const [{loadCatalog},{facilityPool,eliteFacilityPool,createFacilityEncounter,buildFacilityViews},{trainerSkillOrigin},{normalizeNpcTrainingEncounter},{npcTrainingScripts},{createBattle,buildDataSet,Rng},{SEER_SCRIPTS},{computeStats}]=await Promise.all([
    '/src/domain/catalog/catalog.ts','/src/domain/challenges/battle-facilities.ts','/src/domain/challenges/trainer-skills.ts','/src/domain/challenges/npc-training.ts','/src/domain/challenges/npc-training-scripts.ts','/battle/core/src/index.ts','/battle/core/src/scripts/index.ts','/battle/core/src/stats.ts',
  ].map(path=>server.ssrLoadModule(path)));
  const catalog=await loadCatalog(),snapshot=JSON.stringify(catalog),data=buildDataSet(catalog),defs=JSON.parse(fs.readFileSync('data/elite-roster.json','utf8'));
  const species=new Map(catalog.species.map(s=>[s.id,s])),skills=new Map(catalog.skills.map(s=>[s.id,s]));
  const raw=facilityPool(catalog,600),pool=eliteFacilityPool(catalog),approvedIds=Object.keys(APPROVED).map(Number),ids=new Set(pool.map(s=>s.id));
  const suspicious=skill=>(skill.effects??[]).some(fx=>fx.op==='multi_hit'&&(fx.min??2)===(fx.max??fx.min??2))&&!(skill.seer_effects??[]).some(fx=>fx.eff===31);
  const excludedRecovery=new Set([20309,20607,20009,20590,20027,20116,21373,20034]);
  const profileFor=id=>id===70?'rei-classic-full':id===261?'gaia-evil-seal':undefined;
  const expectedStats=mon=>{const out=computeStats(species.get(mon.species).base,100,31,mon.evs,data.natures.get(mon.nature));if(mon.species===70)for(const [key,value] of Object.entries({hp:60,atk:20,def:30,spa:10,spd:20,spe:20}))out[key]+=value;return out;};
  function sixContaining(member,candidates=pool){return [member,...candidates.filter(s=>s.id!==member.id).slice(0,5)];}
  function generatedFor(member,mode='elite',source=catalog){const input={...source,species:sixContaining(member)};return createFacilityEncounter(input,mode,new Rng(46)).team.find(m=>m.species===member.id);}
  check('Raw BST admission stays 103 while elite adds exactly the approved roster and excludes both rejected specialists',()=>{
    assert.equal(raw.length,103);assert.equal(pool.length,103+approvedIds.length);assert.equal(new Set(pool.map(s=>s.id)).size,pool.length);
    assert.deepEqual(sorted(pool.map(s=>s.id)),sorted([...raw.map(s=>s.id),...approvedIds]));
    assert.deepEqual(sorted(defs.additions.map(row=>row.species)),sorted(approvedIds));assert.deepEqual(sorted(defs.excludedCandidates),[110,177]);
    assert(!ids.has(110)&&!ids.has(177));assert(approvedIds.every(id=>sum(species.get(id))<600));assert.equal(facilityPool(catalog).length,1479);
  });
  check('Stable elite ID exposes the new name and exact pool size',()=>{
    const view=buildFacilityViews(catalog).find(v=>v.id==='elite');assert.equal(view.name,'巅峰对决');assert.equal(view.poolSize,pool.length);assert(view.description.includes(`${approvedIds.length} 只`));
    const encounter=createFacilityEncounter(catalog,'elite',new Rng(46));assert.equal(encounter.id,'facility_elite');assert.equal(encounter.facility,'elite');assert.equal(encounter.name.zh,'巅峰对决 · 随机六人队');
  });
  for(const id of approvedIds)check(`${id}: four reviewed legal moves, bounded EVs and only the explicit training profile`,()=>{
    const row=defs.additions.find(r=>r.species===id),member=generatedFor(species.get(id));assert(member);assert.equal(row.name,species.get(id).name.zh);assert.equal(row.reviewedBaseTotal,sum(species.get(id)));
    assert.deepEqual(member.skills,APPROVED[id]);assert.equal(new Set(member.skills).size,4);assert.equal(member.level,100);assert.equal(member.iv,31);assert.equal(member.nature,'hardy');
    assert.equal(keys.reduce((n,k)=>n+(member.evs[k]??0),0),510);assert(keys.every(k=>Number.isInteger(member.evs[k]??0)&&(member.evs[k]??0)>=0&&(member.evs[k]??0)<=255));
    for(const skill of member.skills){assert(trainerSkillOrigin(catalog,id,skill));for(const fx of skills.get(skill).effects.filter(fx=>fx.op==='multi_hit'))assert(skills.get(skill).seer_effects.some(source=>source.eff===31&&source.args[0]===fx.min&&source.args[1]===fx.max));assert(skills.get(skill).pp>0);}
    assert.equal(member.training_profile,profileFor(id));assert(!('hp_override' in member));assert(!('stat_multipliers' in member));assert(!('beads' in member));assert(!('member_phases' in member));
    if(id===70){assert.deepEqual(member.evs,{atk:255,spe:255});assert.deepEqual(member.stats,{hp:343,atk:335,def:206,spa:248,spd:210,spe:329});assert(!member.member_rules);}
    else {assert(!member.stats);if(id===261)assert.deepEqual(member.member_rules,[{rule:'script',id:'npc_gaia_evil_seal'}]);else assert(!member.member_rules);}
    builds.push({species:id,name:row.name,baseTotal:row.reviewedBaseTotal,build:member});
  });
  check('All elite members initialize correctly in six-member teams with finite PP, zero stages and no source mutation',()=>{
    const covered=new Set();
    for(let offset=0;offset<pool.length;offset+=6){const chunk=pool.slice(offset,offset+6);for(const s of pool){if(chunk.length===6)break;if(!chunk.some(m=>m.id===s.id))chunk.push(s);}
      const input={...catalog,species:chunk},bytes=JSON.stringify(input),encounter=createFacilityEncounter(input,'elite',new Rng(offset+1));assert.equal(encounter.team.length,6);assert.equal(new Set(encounter.team.map(m=>m.species)).size,6);
      assert.deepEqual(normalizeNpcTrainingEncounter(input,encounter),encounter,'The controller can normalize an already prepared encounter again');
      const battle=createBattle({data,scripts:{...SEER_SCRIPTS,...npcTrainingScripts},seed:46,sides:[{kind:'player',team:[{species:1,level:100,skills:[10001]}]}],encounter});assert.deepEqual(battle.warnings,[]);
      for(const [index,member] of encounter.team.entries()){const actual=battle.sides[1].team[index];covered.add(member.species);assert.deepEqual(actual.stats,expectedStats(member));assert(Object.values(actual.stages).every(value=>value===0));
        assert(member.skills.every(id=>actual.pp[id]===skills.get(id).pp));assert(member.skills.every(id=>!suspicious(skills.get(id))));
        assert.deepEqual(actual.conditions.filter(c=>c.id.startsWith('npc_gaia_')).map(c=>c.id),member.species===261?['npc_gaia_evil_seal']:[]);
        assert(encounter.team.filter(m=>m!==member).some(m=>m.skills.some(id=>skills.get(id).power>0)),'Every support starts with at least one ordinary damaging reserve');}
      assert.equal(JSON.stringify(input),bytes);
    }
    assert.deepEqual(sorted(covered),sorted(ids));
  });
  check('The original 103 elite candidates keep their ordinary formulas; changed skill choices are only the elite multi-hit and direct-recovery policies',()=>{
    for(const mon of raw){const ordinary=generatedFor(mon,'random'),elite=generatedFor(mon);
      const {skills:ordinaryMoves,...ordinaryRest}=ordinary,{skills:eliteMoves,...eliteRest}=elite;assert.deepEqual(eliteRest,ordinaryRest);
      assert(eliteMoves.every(id=>!suspicious(skills.get(id))));
      if(JSON.stringify(ordinaryMoves)!==JSON.stringify(eliteMoves)){assert(ordinaryMoves.some(id=>suspicious(skills.get(id))||excludedRecovery.has(id)));changedOriginalEliteBuilds.push({species:mon.id,name:mon.name.zh,ordinaryMoves,eliteMoves,excluded:ordinaryMoves.filter(id=>suspicious(skills.get(id))||excludedRecovery.has(id))});}
    }
  });
  check('Ordinary random encounters still use natural skills and no authored training or support loadouts',()=>{
    for(const id of approvedIds){const member=generatedFor(species.get(id),'random');assert.equal(member.training_profile,undefined);assert.equal(member.stats,undefined);assert.equal(member.member_rules,undefined);
      assert(member.skills.every(skill=>species.get(id).learnset.some(entry=>entry.skill===skill&&Number.isInteger(entry.level)&&entry.level>=1&&entry.level<=100)));
      const offense=species.get(id).base.atk>=species.get(id).base.spa?'atk':'spa';assert.deepEqual(member.evs,{hp:255,[offense]:255});
    }
    const rei=generatedFor(species.get(70),'random');assert(!rei.skills.some(id=>[10825,20364,10823,10824,20363].includes(id)));
  });
  check('True effect-31 multi-hit remains eligible while unsupported fixed multi-hit is excluded only in elite',()=>{
    const members=raw.slice(0,6).map(s=>structuredClone(s)),lead=members[0],category=lead.base.atk>=lead.base.spa?'physical':'special',attackType=lead.types[0];
    const makeSkill=(id,eff)=>({id,name:{zh:'Elite selection fixture'},type:attackType,category,power:id===990461?1000:900,accuracy:null,pp:10,priority:0,effects:[{op:'multi_hit',min:2,max:2}],seer_effects:[{eff,args:[2,2]}]});
    lead.learnset.push({level:100,skill:990461},{level:100,skill:990462});
    const input={...catalog,species:members,skills:[...catalog.skills,makeSkill(990461,10),makeSkill(990462,31)]};
    const elite=createFacilityEncounter(input,'elite',new Rng(1)).team.find(m=>m.species===lead.id),random=createFacilityEncounter(input,'random',new Rng(1)).team.find(m=>m.species===lead.id);
    assert(!elite.skills.includes(990461));assert(elite.skills.includes(990462));assert(random.skills.includes(990461));
  });
  check('Sampling is seeded, uniform without replacement and consumes exactly six bounded draws',()=>{
    for(const seed of [1,2,7,46,101,2026]){const rng=new Rng(seed),calls=[],wrapped={int:(min,max)=>{calls.push([min,max]);return rng.int(min,max);}};
      const first=createFacilityEncounter(catalog,'elite',wrapped),second=createFacilityEncounter(catalog,'elite',new Rng(seed));assert.deepEqual(first,second);assert.equal(first.team.length,6);assert.equal(new Set(first.team.map(m=>m.species)).size,6);assert(first.team.every(m=>ids.has(m.species)));
      assert.deepEqual(calls,Array.from({length:6},(_,i)=>[i,pool.length-1]));}
  });
  check('Support descriptions agree with real effect IDs and do not invent stage inheritance',()=>{
    assert(skills.get(APPROVED[359][0]).effects.some(f=>f.op==='script'&&f.id==='seer_eff_28'));
    for(const id of [356,755])assert(skills.get(APPROVED[id][0]).effects.some(f=>f.op==='script'&&f.id==='seer_eff_71'));
    assert.deepEqual(skills.get(20749).effects,[{op:'script',id:'seer_eff_59',params:[4,5]}]);assert(defs.additions.find(r=>r.species===599).selectionReason.includes('does not copy current stages'));
  });
  assert.equal(JSON.stringify(catalog),snapshot);
}catch(error){failures.push({name:'harness',error:String(error.stack)});}
finally{
  const report={checks,failures,approvedAdditionalIds:sorted(Object.keys(APPROVED).map(Number)),builds,changedOriginalEliteBuilds};
  fs.mkdirSync('artifacts/elite-roster-v46',{recursive:true});fs.writeFileSync('artifacts/elite-roster-v46/regression.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,failures,additionalSpecies:Object.keys(APPROVED).length,changedOriginalEliteBuilds:changedOriginalEliteBuilds.length},null,2));await server.close();if(failures.length)process.exitCode=1;
}
