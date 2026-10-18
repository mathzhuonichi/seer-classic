// The UI-facing contract: the snapshot the components render, the actions they dispatch, and the controller.
// Each feature declares its actions and its slice in its feature.ts; this module composes them (architecture-v2 §5).
import type { EngravingView } from '../shared/views.ts';
import type { BattleAction, BattleSlice } from '../features/battle/index.ts';
import type { ChallengesAction, ChallengesSlice } from '../features/challenges/index.ts';
import type { CollectionAction, CollectionSlice } from '../features/collection/index.ts';
import type { EngravingsAction } from '../features/engravings/index.ts';
import type { ItemsAction, ItemsSlice } from '../features/items/index.ts';
import type { RaisingAction, RaisingSlice } from '../features/raising/index.ts';
import type { WorldAction } from '../features/world/index.ts';

/** The kernel's own action and slice: the notice queue. */
export type KernelAction = { type: 'dismissNotice' };
export interface KernelSlice { notices: string[] }

export type GameAction = KernelAction | BattleAction | ChallengesAction | CollectionAction | EngravingsAction | ItemsAction | RaisingAction | WorldAction;
export type GameSnapshot = KernelSlice & BattleSlice & ChallengesSlice & CollectionSlice & ItemsSlice & RaisingSlice;

export interface GameController {
  snapshot(): GameSnapshot; subscribe(listener: () => void): () => void; dispatch(action: GameAction): DispatchResult;
  engravingOptions?(uid: string): EngravingView[]; exportSave(): string; importSave(json: string): void; reset(): void;
}

/** What an action created, so a screen can show it without diffing snapshots. */
export interface Created { uid?: string; itemId?: string }

/** What a dispatch did: `notice` is the message the action added, if any. */
export type DispatchResult = { ok: true; notice?: string; created?: Created } | { ok: false; notice: string };
