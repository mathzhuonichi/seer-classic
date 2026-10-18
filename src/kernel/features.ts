// The feature registry: dispatch routes actions through it and the snapshot is the union of its slices.
import { battleFeature } from '../features/battle/index.ts';
import { challengesFeature } from '../features/challenges/index.ts';
import { collectionFeature } from '../features/collection/index.ts';
import { engravingsFeature } from '../features/engravings/index.ts';
import { itemsFeature } from '../features/items/index.ts';
import { raisingFeature } from '../features/raising/index.ts';
import { worldFeature } from '../features/world/index.ts';
import type { Feature, GameContext, HandlerResult, Runtime } from './api.ts';
import type { GameAction, GameSnapshot, KernelAction, KernelSlice } from './contract.ts';

const kernelFeature: Feature<KernelAction, KernelSlice> = {
  actions: { dismissNotice: rt => { rt.notices = []; } },
  inBattle: ['dismissNotice'],
  slice: () => rt => ({ notices: [...rt.notices] }),
};

const REGISTRY = [
  kernelFeature, battleFeature, challengesFeature, collectionFeature, engravingsFeature, itemsFeature, raisingFeature, worldFeature,
] as const;

// The registry must own exactly the contract's actions and snapshot fields; a mismatch fails to compile here.
type Registered = (typeof REGISTRY)[number];
type ActionTypes<F> = F extends { readonly actions: infer M } ? keyof M : never;
type SliceKeys<F> = F extends { readonly slice: (ctx: GameContext) => (rt: Runtime) => infer S } ? keyof S : never;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const complete: [Same<ActionTypes<Registered>, GameAction['type']>, Same<SliceKeys<Registered>, keyof GameSnapshot>] = [true, true];
void complete;

/** A feature as the kernel sees it; each entry above is checked against its own `Feature<A, S>`. */
interface RegisteredFeature {
  readonly actions: Readonly<Record<string, (rt: Runtime, action: never) => HandlerResult>>;
  readonly inBattle?: readonly string[];
  readonly slice?: (ctx: GameContext) => (rt: Runtime) => object;
}

export const FEATURES: readonly RegisteredFeature[] = REGISTRY;
