/** Grouped classic rosters, exact training origins, ordinary builds, and previews. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}});
// SSR has no clicks. Query-specific fixtures change only the selected UI state;
// all production grouping, member lookup, descriptions, and rendering stay real.
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error',plugins:[{
  name:'classic-selected-state-audit',enforce:'pre',transform(code,id){
    if(!id.includes('/src/components/BattleFacilities.tsx?'))return;
    const query=new URLSearchParams(id.split('?')[1]);if(!query.has('auditTeam'))return;
    return code.replace("[teamId,setTeamId]=useState('')",`[teamId,setTeamId]=useState(${JSON.stringify(query.get('auditTeam'))})`)
      .replace("[groupId,setGroupId]=useState('trained')",`[groupId,setGroupId]=useState(${JSON.stringify(query.get('auditGroup'))})`)
      .replace('[memberIndex,setMemberIndex]=useState(0)',`[memberIndex,setMemberIndex]=useState(${Number(query.get('auditMember')??0)})`);
  },
}]});
const checks=[],failures=[],teams=[],previews=[];
const report={checks,failures,teams,previews};
function check(name,run){try{run();checks.push(name)}catch(error){failures.push({name,error:String(error.stack).slice(0,5000)});console.error(`FAIL ${name}: ${error.message.split('\n')[0]}`)}}
const sorted=values=>[...values].sort((a,b)=>a-b),statKeys=['hp','atk','def','spa','spd','spe'];
const approved={
  trainer_offense:{group:'foundation',species:[3,6,9,12,15,79]},
  trainer_control:{group:'foundation',species:[42,67,24,85,93,110]},
  trainer_attrition:{group:'foundation',species:[3,32,88,177,52,61]},
  trainer_trained_core:{group:'trained',species:[70,261,216,303,306,309]},
  trainer_fast_pressure:{group:'trained',species:[70,261,798,875,865,309]},
  trainer_resilient_counter:{group:'trained',species:[216,303,306,318,429,393]},
  trainer_fusion_specialists:{group:'specialist',species:[315,321,324,340,343,429]},
  trainer_dragon_sanctuary:{group:'specialist',species:[216,274,391,413,400,626]},
  trainer_shining_team:{group:'specialist',species:[166,286,312,411,444,1250]},
  trainer_legendary:{group:'legendary',species:[300,501,502,503,504,1000]},
};
try {
  const [{loadCatalog},{createGame},{buildFacilityViews,createFacilityEncounter},{trainerSkillOrigin},{createBattle,buildDataSet,Rng},{SEER_SCRIPTS},{makeDex,computeStats},{buildAcquisitionIndex},{buildRecruitmentRewards},{FUSION_RECIPES},{default:BattleFacilities}]=await Promise.all([
    '/src/mechanics/catalog.ts','/src/game.ts','/src/progression/battle-facilities.ts','/src/progression/trainer-skills.ts','/battle/core/src/index.ts','/battle/core/src/scripts/index.ts','/raising/core/index.ts','/src/progression/acquisition.ts','/src/progression/recruitment.ts','/src/progression/fusion.ts','/src/components/BattleFacilities.tsx',
  ].map(path=>server.ssrLoadModule(path)));
  const {npcTrainingScripts}=await server.ssrLoadModule('/src/mechanics/npc-training.ts');
  const expectedProfile=(team,species)=>['trainer_trained_core','trainer_fast_pressure'].includes(team)?species===70?'rei-classic-full':species===261?(team==='trainer_trained_core'?'gaia-blood-seal':'gaia-evil-seal'):undefined:undefined;
  const expectedStats=mon=>{const values=computeStats(mon,dex);if(mon.training_profile==='rei-classic-full')for(const [key,value] of Object.entries({hp:60,atk:20,def:30,spa:10,spd:20,spe:20}))values[key]+=value;return values;};
  const catalog=await loadCatalog(),catalogBytes=JSON.stringify(catalog),trainers=catalog.trainers??[],byId=new Map(catalog.species.map(row=>[row.id,row])),skills=new Map(catalog.skills.map(row=>[row.id,row])),dex=makeDex(catalog),data=buildDataSet(catalog);
  const rewards=new Map(catalog.bosses.flatMap(boss=>boss.reward?.learn_skill?[[`${boss.reward.learn_skill.species}/${boss.reward.learn_skill.skill}`,boss]]:[]));
  const natural=(species,id)=>byId.get(species)?.learnset.some(row=>row.skill===id&&Number.isInteger(row.level)&&row.level>=1&&row.level<=100);
  const expectedOrigin=(species,id)=>!skills.has(id)?undefined:natural(species,id)?'level':rewards.has(`${species}/${id}`)?'training':undefined;
  const facilities=buildFacilityViews(catalog),classic=facilities.find(row=>row.id==='classic'),game=createGame(catalog,''),saved=game.exportSave();

  check('At least ten approved coherent rosters occupy the four explicit thematic groups',()=>{
    assert(trainers.length>=10);assert.equal(new Set(trainers.map(row=>row.id)).size,trainers.length);assert.deepEqual(classic.groups.map(row=>row.id),['trained','foundation','specialist','legendary']);
    for(const [id,expected] of Object.entries(approved)){const trainer=trainers.find(row=>row.id===id);assert(trainer,id);assert.equal(trainer.roster_group,expected.group,id);assert.deepEqual(sorted(trainer.team.map(mon=>mon.species)),sorted(expected.species),id);}
    const order=new Set();for(const trainer of trainers){assert(classic.groups.some(group=>group.id===trainer.roster_group));assert(Number.isInteger(trainer.roster_order)&&trainer.roster_order>=0);const key=`${trainer.roster_group}/${trainer.roster_order}`;assert(!order.has(key),'Ordering is unambiguous inside each group');order.add(key);}
    assert.equal(classic.teams[0].id,'trainer_trained_core','The default classic selection is the trained core');
  });
  check('Foundation teams exclude trained and fusion cores, and trained teams exclude primitive starters',()=>{
    const advanced=new Set([70,216,261,303,306,309,318,429,393,798,875,865]);
    const primitive=new Set([3,6,9,12,15,24,32,42,52,61,67,79,85,88,93,110,177]);
    for(const trainer of trainers.filter(row=>row.roster_group==='foundation'))assert(trainer.team.every(mon=>!advanced.has(mon.species)));
    for(const trainer of trainers.filter(row=>row.roster_group==='trained'))assert(trainer.team.every(mon=>!primitive.has(mon.species)));
    const fusionForms=new Set(FUSION_RECIPES.flatMap(recipe=>recipe.outcomes.map(outcome=>outcome.species))),queue=[...fusionForms];
    for(let i=0;i<queue.length;i++)for(const edge of byId.get(queue[i]).evolution??[])if(!fusionForms.has(edge.to)){fusionForms.add(edge.to);queue.push(edge.to);}
    assert(trainers.find(row=>row.id==='trainer_fusion_specialists').team.every(mon=>fusionForms.has(mon.species)),'Fusion specialists actually descend from implemented fusion outcomes');
    assert(trainers.find(row=>row.id==='trainer_shining_team').team.every(mon=>byId.get(mon.species).name.zh.includes('闪光')),'The shiny group uses actual shiny forms');
  });
  for(const trainer of trainers)check(`${trainer.id}: six ordinary Lv100 builds expose four legal moves and complementary roles`,()=>{
    assert.equal(trainer.category,'trainer');assert.equal(trainer.team.length,6);assert.equal(new Set(trainer.team.map(mon=>mon.species)).size,6);assert.deepEqual(trainer.rules,[{rule:'no_capture'}]);assert.deepEqual(trainer.phases,[]);assert.deepEqual(trainer.reward,{items:{}});assert.equal(trainer.ai.kind,'smart');assert.equal(trainer.ai.allow_switch,true);
    const encounter=createFacilityEncounter(catalog,'classic',new Rng(731),trainer.id),battle=createBattle({data,scripts:{...SEER_SCRIPTS,...npcTrainingScripts},seed:731,sides:[{kind:'player',team:[{species:125,level:100,skills:[10001]}]}],encounter});
    const categories=new Set(),types=new Set(),roles=new Set();let utilityMembers=0;
    for(const [index,mon] of trainer.team.entries()){
      assert.equal(mon.level,100);assert.equal(mon.iv,31);assert(catalog.natures.some(row=>row.id===mon.nature));assert.equal(statKeys.reduce((sum,key)=>sum+(mon.evs[key]??0),0),510);assert(statKeys.every(key=>Number.isInteger(mon.evs[key]??0)&&(mon.evs[key]??0)>=0&&(mon.evs[key]??0)<=255));
      assert.equal(mon.skills.length,4);assert.equal(new Set(mon.skills).size,4);assert(mon.role?.zh?.length>0);assert(mon.tactical_role?.length>0);roles.add(mon.role.zh);byId.get(mon.species).types.forEach(type=>types.add(type));
      for(const key of ['hp','hp_override','stats','stat_multipliers','pp','member_rules','member_phases','beads','types'])assert(!(key in mon),`${trainer.id}/${mon.species}: no boss advantage ${key}`);
      for(const id of mon.skills){assert(expectedOrigin(mon.species,id),`${trainer.id}/${mon.species}/${id}: independent natural-or-reward oracle`);assert.equal(trainerSkillOrigin(catalog,mon.species,id)?.kind,expectedOrigin(mon.species,id));}
      const moves=mon.skills.map(id=>skills.get(id));assert(moves.some(skill=>skill.category!=='status'&&skill.power>0),'Every member can deal ordinary damage');moves.filter(skill=>skill.category!=='status').forEach(skill=>categories.add(skill.category));if(moves.some(skill=>skill.category==='status'||skill.effects?.some(effect=>effect.op==='clear_stages')))utilityMembers++;
      assert.equal(mon.training_profile,expectedProfile(trainer.id,mon.species),'Only four explicitly approved members carry a training profile');
      const actual=battle.sides[1].team[index];assert.deepEqual(actual.stats,expectedStats(mon),'Ordinary formula plus only the independently pinned Rei training additions');assert(Object.values(actual.stages).every(value=>value===0),'Permanent training does not create stat stages');
      assert.deepEqual(actual.conditions.filter(c=>c.id.startsWith('npc_gaia_')).map(c=>c.id),mon.training_profile==='gaia-blood-seal'?['npc_gaia_blood_seal']:mon.training_profile==='gaia-evil-seal'?['npc_gaia_evil_seal']:[],'Exactly one chosen Gaia trait belongs only to its owner');
    }
    assert(types.size>=2);assert(roles.size>=4);assert(utilityMembers>=2);
    teams.push({id:trainer.id,group:trainer.roster_group,species:trainer.team.map(mon=>mon.species),types:[...types],attackCategories:[...categories],utilityMembers,trainedMoves:trainer.team.flatMap(mon=>mon.skills.filter(id=>expectedOrigin(mon.species,id)==='training').map(id=>({species:mon.species,skill:id})))});
  });
  check('Only exact species-matched training rewards bypass ordinary level-based move eligibility',()=>{
    assert.deepEqual(sorted([...rewards.keys()].filter(key=>key.startsWith('70/')).map(key=>Number(key.split('/')[1]))),[10823,10824,10825,20363,20364]);
    for(const [key,boss] of rewards){const [species,skill]=key.split('/').map(Number),origin=trainerSkillOrigin(catalog,species,skill);assert.equal(origin.kind,natural(species,skill)?'level':'training');if(origin.kind==='training')assert.equal(origin.source,boss.name.zh);
      for(const candidate of catalog.species)if(candidate.id!==species&&!natural(candidate.id,skill))assert.equal(trainerSkillOrigin(catalog,candidate.id,skill),undefined,`${candidate.id}/${skill}: another species cannot inherit this reward`);
    }
    for(const level of [null,0,-1,1.5,101]){const input={...catalog,species:catalog.species.map(row=>row.id===3?{...row,learnset:[{level,skill:10825}]}:row)};assert.equal(trainerSkillOrigin(input,3,10825),undefined,`Invalid natural level ${level}`);}
    for(const level of [1,100]){const input={...catalog,species:catalog.species.map(row=>row.id===3?{...row,learnset:[{level,skill:10825}]}:row)};assert.equal(trainerSkillOrigin(input,3,10825)?.kind,'level');}
    assert.equal(trainerSkillOrigin(catalog,70,9999999),undefined);assert.equal(trainerSkillOrigin(catalog,9999999,10825),undefined);
  });
  check('The trained Rei, Gaia, and Hamoret core actually carries and executes its strengthening moves',()=>{
    const core=trainers.find(row=>row.id==='trainer_trained_core');assert(core);const bySpecies=new Map(core.team.map(mon=>[mon.species,mon]));
    assert(bySpecies.get(70).skills.includes(10825)&&bySpecies.get(70).skills.includes(20364));assert(bySpecies.get(261).skills.includes(20312));assert(bySpecies.get(216).skills.includes(20269));
    const noop=990002,fixtureData=buildDataSet({...catalog,skills:[...catalog.skills,{id:noop,name:{zh:'Training audit wait'},type:'normal',category:'status',target:'self',power:0,accuracy:null,pp:30,effects:[]}]});
    report.strengthening=[];
    for(const [species,skill,expected] of [[70,20364,{atk:2,spe:2}],[261,20312,{atk:2,acc:2}],[216,20269,{atk:1,def:1,spa:1,spd:1,spe:1}]]){
      const battle=createBattle({data:fixtureData,scripts:SEER_SCRIPTS,seed:71,sides:[{kind:'player',team:[structuredClone(bySpecies.get(species))]},{kind:'trainer',team:[{species:125,level:100,skills:[noop]}]}]});
      battle.submit(0,{kind:'move',skill});battle.submit(1,{kind:'move',skill:noop});battle.resolveTurn();for(const [key,value] of Object.entries(expected))assert.equal(battle.active(0).stages[key],value);
      report.strengthening.push({species,skill,stages:{...battle.active(0).stages}});
    }
  });
  check('Classic views disclose every real role and move, marking only actual training rewards',()=>{
    assert.equal(classic.teams.length,trainers.length);
    for(const team of classic.teams){const trainer=trainers.find(row=>row.id===team.id);assert.equal(team.groupId,trainer.roster_group);assert.equal(team.opponents.length,6);
      for(const [index,mon] of team.opponents.entries()){const raw=trainer.team[index];assert.equal(mon.role,raw.role.zh);assert.deepEqual(mon.skills.map(skill=>skill.id),raw.skills);for(const skill of mon.skills){assert.equal(skill.name,skills.get(skill.id).name.zh);assert.equal(!!skill.training,expectedOrigin(mon.species,skill.id)==='training');if(skill.training)assert.equal(skill.training,rewards.get(`${mon.species}/${skill.id}`).name.zh);}}
    }
    const html=renderToStaticMarkup(React.createElement(BattleFacilities,{s:game.snapshot(),c:game,facilityId:'classic'}));const core=classic.teams.find(row=>row.id==='trainer_trained_core');assert(html.includes(`aria-label="${core.name}完整阵容"`));assert(html.includes('雷神觉醒')&&html.includes('雷神天明闪')&&html.includes('特训技能'));assert(html.includes('612')&&html.includes('532')&&html.includes('能力特训完成'),'The preview distinguishes original base total from trained equivalent strength');assert.equal((html.match(/，查看配招"/g)??[]).length,6);
  });
  for(const team of classic.teams){
    const path=`/src/components/BattleFacilities.tsx?auditGroup=${encodeURIComponent(team.groupId)}&auditTeam=${encodeURIComponent(team.id)}&auditMember=0`,{default:SelectedFacilities}=await server.ssrLoadModule(path);
    check(`${team.id}: selected group renders this complete roster and its lead role plus four moves`,()=>{
      const html=renderToStaticMarkup(React.createElement(SelectedFacilities,{s:game.snapshot(),c:game,facilityId:'classic'}));assert(html.includes(`aria-label="${team.name}完整阵容"`));assert(html.includes(`aria-label="${team.opponents[0].name}配招详情"`));assert.equal((html.match(/，查看配招"/g)??[]).length,6);
      for(const mon of team.opponents)assert(html.includes(`${mon.name}，Lv.100，查看配招`));assert(html.includes(team.opponents[0].role));for(const skill of team.opponents[0].skills)assert(html.includes(skill.name));
      previews.push({teamId:team.id,groupId:team.groupId,member:team.opponents[0].species});
    });
  }
  check('NPC training neither teaches the player reward moves nor changes acquisition and recruitment',()=>{
    const without={...catalog,trainers:[]};assert.deepEqual([...buildAcquisitionIndex(catalog)],[...buildAcquisitionIndex(without)]);assert.deepEqual(buildRecruitmentRewards(catalog),buildRecruitmentRewards(without));
    const candidate=createGame(catalog,saved);candidate.dispatch({type:'cheatAcquire',species:70,level:100});const rei=candidate.snapshot().monsters.find(mon=>mon.species===70);assert(rei);assert(!rei.learned.some(skill=>[10823,10824,10825,20363,20364].includes(skill.id)));
    const before=JSON.parse(candidate.exportSave());candidate.dispatch({type:'startFacility',facilityId:'classic',teamId:'trainer_trained_core'});const opponent=candidate.snapshot().battle.enemyParty.find(mon=>mon.species===70);assert(opponent.skills.some(skill=>skill.id===20364)&&opponent.skills.some(skill=>skill.id===10825));candidate.dispatch({type:'flee'});const after=JSON.parse(candidate.exportSave());
    assert.deepEqual(after.storage.find(mon=>mon.uid===rei.uid).learned,before.storage.find(mon=>mon.uid===rei.uid).learned);for(const key of ['dex','items','progress'])assert.deepEqual(after[key],before[key]);for(const key of ['quests','recruitmentClaims','shopUnlocked','campaigns'])assert.deepEqual(after.game[key],before.game[key]);
  });
  assert.equal(JSON.stringify(catalog),catalogBytes,'Verification preserves shared definitions');
}catch(error){failures.push({name:'harness',error:String(error.stack).slice(0,7000)});}
finally{
  fs.mkdirSync('artifacts/classic-teams-v38',{recursive:true});fs.writeFileSync('artifacts/classic-teams-v38/regression.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:checks.length,teams:teams.length,previews:previews.length,failures},null,2));await server.close();if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else delete globalThis.localStorage;if(failures.length)process.exitCode=1;
}
