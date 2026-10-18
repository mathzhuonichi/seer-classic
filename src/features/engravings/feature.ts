// features/engravings's registration: buying, equipping and moving engravings. Monster rows and engravingOptions show them.
import type { Feature } from '../../kernel/api.ts';
import { engravingActions } from './actions.ts';

export type EngravingsAction =
  | {type: 'setEngraving'; uid: string; slot: 'ability' | 'skill'; engravingId: string | null; fromUid?: string}
  | {type: 'buyEngraving'; engravingId: string};

export const engravingsFeature: Feature<EngravingsAction> = { actions: engravingActions };
