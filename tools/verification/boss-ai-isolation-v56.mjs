/**
 * Hold every Boss to the pre-tactical policy of d7e87e9, apart from its two 2026-10-19 refinements (attacks ranked by expected
 * damage; no turn wasted on an attack that cannot hurt while a move that changes something is left), and test the Boss/trainer
 * category boundaries.
 */
import assert from 'node:assert/strict';
import {sha256File,suite,withSsr} from './_harness.mjs';

/**
 * Decisions of `chooseAiAction` at d7e87e9 (battle/core/src/ai.ts, the last policy before the tactical planner) on this suite's
 * fixtures, recorded as `skill,skill,...@draws`: the chosen skills in order, then the RNG draws the decisions made in total.
 * Wild, Boss and trainer sides gave the same decisions for each explicit policy. A random policy, an empty weight table and a
 * script that returns nothing all fall back to the same seeded pick.
 */
const S={attack:1,wait:2,heal:3,quick:4,strong:5,fire:6,water:7,grass:8};
const SEEDED_PICK=['1,3,3@3','3,3,1@3','1,3,3@3','1,3,3@3','3,3,3@3','3,1,3@3','1,1,3@3','1,1,3@3'];
const ORACLE_POLICIES=[
  [{kind:'random'},SEEDED_PICK],
  [{kind:'sequence',skills:[S.heal,S.attack]},['3,1,3@0','3,1,3@0','3,1,3@0','3,1,3@0','3,1,3@0','3,1,3@0','3,1,3@0','3,1,3@0']],
  [{kind:'weighted',weights:{[S.heal]:3,[S.attack]:1}},['3,3,3@3','3,3,1@3','3,3,3@3','1,3,3@3','3,3,3@3','3,3,3@3','1,3,3@3','1,3,3@3']],
  [{kind:'weighted',weights:{}},SEEDED_PICK],
  [{kind:'script',id:'fixed'},['3,3,3@0','3,3,3@0','3,3,3@0','3,3,3@0','3,3,3@0','3,3,3@0','3,3,3@0','3,3,3@0']],
  [{kind:'script',id:'fallback'},SEEDED_PICK],
];
/** Ten decisions of a wild side without a policy, seed 71. */
const ORACLE_DEFAULT_WILD='1,3,1,1,3,1,1,1,3,1@10';
/** One decision per seed 1–16 when no skill does damage. */
const ORACLE_NO_DAMAGE=['2@1','3@1','2@1','2@1','3@1','3@1','2@1','2@1','3@1','2@1','3@1','3@1','2@1','2@1','2@1','2@1'];
/** Twelve decisions of the weighted Boss boss_spt_liaosi after its HP phase, seed 124. */
const ORACLE_HP_PHASE='10096,10096,10096,10099,10096,10099,10099,10096,10099,10096,10099,10099@12';

/*
 * The independent Boss oracle: `chooseAiAction` and `smartPick` of d7e87e9 (battle/core/src/ai.ts), frozen here verbatim except
 * for the d7e87e9 name prefix, the removed type annotations and Struggle's id as a parameter. It runs on current battles, so it
 * follows current mechanics and encounter data, and it must reproduce the decisions recorded above from the Git module.
 */
