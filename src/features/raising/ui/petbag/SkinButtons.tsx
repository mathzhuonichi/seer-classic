import {useEffect,useRef,useState} from 'react';
import type { MonsterView } from '../../../../shared/views.ts';
import {appearanceOf} from '../../../../shared/monster-views.ts';
import {CreatureArt} from '../../../../shared/ui/CreatureArt.tsx';

/**
 * 皮肤 over the portrait: a button that drops a column of the forms the monster may look like (a fusion line's parent forms, then
 * its first form to its own), each showing that form; the pressed one is its look. Only the look changes; its stats and skills stay its current form's. A
 * pick, a click elsewhere or Escape closes the column. None for a monster with one form.
 */
export default function SkinButtons({m,onPick}:{m:MonsterView;onPick:(species:number)=>void}) {
  const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null);
  useEffect(()=>setOpen(false),[m.uid]);
  // Escape closes the column, not the bag, wherever the focus is: the document hears it before the shell's window listener.
  useEffect(()=>{
    if(!open)return;
    const away=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();setOpen(false)}};
    document.addEventListener('pointerdown',away);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',escape)};
  },[open]);
  if(m.skinOptions.length<2)return null;
  // The options list the monster's own form first, then its ancestors, then any fusion parent forms.
  const appearance=appearanceOf(m),options=[...m.skinOptions].reverse();
  const pick=(species:number)=>{setOpen(false);if(species!==appearance)onPick(species)};
  return <div ref={root} className="petbag-skins">
    <button type="button" className="petbag-skin-toggle" aria-expanded={open} title="皮肤外观（仅改变外观）" onClick={()=>setOpen(!open)}>
      皮肤<i aria-hidden="true">{open?'▴':'▾'}</i></button>
    {open&&<div className="petbag-skin-list" role="group" aria-label="皮肤外观">{options.map(option=>{
      const label=`${option.name}${option.species===m.species?'（默认）':''}`;
      return <button key={option.species} type="button" aria-pressed={appearance===option.species} aria-label={`皮肤：${label}`} title={label}
        onClick={()=>pick(option.species)}>
        <span className="petbag-skin-art"><CreatureArt species={option.species} name={option.name} fill={.9} verticalAlign="center"/></span>
        <small>{option.name}</small></button>;
    })}</div>}
  </div>;
}
