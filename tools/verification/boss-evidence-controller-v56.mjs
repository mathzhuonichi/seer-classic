/** Independent V56 evidence, display and attempt-adapter checks through public controller actions. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root,sha256File,suite,withSsr} from './_harness.mjs';

const scope='Production controller and core objects, observed through the controller battle-factory seam. No browser, user save, development server, build, or package operation is used. Evidence classification is checked against the authored audit index; historical source correctness belongs to the source audit.';
let storageReads=0,storageWrites=0,networkRequests=0;
globalThis.localStorage={getItem:()=>{storageReads++;return null;},setItem:()=>{storageWrites++;},removeItem:()=>{}};
globalThis.fetch=()=>{networkRequests++;throw new Error('Evidence verification must remain offline.');};
const controllerFiles=fs.readdirSync(path.join(root,'src/controller')).sort().map(file=>`src/controller/${file}`);
await withSsr('boss-evidence-controller-v56',async load=>{
  const t=suite('boss-evidence-controller-v56'),{check}=t;
  const [{createGame:createProductionGame,loadCatalog},{bossEncounterForAttempt},{encounterLevel,encounterLevelText},{buildBossEvidence,buildBossEncounterEvidence,mergeBossEvidence},{makeDex,createMonster,SeededRng},{createBattle,buildDataSet},{SEER_SCRIPTS},{campaignScripts},{traitScripts},{npcTrainingScripts},{chooseAiAction},{lastSearchDecision}]=await Promise.all([
    '/src/game.ts','/src/mechanics/boss-encounter.ts','/src/presentation/encounter-level.ts','/src/presentation/boss-evidence.ts','/raising/core/index.ts','/battle/core/src/index.ts','/battle/core/src/scripts/index.ts','/src/mechanics/campaign-rules.ts','/src/mechanics/traits.ts','/src/mechanics/npc-training.ts','/battle/core/src/ai.ts','/battle/core/src/search-ai.ts',
  ].map(load));
  // The controller's real battles, observed through its battle-factory seam.
  const created=[];
  const createGame=(input,save)=>createProductionGame(input,save,{createBattle:options=>{const battle=createBattle(options);created.push(battle);return battle;}});
  const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const runtime=readJson('data/boss-evidence-runtime-v56.json'),audit=readJson('data/boss-evidence-v56.json'),ruleAudit=readJson('data/boss-rule-support-v56.json');
  const catalog=await loadCatalog(),catalogBefore=JSON.stringify(catalog),data=buildDataSet(catalog),dex=makeDex(catalog),rng=new SeededRng(56);
  const bosses=new Map(catalog.bosses.map(boss=>[boss.id,boss])),unsupported=new Map(ruleAudit.bosses.map(row=>[row.id,row.unsupported.length]));
  const fieldKeys=['level','iv','evs','nature','hp','skills','ai','rules'],statsKeys=fieldKeys.slice(0,6),statuses=new Set(['official','observed','authored','inferred']);
  const rank={official:0,observed:1,authored:2,inferred:3};
  const worst=rows=>rows.reduce((a,z)=>rank[z]>rank[a]?z:a,'official');
  const field=(view,key)=>view.fields.find(row=>row.key===key);
  const parse=game=>JSON.parse(game.exportSave());
  const base=parse(createGame(catalog,''));
  base.storage=Array.from({length:6},(_,i)=>createMonster(dex,70,100,rng,{uid:`evidence-v56-${i}`,iv:31,nature:'hardy'}));
  base.party=base.storage.map(mon=>mon.uid);base.game.traits={};base.game.modules={};base.game.engravingStock={};base.rng_state=[56,112,168,224];
  const make=(save=base)=>createGame(catalog,JSON.stringify(structuredClone(save)));
  const captured=()=>created.at(-1);
  function start(game,action){const count=created.length;game.dispatch(action);assert(game.snapshot().battle&&!game.snapshot().battle.finished,JSON.stringify(game.snapshot().notices));assert.equal(created.length,count+1);return captured();}
  function leave(game){game.dispatch({type:'flee'});assert.equal(game.snapshot().battle.resultReason,'flee');game.dispatch({type:'closeBattle'});assert.equal(game.snapshot().battle,null);}
  function reject(game,action,label){const before=game.exportSave(),battle=JSON.stringify(game.snapshot().battle),rngBefore=parse(game).rng_state,count=created.length;game.dispatch(action);assert.equal(game.exportSave(),before,`${label}: save`);assert.deepEqual(parse(game).rng_state,rngBefore,`${label}: RNG`);assert.equal(JSON.stringify(game.snapshot().battle),battle,`${label}: battle`);assert.equal(created.length,count,`${label}: no battle constructed`);}
  function assertMemberEvidence(view,boss,slot){
    assert(view,`${boss.id}/${slot}: evidence exists`);assert.deepEqual(view.fields.map(row=>row.key).sort(),[...fieldKeys].sort());
    const entry=runtime.encounters[boss.id],member=entry.members.find(row=>row.slot===slot),source=boss.team[slot];
    for(const key of fieldKeys)assert.equal(field(view,key).status,(member.fields[key]??entry.fields[key]).status,`${boss.id}/${slot}/${key}`);
    const mask=member.displayLevelUnknown??entry.displayLevelUnknown??false;
    assert.equal(view.displayLevelUnknown,mask);assert.equal(field(view,'level').value,source.level>100||mask?'??':String(source.level));
    assert.equal(field(view,'iv').value,String(source.iv??0));assert.equal(field(view,'skills').value,`${source.skills.length} 个技能`);
    if(source.hp_override)assert.equal(field(view,'hp').value,String(source.hp_override));
    assert.equal(view.incompleteRules,unsupported.get(boss.id));
    assert.equal(view.hasInferredStats,statsKeys.some(key=>field(view,key).status==='inferred'));
    assert.equal(view.hasInferredLevel,field(view,'level').status==='inferred');
  }

  check('The runtime and detailed evidence indexes cover exactly 180 encounters and 240 unique members',()=>{
    assert.equal(bosses.size,180);assert.deepEqual(Object.keys(runtime.encounters).sort(),[...bosses.keys()].sort());assert.deepEqual(Object.keys(audit.encounters).sort(),[...bosses.keys()].sort());
    let members=0;
    for(const boss of bosses.values()){
      const runtimeEntry=runtime.encounters[boss.id],detail=audit.encounters[boss.id];assert.equal(runtimeEntry.members.length,boss.team.length);assert.equal(detail.members.length,boss.team.length);
      assert.deepEqual(runtimeEntry.members.map(row=>row.slot),boss.team.map((_,slot)=>slot));
      const citedIds=new Set(JSON.stringify(detail).match(/src-[a-f0-9]+/g)??[]),allowedUrls=new Set([...detail.sourceUrls,...[...citedIds].map(id=>audit.sources[id]?.url)]);
      if(allowedUrls.size)assert(runtimeEntry.sourceUrls.length>0,`${boss.id}: retained references remain discoverable`);
      assert.equal(new Set(runtimeEntry.sourceUrls).size,runtimeEntry.sourceUrls.length);
      for(const url of runtimeEntry.sourceUrls)assert(allowedUrls.has(url),`${boss.id}: runtime URL is supported by an encounter or field citation`);
      for(const row of runtimeEntry.members){const source=boss.team[row.slot],detailed=detail.members.find(member=>member.slot===row.slot);assert.equal(row.species,source.species);assert.equal(detailed.species,source.species);members++;
        for(const key of statsKeys){assert(statuses.has(row.fields[key]?.status));assert.equal(row.fields[key].status,detailed.fields[key].status);}
        assert.equal(detailed.configured.level,source.level);assert.deepEqual(detailed.configured.skills,source.skills);assert.equal(detailed.configured.hp,source.hp_override??null);
      }
      for(const key of fieldKeys){assert(statuses.has(runtimeEntry.fields[key]?.status));assert.equal(runtimeEntry.fields[key].status,detail.fields[key].status);}
    }
    assert.equal(members,240);t.witness('evidence-index',{encounters:bosses.size,members});
  });
  check('Per-member presentation preserves independent evidence status, current values and unsupported counts',()=>{
    let count=0;for(const boss of bosses.values())for(let slot=0;slot<boss.team.length;slot++){assertMemberEvidence(buildBossEvidence(boss,slot),boss,slot);count++;}
    assert.equal(count,240);
  });
  check('Encounter evidence aggregates all member statuses and counts encounter-wide unsupported effects once',()=>{
    for(const boss of bosses.values()){
      const aggregate=buildBossEncounterEvidence(boss),members=boss.team.map((_,slot)=>buildBossEvidence(boss,slot));assert(aggregate);
      for(const key of fieldKeys)assert.equal(field(aggregate,key).status,worst(members.map(row=>field(row,key).status)),`${boss.id}/${key}`);
      assert.equal(aggregate.incompleteRules,unsupported.get(boss.id));
      assert.equal(aggregate.displayLevelUnknown,members.some(row=>row.displayLevelUnknown));
      assert.deepEqual(new Set(aggregate.sourceUrls),new Set(runtime.encounters[boss.id].sourceUrls));
    }
  });
  check('Mixed evidence merging keeps the least certain status, distinct configuration values and source links',()=>{
    const row=(status,value,source,count)=>({fields:[{key:'level',label:'Level',value,status}],hasInferredStats:status==='inferred',hasInferredLevel:status==='inferred',limitations:['One limit'],sourceUrls:[source],incompleteRules:count,displayLevelUnknown:value==='??'});
    const merged=mergeBossEvidence([row('official','80','https://example.invalid/a',1),undefined,row('inferred','??','https://example.invalid/b',2)]);
    assert.equal(field(merged,'level').status,'inferred');assert.equal(field(merged,'level').value,'各对手配置不同');assert.equal(merged.incompleteRules,3);assert.equal(merged.displayLevelUnknown,true);assert.equal(merged.sourceUrls.length,2);assert.deepEqual(merged.limitations,['One limit','所含挑战合计有 3 项特殊效果未完整还原。']);assert.equal(mergeBossEvidence([undefined]),undefined);
  });
  check('Puni aggregation retains both explicit waivers without unsupported warnings or six-member duplication',()=>{
    const sealBoss=bosses.get('boss_puni_seal7'),bodyBoss=bosses.get('boss_puni_zhenshen');assert.equal(bodyBoss.team.length,6);
    const seal=buildBossEncounterEvidence(sealBoss),body=buildBossEncounterEvidence(bodyBoss),countLines=view=>view.limitations.filter(text=>/\d+ 项特殊效果未完整还原/.test(text));
    assert.equal(seal.incompleteRules,0);assert.equal(body.incompleteRules,0);
    assert.deepEqual(countLines(body),[]);
    const combined=mergeBossEvidence([seal,body]);assert.equal(combined.incompleteRules,0);
    assert.deepEqual(countLines(combined),[]);
    assert.equal(combined.limitations.filter(text=>text==='当前规则不额外加入圣洁封印的低命中效果。').length,1);
    assert.equal(combined.limitations.filter(text=>text==='当前规则不额外加入谱尼低体力时降低我方命中的效果。').length,1);
    for(const text of [...seal.limitations,...body.limitations].filter(text=>!/\d+ 项特殊效果未完整还原/.test(text)))assert(combined.limitations.includes(text),'Non-count limitations survive aggregation');
    t.witness('unsupported-count-text',{bodyMembers:6,bodyCount:body.incompleteRules,mergedCount:combined.incompleteRules,bodyText:countLines(body),mergedText:countLines(combined)});
  });
  check('Actual catalog, campaign and battle views disclose four waivers and the strict-quarter user policy',()=>{
    const expected=new Map([
      ['boss_puni_seal7','当前规则不额外加入圣洁封印的低命中效果。'],
      ['boss_puni_zhenshen','当前规则不额外加入谱尼低体力时降低我方命中的效果。'],
      ['boss_spt_eersaila','当前规则不加入随体力变化的额外致命一击率。'],
      ['boss_spt_kenpeide','当前规则保留现有反伤，不额外加入临时开关与持续时间。'],
      ['boss_spt_moshidilu','当前规则：体力低于 25% 时，攻击必先并直接击倒；恢复至 25% 及以上后解除。此规则按约定采用，历史资料存在不同记载。'],
    ]);
    const game=make(),snapshot=game.snapshot();
    for(const [id,note]of expected){
      const view=snapshot.bosses.find(row=>row.id===id);assert(view);assert.equal(runtime.encounters[id].userPolicies.length,1);
      assert.deepEqual(runtime.encounters[id].userPolicies,audit.encounters[id].userPolicies);
      for(const evidence of [view.evidence,...view.opponents.map(member=>member.evidence)]){
        assert.equal(evidence.incompleteRules,0);assert.equal(field(evidence,'rules').value,'按当前重制规则');assert.notEqual(field(evidence,'rules').status,'official');
        assert.equal(evidence.limitations.filter(text=>text===note).length,1);assert(!evidence.limitations.some(text=>text.includes('项特殊效果未完整还原')));
      }
      for(const campaign of snapshot.campaigns)for(const stage of campaign.stages)if(stage.bossIds.includes(id))assert(stage.evidence.limitations.includes(note));
    }
    start(game,{type:'startBattle',bossId:'boss_spt_moshidilu'});
    assert(game.snapshot().battle.enemy.evidence.limitations.includes(expected.get('boss_spt_moshidilu')));leave(game);
    const moshi= audit.encounters.boss_spt_moshidilu.rules.find(row=>row.rule==='forced_execution_below_pct');assert.equal(moshi.configuration.pct,25);assert.equal(moshi.evidence.status,'authored');assert.equal(moshi.evidence.basis,'user-adopted-policy');
    t.witness('v57-user-policies',{waivers:4,replacements:1,activeUnsupported:0,realBattle:'boss_spt_moshidilu'});
  });
  check('Every catalog Boss view and every opponent receives evidence; all ten trainer views remain separate',()=>{
    const game=make(),snapshot=game.snapshot();assert.equal(snapshot.bosses.length,190);
    for(const boss of bosses.values()){
      const view=snapshot.bosses.find(row=>row.id===boss.id);assert(view.evidence);assert.equal(view.opponents.length,boss.team.length);assert.equal(view.level,boss.team[0].level);
      view.opponents.forEach((member,slot)=>{assert.equal(member.species,boss.team[slot].species);assert.equal(member.level,boss.team[slot].level);assertMemberEvidence(member.evidence,boss,slot);});
    }
    for(const trainer of catalog.trainers){const view=snapshot.bosses.find(row=>row.id===trainer.id);assert(view);assert.equal(view.evidence,undefined);assert(view.opponents.every(member=>member.evidence===undefined));assert.equal(buildBossEvidence(trainer),undefined);assert.equal(buildBossEncounterEvidence(trainer),undefined);}
  });
  check('Every campaign stage retains evidence for its full opponent list and an aggregate over its encounters',()=>{
    let stages=0,opponents=0;const snapshot=make().snapshot();assert(snapshot.campaigns.length>0);
    for(const campaign of snapshot.campaigns)for(const stage of campaign.stages){stages++;assert(stage.evidence);const expected=stage.bossIds.flatMap(id=>bosses.get(id).team.map((mon,slot)=>({boss:bosses.get(id),mon,slot})));assert.equal(stage.opponents.length,expected.length);
      stage.opponents.forEach((view,i)=>{const {boss,mon,slot}=expected[i];assert.equal(view.species,mon.species);assert.equal(view.level,mon.level);assertMemberEvidence(view.evidence,boss,slot);opponents++;});
      for(const key of fieldKeys)assert.equal(field(stage.evidence,key).status,worst(expected.map(({boss,slot})=>field(buildBossEvidence(boss,slot),key).status)),`${campaign.id}/${stage.id}/${key}`);
      assert.equal(stage.evidence.incompleteRules,stage.bossIds.reduce((sum,id)=>sum+unsupported.get(id),0));
    }
    t.witness('campaigns',{campaigns:snapshot.campaigns.length,stages,opponents});
  });
  check('All over-100 display values are masked while core levels and encounter source numbers remain intact',()=>{
    const scripts={...SEER_SCRIPTS,...campaignScripts,...traitScripts,...npcTrainingScripts};let members=0;
    for(const boss of bosses.values()){
      if(!boss.team.some(mon=>mon.level>100))continue;
      const core=createBattle({data,scripts,seed:56,sides:[{kind:'player',team:[{species:70,level:100,skills:[10166]}]}],encounter:structuredClone(boss)});
      boss.team.forEach((mon,slot)=>{assert.equal(core.sides[1].team[slot].level,mon.level);if(mon.level<=100)return;members++;assert.equal(encounterLevel(mon.level),'??');assert.equal(encounterLevelText(mon.level),'Lv.??');assert.equal(encounterLevelText(mon.level,true),'Lv.?? · 推定');assert.equal(field(buildBossEvidence(boss,slot),'level').value,'??');});
    }
    assert(members>0);for(const level of [1,80,100])assert.equal(encounterLevel(level),String(level));for(const level of [0,-1,NaN,Infinity])assert.equal(encounterLevel(level),'??');
    t.witness('masked-high-levels',{members});
  });
  check('Difuert masks its documented unknown display level without replacing its internal estimate of 80',()=>{
    const boss=bosses.get('boss_spt_difute');assert.equal(boss.team[0].level,80);const evidence=buildBossEvidence(boss);
    assert.equal(evidence.displayLevelUnknown,true);assert.equal(field(evidence,'level').value,'??');assert.equal(field(evidence,'level').status,'inferred');assert.equal(encounterLevelText(80,true,evidence.displayLevelUnknown),'Lv.?? · 推定');
    const game=make(),core=start(game,{type:'startBattle',bossId:boss.id});assert.equal(core.active(1).level,80);assert.equal(game.snapshot().battle.enemy.level,80);assert.equal(game.snapshot().battle.enemy.evidence.displayLevelUnknown,true);leave(game);
  });
  const attemptId='boss_aluobisi',source=bosses.get(attemptId);
  check('Attempt adapter yields 100, 90, 70 and an explicitly inferred floor of 50 while retaining 5000 HP',()=>{
    assert(source);const before=JSON.stringify(source);
    for(const [attempts,level] of [[0,100],[1,90],[3,70],[5,50],[6,50],[100,50],[-1,100],[NaN,100],[1.5,100]]){
      const adapted=bossEncounterForAttempt(source,attempts);assert.notEqual(adapted,source);assert.notEqual(adapted.team,source.team);assert.equal(adapted.team[0].level,level);assert.equal(adapted.team[0].hp_override,5000);
      const {level:_old,...originalMember}=source.team[0],{level:_new,...adaptedMember}=adapted.team[0];assert.deepEqual(adaptedMember,originalMember);
    }
    assert.equal(JSON.stringify(source),before);assert.equal(source.team[0].level,100);
    const evidence=buildBossEvidence(bossEncounterForAttempt(source,100));assert(evidence.limitations.some(text=>text.includes('50')&&text.includes('推定')));assert.equal(field(evidence,'hp').status,'inferred');
    const ordinary=bosses.get('boss_spt_liaosi');assert.equal(bossEncounterForAttempt(ordinary,100),ordinary);
  });
  check('Successful controller starts increment attempts exactly once and preserve the current battle level',()=>{
    const game=make();
    for(const [level,count] of [[100,1],[90,2]]){
      const core=start(game,{type:'startBattle',bossId:attemptId});assert.equal(core.active(1).level,level);assert.equal(core.active(1).maxHp,5000);
      assert.equal(parse(game).progress.boss_attempts[attemptId],count);assert.equal(game.snapshot().battle.enemy.level,level);assert.equal(field(game.snapshot().battle.enemy.evidence,'level').value,String(level));
      reject(game,{type:'startBattle',bossId:attemptId},'duplicate active challenge');
      for(let i=0;i<3;i++)game.snapshot();assert.equal(parse(game).progress.boss_attempts[attemptId],count);
      leave(game);assert.equal(parse(game).progress.boss_attempts[attemptId],count);
      const next=game.snapshot().bosses.find(row=>row.id===attemptId);assert.equal(next.level,level-10);assert.equal(next.opponents[0].level,level-10);assert.equal(next.attempts,count);
      t.witness(`attempt-start-${count}`,{count,coreLevel:level,nextPreview:next.level,hp:core.active(1).maxHp});
    }
  });
  check('An existing count of three starts at 70 after reload and larger counts stop at the inferred floor',()=>{
    for(const [attempts,level] of [[3,70],[9,50]]){
      const save=structuredClone(base);save.progress.boss_attempts[attemptId]=attempts;const game=make(save);assert.equal(game.snapshot().bosses.find(row=>row.id===attemptId).level,level);
      const beforeRng=parse(game).rng_state,core=start(game,{type:'startBattle',bossId:attemptId});assert.equal(core.active(1).level,level);assert.equal(core.active(1).maxHp,5000);assert.equal(parse(game).progress.boss_attempts[attemptId],attempts+1);assert.notDeepEqual(parse(game).rng_state,beforeRng);
      leave(game);const restored=make(parse(game));assert.equal(restored.snapshot().bosses.find(row=>row.id===attemptId).level,Math.max(50,level-10));
    }
  });
  check('Rejected unknown, locked, active and exhausted starts preserve save, RNG and current battle atomically',()=>{
    const game=make();reject(game,{type:'startBattle',bossId:'missing-v56'},'unknown challenge');reject(game,{type:'startTower',floor:31},'locked floor');
    reject(game,{type:'startBattle',bossId:'boss_campaign_xuanwu_body'},'campaign requires stage entry');
    const save=structuredClone(base);save.progress.boss_attempts[attemptId]=3;save.storage.forEach(mon=>{mon.hp=0;});const exhausted=make(save);
    reject(exhausted,{type:'startBattle',bossId:attemptId},'exhausted attempt');assert.equal(parse(exhausted).progress.boss_attempts[attemptId],3);
    start(game,{type:'startBattle',bossId:attemptId});reject(game,{type:'startBattle',bossId:'boss_spt_liaosi'},'other active challenge');leave(game);
  });
  check('A real over-100 Tower start retains raw level in battle and masks it in every enemy evidence view',()=>{
    const save=structuredClone(base);save.game.braveTower={highestCleared:30,resumeFloor:31};const game=make(save),core=start(game,{type:'startTower',floor:31});assert.equal(core.active(1).level,120);
    const battle=game.snapshot().battle;assert.equal(battle.enemy.level,120);assert.equal(field(battle.enemy.evidence,'level').value,'??');battle.enemyParty.forEach(mon=>assert.equal(field(mon.evidence,'level').value,'??'));assert.equal(battle.player.evidence,undefined);leave(game);
  });
  check('The first real battle in all seven campaigns preserves evidence on every active and reserve opponent',()=>{
    let opponents=0;const campaigns=make().snapshot().campaigns;assert.equal(campaigns.length,7);
    for(const campaign of campaigns){
      const game=make(),stage=campaign.stages[0],source=bosses.get(stage.bossIds[0]),core=start(game,{type:'startCampaignStage',campaignId:campaign.id,stageId:stage.id});
      const battle=game.snapshot().battle;assert.equal(battle.enemyParty.length,source.team.length);assertMemberEvidence(battle.enemy.evidence,source,core.sides[1].active);
      battle.enemyParty.forEach((mon,slot)=>{assertMemberEvidence(mon.evidence,source,slot);assert.equal(mon.level,core.sides[1].team[slot].level);opponents++;});
      assert.equal(parse(game).progress.boss_attempts[source.id],1);leave(game);
    }
    t.witness('real-campaign-starts',{campaigns:campaigns.length,opponents});
  });
  check('Real classic, random and elite trainer starts retain the search-planner trainer AI without Boss evidence or attempt counts',()=>{
    for(const facilityId of ['classic','random','elite']){
      const game=make(),before=parse(game).progress.boss_attempts,core=start(game,{type:'startFacility',facilityId,...(facilityId==='classic'?{teamId:catalog.trainers[0].id}:{})});assert.equal(core.sides[1].kind,'trainer');assert.equal(core.sides[1].ai.kind,'smart');assert.equal(core.sides[1].ai.allow_switch,true);
      assert.equal(game.snapshot().battle.enemy.evidence,undefined);assert(game.snapshot().battle.enemyParty.every(mon=>mon.evidence===undefined));
      const action=chooseAiAction(core,core.sides[1]);assert.deepEqual(lastSearchDecision(core,core.sides[1])?.chosen,action);assert.deepEqual(parse(game).progress.boss_attempts,before);leave(game);
    }
  });
  check('Unknown evidence remains explicitly inferred and the entire verification preserves catalog and user state',()=>{
    const unknown={...structuredClone(source),id:'unverified-v56'};const evidence=buildBossEvidence(unknown);assert(evidence.fields.every(row=>row.status==='inferred'));assert(evidence.limitations.some(text=>text.includes('尚未完成核对')));
    assert.equal(JSON.stringify(catalog),catalogBefore);assert.equal(storageReads,0);assert(storageWrites>0);assert.equal(networkRequests,0);assert(created.length>0);
  });
  t.finish({scope,sourceHashes:Object.fromEntries(['src/mechanics/boss-encounter.ts','src/game.ts','src/presentation/boss-evidence.ts','src/presentation/encounter-level.ts','data/boss-evidence-runtime-v56.json','data/boss-rule-support-v56.json',...controllerFiles].map(file=>[file,sha256File(file)]))});
});
