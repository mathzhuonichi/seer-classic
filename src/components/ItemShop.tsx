import {useState} from 'react';
import type {GameController,GameSnapshot} from '../game-types';
import {ITEM_SHOP_CATEGORIES,itemShopCategory,type ShopCategory} from '../progression/item-shop';
import {CreatureArt} from './CreatureArt';
import '../management.css';
import './ItemShop.css';

export default function ItemShop({s,c,onOpenBag}:{s:GameSnapshot;c:GameController;onOpenBag:(pocket:string)=>void}){
 const [category,setCategory]=useState<ShopCategory>('battle'),[search,setSearch]=useState(''),[selected,setSelected]=useState('');
 const [quantity,setQuantity]=useState('1'),[feedback,setFeedback]=useState('');
 const all=s.shopItems??[],products=all.filter(item=>itemShopCategory(item.kind)===category&&item.name.includes(search));
 const item=products.find(entry=>entry.id===selected)??products[0];
 const count=Number(quantity),valid=Number.isSafeInteger(count)&&count>=1&&count<=999,activeBattle=!!s.battle&&!s.battle.finished;
 const label=ITEM_SHOP_CATEGORIES.find(row=>row[0]===category)!;
 function buy(){
  if(!item||!valid||activeBattle)return;
  const before=c.snapshot().shopItems.find(entry=>entry.id===item.id)?.count??0;
  c.dispatch({type:'buyItem',itemId:item.id,quantity:count});
  const after=c.snapshot().shopItems.find(entry=>entry.id===item.id)?.count??0;
  setFeedback(after===before+count?`${item.name} ×${count} 已加入背包。`:c.snapshot().notices[0]??'购买未完成。');
 }
 return <section className="management-panel item-shop-management" aria-label="实验室道具商城">
  <div className="management-panel-heading"><strong>实验室补给终端</strong><span>全部商品免费 · 直接放入背包</span></div>
  <nav className="management-tabs shop-categories" aria-label="商城道具分类">{ITEM_SHOP_CATEGORIES.map(([id,name,symbol])=><button key={id} aria-pressed={category===id} className={category===id?'active':''} onClick={()=>{setCategory(id);setSearch('');setSelected('');setFeedback('')}}><span>{symbol}</span> {name}<small>{all.filter(item=>itemShopCategory(item.kind)===id).length}</small></button>)}</nav>
  <div className="item-shop-inner"><aside className="shop-product-index"><div className="management-filter"><input aria-label="搜索商城道具" placeholder="搜索当前分类…" value={search} onChange={event=>{setSearch(event.target.value);setSelected('');setFeedback('')}}/></div>
   <div className="shop-product-scroll">{products.map(product=><button key={product.id} className={item?.id===product.id?'active':''} aria-pressed={item?.id===product.id} onClick={()=>{setSelected(product.id);setFeedback('')}}><span className="shop-product-symbol" aria-hidden="true">{label[2]}</span><span><strong>{product.name}</strong><small>背包库存 {product.count}</small></span><b>免费</b></button>)}{!products.length&&<p className="management-empty">{category==='essence'?'获得精元或元神珠后，可在这里免费补充。':'这个分类中没有匹配的道具。'}</p>}</div>
  </aside><div className="shop-detail-scroll">{item?<>
   <div className="shop-product-heading"><div className="shop-product-art">{item.hatches?<CreatureArt species={item.hatches} name={item.name}/>:<span aria-hidden="true">{label[2]}</span>}</div><div><small>{label[1]}</small><h3>{item.name}</h3><span>背包库存：{item.count}</span></div></div>
   <p className="shop-product-description">{item.description}</p>
   {item.hatches&&<p className="shop-product-description">孵化对象：{s.species.find(species=>species.id===item.hatches)?.name}。购买后前往道具背包确认孵化。</p>}
   <div className="shop-order"><span>单价 <strong>0 赛尔豆</strong></span><label htmlFor="shop-quantity">购买数量<input id="shop-quantity" type="number" min="1" max="999" step="1" aria-label="免费购买数量" value={quantity} onChange={event=>setQuantity(event.target.value)}/></label></div>
   <div className="shop-quantity-presets">{[1,5,10,99].map(value=><button key={value} onClick={()=>setQuantity(String(value))}>×{value}</button>)}</div>
   <div className="management-confirm-row"><span>{activeBattle?'请先结束当前战斗':!valid?'数量须为1至999的整数':'免费补给，无需等待'}</span><button className="primary" disabled={!valid||activeBattle} onClick={buy}>免费购买</button></div>
   {feedback&&<p className="shop-feedback" role="status">{feedback}</p>}
   <button className="shop-bag-link" onClick={()=>onOpenBag(itemShopCategory(item.kind))}>查看道具背包 →</button>
  </>:<p className="management-empty">选择道具查看用途与库存。</p>}</div></div>
 </section>;
}
