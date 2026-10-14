/** Run the production fixed-transform helper against representative source registrations. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {stripTypeScriptTypes} from 'node:module';
const code=stripTypeScriptTypes(readFileSync('src/presentation/battle-animation-registration.ts','utf8'));
const {fixedAnimationTransform,visibleStandbyBounds}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
for(const id of [1,6,70,502]){
 const clip=JSON.parse(gunzipSync(readFileSync(`public/battle-animations/${id}.json.gz`))),standby=clip.sequences.find(s=>s.name==='standby');const xs=standby.frames.flatMap(f=>f.positions.filter((_,i)=>i%2===0)),ys=standby.frames.flatMap(f=>f.positions.filter((_,i)=>i%2===1));const bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
 const t=fixedAnimationTransform(bounds,476,476,.9);const midpoint={x:(bounds.minX+bounds.maxX)/2,y:(bounds.minY+bounds.maxY)/2};assert.ok(Math.abs(midpoint.x*t.scale.x+t.position.x-238)<1e-8);assert.ok(Math.abs(midpoint.y*t.scale.y+t.position.y-238)<1e-8);
 assert.ok(Math.abs(Math.max(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY)*t.scale.x-476/1.7*.9)<1e-8);
}
// Mock a Retina readback of one opaque rectangle in the reference registration.
const width=170,height=170,pixelWidth=340,pixelHeight=340;let applied;
const gl={RGBA:1,UNSIGNED_BYTE:2,readPixels(_x,_y,_w,_h,_rgba,_type,pixels){for(let y=80;y<240;y++)for(let x=120;x<220;x++)pixels[(y*pixelWidth+x)*4+3]=255;}};
const canvas={width:pixelWidth,height:pixelHeight,getContext(){return gl;}};
const player={pause(){},setSequence(){},gotoFrame(){},setFixedTransform(position,scale){applied={position,scale};},draw(){},getCanvas(){return canvas;}};
const visible=visibleStandbyBounds(player,{minX:-1,maxX:1,minY:-1,maxY:1},width,height);
assert.deepEqual(visible,{minX:-.5,maxX:.5,minY:-.9,maxY:.7});
const t=fixedAnimationTransform(visible,width,height,.9);assert.equal((visible.minX+visible.maxX)/2*t.scale.x+t.position.x,width/2);assert.ok(Math.abs((visible.minY+visible.maxY)/2*t.scale.y+t.position.y-height/2)<1e-8);
console.log('Registration passed source species1/6/70/502 centering and silhouetteextent, plus Retinaalpha-readback orientation.');
