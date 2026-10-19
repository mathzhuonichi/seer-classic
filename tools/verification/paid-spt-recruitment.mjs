/** Verify official paid-option initial rewards and named distinct SPT gates in Vite's real module environment. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {memoryStorage,root,suite,withSsr} from './_harness.mjs';

memoryStorage();
await withSsr('paid-spt-recruitment',async load=>{
  const t=suite('paid-spt-recruitment');
  const {getSPTRecruitmentProgress:progress,buildPaidSPTRecruitments:build,buildExcludedRecruitmentSpecies,getEligibleRecruitmentSPTs:eligible}=await load('/src/domain/acquisition/spt-recruitment.ts');
  const {buildInitialFormAcquisitionIndex}=await load('/src/domain/acquisition/initial-acquisition.ts');
  const catalog=await (await load('/src/domain/catalog/catalog.ts')).loadCatalog();
  const quests=build(catalog),excluded=buildExcludedRecruitmentSpecies(catalog);
  const definitions=new Map(catalog.species.map(species=>[species.id,species]));
  const bosses=new Map(catalog.bosses.map(boss=>[boss.id,boss]));
  t.check('distinct evidenced initial-form quests',()=>{
    assert.ok(quests.length>0);
    assert.equal(new Set(quests.map(q=>q.questId)).size,quests.length);
    assert.equal(new Set(quests.map(q=>q.rewardSpecies)).size,quests.length);
    for(const quest of quests) {
      const species=definitions.get(quest.rewardSpecies);assert.ok(species);assert.ok(!species.evolves_from);
      assert.ok(!catalog.species.some(s=>s.evolution.some(e=>e.to===species.id)));
      assert.ok(!excluded.has(species.id));assert.ok(quest.evidence.some(e=>e.currency==='diamonds'&&e.price>0));
    }
  });
  t.check('distinct lower-number SPT gates',()=>{
    for(const quest of quests) {
      assert.ok(quest.prerequisiteBossIds.length>0&&quest.prerequisiteBossIds.length<=5);
      assert.equal(new Set(quest.prerequisiteBossIds).size,quest.prerequisiteBossIds.length);
      const required=quest.prerequisiteBossIds.map(id=>bosses.get(id));
      assert.ok(required.every(b=>b.category==='spt'&&b.team.length===1&&b.team[0].species<quest.rewardSpecies&&!excluded.has(b.team[0].species)));
      assert.equal(new Set(required.map(b=>b.team[0].species)).size,required.length);
    }
  });
  t.check('false empty/partial/repeated gates',()=>{
    for(const quest of quests) {
      assert.equal(progress(quest,[]).complete,false);
      assert.equal(progress(quest,[...Array(10).fill(quest.prerequisiteBossIds[0]),'boss_puni','boss_campaign_qinglong_guardians','boss_tower_brave_1']).completed,1);
      assert.equal(progress(quest,quest.prerequisiteBossIds.slice(1)).complete,false);
      assert.equal(progress(quest,[...quest.prerequisiteBossIds,quest.prerequisiteBossIds[0]]).complete,true);
    }
    assert.equal(progress({prerequisiteBossIds:[]},[]).complete,false);
  });
  t.check('divine/NPC/adult exclusion',()=>{
    assert.deepEqual(build({...catalog,bosses:[]}),[]);
    const inherited=eligible(catalog);const fake={id:'boss_spt_fake_divine',category:'spt',team:[{species:503}]};
    assert.deepEqual(eligible({...catalog,bosses:[...catalog.bosses,fake]}),inherited);
    const adult=catalog.species.find(s=>s.evolves_from);assert.deepEqual(build(catalog,[{...quests[0],rewardSpecies:adult.id}]),[]);
  });
  const [{createGame},{newSave},{default:QuestPanel}]=await Promise.all(['/src/kernel/game.ts','/src/kernel/save.ts','/src/features/challenges/ui/QuestPanel.tsx'].map(load));
  t.check('a claimed essence is held; its quest card reads 可再次领取 and links to the bag',()=>{
    const save=newSave(0x5e7),pending=createGame(catalog,JSON.stringify(save)).snapshot().quests.find(q=>q.id===quests[0].questId);
    for(const condition of pending.prerequisites)if(condition.kind==='species')save.dex.owned.push(condition.species);else save.progress.bosses_cleared.push(condition.bossId);
    const game=createGame(catalog,JSON.stringify(save)),view=()=>game.snapshot().quests.find(q=>q.id===pending.id);
    const card=()=>renderToStaticMarkup(React.createElement(QuestPanel,{c:game,focusQuestId:pending.id,onTravel:()=>{},onOpenBag:()=>{}}));
    assert.equal(view().rewardName,definitions.get(pending.rewardSpecies).name.zh);assert(card().includes(`领取${view().rewardName}精元。`));
    assert.equal(view().claimable,true);assert.equal(view().rewardHeld,false);assert(!card().includes('quest-hatch-link'));
    assert(card().includes('>奖励已就绪<'),'A reward never taken reads 奖励已就绪');assert(!card().includes('可再次领取'));
    const result=game.dispatch({type:'claimQuest',questId:pending.id});
    assert.equal(result.ok,true);assert.match(result.notice,/^已领取.+精元，可到道具背包孵化。$/,'QuestPanel shows the claim notice');
    assert.equal(view().rewardHeld,true);assert(card().includes('quest-hatch-link'));
    assert.equal(view().repeatable,true);assert.equal(view().claimable,true);
    assert(card().includes('>可再次领取<'),'A repeatable reward taken before reads 可再次领取');assert(!card().includes('奖励已就绪'));
  });
  const unsupported=[];
  t.check('source ancestry',()=>{
    const roots=buildInitialFormAcquisitionIndex(catalog,new Map(catalog.species.map(s=>[s.id,{status:excluded.has(s.id)?'npc':'unimplemented',routes:[]}])));
    for(const q of quests)for(const evidence of q.evidence){
      const form=roots.get(evidence.sourceSpecies).initialForms.find(form=>form.species===q.rewardSpecies);assert.ok(form);
      if(form.evolutionPath.some(step=>!step.implemented))unsupported.push({rewardSpecies:q.rewardSpecies,sourceSpecies:evidence.sourceSpecies,unimplementedSteps:form.evolutionPath.filter(step=>!step.implemented)});
    }
  });
  const out=path.join(root,'artifacts/paid-spt-recruitment-v23');
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verified-quests.json'),JSON.stringify({questCount:quests.length,quests,unimplementedSourceTransformationPaths:unsupported},null,2)+'\n');
  console.log(`Unimplemented source transformation paths: ${unsupported.length} evidence entries; see verified-quests.json.`);
  t.finish({questCount:quests.length,unimplementedSourceTransformationPaths:unsupported.length});
});
