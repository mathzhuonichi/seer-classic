import type { SpeciesView } from '../game-types';

export interface WorldCreatureInstance {
  /** Stable within a scene: use this for React keys and individual selection. */
  instanceId: string;
  species: SpeciesView;
  /** Zero-based occurrence within this species, independent of other species. */
  ordinal: number;
  scarce: boolean;
  level: number;
}

// Conservative scene-density policy for the existing classic rare encounters.
// The catalog's broad `wild` obtain flag does not encode encounter frequency.
// Keep these species singular; this is not an original spawn-rate simulation.
const scarceSpecies = new Set([27, 53, 65, 77, 83, 108, 128, 133, 136, 153, 164, 203, 480]);

/** Populate only the supplied habitat; empty or exclusively scarce habitats stay sparse. */
export function buildWorldPopulation(
  sceneId: string,
  habitatSpecies: readonly SpeciesView[],
  targetCount = 6,
  levels: readonly [number, number] = [1, 1],
): WorldCreatureInstance[] {
  const habitat = [...new Map(habitatSpecies.map(species => [species.id, species])).values()];
  const instances: WorldCreatureInstance[] = [];
  const counts = new Map<number, number>();
  const add = (species: SpeciesView) => {
    const ordinal = counts.get(species.id) ?? 0;
    counts.set(species.id, ordinal + 1);
    const level = levels[0] + (species.id + ordinal) % (levels[1] - levels[0] + 1);
    instances.push({ instanceId: `${sceneId}:${species.id}:${ordinal}`, species, ordinal, level,
      scarce: scarceSpecies.has(species.id) });
  };

  // Retain each existing habitat species before distributing ordinary duplicates.
  habitat.forEach(add);
  const ordinary = habitat.filter(species => !scarceSpecies.has(species.id));
  if (!ordinary.length) return instances;
  const goal = Math.max(habitat.length, targetCount);
  for (let index = 0; instances.length < goal; index++) add(ordinary[index % ordinary.length]);
  return instances;
}
