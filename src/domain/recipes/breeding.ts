import source from '../../../data/breeding.json';

/** Species-fixed original Gender: 0 unspecified, 1 male, 2 female. */
export type BreedingGender = 0 | 1 | 2;
export interface BreedingOutcome { species: number; weight: number }
export interface BreedingRecipe {
  id: string;
  name: string;
  originalEggId: number;
  maleSpecies: readonly number[];
  femaleSpecies: readonly number[];
  minLevel: number;
  maleInitialSpecies: number;
  femaleInitialSpecies: number;
  offspringSpecies: number;
  outcomes: readonly BreedingOutcome[];
}
export interface BreedingParent {
  uid: string;
  species: number;
  level: number;
  /** Legacy acquired creatures are first-generation unless explicitly recorded. */
  generation?: number;
}

export const BREEDING_RECIPES: readonly BreedingRecipe[] = source.recipes;
const genders: Readonly<Record<string, number>> = source.genderBySpecies;

export function getBreedingGender(species: number): BreedingGender {
  const gender = genders[String(species)];
  return gender === 1 || gender === 2 ? gender : 0;
}

/** The source table specifies exact mature forms, not an elemental or family rule. */
export function findBreedingRecipe(firstSpecies: number, secondSpecies: number): BreedingRecipe | undefined {
  return BREEDING_RECIPES.find(recipe =>
    (recipe.maleSpecies.includes(firstSpecies) && recipe.femaleSpecies.includes(secondSpecies))
    || (recipe.femaleSpecies.includes(firstSpecies) && recipe.maleSpecies.includes(secondSpecies)));
}

/** Controller must supply two creatures currently owned by the player. */
export function canBreedParents(recipe: BreedingRecipe, first: BreedingParent, second: BreedingParent): boolean {
  const official = findBreedingRecipe(first.species, second.species);
  if (!official || official.id !== recipe.id || !first.uid || !second.uid || first.uid === second.uid) return false;
  const male = official.maleSpecies.includes(first.species) ? first : second;
  const female = male === first ? second : first;
  return getBreedingGender(male.species) === 1 && getBreedingGender(female.species) === 2
    && Number.isInteger(male.level) && Number.isInteger(female.level)
    && male.level >= official.minLevel && female.level >= official.minLevel
    && (male.generation ?? 0) === 0;
}

export function breedingEggItemId(species: number): string {
  if (!BREEDING_RECIPES.some(recipe => recipe.outcomes.some(outcome => outcome.species === species))) {
    throw new Error('Unknown breeding offspring.');
  }
  return `breeding_egg_${species}`;
}

/** Exact original outcome probabilities; the controller owns random generation. */
export function chooseBreedingOutcome(recipe: BreedingRecipe, roll: number): BreedingOutcome {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError('Breeding roll must be in [0, 1).');
  const official = BREEDING_RECIPES.find(entry => entry.id === recipe.id);
  if (!official) throw new Error('Unknown breeding recipe.');
  let threshold = 0;
  for (const outcome of official.outcomes) {
    threshold += outcome.weight / 100;
    if (roll < threshold) return outcome;
  }
  return official.outcomes[official.outcomes.length - 1];
}
