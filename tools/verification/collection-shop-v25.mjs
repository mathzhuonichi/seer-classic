/** Independent directed-ancestry and free-shop controller checks; no catalog mutation. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';
const memory=new Map();
globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
const server=await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom'});
try{
 const {createGame,loadGameData}=await server.ssrLoadModule('/src/game.ts');
 const {buildCollectionAncestry}=await server.ssrLoadModule('/src/progression/collection-ancestry.ts');
 const {FUSION_RECIPES,fusionBeadItemId}=await server.ssrLoadModule('/src/progression/fusion.ts');
 const catalog=await loadGameData(),original=JSON.stringify(catalog);
 const parse=game=>JSON.parse(game.exportSave()),owned=(game,id)=>game.snapshot().species.find(row=>row.id===id)?.owned;
 const raw=parse(createGame(catalog,''));raw.game.coins=0;raw.dex.owned=[];raw.dex.seen=[];raw.storage=raw.storage.filter(mon=>mon.species===1);raw.party=raw.storage.map(mon=>mon.uid);raw.rng_state=[101,202,303,404];raw.game.shopUnlocked=[];
 const make=(save=raw)=>createGame(catalog,JSON.stringify(save));
 const checks=[];
 // Independent DFS oracle uses forward edges and reverse-source records, rather than the production traversal.
 const edges=catalog.species.flatMap(row=>[...(row.evolution??[]).map(edge=>[row.id,edge.to]),...(row.evolves_from?[[row.evolves_from,row.id]]:[])]);
 const valid=new Set(catalog.species.map(row=>row.id)),ancestry=buildCollectionAncestry(catalog.species);
 for(const row of catalog.species){
  const expected=new Set(),visit=id=>{for(const [parent,child] of edges)if(child===id&&valid.has(parent)&&parent!==row.id&&!expected.has(parent)){expected.add(parent);visit(parent)}};visit(row.id);
  assert.deepEqual([...ancestry.get(row.id)].sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b),`Full-catalog ancestors of ${row.id}`);
 }
 const synthetic=buildCollectionAncestry([{id:1,evolution:[{to:2},{to:4}]},{id:2,evolution:[]},{id:3,evolves_from:2,evolution:[{to:1}]},{id:4,evolution:[]}]);
 assert.deepEqual(new Set(synthetic.get(3)),new Set([1,2]));assert(!synthetic.get(3).includes(4));assert(!synthetic.get(1).includes(1));checks.push('All 1483 directed ancestry closures; reverse-only records; branch exclusion and cyclic termination');
 const exp=make(),uid=exp.snapshot().monsters[0].uid,before=exp.snapshot(),beforeSerialized=JSON.stringify(before),count=before.monsters.length;
 exp.dispatch({type:'cheatResources',expPool:1e9});exp.dispatch({type:'allocateExp',uid,amount:1e9});
 assert.equal(exp.snapshot().monsters.find(mon=>mon.uid===uid).species,3);assert.equal(exp.snapshot().monsters.length,count);for(const id of [1,2,3])assert(owned(exp,id));for(const id of [4,7,19,20,21])assert(!owned(exp,id));assert.equal(JSON.stringify(before),beforeSerialized);checks.push('Direct Lv100 pooled EXP credits skipped middle form immediately without extra monsters or snapshot mutation');
 const cheat=make(),cheatPrevious=cheat.snapshot(),cheatPreviousSerialized=JSON.stringify(cheatPrevious);cheat.dispatch({type:'cheatMonster',uid:cheat.snapshot().monsters[0].uid,level:100});
 assert.equal(cheat.snapshot().monsters[0].species,3);for(const id of [1,2,3])assert(owned(cheat,id));assert.equal(cheat.snapshot().monsters.length,count);assert.equal(JSON.stringify(cheatPrevious),cheatPreviousSerialized);checks.push('Direct Lv100 level edit evolves to final form immediately, credits all ancestors, and preserves monster count and prior snapshot');
 const statSave=structuredClone(raw);statSave.storage[0].level=100;const stats=make(statSave);stats.dispatch({type:'cheatMonster',uid:stats.snapshot().monsters[0].uid,iv:31});assert.equal(stats.snapshot().monsters[0].species,1);checks.push('IV-only editing does not trigger evolution');
 const advanced=make();advanced.dispatch({type:'cheatAcquire',species:3,level:100});for(const id of [1,2,3])assert(owned(advanced,id));for(const id of [4,7,19,20,21])assert(!owned(advanced,id));
 const legacy=parse(advanced);legacy.dex.owned=[3];legacy.dex.seen=[3];const repaired=make(legacy);for(const game of [repaired,make(parse(repaired))])for(const id of [1,2,3])assert(owned(game,id));assert.equal(repaired.snapshot().monsters.length,legacy.storage.length);checks.push('Advanced acquisition and old-save startup/reload backfill ancestors without other starters or additional creatures');
 const nonEssence=catalog.items.filter(item=>item.kind!=='essence');const shop=make();for(const item of nonEssence)assert(shop.snapshot().shopItems.some(row=>row.id===String(item.id)));
 const supply=shop.snapshot().shopItems.find(item=>item.kind!=='essence');const zero=parse(shop);zero.items[supply.id]=0;assert.equal(make(zero).snapshot().shopItems.find(item=>item.id===supply.id).count,0);
 const bead=fusionBeadItemId(FUSION_RECIPES[0].outcomes[0].species),essence=`essence_recruit_${catalog.species.find(row=>!row.obtain?.includes('wild')).id}`,earnedSave=structuredClone(raw);earnedSave.items[bead]=1;earnedSave.items[essence]=1;
 const earned=make(earnedSave);for(const id of [bead,essence])assert(earned.snapshot().shopItems.some(item=>item.id===id));
 const allKnownIds=new Set([...catalog.items.filter(item=>item.kind==='essence').map(item=>String(item.id)),...FUSION_RECIPES.flatMap(recipe=>recipe.outcomes.map(outcome=>fusionBeadItemId(outcome.species))),...catalog.species.filter(row=>!row.obtain?.includes('wild')).map(row=>`essence_recruit_${row.id}`),...catalog.bosses.flatMap(boss=>Object.keys(boss.reward?.items??{}).filter(id=>id.startsWith('essence_')))]);
 const allKnownSave=structuredClone(raw);for(const id of allKnownIds)allKnownSave.items[id]=1;const allKnown=make(allKnownSave);for(const id of allKnownIds)assert(allKnown.snapshot().shopItems.some(item=>item.id===id),`Known inventory product ${id}`);checks.push(`All ${allKnownIds.size} defined and generated known essence/bead products are exposed when held`);
 const oldShop=earned.snapshot(),oldShopSerialized=JSON.stringify(oldShop);const preBuy=parse(earned);
 earned.dispatch({type:'buyItem',itemId:bead,quantity:1});const beforeOversize=earned.exportSave();
 earned.dispatch({type:'buyItem',itemId:bead,quantity:999});assert.equal(earned.exportSave(),beforeOversize,'Oversized essence restock preserves complete save');
 earned.dispatch({type:'buyItem',itemId:bead,quantity:4});const postBuy=parse(earned);
 assert.equal(postBuy.items[bead],6);assert.equal(postBuy.game.coins,0);assert.deepEqual(postBuy.rng_state,preBuy.rng_state);assert.deepEqual(postBuy.storage,preBuy.storage);assert.equal(JSON.stringify(oldShop),oldShopSerialized);
 earned.dispatch({type:'useItem',uid:earned.snapshot().monsters[0].uid,itemId:essence});assert.equal(parse(earned).items[essence]??0,0);assert(earned.snapshot().shopItems.some(item=>item.id===essence&&item.count===0));assert(make(parse(earned)).snapshot().shopItems.some(item=>item.id===essence&&item.count===0));
 checks.push('All ordinary products including zero stock; held essence/bead discovery; bounded essence refill to six and oversized rejection preserve coins/RNG/monsters; consumed essence remains unlocked through reload; prior snapshot immutable');
 const clearSave=structuredClone(raw);clearSave.progress.bosses_cleared=['boss_spt_liaosi'];const clearEssence=Object.keys(catalog.bosses.find(boss=>boss.id==='boss_spt_liaosi').reward?.items??{}).find(id=>id.startsWith('essence_'))??'essence_boss_spt_liaosi';delete clearSave.items[clearEssence];const cleared=make(clearSave);assert(cleared.snapshot().shopItems.some(item=>item.id===clearEssence&&item.count===0));checks.push('Legacy first-clear restores known reward essence metadata at zero stock');
 const reject=(game,action,label)=>{const previous=game.exportSave();game.dispatch(action);assert.equal(game.exportSave(),previous,label)};
 const hidden=shop.snapshot().shopItems.some(item=>item.id===essence);assert.equal(hidden,false);reject(shop,{type:'buyItem',itemId:essence,quantity:1},'Unearned recruit essence');
 for(const quantity of [0,-1,1000,1.5,NaN,Infinity])reject(shop,{type:'buyItem',itemId:supply.id,quantity},`Invalid quantity ${quantity}`);
 reject(shop,{type:'buyItem',itemId:'missing_product',quantity:1},'Unknown item');const overflowSave=parse(shop);overflowSave.items[supply.id]=Number.MAX_SAFE_INTEGER;reject(make(overflowSave),{type:'buyItem',itemId:supply.id,quantity:1},'Inventory safe integer overflow');
 const fighting=make();fighting.dispatch({type:'startBattle',bossId:'boss_spt_liaosi'});assert(fighting.snapshot().battle&&!fighting.snapshot().battle.finished);reject(fighting,{type:'buyItem',itemId:supply.id,quantity:1},'Active battle');checks.push('Unearned/unknown products, invalid quantities, count overflow and active-battle rejection preserve complete save');
 assert.equal(JSON.stringify(catalog),original);checks.push('Shared source catalog remains unchanged');
 const report={checks,ancestrySpecies:catalog.species.length,ordinaryProducts:nonEssence.length,shopProducts:shop.snapshot().shopItems.length,knownTestProducts:[bead,essence],knownInventoryProducts:allKnownIds.size,cheatLevelAutoEvolution:cheat.snapshot().monsters[0].species===3};fs.mkdirSync('artifacts/collection-shop-v25',{recursive:true});fs.writeFileSync('artifacts/collection-shop-v25/controller.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await server.close()}
