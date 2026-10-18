/** Transaction boundaries for the six-copy rule across every acquisition entry point. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';
const memory=new Map();
globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
const server=await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error'});
const checks=[],failures=[];
const check=(name,fn)=>{try{fn();checks.push(name)}catch(error){failures.push({name,error:String(error.message).slice(0,2000)});console.error(`FAIL ${name}: ${String(error.message).slice(0,500)}`)}};
try{
 const {createGame,loadCatalog}=await server.ssrLoadModule('/src/kernel/game.ts');
 const {buildRecruitmentRewards}=await server.ssrLoadModule('/src/domain/acquisition/recruitment.ts');
 const {FUSION_RECIPES,fusionBeadItemId,chooseFusionOutcome}=await server.ssrLoadModule('/src/domain/recipes/fusion.ts');
 const {Rng}=await server.ssrLoadModule('/battle/core/src/rng.ts');
 const {BREEDING_RECIPES}=await server.ssrLoadModule('/src/domain/recipes/breeding.ts');
 const {PARTY_MAX,BOX_MAX}=await server.ssrLoadModule('/raising/core/storage.ts');
 const source=await loadCatalog(),sourceBytes=JSON.stringify(source),rewards=buildRecruitmentRewards(source),reward=rewards.find(r=>r.rewardSpecies===143);
 assert(reward);
 // Two distinct inventory aliases deliberately hatch the same species. This catches
 // per-item caps that can be bypassed by combining legacy and new reward items.
 const aliasA=`essence_test_a_${reward.rewardSpecies}`,aliasB=`essence_test_b_${reward.rewardSpecies}`;
 const catalog={...source,items:[...source.items,...[aliasA,aliasB].map(id=>({id,name:{zh:id},kind:'essence',hatches:reward.rewardSpecies}))]},catalogBytes=JSON.stringify(catalog);
 const parse=g=>JSON.parse(g.exportSave()),make=save=>createGame(catalog,JSON.stringify(save));
 const base=parse(createGame(catalog,''));base.rng_state=[101,202,303,404];base.items={item_capsule_master:20,item_level_up_1:10};base.exp_pool=1e9;base.game.recruitmentClaims={};base.game.shopUnlocked=[];
 const reject=(g,action,label)=>{const before=g.exportSave();g.dispatch(action);assert(g.exportSave()===before,label);};
 const templateCache=new Map();
 const template=(species,level=1)=>{
  const key=`${species}:${level}`;if(templateCache.has(key))return structuredClone(templateCache.get(key));
  const g=make(base),count=parse(g).storage.length;g.dispatch({type:'cheatAcquire',species,level});const mon=parse(g).storage[count];assert(mon&&mon.species===species,`Fixture species ${species}`);templateCache.set(key,mon);return structuredClone(mon);
 };
 const copies=(save,species,count,level=1)=>{save.storage=save.storage.filter(m=>m.species!==species);save.party=save.party.filter(uid=>save.storage.some(m=>m.uid===uid));for(let i=0;i<count;i++)save.storage.push({...template(species,level),uid:`fixture-${species}-${level}-${i}`});if(!save.party.length&&save.storage.length)save.party=[save.storage[0].uid];return save;};
 const readySave=()=>{const save=structuredClone(base);for(const p of reward.prerequisites){if(p.kind==='species')save.dex.owned.push(p.species);else save.progress.bosses_cleared.push(p.bossId)}return save;};
 const seedStock=(held=0,reserved=0)=>{const save=copies(readySave(),reward.rewardSpecies,held);save.items[aliasA]=reserved;save.game.shopUnlocked=[aliasA,aliasB,reward.itemId];return save;};
 check('Recruitment counts held creatures and all essence aliases',()=>{
  const g=make(seedStock(2,3));g.dispatch({type:'claimQuest',questId:reward.questId});assert.equal(parse(g).items[reward.itemId],1);
  reject(g,{type:'claimQuest',questId:reward.questId},'2 held + 3 old aliases + 1 new essence must block a seventh copy');
  assert.equal(g.snapshot().quests.find(q=>q.id===reward.questId).allowance.remaining,0);
 });
 check('Shop enforces aggregate remaining allowance; ordinary quantities still reach 999',()=>{
  const g=make(seedStock(2,3));reject(g,{type:'buyItem',itemId:aliasB,quantity:2},'Bulk essence purchase above remaining allowance');
  const before=parse(g);g.dispatch({type:'buyItem',itemId:aliasB,quantity:1});assert.equal(parse(g).items[aliasB],1);assert.deepEqual(parse(g).rng_state,before.rng_state);
  reject(g,{type:'buyItem',itemId:aliasA,quantity:1},'Cross-alias refill after reaching cap');
  const ordinary=g.snapshot().shopItems.find(i=>i.kind!=='essence');assert(ordinary);const old=parse(g).items[ordinary.id]??0;
  g.dispatch({type:'buyItem',itemId:ordinary.id,quantity:999});assert.equal(parse(g).items[ordinary.id],old+999);
 });
 check('Legacy surplus essence is preserved, hatches up to six owned, then rejects atomically',()=>{
  const save=seedStock(0,20),g=make(save);assert.equal(parse(g).items[aliasA],20,'Do not erase old inventory');
  for(let i=0;i<6;i++)g.dispatch({type:'useItem',uid:g.snapshot().party[0],itemId:aliasA});
  assert.equal(parse(g).storage.filter(m=>m.species===reward.rewardSpecies).length,6);assert.equal(parse(g).items[aliasA],14);
  reject(g,{type:'useItem',uid:g.snapshot().party[0],itemId:aliasA},'Seventh hatch preserves essence, storage and RNG');
  assert.equal(parse(make(parse(g))).items[aliasA],14,'Overflow survives reload');
 });
 check('Full storage can claim essence but cannot hatch it or advance RNG',()=>{
  const save=readySave(),filler=template(10);save.storage=[];
  for(let i=0;i<PARTY_MAX+BOX_MAX;i++)save.storage.push({...structuredClone(filler),uid:`full-box-${i}`});
  save.party=save.storage.slice(0,PARTY_MAX).map(m=>m.uid);const g=make(save),before=parse(g);
  g.dispatch({type:'claimQuest',questId:reward.questId});assert.equal(parse(g).items[reward.itemId],1);assert.deepEqual(parse(g).storage,before.storage);assert.deepEqual(parse(g).rng_state,before.rng_state);
  reject(g,{type:'useItem',uid:g.snapshot().party[0],itemId:reward.itemId},'Full box hatch consumes no essence or RNG');
 });
 check('Direct acquisition allows the sixth and rejects the seventh copy',()=>{
  const g=make(copies(structuredClone(base),19,5));g.dispatch({type:'cheatAcquire',species:19,level:1});assert.equal(parse(g).storage.filter(m=>m.species===19).length,6);
  reject(g,{type:'cheatAcquire',species:19,level:1},'Direct acquisition seventh copy');
 });
 check('Capture at cap preserves capsule, battle turn, storage and RNG',()=>{
  const g=make(copies(structuredClone(base),19,6));g.dispatch({type:'startTraining',species:19,level:5});assert.equal(g.snapshot().battle?.canCapture,false);assert.match(g.snapshot().battle?.captureBlockedReason??'',/最多保留 6/);
  const battle=JSON.stringify(g.snapshot().battle);reject(g,{type:'capture',itemId:'item_capsule_master'},'Capture at cap');assert.equal(JSON.stringify(g.snapshot().battle),battle);
 });
 check('Capture fifth to sixth copy still succeeds with a master capsule',()=>{
  const g=make(copies(structuredClone(base),19,5));g.dispatch({type:'startTraining',species:19,level:5});const before=parse(g);g.dispatch({type:'capture',itemId:'item_capsule_master'});
  assert.equal(parse(g).storage.filter(m=>m.species===19).length,6);assert.equal(parse(g).items.item_capsule_master,before.items.item_capsule_master-1);
 });
 check('Fusion rejects a fully capped outcome pool before drawing RNG',()=>{
  const recipe=FUSION_RECIPES.find(r=>r.outcomes.length>1),save=structuredClone(base);assert(recipe);
  const first={...template(recipe.primary[0]),uid:'fusion-primary'},second={...template(recipe.secondary[0]),uid:'fusion-secondary'};save.storage.push(first,second);
  for(const outcome of recipe.outcomes)save.items[fusionBeadItemId(outcome.species)]=6;
  const g=make(save);reject(g,{type:'fuse',recipeId:recipe.id,primaryUid:first.uid,secondaryUid:second.uid},'All fusion outcomes capped');
 });
 check('Fusion single outcome reserves the sixth bead and then stops',()=>{
  const recipe=FUSION_RECIPES.find(r=>r.outcomes.length===1),save=structuredClone(base),first={...template(recipe.primary[0]),uid:'fusion-primary'},second={...template(recipe.secondary[0]),uid:'fusion-secondary'};
  save.storage.push(first,second);const bead=fusionBeadItemId(recipe.outcomes[0].species);save.items[bead]=5;const g=make(save),parents=parse(g).storage;
  const action={type:'fuse',recipeId:recipe.id,primaryUid:first.uid,secondaryUid:second.uid};g.dispatch(action);assert.equal(parse(g).items[bead],6);assert.deepEqual(parse(g).storage,parents);reject(g,action,'Fusion seventh reserved copy');
 });
 check('Partially capped fusion preserves the original outcome and consumes exactly one draw',()=>{
  const recipe=FUSION_RECIPES.find(r=>r.outcomes.length===2),first={...template(recipe.primary[0]),uid:'fusion-primary'},second={...template(recipe.secondary[0]),uid:'fusion-secondary'};
  for(const expected of recipe.outcomes){
   let seed=1;while(chooseFusionOutcome(recipe,new Rng(seed).next()).species!==expected.species){seed++;assert(seed<10000,'Find both original outcome branches');}
   const save=structuredClone(base);save.storage.push(first,second);save.items[fusionBeadItemId(recipe.outcomes[0].species)]=6;save.rng_state=[...new Rng(seed).s];
   const g=make(save),before=parse(g),expectedRng=new Rng(before.rng_state),selected=chooseFusionOutcome(recipe,expectedRng.next());assert.equal(selected.species,expected.species);
   g.dispatch({type:'fuse',recipeId:recipe.id,primaryUid:first.uid,secondaryUid:second.uid});const after=parse(g);
   assert.deepEqual(after.storage,before.storage,'Both actual parents are retained');assert.deepEqual(after.rng_state,expectedRng.s,'Exactly one original probability draw, without resampling');
   const expectedItems={...before.items};if(selected.species!==recipe.outcomes[0].species){const id=fusionBeadItemId(selected.species);expectedItems[id]=(expectedItems[id]??0)+1;}
   assert.deepEqual(after.items,expectedItems,'A full selected species gives no replacement; an available selected species gives its original bead');
  }
 });
 check('Breeding rejects when every possible offspring is capped before RNG',()=>{
  const recipe=BREEDING_RECIPES[0],save=structuredClone(base),first={...template(recipe.maleSpecies[0],50),uid:'breeding-male'},second={...template(recipe.femaleSpecies[0],50),uid:'breeding-female'};
  for(const o of recipe.outcomes)copies(save,o.species,6);save.storage.push(first,second);const g=make(save);
  reject(g,{type:'breed',recipeId:recipe.id,firstUid:first.uid,secondUid:second.uid},'Every breeding outcome capped');
 });
 check('Partially capped breeding retains the original random distribution',()=>{
  const recipe=BREEDING_RECIPES[0],save=copies(structuredClone(base),recipe.outcomes[0].species,6),first={...template(recipe.maleSpecies[0],50),uid:'breeding-male'},second={...template(recipe.femaleSpecies[0],50),uid:'breeding-female'};
  save.storage.push(first,second);save.rng_state=[0,0,0,1];const g=make(save),before=parse(g);g.dispatch({type:'breed',recipeId:recipe.id,firstUid:first.uid,secondUid:second.uid});const after=parse(g);
  assert.deepEqual(after.storage,before.storage,'A roll landing on a full species does not redirect to another outcome');assert.notDeepEqual(after.rng_state,before.rng_state,'Partial-pool draw consumes its original roll');assert.deepEqual(after.items,before.items);
 });
 for(const [name,actionFor,level,target] of [
  ['manual evolution',uid=>({type:'evolve',uid}),18,2],
  ['editor auto evolution',uid=>({type:'cheatMonster',uid,level:100}),1,3],
  ['pooled EXP auto evolution',uid=>({type:'allocateExp',uid,amount:1e9}),1,3],
  ['level item training',uid=>({type:'useItem',uid,itemId:'item_level_up_1'}),17,2],
 ])check(`${name} respects target-species cap without discarding earned training`,()=>{
  const save=copies(structuredClone(base),target,6),mon={...template(1,level),uid:'evolution-source'};save.storage=save.storage.filter(m=>m.species!==1);save.party=save.party.filter(uid=>save.storage.some(m=>m.uid===uid));save.storage.push(mon);if(!save.party.length)save.party=[mon.uid];
  const g=make(save),before=parse(g);
  if(name==='manual evolution')reject(g,actionFor(mon.uid),'Manual evolution at cap preserves complete save');
  else {
   g.dispatch(actionFor(mon.uid));const after=parse(g),trained=after.storage.find(m=>m.uid===mon.uid);
   assert.equal(after.storage.filter(m=>m.species===target).length,6);assert.notEqual(trained.species,target);
   assert.equal(trained.level,name==='level item training'?18:100,'Training itself remains valid at an evolution cap');
   assert.deepEqual(after.rng_state,before.rng_state);
   if(name==='pooled EXP auto evolution')assert(after.exp_pool<before.exp_pool);
   if(name==='level item training')assert.equal(after.items.item_level_up_1,before.items.item_level_up_1-1);
   const released=parse(g),remove=released.storage.find(m=>m.species===target).uid;released.storage=released.storage.filter(m=>m.uid!==remove);released.party=released.party.filter(uid=>uid!==remove);
   const retry=make(released);retry.dispatch({type:'evolve',uid:mon.uid});assert.equal(parse(retry).storage.find(m=>m.uid===mon.uid).species,target);
   assert.equal(parse(retry).storage.filter(m=>m.species===target).length,6);
  }
 });
 check('Shared input catalog remains immutable',()=>{assert.equal(JSON.stringify(source),sourceBytes);assert.equal(JSON.stringify(catalog),catalogBytes)});
 const report={checks,failures,limit:6,storageCapacity:PARTY_MAX+BOX_MAX};fs.mkdirSync('artifacts/acquisition-v32',{recursive:true});fs.writeFileSync('artifacts/acquisition-v32/limits-controller.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));assert.equal(failures.length,0,`${failures.length} acquisition-limit controller checks failed`);
}finally{await server.close();delete globalThis.localStorage;}
