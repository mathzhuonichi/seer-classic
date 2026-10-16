/** 2013 engravings: installed data, every skill-engraving transform, engine hooks, and the controller loadout. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';

const memory=new Map();
globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
const server=await createServer({configFile:false,cacheDir:'artifacts/.validation-cache/engravings-2013',server:{middlewareMode:true,watch:null,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',logLevel:'error'});
const checks=[],failures=[];
const check=(name,run)=>{try{run();checks.push(name);}catch(error){failures.push({name,error:String(error.stack)});console.error(`FAIL ${name}: ${error.message}`);}};
try {
  const [{createGame,loadGameData},{engravings,engraveSkill,engravingById,engravingBlockedReason,engravingEffectGroup,engravingStatKeys,ENGRAVING_EFFECT_GROUPS},{createBattle,buildDataSet},{SEER_SCRIPTS}]=await Promise.all([
    '/src/game.ts','/src/mechanics/engravings.ts','/battle/core/src/index.ts','/battle/core/src/scripts/index.ts',
  ].map(path=>server.ssrLoadModule(path)));
  const catalog=await loadGameData(),data=buildDataSet(catalog);
  const species=new Map(catalog.species.map(s=>[s.id,s])),skills=new Map(catalog.skills.map(s=>[s.id,s]));
  const learns=(sid,move)=>species.get(sid)?.learnset.some(l=>l.skill===move);
  const def=id=>engravingById(String(id));
  const engraved=(id,move)=>engraveSkill(skills.get(move??def(id).moveIds[0]),def(id));

  check('Installed set: 546 engravings from 2013, no 2014 universal engravings',()=>{
    assert.equal(engravings.length,546);
    assert.deepEqual([...new Set(engravings.map(e=>e.slot))].sort(),['ability','skill']);
    assert.equal(engravings.filter(e=>e.slot==='ability').length,147);
    assert(engravings.every(e=>Number(e.id)<30000),'no universal/common engraving IDs');
    assert.deepEqual(engravings.filter(e=>e.boundary).map(e=>e.id),['10157']);
  });
  check('Every bound species is in the catalog and every skill engraving has a catalog learner',()=>{
    for(const e of engravings){
      for(const sid of e.species)assert(species.has(sid),`${e.id} species ${sid}`);
      if(e.slot==='ability'){assert(Object.keys(e.stats).length,`${e.id} stats`);continue;}
      for(const move of e.moveIds)assert(skills.has(move),`${e.id} move ${move}`);
      const holders=e.species.length?e.species:catalog.species.map(s=>s.id);
      assert(holders.some(sid=>e.moveIds.some(move=>learns(sid,move))),`${e.id} has no learner`);
    }
  });
  check('Original 2013 values are kept and the three misbound MoveIDs are corrected',()=>{
    assert.deepEqual(def(10040).stats,{spe:35});
    assert.deepEqual(def(10039).stats,{hp:60});assert.equal(def(10039).levelMin,50);
    assert.deepEqual([def(20072).moveIds,def(20084).moveIds,def(20250).moveIds],[[11336],[11432],[12599]]);
  });
  check('All 399 skill engravings change their engraved skill',()=>{
    const unsupported=engravings.filter(e=>e.slot==='skill'&&!e.moveIds.some(move=>engraveSkill(skills.get(move),e))).map(e=>`${e.id} ${e.name.zh} (${e.effect.code})`);
    assert.deepEqual(unsupported,[]);
  });
  check('Representative transforms follow the original effect codes',()=>{
    assert.equal(engraved(20001).priority,(skills.get(10001).priority??0)+1);           // 103 先制+1
    const power=engravings.find(e=>e.effect.code===101);assert.equal(engraved(power.id).power_bonus,Number(power.effect.arg));
    const sure=engravings.find(e=>e.effect.code===106);assert.equal(engraved(sure.id).accuracy,null);
    assert(!engraved(20024).effects.some(op=>op.op==='recoil'));                         // 108 烈焰冲撞
    assert.deepEqual(engraved(20018).effects.find(op=>op.id==='seer_eff_80').params,[1]); // 108 敌我同伤
    assert.equal(engraved(20062).pp_cost,2);assert.equal(engraved(20062).priority,(skills.get(def(20062).moveIds[0]).priority??0)+1); // 112
    const tianfa=engraved(20133);assert.equal(tianfa.power,28);assert.deepEqual([tianfa.effects[0].min,tianfa.effects[0].max],[8,8]); // 114
    const judgement=engraved(20131);assert.equal(judgement.power,220);assert(!judgement.effects.some(op=>op.id==='seer_eff_70')); // 113
    assert.equal(engraved(20017).effects[0].turns,5);                                     // 107 add_condition 3+2
    assert.equal(engraved(20040).effects[0].params[0],4);                                 // 107 script 3+1
    assert.deepEqual(engraved(20025).effects,[]);                                         // 109 drops 特攻-1
    assert(!engraved(20029).effects.some(op=>op.status==='fatigue'));                     // 110
    assert.equal(engraved(20172).effects[0].chance,20);                                   // 117 10+10
    assert.equal(engraved(20286).effects[0].params[1],80);                                // 120
    assert.equal(engraved(20384).effects.find(op=>op.op==='heal').pct_max_hp,50);         // 125
    assert.equal(engraved(20389).effects[0].stats.atk,2);                                 // 127
    assert.equal(skills.get(10001).power_bonus,undefined,'catalog skill is not mutated');
  });
  check('Engine applies per-monster overrides: power bonus, extra PP and PP cost',()=>{
    const move=def(20001).moveIds[0],bonus={...structuredClone(skills.get(move)),power_bonus:15,pp:skills.get(move).pp+5};
    const make=overrides=>createBattle({data,scripts:SEER_SCRIPTS,seed:7,sides:[{kind:'player',team:[{species:1,level:50,skills:[move],skill_overrides:overrides}]},{kind:'wild',team:[{species:10,level:50,skills:[move]}]}]});
    const plain=make(undefined),boosted=make({[move]:bonus});
    const power=b=>b.calcAttack(b.active(0),b.active(1),b.skill(move,b.active(0)),{},{estimate:true}).power;
    assert.equal(power(boosted),power(plain)+15);
    assert.equal(boosted.active(0).maxPp[move],skills.get(move).pp+5);
    assert.equal(boosted.skill(move).power_bonus,undefined,'shared lookup stays catalog');
    const photo=def(20062).moveIds[0],cost=createBattle({data,scripts:SEER_SCRIPTS,seed:7,sides:[{kind:'player',team:[{species:1,level:50,skills:[photo],skill_overrides:{[photo]:engraved(20062)}}]},{kind:'wild',team:[{species:10,level:50,skills:[move]}]}]});
    const before=cost.active(0).pp[photo];cost.submit(0,{kind:'move',skill:photo});cost.resolveTurn();
    assert.equal(before-cost.active(0).pp[photo],2);
  });
  check('暗影自爆刻印 (Stel) fatigues the surviving foe after the self-KO; the plain move does not',()=>{
    const fatigued=overrides=>{
      const b=createBattle({data,scripts:SEER_SCRIPTS,seed:3,sides:[{kind:'player',team:[{species:832,level:100,skills:[12009],skill_overrides:overrides},{species:1,level:100,skills:[10001]}]},{kind:'wild',team:[{species:70,level:100,skills:[10001]}]}]});
      b.submit(0,{kind:'move',skill:12009});b.resolveTurn();
      assert(b.sides[0].team[0].fainted,'self-KO');return b.active(1).conditions.some(c=>c.id==='fatigue');
    };
    assert.equal(fatigued(undefined),false);assert.equal(fatigued({12009:engraved(20179)}),true);
  });
  check('Classifier: every skill engraving has an effect group and every ability engraving raises a stat',()=>{
    const groups=new Set(ENGRAVING_EFFECT_GROUPS.map(([id])=>id));
    for(const e of engravings){
      if(e.slot==='skill')assert(groups.has(engravingEffectGroup(e)),`${e.id} group`);
      else{assert.equal(engravingEffectGroup(e),undefined);assert(engravingStatKeys(e).length,`${e.id} stats`);}
    }
    assert.equal(engravingEffectGroup(def(20002)),'power');assert.equal(engravingEffectGroup(def(20001)),'priority');assert.equal(engravingEffectGroup(def(20179)),'status');
    assert.deepEqual(engravingStatKeys(def(10133)).length,6);
  });
  check('Shop: generic ability stock plus equipped copies obey the V50 per-mark cap',()=>{
    const game=createGame(catalog,''),parse=()=>JSON.parse(game.exportSave());
    game.dispatch({type:'cheatAcquire',species:15,level:100});
    const mouse=parse().storage.find(m=>m.species===15);assert(mouse);
    const stock=id=>parse().game.engravingStock[id]??0,view=()=>game.engravingOptions(mouse.uid).find(o=>o.id==='10031');
    const reject=(action,label)=>{const before=game.exportSave();game.dispatch(action);assert.equal(game.exportSave(),before,label);};
    reject({type:'setEngraving',uid:mouse.uid,slot:'ability',engravingId:'10031'},'cannot equip without stock or another holder');
    game.dispatch({type:'buyEngraving',engravingId:'10031'});assert.equal(stock('10031'),1,'one copy per purchase');
    game.dispatch({type:'buyEngraving',engravingId:'10031'});assert.equal(stock('10031'),2);reject({type:'buyEngraving',engravingId:'10031'},'Speed +15 cap is 2');
    game.dispatch({type:'setEngraving',uid:mouse.uid,slot:'ability',engravingId:'10031'});
    assert.equal(stock('10031'),1);assert.deepEqual([view().stock,view().equipped,view().equippedHere],[1,1,true]);
    reject({type:'buyEngraving',engravingId:'10031'},'equipped copies count toward cap');
    game.dispatch({type:'buyEngraving',engravingId:'10037'});game.dispatch({type:'setEngraving',uid:mouse.uid,slot:'ability',engravingId:'10037'});
    assert.deepEqual([stock('10031'),stock('10037')],[2,0],'replacing returns the finite old copy');
    game.dispatch({type:'setEngraving',uid:mouse.uid,slot:'ability',engravingId:null});assert.equal(stock('10037'),1,'unequip returns the finite copy');
    reject({type:'buyEngraving',engravingId:'40001'},'no universal engravings in the shop');
  });
  check('Controller: slot rules, species/level/move gates, stat bonus and HP round trip',()=>{
    const game=createGame(catalog,''),parse=()=>JSON.parse(game.exportSave());
    game.dispatch({type:'cheatAcquire',species:15,level:50});
    const mouse=parse().storage.find(m=>m.species===15);assert(mouse);
    const starter=parse().storage[0];
    for(const id of ['10039','10001'])game.dispatch({type:'buyEngraving',engravingId:id});
    const reject=(action,label)=>{const before=game.exportSave();game.dispatch(action);assert.equal(game.exportSave(),before,label);};
    reject({type:'setEngraving',uid:starter.uid,slot:'ability',engravingId:'10039'},'exclusive engraving on another species');
    reject({type:'setEngraving',uid:starter.uid,slot:'ability',engravingId:'10001'},'Lv.100 engraving below level 100');
    reject({type:'setEngraving',uid:mouse.uid,slot:'skill',engravingId:'10039'},'ability engraving in the skill slot');
    game.dispatch({type:'setEngraving',uid:mouse.uid,slot:'ability',engravingId:'10039'});
    let view=game.snapshot().monsters.find(m=>m.uid===mouse.uid);
    assert.equal(view.engravings.ability.id,'10039');assert(view.engravings.ability.ready);assert.deepEqual(view.engravings.bonus,{hp:60});
    assert(!game.engravingOptions(starter.uid).some(o=>o.id==='10039'),'exclusive engraving hidden from other species');
    assert(game.engravingOptions(starter.uid).filter(o=>o.ready).every(o=>!o.reason),'ready options carry no blocking reason');
    // Battle: max HP includes the engraving; the saved HP stays on the base scale after the battle.
    const save=parse();save.party=[mouse.uid];
    const fighter=createGame(catalog,JSON.stringify(save)),baseHp=fighter.snapshot().monsters.find(m=>m.uid===mouse.uid).stats.hp;
    fighter.dispatch({type:'startTraining',species:10,level:5});
    const battle=fighter.snapshot().battle;assert.equal(battle.player.maxHp,baseHp+60);assert.equal(battle.player.hp,baseHp+60);
    fighter.dispatch({type:'flee'});
    assert.equal(JSON.parse(fighter.exportSave()).storage.find(m=>m.uid===mouse.uid).hp,baseHp);
    // Skill slot: 电光火石刻印 (generic 威力+15) on a level-100 Pipi line shows in the battle skill view.
    const trainer=createGame(catalog,JSON.stringify(parse()));trainer.dispatch({type:'cheatAcquire',species:10,level:100});
    const s0=JSON.parse(trainer.exportSave()).storage.find(m=>[10,11,12].includes(m.species));assert(s0,'Pipi line fixture');
    const option=trainer.engravingOptions(s0.uid).find(o=>o.id==='20002');assert(option?.ready,'电光火石刻印 ready');
    const move=def(option.id).moveIds[0];
    const mon=JSON.parse(trainer.exportSave()).storage.find(m=>m.uid===s0.uid);
    {const saved=JSON.parse(trainer.exportSave());saved.party=[s0.uid];trainer.importSave(JSON.stringify(saved));}
    trainer.dispatch({type:'equip',uid:s0.uid,skills:[move,...mon.skills.filter(id=>id!==move)].slice(0,4)});
    trainer.dispatch({type:'buyEngraving',engravingId:option.id});
    trainer.dispatch({type:'setEngraving',uid:s0.uid,slot:'skill',engravingId:option.id});
    assert.equal(trainer.snapshot().monsters.find(m=>m.uid===s0.uid).engravings.skill.id,option.id);
    trainer.dispatch({type:'startTraining',species:10,level:5});
    const shown=trainer.snapshot().battle.player.skills.find(sk=>sk.id===move);
    assert.equal(shown.power,skills.get(move).power+Number(def(option.id).effect.arg));
    trainer.dispatch({type:'flee'});
    trainer.dispatch({type:'setEngraving',uid:s0.uid,slot:'skill',engravingId:null});
    assert.equal(trainer.snapshot().monsters.find(m=>m.uid===s0.uid).engravings.skill,null);
  });
  check('An evolved or de-levelled holder keeps the engraving but it stops applying',()=>{
    assert.equal(engravingBlockedReason(def(10039),{species:16,level:100,skills:[],learned:[]}),'仅限专属精灵');
    assert.equal(engravingBlockedReason(def(10001),{species:1,level:99,skills:[],learned:[]}),'需要 Lv.100');
  });
}catch(error){failures.push({name:'harness',error:String(error.stack)});}
finally{
  fs.mkdirSync('artifacts/engravings-2013',{recursive:true});fs.writeFileSync('artifacts/engravings-2013/regression.json',JSON.stringify({checks,failures},null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,failures},null,2));await server.close();if(failures.length)process.exitCode=1;
}
