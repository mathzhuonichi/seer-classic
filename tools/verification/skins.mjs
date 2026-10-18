/** Skin permissions, persisted identity, gameplay invariance, and battle presentation. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';

const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),memory=new Map();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)}});
const server=await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error'});
const checks=[],failures=[];
const exhaustive={total:0,defaultOnly:0,multiple:0,partyCases:0,storageCases:0,selectionActions:0,resetActions:0,batches:0,npcModifierSpecies:[],species:[]};
function check(name,run){try{run();checks.push(name)}catch(error){failures.push({name,error:String(error.stack).slice(0,4000)});console.error(`FAIL ${name}: ${error.message.split('\n')[0]}`)}}
try {
  const {createGame,loadCatalog,advanceBattlePresentation}=await server.ssrLoadModule('/src/game.ts');
  const {makeDex,createMonster,SeededRng,computeStats}=await server.ssrLoadModule('/raising/core/index.ts');
  const {buildSkinOptions}=await server.ssrLoadModule('/src/progression/skins.ts');
  const {BREEDING_RECIPES,canBreedParents}=await server.ssrLoadModule('/src/progression/breeding.ts');
  const {CHALLENGE_CAMPAIGNS}=await server.ssrLoadModule('/src/progression/challenge-campaigns.ts');
  const catalog=await loadCatalog(),catalogBytes=JSON.stringify(catalog),dex=makeDex(catalog),byId=new Map(catalog.species.map(row=>[row.id,row]));
  const parse=game=>JSON.parse(game.exportSave()),base=parse(createGame(catalog,''));
  base.rng_state=[101,202,303,404];base.items={...base.items,item_capsule_master:20,item_restore:3,item_level_down:3,item_level_up_1:10};base.exp_pool=1e9;
  const make=(save,input=catalog)=>createGame(input,JSON.stringify(save));
  function mon(species,level=100,uid=`skin-${species}`){const value=createMonster(dex,species,level,new SeededRng(species),{how:'capture',at:'2026-10-14T00:00:00.000Z'});Object.assign(value,{uid,nickname:'Skin fixture',iv:29,generation:0,evs:{hp:21,atk:12,def:30,spa:40,spd:20,spe:15}});value.hp=computeStats(value,dex).hp;return value;}
  function fixture(species,level=100,input=catalog){const save=structuredClone(base),value=mon(species,level);save.storage.push(value);save.party=[value.uid];return {game:make(save,input),uid:value.uid};}
  const owned=(game,uid)=>parse(game).storage.find(value=>value.uid===uid),view=(game,uid)=>game.snapshot().monsters.find(value=>value.uid===uid);
  function reject(game,action,label){const save=game.exportSave(),battle=JSON.stringify(game.snapshot().battle);game.dispatch(action);assert.equal(game.exportSave(),save,`${label}: save, resources, and RNG stay unchanged`);assert.equal(JSON.stringify(game.snapshot().battle),battle,`${label}: battle unchanged`);}
  function select(game,uid,species){const before=parse(game),priorView=game.snapshot(),priorBytes=JSON.stringify(priorView),beforeMon=view(game,uid);game.dispatch({type:'setSkin',uid,species});const after=parse(game),value=after.storage.find(entry=>entry.uid===uid),expected=structuredClone(before);if(species===null||species===value.species)delete expected.storage.find(entry=>entry.uid===uid).skinSpecies;else expected.storage.find(entry=>entry.uid===uid).skinSpecies=species;assert.deepEqual(after,expected,'Exactly the selected instance skin changes; actual identity and all gameplay state are preserved');assert.equal(view(game,uid).appearanceSpecies,species??value.species);assert.equal(view(game,uid).portrait,`/portraits/${species??value.species}.png`);const {appearanceSpecies:a,portrait:p,...afterGameplay}=view(game,uid),{appearanceSpecies:b,portrait:q,...beforeGameplay}=beforeMon;assert.deepEqual(afterGameplay,beforeGameplay,'Stats, types, name, gender, generation, skills, and evolution eligibility remain actual');assert.equal(JSON.stringify(priorView),priorBytes,'Prior snapshot remains immutable');}

  // Independently traverse forward from every possible ancestor. The production
  // implementation traverses a reverse-parent map; neither its helper nor its
  // returned skin options supply this oracle. BFS also records the shortest
  // directed distance so each species can exercise its most distant ancestor.
  const expectedSkins=new Map(catalog.species.map(row=>[row.id,new Map([[row.id,0]])]));
  for(const ancestor of catalog.species){
    const queue=[[ancestor.id,0]],seen=new Set([ancestor.id]);
    for(let index=0;index<queue.length;index++){
      const [id,distance]=queue[index];
      for(const edge of byId.get(id).evolution){
        assert(byId.has(edge.to),`${id}: every forward target exists`);
        if(seen.has(edge.to))continue;
        seen.add(edge.to);expectedSkins.get(edge.to).set(ancestor.id,distance+1);queue.push([edge.to,distance+1]);
      }
    }
  }
  check('All 1483 catalog species expose exact directed skin choices and support selection plus reset at level one',()=>{
    assert.equal(catalog.species.length,1483);
    const batchSize=64;
    for(let start=0;start<catalog.species.length;start+=batchSize){
      const rows=catalog.species.slice(start,start+batchSize),save=structuredClone(base);
      save.storage=rows.map(row=>mon(row.id,1,`all-skins-${row.id}`));
      save.party=save.storage.slice(0,6).map(value=>value.uid);save.game.traits={};
      const game=make(save),beforeSave=game.exportSave();
      const originals=new Map(parse(game).storage.map(value=>[value.uid,value]));
      assert.equal(game.snapshot().monsters.length,rows.length,'The batch loads without resetting its save');
      assert(game.snapshot().monsters.length<=64,'Fixtures stay far below the storage capacity');
      for(const row of rows){
        const uid=`all-skins-${row.id}`,original=originals.get(uid),beforeView=view(game,uid),priorBytes=JSON.stringify(beforeView);
        const expected=expectedSkins.get(row.id),choices=beforeView.skinOptions;
        assert(Array.isArray(choices)&&choices.length>0,`${row.id}: every owned form has a skin selector`);
        assert.equal(choices[0].species,row.id,`${row.id}: the default form is always first`);
        assert.deepEqual(choices.map(choice=>choice.species).sort((a,b)=>a-b),[...expected.keys()].sort((a,b)=>a-b),`${row.id}: no missing ancestor, sibling, descendant, or unrelated option`);
        for(const choice of choices)assert.equal(choice.name,byId.get(choice.species).name.zh,`${row.id}: every option names its actual catalog form`);
        assert.equal(beforeView.appearanceSpecies,row.id);assert.equal(beforeView.portrait,`/portraits/${row.id}.png`);
        const [target,distance]=[...expected].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0];
        game.dispatch({type:'setSkin',uid,species:target});
        const selected=owned(game,uid),selectedView=view(game,uid),{skinSpecies,...identity}=selected;
        assert.deepEqual(identity,original,`${row.id}: selecting an appearance preserves every real monster field`);
        assert.equal(skinSpecies,target===row.id?undefined:target);
        assert.equal(selectedView.appearanceSpecies,target);assert.equal(selectedView.portrait,`/portraits/${target}.png`);
        const {appearanceSpecies:a,portrait:p,...selectedGameplay}=selectedView,{appearanceSpecies:b,portrait:q,...priorGameplay}=beforeView;
        assert.deepEqual(selectedGameplay,priorGameplay,`${row.id}: presentation selection preserves gameplay and party membership`);
        assert.equal(JSON.stringify(beforeView),priorBytes,`${row.id}: the prior monster view is immutable`);
        game.dispatch({type:'setSkin',uid,species:null});
        assert.deepEqual(owned(game,uid),original,`${row.id}: reset restores precisely the original stored instance`);
        assert.equal(view(game,uid).appearanceSpecies,row.id);assert.equal(view(game,uid).portrait,`/portraits/${row.id}.png`);
        exhaustive.total++;exhaustive.selectionActions++;exhaustive.resetActions++;
        exhaustive[choices.length===1?'defaultOnly':'multiple']++;
        exhaustive[beforeView.inParty?'partyCases':'storageCases']++;
        exhaustive.species.push({species:row.id,choices:choices.map(choice=>choice.species),selected:target,distance,inParty:beforeView.inParty,level:1});
      }
      assert.equal(game.exportSave(),beforeSave,'Every batch preserves the entire save, resources, collection records, and RNG after reset');
      exhaustive.batches++;
    }
    assert.equal(exhaustive.total,1483);assert.equal(exhaustive.defaultOnly+exhaustive.multiple,1483);
    assert.equal(exhaustive.partyCases+exhaustive.storageCases,1483);
    assert(exhaustive.partyCases>0&&exhaustive.storageCases>0);
    assert.equal(new Set(exhaustive.species.map(value=>value.species)).size,1483);
  });
  check('All four NPC species also expose skins when actually acquired through the modifier',()=>{
    const game=make(base);
    for(const species of [122,123,124,125]){
      const before=new Set(game.snapshot().monsters.map(value=>value.uid));
      game.dispatch({type:'cheatAcquire',species,level:1});
      const added=game.snapshot().monsters.filter(value=>!before.has(value.uid));
      assert.equal(added.length,1);const value=added[0];assert.equal(value.species,species);
      assert.deepEqual(value.skinOptions.map(choice=>choice.species).sort((a,b)=>a-b),[...expectedSkins.get(species).keys()].sort((a,b)=>a-b));
      const target=[...expectedSkins.get(species)].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0][0];
      select(game,value.uid,target);select(game,value.uid,null);exhaustive.npcModifierSpecies.push(species);
    }
    assert(game.snapshot().monsters.some(value=>[122,123,124,125].includes(value.species)&&value.inParty));
    assert(game.snapshot().monsters.some(value=>[122,123,124,125].includes(value.species)&&!value.inParty));
  });

  for(const [species,ancestors] of [[1,[]],[3,[1,2]],[93,[91]],[1316,[65,66,67]],[1317,[65,66,67]],[1428,[738,739]],[1459,[77,78,79]],[1019,[820,821,1017,1018]]])check(`${species}: only current form and directed ancestors are selectable even at level one`,()=>{
    for(const level of [1,100]){const {game,uid}=fixture(species,level),choices=view(game,uid).skinOptions.map(choice=>choice.species);assert.equal(choices[0],species);assert.deepEqual([...choices].sort((a,b)=>a-b),[species,...ancestors].sort((a,b)=>a-b));for(const id of choices){assert.equal(view(game,uid).skinOptions.find(choice=>choice.species===id).name,byId.get(id).name.zh);select(game,uid,id);}select(game,uid,null);}
  });
  check('Reverse ancestry and artwork metadata cannot grant an unimplemented or sibling skin',()=>{
    const rows=[{id:1,evolution:[{to:2}]},{id:2,evolution:[{to:3},{to:4}]},{id:3,evolution:[],evolves_from:9,familyRoot:9,evolutionStage:9},{id:4,evolution:[]},{id:9,evolution:[]}];
    assert.deepEqual([...buildSkinOptions(rows).get(3)].sort((a,b)=>a-b),[1,2,3]);
  });
  check('Unrelated, descendant, sibling, malformed, and missing-identity requests reject atomically',()=>{
    for(const [actual,invalid] of [[1,3],[3,4],[1316,1317],[1428,1429],[79,1459],[93,92]]){const {game,uid}=fixture(actual);reject(game,{type:'setSkin',uid,species:invalid},`${actual} cannot wear ${invalid}`);}
    const {game,uid}=fixture(3);select(game,uid,1);
    for(const invalid of [0,-1,999999,1.5,NaN,Infinity,'1',{},[],true,undefined])reject(game,{type:'setSkin',uid,species:invalid},'Invalid skin value');
    reject(game,{type:'setSkin',uid:'missing-instance',species:1},'Missing instance');
  });
  check('Duplicate real species retain independent skin choices through export, reload, and import',()=>{
    const save=structuredClone(base),first=mon(3,100,'skin-copy-a'),second=mon(3,100,'skin-copy-b');save.storage.push(first,second);const game=make(save);
    select(game,first.uid,1);select(game,second.uid,2);assert.equal(owned(game,first.uid).skinSpecies,1);assert.equal(owned(game,second.uid).skinSpecies,2);
    const exported=game.exportSave(),restored=createGame(catalog,exported);assert.equal(restored.exportSave(),exported);
    const imported=createGame(catalog,'');imported.importSave(exported);assert.equal(imported.exportSave(),exported);
    select(imported,first.uid,null);assert.equal(owned(imported,second.uid).skinSpecies,2);assert.equal(view(imported,first.uid).appearanceSpecies,3);
  });
  check('Malformed imported skin fields are removed without resetting a valid old save',()=>{
    const {game,uid}=fixture(1316),normalized=parse(game),expected=game.exportSave();
    for(const invalid of [1317,1459,999999,65.5,'65',true,{},[],null]){const save=structuredClone(normalized);save.storage.find(value=>value.uid===uid).skinSpecies=invalid;const restored=make(save);assert.equal(restored.exportSave(),expected,'Only invalid optional cosmetics are removed');assert.equal(view(restored,uid).appearanceSpecies,1316);const imported=make(base);imported.importSave(JSON.stringify(save));assert.equal(imported.exportSave(),expected);}
    const same=structuredClone(normalized);same.storage.find(value=>value.uid===uid).skinSpecies=1316;assert.equal(make(same).exportSave(),expected,'Explicit default is normalized');
  });
  check('Valid saved ancestors survive former level-one special forms and old maximum-level saves',()=>{
    for(const [actual,skin] of [[729,347],[881,601],[1143,55]]){const {game,uid}=fixture(actual,1);select(game,uid,skin);assert.equal(view(make(parse(game)),uid).appearanceSpecies,skin);}
    const {game,uid}=fixture(55,100);assert.equal(owned(game,uid).species,55);assert.equal(view(game,uid).appearanceSpecies,55);select(game,uid,53);game.dispatch({type:'evolve',uid,toSpecies:1143});assert.equal(owned(game,uid).species,1143);assert.equal(owned(game,uid).skinSpecies,53);assert.equal(view(game,uid).appearanceSpecies,53);
  });
  check('Ordinary auto evolution, special manual evolution, down-level items, and restore retain an ancestor skin',()=>{
    const ordinary=fixture(2,31);select(ordinary.game,ordinary.uid,1);ordinary.game.dispatch({type:'useItem',uid:ordinary.uid,itemId:'item_level_up_1'});assert.equal(owned(ordinary.game,ordinary.uid).species,3);assert.equal(view(ordinary.game,ordinary.uid).appearanceSpecies,1);
    const special=fixture(67,59);select(special.game,special.uid,65);special.game.dispatch({type:'useItem',uid:special.uid,itemId:'item_level_up_1'});assert.equal(owned(special.game,special.uid).species,67);special.game.dispatch({type:'evolve',uid:special.uid,toSpecies:1316});assert.equal(owned(special.game,special.uid).species,1316);assert.equal(view(special.game,special.uid).appearanceSpecies,65);
    special.game.dispatch({type:'useItem',uid:special.uid,itemId:'item_level_down'});assert.equal(owned(special.game,special.uid).level,59);assert.equal(view(special.game,special.uid).appearanceSpecies,65);
    special.game.dispatch({type:'useItem',uid:special.uid,itemId:'item_restore'});assert.equal(owned(special.game,special.uid).level,1);assert.equal(owned(special.game,special.uid).species,1316);assert.equal(view(special.game,special.uid).appearanceSpecies,65);assert.equal(view(make(parse(special.game)),special.uid).appearanceSpecies,65);
  });
  check('Six-copy limits count actual species and ignore visible skins',()=>{
    const save=structuredClone(base);for(let i=0;i<6;i++)save.storage.push({...mon(3,100,`cap-${i}`),skinSpecies:i%2?1:2});const game=make(save);
    reject(game,{type:'cheatAcquire',species:3},'Six actual forms remain capped despite their appearances');
    const count=parse(game).storage.filter(value=>value.species===1).length;game.dispatch({type:'cheatAcquire',species:1});assert.equal(parse(game).storage.filter(value=>value.species===1).length,count+1,'Wearing form 1 does not consume actual form 1 capacity');
  });
  check('Evolving into a capped species counts held skins and pending essence aliases',()=>{
    const alias='skin-cap-essence',input={...catalog,items:[...catalog.items,{id:alias,name:{zh:'Skin cap fixture'},kind:'essence',hatches:1316}]},save=structuredClone(base),origin=mon(67);
    save.storage.push(origin,...Array.from({length:2},(_,i)=>({...mon(1316,100,`skin-target-${i}`),skinSpecies:65+i})));save.items[alias]=4;
    const game=make(save,input);select(game,origin.uid,65);reject(game,{type:'evolve',uid:origin.uid,toSpecies:1316},'Two real targets plus four reserved targets remain capped');
  });
  check('Breeding uses mature actual forms and generation even when both parents wear infants',()=>{
    const recipe=BREEDING_RECIPES.find(entry=>entry.id==='breeding-7'),save=structuredClone(base),male=mon(67,50,'breed-male'),female=mon(606,50,'breed-female');save.storage.push(male,female);
    const game=make(save);select(game,male.uid,65);select(game,female.uid,604);assert(canBreedParents(recipe,owned(game,male.uid),owned(game,female.uid)));
    const before=parse(game);game.dispatch({type:'breed',recipeId:recipe.id,firstUid:male.uid,secondUid:female.uid});const after=parse(game);assert.equal(after.storage.length,before.storage.length+1);assert.deepEqual(after.storage.find(value=>value.uid===male.uid),before.storage.find(value=>value.uid===male.uid));assert.deepEqual(after.storage.find(value=>value.uid===female.uid),before.storage.find(value=>value.uid===female.uid));
    const next=structuredClone(before);next.storage.find(value=>value.uid===male.uid).generation=1;const later=make(next);reject(later,{type:'breed',recipeId:recipe.id,firstUid:male.uid,secondUid:female.uid},'Infant skin does not remove male generation restriction');
    const higher=structuredClone(before);higher.storage.find(value=>value.uid===male.uid).species=1316;const evolved=make(higher);select(evolved,male.uid,67);reject(evolved,{type:'breed',recipeId:recipe.id,firstUid:male.uid,secondUid:female.uid},'A skin of mature form 67 does not grant its breeding eligibility');
  });
  check('Fusion uses actual parent forms without consuming or changing their skin choices',()=>{
    const save=structuredClone(base),primary=mon(3,1,'fusion-primary'),secondary=mon(29,1,'fusion-secondary');save.storage.push(primary,secondary);const game=make(save);select(game,primary.uid,1);select(game,secondary.uid,27);const before=parse(game);game.dispatch({type:'fuse',recipeId:'fusion-301',primaryUid:primary.uid,secondaryUid:secondary.uid});const after=parse(game);assert.equal(after.items.fusion_bead_301,(before.items.fusion_bead_301??0)+1);assert.deepEqual(after.storage,before.storage);
    const blocked=structuredClone(base),adult=mon(1459,100,'fusion-higher'),partner=mon(166,100,'fusion-partner');blocked.storage.push(adult,partner);const wrong=make(blocked);select(wrong,adult.uid,79);reject(wrong,{type:'fuse',recipeId:'fusion-310',primaryUid:adult.uid,secondaryUid:partner.uid},'Visible form 79 cannot impersonate actual fusion parent 79');
  });
  check('Niao capture prerequisite examines actual active species, not a permissible Nier skin',()=>{
    for(const [actual,skin,allowed] of [[79,77,true],[1459,79,false]]){const {game,uid}=fixture(actual);select(game,uid,skin);game.dispatch({type:'startTraining',species:416,level:5});assert(game.snapshot().battle);assert.equal(game.snapshot().battle.canCapture,allowed);if(!allowed)reject(game,{type:'capture',itemId:'item_capsule_master'},'Nier skin on another actual species does not satisfy Niao');}
  });
  check('Required-species campaign gates keep real identity when a valid ancestor skin matches the requirement',()=>{
    const campaign=CHALLENGE_CAMPAIGNS.find(value=>value.id==='rei-training'),stage=campaign.stages[0],input=structuredClone(catalog);
    assert.equal(stage.requiredSpecies,70);
    // Required form 70 currently has no predecessor or descendant. Synthetic,
    // directed edges exercise this future-facing identity boundary without changing production data.
    input.species.find(value=>value.id===69).evolution.push({to:70,method:'level',level:60,automatic:false});
    input.species.find(value=>value.id===70).evolution.push({to:71,method:'level',level:60,automatic:false});
    const wrong=fixture(71,100,input);select(wrong.game,wrong.uid,70);reject(wrong.game,{type:'startCampaignStage',campaignId:campaign.id,stageId:stage.id},'Visible form 70 cannot substitute for actual required form');assert.equal(wrong.game.snapshot().battle,null);
    const allowed=fixture(70,100,input);select(allowed.game,allowed.uid,69);allowed.game.dispatch({type:'startCampaignStage',campaignId:campaign.id,stageId:stage.id});assert.equal(allowed.game.snapshot().battle?.player.species,70);assert.equal(allowed.game.snapshot().battle?.player.appearanceSpecies,69);
  });
  check('Live battle party, switches, animation history, and settlement preserve per-instance appearance',()=>{
    const save=structuredClone(base),first={...mon(3,100,'battle-a'),skinSpecies:1},second={...mon(6,100,'battle-b'),skinSpecies:4};save.storage.push(first,second);save.party=[first.uid,second.uid];const game=make(save);game.dispatch({type:'startTraining',species:10,level:5});let battle=game.snapshot().battle;assert.equal(battle.player.species,3);assert.equal(battle.player.appearanceSpecies,1);assert.equal(battle.party.find(value=>value.uid===second.uid).appearanceSpecies,4);const earlier=JSON.stringify(battle);
    reject(game,{type:'setSkin',uid:first.uid,species:2},'Active battle prevents cosmetic management');game.dispatch({type:'switch',uid:second.uid});const switched=game.snapshot().battle;assert.equal(switched.player.species,6);assert.equal(switched.player.appearanceSpecies,4);assert.equal(switched.player.portrait,'/portraits/4.png');assert.equal(JSON.stringify(battle),earlier);assert(switched.animation.frames.length>0);for(const frame of switched.animation.frames)for(const value of frame.party)assert.equal(value.appearanceSpecies,value.uid===first.uid?1:4);
    game.dispatch({type:'capture',itemId:'item_capsule_master'});assert.equal(game.snapshot().battle.captured,true);game.dispatch({type:'closeBattle'});assert.equal(view(game,first.uid).appearanceSpecies,1);assert.equal(view(game,second.uid).appearanceSpecies,4);assert.equal(owned(game,first.uid).species,3);assert.equal(owned(game,second.uid).species,6);
  });
  for(const target of [6,3])check(`Real battle transform into ${target} overrides cosmetics in live and historical views`,()=>{
    const input=structuredClone(catalog),skill=input.skills.find(value=>value.id===10001);Object.assign(skill,{category:'status',power:0,accuracy:100,priority:10,target:'self',effects:[{op:'transform',species:target}]});const save=structuredClone(base),value={...mon(3),skinSpecies:1};value.skills=[10001];value.pp[10001]=35;const bench={...mon(6,100,'transform-bench'),skinSpecies:4};save.storage.push(value,bench);save.party=[value.uid,bench.uid];const game=make(save,input);game.dispatch({type:'startTraining',species:10,level:5});const before=game.snapshot().battle;assert.equal(before.player.appearanceSpecies,1);game.dispatch({type:'move',skillId:10001});const after=game.snapshot().battle;assert.equal(after.player.species,target);assert.equal(after.player.appearanceSpecies,target);assert.equal(after.player.portrait,`/portraits/${target}.png`);assert(after.animation.frames.some(frame=>frame.player.appearanceSpecies===target),'Transform is represented in event-ordered history');assert.equal(before.player.appearanceSpecies,1,'Earlier frame is immutable');assert.equal(owned(game,value.uid).species,3);assert.equal(owned(game,value.uid).skinSpecies,1);game.dispatch({type:'switch',uid:bench.uid});assert.equal(game.snapshot().battle.player.appearanceSpecies,4);game.dispatch({type:'switch',uid:value.uid});assert.equal(game.snapshot().battle.player.appearanceSpecies,target,'A real transformation remains visible after switching out and back');game.dispatch({type:'capture',itemId:'item_capsule_master'});assert.equal(game.snapshot().battle.captured,true);game.dispatch({type:'closeBattle'});assert.equal(owned(game,value.uid).species,3);assert.equal(owned(game,value.uid).skinSpecies,1);game.dispatch({type:'startTraining',species:10,level:5});assert.equal(game.snapshot().battle.player.appearanceSpecies,1,'The next battle restores the saved cosmetic choice');
  });
  check('Presentation reducer keeps switch skins, overrides same-species transforms, and preserves earlier frames',()=>{
    const {game,uid}=fixture(3);select(game,uid,1);game.dispatch({type:'startTraining',species:10,level:5});const battle=game.snapshot().battle,state={player:battle.player,enemy:battle.enemy,party:battle.party,enemyParty:battle.enemyParty},bytes=JSON.stringify(state);
    const switched=advanceBattlePresentation(state,{type:'switch_in',side:0,slot:0,species:3,hp:state.player.hp,maxHp:state.player.maxHp},catalog.species);assert.equal(switched.player.appearanceSpecies,1);assert.equal(switched.player.portrait,'/portraits/1.png');
    const transformed=advanceBattlePresentation(switched,{type:'transform',side:0,slot:0,species:3,hp:state.player.hp,maxHp:state.player.maxHp},catalog.species);assert.equal(transformed.player.appearanceSpecies,3);assert.equal(transformed.player.portrait,'/portraits/3.png');assert.equal(JSON.stringify(state),bytes);
  });
  check('Regression fixtures never mutate the source catalog',()=>assert.equal(JSON.stringify(catalog),catalogBytes));
  fs.mkdirSync('artifacts/skins',{recursive:true});fs.writeFileSync('artifacts/skins/controller.json',JSON.stringify({exhaustive,checks,failures},null,2)+'\n');
  const {species:details,...coverage}=exhaustive;
  console.log(JSON.stringify({passed:checks.length,exhaustive:coverage,failures},null,2));assert.equal(failures.length,0,`${failures.length} skin verification failures`);
} finally {await server.close();if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else delete globalThis.localStorage;}
