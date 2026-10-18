/** Facility generation, ordinary builds, public entry points, and save isolation. */
import assert from 'node:assert/strict';
import {suite,withSsr} from './_harness.mjs';

// Every controller starts from the supplied save. A previous controller must
// never silently become the input to another fixture through local storage.
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}});
const generated=[],controller=[];
const report={generated,controller};
const statKeys=['hp','atk','def','spa','spd','spe'],npc=new Set([122,123,124,125]);
const sumBase=species=>statKeys.reduce((sum,key)=>sum+species.base[key],0);
const sorted=values=>[...values].sort((a,b)=>a-b);
const parse=game=>JSON.parse(game.exportSave());
function reject(game,action,label){const save=game.exportSave(),battle=JSON.stringify(game.snapshot().battle);game.dispatch(action);assert.equal(game.exportSave(),save,`${label}: save and RNG are atomic`);assert.equal(JSON.stringify(game.snapshot().battle),battle,`${label}: active battle is unchanged`);}
function protectedSave(save){return {dex:save.dex,party:save.party,identity:save.storage.map(({uid,species,obtained})=>({uid,species,obtained})),items:save.items,quests:save.game.quests,recruitmentClaims:save.game.recruitmentClaims,shopUnlocked:save.game.shopUnlocked,campaigns:save.game.campaigns};}
const battleState=battle=>{const {animation,...state}=battle;return state};

