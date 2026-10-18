/** Independent directed-ancestry and free-shop controller checks; no catalog mutation. */
import assert from 'node:assert/strict';
import {memoryStorage,suite,withSsr} from './_harness.mjs';

memoryStorage();
await withSsr('collection-shop-v25',async load=>{
 const t=suite('collection-shop-v25'),{check}=t;
 const {createGame,loadCatalog}=await load('/src/kernel/game.ts');
 const {buildCollectionAncestry}=await load('/src/domain/acquisition/collection-ancestry.ts');
 const {FUSION_RECIPES,fusionBeadItemId}=await load('/src/domain/recipes/fusion.ts');
 const {normalizeBattleSupplyItems}=await load('/src/domain/battle-supplies.ts');
 const catalog=await loadCatalog(),original=JSON.stringify(catalog);
 const parse=game=>JSON.parse(game.exportSave()),owned=(game,id)=>game.snapshot().species.find(row=>row.id===id)?.owned;
 const raw=parse(createGame(catalog,''));raw.game.coins=0;raw.dex.owned=[];raw.dex.seen=[];raw.storage=raw.storage.filter(mon=>mon.species===1);
 raw.party=raw.storage.map(mon=>mon.uid);raw.rng_state=[101,202,303,404];raw.game.shopUnlocked=[];
 const make=(save=raw)=>createGame(catalog,JSON.stringify(save));
 const count=make().snapshot().monsters.length;
 check('All 1483 directed ancestry closures; reverse-only records; branch exclusion and cyclic termination',()=>{
  // Independent DFS oracle uses forward edges and reverse-source records, rather than the production traversal.
  const edges=catalog.species.flatMap(row=>[...(row.evolution??[]).map(edge=>[row.id,edge.to]),...(row.evolves_from?[[row.evolves_from,row.id]]:[])]);
  const valid=new Set(catalog.species.map(row=>row.id)),ancestry=buildCollectionAncestry(catalog.species);
  for(const row of catalog.species){
   const expected=new Set(),visit=id=>{
    for(const [parent,child] of edges)if(child===id&&valid.has(parent)&&parent!==row.id&&!expected.has(parent)){expected.add(parent);visit(parent)}
   };
   visit(row.id);
   assert.deepEqual([...ancestry.get(row.id)].sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b),`Full-catalog ancestors of ${row.id}`);
  }
  const synthetic=buildCollectionAncestry([{id:1,evolution:[{to:2},{to:4}]},{id:2,evolution:[]},{id:3,evolves_from:2,evolution:[{to:1}]},{id:4,evolution:[]}]);
  assert.deepEqual(new Set(synthetic.get(3)),new Set([1,2]));assert(!synthetic.get(3).includes(4));assert(!synthetic.get(1).includes(1));
 });
 check('Direct Lv100 pooled EXP credits skipped middle form immediately without extra monsters or snapshot mutation',()=>{
  const exp=make(),uid=exp.snapshot().monsters[0].uid,before=exp.snapshot(),beforeSerialized=JSON.stringify(before);
  exp.dispatch({type:'cheatResources',expPool:1e9});exp.dispatch({type:'allocateExp',uid,amount:1e9});
  assert.equal(exp.snapshot().monsters.find(mon=>mon.uid===uid).species,3);assert.equal(exp.snapshot().monsters.length,count);
  for(const id of [1,2,3])assert(owned(exp,id));for(const id of [4,7,19,20,21])assert(!owned(exp,id));assert.equal(JSON.stringify(before),beforeSerialized);
 });
 let cheatLevelAutoEvolution=false;
 check('Direct Lv100 level edit evolves to final form immediately, credits all ancestors, and preserves monster count and prior snapshot',()=>{
  const cheat=make(),cheatPrevious=cheat.snapshot(),cheatPreviousSerialized=JSON.stringify(cheatPrevious);
  cheat.dispatch({type:'cheatMonster',uid:cheat.snapshot().monsters[0].uid,level:100});cheatLevelAutoEvolution=cheat.snapshot().monsters[0].species===3;
  assert.equal(cheat.snapshot().monsters[0].species,3);for(const id of [1,2,3])assert(owned(cheat,id));assert.equal(cheat.snapshot().monsters.length,count);
  assert.equal(JSON.stringify(cheatPrevious),cheatPreviousSerialized);
 });
 check('IV-only editing does not trigger evolution',()=>{
  const statSave=structuredClone(raw);statSave.storage[0].level=100;const stats=make(statSave);
  stats.dispatch({type:'cheatMonster',uid:stats.snapshot().monsters[0].uid,iv:31});assert.equal(stats.snapshot().monsters[0].species,1);
 });
 check('Advanced acquisition and old-save startup/reload backfill ancestors without other starters or additional creatures',()=>{
  const advanced=make();advanced.dispatch({type:'cheatAcquire',species:3,level:100});
  for(const id of [1,2,3])assert(owned(advanced,id));for(const id of [4,7,19,20,21])assert(!owned(advanced,id));
  const legacy=parse(advanced);legacy.dex.owned=[3];legacy.dex.seen=[3];const repaired=make(legacy);
  for(const game of [repaired,make(parse(repaired))])for(const id of [1,2,3])assert(owned(game,id));
  assert.equal(repaired.snapshot().monsters.length,legacy.storage.length);
 });
 // Ordinary products are the runtime item set, which drops the supply tiers without classic-use evidence.
 const nonEssence=normalizeBattleSupplyItems(catalog.items).filter(item=>item.kind!=='essence');
 const shop=make(),supply=shop.snapshot().shopItems.find(item=>item.kind!=='essence');
 const bead=fusionBeadItemId(FUSION_RECIPES[0].outcomes[0].species),essence=`essence_recruit_${catalog.species.find(row=>!row.obtain?.includes('wild')).id}`;
 const earnedSave=structuredClone(raw);earnedSave.items[bead]=1;earnedSave.items[essence]=1;
 const earned=make(earnedSave);
 const allKnownIds=new Set([
  ...catalog.items.filter(item=>item.kind==='essence').map(item=>String(item.id)),
  ...FUSION_RECIPES.flatMap(recipe=>recipe.outcomes.map(outcome=>fusionBeadItemId(outcome.species))),
  ...catalog.species.filter(row=>!row.obtain?.includes('wild')).map(row=>`essence_recruit_${row.id}`),
  ...catalog.bosses.flatMap(boss=>Object.keys(boss.reward?.items??{}).filter(id=>id.startsWith('essence_'))),
 ]);
 check(`All ${allKnownIds.size} defined and generated known essence/bead products are exposed when held`,()=>{
  const allKnownSave=structuredClone(raw);for(const id of allKnownIds)allKnownSave.items[id]=1;const allKnown=make(allKnownSave);
  for(const id of allKnownIds)assert(allKnown.snapshot().shopItems.some(item=>item.id===id),`Known inventory product ${id}`);
 });
 check('All ordinary products including zero stock; held essence/bead discovery; bounded essence refill to six and oversized rejection '
  +'preserve coins/RNG/monsters; consumed essence remains unlocked through reload; prior snapshot immutable',()=>{
  for(const item of nonEssence)assert(shop.snapshot().shopItems.some(row=>row.id===String(item.id)));
  const zero=parse(shop);zero.items[supply.id]=0;assert.equal(make(zero).snapshot().shopItems.find(item=>item.id===supply.id).count,0);
  for(const id of [bead,essence])assert(earned.snapshot().shopItems.some(item=>item.id===id));
  const oldShop=earned.snapshot(),oldShopSerialized=JSON.stringify(oldShop);const preBuy=parse(earned);
  earned.dispatch({type:'buyItem',itemId:bead,quantity:1});const beforeOversize=earned.exportSave();
  earned.dispatch({type:'buyItem',itemId:bead,quantity:999});
  assert.equal(earned.exportSave(),beforeOversize,'Oversized essence restock preserves complete save');
  earned.dispatch({type:'buyItem',itemId:bead,quantity:4});const postBuy=parse(earned);
  assert.equal(postBuy.items[bead],6);assert.equal(postBuy.game.coins,0);
  assert.deepEqual(postBuy.rng_state,preBuy.rng_state);assert.deepEqual(postBuy.storage,preBuy.storage);
  assert.equal(JSON.stringify(oldShop),oldShopSerialized);
  earned.dispatch({type:'useItem',uid:earned.snapshot().monsters[0].uid,itemId:essence});assert.equal(parse(earned).items[essence]??0,0);
  assert(earned.snapshot().shopItems.some(item=>item.id===essence&&item.count===0));
  assert(make(parse(earned)).snapshot().shopItems.some(item=>item.id===essence&&item.count===0));
 });
 check('Legacy first-clear restores known reward essence metadata at zero stock',()=>{
  const clearSave=structuredClone(raw);clearSave.progress.bosses_cleared=['boss_spt_liaosi'];
  const rewards=Object.keys(catalog.bosses.find(boss=>boss.id==='boss_spt_liaosi').reward?.items??{});
  const clearEssence=rewards.find(id=>id.startsWith('essence_'))??'essence_boss_spt_liaosi';
  delete clearSave.items[clearEssence];const cleared=make(clearSave);assert(cleared.snapshot().shopItems.some(item=>item.id===clearEssence&&item.count===0));
 });
 check('Unearned/unknown products, invalid quantities, count overflow and active-battle rejection preserve complete save',()=>{
  const reject=(game,action,label)=>{const previous=game.exportSave();game.dispatch(action);assert.equal(game.exportSave(),previous,label)};
  const hidden=shop.snapshot().shopItems.some(item=>item.id===essence);assert.equal(hidden,false);
  reject(shop,{type:'buyItem',itemId:essence,quantity:1},'Unearned recruit essence');
  // Ordinary products are unlimited and store no stock; the quantity and count limits apply to the finite bead.
  assert(supply.unlimited);for(const quantity of [1,999,1000,NaN])reject(shop,{type:'buyItem',itemId:supply.id,quantity},`Unlimited product ${quantity}`);
  const finite=make(earnedSave);
  for(const quantity of [0,-1,1000,1.5,NaN,Infinity])reject(finite,{type:'buyItem',itemId:bead,quantity},`Invalid quantity ${quantity}`);
  reject(shop,{type:'buyItem',itemId:'missing_product',quantity:1},'Unknown item');
  const overflowSave=parse(finite);overflowSave.items[bead]=Number.MAX_SAFE_INTEGER;
  reject(make(overflowSave),{type:'buyItem',itemId:bead,quantity:1},'Inventory safe integer overflow');
  const fighting=make(earnedSave);fighting.dispatch({type:'startBattle',bossId:'boss_spt_liaosi'});
  assert(fighting.snapshot().battle&&!fighting.snapshot().battle.finished);
  reject(fighting,{type:'buyItem',itemId:bead,quantity:1},'Active battle');
 });
 check('Shared source catalog remains unchanged',()=>assert.equal(JSON.stringify(catalog),original));
 t.finish({ancestrySpecies:catalog.species.length,ordinaryProducts:nonEssence.length,shopProducts:shop.snapshot().shopItems.length,
  knownTestProducts:[bead,essence],knownInventoryProducts:allKnownIds.size,cheatLevelAutoEvolution});
});
