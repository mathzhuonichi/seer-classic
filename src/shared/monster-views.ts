// Pure views over monsters and species shared by the panels (PetBag, modifier, dex, recipes); party order is in party-order.ts.
import type { MonsterView } from './views.ts';
import type { StatBlock } from '../../raising/core/types.ts';
import {STAT_KEYS} from '../../raising/core/types.ts';

interface NamedSpecies { readonly id: number; readonly name: string }
export type SpeciesName = (id: number) => string;
const namers = new WeakMap<readonly NamedSpecies[], SpeciesName>();

/** The species drawn for a monster: its chosen skin, else its own form. */
export const appearanceOf=(m:Pick<MonsterView,'species'|'appearanceSpecies'>)=>m.appearanceSpecies??m.species;

/** A species' Chinese name, or `fallback` when the list has no such species. */
export const speciesName=(s:{species:readonly NamedSpecies[]},id:number,fallback:string)=>s.species.find(row=>row.id===id)?.name??fallback;

/**
 * Display-name lookup over a species list, normally `snapshot.species`; an id the list lacks reads `精灵 <id>`.
 * The lookup is cached per list, so it keeps its identity until the list changes.
 */
export function speciesNamer(species: readonly NamedSpecies[]): SpeciesName {
  let namer = namers.get(species);
  if (!namer) {
    const names = new Map(species.map(row => [row.id, row.name]));
    namer = id => names.get(id) ?? `精灵 ${id}`;
    namers.set(species, namer);
  }
  return namer;
}

/** The four-digit 精灵编号 shown on cards and in the dex. */
export const speciesNumber=(id:number)=>String(id).padStart(4,'0');

/** Sum of a six-stat block (种族值合计, 学习力总和). */
export const statTotal=(stats:StatBlock)=>STAT_KEYS.reduce((sum,key)=>sum+stats[key],0);
