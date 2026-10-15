#!/usr/bin/env node
/** Separate vector bodies with bitmap effects from bitmap main-body sources. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const args=process.argv.slice(2),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function opt(key,fallback){const i=args.indexOf(key);return i<0?fallback:args[i+1]}
const base=path.resolve(opt('--cache',path.join(root,'.cache/portrait-v44')));
const moduleFile=path.resolve(opt('--resvg',path.join(base,'runtime/node_modules/@resvg/resvg-js/index.js')));
const {Resvg}=await import(pathToFileURL(moduleFile).href),options={font:{loadSystemFonts:false}};
const raw=path.join(base,'full/.cache/vector-export'),out=path.join(base,'mixed-classification');
fs.mkdirSync(out,{recursive:true});
const reportFile=path.join(out,'report.json');
const report=fs.existsSync(reportFile)?JSON.parse(fs.readFileSync(reportFile,'utf8')):{};
const selected=opt('--ids',null)?.split(',');
for(const sid of selected??fs.readdirSync(raw)){
 if(report[sid]&&!selected)continue;
 const directory=path.join(raw,sid,'svg');if(!fs.existsSync(directory))continue;
 const folder=fs.readdirSync(directory).find(name=>name.startsWith('DefineSprite_'));if(!folder)continue;
 const file=path.join(directory,folder,'1.svg');if(!fs.existsSync(file))continue;
 let source=fs.readFileSync(file,'utf8');if(!source.includes('<image '))continue;
 const bbox=new Resvg(source,options).getBBox();if(!bbox)throw Error(`No visible geometry: ${sid}`);
 const left=Math.floor(bbox.x)-64,top=Math.floor(bbox.y)-64,width=Math.ceil(bbox.width)+128,height=Math.ceil(bbox.height)+128;
 if(width*height>32000000)throw Error(`Mixed source exceeds bounded render: ${sid}`);
 source=source.replace(/<svg\b[^>]*>/,tag=>tag.replace(/\s(?:viewBox|width|height)="[^"]*"/g,'').slice(0,-1)+` viewBox="${left} ${top} ${width} ${height}" width="${width}" height="${height}">`);
 const vector=source.replace(/<image\b[^>]*\/>/g,''),all=new Resvg(source,options).render(),only=new Resvg(vector,options).render();
 const ap=all.pixels,vp=only.pixels;let fullCount=0,vectorCount=0;
 for(let i=3;i<ap.length;i+=4)if(ap[i]>=16){fullCount++;if(vp[i]>=16)vectorCount++}
 const nativeSizes=[...source.matchAll(/<image\b([^>]*)\/>/g)].map(match=>[Number(match[1].match(/\bwidth="([^"]+)"/)?.[1]),Number(match[1].match(/\bheight="([^"]+)"/)?.[1])]);
 report[sid]={vectorAlphaCoverage:vectorCount/fullCount,fullCount,vectorCount,nativeSizes,paths:(source.match(/<path\b/g)||[]).length,
   interpretation:vectorCount/fullCount<.5?'Bitmap main-body candidate; requires visual confirmation.':'Vector body with bitmap effects candidate; requires visual confirmation.'};
 fs.writeFileSync(path.join(out,sid+'-all.png'),all.asPng());fs.writeFileSync(path.join(out,sid+'-vector.png'),only.asPng());
 fs.writeFileSync(reportFile+'.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(reportFile+'.tmp',reportFile);
 console.log(`${sid}: vector alpha ${(100*vectorCount/fullCount).toFixed(2)}%; ${JSON.stringify(nativeSizes)}`);
}
