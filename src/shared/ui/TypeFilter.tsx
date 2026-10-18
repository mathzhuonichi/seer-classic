import {useEffect,useId,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {elementFilterOptions,type ElementFilterOption} from '../element-types.ts';
import {getLayoutZoom} from '../game-display.ts';
import TypeIcon from './TypeIcon.tsx';
import './TypeFilter.css';

type Props={label:string;value:string;groups:readonly (readonly string[])[];onChange:(value:string)=>void;withIcons?:boolean};
type ChoiceProps={label:string;value:string;options:ElementFilterOption[];onChange:(value:string)=>void};

/** Element filter over the given type lists: a native select, or with `withIcons` a combobox showing the official art. */
export default function TypeFilter({label,value,groups,onChange,withIcons}:Props){
 const options=useMemo(()=>elementFilterOptions(groups),[groups]);
 if(withIcons)return <IconTypeFilter label={label} value={value} options={options} onChange={onChange}/>;
 const group=(kind:ElementFilterOption['kind'])=>options.filter(option=>option.kind===kind)
  .map(option=><option key={option.value} value={option.value}>{option.label}</option>);
 return <select aria-label={label} value={value} onChange={event=>onChange(event.target.value)}>
  {group('count')}
  <optgroup label="按组成属性">{group('single')}</optgroup>
  <optgroup label="双属性组合">{group('dual')}</optgroup>
 </select>;
}

const hasArt=(choice:ElementFilterOption)=>choice.kind!=='count';

/** The open menu in layout pixels: below the trigger unless there is more room above, and 8 px inside the viewport. */
export function typeMenuPosition(r:Pick<DOMRect,'left'|'top'|'bottom'|'width'>,zoom:number,viewport:Pick<Window,'innerWidth'|'innerHeight'>){
 const margin=8*zoom,width=Math.min(Math.max(r.width,190*zoom),viewport.innerWidth-2*margin);
 const below=Math.max(0,viewport.innerHeight-r.bottom-12*zoom),above=Math.max(0,r.top-12*zoom),down=below>=320*zoom||below>=above;
 const maxHeight=Math.min(320*zoom,down?below:above);
 const left=Math.max(margin,Math.min(r.left,viewport.innerWidth-width-margin)),top=down?r.bottom+4*zoom:Math.max(margin,r.top-4*zoom-maxHeight);
 return {left:left/zoom,top:top/zoom,width:width/zoom,maxHeight:maxHeight/zoom,zoom};
}

function IconTypeFilter({label,value,options:choices,onChange}:ChoiceProps){
 const selected=choices.find(choice=>choice.value===value)??choices[0];
 const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0,width:180,maxHeight:320,zoom:1});
 const trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),listId=useId();
 function show(){setPosition(typeMenuPosition(trigger.current!.getBoundingClientRect(),getLayoutZoom(trigger.current!),window));setOpen(true)}
 function close(){setOpen(false);trigger.current?.focus()}
 function choose(next:string){onChange(next);close()}
 useEffect(()=>{
  if(!open)return;
  const dismiss=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))setOpen(false)};
  const hide=()=>setOpen(false);
  document.addEventListener('pointerdown',dismiss);window.addEventListener('resize',hide);window.addEventListener('scroll',hide);
  const focused=menu.current?.querySelector<HTMLElement>('[aria-selected="true"]');
  focused?.focus({preventScroll:true});focused?.scrollIntoView({block:'nearest'});
  return()=>{document.removeEventListener('pointerdown',dismiss);window.removeEventListener('resize',hide);window.removeEventListener('scroll',hide)};
 },[open]);
 function key(event:KeyboardEvent){
  if(event.key==='Escape'){event.stopPropagation();event.preventDefault();close();return}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();if(!open){show();return}
   const rows=[...menu.current!.querySelectorAll<HTMLButtonElement>('[role="option"]')],index=rows.findIndex(row=>row===document.activeElement);
   const next=(index+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length;
   rows[next]?.focus();rows[next]?.scrollIntoView({block:'nearest'});
  }
  if(event.key==='Tab')setOpen(false);
 }
 const menuList=()=><div ref={menu} id={listId} className="icon-type-menu" role="listbox" aria-label={`${label}选项`} style={position} onKeyDown={key}>
  {choices.map(choice=><button key={choice.value} type="button" role="option" aria-label={choice.label} aria-selected={value===choice.value}
   onClick={()=>choose(choice.value)}>
   {hasArt(choice)?<TypeIcon type={choice.value} focusable={false}/>:<span className="type-category-space" aria-hidden="true"/>}<span>{choice.label}</span>
  </button>)}
 </div>;
 return <>
  <button ref={trigger} type="button" className="icon-type-filter" role="combobox" aria-label={label} aria-controls={listId} aria-expanded={open}
   aria-haspopup="listbox" onKeyDown={key} onClick={()=>open?setOpen(false):show()}>
   {hasArt(selected)&&<TypeIcon type={selected.value} focusable={false}/>}<span>{selected.label}</span><i aria-hidden="true">▾</i>
  </button>
  {open&&createPortal(menuList(),document.body)}
 </>;
}
