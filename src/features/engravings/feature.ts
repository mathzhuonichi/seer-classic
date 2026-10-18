// features/engravings's registration: buying, equipping and moving engravings, and the stock slice. Monster rows and engravingOptions show them.
import type { Feature } from '../../kernel/api.ts';
import { engravingActions } from './actions.ts';

export type EngravingsAction =
  | {type: 'setEngraving'; uid: string; slot: 'ability' | 'skill'; engravingId: string | null; fromUid?: string}
  | {type: 'buyEngraving'; engravingId: string};

/** The finite engraving stock. With the monster rows it is every input of `engravingOptions`, so screens recompute when either changes. */
export interface EngravingsSlice { engravingStock: Record<string, number> }

export const engravingsFeature: Feature<EngravingsAction, EngravingsSlice> = {
  actions: engravingActions,
  slice: () => ({ save }) => ({ engravingStock: { ...save.game.engravingStock } }),
};
