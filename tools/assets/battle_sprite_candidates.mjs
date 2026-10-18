/** Derive extra candidates using only digest-pinned source SVG fragments. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
const {Resvg}=require(path.join(root,'.cache/portrait-v44/runtime/node_modules/@resvg/resvg-js'));
const input=path.resolve(process.argv[2]??'');
const source=JSON.parse(fs.readFileSync(input,'utf8')),work=path.dirname(input);
const output=path.join(work,'vectors');fs.mkdirSync(output,{recursive:true});
const options={font:{loadSystemFonts:false}},rows=[],skipped=[];
const sha=data=>createHash('sha256').update(data).digest('hex');
const resize=(xml,w,h,b)=>xml.replace(/<svg\b[^>]*>/,m=>m.replace(/\b(?:width|height|viewBox|preserveAspectRatio)="[^"]*"/g,'').replace(/>$/,` width="${w}" height="${h}" viewBox="${b.join(' ')}" preserveAspectRatio="none">`));
const identity=[1,0,0,1,0,0];
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const point=(m,p)=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
function transform(text=''){
 let result=identity;
 for(const match of text.matchAll(/([A-Za-z]+)\s*\(([^)]*)\)/g)){
  const n=match[2].trim().split(/[ ,]+/).map(Number);let next;
  if(match[1]==='matrix'&&n.length===6)next=n;
  else if(match[1]==='translate'&&n.length<=2)next=[1,0,0,1,n[0],n[1]??0];
  else if(match[1]==='scale'&&n.length<=2)next=[n[0],0,0,n[1]??n[0],0,0];
  else return null;
  result=multiply(result,next);
 }
 return result;
}
// resvg's path bounding boxes are conservative approximations. Analytical
// extrema prevent their control-point overshoot from changing native cell size.
function exactBounds(xml){
 if(/<(?:image|use|clipPath|mask|filter)\b/.test(xml))return null;
 const stack=[identity],points=[];
 for(const match of xml.matchAll(/<\/?g\b[^>]*>|<path\b[^>]*\/?>/g)){
  const tag=match[0];
  if(/^<\/g/.test(tag)){if(stack.length===1)return null;stack.pop();continue;}
  if(/^<g\b/.test(tag)){const m=transform(tag.match(/\btransform="([^"]*)"/)?.[1]);if(!m)return null;stack.push(multiply(stack.at(-1),m));continue;}
  if(/\bstroke="(?!none")/.test(tag))return null;
  const local=transform(tag.match(/\btransform="([^"]*)"/)?.[1]);if(!local)return null;
  const matrix=multiply(stack.at(-1),local),d=tag.match(/\bd="([^"]*)"/)?.[1];if(!d)continue;
  if(d.replace(/[MLQCZHVmlqczhv]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g,'').replace(/[\s,]/g,''))return null;
  const tokens=d.match(/[MLQCZHVmlqczhv]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)??[];
  let at=0,command,current=[0,0],start=[0,0];
  const addCurve=control=>{
   const p=control.map(v=>point(matrix,v));points.push(p[0],p.at(-1));
   for(let axis=0;axis<2;axis++){
    let roots=[];
    if(p.length===3){const den=p[0][axis]-2*p[1][axis]+p[2][axis];if(Math.abs(den)>1e-12)roots=[(p[0][axis]-p[1][axis])/den];}
    else if(p.length===4){const a=-p[0][axis]+3*p[1][axis]-3*p[2][axis]+p[3][axis],b=2*(p[0][axis]-2*p[1][axis]+p[2][axis]),c=p[1][axis]-p[0][axis];if(Math.abs(a)<1e-12){if(Math.abs(b)>1e-12)roots=[-c/b];}else{const disc=b*b-4*a*c;if(disc>=0)roots=[(-b+Math.sqrt(disc))/(2*a),(-b-Math.sqrt(disc))/(2*a)];}}
    for(const t of roots)if(t>0&&t<1){const u=1-t;points.push(p.length===3?[0,1].map(j=>u*u*p[0][j]+2*u*t*p[1][j]+t*t*p[2][j]):[0,1].map(j=>u*u*u*p[0][j]+3*u*u*t*p[1][j]+3*u*t*t*p[2][j]+t*t*t*p[3][j]));}
   }
  };
  while(at<tokens.length){
   if(/^[A-Za-z]$/.test(tokens[at]))command=tokens[at++];
   if(!command)return null;const upper=command.toUpperCase(),relative=command!==upper;
   if(upper==='Z'){addCurve([current,start]);current=start;command=null;continue;}
   const count={M:2,L:2,Q:4,C:6,H:1,V:1}[upper];if(!count||at+count>tokens.length)return null;
   const n=tokens.slice(at,at+count).map(Number);if(!n.every(Number.isFinite))return null;at+=count;
   const read=(i)=>[n[i]+(relative?current[0]:0),n[i+1]+(relative?current[1]:0)];let end;
   if(upper==='H')end=[n[0]+(relative?current[0]:0),current[1]];
   else if(upper==='V')end=[current[0],n[0]+(relative?current[1]:0)];
   else end=read(count-2);
   if(upper==='M'){points.push(point(matrix,end));start=end;command=relative?'l':'L';}
   else if(upper==='Q')addCurve([current,read(0),end]);
   else if(upper==='C')addCurve([current,read(0),read(2),end]);
   else addCurve([current,end]);current=end;
  }
 }
 if(!points.length)return null;const x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1]));return[x,y,Math.max(...points.map(p=>p[0]))-x,Math.max(...points.map(p=>p[1]))-y];
}
const bound=xml=>{const exact=exactBounds(xml);if(exact)return exact;const b=new Resvg(xml,options).getBBox();return b?[b.x,b.y,b.width,b.height]:null;};
const overlap=(a,b)=>a[0]<=b[0]+b[2]+.05&&b[0]<=a[0]+a[2]+.05&&a[1]<=b[1]+b[3]+.05&&b[1]<=a[1]+a[3]+.05;
const union=items=>{const x=Math.min(...items.map(b=>b[0])),y=Math.min(...items.map(b=>b[1]));return[x,y,Math.max(...items.map(b=>b[0]+b[2]))-x,Math.max(...items.map(b=>b[1]+b[3]))-y];};
const body=xml=>xml.replace(/^[\s\S]*?<svg\b[^>]*>/,'').replace(/<\/svg>\s*$/,'');
const svg=content=>`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:ffdec="https://www.free-decompiler.com/flash" width="1" height="1">${content}</svg>`;
const shapes=new Map(source.shapes.map(shape=>{
 const xml=fs.readFileSync(path.resolve(root,source.shapeDirectory,shape.svgPath),'utf8');
 if(sha(xml)!==shape.svgSha256)throw Error(`Changed official shape ${shape.character}`);
 const plain=!/<(?:image|use|clipPath|mask|filter|foreignObject|script)\b/.test(xml)&&!/[\s:]href="(?!#)/.test(xml);
 if(!plain)skipped.push({character:shape.character,reason:'Bitmap, filter, clipping, external reference, or active content is excluded.'});
 return[shape.character,{...shape,xml,plain}];
}));
function save(key,xml,bounds,metadata){
 if(!bounds||!bounds.every(Number.isFinite)||Math.min(...bounds.slice(2))<=0)return;
 const candidate=resize(xml,64,64,bounds),svgPath=path.join(output,key+'.svg'),pngPath=path.join(output,key+'.png');
 fs.writeFileSync(svgPath,candidate);fs.writeFileSync(pngPath,new Resvg(candidate,options).render().asPng());
 rows.push({key,svgPath:path.relative(root,svgPath),pngPath:path.relative(root,pngPath),bounds,nativeSize:bounds.slice(2),hasBitmap:false,
  sourceSha256:source.sourceSha256,candidateSvgSha256:sha(candidate),...metadata});
}

// Separate disconnected source contours without changing a single curve or fill.
// Intersecting bounds join subpaths, so holes remain with their containing fill.
for(const shape of shapes.values()){
 if(shape.hasBitmap||!shape.plain)continue;
 const paths=[...shape.xml.matchAll(/<path\b[\s\S]*?\/>/g)].map(m=>m[0]);
 const pieces=[];
 for(let p=0;p<paths.length;p++){
  const d=paths[p].match(/\bd="([^"]*)"/)?.[1];if(!d)continue;
  const subpaths=d.match(/[Mm][^Mm]*/g)??[];
  // Relative subpath starts depend on previous paths and must stay intact.
  if(subpaths.some(part=>part.startsWith('m'))){pieces.push({path:p,subpath:null,d});continue;}
  subpaths.forEach((part,s)=>pieces.push({path:p,subpath:s,d:part.trim()}));
 }
 if(pieces.length<2||pieces.length>150)continue;
 const filter=ids=>{let index=0;return shape.xml.replace(/<path\b[\s\S]*?\/>/g,original=>{const n=index++,selected=pieces.filter((piece,i)=>piece.path===n&&ids.includes(i));return selected.length?original.replace(/\bd="[^"]*"/,`d="${selected.map(piece=>piece.d).join(' ')}"`):'';});};
 pieces.forEach((piece,i)=>piece.bounds=bound(filter([i])));
 const groups=[];
 for(let i=0;i<pieces.length;i++){
  if(!pieces[i].bounds)continue;
  const touching=groups.filter(g=>g.some(j=>overlap(pieces[i].bounds,pieces[j].bounds)));
  const merged=[i,...touching.flat()];for(const g of touching)groups.splice(groups.indexOf(g),1);groups.push(merged);
 }
 if(groups.length<2||groups.length>6)continue;
 for(let mask=1;mask<(1<<groups.length)-1;mask++){
  const selected=groups.flatMap((g,i)=>mask&(1<<i)?g:[]),xml=filter(selected),bounds=bound(xml);
  save(`component-${shape.character}-${mask}`,xml,bounds,{character:shape.character,kind:'original-disconnected-components',
   sourceSvgSha256:shape.svgSha256,sourceSubpaths:selected.map(i=>({path:pieces[i].path,subpath:pieces[i].subpath})),componentCount:groups.length});
 }
}

// Two or three ordinary source shapes can be one baked Unity UV cell. Keep the
// exact original frame-one order and placement, including registration offsets.
const seen=new Set();
for(const sprite of source.sprites){
 const placements=sprite.placements.filter(item=>!shapes.get(item.character).hasBitmap&&shapes.get(item.character).plain);
 if(placements.length>20){skipped.push({sprite:sprite.character,reason:'More than 20 plain vector children.'});continue;}
 for(let count=2;count<=3;count++){
  function choose(start,chosen){
   if(chosen.length<count){for(let i=start;i<placements.length;i++)choose(i+1,[...chosen,placements[i]]);return;}
   const signature=JSON.stringify(chosen.map(p=>[p.character,p.matrix]));if(seen.has(signature))return;seen.add(signature);
   const parts=chosen.map((p,index)=>{
    const shape=shapes.get(p.character),m=[...p.matrix];m[4]/=20;m[5]/=20;
    const prefix=`s${sprite.character}d${p.depth}-`;
    const content=body(shape.xml).replace(/\bid="([^"]+)"/g,(_,id)=>`id="${prefix}${id}"`).replace(/url\(#([^)]*)\)/g,(_,id)=>`url(#${prefix}${id})`).replace(/(href=")#([^"]+)"/g,(_,a,id)=>`${a}#${prefix}${id}"`);
    const xml=svg(`<g transform="matrix(${m.join(' ')})"><g transform="translate(${shape.boundsTwips[0]/20} ${shape.boundsTwips[2]/20})">${content}</g></g>`);
    return{xml,bounds:bound(xml),shape};
   });
   if(parts.some(p=>!p.bounds))return;
   // Disconnected objects are useful only as separately authored components;
   // do not create arbitrary cross-character combinations across a whole pose.
   const connected=new Set([0]);let changed=true;while(changed){changed=false;parts.forEach((p,i)=>{if(!connected.has(i)&&[...connected].some(j=>overlap(p.bounds,parts[j].bounds))){connected.add(i);changed=true;}});}
   if(connected.size!==parts.length)return;
   const xml=svg(parts.map(p=>body(p.xml)).join('')),bounds=union(parts.map(p=>p.bounds));
   save(`sprite-${sprite.character}-f1-d${chosen.map(p=>p.depth).join('-')}`,xml,bounds,{character:sprite.character,kind:'original-display-list-composite',
    sourcePlacements:chosen,sourceShapeSha256:parts.map(p=>({character:p.shape.character,sha256:p.shape.svgSha256}))});
  }
  choose(0,[]);
 }
}
const finalPath=path.join(work,'candidates.json');
fs.writeFileSync(finalPath+'.tmp',JSON.stringify({revision:1,species:source.species,sourceSha256:source.sourceSha256,generatorSha256:source.generatorSha256,
 fingerprintPixels:64,sourceDisplayListSha256:sha(fs.readFileSync(input)),candidates:rows,skipped:[...source.skipped,...skipped]},null,2)+'\n');
fs.renameSync(finalPath+'.tmp',finalPath);
console.log(JSON.stringify({species:source.species,candidates:rows.length,skipped:skipped.length}));
