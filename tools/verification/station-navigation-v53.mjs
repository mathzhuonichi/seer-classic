/** Compact station routes, legacy landings and retained acquisition contacts. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('../../',import.meta.url));
const report={checks:[],failures:[],observations:{}};
const check=(name,run)=>{try{run();report.checks.push(name)}catch(error){report.failures.push({name,error:String(error.stack)});console.error(`FAIL ${name}: ${error.message}`)}};
const memory=new Map([['seer-classic-save','Player save sentinel']]);
const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)}});
const server=await createServer({root,configFile:false,cacheDir:path.join(root,'artifacts/.validation-cache/station-navigation-v53'),server:{middlewareMode:true,watch:null,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',logLevel:'error'});
try{
  const [world,{getSceneExits},{WorldMap},{default:BattleFacilities},{createGame,loadGameData}]=await Promise.all([
    '/src/world.ts','/src/presentation/scene-exits.ts','/src/components/WorldMap.tsx','/src/components/BattleFacilities.tsx','/src/game.ts',
  ].map(id=>server.ssrLoadModule(id)));
  const {WORLD_PLANETS,findChallengeLocation,findSceneChallenges,resolveWorldLocation,readWorldPreference}=world;
  const catalog=await loadGameData(),catalogBefore=JSON.stringify(catalog),game=createGame(catalog,''),saveBefore=game.exportSave(),s=game.snapshot();
  const ship=WORLD_PLANETS.find(planet=>planet.id==='station'),station=WORLD_PLANETS.find(planet=>planet.id==='space-station');
  const aliases={
    'station/brave-tower':['space-station','brave-tower'],
    'station/dark-arena':['space-station','dark-arena'],
    'station/mission-dock':['station','transport'],
    'station/challenge-dock':['station','transport'],
    'space-station/random-arena':['space-station','resources'],
    'space-station/elite-arena':['space-station','resources'],
    'space-station/classic-arena':['space-station','resources'],
  };
  const location=(planetId,regionId)=>{const {planet,region}=resolveWorldLocation(planetId,regionId);return [planet.id,region.id]};
  const markup=(planetId,regionId,extra={})=>{
    memory.set('seer-classic.world-ui.v1',JSON.stringify({planetId,regionId,x:50,y:70,visited:[`${planetId}/${regionId}`]}));
    return renderToStaticMarkup(React.createElement(WorldMap,{s,c:game,...extra}));
  };
  check('Ship and Space Station retain only three and four distinct functional backgrounds',()=>{
    assert.deepEqual(ship.regions.map(region=>region.id),['transport','lab','captain']);
    assert.deepEqual(station.regions.map(region=>region.id),['resources','brave-tower','dark-arena','mystery']);
    for(const planet of [ship,station]){
      assert.equal(new Set(planet.regions.map(region=>region.backgroundAssetMapId)).size,planet.regions.length);
      for(const region of planet.regions)assert(fs.existsSync(path.join(root,'public',region.background.split('?')[0])));
    }
    assert.deepEqual(ship.regions.map(region=>region.facility),['challenges','recovery','missions']);
  });
  check('Seven former room IDs resolve from direct links and stored world preferences',()=>{
    for(const [key,destination]of Object.entries(aliases)){
      assert.deepEqual(location(...key.split('/')),destination,key);
      const [planetId,regionId]=key.split('/');
      memory.set('seer-classic.world-ui.v1',JSON.stringify({planetId,regionId,x:20,y:70,visited:[key]}));
      const preference=readWorldPreference();assert.deepEqual([preference.planetId,preference.regionId],destination);
      assert.equal(preference.x,20);assert.equal(preference.y,70);
    }
    assert.equal(memory.get('seer-classic-save'),'Player save sentinel');
  });
  check('The compact station has reciprocal hub branches and only the Tower leads to Puni',()=>{
    const expected={resources:['brave-tower','dark-arena'],'brave-tower':['mystery','resources'],'dark-arena':['resources'],mystery:['brave-tower']};
    for(const region of station.regions){
      const exits=getSceneExits(station,region);assert.deepEqual(exits.map(exit=>exit.targetRegionId).sort(),expected[region.id].sort());
      for(const exit of exits){
        const target=station.regions.find(row=>row.id===exit.targetRegionId);assert(target);
        assert(getSceneExits(station,target).some(reverse=>reverse.targetRegionId===region.id));
        assert(exit.anchor.x>=0&&exit.anchor.x<=100&&exit.anchor.y>=0&&exit.anchor.y<=100);
      }
    }
    const reached=new Set(['transport']);let changed=true;
    while(changed){changed=false;for(const region of ship.regions.filter(row=>reached.has(row.id)))for(const exit of getSceneExits(ship,region))if(!reached.has(exit.targetRegionId)){reached.add(exit.targetRegionId);changed=true}}
    assert.deepEqual([...reached].sort(),ship.regions.map(region=>region.id).sort());
  });
  check('Every encounter still has a valid landing and one reachable contact or progression entry',()=>{
    const counts={ordinary:0,tower:0,campaign:0,transport:0};
    for(const boss of s.bosses){
      const destination=findChallengeLocation(boss),{planet,region}=resolveWorldLocation(destination.planetId,destination.regionId);
      assert.deepEqual([planet.id,region.id],[destination.planetId,destination.regionId],boss.id);
      const contacts=findSceneChallenges(planet.id,region.id,s.bosses,boss.id);
      if(region.campaignId){assert.equal(contacts.length,0);assert(region.bossIds.includes(boss.id));counts.campaign++}
      else if(planet.id==='space-station'&&region.id==='brave-tower'){assert.equal(contacts.length,0);counts.tower++}
      else{assert(contacts.some(contact=>contact.id===boss.id),boss.id);assert.equal(new Set(contacts.map(contact=>contact.id)).size,contacts.length);counts.ordinary++}
      if(destination.staging){assert.deepEqual([planet.id,region.id],['station','transport']);assert(region.challengeStaging);counts.transport++}
    }
    for(const alias of ['mission-dock','challenge-dock'])for(const boss of s.bosses.filter(row=>findChallengeLocation(row).staging))assert(findSceneChallenges('station',alias,s.bosses,boss.id).some(row=>row.id===boss.id));
    assert.equal(findSceneChallenges('station','transport',s.bosses).length,0);
    report.observations.encounters=counts;
  });
  check('Dark wildlife, fortress capture and all eight Puni stages keep their original places',()=>{
    const dark=resolveWorldLocation('space-station','dark-arena').region,trial=resolveWorldLocation('fortress','trial').region,mystery=resolveWorldLocation('space-station','mystery').region;
    for(const species of [1180,1183,1186]){assert(dark.creatures.includes(species));assert(dark.scarceCreatures.includes(species));assert(dark.creatureLevels[species])}
    assert(trial.creatures.includes(445));assert(trial.bossIds.includes('boss_trial_brave_qigesa'));assert.equal(trial.originalMapId,402);
    const stages=['boss_puni_seal1','boss_puni_seal2','boss_puni_seal3','boss_puni_seal4','boss_puni_seal5','boss_puni_seal6','boss_puni_seal7','boss_puni_zhenshen'];
    assert.equal(mystery.campaignId,'puni');assert.equal(mystery.originalMapId,10032);
    for(const id of stages)assert.deepEqual(findChallengeLocation(s.bosses.find(boss=>boss.id===id)),{planetId:'space-station',regionId:'mystery',staging:false});
  });
  check('Two equipment terminals retain battle and Dark routes beside the playable Tower',()=>{
    for(const [region,route]of [['resources','facilities:random'],['dark-arena','challenge:dark']]){
      const html=markup('space-station',region);assert.equal((html.match(/data-station-action=/g)??[]).length,1);assert(html.includes(`data-station-action="${route}"`));
      if(region==='dark-arena')for(const species of [1180,1183,1186])assert(html.includes(`data-species="${species}"`));
    }
    for(const region of ['random-arena','elite-arena','classic-arena'])assert(markup('space-station',region).includes('data-station-action="facilities:random"'));
    assert.equal((markup('space-station','mystery').match(/data-campaign="puni"/g)??[]).length,1);
  });
  check('Each Tower floor has one fixed current opponent on map 500 and a separate start selector',()=>{
    for(let floor=1;floor<=70;floor++){
      const id=`boss_tower_brave_f${String(floor).padStart(3,'0')}`,boss=s.bosses.find(row=>row.id===id);
      assert(boss);
      const html=markup('space-station','brave-tower',{s:{...s,braveTower:{...s.braveTower,highestCleared:floor-1,resumeFloor:floor}}});
      assert(html.includes('data-map-id="500"'));
      assert(html.includes(`data-tower-floor="${floor}"`));assert(html.includes('data-tower-complete="false"'));
      assert.equal((html.match(/data-boss=/g)??[]).length,1);assert(html.includes(`data-boss="${id}" data-species="${boss.species}" style="left:50%;top:58%"`));
      assert(html.includes(`勇者之塔 · 第 ${floor} 层`));assert(html.includes(`aria-label="与${boss.opponents[0].name}互动"`));
      assert(html.includes('data-tower-action="choose"'));assert(!html.includes('data-station-action='));assert(!html.includes('world-roamer'));
      if(boss.opponents.length>1)assert(html.includes(`队伍 ${boss.opponents.length} 只`));
    }
    const complete=markup('space-station','brave-tower',{s:{...s,braveTower:{...s.braveTower,highestCleared:70,resumeFloor:null}}});
    assert(complete.includes('data-tower-floor="70"'));assert(complete.includes('data-tower-complete="true"'));
    assert(complete.includes('已通过全部 70 层'));assert(complete.includes('data-boss="boss_tower_brave_f070"'));
    const legacy=markup('space-station','brave-tower',{s:{...s,braveTower:undefined,bosses:s.bosses.map(boss=>({...boss,cleared:boss.id==='boss_tower_brave_f010'}))}});
    assert(legacy.includes('data-tower-floor="11"'));assert(legacy.includes('data-boss="boss_tower_brave_f011"'));
    report.observations.towerSceneStates=72;
  });
  check('One battle terminal retains all three existing facility modes and fixed teams',()=>{
    assert.deepEqual(s.facilities.map(facility=>facility.id),['random','elite','classic']);
    for(const facility of s.facilities){
      const html=renderToStaticMarkup(React.createElement(BattleFacilities,{s,c:game,facilityId:facility.id}));
      for(const option of s.facilities)assert(html.includes(option.name));
      assert(html.includes(`aria-pressed="true">${facility.name}</button>`));
    }
    assert(s.facilities.find(facility=>facility.id==='classic').teams.length>0);
  });
  check('Route resolution and scene rendering leave catalog, gameplay save and battle unchanged',()=>{
    assert.equal(JSON.stringify(catalog),catalogBefore);assert.equal(game.exportSave(),saveBefore);assert.equal(game.snapshot().battle,null);
    assert.equal(memory.get('seer-classic-save'),'Player save sentinel');
  });
}catch(error){report.failures.push({name:'harness',error:String(error.stack)});}
finally{
  await server.close();
  if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else delete globalThis.localStorage;
  const destination=path.join(root,'artifacts/station-navigation-v53');fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.checks.length,failures:report.failures,...report.observations},null,2));
  if(report.failures.length)process.exitCode=1;
}
