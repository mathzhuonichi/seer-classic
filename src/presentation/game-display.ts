import {useLayoutEffect,useState,type RefObject} from 'react';

/** Keep the classic UI readable as the game frame grows, without bitmap scaling. */
export function gameDisplayLayout(viewportWidth:number,viewportHeight:number){
  const fittedHeight=Math.max(1,Math.min(viewportHeight,viewportWidth*650/960));
  const zoom=Math.max(1,fittedHeight/720);
  return {width:fittedHeight*960/650/zoom,height:fittedHeight/zoom,zoom};
}

/** CSS layout zoom only; character motion transforms must not change render density. */
export function getLayoutZoom(element:Element):number{
  const current=(element as Element&{currentCSSZoom?:number}).currentCSSZoom;
  if(typeof current==='number'&&Number.isFinite(current)&&current>0)return current;
  let zoom=1;
  for(let node:Element|null=element;node;node=node.parentElement){
    const value=getComputedStyle(node).zoom,parsed=Number.parseFloat(value);
    if(Number.isFinite(parsed)&&parsed>0)zoom*=value.endsWith('%')?parsed/100:parsed;
  }
  return zoom;
}

/** A dragged window's layout position inside its parent, kept fully visible. */
export interface WindowPosition { x: number; y: number }
type LayoutBox = { clientWidth: number; clientHeight: number };
export function clampWindow(position: WindowPosition, parent: LayoutBox, box: { offsetWidth: number; offsetHeight: number }): WindowPosition {
  const x = Math.max(0, Math.min(parent.clientWidth - box.offsetWidth, position.x)), y = Math.max(0, Math.min(parent.clientHeight - box.offsetHeight, position.y));
  return x === position.x && y === position.y ? position : { x, y };
}
/** A drag in progress: the pointer start and the window's layout offset, from rendered rectangles at one CSS zoom. */
export interface WindowDrag { x: number; y: number; left: number; top: number; zoom: number }
export const startWindowDrag = (pointer: { clientX: number; clientY: number }, box: { left: number; top: number }, parent: { left: number; top: number }, zoom: number): WindowDrag =>
  ({ x: pointer.clientX, y: pointer.clientY, left: (box.left - parent.left) / zoom, top: (box.top - parent.top) / zoom, zoom });
/** Pointer movement in rendered pixels becomes layout movement once, at the drag's zoom. */
export const dragWindow = (drag: WindowDrag, pointer: { clientX: number; clientY: number }, parent: LayoutBox, box: { offsetWidth: number; offsetHeight: number }) =>
  clampWindow({ x: drag.left + (pointer.clientX - drag.x) / drag.zoom, y: drag.top + (pointer.clientY - drag.y) / drag.zoom }, parent, box);

export function useGameDisplay(shell:RefObject<HTMLDivElement|null>){
  const [layout,setLayout]=useState<ReturnType<typeof gameDisplayLayout>>();
  useLayoutEffect(()=>{
    const viewport=shell.current?.parentElement;if(!viewport)return;
    const fit=()=>{const next=gameDisplayLayout(viewport.clientWidth,viewport.clientHeight);setLayout(old=>old&&old.width===next.width&&old.height===next.height&&old.zoom===next.zoom?old:next)};
    fit();const observer=new ResizeObserver(fit);observer.observe(viewport);
    return()=>observer.disconnect();
  },[shell]);
  return layout;
}
