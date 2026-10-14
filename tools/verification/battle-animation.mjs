/** Independently check offline clip identities, frame markers, arrays, and artifact hashes. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {parseNewseerManifest} from '../assets/yoo-pet-manifest.mjs';
const original=parseNewseerManifest(readFileSync('.cache/unity-swf-audit/PetAnimPackage.bytes'));
const sourceBundles=new Map(original.bundles.map(b=>[b.bundleName,b]));
const manifest=JSON.parse(readFileSync('public/battle-animations/manifest.json'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const covered=new Set();let frames=0,markers=0;
for(const [id,entry] of Object.entries(manifest.species)) {
  const raw=readFileSync('public'+entry.meta),png=readFileSync('public'+entry.atlas),clip=JSON.parse(entry.meta.endsWith('.gz')?gunzipSync(raw):raw);
  assert.equal(sha(raw),entry.metaSha256,`${id}: timeline hash`);assert.equal(sha(png),entry.atlasSha256,`${id}: atlas hash`);
  assert.equal(clip.petId,Number(id));
  assert.ok(Number.isFinite(clip.frameRate)&&clip.frameRate>0,`${id}: frame rate`);
  const bundle=sourceBundles.get('ppets_'+id);assert.ok(bundle,`${id}: official source index`);
  assert.equal(entry.sourceUrl,'https://newseer.61.com/Assets/StandaloneWindows64/PetAnimPackage/'+bundle.fileHash);
  const sourceFile='.cache/battle-animation/ppets_'+id;
  if(existsSync(sourceFile)){const source=readFileSync(sourceFile);assert.equal(source.length,Number(bundle.fileSize),`${id}: source bytes`);assert.equal(createHash('md5').update(source).digest('hex'),bundle.fileHash,`${id}: official source MD5`);assert.equal(sha(source),entry.sourceSha256,`${id}: source SHA-256`);}
  if(entry.atlas.endsWith('.png')){assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),entry.atlasWidth);assert.equal(png.readUInt32BE(20),entry.atlasHeight);}
  else {assert.equal(png.subarray(0,4).toString(),'RIFF');assert.equal(png.subarray(8,12).toString(),'WEBP');}
  assert.ok(clip.sequences.some(s=>s.name==='standby'),`${id}: standby`);
  for(const sequence of clip.sequences) {
    const indexed=entry.sequences.find(s=>s.name===sequence.name);assert.equal(indexed.frames,sequence.frames.length);
    const hit=sequence.frames.findIndex(f=>f.labels.includes('action_hit'));assert.equal(hit,indexed.hitFrame);
    if(hit>=0){markers++;assert.ok(hit>=0&&hit<sequence.frames.length);}
    for(const f of sequence.frames){frames++;assert.equal(f.positions.length%2,0);assert.ok(f.positions.every(Number.isFinite));assert.ok(f.indices.every(i=>Number.isInteger(i)&&i>=0&&i<f.positions.length/2));const vertices=f.positions.length/2;assert.equal(f.uvs.length,vertices*2);assert.equal(f.addColors.length,vertices*4);assert.equal(f.mulColors.length,vertices*4);assert.ok([...f.uvs,...f.addColors,...f.mulColors].every(Number.isFinite));for(const sub of f.subMeshes){assert.ok(Number.isInteger(sub.indexStart)&&sub.indexStart>=0);assert.ok(Number.isInteger(sub.indexCount)&&sub.indexCount>=0);assert.ok(sub.indexStart+sub.indexCount<=f.indices.length);assert.ok(sub.material&&typeof sub.material.shaderKind==='string');}}
  }
  covered.add(Number(id));
}
assert.equal(manifest.coverage.length,1483);
for(const row of manifest.coverage)assert.equal(row.status==='ready',covered.has(row.species));
for(let id=1;id<=30;id++)assert.ok(covered.has(id),`starter ${id}`);
const rei=manifest.species[70];assert.equal(rei.sequences.find(s=>s.name==='attack').hitFrame,22);assert.equal(rei.sequences.find(s=>s.name==='sa').hitFrame,24);
console.log(`Verified ${covered.size} original clips, ${frames} mesh frames, ${markers} hit markers, all artifact hashes and 1483 explicit coverage records.`);

const assetPython=process.env.SEER_ASSET_PYTHON||(existsSync('.cache/unity-swf-audit/venv/bin/python')?'.cache/unity-swf-audit/venv/bin/python':'python3');
const replay=spawnSync(assetPython,['tools/assets/optimize_battle_atlases.py','--verify'],{stdio:'inherit'});
assert.equal(replay.status,0,'Independent atlas pixel replay');
