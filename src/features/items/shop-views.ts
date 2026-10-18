// Pure rules of the item shop page: product search and the order form.
import type { ShopItemView } from '../../shared/views.ts';

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

/** The order form for `item` with the typed `quantity`, up to its `maxQuantity`; the controller re-checks the order. */
export function shopOrder(item:ShopItemView|undefined,quantity:string,inBattle:boolean):ShopOrder {
  const maximum=item?.maxQuantity??0,count=Number(quantity);
  const valid=Number.isSafeInteger(count)&&count>=1&&count<=maximum,locked=inBattle||!!item?.blockedReason;
  const presets=[...new Set((item?.hatches?[1,3,6,maximum]:[1,5,10,99]).filter(value=>value>0&&value<=maximum))].sort((a,b)=>a-b);
  const hint=inBattle?'请先结束当前战斗':item?.blockedReason??(maximum===0?'当前无法补充':!valid?`数量须为 1 至 ${maximum} 的整数`
    :item?.hatches?`本次最多补充 ${maximum} 份`:'免费补给，无需等待');
  return {maximum,count,valid,presets,locked,canBuy:!!item&&valid&&!locked,hint};
}
