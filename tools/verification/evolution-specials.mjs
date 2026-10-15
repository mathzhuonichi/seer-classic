/** Independent v34 regression: approved special transitions, legacy saves, and branch entry routes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';

const BASELINE_REVISION = '6e92e09';
// These expectations come from the approved policy, not from the generator output.
const SOURCE_LEVELS = [[398,432,63],[651,652,34],[347,729,1],[810,811,40],[601,881,1],[55,1143,1]];
const REMAKE_LEVELS = [[821,1017,60],[1017,1018,70],[1018,1019,80],[1120,1121,60],[999,1122,60],
  [47,1192,60],[1214,1215,60],[29,1216,60],[34,1230,60],[37,1237,60],[1237,1238,70],
  [400,1266,60],[113,1277,60],[500,1278,60],[1278,1279,70],[110,1297,60],[42,1298,60],
  [67,1316,60],[67,1317,60],[64,1346,60],[50,1361,60],[739,1428,60],[739,1429,60],
  [79,1459,60],[239,1464,60],[197,1473,60]];
const BRANCH_PARENTS = new Set([67,739]);
const EXPECTED = [...SOURCE_LEVELS,...REMAKE_LEVELS].map(([from,to,level])=>({from,to,level,method:'level',automatic:!BRANCH_PARENTS.has(from)}));
const targetIds = new Set(EXPECTED.map(edge=>edge.to)), parentIds = new Set(EXPECTED.map(edge=>edge.from));
const source = JSON.parse(execFileSync('git',['show',`${BASELINE_REVISION}:data/gamedata.json`],{encoding:'utf8',maxBuffer:50*1024*1024}));
const oldById = new Map(source.species.map(row=>[row.id,row]));
const beforeStorage = Object.getOwnPropertyDescriptor(globalThis,'localStorage'), memory = new Map();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)}});
const server=await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error'});
const checks=[],failures=[],transitions=[],repeatRoutes=[];
function check(name,run){try{run();checks.push(name)}catch(error){failures.push({name,error:String(error.stack).slice(0,3500)});console.error(`FAIL ${name}: ${error.message}`)}}
try {
  const {createGame,loadGameData}=await server.ssrLoadModule('/src/game.ts');
  const {makeDex,createMonster,SeededRng,computeStats,evolutionOptions,autoEvolve}=await server.ssrLoadModule('/raising/core/index.ts');
  const {buildAcquisitionIndex,NPC_ONLY_SPECIES}=await server.ssrLoadModule('/src/progression/acquisition.ts');
  const {buildInitialFormAcquisitionIndex}=await server.ssrLoadModule('/src/progression/initial-acquisition.ts');
  const catalog=await loadGameData(),catalogBytes=JSON.stringify(catalog),byId=new Map(catalog.species.map(row=>[row.id,row]));
  const dex=makeDex(catalog),oldDex=makeDex(source),parse=game=>JSON.parse(game.exportSave());
  const base=parse(createGame(catalog,''));base.rng_state=[101,202,303,404];base.items={item_capsule_master:40,item_level_up_1:30};base.exp_pool=1e9;
  const make=(save,input=catalog)=>createGame(input,JSON.stringify(save));
  function mon(species,level=100,uid=`special-${species}`){
    const value=createMonster(oldDex,species,level,new SeededRng(species),{how:'capture',at:'2026-10-14T00:00:00.000Z'});
    Object.assign(value,{uid,nickname:'Legacy special fixture',iv:29,generation:1,evs:{hp:21,atk:12,def:30,spa:40,spd:20,spe:15}});
    value.hp=computeStats(value,dex).hp;return value;
  }
  function fixture(species,level=100,input=catalog){const save=structuredClone(base),value=mon(species,level);save.storage.push(value);save.game.traits[value.uid]=save.game.traits[save.party[0]];return{game:make(save,input),uid:value.uid};}
  function reject(game,action,label){const save=game.exportSave(),battle=JSON.stringify(game.snapshot().battle);game.dispatch(action);assert.equal(game.exportSave(),save,`${label}: complete save, inventory, and RNG preserved`);assert.equal(JSON.stringify(game.snapshot().battle),battle,`${label}: battle unchanged`);}
  function assertSelected(game,uid,to,explicit=true){
    const before=parse(game),old=before.storage.find(value=>value.uid===uid),view=game.snapshot(),viewBytes=JSON.stringify(view);
    game.dispatch({type:'evolve',uid,...(explicit?{toSpecies:to}:{})});const after=parse(game),value=after.storage.find(entry=>entry.uid===uid);
    assert.equal(value.species,to,'Only the requested next form is selected');
    for(const key of ['uid','nickname','level','exp','iv','nature','evs','obtained','generation','status'])assert.deepEqual(value[key],old[key],`${key} retained`);
    assert(old.learned.every(id=>value.learned.includes(id)));assert.deepEqual(value.skills.slice(0,old.skills.length),old.skills);
    for(const skill of old.skills)assert.equal(value.pp[skill],old.pp[skill]);
    assert.deepEqual(after.items,before.items,'The approved conversion consumes no former evolution item');
    assert.deepEqual(after.rng_state,before.rng_state);assert.deepEqual(after.game.traits,before.game.traits);assert.deepEqual(after.party,before.party);
    assert.deepEqual(after.storage.filter(entry=>entry.uid!==uid),before.storage.filter(entry=>entry.uid!==uid));
    assert.equal(JSON.stringify(view),viewBytes,'Prior view remains immutable');
    assert(after.dex.owned.includes(to));assert.deepEqual(parse(make(after)).storage.find(entry=>entry.uid===uid),value);
    return value;
  }

  check('Exactly the 32 approved forward edges were added and prior edges remain byte-equivalent',()=>{
    assert.equal(EXPECTED.length,32);assert.equal(targetIds.size,32);
    const additions=[];
    for(const row of catalog.species){const old=oldById.get(row.id);assert(old,'No extra catalog species');
      for(const edge of old.evolution)assert(row.evolution.some(candidate=>JSON.stringify(candidate)===JSON.stringify(edge)),`${row.id}->${edge.to}: prior rule preserved`);
      for(const edge of row.evolution)if(!old.evolution.some(previous=>previous.to===edge.to))additions.push({from:row.id,...edge});
      assert.equal(new Set(row.evolution.map(edge=>edge.to)).size,row.evolution.length,'No duplicate targets');
    }
    const order=(a,b)=>a.from-b.from||a.to-b.to;
    assert.deepEqual(additions.sort(order),EXPECTED.map(({from,to,level,method,automatic})=>({from,to,method,level,automatic})).sort(order));
  });
  check('Evidence distinguishes the six source-level gates from the 26 remake-level transitions',()=>{
    const policy=JSON.parse(fs.readFileSync('data/evolution-rules.json','utf8'));
    const oldPolicy=JSON.parse(execFileSync('git',['show',`${BASELINE_REVISION}:data/evolution-rules.json`],{encoding:'utf8',maxBuffer:10*1024*1024}));
    for(const rule of oldPolicy.rules)assert.deepEqual(policy.rules.find(value=>value.from===rule.from&&value.kind===rule.kind),rule,'Prior evidence rows are preserved');
    const added=policy.rules.filter(rule=>rule.kind.startsWith('special-'));assert.equal(added.length,30);
    assert.equal(added.flatMap(rule=>rule.transitions).length,32);
    for(const rule of added)for(const transition of rule.transitions){const expected=EXPECTED.find(edge=>edge.from===rule.from&&edge.to===transition.to);assert(expected,'Every evidence row belongs to the approved target set');
      const sourceGate=SOURCE_LEVELS.some(([from,to])=>from===rule.from&&to===transition.to);
      assert.equal(rule.levelEvidence.kind,sourceGate?'source-gate':'remake-fallback');
      assert.equal(rule.levelEvidence.originalLevel,sourceGate?expected.level:null,'Fallback levels are not presented as source levels');
      assert.equal(transition.level,expected.level);
    }
    assert.equal(policy.deferredMissingForms.length,0,'All 32 previously deferred forms are resolved');
  });
  check('The catalog changed only approved evolution fields and the single 1459 ancestry correction',()=>{
    assert.equal(catalog.species.length,source.species.length);
    // Runtime deliberately replaces the older bundled encounter section with the
    // individual boss files. Compare each representation with its own v33 baseline.
    const currentBundle=JSON.parse(fs.readFileSync('data/gamedata.json','utf8'));
    const {species:unusedCurrent,...currentRest}=currentBundle,{species:unusedOld,...oldRest}=source;assert.deepEqual(currentRest,oldRest,'Skills, items, bundled battles, types, and other catalog sections unchanged');
    assert.equal(execFileSync('git',['diff','--name-only',BASELINE_REVISION,'--','data/bosses'],{encoding:'utf8'}).trim(),'','Runtime encounter files unchanged');
    assert.equal(execFileSync('git',['ls-files','--others','--exclude-standard','--','data/bosses'],{encoding:'utf8'}).trim(),'','No new encounter files');
    for(const row of catalog.species){const old=oldById.get(row.id),expected=structuredClone(old);
      if(parentIds.has(row.id)){expected.evolution=row.evolution;expected.source_note=row.source_note;}
      if(row.id===1459){assert.equal(old.evolves_from,77);assert.equal(row.evolves_from,79);expected.evolves_from=79;expected.source_note=row.source_note;}
      assert.deepEqual(row,expected,`${row.id}: stats, skills, acquisition, and unrelated ancestry are preserved`);
      if(parentIds.has(row.id)||row.id===1459)assert.deepEqual(row,JSON.parse(fs.readFileSync(`data/monsters/${String(row.id).padStart(4,'0')}.json`,'utf8')),'Standalone record agrees');
    }
    const oldIndex=JSON.parse(execFileSync('git',['show',`${BASELINE_REVISION}:data/catalog_index.json`],{encoding:'utf8',maxBuffer:10*1024*1024}));
    const index=JSON.parse(fs.readFileSync('data/catalog_index.json','utf8'));
    for(const row of index.monsters){const previous=oldIndex.monsters.find(value=>value.id===row.id),expected=structuredClone(previous);
      if(parentIds.has(row.id))expected.evolves_to=byId.get(row.id).evolution.map(edge=>edge.to);
      if(row.id===1459&&'evolves_from' in row)expected.evolves_from=79;
      assert.deepEqual(row,expected,`${row.id}: catalog index changes only the approved graph`);
    }
  });
  check('The executable evolution graph has no cycles',()=>{
    const done=new Set(),active=new Set();
    function visit(id){assert(!active.has(id),`Evolution cycle at ${id}`);if(done.has(id))return;active.add(id);for(const edge of byId.get(id).evolution)if(edge.method==='level')visit(edge.to);active.delete(id);done.add(id);}
    for(const id of byId.keys())visit(id);
  });

  for(const edge of EXPECTED)check(`${edge.from}->${edge.to}: threshold, training policy, explicit target, and old level-100 save`,()=>{
    const actual=byId.get(edge.from).evolution.find(value=>value.to===edge.to);assert.deepEqual(actual,{to:edge.to,method:'level',level:edge.level,automatic:edge.automatic});
    if(edge.level>1){const under=fixture(edge.from,edge.level-1);reject(under.game,{type:'evolve',uid:under.uid,toSpecies:edge.to},'Under-level evolution');assert(!evolutionOptions(mon(edge.from,edge.level-1),dex).includes(edge.to));}
    assert(evolutionOptions(mon(edge.from,edge.level),dex).includes(edge.to),'Target is eligible at the exact approved level');
    const trained=fixture(edge.from,Math.max(1,edge.level-1)),before=parse(trained.game);
    trained.game.dispatch({type:'useItem',uid:trained.uid,itemId:'item_level_up_1'});
    const after=parse(trained.game),value=after.storage.find(entry=>entry.uid===trained.uid);
    assert.equal(value.level,Math.max(2,edge.level));assert.deepEqual(after.rng_state,before.rng_state,'Training uses no RNG');
    if(edge.automatic){assert.equal(value.species,edge.to,'Single-target transition is automatic');assert.equal(autoEvolve(mon(edge.from,edge.level),dex).mon.species,edge.to);}
    else{assert.equal(value.species,edge.from,'Branch remains unchanged until selection');assert.equal(autoEvolve(mon(edge.from,100),dex).mon.species,edge.from);reject(trained.game,{type:'evolve',uid:trained.uid},'Branch requires an explicit target');assertSelected(trained.game,trained.uid,edge.to);}
    const legacy=fixture(edge.from,100);assert.equal(parse(legacy.game).storage.find(entry=>entry.uid===legacy.uid).species,edge.from,'Loading an old max-level save does not transform it');
    reject(legacy.game,{type:'evolve',uid:legacy.uid,toSpecies:1},'Unrelated target');
    assertSelected(legacy.game,legacy.uid,edge.to,!edge.automatic);
    transitions.push({from:edge.from,to:edge.to,level:edge.level,automatic:edge.automatic});
  });

  for(const edge of EXPECTED)check(`${edge.from}->${edge.to}: owned plus all pending aliases enforce the six-copy limit`,()=>{
    const aliases=[`essence_special_a_${edge.to}`,`essence_special_b_${edge.to}`];
    const input={...catalog,items:[...catalog.items,...aliases.map(id=>({id,name:{zh:id},kind:'essence',hatches:edge.to}))]};
    const save=structuredClone(base),origin=mon(edge.from,Math.max(1,edge.level-1));
    save.storage.push(origin,mon(edge.to,1,`held-${edge.to}-1`),mon(edge.to,1,`held-${edge.to}-2`));save.items[aliases[0]]=1;save.items[aliases[1]]=3;
    const game=make(save,input);game.dispatch({type:'useItem',uid:origin.uid,itemId:'item_level_up_1'});
    const after=parse(game),retained=after.storage.find(value=>value.uid===origin.uid);
    assert.equal(retained.species,edge.from);assert.equal(retained.level,Math.max(2,edge.level),'Training retained at a destination cap');
    assert.equal(after.items.item_level_up_1,save.items.item_level_up_1-1);assert.deepEqual(after.rng_state,save.rng_state);
    reject(game,{type:'evolve',uid:origin.uid,toSpecies:edge.to},'Two owned and four aliases already reserve six');
    const view=game.snapshot().monsters.find(value=>value.uid===origin.uid).evolutionChoices.find(value=>value.species===edge.to);assert(view.blockedReason&&/6/.test(view.blockedReason));
    const freed=parse(game);freed.items[aliases[1]]=2;const allowed=make(freed,input);
    allowed.dispatch({type:'evolve',uid:origin.uid,toSpecies:edge.to});assert.equal(parse(allowed).storage.find(value=>value.uid===origin.uid).species,edge.to,'The sixth combined copy is permitted');
  });

  for(const chain of [[821,1017,1018,1019],[37,1237,1238],[500,1278,1279]])check(`${chain.join('->')}: high-level automatic chain and capped intermediate recovery`,()=>{
    const {game,uid}=fixture(chain[0],59);game.dispatch({type:'allocateExp',uid,amount:1e9});
    const complete=parse(game);assert.equal(complete.storage.find(value=>value.uid===uid).species,chain.at(-1));assert.equal(complete.storage.find(value=>value.uid===uid).level,100);
    for(const id of chain)assert(complete.dex.owned.includes(id),'Skipped intermediate form is registered');
    const save=structuredClone(base),origin=mon(chain[0],59),blocked=chain[2];save.storage.push(origin,...Array.from({length:6},(_,i)=>mon(blocked,1,`chain-cap-${blocked}-${i}`)));
    const capped=make(save);capped.dispatch({type:'allocateExp',uid:origin.uid,amount:1e9});const trained=parse(capped),held=trained.storage.find(value=>value.uid===origin.uid);
    assert.equal(held.species,chain[1]);assert.equal(held.level,100);assert(trained.exp_pool<save.exp_pool);assert.deepEqual(trained.rng_state,save.rng_state);
    reject(capped,{type:'evolve',uid:origin.uid,toSpecies:blocked},'Manual retry at the same intermediate cap');
    const freed=parse(capped);freed.storage=freed.storage.filter(value=>value.uid!==`chain-cap-${blocked}-0`);const recovered=make(freed);
    for(const to of chain.slice(2))assertSelected(recovered,origin.uid,to);
    assert.equal(parse(recovered).storage.find(value=>value.uid===origin.uid).species,chain.at(-1));
  });
  check('Literal source level-one gates can be crossed after the ordinary parent chain',()=>{
    for(const [initial,target] of [[346,729],[54,1143]]){
      const {game,uid}=fixture(initial,1);game.dispatch({type:'allocateExp',uid,amount:1e9});
      assert.equal(parse(game).storage.find(value=>value.uid===uid).species,target);
    }
  });

  const acquisition=buildAcquisitionIndex(catalog),initial=buildInitialFormAcquisitionIndex(catalog,acquisition);
  check('Nier keeps its ordinary chain and Aifeidesi has the complete executable initial-form path',()=>{
    assert.deepEqual(byId.get(77).evolution,oldById.get(77).evolution);assert.deepEqual(byId.get(78).evolution,oldById.get(78).evolution);
    assert.equal(byId.get(1459).evolves_from,79);
    const route=initial.get(1459).initialForms.find(value=>value.species===77);assert(route&&route.routes.length>0);
    assert.deepEqual(route.evolutionPath.map(step=>[step.from,step.to,step.level]),[[77,78,17],[78,79,37],[79,1459,60]]);
    assert(route.evolutionPath.every(step=>step.implemented));
    assert.equal(autoEvolve(mon(77,100),dex).mon.species,1459);
    for(const [from,level,to] of [[77,16,78],[78,36,79],[79,59,1459]]){const {game,uid}=fixture(from,level);game.dispatch({type:'useItem',uid,itemId:'item_level_up_1'});assert.equal(parse(game).storage.find(value=>value.uid===uid).species,to);}
  });

  for(const [root,parent,targets,predecessor,parentLevel] of [[65,67,[1316,1317],66,36],[738,739,[1428,1429],738,33]]){
    check(`${root}->${parent}: actual repeat capture supplies both new branches under the six-copy limit`,()=>{
      const wild=acquisition.get(root).routes.find(route=>route.kind==='wild');assert(wild,'An existing initial-form wild route is required');
      const game=make(base);game.dispatch({type:'cheatMonster',uid:game.snapshot().party[0],level:100});
      function capture(current){current.dispatch({type:'startTraining',species:root,level:5,planetId:wild.planetId,regionId:wild.regionId});assert.equal(current.snapshot().battle?.canCapture,true);current.dispatch({type:'capture',itemId:'item_capsule_master'});assert.equal(current.snapshot().battle?.captured,true);current.dispatch({type:'closeBattle'});}
      for(let i=0;i<6;i++)capture(game);const full=parse(game);assert.equal(full.storage.filter(value=>value.species===root).length,6);
      game.dispatch({type:'startTraining',species:root,level:5,planetId:wild.planetId,regionId:wild.regionId});assert.equal(game.snapshot().battle?.canCapture,false);reject(game,{type:'capture',itemId:'item_capsule_master'},'Initial form seventh capture');
      const repeated=make(full);
      for(const target of targets){const uid=parse(repeated).storage.find(value=>value.species===root).uid;repeated.dispatch({type:'cheatMonster',uid,level:100});assert.equal(parse(repeated).storage.find(value=>value.uid===uid).species,parent,'Ordinary training stops at the new choice');reject(repeated,{type:'evolve',uid},'Missing branch choice');assertSelected(repeated,uid,target);capture(repeated);assert.equal(parse(repeated).storage.filter(value=>value.species===root).length,6);}
      for(const target of targets)assert(parse(repeated).storage.some(value=>value.species===target));
      assert.equal(parse(make(parse(repeated))).storage.filter(value=>value.species===root).length,6);
      repeatRoutes.push({root,parent,targets,planetId:wild.planetId,regionId:wild.regionId,captures:8});
    });
    check(`${parent}: evolving a capped branch parent releases room for another raised instance`,()=>{
      const save=structuredClone(base),origin=mon(predecessor,parentLevel-1);save.storage.push(origin,...Array.from({length:6},(_,i)=>mon(parent,100,`parent-cap-${parent}-${i}`)));
      const game=make(save);game.dispatch({type:'useItem',uid:origin.uid,itemId:'item_level_up_1'});assert.equal(parse(game).storage.find(value=>value.uid===origin.uid).species,predecessor);assert.equal(parse(game).storage.find(value=>value.uid===origin.uid).level,parentLevel);
      reject(game,{type:'evolve',uid:origin.uid,toSpecies:parent},'Seventh branch-parent instance');
      assertSelected(game,`parent-cap-${parent}-0`,targets[0]);game.dispatch({type:'evolve',uid:origin.uid,toSpecies:parent});assert.equal(parse(game).storage.find(value=>value.uid===origin.uid).species,parent);assert.equal(parse(game).storage.filter(value=>value.species===parent).length,6);
    });
  }

  check('Independent closure reaches all 1479 eligible forms and no existing acquisition route regresses',()=>{
    const baseline=buildAcquisitionIndex({...source,bosses:catalog.bosses}),reachable=new Set([...baseline].filter(([,entry])=>entry.status==='available').map(([id])=>id));
    assert.equal(reachable.size,1447,'Pinned v33 baseline');
    for(let previous=-1;previous!==reachable.size;){previous=reachable.size;for(const id of [...reachable])for(const edge of byId.get(id).evolution)if(edge.method==='level'&&edge.level<=100)reachable.add(edge.to);}
    const eligible=catalog.species.filter(row=>!NPC_ONLY_SPECIES.has(row.id));assert.equal(eligible.length,1479);assert.equal(reachable.size,1479);
    for(const row of eligible){assert(reachable.has(row.id),`Independent directed closure misses ${row.id}`);assert.equal(acquisition.get(row.id).status,'available');const paths=initial.get(row.id).initialForms;assert(paths.some(path=>path.routes.length>0&&path.evolutionPath.every(step=>step.implemented)),`${row.id}: executable root-to-form path`);}
    assert.deepEqual([...acquisition].filter(([,entry])=>entry.status==='npc').map(([id])=>id).sort((a,b)=>a-b),[122,123,124,125]);
    for(const [id,entry]of baseline)if(entry.status==='available')assert.equal(acquisition.get(id).status,'available');
  });
  check('Controllers and test fixtures leave the input catalog unchanged',()=>assert.equal(JSON.stringify(catalog),catalogBytes));
  const report={baselineRevision:BASELINE_REVISION,sourceLevelTransitions:SOURCE_LEVELS.length,remakeLevelTransitions:REMAKE_LEVELS.length,transitions,repeatRoutes,checks,failures};
  fs.mkdirSync('artifacts/evolution-specials',{recursive:true});fs.writeFileSync('artifacts/evolution-specials/controller.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({transitions:transitions.length,repeatRoutes:repeatRoutes.length,passed:checks.length,failures},null,2));assert.equal(failures.length,0,`${failures.length} special evolution verification failures`);
} finally {await server.close();if(beforeStorage)Object.defineProperty(globalThis,'localStorage',beforeStorage);else delete globalThis.localStorage;}
