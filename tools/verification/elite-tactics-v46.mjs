/** Authored elite builds: boost theft, observed control immunity, and Gaia's installed seal. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createServer} from 'vite';

const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error'});
const report={checks:[],failures:[],witnesses:[]};
const check=(name,run)=>{try{run();report.checks.push(name);}catch(error){report.failures.push({name,error:String(error.stack)});console.error(`FAIL ${name}: ${error.message}`);}};
try {
  const [{loadCatalog},{normalizeNpcTrainingEncounter},{npcTrainingScripts},{createBattle:createBattleRaw,buildDataSet},{chooseAiAction},{SEER_SCRIPTS}]=await Promise.all([
    '/src/mechanics/catalog.ts','/src/progression/npc-training.ts','/src/mechanics/npc-training.ts','/battle/core/src/index.ts','/battle/core/src/ai.ts','/battle/core/src/scripts/index.ts',
  ].map(path=>server.ssrLoadModule(path)));
  // V58: this suite verifies the retained V57 planner (tactics.ts); the search planner has its own suites.
  const createBattle=(...args)=>{const battle=createBattleRaw(...args);for(const side of battle.sides)if(side.kind==='trainer'&&!side.ai)side.ai={kind:'smart'};for(const side of battle.sides)for(const holder of [side,...side.team])if(holder.ai&&(holder.ai.kind??'smart')==='smart')holder.ai={...holder.ai,planner:'v57'};return battle;};
  const catalog=await loadCatalog(),catalogBefore=JSON.stringify(catalog),roster=JSON.parse(fs.readFileSync('data/elite-roster.json','utf8'));
  const WAIT=990470,HIT=990471,FOE=990472,BULK=990473;
  const fixtureSkills=[
    {id:WAIT,name:{zh:'Elite audit wait'},type:'normal',category:'status',target:'self',power:0,accuracy:null,pp:99,effects:[]},
    {id:HIT,name:{zh:'Elite audit announced attack'},type:'normal',category:'physical',power:150,accuracy:null,pp:99,effects:[]},
  ];
  const data=buildDataSet({...catalog,skills:[...catalog.skills,...fixtureSkills],species:[...catalog.species,
    {id:FOE,name:{zh:'Elite audit fast neutral opponent'},types:['normal'],base:{hp:100,atk:100,def:180,spa:100,spd:180,spe:200}},
    {id:BULK,name:{zh:'Elite audit bulky neutral opponent'},types:['normal'],base:{hp:200,atk:80,def:300,spa:80,spd:300,spe:60}},
  ]});
  const build=id=>({species:id,...structuredClone(roster.additions.find(row=>row.species===id).build)});
  const member=(species,skills,extra={})=>({species,level:100,iv:15,nature:'hardy',skills,...extra});
  const scripts={...SEER_SCRIPTS,...npcTrainingScripts};
  function fixture(id,{foe=member(BULK,[WAIT,HIT]),foeRules=[],seed=46,seal=true}={}) {
    const own=build(id);if(!seal)delete own.training_profile;
    const encounter=normalizeNpcTrainingEncounter(catalog,{id:'elite-tactics-audit',category:'trainer',facility:'elite',team:[own],rules:[],phases:[],reward:{items:{}},ai:{kind:'smart',style:'balanced',allow_switch:false}});
    return createBattle({data,scripts,seed,sides:[{kind:'player',team:[foe],rules:foeRules}],encounter});
  }
  const action=b=>chooseAiAction(b,b.sides[1]);
  const legal=(b,a)=>assert(b.legalActions(1).some(v=>JSON.stringify(v)===JSON.stringify(a)),JSON.stringify(a));
  const state=b=>JSON.stringify(b,(_key,value)=>value instanceof Map?[...value]:value instanceof Set?[...value]:value);
  const announce=(b,id)=>b.log.push({type:'move_used',side:0,skill:id,name:data.skills.get(id).name.zh});
  const turn=(b,own,foe=WAIT)=>{b.submit(0,{kind:'move',skill:foe});b.submit(1,own);return b.resolveTurn();};
  const add=(b,side,id,turns=4)=>b.active(side).conditions.push({id,def:data.conditions.get(id),turns,appliedTurn:0});
  const visibleHook=(b,id,hooks)=>{b.active(0).conditions.push({id,def:{id,kind:'buff',hooks},turns:4,appliedTurn:0});b.log.push({type:'condition_added',side:0,condition:id});};

  check('Cassius values the actual boost-theft attack against visible positive stages',()=>{
    const b=fixture(798);Object.assign(b.active(0).stages,{atk:4,def:4,spd:4,spe:-2});
    const chosen=action(b);assert.equal(chosen.skill,11924);legal(b,chosen);
    const before={...b.active(0).stages},events=turn(b,chosen);
    assert.equal(b.active(1).stages.atk,4);assert.equal(b.active(1).stages.spd,4);
    assert.equal(b.active(0).stages.atk,0);assert.equal(b.active(0).stages.def,0);assert.equal(b.active(0).stages.spd,0);
    assert.equal(b.active(0).stages.spe,-2);assert.equal(b.active(1).stages.spe,0);
    // Critical powered hits clear defense first in the engine; this test does not rewrite that behavior.
    const critical=events.some(e=>e.type==='damage'&&e.side===0&&e.kind==='attack'&&e.crit);
    assert.equal(b.active(1).stages.def,critical?0:4);
    report.witnesses.push({species:798,skill:chosen.skill,foeBefore:before,foeAfter:{...b.active(0).stages},ownAfter:{...b.active(1).stages},critical});
  });
  check('Boost theft does not reward absent or negative-only boosts and respects stage caps',()=>{
    for(const negative of [false,true]){const b=fixture(798);if(negative)Object.assign(b.active(0).stages,{atk:-4,def:-4,spd:-4});assert.notEqual(action(b).skill,11924);}
    const b=fixture(798);b.active(0).stages.atk=4;b.active(1).stages.atk=5;turn(b,{kind:'move',skill:11924});assert.equal(b.active(1).stages.atk,6);assert.equal(b.active(0).stages.atk,0);
    const exhausted=fixture(798);exhausted.active(0).stages.atk=6;exhausted.active(1).pp[11924]=0;assert.notEqual(action(exhausted).skill,11924);
  });
  check('A type-immune powered theft does not earn impossible secondary-effect utility',()=>{
    const b=fixture(798);b.active(0).types=['audit-immune'];Object.assign(b.active(0).stages,{atk:6,def:6,spd:6});
    // Composite ground/shadow is only partially resisted by flying. A complete
    // synthetic immunity must explicitly block both constituents, not one.
    b.data={...data,types:{...data.types,chart:{...data.types.chart,ground:{...data.types.chart.ground,'audit-immune':0},shadow:{...data.types.chart.shadow,'audit-immune':0}}}};
    assert.notEqual(action(b).skill,11924);
  });

  const jabu=()=>fixture(826,{foe:member(468,[11224,20486,20488,11017],{iv:31,evs:{spa:255,spe:255}})});
  check('Jabu prepares immunity for a revealed sleep move with its real four-move build',()=>{
    const b=jabu();announce(b,20486);const chosen=action(b);assert.equal(chosen.skill,21020);legal(b,chosen);
    // The opponent waits during preparation; a subsequent real sleep attempt is blocked.
    b.active(0).skills.push(WAIT);b.active(0).pp[WAIT]=99;
    turn(b,chosen);assert(b.active(1).conditions.some(c=>c.id==='cond_immune_status'));
    const events=turn(b,{kind:'move',skill:11994},20486);assert(!b.active(1).conditions.some(c=>c.id==='sleep'));
    assert(events.some(e=>e.type==='status_blocked'&&e.side===1));
    report.witnesses.push({species:826,skill:chosen.skill,revealedControl:20486,blockedSleep:true});
  });
  check('Jabu does not infer hidden control, refresh a long buff, or use exhausted immunity',()=>{
    const hidden=jabu();assert.notEqual(action(hidden).skill,21020);
    const active=jabu();announce(active,20486);add(active,1,'cond_immune_status',4);assert.notEqual(action(active).skill,21020);
    const exhausted=jabu();announce(exhausted,20486);exhausted.active(1).pp[21020]=0;assert.notEqual(action(exhausted).skill,21020);
    const harmless=jabu();announce(harmless,11224);assert.notEqual(action(harmless).skill,21020);
  });
  check('Existing burn or poison still leaves a distinct revealed sleep threat worth preventing',()=>{
    for(const id of ['burn','poison']){const b=jabu();announce(b,20486);add(b,1,id);assert.equal(action(b).skill,21020,id);}
    const asleep=jabu();announce(asleep,20486);add(asleep,1,'sleep');assert.notEqual(action(asleep).skill,21020,'Immunity cannot cure existing sleep');
    const protectedByRule=jabu();announce(protectedByRule,20486);protectedByRule.sides[1].rules.push({rule:'immune_status_list',statuses:['sleep']});assert.notEqual(action(protectedByRule).skill,21020);
  });

  const gaia=options=>{const b=fixture(261,{foe:member(FOE,[HIT,WAIT]),...options});b.active(0).hp=80;b.active(1).hp=35;announce(b,HIT);return b;};
  check('The installed Gaia seal turns a priority hit into the surviving knockout',()=>{
    const b=gaia();assert(b.active(1).conditions.some(c=>c.id==='npc_gaia_evil_seal'));
    const chosen=action(b);assert.equal(chosen.skill,10710);legal(b,chosen);
    const events=turn(b,chosen,HIT),hits=events.filter(e=>e.type==='damage'&&e.side===0);
    assert.equal(b.result?.winner,1);assert.equal(b.active(1).hp,35);assert.deepEqual(hits.map(e=>e.kind),['attack','fixed']);assert.equal(hits[0].amount,58);assert.equal(hits[1].amount+hits[1].overkill,30);
    report.witnesses.push({species:261,profile:'gaia-evil-seal',skill:chosen.skill,damage:hits.map(e=>({kind:e.kind,amount:e.amount,overkill:e.overkill})),survivingHp:35});
  });
  check('Without the seal or against fixed-damage immunity, Gaia does not claim the bonus knockout',()=>{
    const plain=gaia({seal:false});assert.notEqual(action(plain).skill,10710);
    const immune=gaia({foeRules:[{rule:'immune_fixed_damage'}]});assert.notEqual(action(immune).skill,10710);
    const forced=gaia({foeRules:[{rule:'immune_fixed_damage'}]});const events=turn(forced,{kind:'move',skill:10710},HIT);
    assert.equal(forced.result?.winner,0);assert(!events.some(e=>e.type==='damage'&&e.side===0&&e.kind==='fixed'&&e.amount>0));
  });
  check('Attack-only reduction leaves the separate fixed 30 intact; explicit fixed reduction is honored',()=>{
    const reduced=gaia();reduced.active(0).hp=58;visibleHook(reduced,'audit-half-attack',[{on:'modify_damage_taken',kinds:['attack'],multiplier:.5}]);
    const chosen=action(reduced);assert.equal(chosen.skill,10710);const events=turn(reduced,chosen,HIT),hits=events.filter(e=>e.type==='damage'&&e.side===0);
    assert.equal(reduced.result?.winner,1);assert.equal(hits[0].amount,29);assert.equal(hits[1].amount+hits[1].overkill,30);
    const noFixed=gaia();visibleHook(noFixed,'audit-zero-fixed',[{on:'modify_damage_taken',kinds:['fixed'],multiplier:0}]);assert.notEqual(action(noFixed).skill,10710);
    const noAttack=gaia();visibleHook(noAttack,'audit-zero-attack',[{on:'modify_damage_taken',kinds:['attack'],multiplier:0}]);assert.notEqual(action(noAttack).skill,10710);
  });
  check('All three decisions are repeatable, legal, read-only, and ignore hidden opponent fields and live callbacks',()=>{
    const cassius=fixture(798);cassius.active(0).stages.atk=4;
    const immune=jabu();announce(immune,20486);
    for(const b of [cassius,immune,gaia()]){
      const before=state(b),first=action(b);assert.deepEqual(action(b),first);legal(b,first);assert.equal(state(b),before);
      for(const key of ['stats','skills','pp','maxPp','usedSkills','skillUses'])Object.defineProperty(b.active(0),key,{configurable:true,get(){throw new Error(`Read hidden opponent ${key}`);}});
      for(const key of ['pending','items'])Object.defineProperty(b.sides[0],key,{configurable:true,get(){throw new Error(`Read hidden opponent ${key}`);}});
      Object.defineProperty(b.sides[0].team,'1',{configurable:true,get(){throw new Error('Read hidden opposing reserve');}});
      const bomb=()=>{throw new Error('Planning invoked a live script');};
      b.scripts={...b.scripts,seer_eff_85:bomb,npc_gaia_evil_seal:{hook:bomb}};
      assert.deepEqual(action(b),first);legal(b,first);
    }
  });
  check('Catalog and production move definitions remain immutable',()=>assert.equal(JSON.stringify(catalog),catalogBefore));
  report.sourceHashes=Object.fromEntries(['battle/core/src/tactics.ts','data/elite-roster.json','src/mechanics/npc-training.ts'].map(path=>[path,crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')]));
} catch(error){report.failures.push({name:'harness',error:String(error.stack)});}
finally {
  fs.mkdirSync('artifacts/elite-tactics-v46',{recursive:true});fs.writeFileSync('artifacts/elite-tactics-v46/regression.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.checks.length,witnesses:report.witnesses,failures:report.failures},null,2));await server.close();if(report.failures.length)process.exitCode=1;
}
