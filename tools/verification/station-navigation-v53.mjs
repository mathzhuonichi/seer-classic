/** Compact station routes, legacy landings and retained acquisition contacts. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {memoryStorage,root,suite,withSsr} from './_harness.mjs';

const observations={};
const memory=memoryStorage({'seer-classic-save':'Player save sentinel'});
await withSsr('station-navigation-v53',async load=>{
  const t=suite('station-navigation-v53'),{check}=t;
  const [world,{getSceneExits},{WorldMap},{default:BattleFacilities},{createGame},{loadCatalog},{braveTowerFloor,braveTowerPosition}]=await Promise.all([
    '/src/domain/world/world.ts','/src/features/world/scene-exits.ts','/src/features/world/ui/WorldMap.tsx','/src/features/challenges/ui/BattleFacilities.tsx','/src/kernel/game.ts',
    '/src/domain/catalog/catalog.ts','/src/domain/challenges/brave-tower.ts',
  ].map(load));
  const [{default:BraveTower},{challengeDetail,challengeEntries,challengeKind},{shellRoutes},{enrichCatalog}]=await Promise.all([
    '/src/features/challenges/ui/BraveTower.tsx','/src/features/challenges/challenge-center.ts','/src/app/shell-routes.ts',
    '/src/domain/catalog/enrichment.ts',
  ].map(load));
  const {WORLD_PLANETS,findChallengeLocation,findSceneChallenges,resolveWorldLocation,readWorldPreference}=world;
  const catalog=await loadCatalog(),catalogBefore=JSON.stringify(catalog),game=createGame(catalog,''),saveBefore=game.exportSave(),s=game.snapshot();
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
  const markup=(planetId,regionId,snapshot=s)=>{
    memory.set('seer-classic.world-ui.v1',JSON.stringify({planetId,regionId,x:50,y:70,visited:[`${planetId}/${regionId}`]}));
    return renderToStaticMarkup(React.createElement(WorldMap,{c:{...game,snapshot:()=>snapshot}}));
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
      if(region.campaignId){
        assert.equal(contacts.length,0);counts.campaign++;
        const stages=s.campaigns.find(row=>row.id===region.campaignId).stages;
        assert(stages.some(stage=>stage.bossIds.includes(boss.id)),`${boss.id}: a stage of the region's campaign`);
      }
      else if(planet.id==='space-station'&&region.id==='brave-tower'){
        assert.equal(contacts.length,0);counts.tower++;
        assert(braveTowerFloor(boss.id)!==undefined||boss.towerSide,`${boss.id}: a Tower floor or a Tower panel entry`);
      }
      else{assert(contacts.some(contact=>contact.id===boss.id),boss.id);assert.equal(new Set(contacts.map(contact=>contact.id)).size,contacts.length);counts.ordinary++}
      if(destination.staging){assert.deepEqual([planet.id,region.id],['station','transport']);assert(region.challengeStaging);counts.transport++}
    }
    for(const alias of ['mission-dock','challenge-dock'])for(const boss of s.bosses.filter(row=>findChallengeLocation(row).staging))assert(findSceneChallenges('station',alias,s.bosses,boss.id).some(row=>row.id===boss.id));
    assert.equal(findSceneChallenges('station','transport',s.bosses).length,0);
    observations.encounters=counts;
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
    const {totalFloors}=s.braveTower,climb=(highestCleared,resumeFloor)=>{
      const progress={highestCleared,resumeFloor};return {...s,braveTower:{...s.braveTower,...progress,position:braveTowerPosition(progress)}};
    };
    for(let floor=1;floor<=totalFloors;floor++){
      const id=`boss_tower_brave_f${String(floor).padStart(3,'0')}`,boss=s.bosses.find(row=>row.id===id);
      assert(boss);
      const html=markup('space-station','brave-tower',climb(floor-1,floor));
      assert(html.includes('data-map-id="500"'));
      assert(html.includes(`data-tower-floor="${floor}"`));assert(html.includes('data-tower-complete="false"'));
      assert.equal((html.match(/data-boss=/g)??[]).length,1);assert(html.includes(`data-boss="${id}" data-species="${boss.species}" style="left:50%;top:58%"`));
      assert(html.includes(`勇者之塔 · 第 ${floor} 层`));assert(html.includes(`aria-label="与${boss.opponents[0].name}互动"`));
      assert(html.includes('data-tower-action="choose"'));assert(!html.includes('data-station-action='));assert(!html.includes('world-roamer'));
      if(boss.opponents.length>1)assert(html.includes(`队伍 ${boss.opponents.length} 只`));
    }
    const complete=markup('space-station','brave-tower',climb(totalFloors,null));
    assert(complete.includes(`data-tower-floor="${totalFloors}"`));assert(complete.includes('data-tower-complete="true"'));
    assert(complete.includes(`已通过全部 ${totalFloors} 层`));assert(complete.includes(`data-boss="boss_tower_brave_f${String(totalFloors).padStart(3,'0')}"`));
    observations.towerSceneStates=totalFloors+1;
  });
  check('The Mystery Realm 谱尼 is offered on the Tower panel, open from the start like every Boss, and its archive row leads to that panel',()=>{
    const mystery=s.bosses.find(boss=>boss.id==='boss_tower_brave_mystery'),climb=highestCleared=>{
      const progress={highestCleared,resumeFloor:highestCleared+1};return {...s,braveTower:{...s.braveTower,...progress,position:braveTowerPosition(progress)}};
    };
    const row=highestCleared=>{
      const snapshot=climb(highestCleared),html=renderToStaticMarkup(React.createElement(BraveTower,{c:{...game,snapshot:()=>snapshot},onEnter:()=>{}}));
      return html.match(/<div class="tower-resume tower-side-challenge" data-tower-side="boss_tower_brave_mystery">.*?<\/button><\/div>/)?.[0];
    };
    assert.deepEqual(s.bosses.filter(boss=>boss.towerSide).map(boss=>boss.id),[mystery.id],'the one Tower side challenge, never a floor');
    const open=`<div class="tower-resume tower-side-challenge" data-tower-side="boss_tower_brave_mystery"><div><strong>${mystery.name}</strong>`
      +'<span>通关奖励：仅赛尔豆与积累经验，没有精元或道具</span></div><button class="primary">开始挑战</button></div>';
    for(const floor of [0,59,60])assert.equal(row(floor),open,`highest cleared floor ${floor}`);
    const entry=challengeEntries(s).find(entry=>entry.id===mystery.id),detail=challengeDetail(entry,s,false);
    assert.equal(detail.reward,'仅赛尔豆与积累经验，没有精元或道具','The encounter pays no essence or item.');
    assert.equal(detail.instruction,'进入勇者之塔，在选择起点面板开始挑战。');
    assert.deepEqual([0,59,60].map(floor=>challengeDetail(entry,climb(floor),false).status),['可挑战','可挑战','可挑战']);
    const travels=[],routes=shellRoutes({c:game,navigation:{show(){},travel:(...args)=>travels.push(args),enterCampaign(){}},
      backdrops:{current:{exploration:null,campaign:null}},setMessage(){},setSelected(){}});
    routes.travelToChallenge(mystery);
    assert.deepEqual(travels,[[{planetId:'space-station',regionId:'brave-tower'},'tower']]);
  });
  check('Each archive Boss row states what its encounter pays, from the controller\'s own catalog',()=>{
    const {catalog:enriched}=enrichCatalog(catalog),encounters=new Map(enriched.bosses.map(boss=>[boss.id,boss]));
    const essences=new Set(enriched.items.filter(item=>item.kind==='essence'&&typeof item.hatches==='number').map(item=>String(item.id)));
    const ESSENCE='获得首领精元 → 道具背包 → 确认孵化',NOTHING='仅赛尔豆与积累经验，没有精元或道具',lines={essence:0,skill:0,items:0,nothing:0,firstClear:0};
    const names=new Map(enriched.items.map(item=>[String(item.id),item.name.zh]));
    const reward=id=>challengeDetail(challengeEntries(s).find(entry=>entry.id===id),s,false).reward;
    for(const entry of challengeEntries(s).filter(entry=>challengeKind(entry)==='boss')){
      assert(encounters.has(entry.id),entry.id);
      const paid=encounters.get(entry.id).reward??{},items=Object.keys(paid.items??{}),line=challengeDetail(entry,s,false).reward;
      // A first clear's own items close the line, after what every clear pays.
      const once=Object.entries(paid.first_clear_items??{}).map(([id,count])=>`${names.get(id)} ×${count}`).join('、'),suffix=once&&`首次通关：${once}`;
      assert(line.endsWith(suffix),entry.id);if(once)lines.firstClear++;
      const text=line.slice(0,line.length-suffix.length).replace(/；$/,'');
      if(paid.learn_skill){assert.match(text,/^领悟技能：/,entry.id);assert(!text.includes('undefined'),entry.id);lines.skill++}
      else if(items.some(id=>essences.has(id))){assert.equal(text,ESSENCE,entry.id);lines.essence++}
      else if(items.length){assert.match(text,/^获得/,entry.id);assert.notEqual(text,ESSENCE,entry.id);lines.items++}
      else{assert.equal(text,once?'':NOTHING,entry.id);lines.nothing++}
    }
    assert.deepEqual([reward('boss_spt_liaosi'),reward('boss_tower_brave_mystery')],[`${ESSENCE}；首次通关：蓝武士装 ×1`,NOTHING]);
    assert(lines.essence>0&&lines.firstClear>0,JSON.stringify(lines));
    observations.bossRewardLines=lines;
  });
  check('One battle terminal retains all three existing facility modes and fixed teams',()=>{
    assert.deepEqual(s.facilities.map(facility=>facility.id),['random','elite','classic']);
    for(const facility of s.facilities){
      const html=renderToStaticMarkup(React.createElement(BattleFacilities,{c:game,facilityId:facility.id}));
      for(const option of s.facilities)assert(html.includes(option.name));
      assert(html.includes(`aria-pressed="true">${facility.name}</button>`));
    }
    assert(s.facilities.find(facility=>facility.id==='classic').teams.length>0);
  });
  check('Route resolution and scene rendering leave catalog, gameplay save and battle unchanged',()=>{
    assert.equal(JSON.stringify(catalog),catalogBefore);assert.equal(game.exportSave(),saveBefore);assert.equal(game.snapshot().battle,null);
    assert.equal(memory.get('seer-classic-save'),'Player save sentinel');
  });
  t.finish({observations});
});
