import type { AcquisitionAllowance } from '../../shared/views.ts';
export const SPECIES_COPY_LIMIT = 6;
export interface AcquisitionStock {
  storage: readonly {uid:string;species:number}[];
  items: Readonly<Record<string,number>>;
}
export interface EssenceDefinition {id:string;kind?:string;hatches?:number}

/** Party members already belong to storage; every essence alias reserves one copy. */
export function acquisitionAllowance(stock:AcquisitionStock, items:readonly EssenceDefinition[], species:number, excludeUid?:string):AcquisitionAllowance {
  const owned=stock.storage.filter(mon=>mon.species===species&&mon.uid!==excludeUid).length;
  const reserved=items.reduce((sum,item)=>sum+(item.kind==='essence'&&item.hatches===species?(stock.items[item.id]??0):0),0);
  return {owned,reserved,remaining:Math.max(0,SPECIES_COPY_LIMIT-owned-reserved),limit:SPECIES_COPY_LIMIT};
}

export function acquisitionLimitReason(name:string, allowance:AcquisitionAllowance):string {
  return `${name}最多保留 ${allowance.limit} 份（已有 ${allowance.owned} 只、待孵化 ${allowance.reserved} 份）。`;
}
