// Pure rules of the item bag: which items a pocket lists, and how the selected item is used.
// The controller re-checks every rule when the action is dispatched.
import type { GameAction, GameSnapshot } from '../../kernel/contract.ts';
import type { ItemView, MonsterView } from '../../shared/views.ts';
import {battleSupplyOrder,itemContentCategory,itemPocket,type ItemPocket} from '../../shared/item-categories.ts';
import {battleActive} from '../../shared/view-helpers.ts';

type Battle=Pick<GameSnapshot,'battle'>;

/** Stock shown on tiles and in details. */
export const itemStock=(item:{count:number;unlimited?:boolean})=>item.unlimited?'∞' as const:item.count;

export const pocketItems=(items:readonly ItemView[],pocket:ItemPocket)=>items.filter(item=>itemPocket(item.kind)===pocket);

/** One pocket's items in a content category ('all' for any) whose name contains `search`, by name; supplies list recovery first. */
export function bagItems(inPocket:readonly ItemView[],pocket:ItemPocket,content:string,search:string):ItemView[] {
  return inPocket.filter(item=>item.name.includes(search)&&(content==='all'||itemContentCategory(item)===content))
    .sort((a,b)=>pocket==='battle'&&battleSupplyOrder(a)-battleSupplyOrder(b)||a.name.localeCompare(b.name,'zh'));
}

export interface ItemUse {
  /** The bag shows the target picker: raising items, and battle supplies during a battle. */
  picksTarget:boolean;
  /** A capsule, thrown at the wild opponent. */
  captures:boolean;
  /** The bag offers a confirm button for this item. */
  confirmable:boolean;
  /** The confirm button is enabled. */
  enabled:boolean;
}

export function itemUse(s:Battle,item:ItemView,target?:MonsterView):ItemUse {
  const inBattle=battleActive(s),supply=item.kind==='battle'&&item.battleUsable,captures=item.kind==='capsule';
  const enabled=(!!item.unlimited||item.count>0)&&(captures?inBattle&&!!s.battle?.canCapture
    :!!target&&(!inBattle||supply&&!!item.usableTargetUids?.includes(target.uid)));
  const confirmable=item.kind==='raising'||item.kind==='essence'||inBattle&&(captures||supply);
  return {picksTarget:item.kind==='raising'||inBattle&&supply,captures,confirmable,enabled};
}

/** Monsters the bag can target: the battle party during a battle, otherwise every monster. */
export const itemTargets=(s:Pick<GameSnapshot,'battle'|'monsters'>):MonsterView[]=>
  battleActive(s)?s.monsters.filter(m=>s.battle!.party.some(member=>member.uid===m.uid)):s.monsters;

/** The action that uses `item` on `target`, or undefined when the bag cannot use it. */
export function itemUseAction(s:Battle,item:ItemView,target?:MonsterView):GameAction|undefined {
  if(!itemUse(s,item,target).enabled)return undefined;
  if(!battleActive(s))return target&&{type:'useItem',uid:target.uid,itemId:item.id};
  if(item.kind==='capsule')return {type:'capture',itemId:item.id};
  if(!target||item.kind!=='battle'||!item.battleUsable||!s.battle!.party.some(m=>m.uid===target.uid))return undefined;
  return {type:'battleItem',itemId:item.id,targetUid:target.uid};
}

/** Feedback after the use action: what was caught, hatched or used, else the controller's notice. */
export function itemUseFeedback(before:GameSnapshot,after:GameSnapshot,item:ItemView,target?:MonsterView):string {
  // Unlimited items keep their count, so a spent battle turn or a changed target shows the use.
  const used=(after.items.find(i=>i.id===item.id)?.count??0)<item.count||!!item.unlimited&&(battleActive(before)
    ?(after.battle?.turn??0)>(before.battle?.turn??0):JSON.stringify(after.monsters.find(m=>m.uid===target?.uid))!==JSON.stringify(target));
  if(!used)return after.notices[0]??'道具未使用，请查看提示。';
  const known=new Set(before.monsters.map(m=>m.uid)),acquired=after.monsters.find(m=>!known.has(m.uid));
  if(item.kind==='capsule')return acquired?`捕捉成功：${acquired.name}已加入${acquired.inParty?'背包':'仓库'}。`:`已使用${item.name}，本次捕捉未成功。`;
  if(item.kind==='essence')return `孵化成功：${acquired?.name??'新精灵'}已加入${acquired?.inParty?'背包':'仓库'}。`;
  return `已对${target?.name??'选中的精灵'}使用${item.name}。`;
}
