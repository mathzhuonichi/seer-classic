// Pure views of the item bag: which items a pocket lists, the action for the selected item, and its feedback.
import type { DispatchResult, GameAction } from '../../kernel/contract.ts';
import type { ItemView, MonsterView } from '../../shared/views.ts';
import {battleSupplyOrder,itemContentCategory,itemPocket,type ItemPocket} from '../../shared/item-categories.ts';

/** Stock shown on tiles and in details. */
export const itemStock=(item:{count:number;unlimited?:boolean})=>item.unlimited?'∞' as const:item.count;

export const pocketItems=(items:readonly ItemView[],pocket:ItemPocket)=>items.filter(item=>itemPocket(item.kind)===pocket);

/** One pocket's items in a content category ('all' for any) whose name contains `search`, by name; supplies list recovery first. */
export function bagItems(inPocket:readonly ItemView[],pocket:ItemPocket,content:string,search:string):ItemView[] {
  return inPocket.filter(item=>item.name.includes(search)&&(content==='all'||itemContentCategory(item)===content))
    .sort((a,b)=>pocket==='battle'&&battleSupplyOrder(a)-battleSupplyOrder(b)||a.name.localeCompare(b.name,'zh'));
}

/** The action the confirm button dispatches for `item` on monster `target`, or undefined when the bag cannot use it so; a capsule needs `canCapture`. */
export function itemUseAction(item:ItemView,target:string|undefined,canCapture:boolean):GameAction|undefined {
  if(item.useAction==='capture')return canCapture?{type:'capture',itemId:item.id}:undefined;
  if(item.useAction==='hatch')return {type:'useItem',uid:target??'',itemId:item.id};
  if(item.useAction!=='use'||!target||!item.useTargets?.includes(target))return undefined;
  return item.kind==='battle'?{type:'battleItem',itemId:item.id,targetUid:target}:{type:'useItem',uid:target,itemId:item.id};
}

/** Feedback after the use action: the controller's notice (a catch, a hatch, a failure), else what was used. */
export function itemUseFeedback(result:DispatchResult,item:ItemView,target?:MonsterView):string {
  return result.notice??(item.useAction==='capture'?`已使用${item.name}，本次捕捉未成功。`:`已对${target?.name??'选中的精灵'}使用${item.name}。`);
}
