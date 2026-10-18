// Pure rules of the item shop page: product search, the order form and the way to the bag.
import type { ShopItemView } from '../../shared/views.ts';

/**
 * The label of the product's link to the bag, which opens on the product; none while the bag holds no copy of a finite
 * product (an essence before it is replenished or after its last copy hatched), as the bag would have nothing to select.
 */
export function shopBagLink(item:ShopItemView):string|undefined {
  if(!item.unlimited&&item.count<1)return undefined;
  return item.hatches?'前往道具背包孵化':item.unlimited?'前往背包取用':'查看道具背包';
}

/** A product search by name, or by the species number an essence hatches (`#12` or `12`). */
export function shopSearch(search:string):{query:string;matches:(item:ShopItemView)=>boolean} {
  const query=search.trim().replace(/^#/,'').toLowerCase(),species=/^\d+$/.test(query)?Number(query):undefined;
  return {query,matches:item=>!query||item.name.toLowerCase().includes(query)||species!==undefined&&item.hatches===species};
}

export interface ShopOrder {
  /** Largest quantity this order may take; 0 when the product cannot be ordered. */
  maximum:number;
  count:number;
  valid:boolean;
  /** Quick quantity buttons. */
  presets:number[];
  /** A battle in progress or a blocked product (e.g. an exhausted species allowance) locks the form. */
  locked:boolean;
  canBuy:boolean;
  hint:string;
}

/** The typed quantity for a product's `maximum`: 0 while nothing can be ordered, 1 once ordering opens again, else capped at the maximum. */
export function fitQuantity(quantity:string,maximum:number):string {
  if(maximum===0)return '0';
  if(quantity==='0')return '1';
  return Number(quantity)>maximum?String(maximum):quantity;
}

/** The order form for `item` with the typed `quantity`, up to its `maxQuantity`; the controller re-checks the order. */
export function shopOrder(item:ShopItemView|undefined,quantity:string,inBattle:boolean):ShopOrder {
  const maximum=item?.maxQuantity??0,count=Number(quantity);
  const valid=Number.isSafeInteger(count)&&count>=1&&count<=maximum,locked=inBattle||!!item?.blockedReason;
  const presets=[...new Set((item?.hatches?[1,3,6,maximum]:[1,5,10,99]).filter(value=>value>0&&value<=maximum))].sort((a,b)=>a-b);
  const hint=inBattle?'请先结束当前战斗':item?.blockedReason??(maximum===0?'当前无法补充':!valid?`数量须为 1 至 ${maximum} 的整数`
    :item?.hatches?`本次最多补充 ${maximum} 份`:'免费补给，无需等待');
  return {maximum,count,valid,presets,locked,canBuy:!!item&&valid&&!locked,hint};
}
