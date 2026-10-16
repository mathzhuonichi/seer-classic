import {useId,useRef,useState,type ReactNode} from 'react';
import ItemTooltip from './ItemTooltip';
import './ItemTile.css';

export interface ItemTileProps {
  icon:ReactNode; name:string; description?:string; quantity?:number|'∞'; selected?:boolean; disabled?:boolean;
  onSelect:()=>void; children?:ReactNode; size?:'small'|'normal'; className?:string;
}

/** Selection is separate from use; callers own their explicit confirmation action. */
export default function ItemTile({icon,name,description,quantity,selected=false,disabled=false,onSelect,children,size='normal',className=''}:ItemTileProps) {
  const ref=useRef<HTMLButtonElement>(null),id=useId(),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false);
  const open=hovered||focused;
  return <><button ref={ref} type="button" className={`item-tile item-tile--${size}${selected?' selected':''} ${className}`} aria-label={`${name}${quantity!==undefined?`，${quantity==='∞'?'无限':`数量 ${quantity}`}`:''}`} aria-pressed={selected} aria-disabled={disabled||undefined} aria-describedby={open?id:undefined}
    onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onKeyDown={event=>{if(event.key==='Escape'){setHovered(false);setFocused(false)}}} onClick={()=>{if(!disabled)onSelect()}}>
    <span className="item-tile-art" aria-hidden="true">{icon}</span>{quantity!==undefined&&<span className="item-tile-quantity" aria-hidden="true">{quantity}</span>}
  </button><ItemTooltip id={id} open={open} anchor={ref.current} name={name} description={description}>{children}</ItemTooltip></>;
}
