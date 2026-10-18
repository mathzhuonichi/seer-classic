import {useEffect,useState} from 'react';
import type { GameController } from '../../../kernel/contract.ts';
import type { ShopItemView, SpeciesView } from '../../../shared/views.ts';
import ItemIcon from '../../../shared/ui/ItemIcon.tsx';
import ItemTile from '../../../shared/ui/ItemTile.tsx';
import ItemCategoryTabs from '../../../shared/ui/ItemCategoryTabs.tsx';
import {useGame} from '../../../shared/ui/use-game.ts';
import {EngravingShop} from '../../engravings/ui.ts';
import {useItemContent} from './use-item-content.ts';
import {ITEM_POCKETS,ITEM_POCKET_TITLES,itemContentCategory,itemPocket} from '../../../shared/item-categories.ts';
import {itemStock} from '../inventory-views.ts';
import {shopOrder,shopSearch,type ShopOrder} from '../shop-views.ts';
import {battleActive} from '../../../shared/view-helpers.ts';
import '../../../shared/ui/management.css';
import './ItemShop.css';

const SHOP_TABS=[...ITEM_POCKETS,['engraving','刻印']] as const;
type ShopTab=typeof SHOP_TABS[number][0];

export default function ItemShop({c,onOpenBag}:{c:GameController;onOpenBag:(pocket:string,itemId:string)=>void}){
 const shopItems=useGame(c,s=>s.shopItems),species=useGame(c,s=>s.species),inBattle=useGame(c,battleActive);
 const [tab,setTab]=useState<ShopTab>('battle'),[search,setSearch]=useState(''),[selected,setSelected]=useState('');
 const [quantity,setQuantity]=useState('1'),[feedback,setFeedback]=useState('');
 const inTab=shopItems.filter(item=>itemPocket(item.kind)===tab),content=useItemContent(tab,inTab,()=>setSelected(''));
 const {query,matches}=shopSearch(search);
 const products=inTab.filter(item=>(content.content==='all'||itemContentCategory(item)===content.content)&&matches(item));
 const item=products.find(entry=>entry.id===selected)??products[0];
 const order=shopOrder(item,quantity,inBattle);
 useEffect(()=>{setQuantity('1');setFeedback('')},[item?.id]);
 // A successful claim or hatch can change the shared allowance while this panel is open.
 useEffect(()=>{if(order.maximum>0)setQuantity(previous=>Number(previous)>order.maximum?String(order.maximum):previous)},[order.maximum]);
 function buy(){
  if(item&&order.canBuy)setFeedback(c.dispatch({type:'buyItem',itemId:item.id,quantity:order.count}).notice??'');
 }
 return <section className="management-panel item-shop-management" aria-label="实验室道具商城">
  <ItemCategoryTabs label="商城道具分类" value={tab} options={SHOP_TABS} className="shop-primary-categories"
   onChange={id=>{setTab(id);content.setContent('all');setSearch('');setSelected('');setFeedback('')}}/>
  {tab==='engraving'?<EngravingShop c={c}/>:<div className="item-shop-inner"><aside className="shop-product-index">
   {content.options.length>2&&<ItemCategoryTabs label="商城道具用途" value={content.content} options={content.options}
    onChange={id=>{content.setContent(id);setSelected('');setFeedback('')}}/>}
   <div className="management-filter"><input aria-label="搜索商城道具或孵化精灵编号" placeholder={tab==='essence'?'名称 / 精灵编号':'搜索道具…'} value={search}
    onChange={event=>{setSearch(event.target.value);setSelected('');setFeedback('')}}/></div>
   <div className="shop-icon-scroll item-icon-grid">
    {products.map(product=><ItemTile key={product.id} icon={<ItemIcon id={product.id} kind={product.kind} label={product.name}/>} name={product.name}
     description={product.description} quantity={itemStock(product)} selected={item?.id===product.id} onSelect={()=>{setSelected(product.id);setFeedback('')}}>
     {product.allowance&&<span>同种精灵与精元合计 {product.allowance.owned+product.allowance.reserved} / {product.allowance.limit}</span>}</ItemTile>)}
    {!products.length&&<p className="management-empty">
     {query?'没有匹配的道具。':tab==='essence'?'获得精元或元神珠后，可在这里查看可补充的品种。':'这个分类中没有道具。'}</p>}
   </div>
  </aside><div className="shop-detail-scroll">{item?<ProductDetail species={species} item={item} order={order} quantity={quantity} feedback={feedback}
   onQuantity={value=>{setQuantity(value);setFeedback('')}} onBuy={buy} onOpenBag={onOpenBag}/>:<p className="management-empty">选择道具查看用途与库存。</p>}</div></div>}
 </section>;
}

interface DetailProps {
 species:SpeciesView[]; item:ShopItemView; order:ShopOrder; quantity:string; feedback:string;
 onQuantity:(value:string)=>void; onBuy:()=>void; onOpenBag:(pocket:string,itemId:string)=>void;
}

/** One product: what it is, the free order form for finite stock, and the way to the bag. */
function ProductDetail({species,item,order,quantity,feedback,onQuantity,onBuy,onOpenBag}:DetailProps) {
 const {maximum,presets,locked,canBuy,hint}=order;
 return <>
  <div className="shop-product-heading">
   <div className="shop-product-art"><ItemIcon id={item.id} kind={item.kind} label={item.name} size={48}/></div>
   <div><small>{ITEM_POCKET_TITLES[itemPocket(item.kind)]}</small><h3>{item.name}</h3><span>背包库存：{itemStock(item)}</span></div></div>
  <p className="shop-product-description">{item.description}</p>
  {item.hatches&&<p className="shop-product-description">孵化对象：{species.find(entry=>entry.id===item.hatches)?.name??`#${item.hatches}`}
   。补充后前往道具背包孵化。</p>}
  {item.allowance&&<p className="shop-stock-line" aria-label="同种精灵持有情况">已持有 <b>{item.allowance.owned}</b> · 待孵化 <b>{item.allowance.reserved}</b>
   {' · 同种上限 '}<b>{item.allowance.limit}</b></p>}
  {!item.unlimited&&<><div className="shop-order"><span>单价 <strong>0 赛尔豆</strong></span><label htmlFor="shop-quantity">{item.hatches?'补充数量':'购买数量'}
   <input id="shop-quantity" type="number" min="1" max={Math.max(1,maximum)} step="1" aria-label="免费购买数量" disabled={maximum===0||locked} value={quantity}
    onChange={event=>onQuantity(event.target.value)}/></label></div>
   <div className="shop-quantity-presets">
    {presets.map(value=><button key={value} disabled={locked} onClick={()=>onQuantity(String(value))}>×{value}</button>)}</div>
   <div className="management-confirm-row"><span className={maximum===0||item.blockedReason?'shop-order-blocked':''}>{hint}</span>
    <button className="primary" disabled={!canBuy} onClick={onBuy}>{item.hatches?'免费补充':'免费购买'}</button></div></>}
  {feedback&&<p className="shop-feedback" role="status">{feedback}</p>}
  <button className={item.unlimited?'primary shop-bag-link':'shop-bag-link'} onClick={()=>onOpenBag(itemPocket(item.kind),item.id)}>
   {item.hatches?'前往道具背包孵化':item.unlimited?'前往背包取用':'查看道具背包'} →</button>
 </>;
}
