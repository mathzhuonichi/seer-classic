/** Puni contact, shared arena location, and fresh/legacy campaign progression. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {memoryStorage,sha256File,suite,withSsr} from './_harness.mjs';

const memory=memoryStorage(),progressCases=[];
let location;
const parse=game=>JSON.parse(game.exportSave());
const reject=(game,action)=>{const before=game.exportSave(),battle=JSON.stringify(game.snapshot().battle);game.dispatch(action);assert.equal(game.exportSave(),before,'Rejected entry preserves save and RNG');assert.equal(JSON.stringify(game.snapshot().battle),battle,'Rejected entry preserves the current battle');};
await withSsr('puni-location-v38',async load=>{
  const t=suite('puni-location-v38'),{check}=t;
  const [{loadCatalog},{createGame},{CHALLENGE_CAMPAIGNS},{WORLD_PLANETS,findChallengeLocation,findSceneChallenges,resolveWorldLocation},{getSceneLayout},{getSceneExits},{default:CampaignScene},{WorldMap}]=await Promise.all([
    '/src/domain/catalog/catalog.ts','/src/kernel/game.ts','/src/domain/challenges/challenge-campaigns.ts','/src/domain/world/world.ts','/src/features/world/map-presentation.ts','/src/features/world/scene-exits.ts','/src/features/challenges/ui/ChallengeCampaignScene.tsx','/src/features/world/ui/WorldMap.tsx',
  ].map(load));
  const catalog=await loadCatalog(),catalogBytes=JSON.stringify(catalog),definition=CHALLENGE_CAMPAIGNS.find(row=>row.id==='puni'),stageIds=['seal1','seal2','seal3','seal4','seal5','seal6','seal7','body'];
  const bossIds=stageIds.map(id=>id==='body'?'boss_puni_zhenshen':`boss_puni_${id}`),base=parse(createGame(catalog,''));
  const make=save=>createGame(catalog,JSON.stringify(save??base)),view=game=>game.snapshot().campaigns.find(row=>row.id==='puni');
  const {planet,region}=resolveWorldLocation('space-station','mystery');
  const originalArt=JSON.parse(fs.readFileSync('src/domain/world/map-art-assets.json','utf8'))['10032'];
  const registeredArt=JSON.parse(fs.readFileSync('src/domain/world/map-hd-assets.json','utf8'))['10032'];
  const publishedArt=JSON.parse(fs.readFileSync('public/maps/hd/manifest.json','utf8')).assets['10032'];
  const expectedBackground=`${registeredArt.path}?v=${registeredArt.sha256.slice(0,12)}`;
  const expectedLocation={planetId:'space-station',regionId:'mystery',staging:false};
  function stageMarkup(game){return renderToStaticMarkup(React.createElement(CampaignScene,{campaign:view(game),c:game,onLeave:()=>{},onManage:()=>{},background:region.background}));}
  function mapMarkup(game){memory.set('seer-classic.world-ui.v1',JSON.stringify({planetId:'space-station',regionId:'mystery',x:42,y:80,visited:['space-station/mystery']}));return renderToStaticMarkup(React.createElement(WorldMap,{c:game,onNavigate:()=>{}}));}
  check('All seven seals and the final body resolve to the same retained Puni arena',()=>{
    assert.deepEqual(definition.stages.map(row=>row.id),stageIds);assert.equal(region.originalMapId,10032);assert.equal(region.campaignId,'puni');assert.deepEqual([...region.bossIds].sort(),[...bossIds].sort());
    assert.equal(region.backgroundAssetMapId,10032);assert.equal(region.background,expectedBackground);assert.equal(region.backgroundKind,'remastered');
    assert.equal(registeredArt.path,publishedArt.path);assert.equal(registeredArt.sha256,publishedArt.sha256);
    assert.equal(publishedArt.sourcePath,'/maps/original/10032.svg');assert.equal(publishedArt.sourceSha256,originalArt.sha256);
    assert.equal(sha256File(`public${registeredArt.path}`),registeredArt.sha256);
    assert.match(region.sceneAttribution,/Conservative AI restoration.*public\/maps\/hd\/manifest\.json/);
    const game=make();for(const id of bossIds)assert.deepEqual(findChallengeLocation(game.snapshot().bosses.find(row=>row.id===id)),expectedLocation,id);
    assert.deepEqual(findChallengeLocation(game.snapshot().bosses.find(row=>row.id==='boss_puni_seal1')),findChallengeLocation(game.snapshot().bosses.find(row=>row.id==='boss_puni_zhenshen')),'Campaign entry and final-body travel cannot choose different battle backdrops');
    assert(getSceneExits(planet,region).length>0,'The arena keeps a return route');const anchor=getSceneLayout(planet,region).boss;assert(Math.abs(anchor.x*960/100-446.5)<.01&&Math.abs(anchor.y*560/100-225.5)<.01,'The neutral contact grounds its visible feet at the recovered platform top-face center');
    location={...expectedLocation,originalMapId:region.originalMapId,background:region.background,boss:getSceneLayout(planet,region).boss};
  });
  check('The physical Puni route joins Brave Tower and retains the shared facility hub',()=>{
    const tower=planet.regions.find(row=>row.id==='brave-tower'),dark=planet.regions.find(row=>row.id==='dark-arena'),hub=planet.regions.find(row=>row.id==='resources');
    assert.deepEqual(getSceneExits(planet,region).map(exit=>exit.targetRegionId),['brave-tower']);assert(getSceneExits(planet,tower).some(exit=>exit.targetRegionId==='mystery'));assert(!getSceneExits(planet,dark).some(exit=>exit.targetRegionId==='mystery'));
    assert.deepEqual(getSceneExits(planet,hub).map(exit=>exit.targetRegionId).sort(),['brave-tower','dark-arena']);
    for(const id of ['random-arena','elite-arena','classic-arena'])assert.equal(resolveWorldLocation(planet.id,id).region.id,hub.id);
  });
  check('The arena exposes one neutral Puni contact rather than seven seal actors or a true-body shortcut',()=>{
    const game=make(),before=game.exportSave(),html=mapMarkup(game);assert.equal((html.match(/aria-label="与谱尼互动，查看挑战进度"/g)??[]).length,1);assert(html.includes('data-campaign="puni"'));assert(!html.includes('aria-label="与谱尼真身互动"'));assert(!/aria-label="与谱尼·第[^\"]+互动"/.test(html));assert(html.includes(`class="world-background" src="${expectedBackground}"`));assert(html.includes('data-map-id="10032"'));assert.equal(game.exportSave(),before,'Rendering the neutral contact cannot alter campaign progress');
    for(const target of [undefined,...bossIds])assert.deepEqual(findSceneChallenges(planet.id,region.id,game.snapshot().bosses,target),[],'Even a targeted old boss link cannot inject a true-body actor into the campaign arena');
  });
  check('A fresh save selects seal one while every later seal and the six-life body remain locked',()=>{
    const game=make(),campaign=view(game);assert.equal(campaign.completed,0);assert.equal(campaign.nextStageId,'seal1');assert.equal(campaign.finished,false);assert.deepEqual(campaign.stages.filter(row=>row.available).map(row=>row.id),['seal1']);
    const html=stageMarkup(game);assert(html.includes('<h3>第1封印 · 虚无</h3>'));assert(/class="available selected"/.test(html));assert(!html.includes('<h3>谱尼真身</h3>'));
    for(const id of stageIds.slice(1))reject(game,{type:'startCampaignStage',campaignId:'puni',stageId:id});for(const bossId of bossIds)reject(game,{type:'startBattle',bossId});
    game.dispatch({type:'startCampaignStage',campaignId:'puni',stageId:'seal1'});assert.equal(game.snapshot().battle.name,catalog.bosses.find(row=>row.id===bossIds[0]).name.zh);assert.equal(game.snapshot().battle.enemyParty.length,1);game.dispatch({type:'flee'});assert.equal(view(game).nextStageId,'seal1');
  });
  for(const kind of ['explicit','legacy'])for(let completed=0;completed<=stageIds.length;completed++)check(`${kind} progress ${completed}/8 survives load with exactly the correct next stage`,()=>{
    const saved=structuredClone(base);saved.progress.bosses_cleared=[...bossIds.slice(0,completed)];
    if(kind==='explicit')saved.game.campaigns.puni=stageIds.slice(0,completed);else delete saved.game.campaigns.puni;
    const game=make(saved),campaign=view(game),initial=parse(game),expectedNext=stageIds[completed]??null;
    assert.equal(campaign.completed,completed);assert.equal(campaign.nextStageId,expectedNext);assert.equal(campaign.finished,completed===8);
    assert.deepEqual(campaign.stages.filter(row=>row.cleared).map(row=>row.id),stageIds.slice(0,completed));assert.deepEqual(campaign.stages.filter(row=>row.available).map(row=>row.id),stageIds.slice(0,Math.min(8,completed+1)));
    assert.deepEqual(parse(game).game.campaigns.puni,stageIds.slice(0,completed));assert.deepEqual(initial.progress.bosses_cleared,saved.progress.bosses_cleared);
    const selectedId=expectedNext??'body',selected=campaign.stages.find(row=>row.id===selectedId),html=stageMarkup(game);assert(html.includes(`<h3>${selected.name}</h3>`));
    const mapHtml=mapMarkup(game);assert.equal((mapHtml.match(/aria-label="与谱尼互动，查看挑战进度"/g)??[]).length,1);assert(!mapHtml.includes('aria-label="与谱尼真身互动"'));
    for(const id of stageIds.slice(completed+1))reject(game,{type:'startCampaignStage',campaignId:'puni',stageId:id});
    const reloaded=make(parse(game));assert.deepEqual(view(reloaded),view(game));assert.equal(reloaded.exportSave(),game.exportSave());
    game.dispatch({type:'startCampaignStage',campaignId:'puni',stageId:selectedId});assert(game.snapshot().battle);assert.equal(game.snapshot().battle.name,catalog.bosses.find(row=>row.id===selected.bossIds[0]).name.zh);assert.equal(game.snapshot().battle.enemyParty.length,selectedId==='body'?6:1);game.dispatch({type:'flee'});
    assert.equal(view(game).completed,completed,'Retreat keeps every completed seal');assert.deepEqual(parse(game).dex,initial.dex);assert.deepEqual(parse(game).items,initial.items);assert.deepEqual(parse(game).game.shopUnlocked,initial.game.shopUnlocked);
    progressCases.push({kind,completed,nextStageId:expectedNext,selectedId,bodyAvailable:campaign.stages.at(-1).available});
  });
  check('Gaps in old boss history cannot unlock later seals, and an explicit reset stays reset',()=>{
    const saved=structuredClone(base);delete saved.game.campaigns.puni;saved.progress.bosses_cleared=[bossIds[0],bossIds[2],bossIds[7]];
    const game=make(saved);assert.equal(view(game).completed,1);assert.equal(view(game).nextStageId,'seal2');reject(game,{type:'startCampaignStage',campaignId:'puni',stageId:'body'});
    const complete=structuredClone(base);complete.game.campaigns.puni=[...stageIds];complete.progress.bosses_cleared=[...bossIds];const reset=make(complete);reset.dispatch({type:'resetCampaign',campaignId:'puni'});
    const reloaded=make(parse(reset));assert.equal(view(reloaded).completed,0);assert.equal(view(reloaded).nextStageId,'seal1');assert.deepEqual(parse(reloaded).progress.bosses_cleared,bossIds);reject(reloaded,{type:'startCampaignStage',campaignId:'puni',stageId:'body'});
  });
  check('Verification does not mutate shared source definitions',()=>assert.equal(JSON.stringify(catalog),catalogBytes));
  t.finish({progressCases,location});
});