await withSsr('battle-facilities',async load=>{
  const t=suite('battle-facilities'),{check}=t;
  const [{loadCatalog},{createGame},{Rng},{makeDex,createMonster,computeStats},{createBattle},{buildDataSet},{buildAcquisitionIndex},{buildRecruitmentRewards},{WORLD_PLANETS,resolveWorldLocation},{buildFacilityViews,facilityPool,createFacilityEncounter},{getSceneExits}]=await Promise.all([
    '/src/domain/catalog/catalog.ts','/src/kernel/game.ts','/battle/core/src/rng.ts','/raising/core/index.ts','/tools/verification/_battle.ts','/battle/core/src/index.ts','/src/domain/acquisition/acquisition.ts','/src/domain/acquisition/recruitment.ts','/src/domain/world/world.ts',
    '/src/domain/challenges/battle-facilities.ts','/src/features/world/scene-exits.ts',
  ].map(load));
  const {npcTrainingScripts}=await load('/src/domain/challenges/npc-training-scripts.ts');
  const expectedProfile=(team,species)=>['trainer_trained_core','trainer_fast_pressure','facility_elite'].includes(team)?species===70?'rei-classic-full':species===261?(team==='trainer_trained_core'?'gaia-blood-seal':'gaia-evil-seal'):undefined:undefined;
  const expectedStats=mon=>{const values=computeStats(mon,dex);if(mon.training_profile==='rei-classic-full')for(const [key,value] of Object.entries({hp:60,atk:20,def:30,spa:10,spd:20,spe:20}))values[key]+=value;return values;};
  const catalog=await loadCatalog(),catalogBytes=JSON.stringify(catalog),dex=makeDex(catalog),data=buildDataSet(catalog),byId=new Map(catalog.species.map(row=>[row.id,row])),skills=new Map(catalog.skills.map(row=>[row.id,row]));
  const trainedRewards=new Set(catalog.bosses.flatMap(boss=>boss.reward?.learn_skill?[`${boss.reward.learn_skill.species}/${boss.reward.learn_skill.skill}`]:[]));
  const eliteAdditions=new Set([70,261,421,468,774,798,865,875,927,1260,1447,1477,359,356,755,599,587,990,826,691,432]);
  const eliteEligible=mon=>sumBase(mon)>=600||eliteAdditions.has(mon.id);
  const eligible=catalog.species.filter(row=>!npc.has(row.id)),high=eligible.filter(row=>sumBase(row)>=600);
  report.catalog={all:catalog.species.length,eligible:eligible.length,high:high.length,exactly600:high.filter(row=>sumBase(row)===600).length};
  function ordinary(mon,label='member',allowTraining=false,profile){
    const species=byId.get(mon.species);assert(species,`${label}: known species`);assert(!npc.has(mon.species),`${label}: collectible species`);
    assert.equal(mon.level,100,`${label}: level`);assert.equal(mon.iv,31,`${label}: IV`);assert(catalog.natures.some(row=>row.id===mon.nature),`${label}: standard nature`);
    assert.equal(statKeys.reduce((sum,key)=>sum+(mon.evs[key]??0),0),510,`${label}: EV total`);
    assert(statKeys.every(key=>Number.isInteger(mon.evs[key]??0)&&(mon.evs[key]??0)>=0&&(mon.evs[key]??0)<=255),`${label}: EV bounds`);
    assert.equal(mon.skills.length,4,`${label}: four skills`);assert.equal(new Set(mon.skills).size,4,`${label}: distinct skills`);
    for(const id of mon.skills)assert(skills.has(id)&&(species.learnset.some(row=>row.skill===id&&Number.isInteger(row.level)&&row.level>=1&&row.level<=100)||allowTraining&&trainedRewards.has(`${mon.species}/${id}`)),`${label}: ${id} is naturally learned by Lv100 or an explicit matching-species training reward`);
    for(const key of ['hp','hp_override','stat_multipliers','pp','member_phases','beads','types'])assert(!(key in mon),`${label}: no boss override ${key}`);
    assert.equal(mon.training_profile,profile,`${label}: only an explicitly approved profile`);
    if(profile==='rei-classic-full')assert.deepEqual(mon.stats,expectedStats(mon));else assert(!('stats' in mon));
    if(profile?.startsWith('gaia-'))assert.deepEqual(mon.member_rules,[{rule:'script',id:profile==='gaia-blood-seal'?'npc_gaia_blood_seal':'npc_gaia_evil_seal'}]);else assert(!('member_rules' in mon));
  }
  function encounterChecks(encounter,label){
    assert.equal(encounter.category,'trainer');assert.equal(encounter.team.length,6);assert.equal(new Set(encounter.team.map(mon=>mon.species)).size,6);
    encounter.team.forEach((mon,index)=>ordinary(mon,`${label}/${index}`,['classic','elite'].includes(encounter.facility),expectedProfile(encounter.id,mon.species)));
    assert.deepEqual(encounter.rules,[{rule:'no_capture'}]);assert.deepEqual(encounter.reward,{items:{}});assert.deepEqual(encounter.phases,[]);
    assert.equal(encounter.ai.kind,'smart');assert.equal(encounter.ai.allow_switch,true);
    const battle=createBattle({data,scripts:npcTrainingScripts,seed:97,sides:[{kind:'player',team:[{species:1,level:100,skills:[10001]}]}],encounter});
    assert.equal(battle.sides[1].kind,'trainer');
    for(const [index,mon] of encounter.team.entries()){
      const expected=expectedStats(mon),actual=battle.sides[1].team[index];
      assert.deepEqual(actual.stats,expected,`${label}/${index}: ordinary stats plus only source-pinned training`);assert.equal(actual.maxHp,expected.hp);
    }
  }
  check('Independent catalog oracle covers all 1479 collectible forms and all 103 BST600 forms',()=>{
    assert.equal(catalog.species.length,1483);assert.equal(eligible.length,1479);assert.equal(high.length,103);assert.equal(report.catalog.exactly600,44);
    for(const row of eligible)assert(new Set(row.learnset.filter(entry=>entry.level>=1&&entry.level<=100&&skills.has(entry.skill)).map(entry=>entry.skill)).size>=4,`${row.id}: no learnset exclusion is needed`);
  });

  const ids=pool=>pool.map(row=>typeof row==='number'?row:row.id),views=buildFacilityViews(catalog),classic=views.find(row=>row.id==='classic');
  check('Facility pools exactly match the independent full-catalog and inclusive BST600 oracles',()=>{
    assert.deepEqual(sorted(ids(facilityPool(catalog))),sorted(eligible.map(row=>row.id)));
    assert.deepEqual(sorted(ids(facilityPool(catalog,600))),sorted(high.map(row=>row.id)));
    assert(!ids(facilityPool(catalog,601)).some(id=>sumBase(byId.get(id))===600),'The threshold is the six-stat sum, inclusive only at its actual boundary');
  });
  check('Three published facilities disclose six Lv100 opponents and the exact random pool sizes',()=>{
    assert.deepEqual(views.map(row=>row.id).sort(),['classic','elite','random']);
    for(const view of views){assert.equal(view.level,100);assert.equal(view.opponentCount,6);assert(view.name&&view.description);}
    assert.equal(views.find(row=>row.id==='random').poolSize,1479);assert.equal(views.find(row=>row.id==='elite').poolSize,124);
    assert.equal(classic.teams.length,catalog.trainers.length);assert(classic.teams.length>0);assert.deepEqual(classic.teams.map(row=>row.id).sort(),catalog.trainers.map(row=>row.id).sort());
    for(const team of classic.teams){assert.equal(team.opponents.length,6);assert(team.name&&team.description);for(const mon of team.opponents){assert.equal(mon.level,100);assert.equal(mon.baseTotal,sumBase(byId.get(mon.species)));}}
  });
  check('The shared Space Station terminal retains all facility modes without duplicate rooms',()=>{
    const station=WORLD_PLANETS.find(row=>row.id==='space-station');assert(station);
    assert.deepEqual(station.regions.map(row=>row.id),['resources','brave-tower','dark-arena','mystery']);
    assert.deepEqual(buildFacilityViews(catalog).map(row=>row.id).sort(),['classic','elite','random']);
    const hub=station.regions.find(row=>row.id==='resources'),exits=getSceneExits(station,hub);
    assert.equal(hub.originalMapId,102);assert.deepEqual(exits.map(exit=>exit.targetRegionId).sort(),['brave-tower','dark-arena']);
    for(const id of ['random-arena','elite-arena','classic-arena'])assert.equal(resolveWorldLocation(station.id,id).region.id,hub.id);
  });
  check('Every one of the 1479 eligible species generates a legal ordinary four-skill build',()=>{
    const covered=new Set();let batches=0;
    for(let index=0;index<eligible.length;index+=6){
      const members=eligible.slice(index,index+6);for(const extra of eligible){if(members.length===6)break;if(!members.some(row=>row.id===extra.id))members.push(extra);}
      const input={...catalog,species:members},bytes=JSON.stringify(input),encounter=createFacilityEncounter(input,'random',new Rng(index+1));
      assert.deepEqual(sorted(encounter.team.map(mon=>mon.species)),sorted(members.map(row=>row.id)),'A six-member candidate pool returns every candidate exactly once');
      encounterChecks(encounter,`all-catalog/${index}`);for(const mon of encounter.team)covered.add(mon.species);assert.equal(JSON.stringify(input),bytes);batches++;
    }
    assert.deepEqual(sorted(covered),sorted(eligible.map(row=>row.id)));report.exhaustive={species:covered.size,batches};
  });
  check('Random facilities use seeded local sampling without replacement and preserve source data',()=>{
    const oldRandom=Math.random,oldFetch=globalThis.fetch;
    Math.random=()=>{throw new Error('Facility generation must use the supplied seeded RNG')};globalThis.fetch=()=>{throw new Error('Facility generation must be offline')};
    try {
      for(const facilityId of ['random','elite'])for(const seed of [1,2,3,7,11,19,29,41,59,97,101,2026]){
        const first=new Rng(seed),second=new Rng(seed),before=[...first.s],a=createFacilityEncounter(catalog,facilityId,first),b=createFacilityEncounter(catalog,facilityId,second);
        assert.deepEqual(a,b,`${facilityId}/${seed}: same seed yields the same full encounter`);assert.deepEqual(first.s,second.s);assert.notDeepEqual(first.s,before,'A valid randomized roster consumes RNG');
        encounterChecks(a,`${facilityId}/${seed}`);if(facilityId==='elite')assert(a.team.every(mon=>eliteEligible(byId.get(mon.species))));
        generated.push({facilityId,seed,species:a.team.map(mon=>mon.species),baseTotals:a.team.map(mon=>sumBase(byId.get(mon.species))),rngAfter:[...first.s]});
      }
      for(const facilityId of ['random','elite'])assert(new Set(generated.filter(row=>row.facilityId===facilityId).map(row=>JSON.stringify(row.species))).size>1,'Different seeds produce different teams');
    } finally {Math.random=oldRandom;globalThis.fetch=oldFetch;}
  });
  check('All classic teams are stable six-member Lv100 rosters with only explicit source-pinned training',()=>{
    for(const team of classic.teams){
      const rng=new Rng(7),before=[...rng.s],a=createFacilityEncounter(catalog,'classic',rng,team.id),b=createFacilityEncounter(catalog,'classic',new Rng(29),team.id);
      encounterChecks(a,team.id);assert.deepEqual(a,b);assert.deepEqual(rng.s,before,'Choosing a fixed roster does not draw a random team');
      assert.deepEqual(a.team.map(({stats,member_rules,...member})=>member),catalog.trainers.find(row=>row.id===team.id).team);assert.deepEqual(a.team.map(mon=>mon.species),team.opponents.map(mon=>mon.species));
      const original=JSON.stringify(catalog.trainers);a.team[0].skills.length=0;assert.equal(JSON.stringify(catalog.trainers),original,'Returned encounter owns its mutable arrays');
    }
    assert(catalog.trainers.every(trainer=>trainer.team.length===6&&trainer.team.every(mon=>mon.level===100)));
  });
  check('Invalid facility IDs, fixed-team IDs, and undersized random pools reject before any RNG draw',()=>{
    for(const [input,facilityId,teamId] of [[catalog,'missing'],[catalog,'classic'],[catalog,'classic','missing'],[catalog,'random','trainer_offense'],[catalog,'elite','trainer_offense'],[{...catalog,species:eligible.slice(0,5)},'random'],[{...catalog,species:high.slice(0,5)},'elite']]){
      const rng=new Rng(197),before=[...rng.s];assert.throws(()=>createFacilityEncounter(input,facilityId,rng,teamId));assert.deepEqual(rng.s,before);
    }
  });

  const acquisitionBefore=[...buildAcquisitionIndex(catalog)],recruitmentBefore=buildRecruitmentRewards(catalog),base=parse(createGame(catalog,''));
  base.rng_state=[...new Rng(20261014).s];base.items.item_capsule_master=20;
  const make=(save=base,input=catalog)=>createGame(input,JSON.stringify(save));
  const actions=[{type:'startFacility',facilityId:'random'},{type:'startFacility',facilityId:'elite'},...classic.teams.map(team=>({type:'startFacility',facilityId:'classic',teamId:team.id}))];
  check('Controller exposes the same facility board without changing acquisition or recruitment definitions',()=>{
    const game=make();assert.deepEqual(game.snapshot().facilities,views);assert.deepEqual([...buildAcquisitionIndex(catalog)],acquisitionBefore);assert.deepEqual(buildRecruitmentRewards(catalog),recruitmentBefore);
    assert(!game.snapshot().bosses.some(row=>['random','elite'].includes(row.id)));assert(!game.snapshot().shopItems.some(row=>/facility|trainer_|random|elite/.test(row.id)));
  });
  check('Invalid public starts preserve the entire save and RNG, including an exhausted player team',()=>{
    for(const action of [{type:'startFacility',facilityId:'missing'},{type:'startFacility',facilityId:'classic',teamId:'missing'},{type:'startFacility',facilityId:'classic'},{type:'startFacility',facilityId:'random',teamId:'trainer_offense'},{type:'startFacility',facilityId:'elite',teamId:'trainer_offense'}])reject(make(),action,JSON.stringify(action));
    const exhausted=structuredClone(base);exhausted.storage.forEach(mon=>{mon.hp=0});for(const action of actions)reject(make(exhausted),action,'No living player');
  });
  for(const action of actions)check(`${action.facilityId}/${action.teamId??'generated'}: starts publicly, blocks capture, and leaves collection intact on retreat`,()=>{
    const first=make(),second=make(),before=parse(first);first.dispatch(action);second.dispatch(action);
    const battle=first.snapshot().battle;assert(battle);assert(!battle.finished);assert.equal(battle.enemyParty.length,6);assert(battle.enemyParty.every(mon=>mon.level===100));assert.equal(new Set(battle.enemyParty.map(mon=>mon.species)).size,6);assert.equal(battle.canCapture,false);
    if(action.facilityId==='elite')assert(battle.enemyParty.every(mon=>eliteEligible(byId.get(mon.species))));
    assert.deepEqual(first.snapshot().battle,second.snapshot().battle);assert.equal(first.exportSave(),second.exportSave());assert.notDeepEqual(parse(first).rng_state,before.rng_state);
    assert(battle.party.some(mon=>mon.level<100),'No hidden Lv100 gate is imposed on the player');
    reject(first,{type:'startFacility',facilityId:'random'},'An active battle cannot be replaced');reject(first,{type:'capture',itemId:'item_capsule_master'},'Facility opponents cannot be captured');
    assert.deepEqual(protectedSave(parse(first)),protectedSave(before));first.dispatch({type:'flee'});second.dispatch({type:'flee'});
    assert.equal(first.snapshot().battle.resultReason,'flee');assert.equal(first.exportSave(),second.exportSave());assert.deepEqual(protectedSave(parse(first)),protectedSave(before));
    const after=parse(first);assert.deepEqual(after.progress,before.progress,'Facilities never write boss attempts or clear history');
    const reloaded=make(after);first.dispatch(action);reloaded.dispatch(action);assert.deepEqual(battleState(first.snapshot().battle),battleState(reloaded.snapshot().battle),'A completed encounter save restores the next generated opponent roster independently of UI animation revisions');assert.equal(first.exportSave(),reloaded.exportSave());
    controller.push({facilityId:action.facilityId,teamId:action.teamId,species:battle.enemyParty.map(mon=>mon.species),reloaded:true});
  });

  // A player-only test attack isolates controller settlement from match difficulty.
  // NPC #125 is excluded from both random pools and every authored classic team,
  // so production opponent rosters, skills, and stats remain untouched.
  const winCatalog=structuredClone(catalog),testSkill=990001;
  winCatalog.skills.push({id:testSkill,name:{zh:'Facility settlement fixture'},type:'normal',category:'physical',power:1000000,accuracy:null,pp:30,priority:99,effects:[]});
  winCatalog.species.find(row=>row.id===125).learnset.push({level:1,skill:testSkill});
  const winDex=makeDex(winCatalog),winSave=structuredClone(base),attacker=createMonster(winDex,125,100,new Rng(123),{how:'editor',at:'2026-10-14T00:00:00.000Z'});
  attacker.uid='facility-settlement-player';attacker.skills=[testSkill];attacker.learned=[...new Set([...attacker.learned,testSkill])];attacker.pp={[testSkill]:30};attacker.iv=31;attacker.evs={hp:255,atk:255,def:0,spa:0,spd:0,spe:0};attacker.hp=computeStats(attacker,winDex).hp;
  winSave.storage=[attacker];winSave.party=[attacker.uid];winSave.game.traits={};
  for(const action of actions)check(`${action.facilityId}/${action.teamId??'generated'}: victory pays ordinary rewards without acquisition, essence, or boss-route pollution`,()=>{
    const game=make(winSave,winCatalog),before=parse(game);game.dispatch(action);assert(game.snapshot().battle);let turns=0;
    while(!game.snapshot().battle.finished&&turns++<12)game.dispatch({type:'move',skillId:testSkill});
    const battle=game.snapshot().battle,after=parse(game);assert(battle.finished&&battle.won,`Settlement fixture must win: ${battle.log.slice(-6).join(' | ')}`);assert.equal(after.game.coins-before.game.coins,500);assert(after.exp_pool-before.exp_pool>=1000);assert.equal(after.game.battlesWon-before.game.battlesWon,1);
    assert.deepEqual(protectedSave(after),protectedSave(before));
    assert.deepEqual(after.progress,before.progress,'Even classic facility victories stay outside boss history');
    assert.deepEqual(game.snapshot().quests.filter(row=>row.group==='spt-recruitment'),make(winSave,winCatalog).snapshot().quests.filter(row=>row.group==='spt-recruitment'));
    assert(!game.snapshot().shopItems.some(row=>/facility|trainer_|random|elite/.test(row.id)));
    controller.push({facilityId:action.facilityId,teamId:action.teamId,fixture:'player-only settlement attack',turns,coins:after.game.coins-before.game.coins,pooledExperience:after.exp_pool-before.exp_pool});
  });
  check('A 200-turn PP-recovery stalemate ends as a visible draw without rewards or collection changes',()=>{
    const stalledCatalog={...winCatalog,skills:winCatalog.skills.map(skill=>({...skill,category:'status',target:'self',power:0,accuracy:null,priority:0,effects:[{op:'restore_pp',target:'self',amount:'all'}]}))};
    const game=make(winSave,stalledCatalog),before=parse(game);game.dispatch({type:'startFacility',facilityId:'random'});assert(game.snapshot().battle);
    for(let turn=0;turn<200&&!game.snapshot().battle.finished;turn++)game.dispatch({type:'move',skillId:testSkill});
    const battle=game.snapshot().battle,after=parse(game);assert(battle.finished);assert.equal(battle.turn,200);assert.equal(battle.resultReason,'turn_cap');assert.equal(battle.won,false);assert.match(battle.result,/平局/);assert(battle.log.some(line=>line.includes('平局')));
    assert.deepEqual(protectedSave(after),protectedSave(before));assert.deepEqual(after.progress,before.progress);assert.equal(after.game.coins,before.game.coins);assert.equal(after.exp_pool,before.exp_pool);assert.equal(after.game.battlesWon,before.game.battlesWon);
    reject(game,{type:'move',skillId:testSkill},'Ended draw rejects further moves');game.dispatch({type:'closeBattle'});assert.equal(game.snapshot().battle,null);
    report.draw={turns:battle.turn,resultReason:battle.resultReason,result:battle.result,lastLog:battle.log.slice(-3)};
  });
  assert.equal(JSON.stringify(catalog),catalogBytes,'Verification preserves shared source definitions');
  t.finish(report);
});
