/** Per-individual passive ownership, switching, fainting, and narrowly scoped team gifts. */
import assert from 'node:assert/strict';
import {sha256File,suite,withSsr} from './_harness.mjs';

const report={traitStructure:[],effectWitnesses:[],scope:{allDefinitions:'Every retained trait definition is attached to two distinct same-species individuals, with a third unassigned individual; condition identity, switches, return, and fainting are checked.',functional:'Selected hook families and both Gaia seals receive dynamic engine checks. Probability branches are explicitly forced only where stated. This is not exhaustive validation of all effects, rates, type matchups or every trait combination.'}};
await withSsr('holder-ownership-v47',async load=>{
  const t=suite('holder-ownership-v47'),{check}=t;
  const [{loadCatalog},{normalizeNpcTrainingEncounter:normalize},{npcTrainingScripts},{traits,traitScripts},{createBattle},{buildDataSet},{SEER_SCRIPTS}]=await Promise.all([
    '/src/domain/catalog/catalog.ts','/src/domain/challenges/npc-training.ts','/src/domain/challenges/npc-training-scripts.ts','/src/domain/traits.ts','/tools/verification/_battle.ts','/battle/core/src/index.ts','/battle/core/src/scripts/index.ts',
  ].map(load));
  const catalog=await loadCatalog(),catalogBefore=JSON.stringify(catalog),traitsBefore=JSON.stringify(traits);
  const WAIT=990480,PHYSICAL=990481,SPECIAL=990482,NEUTRAL=990483;
  const fixtureSkills=[
    {id:WAIT,name:{zh:'Ownership audit wait'},type:'normal',category:'status',target:'self',power:0,accuracy:null,pp:99,effects:[]},
    {id:PHYSICAL,name:{zh:'Ownership audit physical attack'},type:'normal',category:'physical',power:30,accuracy:null,pp:99,effects:[]},
    {id:SPECIAL,name:{zh:'Ownership audit special attack'},type:'normal',category:'special',power:30,accuracy:null,pp:99,effects:[]},
  ];
  const data=buildDataSet({...catalog,skills:[...catalog.skills,...fixtureSkills],species:[...catalog.species,{id:NEUTRAL,name:{zh:'Ownership audit neutral target'},types:['normal'],base:{hp:200,atk:100,def:100,spa:100,spd:100,spe:50}}]});
  const scripts={...SEER_SCRIPTS,...traitScripts,...npcTrainingScripts};
  const member=(species=261,extra={})=>({species,level:100,iv:31,nature:'hardy',skills:[PHYSICAL,SPECIAL,WAIT],...extra});
  const plain=()=>createBattle({data,scripts,seed:73,sides:[{kind:'player',team:[member(NEUTRAL,{hp_override:20000}),member(NEUTRAL,{hp_override:20000}),member(NEUTRAL,{hp_override:20000})]},{kind:'trainer',team:[member(NEUTRAL,{hp_override:20000})],ai:{kind:'sequence',skills:[WAIT]}}]});
  // Match the controller's UID-resolved attachment shape without changing game.ts.
  const attach=(b,mon,id)=>{
    const trait=traits.find(row=>row.id===id);assert(trait);
    const condition={id:`trait-${id}`,def:{id:`trait-${id}`,name:{zh:trait.name},kind:'buff',removed_on_switch:false,hooks:trait.hooks},turns:Infinity,appliedTurn:0};
    mon.conditions.push(condition);return condition;
  };
  const npc=(profile='gaia-evil-seal',extra=[])=>{
    const team=[member(261,{training_profile:profile}),...extra];
    const encounter=normalize(catalog,{id:'holder-ownership-audit',category:'trainer',facility:'elite',team,rules:[],phases:[],reward:{items:{}},ai:{kind:'smart',allow_switch:false}});
    return createBattle({data,scripts,seed:73,sides:[{kind:'player',team:[member(NEUTRAL,{hp_override:20000})]}],encounter});
  };
  const move=(b,id=PHYSICAL,foe=WAIT)=>{b.submit(0,{kind:'move',skill:foe});b.submit(1,{kind:'move',skill:id});return b.resolveTurn();};
  const swap=(b,slot)=>{b.submit(0,{kind:'move',skill:WAIT});b.submit(1,{kind:'switch',slot});return b.resolveTurn();};
  const sealIds=mon=>mon.conditions.filter(c=>c.id.startsWith('npc_gaia_')).map(c=>c.id);
  const fixedHits=events=>events.filter(e=>e.type==='damage'&&e.side===0&&e.kind==='fixed');
  const direct=(b,source,target,skill=PHYSICAL,amount=100)=>b.dealDamage(target,amount,{kind:'attack',source,skill:data.skills.get(skill)});

  check('All 48 trait definitions keep separate condition instances across switches, return and fainting',()=>{
    assert.equal(traits.length,48);
    for(const trait of traits){
      const b=plain(),[owner,unassigned,otherOwner]=b.sides[0].team;
      const first=attach(b,owner,trait.id),second=attach(b,otherOwner,trait.id);
      assert.notEqual(first,second);first.data={auditOwner:0};second.data={auditOwner:2};
      b.switchIn(b.sides[0],1);assert(!unassigned.conditions.some(c=>c.id===first.id));
      for(const point of new Set(trait.hooks.map(h=>h.on)))assert(!b.hooksWithCond(unassigned,point).some(row=>row.cond.id===first.id));
      assert(owner.conditions.includes(first));assert(otherOwner.conditions.includes(second));
      b.switchIn(b.sides[0],0);assert(owner.conditions.includes(first));assert.equal(first.data.auditOwner,0);assert.equal(second.data.auditOwner,2);
      b.dealDamage(owner,owner.hp,{kind:'true'});assert(owner.fainted);assert.equal(owner.conditions.length,0);assert(otherOwner.conditions.includes(second));assert.equal(unassigned.conditions.length,0);
      report.traitStructure.push({id:trait.id,name:trait.name,effectId:trait.raw.Eid,implemented:trait.implemented,hookPoints:trait.hooks.map(h=>h.on),separateInstances:true,switchReturn:true,faintIsolated:true});
    }
  });
  check('Two same-species Gaias have independent seals and only the actual holder gets fixed damage',()=>{
    const b=npc('gaia-evil-seal',[member(261)]),[holder,ordinary]=b.sides[1].team;
    assert.deepEqual(sealIds(holder),['npc_gaia_evil_seal']);assert.deepEqual(sealIds(ordinary),[]);
    assert.deepEqual(fixedHits(move(b)).map(e=>e.amount),[30]);
    swap(b,1);assert.deepEqual(fixedHits(move(b)),[]);assert.deepEqual(sealIds(ordinary),[]);
    swap(b,0);assert.deepEqual(fixedHits(move(b)).map(e=>e.amount),[30]);assert.deepEqual(sealIds(holder),['npc_gaia_evil_seal']);
    report.effectWitnesses.push({mechanic:'Gaia evil seal',holderSlot:0,sameSpeciesUnassignedSlot:1,fixedDamageByTurn:[30,0,30]});
  });
  check('The blood seal heals only its active holder and stays dormant while that holder is benched',()=>{
    const b=npc('gaia-blood-seal',[member(261)]),[holder,ordinary]=b.sides[1].team;
    holder.hp-=100;ordinary.hp-=100;const unit=Math.floor(holder.maxHp*.05),initial=holder.hp;
    move(b,WAIT);assert.equal(holder.hp,initial+unit);assert.equal(ordinary.hp,ordinary.maxHp-100);
    swap(b,1);move(b,WAIT);assert.equal(holder.hp,initial+unit);assert.equal(ordinary.hp,ordinary.maxHp-100);
    swap(b,0);assert.equal(holder.hp,initial+unit*2);assert.deepEqual(sealIds(ordinary),[]);
  });
  check('Inheritance transfers only speed and accuracy, after switching away from a sealed Gaia',()=>{
    const b=npc('gaia-evil-seal',[member(599,{skills:[20749,PHYSICAL,WAIT]}),member(261)]),[sealed,donor,recipient]=b.sides[1].team;
    b.sides[1].ai.allow_switch=true;
    sealed.hp=1;attach(b,donor,'1061');donor.stages.atk=6;donor.stages.spa=6;
    swap(b,1);const events=move(b,20749);assert(donor.fainted);assert.equal(donor.conditions.length,0);assert.equal(b.sides[1].active,2);
    assert.deepEqual(recipient.stages,{atk:0,def:0,spa:0,spd:0,spe:1,acc:1,eva:0});
    assert.deepEqual(sealIds(recipient),[]);assert(!recipient.conditions.some(c=>c.id.startsWith('trait-')));assert(b.sides[1].team.every(m=>!m.conditions.some(c=>c.id==='seer_eff_59')));
    assert.deepEqual(fixedHits(events),[]);assert.deepEqual(fixedHits(move(b)),[]);
    assert.deepEqual(sealIds(sealed),['npc_gaia_evil_seal']);swap(b,0);assert.deepEqual(fixedHits(move(b)).map(e=>e.amount),[30]);
    report.effectWitnesses.push({mechanic:'Inheritance after a sealed teammate switches out',donor:599,recipient:261,recipientSlot:2,stages:{spe:1,acc:1},inheritedTraits:[]});
  });
  check('Sacrifice shares exactly its critical-charge pool, without sharing the earlier Gaia seal or donor trait',()=>{
    const b=npc('gaia-evil-seal',[member(356,{skills:[20398,PHYSICAL,WAIT]}),member(261)]),[sealed,donor,recipient]=b.sides[1].team;
    b.sides[1].ai.allow_switch=true;
    sealed.hp=1;attach(b,donor,'1061');swap(b,1);move(b,20398);assert(donor.fainted);assert.equal(donor.conditions.length,0);assert.equal(b.sides[1].active,2);
    const a=sealed.conditions.find(c=>c.id==='seer_eff_71'),z=recipient.conditions.find(c=>c.id==='seer_eff_71');
    assert(a&&z);assert.notEqual(a,z);assert.equal(a.data.pool,z.data.pool);assert.equal(a.data.pool.left,2);
    assert.deepEqual(sealIds(recipient),[]);assert(!recipient.conditions.some(c=>c.id.startsWith('trait-')));
    const first=move(b);assert(first.some(e=>e.type==='damage'&&e.side===0&&e.kind==='attack'&&e.crit));assert.deepEqual(fixedHits(first),[]);assert.equal(a.data.pool.left,1);
    swap(b,0);const second=move(b);assert(second.some(e=>e.type==='damage'&&e.side===0&&e.kind==='attack'&&e.crit));assert.deepEqual(fixedHits(second).map(e=>e.amount),[30]);
    assert(b.sides[1].team.every(m=>!m.conditions.some(c=>c.id==='seer_eff_71')));assert.deepEqual(sealIds(sealed),['npc_gaia_evil_seal']);
  });
  check('Fainting clears the holder, and its replacement gains neither a seal nor its trait',()=>{
    const b=npc('gaia-evil-seal',[member(261)]),[holder,recipient]=b.sides[1].team;attach(b,holder,'1061');
    b.dealDamage(holder,holder.hp,{kind:'true'});assert(holder.fainted);assert.equal(holder.conditions.length,0);
    b.switchIn(b.sides[1],1);assert.deepEqual(sealIds(recipient),[]);assert(!recipient.conditions.some(c=>c.id.startsWith('trait-')));assert.deepEqual(fixedHits(move(b)),[]);
  });
  check('Energy-bead stats and attack/defense hooks remain attached to the equipped individual',()=>{
    const bead={stats:{atk:20,hp:30},damage_dealt_multiplier:1.2,damage_taken_multiplier:.8,crit_rate_add:1};
    const b=createBattle({data,scripts,seed:1,sides:[{kind:'player',team:[member(NEUTRAL,{beads:[bead]}),member(NEUTRAL),member(NEUTRAL,{beads:[bead]})]},{kind:'trainer',team:[member(NEUTRAL,{hp_override:20000})]}]});
    const [owner,ordinary,otherOwner]=b.sides[0].team,foe=b.active(1);assert.equal(owner.stats.atk,ordinary.stats.atk+20);assert.equal(owner.maxHp,ordinary.maxHp+30);assert.equal(otherOwner.stats.atk,owner.stats.atk);
    const first=owner.conditions.find(c=>c.id==='energy_bead'),second=otherOwner.conditions.find(c=>c.id==='energy_bead');assert.notEqual(first,second);assert.notEqual(first.def,second.def);assert.notEqual(first.def.hooks,second.def.hooks);
    assert.equal(direct(b,owner,foe),120);assert.equal(direct(b,foe,owner),80);
    b.switchIn(b.sides[0],1);assert.equal(direct(b,ordinary,foe),100);assert.equal(direct(b,foe,ordinary),100);assert(!ordinary.conditions.some(c=>c.id==='energy_bead'));
    b.switchIn(b.sides[0],0);assert.equal(direct(b,owner,foe),120);assert.equal(direct(b,foe,owner),80);assert.equal(b.hooks(owner,'modify_crit_rate')[0].add,1);assert.equal(b.hooks(ordinary,'modify_crit_rate').length,0);
    report.effectWitnesses.push({mechanic:'Energy bead',ownerOutgoing:120,unassignedOutgoing:100,ownerIncoming:80,unassignedIncoming:100});
  });
  check('Typed/category attack boosts and final damage reduction affect the holder only',()=>{
    for(const [id,skill,expected] of [['1013',PHYSICAL,105],['1065',PHYSICAL,103],['1066',SPECIAL,103]]){
      const b=plain(),[owner,ordinary]=b.sides[0].team,foe=b.active(1);attach(b,owner,id);
      assert.equal(direct(b,owner,foe,skill),expected,id);b.switchIn(b.sides[0],1);assert.equal(direct(b,ordinary,foe,skill),100,id);b.switchIn(b.sides[0],0);assert.equal(direct(b,owner,foe,skill),expected,id);
    }
    const b=plain(),[owner,ordinary]=b.sides[0].team,foe=b.active(1);attach(b,owner,'1024');assert.equal(direct(b,foe,owner),95);b.switchIn(b.sides[0],1);assert.equal(direct(b,foe,ordinary),100);
    report.effectWitnesses.push({mechanic:'Representative deterministic traits',ids:['1013','1065','1066','1024'],ownership:true});
  });
  check('Accuracy, evasion, critical chance, and critical resistance hooks are local to the holder',()=>{
    for(const [id,point] of [['1022','modify_accuracy'],['1025','modify_accuracy_taken'],['1023','modify_crit_rate'],['1063','modify_crit_rate_taken']]){
      const b=plain(),[owner,ordinary]=b.sides[0].team;attach(b,owner,id);assert.equal(b.hooksWithCond(owner,point).length,1);
      b.switchIn(b.sides[0],1);assert.equal(b.hooksWithCond(ordinary,point).length,0);b.switchIn(b.sides[0],0);assert.equal(b.hooksWithCond(owner,point).length,1);
      if(id==='1063'){assert.deepEqual(b.fire(owner,point,{rate:1,source:b.active(1),skill:data.skills.get(PHYSICAL)}),[{add:-1}]);assert.deepEqual(b.fire(ordinary,point,{rate:1,source:b.active(1),skill:data.skills.get(PHYSICAL)}),[]);}
    }
    report.effectWitnesses.push({mechanic:'Accuracy/critical hook ownership',ids:['1022','1025','1023','1063'],scope:'Hook enumeration, plus actual scripted critical-resistance dispatch; not a statistical rate test.'});
  });
  check('Forced-probability on-hurt traits use the hit holder, not its teammate',()=>{
    for(const [id,expected] of [['1029','paralysis'],['1031','burn'],['1032','freeze'],['1033','fear']]){
      const b=plain(),[owner,ordinary]=b.sides[0].team,foe=b.active(1);attach(b,owner,id);b.rng.chance=()=>true;
      direct(b,foe,owner);assert(foe.conditions.some(c=>c.id===expected),id);b.removeCondition(foe,expected);
      b.switchIn(b.sides[0],1);direct(b,foe,ordinary);assert(!foe.conditions.some(c=>c.id===expected),id);assert(!ordinary.conditions.some(c=>c.id.startsWith('trait-')));
    }
    for(const [id,stat,target] of [['1035','atk','source'],['1041','atk','holder']]){
      const b=plain(),[owner,ordinary]=b.sides[0].team,foe=b.active(1);attach(b,owner,id);b.rng.chance=()=>true;direct(b,foe,owner,SPECIAL);
      assert.equal((target==='source'?foe:owner).stages[stat],target==='source'?-1:1);foe.stages.atk=0;b.switchIn(b.sides[0],1);direct(b,foe,ordinary,SPECIAL);assert.equal(foe.stages.atk,0);assert.equal(ordinary.stages.atk,0);
    }
    report.effectWitnesses.push({mechanic:'Representative on-hurt triggers',ids:['1029','1031','1032','1033','1035','1041'],probability:'Forced true to isolate ownership; rates not measured.'});
  });
  check('Forced-probability outgoing and recovery traits cannot benefit an unassigned attacker or target',()=>{
    for(const [id,skill] of [['1061',PHYSICAL],['1062',SPECIAL]]){
      const b=plain(),[owner,ordinary]=b.sides[0].team,foe=b.active(1);attach(b,owner,id);b.rng.chance=()=>true;
      assert.equal(direct(b,owner,foe,skill),135,id);b.switchIn(b.sides[0],1);assert.equal(direct(b,ordinary,foe,skill),100,id);
    }
    const b=plain(),[owner,ordinary]=b.sides[0].team,foe=b.active(1);attach(b,owner,'1028');b.rng.chance=()=>true;owner.hp=owner.maxHp/8;ordinary.hp=ordinary.maxHp/8;
    direct(b,foe,owner);assert.equal(owner.hp,owner.maxHp);b.switchIn(b.sides[0],1);const hp=ordinary.hp;direct(b,foe,ordinary);assert.equal(ordinary.hp,hp-100);
    report.effectWitnesses.push({mechanic:'Representative outgoing/recovery triggers',ids:['1061','1062','1028'],probability:'Forced true to isolate ownership; rates not measured.'});
  });
  check('On-hit status effects follow the actual attacker after a switch',()=>{
    for(const [id,skill,status] of [['1067',SPECIAL,'burn'],['1068',SPECIAL,'freeze'],['1069',PHYSICAL,'fear'],['1070',PHYSICAL,'paralysis']]){
      const b=plain(),[owner,ordinary]=b.sides[0].team,foe=b.active(1);attach(b,owner,id);b.rng.chance=()=>true;
      b.useMove(owner,foe,data.skills.get(skill),true);assert(foe.conditions.some(c=>c.id===status),id);b.removeCondition(foe,status);
      b.switchIn(b.sides[0],1);b.useMove(ordinary,foe,data.skills.get(skill),true);assert(!foe.conditions.some(c=>c.id===status),id);
    }
    report.effectWitnesses.push({mechanic:'On-hit status triggers',ids:['1067','1068','1069','1070'],probability:'Forced true to isolate ownership; rates not measured.'});
  });
  check('Catalog and trait definitions are unchanged by all ownership scenarios',()=>{assert.equal(JSON.stringify(catalog),catalogBefore);assert.equal(JSON.stringify(traits),traitsBefore);});
  report.sourceHashes=Object.fromEntries(['src/domain/traits.ts','src/domain/challenges/npc-training-scripts.ts','src/domain/challenges/npc-training.ts','battle/core/src/engine/battle.ts','battle/core/src/scripts/seer-main.ts','battle/core/src/scripts/seer-tail.ts','src/kernel/game.ts'].map(path=>[path,sha256File(path)]));
  t.finish(report);
});
