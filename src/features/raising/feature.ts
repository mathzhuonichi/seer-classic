// features/raising's registration: raising and organising owned monsters, the editor, and the roster slices.
import type { StatBlock, StatKey } from '../../../raising/core/types.ts';
import type { MonsterView } from '../../shared/views.ts';
import type { Feature } from '../../kernel/api.ts';
import { raisingActions } from './actions.ts';
import { monsterRows } from './view.ts';

export type RaisingAction =
  | {type: 'heal'}
  | {type: 'party'; uid: string; add: boolean}
  | {type: 'rename'; uid: string; name: string}
  | {type: 'equip'; uid: string; skills: number[]}
  | {type: 'train'; uid: string; stat: StatKey; amount: number}
  | {type: 'setEvs'; uid: string; evs: StatBlock}
  | {type: 'reorderParty'; uids: string[]}
  | {type: 'allocateExp'; uid: string; amount: number}
  | {type: 'evolve'; uid: string; toSpecies?: number}
  | {type: 'setSkin'; uid: string; species: number | null}
  | {type: 'cheatMonster'; uid: string; level?: number; iv?: number; nature?: string; evs?: Partial<StatBlock>; traitId?: string | null}
  | {type: 'cheatAcquire'; species: number; level?: number}
  | {type: 'cheatResources'; coins?: number; expPool?: number};
export interface RaisingSlice {
  monsters: MonsterView[]; party: string[]; expPool: number;
  natures: {id: string; name: string}[]; traits: {id: string; name: string; description: string}[];
}

export const raisingFeature: Feature<RaisingAction, RaisingSlice> = {
  actions: raisingActions,
  slice: ctx => {
    const natures = ctx.catalog.natures.map(nature => ({ id: String(nature.id), name: (nature.name as { zh: string }).zh }));
    const traits = ctx.availableTraits.map(trait => ({ id: trait.id, name: trait.name, description: trait.description }));
    const monsters = monsterRows(ctx);
    return ({ save }) => ({ monsters: monsters(save), party: [...save.party], expPool: save.exp_pool, natures, traits });
  },
};
