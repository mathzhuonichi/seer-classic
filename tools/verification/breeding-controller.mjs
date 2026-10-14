/** Independent controller transactions for source-backed breeding. Test fixtures never edit the source catalog. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';
const memory=new Map();
globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const {createGame,loadGameData}=await server.ssrLoadModule('/src/game.ts');
  const {BREEDING_RECIPES:recipes,getBreedingGender}=await server.ssrLoadModule('/src/progression/breeding.ts');
  const {deserialize}=await server.ssrLoadModule('/raising/game/save.ts');
  const {makeDex,gainLevels,autoEvolve}=await server.ssrLoadModule('/raising/core/index.ts');
  const catalog=await loadGameData(),originalCatalog=JSON.stringify(catalog),dex=makeDex(catalog);
  const base=JSON.parse(createGame(catalog,'').exportSave());base.game.coins=0;
  const parse=game=>JSON.parse(game.exportSave());
  const fixture=(recipe,roll=0)=>{
    const game=createGame(catalog,JSON.stringify(base));
    game.dispatch({type:'cheatAcquire',species:recipe.maleSpecies[0],level:50});
    game.dispatch({type:'cheatAcquire',species:recipe.femaleSpecies[0],level:50});
    const save=parse(game),male=save.storage.at(-2),female=save.storage.at(-1);
    delete male.generation;delete female.generation;
    save.game.coins=0;save.rng_state=[Math.floor(roll*4294967296),0,0,0];
    return {game:createGame(catalog,JSON.stringify(save)),maleUid:male.uid,femaleUid:female.uid};
  };
  const action=(recipe,pair)=>({type:'breed',recipeId:recipe.id,firstUid:pair.maleUid,secondUid:pair.femaleUid});
  const reject=(game,request,label)=>{const before=game.exportSave();game.dispatch(request);assert.equal(game.exportSave(),before,label);};
  const added=(before,after)=>after.storage.filter(mon=>!before.storage.some(old=>old.uid===mon.uid));
  const rows=[];
  for(const recipe of recipes){
    let weight=0;
    for(const outcome of recipe.outcomes){
      const pair=fixture(recipe,(weight+outcome.weight/2)/100),game=pair.game,before=parse(game);
      assert.ok(game.snapshot().monsters.filter(mon=>[pair.maleUid,pair.femaleUid].includes(mon.uid)).every(mon=>mon.generation===0));
      game.dispatch(action(recipe,pair));const after=parse(game),newborns=added(before,after);assert.equal(newborns.length,1);
      const child=newborns[0];assert.equal(child.species,outcome.species);assert.equal(child.level,1);assert.equal(child.generation,1);assert.equal(child.obtained.how,'breeding');
      assert.deepEqual(after.storage.filter(mon=>mon.uid!==child.uid),before.storage);
      assert.equal(after.game.coins,before.game.coins);assert.deepEqual(after.items,before.items);assert.equal(after.exp_pool,before.exp_pool);
      assert.deepEqual(after.game.quests,before.game.quests);assert.deepEqual(after.game.campaigns,before.game.campaigns);
      assert.equal(game.snapshot().monsters.find(mon=>mon.uid===child.uid).generation,1);
      assert.equal(game.snapshot().monsters.find(mon=>mon.uid===child.uid).gender,getBreedingGender(child.species));
      const reload=createGame(catalog,game.exportSave());assert.equal(parse(reload).storage.find(mon=>mon.uid===child.uid).generation,1);
      const repeatedBefore=parse(reload);reload.dispatch(action(recipe,pair));const repeatedAfter=parse(reload);assert.equal(added(repeatedBefore,repeatedAfter).length,1);
      assert.deepEqual(repeatedAfter.storage.filter(mon=>before.storage.some(old=>old.uid===mon.uid)),before.storage);
      rows.push({recipeId:recipe.id,outcomeSpecies:outcome.species,originalWeight:outcome.weight,level:child.level,generation:child.generation,repeatedAcquisition:true});
      weight+=outcome.weight;
    }
    const pair=fixture(recipe),game=pair.game;
    reject(game,{...action(recipe,pair),recipeId:'breeding-unknown'},'Unknown recipe preserves full save/RNG');
    reject(game,{...action(recipe,pair),firstUid:'unowned'},'Non-owned parent preserves full save/RNG');
    reject(game,{...action(recipe,pair),secondUid:pair.maleUid},'Same identity preserves full save/RNG');
    for(const which of ['maleUid','femaleUid']){
      const low=parse(game);low.storage.find(mon=>mon.uid===pair[which]).level=49;
      const lowGame=createGame(catalog,JSON.stringify(low));reject(lowGame,action(recipe,pair),'Level49 preserves full save/RNG');
    }
    for(const [which,species] of [['maleUid',recipe.maleInitialSpecies],['femaleUid',recipe.femaleInitialSpecies]]){
      const immature=parse(game);immature.storage.find(mon=>mon.uid===pair[which]).species=species;
      const wrong=createGame(catalog,JSON.stringify(immature));reject(wrong,action(recipe,pair),'Immature form preserves full save/RNG');
    }
    const gen=parse(game);gen.storage.find(mon=>mon.uid===pair.maleUid).generation=1;
    reject(createGame(catalog,JSON.stringify(gen)),action(recipe,pair),'Second generation male preserves full save/RNG');
    const femaleGen=parse(game);femaleGen.storage.find(mon=>mon.uid===pair.femaleUid).generation=1;
    const femaleGame=createGame(catalog,JSON.stringify(femaleGen));femaleGame.dispatch(action(recipe,pair));assert.equal(parse(femaleGame).storage.length,femaleGen.storage.length+1);
  }
  const recipe=recipes.find(r=>r.originalEggId===7),pair=fixture(recipe,0.15);
  const before=parse(pair.game);pair.game.dispatch(action(recipe,pair));const descendant=added(before,parse(pair.game))[0];assert.equal(descendant.species,65);
  const advanced=autoEvolve(gainLevels(descendant,49,dex).mon,dex).mon;assert.equal(advanced.species,67);assert.equal(advanced.level,50);assert.equal(advanced.generation,1);
  const advancedSave=parse(pair.game);advancedSave.storage=advancedSave.storage.map(mon=>mon.uid===advanced.uid?advanced:mon);
  const advancedGame=createGame(catalog,JSON.stringify(advancedSave));reject(advancedGame,{...action(recipe,pair),firstUid:advanced.uid},'Evolved level50 descendant male is still excluded');
  const full=fixture(recipe);full.game.dispatch({type:'cheatAcquire',species:10,level:5});assert.equal(full.game.snapshot().party.length,6);
  const fullBefore=parse(full.game);full.game.dispatch(action(recipe,full));const fullAfter=parse(full.game),boxed=added(fullBefore,fullAfter)[0];assert.ok(boxed);assert.deepEqual(fullAfter.party,fullBefore.party);assert.ok(!fullAfter.party.includes(boxed.uid));
  const capacity=structuredClone(fullBefore);
  for(let i=0;i<1000;i++)capacity.storage.push({...structuredClone(capacity.storage[0]),uid:`breeding-box-${i}`});
  reject(createGame(catalog,JSON.stringify(capacity)),action(recipe,full),'Full storage preserves full save/RNG');
  const fighting=fixture(recipe);const boss=catalog.bosses.find(b=>b.id.startsWith('boss_spt_'));assert.ok(boss);
  fighting.game.dispatch({type:'startBattle',bossId:boss.id});assert.ok(fighting.game.snapshot().battle);assert.equal(fighting.game.snapshot().battle.finished,false);
  reject(fighting.game,action(recipe,fighting),'Active battle rejection preserves full save/RNG');
  for(const generation of [-1,0.5,'1',null]){
    const malformed=structuredClone(base);malformed.storage[0].generation=generation;
    assert.throws(()=>deserialize(JSON.stringify(malformed),dex),/generation/);
    const valid=createGame(catalog,JSON.stringify(base)),prior=valid.exportSave();assert.throws(()=>valid.importSave(JSON.stringify(malformed)),/generation/);assert.equal(valid.exportSave(),prior);
  }
  assert.equal(JSON.stringify(catalog),originalCatalog,'Source catalog is immutable across all fixtures');
  const result={checks:['all 24 exact original outcome branches','Lv1 generation1 offspring','parents byte-equivalent and resources unchanged','repeat same parents and save/reload','legacy generation0 views','female generation1 exposed client policy','evolved descendant male excluded','full party storage fallback','capacity and all invalid requests preserve complete save/RNG','active battle rejection','malformed generation import rejection','catalog immutability'],recipeCount:recipes.length,outcomeCount:rows.length,rows};
  fs.mkdirSync('artifacts/breeding-v24',{recursive:true});fs.writeFileSync('artifacts/breeding-v24/controller-verification.json',JSON.stringify(result,null,2)+'\n');
  console.log(`Verified ${recipes.length} breeding controller pairs and ${rows.length} exact weighted branches, repeat/save persistence, parent/resource preservation, generation rules and rejection/RNG invariants.`);
}finally{await server.close();delete globalThis.localStorage;}
