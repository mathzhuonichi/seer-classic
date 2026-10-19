/** Source-preserving Boss loadouts and public-information trainer support decisions. */
import assert from 'node:assert/strict';
import {memoryStorage,sha256File,suite,withSsr} from './_harness.mjs';

memoryStorage();
const report={bossChanges:[],supportWitnesses:[]};
await withSsr('boss-and-support-v46',async load=>{
  const t=suite('boss-and-support-v46'),{check}=t;
  const [{loadCatalog},{normalizeNpcTrainingEncounter:normalize},{createBattle},{buildDataSet},{STRUGGLE_SKILL},{chooseAiAction},{SEER_SCRIPTS}]=await Promise.all([
    '/src/domain/catalog/catalog.ts','/src/domain/challenges/npc-training.ts','/tools/verification/_battle.ts','/battle/core/src/index.ts','/battle/core/src/constants.ts','/battle/ai/src/ai.ts','/battle/core/src/scripts/index.ts',
  ].map(load));
  const catalog=await loadCatalog(),catalogBefore=JSON.stringify(catalog),skills=new Map(catalog.skills.map(s=>[s.id,s]));
  // This is an audit classification, not a rule for rewriting original Bosses.
  const selfKoScripts=new Set(['seer_eff_59','seer_eff_71','seer_eff_72','seer_eff_112','seer_eff_144']);
  const isBossSelfKoSkill=skill=>(skill.effects??[]).some(effect=>effect.op==='script'&&selfKoScripts.has(effect.id)||effect.op==='recoil'&&Number(effect.pct_max_hp)>=100);
  const banned=new Set(catalog.skills.filter(isBossSelfKoSkill).map(s=>s.id));
  function references(value,path='',found=[]){
    if(!value||typeof value!=='object')return found;
    if(Array.isArray(value)){value.forEach((child,index)=>references(child,`${path}[${index}]`,found));return found;}
    for(const [key,child] of Object.entries(value)){
      const candidates=key==='skills'&&Array.isArray(child)?child:key==='weights'&&child&&typeof child==='object'?Object.keys(child).map(Number):key==='skill'&&typeof child==='number'?[child]:[];
      for(const id of candidates)if(banned.has(id))found.push({path:`${path}.${key}`,id});
      references(child,`${path}.${key}`,found);
    }
    return found;
  }
  check('All 180 original boss loadouts, AI choices, variants and phase references are scanned',()=>{
    assert.equal(catalog.bosses.length,180);report.selfKoSkills=[...banned].sort((a,b)=>a-b).map(id=>({id,name:skills.get(id).name.zh}));
    report.originalReferences=catalog.bosses.flatMap(boss=>references(boss,boss.id));
    // Both sacrifices are period-attested: 61F 眼球的掌控 (4399 2010-06-23) and 67F TOH's 能量灌注 (7k7k 2010-06-22).
    const attested=[['f061','team[0]',20330],['f061','ai',20330],['f067','team[1]',20264],['f067','ai',20264]];
    assert.deepEqual(report.originalReferences,attested.map(([floor,at,id])=>({path:`boss_tower_brave_${floor}.${at}.skills`,id})));
    for(const boss of catalog.bosses){
      const next=normalize(catalog,boss);assert.deepEqual(next,boss);assert.deepEqual(references(next),references(boss));assert.deepEqual(normalize(catalog,next),next);
      if(JSON.stringify(next)!==JSON.stringify(boss))report.bossChanges.push(boss.id);
    }
    assert.deepEqual(report.bossChanges,[]);
  });
  check('Tower 61 retains its period-attested sacrifice and matching AI entry',()=>{
    const original=catalog.bosses.find(b=>b.id==='boss_tower_brave_f061'),adapted=normalize(catalog,original);
    assert.deepEqual(adapted,original);assert(adapted.team[0].skills.includes(20330));assert(adapted.ai.skills.includes(20330));
    assert(!adapted.team[0].skills.includes(20328));
    report.towerLoadout={species:270,retained:{id:20330,name:skills.get(20330).name.zh},source:'https://news.4399.com/seer/yzzt/201006-23-71411.html'};
  });
  check('Original Sgalka/Sprint bosses and every Puni seal/life stay unchanged',()=>{
    for(const boss of catalog.bosses.filter(b=>b.id.includes('puni')||b.team.some(m=>[356,755].includes(m.species))))assert.deepEqual(normalize(catalog,boss),boss,boss.id);
    assert(!isBossSelfKoSkill(skills.get(10876)),'25-percent damage recoil is not all-HP sacrifice');
    for(const id of [21168,21324])assert(!isBossSelfKoSkill(skills.get(id)),'Half-current-HP costs remain usable');
    assert(isBossSelfKoSkill(skills.get(11109)),'Miss-only all-HP failure is classified by effect, not name');
  });
  check('Trainer loadouts and original Boss AI/phase move payloads are never rewritten by a blanket ban',()=>{
    const trainer={id:'trainer-support-boundary',category:'trainer',team:[{species:356,level:100,skills:[20398,10876]},{species:599,level:100,skills:[20749,11508]}],ai:{kind:'smart'}};
    assert.deepEqual(normalize(catalog,trainer),trainer);
    const boss={id:'boss-policy-fixture',category:'spt',team:[{species:270,level:100,skills:[20330,10748],ai:{kind:'sequence',skills:[20330,10748]}}],ai:{kind:'weighted',weights:{20330:3,10748:2}},phases:[{when:{first_turn:true},do:[{op:'set_skills',skills:[20330,10748]},{op:'set_ai',ai:{kind:'sequence',skills:[20330,10748]}},{op:'use_skill',skill:20330},{op:'revive',pct_max_hp:100}]}]};
    const adapted=normalize(catalog,boss);assert.deepEqual(adapted,boss);assert.equal(adapted.ai.weights['20330'],3);assert.deepEqual(adapted.team[0].ai.skills,[20330,10748]);assert.deepEqual(adapted.phases[0].do.at(-1),{op:'revive',pct_max_hp:100});
  });

  const WAIT=990460,FOE=990461,WEAK=990462,STRONG=990463;
  const plain={hp:100,atk:100,def:100,spa:100,spd:100,spe:100};
  const fixtureSkills=[
    {id:WAIT,name:{zh:'Support audit wait'},type:'normal',category:'status',target:'self',power:0,accuracy:null,pp:99,effects:[]},
    {id:WEAK,name:{zh:'Support audit weak hit'},type:'normal',category:'physical',power:10,accuracy:null,pp:99,effects:[]},
    {id:STRONG,name:{zh:'Support audit hit'},type:'normal',category:'special',power:150,accuracy:100,pp:99,effects:[]},
  ];
  const data=buildDataSet({...catalog,species:[...catalog.species,{id:FOE,name:{zh:'Support audit neutral target'},types:['normal'],base:{...plain,hp:200,def:300,spd:300,spe:100}}],skills:[...catalog.skills,...fixtureSkills]});
  const donorMoves={356:[20398,10876,10874,10289],755:[20932,11841,20931,11837],599:[20749,11508,20750,20488],359:[20143,10882,20397,10321]};
  const ownStats={hp:400,atk:40,def:200,spa:40,spd:200,spe:300};
  const member=(species,moves,stats=ownStats)=>({species,level:100,iv:31,nature:'hardy',skills:moves,stats:{...stats}});
  function fixture(id=356,{kind='trainer',foeKind='player',team,foeRules=[],scripts=SEER_SCRIPTS}={}){
    const members=team??[member(id,donorMoves[id]),member(468,[11224,20486,20488,11017],{hp:400,atk:100,def:200,spa:300,spd:200,spe:180}),member(865,[STRONG,WEAK],{hp:400,atk:200,def:200,spa:180,spd:200,spe:400}),...Array.from({length:3},()=>member(1,[WAIT]))];
    return createBattle({data,scripts,seed:73,sides:[{kind:foeKind,team:[member(FOE,[WAIT,WEAK],{hp:10000,atk:100,def:300,spa:100,spd:300,spe:100})],rules:foeRules},{kind,team:members,ai:{kind:'smart',style:'balanced',allow_switch:true}}]});
  }
  const action=b=>chooseAiAction(b,b.sides[1]);
  const legal=(b,a)=>assert(b.legalActions(1).some(v=>JSON.stringify(v)===JSON.stringify(a)),JSON.stringify(a));
  const state=b=>JSON.stringify(b,(_key,value)=>value instanceof Map?[...value]:value instanceof Set?[...value]:value);
  const turn=(b,own)=>{b.submit(0,{kind:'move',skill:WAIT});if(own)b.submit(1,own);return b.resolveTurn();};
  const injure=b=>{b.active(1).hp=30;return b;};
  check('Sea Heart is chosen as maximum-HP damage in ordinary trainer battles',()=>{
    const b=fixture(359);turn(b,{kind:'move',skill:20397});const a=action(b);assert.deepEqual(a,{kind:'move',skill:20143});legal(b,a);
    const oldHp=b.active(0).hp;turn(b,a);assert.equal(b.active(0).hp,oldHp-2500);
    const originalBoss=fixture(359,{kind:'boss'});assert.equal(action(originalBoss).skill,20143,'Legacy Boss AI uses its first unused status move; it does not use trainer support scoring.');
    report.supportWitnesses.push({species:359,chosen:a.skill,maximumHpDamage:2500});
  });
  for(const id of [356,755])check(`${id}: an injured six-member trainer lead's sacrifice replaces it and grants exactly two shared critical attacks`,()=>{
    const b=injure(fixture(id)),chosen={kind:'move',skill:donorMoves[id][0]};legal(b,chosen);turn(b,chosen);
    assert(b.sides[1].team[0].fainted);assert.notEqual(b.sides[1].active,0);const recipient=b.active(1);
    const gift=recipient.conditions.find(c=>c.id==='seer_eff_71');assert.equal(gift.data.pool.left,2);
    const hit=recipient.skills.find(s=>data.skills.get(s).category!=='status'&&data.skills.get(s).power>0);
    for(const left of [1,0]){const events=turn(b,{kind:'move',skill:hit});assert(events.some(e=>e.type==='damage'&&e.side===0&&e.crit===true));if(left)assert.equal(recipient.conditions.find(c=>c.id==='seer_eff_71').data.pool.left,left);}
    assert(b.sides[1].team.every(m=>!m.conditions.some(c=>c.id==='seer_eff_71')));
    report.supportWitnesses.push({species:id,sacrifice:chosen.skill,recipient:recipient.species.id,sharedCriticalAttacks:2});
  });
  check('Inheritance chooses a useful control recipient and grants only speed/accuracy +1',()=>{
    const b=injure(fixture(599));b.active(1).stages.atk=6;b.active(1).stages.spa=6;
    const chosen={kind:'move',skill:20749};legal(b,chosen);turn(b,chosen);
    assert.equal(b.active(1).species.id,468,'The useful control beneficiary wins without a species-name rule');
    assert.equal(b.active(1).stages.spe,1);assert.equal(b.active(1).stages.acc,1);assert.equal(b.active(1).stages.atk,0);assert.equal(b.active(1).stages.spa,0);
    assert(b.sides[1].team.every(m=>!m.conditions.some(c=>c.id==='seer_eff_59')));
    report.supportWitnesses.push({species:599,sacrifice:20749,recipient:468,stages:{...b.active(1).stages}});
  });
  for(const id of [356,755,599])check(`${id}: no sacrifice for last member, useless reserves, active gifts, or a boss opponent`,()=>{
    const last=injure(fixture(id,{team:[member(id,donorMoves[id])]}));assert.notEqual(action(last).skill,donorMoves[id][0]);
    const empty=injure(fixture(id,{team:[member(id,donorMoves[id]),member(1,[WAIT])]}));assert.notEqual(action(empty).skill,donorMoves[id][0]);
    for(const gift of ['seer_eff_71','seer_eff_59']){const b=injure(fixture(id));b.sides[1].team[1].conditions.push({id:gift,def:{id:gift,hooks:[]},turns:Infinity,appliedTurn:0,data:{pool:{left:2}}});assert.notEqual(action(b).skill,donorMoves[id][0]);}
    const boss=injure(fixture(id,{foeKind:'boss'}));assert.notEqual(action(boss).skill,donorMoves[id][0]);
  });
  check('A healthy useful donor is not casually sacrificed for a weak beneficiary',()=>{
    const b=fixture(356,{team:[member(356,donorMoves[356],{...ownStats,atk:300}),member(1,[WEAK],{...ownStats,atk:40})]});assert.notEqual(action(b).skill,20398);
  });
  check('Only smart trainers get a legal Struggle fallback when every remaining move is an unusable gift',()=>{
    for(const id of [356,755,599]){
      const b=fixture(id,{team:[member(id,donorMoves[id])]});for(const skill of donorMoves[id].slice(1))b.active(1).pp[skill]=0;
      const chosen=action(b);assert.deepEqual(chosen,{kind:'move',skill:STRUGGLE_SKILL.id});legal(b,chosen);
      const before=b.active(1).hp;turn(b,chosen);assert(!b.active(1).fainted);assert(b.active(1).hp<before);assert.equal(b.active(1).pp[donorMoves[id][0]],data.skills.get(donorMoves[id][0]).pp);
      for(const kind of ['player','boss','wild']){const other=fixture(id,{kind,team:[member(id,donorMoves[id])]});for(const skill of donorMoves[id].slice(1))other.active(1).pp[skill]=0;assert(!other.legalActions(1).some(a=>a.kind==='move'&&a.skill===STRUGGLE_SKILL.id));assert(other.legalActions(1).some(a=>a.kind==='move'&&a.skill===donorMoves[id][0]));}
      const nonSmart=fixture(id,{team:[member(id,donorMoves[id])]});nonSmart.sides[1].ai.kind='random';for(const skill of donorMoves[id].slice(1))nonSmart.active(1).pp[skill]=0;assert(!nonSmart.legalActions(1).some(a=>a.kind==='move'&&a.skill===STRUGGLE_SKILL.id));
    }
  });
  check('Player-controlled sacrifice remains explicitly selectable and functional',()=>{
    const b=fixture(356,{kind:'player'});turn(b,{kind:'move',skill:20398});assert(b.sides[1].team[0].fainted);assert(b.sides[1].team[1].conditions.some(c=>c.id==='seer_eff_71'));
  });
  check('Support decisions and legal-action enumeration are repeatable, preserve state, and ignore hidden opponent fields',()=>{
    for(const id of [359,356,755,599]){
      // The search planner may draw once from the live RNG to mix; each repeat starts from the same RNG state.
      const b=injure(fixture(id)),before=state(b),random=[...b.rng.s],draws=b.rng.draws,rewind=()=>{b.rng.s=[...random];b.rng.draws=draws;};
      const first=action(b);rewind();const again=action(b);rewind();assert.deepEqual(first,again);legal(b,first);assert.equal(state(b),before);
      const foe=b.active(0);foe.stats={...foe.stats,atk:9999,def:1,spa:9999,spd:1,spe:9999};foe.skills=[STRONG];foe.pp={[STRONG]:1};foe.maxPp={[STRONG]:1};foe.usedSkills=new Set([STRONG]);foe.skillUses={[STRONG]:9};
      Object.assign(b.sides[0],{pending:{kind:'move',skill:STRONG},items:{hidden:99}});rewind();assert.deepEqual(action(b),first);legal(b,first);
    }
  });
  const {createGame}=await load('/src/kernel/game.ts');
  check('The actual controller preserves Tower 61 original skills, three-member team and HP',()=>{
    const game=createGame(catalog,'');
    const save=JSON.parse(game.exportSave());
    save.progress.bosses_cleared=Array.from({length:60},(_,index)=>`boss_tower_brave_f${String(index+1).padStart(3,'0')}`);
    save.game.braveTower={highestCleared:60,resumeFloor:61};
    game.importSave(JSON.stringify(save));game.dispatch({type:'startTower',floor:61});
    const state=game.snapshot();assert(state.battle,JSON.stringify(state.notices));assert.equal(state.battle.enemy.species,270);assert.equal(state.battle.enemy.hp,1150);
    assert(state.battle.enemy.skills.some(skill=>skill.id===20330));assert(!state.battle.enemy.skills.some(skill=>skill.id===20328));assert.equal(state.battle.enemyParty.length,3);
    report.controllerWitness={boss:'boss_tower_brave_f061',species:state.battle.enemy.species,hp:state.battle.enemy.hp,skills:state.battle.enemy.skills.map(skill=>skill.id),members:state.battle.enemyParty.length};
  });
  check('Tower 61 sacrifice retains the original next-member order and only the documented defensive transfer',()=>{
    const original=catalog.bosses.find(b=>b.id==='boss_tower_brave_f061');
    const b=createBattle({data,scripts:SEER_SCRIPTS,seed:47,sides:[{kind:'player',team:[member(FOE,[WAIT],{hp:10000,atk:100,def:300,spa:100,spd:300,spe:100})]}],encounter:normalize(catalog,original)});
    turn(b,{kind:'move',skill:20330});
    assert(b.sides[1].team[0].fainted);assert.equal(b.active(1).species.id,271);assert.equal(b.active(1).slot,1);
    assert.deepEqual(b.active(1).stages,{atk:0,def:1,spa:0,spd:1,spe:0,acc:0,eva:0});
    assert(b.sides[1].team.every(mon=>!mon.conditions.some(c=>c.id.startsWith('npc_gaia_')||c.id==='seer_eff_59')));
  });
  check('Catalog and all production move definitions remain immutable',()=>assert.equal(JSON.stringify(catalog),catalogBefore));
  const watched=['src/kernel/game.ts','src/domain/challenges/npc-training.ts','battle/core/src/engine/battle.ts'];
  report.sourceHashes=Object.fromEntries(watched.map(path=>[path,sha256File(path)]));
  t.finish(report);
});
