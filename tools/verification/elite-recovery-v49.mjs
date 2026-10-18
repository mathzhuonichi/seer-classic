/** Elite recovery policy and private-own engraving awareness through the public facility API. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root,sha256File,suite,withSsr} from './_harness.mjs';

const snapshot=b=>JSON.stringify(b,(_key,value)=>value instanceof Map?[...value]:value instanceof Set?[...value]:value);
await withSsr('elite-recovery-v49',async load=>{
  const t=suite('elite-recovery-v49'),{check}=t,replacements=[],witnesses=[];
  const [{loadCatalog},facilities,{trainerSkillOrigin},{createBattle},{buildDataSet,Rng},{chooseAiAction},{SEER_SCRIPTS},{engravings,engraveSkill},{normalizeBattleSupplyItems}]=await Promise.all([
    '/src/domain/catalog/catalog.ts','/src/domain/challenges/battle-facilities.ts','/src/domain/challenges/trainer-skills.ts','/tools/verification/_battle.ts','/battle/core/src/index.ts','/battle/ai/src/ai.ts','/battle/core/src/scripts/index.ts','/src/domain/engravings/engravings.ts','/src/domain/battle-supplies.ts',
  ].map(load));
  const catalog=await loadCatalog(),catalogBefore=JSON.stringify(catalog),sm=new Map(catalog.skills.map(s=>[s.id,s])),pool=facilities.eliteFacilityPool(catalog),data=buildDataSet(catalog);
  // Independently pinned current recovery-only IDs. Combined benefit moves are not included.
  const recoveryIds=new Set([20309,20607,20009,20590,20027,20116,21373,20034]);
  const expected={261:[20309,10714],300:[20607,20499],303:[20009,20503],573:[20590,20712],579:[20590,20721],912:[20027,21126],927:[20116,10254],1120:[21373,21375],1121:[21373,21375],1428:[20034,20462]};
  const generate=sp=>facilities.createFacilityEncounter({...catalog,species:[sp,...pool.filter(s=>s.id!==sp.id).slice(0,5)]},'elite',new Rng(49)).team.find(m=>m.species===sp.id);
  check('All 124 elite forms keep four legal moves and no recovery-only slot; the ten V49 replacements hold',()=>{
    assert.equal(pool.length,124);
    for(const sp of pool){const build=generate(sp);assert.equal(build.skills.length,4);assert.equal(new Set(build.skills).size,4);assert(build.skills.every(id=>trainerSkillOrigin(catalog,sp.id,id)));assert(build.skills.every(id=>!recoveryIds.has(id)),`${sp.id} keeps a recovery-only move`);
      if(expected[sp.id]){const [removed,added]=expected[sp.id];assert(build.skills.includes(added)&&!build.skills.includes(removed),`${sp.id} replacement`);replacements.push({species:sp.id,name:sp.name.zh,removed:{id:removed,name:sm.get(removed).name.zh},added:{id:added,name:sm.get(added).name.zh},skills:build.skills});}
    }
    assert.equal(replacements.length,10);
  });
  check('Drain attacks, continuous recovery and recovery with cleansing or setup remain eligible',()=>{
    for(const id of [11937,12834,13021,20291,20400,21468])assert(facilities.eliteSkillEligible(sm.get(id)),`${id} retained`);
    for(const id of recoveryIds)assert(!facilities.eliteSkillEligible(sm.get(id)),`${id} excluded`);
    assert(facilities.eliteSkillEligible(sm.get(10254)),'Dino coverage is original effect-31 2-3 hit');
  });
  check('The current Synthesis executes both source effects; the audit does not silently rewrite either',()=>{
    const b=createBattle({data,scripts:SEER_SCRIPTS,seed:49,sides:[{kind:'player',team:[{species:3,level:100,skills:[20009],hp:1,stats:{hp:394,atk:100,def:100,spa:100,spd:100,spe:300}}]},{kind:'trainer',team:[{species:1,level:100,skills:[20001]}]}]});
    b.submit(0,{kind:'move',skill:20009});b.submit(1,{kind:'move',skill:20001});const events=b.resolveTurn(),heals=events.filter(e=>e.type==='heal'&&e.side===0);
    assert.deepEqual(heals.map(e=>e.amount),[197,131]);assert.equal(b.active(0).hp,329);assert.deepEqual(sm.get(20009).effects,[{op:'heal',target:'self',pct_max_hp:50},{op:'script',id:'seer_eff_201',params:[0,3]}]);
    witnesses.push({case:'Current Synthesis at 394 maximum HP',initialHp:1,heals:heals.map(e=>e.amount),finalHp:b.active(0).hp,historicalRuleVerified:false});
  });

  const HP='item_potion_hp_250',base={hp:100,atk:100,def:100,spa:100,spd:100,spe:100};
  const hit=(id,power,extra={})=>({id,name:{zh:`Recovery fixture ${id}`},type:'normal',category:'physical',power,accuracy:100,pp:20,priority:0,effects:[],...extra});
  const ids={a:990490,b:990491,heal:990492,incoming:990493,wait:990494,pp:990495};
  const fixtureSkills=[hit(ids.a,90),hit(ids.b,100),hit(ids.heal,0,{category:'status',target:'self',accuracy:null,effects:[{op:'heal',target:'self',pct_max_hp:50}]}),hit(ids.incoming,0,{accuracy:null,effects:[{op:'fixed_damage',amount:80}]}),hit(ids.wait,0,{category:'status',target:'self',accuracy:null}),hit(ids.pp,0,{category:'status',target:'self',accuracy:null,effects:[{op:'restore_pp',amount:2}]})];
  const fixtureData=buildDataSet({species:[{id:1,name:{zh:'Recovery fixture'},types:['normal'],base}],types:{chart:{normal:{normal:1}}},skills:fixtureSkills,items:normalizeBattleSupplyItems(JSON.parse(fs.readFileSync(path.join(root,'data/items.json'),'utf8')))});
  const fixture=({ownSkills=[ids.a,ids.b],overrides,hp=400,maxHp=400,speed=120,supplies=[],kind='trainer',rules=[],foeRules=[],foeHp=400,foeSpeed=112}={})=>{const b=createBattle({data:fixtureData,scripts:SEER_SCRIPTS,seed:49,sides:[{kind:'trainer',team:[{species:1,level:50,iv:15,skills:[ids.incoming,ids.wait],hp:foeHp,stats:{hp:400,atk:112,def:112,spa:112,spd:112,spe:foeSpeed}}],rules:foeRules},{kind,ai:{kind:'smart'},rules,unlimited_items:supplies,team:[{species:1,level:50,iv:15,skills:ownSkills,skill_overrides:overrides,hp,stats:{hp:maxHp,atk:112,def:112,spa:112,spd:112,spe:speed}}]}]});b.log.push({type:'move_used',side:0,skill:ids.incoming});return b;};
  const choice=b=>chooseAiAction(b,b.sides[1]);
  const turn=(b,a,foe={kind:'move',skill:ids.wait})=>{b.submit(0,foe);b.submit(1,a);return b.resolveTurn();};
  check('A private own power bonus changes the chosen move',()=>{
    assert.equal(choice(fixture()).skill,ids.b);const override={...fixtureSkills[0],power_bonus:30};const b=fixture({overrides:{[ids.a]:override}});assert.equal(choice(b).skill,ids.a);
  });
  check('Own priority and accuracy engravings affect actual action choice without changing the catalog',()=>{
    const faster=fixture({hp:30,speed:100,foeHp:60,overrides:{[ids.a]:{...fixtureSkills[0],priority:1}}});assert.equal(choice(faster).skill,ids.a);const ev=turn(faster,choice(faster),{kind:'move',skill:ids.incoming});assert.equal(ev.find(e=>e.type==='move_used').side,1);
    const inaccurate={...fixtureSkills[0],power:180,accuracy:30};assert.equal(choice(fixture({overrides:{[ids.a]:inaccurate}})).skill,ids.b);assert.equal(choice(fixture({overrides:{[ids.a]:{...inaccurate,accuracy:null}}})).skill,ids.a);
    assert.equal(fixtureData.skills.get(ids.a).priority,0);assert.equal(fixtureData.skills.get(ids.a).power_bonus,undefined);
  });
  check('Own overridden secondary effects, PP cap and two-PP cost remain visible and executable',()=>{
    const override={...fixtureSkills[0],category:'status',target:'self',power:0,accuracy:null,pp:30,pp_cost:2,effects:[{op:'stat_stage',target:'self',stats:{atk:2}}]};const b=fixture({overrides:{[ids.a]:override}});assert.equal(choice(b).skill,ids.a);assert.equal(b.active(1).maxPp[ids.a],30);
    b.active(1).pp[ids.a]=1;turn(b,{kind:'move',skill:ids.a});assert.equal(b.active(1).pp[ids.a],0);assert.equal(b.active(1).stages.atk,2);
  });
  check('Every one of 399 real skill engraving overrides yields a legal trainer decision through its own monster',()=>{
    let total=0;for(const def of engravings.filter(e=>e.slot==='skill')){const id=def.moveIds.find(id=>engraveSkill(sm.get(id),def)),override=engraveSkill(sm.get(id),def);const b=createBattle({data,scripts:SEER_SCRIPTS,seed:49,sides:[{kind:'player',team:[{species:1,level:100,skills:[10001]}]},{kind:'trainer',ai:{kind:'smart'},team:[{species:1,level:100,skills:[id],skill_overrides:{[id]:override}}]}]});
      const a=choice(b);assert(b.legalActions(1).some(legal=>JSON.stringify(a)===JSON.stringify(legal)));assert.equal(b.active(1).maxPp[id],override.pp);total++;
    }assert.equal(total,399);witnesses.push({case:'All installed skill engraving overrides inspected',count:total});
  });
  check('Unlimited legal medicine is preferred over a weaker direct heal and occupies the actual turn',()=>{
    const b=fixture({ownSkills:[ids.heal,ids.a],hp:30,supplies:[HP]});const action=choice(b);assert.equal(action.kind,'item');assert.equal(action.item,HP);const ev=turn(b,action,{kind:'move',skill:ids.incoming});assert(ev.some(e=>e.type==='item_used'&&e.side===1));assert(!ev.some(e=>e.type==='move_used'&&e.side===1));assert.equal(b.active(1).hp,200);
  });
  check('A recovery-only loadout retains a legal action when medicine cannot create useful progress',()=>{
    const b=fixture({ownSkills:[ids.heal],hp:30,supplies:[HP]});const a=choice(b);assert(b.legalActions(1).some(legal=>JSON.stringify(a)===JSON.stringify(legal)));assert.notEqual(a.skill,-1);
  });
  check('Own engraving planning is read-only and unaffected by private opposing overrides, loadout or pending input',()=>{
    // The search planner may draw once from the live RNG to mix; each repeat starts from the same RNG state.
    const b=fixture({overrides:{[ids.a]:{...fixtureSkills[0],power_bonus:30}},supplies:[HP],hp:30}),before=snapshot(b),random=[...b.rng.s],draws=b.rng.draws,rewind=()=>{b.rng.s=[...random];b.rng.draws=draws;},expected=choice(b);rewind();assert.deepEqual(choice(b),expected);rewind();assert.equal(snapshot(b),before);
    const foe=b.active(0);foe.skillOverrides={[ids.incoming]:{...fixtureSkills[3],effects:[{op:'fixed_damage',amount:400}]}};foe.stats={...foe.stats,atk:9999,def:1,spa:9999,spd:1,spe:9999};foe.skills=[ids.b];foe.pp={[ids.b]:1};foe.maxPp={[ids.b]:1};foe.usedSkills=new Set([ids.b]);foe.skillUses={[ids.b]:9};
    Object.assign(b.sides[0],{pending:{kind:'move',skill:ids.b},items:{[HP]:99},unlimitedItems:new Set([HP])});rewind();assert.deepEqual(choice(b),expected);
  });
  check('The catalog is unchanged',()=>assert.equal(JSON.stringify(catalog),catalogBefore));
  t.finish({replacements,witnesses,sourceHashes:Object.fromEntries(['src/domain/challenges/battle-facilities.ts','data/elite-roster.json'].map(file=>[file,sha256File(file)]))});
});
