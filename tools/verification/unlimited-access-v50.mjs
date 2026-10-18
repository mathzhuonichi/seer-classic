/** V50 access policy through the real controller, raising core, and battle core. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root,memoryStorage,sha256File,suite,withSsr} from './_harness.mjs';

memoryStorage();
const sort=values=>[...values].sort(),parse=game=>JSON.parse(game.exportSave());
const HP='item_potion_hp_250',PP='item_potion_pp_20',CURE='item_status_cure',CAP='item_capsule_master',WAIT=990500;
const controllerFiles=fs.readdirSync(path.join(root,'src/kernel')).filter(file=>file.endsWith('.ts')).sort().map(file=>`src/kernel/${file}`);
await withSsr('unlimited-access-v50',async load=>{
  const t=suite('unlimited-access-v50'),{check}=t;
  const [{createGame:createProductionGame},{engravings},{engravingAccess},{makeDex,createMonster,useRaisingItem},{createBattle},{buildDataSet,Rng},{SEER_SCRIPTS},{normalizeBattleSupplyItems}]=await Promise.all([
    '/src/kernel/game.ts','/src/domain/engravings/engravings.ts','/src/domain/engravings/engraving-access.ts','/raising/core/index.ts','/tools/verification/_battle.ts','/battle/core/src/index.ts','/battle/core/src/scripts/index.ts','/src/domain/battle-supplies.ts',
  ].map(load));
  const {loadCatalog}=await load('/src/domain/catalog/catalog.ts');
  // The controller's real battles, observed through its battle-factory seam.
  const created=[];
  const createGame=(input,save)=>createProductionGame(input,save,{createBattle:options=>{const battle=createBattle(options);created.push(battle);return battle;}});
  const catalog=await loadCatalog();catalog.items=normalizeBattleSupplyItems([...catalog.items,{id:CURE,name:{zh:'Status cure fixture'},kind:'battle',battle_effects:[{op:'cure_status',target:'self'}]}]);
  const catalogBefore=JSON.stringify(catalog),dex=makeDex(catalog),rng=new Rng(50);
  const genericAbilityCaps=engravings.filter(def=>def.slot==='ability'&&!def.species.length).map(def=>({id:def.id,name:def.name.zh,stats:{...def.stats},levelMin:def.levelMin,sourceMaxOwned:def.maxOwned,...engravingAccess(def)}));
  const ordinary=catalog.items.filter(item=>['raising','battle','capsule'].includes(item.kind)).map(item=>item.id),base=parse(createGame(catalog,''));
  base.rng_state=[101,202,303,404];base.game.traits={};
  const make=(save=base)=>createGame(catalog,JSON.stringify(structuredClone(save)));
  const stock=(game,id)=>parse(game).game.engravingStock[id]??0;
  const equip=(game,uid,id,fromUid)=>game.dispatch({type:'setEngraving',uid,slot:engravings.find(e=>e.id===id).slot,engravingId:id,...(fromUid?{fromUid}:{})});
  const buy=(game,id)=>game.dispatch({type:'buyEngraving',engravingId:id});
  const held=(game,uid,id)=>parse(game).game.modules[uid]?.engravings?.includes(id)??false;
  const reject=(game,action,label)=>{const before=game.exportSave();game.dispatch(action);assert.equal(game.exportSave(),before,label);};
  const fixture=(count=7)=>{const save=structuredClone(base);save.storage=Array.from({length:count},(_,i)=>createMonster(dex,1,100,rng,{uid:`access-${i}`,iv:31,nature:'hardy'}));save.party=save.storage.slice(0,6).map(m=>m.uid);save.game.modules={};save.game.engravingStock={};return save;};
  const start=(game,action)=>{const count=created.length;game.dispatch(action);assert(game.snapshot().battle&&!game.snapshot().battle.finished,JSON.stringify(game.snapshot().notices));assert.equal(created.length,count+1);return created.at(-1);};
  const leave=game=>{game.dispatch({type:'flee'});game.dispatch({type:'closeBattle'});};

  check('All ordinary raising, battle, and capsule items are available without materialized inventory',()=>{
    const save=structuredClone(base);save.items={[CURE]:0};const game=make(save);
    assert.deepEqual(sort(game.snapshot().items.filter(i=>i.unlimited).map(i=>i.id)),sort(ordinary));assert(game.snapshot().items.every(i=>i.count===0));assert.deepEqual(parse(game).items,save.items);
    for(const item of game.snapshot().shopItems.filter(i=>ordinary.includes(i.id)))assert.equal(item.unlimited,true,item.id);
    const before=game.exportSave();for(const id of [HP,CAP,'item_level_up_1'])game.dispatch({type:'buyItem',itemId:id,quantity:7});assert.equal(game.exportSave(),before);
  });
  check('Seven actual controller raising uses work at zero stock and preserve existing finite counts',()=>{
    for(const count of [undefined,3]){
      const save=structuredClone(base),uid=save.storage[0].uid;save.items={[CURE]:0};if(count!==undefined)save.items.item_level_up_1=count;
      const game=make(save),initial=parse(game).storage.find(m=>m.uid===uid).level;
      for(let i=0;i<7;i++){game.dispatch({type:'useItem',uid,itemId:'item_level_up_1'});assert.equal(parse(game).storage.find(m=>m.uid===uid).level,initial+i+1);assert.deepEqual(parse(game).items,save.items);}
    }
    t.witness('raising',{usesPerInventoryVariant:7,inventoryVariants:['missing key','3 finite copies'],finiteCountsPreserved:true});
  });
  check('Raising core defaults remain finite and explicit unlimited boosts keep their nonstacking rule',()=>{
    const item=catalog.items.find(i=>i.id==='item_level_up_1'),save=structuredClone(base),uid=save.storage[0].uid;save.items={};
    assert.throws(()=>useRaisingItem(save,uid,item,dex,rng),/no .* left/);save.items[item.id]=1;
    const finite=useRaisingItem(save,uid,item,dex,rng).save;assert.equal(finite.items[item.id],undefined);assert.equal(save.items[item.id],1);
    const boost=catalog.items.find(i=>i.raising_effect?.op==='boost'),bead=catalog.items.find(i=>i.raising_effect?.op==='energy_bead');
    for(const special of [boost,bead]){assert(special);const initial=structuredClone(base);initial.items={};const boosted=useRaisingItem(initial,uid,special,dex,rng,{unlimited:true}).save;
      assert.deepEqual(boosted.items,{});assert.equal(boosted.boosts.length,(initial.boosts?.length??0)+1);assert.throws(()=>useRaisingItem(boosted,uid,special,dex,rng,{unlimited:true}),/already active/);}
  });
  check('Trainer, Boss, and wild controller entries grant player access while NPC grants stay restricted',()=>{
    const save=fixture(3);save.items={[HP]:2,[PP]:3,[CAP]:4,[CURE]:0};for(const m of save.storage)m.hp=1;
    const game=make(save),boss=catalog.bosses.find(b=>b.id==='boss_spt_rioss')??catalog.bosses.find(b=>!b.requirements?.length&&!b.rules?.some(r=>r.rule==='no_items'));
    const entries=[{type:'startFacility',facilityId:'classic',teamId:catalog.trainers[0].id},{type:'startBattle',bossId:boss.id},{type:'startTraining',species:10,level:3}];
    for(const action of entries){game.importSave(JSON.stringify(save));const b=start(game,action);assert.deepEqual(sort(b.sides[0].unlimitedItems),sort(ordinary));assert.deepEqual(sort(b.sides[1].unlimitedItems),b.sides[1].kind==='trainer'?sort([HP,PP,CURE]):[]);
      const target=b.sides[0].team[1],before=target.hp,turn=b.turn;game.dispatch({type:'battleItem',itemId:HP,targetUid:target.uid});assert.equal(b.turn,turn+1);assert.equal(target.hp,Math.min(target.maxHp,before+250));assert.deepEqual(parse(game).items,save.items);leave(game);}
    assert.deepEqual(sort(game.snapshot().items.filter(i=>i.unlimited).map(i=>i.id)),sort(ordinary));
  });
  check('The bag uses raising items on any monster outside battle, and supplies on the members they help and capsules in one',()=>{
    const save=fixture(3);save.items={[CURE]:0};save.storage[0].hp=1;const game=make(save),row=id=>game.snapshot().items.find(i=>i.id===id);
    assert.deepEqual([row('item_level_up_1').useAction,row('item_level_up_1').useTargets],['use',save.storage.map(m=>m.uid)]);
    assert.deepEqual([row(HP).useAction,row(CAP).useAction],[null,null],'supplies and capsules wait for a battle');
    start(game,{type:'startTraining',species:10,level:3});
    assert.deepEqual([row(HP).useAction,row(HP).useTargets],['use',[save.storage[0].uid]],'only the injured member');
    assert.deepEqual([row(CAP).useAction,row('item_level_up_1').useAction],['capture',null]);
    leave(game);assert.equal(row(CAP).useAction,null);
  });
  check('A raising item\'s notice names the monster by its nickname',()=>{
    const save=structuredClone(base),uid=save.storage[0].uid;save.items={[CURE]:0};const game=make(save);
    game.dispatch({type:'rename',uid,name:'Bob'});
    assert.equal(game.dispatch({type:'useItem',uid,itemId:'item_level_up_1'}).notice,'已对Bob使用小型升级秘药。');
  });
  check('A hatch notice says whether the new monster joined the party or storage',()=>{
    for(const [count,place] of [[1,'背包'],[6,'仓库']]){
      const save=fixture(count);save.items={[CURE]:0,essence_liaosi:1};const game=make(save);
      const {notice}=game.dispatch({type:'useItem',uid:save.party[0],itemId:'essence_liaosi'});
      const hatched=game.snapshot().monsters.find(m=>!save.storage.some(old=>old.uid===m.uid));
      assert.deepEqual([notice,hatched.inParty],[`精元孵化成功：${hatched.speciesName}已加入${place}！`,place==='背包']);
    }
  });
  check('Repeated real controller captures at zero stock add the caught monsters without inventing stock',()=>{
    const save=fixture(1);save.items={[CURE]:0};const game=make(save);
    for(const species of [10,13]){const before=parse(game).storage.length;start(game,{type:'startTraining',species,level:3});game.dispatch({type:'capture',itemId:CAP});
      assert.equal(game.snapshot().battle.captured,true,JSON.stringify(game.snapshot().notices));assert.equal(parse(game).storage.length,before+1);assert.equal(parse(game).storage.at(-1).species,species);assert.deepEqual(parse(game).items,save.items);game.dispatch({type:'closeBattle'});}
    t.witness('controller-capture',{successfulCaptures:2,capsule:CAP,initialStock:0,finalStock:0});
  });

  const probe=structuredClone(catalog);probe.skills.push({id:WAIT,name:{zh:'Access wait fixture'},type:'normal',category:'status',target:'self',power:0,accuracy:null,pp:99,effects:[]});
  const failCap=probe.items.find(item=>item.id===CAP);failCap.capture_multiplier=0;
  const data=buildDataSet(probe),mon=uid=>({uid,species:1,level:100,skills:[WAIT],stats:{hp:750,atk:100,def:100,spa:100,spd:100,spe:100}});
  const core=({unlimited=true,items={},rules=[]}={})=>createBattle({data,scripts:SEER_SCRIPTS,seed:50,sides:[{kind:'player',team:[mon('player')],items,unlimited_items:unlimited?[HP,CAP]:[]},{kind:'wild',team:[mon('wild')],rules}]});
  const turn=(b,a)=>{b.submit(0,a);b.submit(1,{kind:'move',skill:WAIT});return b.resolveTurn();};
  check('Seven failed capsule attempts and seven HP uses each spend a turn without consuming stock',()=>{
    const b=core();for(let i=0;i<7;i++){const before=b.turn,events=turn(b,{kind:'capture',item:CAP});assert.equal(b.turn,before+1);assert(events.some(e=>e.type==='capture_attempt'&&!e.success));assert.deepEqual(b.sides[0].items,{});}
    for(let i=0;i<7;i++){b.active(0).hp=1;const before=b.turn;turn(b,{kind:'item',item:HP,target:0});assert.equal(b.turn,before+1);assert.equal(b.active(0).hp,251);assert.deepEqual(b.sides[0].items,{});}
    t.witness('core-repeated-use',{failedCaptures:7,hpUses:7,capsuleMultiplierFixture:0,turnsSpent:14});
  });
  check('Core finite capsule exhaustion and no-items/no-capture gates are preserved',()=>{
    const finite=core({unlimited:false,items:{[CAP]:2,[HP]:1}});for(let i=0;i<2;i++)turn(finite,{kind:'capture',item:CAP});assert.equal(finite.sides[0].items[CAP],0);assert(!finite.legalActions(0).some(a=>a.kind==='capture'));
    finite.active(0).hp=1;turn(finite,{kind:'item',item:HP,target:0});assert.equal(finite.sides[0].items[HP],0);finite.active(0).hp=1;assert(!finite.legalActions(0).some(a=>a.kind==='item'));
    const gated=core({rules:[{rule:'no_items'},{rule:'no_capture'}]});gated.active(0).hp=1;assert(!gated.legalActions(0).some(a=>['capture','item'].includes(a.kind)));
    assert.throws(()=>gated.submit(0,{kind:'capture',item:CAP}),/illegal action/);assert.throws(()=>gated.submit(0,{kind:'item',item:HP,target:0}),/illegal action/);
  });
  check('Legacy inventory values round trip unchanged and no access flags or nonfinite numbers enter saves',()=>{
    const save=structuredClone(base);save.items={[HP]:7,[CAP]:9,[CURE]:0,item_potion_hp_3000:11,item_potion_pp_40:13};save.game.engravingStock={'10037':99,'10039':9,'20001':4};
    const game=make(save),loaded=parse(game);assert.deepEqual(loaded.items,save.items);assert.deepEqual(loaded.game.engravingStock,save.game.engravingStock);
    game.importSave(game.exportSave());assert.deepEqual(parse(game).items,save.items);assert.deepEqual(parse(game).game.engravingStock,save.game.engravingStock);
    assert(!/Infinity|unlimited/.test(game.exportSave()));assert(Object.values(parse(game).items).every(Number.isFinite));
  });

  check('Published cap tiers are per generic ability ID, and all exclusive/skill marks are unlimited',()=>{
    assert.equal(genericAbilityCaps.length,62);
    const expected={'10001':6,'10013':4,'10031':2,'10037':1,'10038':1,'10134':2};
    for(const [id,cap] of Object.entries(expected))assert.deepEqual(engravingAccess(engravings.find(e=>e.id===id)),{unlimited:false,maxOwned:cap},id);
    // Exercise the otherwise absent gain=25 band explicitly at the access boundary.
    assert.equal(engravingAccess({...engravings[0],stats:{atk:25},species:[],slot:'ability'}).maxOwned,3);
    for(const e of engravings)assert.equal(engravingAccess(e).unlimited,e.slot==='skill'||e.species.length>0,e.id);
    const game=make(fixture());for(const id of ['10037','10033']){buy(game,id);buy(game,id);assert.equal(stock(game,id),1,id);}
    t.witness('independent-caps',{speed18:{id:'10037',cap:1},speed15:{id:'10031',cap:2},otherCap1:{id:'10033',stock:stock(game,'10033')}});
  });
  check('Every generic ability mark enforces its own stock-plus-equipped ownership cap',()=>{
    for(const def of engravings.filter(e=>e.slot==='ability'&&!e.species.length)){
      const save=fixture(),game=make(save),cap=engravingAccess(def).maxOwned;
      for(let i=0;i<cap;i++)buy(game,def.id);assert.equal(stock(game,def.id),cap,def.id);reject(game,{type:'buyEngraving',engravingId:def.id},`${def.id} buy cap`);
      equip(game,save.storage[0].uid,def.id);assert(held(game,save.storage[0].uid,def.id));assert.equal(stock(game,def.id),cap-1);reject(game,{type:'buyEngraving',engravingId:def.id},`${def.id} equipped ownership`);
    }
  });
  check('Automatic and explicit holder transfer preserve ownership and both holders other state',()=>{
    const save=fixture(),game=make(save),[a,b,c]=save.storage.map(m=>m.uid),id='10037';buy(game,id);equip(game,a,id);
    const initial=parse(game);initial.game.modules[a].engravingDeficit={hp:8,pp:{10001:2}};initial.game.modules[b]={engravings:[],engravingDeficit:{hp:3}};game.importSave(JSON.stringify(initial));
    equip(game,b,id);assert(!held(game,a,id));assert(held(game,b,id));assert.equal(stock(game,id),0);assert.deepEqual(parse(game).game.modules[a].engravingDeficit,{hp:8,pp:{10001:2}});assert.deepEqual(parse(game).game.modules[b].engravingDeficit,{hp:3});
    equip(game,c,id,b);assert(!held(game,b,id));assert(held(game,c,id));assert.equal(stock(game,id),0);
    assert.equal(Object.values(parse(game).game.modules).filter(m=>m.engravings?.includes(id)).length,1);
  });
  check('Rejected transfers validate target eligibility and source before changing either holder',()=>{
    const save=fixture(),[a,b,c]=save.storage.map(m=>m.uid);save.storage[1].level=99;const game=make(save);buy(game,'10037');equip(game,a,'10037');
    reject(game,{type:'setEngraving',uid:b,slot:'ability',engravingId:'10037',fromUid:a},'low-level target does not strip source');
    reject(game,{type:'setEngraving',uid:c,slot:'ability',engravingId:'10037',fromUid:b},'invalid source does not change target');
    reject(game,{type:'setEngraving',uid:c,slot:'skill',engravingId:'10037',fromUid:a},'slot validation precedes transfer');assert(held(game,a,'10037'));
  });
  check('Replacing finite marks returns the replaced copy while transfer consumes no spare copy',()=>{
    const save=fixture(),game=make(save),[a,b]=save.storage.map(m=>m.uid);for(const id of ['10037','10033'])buy(game,id);equip(game,a,'10037');equip(game,b,'10033');
    equip(game,b,'10037',a);assert(!held(game,a,'10037'));assert(held(game,b,'10037'));assert.equal(stock(game,'10037'),0);assert.equal(stock(game,'10033'),1);
    game.dispatch({type:'setEngraving',uid:b,slot:'ability',engravingId:null});assert.equal(stock(game,'10037'),1);
  });
  check('Legacy stock 99 is preserved and cannot create additional active copies past the new cap',()=>{
    const save=fixture(),[a,b,c]=save.storage.map(m=>m.uid);save.game.engravingStock={'10037':99};const game=make(save);equip(game,a,'10037');assert.equal(stock(game,'10037'),98);
    equip(game,b,'10037');assert(!held(game,a,'10037'));assert(held(game,b,'10037'));assert.equal(stock(game,'10037'),98);
    equip(game,c,'10037');assert(!held(game,b,'10037'));assert(held(game,c,'10037'));assert.equal(stock(game,'10037'),98);reject(game,{type:'buyEngraving',engravingId:'10037'},'legacy over-cap inventory cannot buy more');
    game.dispatch({type:'setEngraving',uid:c,slot:'ability',engravingId:null});assert.equal(stock(game,'10037'),99);
  });
  check('All 546 marks retain actual controller species, level, and learned-move gates',()=>{
    const counts={equipped:0,lowLevelRejected:0,wrongSpeciesRejected:0,missingMoveRejected:0,unlimitedWithoutPurchase:0};
    const game=make();
    for(const def of engravings){
      const species=def.species[0]??(def.slot==='skill'?catalog.species.find(s=>s.learnset.some(l=>def.moveIds.includes(l.skill)))?.id:1);assert(species,def.id);
      const save=structuredClone(base),mon=createMonster(dex,species,100,rng,{uid:'gate-holder',iv:31,nature:'hardy'});save.storage=[mon];save.party=[mon.uid];save.game.modules={};save.game.engravingStock={};
      if(def.slot==='skill'){mon.learned=[...new Set([...mon.learned,...def.moveIds])];mon.skills=[def.moveIds[0],...mon.skills.filter(id=>id!==def.moveIds[0])].slice(0,4);mon.pp=Object.fromEntries(mon.skills.map(id=>[id,dex.skill(id).pp]));}
      const unlimited=def.slot==='skill'||def.species.length>0;if(!unlimited)save.game.engravingStock[def.id]=1;
      game.importSave(JSON.stringify(save));equip(game,mon.uid,def.id);assert(held(game,mon.uid,def.id),def.id);const view=game.snapshot().monsters[0].engravings[def.slot];assert.equal(view?.id,def.id);assert.equal(view.ready,true);counts.equipped++;if(unlimited){counts.unlimitedWithoutPurchase++;assert.deepEqual(parse(game).game.engravingStock,{});}
      if(def.levelMin>1){const low=structuredClone(save);low.storage[0].level=def.levelMin-1;game.importSave(JSON.stringify(low));reject(game,{type:'setEngraving',uid:mon.uid,slot:def.slot,engravingId:def.id},`${def.id} low level`);counts.lowLevelRejected++;}
      if(def.species.length){const wrong=structuredClone(save);wrong.storage[0].species=catalog.species.find(s=>!def.species.includes(s.id)).id;game.importSave(JSON.stringify(wrong));reject(game,{type:'setEngraving',uid:mon.uid,slot:def.slot,engravingId:def.id},`${def.id} species`);counts.wrongSpeciesRejected++;}
      if(def.slot==='skill'){const missing=structuredClone(save),other=catalog.skills.find(s=>!def.moveIds.includes(s.id));missing.storage[0].skills=[other.id];missing.storage[0].learned=[other.id];missing.storage[0].pp={[other.id]:other.pp};game.importSave(JSON.stringify(missing));reject(game,{type:'setEngraving',uid:mon.uid,slot:def.slot,engravingId:def.id},`${def.id} missing learned move`);counts.missingMoveRejected++;}
    }
    assert.equal(counts.equipped,546);assert.equal(counts.missingMoveRejected,399);t.witness('all-mark-qualification',{...counts});
  });
  check('Catalog data remains byte-equivalent after controller and core access probes',()=>assert.equal(JSON.stringify(catalog),catalogBefore));
  const files=['src/kernel/game.ts','src/domain/engravings/engraving-access.ts','raising/core/items.ts','battle/core/src/engine/battle.ts','src/domain/battle-supplies.ts'];
  t.finish({
    genericAbilityCaps,genericAbilityCapsSource:'Runtime engravingAccess(def); sourceMaxOwned records the unchanged 2013 catalog value.',
    sourceHashes:Object.fromEntries([...files,...controllerFiles].map(file=>[file,sha256File(file)])),
  });
});
