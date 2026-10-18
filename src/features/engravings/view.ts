// Pure views over the controller's engraving options, shared by the shop page and the PetBag slots.
import type {EngravingView,GameAction,StatKey} from '../../kernel/contract.ts';
import type {EngravingEffectGroup} from '../../domain/engravings/engravings.ts';
import {STAT_KEYS} from '../../../raising/core/types.ts';
import {STAT_LABELS} from '../../shared/labels.ts';

export type EngravingSlot=EngravingView['slot'];
type Holder={uid:string;name:string};

/** Short effect-group names for the PetBag picker tabs. */
export const ENGRAVING_GROUP_SHORT_LABELS:Record<EngravingEffectGroup,string>={
  power:'威力',fixed:'固伤',priority:'先制',accuracy:'命中',hits:'连击',duration:'回合',status:'异常',stages:'能力',drawback:'副作用',other:'其他',
};
/** One tab per stat an ability engraving can raise. */
export const ENGRAVING_STAT_TABS=STAT_KEYS.map(key=>[key,STAT_LABELS[key]] as const);

/** How one option can reach monster `uid`; mirrors the controller's buyEngraving and setEngraving checks. */
export interface EngravingAccessView {
  /** Other monsters that hold this engraving. */
  holders:Holder[];
  /** The chosen transfer source, else the first holder. */
  source?:Holder;
  /** Equipping moves a finite copy from `source`, because stock is empty or the equip cap is reached. */
  moving:boolean;
  /** Unlimited access, stock or a holder makes equipping possible. */
  canEquip:boolean;
  /** Finite copies in stock or equipped, which count against `maxOwned`. */
  owned:number;
  /** No further finite copy can be bought. */
  full:boolean;
}

export function engravingAccessView(option:EngravingView,uid:string,sourceUid=''):EngravingAccessView {
  const holders=(option.equippedHolders??[]).filter(holder=>holder.uid!==uid),owned=option.stock+option.equipped;
  return {
    holders,source:holders.find(holder=>holder.uid===sourceUid)??holders[0],owned,full:!option.unlimited&&owned>=option.maxOwned,
    moving:!option.unlimited&&(!option.stock||option.equipped>=option.maxOwned)&&!option.equippedHere&&holders.length>0,
    canEquip:!!option.unlimited||option.stock>0||holders.length>0,
  };
}

/** Equip (or, with a null id, unload) one slot; a transfer names its source holder. */
export function setEngravingAction(uid:string,slot:EngravingSlot,engravingId:string|null,fromUid?:string):GameAction {
  return {type:'setEngraving',uid,slot,engravingId,...(fromUid?{fromUid}:{})};
}

export const equipButtonLabel=(option:EngravingView,moving:boolean)=>option.equippedHere?'已装备':moving?'确认移装':'确认装备';
export const engravingHolderNames=(option:EngravingView)=>(option.equippedHolders??[]).map(holder=>holder.name).join('、');
/** Tile tooltip note: the equip cap, then the current holders. */
export function engravingCapNote(option:EngravingView):string {
  return `${option.unlimited?'无限装备':`每种上限 ${option.maxOwned}`}${option.equippedHolders?.length?` · 装备于 ${engravingHolderNames(option)}`:''}`;
}
const boundFirst=(a:EngravingView,b:EngravingView)=>Number(b.bound)-Number(a.bound);

export interface EngravingShopFilter {
  slot:'all'|EngravingSlot; kind:'all'|'bound'|'generic';
  /** Ability slot: a stat key, 'all6' for six-stat engravings, or '' for any. */
  stat:string;
  /** Skill slot: a move id or '', and an effect group or ''. */
  move:string; group:string;
  search:string;
}

/** Shop products: the equippable (ready) options that match the filter, bound ones first. */
export function engravingShopProducts(equippable:readonly EngravingView[],f:EngravingShopFilter):EngravingView[] {
  const query=f.search.trim().toLowerCase();
  return equippable.filter(option=>(f.slot==='all'||option.slot===f.slot)&&(f.kind==='all'||(f.kind==='bound')===option.bound)
    &&(f.slot!=='ability'||!f.stat||(f.stat==='all6'?option.statKeys.length===6:option.statKeys.includes(f.stat as StatKey)))
    &&(f.slot!=='skill'||(!f.move||option.moveIds?.includes(Number(f.move)))&&(!f.group||option.group===f.group))
    &&(!query||`${option.name} ${option.effect} ${option.moveName??''}`.toLowerCase().includes(query)))
    .sort(boundFirst);
}

/** The engraved moves among skill options, as [move id, move name], for the shop's move filter. */
export function engravingMoveChoices(options:readonly EngravingView[]):[number,string][] {
  return [...new Map(options.filter(option=>option.slot==='skill').map(option=>[option.moveIds![0],option.moveName??''] as const)).entries()];
}

/** PetBag candidates for one slot: applicable options in stock, unlimited or equipped somewhere, bound ones first. */
export function engravingSlotCandidates(options:readonly EngravingView[],slot:EngravingSlot):EngravingView[] {
  return options.filter(option=>option.slot===slot&&option.ready&&(option.unlimited||option.stock>0||option.equipped>0)).sort(boundFirst);
}

/** PetBag picker tabs: 'all', 'bound', 'generic', then a stat (ability slot) or an effect group (skill slot). */
export function matchesEngravingTab(option:EngravingView,slot:EngravingSlot,tab:string):boolean {
  return tab==='all'||tab==='bound'&&option.bound||tab==='generic'&&!option.bound
    ||(slot==='ability'?option.statKeys.includes(tab as StatKey):option.group===tab);
}
