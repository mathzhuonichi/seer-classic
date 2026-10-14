export interface CollectionSpecies {id:number;evolves_from?:number|null;evolution:readonly {to:number}[]}

/** Collection credit follows all directed ancestors, without creating monsters or sibling credit. */
export function buildCollectionAncestry(species:readonly CollectionSpecies[]):ReadonlyMap<number,readonly number[]> {
 const definitions=new Set(species.map(row=>row.id)),parents=new Map<number,Set<number>>(species.map(row=>[row.id,new Set()]));
 for(const row of species){
  if(row.evolves_from&&definitions.has(row.evolves_from))parents.get(row.id)!.add(row.evolves_from);
  for(const edge of row.evolution)if(definitions.has(edge.to))parents.get(edge.to)!.add(row.id);
 }
 return new Map(species.map(row=>{
  const ancestors=new Set<number>(),visited=new Set([row.id]),queue=[...parents.get(row.id)!];
  for(let i=0;i<queue.length;i++){const id=queue[i];if(visited.has(id))continue;visited.add(id);ancestors.add(id);queue.push(...parents.get(id)!)}
  return [row.id,[...ancestors]];
 }));
}
