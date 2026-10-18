import {ancestorsOf,buildPredecessors,type LineageSpecies} from './species-graph.ts';

export interface SkinMonster {species:number;skinSpecies?:number}

/** Appearance permission follows executable directed ancestry, never family-wide membership. */
export function buildSkinOptions(species:readonly Pick<LineageSpecies,'id'|'evolution'>[]):ReadonlyMap<number,readonly number[]> {
  const predecessors=buildPredecessors(species,'evolution');
  return new Map(species.map(row=>[row.id,[row.id,...ancestorsOf(row.id,predecessors)]]));
}

export function appearanceSpecies(mon:SkinMonster,options:ReadonlyMap<number,readonly number[]>):number {
  return Number.isInteger(mon.skinSpecies)&&options.get(mon.species)?.includes(mon.skinSpecies!)?mon.skinSpecies!:mon.species;
}

/** Optional cosmetic corruption must not invalidate otherwise valid legacy saves. */
export function sanitizeSkin(mon:SkinMonster,options:ReadonlyMap<number,readonly number[]>):void {
  if(mon.skinSpecies===mon.species||appearanceSpecies(mon,options)!==mon.skinSpecies)delete mon.skinSpecies;
}
