export interface GroundPoint { x:number; y:number }

/** Stop on the near side of a contact in screen space, never past its feet. */
export function contactApproachPoint(from:GroundPoint,contact:GroundPoint,scene:{width:number;height:number},clearance:number):GroundPoint {
  const dx=(from.x-contact.x)*scene.width/100;
  const dy=(from.y-contact.y)*scene.height/100;
  const distance=Math.hypot(dx,dy);
  if(distance<=clearance||distance===0)return {...from};
  const fraction=clearance/distance;
  return {x:contact.x+(from.x-contact.x)*fraction,y:contact.y+(from.y-contact.y)*fraction};
}
