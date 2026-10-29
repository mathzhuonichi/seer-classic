// features/raising's registration: raising and organising owned monsters, the editor, and the roster slices.
import type { StatBlock } from '../../../raising/core/types.ts';
import type { StatKey } from '../../../raising/core/stats.ts';
import type { MonsterView, NatureView, TraitView } from '../../shared/views.ts';
import { natureView } from '../../shared/view-common.ts';
import type { Feature } from '../../kernel/api.ts';
import { raisingActions } from './actions.ts';
import { monsterRows, TRAIT_VIEWS } from './view.ts';

export type RaisingAction =
  | {type: 'heal'}
  | {type: 'party'; uid: string; add: boolean}
  | {type: 'rename'; uid: string; name: string}
  | {type: 'equip'; uid: string; skills: number[]}
  | {type: 'train'; uid: string; stat: StatKey; amount: number}
  | {type: 'setEvs'; uid: string; evs: StatBlock}
  | {type: 'reorderParty'; uids: string[]}
  | {type: 'swapWithBox'; partyUid: string; boxUid: string}
  | {type: 'favorite'; uid: string; favorite: boolean}
  | {type: 'allocateExp'; uid: string; amount: number}
  | {type: 'evolve'; uid: string; toSpecies?: number}
  | {type: 'setSkin'; uid: string; species: number | null}
  | {type: 'cheatMonster'; uid: string; level?: number; iv?: number; nature?: string; evs?: Partial<StatBlock>; traitId?: string | null}
  | {type: 'cheatAcquire'; species: number; level?: number}
  | {type: 'cheatResources'; coins?: number; expPool?: number};
export interface RaisingSlice {
  monsters: MonsterView[]; party: string[]; expPool: number;
  natures: NatureView[]; traits: TraitView[];
}

export const raisingFeature: Feature<RaisingAction, RaisingSlice> = {
  actions: raisingActions,
  slice: ctx => {
    const natures = ctx.catalog.natures.map(nature => natureView(ctx.dex.nature(String(nature.id))));
    const traits = ctx.availableTraits.map(trait => TRAIT_VIEWS.get(trait.id)!);
    const monsters = monsterRows(ctx);
    return ({ save }) => ({ monsters: monsters(save), party: [...save.party], expPool: save.exp_pool, natures, traits });
  },
};
