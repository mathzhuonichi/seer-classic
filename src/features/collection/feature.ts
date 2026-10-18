// features/collection's registration: fusion and breeding, and the dex and encounter catalogue slices.
import type { BossView, SpeciesView } from '../../shared/views.ts';
import type { Feature } from '../../kernel/api.ts';
import { collectionActions } from './actions.ts';
import { catalogViews } from './encounter-views.ts';

export type CollectionAction =
  | {type: 'fuse'; recipeId: string; primaryUid: string; secondaryUid: string}
  | {type: 'breed'; recipeId: string; firstUid: string; secondUid: string};
export interface CollectionSlice { bosses: BossView[]; species: SpeciesView[] }

export const collectionFeature: Feature<CollectionAction, CollectionSlice> = {
  actions: collectionActions,
  slice: ctx => {
    const catalog = catalogViews(ctx);
    return ({ save }) => ({ bosses: catalog.bosses(save.progress.bosses_cleared, save.progress.boss_attempts), species: catalog.species(save.dex.owned) });
  },
};
