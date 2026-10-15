#!/usr/bin/env node
/** Calibrate complete SVG alpha with a native renderer; no browser or Java. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2);
function opt(flag,fallback){const i=args.indexOf(flag);return i<0?fallback:args[i+1]}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const manifestFile=path.resolve(opt('--manifest',path.join(root,'public/portraits/vectors/manifest.json')));
const rawDir=path.resolve(opt('--raw-dir',path.join(root,'.cache/vector-export')));
const outputRoot=path.resolve(opt('--output-root',path.join(root,'public')));
const renderDir=opt('--render-dir',null);
const reportFile=path.resolve(opt('--report',path.join(root,'.cache/vector-viewport-report.json')));
const renderer=path.resolve(opt('--resvg',path.join(root,'.cache/portrait-v44/runtime/node_modules/@resvg/resvg-js/index.js')));
const auditOnly=args.includes('--audit-existing');
const allowBitmaps=args.includes('--allow-bitmaps');
const {Resvg}=await import(pathToFileURL(renderer).href);
const renderOptions={font:{loadSystemFonts:false}};
const manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
const ids=opt('--ids',null)?.split(',')??Object.keys(manifest.portraits);
const report={renderer:'@resvg/resvg-js 2.6.2',auditOnly,portraits:{}};
try{report.portraits=JSON.parse(await fs.readFile(reportFile,'utf8')).portraits??{}}catch(error){if(error.code!=='ENOENT')throw error}
async function save(file,data){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(data,null,2)+'\n');await fs.rename(file+'.tmp',file)}
function viewport(svg){
 const tag=svg.match(/<svg\b[^>]*>/)?.[0];if(!tag)throw Error('Missing SVG root');
 const vb=tag.match(/\bviewBox="([^"]*)"/);if(vb)return vb[1].trim().split(/[ ,]+/).map(Number);
 const w=parseFloat(tag.match(/\bwidth="([^"]*)"/)?.[1]),h=parseFloat(tag.match(/\bheight="([^"]*)"/)?.[1]);
 if(!(w>0&&h>0))throw Error('Invalid source viewport');return [0,0,w,h];
}
function withViewport(svg,[x,y,w,h],logicalScale=1){return svg.replace(/<svg\b[^>]*>/,tag=>tag.replace(/\s(?:viewBox|width|height)="[^"]*"/g,'').slice(0,-1)+` viewBox="${x} ${y} ${w} ${h}" width="${w/logicalScale}" height="${h/logicalScale}">`)}
function alphaBounds(render){
 const {width,height,pixels}=render;let l=width,t=height,r=0,b=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1)}
 if(r<=l||b<=t)throw Error('Empty SVG silhouette');return [l,t,r,b];
}
function expandedBounds(svg){
 let [x,y,w,h]=viewport(svg);
 if(w*h>30000000){
  if(/\bviewBox=/.test(svg.match(/<svg\b[^>]*>/)?.[0]??''))throw Error('Oversized transformed source viewport');
  const bbox=new Resvg(svg,renderOptions).getBBox();if(!bbox)throw Error('Missing large-source geometry');
  ({x,y,width:w,height:h}=bbox);
 }
 for(let pad=64;pad<=1024;pad*=2){
  const view=[Math.floor(x-pad),Math.floor(y-pad),Math.ceil(w+2*pad),Math.ceil(h+2*pad)];
  if(view[2]*view[3]>32000000)throw Error('Expanded viewport exceeds bounded render size');
  const rendered=new Resvg(withViewport(svg,view),renderOptions).render(),[l,t,r,b]=alphaBounds(rendered);
  if(l>=8&&t>=8&&r<=rendered.width-8&&b<=rendered.height-8)return {alpha:[l+view[0],t+view[1],r+view[0],b+view[1]],expansion:pad};
 }
 throw Error('Visible alpha reaches expanded source viewport');
}
async function rawSvg(id){const dir=path.join(rawDir,id,'svg');const folder=(await fs.readdir(dir)).find(n=>n.startsWith('DefineSprite_'));if(!folder)throw Error('Missing first-pose SVG export');return fs.readFile(path.join(dir,folder,'1.svg'),'utf8')}
let processed=0;
for(const id of ids){
 const item=manifest.portraits[id];if(!item||item.error)continue;
 try{
  const destination=path.join(outputRoot,item.path.replace(/^\//,''));let svg=auditOnly?await fs.readFile(destination,'utf8'):await rawSvg(id);
  if(/<(?:script|foreignObject)\b/i.test(svg)||/\bon\w+\s*=/i.test(svg)||(!allowBitmaps&&/<image\b/i.test(svg)))throw Error('Unapproved bitmap or active SVG content');
  if([...svg.matchAll(/(?:xlink:)?href="([^"]+)"/g)].some(m=>!m[1].startsWith('#')&&!(allowBitmaps&&/^data:image\/(?:png|jpeg);base64,/i.test(m[1]))))throw Error('External SVG reference');
  const original=viewport(svg),{alpha,expansion}=expandedBounds(svg),[l,t,r,b]=alpha;
  const filters=(svg.match(/<filter\b/g)||[]).length,edgePadding=[l-original[0],t-original[1],original[0]+original[2]-r,original[1]+original[3]-b];
  const entry={alpha,expansion,filters,originalViewport:original,edgePadding,clipped:edgePadding.some(v=>v<0)};
  if(!auditOnly){
   svg=svg.replace(/\sffdec:[\w-]+="[^"]*"/g,'').replace(/\sxmlns:ffdec="[^"]*"/g,'');
   let bounds,rendered,finalAlpha,finalPadding;
   for(let border=2;border<=6;border++){
    bounds=[l-border,t-border,r-l+2*border,b-t+2*border];
    rendered=new Resvg(withViewport(svg,bounds),renderOptions).render();finalAlpha=alphaBounds(rendered);
    finalPadding=[finalAlpha[0],finalAlpha[1],rendered.width-finalAlpha[2],rendered.height-finalAlpha[3]];
    if(finalPadding.every(v=>v>=2))break;
   }
   if(finalPadding.some(v=>v<2))throw Error('Calibrated render lost required transparent padding');
   svg=withViewport(svg,bounds,2);
   await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,svg);
   if(renderDir){await fs.mkdir(renderDir,{recursive:true});await fs.writeFile(path.join(renderDir,id+'.png'),rendered.asPng())}
   Object.assign(item,{width:bounds[2]/2,height:bounds[3]/2,bytes:Buffer.byteLength(svg),sha256:createHash('sha256').update(svg).digest('hex'),bounds_method:'Expanded SVG alpha measured with resvg 2.6.2; at least two exported-coordinate pixels (one logical vector unit) of transparent padding.',svg_bounds:{x:bounds[0],y:bounds[1],width:bounds[2],height:bounds[3]},alpha_bounds:[finalAlpha[0]/2,finalAlpha[1]/2,(finalAlpha[2]-finalAlpha[0])/2,(finalAlpha[3]-finalAlpha[1])/2],source_filter_count:filters});
   delete item.viewport_pending;entry.finalPadding=finalPadding;
  }
  report.portraits[id]=entry;
 }catch(error){report.portraits[id]={error:String(error.message||error)}}
 processed++;
 if(processed%25===0){await save(reportFile,report);if(!auditOnly)await save(manifestFile,manifest);console.log(`${processed}/${ids.length} viewport checks; ${Object.keys(report.portraits).length} cumulative`)}
}
await save(reportFile,report);if(!auditOnly)await save(manifestFile,manifest);
const failures=Object.values(report.portraits).filter(p=>p.error).length;
console.log(`${Object.keys(report.portraits).length} checked; ${failures} errors; auditOnly=${auditOnly}`);if(failures)process.exitCode=1;
