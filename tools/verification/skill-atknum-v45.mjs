/**
 * The AtkNum repair (design/notes/skill-atknum-audit-v45.md): `multi_hit` comes only from original effect 31, so the
 * group-fight target count no longer makes a single-target attack hit several times. Checks the catalog rule, the dealt
 * hits of real skills and the Boss AI's expected-damage ranking.
 */
import assert from 'node:assert/strict';
import {suite,withSsr} from './_harness.mjs';

/** The four audit examples: AtkNum 5/3/5/5, no effect 31, so one hit at the listed power. */
const SINGLE={10175:{power:120,effects:[{op:'status',target:'foe',status:'paralysis',chance:5}]},
  10961:{power:100,effects:[{op:'stat_stage',target:'foe',stats:{spd:-1},chance:10}]},11657:{power:105,effects:[]},13219:{power:110,effects:[]}};
/** Effect-31 skills: the fixed two-hit 错咬, 双鳍连打 and 贯火龙, and 千叶斩's 2-3 hits. */
const MULTI={10774:[2,2],10802:[2,2],10818:[2,2],10238:[2,3]};
const SEEDS=Array.from({length:24},(_,i)=>i+1);
/** A neutral normal-type body with HP no single move can take, so every hit lands and no knockout rule decides. */
const BODY=91,STATS={hp:20000,atk:200,def:200,spa:200,spd:200,spe:200};
/** Reference powers around power × mean hits: the AI must prefer the skill to the lower and the higher to the skill. */
const BELOW=0.8,ABOVE=1.25;

const t=suite('skill-atknum-v45'),{check}=t;
await withSsr('skill-atknum-v45',async load=>{
  const [{loadCatalog},{createBattle},{buildDataSet},{chooseAiAction}]=await Promise.all([
    '/src/domain/catalog/catalog.ts','/tools/verification/_battle.ts','/battle/core/src/data.ts','/battle/ai/src/ai.ts',
  ].map(load));
  const catalog=await loadCatalog(),skills=new Map(catalog.skills.map(skill=>[skill.id,skill]));
  const hitOps=skill=>(skill.effects??[]).filter(op=>op.op==='multi_hit');
  const member=ids=>({species:BODY,level:100,skills:ids,stats:{...STATS}});

  check('Every multi_hit op is an original effect 31 with the same range, and every effect 31 has one',()=>{
    let count=0;
    for(const skill of catalog.skills){
      const source=(skill.seer_effects??[]).filter(row=>row.eff===31),ops=hitOps(skill);
      assert.deepEqual(ops.map(op=>[op.min,op.max]),source.map(row=>row.args),`${skill.id} ${skill.name.zh}`);
      count+=ops.length;
    }
    t.witness('multiHitSkills',count);
  });
  check('The four audit examples keep power, accuracy and effects without a hit count',()=>{
    for(const [id,expected] of Object.entries(SINGLE)){
      const skill=skills.get(Number(id));
      assert.equal(skill.power,expected.power,id);assert.deepEqual(skill.effects,expected.effects,id);
    }
    assert.equal(skills.get(11657).accuracy,95);
  });

  /** Attack hits on side 1 from one use of `id` by side 0, per seed. */
  function dealtHits(id,seed){
    const b=createBattle({data:buildDataSet(catalog),seed,sides:[{kind:'player',team:[member([id])]},{kind:'player',team:[member([10001])]}]});
    b.active(0).stages.acc=6;b.active(0).stats.spe=STATS.spe*2;
    b.submit(0,{kind:'move',skill:id});b.submit(1,{kind:'move',skill:10001});
    const events=b.resolveTurn(),used=events.findIndex(e=>e.type==='move_used'&&e.side===0);
    const after=events.slice(used+1),end=after.findIndex(e=>e.type==='move_used');
    return (end<0?after:after.slice(0,end)).filter(e=>e.type==='damage'&&e.side===1&&e.kind==='attack');
  }
  check('Dealt damage: the audit examples hit once, the effect-31 skills hit within their range',()=>{
    const seen={};
    for(const [id,[min,max]] of [...Object.keys(SINGLE).map(id=>[id,[1,1]]),...Object.entries(MULTI)]){
      const counts=new Set();
      for(const seed of SEEDS){
        const hits=dealtHits(Number(id),seed);
        assert(hits.length>=min&&hits.length<=max,`${id} seed ${seed}: ${hits.length} hits`);
        assert(hits.every(e=>e.amount>0),`${id} seed ${seed}: positive damage`);
        counts.add(hits.length);
      }
      assert.deepEqual([...counts].sort(),Array.from({length:max-min+1},(_,i)=>min+i),`${id}: every count in range is drawn`);
      seen[id]=[...counts].sort();
    }
    t.witness('hitCounts',seen);
  });

  /** The Boss AI's pick between `skill` and a plain copy of it at `power`, against a foe it cannot knock out. */
  function bossPick(skill,power){
    const reference={...structuredClone(skill),id:990000+skill.id,name:{zh:'Reference'},power,effects:[],seer_effects:[]};
    const data=buildDataSet({...catalog,skills:[...catalog.skills,reference]});
    const b=createBattle({data,seed:45,sides:[{kind:'player',team:[member([10001])]},{kind:'boss',team:[member([skill.id,reference.id])],ai:{kind:'smart'}}]});
    assert(b.estimateDamage(b.active(1),b.active(0),skill)>0,`${skill.id} hurts the foe`);
    const action=chooseAiAction(b,b.sides[1]);
    assert.equal(action.kind,'move');
    return action.skill===skill.id?'skill':'reference';
  }
  check('AI estimates: the Boss ranks each skill at its power times its mean hit count',()=>{
    const ranges={...Object.fromEntries(Object.keys(SINGLE).map(id=>[id,[1,1]])),...MULTI};
    for(const [id,[min,max]] of Object.entries(ranges)){
      const skill=skills.get(Number(id)),nominal=skill.power*(min+max)/2;
      assert.equal(bossPick(skill,Math.round(nominal*BELOW)),'skill',`${id} over ${BELOW} × power × mean hits`);
      assert.equal(bossPick(skill,Math.round(nominal*ABOVE)),'reference',`${id} under ${ABOVE} × power × mean hits`);
    }
  });
  check('Boss 雷伊 now leads with 瞬雷天闪, its strongest single hit, instead of a five-hit 极电千鸟',()=>{
    const rei=catalog.bosses.find(row=>row.id==='boss_rei');
    const b=createBattle({data:buildDataSet(catalog),seed:45,sides:[{kind:'player',team:[member([10001])]}],encounter:structuredClone(rei)});
    assert.deepEqual(b.active(1).skills,[10176,10175,20087,10170]);
    // Among its attacks: with its status move spent, no status chance is drawn.
    b.active(1).pp[20087]=0;
    assert.deepEqual(chooseAiAction(b,b.sides[1]),{kind:'move',skill:10176});
  });
  t.finish();
});
