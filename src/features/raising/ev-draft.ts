// The 学习力 editor's draft (one text field per stat), checked against the raising caps, and the check for any typed whole number.
import {STAT_KEYS,type StatBlock,type StatKey} from '../../../raising/core/types.ts';
import {EV_STAT_CAP,EV_TOTAL_CAP} from '../../../raising/core/stats.ts';

export type EvDraft=Record<StatKey,string>;

/** Two-stat 255 + 255 spreads offered by the editor. */
export const EV_PRESETS:Readonly<Record<string,readonly [StatKey,StatKey]>>={
  '物攻 + 速度':['atk','spe'],'特攻 + 速度':['spa','spe'],'体力 + 防御':['hp','def'],'体力 + 特防':['hp','spd'],
};

const draftOf=(value:(key:StatKey)=>string)=>Object.fromEntries(STAT_KEYS.map(key=>[key,value(key)])) as EvDraft;

export const evDraft=(evs:StatBlock)=>draftOf(key=>String(evs[key]));
export const clearedDraft=()=>draftOf(()=>'0');
export const presetDraft=(name:string)=>draftOf(key=>EV_PRESETS[name].includes(key)?String(EV_STAT_CAP):'0');
export const draftEvs=(draft:EvDraft)=>Object.fromEntries(STAT_KEYS.map(key=>[key,Number(draft[key])])) as StatBlock;
export const sameEvs=(draft:EvDraft,evs:StatBlock)=>STAT_KEYS.every(key=>draft[key]===String(evs[key]));

/** A typed whole number from `min` to `max`, or undefined for a blank or invalid field. */
export function wholeNumber(text:string,min:number,max:number):number|undefined {
  const value=Number(text);
  return text.trim()!==''&&Number.isInteger(value)&&value>=min&&value<=max?value:undefined;
}

/** `valid`: every field is a whole number from 0 to the per-stat cap; `fits`: valid and within the total cap. */
export function checkEvDraft(draft:EvDraft) {
  const valid=STAT_KEYS.every(key=>wholeNumber(draft[key],0,EV_STAT_CAP)!==undefined);
  const total=STAT_KEYS.reduce((sum,key)=>sum+Number(draft[key]),0);
  return {valid,total,over:total>EV_TOTAL_CAP,fits:valid&&total<=EV_TOTAL_CAP};
}
