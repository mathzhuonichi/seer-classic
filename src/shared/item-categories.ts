// The one source of item groupings: bag pockets (also the shop's item categories), the battle
// item bag's sections, and the content categories inside a pocket. Pure data and rules on ids.
type Tabs=readonly (readonly [string,string])[];

/** Bag pockets in display order; item kinds without a pocket of their own go to 'other'. */
export const ITEM_POCKETS=[['raising','培养'],['battle','补给'],['capsule','胶囊'],['essence','精元'],['other','其他']] as const;
export type ItemPocket=typeof ITEM_POCKETS[number][0];
/** Pocket titles for the shop's product heading. */
export const ITEM_POCKET_TITLES:Record<ItemPocket,string>={raising:'培养道具',battle:'战斗补给',capsule:'精灵胶囊',essence:'精元 / 元神珠',other:'其他'};
export const isItemPocket=(id:string):id is ItemPocket=>ITEM_POCKETS.some(([pocket])=>pocket===id);
export const itemPocket=(kind:string):ItemPocket=>isItemPocket(kind)?kind:'other';
/** An item kind as the bag detail names it; kinds without a pocket of their own read 其他道具. */
export const itemKindLabel=(kind:string)=>ITEM_POCKETS.find(([id])=>id===kind)?.[1]??'其他道具';

/** Sections of the battle item bag, in display order; the controller sets `ItemView.battleCategory`. */
export const BATTLE_SUPPLY_CATEGORIES=[['recovery','体力 / PP 恢复'],['capsule','精灵胶囊'],['status','异常解除']] as const;
export type BattleSupplyCategory=typeof BATTLE_SUPPLY_CATEGORIES[number][0];
type BattleSupply={kind:string;battleCategory?:BattleSupplyCategory};
/** Supplies without battle effects are listed with the recovery items. */
const battleSupplyCategory=(item:BattleSupply):BattleSupplyCategory=>item.battleCategory??(item.kind==='capsule'?'capsule':'recovery');
export const battleSupplyOrder=(item:BattleSupply)=>BATTLE_SUPPLY_CATEGORIES.findIndex(([id])=>id===battleSupplyCategory(item));
export const battleSupplyLabel=(item:BattleSupply)=>BATTLE_SUPPLY_CATEGORIES[battleSupplyOrder(item)][1];

/** Content categories of the raising pocket, also used by the creature item panel. */
export const RAISING_ITEM_CATEGORIES=[['all','全部'],['level','等级'],['nature','性格'],['ev','学习力'],['bead','能量珠'],['restore','还原'],['other','其他']] as const;
export type RaisingItemCategory=typeof RAISING_ITEM_CATEGORIES[number][0];
const CONTENT_CATEGORIES:Partial<Record<string,Tabs>>={
  raising:RAISING_ITEM_CATEGORIES,
  battle:[['all','全部'],['hp','体力'],['pp','PP'],['status','异常']],
  essence:[['all','全部'],['essence','精元'],['fusion','元神珠']],
};

export function raisingItemCategory(item:{id:string}):Exclude<RaisingItemCategory,'all'> {
  if(item.id.startsWith('item_level_')||item.id.startsWith('item_exp_'))return 'level';
  if(item.id.startsWith('item_nature_'))return 'nature';
  if(item.id.startsWith('item_ev_'))return 'ev';
  if(item.id.startsWith('item_bead_'))return 'bead';
  if(item.id==='item_restore')return 'restore';
  return 'other';
}

export function itemContentCategory(item:{id:string;kind:string}):string {
  if(item.kind==='raising')return raisingItemCategory(item);
  if(item.kind==='battle')return item.id==='item_status_cure'?'status'
    :item.id.startsWith('item_potion_pp_')?'pp':item.id.startsWith('item_potion_hp_')?'hp':'other';
  if(item.kind==='essence')return item.id.startsWith('fusion_bead_')?'fusion':'essence';
  return 'other';
}

/** Do not spend a row on categories that have no items in the current source. */
export function itemCategoryOptions(kind:string,items:readonly {id:string;kind:string}[]):Tabs {
  return (CONTENT_CATEGORIES[kind]??[]).filter(([id])=>id==='all'||items.some(item=>itemContentCategory(item)===id));
}
