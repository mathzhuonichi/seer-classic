/** Transaction boundaries for the six-copy rule across every acquisition entry point. */
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {memoryStorage,suite,withSsr} from './_harness.mjs';

/** The seed of the fixture's journey; a new journey would seed itself from the clock. */
const JOURNEY_SEED=0xac9c1a;

memoryStorage();
await withSsr('acquisition-limits-controller',async load=>{
 const t=suite('acquisition-limits-controller'),{check}=t;
 const {createGame}=await load('/src/kernel/game.ts');
 const {loadCatalog}=await load('/src/domain/catalog/catalog.ts');
 const {newSave}=await load('/src/kernel/save.ts');
 const {buildRecruitmentRewards}=await load('/src/domain/acquisition/recruitment.ts');
 const {FUSION_RECIPES,fusionBeadItemId,chooseFusionOutcome}=await load('/src/domain/recipes/fusion.ts');
 const {Rng}=await load('/battle/core/src/rng.ts');
 const {BREEDING_RECIPES}=await load('/src/domain/recipes/breeding.ts');
 const {engravings}=await load('/src/domain/engravings/engravings.ts');
 const {engravingAccess}=await load('/src/domain/engravings/engraving-access.ts');
 const {PARTY_MAX,BOX_MAX}=await load('/raising/core/storage.ts');
 const {STORAGE_FULL_REASON}=await load('/src/kernel/acquire.ts');
 const {default:ProfileTab}=await load('/src/features/raising/ui/raising/ProfileTab.tsx');
 const {SHOP_MAX_QUANTITY,STARTER_LEVEL,STARTER_SPECIES}=await load('/src/domain/economy.ts');
 const {expToNext}=await load('/raising/core/growth.ts');
 const source=await loadCatalog(),sourceBytes=JSON.stringify(source),rewards=buildRecruitmentRewards(source),reward=rewards.find(r=>r.rewardSpecies===143);
 assert(reward);
 // Two distinct inventory aliases deliberately hatch the same species. This catches
 // per-item caps that can be bypassed by combining legacy and new reward items.
 const aliasA=`essence_test_a_${reward.rewardSpecies}`,aliasB=`essence_test_b_${reward.rewardSpecies}`;
 const catalog={...source,items:[...source.items,...[aliasA,aliasB].map(id=>({id,name:{zh:id},kind:'essence',hatches:reward.rewardSpecies}))]},catalogBytes=JSON.stringify(catalog);
 const parse=g=>JSON.parse(g.exportSave()),make=save=>createGame(catalog,JSON.stringify(save));
 const journey=make(newSave(JOURNEY_SEED));for(const species of STARTER_SPECIES)journey.dispatch({type:'cheatAcquire',species,level:STARTER_LEVEL});
 const base=parse(journey);base.rng_state=[101,202,303,404];base.items={item_capsule_master:20,item_level_up_1:10};base.exp_pool=1e9;
 base.game.recruitmentClaims={};base.game.shopUnlocked=[];
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
 check('Shop enforces aggregate remaining allowance; ordinary products are unlimited at the full quantity',()=>{
  const g=make(seedStock(2,3));reject(g,{type:'buyItem',itemId:aliasB,quantity:2},'Bulk essence purchase above remaining allowance');
  const before=parse(g);g.dispatch({type:'buyItem',itemId:aliasB,quantity:1});assert.equal(parse(g).items[aliasB],1);assert.deepEqual(parse(g).rng_state,before.rng_state);
  reject(g,{type:'buyItem',itemId:aliasA,quantity:1},'Cross-alias refill after reaching cap');
  const ordinary=g.snapshot().shopItems.find(i=>i.kind!=='essence');assert(ordinary?.unlimited);assert.equal(ordinary.maxQuantity,SHOP_MAX_QUANTITY);
  const stock=g.exportSave();assert.equal(g.dispatch({type:'buyItem',itemId:ordinary.id,quantity:SHOP_MAX_QUANTITY}).ok,true);
  assert.equal(g.exportSave(),stock,'An unlimited product persists no artificial stock');
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
 check('放生 takes a stored or party monster with its trait, bead and engravings, never the last party monster',()=>{
  const save=structuredClone(base),[lead,second,third]=save.party,finite=engravings.find(def=>!engravingAccess(def).unlimited);assert(finite);
  save.game.modules[second]={engravings:[finite.id]};save.game.engravingStock={};
  save.boosts=[{kind:'energy_bead',item:'bead',uid:second,battles_left:3,stats:{atk:10}},{kind:'exp',item:'exp',multiplier:2,battles_left:3}];
  const g=make(save);assert(parse(g).game.traits[second],'Fixture monster has a trait');
  // The pet bag's 资料 tab offers 放生 for any monster but the last one in the party.
  const monster=uid=>g.snapshot().monsters.find(m=>m.uid===uid);
  const releaseSection=uid=>renderToStaticMarkup(React.createElement(ProfileTab,{m:monster(uid),c:g,feedback:'',say(){}}))
   .match(/<section class="raising-release">.*?<\/section>/)?.[0]??'';
  const releaseButton=uid=>releaseSection(uid).match(/<button[^>]*>放生[^<]*<\/button>/)?.[0]??'';
  assert.match(releaseButton(second),/^<button>放生/,'A party monster with company can be released');
  assert.equal(monster(second).releaseBlockedReason,undefined);
  g.dispatch({type:'release',uid:second});const after=parse(g);
  assert.deepEqual(after.party,[lead,third]);assert(!after.storage.some(m=>m.uid===second));assert.equal(after.game.traits[second],undefined);
  assert.equal(after.game.modules[second],undefined);assert.equal(after.game.engravingStock[finite.id],1,'A finite engraving returns to stock');
  assert.deepEqual(after.boosts,[save.boosts[1]],'The bead of the released monster goes with it');
  assert.deepEqual(after.dex,save.dex,'The collection record stays');
  assert.deepEqual(parse(make(after)).storage,after.storage,'The released save reloads as is');
  g.dispatch({type:'release',uid:third});reject(g,{type:'release',uid:lead},'The last party monster stays');
  const refusal=g.snapshot().notices[0];assert.match(refusal,/最后一只出战精灵不能放生/);
  assert.equal(monster(lead).releaseBlockedReason,refusal,'The monster view carries the refusal the action gives');
  assert(releaseSection(lead).includes(`<p>${refusal}</p>`),'The bag states that refusal');
  assert.match(releaseButton(lead),/^<button disabled="">放生/,'The bag disables 放生 for the last party monster');
 });
 check('A full box blocks a journey reward in its row until 放生 frees a place',()=>{
  const save=structuredClone(base),filler=template(19);save.game.battlesWon=1;save.storage=[];save.game.traits={};
  for(let i=0;i<PARTY_MAX+BOX_MAX;i++)save.storage.push({...structuredClone(filler),uid:`full-box-${i}`});
  save.party=save.storage.slice(0,PARTY_MAX).map(m=>m.uid);const g=make(save),row=()=>g.snapshot().quests.find(q=>q.id==='first-victory');
  assert.equal(row().complete,true);assert.equal(row().claimable,false,'The row, its button and the quest alert agree with the claim');
  assert.match(row().blockedReason??'',/仓库已满.*放生/);reject(g,{type:'claimQuest',questId:'first-victory'},'A full box refuses the journey monster');
  g.dispatch({type:'release',uid:`full-box-${PARTY_MAX}`});assert.equal(parse(g).storage.length,PARTY_MAX+BOX_MAX-1);
  assert.equal(row().claimable,true);assert.equal(row().blockedReason,undefined);
  g.dispatch({type:'claimQuest',questId:'first-victory'});assert(parse(g).game.quests.includes('first-victory'));assert.equal(row().claimed,true);
 });
 check('A full box refuses a capture with the journey row\'s text, which points to 放生',()=>{
  const save=structuredClone(base),filler=template(19);save.storage=[];save.game.traits={};
  for(let i=0;i<PARTY_MAX+BOX_MAX;i++)save.storage.push({...structuredClone(filler),uid:`full-box-${i}`});
  save.party=save.storage.slice(0,PARTY_MAX).map(m=>m.uid);const g=make(save);g.dispatch({type:'startTraining',species:22,level:3});
  const view=g.snapshot().battle;assert.equal(view.canCapture,false);assert.equal(view.captureBlockedReason,STORAGE_FULL_REASON);
  assert.match(view.captureBlockedReason,/放生/);const before=g.exportSave();
  assert.deepEqual(g.dispatch({type:'capture',itemId:'item_capsule_master'}),{ok:false,notice:STORAGE_FULL_REASON});assert.equal(g.exportSave(),before);
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
  assert.equal(parse(g).storage.filter(m=>m.species===19).length,6);
  assert.equal(parse(g).items.item_capsule_master,before.items.item_capsule_master,'Unlimited capsules keep the saved count');
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
   if(name==='level item training')assert.equal(after.items.item_level_up_1,before.items.item_level_up_1,'Unlimited raising items keep the saved count');
   // 放生 one copy of the target frees the allowance the cap notice asks for.
   g.dispatch({type:'release',uid:parse(g).storage.find(m=>m.species===target).uid});
   g.dispatch({type:'evolve',uid:mon.uid});assert.equal(parse(g).storage.find(m=>m.uid===mon.uid).species,target);
   assert.equal(parse(g).storage.filter(m=>m.species===target).length,6);
  }
 });
 /** Two 布布种子 one point short of Lv18, with `held` 布布草, both take part in a won wild battle: the lead, then the one switched in to win. */
 const seedsWin=held=>{
  const save=copies(structuredClone(base),2,held),seeds=['lead','relief'].map(role=>({...template(1,17),uid:`battle-evolution-${role}`}));
  for(const mon of seeds)mon.exp=expToNext(source.species.find(species=>species.id===1).growth,17)-1;
  save.storage=save.storage.filter(m=>m.species!==1);save.storage.push(...seeds);save.party=seeds.map(mon=>mon.uid);
  const g=make(save);g.dispatch({type:'startTraining',species:22,level:3});g.dispatch({type:'switch',uid:seeds[1].uid});
  for(let turn=0;turn<10&&!g.snapshot().battle.finished;turn++)g.dispatch({type:'move',skillId:g.snapshot().battle.player.skills.find(skill=>skill.power>0&&skill.pp>0).id});
  const view=g.snapshot().battle;assert(view.won,'a Lv17 布布种子 beats a Lv3 wild monster');
  assert.equal(g.snapshot().notices[0],view.result,'the settlement notice carries the same text');
  return {view,trained:seeds.map(mon=>parse(g).storage.find(m=>m.uid===mon.uid)).map(m=>[m.species,m.level])};
 };
 const KEPT_BACK='布布草最多保留 6 份（已有 6 只、待孵化 0 份）。本次保留当前形态与已获得的经验，腾出额度后可手动进化。';
 check('A battle win whose experience reaches a capped evolution keeps the form and says why in the result text, once per line',()=>{
  const {view,trained}=seedsWin(6);assert.deepEqual(trained,[[1,18],[1,18]]);
  assert.match(view.result,new RegExp(`^获得 \\d+ 赛尔豆及 \\d+ 积累经验。${KEPT_BACK}$`),'the shared reason is given once');
 });
 check('A battle win announces each automatic evolution in the result text, next to an evolution kept back',()=>{
  const free=seedsWin(0);assert.deepEqual(free.trained,[[2,18],[2,18]]);
  assert.match(free.view.result,/^获得 \d+ 赛尔豆及 \d+ 积累经验。布布种子进化为布布草。$/,'two alike evolutions share one line');
  const last=seedsWin(5);assert.deepEqual(last.trained,[[2,18],[1,18]],'the lead takes the sixth 布布草');
  assert.match(last.view.result,new RegExp(`^获得 \\d+ 赛尔豆及 \\d+ 积累经验。布布种子进化为布布草。${KEPT_BACK}$`));
 });
 check('Shared input catalog remains immutable',()=>{assert.equal(JSON.stringify(source),sourceBytes);assert.equal(JSON.stringify(catalog),catalogBytes)});
 t.finish({limit:6,storageCapacity:PARTY_MAX+BOX_MAX});
});
