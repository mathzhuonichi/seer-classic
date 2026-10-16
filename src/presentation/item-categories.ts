/** Presentation-only groups shared by the bag, shop and creature item panel. */
export const RAISING_ITEM_CATEGORIES=[['all','全部'],['level','等级'],['nature','性格'],['ev','学习力'],['bead','能量珠'],['restore','还原'],['other','其他']] as const;
export type RaisingItemCategory=typeof RAISING_ITEM_CATEGORIES[number][0];
export const BATTLE_ITEM_CATEGORIES=[['all','全部'],['hp','体力'],['pp','PP'],['status','异常']] as const;
export const ESSENCE_ITEM_CATEGORIES=[['all','全部'],['essence','精元'],['fusion','元神珠']] as const;

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
  if(item.kind==='battle')return item.id==='item_status_cure'?'status':item.id.startsWith('item_potion_pp_')?'pp':item.id.startsWith('item_potion_hp_')?'hp':'other';
  if(item.kind==='essence')return item.id.startsWith('fusion_bead_')?'fusion':'essence';
  return 'other';
}

/** Do not spend a row on categories that have no items in the current source. */
export function itemCategoryOptions(kind:string,items:readonly {id:string;kind:string}[]):readonly (readonly [string,string])[] {
  const definitions=kind==='raising'?RAISING_ITEM_CATEGORIES:kind==='battle'?BATTLE_ITEM_CATEGORIES:kind==='essence'?ESSENCE_ITEM_CATEGORIES:[];
  return definitions.filter(([id])=>id==='all'||items.some(item=>itemContentCategory(item)===id));
}
