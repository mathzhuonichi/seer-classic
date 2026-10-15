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