function d7e87e9ChooseAiAction(battle, side, struggleId) {
  const mon = battle.active(side.index);
  const usable = mon.skills.filter((id) => mon.pp[id] > 0);
  if (!usable.length) return { kind: 'move', skill: struggleId };
  if (mon.vol.forcedSkill !== undefined && usable.includes(mon.vol.forcedSkill)) {
    const id = mon.vol.forcedSkill;
    delete mon.vol.forcedSkill;
    return { kind: 'move', skill: id };
  }
  const ai = mon.ai ?? side.ai ?? { kind: side.kind === 'wild' ? 'random' : 'smart' };
  const move = (skill) => ({ kind: 'move', skill });

  switch (ai.kind) {
    case 'sequence': {
      const list = (ai.skills ?? mon.skills);
      for (let k = 0; k < list.length; k++) {
        const id = list[(mon.aiCursor + k) % list.length];
        if (usable.includes(id)) {
          mon.aiCursor = (mon.aiCursor + k + 1) % list.length;
          return move(id);
        }
      }
      return move(battle.rng.pick(usable));
    }
    case 'weighted': {
      const w = usable.map((id) => Math.max(0, ai.weights?.[String(id)] ?? 0));
      const total = w.reduce((a, b) => a + b, 0);
      if (total <= 0) return move(battle.rng.pick(usable));
      let r = battle.rng.next() * total;
      for (let k = 0; k < usable.length; k++) {
        r -= w[k];
        if (r < 0) return move(usable[k]);
      }
      return move(usable[usable.length - 1]);
    }
    case 'random':
      return move(battle.rng.pick(usable));
    case 'script': {
      const a = battle.callScript(ai.id, { side, mon }, ai.params);
      return a ?? move(battle.rng.pick(usable));
    }
    case 'smart':
    default:
      return move(d7e87e9SmartPick(battle, mon, usable));
  }
}

/** d7e87e9's Boss default: a KO if one exists, otherwise each status skill once, otherwise the highest raw damage. */
function d7e87e9SmartPick(battle, mon, usable) {
  const foe = battle.foeOf(mon);
  const scored = usable.map((id) => {
    const s = battle.skill(id);
    return { id, s, d: battle.estimateDamage(mon, foe, s), pri: battle.priority(mon, s) };
  });
  const kos = scored.filter((x) => x.d >= foe.hp && x.d > 0);
  if (kos.length) {
    kos.sort((a, b) => b.pri - a.pri || b.d - a.d);
    return kos[0].id;
  }
  const setup = scored.find((x) => x.s.category === 'status' && !mon.usedSkills.has(x.id));
  if (setup) return setup.id;
  const attacks = scored.filter((x) => x.d > 0).sort((a, b) => b.d - a.d);
  if (attacks.length) return attacks[0].id;
  return battle.rng.pick(usable);
}

