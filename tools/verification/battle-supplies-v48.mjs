/** Trainer supply rules and V50 player access: inventory isolation, real turns, and public entries. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root,memoryStorage,sha256File,suite,withSsr} from './_harness.mjs';

memoryStorage();
const HP='item_potion_hp_250',PP='item_potion_pp_20',CURE='item_status_cure',RETIRED_HP='item_potion_hp_3000',RETIRED_PP='item_potion_pp_40',FINITE_HP='item_potion_hp_200';
const retired=[RETIRED_HP,RETIRED_PP];
const expected=[HP,PP,CURE],WAIT=990480,HIT=990481,SHORT=990482;
const sorted=values=>[...values].sort();
const parse=game=>JSON.parse(game.exportSave());
const snapshotItems=game=>game.snapshot().items.filter(item=>item.unlimited).map(item=>item.id);
const finiteInventory=items=>Object.values(items).every(value=>typeof value==='number'&&Number.isFinite(value));
const controllerFiles=fs.readdirSync(path.join(root,'src/kernel')).filter(file=>file.endsWith('.ts')).sort().map(file=>`src/kernel/${file}`);
await withSsr('battle-supplies-v48',async load=>{
  const t=suite('battle-supplies-v48'),{check}=t,publicEntries=[];
  const [{loadCatalog},{createGame:createProductionGame},{createBattle},{buildDataSet},{SEER_SCRIPTS},{makeDex,computeStats},{trainerBattleSupplies,TRAINER_UNLIMITED_ITEMS,normalizeBattleSupplyItems}]=await Promise.all([
    '/src/domain/catalog/catalog.ts','/src/kernel/game.ts','/tools/verification/_battle.ts','/battle/core/src/index.ts','/battle/core/src/scripts/index.ts','/raising/core/index.ts','/src/domain/battle-supplies.ts',
  ].map(load));
  // Observe the controller's real battles through its battle-factory seam; every assertion uses production behavior.
  const created=[];
  const createGame=(input,save)=>createProductionGame(input,save,{createBattle:options=>{const battle=createBattle(options);created.push(battle);return battle;}});
  const catalog=await loadCatalog(),catalogBefore=JSON.stringify(catalog);
  const cure={id:CURE,name:{zh:'Supply audit status cure'},kind:'battle',battle_effects:[{op:'cure_status',target:'self'}]};
  const normalizedItems=normalizeBattleSupplyItems([...catalog.items,cure]);
  const playerExpected=normalizedItems.filter(item=>['raising','battle','capsule'].includes(item.kind)).map(item=>item.id);
  const data=buildDataSet({...catalog,items:normalizedItems,skills:[...catalog.skills,
    {id:WAIT,name:{zh:'Supply audit wait'},type:'normal',category:'status',target:'self',power:0,accuracy:null,pp:99,effects:[]},
    {id:HIT,name:{zh:'Supply audit fixed hit'},type:'normal',category:'physical',power:0,accuracy:null,pp:99,effects:[{op:'fixed_damage',amount:25,target:'foe'}]},
    {id:SHORT,name:{zh:'Supply audit short wait'},type:'normal',category:'status',target:'self',power:0,accuracy:null,pp:10,effects:[]},
  ]});
  const hpAmount=data.items.get(HP).battle_effects.find(effect=>effect.op==='heal').amount;
  const ppAmount=data.items.get(PP).battle_effects.find(effect=>effect.op==='restore_pp').amount;
  const mon=(uid,extra={})=>({uid,species:1,level:100,iv:31,nature:'hardy',skills:[WAIT,HIT,SHORT],stats:{hp:500,atk:100,def:100,spa:100,spd:100,spe:100},...extra});
  function fixture({items0={},items1={},unlimited0=expected,unlimited1=expected,rules0=[],rules1=[],team0,team1,kind1='trainer',maxTurns}={}){
    return createBattle({data,scripts:SEER_SCRIPTS,seed:48,maxTurns,sides:[
      {kind:'player',team:team0??[mon('p0'),mon('p1'),mon('p2',{hp:0})],items:items0,unlimited_items:unlimited0,rules:rules0},
      {kind:kind1,team:team1??[mon('f0'),mon('f1'),mon('f2',{hp:0})],items:items1,unlimited_items:unlimited1,rules:rules1},
    ]});
  }
  const itemAction=(item,target=0)=>({kind:'item',item,target});
  const turn=(b,a0,a1={kind:'move',skill:WAIT})=>{b.submit(0,a0);b.submit(1,a1);return b.resolveTurn();};
  const legalItems=(b,side)=>b.legalActions(side).filter(action=>action.kind==='item');
  const addStatus=(b,side,id,slot=0)=>{const m=b.sides[side].team[slot];m.conditions.push({id,def:data.conditions.get(id),turns:4,appliedTurn:0});};

  check('The grant is exactly the selected HP, PP, and existing status cure, only for trainers',()=>{
    assert.deepEqual([...TRAINER_UNLIMITED_ITEMS],expected);
    const available={items:normalizedItems};assert.deepEqual(trainerBattleSupplies(available,{category:'trainer'}),expected);
    for(const encounter of [null,undefined,{}, {category:'boss'}, {category:'wild'}, {category:'spt',facility:'classic'}])assert.deepEqual(trainerBattleSupplies(available,encounter),[]);
    assert.equal(hpAmount,250);assert.equal(data.items.get(HP).seer_id,300072);assert.equal(data.items.get(HP).trainer_supply_only,true);assert(retired.every(id=>!data.items.has(id)));
    assert.equal(ppAmount,20);
    assert.deepEqual(trainerBattleSupplies({items:[{id:HP,battle_effects:[]},{id:PP},cure]},{category:'trainer'}),[CURE]);
    for(const id of expected){const item=data.items.get(id);assert.equal(item.kind,'battle');assert(!item.battle_effects.some(effect=>effect.op==='revive'));assert(!('capture_multiplier' in item));assert(!('raising_effect' in item));}
  });
  check('Both sides get independent runtime supply sets and JSON-safe unchanged finite inventories',()=>{
    const input=[...expected],items0={[HP]:7,[PP]:0},items1={[CURE]:2};const b=fixture({items0,items1,unlimited0:input,unlimited1:input});
    for(const side of b.sides){assert(side.unlimitedItems instanceof Set);assert.deepEqual([...side.unlimitedItems],expected);}
    assert.notEqual(b.sides[0].unlimitedItems,b.sides[1].unlimitedItems);input.push('not-a-supply');assert(!b.sides[0].unlimitedItems.has('not-a-supply'));
    const state=JSON.parse(JSON.stringify(b.state));assert.deepEqual(state.sides[0].unlimited_items,expected);assert.deepEqual(state.sides[1].unlimited_items,expected);
    assert.deepEqual(state.sides[0].items,items0);assert.deepEqual(state.sides[1].items,items1);assert(b.sides.every(side=>finiteInventory(side.items)));
    const plain=fixture({unlimited0:[],unlimited1:[]});assert(plain.state.sides.every(side=>!('unlimited_items' in side)));
  });
  check('Supplies are legal only for useful living targets, without duplicates or automatic revives',()=>{
    const b=fixture({items0:{[HP]:3}});assert.deepEqual(legalItems(b,0),[]);
    for(const side of b.sides){side.team[0].hp=300;side.team[1].pp[WAIT]=1;addStatus(b,side.index,'poison',1);}
    for(const side of [0,1]){const actions=legalItems(b,side);assert.deepEqual(actions,[itemAction(HP),itemAction(PP,1),itemAction(CURE,1)]);assert(actions.every(action=>action.target!==2));}
    assert.throws(()=>b.submit(0,itemAction(HP,2)),/illegal action/);
    assert.throws(()=>b.submit(0,itemAction('item_capsule_master')),/illegal action/);
  });
  check('Repeated selected HP use by both sides neither creates nor consumes finite stock',()=>{
    for(const stock of [0,3]){
      const inventory=stock?{[HP]:stock}:{};const b=fixture({items0:inventory,items1:inventory});
      for(let cycle=0;cycle<4;cycle++){b.active(0).hp=1;b.active(1).hp=1;const beforeTurn=b.turn;const events=turn(b,itemAction(HP),itemAction(HP));
        assert.equal(b.turn,beforeTurn+1);assert.equal(b.active(0).hp,Math.min(500,1+hpAmount));assert.equal(b.active(1).hp,Math.min(500,1+hpAmount));
        assert.deepEqual(events.filter(event=>event.type==='item_used').map(event=>event.side).sort(),[0,1]);
        assert.deepEqual(b.sides[0].items,inventory);assert.deepEqual(b.sides[1].items,inventory);
      }
    }
    t.witness('repeated-symmetric-HP',{usesPerSide:8,existingFiniteStockPreserved:true,absentKeyNotCreated:true});
  });
  check('PP supply restores exactly its configured 20 per equipped skill and respects each cap',()=>{
    const b=fixture();for(const side of b.sides){side.team[1].pp[WAIT]=1;side.team[1].pp[HIT]=90;side.team[1].pp[SHORT]=0;side.team[1].pp[123456]=2;}
    const before=[...b.active(0).skills.map(id=>b.active(0).pp[id])];turn(b,itemAction(PP,1),itemAction(PP,1));
    for(const side of b.sides){const target=side.team[1];assert.equal(target.pp[WAIT],1+ppAmount);assert.equal(target.pp[HIT],Math.min(99,90+ppAmount));assert.equal(target.pp[SHORT],Math.min(10,ppAmount));assert.equal(target.pp[123456],2);assert.deepEqual(side.items,{});}
    assert.deepEqual(b.active(0).skills.map(id=>b.active(0).pp[id]),before);
  });
  check('Status supply removes all status conditions while keeping stages and ordinary buffs',()=>{
    const b=fixture();for(const side of b.sides){addStatus(b,side.index,'poison');addStatus(b,side.index,'sleep');side.team[0].stages.atk=3;side.team[0].stages.def=-2;side.team[0].conditions.push({id:'audit-buff',def:{id:'audit-buff',kind:'buff',hooks:[]},turns:6,appliedTurn:0});}
    turn(b,itemAction(CURE),itemAction(CURE));for(const side of b.sides){assert(!side.team[0].conditions.some(condition=>condition.def.kind==='status'));assert(side.team[0].conditions.some(condition=>condition.id==='audit-buff'));assert.equal(side.team[0].stages.atk,3);assert.equal(side.team[0].stages.def,-2);assert.deepEqual(side.items,{});}
  });
  check('Using an unlimited item spends the whole turn and permits the opposing reply',()=>{
    const b=fixture();b.active(0).hp=100;const pp=b.active(0).pp[HIT],beforeTurn=b.turn,events=turn(b,itemAction(HP),{kind:'move',skill:HIT});
    assert.equal(b.turn,beforeTurn+1);assert.equal(b.active(0).hp,Math.min(500,100+hpAmount)-25);assert.equal(b.active(1).hp,500);assert.equal(b.active(0).pp[HIT],pp);assert.equal(b.active(1).pp[HIT],98);
    assert.equal(events.filter(event=>event.type==='item_used'&&event.side===0).length,1);assert(!events.some(event=>event.type==='move_used'&&event.side===0));assert(events.some(event=>event.type==='damage'&&event.side===0&&event.amount===25));
    t.witness('whole-turn-item',{item:HP,configuredAmount:hpAmount,healedFrom:100,healedTo:Math.min(500,100+hpAmount),opposingDamage:25,finalHp:b.active(0).hp});
  });
  check('No-items rules and forced replacement still block unlimited items',()=>{
    const b=fixture({rules0:[{rule:'no_items'}],rules1:[{rule:'no_items'}]});b.active(0).hp=1;b.active(1).hp=1;assert.deepEqual(legalItems(b,0),[]);assert.deepEqual(legalItems(b,1),[]);assert.throws(()=>b.submit(0,itemAction(HP)),/illegal action/);
    const replace=fixture();replace.phase='replace';replace.sides[0].needsReplacement=true;replace.active(0).hp=0;replace.active(0).fainted=true;assert.deepEqual(legalItems(replace,0),[]);assert.throws(()=>replace.submit(0,itemAction(HP,1)),/illegal action/);
  });
  check('Block-heal and the actual potion-backlash script apply to unlimited HP items',()=>{
    const blocked=fixture({rules1:[{rule:'block_heal'}]});blocked.active(0).hp=100;const events=turn(blocked,itemAction(HP));assert.equal(blocked.active(0).hp,100);assert(events.some(event=>event.type==='heal_blocked'&&event.side===0));assert.deepEqual(blocked.sides[0].items,{});
    const backlash=fixture();backlash.active(0).hp=100;backlash.runEffects([{op:'script',id:'seer_eff_69',params:[3]}],backlash.active(1),backlash.active(0),{});assert(backlash.active(0).conditions.some(condition=>condition.id.includes('seer_eff_69')));
    const harms=turn(backlash,itemAction(HP));assert.equal(backlash.sides[0].team[0].hp,Math.max(0,100-hpAmount));assert(harms.some(event=>event.type==='damage'&&event.side===0&&event.kind==='fixed'&&event.amount+event.overkill===hpAmount));assert.deepEqual(backlash.sides[0].items,{});
  });
  check('Ordinary Boss and wild sides keep finite consumption, exhaustion, and no implicit grant',()=>{
    for(const kind1 of ['boss','wild']){const b=fixture({kind1,unlimited0:[],unlimited1:[],items0:{[FINITE_HP]:1,[PP]:1},items1:{[FINITE_HP]:1,[PP]:1}});b.active(0).hp=1;b.active(1).hp=1;turn(b,itemAction(FINITE_HP),itemAction(FINITE_HP));assert.equal(b.sides[0].items[FINITE_HP],0);assert.equal(b.sides[1].items[FINITE_HP],0);b.active(0).hp=1;assert(!legalItems(b,0).some(action=>action.item===FINITE_HP));assert(b.state.sides.every(side=>!('unlimited_items' in side)));
      b.active(0).pp[WAIT]=1;b.active(1).pp[WAIT]=1;turn(b,itemAction(PP),itemAction(PP));for(const side of b.sides){assert.equal(side.items[PP],0);assert.equal(side.team[0].pp[WAIT],1+ppAmount);assert(!legalItems(b,side.index).some(action=>action.item===PP));}
    }
  });
  check('The existing turn cap still terminates intentionally endless symmetric resupply',()=>{
    const b=fixture({maxTurns:4});let uses=0;while(!b.result){b.active(0).hp=100;b.active(1).hp=100;turn(b,itemAction(HP),itemAction(HP));uses++;assert(uses<6);}
    assert.equal(b.result.reason,'turn_cap');assert.equal(b.result.winner,null);assert.equal(uses,4);assert.deepEqual(b.sides.map(side=>side.items),[{},{}]);t.witness('deliberate-resupply-loop',{usesPerSide:uses,result:b.result.reason,configuredCap:4});
  });

  const fresh=createGame(catalog,''),base=parse(fresh),dex=makeDex(catalog);base.rng_state=[101,202,303,404];base.game.traits={};
  check('A fresh save exposes unlimited HP250 without stock while retired tiers stay hidden',()=>{
    const excluded=[HP,...retired];assert(excluded.every(id=>!Object.hasOwn(base.items,id)));assert(!fresh.snapshot().items.some(item=>retired.includes(item.id)));assert(!fresh.snapshot().shopItems.some(item=>retired.includes(item.id)));
    assert.equal(fresh.snapshot().items.find(item=>item.id===HP)?.unlimited,true);assert.equal(fresh.snapshot().shopItems.find(item=>item.id===HP)?.unlimited,true);
    for(const itemId of excluded){const before=fresh.exportSave();fresh.dispatch({type:'buyItem',itemId,quantity:1});assert.equal(fresh.exportSave(),before);}
  });
  for(const id of expected)base.items[id]=0;
  for(const member of base.storage){member.level=100;member.iv=31;member.hp=computeStats(member,dex).hp-40;for(const id of member.skills)member.pp[id]=Math.max(0,data.skills.get(id).pp-2);}
  const make=(save=base,input=catalog)=>createGame(input,JSON.stringify(structuredClone(save)));
  function startGame(action,save=base,input=catalog){const game=make(save,input),before=created.length;game.dispatch(action);assert(game.snapshot().battle,JSON.stringify(game.snapshot().notices));assert.equal(created.length,before+1);return {game,battle:created.at(-1)};}
  const entries=[...catalog.trainers.map(trainer=>({type:'startBattle',bossId:trainer.id})),{type:'startFacility',facilityId:'random'},{type:'startFacility',facilityId:'elite'},...catalog.trainers.map(trainer=>({type:'startFacility',facilityId:'classic',teamId:trainer.id}))];
  check('Every trainer entry retains exactly three NPC supplies while player ordinary items are unlimited',()=>{
    for(const action of entries){const {game,battle}=startGame(action);assert.deepEqual(sorted(snapshotItems(game)),sorted(playerExpected));assert.deepEqual(sorted(battle.sides[0].unlimitedItems),sorted(playerExpected));assert.deepEqual(sorted(battle.sides[1].unlimitedItems),sorted(expected));assert.equal(battle.sides[1].kind,'trainer');
      assert.deepEqual(parse(game).items,base.items);assert(game.snapshot().items.filter(item=>item.unlimited).every(item=>item.count===(base.items[item.id]??0)));assert(game.snapshot().shopItems.filter(item=>playerExpected.includes(item.id)).every(item=>item.unlimited));
      assert.equal(game.snapshot().battle.canCapture,false);game.dispatch({type:'flee'});assert.deepEqual(sorted(snapshotItems(game)),sorted(playerExpected));assert.deepEqual(parse(game).items,base.items);game.dispatch({type:'closeBattle'});assert.equal(game.snapshot().battle,null);assert.deepEqual(sorted(snapshotItems(game)),sorted(playerExpected));
      publicEntries.push({action,opponents:battle.sides[1].team.length,playerSupplies:playerExpected,npcSupplies:expected,finiteInventoryUnchanged:true});
    }
  });
  check('Controller uses zero-stock supplies, preserves owned quantities, and never serializes the grant',()=>{
    for(const stock of [0,2]){const save=structuredClone(base);for(const id of expected)save.items[id]=stock;
      const {game,battle}=startGame({type:'startFacility',facilityId:'classic',teamId:catalog.trainers[0].id},save);
      // The target is the reserve so the enemy cannot obscure the potion effect.
      const target=game.snapshot().battle.party[1],beforeTurn=game.snapshot().battle.turn;game.dispatch({type:'battleItem',itemId:HP,targetUid:target.uid});
      assert.equal(game.snapshot().battle.turn,beforeTurn+1);assert.equal(battle.sides[0].team[1].hp,battle.sides[0].team[1].maxHp);assert.deepEqual(parse(game).items,save.items);
      const afterHp=game.snapshot().battle.turn;game.dispatch({type:'battleItem',itemId:PP,targetUid:target.uid});assert.equal(game.snapshot().battle.turn,afterHp+1);assert(battle.sides[0].team[1].skills.every(id=>battle.sides[0].team[1].pp[id]===battle.sides[0].team[1].maxPp[id]));assert.deepEqual(parse(game).items,save.items);
      const serialized=game.exportSave();assert(!serialized.includes('unlimited'));assert(!serialized.includes('Infinity'));assert(finiteInventory(parse(game).items));
      const reloaded=make(parse(game));assert.equal(reloaded.snapshot().battle,null);assert.deepEqual(sorted(snapshotItems(reloaded)),sorted(playerExpected));assert.deepEqual(parse(reloaded).items,save.items);
      game.dispatch({type:'flee'});assert.deepEqual(sorted(snapshotItems(game)),sorted(playerExpected));assert.deepEqual(parse(game).items,save.items);
    }
  });
  check('The controller-provided status cure works at zero stock and preserves the reserve stages',()=>{
    const {game,battle}=startGame({type:'startFacility',facilityId:'classic',teamId:catalog.trainers[0].id});
    const target=battle.sides[0].team[1];battle.applyStatus(target,'poison',{turns:4,fromFoe:false});battle.applyStatus(target,'sleep',{turns:4,fromFoe:false});
    assert.equal(target.conditions.filter(condition=>condition.def.kind==='status').length,2);target.stages.atk=3;target.stages.def=-2;
    const beforeTurn=game.snapshot().battle.turn;game.dispatch({type:'battleItem',itemId:CURE,targetUid:target.uid});
    assert.equal(game.snapshot().battle.turn,beforeTurn+1);assert(!target.conditions.some(condition=>condition.def.kind==='status'));assert.equal(target.stages.atk,3);assert.equal(target.stages.def,-2);
    assert.deepEqual(parse(game).items,base.items);assert.equal(game.snapshot().items.find(item=>item.id===CURE).count,0);assert.equal(game.snapshot().items.find(item=>item.id===CURE).unlimited,true);
  });
  check('Boss and wild NPCs receive no trainer grant while player items remain unlimited after retreat',()=>{
    const save=structuredClone(base);save.items[FINITE_HP]=2;save.items[PP]=2;const game=make(save);game.dispatch({type:'startFacility',facilityId:'random'});game.dispatch({type:'flee'});game.dispatch({type:'closeBattle'});
    const boss=catalog.bosses.find(row=>row.id==='boss_spt_rioss')??catalog.bosses.find(row=>!row.rules?.some(rule=>rule.rule==='no_items')&&!row.requirements?.length);
    assert(boss);game.dispatch({type:'startBattle',bossId:boss.id});assert(game.snapshot().battle,JSON.stringify(game.snapshot().notices));assert.deepEqual(sorted(snapshotItems(game)),sorted(playerExpected));assert.equal(created.at(-1).sides[1].unlimitedItems.size,0);game.dispatch({type:'flee'});game.dispatch({type:'closeBattle'});
    game.dispatch({type:'startTraining',species:22,level:3});assert(game.snapshot().battle);assert.deepEqual(sorted(snapshotItems(game)),sorted(playerExpected));assert.equal(created.at(-1).sides[1].unlimitedItems.size,0);
    const target=game.snapshot().battle.party.find(member=>member.hp>0&&member.hp<member.maxHp);assert(target);const count=parse(game).items[FINITE_HP],beforeTurn=game.snapshot().battle.turn;game.dispatch({type:'battleItem',itemId:FINITE_HP,targetUid:target.uid});assert.equal(game.snapshot().battle.turn,beforeTurn+1);assert.equal(parse(game).items[FINITE_HP],count);
    const ppCount=parse(game).items[PP],beforePpTurn=game.snapshot().battle.turn;game.dispatch({type:'battleItem',itemId:PP,targetUid:target.uid});assert.equal(game.snapshot().battle.turn,beforePpTurn+1);assert.equal(parse(game).items[PP],ppCount);
  });
  check('Legacy HP3000 and PP40 stock survives unchanged but is invisible, unusable, and unavailable to buy',()=>{
    const save=structuredClone(base);for(const [index,id]of retired.entries()){save.items[id]=17+index;save.game.shopUnlocked.push(id);}const game=make(save);
    const hidden=()=>{for(const id of retired){assert.equal(parse(game).items[id],save.items[id]);assert(!game.snapshot().items.some(item=>item.id===id));}assert(!game.snapshot().shopItems.some(item=>retired.includes(item.id)));};
    hidden();for(const itemId of [HP,...retired]){const before=game.exportSave();game.dispatch({type:'buyItem',itemId,quantity:1});assert.equal(game.exportSave(),before);}
    game.dispatch({type:'startFacility',facilityId:'random'});const battle=created.at(-1);assert(game.snapshot().battle);hidden();assert(battle.sides.every(side=>!battle.legalActions(side.index).some(action=>action.kind==='item'&&retired.includes(action.item))));
    for(const itemId of retired){const before=game.exportSave(),turnBefore=game.snapshot().battle.turn;game.dispatch({type:'battleItem',itemId,targetUid:game.snapshot().battle.player.uid});assert.equal(game.exportSave(),before);assert.equal(game.snapshot().battle.turn,turnBefore);}
    game.dispatch({type:'flee'});game.dispatch({type:'closeBattle'});hidden();const restored=make(parse(game));for(const id of retired){assert.equal(parse(restored).items[id],save.items[id]);assert(!restored.snapshot().items.some(item=>item.id===id));}
  });
  check('Validation preserves shared catalog bytes and observes every controller battle through the seam',()=>{assert.equal(JSON.stringify(catalog),catalogBefore);assert(created.length>=entries.length);});
  t.finish({
    publicEntries,
    sourceHashes:Object.fromEntries(['battle/core/src/types.ts','battle/core/src/engine/battle.ts','src/domain/battle-supplies.ts','src/kernel/game.ts','src/kernel/contract.ts',...controllerFiles].map(file=>[file,sha256File(file)])),
    boundary:'Production core/controller behavior. The optional turn-cap test does not prove arbitrary unlimited-supply games must reach a knockout. AI policy is independently verified by potion-ai-v48.',
  });
});
