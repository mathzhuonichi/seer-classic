import {useEffect,useId,useLayoutEffect,useRef,useState,type FocusEvent,type ReactNode,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {getLayoutZoom} from '../game-display.ts';
import './HoverCard.css';

/** Focus from the keyboard, not from a click. A WebView without :focus-visible (WebKit before Safari 15.4) throws, and counts any focus. */
function keyboardFocus(element:Element) {
  try {return element.matches(':focus-visible');} catch {return true;}
}

export interface HoverCardProps {id:string;open:boolean;anchor:RefObject<HTMLElement|null>}

/**
 * The card of one control, such as an item tile or a skill: it opens while the pointer is over the control or the keyboard focus
 * is on it, but not for the focus a click gives, and a press closes it, so it never stands in for the click. Escape closes it
 * before the picker or window around it, wherever the focus is. Spread `trigger` on the control and `card` on its HoverCard.
 * Pointer events, not mouse events: React drops mouseenter on a disabled button, whose card (a used-up skill) still opens.
 */
export function useHoverCard<T extends HTMLElement>() {
  const ref=useRef<T>(null),id=useId(),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false);
  const open=hovered||focused;
  useEffect(()=>{
    if(!open)return;
    const dismiss=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();setHovered(false);setFocused(false)}};
    document.addEventListener('keydown',dismiss,true);return()=>document.removeEventListener('keydown',dismiss,true);
  },[open]);
  const trigger={
    ref,'aria-describedby':open?id:undefined,
    onPointerEnter:()=>setHovered(true),onPointerLeave:()=>setHovered(false),onPointerDown:()=>{setHovered(false);setFocused(false)},
    onFocus:(event:FocusEvent<T>)=>setFocused(keyboardFocus(event.currentTarget)),onBlur:()=>setFocused(false),
  };
  const card:HoverCardProps={id,open,anchor:ref};
  return {trigger,card};
}

/** The control's box in viewport pixels. WebKit reports the box of an element under a CSS zoom in its own zoomed pixels, Chrome in viewport pixels. */
function viewportBox(control:HTMLElement,zoom:number) {
  const box=control.getBoundingClientRect(),scale=box.width&&control.offsetWidth?zoom*control.offsetWidth/box.width:1;
  return {left:box.left*scale,top:box.top*scale,bottom:box.bottom*scale};
}

/**
 * A card outside the scrollable game panels, scaled to the game's zoom: below its control, or above it where the window has no
 * room below, and always inside the window. It ignores the pointer, so the control under it keeps its clicks.
 */
export default function HoverCard({id,open,anchor,className='',children}:HoverCardProps&{className?:string;children:ReactNode}) {
  const ref=useRef<HTMLDivElement>(null),[position,setPosition]=useState({left:8,top:8,zoom:1});
  useLayoutEffect(()=>{
    const control=anchor.current;
    if(!open||!control)return;
    const place=()=>{
      const zoom=getLayoutZoom(control),box=viewportBox(control,zoom),margin=8*zoom;
      const width=(ref.current?.offsetWidth??240)*zoom,height=(ref.current?.offsetHeight??90)*zoom;
      const left=Math.max(margin,Math.min(box.left,window.innerWidth-width-margin));
      const below=box.bottom+7*zoom,top=below+height<=window.innerHeight-margin?below:Math.max(margin,box.top-height-7*zoom);
      setPosition(old=>old.left===left&&old.top===top&&old.zoom===zoom?old:{left,top,zoom});
    };
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    const host=control.closest('.game-shell'),observer=new MutationObserver(place);
    if(host)observer.observe(host,{attributes:true,attributeFilter:['style']});
    return()=>{observer.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true)};
  },[open,anchor,children,position.zoom]);
  if(!open||typeof document==='undefined')return null;
  const {left,top,zoom}=position;
  const style={left,top,transform:`scale(${zoom})`,maxWidth:`min(280px,calc(${100/zoom}vw - 16px))`,maxHeight:`calc(${100/zoom}vh - 16px)`};
  return createPortal(<div ref={ref} id={id} role="tooltip" className={`hover-card ${className}`} style={style}>{children}</div>,document.body);
}

/** A name explained on hover or keyboard focus, such as a monster's 性格 or 特性. */
export function HoverTerm({name,detail}:{name:string;detail:string}) {
  const {trigger,card}=useHoverCard<HTMLElement>();
  return <><strong {...trigger} className="hover-term" tabIndex={0}>{name}</strong><HoverCard {...card}><strong>{name}</strong><p>{detail}</p></HoverCard></>;
}
