/** Generated habitats: placement in the assembled world, scene visibility, and actual acquisition through the controller.
 * Source membership against the original map snapshots is checked when tools/assets/build_habitats.mjs regenerates the data. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {memoryStorage,root,suite,withSsr} from './_harness.mjs';

memoryStorage();
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
await withSsr('habitat-regions',async load=>{
  const t=suite('habitat-regions'),{check}=t;
  const modules=['/src/domain/world/world.ts','/src/features/world/map-presentation.ts','/src/features/world/world-population.ts','/src/kernel/game.ts',
    '/src/domain/acquisition/acquisition.ts','/src/domain/acquisition/recruitment.ts','/src/features/world/map-sources.ts'];
  const [{WORLD_PLANETS,GENERATED_HABITATS},{getSceneLayout,creatureSceneHome},{buildWorldPopulation},{createGame,loadCatalog},
    {buildAcquisitionIndex},{buildRecruitmentRewards},{ORIGINAL_FLOORS}]=await Promise.all(modules.map(load));
  const definitions=read('data/habitat-regions.json'),artwork={...read('src/domain/world/map-art-assets.json'),...read('src/domain/world/map-hd-assets.json')};
  const locate=({planetId,regionId})=>{const planet=WORLD_PLANETS.find(entry=>entry.id===planetId);return {planet,region:planet?.regions.find(entry=>entry.id===regionId)}};
  const catalog=await loadCatalog(),original=JSON.stringify(catalog),species=new Map(catalog.species.map(entry=>[entry.id,entry]));

  check('Every source-backed subregion is a landing on its parent planet with its own or its parent map\'s artwork',()=>{
    for(const definition of definitions.regions){
      const {planet,region}=locate({planetId:definition.planetId,regionId:definition.id});
      assert(region,definition.id);
      assert.equal(region.name,definition.name);assert.equal(region.originalMapId,definition.originalMapId);assert.equal(region.backgroundMapId,definition.backgroundMapId);
      assert(planet.originalMapId===definition.sourceParentMapId||planet.regions.some(entry=>entry.originalMapId===definition.sourceParentMapId));
      const levels=definition.species.flatMap(entry=>entry.levels);assert.deepEqual(region.levels,[Math.min(...levels),Math.max(...levels)]);
      for(const expected of definition.species)assert.deepEqual(region.creatureLevels[expected.id],expected.levels,`${definition.id}: ${expected.id}`);
      // A subregion shows the background its data names, even when its own map's art is also delivered.
      const mapId=[region.backgroundMapId,region.originalMapId,planet.originalMapId].find(id=>artwork[id]);
      assert.equal(region.backgroundAssetMapId,mapId,definition.id);
      if(mapId===undefined)assert.equal(region.sceneAttribution,definition.sceneAttribution);
      assert(fs.existsSync(path.join(root,'public',region.background.split('?')[0])),`${definition.id}: available scene art`);
    }
  });
  const {failures}=read('public/maps/original-manifest.json');
  check('A subregion shows its own art only on a source floor; otherwise its data records why',()=>{
    for(const definition of definitions.regions){
      const {id,originalMapId:mapId,sourceParentMapId,backgroundMapId,ownArtwork}=definition,{region}=locate({planetId:definition.planetId,regionId:id});
      assert(ORIGINAL_FLOORS[region.backgroundAssetMapId],`${id}: its scene layout comes from a floor, not a theme fallback`);
      if(backgroundMapId===mapId){assert(artwork[mapId]&&!ownArtwork,id);continue;}
      assert.equal(backgroundMapId,sourceParentMapId,id);
      if(ownArtwork.status==='flash-only'){
        assert(failures[mapId]&&!artwork[mapId],`${id}: no H5 background was delivered`);
        assert.equal(ownArtwork.url,`https://seer.61.com/resource/map/${mapId}.swf`);
      }else{
        // Art that the scene cannot show is not delivered; its data keeps the official URL and the reason.
        assert.equal(ownArtwork.status,'unused',id);assert(!artwork[mapId]&&!failures[mapId],`${id}: unused art is not delivered`);
        assert(ownArtwork.url.startsWith(`https://seerh5.61.com/resource/assets/map/${mapId}/`)&&ownArtwork.reason.length>20,id);
      }
    }
  });
  check('Every generated habitat is placed with its levels, scarcity and route',()=>{
    for(const habitat of GENERATED_HABITATS){
      const {region}=locate(habitat),label=`${habitat.planetId}/${habitat.regionId}: ${habitat.species}`;
      assert(region?.creatures.includes(habitat.species),label);
      assert.deepEqual(region.creatureLevels[habitat.species],habitat.levels,label);
      assert.equal(!!region.scarceCreatures?.includes(habitat.species),habitat.scarce,label);
      assert.equal(!!region.recruitmentSpecies?.includes(habitat.species),habitat.route==='recruitment',label);
    }
    assert.deepEqual(GENERATED_HABITATS.filter(row=>row.route==='recruitment').map(row=>row.species).sort((a,b)=>a-b),[406,430,560,576,760,789,818,831]);
  });

  const index=buildAcquisitionIndex(catalog),rewards=buildRecruitmentRewards(catalog),baseline=JSON.parse(createGame(catalog,'').exportSave());
  baseline.rng_state=[101,202,303,404];baseline.items.item_capsule_master=1;
  const fieldCatalog=structuredClone(catalog);
  Object.assign(fieldCatalog.skills.find(skill=>skill.id===10001),{power:1000000,accuracy:null,priority:20});
  const newMonsters=(game,existing)=>game.snapshot().monsters.filter(mon=>!existing.has(mon.uid));
  const wildRoute=(id,planet,region)=>index.get(id)?.routes.find(route=>route.kind==='wild'&&route.planetId===planet.id&&route.regionId===region.id);
  check('Every generated habitat has its encyclopedia route: wild at its scene, or the collection quest',()=>{
    for(const habitat of GENERATED_HABITATS){
      const {planet,region}=locate(habitat),id=habitat.species;
      if(habitat.route!=='recruitment'){assert(wildRoute(id,planet,region),`${id}: reachable encyclopedia route`);continue;}
      const reward=rewards.find(entry=>entry.rewardSpecies===id);
      assert(reward,`${id}: collection reward exists`);assert(!wildRoute(id,planet,region),`${id}: no direct wild route`);
      assert(index.get(id).routes.some(route=>route.kind==='quest'&&route.questId===reward.questId),`${id}: quest route`);
    }
  });
  function acquireRecruitment(habitat,planet,region){
    const id=habitat.species,reward=rewards.find(entry=>entry.rewardSpecies===id);
    const incomplete=createGame(catalog,JSON.stringify(baseline));
    for(const location of [{},{planetId:planet.id,regionId:region.id}]){
      const before=incomplete.exportSave();
      incomplete.dispatch({type:'startTraining',species:id,level:habitat.levels[0],...location});
      assert.equal(incomplete.snapshot().battle,null,`${id}: map contact cannot start a direct battle`);
      assert.equal(incomplete.exportSave(),before,`${id}: rejected direct request preserves save, capsule, and RNG`);
    }
    const beforeClaim=incomplete.exportSave();
    incomplete.dispatch({type:'claimQuest',questId:reward.questId});
    assert.equal(incomplete.exportSave(),beforeClaim,`${id}: unmet collection quest remains gated`);
    const ready=structuredClone(baseline);
    for(const condition of reward.prerequisites){
      if(condition.kind==='species'){ready.dex.owned.push(condition.species);ready.dex.seen.push(condition.species);}
      else ready.progress.bosses_cleared.push(condition.bossId);
    }
    const game=createGame(catalog,JSON.stringify(ready)),existing=new Set(game.snapshot().monsters.map(mon=>mon.uid));
    game.dispatch({type:'claimQuest',questId:reward.questId});
    assert.equal(JSON.parse(game.exportSave()).items[reward.itemId],1,`${id}: completed quest grants its collection essence`);
    game.dispatch({type:'useItem',itemId:reward.itemId,uid:game.snapshot().party[0]});
    assert.deepEqual(newMonsters(createGame(catalog,game.exportSave()),existing).map(mon=>mon.species),[id]);
  }
  function acquireWild(habitat,planet,region){
    const id=habitat.species,route=wildRoute(id,planet,region);
    const game=createGame(habitat.route==='challenge'?fieldCatalog:catalog,JSON.stringify(baseline));
    game.dispatch({type:'cheatMonster',uid:game.snapshot().party[0],level:100});
    if(id===416){
      game.dispatch({type:'startTraining',species:id,level:habitat.levels[0],planetId:planet.id,regionId:region.id});
      assert.equal(game.snapshot().battle.canCapture,false,'Niao requires an active partner');
      const before=game.exportSave();
      game.dispatch({type:'capture',itemId:'item_capsule_master'});
      assert.equal(game.exportSave(),before,'Missing Niao partner consumes no capsule or RNG');
      game.importSave(JSON.stringify(baseline));
      game.dispatch({type:'cheatAcquire',species:77,level:5});
      const partner=game.snapshot().monsters.find(mon=>mon.species===77);
      game.dispatch({type:'reorderParty',uids:[partner.uid,...game.snapshot().party.filter(uid=>uid!==partner.uid)]});
      assert.deepEqual([...route.requiredActiveSpecies],[77,78,79,310,311,312]);
    }
    const existing=new Set(game.snapshot().monsters.map(mon=>mon.uid));
    game.dispatch({type:'startTraining',species:id,level:habitat.levels[0],planetId:planet.id,regionId:region.id});
    assert.equal(game.snapshot().battle?.enemy.species,id,`${id}: controller starts the selected creature`);
    if(habitat.route==='capture'){
      assert.equal(game.snapshot().battle.canCapture,true);
      game.dispatch({type:'capture',itemId:'item_capsule_master'});
      assert.equal(game.snapshot().battle.captured,true,`${id}: actual capsule capture`);
    }else{
      assert.equal(game.snapshot().battle.canCapture,false);
      game.dispatch({type:'move',skillId:10001});
      assert.equal(game.snapshot().battle.won,true,`${id}: field challenge victory`);
    }
    game.dispatch({type:'closeBattle'});
    const restored=createGame(catalog,game.exportSave());
    if(habitat.route==='challenge')restored.dispatch({type:'useItem',itemId:`essence_recruit_${id}`,uid:restored.snapshot().party[0]});
    assert.deepEqual(newMonsters(restored,existing).map(mon=>mon.species),[id],`${id}: reload and hatch preserve the selected initial form`);
  }
  // Every subregion habitat, every field challenge and collection, and the partner-gated Niao; other captures share the subregion path.
  const subregions=new Set(definitions.regions.map(region=>`${region.planetId}/${region.id}`));
  const acquired=GENERATED_HABITATS.filter(row=>subregions.has(`${row.planetId}/${row.regionId}`)||row.route!=='capture'||row.species===416);
  const counts={capture:0,challenge:0,recruitment:0};
  check('Habitats are acquired through their route: capsule, field challenge essence or collection quest',()=>{
    for(const habitat of acquired){
      const {planet,region}=locate(habitat);
      (habitat.route==='recruitment'?acquireRecruitment:acquireWild)(habitat,planet,region);counts[habitat.route]++;
    }
  });
  const crowded=[];
  check('Crowded scenes give every resident a distinct anchor on the ground',()=>{
    for(const planet of WORLD_PLANETS)for(const region of planet.regions){
      const residents=region.creatures.map(id=>({id,...species.get(id)}));
      const population=buildWorldPopulation(`${planet.id}/${region.id}`,residents,6,region.levels,region.creatureLevels,region.scarceCreatures);
      if(population.length<=6)continue;
      const layout=getSceneLayout(planet,region),homes=population.map((_,i)=>creatureSceneHome(layout,i,population.length));
      assert.equal(new Set(homes.map(p=>`${p.x}/${p.y}`)).size,homes.length,`${region.id}: no shared creature anchors`);
      assert(homes.every(p=>p.x>=8&&p.x<=92&&p.y>=38&&p.y<=92),`${region.id}: anchors stay on the scene floor`);
      crowded.push({planetId:planet.id,regionId:region.id,count:homes.length});
    }
  });
  check('Acquisitions leave the source catalog unchanged',()=>assert.equal(JSON.stringify(catalog),original));
  t.finish({regions:definitions.regions.length,placements:GENERATED_HABITATS.length,acquired:counts,crowdedScenes:crowded});
});
