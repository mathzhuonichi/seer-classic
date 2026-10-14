import type {ShopItemView} from '../game-types';
export const ITEM_SHOP_CATEGORIES=[['raising','培养道具','◇'],['battle','战斗补给','✚'],['capsule','精灵胶囊','◈'],['essence','精元 / 元神珠','◉'],['other','其他','▣']] as const;
export type ShopCategory=typeof ITEM_SHOP_CATEGORIES[number][0];
export function itemShopCategory(kind:string):ShopCategory{return ITEM_SHOP_CATEGORIES.some(row=>row[0]===kind)?kind as ShopCategory:'other'}
export function isShopItemAvailable(item:{id:string;kind:string},unlocked:ReadonlySet<string>):boolean{return item.kind!=='essence'||unlocked.has(item.id)}

/** Unchanged stock reuses immutable rows; hidden unearned essences never become shop products. */
export function createItemShopViews(definitions:readonly Omit<ShopItemView,'count'>[]){
 let ids:readonly string[]|undefined,length=-1,products:readonly Omit<ShopItemView,'count'>[]=[],view:ShopItemView[]=[];
 return (inventory:Readonly<Record<string,number>>,unlocked:readonly string[])=>{
  if(ids!==unlocked||length!==unlocked.length){ids=unlocked;length=unlocked.length;const known=new Set(unlocked);products=definitions.filter(item=>isShopItemAvailable(item,known))}
  if(view.length===products.length&&view.every((item,index)=>item.id===products[index].id&&item.count===(inventory[item.id]??0)))return view;
  const previous=new Map(view.map(item=>[item.id,item]));
  view=products.map(item=>{const count=inventory[item.id]??0,old=previous.get(item.id);return old?.count===count?old:{...item,count}});
  return view;
 };
}
