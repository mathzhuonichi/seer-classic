import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {getLayoutZoom} from '../presentation/game-display.ts';

export interface ItemTooltipProps {
  id:string; open:boolean; anchor:HTMLElement|null; name:string; description?:string; children?:ReactNode;
}

/** A viewport-bounded tooltip outside scrollable game panels. */
export default function ItemTooltip({id,open,anchor,name,description,children}:ItemTooltipProps) {
  const ref=useRef<HTMLDivElement>(null),[position,setPosition]=useState({left:8,top:8,zoom:1});
  useLayoutEffect(()=>{
    if(!open||!anchor)return;
    const place=()=>{
      const box=anchor.getBoundingClientRect(),zoom=getLayoutZoom(anchor),margin=8*zoom;
      const width=(ref.current?.offsetWidth??240)*zoom,height=(ref.current?.offsetHeight??90)*zoom;
      const left=Math.max(margin,Math.min(box.left,window.innerWidth-width-margin));
      const below=box.bottom+7*zoom,top=below+height<=window.innerHeight-margin?below:Math.max(margin,box.top-height-7*zoom);
      setPosition({left:left/zoom,top:top/zoom,zoom});
    };
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    const host=anchor.closest('.game-shell'),observer=new MutationObserver(place);
    if(host)observer.observe(host,{attributes:true,attributeFilter:['style']});
    return()=>{observer.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true)};
  },[open,anchor,name,description,children,position.zoom]);
  if(!open||typeof document==='undefined')return null;
  return createPortal(<div ref={ref} id={id} role="tooltip" className="item-tooltip" style={{...position,maxWidth:`min(280px,calc(${100/position.zoom}vw - 16px))`,maxHeight:`calc(${100/position.zoom}vh - 16px)`}}><strong>{name}</strong>{description&&<p>{description}</p>}{children&&<div className="item-tooltip-extra">{children}</div>}</div>,document.body);
}
