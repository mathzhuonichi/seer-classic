/** Bounded adversarial battles, full-catalog Lv100 sixes, and decision cost by public-log size. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createServer} from 'vite';

const report={checks:[],failures:[],adversarial:[],catalog:[],performance:[]};
const server=await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error'});
const directory='artifacts/battle-ai-liveness';
fs.mkdirSync(directory,{recursive:true});
const check=(name,run)=>{try{run();report.checks.push(name);}catch(error){report.failures.push({name,error:String(error.stack).slice(0,2500)});console.error(`FAIL ${name}: ${error.message}`);}};
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
const serialize=b=>JSON.stringify(b,(key,value)=>['data','scripts'].includes(key)?undefined:value instanceof Map?[...value]:value instanceof Set?[...value]:value);

try {
  const {createBattle}=await server.ssrLoadModule('/battle/core/src/battle.ts');
  const {buildDataSet}=await server.ssrLoadModule('/battle/core/src/data.ts');
  const {chooseAiAction}=await server.ssrLoadModule('/battle/core/src/ai.ts');
  const {SEER_SCRIPTS}=await server.ssrLoadModule('/battle/core/src/scripts/index.ts');
  const catalog=JSON.parse(fs.readFileSync('data/gamedata.json','utf8')),catalogBefore=JSON.stringify(catalog);
  const data=buildDataSet(catalog),skills=data.skills;
  const eligible=catalog.species.filter(s=>![122,123,124,125].includes(s.id)&&s.learnset?.some(row=>row.level>=1&&row.level<=100&&skills.has(row.skill)));
  const elite=eligible.filter(s=>Object.values(s.base).reduce((sum,n)=>sum+n,0)>=600);
  const ai={kind:'smart',allow_switch:true};
  function rng(seed){let state=seed>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
  function shuffled(rows,seed){const result=[...rows],random=rng(seed);for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
  function build(species,seed){
    const legal=[...new Set(species.learnset.filter(row=>row.level>=1&&row.level<=100&&skills.has(row.skill)).map(row=>row.skill))];
    const damage=id=>{const skill=skills.get(id);return skill.category!=='status'&&(skill.power>0||skill.effects?.some(e=>['fixed_damage','pct_damage','ohko','script'].includes(e.op)));};
    const preferred=legal.filter(damage).sort((a,b)=>(skills.get(b).power??0)-(skills.get(a).power??0));
    // At least one attacking option, then shuffled legal moves, exposes support
    // interactions without constructing deliberately unusable random teams.
    const selected=[preferred[0]??legal[0],...shuffled(legal,seed)].filter((id,i,rows)=>rows.indexOf(id)===i).slice(0,4);
    return {species:species.id,level:100,iv:31,evs:{hp:255,[species.base.atk>=species.base.spa?'atk':'spa']:255},nature:'hardy',skills:selected};
  }
  function finite(battle){
    for(const side of battle.sides)for(const mon of side.team){assert(Number.isFinite(mon.hp)&&mon.hp>=0&&mon.hp<=mon.maxHp,`Invalid HP on ${mon.species.id}: ${mon.hp}`);for(const [id,pp]of Object.entries(mon.pp))assert(Number.isFinite(pp)&&pp>=0&&pp<=mon.maxPp[id],`Invalid PP on ${mon.species.id}/${id}: ${pp}`);}
  }
  function run(name,battle){
    const started=performance.now(),durations=[],lastSwitch=new Map(),seenStates=new Map();
    let repeatedStates=0,maxNoHealthProgress=0,noHealthProgress=0,previousHealth='',maxSwitchStreak=0,switchStreak=0;
    let actionsThisTurn=[];const originalDoAction=battle.doAction;
    battle.doAction=function(side,action,...args){actionsThisTurn.push({side,kind:action.kind});return originalDoAction.call(this,side,action,...args);};
    while(!battle.result&&battle.turn<205){
      actionsThisTurn=[];
      const priorTurn=battle.turn,start=performance.now();const events=battle.resolveTurn();durations.push(performance.now()-start);
      assert(battle.turn===priorTurn+1,`${name}: automatic battle did not advance one turn`);finite(battle);
      const health=JSON.stringify(battle.sides.map(side=>side.team.map(mon=>[mon.hp,mon.fainted])));
      noHealthProgress=health===previousHealth?noHealthProgress+1:0;maxNoHealthProgress=Math.max(maxNoHealthProgress,noHealthProgress);previousHealth=health;
      const state=JSON.stringify(battle.sides.map(side=>({active:side.active,team:side.team.map(mon=>({hp:mon.hp,pp:mon.pp,stages:mon.stages,conditions:mon.conditions.map(c=>[c.id,c.turns,c.charges])}))})));
      if(seenStates.has(state))repeatedStates++;else seenStates.set(state,battle.turn);
      const switches=events.filter(e=>e.type==='switch_out'&&actionsThisTurn.some(a=>a.side===e.side&&a.kind==='switch'));switchStreak=switches.length?switchStreak+1:0;maxSwitchStreak=Math.max(maxSwitchStreak,switchStreak);
      for(const event of switches){const previous=lastSwitch.get(event.side);if(previous!==undefined)assert(battle.turn-previous>=3,`${name}: voluntary switches violated two-action cooldown`);lastSwitch.set(event.side,battle.turn);}
    }
    delete battle.doAction;
    assert(battle.result,`${name}: battle failed to terminate`);assert(battle.turn<=battle.maxTurns,`${name}: exceeded hard turn limit`);
    if(battle.result.reason==='turn_cap'){assert.equal(battle.result.winner,null);assert.equal(battle.result.success,false);assert.equal(battle.turn,battle.maxTurns);}
    const result={name,turns:battle.turn,winner:battle.result.winner,reason:battle.result.reason,elapsedMs:+(performance.now()-started).toFixed(3),maxResolveMs:+Math.max(...durations).toFixed(3),p95ResolveMs:+percentile(durations,.95).toFixed(3),events:battle.log.length,maxNoHealthProgress,repeatedStates,maxSwitchStreak,moves:battle.log.filter(e=>e.type==='move_used').length,heals:battle.log.filter(e=>e.type==='heal').length,switches:battle.log.filter(e=>e.type==='switch_out').length};
    return result;
  }
  const battleFor=(left,right,seed=1,extra={})=>createBattle({data,scripts:SEER_SCRIPTS,seed,sides:[{kind:'trainer',team:structuredClone(left),ai},{kind:'trainer',team:structuredClone(right),ai}],...extra});

  check('Real Puni Eternal restores every equipped PP to finite maximum',()=>{
    const source=eligible.find(s=>s.id===300),member=build(source,1);member.skills=[20608,source.learnset.find(row=>row.level>=1&&row.level<=100&&skills.get(row.skill)?.power>0).skill];
    const battle=createBattle({data,scripts:SEER_SCRIPTS,seed:1,sides:[{kind:'player',team:[member]},{kind:'trainer',team:[{species:10,level:100,skills:[20006]}],ai:{kind:'sequence',skills:[20006]}}]});
    for(const id of member.skills)battle.active(0).pp[id]=1;battle.submit(0,{kind:'move',skill:20608});battle.resolveTurn();finite(battle);
    for(const id of member.skills)assert.equal(battle.active(0).pp[id],battle.active(0).maxPp[id]);
  });

  check('An actual recovery-only Puni mirror is bounded by the hard turn limit',()=>{
    const member={species:300,level:100,iv:31,skills:[20608]};const battle=battleFor([member],[member]);const result=run('Eternal-only mirror',battle);assert.equal(result.reason,'turn_cap');assert.equal(result.turns,200);report.adversarial.push(result);
    const before=serialize(battle);assert.deepEqual(battle.resolveTurn(),[]);assert.equal(serialize(battle),before,'An ended battle cannot accumulate more events or damage');
  });

  const base={hp:100,atk:100,def:100,spa:100,spd:100,spe:100};
  const attack=(id,power=5,extra={})=>({id,name:{zh:`Liveness ${id}`},type:'normal',category:'physical',power,accuracy:null,pp:20,priority:0,effects:[],...extra});
  const synthetic=buildDataSet({species:[{id:1,name:{zh:'Liveness fixture'},types:['normal'],base}],types:{chart:{normal:{normal:1}}},skills:[attack(1),attack(2,0,{category:'status',target:'self',effects:[{op:'heal',target:'self',pct_max_hp:50}]}),attack(3,0,{category:'status',target:'self',effects:[{op:'protect'}]}),attack(4,0,{category:'status',target:'self',effects:[{op:'restore_pp',amount:20}]}),attack(5,0,{category:'status',target:'self',effects:[{op:'restore_pp',amount:5}]})]});
  check('Ordinary numeric PP restoration retains its amount and caps at the maximum',()=>{
    const member={species:1,level:100,skills:[1,5]},battle=createBattle({data:synthetic,seed:1,sides:[{kind:'player',team:[member]},{kind:'trainer',team:[{...member,skills:[3]}],ai:{kind:'sequence',skills:[3]}}]});
    battle.active(0).pp[1]=18;battle.active(0).pp[5]=2;battle.submit(0,{kind:'move',skill:5});battle.resolveTurn();finite(battle);assert.equal(battle.active(0).pp[1],20);assert.equal(battle.active(0).pp[5],6,'PP cost occurs before adding exactly five');
  });
  for(const [name,moveIds]of [['Finite healing and protection',[1,2,3]],['Renewable healing and PP',[1,2,4]]])check(`${name} remains bounded and makes legal finite transitions`,()=>{
    const member={species:1,level:100,skills:moveIds,stats:{hp:500,atk:50,def:300,spa:50,spd:300,spe:100}};const battle=createBattle({data:synthetic,seed:3,sides:[{kind:'trainer',team:[member],ai},{kind:'trainer',team:[member],ai}]});report.adversarial.push(run(name,battle));
  });

  check('Every eligible species can actively make a legal, repeatable, read-only Lv100 decision',()=>{
    const opponent=build(eligible.find(row=>row.id===6),137001);let actors=0;
    for(const species of eligible){const member=build(species,137001+species.id),battle=battleFor([opponent],[member],137001+species.id),before=serialize(battle),action=chooseAiAction(battle,battle.sides[1]);assert(battle.legalActions(1).some(legal=>JSON.stringify(legal)===JSON.stringify(action)),`${species.id}: illegal decision`);assert.deepEqual(chooseAiAction(battle,battle.sides[1]),action);assert.equal(serialize(battle),before);finite(battle);actors++;}
    report.activeActors=actors;assert.equal(actors,eligible.length);
  });

  check('All eligible catalog species participate in bounded legal Lv100 six-versus-six battles',()=>{
    const ordered=shuffled(eligible,37001),covered=new Set();
    for(let start=0;start<ordered.length;start+=12){
      const rows=Array.from({length:12},(_,offset)=>ordered[(start+offset)%ordered.length]);rows.forEach(row=>covered.add(row.id));
      const left=rows.slice(0,6).map((row,i)=>build(row,37001+start+i)),right=rows.slice(6).map((row,i)=>build(row,47001+start+i));
      try{report.catalog.push({...run(`Catalog sixes ${start/12+1}`,battleFor(left,right,57001+start)),left:left.map(m=>m.species),right:right.map(m=>m.species)});}catch(error){report.failures.push({name:`Catalog sixes ${start/12+1}`,left,right,error:String(error.stack).slice(0,2500)});}
    }
    assert.equal(covered.size,eligible.length);report.coverage={eligibleSpecies:eligible.length,rosteredSpecies:covered.size,activeDecisionSpecies:report.activeActors,eliteSpecies:elite.length,catalogBattles:report.catalog.length};
  });

  check('Every BST >= 600 catalog species participates in a bounded legal elite sixes battle',()=>{
    const ordered=shuffled(elite,37002),covered=new Set();
    for(let start=0;start<ordered.length;start+=12){const rows=Array.from({length:12},(_,offset)=>ordered[(start+offset)%ordered.length]);rows.forEach(row=>covered.add(row.id));const teams=[rows.slice(0,6),rows.slice(6)].map((members,side)=>members.map((row,i)=>build(row,67001+start+side*6+i)));try{report.catalog.push({...run(`Elite sixes ${start/12+1}`,battleFor(...teams,77001+start)),left:teams[0].map(m=>m.species),right:teams[1].map(m=>m.species)});}catch(error){report.failures.push({name:`Elite sixes ${start/12+1}`,teams,error:String(error.stack).slice(0,2500)});}}
    assert.equal(covered.size,elite.length);report.coverage.eliteCovered=covered.size;
  });

  check('Authored recovery, control, and offense teams finish bounded Lv100 mirror and cross matches',()=>{
    const trainers=fs.readdirSync('data/trainers').filter(name=>name.endsWith('.json')).sort().map(name=>JSON.parse(fs.readFileSync(`data/trainers/${name}`,'utf8')));
    for(let i=0;i<trainers.length;i++)for(let j=i;j<trainers.length;j++){const left=trainers[i].team.map(mon=>({...mon,level:100})),right=trainers[j].team.map(mon=>({...mon,level:100}));report.adversarial.push(run(`${trainers[i].id} versus ${trainers[j].id}`,battleFor(left,right,87001+i*10+j)));}
  });

  check('Planning is read-only and decision latency is measured against public history size',()=>{
    const members=shuffled(elite,37003).slice(0,6).map((row,i)=>build(row,97001+i));
    for(const events of [0,1000,5000,20000]){
      const battle=battleFor(members,members,97001);battle.turn=100;battle.active(1).turnsActive=2;
      const announcements=members[0].skills.filter(id=>skills.get(id).category!=='status');
      for(let i=0;i<events;i++)battle.log.push(i%3===0?{type:'turn_start',turn:Math.floor(i/3)+1}:{type:'move_used',side:i%2,skill:announcements[i%announcements.length],name:'Public history benchmark'});
      const before=serialize(battle);for(let warmup=0;warmup<3;warmup++)chooseAiAction(battle,battle.sides[1]);
      let iterated=0;const originalIterator=battle.log[Symbol.iterator];battle.log[Symbol.iterator]=function*(){for(const value of originalIterator.call(this)){iterated++;yield value;}};const action=chooseAiAction(battle,battle.sides[1]);delete battle.log[Symbol.iterator];
      assert.equal(iterated,events,'Public battle history is projected once per decision, including reserve evaluation');
      const durations=[];for(let repeat=0;repeat<15;repeat++){const start=performance.now();assert.deepEqual(chooseAiAction(battle,battle.sides[1]),action);durations.push(performance.now()-start);}
      assert.equal(serialize(battle),before);report.performance.push({events,action,historyEntriesVisited:iterated,equivalentFullScans:events?iterated/events:0,medianDecisionMs:+median(durations).toFixed(3),p95DecisionMs:+percentile(durations,.95).toFixed(3),maxDecisionMs:+Math.max(...durations).toFixed(3)});
    }
  });

  const all=[...report.catalog,...report.adversarial];report.summary={battles:all.length,turnCaps:all.filter(row=>row.reason==='turn_cap').map(row=>({name:row.name,turns:row.turns,maxNoHealthProgress:row.maxNoHealthProgress,repeatedStates:row.repeatedStates})),maxTurns:Math.max(...all.map(row=>row.turns)),maxResolveMs:Math.max(...all.map(row=>row.maxResolveMs)),maxLogEvents:Math.max(...all.map(row=>row.events)),maxNoHealthProgress:Math.max(...all.map(row=>row.maxNoHealthProgress)),maxSwitches:Math.max(...all.map(row=>row.switches))};
  assert.equal(JSON.stringify(catalog),catalogBefore,'The entire shared catalog must remain unchanged');
  report.passed=report.failures.length===0;
  console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,coverage:report.coverage,summary:report.summary,performance:report.performance,failures:report.failures},null,2));
  if(!report.passed)process.exitCode=1;
}catch(error){report.passed=false;report.failures.push({name:'Verification harness',error:String(error.stack)});console.error(error);process.exitCode=1;}
finally{await server.close();fs.writeFileSync(`${directory}/report.json`,JSON.stringify(report,null,2)+'\n');}
