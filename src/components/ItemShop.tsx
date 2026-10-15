import {useEffect,useState} from 'react';
import type {GameController,GameSnapshot} from '../game-types';
import {ITEM_SHOP_CATEGORIES,itemShopCategory,type ShopCategory} from '../progression/item-shop';
import {CreatureArt} from './CreatureArt';
import EngravingShop from './EngravingShop';
import '../management.css';
import './ItemShop.css';

export default function ItemShop({s,c,onOpenBag}:{s:GameSnapshot;c:GameController;onOpenBag:(pocket:string)=>void}){
 const [category,setCategory]=useState<ShopCategory|'engraving'>('battle'),[search,setSearch]=useState(''),[selected,setSelected]=useState('');
 const [quantity,setQuantity]=useState('1'),[feedback,setFeedback]=useState('');
 const query=search.trim().replace(/^#/,'').toLowerCase(),speciesQuery=/^\d+$/.test(query)?Number(query):undefined;
 const all=s.shopItems??[],products=all.filter(item=>itemShopCategory(item.kind)===category&&(!query||item.name.toLowerCase().includes(query)||speciesQuery!==undefined&&item.hatches===speciesQuery));
 const item=products.find(entry=>entry.id===selected)??products[0];
 const maximum=Math.max(0,Math.min(999,item?.maxQuantity??999)),count=Number(quantity);
 const valid=Number.isSafeInteger(count)&&count>=1&&count<=maximum,activeBattle=!!s.battle&&!s.battle.finished;
 const label=ITEM_SHOP_CATEGORIES.find(row=>row[0]===category)!;
 const presets=[...new Set((item?.hatches?[1,3,6,maximum]:[1,5,10,99]).filter(value=>value>0&&value<=maximum))].sort((a,b)=>a-b);
 const orderHint=activeBattle?'请先结束当前战斗':item?.blockedReason??(maximum===0?'当前无法补充':!valid?`数量须为 1 至 ${maximum} 的整数`:item?.hatches?`本次最多补充 ${maximum} 份`:'免费补给，无需等待');
 useEffect(()=>{setQuantity('1');setFeedback('')},[item?.id]);
 // A successful claim or hatch can change the shared allowance while this panel is open.
 useEffect(()=>{if(maximum>0)setQuantity(previous=>Number(previous)>maximum?String(maximum):previous)},[maximum]);
 function buy(){
  if(!item||!valid||activeBattle||maximum===0||item.blockedReason)return;
  const before=c.snapshot().shopItems.find(entry=>entry.id===item.id)?.count??0;
  c.dispatch({type:'buyItem',itemId:item.id,quantity:count});
  const after=c.snapshot().shopItems.find(entry=>entry.id===item.id)?.count??0;
  setFeedback(after===before+count?`${item.name} ×${count} 已加入背包。`:c.snapshot().notices[0]??'购买未完成。');
 }
 return <section className="management-panel item-shop-management" aria-label="实验室道具商城">
  <div className="management-panel-heading"><strong>实验室补给终端</strong><span>全部商品免费 · 直接放入背包</span></div>
  <nav className="management-tabs shop-categories" aria-label="商城道具分类">{ITEM_SHOP_CATEGORIES.map(([id,name,symbol])=><button key={id} aria-pressed={category===id} className={category===id?'active':''} onClick={()=>{setCategory(id);setSearch('');setSelected('');setFeedback('')}}><span>{symbol}</span> {name}<small>{all.filter(item=>itemShopCategory(item.kind)===id).length}</small></button>)}<button aria-pressed={category==='engraving'} className={category==='engraving'?'active':''} onClick={()=>{setCategory('engraving');setSearch('');setSelected('');setFeedback('')}}><span>✦</span> 刻印<small>{s.modules.engravings}</small></button></nav>
  {category==='engraving'?<EngravingShop s={s} c={c}/>:<div className="item-shop-inner"><aside className="shop-product-index"><div className="management-filter"><input aria-label="搜索商城道具或孵化精灵编号" placeholder={category==='essence'?'名称 / 精灵编号':'搜索当前分类…'} value={search} onChange={event=>{setSearch(event.target.value);setSelected('');setFeedback('')}}/></div>
   <div className="shop-product-scroll">{products.map(product=><button key={product.id} className={item?.id===product.id?'active':''} aria-pressed={item?.id===product.id} onClick={()=>{setSelected(product.id);setFeedback('')}}><span className="shop-product-symbol" aria-hidden="true">{label[2]}</span><span><strong>{product.name}</strong><small>背包库存 {product.count}</small></span><b className={product.maxQuantity===0?'unavailable':''}>{product.maxQuantity===0?'不可补充':'免费'}</b></button>)}{!products.length&&<p className="management-empty">{query?'没有匹配的道具。':category==='essence'?'获得精元或元神珠后，可在这里查看可补充的品种。':'这个分类中没有道具。'}</p>}</div>
  </aside><div className="shop-detail-scroll">{item?<>
   <div className="shop-product-heading"><div className="shop-product-art">{item.hatches?<CreatureArt species={item.hatches} name={item.name}/>:<span aria-hidden="true">{label[2]}</span>}</div><div><small>{label[1]}</small><h3>{item.name}</h3><span>背包库存：{item.count}</span></div></div>
   <p className="shop-product-description">{item.description}</p>
   {item.hatches&&<p className="shop-product-description">孵化对象：{s.species.find(species=>species.id===item.hatches)?.name??`#${item.hatches}`}。补充后前往道具背包孵化。</p>}
   {item.allowance&&<div className="shop-allowance" aria-label="同种精灵持有情况"><dl><div><dt>已持有</dt><dd>{item.allowance.owned}</dd></div><div><dt>未孵化</dt><dd>{item.allowance.reserved}</dd></div><div><dt>同种上限</dt><dd>{item.allowance.limit}</dd></div></dl><p>同种精灵和未孵化精元共用额度。</p></div>}
   <div className="shop-order"><span>单价 <strong>0 赛尔豆</strong></span><label htmlFor="shop-quantity">{item.hatches?'补充数量':'购买数量'}<input id="shop-quantity" type="number" min="1" max={Math.max(1,maximum)} step="1" aria-label="免费购买数量" disabled={maximum===0||activeBattle||!!item.blockedReason} value={quantity} onChange={event=>{setQuantity(event.target.value);setFeedback('')}}/></label></div>
   <div className="shop-quantity-presets">{presets.map(value=><button key={value} disabled={activeBattle||!!item.blockedReason} onClick={()=>{setQuantity(String(value));setFeedback('')}}>×{value}</button>)}</div>
   <div className="management-confirm-row"><span className={maximum===0||item.blockedReason?'shop-order-blocked':''}>{orderHint}</span><button className="primary" disabled={!valid||activeBattle||maximum===0||!!item.blockedReason} onClick={buy}>{item.hatches?'免费补充':'免费购买'}</button></div>
   {feedback&&<p className="shop-feedback" role="status">{feedback}</p>}
   <button className="shop-bag-link" onClick={()=>onOpenBag(itemShopCategory(item.kind))}>{item.hatches?'前往道具背包孵化':'查看道具背包'} →</button>
  </>:<p className="management-empty">选择道具查看用途与库存。</p>}</div></div>}
 </section>;
}
