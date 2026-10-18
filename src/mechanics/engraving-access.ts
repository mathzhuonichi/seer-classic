import type {EngravingDefinition} from './engravings.ts';

/** Remake balance limits apply per generic ability engraving, including equipped copies.
 * HP gains are larger numerically; Speed receives extra weight for turn order.
 * These are authored access rules, not historical Countermark ownership values.
 */
export function engravingAccess(def:EngravingDefinition):{unlimited:boolean;maxOwned:number} {
  if(def.slot!=='ability'||def.species.length)return {unlimited:true,maxOwned:def.maxOwned};
  const weights={hp:.8,atk:1,def:1,spa:1,spd:1,spe:2};
  const gain=Object.entries(def.stats).reduce((sum,[key,value])=>sum+(value??0)*weights[key as keyof typeof weights],0);
  return {unlimited:false,maxOwned:gain>=35?1:gain>=30?2:gain>=25?3:gain>=20?4:6};
}
