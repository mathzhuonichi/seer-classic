/** Viewport CSS-pixel calculations and the pure scene, window and walking geometry behind the UI handlers.
 * DOM fixtures do not prove browser layout, painting, pointer capture, or portal rendering; the browser owner
 * separately verifies live drag, map movement, tooltip/menu placement, resizing, and GPU continuity.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {parseSync,transformSync} from 'rolldown/utils';
import {root,suite,withSsr} from './_harness.mjs';

// TypeFilter and TypeIcon handlers are still extracted from source; they belong to the type UI.
const files=['src/components/TypeFilter.tsx','src/components/TypeIcon.tsx'];
const sources=new Map(files.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
const layouts=[],coordinates=[];
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
try{await withSsr('game-display-v43',async load=>{
  const t=suite('game-display-v43'),{check}=t;
  const [{gameDisplayLayout,getLayoutZoom,startWindowDrag,startsWindowDrag,dragWindow,clampWindow},walk,roaming,{rectangle,percentIn}]=await Promise.all(
    ['/src/presentation/game-display.ts','/src/presentation/world-walk.ts','/src/presentation/world-roaming.ts','/src/presentation/scene-geometry.ts'].map(load));
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
      const parent={clientWidth:1063,clientHeight:619},box={offsetWidth:760,offsetHeight:480};
      const drag=startWindowDrag({clientX:700,clientY:500},{left:37+100*zoom,top:19+30*zoom},{left:37,top:19},zoom);
      const position=dragWindow(drag,{clientX:760,clientY:530},parent,box);
      close((position.x-100)*zoom,60,'rendered drag x');close((position.y-30)*zoom,30,'rendered drag y');
      coordinates.push({handler:'GameWindow drag',zoom,pointerDeltaCssPixels:{x:60,y:30},layoutPosition:position});
      assert.deepEqual(dragWindow(drag,{clientX:100000,clientY:100000},parent,box),{x:303,y:139});
      assert.deepEqual(dragWindow(drag,{clientX:-100000,clientY:-100000},parent,box),{x:0,y:0});
    }
    assert.equal(startsWindowDrag({closest:()=>({tagName:'BUTTON'})}),false,'The close button never starts a drag');
    assert.equal(startsWindowDrag({closest:()=>null}),true);
    const inside={x:20,y:30};assert.equal(clampWindow(inside,{clientWidth:1063,clientHeight:619},{offsetWidth:760,offsetHeight:480}),inside,'A resize that fits keeps the position');
  });
  check('Map click and creature approach preserve percentage destinations at every zoom',()=>{
    for(const zoom of [1,1.5,2,3]){
      const scene={left:23,top:11,width:1000*zoom,height:600*zoom};
      const destination=percentIn(scene,scene.left+scene.width*.37,scene.top+scene.height*.63);close(destination.x,37);close(destination.y,63);
      const foot=walk.contactFoot({left:scene.left+250*zoom,top:0,width:100*zoom,height:0,bottom:scene.top+420*zoom},scene);close(foot.x,30);close(foot.y,70);
    }
  });
  check('Roaming edge constraints use layout dimensions and remain inside the scene after scaling',()=>{
    const layout={habitat:rectangle(-1000,-1000,1000,1000)},scene={width:1000,height:600};
    const {scale,bounds}=roaming.roamFit({scene,body:{width:140,height:180},labelHeight:16});assert.equal(String(scale),'1');
    for(const zoom of [1,1.5,2,3])for(const edge of [0,100]){
      const context={layout,home:{x:50,y:50},territory:bounds,bounds,scene,random:()=>{throw Error('Paused fixture must not roam');}};
      const {position}=roaming.advanceRoam({position:{x:edge,y:edge},rest:500,leg:null,facing:'right'},context,16,true);
      const x=position.x/100*scene.width,y=position.y/100*scene.height;
      assert((x-70)*zoom>=12*zoom-1e-7);assert((x+70)*zoom<=(1000-12)*zoom+1e-7);
      assert((y-180)*zoom>=12*zoom-1e-7);assert((y+20)*zoom<=(600-12)*zoom+1e-7);
    }
  });
  check('Map walk direction and elapsed time are invariant when scene and actor rectangles scale together',()=>{
    let baseline;
    for(const zoom of [1,1.5,2,3]){
      const scene={left:23,top:11,width:1000*zoom,height:600*zoom};
      const from=walk.robotFoot({left:scene.left+170*zoom,width:60*zoom,top:scene.top+164*zoom,height:80*zoom},scene);
      const timing=walk.walkTiming(from,{x:80,y:75},scene,false);assert(timing.duration>=320);
      baseline??=timing;close(timing.duration,baseline.duration);assert.equal(timing.direction,baseline.direction);
    }
  });
  check('Creature contact stops on the incoming side and nearby clicks open without a second walk',()=>{
    for(const zoom of [1,1.5,3])for(const from of [{x:10,y:50},{x:90,y:50},{x:50,y:10},{x:50,y:90},{x:90,y:80},{x:52,y:51}]){
      const scene={left:23,top:11,width:1000*zoom,height:600*zoom};
      const robot={left:scene.left+from.x*10*zoom-30*zoom,top:scene.top+from.y*6*zoom-76*zoom,width:60*zoom,height:80*zoom};
      const foot=walk.robotFoot(robot,scene);close(foot.x,from.x);close(foot.y,from.y);
      const {stop,immediate}=walk.approachStop(foot,{x:50,y:50},scene,100*zoom,robot.width);
      const startDistance=Math.hypot((from.x-50)*10,(from.y-50)*6);
      if(startDistance<=56){assert(immediate);close(stop.x,from.x);close(stop.y,from.y);}
      else{
        assert(!immediate,'No early popup while walking');
        close(Math.hypot((stop.x-50)*10,(stop.y-50)*6),56,'Contact clearance');
        assert((stop.x-50)*(from.x-50)+(stop.y-50)*(from.y-50)>0,'Never cross the contact');
        assert(Math.hypot(stop.x-from.x,stop.y-from.y)<Math.hypot(50-from.x,50-from.y));
      }
    }
  });
  check('Reduced motion finishes interaction immediately when CSS walking has no transition',()=>{
    const timing=walk.walkTiming({x:10,y:20},{x:80,y:70},undefined,true);assert.equal(timing.duration,0);
    const motion=walk.walkMotion(walk.IDLE_WALK,{type:'start',...timing,approaching:null});assert.equal(motion.moving,false);
  });
  check('Creature approach clears its roaming lock after both immediate and animated arrival',()=>{
    const scene={left:0,top:0,width:1000,height:600},robot={left:70,top:224,width:60,height:80};
    const {stop,immediate}=walk.approachStop(walk.robotFoot(robot,scene),{x:50,y:50},scene,100,robot.width);
    assert(!immediate);close(stop.x,44.4);close(stop.y,50);
    for(const reducedMotion of [true,false]){
      const timing=walk.walkTiming(walk.robotFoot(robot,scene),stop,scene,reducedMotion);
      let motion=walk.walkMotion(walk.IDLE_WALK,{type:'start',...timing,approaching:'fixture:10:0'});
      if(reducedMotion){assert.equal(timing.duration,0);assert.equal(motion.approaching,null,'Immediate arrival never holds the creature');}
      else{assert(timing.duration>0);assert.equal(motion.moving,true);assert.equal(motion.approaching,'fixture:10:0');motion=walk.walkMotion(motion,{type:'stop'});}
      assert.equal(motion.moving,false);
      assert.equal(motion.approaching,null,'Arrival must release the approach lock so closing interaction resumes roaming');
    }
  });
  check('Type menus keep scaled trigger alignment and remain inside viewport edges',()=>{
    for(const [,width,height] of viewportCases){
      const zoom=gameDisplayLayout(width,height).zoom;
      for(const anchor of ['center','top left','bottom right']){
        const rect={left:anchor==='top left'?0:anchor==='bottom right'?width-120*zoom:width*.4,top:anchor==='top left'?0:anchor==='bottom right'?height-30*zoom:height*.4,width:120*zoom};rect.bottom=rect.top+30*zoom;
        let position;const place=handler('src/components/TypeFilter.tsx','place',{trigger:{current:{currentCSSZoom:zoom,getBoundingClientRect:()=>rect}},getLayoutZoom,window:{innerWidth:width,innerHeight:height},setPosition:value=>{position=value;}});
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
        let position;const place=handler('src/components/TypeIcon.tsx','placeTooltip',{icon:{current:{currentCSSZoom:zoom,getBoundingClientRect:()=>rect}},tooltip:{current:{offsetWidth:90,offsetHeight:30}},label:'Fire element',getLayoutZoom,window:{innerWidth:width,innerHeight:height},setPosition:value=>{position=value;}});
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
  t.finish({scope:'Viewport CSS-pixel calculations and the pure geometry behind UI handlers; no physical-display measurements or browser rendering.',layouts,coordinates});
});
}finally{
  if(previousComputedStyle)Object.defineProperty(globalThis,'getComputedStyle',previousComputedStyle);else delete globalThis.getComputedStyle;
}
