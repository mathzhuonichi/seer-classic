/** Independent integration boundaries, beyond the structural 399-row engraving check. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createServer} from 'vite';

const memory=new Map();
globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error'});
const checks=[],failures=[],observations=[];
const check=(name,run)=>{try{const witness=run();checks.push({name,...(witness===undefined?{}:{witness})});}catch(error){failures.push({name,error:String(error.stack)});console.error(`FAIL ${name}: ${error.message}`);}};
try {
  const [{createGame,loadGameData},{engravings,engraveSkill,engravingById,activeEngravings},{createBattle,buildDataSet},{SEER_SCRIPTS}]=await Promise.all([
    '/src/game.ts','/src/mechanics/engravings.ts','/battle/core/src/index.ts','/battle/core/src/scripts/index.ts',
  ].map(path=>server.ssrLoadModule(path)));
  const catalog=await loadGameData(),data=buildDataSet(catalog),catalogBefore=JSON.stringify(catalog);
  const def=id=>engravingById(String(id)),skill=id=>data.skills.get(id);
  const parse=game=>JSON.parse(game.exportSave());
  const target=(game,uid)=>parse(game).storage.find(mon=>mon.uid===uid);
  const makeFixture=({species=15,level=100,marks=['10039'],move=10001,hp,pp,enemyDamage=0,trainer=false}={})=>{
    const copy=structuredClone(catalog),fixtureMove=900001;
    copy.skills.push({id:fixtureMove,name:{zh:'Integration fixture'},type:'normal',category:'status',power:0,accuracy:null,pp:100,priority:0,target:'foe',effects:enemyDamage?[{op:'fixed_damage',amount:enemyDamage}]:[]});
    copy.bosses.push({id:'engraving-integration-fixture',name:{zh:'Integration fixture'},category:trainer?'trainer':'spt',team:[{species:10,level:100,hp_override:9999,skills:[fixtureMove],ai:{mode:'sequence',sequence:[fixtureMove]}}],rules:[],win:[{kind:'ko_all'}]});
    for(const damage of [0,1]){
      const moveId=900002+damage;
      copy.skills.push({id:moveId,name:{zh:'Healing boundary fixture'},type:'normal',category:'status',power:0,accuracy:null,pp:100,priority:0,target:'foe',effects:damage?[{op:'fixed_damage',amount:damage}]:[]});
      copy.bosses.push({id:`engraving-healing-fixture-${damage}`,name:{zh:'Healing boundary fixture'},category:'spt',team:[{species:10,level:100,hp_override:9999,skills:[moveId],ai:{mode:'sequence',sequence:[moveId]}}],rules:[],win:[{kind:'ko_all'}]});
    }
    const starter=createGame(copy,'');starter.dispatch({type:'cheatAcquire',species,level});
    const owned=parse(starter).storage.find(mon=>mon.species===species);assert(owned,`fixture species ${species}`);
    for(const id of marks){starter.dispatch({type:'buyEngraving',engravingId:id});starter.dispatch({type:'setEngraving',uid:owned.uid,slot:def(id).slot,engravingId:id});assert.equal(starter.snapshot().monsters.find(mon=>mon.uid===owned.uid).engravings[def(id).slot]?.id,id);}
    const saved=parse(starter),mon=saved.storage.find(mon=>mon.uid===owned.uid);
    saved.party=[owned.uid];saved.game.traits={};mon.skills=[move];if(!mon.learned.includes(move))mon.learned.push(move);
    mon.pp={[move]:pp??skill(move).pp};if(hp!==undefined)mon.hp=hp;
    for(const id of ['item_potion_hp_250','item_potion_pp_20','item_status_cure'])saved.items[id]=0;
    const game=createGame(copy,JSON.stringify(saved));
    const start=()=>{game.dispatch({type:'startBattle',bossId:'engraving-integration-fixture'});assert(game.snapshot().battle&&!game.snapshot().battle.finished,game.snapshot().notices[0]);};
    return {game,uid:owned.uid,start,move};
  };

  check('Legacy saves without engraving fields load without changing owned HP, PP or supply counts',()=>{
    const old=createGame(catalog,''),saved=parse(old);delete saved.game.modules;delete saved.game.engravingStock;
    saved.items.item_potion_hp_3000=7;saved.items.item_potion_pp_40=8;
    const before=saved.storage.map(mon=>({uid:mon.uid,hp:mon.hp,pp:mon.pp})),loaded=createGame(catalog,JSON.stringify(saved)),after=parse(loaded);
    assert.deepEqual(after.storage.map(mon=>({uid:mon.uid,hp:mon.hp,pp:mon.pp})),before);
    assert.deepEqual(after.game.modules,{});assert.deepEqual(after.game.engravingStock,{});
    assert.equal(after.items.item_potion_hp_3000,7);assert.equal(after.items.item_potion_pp_40,8);
    assert(!loaded.snapshot().items.some(item=>['item_potion_hp_3000','item_potion_pp_40'].includes(item.id)));
  });
  check('HP and PP bonus do not enter the exported save during an ongoing battle',()=>{
    const f=makeFixture({species:12,marks:['10049','20027'],move:10033,hp:100,pp:3}),before=target(f.game,f.uid);
    f.start();const battle=f.game.snapshot().battle;
    assert.equal(battle.player.hp,before.hp+60);assert.equal(battle.player.skills[0].pp,before.pp[10033]+5);
    assert.equal(target(f.game,f.uid).hp,before.hp);assert.deepEqual(target(f.game,f.uid).pp,before.pp);
    f.game.dispatch({type:'move',skillId:f.move});
    assert.equal(target(f.game,f.uid).hp,before.hp);assert.deepEqual(target(f.game,f.uid).pp,before.pp);
    f.game.dispatch({type:'flee'});assert.equal(target(f.game,f.uid).pp[10033],2);
    return {outsideHp:before.hp,battleHp:battle.player.hp,outsidePp:3,battlePp:battle.player.skills[0].pp,settledPp:2};
  });
  check('Surviving HP below the engraving bonus persists across consecutive battles without free recovery',()=>{
    const f=makeFixture({hp:1,enemyDamage:30});f.start();const before=f.game.snapshot().battle.player.hp;
    f.game.dispatch({type:'move',skillId:f.move});const remaining=f.game.snapshot().battle.player.hp;
    assert.equal(before,61);assert.equal(remaining,31);f.game.dispatch({type:'flee'});const savedHp=target(f.game,f.uid).hp;
    f.start();const next=f.game.snapshot().battle.player.hp;
    observations.push({name:'HP bonus boundary round trip',before,remaining,savedHp,next});
    assert.equal(next,remaining,'starting another battle must not restore consumed engraving HP');
  });
  check('Partly spent bonus PP persists across consecutive battles without free PP recovery',()=>{
    const f=makeFixture({species:12,marks:['20027'],move:10033,pp:0});f.start();const before=f.game.snapshot().battle.player.skills[0].pp;
    f.game.dispatch({type:'move',skillId:f.move});const remaining=f.game.snapshot().battle.player.skills[0].pp;
    assert.equal(before,5);assert.equal(remaining,4);f.game.dispatch({type:'flee'});const savedPp=target(f.game,f.uid).pp[f.move];
    f.start();const next=f.game.snapshot().battle.player.skills[0].pp;
    observations.push({name:'PP bonus boundary round trip',before,remaining,savedPp,next});
    assert.equal(next,remaining,'starting another battle must not restore consumed bonus PP');
  });
  const woundedFixture=()=>{
    const f=makeFixture({species:12,marks:['10049','20027'],move:10033,hp:1,pp:0,enemyDamage:30});f.start();
    f.game.dispatch({type:'move',skillId:f.move});
    const end=f.game.snapshot().battle.player;assert.equal(end.hp,31);assert.equal(end.skills[0].pp,4);
    f.game.dispatch({type:'flee'});return f;
  };
  check('Low HP and partial bonus PP survive export/import and two further no-action battles',()=>{
    const f=woundedFixture();
    for(let i=0;i<2;i++){
      f.game.importSave(f.game.exportSave());f.start();const b=f.game.snapshot().battle;
      assert.equal(b.player.hp,31,`round trip ${i+1} HP`);assert.equal(b.player.skills[0].pp,4,`round trip ${i+1} PP`);
      f.game.dispatch({type:'flee'});
    }
  });
  check('Explicit recovery clears any saved engraving resource shortfall',()=>{
    const f=woundedFixture();f.game.dispatch({type:'heal'});f.start();const b=f.game.snapshot().battle;
    assert.equal(b.player.hp,b.player.maxHp);assert.equal(b.player.skills[0].pp,b.player.skills[0].maxPp);
  });
  check('Unequipping and re-equipping on the same holder does not refresh consumed bonus resources',()=>{
    const f=woundedFixture();
    for(const slot of ['ability','skill'])f.game.dispatch({type:'setEngraving',uid:f.uid,slot,engravingId:null});
    f.start();let b=f.game.snapshot().battle;assert.equal(b.player.hp,1);assert.equal(b.player.skills[0].pp,0);f.game.dispatch({type:'flee'});
    for(const id of ['10049','20027'])f.game.dispatch({type:'setEngraving',uid:f.uid,slot:def(id).slot,engravingId:id});
    f.start();b=f.game.snapshot().battle;assert.equal(b.player.hp,31);assert.equal(b.player.skills[0].pp,4);
  });
  check('An inactive level-gated engraving does not erase the holder resource shortfall',()=>{
    const f=woundedFixture();let saved=parse(f.game);saved.storage.find(m=>m.uid===f.uid).level=49;f.game.importSave(JSON.stringify(saved));
    f.start();let b=f.game.snapshot().battle;assert.equal(b.player.hp,1);assert.equal(b.player.skills[0].pp,0);f.game.dispatch({type:'flee'});
    saved=parse(f.game);saved.storage.find(m=>m.uid===f.uid).level=100;f.game.importSave(JSON.stringify(saved));f.start();b=f.game.snapshot().battle;
    assert.equal(b.player.hp,31);assert.equal(b.player.skills[0].pp,4);
  });
  for(const damage of [0,1])check(`${damage?'Partial':'Full'} healing with a smaller HP engraving preserves the actually restored bonus HP`,()=>{
    const f=woundedFixture();
    f.game.dispatch({type:'buyEngraving',engravingId:'10006'});f.game.dispatch({type:'setEngraving',uid:f.uid,slot:'ability',engravingId:'10006'});
    const saved=parse(f.game);saved.items.item_potion_hp_200=3;f.game.importSave(JSON.stringify(saved));
    const start=()=>f.game.dispatch({type:'startBattle',bossId:`engraving-healing-fixture-${damage}`});start();
    for(let i=0;i<2;i++)f.game.dispatch({type:'battleItem',itemId:'item_potion_hp_200',targetUid:f.uid});
    const b=f.game.snapshot().battle,remaining=b.player.hp,baseMax=b.player.maxHp-10;
    assert.equal(remaining,b.player.maxHp-damage,'fixture restores full HP before the opponent deals the selected damage');
    assert(remaining>baseMax,'fixture must restore some bonus HP');
    f.game.dispatch({type:'flee'});start();
    const next=f.game.snapshot().battle.player.hp;
    observations.push({name:`Smaller engraving after ${damage?'partial':'full'} in-battle healing`,baseMax,remaining,next});
    assert.equal(next,remaining,'actually healed bonus HP must survive settlement with a smaller engraving');
  });
  check('Fainted engraved holders stay fainted after settlement and do not revive on entry',()=>{
    const f=makeFixture({hp:1,enemyDamage:100});f.start();f.game.dispatch({type:'move',skillId:f.move});
    assert(f.game.snapshot().battle.finished);assert.equal(target(f.game,f.uid).hp,0);
    f.game.dispatch({type:'closeBattle'});f.game.dispatch({type:'startBattle',bossId:'engraving-integration-fixture'});
    assert.equal(f.game.snapshot().battle,null);assert.equal(target(f.game,f.uid).hp,0);
  });
  check('Both slots conserve stock on replacement, removal and level-gate changes',()=>{
    const f=makeFixture({species:12,marks:['10049','20027'],move:10033});
    let saved=parse(f.game);assert.deepEqual(new Set(saved.game.modules[f.uid].engravings),new Set(['10049','20027']));
    f.game.dispatch({type:'buyEngraving',engravingId:'10050'});f.game.dispatch({type:'setEngraving',uid:f.uid,slot:'ability',engravingId:'10050'});
    saved=parse(f.game);assert.equal(saved.game.engravingStock['10049'],1);assert.equal(saved.game.engravingStock['10050']??0,0);assert(saved.game.modules[f.uid].engravings.includes('20027'));
    f.game.dispatch({type:'setEngraving',uid:f.uid,slot:'skill',engravingId:null});saved=parse(f.game);assert.equal(saved.game.engravingStock['20027'],1);
    const holder={species:12,level:49,skills:[10033],learned:[10033]};
    assert.deepEqual(activeEngravings(['10049','20027'],holder),[]);assert.equal(activeEngravings(['10049','20027'],{...holder,level:100}).length,2);
    assert.deepEqual(activeEngravings(['10049'],{...holder,level:100,species:15}),[]);
  });
  check('An engraving stays local to its holder through voluntary and forced switching',()=>{
    const move=10008,override=engraveSkill(skill(move),def(20002));
    const b=createBattle({data,scripts:SEER_SCRIPTS,seed:3,sides:[{kind:'player',team:[{species:12,level:100,skills:[move],skill_overrides:{[move]:override}},{species:12,level:100,skills:[move]}]},{kind:'wild',team:[{species:10,level:1,skills:[10001],hp_override:9999}]}]});
    assert.equal(b.skill(move,b.active(0)).power_bonus,15);assert.equal(b.skill(move,b.sides[0].team[1]).power_bonus,undefined);assert.equal(b.skill(move).power_bonus,undefined);
    b.submit(0,{kind:'switch',slot:1});b.resolveTurn();assert.equal(b.active(0).slot,1);assert.equal(b.skill(move,b.active(0)).power_bonus,undefined);
    b.dealDamage(b.active(0),b.active(0).hp,{kind:'fixed',source:b.active(1)});b.submit(0,{kind:'switch',slot:0});b.resolveTurn();
    assert.equal(b.active(0).slot,0);assert.equal(b.skill(move,b.active(0)).power_bonus,15);
    assert.notEqual(b.active(0).skillOverrides[move],override,'constructor clones owner override');
  });
  check('V48 trainer supplies respect engraved maxima and preserve finite owned counts',()=>{
    const f=makeFixture({species:12,marks:['10049','20027'],move:10033,hp:10,pp:0,trainer:true});f.start();
    assert.deepEqual(f.game.snapshot().items.filter(i=>i.unlimited).map(i=>i.id).sort(),['item_potion_hp_250','item_potion_pp_20','item_status_cure'].sort());
    f.game.dispatch({type:'battleItem',itemId:'item_potion_pp_20',targetUid:f.uid});let b=f.game.snapshot().battle;
    assert.equal(b.player.skills[0].pp,b.player.skills[0].maxPp);assert.equal(b.player.skills[0].maxPp,skill(f.move).pp+5);
    f.game.dispatch({type:'battleItem',itemId:'item_potion_hp_250',targetUid:f.uid});b=f.game.snapshot().battle;assert.equal(b.player.hp,Math.min(70+250,b.player.maxHp));
    f.game.dispatch({type:'flee'});const saved=parse(f.game);assert.equal(saved.storage.find(m=>m.uid===f.uid).pp[f.move],skill(f.move).pp);
    for(const id of ['item_potion_hp_250','item_potion_pp_20','item_status_cure'])assert.equal(saved.items[id],0);
    assert(!f.game.snapshot().items.some(i=>i.unlimited));
  });
  check('Original catalog remains immutable after controller and core engraving use',()=>assert.equal(JSON.stringify(catalog),catalogBefore));

  // No production catalog skill or encounter currently calls the generic transform op.
  // This is an explicit extension-interface probe, not a claim of a reachable player bug.
  const transformOps=[];
  const walk=(x,path)=>{if(!x||typeof x!=='object')return;if(x.op==='transform')transformOps.push(path);for(const [k,v] of Object.entries(x))walk(v,`${path}/${k}`);};
  walk(catalog.skills,'skills');walk(catalog.bosses,'bosses');
  const move=20484,override=engraveSkill(skill(move),def(20040));
  const transformed=createBattle({data,scripts:SEER_SCRIPTS,seed:3,sides:[{kind:'player',team:[{species:475,level:100,skills:[move],skill_overrides:{[move]:override}}]},{kind:'wild',team:[{species:10,level:1,skills:[10001]}]}]});
  transformed.runEffects([{op:'transform',species:15,skills:[move]}],transformed.active(0),transformed.active(1),{});
  observations.push({name:'Generic transform extension retains an opaque skill override',catalogTransformOps:transformOps,beforeSpecies:475,afterSpecies:transformed.active(0).species.id,baseDuration:skill(move).effects[0].params[0],transformedDuration:transformed.skill(move,transformed.active(0)).effects[0].params[0],scope:'Synthetic engine extension; no current catalog transform entry found. Species eligibility metadata is not present in MonsterInput.skill_overrides.'});
}catch(error){failures.push({name:'harness',error:String(error.stack)});}
finally {
  const files=['src/game.ts','src/mechanics/engravings.ts','battle/core/src/battle.ts','battle/core/src/types.ts','src/progression/battle-supplies.ts'];
  const sourceHashes=Object.fromEntries(files.map(path=>[path,crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')]));
  fs.mkdirSync('artifacts/engraving-integration-v49',{recursive:true});fs.writeFileSync('artifacts/engraving-integration-v49/regression.json',JSON.stringify({checks,failures,observations,sourceHashes},null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,failures,observations},null,2));await server.close();if(failures.length)process.exitCode=1;
}
