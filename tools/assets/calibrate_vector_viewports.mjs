#!/usr/bin/env node
/** Measure the SVG's own rendered silhouette, independent of SWF/PNG coordinates. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2);
function value(flag,fallback){const index=args.indexOf(flag);return index<0?fallback:args[index+1]}
const modulePath=value('--playwright','/Users/chizhuoni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const executable=value('--browser','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const {chromium}=await import(modulePath);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const manifestFile=path.join(root,'public/portraits/vectors/manifest.json');
const manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
const start=args.indexOf('--ids');
const ids=start<0?Object.keys(manifest.portraits):args.slice(start+1).map(Number).map(String);
const browser=await chromium.launch({headless:true,executablePath:executable});
const page=await browser.newPage();
await page.setContent('<canvas></canvas>');
try {
  for(const id of ids){
    const item=manifest.portraits[id];if(!item)continue;
    const directory=path.join(root,'.cache/vector-export',id,'svg');
    const folder=(await fs.readdir(directory)).find(name=>name.startsWith('DefineSprite_'));
    const source=await fs.readFile(path.join(directory,folder,'1.svg'),'utf8');
    const bounds=await page.evaluate(async svg=>{
      const blob=new Blob([svg],{type:'image/svg+xml'}),url=URL.createObjectURL(blob);
      const image=new Image();image.src=url;await image.decode();
      const canvas=document.querySelector('canvas');canvas.width=Math.ceil(image.naturalWidth);canvas.height=Math.ceil(image.naturalHeight);
      const context=canvas.getContext('2d',{willReadFrequently:true});context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
      let x=canvas.width,y=canvas.height,right=0,bottom=0;
      for(let row=0;row<canvas.height;row++)for(let col=0;col<canvas.width;col++)if(pixels[(row*canvas.width+col)*4+3]){x=Math.min(x,col);y=Math.min(y,row);right=Math.max(right,col+1);bottom=Math.max(bottom,row+1)}
      URL.revokeObjectURL(url);if(right<=x||bottom<=y)throw new Error('Empty exported SVG');
      return {x:x-2,y:y-2,width:right-x+4,height:bottom-y+4};
    },source);
    const destination=path.join(root,'public',item.path);
    let svg=await fs.readFile(destination,'utf8');
    // FFDec exported at 2x: preserve its coordinates, expose unzoomed logical size.
    const width=bounds.width/2,height=bounds.height/2;
    svg=svg.replace(/viewBox="[^"]*"/,`viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}"`);
    svg=svg.replace(/(<svg\b[^>]*?)\bwidth="[^"]*"/,`$1width="${width}"`).replace(/(<svg\b[^>]*?)\bheight="[^"]*"/,`$1height="${height}"`);
    await fs.writeFile(destination,svg);
    item.width=width;item.height=height;item.bytes=Buffer.byteLength(svg);
    item.sha256=createHash('sha256').update(svg).digest('hex');
    item.bounds_method='Rendered exported SVG alpha in Chromium; two exported-coordinate pixels of viewport padding (one logical vector unit).';
    item.svg_bounds=bounds;delete item.viewport_pending;
    console.log(`Calibrated ${id}: ${width} x ${height}`);
  }
  await fs.writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');
} finally {await browser.close()}
