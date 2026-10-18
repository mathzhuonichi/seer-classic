/** Prepare original shape candidates or render selected source cells with resvg.
 * No redraw, contour simplification, bitmap enlargement claim, or runtime edit.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
const {Resvg}=require(path.join(root,'.cache/portrait-v44/runtime/node_modules/@resvg/resvg-js'));
const [phase,workArgument,selectionArgument]=process.argv.slice(2);
if(!['prepare','render'].includes(phase)||!workArgument)throw Error('Usage: prepare|render species-cache [selected-cells.json]');
const work=path.resolve(workArgument),options={font:{loadSystemFonts:false}};
const digest=data=>createHash('sha256').update(data).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(file+'.tmp',file);};
const resizeRoot=(xml,width,height,bounds)=>xml.replace(/<svg\b[^>]*>/,m=>m.replace(/\b(?:width|height|viewBox|preserveAspectRatio)="[^"]*"/g,'').replace(/>$/,` width="${width}" height="${height}" viewBox="${bounds.join(' ')}" preserveAspectRatio="none">`));

if(phase==='prepare'){
 const source=read(path.join(work,'source.json')),destination=path.join(work,'candidates');
 const additionalFiles=['morph-study','sprite-study'].map(name=>path.resolve(work,'../..',name,String(source.species),'candidates.json')).filter(file=>fs.existsSync(file));
 const additional=additionalFiles.map(file=>({file:path.relative(root,file),manifest:read(file),sha256:digest(fs.readFileSync(file))}));
 const additionalSignature=digest(JSON.stringify(additional.map(item=>({file:item.file,sha256:item.sha256}))));
 fs.mkdirSync(destination,{recursive:true});
 const manifestPath=path.join(work,'candidates.json');
 if(fs.existsSync(manifestPath)){
  const old=read(manifestPath);
  if(old.revision===2&&old.additionalSignature===additionalSignature&&old.sourceSha256===source.sourceSha256&&old.candidates.every(c=>fs.existsSync(path.join(destination,c.key+'.png'))&&fs.existsSync(path.join(destination,c.key+'.svg')))){
   console.log(JSON.stringify({species:source.species,candidates:old.candidates.length,reused:true}));process.exit(0);
  }
 }
 const rows=[],skipped=[];
 const save=(shape,key,xml,bounds,kind)=>{
  if(!bounds.every(Number.isFinite)||bounds[2]<=0||bounds[3]<=0){skipped.push({key,reason:'Degenerate vector bounds'});return;}
  const candidate=resizeRoot(xml,64,64,bounds);
  const png=new Resvg(candidate,options).render().asPng();
  fs.writeFileSync(path.join(destination,key+'.svg'),candidate);fs.writeFileSync(path.join(destination,key+'.png'),png);
  rows.push({key,character:shape.character,kind,bounds,nativeSize:bounds.slice(2),hasBitmap:shape.hasBitmap,sourceSvgSha256:shape.svgSha256,candidateSvgSha256:digest(candidate)});
 };
 for(const shape of source.shapes){
  const xml=fs.readFileSync(path.join(work,shape.svgPath),'utf8');
  if(digest(xml)!==shape.svgSha256)throw Error(`Changed source shape ${shape.character}`);
  save(shape,`${shape.character}-full`,xml,[0,0,...shape.nativeSize],'full-shape');
  if(shape.hasBitmap)continue;
  const paths=[...xml.matchAll(/<path\b[\s\S]*?\/>/g)].map(m=>m[0]);
  if(paths.length<=1||new Set(paths.map(p=>p.match(/\bfill="([^"]+)"/)?.[1])).size!==1)continue;
  for(let index=0;index<paths.length;index++){
   let number=0;const part=xml.replace(/<path\b[\s\S]*?\/>/g,m=>number++===index?m:'');
   const bounds=new Resvg(part,options).getBBox();if(!bounds)continue;
   save(shape,`${shape.character}-path${index}`,part,[bounds.x,bounds.y,bounds.width,bounds.height],'same-color-path');
  }
 }
 for(const extra of additional){
  if(extra.manifest.sourceSha256!==source.sourceSha256)throw Error('Additional candidates refer to a different official source');
  for(const item of extra.manifest.candidates){
   if(rows.some(row=>row.key===item.key))throw Error(`Duplicate candidate key ${item.key}`);
   const xml=fs.readFileSync(path.resolve(root,item.svgPath),'utf8');
   if(digest(xml)!==item.candidateSvgSha256)throw Error(`Changed additional vector ${item.key}`);
   fs.writeFileSync(path.join(destination,item.key+'.svg'),xml);
   fs.copyFileSync(path.resolve(root,item.pngPath),path.join(destination,item.key+'.png'));
   rows.push({...item,additionalManifestSha256:extra.sha256});
  }
 }
 write(manifestPath,{revision:2,sourceSha256:source.sourceSha256,species:source.species,fingerprintPixels:64,candidates:rows,skipped,additionalSignature,additionalManifests:additional.map(item=>({path:item.file,sha256:item.sha256}))});
 console.log(JSON.stringify({species:source.species,candidates:rows.length,skipped:skipped.length}));
}else{
 if(!selectionArgument)throw Error('render requires the selected-cells.json path');
 const selection=read(selectionArgument),candidates=read(path.join(work,'candidates.json'));
 if(selection.sourceSha256!==candidates.sourceSha256)throw Error('Selection and candidates refer to different official sources');
 const destination=path.join(work,'rendered');fs.mkdirSync(destination,{recursive:true});
 let count=0;
 for(const cell of selection.cells){
  if(!cell.selected||!['original-vector','original-vector-with-native-bitmap','original-bitmap-source-recovery'].includes(cell.mode))continue;
  const candidate=candidates.candidates.find(c=>c.key===cell.selected.key);if(!candidate)throw Error('Missing selected candidate');
  const xml=fs.readFileSync(path.join(work,'candidates',candidate.key+'.svg'),'utf8');
  if(digest(xml)!==candidate.candidateSvgSha256)throw Error(`Changed candidate ${candidate.key}`);
  for(const scale of new Set([1,cell.scale])){
   const width=cell.nativeSize[0]*scale,height=cell.nativeSize[1]*scale;
   if(width>8192||height>8192||width*height>33554432)throw Error('A selected tile exceeds the validated allocation limit');
   const output=resizeRoot(xml,width,height,candidate.bounds);
   fs.writeFileSync(path.join(destination,`${cell.id}-${scale}x.png`),new Resvg(output,options).render().asPng());
  }
  count++;
 }
 console.log(JSON.stringify({species:selection.species,renderedCells:count}));
}
