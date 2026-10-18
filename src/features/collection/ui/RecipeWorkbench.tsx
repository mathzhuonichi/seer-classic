// Shared building blocks of the fusion and breeding panels: a recipe index, two parent slots,
// the outcome table and a confirm bar, all styled by fusion.css.
import {useEffect,useState,type ReactNode} from 'react';
import {CreatureArt} from '../../../shared/ui/CreatureArt.tsx';

/**
 * The chosen recipe, its two parent uids and the last attempt's result. An `initialId` naming a known
 * recipe selects it; the parents and result clear whenever the recipe changes.
 */
export function useRecipeWorkbench<Recipe extends {id:string},Result>(recipes:readonly Recipe[],initialId?:string) {
  const [recipeId,setRecipeId]=useState(initialId??recipes[0]?.id??'');
  const [first,setFirst]=useState(''),[second,setSecond]=useState(''),[result,setResult]=useState<Result|null>(null);
  const recipe:Recipe|undefined=recipes.find(entry=>entry.id===recipeId)??recipes[0];
  useEffect(()=>{if(initialId&&recipes.some(entry=>entry.id===initialId))setRecipeId(initialId)},[initialId]);
  useEffect(()=>{setFirst('');setSecond('');setResult(null)},[recipe?.id]);
  return {recipe,setRecipeId,first,setFirst,second,setSecond,result,setResult};
}

interface RecipeButtonProps {
  active:boolean;title?:string;art:{species:number;name:string};name:string;detail:string;
  status:string;statusClass:string;onClick:()=>void;
}
export function RecipeButton({active,title,art,name,detail,status,statusClass,onClick}:RecipeButtonProps) {
  return <button className={active?'active':''} aria-pressed={active} title={title} onClick={onClick}>
    <div className="fusion-recipe-art"><CreatureArt species={art.species} name={art.name}/></div>
    <span><strong>{name}</strong><small>{detail}</small></span><b className={statusClass}>{status}</b>
  </button>;
}

export function RecipeHeading({kicker,name,note}:{kicker:string;name:string;note:string}) {
  return <div className="fusion-heading"><div><small>{kicker}</small><h3>{name}</h3></div><span>{note}</span></div>;
}

export interface ParentOption {value:string;label:string;disabled?:boolean}
interface ParentCardProps {
  id:string;label:string;heading:ReactNode;art:ReactNode;value:string;disabled:boolean;onChange:(uid:string)=>void;
  placeholder:string;options:ParentOption[];requirement:string;children?:ReactNode;
}
/** One parent slot: art, a select over the owned candidates, the species requirement and slot extras. */
export function ParentCard({id,label,heading,art,value,disabled,onChange,placeholder,options,requirement,children}:ParentCardProps) {
  return <div className="fusion-parent-card">
    <label htmlFor={id}>{heading}</label>
    <div className="fusion-parent-art">{art}</div>
    <select id={id} aria-label={`选择${label}`} disabled={disabled} value={value} onChange={event=>onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {options.map(option=><option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
    <p className="fusion-parent-requirement">{requirement}</p>
    {children}
  </div>;
}

export function ParentPair({first,second}:{first:ReactNode;second:ReactNode}) {
  return <div className="fusion-parent-grid">{first}<span className="fusion-plus" aria-hidden="true">＋</span>{second}</div>;
}

interface OutcomeCardProps {species:number;name:string;highlight:boolean;detail:string;note?:string;chance:string}
export function OutcomeCard({species,name,highlight,detail,note,chance}:OutcomeCardProps) {
  return <article className={highlight?'rare':''}>
    <div className="fusion-outcome-art"><CreatureArt species={species} name={name}/></div>
    <div><strong>{name}</strong><small>{detail}</small>{note&&<em>{note}</em>}</div><b>{chance}</b>
  </article>;
}

interface ConfirmBarProps {status:string;action:string;disabled:boolean;onConfirm:()=>void;feedback?:string}
/** The confirm row, and the controller's notice from the last attempt. */
export function ConfirmBar({status,action,disabled,onConfirm,feedback}:ConfirmBarProps) {
  return <>
    <div className="fusion-confirm"><span>{status}</span><button className="primary" disabled={disabled} onClick={onConfirm}>{action}</button></div>
    {feedback&&<p className="fusion-feedback" role="status">{feedback}</p>}
  </>;
}
