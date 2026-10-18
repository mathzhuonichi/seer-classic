/** Independent immediate-KO priority and public-information boundary regression. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const baseline=process.argv.includes('--baseline');
const report={checks:[],failures:[],witnesses:[],mode:baseline?'pre-fix-reproduction':'regression',scope:'Immediate first-action knockouts against the public opponent model, plus independent actual-engine witnesses. This does not certify unknown opponent builds or unseen moves.'};
const check=(name,run)=>{try{run();report.checks.push(name);}catch(error){report.failures.push({name,error:String(error.stack)});console.error(`FAIL ${name}: ${error.message}`);}};
const previousFetch=globalThis.fetch;let networkRequests=0;
globalThis.fetch=()=>{networkRequests++;throw new Error('KO verification must remain offline.');};
const server=await createServer({root,configFile:false,cacheDir:path.join(root,'artifacts/.validation-cache/trainer-ko-priority-v57'),server:{middlewareMode:true,watch:null,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',logLevel:'error'});
try{
  const [{createBattle},{buildDataSet},{chooseAiAction},{computeStats},{SEER_SCRIPTS},{npcTrainingScripts}]=await Promise.all(['/tools/verification/_battle.ts','/battle/core/src/index.ts','/battle/ai/src/ai.ts','/battle/core/src/stats.ts','/battle/core/src/scripts/index.ts','/src/domain/challenges/npc-training-scripts.ts'].map(id=>server.ssrLoadModule(id)));
  const S={quick:57001,clear:57002,wait:57003,foeHit:57004,heal:57005,control:57006,shield:57007,fixed:57008,lottery:57009,multi:57010,probPower:57011,foeStatus:57012,foeUnknown:57013,steal:11924};
  const base={hp:100,atk:100,def:100,spa:100,spd:100,spe:100},publicStats=computeStats(base,50,15);
  const attack=(id,power=80,extra={})=>({id,name:{zh:`KO fixture ${id}`},type:'normal',category:'physical',power,accuracy:null,pp:20,priority:0,effects:[],...extra});
  const support=(id,effects,extra={})=>attack(id,0,{category:'status',effects,...extra});
  const raw={species:[{id:1,name:{zh:'Public neutral foe'},types:['normal'],base},{id:261,name:{zh:'Synthetic Gaia identity'},types:['normal'],base}],types:{chart:{normal:{normal:1,ghost:0}}},
    skills:[attack(S.quick,80,{priority:1}),support(S.clear,[{op:'clear_stages',which:'up',target:'foe'}]),support(S.wait,[],{target:'self'}),attack(S.foeHit,80),
      support(S.heal,[{op:'heal',pct_max_hp:100}],{target:'self'}),support(S.control,[{op:'status',status:'fear',target:'foe'}]),support(S.shield,[{op:'add_condition',condition:'ko-shield'}],{target:'self'}),
      attack(S.fixed,0,{priority:1,effects:[{op:'fixed_damage',amount:40,target:'foe'}]}),attack(S.lottery,0,{priority:1,effects:[{op:'ohko',chance:30,target:'foe'}]}),
      attack(S.multi,80,{priority:1,effects:[{op:'multi_hit',min:1,max:4}]}),attack(S.probPower,1,{priority:1,effects:[{op:'power_if',power:800,chance:50}]}),
      support(S.foeStatus,[{op:'status',status:'fear',target:'foe'}],{priority:2}),attack(S.foeUnknown,80,{effects:[{op:'script',id:'ko-unknown-priority'}]}),
      attack(S.steal,1,{effects:[{op:'script',id:'seer_eff_85'}]})],
    conditions:[{id:'fear',kind:'status',control:true,hooks:[{on:'before_move',prevent:true}]},{id:'ko-shield',kind:'buff',hooks:[{on:'modify_damage_taken',multiplier:0}]}],
    items:[{id:'ko-hp',name:{zh:'Fixture HP'},battle_effects:[{op:'heal',amount:250}]},{id:'ko-pp',name:{zh:'Fixture PP'},battle_effects:[{op:'restore_pp',amount:20}]}]};
  const own=(skills,extra={})=>({species:261,level:50,skills,stats:{hp:400,atk:300,def:100,spa:300,spd:100,spe:300},...extra});
  function fixture({seed=57,style='balanced',skills=[S.quick,S.clear],kind='trainer',bench=false,foeRules=[],items={},scripts={}}={}){
    const b=createBattle({data:buildDataSet(structuredClone(raw)),scripts:{...SEER_SCRIPTS,...npcTrainingScripts,...scripts},seed,sides:[
      {kind:'player',team:[{species:1,level:50,iv:15,stats:{...publicStats},skills:[S.wait,S.foeHit]}],rules:foeRules},
      {kind,team:[own(skills),...(bench?[own([S.quick,S.heal])]:[])],ai:{kind:'smart',style,allow_switch:true},items},
    ]});b.active(0).hp=30;Object.assign(b.active(0).stages,{def:6,spd:6});b.log.push({type:'move_used',side:0,skill:S.foeHit,name:'Public ordinary attack'});b.turn=3;b.active(1).turnsActive=2;return b;
  }
  const move=skill=>({kind:'move',skill}),decide=b=>chooseAiAction(b,b.sides[1]);
  const state=b=>JSON.stringify(b,(_key,value)=>value instanceof Map?[...value]:value instanceof Set?[...value]:value);
  const legal=(b,action)=>assert(b.legalActions(1).some(candidate=>JSON.stringify(candidate)===JSON.stringify(action)),`Legal action: ${JSON.stringify(action)}`);
  const hook=(b,side,id,hooks,{turns=4,visible=true,slot=b.sides[side].active}={})=>{
    b.sides[side].team[slot].conditions.push({id,def:{id,kind:'buff',hooks},turns,appliedTurn:0});
    if(visible)b.log.push({type:'condition_added',side,condition:id});
  };
  const installSeal=(b,slot=0)=>npcTrainingScripts.npc_gaia_evil_seal.install({battle:b,side:b.sides[1],mon:b.sides[1].team[slot]},{});
  check('A guaranteed priority KO outranks clearing both defenses at plus six',()=>{
    const b=fixture(),chosen=decide(b);report.witnesses.push({kind:'dual-defense-reproduction',stages:{...b.active(0).stages},foeHp:b.active(0).hp,chosen,expected:move(S.quick)});assert.deepEqual(chosen,move(S.quick));
  });
  check('The proposed priority attack actually knocks out the public-build foe before it acts across 32 seeds',()=>{
    let minimumDamage=Infinity;
    for(let seed=1;seed<=32;seed++){
      const b=fixture({seed});b.submit(0,move(S.foeHit));b.submit(1,move(S.quick));const events=b.resolveTurn();
      assert.equal(events.find(event=>event.type==='move_used')?.side,1);assert.equal(b.result?.winner,1);assert(!events.some(event=>event.type==='move_used'&&event.side===0));
      const dealt=events.filter(event=>event.type==='damage'&&event.side===0).reduce((sum,event)=>sum+event.amount+(event.overkill??0),0);minimumDamage=Math.min(minimumDamage,dealt);
    }
    report.witnesses.push({kind:'actual-priority-ko',seeds:32,minimumDamage,foeHp:30});
  });
  if(!baseline){
    check('All four styles prioritize a certain first KO over clear, theft, control, heal, shield, switch and medicine options',()=>{
      let cases=0;
      for(const style of ['balanced','offense','control','attrition'])for(const skills of [[S.quick,S.clear,S.steal,S.control],[S.quick,S.heal,S.shield,S.clear],[S.quick,S.steal,S.shield,S.control]]){
        const b=fixture({style,skills,bench:true,items:{'ko-hp':9,'ko-pp':9}});b.active(1).hp=1;b.active(1).pp[S.quick]=1;Object.keys(b.active(0).stages).forEach(key=>{b.active(0).stages[key]=6;});
        assert(b.legalActions(1).some(action=>action.kind==='switch'));assert(b.legalActions(1).some(action=>action.kind==='item'&&action.item==='ko-hp'));assert(b.legalActions(1).some(action=>action.kind==='item'&&action.item==='ko-pp'));
        assert.deepEqual(decide(b),move(S.quick));legal(b,decide(b));cases++;
      }
      report.witnesses.push({kind:'style-and-competing-actions',cases});
    });
    check('The actual minimum noncritical damage roll still knocks out the boosted public-build target',()=>{
      const b=fixture();b.data.skills.get(S.quick).crit_rate=0;b.rng.next=()=>0;b.submit(0,move(S.foeHit));b.submit(1,move(S.quick));const events=b.resolveTurn();
      const hits=events.filter(event=>event.type==='damage'&&event.side===0);assert(hits.every(event=>!event.crit));assert.equal(hits.reduce((sum,event)=>sum+event.amount+(event.overkill??0),0),31);assert.equal(b.result?.winner,1);
    });
    check('PP legality excludes an exhausted killing move but permits the engine-legal last PP',()=>{
      const empty=fixture();empty.active(1).pp[S.quick]=0;assert.notDeepEqual(decide(empty),move(S.quick));
      const last=fixture();last.data.skills.get(S.quick).pp_cost=3;last.active(1).pp[S.quick]=1;legal(last,move(S.quick));
    });
    check('Actual same-speed ties produce both first movers across seeds',()=>{
      const first=new Set();for(let seed=1;seed<=32;seed++){const b=fixture({seed});b.data.skills.get(S.foeHit).priority=1;b.active(1).stats.spe=publicStats.spe;b.submit(0,move(S.foeHit));b.submit(1,move(S.quick));first.add(b.resolveTurn().find(event=>event.type==='move_used')?.side);}
      assert.deepEqual(first,new Set([0,1]));
    });
    check('Ordinary deterministic fixed damage is chosen as the knockout',()=>{
      const fixed=fixture({skills:[S.fixed,S.clear]});assert.deepEqual(decide(fixed),move(S.fixed));
    });
    check('The active attacking holder with a live evil seal takes the extra-30 knockout',()=>{
      const owner=fixture({bench:true});owner.active(0).hp=50;installSeal(owner);assert.deepEqual(decide(owner),move(S.quick));
    });
    check('Actual sealed and unassigned same-species attackers demonstrate the ownership threshold across seeds',()=>{
      for(let seed=1;seed<=24;seed++)for(const sealed of [false,true]){
        const b=fixture({seed});b.active(0).hp=50;b.data.skills.get(S.quick).crit_rate=0;if(sealed)installSeal(b);b.submit(0,move(S.wait));b.submit(1,move(S.quick));const events=b.resolveTurn();
        assert.equal(events.some(event=>event.type==='damage'&&event.side===0&&event.kind==='fixed'),sealed);assert.equal(b.active(0).fainted,sealed);
      }
      report.witnesses.push({kind:'actual-evil-seal-ownership',seedPairs:24,plainNeverKO:true,ownerAlwaysKO:true});
    });
    check('Current-HP percentages are applied sequentially and never summed as a guaranteed knockout',()=>{
      const observations=[];
      for(const powered of [true,false]){
        const id=powered?S.quick:S.fixed,b=fixture({skills:[id,S.clear]}),skill=b.data.skills.get(id);b.active(0).hp=powered?60:30;skill.crit_rate=0;
        skill.effects=Array.from({length:powered?1:2},()=>({op:'pct_damage',pct_current_hp:50,target:'foe'}));b.rng.next=()=>0;
        b.submit(0,move(S.wait));b.submit(1,move(id));const events=b.resolveTurn();
        assert.equal(b.active(0).hp,powered?15:8);assert.equal(b.active(0).fainted,false);
        observations.push({powered,remainingHp:b.active(0).hp,damage:events.filter(event=>event.type==='damage'&&event.side===0).map(event=>event.amount)});
      }
      report.witnesses.push({kind:'sequential-current-hp',observations});
    });
    check('Conditional fixed damage must be re-evaluated after the powered hit changes the target HP',()=>{
      const b=fixture(),skill=b.data.skills.get(S.quick);b.active(0).hp=b.active(0).maxHp;skill.crit_rate=0;skill.effects=[{op:'fixed_damage',amount:200,target:'foe',when:{foe_hp_above_pct:90}}];b.rng.next=()=>0;
      b.submit(0,move(S.wait));b.submit(1,move(S.quick));const events=b.resolveTurn();
      assert.equal(b.active(0).hp,136);assert(!events.some(event=>event.type==='damage'&&event.side===0&&event.kind==='fixed'));
      report.witnesses.push({kind:'post-hit-fixed-condition',initialHp:167,remainingHp:136,fixedDamageApplied:false});
    });
    check('Maximum-HP percentage damage floors its base before damage multipliers',()=>{
      const b=fixture({skills:[S.fixed,S.clear]}),target=b.active(0),skill=b.data.skills.get(S.fixed);target.species.base.hp=132;target.maxHp=target.stats.hp=199;target.hp=10;
      skill.effects=[{op:'pct_damage',pct_max_hp:1,target:'foe'}];hook(b,1,'percent-times-six',[{on:'modify_damage_dealt',kinds:['percent'],multiplier:6}]);
      b.submit(0,move(S.wait));b.submit(1,move(S.fixed));const events=b.resolveTurn();
      const hit=events.find(event=>event.type==='damage'&&event.side===0);assert.equal(hit.amount,6);assert.equal(target.hp,4);
      report.witnesses.push({kind:'percentage-rounding',base:1.99,multiplier:6,actualDamage:6,remainingHp:4});
    });
    check('Recoil can remove the seal holder before the extra fixed hit and cannot contribute a guaranteed KO',()=>{
      const b=fixture(),skill=b.data.skills.get(S.quick);b.active(0).hp=50;b.active(1).hp=1;skill.crit_rate=0;skill.effects=[{op:'recoil',pct_max_hp:100}];installSeal(b);b.rng.next=()=>0;
      b.submit(0,move(S.wait));b.submit(1,move(S.quick));const events=b.resolveTurn();
      assert.equal(b.active(0).hp,19);assert.equal(b.active(1).fainted,true);assert(!events.some(event=>event.type==='damage'&&event.side===0&&event.kind==='fixed'));
      report.witnesses.push({kind:'recoil-before-seal',targetRemainingHp:19,attackerFainted:true,sealDamageApplied:false});
    });
    check('Own on-hit effects can intercept the seal sequence and exclude a guaranteed bonus KO',()=>{
      const b=fixture(),skill=b.data.skills.get(S.quick);b.active(0).hp=50;skill.crit_rate=0;
      hook(b,1,'heal-foe-before-seal',[{on:'on_hit',effects:[{op:'heal',pct_max_hp:100,target:'foe'}]}]);installSeal(b);b.rng.next=()=>0;
      b.submit(0,move(S.wait));b.submit(1,move(S.quick));const events=b.resolveTurn();
      assert.equal(b.active(0).hp,137);assert(events.some(event=>event.type==='heal'&&event.side===0));assert(events.some(event=>event.type==='damage'&&event.side===0&&event.kind==='fixed'&&event.amount===30));
      report.witnesses.push({kind:'on-hit-interception',targetRemainingHp:137,sealDamage:30});
    });
    check('Skill-dependent priority and power predicates cannot use a skill context absent in the engine',()=>{
      const priority=fixture(),fast=priority.data.skills.get(S.quick);fast.priority=0;fast.effects=[{op:'priority_if',priority:2,when:{category:'physical'}}];priority.active(1).stats.spe=1;
      assert.equal(priority.priority(priority.active(1),fast),0);priority.submit(0,move(S.foeHit));priority.submit(1,move(S.quick));const priorityEvents=priority.resolveTurn();assert.equal(priorityEvents.find(event=>event.type==='move_used').side,0);
      const power=fixture(),weak=power.data.skills.get(S.quick);weak.power=1;weak.crit_rate=0;weak.effects=[{op:'power_if',power:800,when:{category:'physical'}}];power.rng.next=()=>0;
      power.submit(0,move(S.wait));power.submit(1,move(S.quick));power.resolveTurn();assert.equal(power.active(0).hp,28);
      report.witnesses.push({kind:'predicate-context',actualPriority:0,opponentMovedFirst:true,actualPowerDamage:2});
    });
    check('Hidden defensive changes and pending choices cannot alter an otherwise identical public decision',()=>{
      for(const input of [null,move(S.foeHit),move(S.wait),{kind:'switch',slot:1}]){
        const b=fixture();b.sides[0].pending=input;b.active(0).stats.def=999999;b.active(0).stats.spd=999999;b.active(0).stats.spe=999999;b.active(0).skills=[S.foeStatus];
        hook(b,0,'hidden-protection',[{on:'block_move'}],{visible:false});assert.deepEqual(decide(b),move(S.quick));
      }
    });
    check('Immediate-KO planning is repeatable and leaves state and RNG untouched',()=>{
      const b=fixture({bench:true}),before=state(b);
      for(let i=0;i<20;i++)assert.deepEqual(decide(b),move(S.quick));assert.equal(state(b),before);
    });
    check('Boss dispatch keeps the old live-evaluation policy and does not inherit the trainer hard branch',()=>{
      const b=fixture({kind:'boss'});let calls=0;b.estimateDamage=()=>{calls++;return 0;};
      assert.deepEqual(decide(b),move(S.clear));assert.equal(calls,2);
    });
  }
  check('The verification makes no network requests',()=>assert.equal(networkRequests,0));
  report.sourceHashes=Object.fromEntries(['battle/ai/src/ai.ts','battle/ai/src/search-ai.ts','battle/core/src/engine/battle.ts'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
}catch(error){report.failures.push({name:'harness',error:String(error.stack)});}
finally{
  await server.close();globalThis.fetch=previousFetch;const dir=path.join(root,'artifacts/trainer-ko-priority-v57');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,baseline?'baseline.json':'regression.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));if(report.failures.length)process.exitCode=1;
}
