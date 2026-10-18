import source from '../../../data/fusion.json';

/** Source-calibrated parent pairs; remake rates are documented in fusion-source-v17.md. */
export interface FusionOutcome {
  /** The infant species hatched from this bead, never the evolved showcase form. */
  species: number;
  /** Explicit percent probability. All outcome weights in a recipe sum to 100. */
  weight: number;
  rare?: boolean;
  beadName: string;
}
export interface FusionRecipe {
  id: string;
  name: string;
  /** Exact permitted primary species: original final forms only. */
  primary: number[];
  /** Permitted secondary species: every retained, eligible family form. */
  secondary: number[];
  /** No extra training threshold: the required primary form supplies the evolution gate. */
  minPrimaryLevel: number;
  minSecondaryLevel: number;
  beadName: string;
  outcomes: FusionOutcome[];
  sources: string[];
  /** 'remake': explicit playable settings, not recovered original server rates. */
  probabilityBasis: string;
}
export interface FusionParent { species: number; level: number }

/** User-facing remake calibration, independently adjustable from source-backed pairs. */
export const FUSION_RARE_PROBABILITIES = source.rareProbabilities;
const rareRates: Readonly<Record<string, number>> = FUSION_RARE_PROBABILITIES;

/** As stored, a rare outcome names its rate and the ordinary outcome beside it states no weight. */
type StoredOutcome = Omit<FusionOutcome, 'weight' | 'rare'> & { weight?: number; rare?: string };
const stored: readonly (Omit<FusionRecipe, 'outcomes'> & { outcomes: StoredOutcome[] })[] = source.recipes;

/** No failure outcome, material cost, timer, or parent mutation is implemented here. */
export const FUSION_RECIPES: readonly FusionRecipe[] = stored.map(recipe => {
  const key = recipe.outcomes.find(outcome => outcome.rare)?.rare, rate = key ? rareRates[key] : 0;
  return { ...recipe, outcomes: recipe.outcomes.map(({ weight, rare, ...outcome }) =>
    rare ? { ...outcome, weight: rate, rare: true } : { ...outcome, weight: weight ?? 100 - rate }) };
});

export function canFuseParents(recipe: FusionRecipe, primary: FusionParent, secondary: FusionParent): boolean {
  return recipe.primary.includes(primary.species) && recipe.secondary.includes(secondary.species)
    && primary.level >= recipe.minPrimaryLevel && secondary.level >= recipe.minSecondaryLevel;
}

/** The controller owns random generation and parent retention; this selector is pure. */
export function chooseFusionOutcome(recipe: FusionRecipe, roll: number): FusionOutcome {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError('Fusion roll must be in [0, 1).');
  let threshold = 0;
  for (const outcome of recipe.outcomes) {
    threshold += outcome.weight / 100;
    if (roll < threshold) return outcome;
  }
  // Accommodate floating-point rounding for three equal one-third outcomes.
  return recipe.outcomes[recipe.outcomes.length - 1];
}

export function fusionBeadItemId(species: number): string {
  return `fusion_bead_${species}`;
}
