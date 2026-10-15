/** Run: node tools/verification/game-display-v43.mjs [report-directory].
 * This checks viewport CSS-pixel calculations and actual extracted UI handlers.
 * It does not measure a physical display or replace browser interaction checks.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseSync,transformSync} from 'rolldown/utils';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.resolve(root,process.argv[2]??'artifacts/game-display-v43');
const files=['src/presentation/game-display.ts','src/components/GameWindow.tsx','src/components/WorldMap.tsx','src/components/TypeFilter.tsx','src/components/TypeIcon.tsx','src/presentation/world-interaction.ts'];
const sources=new Map(files.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
const hash=text=>createHash('sha256').update(text).digest('hex');
const checks=[],layouts=[],coordinates=[];
const report={scope:'Viewport CSS-pixel calculations and production handler logic in DOM fixtures; no physical-display measurements or browser rendering.',checks,layouts,coordinates,sourceHashes:Object.fromEntries([...sources].map(([file,source])=>[file,hash(source)])),limitations:['DOM fixtures do not prove browser layout, painting, pointer capture, or portal rendering.','The browser owner separately verifies live drag, map movement, tooltip/menu placement, resizing, and GPU continuity.']};
const check=(name,run)=>{run();checks.push(name);};
const close=(actual,expected,label='number')=>assert(Math.abs(actual-expected)<=1e-7*Math.max(1,Math.abs(expected)),`${label}: ${actual} != ${expected}`);
const previousComputedStyle=Object.getOwnPropertyDescriptor(globalThis,'getComputedStyle');
let styleReads=0;
Object.defineProperty(globalThis,'getComputedStyle',{configurable:true,value:element=>{
  styleReads++;return {zoom:element.fixtureZoom??'1',get transform(){throw Error('Layout zoom must ignore transient transforms');}};
}});

// Extract executable source with Vite's TypeScript-capable parser, rather than maintain a
// duplicate of the coordinate equations. Dependencies are explicit DOM fixtures.
function handler(file,name,bindings,ancestor){
  const source=sources.get(file),parsed=parseSync(file,source);assert.equal(parsed.errors.length,0,file+' parses');
  const matches=[];
  function visit(node,parents=[]){
    if(!node||typeof node!=='object')return;
    if((node.type==='FunctionDeclaration'||node.type==='VariableDeclarator')&&node.id?.name===name){
      if(!ancestor||parents.some(parent=>parent.type==='FunctionDeclaration'&&parent.id?.name===ancestor))matches.push(node);
    }
    for(const value of Object.values(node)){if(Array.isArray(value))for(const child of value)visit(child,[...parents,node]);else if(value&&typeof value==='object')visit(value,[...parents,node]);}
  }
  visit(parsed.program);assert.equal(matches.length,1,`${file}: unique ${ancestor??''}/${name}`);
  const node=matches[0],definition=node.type==='FunctionDeclaration'?source.slice(node.start,node.end):`const ${name}=${source.slice(node.init.start,node.init.end)};`;
  const compiled=transformSync('handler.ts',`function extractedHandler(){${definition}\nreturn ${name};}`).code;
  return new Function(...Object.keys(bindings),compiled+'\nreturn extractedHandler();')(...Object.values(bindings));
}
const viewportCases=[
  ['baseline',1280,720],['small portrait',640,760],['3840 by 2160 viewport',3840,2160],
  ['2560 by 1440 viewport',2560,1440],['1920 by 1080 viewport',1920,1080],
  ['ultrawide',5120,1440],['wide',3440,1440],['tall',1080,1920],
  ['small landscape',640,320],['compact portrait',320,568],['legacy ratio',960,650],
];
let server;
const cacheParent=path.join(root,'artifacts/.validation-cache');
fs.mkdirSync(cacheParent,{recursive:true});
const cacheDir=fs.mkdtempSync(path.join(cacheParent,'game-display-'));
try{
  server=await createServer({root,cacheDir,configFile:false,server:{middlewareMode:true,watch:null,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',logLevel:'error'});
  const {gameDisplayLayout,getLayoutZoom}=await server.ssrLoadModule('/src/presentation/game-display.ts');
  const {contactApproachPoint}=await server.ssrLoadModule('/src/presentation/world-interaction.ts');
  check('Each viewport retains the original 960:650 fit without overflowing',()=>{
    for(const [name,width,height] of viewportCases){
      const layout=gameDisplayLayout(width,height),rendered={width:layout.width*layout.zoom,height:layout.height*layout.zoom};
      const legacy={width:Math.min(width,height*960/650),height:Math.min(height,width*650/960)};
      assert(Object.values(layout).every(Number.isFinite));assert(layout.zoom>=1);assert(layout.width>0&&layout.height>0);
      close(rendered.width,legacy.width,name+' fitted width');close(rendered.height,legacy.height,name+' fitted height');
      close(layout.width/layout.height,960/650,name+' aspect ratio');
      assert(rendered.width<=width+1e-7&&rendered.height<=height+1e-7,name+' overflow');
      close(Math.min(width-rendered.width,height-rendered.height),0,name+' fills one viewport dimension');
      if(legacy.height<=720){assert.equal(layout.zoom,1);close(layout.width,legacy.width);close(layout.height,legacy.height);}
      else{close(layout.height,720);close(layout.width,720*960/650);}
      layouts.push({name,viewportCssPixels:{width,height},layoutCssPixels:{width:layout.width,height:layout.height},zoom:layout.zoom,renderedCssPixels:rendered});
    }
  });
  check('Reference zoom values and the 720-height transition are continuous',()=>{
    for(const [width,height,zoom] of [[1280,720,1],[640,760,1],[1920,1080,1.5],[2560,1440,2],[3840,2160,3],[5120,1440,2]])close(gameDisplayLayout(width,height).zoom,zoom);
    for(const height of [719.999,720,720.001]){const result=gameDisplayLayout(2000,height);close(result.height*result.zoom,height);assert(result.height<=720);}
  });
  check('currentCSSZoom is authoritative and bypasses ancestor or transform reads',()=>{
    styleReads=0;close(getLayoutZoom({currentCSSZoom:2.75,parentElement:{fixtureZoom:'900%'}}),2.75);assert.equal(styleReads,0);
  });
  check('Fallback multiplies numeric and percentage ancestor zoom and ignores transforms',()=>{
    const outer={fixtureZoom:'2',parentElement:null},middle={fixtureZoom:'150%',parentElement:outer},inner={fixtureZoom:'1.25',parentElement:middle};
    for(const current of [undefined,0,-1,NaN,Infinity]){inner.currentCSSZoom=current;close(getLayoutZoom(inner),3.75);}
    middle.fixtureZoom='125%';close(getLayoutZoom(inner),3.125);
    for(const value of ['normal','0','-1','NaN','Infinity'])close(getLayoutZoom({fixtureZoom:value,parentElement:null}),1);
  });

  check('Dragging follows the pointer once at zoom 1, 1.5, 2 and 3 and clamps in layout units',()=>{
    for(const zoom of [1,1.5,2,3]){
      let position;const captured=[],drag={current:null},parent={clientWidth:1063,clientHeight:619,getBoundingClientRect:()=>({left:37,top:19})};
      const box={currentCSSZoom:zoom,parentElement:parent,offsetWidth:760,offsetHeight:480,getBoundingClientRect:()=>({left:37+100*zoom,top:19+30*zoom})};
      const bindings={ref:{current:box},drag,getLayoutZoom,setPosition:value=>{position=value;}};
      const begin=handler(files[1],'begin',bindings),move=handler(files[1],'move',bindings);
      const event={clientX:700,clientY:500,pointerId:9,target:{closest:()=>null},currentTarget:{setPointerCapture:id=>captured.push(id)}};
      begin(event);assert.deepEqual(captured,[9]);move({...event,clientX:760,clientY:530});
      close((position.x-100)*zoom,60,'rendered drag x');close((position.y-30)*zoom,30,'rendered drag y');
      coordinates.push({handler:'GameWindow drag',zoom,pointerDeltaCssPixels:{x:60,y:30},layoutPosition:position});
      move({...event,clientX:100000,clientY:100000});assert.deepEqual(position,{x:303,y:139});
      move({...event,clientX:-100000,clientY:-100000});assert.deepEqual(position,{x:0,y:0});
      drag.current=null;begin({...event,target:{closest:()=>({tagName:'BUTTON'})}});assert.equal(drag.current,null);
    }
  });
  check('Map click and creature approach preserve percentage destinations at every zoom',()=>{
    for(const zoom of [1,1.5,2,3]){
      const scene={left:23,top:11,width:1000*zoom,height:600*zoom};let destination;
      const walkClick=handler(files[2],'walkClick',{walk:(x,y)=>{destination={x,y};}});
      walkClick({clientX:scene.left+scene.width*.37,clientY:scene.top+scene.height*.63,currentTarget:{getBoundingClientRect:()=>scene}});
      close(destination.x,37);close(destination.y,63);
      let stopped=false;const freeze={current:false},element={dataset:{},closest:()=>({getBoundingClientRect:()=>scene}),getBoundingClientRect:()=>({left:scene.left+250*zoom,width:100*zoom,bottom:scene.top+420*zoom})};
      const approach=handler(files[2],'approach',{freeze,onApproach:(_event,x,y)=>{destination={x,y};}},'RoamingCreature');
      approach({currentTarget:element,stopPropagation:()=>{stopped=true;}});assert(stopped&&freeze.current);close(destination.x,30);close(destination.y,70);
    }
  });
  check('Roaming edge constraints use layout dimensions and remain inside the scene after scaling',()=>{
    for(const zoom of [1,1.5,2,3])for(const edge of [0,100]){
      const scene={clientWidth:1000,clientHeight:600,getBoundingClientRect:()=>{throw Error('Roaming constraints must not mix rendered and layout sizes');}};
      const styles={},element={offsetWidth:140,offsetHeight:180,dataset:{},style:{setProperty:(key,value)=>{styles[key]=value;}},closest:()=>scene,getClientRects:()=>[{}],querySelector:()=>({offsetHeight:16})};
      const state={current:{position:{x:edge,y:edge},rest:500,leg:null,facing:'right'}};
      const tick=handler(files[2],'tick',{button:{current:element},battle:false,document:{hidden:false,querySelector:()=>({})},freeze:{current:true},last:0,layout:{},clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),constrainHabitatPoint:(_layout,point)=>point,home:{x:50,y:50},state,between:()=>{throw Error('Paused fixture must not roam');},frame:0,requestAnimationFrame:()=>1},'RoamingCreature');
      tick(16);const x=Number.parseFloat(element.style.left)/100*scene.clientWidth,y=Number.parseFloat(element.style.top)/100*scene.clientHeight;
      assert((x-70)*zoom>=12*zoom-1e-7);assert((x+70)*zoom<=(1000-12)*zoom+1e-7);
      assert((y-180)*zoom>=12*zoom-1e-7);assert((y+20)*zoom<=(600-12)*zoom+1e-7);assert.equal(styles['--roam-size'],'1');
    }
  });
  check('Map walk direction and elapsed time are invariant when scene and actor rectangles scale together',()=>{
    let baseline;
    for(const zoom of [1,1.5,2,3]){
      const scene={left:23,top:11,width:1000*zoom,height:600*zoom};let duration,direction;
      const element={closest:()=>({getBoundingClientRect:()=>scene}),getBoundingClientRect:()=>({left:scene.left+170*zoom,width:60*zoom,top:scene.top+164*zoom,height:80*zoom})};
      const walk=handler(files[2],'walk',{cancelWalk(){},setSelection(){},setShowDetails(){},constrainScenePoint:(_layout,point)=>point,layout:{},player:{current:element},preference:{x:20,y:40},setPlayerDirection:value=>{direction=value;},robotDirection:(dx,dy)=>Math.atan2(dy,dx),setDuration:value=>{duration=value;},setMoving(){},setPreference(){},movementTimer:{current:null},setTimeout:()=>1,window:{matchMedia:()=>({matches:false})}});
      walk(80,75);if(!baseline)baseline={duration,direction};close(duration,baseline.duration);close(direction,baseline.direction);
    }
  });

  check('Creature contact stops on the incoming side and nearby clicks open without a second walk',()=>{
    for(const zoom of [1,1.5,3])for(const from of [{x:10,y:50},{x:90,y:50},{x:50,y:10},{x:50,y:90},{x:90,y:80},{x:52,y:51}]){
      const scene={left:23,top:11,width:1000*zoom,height:600*zoom};
      const robot={left:scene.left+from.x*10*zoom-30*zoom,top:scene.top+from.y*6*zoom-76*zoom,width:60*zoom,height:80*zoom};
      const target={kind:'creature',id:10,instanceId:'fixture:10:0'};let destination,after,selection,cancelled=false,position;
      const approach=handler(files[2],'approach',{player:{current:{getBoundingClientRect:()=>robot}},visiblePlayerPosition:from,contactApproachPoint,
        walk:(x,y,callback)=>{destination={x,y};after=callback;return true;},setApproachingInstance(){},setSelection:value=>{selection=value;},
        cancelWalk:()=>{cancelled=true;},setDuration(){},setShowDetails(){},setPreference:callback=>{position=callback({});}},'WorldMap');
      approach({stopPropagation(){},currentTarget:{closest:()=>({getBoundingClientRect:()=>scene}),getBoundingClientRect:()=>({width:100*zoom})}},target,50,50);
      const startDistance=Math.hypot((from.x-50)*10,(from.y-50)*6);
      if(startDistance<=56){assert(!destination);assert(cancelled);assert.deepEqual(selection,target);close(position.x,from.x);close(position.y,from.y);}
      else{
        assert(destination);assert.equal(selection,undefined,'No early popup while walking');
        close(Math.hypot((destination.x-50)*10,(destination.y-50)*6),56,'Contact clearance');
        assert((destination.x-50)*(from.x-50)+(destination.y-50)*(from.y-50)>0,'Never cross the contact');
        assert(Math.hypot(destination.x-from.x,destination.y-from.y)<Math.hypot(50-from.x,50-from.y));
        after();assert.deepEqual(selection,target);
      }
    }
  });

  check('Reduced motion finishes interaction immediately when CSS walking has no transition',()=>{
    let completed=false,moving,duration;
    const walk=handler(files[2],'walk',{cancelWalk(){},setSelection(){},setShowDetails(){},constrainScenePoint:(_layout,p)=>p,layout:{},player:{current:null},preference:{x:10,y:20},
      setPlayerDirection(){},robotDirection:()=>0,setDuration:value=>{duration=value;},setMoving:value=>{moving=value;},setPreference(){},movementTimer:{current:null},
      window:{matchMedia:()=>({matches:true})},setTimeout:()=>{throw Error('Reduced motion must not wait on an invisible transition');}});
    walk(80,70,()=>{completed=true;});assert.equal(duration,0);assert.equal(moving,false);assert(completed);
  });

  check('Creature approach clears its roaming lock after both immediate and animated arrival',()=>{
    for(const reducedMotion of [true,false]){
      const scene={left:0,top:0,width:1000,height:600};
      const robot={left:70,top:224,width:60,height:80};
      const player={current:{closest:()=>({getBoundingClientRect:()=>scene}),getBoundingClientRect:()=>robot}};
      const movementTimer={current:null},target={kind:'creature',id:10,instanceId:'fixture:10:0'};
      let moving=false,duration,selection=null,approachingInstance=null,timer,position={x:10,y:50};
      const shared={player,movementTimer,setMoving:value=>{moving=value;},setApproachingInstance:value=>{approachingInstance=value;},
        setSelection:value=>{selection=value;},setDuration:value=>{duration=value;},setShowDetails(){},setPreference:callback=>{position=callback(position);}};
      const cancelWalk=handler(files[2],'cancelWalk',{...shared,clearTimeout:()=>{timer=null;}},'WorldMap');
      const walk=handler(files[2],'walk',{...shared,cancelWalk,constrainScenePoint:(_layout,point)=>point,layout:{},preference:position,
        setPlayerDirection(){},robotDirection:()=>0,window:{matchMedia:()=>({matches:reducedMotion})},setTimeout:callback=>{timer=callback;return 1;}},'WorldMap');
      const approach=handler(files[2],'approach',{...shared,cancelWalk,walk,visiblePlayerPosition:position,contactApproachPoint},'WorldMap');
      approach({stopPropagation(){},currentTarget:{closest:()=>({getBoundingClientRect:()=>scene}),getBoundingClientRect:()=>({width:100})}},target,50,50);
      close(position.x,44.4);close(position.y,50);
      if(reducedMotion){
        assert.equal(timer,undefined,'Immediate arrival must not schedule a walk');assert.equal(duration,0);
      }else{
        assert.equal(selection,null);assert.equal(approachingInstance,target.instanceId);assert.equal(moving,true);assert(duration>0);
        assert.equal(typeof timer,'function');timer();
      }
      assert.deepEqual(selection,target);assert.equal(moving,false);assert.equal(movementTimer.current,null);
      assert.equal(approachingInstance,null,'Arrival must release the approach lock so closing interaction resumes roaming');
      shared.setSelection(null);assert.equal(approachingInstance,null);
    }
  });

  check('Type menus keep scaled trigger alignment and remain inside viewport edges',()=>{
    for(const [,width,height] of viewportCases){
      const zoom=gameDisplayLayout(width,height).zoom;
      for(const anchor of ['center','top left','bottom right']){
        const rect={left:anchor==='top left'?0:anchor==='bottom right'?width-120*zoom:width*.4,top:anchor==='top left'?0:anchor==='bottom right'?height-30*zoom:height*.4,width:120*zoom};rect.bottom=rect.top+30*zoom;
        let position;const place=handler(files[3],'place',{trigger:{current:{currentCSSZoom:zoom,getBoundingClientRect:()=>rect}},getLayoutZoom,window:{innerWidth:width,innerHeight:height},setPosition:value=>{position=value;}});
        place();assert.equal(position.zoom,zoom);
        const rendered={left:position.left*zoom,top:position.top*zoom,width:position.width*zoom,height:position.maxHeight*zoom};
        assert(rendered.left>=8*zoom-1e-7&&rendered.left+rendered.width<=width-8*zoom+1e-7);
        assert(rendered.top>=8*zoom-1e-7&&rendered.top+rendered.height<=height-8*zoom+1e-7);
        assert(position.maxHeight<=320&&position.maxHeight>=0);
        assert(rendered.top>=rect.bottom||rendered.top+rendered.height<=rect.top,'Menu must clear its trigger');
        if(anchor==='center'&&rect.left+rendered.width<=width-8*zoom)close(rendered.left,rect.left,'menu alignment when it fits');
      }
    }
  });
  check('Type tooltips scale once, choose above or below, and clamp horizontally',()=>{
    for(const [,width,height] of viewportCases){
      const zoom=gameDisplayLayout(width,height).zoom;
      for(const anchor of ['center','top left','bottom right']){
        const rect={left:anchor==='top left'?0:anchor==='bottom right'?width-21*zoom:width*.5,top:anchor==='top left'?0:anchor==='bottom right'?height-21*zoom:height*.5,width:21*zoom};rect.bottom=rect.top+21*zoom;
        let position;const place=handler(files[4],'placeTooltip',{icon:{current:{currentCSSZoom:zoom,getBoundingClientRect:()=>rect}},tooltip:{current:{offsetWidth:90,offsetHeight:30}},label:'Fire element',getLayoutZoom,window:{innerWidth:width,innerHeight:height},setPosition:value=>{position=value;}});
        place();assert.equal(position.zoom,zoom);
        const left=position.left*zoom-45*zoom,right=left+90*zoom,top=position.top*zoom-(position.below?0:30*zoom),bottom=top+30*zoom;
        assert(left>=8*zoom-1e-7&&right<=width-8*zoom+1e-7);assert(top>=0&&bottom<=height);
        if(anchor==='top left')assert(position.below);else assert(!position.below);
        if(anchor==='center')close(position.left*zoom,rect.left+rect.width/2,'tooltip center');
      }
    }
  });
  check('Verification leaves all measured production source bytes unchanged',()=>{
    for(const [file,source] of sources)assert.equal(fs.readFileSync(path.join(root,file),'utf8'),source,file);
  });
  report.passed=true;
}catch(error){report.passed=false;report.error=String(error.stack);process.exitCode=1;}
finally{
  try{await server?.close();}finally{fs.rmSync(cacheDir,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
  if(previousComputedStyle)Object.defineProperty(globalThis,'getComputedStyle',previousComputedStyle);else delete globalThis.getComputedStyle;
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  const lines=['# Game display verification v43','',report.scope,'',`Result: ${report.passed?'PASS':'FAIL'} (${checks.length} checks).`,'','| Viewport in CSS pixels | Layout width | Layout height | CSS zoom | Rendered width | Rendered height |','| --- | ---: | ---: | ---: | ---: | ---: |',...layouts.map(row=>`| ${row.viewportCssPixels.width} × ${row.viewportCssPixels.height} | ${row.layoutCssPixels.width.toFixed(3)} | ${row.layoutCssPixels.height.toFixed(3)} | ${row.zoom.toFixed(3)} | ${row.renderedCssPixels.width.toFixed(3)} | ${row.renderedCssPixels.height.toFixed(3)} |`),'','Checks:','',...checks.map(name=>`- ${name}`),'','Limitations:','',...report.limitations.map(text=>`- ${text}`)];
  if(report.error)lines.push('','```text',report.error,'```');
  fs.writeFileSync(path.join(output,'REPORT.md'),lines.join('\n')+'\n');
  console.log(JSON.stringify({passed:report.passed,checks:checks.length,viewportCases:layouts.length,reportDirectory:output,error:report.error},null,2));
}
