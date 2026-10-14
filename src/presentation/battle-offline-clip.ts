import type {SwfClipData,SwfClipJson,SwfSubMesh} from '@seer-pet-anim/swf-bundle';
/** Repository-owned decoder for the exported offline data format; no Unity parser or worker.
 * The published vendor types describe the interoperability contract only.
 */
function positive(value:number,label:string){if(!Number.isFinite(value)||value<=0)throw Error(`Invalid animation ${label}`);return value;}
function natural(value:number,label:string){if(!Number.isSafeInteger(value)||value<0)throw Error(`Invalid animation ${label}`);return value;}
function floats(values:number[],label:string){if(!Array.isArray(values)||values.some(value=>!Number.isFinite(value)))throw Error(`Invalid animation ${label}`);const output=new Float32Array(values);if(output.some(value=>!Number.isFinite(value)))throw Error(`Animation ${label} exceeds Float32 range`);return output;}
function submesh(mesh:SwfSubMesh,vertices:number,indices:number){
  natural(mesh.startVertex,'start vertex');natural(mesh.indexStart,'index start');natural(mesh.indexCount,'index count');
  if(mesh.startVertex>vertices||mesh.indexStart+mesh.indexCount>indices||mesh.indexCount%3)throw Error('Invalid animation submesh range');
  if(!mesh.material||typeof mesh.material.blendMode!=='string'||typeof mesh.material.shaderKind!=='string')throw Error('Invalid animation material');
  for(const key of ['srcBlend','dstBlend','blendOp','stencilId']as const)if(!Number.isFinite(mesh.material[key]))throw Error('Invalid animation material scalar');
  return mesh;
}
export function decodeOfflineBattleClip(meta:SwfClipJson,atlas:ImageBitmap,expected?:{species:number;width:number;height:number}):SwfClipData{
  natural(meta.petId,'species');natural(meta.atlasWidth,'atlas width');natural(meta.atlasHeight,'atlas height');positive(meta.atlasWidth,'atlas width');positive(meta.atlasHeight,'atlas height');
  if(expected&&(meta.petId!==expected.species||meta.atlasWidth!==expected.width||meta.atlasHeight!==expected.height))throw Error('Animation identity or dimensions differ from runtime index');
  if(atlas.width!==meta.atlasWidth||atlas.height!==meta.atlasHeight)throw Error('Animation bitmap dimensions differ from timeline');
  const pixelsPerUnit=positive(meta.pixelsPerUnit??100,'pixels per unit'),frameRate=positive(meta.frameRate,'frame rate');
  if(typeof meta.name!=='string'||!Array.isArray(meta.sequences)||!meta.sequences.some(s=>Array.isArray(s.frames)&&s.frames.length))throw Error('Invalid animation sequence list');
  const names=new Set<string>();
  const sequences=meta.sequences.map(sequence=>{
    if(typeof sequence.name!=='string'||names.has(sequence.name)||!Array.isArray(sequence.frames))throw Error('Invalid or duplicate animation sequence');names.add(sequence.name);
    return{name:sequence.name,frames:sequence.frames.map(frame=>{
      if(!Array.isArray(frame.labels)||frame.labels.some(label=>typeof label!=='string'))throw Error('Invalid animation labels');
      const positions=floats(frame.positions,'positions'),uvs=floats(frame.uvs,'UVs'),mulColors=floats(frame.mulColors,'multiply colors'),addColors=floats(frame.addColors,'add colors');
      const vertices=positions.length/2;
      if(positions.length%2||uvs.length!==positions.length||mulColors.length!==vertices*4||addColors.length!==vertices*4)throw Error('Invalid animation vertex attribute lengths');
      if(!Array.isArray(frame.indices)||frame.indices.length%3||frame.indices.some(i=>!Number.isSafeInteger(i)||i<0||i>=vertices||i>65535))throw Error('Invalid animation triangle indices');
      const indices=new Uint16Array(frame.indices);
      if(!Array.isArray(frame.subMeshes))throw Error('Invalid animation submesh list');
      return{labels:frame.labels,mesh:{positions,uvs,mulColors,addColors,indices,subMeshes:frame.subMeshes.map(mesh=>submesh(mesh,vertices,indices.length))}};
    })};
  });
  return{petId:meta.petId,name:meta.name,frameRate,pixelsPerUnit,atlasWidth:meta.atlasWidth,atlasHeight:meta.atlasHeight,atlas,sequences,materialWarnings:Array.isArray(meta.materialWarnings)?meta.materialWarnings.filter(warning=>typeof warning==='string'):[]};
}
export function disposeOfflineBattleClip(clip:SwfClipData){if(clip.atlas.width||clip.atlas.height)clip.atlas.close();clip.sequences=[];clip.materialWarnings=[];}
