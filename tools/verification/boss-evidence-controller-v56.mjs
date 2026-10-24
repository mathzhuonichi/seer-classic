/**
 * The V56 Boss evidence ledger, the Boss level display and the attempt adapter, checked through public controller actions. The
 * evidence is development data: the ledger must match the encounters, and no view a player sees carries it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root,sha256File,suite,withSsr} from './_harness.mjs';

const scope='Production controller and core objects, observed through the controller battle-factory seam. No browser, user save, development server, build, '
  +'or package operation is used. The ledger is checked against the encounters it describes; historical source correctness belongs to the source audit.';
let storageReads=0,storageWrites=0,networkRequests=0;
globalThis.localStorage={getItem:()=>{storageReads++;return null;},setItem:()=>{storageWrites++;},removeItem:()=>{}};
globalThis.fetch=()=>{networkRequests++;throw new Error('Evidence verification must remain offline.');};
const controllerFiles=fs.readdirSync(path.join(root,'src/kernel')).filter(file=>file.endsWith('.ts')).sort().map(file=>`src/kernel/${file}`);
await withSsr('boss-evidence-controller-v56',async load=>{
  const t=suite('boss-evidence-controller-v56'),{check}=t;
  const [
    {createGame:createProductionGame},{bossEncounterForAttempt},{encounterLevel,encounterLevelText,opponentLevelText},{makeDex,createMonster},{createBattle},
    {buildDataSet,Rng},{SEER_SCRIPTS},{campaignScripts},{traitScripts},{npcTrainingScripts},{chooseAiAction},{lastSearchDecision},
  ]=await Promise.all([
    '/src/kernel/game.ts','/src/domain/challenges/boss-encounter.ts','/src/shared/encounter-level.ts','/raising/core/index.ts','/tools/verification/_battle.ts',
    '/battle/core/src/index.ts','/battle/core/src/scripts/index.ts','/src/domain/challenges/campaign-rules.ts','/src/domain/traits.ts',
    '/src/domain/challenges/npc-training-scripts.ts','/battle/ai/src/ai.ts','/battle/ai/src/search-ai.ts',
  ].map(load));
  const {loadCatalog}=await load('/src/domain/catalog/catalog.ts'),{partyRules}=await load('/battle/core/src/index.ts');
  // The controller's real battles, observed through its battle-factory seam.
  const created=[];
  const createGame=(input,save)=>createProductionGame(input,save,{createBattle:options=>{const battle=createBattle(options);created.push(battle);return battle;}});
  const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const audit=readJson('data/boss-evidence-v56.json');
  const catalog=await loadCatalog(),catalogBefore=JSON.stringify(catalog),data=buildDataSet(catalog),dex=makeDex(catalog),rng=new Rng(56);
  const bosses=new Map(catalog.bosses.map(boss=>[boss.id,boss]));
  const fieldKeys=['level','iv','evs','nature','hp','skills','ai','rules'],statsKeys=fieldKeys.slice(0,6),statuses=new Set(['official','observed','authored','inferred']);
  const parse=game=>JSON.parse(game.exportSave());
  const base=parse(createGame(catalog,''));
  base.storage=Array.from({length:6},(_,i)=>createMonster(dex,70,100,rng,{uid:`evidence-v56-${i}`,iv:31,nature:'hardy'}));
  base.party=base.storage.map(mon=>mon.uid);base.game.traits={};base.game.modules={};base.game.engravingStock={};base.rng_state=[56,112,168,224];
  const make=(save=base)=>createGame(catalog,JSON.stringify(structuredClone(save)));
  const captured=()=>created.at(-1);
  function start(game,action){const count=created.length;game.dispatch(action);assert(game.snapshot().battle&&!game.snapshot().battle.finished,JSON.stringify(game.snapshot().notices));assert.equal(created.length,count+1);return captured();}
  function leave(game){game.dispatch({type:'flee'});assert.equal(game.snapshot().battle.resultReason,'flee');game.dispatch({type:'closeBattle'});assert.equal(game.snapshot().battle,null);}
  /** The wording of the development evidence (资料记载, 推定, 当前规则, 待还原), which no text a player reads uses. */
  const EVIDENCE_WORDS=/资料|推定|当前规则|还原/;
  /** The paths in `value` of any key named evidence: no view a player sees carries the development evidence. */
  const evidencePaths=(value,at='')=>!value||typeof value!=='object'?[]:Object.entries(value)
    .flatMap(([key,child])=>key==='evidence'?[`${at}/${key}`]:evidencePaths(child,`${at}/${key}`));
  function reject(game,action,label){const before=game.exportSave(),battle=JSON.stringify(game.snapshot().battle),rngBefore=parse(game).rng_state,count=created.length;game.dispatch(action);assert.equal(game.exportSave(),before,`${label}: save`);assert.deepEqual(parse(game).rng_state,rngBefore,`${label}: RNG`);assert.equal(JSON.stringify(game.snapshot().battle),battle,`${label}: battle`);assert.equal(created.length,count,`${label}: no battle constructed`);}

  check('The evidence ledger covers exactly the 180 encounters and 247 unique members it describes',()=>{
    assert.equal(bosses.size,180);assert.deepEqual(Object.keys(audit.encounters).sort(),[...bosses.keys()].sort());
    let members=0;
    for(const boss of bosses.values()){
      const detail=audit.encounters[boss.id];assert.deepEqual(detail.members.map(row=>row.slot),boss.team.map((_,slot)=>slot));
      for(const row of detail.members){const source=boss.team[row.slot];assert.equal(row.species,source.species);members++;
        assert.equal(!!source.level_masked,!!row.displayLevelUnknown,`${boss.id}/${row.slot}: the encounter masks the level the ledger records as shown ??`);
        for(const key of statsKeys)assert(statuses.has(row.fields[key]?.status));
        assert.equal(row.configured.level,source.level);assert.deepEqual(row.configured.skills,source.skills);assert.equal(row.configured.hp,source.hp_override??null);
      }
      for(const key of fieldKeys)assert(statuses.has(detail.fields[key]?.status));
    }
    assert.equal(members,247);t.witness('evidence-index',{encounters:bosses.size,members});
  });
  check('The ledger records the four waivers and the strict-quarter replacement of the user policy ledger',()=>{
    const expected=['boss_puni_seal7','boss_puni_zhenshen','boss_spt_eersaila','boss_spt_kenpeide','boss_spt_moshidilu'];
    const policies=readJson('data/boss-user-policies-v57.json').policies;assert.deepEqual([...new Set(policies.map(policy=>policy.bossId))].sort(),expected);
    for(const id of expected){
      const ledger=policies.filter(policy=>policy.bossId===id);assert.equal(ledger.length,1);
      assert.deepEqual(audit.encounters[id].userPolicies,ledger);
    }
    assert.deepEqual(policies.map(policy=>policy.disposition).sort(),['replaced','waived','waived','waived','waived']);
    const moshi=audit.encounters.boss_spt_moshidilu.rules.find(row=>row.rule==='forced_execution_below_pct');assert.equal(moshi.configuration.pct,25);
    assert.equal(moshi.evidence.status,'authored');assert.equal(moshi.evidence.basis,'user-adopted-policy');
    t.witness('v57-user-policies',{waivers:4,replacements:1});
  });
  check('No Boss, trainer, opponent or campaign stage view carries the development evidence; each opponent row is its encounter member',()=>{
    const game=make(),snapshot=game.snapshot();assert.equal(snapshot.bosses.length,190);
    assert.deepEqual(evidencePaths({bosses:snapshot.bosses,campaigns:snapshot.campaigns,braveTower:snapshot.braveTower}),[]);
    for(const view of snapshot.bosses)for(const variant of view.variants??[])for(const text of [variant.label,...variant.rules,variant.win,variant.lose]){
      assert.doesNotMatch(text,EVIDENCE_WORDS,`${view.id}/${variant.id}`);
    }
    for(const boss of [...bosses.values(),...catalog.trainers]){
      const view=snapshot.bosses.find(row=>row.id===boss.id);assert(view);assert.equal(view.opponents.length,boss.team.length);
      assert.equal(view.level,boss.team[0].level);assert.equal(view.levelMasked,boss.team[0].level_masked);
      view.opponents.forEach((member,slot)=>{
        const source=boss.team[slot];assert.equal(member.species,source.species);assert.equal(member.level,source.level);
        assert.equal(member.levelMasked,source.level_masked);
      });
    }
  });
  check('Every campaign stage lists the full opponent list of its encounters',()=>{
    let stages=0,opponents=0;const snapshot=make().snapshot();assert(snapshot.campaigns.length>0);
    for(const campaign of snapshot.campaigns)for(const stage of campaign.stages){
      stages++;const expected=stage.bossIds.flatMap(id=>bosses.get(id).team);assert.equal(stage.opponents.length,expected.length);
      stage.opponents.forEach((view,i)=>{assert.equal(view.species,expected[i].species);assert.equal(view.level,expected[i].level);opponents++;});
    }
    t.witness('campaigns',{campaigns:snapshot.campaigns.length,stages,opponents});
  });
  check('All over-100 display values are masked while core levels and encounter source numbers remain intact',()=>{
    const scripts={...SEER_SCRIPTS,...campaignScripts,...traitScripts,...npcTrainingScripts};let members=0;
    for(const boss of bosses.values()){
      if(!boss.team.some(mon=>mon.level>100))continue;
      const core=createBattle({data,scripts,seed:56,sides:[{kind:'player',team:[{species:70,level:100,skills:[10166]}]}],encounter:structuredClone(boss)});
      boss.team.forEach((mon,slot)=>{
        assert.equal(core.sides[1].team[slot].level,mon.level);if(mon.level<=100)return;members++;
        assert.equal(encounterLevel(mon.level),'??');assert.equal(encounterLevelText(mon.level),'Lv.??');assert.equal(opponentLevelText(mon),'Lv.??');
      });
    }
    assert(members>0);for(const level of [1,80,100])assert.equal(encounterLevel(level),String(level));for(const level of [0,-1,NaN,Infinity])assert.equal(encounterLevel(level),'??');
    t.witness('masked-high-levels',{members});
  });
  check('Difuert masks its documented unknown display level without replacing its internal estimate of 80',()=>{
    const boss=bosses.get('boss_spt_difute'),ledger=audit.encounters[boss.id].members[0];
    assert.equal(boss.team[0].level,80);assert.equal(boss.team[0].level_masked,true);
    assert.equal(ledger.displayLevelUnknown,true);assert.equal(ledger.fields.level.status,'inferred');
    assert.equal(encounterLevelText(80,true),'Lv.??');assert.equal(encounterLevelText(80),'Lv.80');
    const game=make(),view=game.snapshot().bosses.find(row=>row.id===boss.id);assert.equal(view.levelMasked,true);assert.equal(view.opponents[0].levelMasked,true);
    const core=start(game,{type:'startBattle',bossId:boss.id}),enemy=game.snapshot().battle.enemy;assert.equal(core.active(1).level,80);assert.equal(enemy.level,80);assert.equal(enemy.levelMasked,true);
    assert(game.snapshot().battle.player.levelMasked===undefined);assert.equal(opponentLevelText(view),'Lv.??');leave(game);
  });
  const attemptId='boss_aluobisi',source=bosses.get(attemptId);
  check('Attempt adapter yields 100, 90, 70 and an explicitly inferred floor of 50 while retaining 5000 HP',()=>{
    assert(source);const before=JSON.stringify(source);
    for(const [attempts,level] of [[0,100],[1,90],[3,70],[5,50],[6,50],[100,50],[-1,100],[NaN,100],[1.5,100]]){
      assert.equal(bossEncounterForAttempt(source,attempts,attempts).team[0].level,level,'阿洛比斯 falls by one step per attempt, won or lost');
      const adapted=bossEncounterForAttempt(source,attempts,0);assert.notEqual(adapted,source);assert.notEqual(adapted.team,source.team);assert.equal(adapted.team[0].level,level);assert.equal(adapted.team[0].hp_override,5000);
      const {level:_old,...originalMember}=source.team[0],{level:_new,...adaptedMember}=adapted.team[0];assert.deepEqual(adaptedMember,originalMember);
    }
    assert.equal(JSON.stringify(source),before);assert.equal(source.team[0].level,100);
    const ledger=audit.encounters[attemptId].members[0].fields;assert.equal(ledger.level.status,'inferred');assert.equal(ledger.hp.status,'inferred');
    const ordinary=bosses.get('boss_spt_liaosi');assert.equal(bossEncounterForAttempt(ordinary,100,50),ordinary);
  });
  check('Successful controller starts increment attempts exactly once and preserve the current battle level',()=>{
    const game=make();
    for(const [level,count] of [[100,1],[90,2]]){
      const core=start(game,{type:'startBattle',bossId:attemptId});assert.equal(core.active(1).level,level);assert.equal(core.active(1).maxHp,5000);
      assert.equal(parse(game).progress.boss_attempts[attemptId],count);assert.equal(game.snapshot().battle.enemy.level,level);
      assert.deepEqual(evidencePaths(game.snapshot().battle),[]);
      reject(game,{type:'startBattle',bossId:attemptId},'duplicate active challenge');
      for(let i=0;i<3;i++)game.snapshot();assert.equal(parse(game).progress.boss_attempts[attemptId],count);
      leave(game);assert.equal(parse(game).progress.boss_attempts[attemptId],count);
      const next=game.snapshot().bosses.find(row=>row.id===attemptId);assert.equal(next.level,level-10);assert.equal(next.opponents[0].level,level-10);assert.equal(next.attempts,count);
      t.witness(`attempt-start-${count}`,{count,coreLevel:level,nextPreview:next.level,hp:core.active(1).maxHp});
    }
  });
  check('A battle left before its first turn (its loading screen) counts no attempt and settles nothing; one that has begun is left by fleeing',()=>{
    const save=structuredClone(base);save.boosts=[{kind:'exp',item:'item_exp_x2',multiplier:2,battles_left:3}];
    const game=make(save),before=parse(game);
    start(game,{type:'startBattle',bossId:attemptId});assert.equal(parse(game).progress.boss_attempts[attemptId],1);
    assert(game.dispatch({type:'abandonBattle'}).ok);assert.equal(game.snapshot().battle,null);
    const after=parse(game);assert.deepEqual(after.progress,before.progress,'no attempt, loss or clear');
    assert.deepEqual([after.boosts,after.storage,after.items],[before.boosts,before.storage,before.items],'no boost, HP, PP or item spent');
    assert.equal(game.snapshot().bosses.find(row=>row.id===attemptId).level,100,'the next fight is still the first');
    start(game,{type:'startBattle',bossId:attemptId});
    game.dispatch({type:'move',skillId:game.snapshot().battle.player.skills.find(skill=>skill.pp>0).id});
    const begun=game.dispatch({type:'abandonBattle'});
    assert.equal(begun.ok,false);assert.equal(game.snapshot().battle.finished,false,'a begun battle stays open');
    leave(game);assert.equal(parse(game).progress.boss_attempts[attemptId],1,'and its retreat is a lost attempt');
    t.witness('abandon-before-first-turn',{attempts:after.progress.boss_attempts,boostsLeft:after.boosts.map(boost=>boost.battles_left),refused:begun.notice});
  });
  check('An existing count of three starts at 70 after reload and larger counts stop at the inferred floor',()=>{
    for(const [attempts,level] of [[3,70],[9,50]]){
      const save=structuredClone(base);save.progress.boss_attempts[attemptId]=attempts;const game=make(save);assert.equal(game.snapshot().bosses.find(row=>row.id===attemptId).level,level);
      const beforeRng=parse(game).rng_state,core=start(game,{type:'startBattle',bossId:attemptId});assert.equal(core.active(1).level,level);assert.equal(core.active(1).maxHp,5000);assert.equal(parse(game).progress.boss_attempts[attemptId],attempts+1);assert.notDeepEqual(parse(game).rng_state,beforeRng);
      leave(game);const restored=make(parse(game));assert.equal(restored.snapshot().bosses.find(row=>row.id===attemptId).level,Math.max(50,level-10));
    }
  });
  const ladderId='boss_spt_luolasike',ladder=bosses.get(ladderId);
  check('洛拉斯克’s adapter starts at 100 and falls 5 per win and 1 per other attempt, never below 1',()=>{
    for(const [attempts,wins,level] of [[0,0,100],[1,1,95],[2,1,94],[1,0,99],[4,2,88],[3,9,85],[23,19,1],[24,19,1],[200,0,1],[NaN,NaN,100],[-2,1,100]]){
      const adapted=bossEncounterForAttempt(ladder,attempts,wins);assert.equal(adapted.team[0].level,level,`${attempts} attempts, ${wins} wins`);
      assert.equal(adapted.team[0].hp_override,10000);
    }
    assert.equal(ladder.team[0].level,100);
  });
  /** A save whose party is one Lv100 巴鲁斯 (water hits the ground-type Boss). */
  const ladderSave=()=>{
    const save=structuredClone(base),mon=createMonster(dex,6,100,new Rng(57),{uid:'evidence-v56-ladder',iv:31,nature:'hardy'});
    save.storage=[mon];save.party=[mon.uid];return save;
  };
  /** The player's active member takes no damage, as a condition on the controller's engine battle. */
  const shield=core=>{
    const id='evidence-v56-shield';
    core.active(0).conditions.push({id,def:{id,removed_on_switch:false,hooks:[{on:'modify_damage_taken',multiplier:0}]},turns:Infinity,appliedTurn:0});
  };
  const attack=game=>game.dispatch({type:'move',skillId:game.snapshot().battle.player.skills.find(skill=>skill.power>0&&skill.pp>0).id});
  /** Plays real turns until the battle ends, with the Boss held at one HP and the player shielded; asserts the win. */
  function win(game,core){
    shield(core);for(let turn=0;turn<10&&!game.snapshot().battle.finished;turn++){core.active(1).hp=1;attack(game);}
    assert.equal(game.snapshot().battle.won,true,game.snapshot().battle.result);game.dispatch({type:'closeBattle'});
  }
  /** Plays real turns until the battle ends, with the lone player member held at one HP; asserts the loss. */
  function lose(game,core){
    for(let turn=0;turn<10&&!game.snapshot().battle.finished;turn++){core.active(0).hp=1;attack(game);}
    const battle=game.snapshot().battle;assert.deepEqual([battle.finished,battle.won],[true,false],battle.result);game.dispatch({type:'closeBattle'});
  }
  check('洛拉斯克 through the controller: 100, then 95 after a win, 94 after a loss, 93 after a retreat; the view and the battle agree',()=>{
    const game=make(ladderSave()),row=id=>game.snapshot().bosses.find(entry=>entry.id===id);
    const record=id=>{const {boss_attempts:attempts,boss_wins:wins}=parse(game).progress;return [attempts[id]??0,wins[id]??0];};
    const fight=(id,level,finish)=>{
      game.dispatch({type:'heal'});assert.equal(row(id).level,level,`${id}: the challenge view`);
      const core=start(game,{type:'startBattle',bossId:id});assert.equal(core.active(1).level,level,`${id}: the battle`);finish(core);
    };
    fight(ladderId,100,core=>win(game,core));assert.deepEqual(record(ladderId),[1,1]);
    fight(ladderId,95,core=>lose(game,core));assert.deepEqual(record(ladderId),[2,1]);
    fight(ladderId,94,()=>leave(game));assert.deepEqual(record(ladderId),[3,1],'a retreat is a fight not won');
    fight(ladderId,93,core=>win(game,core));assert.deepEqual(record(ladderId),[4,2]);
    assert.equal(row(ladderId).level,88);assert.equal(make(parse(game)).snapshot().bosses.find(entry=>entry.id===ladderId).level,88,'the record survives a reload');
    fight(attemptId,100,core=>win(game,core));assert.deepEqual(record(attemptId),[1,1]);
    fight(attemptId,90,()=>leave(game));assert.equal(row(attemptId).level,80,'阿洛比斯 falls by 10 per attempt, won or lost');
    t.witness('luolasike-ladder',{levels:[100,95,94,93,88],record:record(ladderId),aluobisi:record(attemptId)});
  });
  check('洛拉斯克 stops at level 1, and a win there keeps it at 1',()=>{
    const save=ladderSave();save.progress.boss_attempts[ladderId]=30;save.progress.boss_wins[ladderId]=19;
    const game=make(save),row=()=>game.snapshot().bosses.find(entry=>entry.id===ladderId);assert.equal(row().level,1);
    const core=start(game,{type:'startBattle',bossId:ladderId});assert.equal(core.active(1).level,1);assert.equal(core.active(1).maxHp,10000);
    win(game,core);assert.deepEqual([parse(game).progress.boss_wins[ladderId],row().level],[20,1]);
  });
  check('Rejected unknown, locked, active and exhausted starts preserve save, RNG and current battle atomically',()=>{
    const game=make();reject(game,{type:'startBattle',bossId:'missing-v56'},'unknown challenge');reject(game,{type:'startTower',floor:31},'locked floor');
    reject(game,{type:'startBattle',bossId:'boss_campaign_xuanwu_body'},'campaign requires stage entry');
    const save=structuredClone(base);save.progress.boss_attempts[attemptId]=3;save.storage.forEach(mon=>{mon.hp=0;});const exhausted=make(save);
    reject(exhausted,{type:'startBattle',bossId:attemptId},'exhausted attempt');assert.equal(parse(exhausted).progress.boss_attempts[attemptId],3);
    start(game,{type:'startBattle',bossId:attemptId});reject(game,{type:'startBattle',bossId:'boss_spt_liaosi'},'other active challenge');leave(game);
  });
  check('A real over-100 Tower start retains raw level in battle, which the level label masks, and its views carry no evidence',()=>{
    const save=structuredClone(base);save.game.braveTower={highestCleared:30,resumeFloor:31};const game=make(save),core=start(game,{type:'startTower',floor:31});assert.equal(core.active(1).level,120);
    const battle=game.snapshot().battle;assert.equal(battle.enemy.level,120);assert.equal(encounterLevel(battle.enemy.level,battle.enemy.levelMasked),'??');
    battle.enemyParty.forEach(mon=>assert.equal(encounterLevel(mon.level,mon.levelMasked),'??'));assert.deepEqual(evidencePaths(battle),[]);leave(game);
  });
  check('The first real battle in all seven campaigns fields every active and reserve opponent of its encounter, without evidence',()=>{
    let opponents=0;const campaigns=make().snapshot().campaigns;assert.equal(campaigns.length,7);
    for(const campaign of campaigns){
      const game=make(),stage=campaign.stages[0],source=bosses.get(stage.bossIds[0]),core=start(game,{type:'startCampaignStage',campaignId:campaign.id,stageId:stage.id});
      const battle=game.snapshot().battle;assert.equal(battle.enemyParty.length,source.team.length);
      assert.equal(battle.enemy.species,source.team[core.sides[1].active].species);assert.deepEqual(evidencePaths(battle),[]);
      battle.enemyParty.forEach((mon,slot)=>{
        assert.equal(mon.species,source.team[slot].species);assert.equal(mon.level,core.sides[1].team[slot].level);opponents++;
      });
      assert.equal(parse(game).progress.boss_attempts[source.id],1);leave(game);
    }
    t.witness('real-campaign-starts',{campaigns:campaigns.length,opponents});
  });
  check('Real classic, random and elite trainer starts retain the search-planner trainer AI without attempt counts',()=>{
    for(const facilityId of ['classic','random','elite']){
      const game=make(),before=parse(game).progress.boss_attempts,core=start(game,{type:'startFacility',facilityId,...(facilityId==='classic'?{teamId:catalog.trainers[0].id}:{})});assert.equal(core.sides[1].kind,'trainer');assert.equal(core.sides[1].ai.kind,'smart');assert.equal(core.sides[1].ai.allow_switch,true);
      assert.deepEqual(evidencePaths(game.snapshot().battle),[]);
      const action=chooseAiAction(core,core.sides[1]);assert.deepEqual(lastSearchDecision(core,core.sides[1])?.chosen,action);assert.deepEqual(parse(game).progress.boss_attempts,before);leave(game);
    }
  });
  check('Real Boss starts log no rule condition before the switch-ins',()=>{
    // Turn preparation never runs, so the sweep only opens and leaves each battle. Every encounter opens, once per variant where it has
    // variants and with the team its party rules allow; only campaign stages and locked Tower floors refuse, as they start from their own routes.
    const seam=options=>{const battle=createBattle(options);created.push(battle);return battle;};
    const open=size=>createProductionGame(catalog,JSON.stringify({...base,party:base.party.slice(0,size)}),{idle:()=>{},createBattle:seam});
    const games=new Map(),routed=/阶段场景开始挑战|此楼层尚未开放/,conditionEvents=new Set(['condition_added','condition_refreshed']);
    let opened=0,installed=0,elsewhere=0;const staged={};
    for(const boss of bosses.values()){
      const size=partyRules(boss).find(rule=>rule.kind==='team_max')?.count??base.party.length,game=games.get(size)??games.set(size,open(size)).get(size);
      for(const variant of boss.variants?.length?boss.variants.map(entry=>entry.id):[undefined]){
        const label=variant?`${boss.id}/${variant}`:boss.id,result=game.dispatch({type:'startBattle',bossId:boss.id,...(variant?{variant}:{})});
        if(!result.ok){assert.match(result.notice,routed,`${label} opens`);elsewhere++;continue;}
        const events=captured().initialEvents,log=game.snapshot().battle.log,switched=log.findIndex(line=>line.includes('派出了'));opened++;
        installed+=events.slice(0,events.findIndex(event=>event.type==='switch_in')).filter(event=>conditionEvents.has(event.type)).length;
        assert(switched>0,`${label}: ${log.join(' / ')}`);
        if(switched>1)staged[label]=log.slice(1,switched);
        leave(game);
      }
    }
    // Between the opening line and the switch-ins, only a rule's real effect keeps a line: 周二's evasion stages.
    assert.deepEqual(staged,{'boss_spt_eersaila/tue':['厄尔塞拉的闪避提升 3 级，当前 +3 级。']});
    assert(installed>80,`the opened encounters install rule conditions (${installed} in ${opened})`);
    t.witness('boss-openings',{opened,installed,elsewhere});
  });
  check('The entire verification preserves catalog and user state',()=>{
    assert.equal(JSON.stringify(catalog),catalogBefore);assert.equal(storageReads,0);assert.equal(storageWrites,0);assert.equal(networkRequests,0);assert(created.length>0);
  });
  const hashed=[
    'src/domain/challenges/boss-encounter.ts','src/kernel/game.ts','src/shared/encounter-level.ts',
    'data/boss-evidence-v56.json',
  ];
  t.finish({scope,sourceHashes:Object.fromEntries([...hashed,...controllerFiles].map(file=>[file,sha256File(file)]))});
});
