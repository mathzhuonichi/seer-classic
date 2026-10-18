import {useEffect,useState} from 'react';
import {itemCategoryOptions} from '../../../shared/item-categories.ts';

/** The content-category filter of one pocket's `items`. When the chosen category empties, the
 * filter falls back to 'all' and `onFallback` clears whatever depended on it. */
export function useItemContent(pocket:string,items:readonly {id:string;kind:string}[],onFallback:()=>void) {
  const [content,setContent]=useState('all');
  const options=itemCategoryOptions(pocket,items),effective=options.some(([id])=>id===content)?content:'all';
  useEffect(()=>{if(content!==effective){setContent(effective);onFallback()}},[content,effective]);
  return {options,content:effective,setContent};
}
