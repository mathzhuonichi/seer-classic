/** Exercise the real RoamingCreature effect, including initialization and RAF motion. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseSync,transformSync} from 'rolldown/utils';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=fs.readFileSync(path.join(root,'src/components/WorldMap.tsx'),'utf8');
const parsed=parseSync('WorldMap.tsx',source);assert.equal(parsed.errors.length,0);
const matches=[];
function visit(node,parents=[]){
  if(!node||typeof node!=='object')return;
  if(node.type==='CallExpression'&&node.callee?.name==='useEffect'&&parents.some(p=>p.type==='FunctionDeclaration'&&p.id?.name==='RoamingCreature'))matches.push(node.arguments[0]);
  for(const value of Object.values(node)){if(Array.isArray(value))for(const child of value)visit(child,[...parents,node]);else if(value&&typeof value==='object')visit(value,[...parents,node]);}
}
visit(parsed.program);assert.equal(matches.length,1,'Use the real wildlife effect');
const compiled=transformSync('effect.ts',`const effect=${source.slice(matches[0].start,matches[0].end)};`).code;
const checks=[];
const cache=fs.mkdtempSync(path.join(root,'artifacts/.validation-cache/roaming-'));
const server=await createServer({root,configFile:false,cacheDir:cache,server:{middlewareMode:true,watch:null,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',logLevel:'error'});
try{
  const [{WORLD_PLANETS},{getSceneLayout,creatureSceneHome,constrainHabitatPoint}]=await Promise.all(['/src/world.ts','/src/presentation/map-presentation.ts'].map(p=>server.ssrLoadModule(p)));
  const regions=WORLD_PLANETS.flatMap(planet=>planet.regions.map(region=>({planet,region,layout:getSceneLayout(planet,region)})));
  const row=regions.find(r=>r.region.backgroundAssetMapId===726);assert(row);
  assert.deepEqual([...new Set(regions.filter(r=>r.layout.homeRoam).map(r=>r.region.backgroundAssetMapId))],[726],'This territory change is scoped to map 726');
  const {layout}=row,homes=Array.from({length:6},(_,index)=>creatureSceneHome(layout,index,6));
  const within=(p,home)=>{assert(Math.abs(p.x-home.x)<=layout.homeRoam.x+1e-7);assert(Math.abs(p.y-home.y)<=layout.homeRoam.y+1e-7);assert.deepEqual(constrainHabitatPoint(layout,p),p);};
  for(const home of homes)for(const dx of [-layout.homeRoam.x,layout.homeRoam.x])for(const dy of [-layout.homeRoam.y,layout.homeRoam.y])within({x:home.x+dx,y:home.y+dy},home);
  checks.push('All six complete local territories lie on the visible ground polygon');
  // A conservative 100-by-20 CSS-pixel label box at a 960-wide map remains
  // separated even at the closest allowed points of neighboring territories.
  for(let i=0;i<homes.length;i++)for(let j=i+1;j<homes.length;j++){
    const dx=Math.max(0,Math.abs(homes[i].x-homes[j].x)-2*layout.homeRoam.x)*9.6;
    const dy=Math.max(0,Math.abs(homes[i].y-homes[j].y)-2*layout.homeRoam.y)*6.18;
    assert(dx>=100||dy>=20,'Neighboring label territories must not overlap');
  }
  checks.push('Six label territories stay separated at every allowed desktop position');
  function fixture(index,random){
    const home=homes[index],state={current:null},freeze={current:false};let next,now=0;
    const scene={clientWidth:960,clientHeight:618};
    const element={offsetWidth:124.8,offsetHeight:124.8,dataset:{},style:{setProperty(){}},closest:()=>scene,getClientRects:()=>[{}],querySelector:()=>({offsetHeight:18})};
    const math=Object.create(Math);math.random=random;
    const bindings={layout,home,state,freeze,button:{current:element},battle:false,Math:math,
      between:(lo,hi)=>lo+random()*(hi-lo),clamp:(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),constrainHabitatPoint,
      document:{hidden:false,querySelector:()=>null,addEventListener(){},removeEventListener(){}},
      requestAnimationFrame:callback=>{next=callback;return 1;},cancelAnimationFrame(){}};
    const effect=new Function(...Object.keys(bindings),compiled+';return effect;')(...Object.values(bindings));
    const cleanup=effect();
    return {home,state,freeze,element,cleanup,tick(){now+=50;next(now);within(state.current.position,home);}};
  }
  for(const value of [0,.999999])for(let i=0;i<6;i++){
    const f=fixture(i,()=>value);f.tick();assert.equal(f.element.dataset.motion,'idle');f.cleanup();
  }
  checks.push('Both extremes of the initial random offset remain inside their own territory');
  let positions=0;
  for(let i=0;i<6;i++){
    let seed=123456+i*817;
    const f=fixture(i,()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;});
    const seen=new Set();
    for(let n=0;n<1200;n++){f.tick();seen.add(`${f.state.current.position.x.toFixed(4)},${f.state.current.position.y.toFixed(4)}`);positions++;}
    assert(seen.size>100,'Each resident must visibly roam, not be pinned to a point');
    f.freeze.current=true;const stopped={...f.state.current.position};
    for(let n=0;n<30;n++){f.tick();assert.deepEqual(f.state.current.position,stopped);assert.equal(f.element.dataset.motion,'paused');}
    f.freeze.current=false;
    let resumed=false;for(let n=0;n<400;n++){f.tick();if(Math.hypot(f.state.current.position.x-stopped.x,f.state.current.position.y-stopped.y)>.05)resumed=true;}
    assert(resumed,'Closing interaction must resume the selected creature');f.cleanup();
  }
  checks.push('All six actual RAF instances roam for one minute, remain bounded, pause individually, and resume');
  const report={passed:true,mapId:726,checks,homes,homeRoam:layout.homeRoam,simulatedPositions:positions,
    limitations:['Desktop geometry fixture; browser artwork, actual font metrics, and responsive presentation are verified separately.']};
  const directory=path.join(root,'artifacts/maps-placement-v44');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'roaming-726.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,checks:checks.length,simulatedPositions:positions,homes},null,2));
}finally{await server.close();fs.rmSync(cache,{recursive:true,force:true});}
