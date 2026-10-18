import {ancestorsOf,buildPredecessors,type LineageSpecies} from './species-graph.ts';

export type CollectionSpecies=LineageSpecies;

/** Collection credit follows all directed ancestors, without creating monsters or sibling credit. */
export function buildCollectionAncestry(species:readonly CollectionSpecies[]):ReadonlyMap<number,readonly number[]> {
  const predecessors=buildPredecessors(species);
  return new Map(species.map(row=>[row.id,ancestorsOf(row.id,predecessors)]));
}
