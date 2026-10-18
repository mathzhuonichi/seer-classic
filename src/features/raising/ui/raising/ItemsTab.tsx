import {useEffect,useState} from 'react';
import type { ItemView } from '../../../../shared/views.ts';
import {itemCategoryOptions,raisingItemCategory} from '../../../../shared/item-categories.ts';
import ItemCategoryTabs from '../../../../shared/ui/ItemCategoryTabs.tsx';
import ItemIcon from '../../../../shared/ui/ItemIcon.tsx';
import ItemTile from '../../../../shared/ui/ItemTile.tsx';
import {dispatchNext,feedbackFor,monsterIn,type TabProps} from './dispatch-feedback.ts';

/** 道具: raising items in stock, grouped by use, with an explicit confirmation. */
export default function ItemsTab({m,c,feedback,say,items}:TabProps&{items:ItemView[]}) {
  const [category,setCategory]=useState('all'),[itemId,setItemId]=useState('');
  const stock=items.filter(item=>item.kind==='raising'&&(item.unlimited||item.count>0));
  const categories=itemCategoryOptions('raising',stock);
  // A category that ran out of items falls back to 全部.
  const shown=categories.some(([id])=>id===category)?category:'all';
  useEffect(()=>{if(category!==shown){setCategory(shown);setItemId('')}},[category,shown]);
  const visible=stock.filter(item=>shown==='all'||raisingItemCategory(item)===shown);
  const item=visible.find(entry=>entry.id===itemId);
  function use() {
    if(!item)return;
    const next=dispatchNext(c,{type:'useItem',uid:m.uid,itemId:item.id});
    const spent=(next.items.find(entry=>entry.id===item.id)?.count??0)<item.count;
    const changed=!!item.unlimited&&JSON.stringify(monsterIn(next,m.uid))!==JSON.stringify(m);
    say(feedbackFor(next,spent||changed,`已对${m.name}使用${item.name}。`,'道具未使用。'));
  }
  return <section className="raising-items-panel" aria-label="培养道具">
    <ItemCategoryTabs label="培养道具用途" value={shown} options={categories} onChange={value=>{setCategory(value);setItemId('');say('')}}/>
    <div className="raising-item-grid item-icon-grid">{visible.map(entry=><ItemTile key={entry.id}
      icon={<ItemIcon id={entry.id} kind={entry.kind} label={entry.name} size={36}/>} name={entry.name} description={entry.description}
      quantity={entry.unlimited?'∞':entry.count} selected={itemId===entry.id} onSelect={()=>{setItemId(entry.id);say('')}}/>)}</div>
    {!visible.length&&<div className="management-empty">这个分类中没有可用道具。</div>}
    <div className="management-confirm-row raising-item-confirm">
      <span className="management-feedback" role="status">{feedback||(item?`${item.name} → ${m.name}`:'选择道具后确认使用。')}</span>
      <button className="primary" disabled={!item} onClick={use}>确认使用</button>
    </div>
  </section>;
}