const t=suite('boss-ai-isolation-v56'),{check}=t,bossCases=[],facilityCases=[];
await withSsr('boss-ai-isolation-v56',async load=>{
  const [{createBattle},{STRUGGLE_SKILL},{buildDataSet},{chooseAiAction,chooseAiReplacement},{loadCatalog},{SEER_SCRIPTS},{traitScripts},
    {campaignScripts},{npcTrainingScripts},{createFacilityEncounter},{Rng},{lastSearchDecision},{dealsDamage}]=await Promise.all([
    '/tools/verification/_battle.ts','/battle/core/src/constants.ts','/battle/core/src/data.ts','/battle/ai/src/ai.ts',
    '/src/domain/catalog/catalog.ts','/battle/core/src/scripts/index.ts','/src/domain/traits.ts','/src/domain/challenges/campaign-rules.ts',
    '/src/domain/challenges/npc-training-scripts.ts','/src/domain/challenges/battle-facilities.ts','/battle/core/src/rng.ts','/battle/ai/src/search-ai.ts',
    '/battle/core/src/engine/move.ts',
  ].map(load));
  const catalog=await loadCatalog(),data=buildDataSet(catalog);
  const scripts={...SEER_SCRIPTS,...traitScripts,...campaignScripts,...npcTrainingScripts};
  const move=skill=>({kind:'move',skill});
  const decide=b=>chooseAiAction(b,b.sides[1]);
  const decideAsD7e87e9=b=>d7e87e9ChooseAiAction(b,b.sides[1],STRUGGLE_SKILL.id);
  /** The current policy and the frozen oracle, both held to the recorded decisions. */
  const policies={current:decide,d7e87e9:decideAsD7e87e9};
  const observed=b=>({draws:b.rng.draws,state:b.state,
    mon:b.sides.map(s=>s.team.map(m=>({aiCursor:m.aiCursor,ai:m.ai,persist:m.persist,vol:m.vol,usedSkills:[...m.usedSkills]})))});
  /** `count` decisions of side 1 in the recorded format. */
  function decisions(b,count,choose=decide){
    const skills=[];
    for(let i=0;i<count;i++){const action=choose(b);assert.equal(action.kind,'move');skills.push(action.skill);}
    return `${skills.join(',')}@${b.rng.draws}`;
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
  /**
   * The 2026-10-19 refinement that explains a decision differing from the frozen oracle's, or undefined. Where no usable skill
   * had a positive estimate, the oracle drew any move; the policy draws, with the same one RNG value, among moves that are not
   * attacks. Where the oracle took the highest raw damage, the policy takes the highest expected damage, and a knockout of
   * the oracle's is never replaced by a slower move.
   */
  function refinement(b,expected,actual){
    const mon=b.active(1),foe=b.active(0),skill=id=>b.skill(id),estimate=id=>b.estimateDamage(mon,foe,skill(id));
    if(!mon.skills.some(id=>mon.pp[id]>0&&estimate(id)>0))return dealsDamage(b,skill(actual))?undefined:'no-damage fallback';
    if(!(estimate(expected)>0&&estimate(actual)>0))return undefined;
    const slower=estimate(expected)>=foe.hp&&b.priority(mon,skill(actual))<b.priority(mon,skill(expected));
    return slower?undefined:'expected-damage ranking';
  }
  /**
   * The current policy decides as the frozen oracle on an identical battle, or as one of its refinements: same RNG draws and
   * decision state, and no planner.
   */
  function matchOracle(current,reference,label){
    const actual=decide(current),expected=decideAsD7e87e9(reference);
    assert.equal(lastSearchDecision(current,current.sides[1]),undefined,`${label}: no planner`);
    assert.deepEqual(observed(current),observed(reference),`${label}: RNG and decision side effects`);
    const reason=JSON.stringify(actual)===JSON.stringify(expected)?'same':refinement(reference,expected.skill,actual.skill);
    assert(reason,`${label}: ${JSON.stringify(actual)} differs from the oracle's ${JSON.stringify(expected)} without a refinement`);
    return {action:actual,oracle:expected,reason};
  }
  check('Every catalog Boss member, whatever its policy, decides as the frozen d7e87e9 policy or its refinements across six battle states',()=>{
    assert.equal(catalog.bosses.length,180);
    const reasons={};
    for(const encounter of catalog.bosses)for(let lead=0;lead<encounter.team.length;lead++)for(const [state,prepare] of Object.entries(states)){
      const current=bossBattle(encounter,lead,5617+lead),reference=bossBattle(encounter,lead,5617+lead);prepare(current);prepare(reference);
      assert.equal(current.sides[1].kind,'boss');
      const {action,oracle,reason}=matchOracle(current,reference,`${encounter.id}/${lead}/${state}`);
      assert.equal(action.kind,'move');
      reasons[reason]=(reasons[reason]??0)+1;
      bossCases.push({boss:encounter.id,category:encounter.category,member:lead,state,action,...(reason==='same'?{}:{oracle,reason})});
    }
    t.witness('oracleComparison',reasons);
  });

  // The 2026-10-19 playtest: 丽莎布布 (grass, which light cannot hurt) against 厄尔塞拉, as the period guides fought it.
  const eersaila=catalog.bosses.find(row=>row.id==='boss_spt_eersaila'),lisa={species:303,level:100,iv:31,skills:[20503,20504,11006,11007],hp_override:20000};
  const isLight=id=>data.skills.get(id).type==='light';
  /** Boss moves over `turns` turns in which 丽莎布布 uses 花草护体, and 叶绿光束 every fourth turn when `clear` is set. */
  function bossMoves(encounter,variant,seed,turns,clear=true){
    const b=createBattle({data,scripts,seed,variant,encounter:structuredClone(encounter),sides:[{kind:'player',team:[structuredClone(lisa)]}]}),used=[];
    for(let turn=0;turn<turns&&!b.result;turn++){
      b.submit(0,move(clear&&turn%4===3?11006:20503));
      used.push(...b.resolveTurn().filter(e=>e.type==='move_used'&&e.side===1).map(e=>e.skill));
    }
    return used;
  }
  check('厄尔塞拉 fights 丽莎布布 with 时空裂痕 and 光芒附体 in every variant, never with a light attack',()=>{
    assert.deepEqual(eersaila.team[0].skills,[11140,20564,11136,11139]);
    const counts={};
    for(const variant of eersaila.variants)for(let seed=1;seed<=8;seed++)for(const [turn,id] of bossMoves(eersaila,variant.id,seed,20).entries()){
      assert(!isLight(id),`${variant.id}/${seed}/turn ${turn}: ${data.skills.get(id).name.zh}`);
      counts[id]=(counts[id]??0)+1;
    }
    assert(counts[11139]>counts[20564]&&counts[20564]>0,JSON.stringify(counts));
    t.witness('eersailaAgainstLisa',counts);
  });
  check('With only light attacks left, 厄尔塞拉 boosts until its stages are capped before it wastes a turn on one',()=>{
    const lightOnly=[11140,20564,11136,10632],encounter=structuredClone(eersaila);encounter.team[0].skills=lightOnly;encounter.ai.skills=lightOnly;
    for(let seed=1;seed<=8;seed++){
      const used=bossMoves(encounter,'mon',seed,12,false);
      assert.deepEqual(used.slice(0,6),Array(6).fill(20564),`seed ${seed}: 光芒附体 raises five stats by one up to +6`);
    }
  });
  check('As a trainer, the planner does not pick 厄尔塞拉\'s light attacks against 丽莎布布 either',()=>{
    for(let seed=1;seed<=2;seed++){
      const b=createBattle({data,scripts,seed,sides:[{kind:'player',team:[structuredClone(lisa)]},
        {kind:'trainer',team:[{species:421,level:80,skills:eersaila.team[0].skills}],ai:{kind:'smart'}}]});
      for(let turn=0;turn<6&&!b.result;turn++){
        const action=decide(b);
        assert(action.kind!=='move'||!isLight(action.skill),`${seed}/turn ${turn}: ${JSON.stringify(action)}`);
        b.submit(0,move(20503));b.submit(1,action);b.resolveTurn();
      }
    }
  });

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
  check('Legacy setup, repeat-heal avoidance, KO priority and raw-damage order are distinct from trainer heuristics',()=>{
    assert.deepEqual(decide(fixture()),move(S.heal));
    assert.deepEqual(decide(fixture({skills:[S.attack,S.wait,S.heal]})),move(S.wait),'the first unused status move');
    assert.deepEqual(decide(fixture({skills:[S.attack,S.strong,S.fire]})),move(S.strong),'the highest raw damage');
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
      // Both actions are explicit: this checks the knockout replacement, not whether a trainer escapes the knockout.
      const b=matchup(kind,true);b.submit(0,move(S.strong));b.submit(1,move(S.wait));const events=b.resolveTurn();
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
  check('Wild random, sequence, weighted, script and forced-skill behavior of both policies matches the recorded d7e87e9 decisions',()=>{
    const callbacks={fixed:{apply:()=>move(S.heal)},fallback:{apply:()=>undefined}};
    for(const [name,choose] of Object.entries(policies)){
      for(const [ai,expected] of ORACLE_POLICIES)for(const kind of ['wild','boss','trainer'])for(let seed=1;seed<=8;seed++){
        assert.equal(decisions(fixture({kind,ai,seed,scripts:callbacks}),3,choose),expected[seed-1],`${name}/${kind}/${JSON.stringify(ai)}/${seed}`);
      }
      for(const kind of ['wild','boss','trainer']){
        const b=fixture({kind});b.active(1).vol.forcedSkill=S.attack;
        assert.deepEqual(choose(b),move(S.attack),`${name}/${kind}/forced`);assert.equal(b.active(1).vol.forcedSkill,undefined);assert.equal(b.rng.draws,0);
      }
      const b=fixture({kind:'wild'});b.sides[1].ai=undefined;
      assert.equal(decisions(b,10,choose),ORACLE_DEFAULT_WILD,`${name}/default wild policy`);
    }
  });
  check('Legacy fallback randomness and skill-order ties remain seeded and preserve equipped order',()=>{
    for(const [name,choose] of Object.entries(policies))for(let seed=1;seed<=16;seed++){
      const b=fixture({seed,skills:[S.wait,S.heal]});b.active(1).skills.forEach(id=>b.active(1).usedSkills.add(id));
      assert.equal(decisions(b,1,choose),ORACLE_NO_DAMAGE[seed-1],`${name}/no-damage/${seed}`);
    }
    const b=fixture({skills:[S.strong,S.attack]});b.data.skills.get(S.strong).power=b.data.skills.get(S.attack).power;
    assert.deepEqual(decide(b),move(S.strong));
  });
  check('Historical live-hook evaluation remains part of Boss policy',()=>{
    const b=fixture(),calls={damage:0,priority:0};
    b.estimateDamage=(_user,_foe,skill)=>{calls.damage++;return skill.id===S.attack?1000:0;};
    b.priority=()=>{calls.priority++;return 0;};
    assert.deepEqual(decide(b),move(S.attack));assert.deepEqual(calls,{damage:2,priority:2});
  });
  check('Existing encounter choose_action scripts retain authority over generic Boss selection',()=>{
    const encounter=catalog.bosses.find(row=>row.id==='boss_spt_moduosa');assert(encounter);
    const b=bossBattle(encounter,0,123);b.active(0).types=['light'];b.submit(0,move(10001));const events=b.resolveTurn();
    assert(events.some(e=>e.type==='move_used'&&e.side===1&&e.skill===11470));
  });
  check('Existing weighted HP-phase Boss policy changes remain active',()=>{
    const encounter=catalog.bosses.find(row=>row.ai?.kind==='weighted');assert.equal(encounter?.id,'boss_spt_liaosi');assert(encounter.phases.length);
    for(const [name,choose] of Object.entries(policies)){
      const b=bossBattle(encounter,0,124);b.dealDamage(b.active(1),Math.floor(b.active(1).maxHp*.6),{kind:'true'});
      assert(b.active(1).ai||JSON.stringify(b.sides[1].ai)!==JSON.stringify(encounter.ai),'The HP phase must replace its policy');
      assert.equal(decisions(b,12,choose),ORACLE_HP_PHASE,name);
    }
  });
  // V58: real trainer encounters dispatch the search planner; it may draw once from the live RNG to mix.
  const serialWithoutRng=b=>JSON.stringify(b,(key,value)=>key==='rng'?undefined:value instanceof Map?[...value]:value instanceof Set?[...value]:value);
  check('Every fixed trainer and both generated facilities dispatch the search planner',()=>{
    const encounters=[...catalog.trainers.map(row=>createFacilityEncounter(catalog,'classic',new Rng(560),row.id)),...['random','elite'].map(id=>createFacilityEncounter(catalog,id,new Rng(561)))];
    assert.equal(encounters.length,12);
    for(const encounter of encounters)for(let lead=0;lead<encounter.team.length;lead++){
      const b=createBattle({data,scripts,seed:562,sides:[{kind:'player',team:[{species:6,level:100,skills:[10001]}]}],encounter});if(lead)b.switchIn(b.sides[1],lead);
      assert.equal(b.sides[1].kind,'trainer');const before=serialWithoutRng(b),actual=decide(b),record=lastSearchDecision(b,b.sides[1]);
      assert(record&&record.turn===b.turn+1,'decision recorded by the search planner');assert.deepEqual(actual,record.chosen);assert.equal(serialWithoutRng(b),before);
      facilityCases.push({encounter:encounter.id,facility:encounter.facility,member:lead,action:actual});
    }
  });
  const hashed=['battle/ai/src/ai.ts','battle/ai/src/legacy-ai.ts','battle/ai/src/idle-moves.ts','battle/core/src/engine/battle.ts'];
  const sourceHashes=Object.fromEntries(hashed.map(file=>[file,sha256File(file)]));
  t.finish({bosses:new Set(bossCases.map(row=>row.boss)).size,bossCases,facilityCases,sourceHashes,
    scope:'Boss decisions are held to a frozen copy of the d7e87e9 policy on current mechanics and encounter data, except where '+
      'expected-damage ranking or the no-damage fallback of 2026-10-19 refines it; both reproduce the decisions recorded from d7e87e9 on synthetic fixtures. '+
      'This verifies project-policy restoration, not official server AI or historical battle-engine equivalence.'});
});
