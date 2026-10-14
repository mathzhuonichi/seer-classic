/** Recover original Unity pet mesh timelines. Parser algorithm: Nattsu39/seer-pet-viewer, MIT.
 * Run from repository root with Node >=22: node tools/assets/export_battle_animation.mjs
 * Downloads cached official resources, exports offline PNG + JSON, records failures explicitly.
 */
import {registerHooks} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {deflateSync,gzipSync} from 'node:zlib';
import {parseNewseerManifest} from './yoo-pet-manifest.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const output='public/battle-animations',cache='.cache/battle-animation';mkdirSync(output,{recursive:true});mkdirSync(cache,{recursive:true});
const source=JSON.parse(readFileSync('.cache/unity-swf-audit/pet-manifest-source.json'));
const bytes=readFileSync('.cache/unity-swf-audit/PetAnimPackage.bytes');
if(sha(bytes)!==source.sha256)throw Error('Cached manifest hash mismatch');
const manifest=parseNewseerManifest(bytes), index=new Map(manifest.bundles.map(x=>[x.bundleName,x]));
const catalog=JSON.parse(readFileSync('data/gamedata.json')).species.map(x=>x.id);
const bossIds=readdirSync('data/bosses').filter(x=>x.endsWith('.json')).flatMap(file=>JSON.parse(readFileSync('data/bosses/'+file)).team.map(x=>x.species));
const argumentsIds=process.argv.slice(2);const requested=argumentsIds[0]==='--all'?catalog:argumentsIds[0]==='--playable'?JSON.parse(readFileSync('.cache/gamefeel-resources/playable-animation-targets.json')).target:argumentsIds.length?argumentsIds.map(Number):[...new Set([...Array.from({length:30},(_,i)=>i+1),70,...bossIds])];
const record=existsSync(output+'/manifest.json')?JSON.parse(readFileSync(output+'/manifest.json')):{format:1,source,parser:'@seer-pet-anim/swf-bundle@0.3.1',species:{}};
const save=()=>{record.coverage=catalog.map(id=>({species:id,status:record.species[id]?'ready':record.failures?.[id]?'failed':'not-exported',reason:record.failures?.[id]}));writeFileSync(output+'/manifest.json.tmp',JSON.stringify(record,null,2)+'\n');renameSync(output+'/manifest.json.tmp',output+'/manifest.json');const species=Object.fromEntries(Object.entries(record.species).map(([id,s])=>[id,{meta:s.meta,atlas:s.atlas,frameRate:s.frameRate,atlasWidth:s.atlasWidth,atlasHeight:s.atlasHeight,sequences:s.sequences}]));writeFileSync(output+'/runtime-index.json.tmp',JSON.stringify({species})+'\n');renameSync(output+'/runtime-index.json.tmp',output+'/runtime-index.json');};
record.failures??={};record.exportTargets=requested;record.sourceSizeCapBytes=8*1024*1024;record.sourceSizeExceptions={431:'Independently decoded official Luerdini source, 9002204 bytes; 8192-square atlas requires bounded sequential parsing.',502:'Previously recovered Dorag source, 9377161 bytes; retained for playable encounter coverage.'};
async function bundle(name){const b=index.get(name);if(!b)throw Error('Missing official bundle '+name);if(Number(b.fileSize)>8*1024*1024&&!['ppets_431','ppets_502'].includes(name))throw Error('Official bundle exceeds 8 MiB export cap');const file=cache+'/'+name;if(!existsSync(file)){const response=await fetch('https://newseer.61.com/Assets/StandaloneWindows64/PetAnimPackage/'+b.fileHash,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Official CDN HTTP '+response.status);writeFileSync(file+'.tmp',new Uint8Array(await response.arrayBuffer()));renameSync(file+'.tmp',file);}const raw=readFileSync(file);if(raw.length!==Number(b.fileSize))throw Error('Bundle size mismatch');const md5=createHash('md5').update(raw).digest('hex');if(md5!==b.fileHash)throw Error('Bundle MD5 mismatch: '+name);if(raw.subarray(0,7).toString()!=='UnityFS')throw Error('Bundle UnityFS signature mismatch');return raw;}
// PNG encoder preserving RGBA rows and alpha; no rendering or pose synthesis.
const crc=(bytes)=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
function png(w,h,rgba){const chunk=(name,data)=>{const type=Buffer.from(name),length=Buffer.alloc(4),check=Buffer.alloc(4);length.writeUInt32BE(data.length);check.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([length,type,data,check]);};const header=Buffer.alloc(13);header.writeUInt32BE(w,0);header.writeUInt32BE(h,4);header[8]=8;header[9]=6;const rows=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++)rows.set(rgba.subarray(y*w*4,(y+1)*w*4),y*(w*4+1)+1);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
const hook=registerHooks({resolve(specifier,context,normal){try{return normal(specifier,context);}catch(error){if(!context.parentURL?.includes('/@arkntools/unity-js/')||!specifier.startsWith('.'))throw error;for(const suffix of ['.js','/index.js'])try{return normal(specifier+suffix,context);}catch{}throw error;}}});
try{
 const unity=await import('@arkntools/unity-js');
 const {parseBundleCore}=await import('@seer-pet-anim/swf-bundle/parse');
 const {MaterialResolver}=await import('../../node_modules/@seer-pet-anim/swf-bundle/dist/material.js');
 const {parsedBundleToJson}=await import('../../node_modules/@seer-pet-anim/swf-bundle/dist/clip-data.js');
 const resolver=new MaterialResolver();const sharedName='petanimpackage_share_assets_flashtools_resources_materials_generated.bundle';const sharedRaw=await bundle(sharedName);const shared=await unity.loadAssetBundle(Uint8Array.from(sharedRaw).buffer);resolver.addFromBundle(shared.objects.filter(x=>x.type===unity.AssetType.Material));record.sharedMaterialSha256=sha(sharedRaw);
 // Prefetch in small groups; parse each bundle sequentially to bound atlas memory.
 for(let start=0;start<requested.length;start+=4){const group=requested.slice(start,start+4).filter(id=>!record.species[id]);const raws=await Promise.allSettled(group.map(id=>bundle('ppets_'+id)));for(let i=0;i<group.length;i++){const id=group[i];try{if(raws[i].status==='rejected')throw raws[i].reason;const raw=raws[i].value,parsed=await parseBundleCore(Uint8Array.from(raw),'ppets_'+id,resolver);if(parsed.petId!==id||!parsed.atlasPixels)throw Error('Invalid clip identity or atlas');const meta=parsedBundleToJson(parsed),atlas=png(parsed.atlasWidth,parsed.atlasHeight,parsed.atlasPixels.rgba);const metaBytes=gzipSync(Buffer.from(JSON.stringify(meta)));writeFileSync(output+'/'+id+'.json.gz.tmp',metaBytes);renameSync(output+'/'+id+'.json.gz.tmp',output+'/'+id+'.json.gz');writeFileSync(output+'/'+id+'.png.tmp',atlas);renameSync(output+'/'+id+'.png.tmp',output+'/'+id+'.png');record.species[id]={meta:'/battle-animations/'+id+'.json.gz',atlas:'/battle-animations/'+id+'.png',sourceUrl:'https://newseer.61.com/Assets/StandaloneWindows64/PetAnimPackage/'+index.get('ppets_'+id).fileHash,sourceSha256:sha(raw),sourceFileHash:index.get('ppets_'+id).fileHash,sourceBytes:raw.length,atlasRgbaSha256:sha(parsed.atlasPixels.rgba),metaSha256:sha(metaBytes),atlasSha256:sha(atlas),frameRate:parsed.frameRate,atlasWidth:parsed.atlasWidth,atlasHeight:parsed.atlasHeight,sequences:parsed.sequences.map(s=>({name:s.name,frames:s.frames.length,hitFrame:s.frames.findIndex(f=>f.labels.includes('action_hit'))})),warnings:parsed.materialWarnings};delete record.failures[id];console.log('ready',id,atlas.length);}catch(error){record.failures[id]=String(error.message);console.log('failed',id,error.message);}save();}}
}finally{hook.deregister();save();}

const assetPython=process.env.SEER_ASSET_PYTHON||(existsSync('.cache/unity-swf-audit/venv/bin/python')?'.cache/unity-swf-audit/venv/bin/python':'python3');
const optimized=spawnSync(assetPython,['tools/assets/optimize_battle_atlases.py'],{stdio:'inherit'});
if(optimized.status!==0)throw Error('Lossless atlas optimization failed; exported PNG assets remain available');

const incomplete=requested.filter(id=>!record.species[id]);if(incomplete.length)throw Error('Requested official clips remain unexported: '+incomplete.join(', '));
