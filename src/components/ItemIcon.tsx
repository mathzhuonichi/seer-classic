import {useEffect,useState,type CSSProperties} from 'react';
import {getItemIcon,getItemIconFallback} from '../presentation/item-icons';
import './ItemIcon.css';

export interface ItemIconProps {
  id:string|number;
  kind?:string;
  engraving?:boolean;
  label?:string;
  size?:number;
  className?:string;
  /** Tile labels and tooltips already name decorative icons. */
  decorative?:boolean;
}

/** A pure icon surface: the surrounding tile owns focus, actions and rich details. */
export default function ItemIcon({id,kind,engraving=false,label,size=32,className='',decorative=true}:ItemIconProps) {
  const original=getItemIcon(id,kind,engraving);
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[original.src]);
  const asset=failed?getItemIconFallback(id,kind,engraving):original;
  const style={'--item-icon-size':`${size}px`} as CSSProperties;
  return <span className={`seer-item-icon${asset.original?'':' seer-item-icon--fallback'}${className?` ${className}`:''}`}
    style={style} role={decorative?undefined:'img'} aria-hidden={decorative||undefined}
    aria-label={decorative?undefined:[label,asset.original?undefined:asset.fallbackLabel].filter(Boolean).join(' · ')}
    data-original-art={asset.original?'true':'false'}>
    <img className="seer-item-icon__image" src={`${asset.src}${asset.sha256?`?v=${asset.sha256.slice(0,12)}`:''}`} alt="" draggable={false}
      loading="lazy" decoding="async" onError={()=>{if(!failed)setFailed(true);}}/>
  </span>;
}
