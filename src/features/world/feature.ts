// features/world's registration: the world-map contact that starts a training battle.
import type { Feature } from '../../kernel/api.ts';
import { startTraining } from './training.ts';

export type WorldAction = {type: 'startTraining'; species?: number; level?: number; planetId?: string; regionId?: string};

export const worldFeature: Feature<WorldAction> = { actions: { startTraining } };
