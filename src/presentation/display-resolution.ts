import {getLayoutZoom} from './game-display.ts';

const deviceRatio=()=>Number.isFinite(window.devicePixelRatio)&&window.devicePixelRatio>0?window.devicePixelRatio:1;

/** CSS zoom changes layout density; transient CSS transforms do not. */
export function getDisplayResolution(element:Element){return deviceRatio()*getLayoutZoom(element);}

/** A DPR change need not resize the element, and CSS zoom need not change its client size. */
export function observeDisplayResolution(element:Element,onChange:(resolution:number)=>void){
  let last=getDisplayResolution(element),watchedRatio=deviceRatio(),frame:number|undefined,disposed=false;
  let query:MediaQueryList;
  const check=()=>{frame=undefined;if(disposed)return;const ratio=deviceRatio();if(ratio!==watchedRatio){unwatch();watchedRatio=ratio;watch();}const next=getDisplayResolution(element);if(next!==last){last=next;onChange(next);}};
  const queue=()=>{if(!disposed&&frame===undefined)frame=requestAnimationFrame(check);};
  const unwatch=()=>{if(query?.removeEventListener)query.removeEventListener('change',queue);else query?.removeListener(queue);};
  const watch=()=>{query=window.matchMedia(`(resolution: ${watchedRatio}dppx)`);if(query.addEventListener)query.addEventListener('change',queue);else query.addListener(queue);};
  watch();window.addEventListener('resize',queue);
  const observer=new MutationObserver(queue);
  for(let ancestor:Element|null=element;ancestor;ancestor=ancestor.parentElement)observer.observe(ancestor,{attributes:true,attributeFilter:['style','class']});
  return()=>{disposed=true;unwatch();window.removeEventListener('resize',queue);observer.disconnect();if(frame!==undefined)cancelAnimationFrame(frame);};
}
