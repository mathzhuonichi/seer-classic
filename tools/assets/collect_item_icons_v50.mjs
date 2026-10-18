/** Collect real controller item definitions without touching a browser or player save. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
process.chdir(root);
const memory=new Map();
globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
const server=await createServer({root,configFile:false,server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error'});
try {
  const [{createGame},{loadCatalog},{FUSION_RECIPES,fusionBeadItemId},{buildRecruitmentRewards}]=await Promise.all([
    '/src/kernel/game.ts','/src/domain/catalog/catalog.ts','/src/domain/recipes/fusion.ts','/src/domain/acquisition/recruitment.ts',
  ].map(file=>server.ssrLoadModule(file)));
  const catalog=await loadCatalog();
  const ids=new Set(catalog.items.map(item=>String(item.id)));
  for(const boss of catalog.bosses){ids.add(`essence_${boss.id}`);for(const id of Object.keys(boss.reward?.items??{}))ids.add(id);}
  for(const species of catalog.species)ids.add(`essence_recruit_${species.id}`);
  for(const recipe of FUSION_RECIPES)for(const outcome of recipe.outcomes)ids.add(fusionBeadItemId(outcome.species));
  for(const reward of buildRecruitmentRewards(catalog))ids.add(reward.itemId);
  const game=createGame(catalog,''),save=JSON.parse(game.exportSave());
  save.game.shopUnlocked=[...ids];
  const known=createGame(catalog,JSON.stringify(save)).snapshot().shopItems;
  const byId=new Map(catalog.items.map(item=>[String(item.id),item]));
  const items=known.map(item=>({id:item.id,name:item.name,kind:item.kind,...(item.hatches?{hatches:item.hatches}:{}),...(byId.get(item.id)?.seer_id?{seer_id:byId.get(item.id).seer_id}:{})}));
  for(const item of [{id:'item_potion_hp_250',name:'极限体力药剂',kind:'battle',seer_id:300072},{id:'item_status_cure',name:'异常解除剂',kind:'battle'}]){
    const existing=items.find(entry=>entry.id===item.id);
    if(existing)Object.assign(existing,item);else items.push(item);
  }
  const target=path.join(root,'.cache/item-icons-v50/runtime-items.json');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify({items,fusionOutcomes:FUSION_RECIPES.flatMap(recipe=>recipe.outcomes)},null,2)+'\n');
  console.log(`Collected ${items.length} runtime item definitions.`);
} finally {await server.close();}
