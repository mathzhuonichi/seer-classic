/** Voluntary-switch decisions, switch-related engine rules, and a fixed, descriptive 12-battle sample. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';

const report={checks:[],failures:[],witnesses:[]};
const check=(name,fn)=>{try{fn();report.checks.push(name);}catch(error){report.failures.push({name,error:String(error.stack)});console.error(`FAIL ${name}: ${error.message}`);}};
// The search planner may draw once from the live RNG to mix its strategy; read-only means everything else.
const state=b=>JSON.stringify(b,(k,v)=>k==='rng'?undefined:v instanceof Map?[...v]:v instanceof Set?[...v]:v);
async function runtime(){
  const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error'});
  try {
    const [core,ai,catalog,seer,training,passives,battle]=await Promise.all(['/battle/core/src/index.ts','/battle/ai/src/ai.ts','/src/domain/catalog/catalog.ts','/battle/core/src/scripts/index.ts','/src/domain/challenges/npc-training.ts','/src/domain/challenges/npc-training-scripts.ts','/tools/verification/_battle.ts'].map(p=>server.ssrLoadModule(p)));
    return {server,...core,...ai,...catalog,...seer,...training,...passives,...battle};
  } catch(error) {await server.close();throw error;}
}
const pairs=[['trainer_attrition','trainer_offense'],['trainer_offense','trainer_control'],['trainer_control','trainer_trained_core'],['trainer_trained_core','trainer_trained_core'],['trainer_fast_pressure','trainer_trained_core'],['trainer_resilient_counter','trainer_control']];
async function sample(rt){
  const catalog=await rt.loadCatalog(),data=rt.buildDataSet(catalog),by=new Map(catalog.trainers.map(t=>[t.id,t])),results=[];
  for(const [npcId,playerId]of pairs)for(const seed of [7,29]){
    const encounter=rt.normalizeNpcTrainingEncounter(catalog,by.get(npcId));
    // Real legal reference loadouts; the player does not inherit NPC-only ability profiles.
    const player=structuredClone(by.get(playerId).team).map(({training_profile,...member})=>member);
    const b=rt.createBattle({data,scripts:{...rt.SEER_SCRIPTS,...rt.npcTrainingScripts},seed,sides:[{kind:'player',team:player,ai:{kind:'smart',allow_switch:true,style:'balanced'}}],encounter});
    const row={npc:npcId,player:playerId,seed,decisions:[0,0],voluntary:[0,0],forcedFaint:[0,0],forcedEffect:[0,0],bounces:[0,0],switches:[]},last=[null,null];
    let marker=null;const originalAction=b.doAction,originalSwitch=b.switchIn;
    // Planning clones copy these own properties; only the live battle is observed.
    b.doAction=function(side,action,first){if(this!==b)return originalAction.call(this,side,action,first);marker=action.kind==='switch'?side:null;try{return originalAction.call(this,side,action,first);}finally{marker=null;}};
    b.switchIn=function(side,slot){
      if(this!==b)return originalSwitch.call(this,side,slot);
      const old=b.active(side.index),reason=old.fainted?'forcedFaint':marker===side.index?'voluntary':'forcedEffect';row[reason][side.index]++;
      if(reason==='voluntary'){
        const previous=last[side.index],event={turn:b.turn,side:side.index,from:old.species.id,to:side.team[slot].species.id,fromSlot:old.slot,toSlot:slot,hp:old.hp,maxHp:old.maxHp,turnsActiveBeforeDecision:old.turnsActive-1,stages:{...old.stages},conditions:old.conditions.map(c=>c.id)};
        if(previous&&previous.fromSlot===slot&&previous.toSlot===old.slot){row.bounces[side.index]++;event.returnAfter=b.turn-previous.turn;}
        if(previous)assert(b.turn-previous.turn>=3,'The existing two-full-turn switch cooldown must remain effective');
        last[side.index]=event;row.switches.push(event);
      }else last[side.index]=null;
      return originalSwitch.call(this,side,slot);
    };
    let guard=0;while(!b.result&&guard++<500){if(b.phase==='choose'){row.decisions[0]++;row.decisions[1]++;}b.resolveTurn();}
    assert(b.result,'Every bounded sample must finish');row.turns=b.turn;row.winner=b.result.winner;row.reason=b.result.reason;results.push(row);
  }
  const totals={battles:results.length,turns:results.reduce((n,r)=>n+r.turns,0),decisions:[0,0],voluntary:[0,0],forcedFaint:[0,0],forcedEffect:[0,0],bounces:[0,0]};
  for(const row of results)for(const key of ['decisions','voluntary','forcedFaint','forcedEffect','bounces'])for(let side=0;side<2;side++)totals[key][side]+=row[key][side];
  totals.voluntaryDecisionRate=totals.voluntary.map((n,i)=>n/totals.decisions[i]);
  return {totals,results};
}

let current;
try{
  current=await runtime();report.current=await sample(current);
  const {createBattle,buildDataSet,chooseAiAction}=current;
  const base={hp:100,atk:100,def:100,spa:100,spd:100,spe:100},stats={...base,hp:400};
  const S={fire:1,grass:2,water:3,sleep:4,wait:5,heal:6,protect:7,shield:8,fixed:9};
  const attack=(id,power,type,extra={})=>({id,name:{zh:`Switch fixture ${id}`},category:'special',type,power,accuracy:100,pp:30,effects:[],...extra});
  function fixture({grass=70,water=90,hp=400,leadSpeed=100,reserveSpeed=100,reserveHp=400,reserveSpa=100,reserveDefense=100,leadSkills=[S.grass],knownSleep=false,knownFixed=false}={}){
    const data=buildDataSet({species:[{id:1,name:{zh:'Fire target'},types:['fire'],base},{id:2,name:{zh:'Grass lead'},types:['grass'],base},{id:3,name:{zh:'Water reserve'},types:['water'],base}],
      types:{chart:{fire:{grass:2,water:.5},water:{fire:2},grass:{fire:.5}}},conditions:[{id:'switch-immunity',kind:'buff',hooks:[{on:'block_status'}]},{id:'switch-shield',kind:'buff',hooks:[{on:'modify_damage_taken',kinds:['attack'],multiplier:.5}]}],skills:[
        attack(S.fire,90,'fire'),attack(S.grass,grass,'grass'),attack(S.water,water,'water'),attack(S.sleep,0,'normal',{category:'status',accuracy:null,effects:[{op:'status',target:'foe',status:'sleep'}]}),
        attack(S.wait,0,'normal',{category:'status',target:'self'}),attack(S.heal,0,'normal',{category:'status',target:'self',effects:[{op:'heal',target:'self',pct_max_hp:50}]}),
        attack(S.protect,0,'normal',{category:'status',target:'self',effects:[{op:'protect'}]}),attack(S.shield,0,'normal',{category:'status',target:'self',effects:[{op:'add_condition',target:'self',condition:'switch-shield',turns:3}]}),
        attack(S.fixed,0,'normal',{effects:[{op:'fixed_damage',amount:150}]})]});
    const b=createBattle({data,seed:47,sides:[{kind:'player',team:[{species:1,level:50,iv:15,skills:[S.fire,S.sleep,S.wait,S.fixed],stats:{hp:167,atk:112,def:112,spa:112,spd:112,spe:112}}]},
      {kind:'trainer',team:[{species:2,level:50,skills:leadSkills,stats:{...stats,spe:leadSpeed},hp},{species:3,level:50,skills:[S.water],stats:{...stats,spa:reserveSpa,spd:reserveDefense,spe:reserveSpeed},hp:reserveHp}],ai:{kind:'smart',allow_switch:true}}]});
    b.turn=3;b.active(1).turnsActive=2;b.log.push({type:'move_used',side:0,skill:knownFixed?S.fixed:S.fire});if(knownSleep)b.log.push({type:'move_used',side:0,skill:S.sleep});return b;
  }
  const decide=b=>chooseAiAction(b,b.sides[1]);
  const witness=(name,b)=>{const row={name,choice:decide(b)};report.witnesses.push(row);return row;};
  const condition=(b,mon,id,turns=4,def=b.data.conditions.get(id))=>mon.conditions.push({id,def,turns,appliedTurn:0});
  check('A clear durable type advantage still justifies paying for a voluntary switch',()=>{
    const b=fixture(),before=state(b),row=witness('Healthy grass lead versus fire, healthy water reserve',b);assert.deepEqual(row.choice,{kind:'switch',slot:1});assert.equal(state(b),before);
  });
  check('A slow 1-HP lead that stays falls first and its replacement enters free of an entry hit',()=>{
    const b=fixture({hp:1});
    b.submit(0,{kind:'move',skill:S.fire});b.submit(1,{kind:'move',skill:S.grass});const events=b.resolveTurn();assert(events.some(e=>e.type==='faint'&&e.side===1));assert.equal(b.sides[1].active,1);assert.equal(b.active(1).hp,400);assert(!events.some(e=>e.type==='damage'&&e.side===1&&e.slot===1));
  });
  check('A doomed fast lead that stays lands its attack before a free replacement',()=>{
    const b=fixture({hp:1,leadSpeed:300});
    b.submit(0,{kind:'move',skill:S.fire});b.submit(1,{kind:'move',skill:S.grass});const events=b.resolveTurn();assert(events.some(e=>e.type==='damage'&&e.side===0));assert.equal(b.sides[1].active,1);assert.equal(b.active(1).hp,400);
  });
  check('Inherited speed and accuracy are cleared by actual departure',()=>{
    const b=fixture({grass:130,water:20,hp:160});b.active(1).stages.spe=1;b.active(1).stages.acc=1;
    const outgoing=b.active(1);b.switchIn(b.sides[1],1);assert.equal(outgoing.stages.spe,0);assert.equal(outgoing.stages.acc,0);
  });
  check('Undisclosed opposing moves do not change the decision',()=>{
    const b=fixture({grass:160,leadSpeed:300}),expected=decide(b);
    const unknown=fixture({grass:160,leadSpeed:300});unknown.active(0).skills=[S.sleep];unknown.active(0).pp[S.sleep]=1;assert.deepEqual(decide(unknown),expected);
  });
  check('One remaining immunity turn blocks entry control and does not invent control before a faster next KO',()=>{
    const b=fixture({grass:5,water:400,hp:40,reserveHp:50,reserveSpa:300,reserveSpeed:300,knownSleep:true});condition(b,b.sides[1].team[1],'switch-immunity',1);
    const row=witness('One-turn entry immunity and faster next-turn finish',b);assert.equal(row.choice.kind,'switch');
    b.submit(0,{kind:'move',skill:S.sleep});b.submit(1,row.choice);const entry=b.resolveTurn();assert(entry.some(e=>e.type==='status_blocked'));assert(!b.active(1).conditions.some(c=>c.id==='switch-immunity'));
    b.submit(0,{kind:'move',skill:S.sleep});b.resolveTurn();assert.equal(b.result?.winner,1);
  });
  check('A first-acting control move prevents the current reply',()=>{
    const b=fixture({grass:5,hp:40,leadSpeed:300,leadSkills:[S.sleep,S.grass],reserveDefense:50});
    b.submit(0,{kind:'move',skill:S.fire});b.submit(1,{kind:'move',skill:S.sleep});b.resolveTurn();assert.equal(b.sides[1].team[0].hp,40);
  });
  check('A direct non-waking control move blocks both opposing actions while the user attacks',()=>{
    const fear=JSON.parse(fs.readFileSync('data/skills.json','utf8')).find(skill=>skill.id===20172);
    const data=buildDataSet({species:[{id:1,name:{zh:'Fire target'},types:['fire'],base},{id:2,name:{zh:'Grass lead'},types:['grass'],base},{id:3,name:{zh:'Water reserve'},types:['water'],base:{...base,spe:120}}],
      types:{chart:{fire:{grass:2,water:.5},water:{fire:2},grass:{fire:.5}}},skills:[attack(S.fire,150,'fire'),attack(S.grass,70,'grass'),attack(S.water,90,'water'),fear]});
    const make=(turns)=>{
      const b=createBattle({data,seed:5,sides:[{kind:'player',team:[{species:1,level:50,iv:15,skills:[S.fire]}]},
        {kind:'trainer',team:[{species:2,level:50,iv:15,skills:[20172,S.grass]},{species:3,level:50,iv:15,skills:[S.water]}],ai:{kind:'smart',allow_switch:true}}]});
      b.data.skills.set(20172,{...fear,effects:fear.effects.map(op=>turns===undefined?{...op}:{...op,turns})});
      b.turn=3;b.active(1).turnsActive=2;b.active(1).stages.spe=1;b.active(1).stages.acc=3;b.log.push({type:'move_used',side:0,skill:S.fire});return b;
    };
    const stay=make(),row=witness('Real fear 20172 keeps a following attack while preserving full HP',stay);
    const events=[];for(const skill of [20172,S.grass]){stay.submit(0,{kind:'move',skill:S.fire});stay.submit(1,{kind:'move',skill});events.push(...stay.resolveTurn());}
    assert.equal(stay.sides[1].team[0].hp,167);assert.equal(events.filter(e=>e.type==='cant_act'&&e.side===0).length,2);
    const switched=make();switched.submit(0,{kind:'move',skill:S.fire});switched.submit(1,{kind:'switch',slot:1});switched.resolveTurn();switched.submit(0,{kind:'move',skill:S.fire});switched.submit(1,{kind:'move',skill:S.water});switched.resolveTurn();
    assert(switched.active(1).hp<stay.active(1).hp);row.actual={stayedHp:stay.active(1).hp,switchedHp:switched.active(1).hp,blockedEnemyActions:2};
    const short=make(1);const shortEvents=[];
    for(const skill of [20172,S.grass]){short.submit(0,{kind:'move',skill:S.fire});short.submit(1,{kind:'move',skill});shortEvents.push(...short.resolveTurn());}
    assert.equal(shortEvents.filter(e=>e.type==='cant_act'&&e.side===0).length,1);assert.equal(short.sides[1].team[0].hp,0);
  });
  check('A successful switch retains the existing cooldown against an immediate return',()=>{
    const b=fixture(),action=decide(b);b.submit(0,{kind:'move',skill:S.wait});b.submit(1,action);b.resolveTurn();assert.equal(b.active(1).turnsActive,0);
    b.active(0).types=['water'];b.active(0).species=b.data.species.get(3);b.log.push({type:'transform',side:0,species:3},{type:'move_used',side:0,skill:S.water});
    for(const turns of [0,1]){b.active(1).turnsActive=turns;assert.equal(decide(b).kind,'move');}
  });
  check('Switch planning is deterministic, read-only, and unaffected by private opposing state',()=>{
    for(const options of [{},{hp:1},{grass:160,leadSpeed:300,knownSleep:true}]){
      // Each repeat starts from the same RNG state, since the search planner may draw once to mix.
      const b=fixture(options),before=state(b),random=[...b.rng.s],draws=b.rng.draws,rewind=()=>{b.rng.s=[...random];b.rng.draws=draws;},expected=decide(b);rewind();assert.deepEqual(decide(b),expected);assert.equal(state(b),before);
      const foe=b.active(0);foe.stats={...foe.stats,atk:9999,def:1,spa:9999,spd:1,spe:9999};foe.skills=[S.water];foe.pp={[S.water]:1};foe.usedSkills=new Set([S.water]);foe.skillUses={[S.water]:9};
      Object.assign(b.sides[0],{pending:{kind:'move',skill:S.water},items:{hidden:99}});rewind();assert.deepEqual(decide(b),expected);
    }
  });
  check('The fixed sample classifies voluntary, faint, forced-effect and return switches and every battle stays within 200 turns',()=>{
    assert.equal(report.current.totals.battles,12);
    assert(report.current.results.every(row=>row.turns<=200));
  });
}catch(error){report.failures.push({name:'Harness',error:String(error.stack)});}
finally{
  if(current)await current.server.close();
  fs.mkdirSync('artifacts/switch-policy-v47',{recursive:true});fs.writeFileSync('artifacts/switch-policy-v47/regression.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.checks.length,failures:report.failures,current:report.current?.totals},null,2));if(report.failures.length)process.exitCode=1;
}
