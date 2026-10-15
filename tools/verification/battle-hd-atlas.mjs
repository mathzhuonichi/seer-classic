/** Verify a remapped clip against the installed renderer's real UV/tile helpers.
 * node tools/verification/battle-hd-atlas.mjs source.json.gz remapped.json layout-audit.json [report.json]
 * No browser GPU, source-vector matching, or image-fidelity claim is made here.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {insetQuadUvs,planAtlasTileGrid,sliceQuadAcrossTiles,insetTileSliceQuadUvs} from '@seer-pet-anim/swf-bundle';

const [sourceFile,remappedFile,layoutFile,outputFile]=process.argv.slice(2);
assert(sourceFile&&remappedFile&&layoutFile,'Expected original meta, remapped meta, and layout report paths');
const read=file=>JSON.parse(file.endsWith('.gz')?gunzipSync(fs.readFileSync(file)):fs.readFileSync(file,'utf8'));
const original=read(sourceFile),current=read(remappedFile),layout=read(layoutFile).layout;
const checks=[];
const check=(name,run)=>{run();checks.push(name);};
const near=(a,b,tolerance=1e-6)=>assert(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const bounds=quad=>[Math.min(...quad.filter((_,i)=>i%2===0)),Math.min(...quad.filter((_,i)=>i%2===1)),Math.max(...quad.filter((_,i)=>i%2===0)),Math.max(...quad.filter((_,i)=>i%2===1))];
const area=quad=>Math.abs(quad.reduce((sum,v,i)=>i%2?sum:sum+v*quad[(i+3)%8]-quad[(i+2)%8]*quad[i+1],0)/2);
const findPlacement=quad=>{const b=bounds(quad);const matches=layout.placements.filter(p=>p.sourceUvBounds.every((x,i)=>Math.abs(x-b[i])<1e-9));assert.equal(matches.length,1);return matches[0];};
let occurrences=0,slices=0,crossingQuads=0,maxAreaError=0;
check('All non-UV metadata is unchanged',()=>{
  const copy=structuredClone(current);copy.atlasWidth=original.atlasWidth;copy.atlasHeight=original.atlasHeight;
  for(let s=0;s<copy.sequences.length;s++)for(let f=0;f<copy.sequences[s].frames.length;f++)copy.sequences[s].frames[f].uvs=original.sequences[s].frames[f].uvs;
  assert.deepEqual(copy,original);assert.equal(current.atlasWidth,layout.width);assert.equal(current.atlasHeight,layout.height);
  assert.equal(layout.paddingMode,'extrude-edge-rgba');assert(layout.padding>=2);
});
check('Installed non-tiled half-texel inset reaches the first and last image pixel centers',()=>{
  for(let s=0;s<current.sequences.length;s++)for(let f=0;f<current.sequences[s].frames.length;f++){
    const old=original.sequences[s].frames[f],frame=current.sequences[s].frames[f];
    for(let q=0;q<frame.uvs.length;q+=8){
      const p=findPlacement(old.uvs.slice(q,q+8)),uvs=Array.from(Float32Array.from(frame.uvs.slice(q,q+8))),b=bounds(uvs);
      // The renderer's tile slicer assumes its original clockwise UV corner order.
      assert.deepEqual(old.uvs.slice(q,q+8),[p.sourceUvBounds[0],p.sourceUvBounds[3],p.sourceUvBounds[2],p.sourceUvBounds[3],p.sourceUvBounds[2],p.sourceUvBounds[1],p.sourceUvBounds[0],p.sourceUvBounds[1]]);
      near(b[0]*(layout.width-1),p.x-.5,.001);near(b[2]*(layout.width-1),p.x+p.width-.5,.001);
      near(b[1]*(layout.height-1),p.y-.5,.001);near(b[3]*(layout.height-1),p.y+p.height-.5,.001);
      insetQuadUvs(uvs,0,layout.width,layout.height);
      const inset=bounds(uvs);
      near(inset[0]*(layout.width-1),p.x-.5/layout.width,.001);
      near(inset[2]*(layout.width-1),p.x+p.width-1+.5/layout.width,.001);
      near(inset[1]*(layout.height-1),p.y-.5/layout.height,.001);
      near(inset[3]*(layout.height-1),p.y+p.height-1+.5/layout.height,.001);
      occurrences++;
    }
  }
});
check('Forced 4096-pixel tiling preserves quad area, color interpolation, and valid texture coordinates',()=>{
  const plan=planAtlasTileGrid(layout.width,layout.height,4096);assert(plan,'This verification fixture must require tiling');
  assert(plan.tiles.every(tile=>tile.width<=4096&&tile.height<=4096));
  for(const sequence of current.sequences)for(const frame of sequence.frames)for(let q=0;q<frame.uvs.length;q+=8){
    const parts=sliceQuadAcrossTiles(frame.positions,Float32Array.from(frame.uvs),q,layout.width,layout.height,plan,frame.mulColors,frame.addColors,q/2,{expandGeometryAtSeams:false});
    assert(parts.length>=1);if(parts.length>1)crossingQuads++;slices+=parts.length;
    const oldArea=area(frame.positions.slice(q,q+8)),newArea=parts.reduce((sum,part)=>sum+area(part.positions),0);
    maxAreaError=Math.max(maxAreaError,Math.abs(oldArea-newArea));near(oldArea,newArea,1e-5*Math.max(1,oldArea));
    for(const part of parts){
      const tile=plan.tiles[part.tileIndex],uvs=[...part.uvs];
      insetTileSliceQuadUvs(uvs,0,tile,layout.width,layout.height,part.clipPxMin,part.clipPxMax,part.clipPyMin,part.clipPyMax);
      assert(uvs.every(value=>Number.isFinite(value)&&value>=-1e-7&&value<=1+1e-7));
      for(const key of ['mulColors','addColors'])for(let channel=0;channel<4;channel++){
        const sourceValues=Array.from({length:4},(_,v)=>frame[key][(q/2+v)*4+channel]);
        assert.equal(new Set(sourceValues).size,1,'Original SWF color is constant within each quad');
        for(let v=0;v<4;v++)near(part[key][v*4+channel],sourceValues[0]);
      }
    }
  }
  assert(crossingQuads>0,'The real prototype must exercise a tile seam');
});
check('RGBA edge extrusion makes uninset tile boundaries and inset image boundaries sample the same edge color',()=>{
  // Procedural RGBA cell: the outer two pixels copy the closest content pixel.
  // Bilinear sampling at either boundary therefore returns its exact edge RGBA.
  for(const width of [1,2,13,732]){
    const rgba=x=>[20+x%131,75+x%173,183-x%113,x%2?123:211];
    const texel=x=>rgba(Math.max(0,Math.min(width-1,x)));
    const sample=x=>{const lo=Math.floor(x),t=x-lo;return texel(lo).map((v,c)=>v*(1-t)+texel(lo+1)[c]*t);};
    for(const [coordinate,expected] of [[-.5,rgba(0)],[-.5/layout.width,rgba(0)],[width-.5,rgba(width-1)],[width-1+.5/layout.width,rgba(width-1)]])sample(coordinate).forEach((value,i)=>near(value,expected[i]));
  }
});
const bytes=layout.width*layout.height*4;
const report={passed:true,checks,source:sourceFile,remapped:remappedFile,layout:layoutFile,quadOccurrences:occurrences,tiledSlices:slices,crossingQuads,maxTiledAreaError:maxAreaError,
  atlasPixels:[layout.width,layout.height],resourceEstimate:{oneAtlasRgbaBytes:bytes,twoActorsSteadyGpuTextureBytes:2*bytes,twoActorsConservativeCpuPlusGpuMountBytes:6*bytes},
  limitations:['No browser GPU upload or visual validation is performed.','RGBA edge extrusion is a required contract; the image generator must independently verify the padding pixels.','The memory estimate excludes geometry, decoded JSON, compressed blobs, render targets, driver overhead, and tile overlap; it is not a measured peak.','Normal-material seam expansion remains renderer-owned; area is checked with its non-overlap mode used by masks/grab.']};
if(outputFile){fs.mkdirSync(path.dirname(outputFile),{recursive:true});fs.writeFileSync(outputFile,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({passed:true,checks:checks.length,quadOccurrences:occurrences,tiledSlices:slices,crossingQuads,maxTiledAreaError:maxAreaError,atlasMiB:bytes/1024**2},null,2));
