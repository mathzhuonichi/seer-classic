/** Bit-for-bit parity with the pinned vendor's offline typed conversion, without browser rendering. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import {loadSwfClipPackage} from '../../node_modules/@seer-pet-anim/swf-bundle/dist/clip-data.js';
const code=stripTypeScriptTypes(readFileSync('src/features/battle/battle-offline-clip.ts','utf8'));
const {decodeOfflineBattleClip,disposeOfflineBattleClip}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
globalThis.ImageBitmap=class{constructor(width,height){this.width=width;this.height=height;this.closes=0;}close(){this.width=0;this.height=0;this.closes++;}};
const bytes=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength);
const rows=[];
let sample;
for(const id of [1,6,70,431,502]){
 const meta=JSON.parse(gunzipSync(readFileSync(`public/battle-animations/${id}.json.gz`))),expected={species:id,width:meta.atlasWidth,height:meta.atlasHeight};
 const original=await loadSwfClipPackage(meta,new ImageBitmap(meta.atlasWidth,meta.atlasHeight),{atlasPrepared:true});
 const started=performance.now(),actual=decodeOfflineBattleClip(meta,new ImageBitmap(meta.atlasWidth,meta.atlasHeight),expected),ms=performance.now()-started;
 const digest=createHash('sha256');let arrays=0,typedBytes=0;
 assert.equal(actual.pixelsPerUnit,original.pixelsPerUnit);assert.equal(actual.frameRate,original.frameRate);assert.equal(actual.sequences.length,original.sequences.length);
 for(let s=0;s<actual.sequences.length;s++){const sequence=actual.sequences[s],reference=original.sequences[s];assert.equal(sequence.name,reference.name);assert.equal(sequence.frames.length,reference.frames.length);for(let f=0;f<sequence.frames.length;f++){const frame=sequence.frames[f],source=reference.frames[f];assert.deepEqual(frame.labels,source.labels);assert.deepEqual(frame.mesh.subMeshes,source.mesh.subMeshes);for(const name of ['positions','uvs','mulColors','addColors','indices']){assert.deepEqual(bytes(frame.mesh[name]),bytes(source.mesh[name]),`${id}/${sequence.name}/${f}/${name}`);digest.update(bytes(frame.mesh[name]));arrays++;typedBytes+=frame.mesh[name].byteLength;}}}
 rows.push({species:id,decodeMs:ms,arrays,typedBytes,sha256:digest.digest('hex')});
 disposeOfflineBattleClip(actual);disposeOfflineBattleClip(actual);assert.equal(actual.atlas.closes,1);assert.equal(actual.sequences.length,0);sample??=meta;
}
const bitmap=()=>new ImageBitmap(sample.atlasWidth,sample.atlasHeight),mutate=fn=>{const m=structuredClone(sample);fn(m);return m;};
assert.throws(()=>decodeOfflineBattleClip(sample,bitmap(),{species:999,width:sample.atlasWidth,height:sample.atlasHeight}));
assert.throws(()=>decodeOfflineBattleClip(sample,new ImageBitmap(1,1)));
assert.throws(()=>decodeOfflineBattleClip(mutate(m=>{m.frameRate=NaN;}),bitmap()));
assert.throws(()=>decodeOfflineBattleClip(mutate(m=>{m.sequences[0].frames[0].positions.push(1);}),bitmap()));
assert.throws(()=>decodeOfflineBattleClip(mutate(m=>{m.sequences[0].frames[0].uvs[0]=Infinity;}),bitmap()));
assert.throws(()=>decodeOfflineBattleClip(mutate(m=>{m.sequences[0].frames[0].indices[0]=65536;}),bitmap()));
assert.throws(()=>decodeOfflineBattleClip(mutate(m=>{m.sequences[0].frames[0].subMeshes[0].indexCount=999999;}),bitmap()));
const defaulted=decodeOfflineBattleClip(mutate(m=>{delete m.pixelsPerUnit;}),bitmap());assert.equal(defaulted.pixelsPerUnit,100);disposeOfflineBattleClip(defaulted);
let validatedCatalog=0;
if(process.argv.includes('--all'))for(const file of readdirSync('public/battle-animations').filter(file=>/^\d+\.json\.gz$/.test(file))){const meta=JSON.parse(gunzipSync(readFileSync('public/battle-animations/'+file)));const clip=decodeOfflineBattleClip(meta,new ImageBitmap(meta.atlasWidth,meta.atlasHeight),{species:Number(file.split('.')[0]),width:meta.atlasWidth,height:meta.atlasHeight});disposeOfflineBattleClip(clip);validatedCatalog++;}
mkdirSync('artifacts/battle-runtime-v22',{recursive:true});writeFileSync('artifacts/battle-runtime-v22/offline-decoder-parity.json',JSON.stringify({rows,invalidFixtures:7,pixelsPerUnitDefault:100,validatedCatalog},null,2)+'\n');
console.log(`Offline decoder bit parity passed five full original clips, ${rows.reduce((n,r)=>n+r.arrays,0)} typed arrays; invalid identity/dimensions/scalars/geometry rejected; ${validatedCatalog} additional catalog entries validated.`);
