/** Source-pinned NPC ability training, encounter boundaries, and owner-only passives. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';

const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}});
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error'});
const checks=[],failures=[];
const check=(name,run)=>{try{run();checks.push(name);}catch(error){failures.push({name,error:String(error.stack)});console.error(`FAIL ${name}: ${error.message}`);}};
const keys=['hp','atk','def','spa','spd','spe'];
try {
  const [{loadCatalog},{normalizeNpcTrainingEncounter:normalize,npcTrainingProfileView:view},{npcTrainingScripts},{createFacilityEncounter,facilityPool},{createBattle,buildDataSet,Rng},{SEER_SCRIPTS},{computeStats}]=await Promise.all([
    '/src/mechanics/catalog.ts','/src/progression/npc-training.ts','/src/mechanics/npc-training.ts','/src/progression/battle-facilities.ts','/battle/core/src/index.ts','/battle/core/src/scripts/index.ts','/battle/core/src/stats.ts',
  ].map(path=>server.ssrLoadModule(path)));
  const catalog=await loadCatalog(),before=JSON.stringify(catalog),profileData=JSON.parse(fs.readFileSync('data/npc-training-profiles.json','utf8'));
  const core=catalog.trainers.find(row=>row.id==='trainer_trained_core'),fast=catalog.trainers.find(row=>row.id==='trainer_fast_pressure');
  const normalized=normalize(catalog,core),data=buildDataSet(catalog),scripts={...SEER_SCRIPTS,...npcTrainingScripts};
  const ordinary=mon=>computeStats(data.species.get(mon.species).base,mon.level,mon.iv,mon.evs,data.natures.get(mon.nature));
  check('Source pins preserve the retained bases, dated provenance, and exclusive third unselected seal',()=>{
    assert.equal(profileData.profiles.length,3);const rei=profileData.profiles.find(p=>p.id==='rei-classic-full');
    assert.deepEqual(rei.expectedBase,{hp:71,atk:108,def:70,spa:101,spd:77,spe:105});assert.deepEqual(rei.statBonus,{hp:60,atk:20,def:30,spa:10,spd:20,spe:20});assert.equal(rei.equivalentBaseTotal,612);
    assert(rei.sources.some(s=>s.published==='2010-06-04'&&s.url.endsWith('/8365.html')));
    assert.equal(profileData.unselectedOptions.length,1);assert.equal(profileData.unselectedOptions[0].implemented,false);
    assert.deepEqual(Object.keys(npcTrainingScripts).sort(),['npc_gaia_blood_seal','npc_gaia_evil_seal']);
  });
  check('Both production trainer routes normalize identically and idempotently without source mutation',()=>{
    for(const raw of [core,fast]) {
      const first=normalize(catalog,raw),second=normalize(catalog,first);
      assert.deepEqual(second,first);assert.deepEqual(normalize(catalog,JSON.parse(JSON.stringify(first))),first);assert.notEqual(first,raw);assert.notEqual(first.team,raw.team);
      const facility=createFacilityEncounter(catalog,'classic',new Rng(7),raw.id);
      assert.deepEqual(facility,{...first,facility:'classic'});assert.deepEqual(normalize(catalog,facility),facility);
      assert.equal(JSON.stringify(catalog),before);
    }
  });
  check('Rei gets six exact final additions at neutral level 100, with zero initial stages',()=>{
    const battle=createBattle({data,scripts,seed:1,sides:[{kind:'player',team:[{species:1,level:100,skills:[10001]}]}],encounter:normalized});
    const rei=battle.sides[1].team[0];assert.deepEqual(rei.stats,{hp:343,atk:335,def:206,spa:248,spd:210,spe:329});
    assert.equal(rei.maxHp,343);assert.equal(rei.hp,343);assert(keys.every(k=>rei.species.base[k]===data.species.get(70).base[k]));
    for(const mon of battle.sides[1].team)assert(Object.values(mon.stages).every(n=>n===0));
    for(let index=1;index<normalized.team.length;index++)assert.deepEqual(battle.sides[1].team[index].stats,ordinary(normalized.team[index]));
    assert.equal(view(70,'rei-classic-full').equivalentBaseTotal,612);assert.equal(view(261,'gaia-blood-seal').equivalentBaseTotal,undefined);
  });
  check('Every original boss, random encounter, and unmarked foundation team remains byte-identical',()=>{
    for(const encounter of catalog.bosses)assert.deepEqual(normalize(catalog,encounter),encounter);
    for(const trainer of catalog.trainers.filter(row=>row.roster_group!=='trained'))assert.deepEqual(normalize(catalog,trainer),trainer);
    const random=createFacilityEncounter(catalog,'random',new Rng(9));assert.deepEqual(normalize(catalog,random),random);
    assert.equal(facilityPool(catalog,600).length,103);assert(!facilityPool(catalog,600).some(m=>[70,261].includes(m.id)));
  });
  check('Elite accepts source-pinned profiles while the generic raw-BST filter remains unchanged',()=>{
    const elite={...structuredClone(core),facility:'elite'};
    assert.deepEqual(normalize(catalog,elite).team,normalized.team);
    const generated=createFacilityEncounter(catalog,'elite',new Rng(9));assert.deepEqual(normalize(catalog,generated),generated);for(const member of generated.team)assert.equal(member.training_profile,member.species===70?'rei-classic-full':member.species===261?'gaia-evil-seal':undefined);
  });
  check('Forbidden contexts reject profiles rather than strengthening original or early encounters',()=>{
    for(const patch of [{category:'legendary'},{category:'wild'},{category:'player'},{facility:'random'},{roster_group:'foundation'},{facility:'classic',roster_group:'foundation'},{category:'legendary',facility:'elite'}])assert.throws(()=>normalize(catalog,{...structuredClone(core),...patch}));
  });
  check('Species, expected base, nature, level, and singleton profile identity are guarded',()=>{
    for(const patch of [{species:261},{level:99},{nature:'adamant'},{nature:undefined},{training_profile:'unknown'},{training_profile:['rei-classic-full','gaia-blood-seal']}]){
      const input=structuredClone(core);Object.assign(input.team[0],patch);assert.throws(()=>normalize(catalog,input));
    }
    const changed=structuredClone(catalog);changed.species.find(m=>m.id===70).base.hp++;assert.throws(()=>normalize(changed,core));
    assert.throws(()=>view(261,'rei-classic-full'));assert.equal(view(70),undefined);
  });
  check('Unrelated overrides, stacked seals, unmarked rules, and team-wide training reject',()=>{
    for(const patch of [{hp_override:999},{stat_multipliers:{atk:2}},{beads:[]},{member_phases:[]},{types:['water']},{stats:{hp:999,atk:1,def:1,spa:1,spd:1,spe:1}},{member_rules:[{rule:'script',id:'npc_gaia_evil_seal'}]}]){
      const input=structuredClone(core);Object.assign(input.team[0],patch);assert.throws(()=>normalize(catalog,input));
    }
    const stacked=normalize(catalog,core);stacked.team[1].member_rules.push({rule:'script',id:'npc_gaia_evil_seal'});assert.throws(()=>normalize(catalog,stacked));
    const unmarked=normalize(catalog,core);delete unmarked.team[1].training_profile;assert.throws(()=>normalize(catalog,unmarked));
    assert.throws(()=>normalize(catalog,{...structuredClone(core),rules:[{rule:'script',id:'npc_gaia_blood_seal'}]}));
  });

  const noop=990900,attack=990901,special=990902,miss=990903,multi=990904,statusDamage=990905,electric=990906,fixed=990907;
  const fixtureSkills=[
    {id:noop,category:'status',target:'self',power:0,effects:[]},
    {id:attack,category:'physical',power:20,effects:[]},
    {id:special,category:'special',power:20,effects:[]},
    {id:miss,category:'physical',power:20,accuracy:0,effects:[]},
    {id:multi,category:'physical',power:10,effects:[{op:'multi_hit',min:3,max:3}]},
    {id:statusDamage,category:'status',target:'foe',power:0,effects:[{op:'fixed_damage',amount:10}]},
    {id:electric,category:'special',type:'electric',power:20,effects:[]},
    {id:fixed,category:'physical',power:0,effects:[{op:'fixed_damage',amount:10}]},
  ].map(s=>({name:{zh:'NPC training fixture'},type:'normal',accuracy:null,pp:99,crit_rate:0,...s}));
  const fixtureData=buildDataSet({...catalog,skills:[...catalog.skills,...fixtureSkills]});
  function fixture(profile='gaia-blood-seal',move=attack,targetSpecies=1) {
    const gaia={species:261,level:100,iv:31,evs:{hp:255,atk:255},nature:'hardy',skills:[move,noop],...(profile?{training_profile:profile}:{})};
    const encounter=normalize(catalog,{id:'training-fixture',category:'trainer',roster_group:'trained',team:[gaia,{species:10,level:100,iv:31,nature:'hardy',skills:[noop,attack]}],rules:[{rule:'no_capture'}]});
    return createBattle({data:fixtureData,scripts,seed:73,sides:[{kind:'player',team:[{species:targetSpecies,level:100,hp_override:2000,skills:[noop]}]}],encounter});
  }
  function turn(battle,skill=noop,foeSkill=noop) {battle.submit(0,{kind:'move',skill:foeSkill});battle.submit(1,{kind:'move',skill});return battle.resolveTurn();}
  function switchTurn(battle,slot){battle.submit(0,{kind:'move',skill:noop});battle.submit(1,{kind:'switch',slot});return battle.resolveTurn();}
  check('Gaia blood seal heals floor(maxHP*5 percent), caps at max, and leaves its teammate unchanged',()=>{
    const b=fixture(),gaia=b.active(1),bench=b.sides[1].team[1];gaia.hp-=60;bench.hp-=30;turn(b);assert.equal(gaia.hp,gaia.maxHp-40);assert.equal(bench.hp,bench.maxHp-30);
    gaia.hp=gaia.maxHp-1;turn(b);assert.equal(gaia.hp,gaia.maxHp);assert.equal(gaia.stats.hp,414);assert.equal(gaia.conditions.filter(c=>c.id==='npc_gaia_blood_seal').length,1);
  });
  check('A selected seal stays on its owner across switches and does not heal on the bench',()=>{
    const b=fixture(),gaia=b.active(1),bench=b.sides[1].team[1];gaia.hp-=80;bench.hp-=30;
    switchTurn(b,1);assert.equal(gaia.hp,gaia.maxHp-80);assert.equal(bench.hp,bench.maxHp-30);turn(b);assert.equal(gaia.hp,gaia.maxHp-80);
    switchTurn(b,0);assert.equal(gaia.hp,gaia.maxHp-60);assert.equal(gaia.conditions.filter(c=>c.id==='npc_gaia_blood_seal').length,1);assert(!bench.conditions.some(c=>c.id.startsWith('npc_gaia_')));
  });
  check('Blood seal cannot revive a fainted owner, including a lethal damage-over-time tick',()=>{
    const b=fixture(),gaia=b.active(1);gaia.hp=1;
    b.addCondition(gaia,{id:'training-lethal-dot',kind:'other',hooks:[{on:'turn_end',damage_pct_max_hp:10}]});turn(b);
    assert.equal(gaia.hp,0);assert(gaia.fainted);b.fire(gaia,'turn_end',{});assert.equal(gaia.hp,0);
  });
  for(const move of [attack,special,multi,fixed])check(`Evil seal appends exactly one 30-point hit to damaging move ${move}`,()=>{
    const trained=fixture('gaia-evil-seal',move);
    const untrained=fixture('',move);
    const beforeA=trained.active(0).hp,beforeB=untrained.active(0).hp;
    const events=turn(trained,move);turn(untrained,move);
    assert.equal(beforeA-trained.active(0).hp,(beforeB-untrained.active(0).hp)+30);
    assert.equal(events.filter(e=>e.type==='damage'&&e.kind==='fixed'&&e.amount===30).length,1);
    assert.equal(trained.active(1).conditions.filter(c=>c.id.startsWith('npc_gaia_')).length,1);
  });
  for(const move of [miss,statusDamage])check(`Evil seal does not add damage to miss or status move ${move}`,()=>{
    const trained=fixture('gaia-evil-seal',move),plain=fixture('',move);turn(trained,move);turn(plain,move);assert.equal(trained.active(0).hp,plain.active(0).hp);
  });
  check('Evil seal does not turn immunity, protection, or zero-damage attacks into a follow-up',()=>{
    const immune=fixture('gaia-evil-seal',electric,53),initial=immune.active(0).hp;turn(immune,electric);assert.equal(immune.active(0).hp,initial);
    for(const hook of [{on:'block_move'},{on:'modify_damage_taken',multiplier:0}]){const b=fixture('gaia-evil-seal');b.addCondition(b.active(0),{id:'fixture-block',kind:'other',hooks:[hook]});const hp=b.active(0).hp;turn(b,attack);assert.equal(b.active(0).hp,hp);}
  });
  check('Evil seal ignores DOT and a fainted owner or target, and obeys fixed-damage immunity',()=>{
    const dot=fixture('gaia-evil-seal'),target=dot.active(0),owner=dot.active(1),hp=target.hp;dot.dealDamage(target,10,{kind:'percent',status:'poison',source:owner});assert.equal(target.hp,hp-10);
    const holderDead=fixture('gaia-evil-seal');holderDead.active(1).hp=0;holderDead.active(1).fainted=true;const t=holderDead.active(0),prior=t.hp;holderDead.fire(holderDead.active(1),'on_hit',{skill:fixtureData.skills.get(attack),ctx:{user:holderDead.active(1),target:t,hit:true,damageDealt:10}});assert.equal(t.hp,prior);
    const protectedFixed=fixture('gaia-evil-seal'),plain=fixture('',attack);
    for(const b of [protectedFixed,plain])b.addCondition(b.active(0),{id:'fixed-block',kind:'other',hooks:[{on:'modify_damage_taken',kinds:['fixed'],multiplier:0}]});
    turn(protectedFixed,attack);turn(plain,attack);assert.equal(protectedFixed.active(0).hp,plain.active(0).hp);
    const ko=fixture('gaia-evil-seal');ko.active(0).hp=1;const events=turn(ko,attack);assert.equal(events.filter(e=>e.type==='damage'&&e.kind==='fixed').length,0);
  });
  check('Evil seal survives switching, stays off the teammate, and cannot stack a second seal',()=>{
    const trained=fixture('gaia-evil-seal'),plain=fixture('');
    for(const b of [trained,plain])switchTurn(b,1);
    let beforeA=trained.active(0).hp,beforeB=plain.active(0).hp;turn(trained,attack);turn(plain,attack);assert.equal(beforeA-trained.active(0).hp,beforeB-plain.active(0).hp);
    for(const b of [trained,plain])switchTurn(b,0);
    beforeA=trained.active(0).hp;beforeB=plain.active(0).hp;turn(trained,attack);turn(plain,attack);assert.equal(beforeA-trained.active(0).hp,(beforeB-plain.active(0).hp)+30);
    const owner=trained.active(1),context={battle:trained,mon:owner,side:trained.sides[1]};
    npcTrainingScripts.npc_gaia_evil_seal.install(context,{});npcTrainingScripts.npc_gaia_blood_seal.install(context,{});
    assert.deepEqual(owner.conditions.filter(c=>c.id.startsWith('npc_gaia_')).map(c=>c.id),['npc_gaia_evil_seal']);
  });
  check('The passive registry refuses player, wild, wrong-species, and original-boss installation',()=>{
    for(const [side,kind,species] of [[0,'player',261],[1,'wild',261],[1,'trainer',70],[1,'boss',261]]){
      const b=createBattle({data:fixtureData,scripts,seed:1,sides:[{kind:'player',team:[{species:261,level:100,skills:[noop]}]},{kind:'trainer',team:[{species,level:100,skills:[noop]}]}]});
      const mon=b.sides[side].team[0];for(const script of Object.values(npcTrainingScripts))script.install({battle:b,mon,side:{...b.sides[side],kind}},{});
      assert(!mon.conditions.some(c=>c.id.startsWith('npc_gaia_')));
    }
  });
  const {createGame}=await server.ssrLoadModule('/src/game.ts');
  check('Direct controller start and facility start both produce Rei HP343 without doubling training',()=>{
    const saved=createGame(catalog,'').exportSave();
    for(const action of [{type:'startBattle',bossId:core.id},{type:'startFacility',facilityId:'classic',teamId:core.id}]){
      const game=createGame(catalog,saved),playerBefore=game.snapshot().monsters.map(m=>({uid:m.uid,stats:m.stats,learned:m.learned}));
      game.dispatch(action);const state=game.snapshot();assert(state.battle,JSON.stringify(state.notices));
      assert.equal(state.battle.enemy.species,70);assert.equal(state.battle.enemy.hp,343);assert.equal(state.battle.enemy.maxHp,343);
      assert.deepEqual(state.monsters.map(m=>({uid:m.uid,stats:m.stats,learned:m.learned})),playerBefore);
      const member=state.facilities.find(f=>f.id==='classic').teams.find(t=>t.id===core.id).opponents[0];
      assert.equal(member.baseTotal,532);assert.equal(member.training.equivalentBaseTotal,612);assert.equal(member.training.label,'能力特训完成');
      assert(!JSON.parse(game.exportSave()).storage.some(m=>m.training_profile!==undefined));
    }
  });
  check('Direct controller starts register Gaia healing and extra damage on the selected member',()=>{
    const saved=JSON.parse(createGame(catalog,'').exportSave()),mon=saved.storage.find(m=>m.uid===saved.party[0]);
    mon.level=100;mon.exp=0;mon.iv=31;mon.nature='hardy';mon.skills=[noop];mon.learned=[noop];mon.pp={[noop]:99};mon.hp=computeStats(data.species.get(mon.species).base,100,31,mon.evs,data.natures.get('hardy')).hp;
    saved.party=[mon.uid];saved.game.traits={};
    const inputFor=(profile,skill,hp)=>({...catalog,skills:[...catalog.skills,...fixtureSkills],trainers:catalog.trainers.map(t=>t.id===core.id?{...structuredClone(t),team:[{species:261,level:100,iv:31,evs:{hp:255,atk:255},nature:'hardy',skills:[skill],...(profile?{training_profile:profile}:{}),...(hp?{hp}:{}),role:{zh:'Fixture'}},...t.team.filter(m=>m.species!==261)],ai:{kind:'sequence',skills:[skill]}}:t)});
    const blood=createGame(inputFor('gaia-blood-seal',noop,300),JSON.stringify(saved));blood.dispatch({type:'startBattle',bossId:core.id});assert.equal(blood.snapshot().battle.enemy.hp,300);blood.dispatch({type:'move',skillId:noop});assert.equal(blood.snapshot().battle.enemy.hp,320);
    const losses=[];for(const profile of ['gaia-evil-seal','']){const game=createGame(inputFor(profile,attack),JSON.stringify(saved));game.dispatch({type:'startBattle',bossId:core.id});const hp=game.snapshot().battle.player.hp;game.dispatch({type:'move',skillId:noop});losses.push(hp-game.snapshot().battle.player.hp);}
    assert.equal(losses[0],losses[1]+30);
  });
  check('Source catalog and all original reward definitions remain unchanged after every fixture',()=>assert.equal(JSON.stringify(catalog),before));
}catch(error){failures.push({name:'harness',error:String(error.stack)});}
finally{
  fs.mkdirSync('artifacts/npc-training-v45',{recursive:true});fs.writeFileSync('artifacts/npc-training-v45/regression.json',JSON.stringify({checks,failures},null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,failures},null,2));await server.close();if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else delete globalThis.localStorage;if(failures.length)process.exitCode=1;
}
