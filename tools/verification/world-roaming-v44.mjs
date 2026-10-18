/** Wildlife roaming on map 726: local territories, label separation, the per-frame step that RoamingCreature runs, and what pauses it. */
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {memoryStorage,suite,withSsr} from './_harness.mjs';

/** A stand-in for `document.querySelector` over rendered markup that answers `.class` and `[attribute="value"]` selector lists. */
function markupDocument(html){
  const classes=new Set([...html.matchAll(/ class="([^"]*)"/g)].flatMap(([,names])=>names.split(/\s+/)));
  const matches=selector=>{
    const attribute=selector.match(/^\[([\w-]+)="([^"]*)"\]$/),name=selector.match(/^\.([\w-]+)$/)?.[1];
    if(attribute)return html.includes(` ${attribute[1]}="${attribute[2]}"`);
    if(name)return classes.has(name);
    throw new Error(`Unsupported selector ${selector}`);
  };
  return {querySelector:list=>list.split(',').find(matches)??null};
}

memoryStorage();
await withSsr('world-roaming-v44',async load=>{
  const t=suite('world-roaming-v44'),{check}=t;
  const [{WORLD_PLANETS},{getSceneLayout,creatureSceneHome,constrainHabitatPoint},roaming]=await Promise.all(
    ['/src/domain/world/world.ts','/src/features/world/map-presentation.ts','/src/features/world/world-roaming.ts'].map(load));
  const regions=WORLD_PLANETS.flatMap(planet=>planet.regions.map(region=>({planet,region,layout:getSceneLayout(planet,region)})));
  const row=regions.find(r=>r.region.backgroundAssetMapId===726);assert(row);
  const {layout}=row,homes=Array.from({length:6},(_,index)=>creatureSceneHome(layout,index,6));
  const within=(p,home)=>{
    assert(Math.abs(p.x-home.x)<=layout.homeRoam.x+1e-7);assert(Math.abs(p.y-home.y)<=layout.homeRoam.y+1e-7);
    assert.deepEqual(constrainHabitatPoint(layout,p),p);
  };
  check('This territory change is scoped to map 726',()=>{
    assert.deepEqual([...new Set(regions.filter(r=>r.layout.homeRoam).map(r=>r.region.backgroundAssetMapId))],[726]);
  });
  check('All six complete local territories lie on the visible ground polygon',()=>{
    for(const home of homes)for(const dx of [-layout.homeRoam.x,layout.homeRoam.x])for(const dy of [-layout.homeRoam.y,layout.homeRoam.y])within({x:home.x+dx,y:home.y+dy},home);
  });
  // A conservative 100-by-20 CSS-pixel label box at a 960-wide map remains
  // separated even at the closest allowed points of neighboring territories.
  check('Six label territories stay separated at every allowed desktop position',()=>{
    for(let i=0;i<homes.length;i++)for(let j=i+1;j<homes.length;j++){
      const dx=Math.max(0,Math.abs(homes[i].x-homes[j].x)-2*layout.homeRoam.x)*9.6;
      const dy=Math.max(0,Math.abs(homes[i].y-homes[j].y)-2*layout.homeRoam.y)*6.18;
      assert(dx>=100||dy>=20,'Neighboring label territories must not overlap');
    }
  });
  // The desktop fixture RoamingCreature measures: a 960x618 scene, a 124.8px host and an 18px name.
  const frame={scene:{width:960,height:618},body:{width:124.8,height:124.8},labelHeight:18};
  function resident(index,random){
    const home=homes[index],{bounds}=roaming.roamFit(frame);
    const context={layout,home,territory:roaming.roamTerritory(layout,home),bounds,scene:frame.scene,random};
    let state=null,frames=0;
    return {home,get state(){return state;},tick(paused=false){
      state=roaming.advanceRoam(state??roaming.startRoam(context),context,frames++?50:0,paused);within(state.position,home);
    }};
  }
  check('Both extremes of the initial random offset remain inside their own territory',()=>{
    for(const value of [0,.999999])for(let i=0;i<6;i++){const r=resident(i,()=>value);r.tick();assert.equal(r.state.leg,null,'A new resident rests first');}
  });
  let positions=0;
  check('All six residents roam for one minute, remain bounded, pause individually, and resume',()=>{
    for(let i=0;i<6;i++){
      let seed=123456+i*817;
      const r=resident(i,()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;});
      const seen=new Set();
      for(let n=0;n<1200;n++){r.tick();seen.add(`${r.state.position.x.toFixed(4)},${r.state.position.y.toFixed(4)}`);positions++;}
      assert(seen.size>100,'Each resident must visibly roam, not be pinned to a point');
      const stopped={...r.state.position};
      for(let n=0;n<30;n++){r.tick(true);assert.deepEqual(r.state.position,stopped);}
      let resumed=false;for(let n=0;n<400;n++){r.tick();if(Math.hypot(r.state.position.x-stopped.x,r.state.position.y-stopped.y)>.05)resumed=true;}
      assert(resumed,'Closing interaction must resume the selected creature');
    }
  });
  const {loadCatalog}=await load('/src/domain/catalog/catalog.ts');
  const [{createGame},{Modifier},{default:GameWindow},{WorldMap},{sceneCovered}]=await Promise.all(['/src/kernel/game.ts',
    '/src/features/raising/ui.ts','/src/shared/ui/GameWindow.tsx','/src/features/world/ui.ts','/src/features/world/ui/scene-cover.ts'].map(load));
  const game=createGame(await loadCatalog(),'');
  const covered=element=>{
    delete globalThis.document;
    const html=renderToStaticMarkup(element);
    globalThis.document=markupDocument(html);
    return sceneCovered();
  };
  check('The modifier and scene windows cover the scene, so wildlife pauses and the arrow keys do not walk',()=>{
    const m=game.snapshot().monsters[0];
    assert(covered(React.createElement(Modifier,{c:game,m,onSelect(){},close(){}})),'The modifier dialog covers the scene');
    assert(covered(React.createElement(GameWindow,{title:'设置',onClose(){}},'')),'A scene window covers the scene');
    assert(!covered(React.createElement(WorldMap,{c:game})),'The bare scene is not covered');
  });
  delete globalThis.document;
  t.finish({mapId:726,homes,homeRoam:layout.homeRoam,simulatedPositions:positions,
    limitations:['Desktop geometry fixture; browser artwork, actual font metrics, and responsive presentation are verified separately.']});
});
