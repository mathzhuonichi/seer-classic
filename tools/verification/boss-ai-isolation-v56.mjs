/** Compare every Boss with the Git-recovered pre-tactical policy and test category boundaries. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const oracleRevision=execFileSync('git',['rev-parse','d7e87e9'],{cwd:root,encoding:'utf8'}).trim();
const oracleSource=execFileSync('git',['show',`${oracleRevision}:battle/core/src/ai.ts`],{cwd:root,encoding:'utf8'});
const oracleId='/__verification_legacy_boss_ai_v56.ts';
const server=await createServer({root,configFile:false,cacheDir:path.join(root,'artifacts/.validation-cache/boss-ai-isolation-v56'),
  plugins:[{name:'git-legacy-ai-oracle',resolveId:id=>id===oracleId?id:undefined,load:id=>id===oracleId?oracleSource.replaceAll("'./battle.ts'","'/battle/core/src/battle.ts'").replaceAll("'./types.ts'","'/battle/core/src/types.ts'"):undefined}],
  server:{middlewareMode:true,watch:null,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',logLevel:'error'});
const report={oracle:{revision:oracleRevision,path:'battle/core/src/ai.ts',sha256:crypto.createHash('sha256').update(oracleSource).digest('hex')},checks:[],failures:[],bossCases:[],facilityCases:[],scope:'The oracle is the complete historical policy loaded directly from Git, running on current battle mechanics and encounter data. This verifies project-policy restoration, not official server AI or historical battle-engine equivalence.'};
function check(name,run){try{run();report.checks.push(name);}catch(error){report.failures.push({name,error:String(error.stack)});console.error(`FAIL ${name}: ${error.message}`);}}
try {
  const [{createBattle,STRUGGLE_SKILL},{buildDataSet},{chooseAiAction,chooseAiReplacement},{chooseAiAction:oldAction},{tacticalAction},{loadCatalog},{SEER_SCRIPTS},{traitScripts},{campaignScripts},{npcTrainingScripts},{createFacilityEncounter},{Rng}]=await Promise.all([
    '/battle/core/src/battle.ts','/battle/core/src/data.ts','/battle/core/src/ai.ts',oracleId,'/battle/core/src/tactics.ts','/src/mechanics/catalog.ts','/battle/core/src/scripts/index.ts','/src/mechanics/traits.ts','/src/mechanics/campaign-rules.ts','/src/mechanics/npc-training.ts','/src/progression/battle-facilities.ts','/battle/core/src/rng.ts',
  ].map(id=>server.ssrLoadModule(id)));
  const catalog=await loadCatalog(),data=buildDataSet(catalog);
  const scripts={...SEER_SCRIPTS,...traitScripts,...campaignScripts,...npcTrainingScripts};
  const move=skill=>({kind:'move',skill});
  const decide=b=>chooseAiAction(b,b.sides[1]);
  const serial=b=>JSON.stringify(b,(_key,value)=>value instanceof Map?[...value]:value instanceof Set?[...value]:value);
  const observed=b=>({state:b.state,mon:b.sides.map(s=>s.team.map(m=>({aiCursor:m.aiCursor,ai:m.ai,persist:m.persist,vol:m.vol,usedSkills:[...m.usedSkills]})))});
  function matchOracle(current,reference,label){
    const actual=decide(current),expected=oldAction(reference,reference.sides[1]);
    assert.deepEqual(actual,expected,`${label}: action`);
    assert.deepEqual(observed(current),observed(reference),`${label}: RNG and decision side effects`);
    return actual;
  }
  function bossBattle(encounter,lead,seed){
    const b=createBattle({data,scripts,seed,sides:[{kind:'player',team:[{species:6,level:100,iv:31,skills:[10001],hp_override:20000}]}],encounter:structuredClone(encounter)});
    if(lead)b.switchIn(b.sides[1],lead);
    return b;
  }
  const states={
    full:()=>{},
    injured:b=>{b.active(1).hp=Math.max(1,Math.floor(b.active(1).maxHp*.2));},
    usedStatus:b=>{b.active(1).skills.forEach(id=>b.active(1).usedSkills.add(id));},
    knockout:b=>{b.active(0).hp=1;},
    partialPP:b=>{b.active(1).skills.forEach((id,i)=>{if(i%2===0)b.active(1).pp[id]=0;});},
    exhausted:b=>{b.active(1).skills.forEach(id=>{b.active(1).pp[id]=0;});},
  };
  check('Every catalog Boss member matches the pre-tactical Git oracle across six battle states',()=>{
    assert.equal(catalog.bosses.length,180);
    for(const encounter of catalog.bosses)for(let lead=0;lead<encounter.team.length;lead++)for(const [state,prepare] of Object.entries(states)){
      const current=bossBattle(encounter,lead,5617+lead),reference=bossBattle(encounter,lead,5617+lead);prepare(current);prepare(reference);
      assert.equal(current.sides[1].kind,'boss');
      const action=matchOracle(current,reference,`${encounter.id}/${lead}/${state}`);
      assert.equal(action.kind,'move');
      report.bossCases.push({boss:encounter.id,category:encounter.category,member:lead,state,action});
    }
  });

  const S={attack:1,wait:2,heal:3,quick:4,strong:5,fire:6,water:7,grass:8};
  const base={hp:100,atk:100,def:100,spa:100,spd:100,spe:100},stats={...base,hp:400};
  const attack=(id,power=80,extra={})=>({id,name:{zh:`Isolation fixture ${id}`},type:'normal',category:'physical',power,accuracy:null,pp:20,priority:0,effects:[],...extra});
  const raw={species:[{id:1,name:{zh:'Neutral'},types:['normal'],base},{id:2,name:{zh:'Fire'},types:['fire'],base},{id:3,name:{zh:'Water'},types:['water'],base},{id:4,name:{zh:'Grass'},types:['grass'],base}],
    types:{chart:{normal:{normal:1},fire:{grass:2,water:.5,fire:.5},water:{fire:2,grass:.5,water:.5},grass:{water:2,fire:.5,grass:.5}}},
    skills:[attack(S.attack),attack(S.wait,0,{category:'status',target:'self'}),attack(S.heal,0,{category:'status',target:'self',effects:[{op:'heal',pct_max_hp:50}]}),attack(S.quick,55,{priority:1}),attack(S.strong,140),attack(S.fire,90,{type:'fire',category:'special'}),attack(S.water,90,{type:'water',category:'special'}),attack(S.grass,70,{type:'grass',category:'special'})],
    items:[{id:'fixture_pp',name:{zh:'PP recovery'},battle_effects:[{op:'restore_pp',amount:20,target:'self'}]}]};
  const member=(species=1,skills=[S.attack,S.heal],extra={})=>({species,level:50,skills,stats:{...stats},...extra});
  function fixture(options={}){
    return createBattle({data:buildDataSet(structuredClone(raw)),seed:options.seed??71,scripts:options.scripts??{},sides:[
      {kind:'player',team:options.playerTeam??[member(1,[S.wait,S.attack])],rules:options.playerRules??[]},
      {kind:options.kind??'boss',team:options.team??[member(1,options.skills??[S.attack,S.heal])],ai:options.ai??{kind:'smart'},items:options.items??{},rules:options.rules??[]},
    ]});
  }
  check('Legacy setup, repeat-heal avoidance and KO priority are distinct from trainer heuristics',()=>{
    assert.deepEqual(decide(fixture()),move(S.heal));
    assert.deepEqual(decide(fixture({kind:'trainer'})),move(S.attack));
    for(const kind of ['boss','trainer']){
      const b=fixture({kind});b.active(1).hp=120;b.active(1).stats.spe=300;b.active(1).usedSkills.add(S.heal);
      assert.deepEqual(decide(b),move(kind==='boss'?S.attack:S.heal));
    }
    const knockout=fixture({skills:[S.heal,S.strong,S.quick]});knockout.active(0).hp=1;
    assert.deepEqual(decide(knockout),move(S.quick));
  });
  check('Bosses never acquire trainer PP-medicine planning even when supplies are available',()=>{
    const boss=fixture({skills:[S.strong],items:{fixture_pp:99}}),trainer=fixture({kind:'trainer',skills:[S.strong],items:{fixture_pp:99}});
    for(const b of [boss,trainer]){b.active(1).pp[S.strong]=0;b.active(1).stats.spe=300;}
    assert.deepEqual(decide(boss),move(STRUGGLE_SKILL.id));
    assert.deepEqual(decide(trainer),{kind:'item',item:'fixture_pp',target:0});
  });
  function matchup(kind='boss',replacement=false){
    const b=fixture({kind,ai:{kind:'smart',allow_switch:true},playerTeam:[member(2,[S.wait,S.fire,S.strong],{stats:{...stats,spe:300}})],
      team:replacement?[member(4,[S.wait],{hp:1,stats:{...stats,spe:1}}),member(4,[S.grass]),member(3,[S.water])]:[member(4,[S.grass]),member(3,[S.water])]});
    b.turn=3;b.active(1).turnsActive=2;b.log.push({type:'move_used',side:0,skill:S.fire,name:'Public fire attack'});return b;
  }
  check('An accidental allow_switch flag cannot give a Boss voluntary tactical switching',()=>{
    assert.equal(decide(matchup('boss')).kind,'move');
    assert.deepEqual(decide(matchup('trainer')),{kind:'switch',slot:1});
  });
  check('Normal turn KO replacement preserves Boss team order and trainer matchup selection',()=>{
    for(const [kind,expected] of [['boss',1],['trainer',2]]){
      const b=matchup(kind,true);b.submit(0,move(S.strong));const events=b.resolveTurn();
      assert(events.some(e=>e.type==='faint'&&e.side===1));assert.equal(b.sides[1].active,expected);assert.equal(b.phase,'choose');
    }
  });
  check('Explicit replacement-phase dispatch preserves the same category boundary',()=>{
    for(const [kind,expected] of [['boss',1],['trainer',2]]){
      const b=matchup(kind,true);b.dealDamage(b.active(1),b.active(1).hp,{kind:'true'});b.phase='replace';b.sides[1].needsReplacement=true;
      assert.deepEqual(chooseAiReplacement(b,b.sides[1]),kind==='boss'?undefined:{kind:'switch',slot:2});
      b.resolveTurn();assert.equal(b.sides[1].active,expected);assert.equal(b.phase,'choose');
    }
  });
  check('Wild random, sequence, weighted, script and forced-skill behavior matches the old oracle',()=>{
    const policies=[{kind:'random'},{kind:'sequence',skills:[S.heal,S.attack]},{kind:'weighted',weights:{[S.heal]:3,[S.attack]:1}},{kind:'weighted',weights:{}},{kind:'script',id:'fixed'},{kind:'script',id:'fallback'}];
    const callbacks={fixed:{apply:()=>move(S.heal)},fallback:{apply:()=>undefined}};
    for(const ai of policies)for(const kind of ['wild','boss','trainer'])for(let seed=1;seed<=8;seed++){
      const a=fixture({kind,ai,seed,scripts:callbacks}),b=fixture({kind,ai,seed,scripts:callbacks});
      for(let i=0;i<3;i++)matchOracle(a,b,`${kind}/${ai.kind}/${seed}/${i}`);
    }
    for(const kind of ['wild','boss','trainer']){
      const a=fixture({kind}),b=fixture({kind});a.active(1).vol.forcedSkill=S.attack;b.active(1).vol.forcedSkill=S.attack;
      assert.deepEqual(matchOracle(a,b,`${kind}/forced`),move(S.attack));assert.equal(a.active(1).vol.forcedSkill,undefined);
    }
    const a=fixture({kind:'wild'}),b=fixture({kind:'wild'});a.sides[1].ai=undefined;b.sides[1].ai=undefined;
    for(let i=0;i<10;i++)matchOracle(a,b,`default-wild/${i}`);
  });
  check('Legacy fallback randomness and skill-order ties remain seeded and preserve equipped order',()=>{
    for(let seed=1;seed<=16;seed++){
      const a=fixture({seed,skills:[S.wait,S.heal]}),b=fixture({seed,skills:[S.wait,S.heal]});
      for(const battle of [a,b])battle.active(1).skills.forEach(id=>battle.active(1).usedSkills.add(id));
      matchOracle(a,b,`no-damage/${seed}`);
    }
    const b=fixture({skills:[S.strong,S.attack]});b.data.skills.get(S.strong).power=b.data.skills.get(S.attack).power;
    assert.deepEqual(decide(b),move(S.strong));
  });
  check('Historical live-hook evaluation remains part of Boss policy while trainer scoring stays pure',()=>{
    const b=fixture(),calls={damage:0,priority:0};
    b.estimateDamage=(_user,_foe,skill)=>{calls.damage++;return skill.id===S.attack?1000:0;};
    b.priority=()=>{calls.priority++;return 0;};
    assert.deepEqual(decide(b),move(S.attack));assert.deepEqual(calls,{damage:2,priority:2});
    const trainer=fixture({kind:'trainer'});trainer.estimateDamage=trainer.priority=()=>{throw new Error('Trainer used a live callback');};
    assert.deepEqual(decide(trainer),move(S.attack));
  });
  check('Existing encounter choose_action scripts retain authority over generic Boss selection',()=>{
    const encounter=catalog.bosses.find(row=>row.id==='boss_spt_moduosa');assert(encounter);
    const b=bossBattle(encounter,0,123);b.active(0).types=['light'];b.submit(0,move(10001));const events=b.resolveTurn();
    assert(events.some(e=>e.type==='move_used'&&e.side===1&&e.skill===11470));
  });
  check('Existing weighted HP-phase Boss policy changes remain active',()=>{
    const encounter=catalog.bosses.find(row=>row.ai?.kind==='weighted');assert(encounter?.phases.length);
    const a=bossBattle(encounter,0,124),b=bossBattle(encounter,0,124);
    for(const battle of [a,b])battle.dealDamage(battle.active(1),Math.floor(battle.active(1).maxHp*.6),{kind:'true'});
    assert(a.active(1).ai||JSON.stringify(a.sides[1].ai)!==JSON.stringify(encounter.ai),'The HP phase must replace its policy');
    for(let i=0;i<12;i++)matchOracle(a,b,`${encounter.id}/HP-phase/${i}`);
  });
  check('Every fixed trainer and both generated facilities dispatch the unchanged tactical planner',()=>{
    const encounters=[...catalog.trainers.map(row=>createFacilityEncounter(catalog,'classic',new Rng(560),row.id)),...['random','elite'].map(id=>createFacilityEncounter(catalog,id,new Rng(561)))];
    assert.equal(encounters.length,12);
    for(const encounter of encounters)for(let lead=0;lead<encounter.team.length;lead++){
      const b=createBattle({data,scripts,seed:562,sides:[{kind:'player',team:[{species:6,level:100,skills:[10001]}]}],encounter});if(lead)b.switchIn(b.sides[1],lead);
      assert.equal(b.sides[1].kind,'trainer');const before=serial(b),actual=decide(b);
      assert.deepEqual(actual,tacticalAction(b,b.sides[1],b.active(1).ai??b.sides[1].ai));assert.equal(serial(b),before);
      report.facilityCases.push({encounter:encounter.id,facility:encounter.facility,member:lead,action:actual});
    }
  });
  report.sourceHashes=Object.fromEntries(['battle/core/src/ai.ts','battle/core/src/legacy-ai.ts','battle/core/src/battle.ts','battle/core/src/tactics.ts'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
}catch(error){report.failures.push({name:'harness',error:String(error.stack)});}
finally{
  const dir=path.join(root,'artifacts/boss-ai-isolation-v56');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'regression.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.checks.length,bosses:new Set(report.bossCases.map(row=>row.boss)).size,bossCases:report.bossCases.length,facilityCases:report.facilityCases.length,failures:report.failures},null,2));
  await server.close();if(report.failures.length)process.exitCode=1;
}
