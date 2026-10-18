/** V58 search planner behaviour fixtures and decision-level hidden-information invariance (design/notes/trainer-search-ai-v58.md 9.2, 9.6). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const explore=process.argv.includes('--explore');
const report={checks:[],failures:[],witnesses:{}};
const check=(name,run)=>{try{run();report.checks.push(name);}catch(error){report.failures.push({name,error:String(error.stack).slice(0,4000)});console.error(`FAIL ${name}: ${error.message.split('\n')[0]}`);}};
const server=await createServer({root,configFile:false,cacheDir:path.join(root,'artifacts/.validation-cache/trainer-search-behavior-v58'),
  server:{middlewareMode:true,watch:null,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',logLevel:'error'});
try{
  const [core,{lastSearchDecision},{SEER_SCRIPTS},{npcTrainingScripts}]=await Promise.all(['/battle/core/src/index.ts','/battle/core/src/search-ai.ts','/battle/core/src/scripts/index.ts','/src/mechanics/npc-training.ts'].map(id=>server.ssrLoadModule(id)));
  const {createBattle,buildDataSet,computeStats,chooseAiAction,BASELINE_IV,BASELINE_EVS}=core;
  const S={slowKo:58101,clear:58102,foeHit:58103,chip:58104,inherit:58105,heavy:58106,quick:58107,wait:58109};
  const base={hp:100,atk:100,def:100,spa:100,spd:100,spe:100};
  const attack=(id,power,extra={})=>({id,name:{zh:`Behaviour ${id}`},type:'normal',category:'physical',power,accuracy:null,pp:20,priority:0,effects:[],...extra});
  const support=(id,effects,extra={})=>attack(id,0,{category:'status',effects,...extra});
  const raw={
    species:[{id:1,name:{zh:'Foe'},types:['normal'],base},{id:2,name:{zh:'Fast foe'},types:['normal'],base:{...base,spe:130}},{id:3,name:{zh:'Hidden reserve'},types:['normal'],base},
      {id:10,name:{zh:'AI'},types:['normal'],base}],
    types:{chart:{normal:{normal:1}}},
    skills:[attack(S.slowKo,150),support(S.clear,[{op:'clear_stages',which:'up',target:'foe'}],{priority:1}),attack(S.foeHit,80),attack(S.chip,10),
      support(S.inherit,[{op:'script',id:'seer_eff_59',params:[0,4]}],{target:'self'}),attack(S.heavy,150),attack(S.quick,80,{priority:1}),support(S.wait,[],{target:'self'})],
    conditions:[],
    items:[{id:'hp-potion',name:{zh:'Fixture HP'},battle_effects:[{op:'heal',amount:200}]}],
  };
  // Baseline model stats: the planner's estimate equals the truth unless a fixture says otherwise.
  const fb=computeStats(base,50,BASELINE_IV,BASELINE_EVS),fast=computeStats({...base,spe:130},50,BASELINE_IV,BASELINE_EVS);
  function fixture({seed=58,foe,ai,aiItems={},kind='trainer',style='balanced'}){
    return createBattle({data:buildDataSet(structuredClone(raw)),scripts:{...SEER_SCRIPTS,...npcTrainingScripts},seed,conventionalMoves:()=>[S.foeHit],sides:[
      {kind:'player',team:foe},
      {kind,team:ai,items:aiItems,ai:{kind:'smart',allow_switch:true,style}},
    ]});
  }
  const foeMon=(extra={})=>({species:1,level:50,stats:{...fb},skills:[S.foeHit],...extra});
  const aiMon=(skills,stats={})=>({species:10,level:50,stats:{...fb,...stats},skills});
  const move=skill=>({kind:'move',skill});
  const decide=b=>chooseAiAction(b,b.sides[1]);
  const summary=b=>{const d=lastSearchDecision(b,b.sides[1]);return d&&{actions:d.actions,responses:d.responses,matrix:d.matrix.map(r=>r.map(v=>+v.toFixed(3))),strategy:d.strategy.map(v=>+v.toFixed(3)),chosen:d.chosen,sacrifices:d.sacrifices};};
  const scenes={
    // A faster foe at +4 attack knocks the AI out first; a priority clear survives and wins the next exchange.
    removal:(seed=58)=>{const b=fixture({seed,foe:[{...foeMon(),species:2,stats:{...fast}}],ai:[aiMon([S.slowKo,S.clear])]});
      b.active(0).stages.atk=4;b.active(0).hp=80;b.active(1).hp=130;return b;},
    // V57 regression: both defenses at +6, and a priority attack that still knocks out.
    plusSix:(seed=58)=>{const b=fixture({seed,foe:[foeMon()],ai:[aiMon([S.quick,S.clear],{atk:300})]});
      Object.assign(b.active(0).stages,{def:6,spd:6});b.active(0).hp=20;return b;},
    // Doomed but faster: inheritance hands a slow heavy hitter +1 attack and speed on a free entry.
    doomed:(seed=58)=>{const b=fixture({seed,foe:[foeMon()],ai:[aiMon([S.chip,S.inherit],{spe:200}),aiMon([S.heavy],{atk:220,spe:120})]});b.active(1).hp=40;return b;},
    // The same skill on a healthy monster that wins its own exchange.
    healthy:(seed=58)=>fixture({seed,foe:[foeMon()],ai:[aiMon([S.heavy,S.inherit],{atk:220,spe:200}),aiMon([S.heavy],{atk:220,spe:120})]}),
  };
  if(explore){
    for(const [name,scene] of Object.entries(scenes)){const b=scene();const a=decide(b);console.log(name,JSON.stringify(a),JSON.stringify(summary(b)));}
  }else{
    const seeds=Array.from({length:8},(_,i)=>5800+i);
    const always=(scene,expected,name)=>check(name,()=>{
      const chosen=seeds.map(seed=>decide(scene(seed)));
      report.witnesses[name]=chosen;for(const a of chosen)assert.deepEqual(a,expected);
    });
    always(scenes.removal,move(S.clear),'A faster boosted foe: priority boost removal is chosen when it changes survival');
    always(scenes.plusSix,move(S.quick),'V57 +6 defenses case: the reliable priority knockout is still chosen');
    always(scenes.doomed,move(S.inherit),'A doomed faster monster sacrifices itself with inheritance for a slow heavy hitter');
    always(scenes.healthy,move(S.heavy),'A healthy monster that wins its exchange does not sacrifice itself');

    check('The real replacement after a chosen sacrifice follows the planned successor and receives the gift',()=>{
      // A weak reserve in slot 1 and the heavy hitter in slot 2: the plan must pick slot 2.
      const b=fixture({foe:[foeMon()],ai:[aiMon([S.chip,S.inherit],{spe:200}),aiMon([S.heavy],{atk:60,spe:120}),aiMon([S.heavy],{atk:220,spe:120})]});b.active(1).hp=40;
      b.submit(0,move(S.foeHit));b.submit(1,decide(b));b.resolveTurn();
      const plan=lastSearchDecision(b,b.sides[1]).sacrifices[0];
      assert(b.sides[1].team[0].fainted,'the sacrificer fainted');assert.deepEqual(plan.successors,[2]);assert.equal(b.sides[1].active,2);
      assert.equal(b.active(1).stages.atk,1);assert.equal(b.active(1).stages.spe,1);
      report.witnesses.successor={plan,active:b.sides[1].active};
    });

    check('Medicine: HP-restoring items are never used on six consecutive turns',()=>{
      const b=fixture({foe:[foeMon({stats:{...fb,hp:5000},skills:[S.foeHit]})],ai:[aiMon([S.wait])],aiItems:{'hp-potion':99}});
      const heals=[];
      for(let t=0;t<18&&!b.result;t++){b.submit(0,move(S.foeHit));const a=decide(b);b.submit(1,a);b.resolveTurn();heals.push(a.kind==='item');}
      let run=0,longest=0;for(const h of heals){run=h?run+1:0;longest=Math.max(longest,run);}
      report.witnesses.medicine={heals:heals.map(Number).join(''),longest};
      assert(longest>=5,'the fixture makes repeated healing attractive');assert(longest<=5,'no sixth consecutive HP medicine');
    });

    check('Boss sides keep the legacy policy and never reach the search planner',()=>{
      const boss=fixture({kind:'boss',foe:[foeMon()],ai:[aiMon([S.slowKo,S.clear])]});decide(boss);
      assert.equal(lastSearchDecision(boss,boss.sides[1]),undefined);
      const trainer=fixture({foe:[foeMon()],ai:[aiMon([S.slowKo,S.clear])]});decide(trainer);
      assert(lastSearchDecision(trainer,trainer.sides[1]),'trainer decisions are recorded');
    });

    check('Hidden information: the decision record is byte-identical across hidden player builds',()=>{
      const hiddenVariants=[
        {},
        {stats:{...fb,atk:400,def:40,spa:10,spd:300,spe:30},skills:[S.quick,S.slowKo,S.clear,S.wait]},
        {stats:{...fb,hp:3720,atk:20,spe:400},nature:'hidden',skills:[S.chip]},
      ];
      const records=hiddenVariants.map((variant,k)=>{
        const b=fixture({foe:[{...foeMon(),...variant},{species:3,level:50,stats:{...fb},skills:[S.wait]}],ai:[aiMon([S.slowKo,S.clear]),aiMon([S.heavy])]});
        // Same public HP bar: full health in every variant.
        b.sides[0].items={'hp-potion':k*5};b.sides[0].pending=k?move(S.foeHit):null;
        const before=JSON.stringify(b.rng.s);decide(b);
        return {record:JSON.stringify(lastSearchDecision(b,b.sides[1])),drew:JSON.stringify(b.rng.s)!==before};
      });
      for(const r of records.slice(1))assert.equal(r.record,records[0].record);
      report.witnesses.invariance={variants:hiddenVariants.length,recordBytes:records[0].record.length};
    });
  }
}catch(error){report.failures.push({name:'harness',error:String(error.stack)});}
finally{
  await server.close();
  if(!explore){const dir=path.join(root,'artifacts/trainer-search-behavior-v58');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({checks:report.checks,failures:report.failures.map(f=>f.name),witnesses:report.witnesses},null,1));if(report.failures.length)process.exitCode=1;
}
