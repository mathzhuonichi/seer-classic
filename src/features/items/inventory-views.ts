// Pure views of the item bag: which items a pocket lists, the action for the selected item, and its feedback.
import type { DispatchResult, GameAction } from '../../kernel/contract.ts';
import type { ItemView, MonsterView } from '../../shared/views.ts';
import {battleSupplyOrder,itemContentCategory,itemPocket,type ItemPocket} from '../../shared/item-categories.ts';
import {pinnedSelection} from '../../shared/view-helpers.ts';

/** Stock shown on tiles and in details. */
export const itemStock=(item:{count:number;unlimited?:boolean})=>item.unlimited?'∞' as const:item.count;

export const pocketItems=(items:readonly ItemView[],pocket:ItemPocket)=>items.filter(item=>itemPocket(item.kind)===pocket);

/** One pocket's items in a content category ('all' for any) whose name contains `search`, by name; supplies list recovery first. */
export function bagItems(inPocket:readonly ItemView[],pocket:ItemPocket,content:string,search:string):ItemView[] {
  return inPocket.filter(item=>item.name.includes(search)&&(content==='all'||itemContentCategory(item)===content))
    .sort((a,b)=>pocket==='battle'&&battleSupplyOrder(a)-battleSupplyOrder(b)||a.name.localeCompare(b.name,'zh'));
}

/**
 * The bag's selected item. Until the player picks one (`pickedId` is empty) the first item on the page is shown; a picked item
 * that has run out selects nothing, so the confirm button cannot use up a different item.
 */
export function bagSelection(items:readonly ItemView[],pageItems:readonly ItemView[],pickedId:string):ItemView|undefined {
  return pinnedSelection(items,pickedId,pageItems[0]??items[0]);
}

/** What moves the bag's pick: a tile click, a use, opening a pocket (on the item a link names), a list change, the content filter falling back. */
export type BagPickEvent={type:'pick'|'use';itemId:string}|{type:'open';itemId?:string}|{type:'clear'}|{type:'fallback'};

/**
 * The bag's pick after `event` ('' for nothing picked yet). Picking or using an item pins it, so once it runs out nothing is
 * selected; a link stays named even when the bag holds none of that item; search, a content tab, a page turn or a load clear
 * the pick; the content filter falling back to 全部 keeps it.
 */
export function nextBagPick(pick:string,event:BagPickEvent):string {
  if(event.type==='clear')return '';
  return event.type==='fallback'?pick:event.itemId??'';
}

/** The page of `items` that lists `itemId`, or 0 when it is not listed. */
export const pageOf=(items:readonly {id:string}[],itemId:string,pageSize:number)=>Math.max(0,Math.floor(items.findIndex(item=>item.id===itemId)/pageSize));

/** The action the confirm button dispatches for `item` on monster `target`, or undefined when the bag cannot use it so; a capsule needs `canCapture`. */
export function itemUseAction(item:ItemView,target:string|undefined,canCapture:boolean):GameAction|undefined {
  if(item.useAction==='capture')return canCapture?{type:'capture',itemId:item.id}:undefined;
  if(!target||!(item.useAction==='hatch'||item.useAction==='use'&&item.useTargets?.includes(target)))return undefined;
  return item.kind==='battle'?{type:'battleItem',itemId:item.id,targetUid:target}:{type:'useItem',uid:target,itemId:item.id};
}

/** Feedback after the use action: the controller's notice (a catch, a hatch, a failure), else what was used. */
export function itemUseFeedback(result:DispatchResult,item:ItemView,target?:MonsterView):string {
  return result.notice??(item.useAction==='capture'?`已使用${item.name}，本次捕捉未成功。`:`已对${target?.name??'选中的精灵'}使用${item.name}。`);
}
