// features/collection's registration: fusion and breeding, and the dex, recipe and encounter catalogue slices.
import type { BossView, SpeciesView } from '../../shared/views.ts';
import type { Feature } from '../../kernel/api.ts';
import { collectionActions } from './actions.ts';
import { catalogViews } from './encounter-views.ts';
import { dexViews, recipeViews, type BreedingRecipeRow, type DexView, type FusionRecipeRow } from './view.ts';

export type CollectionAction =
  | {type: 'fuse'; recipeId: string; primaryUid: string; secondaryUid: string}
  | {type: 'breed'; recipeId: string; firstUid: string; secondUid: string};
export interface CollectionSlice {
  bosses: BossView[]; species: SpeciesView[]; dex: DexView; fusion: {recipes: FusionRecipeRow[]}; breeding: {recipes: BreedingRecipeRow[]};
}

export const collectionFeature: Feature<CollectionAction, CollectionSlice> = {
  actions: collectionActions,
  slice: ctx => {
    const catalog = catalogViews(ctx), dex = dexViews(ctx), recipes = recipeViews(ctx);
    return ({ save }) => {
      const species = catalog.species(save.dex.owned);
      return { bosses: catalog.bosses(save.progress.bosses_cleared, save.progress.boss_attempts), species, dex: dex(species), ...recipes(save.storage) };
    };
  },
};
