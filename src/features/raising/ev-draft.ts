// The 学习力 editor's draft (one text field per stat), checked against the raising caps.
import type { StatKey, StatBlock as Stats } from '../../../raising/core/types.ts';
import {STAT_KEYS} from '../../../raising/core/types.ts';
import {EV_STAT_CAP,EV_TOTAL_CAP} from '../../../raising/core/stats.ts';

export type EvDraft=Record<StatKey,string>;

/** Two-stat 255 + 255 spreads offered by the editor. */
export const EV_PRESETS:Readonly<Record<string,readonly [StatKey,StatKey]>>={
  '物攻 + 速度':['atk','spe'],'特攻 + 速度':['spa','spe'],'体力 + 防御':['hp','def'],'体力 + 特防':['hp','spd'],
};

const draftOf=(value:(key:StatKey)=>string)=>Object.fromEntries(STAT_KEYS.map(key=>[key,value(key)])) as EvDraft;

export const evDraft=(evs:Stats)=>draftOf(key=>String(evs[key]));
export const clearedDraft=()=>draftOf(()=>'0');
export const presetDraft=(name:string)=>draftOf(key=>EV_PRESETS[name].includes(key)?String(EV_STAT_CAP):'0');
export const draftEvs=(draft:EvDraft)=>Object.fromEntries(STAT_KEYS.map(key=>[key,Number(draft[key])])) as Stats;
export const sameEvs=(draft:EvDraft,evs:Stats)=>STAT_KEYS.every(key=>draft[key]===String(evs[key]));

/** One stat's 学习力: a whole number from 0 to the per-stat cap. */
export const isEvValue=(value:number)=>Number.isInteger(value)&&value>=0&&value<=EV_STAT_CAP;

/** `valid`: every field is filled and in range; `fits`: valid and within the total cap. */
export function checkEvDraft(draft:EvDraft) {
  const valid=STAT_KEYS.every(key=>draft[key].trim()!==''&&isEvValue(Number(draft[key])));
  const total=STAT_KEYS.reduce((sum,key)=>sum+Number(draft[key]),0);
  return {valid,total,over:total>EV_TOTAL_CAP,fits:valid&&total<=EV_TOTAL_CAP};
}
