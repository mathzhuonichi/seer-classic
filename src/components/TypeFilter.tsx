import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {elementChoices,elementParts} from '../presentation/element-types';
import {getLayoutZoom} from '../presentation/game-display';
import TypeIcon from './TypeIcon';
import './TypeFilter.css';

type Props={label:string;value:string;groups:readonly (readonly string[])[];onChange:(value:string)=>void;withIcons?:boolean};
export default function TypeFilter(props:Props){
 if(props.withIcons)return <IconTypeFilter {...props}/>;
 const {label,value,groups,onChange}=props,{singles,duals}=elementChoices(groups);
 return <select aria-label={label} value={value} onChange={event=>onChange(event.target.value)}>
  <option>全部属性</option><option>仅单属性</option><option>仅双属性</option>
  <optgroup label="按组成属性">{singles.map(type=><option key={type}>{type}</option>)}</optgroup>
  <optgroup label="双属性组合">{duals.map(type=><option key={type} value={type}>{elementParts(type).join('·')}</option>)}</optgroup>
 </select>;
}
function IconTypeFilter({label,value,groups,onChange}:Props){
 const {singles,duals}=elementChoices(groups);
 const choices=[...['全部属性','仅单属性','仅双属性'].map(name=>({value:name,label:name,icon:false})),...singles.map(type=>({value:type,label:type,icon:true})),...duals.map(type=>({value:type,label:elementParts(type).join('·'),icon:true}))];
 const selected=choices.find(choice=>choice.value===value)??choices[0];
 const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0,width:180,maxHeight:320,zoom:1});
 const trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),listId=useId();
 function place(){
  const r=trigger.current!.getBoundingClientRect(),zoom=getLayoutZoom(trigger.current!),margin=8*zoom,width=Math.min(Math.max(r.width,190*zoom),window.innerWidth-2*margin);
  const below=Math.max(0,window.innerHeight-r.bottom-12*zoom),above=Math.max(0,r.top-12*zoom),down=below>=320*zoom||below>=above;
  const maxHeight=Math.min(320*zoom,down?below:above);
  setPosition({left:Math.max(margin,Math.min(r.left,window.innerWidth-width-margin))/zoom,top:(down?r.bottom+4*zoom:Math.max(margin,r.top-4*zoom-maxHeight))/zoom,width:width/zoom,maxHeight:maxHeight/zoom,zoom});
 }
 function show(){place();setOpen(true)}
 function choose(next:string){onChange(next);setOpen(false);trigger.current?.focus()}
 useEffect(()=>{
  if(!open)return;
  const dismiss=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))setOpen(false)};
  const close=()=>setOpen(false);
  document.addEventListener('pointerdown',dismiss);window.addEventListener('resize',close);window.addEventListener('scroll',close);
  const focused=menu.current?.querySelector<HTMLElement>('[aria-selected="true"]');focused?.focus({preventScroll:true});focused?.scrollIntoView({block:'nearest'});
  return()=>{document.removeEventListener('pointerdown',dismiss);window.removeEventListener('resize',close);window.removeEventListener('scroll',close)};
 },[open]);
 function key(event:KeyboardEvent){
  if(event.key==='Escape'){event.stopPropagation();event.preventDefault();setOpen(false);trigger.current?.focus();return}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();if(!open){show();return}
   const rows=[...menu.current!.querySelectorAll<HTMLButtonElement>('[role="option"]')],index=rows.findIndex(row=>row===document.activeElement),next=(index+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length;
   rows[next]?.focus();rows[next]?.scrollIntoView({block:'nearest'});
  }
  if(event.key==='Tab')setOpen(false);
 }
 return <><button ref={trigger} type="button" className="icon-type-filter" role="combobox" aria-label={label} aria-controls={listId} aria-expanded={open} aria-haspopup="listbox" onKeyDown={key} onClick={()=>open?setOpen(false):show()}>{selected.icon&&<TypeIcon type={selected.value} focusable={false}/>}<span>{selected.label}</span><i aria-hidden="true">▾</i></button>
  {open&&createPortal(<div ref={menu} id={listId} className="icon-type-menu" role="listbox" aria-label={`${label}选项`} style={position} onKeyDown={key}>{choices.map(choice=><button key={choice.value} type="button" role="option" aria-label={choice.label} aria-selected={value===choice.value} onClick={()=>choose(choice.value)}>{choice.icon?<TypeIcon type={choice.value} focusable={false}/>:<span className="type-category-space" aria-hidden="true"/>}<span>{choice.label}</span></button>)}</div>,document.body)}
 </>;
}
