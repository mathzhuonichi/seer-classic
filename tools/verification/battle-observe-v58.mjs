/** V58 observation: engine journal neutrality, fixed-roll damage probe, public opponent model (design/notes/trainer-search-ai-v58.md 2, 9.2-9.5, 12.2). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// The engine before the journal existed. Loaded from Git so neutrality is checked against real history.
const BASE_REVISION='1d7d3ce';
let baseSource=null,baseRevision=null;
try{
  baseRevision=execFileSync('git',['rev-parse',BASE_REVISION],{cwd:root,encoding:'utf8'}).trim();
  baseSource=execFileSync('git',['show',`${baseRevision}:battle/core/src/battle.ts`],{cwd:root,encoding:'utf8'});
  if(baseSource.includes('journal'))throw new Error('base revision already has the journal');
}catch(error){baseSource=null;console.error(`Base engine unavailable (${error.message}); neutrality falls back to RNG draw counts.`);}
const baseId='/__verification_base_battle_v58.ts';
const report={baseEngine:baseSource?{revision:baseRevision,sha256:crypto.createHash('sha256').update(baseSource).digest('hex')}:null,checks:[],failures:[],witnesses:{}};
const check=(name,run)=>{try{run();report.checks.push(name);}catch(error){report.failures.push({name,error:String(error.stack).slice(0,4000)});console.error(`FAIL ${name}: ${error.message.split('\n')[0]}`);}};
const server=await createServer({root,configFile:false,cacheDir:path.join(root,'artifacts/.validation-cache/battle-observe-v58'),
  plugins:[{name:'git-base-battle',resolveId:id=>id===baseId?id:undefined,load:id=>id===baseId&&baseSource?baseSource.replaceAll("from './","from '/battle/core/src/"):undefined}],
  server:{middlewareMode:true,watch:null,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',logLevel:'error'});

try{
  const ids=['/battle/core/src/index.ts','/battle/core/src/scripts/index.ts','/src/mechanics/catalog.ts','/src/mechanics/traits.ts','/src/mechanics/campaign-rules.ts','/src/mechanics/npc-training.ts','/src/progression/battle-facilities.ts',...(baseSource?[baseId]:[])];
  const [core,{SEER_SCRIPTS},{loadCatalog},{traitScripts},{campaignScripts},{npcTrainingScripts},{createFacilityEncounter},base]=await Promise.all(ids.map(id=>server.ssrLoadModule(id)));
  const {createBattle,buildDataSet,computeStats,observeOpponent,revealedOpponentSlots,Rng,stageMultiplier}=core;
  const catalog=await loadCatalog(),realData=buildDataSet(catalog);
  const realScripts={...SEER_SCRIPTS,...traitScripts,...campaignScripts,...npcTrainingScripts};
  const serial=value=>JSON.stringify(value,(_key,v)=>v instanceof Map?[...v]:v instanceof Set?[...v]:v===Infinity?'Infinity':v);
  const move=skill=>({kind:'move',skill});

  // ---------- real-data corpus ----------
  const facilityOptions=(seed,facility='random',BattleClass)=>{
    const foe=createFacilityEncounter(catalog,facility,new Rng(seed)),own=createFacilityEncounter(catalog,facility,new Rng(seed+7919));
    const opts={data:realData,scripts:realScripts,seed,sides:[{kind:'trainer',name:'mirror',team:structuredClone(own.team),rules:structuredClone(own.rules??[]),ai:{kind:'smart',allow_switch:true}}],encounter:structuredClone(foe)};
    return BattleClass?new BattleClass(opts):createBattle(opts);
  };
  const runToEnd=(b,onTurn)=>{const turns=[];while(!b.result&&turns.length<220){const events=b.resolveTurn();turns.push(events);onTurn?.(b,events);}return turns;};
  const corpus=[...Array.from({length:24},(_,i)=>['random',5801+i]),...Array.from({length:8},(_,i)=>['elite',5901+i])];

  check('The journal is behaviour-neutral against the pre-journal engine loaded from Git',()=>{
    let turns=0,hits=0,orders=0;
    for(const [facility,seed] of corpus){
      const now=facilityOptions(seed,facility);
      if(base){
        const then=facilityOptions(seed,facility,base.Battle);
        assert.equal(serial(now.initialEvents),serial(then.initialEvents),`${facility}/${seed}: initial events`);
        while(!now.result&&!then.result&&now.turn<220){
          const a=now.resolveTurn(),b=then.resolveTurn();turns++;
          assert.equal(serial(a),serial(b),`${facility}/${seed} turn ${now.turn}: events`);
          assert.equal(serial(now.state),serial(then.state),`${facility}/${seed} turn ${now.turn}: state`);
          assert.equal(now.rng.draws,then.rng.draws,`${facility}/${seed} turn ${now.turn}: RNG draws`);
        }
        assert.equal(serial(now.result),serial(then.result),`${facility}/${seed}: result`);
        assert.equal(serial(now.warnings),serial(then.warnings),`${facility}/${seed}: warnings`);
      }else{
        // Fallback: two runs must agree, and the journal must be the only extra state.
        const other=facilityOptions(seed,facility);runToEnd(now);runToEnd(other);turns+=now.turn;
        assert.equal(serial(now.log),serial(other.log));assert.equal(now.rng.draws,other.rng.draws);
      }
      assert(now.journal.every(entry=>JSON.parse(JSON.stringify(entry))&&serial(entry)===JSON.stringify(entry)),'journal entries are plain JSON data');
      hits+=now.journal.filter(e=>e.type==='hit').length;orders+=now.journal.filter(e=>e.type==='order').length;
    }
    report.witnesses.neutrality={battles:corpus.length,turns,hits,orders,comparedAgainst:base?`git ${baseRevision}`:'repeat runs'};
    assert(hits>500&&orders>100,'the corpus exercises the journal');
  });

  // Probe every real attack hit at its realized roll and crit, in the state just before the hit.
  function instrument(b,{fullStateEvery=1}={}){
    const stats={hits:0,nonOpaque:0,matched:0,opaque:0,opaqueDiffer:0,reasons:{},probes:0,mismatches:[]};
    let lastRoll=null,pending=null,count=0;
    const int=b.rng.int.bind(b.rng);b.rng.int=(min,max)=>{const v=int(min,max);if(min===217&&max===255)lastRoll=v;return v;};
    const deal=b.dealDamage.bind(b);
    b.dealDamage=(target,raw,info)=>{
      if(info.kind==='attack'&&info.source){
        const full=++count%fullStateEvery===0;
        const before=full?serial({state:b.state,sides:b.sides,warnings:b.warnings,journal:b.journal,result:b.result}):null;
        const rng=[...b.rng.s],draws=b.rng.draws,out=b.out.length,log=b.log.length;
        const value=b.probeDamage(info.source,target,info.skill,{roll:lastRoll,crit:!!info.crit});stats.probes++;
        assert.deepEqual(b.rng.s,rng,'probe drew no RNG');assert.equal(b.rng.draws,draws);assert.equal(b.out.length,out,'probe emitted no event');assert.equal(b.log.length,log);
        if(full)assert.equal(serial({state:b.state,sides:b.sides,warnings:b.warnings,journal:b.journal,result:b.result}),before,'probe mutated nothing');
        pending={value,target,skill:info.skill.id};
      }
      return deal(target,raw,info);
    };
    const push=b.journal.push;
    b.journal.push=function(entry){
      if(entry.type==='hit'){
        stats.hits++;
        assert(pending&&pending.skill===entry.skill&&pending.target.side===entry.defender.side&&pending.target.slot===entry.defender.slot,'every journaled hit was probed');
        if(entry.opaque){stats.opaque++;for(const r of entry.opaqueReasons)stats.reasons[r]=(stats.reasons[r]??0)+1;if(pending.value!==entry.damage)stats.opaqueDiffer++;}
        else{stats.nonOpaque++;if(pending.value===entry.damage)stats.matched++;else if(stats.mismatches.length<5)stats.mismatches.push({turn:entry.turn,skill:entry.skill,probe:pending.value,real:entry.damage});}
        pending=null;
      }
      return push.call(this,entry);
    };
    return stats;
  }
  const sum=(rows,key)=>rows.reduce((n,r)=>n+r[key],0);

  check('Real non-opaque hits equal the probe at the realized roll and crit, without RNG, events or mutation',()=>{
    const rows=[],reasons={};
    for(const [facility,seed] of corpus){
      const b=facilityOptions(seed,facility),stats=instrument(b,{fullStateEvery:5});runToEnd(b);rows.push(stats);
      for(const [k,v] of Object.entries(stats.reasons))reasons[k]=(reasons[k]??0)+v;
      assert.deepEqual(stats.mismatches,[],`${facility}/${seed}: non-opaque mismatches`);
      assert.equal(stats.matched,stats.nonOpaque);
    }
    report.witnesses.probe={hits:sum(rows,'hits'),nonOpaqueMatched:sum(rows,'matched'),opaque:sum(rows,'opaque'),opaqueWhereProbeDiffers:sum(rows,'opaqueDiffer'),probes:sum(rows,'probes'),reasons};
    assert(sum(rows,'matched')>500,'enough non-opaque real hits');
  });

  check('The probe rejects rolls outside 217..255 and returns 0 for status skills',()=>{
    const b=facilityOptions(5801);const user=b.active(1),target=b.active(0),attack=user.skills.map(id=>b.skill(id,user)).find(s=>s.category!=='status');
    for(const roll of [216,256,230.5])assert.throws(()=>b.probeDamage(user,target,attack,{roll,crit:false}));
    assert(b.probeDamage(user,target,attack,{roll:255,crit:true})>=b.probeDamage(user,target,attack,{roll:217,crit:false}));
    assert.equal(b.probeDamage(user,target,{...attack,category:'status'},{roll:255,crit:false}),0);
  });

  check('Real-data smoke: observeOpponent for both viewers and every revealed slot after every turn',()=>{
    let calls=0,intervals=0,conflicts=0,contained=0,checked=0,battles=0;
    for(const [facility,seed] of [...corpus,...Array.from({length:16},(_,i)=>['random',6101+i])]){
      const b=facilityOptions(seed,facility);battles++;
      runToEnd(b,battle=>{for(const viewer of [0,1])for(const slot of revealedOpponentSlots(battle,viewer)){
        const m=observeOpponent(battle,viewer,slot);calls++;
        assert.equal(m.slot,slot);assert.equal(m.side,1-viewer);assert(Number.isFinite(m.hp)&&m.hp>=0&&m.hp<=m.maxHp+1e-9,'finite HP');
        for(const [key,[lo,hi]] of Object.entries(m.intervals)){
          intervals++;assert(lo<=hi,`${key} interval ordered`);assert(m.stats[key]>=lo&&m.stats[key]<=hi,`${key} estimate inside its interval`);
          // Informational only: real stats can carry hidden effects the model absorbs.
          const real=battle.sides[1-viewer].team[slot].stats[key];checked++;if(real>=lo&&real<=hi)contained++;
        }
        conflicts+=m.conflicts.length;
      }});
    }
    report.witnesses.smoke={battles,calls,intervals,conflicts,rawStatInsideInterval:`${contained}/${checked}`};
    assert(calls>1000&&intervals>500);
  });

  // ---------- synthetic fixtures ----------
  const S={phys:58001,spec:58002,wait:58003,boost:58004,scriptPower:58005,chancePower:58006,quick:58007,special2:58008,drop:58009};
  const base100={hp:100,atk:100,def:100,spa:100,spd:100,spe:100};
  const attack=(id,power,extra={})=>({id,name:{zh:`Observe ${id}`},type:'normal',category:'physical',power,accuracy:null,pp:30,priority:0,effects:[],...extra});
  const raw={species:[{id:1,name:{zh:'Observed'},types:['normal'],base:base100},{id:2,name:{zh:'Viewer'},types:['normal'],base:base100},{id:3,name:{zh:'Reserve A'},types:['normal'],base:base100},{id:4,name:{zh:'Reserve B'},types:['normal'],base:{...base100,spe:150}}],
    types:{chart:{normal:{normal:1}}},
    skills:[attack(S.phys,60),attack(S.spec,60,{category:'special'}),attack(S.wait,0,{category:'status',target:'self'}),
      attack(S.boost,0,{category:'status',target:'self',effects:[{op:'stat_stage',stats:{atk:2,spe:1},target:'self'}]}),
      attack(S.scriptPower,60,{effects:[{op:'script',id:'obs-power'}]}),attack(S.chancePower,60,{effects:[{op:'power_if',power:200,chance:50}]}),
      attack(S.quick,40,{priority:1}),attack(S.special2,70,{category:'special'}),
      attack(S.drop,0,{category:'status',effects:[{op:'stat_stage',stats:{def:-1,spd:-1},target:'foe'}]})],
    conditions:[{id:'obs-hidden-trait',kind:'buff',removed_on_switch:false,hooks:[{on:'block_stage_down'}]},
      {id:'obs-guard',kind:'buff',hooks:[{on:'modify_damage_taken',multiplier:0.5,when:{category:'physical'}}]}],
    items:[{id:'obs-potion',battle_effects:[{op:'heal',amount:50}]}]};
  const scripts={'obs-power':{power:()=>300}};
  const publicBaseline=computeStats(base100,50,31,{hp:85,atk:85,def:85,spa:85,spd:85,spe:85});
  report.witnesses.baseline=publicBaseline;
  const viewerStats={hp:3000,atk:200,def:200,spa:200,spd:200,spe:publicBaseline.spe+40};
  function fixture({seed=58,foe={},foeTeam,viewer={},foeItems={},viewerRules=[],foeRules=[]}={}){
    const foeMon={species:1,level:50,skills:[S.phys,S.spec,S.wait,S.boost],stats:{...publicBaseline,hp:4000},...foe};
    return createBattle({data:buildDataSet(structuredClone(raw)),scripts,seed,sides:[
      {kind:'player',team:foeTeam?foeTeam(foeMon):[foeMon],items:foeItems,rules:foeRules},
      {kind:'trainer',team:[{species:2,level:50,skills:[S.phys,S.spec,S.wait,S.quick,].slice(0,4),stats:{...viewerStats},...viewer}],ai:{kind:'smart'},rules:viewerRules},
    ]});
  }
  const turn=(b,a0,a1)=>{b.submit(0,a0);b.submit(1,a1);return b.resolveTurn();};
  const model=b=>observeOpponent(b,1,b.sides[0].active);
  const contains=(interval,value)=>interval&&interval[0]<=value&&value<=interval[1];

  check('HP knowledge: bar ratio x baseline before the first visible damage, exact afterwards and after switching',()=>{
    const team=m=>[{...m,stats:{...m.stats,hp:60000},hp:45000},{species:3,level:50,skills:[S.wait],stats:{...publicBaseline}}];
    const b=fixture({foeTeam:team});
    let m=model(b);
    assert.equal(m.hpKnown,false);assert.equal(m.maxHp,publicBaseline.hp);assert.equal(m.hp,0.75*publicBaseline.hp);assert.equal(m.stats.hp,publicBaseline.hp);
    // A battle differing only in absolute HP at the same ratio yields the same model before any damage.
    const twin=fixture({foeTeam:mon=>team(mon).map((row,i)=>i?row:{...row,stats:{...row.stats,hp:8000},hp:6000})});
    assert.equal(serial(model(twin)),serial(m));
    turn(b,move(S.wait),move(S.wait));m=model(b);assert.equal(m.hpKnown,false,'no damage yet');
    turn(b,move(S.wait),move(S.phys));m=model(b);const mon=b.active(0);
    assert.equal(m.hpKnown,true);assert.equal(m.hp,mon.hp);assert.equal(m.maxHp,60000);assert(mon.hp<45000);
    turn(b,{kind:'switch',slot:1},move(S.wait));
    assert.equal(observeOpponent(b,1,1).hpKnown,false,'knowledge is per individual');
    turn(b,{kind:'switch',slot:0},move(S.wait));m=observeOpponent(b,1,0);
    assert.equal(m.hpKnown,true,'knowledge persists across switching');assert.equal(m.hp,b.active(0).hp);
    report.witnesses.hp={before:0.75*publicBaseline.hp,trueMax:60000,after:m.hp};
  });

  function refine(label,{foe,viewer,turns,key,direction,seed=58}){
    const b=fixture({foe,viewer,seed});
    for(const [a0,a1] of turns)turn(b,a0,a1);
    const m=model(b),truth=b.active(0).stats[key],interval=m.intervals[key];
    assert(contains(interval,truth),`${label}: ${key} interval ${serial(interval)} contains true ${truth}`);
    if(direction>0)assert(m.stats[key]>publicBaseline[key],`${label}: estimate ${m.stats[key]} rises from ${publicBaseline[key]}`);
    else assert(m.stats[key]<publicBaseline[key],`${label}: estimate ${m.stats[key]} falls from ${publicBaseline[key]}`);
    assert.deepEqual(m.conflicts,[],`${label}: no conflicts`);
    report.witnesses[label]={key,truth,baseline:publicBaseline[key],estimate:m.stats[key],interval};
    return m;
  }
  const repeat=(n,pair)=>Array.from({length:n},()=>pair);

  check('Refinement: maximum speed is bounded from below and the estimate rises',()=>{
    refine('fast',{foe:{stats:{...publicBaseline,hp:4000,spe:999}},turns:repeat(4,[move(S.phys),move(S.phys)]),key:'spe',direction:1});
  });
  check('Refinement: very low speed is bounded from above and the estimate falls',()=>{
    refine('slow',{foe:{stats:{...publicBaseline,hp:4000,spe:5}},viewer:{stats:{...viewerStats,spe:20}},turns:repeat(3,[move(S.phys),move(S.phys)]),key:'spe',direction:-1});
  });
  check('Refinement: huge attack, including hits made at a visible +2 stage, converges on the stage-0 stat',()=>{
    const m=refine('heavy-attacker',{foe:{stats:{...publicBaseline,hp:4000,atk:2000}},turns:[[move(S.boost),move(S.wait)],...repeat(5,[move(S.phys),move(S.wait)])],key:'atk',direction:1});
    assert(m.intervals.atk[1]-m.intervals.atk[0]<0.2*2000,'the interval is narrow');
  });
  check('Refinement: huge defense converges, including hits after a visible defense drop',()=>{
    const m=refine('wall',{foe:{stats:{...publicBaseline,hp:4000,def:2000}},viewer:{skills:[S.phys,S.drop,S.wait,S.quick]},
      turns:[...repeat(2,[move(S.wait),move(S.phys)]),[move(S.wait),move(S.drop)],[move(S.wait),move(S.drop)],...repeat(2,[move(S.wait),move(S.phys)])],key:'def',direction:1});
    assert.equal(m.stages.def,-2,'hits were taken at a visible -2 defense stage');
  });
  check('Refinement: very low attack, special attack, defense and special defense all fall',()=>{
    const low={...publicBaseline,hp:60000,atk:12,spa:12,def:12,spd:12};
    refine('weak-attack',{foe:{stats:low},turns:repeat(4,[move(S.phys),move(S.wait)]),key:'atk',direction:-1});
    refine('weak-special',{foe:{stats:low},turns:repeat(4,[move(S.spec),move(S.wait)]),key:'spa',direction:-1});
    refine('frail',{foe:{stats:low},turns:repeat(3,[move(S.wait),move(S.phys)]),key:'def',direction:-1});
    refine('frail-special',{foe:{stats:low},turns:repeat(3,[move(S.wait),move(S.spec)]),key:'spd',direction:-1});
  });

  check('Opaque hits are journaled as such and skipped by the model',()=>{
    const cases=[
      ['script power',{foe:{skills:[S.scriptPower,S.wait]}},[move(S.scriptPower),move(S.wait)],'script_power'],
      ['random power_if',{foe:{skills:[S.chancePower,S.wait]}},[move(S.chancePower),move(S.wait)],'power_chance'],
      ['damage cap',{viewerRules:[{rule:'damage_cap_per_hit',amount:5}]},[move(S.phys),move(S.wait)],'damage_cap'],
    ];
    const rows=[];
    for(const [label,opts,actions,reason] of cases){
      const b=fixture({...opts,foe:{stats:{...publicBaseline,hp:4000,atk:1500},...opts.foe}});
      for(let i=0;i<3;i++)turn(b,...actions);
      const hits=b.journal.filter(e=>e.type==='hit'&&e.attacker.side===0);
      assert(hits.length===3&&hits.every(e=>e.opaque&&e.opaqueReasons.includes(reason)),`${label}: journaled opaque (${serial(hits.map(e=>e.opaqueReasons))})`);
      const m=model(b);assert.equal(m.intervals.atk,undefined,`${label}: no attack evidence`);assert.equal(m.stats.atk,publicBaseline.atk);
      rows.push({label,reason});
    }
    // A conditional damage hook on the viewer's own monster, unannounced, also makes the hit opaque.
    const guarded=fixture({foe:{stats:{...publicBaseline,hp:4000,atk:1500}}});
    guarded.active(1).conditions.push({id:'obs-guard',def:guarded.data.conditions.get('obs-guard'),turns:Infinity,appliedTurn:0});
    for(let i=0;i<2;i++)turn(guarded,move(S.phys),move(S.wait));
    assert(guarded.journal.filter(e=>e.type==='hit').every(e=>e.opaque&&e.opaqueReasons.includes('defender_modify_damage_taken_when')));
    assert.equal(model(guarded).intervals.atk,undefined);
    // Control: the same hits without any opaque mechanism do refine attack.
    const plain=fixture({foe:{stats:{...publicBaseline,hp:4000,atk:1500}}});for(let i=0;i<3;i++)turn(plain,move(S.phys),move(S.wait));
    assert(contains(model(plain).intervals.atk,1500));
    report.witnesses.opaque=[...rows,{label:'conditional own hook',reason:'defender_modify_damage_taken_when'}];
  });

  check('Hidden-information invariance: hidden skills, PP, trait, inventory and reserves leave ModeledFoe byte-identical',()=>{
    const script=[[move(S.phys),move(S.phys)],[move(S.wait),move(S.spec)],[move(S.spec),move(S.phys)],[move(S.phys),move(S.wait)],[move(S.phys),move(S.phys)]];
    const lead={species:1,level:50,stats:{...publicBaseline,hp:4000,atk:400,spe:30}};
    const a=fixture({seed:77,foeTeam:()=>[{...lead,skills:[S.phys,S.spec,S.wait]},{species:3,level:50,skills:[S.wait],stats:{...publicBaseline}}]});
    const b=fixture({seed:77,foeItems:{'obs-potion':5},foeTeam:()=>[{...lead,skills:[S.phys,S.spec,S.wait,S.special2],pp:{[S.special2]:3}},
      {species:4,level:60,skills:[S.quick],stats:{...publicBaseline,spe:500}},{species:3,level:50,skills:[S.boost],stats:{...publicBaseline}}]});
    b.active(0).conditions.push({id:'obs-hidden-trait',def:b.data.conditions.get('obs-hidden-trait'),turns:Infinity,appliedTurn:0});
    let compared=0;
    for(const [x,y] of script){
      turn(a,x,y);turn(b,x,y);
      assert.equal(serial(a.log),serial(b.log),'same public event stream');
      assert.deepEqual(revealedOpponentSlots(a,1),revealedOpponentSlots(b,1));
      assert.equal(serial(observeOpponent(a,1,0)),serial(observeOpponent(b,1,0)),`turn ${a.turn}: ModeledFoe`);compared++;
    }
    assert.notEqual(serial(a.journal),serial(b.journal),'the hidden trait reaches the journal but not the model');
    const m=observeOpponent(b,1,0);assert(m.intervals.atk&&m.intervals.spe,'evidence was used');assert(!m.conditions.some(c=>c.id==='obs-hidden-trait'));
    // Structural guard: hidden fields and the unrevealed reserve throw when touched.
    const foe=b.active(0);
    for(const key of ['stats','skills','pp','maxPp','persist','vol','rules','usedSkills','skillUses','skillOverrides'])Object.defineProperty(foe,key,{configurable:true,get(){throw new Error(`hidden field read: ${key}`);}});
    for(const key of ['items','pending','unlimitedItems','rules'])Object.defineProperty(b.sides[0],key,{configurable:true,get(){throw new Error(`hidden side field read: ${key}`);}});
    for(const slot of [1,2])Object.defineProperty(b.sides[0].team,String(slot),{configurable:true,get(){throw new Error(`unrevealed reserve ${slot} read`);}});
    assert.equal(serial(observeOpponent(b,1,0)),serial(m));
    assert.throws(()=>observeOpponent(b,1,1),/not been revealed/);
    report.witnesses.invariance={turns:compared,modelBytes:serial(m).length};
  });

  check('A faint replacement decided mid-turn observes the unflushed turn events and journal, and never reads pending',()=>{
    const b=fixture({foe:{stats:{...publicBaseline,hp:4000,atk:1500}},viewer:{}});
    b.sides[1].team.push({...b.active(1),slot:1,hp:b.active(1).maxHp,conditions:[],stages:{...b.active(1).stages}});
    turn(b,move(S.wait),move(S.wait));b.active(1).hp=1;
    let observing=false,seen=null;
    for(const side of b.sides){let value=side.pending;Object.defineProperty(side,'pending',{configurable:true,get(){if(observing)throw new Error('observe read pending');return value;},set(v){value=v;}});}
    const switchIn=b.switchIn.bind(b);
    b.switchIn=(side,slot)=>{if(side.index===1&&b.turn===2){observing=true;try{seen={model:observeOpponent(b,1,0),logTurns:b.log.filter(e=>e.type==='turn_start').length};}finally{observing=false;}}return switchIn(side,slot);};
    b.submit(0,move(S.phys));b.submit(1,move(S.wait));b.resolveTurn();
    assert(seen,'the AI replacement happened');assert.equal(b.active(1).slot,1);
    assert.equal(seen.logTurns,1,'the current turn was not yet in log');
    assert.equal(seen.model.moveUses[S.phys],1,'the current turn move is visible');
    assert(contains(seen.model.intervals.atk,1500),'the current turn journal hit is visible');
  });

  check('Transform resets observed moves and refinement for that slot',()=>{
    const b=fixture({foe:{stats:{...publicBaseline,hp:4000,atk:1500}}});
    for(let i=0;i<2;i++)turn(b,move(S.phys),move(S.wait));
    let m=model(b);assert.deepEqual(m.observedMoves,[S.phys]);assert.equal(m.moveUses[S.phys],2);assert(m.intervals.atk);
    b.log.push({type:'transform',side:0,species:1,types:['normal'],name:'Observed',hp:b.active(0).hp,maxHp:b.active(0).maxHp});
    m=model(b);assert.deepEqual(m.observedMoves,[]);assert.equal(m.intervals.atk,undefined);
    turn(b,move(S.spec),move(S.wait));m=model(b);assert.deepEqual(m.observedMoves,[S.spec]);assert(m.intervals.spa&&!m.intervals.atk);
  });

  check('Conflicting evidence keeps the most recent observations and records the conflict',()=>{
    const b=fixture({foe:{stats:{...publicBaseline,hp:60000,atk:300}}});
    for(let i=0;i<2;i++)turn(b,move(S.phys),move(S.wait));
    b.active(0).stats.atk=1800; // a mid-battle change the stage-0 model cannot explain
    for(let i=0;i<2;i++)turn(b,move(S.phys),move(S.wait));
    const m=model(b);assert(contains(m.intervals.atk,1800),serial(m.intervals));assert(!contains(m.intervals.atk,300));
    assert(m.conflicts.some(text=>text.startsWith('atk:')),serial(m.conflicts));
    report.witnesses.conflict={interval:m.intervals.atk,conflicts:m.conflicts};
  });

  check('Speed ties use non-strict bounds without the private tie flag; differing nominal priority is skipped',()=>{
    const tie=fixture({foe:{stats:{...publicBaseline,hp:4000,spe:viewerStats.spe}}});
    for(let i=0;i<3;i++)turn(tie,move(S.phys),move(S.phys));
    assert(tie.journal.filter(e=>e.type==='order').every(e=>e.speedTie));
    const [lo,hi]=model(tie).intervals.spe;assert(lo<=viewerStats.spe&&viewerStats.spe<=hi,`tie interval ${lo}..${hi} contains ${viewerStats.spe}`);
    const pri=fixture({foe:{stats:{...publicBaseline,hp:4000,spe:999}}});
    for(let i=0;i<2;i++)turn(pri,move(S.phys),move(S.quick));
    assert.equal(pri.journal.filter(e=>e.type==='order').length,2);assert.equal(model(pri).intervals.spe,undefined);
    assert.deepEqual(pri.journal.find(e=>e.type==='order').skills,[S.phys,S.quick]);
  });
}catch(error){report.failures.push({name:'harness',error:String(error.stack)});}
finally{
  await server.close();
  const dir=path.join(root,'artifacts/battle-observe-v58');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));if(report.failures.length)process.exitCode=1;
}
