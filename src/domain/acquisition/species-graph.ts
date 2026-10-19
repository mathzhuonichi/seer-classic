export interface LineageSpecies {id:number;evolves_from?:number|null;evolution:readonly {to:number}[]}
export type LineageLinks='ancestry'|'evolution';

/** Direct predecessors inside the catalog: forward evolution edges, plus the source `evolves_from` link for 'ancestry'. */
export function buildPredecessors(species:readonly LineageSpecies[],links:LineageLinks='ancestry'):Map<number,Set<number>> {
  const ids=new Set(species.map(row=>row.id)),predecessors=new Map(species.map(row=>[row.id,new Set<number>()]));
  for(const row of species){
    if(links==='ancestry'&&row.evolves_from&&ids.has(row.evolves_from))predecessors.get(row.id)!.add(row.evolves_from);
    for(const edge of row.evolution)if(ids.has(edge.to))predecessors.get(edge.to)!.add(row.id);
  }
  return predecessors;
}

/** Every ancestor of `id`, nearest first (breadth-first), never including `id` itself. */
export function ancestorsOf(id:number,predecessors:ReadonlyMap<number,ReadonlySet<number>>):number[] {
  const visited=new Set([id]),ancestors:number[]=[],queue=[...predecessors.get(id)??[]];
  for(let index=0;index<queue.length;index++){
    const current=queue[index];if(visited.has(current))continue;
    visited.add(current);ancestors.push(current);queue.push(...predecessors.get(current)!);
  }
  return ancestors;
}

/** The initial form of `id`'s line: its nearest ancestor without a predecessor, or `id` itself when it has none. */
export function initialFormOf(id:number,predecessors:ReadonlyMap<number,ReadonlySet<number>>):number {
  return ancestorsOf(id,predecessors).find(ancestor=>!predecessors.get(ancestor)!.size)??id;
}
