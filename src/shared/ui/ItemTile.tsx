import type {ReactNode} from 'react';
import HoverCard,{useHoverCard} from './HoverCard.tsx';
import './ItemTile.css';

export interface ItemTileProps {
  icon:ReactNode; name:string; description?:string; quantity?:number|'∞'; selected?:boolean; disabled?:boolean;
  onSelect:()=>void; children?:ReactNode; size?:'small'|'normal'; className?:string;
}

/** Selection is separate from use; callers own their explicit confirmation action. The item's card opens as useHoverCard says. */
export default function ItemTile({icon,name,description,quantity,selected=false,disabled=false,onSelect,children,size='normal',className=''}:ItemTileProps) {
  const {trigger,card}=useHoverCard<HTMLButtonElement>();
  const label=`${name}${quantity!==undefined?`，${quantity==='∞'?'无限':`数量 ${quantity}`}`:''}`;
  return <><button {...trigger} type="button" className={`item-tile item-tile--${size}${selected?' selected':''} ${className}`} aria-label={label}
    aria-pressed={selected} aria-disabled={disabled||undefined} onClick={()=>{if(!disabled)onSelect()}}>
    <span className="item-tile-art" aria-hidden="true">{icon}</span>
    {quantity!==undefined&&<span className="item-tile-quantity" aria-hidden="true">{quantity}</span>}
  </button>
  <HoverCard {...card} className="item-tooltip"><strong>{name}</strong>{description&&<p>{description}</p>}
    {children&&<div className="item-tooltip-extra">{children}</div>}</HoverCard></>;
}
