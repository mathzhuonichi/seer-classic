import type {SwfPlayer} from '@seer-pet-anim/swf-renderer';
export type AnimationBounds={minX:number;maxX:number;minY:number;maxY:number};
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
