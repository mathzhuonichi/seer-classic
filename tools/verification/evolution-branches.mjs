/** Branch selection, atomic rejection, identity preservation, and repeat acquisition. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';

const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const memory = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: key => memory.delete(key),
} });
const server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', logLevel: 'error' });
const checks = [], failures = [], selected = [], repeated = [], mechanical = [];
function check(name, run) {
  try { run(); checks.push(name); }
  catch (error) { failures.push({ name, error: String(error.stack).slice(0,3000) }); console.error(`FAIL ${name}: ${error.message}`); }
}
try {
  const { createGame, loadGameData } = await server.ssrLoadModule('/src/game.ts');
  const { makeDex, createMonster, SeededRng, computeStats, autoEvolve, expToNext } = await server.ssrLoadModule('/raising/core/index.ts');
  const { buildRecruitmentRewards } = await server.ssrLoadModule('/src/progression/recruitment.ts');
  const { buildAcquisitionIndex } = await server.ssrLoadModule('/src/progression/acquisition.ts');
  const catalog = await loadGameData(), sourceBytes = JSON.stringify(catalog), dex = makeDex(catalog);
  const byId = new Map(catalog.species.map(row => [row.id, row]));
  const branches = catalog.species.filter(row => new Set(row.evolution.map(edge => edge.to)).size > 1);
  const parse = game => JSON.parse(game.exportSave());
  const fresh = parse(createGame(catalog, ''));
  fresh.rng_state = [101,202,303,404];
  fresh.items = { item_capsule_master: 30, item_level_up_1: 10 };
  fresh.exp_pool = 1e9;
  const make = (save, input = catalog) => createGame(input, JSON.stringify(save));
  function monster(species, level = 100, uid = `fixture-${species}`) {
    const mon = createMonster(dex, species, level, new SeededRng(species), { how: 'gift', at: '2026-10-14T00:00:00.000Z' });
    Object.assign(mon, { uid, nickname: 'Branch fixture', iv: 27, generation: 1, evs: { hp: 23, atk: 31, def: 17, spa: 11, spd: 7, spe: 19 } });
    mon.hp = computeStats(mon, dex).hp;
    return mon;
  }
  function fixture(species, level = 100, input = catalog) {
    const save = structuredClone(fresh), mon = monster(species, level);
    save.storage.push(mon); save.game.traits[mon.uid] = save.game.traits[save.party[0]];
    return { game: make(save, input), uid: mon.uid };
  }
  function reject(game, action, label) {
    const before = game.exportSave(), battle = JSON.stringify(game.snapshot().battle);
    game.dispatch(action);
    assert.equal(game.exportSave(), before, `${label}: complete save and RNG unchanged`);
    assert.equal(JSON.stringify(game.snapshot().battle), battle, `${label}: battle unchanged`);
  }
  function select(game, uid, target) {
    const before = parse(game), old = before.storage.find(mon => mon.uid === uid), snapshot = game.snapshot(), snapshotBytes = JSON.stringify(snapshot);
    game.dispatch({ type: 'evolve', uid, toSpecies: target });
    const after = parse(game), mon = after.storage.find(entry => entry.uid === uid);
    assert.equal(mon.species, target, `${old.species} -> selected ${target}`);
    for (const key of ['uid','nickname','level','exp','iv','nature','evs','obtained','generation','status']) assert.deepEqual(mon[key], old[key], `${key} retained`);
    assert(old.learned.every(id => mon.learned.includes(id)), 'Previously learned skills retained');
    assert.deepEqual(mon.skills.slice(0,old.skills.length), old.skills, 'Existing equipped skills retained');
    for (const id of old.skills) assert.equal(mon.pp[id], old.pp[id], 'Existing PP retained');
    assert.equal(mon.hp, Math.max(0,Math.min(computeStats(mon,dex).hp, old.hp + computeStats(mon,dex).hp - computeStats(old,dex).hp)), 'HP changes only with maximum HP');
    assert.deepEqual(after.storage.filter(entry => entry.uid !== uid), before.storage.filter(entry => entry.uid !== uid), 'Other instances unchanged');
    assert.deepEqual(after.game.traits, before.game.traits, 'Trait assignment retained');
    assert.deepEqual(after.party, before.party, 'Party positions retained');
    assert.deepEqual(after.items, before.items, 'No item consumption');
    assert.deepEqual(after.rng_state, before.rng_state, 'Selection draws no RNG');
    assert.equal(JSON.stringify(snapshot), snapshotBytes, 'Earlier view remains immutable');
    assert(after.dex.owned.includes(target), 'Selected form registered');
    const restored = make(after);
    assert.deepEqual(parse(restored).storage.find(entry => entry.uid === uid), mon, 'Chosen form and identity survive reload');
    return mon;
  }

  check('Production data contains distinct, selectable level branches', () => {
    assert(branches.length > 0, 'No branch evolution data was installed');
    for (const row of branches) {
      assert(row.evolution.every(edge => edge.method === 'level' && Number.isInteger(edge.level) && edge.level >= 1 && edge.level <= 100));
      assert.equal(new Set(row.evolution.map(edge => edge.to)).size, row.evolution.length, 'No duplicated branch targets');
    }
  });
  for (const row of branches) check(`${row.id}: explicit selection, locked targets, and every branch identity`, () => {
    const eligible = fixture(row.id), lowest = Math.min(...row.evolution.map(edge => edge.level));
    reject(eligible.game, { type: 'evolve', uid: eligible.uid }, 'Missing explicit branch');
    reject(eligible.game, { type: 'evolve', uid: eligible.uid, toSpecies: 1 }, 'Unrelated species');
    reject(eligible.game, { type: 'evolve', uid: eligible.uid, toSpecies: 999999 }, 'Unknown species');
    const low = fixture(row.id, Math.max(1,lowest-1));
    for (const edge of row.evolution) {
      if (edge.level > 1) reject(low.game, { type: 'evolve', uid: low.uid, toSpecies: edge.to }, 'Under-level target');
      const { game, uid } = fixture(row.id), view = game.snapshot().monsters.find(mon => mon.uid === uid);
      assert.deepEqual(view.evolutionChoices.map(choice => choice.species).sort((a,b)=>a-b), row.evolution.map(edge=>edge.to).sort((a,b)=>a-b));
      assert(view.evolutionChoices.every(choice => choice.ready && !choice.blockedReason));
      select(game,uid,edge.to); selected.push({ from: row.id, to: edge.to, level: edge.level });
    }
    assert(low.game.snapshot().monsters.find(mon=>mon.uid===low.uid).evolutionChoices.every(choice=>!choice.ready || choice.level<=1), 'Locked branches remain visible');
  });

  for (const row of branches) for (const edge of row.evolution) check(`${row.id}->${edge.to}: cap includes owned plus every essence alias`, () => {
    const aliasA = `essence_branch_a_${edge.to}`, aliasB = `essence_branch_b_${edge.to}`;
    const input = { ...catalog, items: [...catalog.items, ...[aliasA,aliasB].map(id=>({id,name:{zh:id},kind:'essence',hatches:edge.to}))] };
    const save = structuredClone(fresh), origin = monster(row.id);
    save.storage.push(origin,monster(edge.to,100,`held-${edge.to}-a`),monster(edge.to,100,`held-${edge.to}-b`));
    save.items[aliasA] = 1; save.items[aliasB] = 3;
    const game = make(save,input);
    reject(game,{type:'evolve',uid:origin.uid,toSpecies:edge.to},'Two held + four alias essences block a seventh');
    const view = game.snapshot().monsters.find(mon=>mon.uid===origin.uid).evolutionChoices.find(choice=>choice.species===edge.to);
    assert(view.blockedReason && /6/.test(view.blockedReason), 'Selected target exposes the cap');
    save.items[aliasB] = 2;
    const allowed = make(save,input); allowed.dispatch({type:'evolve',uid:origin.uid,toSpecies:edge.to});
    assert.equal(parse(allowed).storage.find(mon=>mon.uid===origin.uid).species,edge.to,'Exactly the sixth held/reserved copy is allowed');
    assert.equal(parse(allowed).storage.filter(mon=>mon.species===edge.to).length+parse(allowed).items[aliasA]+parse(allowed).items[aliasB],6);
  });

  // Deliberately different levels exercise a bug that equal-level production branches cannot reveal.
  const fork = structuredClone(catalog);
  fork.species.find(row=>row.id===91).evolution = [{to:92,method:'level',level:10},{to:93,method:'level',level:20}];
  const forkDex = makeDex(fork), atTen = monster(91,10);
  check('An early eligible branch never silently wins over a later branch', () => {
    assert.equal(autoEvolve(atTen,forkDex).mon.species,91);
    const {game,uid}=fixture(91,10,fork), view=game.snapshot().monsters.find(mon=>mon.uid===uid);
    assert.deepEqual(view.evolutionChoices.map(choice=>[choice.species,choice.ready]),[[92,true],[93,false]]);
    reject(game,{type:'evolve',uid},'One currently eligible option still requires selection');
    reject(game,{type:'evolve',uid,toSpecies:93},'Later locked target');
    game.dispatch({type:'evolve',uid,toSpecies:92}); assert.equal(parse(game).storage.find(mon=>mon.uid===uid).species,92);
  });
  // The core supports direct EXP items although the current shop only stocks EXP boosts.
  const expItem = {id:'item_test_branch_exp',name:{zh:'Branch EXP fixture'},kind:'raising',raising_effect:{op:'exp',amount:expToNext(byId.get(91).growth,9)}};
  fork.items.push(expItem);
  for (const [name,actionFor] of [
    ['level editor', uid=>({type:'cheatMonster',uid,level:10})],
    ['pooled experience', uid=>({type:'allocateExp',uid,amount:expToNext(byId.get(91).growth,9)})],
    ['level item',uid=>({type:'useItem',uid,itemId:'item_level_up_1'})],
    ['experience item',uid=>({type:'useItem',uid,itemId:expItem.id})],
  ]) check(`${name} retains the branch point after leveling`,()=>{
    const save=structuredClone(fresh),mon=monster(91,9);save.storage.push(mon);save.items[expItem.id]=2;
    const game=make(save,fork);game.dispatch(actionFor(mon.uid));const trained=parse(game).storage.find(entry=>entry.uid===mon.uid);
    assert(trained.level>=10,'Training actually crossed an evolution threshold');assert.equal(trained.species,91,'Selection is not automatic');
  });
  check('Battle experience retains the branch point after leveling',()=>{
    const input=structuredClone(fork),attack=input.skills.find(skill=>skill.id===10001);
    Object.assign(attack,{power:1000000,accuracy:null,priority:20});
    const save=structuredClone(fresh),mon=monster(91,9);mon.skills=[10001];mon.learned=[...new Set([...mon.learned,10001])];mon.pp={'10001':40};
    save.storage.push(mon);save.party=[mon.uid];const game=make(save,input);
    game.dispatch({type:'startTraining',species:10,level:100});game.dispatch({type:'move',skillId:10001});
    assert(game.snapshot().battle?.won,'Real controller battle finished');
    const trained=parse(game).storage.find(entry=>entry.uid===mon.uid);assert(trained.level>=10);assert.equal(trained.species,91);
  });
  check('Manual-only flag remains manual for a single edge and participates in a fork',()=>{
    const input=structuredClone(catalog);input.species.find(row=>row.id===91).evolution=[{to:92,method:'level',level:10,automatic:false}];
    assert.equal(autoEvolve(atTen,makeDex(input)).mon.species,91);
    const {game,uid}=fixture(91,9,input);game.dispatch({type:'cheatMonster',uid,level:10});assert.equal(parse(game).storage.find(mon=>mon.uid===uid).species,91);
    game.dispatch({type:'evolve',uid});assert.equal(parse(game).storage.find(mon=>mon.uid===uid).species,92,'Unambiguous manual edge remains backwards compatible');
    input.species.find(row=>row.id===91).evolution=[{to:92,method:'level',level:10},{to:93,method:'level',level:20,automatic:false}];
    assert.equal(autoEvolve(atTen,makeDex(input)).mon.species,91,'A manual second option still prevents silent selection');
    const mixed=fixture(91,10,input);reject(mixed.game,{type:'evolve',uid:mixed.uid},'Manual future branch still requires explicit target');
  });
  check('Legacy ordinary evolution, over-cap inventory, and old form saves survive',()=>{
    const {game,uid}=fixture(1,18);game.dispatch({type:'evolve',uid});assert.equal(parse(game).storage.find(mon=>mon.uid===uid).species,2,'Old action without target remains valid for a single edge');
    for(const row of branches){const {game,uid}=fixture(row.id);const legacy=parse(game);delete legacy.storage.find(mon=>mon.uid===uid).generation;delete legacy.game.recruitmentClaims;
      const restored=make(legacy);assert.equal(parse(restored).storage.find(mon=>mon.uid===uid).species,row.id,'Loading never chooses a branch');
      assert.equal(restored.snapshot().monsters.find(mon=>mon.uid===uid).generation,0);}
    const save=structuredClone(fresh);save.items.essence_daidaiyong=20;save.progress.bosses_cleared.push('boss_tower_brave_f070');
    assert.equal(parse(make(save)).items.essence_daidaiyong,20,'Legacy surplus remains intact');
  });

  const evolutionRules = fs.existsSync('data/evolution-rules.json') ? JSON.parse(fs.readFileSync('data/evolution-rules.json','utf8')).rules : [];
  const mechanicalRules = evolutionRules.filter(rule=>rule.kind==='mechanical-level');
  check('The source-backed ordinary mechanical rule set is installed',()=>assert.equal(mechanicalRules.reduce((sum,rule)=>sum+rule.transitions.length,0),43));
  for(const rule of mechanicalRules)for(const edge of rule.transitions)check(`${rule.from}->${edge.to}: ordinary mechanical level threshold and cap`,()=>{
    const source=byId.get(rule.from);assert(source,'Mechanical source exists');
    assert.deepEqual(source.evolution.find(candidate=>candidate.to===edge.to),edge,'Runtime edge matches the approved rule');
    assert.equal(edge.method,'level');assert.notEqual(edge.automatic,false);
    const under=monster(rule.from,edge.level-1),reached=monster(rule.from,edge.level);
    assert.equal(autoEvolve(under,dex).mon.species,rule.from,'One level early does not evolve');
    assert.equal(autoEvolve(reached,dex).mon.species,edge.to,'Reaching the threshold evolves automatically');
    const {game,uid}=fixture(rule.from,edge.level-1);reject(game,{type:'evolve',uid,toSpecies:edge.to},'One level early manual attempt');
    game.dispatch({type:'useItem',uid,itemId:'item_level_up_1'});
    const after=parse(game),evolved=after.storage.find(mon=>mon.uid===uid);
    assert.equal(evolved.species,edge.to,'Normal level item triggers the ordinary edge');assert.equal(evolved.level,edge.level);
    assert.equal(evolved.uid,uid);assert.equal(evolved.generation,1);assert.equal(evolved.nickname,'Branch fixture');
    assert.equal(parse(make(after)).storage.find(mon=>mon.uid===uid).species,edge.to,'Ordinary evolution persists');
    const cappedSave=structuredClone(fresh),origin=monster(rule.from,edge.level-1);
    cappedSave.storage.push(origin,...Array.from({length:6},(_,index)=>monster(edge.to,1,`cap-${edge.to}-${index}`)));
    const capped=make(cappedSave),before=parse(capped);capped.dispatch({type:'useItem',uid:origin.uid,itemId:'item_level_up_1'});
    const retained=parse(capped).storage.find(mon=>mon.uid===origin.uid);
    assert.equal(retained.species,rule.from,'Full destination keeps the current form');assert.equal(retained.level,edge.level,'Training is retained');
    assert.deepEqual(parse(capped).rng_state,before.rng_state,'Blocked automatic evolution draws no RNG');
    reject(capped,{type:'evolve',uid:origin.uid,toSpecies:edge.to},'Capped manual retry');
    mechanical.push({from:rule.from,to:edge.to,level:edge.level});
  });

  const acquisition=buildAcquisitionIndex(catalog), rewards=buildRecruitmentRewards(catalog);
  for(const row of branches) {
    const wild=acquisition.get(row.id)?.routes.find(route=>route.kind==='wild');
    if(wild)check(`${row.id}: repeat real capture, sixth ceiling, and slot released by evolution`,()=>{
      const game=make(fresh);game.dispatch({type:'cheatMonster',uid:game.snapshot().party[0],level:100});
      function capture(current) {
        current.dispatch({type:'startTraining',species:row.id,level:5,planetId:wild.planetId,regionId:wild.regionId});
        assert.equal(current.snapshot().battle?.canCapture,true,'Actual wild battle is capturable');
        current.dispatch({type:'capture',itemId:'item_capsule_master'});assert.equal(current.snapshot().battle?.captured,true);current.dispatch({type:'closeBattle'});
      }
      for(let i=0;i<6;i++)capture(game);
      assert.equal(parse(game).storage.filter(mon=>mon.species===row.id).length,6);
      const full=parse(game);game.dispatch({type:'startTraining',species:row.id,level:5,planetId:wild.planetId,regionId:wild.regionId});
      assert.equal(game.snapshot().battle?.canCapture,false);reject(game,{type:'capture',itemId:'item_capsule_master'},'Seventh capture');
      const released=make(full),uid=full.storage.find(mon=>mon.species===row.id).uid;
      released.dispatch({type:'cheatMonster',uid,level:100});assert.equal(parse(released).storage.find(mon=>mon.uid===uid).species,row.id);
      released.dispatch({type:'evolve',uid,toSpecies:row.evolution[0].to});assert.equal(parse(released).storage.filter(mon=>mon.species===row.id).length,5);
      capture(released);assert.equal(parse(released).storage.filter(mon=>mon.species===row.id).length,6);
      assert.equal(parse(make(parse(released))).storage.filter(mon=>mon.species===row.id).length,6);
      repeated.push({species:row.id,kind:'capture',planetId:wild.planetId,regionId:wild.regionId,captures:7});
    });
    else check(`${row.id}: existing essence route repeats without creating a free wild route`,()=>{
      const reward=rewards.find(entry=>entry.rewardSpecies===row.id),bossRoute=acquisition.get(row.id)?.routes.find(route=>route.kind==='boss');
      assert(reward||bossRoute,`${row.id}: expected a repeatable existing essence route`);
      const save=structuredClone(fresh);
      if(reward)for(const condition of reward.prerequisites){if(condition.kind==='species')save.dex.owned.push(condition.species);else save.progress.bosses_cleared.push(condition.bossId);}
      else save.progress.bosses_cleared.push(bossRoute.bossId);
      const game=make(save);
      const essence=reward?.itemId??game.snapshot().shopItems.find(item=>item.kind==='essence'&&item.hatches===row.id)?.id;
      assert(essence,'Earned source essence is available');
      const claim=()=>game.dispatch(reward?{type:'claimQuest',questId:reward.questId}:{type:'buyItem',itemId:essence,quantity:1});
      for(let i=0;i<6;i++)claim();assert.equal(parse(game).items[essence],6,'Six repeated essence claims');
      reject(game,reward?{type:'claimQuest',questId:reward.questId}:{type:'buyItem',itemId:essence,quantity:1},'Seventh reserved copy');
      game.dispatch({type:'useItem',uid:game.snapshot().party[0],itemId:essence});
      const infant=parse(game).storage.find(mon=>mon.species===row.id);assert(infant);assert.equal(parse(game).items[essence],5);
      reject(game,reward?{type:'claimQuest',questId:reward.questId}:{type:'buyItem',itemId:essence,quantity:1},'One held plus five reserved');
      game.dispatch({type:'cheatMonster',uid:infant.uid,level:100});assert.equal(parse(game).storage.find(mon=>mon.uid===infant.uid).species,row.id);
      game.dispatch({type:'evolve',uid:infant.uid,toSpecies:row.evolution[0].to});assert.equal(parse(game).storage.find(mon=>mon.uid===infant.uid).species,row.evolution[0].to);
      claim();assert.equal(parse(game).items[essence],6,'Evolution frees an original-form allowance');
      assert.equal(parse(make(parse(game))).items[essence],6,'Repeated entitlement and stock persist');
      assert(!acquisition.get(row.id).routes.some(route=>route.kind==='wild'),'No invented wild route');
      repeated.push({species:row.id,kind:reward?'collection-essence':'earned-boss-essence',itemId:essence,claims:7});
    });
  }
  check('Input catalog remains immutable',()=>assert.equal(JSON.stringify(catalog),sourceBytes));
  const report={branchPoints:branches.map(row=>row.id),mechanical,selected,repeated,checks,failures,limits:['Battle-EXP fixture strengthens one existing attack to isolate settlement behavior.','The direct EXP-item path uses a test-only item; production data currently contains EXP boosts instead.','Tower essence repetition begins with an existing cleared-tower save; this does not certify a complete tower playthrough.']};
  fs.mkdirSync('artifacts/evolution-branches',{recursive:true});fs.writeFileSync('artifacts/evolution-branches/controller.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({branchPoints:report.branchPoints,mechanicalEdges:mechanical.length,selectedBranches:selected.length,repeatedRoutes:repeated.length,passed:checks.length,failures},null,2));
  assert.equal(failures.length,0,`${failures.length} evolution branch verification failures`);
} finally {
  await server.close();
  if(priorStorage)Object.defineProperty(globalThis,'localStorage',priorStorage);else delete globalThis.localStorage;
}
