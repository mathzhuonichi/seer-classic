import type {SwfClipData} from '@seer-pet-anim/swf-bundle';
import type {SwfPlayer} from '@seer-pet-anim/swf-renderer';
export type AnimationBounds={minX:number;maxX:number;minY:number;maxY:number};
type Sequence=SwfClipData['sequences'][number];
/** Margins in host pixels by which a canvas reaches beyond its host on each side. */
export type CanvasMargins={left:number;right:number;top:number;bottom:number};
/** Vertex extent of every frame of a sequence. */
function extentOf(sequence:Sequence):AnimationBounds{
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const {mesh:{positions}} of sequence.frames)for(let i=0;i<positions.length;i+=2){
    minX=Math.min(minX,positions[i]);maxX=Math.max(maxX,positions[i]);minY=Math.min(minY,positions[i+1]);maxY=Math.max(maxY,positions[i+1]);
  }
  return {minX,maxX,minY,maxY};
}
/** Vertex extent of every standby frame (or the first sequence when a clip has no standby). */
export function standbyMeshBounds(clip:Pick<SwfClipData,'sequences'>):AnimationBounds{
  return extentOf(clip.sequences.find(s=>s.name==='standby')||clip.sequences[0]);
}
/** Vertex extent of every frame of each sequence, by sequence name: how far the clip's own movement and effects travel. */
export function sequenceMeshBounds(clip:Pick<SwfClipData,'sequences'>):Map<string,AnimationBounds>{
  return new Map(clip.sequences.filter(s=>s.frames.length).map(s=>[s.name,extentOf(s)]));
}
/**
 * The margins a canvas needs beyond its width x height host to draw `bounds` under `transform`, each at most `limit`
 * (host pixels): an original move carries its creature to the opponent, far outside the creature's own box.
 */
export function canvasMargins(bounds:AnimationBounds,transform:ReturnType<typeof fixedAnimationTransform>,width:number,height:number,
  limit:{x:number;y:number}):CanvasMargins{
  const {position,scale}=transform;
  const xs=[position.x+bounds.minX*scale.x,position.x+bounds.maxX*scale.x],ys=[position.y+bounds.minY*scale.y,position.y+bounds.maxY*scale.y];
  const fit=(beyond:number,max:number)=>Math.min(Math.max(0,Math.ceil(beyond)),Math.floor(max));
  return {left:fit(-Math.min(...xs),limit.x),right:fit(Math.max(...xs)-width,limit.x),
    top:fit(-Math.min(...ys),limit.y),bottom:fit(Math.max(...ys)-height,limit.y)};
}
/** Layout dimensions deliberately exclude ancestor CSS transforms, including switch-in scale. */
export function fixedAnimationTransform(bounds:AnimationBounds,width:number,height:number,extent:number){
  const scale=Math.min(width,height)/1.7*extent/Math.max(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY);
  return {position:{x:width/2-(bounds.minX+bounds.maxX)/2*scale,y:height/2+(bounds.minY+bounds.maxY)/2*scale},scale:{x:scale,y:-scale}};
}
/** Read the renderer's first source pose, rather than atlas padding or transparent mesh rectangles.
 * Only this fixed registration is calibrated; subsequent source geometry remains unchanged.
 */
export function visibleStandbyBounds(player:SwfPlayer,meshBounds:AnimationBounds,width:number,height:number):AnimationBounds|null{
  const reference=fixedAnimationTransform(meshBounds,width,height,1);
  player.pause();player.setSequence('standby');player.gotoFrame(0);
  player.setFixedTransform(reference.position,reference.scale);player.draw();
  const canvas=player.getCanvas();
  const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
  if(!gl)return null;
  const pixels=new Uint8Array(canvas.width*canvas.height*4);
  gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  let minX=canvas.width,maxX=-1,minY=canvas.height,maxY=-1;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>=16){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  if(maxX<minX||maxY<minY)return null;
  const dpiX=canvas.width/width,dpiY=canvas.height/height,s=reference.scale.x;
  return {minX:(minX/dpiX-reference.position.x)/s,maxX:((maxX+1)/dpiX-reference.position.x)/s,minY:(reference.position.y-(height-minY/dpiY))/s,maxY:(reference.position.y-(height-(maxY+1)/dpiY))/s};
}
