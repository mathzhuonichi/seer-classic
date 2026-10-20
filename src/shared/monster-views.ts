// Pure views over monsters and species shared by the panels (PetBag, modifier, dex, recipes); party order is in party-order.ts.
import type { MonsterView } from './views.ts';
import type { Nature, StatBlock } from '../../raising/core/types.ts';
import {STAT_KEYS} from '../../raising/core/types.ts';
import {natureMultiplier, type StatKey} from '../../raising/core/stats.ts';
import {STAT_LABELS} from './labels.ts';

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

/** The effect text of a 性格 that changes no stat. */
export const NEUTRAL_NATURE_TEXT='各项能力均无修正';
/** A 性格's stat correction from the raising rules: 攻击 +10%，防御 -10%. */
export function natureEffect(nature:Pick<Nature,'plus'|'minus'>):string{
  const percent=(stat:StatKey)=>Math.round((natureMultiplier(nature,stat)-1)*100);
  const [plus,minus]=[percent(nature.plus),percent(nature.minus)];
  return plus||minus?`${STAT_LABELS[nature.plus]} +${plus}%，${STAT_LABELS[nature.minus]} ${minus}%`:NEUTRAL_NATURE_TEXT;
}
