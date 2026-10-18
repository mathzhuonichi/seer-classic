// The feature registry: dispatch routes actions through it and the snapshot is the union of its slices.
import { battleFeature } from '../features/battle/index.ts';
import { challengesFeature } from '../features/challenges/index.ts';
import { collectionFeature } from '../features/collection/index.ts';
import { engravingsFeature } from '../features/engravings/index.ts';
import { itemsFeature } from '../features/items/index.ts';
import { raisingFeature } from '../features/raising/index.ts';
import type { Feature, GameContext, HandlerResult, Runtime } from './api.ts';
import type { KernelAction, KernelSlice } from './contract.ts';

const kernelFeature: Feature<KernelAction, KernelSlice> = {
  actions: { dismissNotice: rt => { rt.notices = []; } },
  inBattle: ['dismissNotice'],
  slice: () => rt => ({ notices: [...rt.notices] }),
};

/** A feature as the kernel sees it; each entry is checked against its own `Feature<A, S>` where it is defined. */
interface RegisteredFeature {
  readonly actions: Readonly<Record<string, (rt: Runtime, action: never) => HandlerResult>>;
  readonly inBattle?: readonly string[];
  readonly slice?: (ctx: GameContext) => (rt: Runtime) => object;
}

export const FEATURES: readonly RegisteredFeature[] = [
  kernelFeature, battleFeature, challengesFeature, collectionFeature, engravingsFeature, itemsFeature, raisingFeature,
];
