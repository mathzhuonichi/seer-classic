/** Source contacts, original vector registration, and independent wildlife terrain. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {memoryStorage,root,suite,withSsr} from './_harness.mjs';

const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/maps/actors/manifest.json'),'utf8'));
const close=(a,b,tolerance=1e-7)=>assert(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const samePoint=(a,b)=>{close(a.x,b.x);close(a.y,b.y)};
const finite=p=>assert(Number.isFinite(p.x)&&Number.isFinite(p.y));
const onSegment=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy);if(t<0||t>1)return false;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<1e-7};
function contains(poly,p){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[j],b=poly[i];if(onSegment(p,a,b))return true;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside}return inside}
const memory=memoryStorage();
await withSsr('maps-placement-v44',async load=>{
  const t=suite('maps-placement-v44'),{check}=t,report={};
  const [{WORLD_PLANETS},presentation,{buildWorldDialogue,buildWorldScene},{WorldMap},{createGame,loadCatalog}]=await Promise.all(
    ['/src/domain/world/world.ts','/src/features/world/map-presentation.ts','/src/features/world/world-scene.ts','/src/features/world/ui/WorldMap.tsx','/src/kernel/game.ts'].map(load));
  const {getSceneLayout,creatureSceneHome,constrainHabitatPoint,constrainScenePoint,getSceneBossHome,getSceneBossActor}=presentation;
  const regions=WORLD_PLANETS.flatMap(planet=>planet.regions.map(region=>({planet,region,layout:getSceneLayout(planet,region),mapId:region.backgroundAssetMapId??Number((region.background??planet.background).match(/\/maps\/original\/(\d+)\./)?.[1])})));
  const bossAreas=regions.filter(row=>row.region.bossIds?.length);let homeSamples=0,projectionSamples=0;
  check('Every retained Boss area has an explicit contact provenance record',()=>{
    assert.equal(bossAreas.length,52);assert.equal(manifest.areas.length,52);assert.equal(Object.keys(manifest.contacts).length,60);
    for(const row of bossAreas){const evidence=manifest.areas.find(area=>area.planet===row.planet.id&&area.region===row.region.id);assert(evidence,`${row.planet.id}/${row.region.id}`);assert.equal(evidence.mapId,row.mapId);const ids=row.region.campaignId?[`campaign:${row.region.campaignId}`]:row.region.bossIds;assert.deepEqual([...evidence.contacts].sort(),[...ids].sort());}
  });
  check('The evidence distinguishes original visible actors, contacts, variant offsets and retained remake positions',()=>{
    const counts={};for(const value of Object.values(manifest.contacts)){counts[value.kind]=(counts[value.kind]??0)+1;assert(value.evidence.length>20);assert.match(value.sourceSha256,/^[a-f0-9]{64}$/);assert.equal(value.sourceUrl,`https://seer.61.com/resource/map/${value.mapId}.swf`);assert(value.anchor.every(Number.isFinite));assert(value.anchor[0]>=0&&value.anchor[0]<=960);assert(value.anchor[1]>=0&&value.anchor[1]<=560);}
    assert.deepEqual(counts,{'original-interaction':34,'original-visible-actor':12,'retained-remake-placement':10,'authored-variant-offset':4});report.contactKinds=counts;
    assert.equal(manifest.contacts.boss_spt_eersaila.kind,'retained-remake-placement');assert.equal(manifest.contacts.boss_ailike.kind,'retained-remake-placement');
  });
  check('Nonstandard original background viewports preserve source contact registration',()=>{
    assert.deepEqual(manifest.sceneViewports,{'54':[-1,0,961,560],'314':[-1.65,0,962,560],'325':[-3.65,-1,970.3,561]});
    for(const contact of Object.values(manifest.contacts)){assert.deepEqual(contact.sceneViewport,manifest.sceneViewports[contact.mapId]??[0,0,960,560]);}
  });
  check('All source contacts reach the renderer without the old generic fifteen-percent spacing',()=>{
    for(const {mapId,layout,region}of bossAreas){const ids=region.campaignId?[`campaign:${region.campaignId}`]:region.bossIds;for(const [index,id]of ids.entries()){const source=manifest.contacts[id];assert.equal(source.mapId,mapId);const actual=getSceneBossHome(layout,id,index,ids.length);const [left,top,width,height]=source.sceneViewport;samePoint(actual,{x:(source.anchor[0]-left)/width*100,y:(source.anchor[1]-top)/height*100});samePoint(actual,getSceneBossHome(layout,id,7,20));}}
  });
  check('Every native map actor has an unchanged, self-contained vector and exact crop registration',()=>{
    assert.equal(Object.keys(manifest.actors).length,12);const seen=new Set();
    for(const [id,actor]of Object.entries(manifest.actors)){
      const bytes=fs.readFileSync(path.join(root,'public',actor.src)),svg=bytes.toString('utf8');assert.equal(createHash('sha256').update(bytes).digest('hex'),actor.sha256,id);assert.equal(bytes.length,actor.bytes);assert(!seen.has(actor.src));seen.add(actor.src);
      assert(!/<(?:image|script|foreignObject)\b/.test(svg),`${id}: original vector only`);assert(!/(?:href|src)=["'](?:https?:|\/\/)/.test(svg),`${id}: no external artwork dependency`);assert.match(svg,/<path\b/);assert.match(svg,/<svg\b/);
      const [left,top,width,height]=actor.crop;assert(width>0&&height>0);assert(svg.includes(`viewBox="${left} ${top} ${width} ${height}"`));assert.deepEqual(actor.anchor,[left+width/2,top+height]);assert.equal(actor.sourceFrame,1);
      const row=regions.find(row=>row.mapId===actor.mapId);assert(row,id);const actual=getSceneBossActor(row.layout,id);assert(actual,id);assert.equal(actual.src,actor.src);close(actual.width,width/960*100);close(actual.height,height/560*100);samePoint(actual.anchor,{x:actor.anchor[0]/960*100,y:actor.anchor[1]/560*100});assert.deepEqual(manifest.contacts[id].anchor,actor.anchor);
    }
  });
  check('The Steeltooth Shark remains clipped to the original upper-right cave',()=>{
    const shark=manifest.actors.boss_spt_gangyasha;assert.deepEqual(shark.crop,[829,35,84,98]);assert.deepEqual(shark.anchor,[871,133]);assert.equal(shark.sourceInstance,'animator_mc.boss_mc');assert.equal(shark.sourceParentSymbol,68);assert.deepEqual(shark.preservedMasks,[{symbol:61,depth:3,clipDepth:9}]);assert.deepEqual(shark.excludedSiblings,[60]);const svg=fs.readFileSync(path.join(root,'public',shark.src),'utf8');assert(svg.includes('<clipPath'));assert(svg.includes('clip-path='));assert(shark.anchor[0]>850&&shark.anchor[1]<150);
  });
  check('Puni uses the visible source actor and one neutral campaign contact',()=>{
    const puni=manifest.actors['campaign:puni'];assert.equal(puni.sourceInstance,'depth_mc.hh');assert.equal(puni.sourceSymbol,163);assert.deepEqual(puni.crop,[357,80,165,165]);assert.deepEqual(puni.anchor,[439.5,245]);assert.equal(Object.keys(manifest.contacts).filter(id=>id.startsWith('campaign:puni')).length,1);assert(!Object.keys(manifest.contacts).some(id=>/^boss_puni_/.test(id)));
  });
  check('A transparent Rei hit target cannot become a rendered map portrait',()=>{
    assert.equal(manifest.contacts.boss_rei.sourceInstance,'control_mc.bossBtn');assert.equal(manifest.contacts.boss_rei.sourceSymbol,666);assert.equal(manifest.actors.boss_rei,undefined);const row=regions.find(row=>row.mapId===32);assert.equal(getSceneBossActor(row.layout,'boss_rei'),undefined);
  });
  check('Source interaction bounds include transparent button hit rectangles',()=>{
    assert.deepEqual(manifest.contacts.boss_spt_sipulinte.sourceBounds,[436,115,516,228]);assert.deepEqual(manifest.contacts.boss_spt_sipulinte.anchor,[476,228]);assert.deepEqual(manifest.contacts.boss_spt_nainifenduo.sourceMatrix,[1,0,0,1.4000091552734375,564,204]);assert.deepEqual(manifest.contacts.boss_spt_nainifenduo.sourceBounds,[564,204,634,302.0006408691406]);assert.deepEqual(manifest.contacts.boss_spt_nainifenduo.anchor,[599,302.0006408691406]);
  });
  check('Shared original actors retain two separately selectable remake variants',()=>{
    for(const pair of [['boss_spt_kelaifen1','boss_spt_kelaifen2'],['boss_spt_kelanite1','boss_spt_kelanite2']]){const [a,b]=pair.map(id=>manifest.contacts[id]);assert.equal(a.kind,'authored-variant-offset');assert.equal(b.kind,'authored-variant-offset');assert.deepEqual(a.originalAnchor,b.originalAnchor);assert.equal(b.anchor[0]-a.anchor[0],90);assert.equal(a.anchor[1],b.anchor[1]);}
  });
  check('Every scene keeps a free player plane and a separate finite wildlife habitat',()=>{
    for(const {layout}of regions){assert.deepEqual(layout.walk,[{x:1,y:1},{x:99,y:1},{x:99,y:99},{x:1,y:99}]);assert(layout.habitat?.length>=3);assert.notEqual(layout.habitat,layout.walk);assert(layout.roam.x>0&&layout.roam.x<=5);assert(layout.roam.y>0&&layout.roam.y<=3);samePoint(constrainScenePoint(layout,{x:50,y:20}),{x:50,y:20});samePoint(constrainScenePoint(layout,{x:-5,y:104}),{x:1,y:99});for(const p of layout.habitat)finite(p);}
  });
  check('Ordinary and dense populations have distinct anchors inside every habitat',()=>{
    for(const {planet,region,layout}of regions)for(const count of [1,2,6,7,9,18,48,120]){const homes=Array.from({length:count},(_,index)=>creatureSceneHome(layout,index,count));for(const home of homes){finite(home);assert(contains(layout.habitat,home),`${planet.id}/${region.id} population ${count}: ${JSON.stringify(home)}`);samePoint(constrainHabitatPoint(layout,home),home);homeSamples++;}assert.equal(new Set(homes.map(home=>`${home.x.toFixed(7)},${home.y.toFixed(7)}`)).size,count,`${planet.id}/${region.id} distinct population ${count}`);}
  });
  check('Roaming proposals and curved-path samples remain on the habitat',()=>{
    for(const {layout}of regions){const polygon=layout.habitat;for(let x=-20;x<=120;x+=10)for(let y=-20;y<=120;y+=10){const projected=constrainHabitatPoint(layout,{x,y});finite(projected);assert(contains(polygon,projected));samePoint(constrainHabitatPoint(layout,projected),projected);projectionSamples++;}for(const home of layout.homes)for(const dx of [-layout.roam.x,layout.roam.x])for(const dy of [-layout.roam.y,layout.roam.y])assert(contains(polygon,constrainHabitatPoint(layout,{x:home.x+dx,y:home.y+dy})));}
  });
  check('Named manual terrain remains usable for concave and narrow compositions',()=>{
    for(const mapId of [25,31,40]){const row=regions.find(row=>row.mapId===mapId);assert(row);assert(row.layout.habitat.length>4);const homes=Array.from({length:48},(_,index)=>creatureSceneHome(row.layout,index,48));assert.equal(new Set(homes.map(p=>`${p.x},${p.y}`)).size,48);for(const home of homes)assert(contains(row.layout.habitat,home));}
  });
  const game=createGame(await loadCatalog(),''),s=game.snapshot();
  const markup=({planet,region})=>{
    memory.set('seer-classic.world-ui.v1',JSON.stringify({planetId:planet.id,regionId:region.id,x:50,y:70,visited:[]}));
    return renderToStaticMarkup(React.createElement(WorldMap,{s,c:game}));
  };
  const placed=(home,actor)=>`style="left:${home.x}%;top:${home.y}%${actor?`;width:${actor.width}%;height:${actor.height}%`:''}"`;
  check('WorldMap draws every contact at its source position with native actor dimensions',()=>{
    let contacts=0;
    for(const row of bossAreas.filter(row=>!(row.planet.id==='space-station'&&row.region.id==='brave-tower'))){
      const html=markup(row),scene=buildWorldScene(s,row.planet,row.region);
      if(row.region.campaignId){
        const actor=getSceneBossActor(row.layout,`campaign:${row.region.campaignId}`);
        assert(html.includes(`data-campaign="${row.region.campaignId}" ${placed(actor?.anchor??row.layout.boss,actor)}`),`${row.region.id}: campaign contact`);
        assert(!html.includes('data-boss='),`${row.region.id}: campaign stages are not separate contacts`);contacts++;continue;
      }
      for(const [index,boss] of scene.bosses.entries()){
        const actor=getSceneBossActor(row.layout,boss.id);
        assert(html.includes(`data-boss="${boss.id}" data-species="${boss.species}" ${placed(getSceneBossHome(row.layout,boss.id,index,scene.bosses.length),actor)}`),boss.id);
        assert.equal(html.includes(`world-boss world-native-actor" data-boss="${boss.id}"`),!!actor,`${boss.id}: native actor art`);contacts++;
      }
    }
    report.renderedContacts=contacts;
  });
  check('A campaign contact opens its saved campaign rather than a stage',()=>{
    const row=regions.find(row=>row.region.campaignId==='puni'),scene=buildWorldScene(s,row.planet,row.region);
    assert.deepEqual(buildWorldDialogue(s,scene,{kind:'campaign',id:'puni'}).challenge.run,{kind:'campaign',campaignId:'puni'});
  });
  report.inventory={regions:regions.length,populatedRegions:regions.filter(row=>row.region.creatures.length).length,bossAreas:bossAreas.length,contacts:Object.keys(manifest.contacts).length,nativeActors:Object.keys(manifest.actors).length,homeSamples,projectionSamples};
  t.finish(report);
});
