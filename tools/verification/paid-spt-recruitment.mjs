/** Verify official paid-option initial rewards and named distinct SPT gates in Vite's real module environment. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom'});
try {
  const registry=await server.ssrLoadModule('/src/progression/spt-recruitment.ts');
  const {PAID_SPT_RECRUITMENTS:quests,getSPTRecruitmentProgress:progress,buildPaidSPTRecruitments:build,getEligibleRecruitmentSPTs:eligible,EXCLUDED_RECRUITMENT_SPECIES:excluded}=registry;
  const catalog=JSON.parse(fs.readFileSync('data/gamedata.json'));
  catalog.bosses=fs.readdirSync('data/bosses').filter(name=>name.endsWith('.json')).map(name=>JSON.parse(fs.readFileSync('data/bosses/'+name)));
  const definitions=new Map(catalog.species.map(species=>[species.id,species]));
  const bosses=new Map(catalog.bosses.map(boss=>[boss.id,boss]));
  assert.ok(quests.length>0);
  assert.equal(new Set(quests.map(q=>q.questId)).size,quests.length);
  assert.equal(new Set(quests.map(q=>q.rewardSpecies)).size,quests.length);
  for(const quest of quests) {
    const species=definitions.get(quest.rewardSpecies);assert.ok(species);assert.ok(!species.evolves_from);
    assert.ok(!catalog.species.some(s=>s.evolution.some(e=>e.to===species.id)));
    assert.ok(!excluded.has(species.id));assert.ok(quest.evidence.some(e=>e.currency==='diamonds'&&e.price>0));
    assert.ok(quest.prerequisiteBossIds.length>0&&quest.prerequisiteBossIds.length<=5);
    assert.equal(new Set(quest.prerequisiteBossIds).size,quest.prerequisiteBossIds.length);
    const required=quest.prerequisiteBossIds.map(id=>bosses.get(id));
    assert.ok(required.every(b=>b.category==='spt'&&b.team.length===1&&b.team[0].species<species.id&&!excluded.has(b.team[0].species)));
    assert.equal(new Set(required.map(b=>b.team[0].species)).size,required.length);
    assert.equal(progress(quest,[]).complete,false);
    assert.equal(progress(quest,[...Array(10).fill(quest.prerequisiteBossIds[0]),'boss_puni','boss_campaign_qinglong_guardians','boss_tower_brave_1']).completed,1);
    assert.equal(progress(quest,quest.prerequisiteBossIds.slice(1)).complete,false);
    assert.equal(progress(quest,[...quest.prerequisiteBossIds,quest.prerequisiteBossIds[0]]).complete,true);
  }
  assert.equal(progress({prerequisiteBossIds:[]},[]).complete,false);
  assert.deepEqual(build({...catalog,bosses:[]}),[]);
  const inherited=eligible(catalog);const fake={id:'boss_spt_fake_divine',category:'spt',team:[{species:503}]};
  assert.deepEqual(eligible({...catalog,bosses:[...catalog.bosses,fake]}),inherited);
  const adult=catalog.species.find(s=>s.evolves_from);const source=quests[0];assert.deepEqual(build(catalog,[{...source,rewardSpecies:adult.id}]),[]);
  const initial=await server.ssrLoadModule('/src/progression/initial-acquisition.ts');
  const roots=initial.buildInitialFormAcquisitionIndex(catalog,new Map(catalog.species.map(s=>[s.id,{status:excluded.has(s.id)?'npc':'unimplemented',routes:[]}])));
  const unsupported=[];
  for(const q of quests)for(const evidence of q.evidence){const root=roots.get(evidence.sourceSpecies);assert.ok(root.initialForms.some(form=>form.species===q.rewardSpecies));const form=root.initialForms.find(form=>form.species===q.rewardSpecies);if(form.evolutionPath.some(step=>!step.implemented))unsupported.push({rewardSpecies:q.rewardSpecies,sourceSpecies:evidence.sourceSpecies,unimplementedSteps:form.evolutionPath.filter(step=>!step.implemented)});}
  fs.mkdirSync('artifacts/paid-spt-recruitment-v23',{recursive:true});fs.writeFileSync('artifacts/paid-spt-recruitment-v23/verified-quests.json',JSON.stringify({questCount:quests.length,quests,unimplementedSourceTransformationPaths:unsupported},null,2)+'\n');
  console.log(`Verified ${quests.length} evidenced initial-form quests, distinct lower-number SPT gates, false empty/partial/repeated gates, divine/NPC/adult exclusion, and source ancestry.`);
  console.log(`Unimplemented source transformation paths: ${unsupported.length} evidence entries; see verified-quests.json.`);
}finally{await server.close();}
