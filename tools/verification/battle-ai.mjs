/** Smart decisions use public information, preserve state, and respect opt-in team coordination. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';

const server=await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error'});
const checks=[],failures=[],trainerCases=[];
function check(name,run){try{run();checks.push(name)}catch(error){failures.push({name,error:String(error.stack).slice(0,3500)});console.error(`FAIL ${name}: ${error.message.split('\n')[0]}`)}}
try {
  const {createBattle}=await server.ssrLoadModule('/tools/verification/_battle.ts');
  const {STRUGGLE_SKILL}=await server.ssrLoadModule('/battle/core/src/constants.ts');
  const {buildDataSet}=await server.ssrLoadModule('/battle/core/src/data.ts');
  const {chooseAiAction}=await server.ssrLoadModule('/battle/ai/src/ai.ts');
  const {Rng}=await server.ssrLoadModule('/battle/core/src/rng.ts');
  const {SEER_SCRIPTS}=await server.ssrLoadModule('/battle/core/src/scripts/index.ts');
  const S={attack:1,wait:2,heal:3,control:4,poison:5,boost:6,debuff:7,cure:8,clear:9,leech:10,quick:11,strong:12,fire:13,water:14,grass:15,weak:16,script:17,selfClear:18,pp:19,shield:20,fixed:21,conditionalHeal:22,ground:23};
  const base={hp:100,atk:100,def:100,spa:100,spd:100,spe:100},stats={...base,hp:400};
  const attack=(id,power=80,extra={})=>({id,name:{zh:`Attack ${id}`},type:'normal',category:'physical',power,accuracy:null,pp:20,priority:0,effects:[],...extra});
  const support=(id,effects,extra={})=>attack(id,0,{category:'status',effects,...extra});
  const raw={species:[
    {id:1,name:{zh:'Visible opponent'},types:['normal'],base},
    {id:2,name:{zh:'AI lead'},types:['normal'],base},
    {id:3,name:{zh:'Fire opponent'},types:['fire'],base},
    {id:4,name:{zh:'Water reserve'},types:['water'],base},
    {id:5,name:{zh:'Grass lead'},types:['grass'],base},
    {id:6,name:{zh:'Flying opponent'},types:['flying'],base},
  ],types:{chart:{normal:{normal:1},fire:{grass:2,water:.5,fire:.5},water:{fire:2,grass:.5,water:.5},grass:{water:2,fire:.5,grass:.5},ground:{flying:0}}},skills:[
    attack(S.attack),support(S.wait,[],{target:'self'}),support(S.heal,[{op:'heal',pct_max_hp:50}],{target:'self'}),
    support(S.control,[{op:'status',status:'paralysis',target:'foe'}]),support(S.poison,[{op:'status',status:'poison',target:'foe'}]),
    support(S.boost,[{op:'stat_stage',stats:{atk:2},target:'self'}],{target:'self'}),support(S.debuff,[{op:'stat_stage',stats:{def:-2},target:'foe'}]),
    support(S.cure,[{op:'cure_status'}],{target:'self'}),support(S.clear,[{op:'clear_stages',target:'foe',which:'up'}]),
    support(S.leech,[{op:'status',status:'leech',target:'foe'}]),attack(S.quick,55,{priority:1}),attack(S.strong,140),
    attack(S.fire,90,{type:'fire',category:'special'}),attack(S.water,90,{type:'water',category:'special'}),attack(S.grass,70,{type:'grass',category:'special'}),attack(S.weak,5),
    attack(S.script,80,{effects:[{op:'script',id:'seer_eff_113'}]}),support(S.selfClear,[{op:'clear_stages',target:'self',which:'down'}],{target:'self'}),
    support(S.pp,[{op:'restore_pp',amount:5}],{target:'self'}),support(S.shield,[{op:'add_condition',condition:'audit-shield',target:'self'}],{target:'self'}),
    support(S.fixed,[{op:'fixed_damage',amount:80,target:'foe'}]),support(S.conditionalHeal,[{op:'heal',pct_max_hp:50,when:{self_hp_below_pct:10}}],{target:'self'}),attack(S.ground,120,{type:'ground'}),
  ],conditions:[{id:'audit-shield',kind:'buff',hooks:[{on:'modify_damage_taken',multiplier:.5}]}]};
  const member=(species=2,skills=[S.attack,S.heal],extra={})=>({species,level:50,skills,stats:{...stats},...extra});
  function fixture(options={}){
    const data=buildDataSet(structuredClone(raw));
    return createBattle({data,seed:options.seed??71,scripts:options.scripts??{},sides:[
      {kind:'player',team:options.playerTeam??[member(options.playerSpecies??1,options.playerSkills??[S.wait,S.attack,S.fire])],rules:options.playerRules??[],items:options.playerItems??{}},
      {kind:options.kind??'trainer',team:options.team??[member(options.species??2,options.skills??[S.attack,S.heal])],rules:options.rules??[],ai:options.ai??{kind:'smart'}},
    ]});
  }
  const decide=battle=>chooseAiAction(battle,battle.sides[1]);
  const move=id=>({kind:'move',skill:id});
  const state=battle=>JSON.stringify(battle,(_key,value)=>value instanceof Map?[...value]:value instanceof Set?[...value]:value);
  // The search planner may draw once from the live RNG to mix its strategy; read-only covers everything else.
  const stateWithoutRng=battle=>JSON.stringify(battle,(key,value)=>key==='rng'?undefined:value instanceof Map?[...value]:value instanceof Set?[...value]:value);
  function legal(battle,action){assert(battle.legalActions(1).some(value=>JSON.stringify(value)===JSON.stringify(action)),`AI action must be legal: ${JSON.stringify(action)}`);}
  function condition(battle,target,id,extra={}){target.conditions.push({id,def:battle.data.conditions.get(id),turns:4,appliedTurn:0,...extra});}

  check('Healing is skipped at full HP and used at substantial missing HP',()=>{
    const full=fixture();assert.deepEqual(decide(full),move(S.attack));
    const injured=fixture();injured.active(1).hp=120;injured.active(1).stats.spe=300;assert.deepEqual(decide(injured),move(S.heal));
  });
  check('A useful heal remains reusable instead of being permanently spent as setup',()=>{
    const battle=fixture();battle.active(1).hp=120;battle.active(1).stats.spe=300;battle.active(1).usedSkills.add(S.heal);assert.deepEqual(decide(battle),move(S.heal));
  });
  check('Currently inapplicable heals do not displace a useful attack',()=>{
    const gated=fixture({skills:[S.conditionalHeal,S.attack]});gated.active(1).hp=120;assert.deepEqual(decide(gated),move(S.attack));
  });
  check('A safe immediate knockout outranks healing and a slow knockout uses priority',()=>{
    const battle=fixture({skills:[S.heal,S.strong,S.quick]});battle.active(0).hp=1;battle.active(1).hp=30;battle.active(1).stats.spe=1;battle.log.push({type:'move_used',side:0,skill:S.attack,name:'Revealed knockout threat'});assert.deepEqual(decide(battle),move(S.quick));
  });
  check('Self-targeted healing ignores opposing evasion and its nominal accuracy',()=>{
    const battle=fixture();battle.active(1).hp=120;battle.active(1).stats.spe=300;battle.active(1).stages.acc=-6;battle.active(0).stages.eva=6;battle.data.skills.get(S.heal).accuracy=1;assert.deepEqual(decide(battle),move(S.heal));
  });
  check('Negative priority stays slow despite speed and revealed enemy priority changes the safe knockout',()=>{
    const negative=fixture({skills:[S.quick,S.strong]});negative.active(0).hp=1;negative.active(1).hp=30;negative.active(1).stats.spe=300;negative.log.push({type:'move_used',side:0,skill:S.attack,name:'Revealed knockout threat'});negative.data.skills.get(S.quick).priority=-1;assert.deepEqual(decide(negative),move(S.strong));
    const revealed=fixture({skills:[S.attack,S.quick]});revealed.active(0).hp=1;revealed.active(1).hp=30;revealed.active(1).stats.spe=300;revealed.data.skills.get(S.attack).priority=1;revealed.data.skills.get(S.quick).priority=3;revealed.data.skills.get(S.strong).priority=2;revealed.log.push({type:'move_used',side:0,skill:S.strong,name:'Revealed priority two attack'});assert.deepEqual(decide(revealed),move(S.quick));
  });
  check('Control is useful on a fresh target and skipped when its status is already present',()=>{
    const fresh=fixture({skills:[S.control,S.weak],ai:{kind:'smart',style:'control'}});assert.deepEqual(decide(fresh),move(S.control));
    condition(fresh,fresh.active(0),'paralysis');assert.deepEqual(decide(fresh),move(S.weak));
  });
  check('Visible status-block hooks and grass leech immunity avoid ineffective moves',()=>{
    const blocked=fixture({skills:[S.control,S.weak]});blocked.active(0).conditions.push({id:'audit-block',def:{id:'audit-block',hooks:[{on:'block_status',statuses:['paralysis']}]},turns:4,appliedTurn:0});blocked.log.push({type:'condition_added',side:0,condition:'audit-block'});assert.deepEqual(decide(blocked),move(S.weak));
    const grass=fixture({playerSpecies:5,skills:[S.leech,S.weak]});assert.deepEqual(decide(grass),move(S.weak));
  });
  check('Capped stat setup and capped debuffs are skipped',()=>{
    const self=fixture({skills:[S.boost,S.attack]});self.active(1).stages.atk=6;assert.deepEqual(decide(self),move(S.attack));
    const foe=fixture({skills:[S.debuff,S.attack]});foe.active(0).stages.def=-6;assert.deepEqual(decide(foe),move(S.attack));
  });
  check('Physical-only setup is skipped by a special-only moveset',()=>{
    const battle=fixture({skills:[S.boost,S.water]});assert.deepEqual(decide(battle),move(S.water));
  });
  check('Stage-block hooks avoid ineffective debuffs',()=>{
    const hook=fixture({skills:[S.debuff,S.weak]});hook.active(0).conditions.push({id:'stage-block',def:{id:'stage-block',hooks:[{on:'block_stage_down'}]},turns:4,appliedTurn:0});hook.log.push({type:'condition_added',side:0,condition:'stage-block'});assert.deepEqual(decide(hook),move(S.weak));
  });
  check('Stage clearing is selected for real boosts and skipped when nothing can be cleared',()=>{
    const battle=fixture({skills:[S.clear,S.weak]});assert.deepEqual(decide(battle),move(S.weak));battle.active(0).stages.atk=4;assert.deepEqual(decide(battle),move(S.clear));
    const self=fixture({skills:[S.selfClear,S.weak]});assert.deepEqual(decide(self),move(S.weak));self.active(1).stages.atk=-4;assert.deepEqual(decide(self),move(S.selfClear));
  });
  check('Status curing and lasting shields are not wasted without a current benefit',()=>{
    const cure=fixture({skills:[S.cure,S.weak]});assert.deepEqual(decide(cure),move(S.weak));condition(cure,cure.active(1),'burn');assert.deepEqual(decide(cure),move(S.cure));
    const shield=fixture({skills:[S.shield,S.weak]});condition(shield,shield.active(1),'audit-shield');assert.deepEqual(decide(shield),move(S.weak));
  });
  check('Type immunity changes only the relevant attack choice',()=>{
    const type=fixture({playerSpecies:6,skills:[S.ground,S.attack]});assert.deepEqual(decide(type),move(S.attack));
  });
  check('Type immunity suppresses foe side effects while explicit self benefits remain usable',()=>{
    const blocked=fixture({playerSpecies:6,skills:[S.ground,S.weak]});blocked.active(0).hp=40;blocked.data.skills.get(S.ground).effects=[{op:'fixed_damage',amount:30},{op:'status',status:'poison',target:'foe'},{op:'stat_stage',stats:{def:-6},target:'foe'}];assert.deepEqual(decide(blocked),move(S.weak));
    const hp=blocked.active(0).hp;blocked.submit(0,move(S.wait));blocked.submit(1,move(S.ground));const events=blocked.resolveTurn();assert(events.some(event=>event.type==='immune'&&event.side===0));assert.equal(blocked.active(0).hp,hp);assert.equal(blocked.active(0).conditions.length,0);assert.equal(blocked.active(0).stages.def,0);
    const useful=fixture({playerSpecies:6,skills:[S.ground,S.weak]});useful.data.skills.get(S.ground).effects=[{op:'stat_stage',stats:{atk:2},target:'self'}];assert.deepEqual(decide(useful),move(S.ground));useful.submit(0,move(S.wait));useful.submit(1,decide(useful));useful.resolveTurn();assert.equal(useful.active(1).stages.atk,2);assert.equal(useful.active(0).hp,useful.active(0).maxHp);
  });
  check('Real Electric Spark 10040 cannot claim its attached fixed damage against a ground target',()=>{
    const catalog=JSON.parse(fs.readFileSync('data/gamedata.json','utf8')),data=buildDataSet(catalog),weak=990900,wait=990901;data.skills.set(weak,attack(weak,5));data.skills.set(wait,support(wait,[],{target:'self'}));assert(data.skills.get(10040).effects.some(effect=>effect.op==='fixed_damage'));
    const battle=createBattle({data,seed:123,sides:[{kind:'player',team:[member(53,[wait],{hp:40})]},{kind:'trainer',team:[member(13,[10040,weak])],ai:{kind:'smart'}}]});assert.deepEqual(decide(battle),move(weak));const hp=battle.active(0).hp;battle.submit(0,move(wait));battle.submit(1,move(10040));const events=battle.resolveTurn();assert(events.some(event=>event.type==='immune'&&event.side===0));assert.equal(battle.active(0).hp,hp);
  });
  check('Announced accuracy-taken percentage reduces hit chance and favors a guaranteed hit',()=>{
    const battle=fixture({skills:[S.attack,S.weak]});battle.data.skills.get(S.attack).accuracy=100;assert.deepEqual(decide(battle),move(S.attack));battle.active(0).conditions.push({id:'accuracy-guard',def:{id:'accuracy-guard',kind:'buff',hooks:[{on:'modify_accuracy_taken',add_percent:100}]},turns:4,appliedTurn:0});battle.log.push({type:'condition_added',side:0,condition:'accuracy-guard'});assert.deepEqual(decide(battle),move(S.weak));const hp=battle.active(0).hp;battle.submit(0,move(S.wait));battle.submit(1,move(S.attack));const events=battle.resolveTurn();assert(events.some(event=>event.type==='miss'&&event.side===1));assert.equal(battle.active(0).hp,hp);
  });
  check('Exhausted PP is never selected and a fully exhausted solo monster uses Struggle',()=>{
    const battle=fixture({skills:[S.strong,S.weak]});battle.active(1).pp[S.strong]=0;assert.deepEqual(decide(battle),move(S.weak));battle.active(1).pp[S.weak]=0;const action=decide(battle);assert.deepEqual(action,move(STRUGGLE_SKILL.id));legal(battle,action);
  });
  check('Forced usable moves retain precedence and an exhausted forced move has a legal fallback',()=>{
    const battle=fixture();battle.active(1).hp=120;battle.active(1).stats.spe=300;battle.active(1).vol.forcedSkill=S.attack;assert.deepEqual(decide(battle),move(S.attack));assert.equal(battle.active(1).vol.forcedSkill,undefined);assert.deepEqual(decide(battle),move(S.heal));battle.active(1).vol.forcedSkill=S.attack;battle.active(1).pp[S.attack]=0;assert.deepEqual(decide(battle),move(S.heal));
  });
  check('Sequence AI preserves authored order, skips exhausted entries, and ignores tactical switching',()=>{
    const battle=fixture({skills:[S.attack,S.heal,S.control],ai:{kind:'sequence',skills:[S.control,S.heal,S.attack],allow_switch:true}});battle.active(1).pp[S.control]=0;const rng=[...battle.rng.s];assert.deepEqual([decide(battle),decide(battle),decide(battle)],[move(S.heal),move(S.attack),move(S.heal)]);assert.deepEqual(battle.rng.s,rng);
  });
  check('Random and weighted policies retain seeded RNG selection and legal PP filtering',()=>{
    const random=fixture({skills:[S.attack,S.heal,S.control],ai:{kind:'random'}});random.active(1).pp[S.heal]=0;const expected=new Rng(random.rng.s);assert.deepEqual(decide(random),move(expected.pick([S.attack,S.control])));assert.deepEqual(random.rng.s,expected.s);
    const weighted=fixture({skills:[S.attack,S.heal],ai:{kind:'weighted',weights:{[S.attack]:-1,[S.heal]:5}}});assert.deepEqual(decide(weighted),move(S.heal));
  });
  check('Script AI remains authoritative and its undefined return keeps the seeded fallback',()=>{
    const scripted=fixture({ai:{kind:'script',id:'fixed-ai'},scripts:{'fixed-ai':{apply:()=>move(S.heal)}}});assert.deepEqual(decide(scripted),move(S.heal));
    const fallback=fixture({ai:{kind:'script',id:'empty-ai'},scripts:{'empty-ai':{apply:()=>undefined}}});const rng=new Rng(fallback.rng.s);assert.deepEqual(decide(fallback),move(rng.pick([S.attack,S.heal])));
  });
  check('Smart decisions are stable and leave all battle state and RNG untouched',()=>{
    const battle=fixture({skills:[S.attack,S.heal,S.control,S.boost]});const before=state(battle),first=decide(battle);for(let i=0;i<10;i++){assert.deepEqual(decide(battle),first);legal(battle,first);}assert.equal(state(battle),before);
  });
  check('Simulated scripted callbacks leave live battle state, RNG and IV caches untouched',()=>{
    const mutate=({battle,user,holder})=>{(user??holder).persist.auditMutation=true;battle.rng.next();return 200;};
    const battle=fixture({skills:[S.script,S.attack],scripts:{...SEER_SCRIPTS,'audit-hook':{hook:mutate}}});battle.active(1).conditions.push({id:'audit-scripted',def:{id:'audit-scripted',hooks:[{on:'modify_stat',script:'audit-hook'},{on:'modify_priority',script:'audit-hook'}]},turns:Infinity,appliedTurn:0});
    const before=state(battle);legal(battle,decide(battle));assert.equal(state(battle),before);assert.equal(battle.active(1).persist.iv,undefined,'The real seer_eff_113 power callback must not write its IV cache');
  });
  check('Player pending input cannot change an otherwise identical smart decision',()=>{
    const choices=[];
    for(const pending of [null,move(S.wait),move(S.fire),{kind:'switch',slot:1}]){const battle=fixture({skills:[S.attack,S.heal,S.control],playerTeam:[member(1,[S.wait,S.fire]),member(4,[S.water])]});if(pending)battle.submit(0,pending);choices.push(decide(battle));}
    assert(choices.every(action=>JSON.stringify(action)===JSON.stringify(choices[0])));
  });
  check('Hidden opponent builds, unrevealed moves, PP, items, and reserves cannot affect the choice',()=>{
    const ordinary=fixture({skills:[S.attack,S.heal,S.control],playerTeam:[member(1,[S.wait,S.attack]),member(4,[S.water])]}),hidden=fixture({skills:[S.attack,S.heal,S.control],playerTeam:[member(1,[S.fire,S.strong],{stats:{...stats,atk:99999,def:1,spa:99999,spd:1,spe:99999}}),member(5,[S.strong],{hp:1})],playerItems:{unseenPotion:999}});
    hidden.active(0).pp[S.strong]=0;hidden.active(0).usedSkills.add(S.strong);hidden.active(0).skillUses[S.strong]=999;
    assert.deepEqual(decide(hidden),decide(ordinary));assert.deepEqual(hidden.rng.s,ordinary.rng.s);
  });
  check('Unannounced beads and innate traits remain hidden until an actual condition announcement',()=>{
    const battle=fixture({skills:[S.control,S.weak]}),before=decide(battle);assert.deepEqual(before,move(S.control));
    battle.active(0).conditions.push({id:'energy_bead',def:{id:'energy_bead',kind:'buff',hooks:[{on:'modify_damage_taken',multiplier:100}]},turns:Infinity,appliedTurn:0});
    battle.active(0).conditions.push({id:'innate-status-guard',def:{id:'innate-status-guard',kind:'buff',hooks:[{on:'block_status'}]},turns:Infinity,appliedTurn:0});
    assert.deepEqual(decide(battle),before,'A hidden modifier cannot change the public-information decision');
    battle.log.push({type:'condition_added',side:0,condition:'energy_bead'},{type:'condition_added',side:0,condition:'innate-status-guard'});assert.deepEqual(decide(battle),move(S.weak),'A public announcement makes the same active effect usable evidence');
  });
  function matchup(options={}){
    const battle=fixture({playerSpecies:3,playerSkills:[S.wait,S.fire],team:[member(5,[S.grass]),member(4,[S.water])],ai:{kind:'smart',allow_switch:true},...options});
    battle.turn=3;battle.active(1).turnsActive=2;battle.log.push({type:'move_used',side:0,skill:S.fire,name:'Public fire attack'});return battle;
  }
  check('Opt-in NPC switches to a clearly better, survivable own reserve',()=>{
    const battle=matchup(),before=state(battle),action=decide(battle);assert.deepEqual(action,{kind:'switch',slot:1});legal(battle,action);assert.equal(state(battle),before);
  });
  check('Switch cooldown and fainted reserves prevent voluntary switches',()=>{
    for(const turns of [0,1]){const battle=matchup();battle.active(1).turnsActive=turns;assert.equal(decide(battle).kind,'move');}
    for(const life of ['fainted']){const battle=matchup(),reserve=battle.sides[1].team[1];reserve.hp=life==='fainted'?0:1;reserve.fainted=life==='fainted';assert.equal(decide(battle).kind,'move');}
  });
  check('Voluntary switches account for entry damage and the next attack without penalizing free replacements',()=>{
    const exposed=member(3,[S.fire],{stats:{hp:167,atk:112,def:112,spa:112,spd:112,spe:112}});
    const reserve=speed=>member(4,[S.water],{hp:45,stats:{...stats,spe:speed}});
    const build=speed=>{const battle=matchup({playerTeam:[exposed],team:[member(5,[S.grass]),reserve(speed)]});battle.data.skills.get(S.grass).power=5;battle.data.skills.get(S.water).power=150;return battle;};
    const slow=build(50);assert.equal(decide(slow).kind,'move','A slow reserve surviving entry but dying before its first action is not a tactical upgrade');
    const fast=build(300);fast.data.skills.get(S.water).power=400;assert.deepEqual(decide(fast),{kind:'switch',slot:1},'A fast reserve with a decisive attack remains a valid switch');
    const priority=build(50);priority.data.skills.get(S.water).power=400;priority.data.skills.get(S.water).priority=1;assert.deepEqual(decide(priority),{kind:'switch',slot:1},'A priority attack can also provide a safe first action');
    const free=fixture({playerTeam:[exposed],team:[member(5,[S.wait],{hp:1}),member(5,[S.grass]),reserve(50)],ai:{kind:'smart',allow_switch:true}});free.data.skills.get(S.grass).power=5;free.data.skills.get(S.water).power=150;free.log.push({type:'move_used',side:0,skill:S.fire,name:'Public fire attack'});free.submit(0,move(S.fire));free.resolveTurn();assert.equal(free.sides[1].active,2,'Forced replacement does not incorrectly charge an entry hit');
  });
  check('No-switch rules and active trapping hooks are respected by coordinated AI',()=>{
    const rule=matchup({playerRules:[{rule:'no_switch'}]});const first=decide(rule);assert.equal(first.kind,'move');legal(rule,first);
    const hook=matchup();hook.active(1).conditions.push({id:'audit-trap',def:{id:'audit-trap',hooks:[{on:'block_switch'}]},turns:4,appliedTurn:0});const second=decide(hook);assert.equal(second.kind,'move');legal(hook,second);
  });
  check('Historical bosses retain ordered play unless coordination is explicitly enabled',()=>{
    const boss=matchup({kind:'boss',ai:{kind:'smart'}});assert.equal(decide(boss).kind,'move');
    const scripted=matchup({kind:'boss',ai:{kind:'sequence',skills:[S.grass],allow_switch:true}});assert.deepEqual(decide(scripted),move(S.grass));
  });
  check('An executed switch resets cooldown and prevents an immediate reverse switch',()=>{
    const battle=matchup(),action=decide(battle);battle.submit(0,move(S.wait));battle.submit(1,action);battle.resolveTurn();assert.equal(battle.sides[1].active,1);assert(battle.active(1).turnsActive<2);
    battle.active(0).species=battle.data.species.get(4);battle.active(0).types=['water'];battle.log.push({type:'transform',side:0,species:4},{type:'move_used',side:0,skill:S.water,name:'Public water attack'});
    assert.equal(decide(battle).kind,'move');
  });
  check('Actual knockout chooses a favorable NPC replacement while old bosses keep the first living reserve',()=>{
    for(const [kind,ai,expected] of [['trainer',{kind:'smart',allow_switch:true},2],['boss',{kind:'smart'},1]]){
      const battle=fixture({kind,ai,playerSpecies:3,playerSkills:[S.strong],team:[member(5,[S.wait],{hp:1,stats:{...stats,spe:1}}),member(5,[S.grass]),member(4,[S.water])],playerRules:[{rule:'no_switch'}]});battle.active(0).stats.spe=300;
      battle.submit(0,move(S.strong));const events=battle.resolveTurn();assert(events.some(event=>event.type==='faint'&&event.side===1));assert.equal(battle.sides[1].active,expected,'Automatic knockout replacement must use the selected policy even under trapping rules');assert.equal(battle.phase,'choose');
    }
  });
  check('Resolved battles replay identically from the same seed and submitted moves',()=>{
    const run=()=>{const battle=fixture({seed:812,skills:[S.attack,S.heal,S.poison,S.boost]});for(let i=0;i<8&&!battle.result;i++){battle.submit(0,move(i%2?S.attack:S.wait));battle.resolveTurn();}return state(battle);};assert.equal(run(),run());
  });
  check('Every authored NPC team and member produces legal, read-only decisions using its actual moves',()=>{
    const catalog=JSON.parse(fs.readFileSync('data/gamedata.json','utf8')),data=buildDataSet(catalog),files=fs.readdirSync('data/trainers').filter(name=>name.endsWith('.json')).sort();assert(files.length>0);let expectedTrainerCases=0;
    for(const file of files){const trainer=JSON.parse(fs.readFileSync(`data/trainers/${file}`,'utf8'));assert.equal(trainer.ai.kind,'smart');assert.equal(trainer.ai.allow_switch,true);
      expectedTrainerCases+=trainer.team.length*2;
      for(let lead=0;lead<trainer.team.length;lead++)for(const hp of [1,.3]){const team=[trainer.team[lead],...trainer.team.filter((_row,index)=>index!==lead)];const battle=createBattle({data,seed:2026,scripts:SEER_SCRIPTS,sides:[{kind:'player',team:[{species:6,level:80,skills:[10001]}]},{kind:'trainer',team,ai:trainer.ai}]});battle.active(1).hp=Math.max(1,Math.floor(battle.active(1).maxHp*hp));battle.active(1).turnsActive=2;const before=stateWithoutRng(battle),action=decide(battle);legal(battle,action);assert.equal(stateWithoutRng(battle),before);trainerCases.push({trainer:trainer.id,species:team[0].species,hpRatio:hp,action});}
    }
    assert.equal(trainerCases.length,expectedTrainerCases);
  });
  fs.mkdirSync('artifacts/battle-ai',{recursive:true});fs.writeFileSync('artifacts/battle-ai/regression.json',JSON.stringify({checks,trainerCases,failures},null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,trainerCases:trainerCases.length,failures},null,2));assert.equal(failures.length,0,`${failures.length} AI regression failures`);
} finally {await server.close();}
