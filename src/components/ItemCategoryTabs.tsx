import './ItemCategoryTabs.css';

export interface ItemCategoryTabsProps<T extends string=string> {
  label:string;
  value:T;
  options:readonly (readonly [T,string])[];
  onChange:(value:T)=>void;
  className?:string;
}

/** Compact content navigation; it never owns filtering or game actions. */
export default function ItemCategoryTabs<T extends string>({label,value,options,onChange,className=''}:ItemCategoryTabsProps<T>) {
  return <nav className={`item-category-tabs${className?` ${className}`:''}`} aria-label={label}>
    {options.map(([id,name])=><button key={id} type="button" aria-pressed={value===id} className={`item-category-tab${value===id?' active':''}`} onClick={()=>onChange(id)}>{name}</button>)}
  </nav>;
}
