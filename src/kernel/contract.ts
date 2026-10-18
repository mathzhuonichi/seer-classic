// The UI-facing contract: the snapshot the components render, the actions they dispatch, and the controller.
import type { StatBlock, StatKey } from '../../raising/core/types.ts';
import type { BattleFacilityView, BattleView, BossView, BraveTowerView, CampaignView, EngravingView, ItemView, MonsterView, QuestView, ShopItemView, SpeciesView } from '../shared/views.ts';

export interface GameSnapshot { monsters: MonsterView[]; party: string[]; bosses: BossView[]; campaigns: CampaignView[]; facilities: BattleFacilityView[]; braveTower: BraveTowerView; species: SpeciesView[]; quests: QuestView[]; battle: BattleView | null; expPool: number; coins: number; notices: string[]; natures: {id: string; name: string}[]; traits: {id: string; name: string; description: string}[]; items: ItemView[]; shopItems:ShopItemView[] }
export type GameAction =
 | {type: 'startBattle'; bossId: string}
 | {type: 'startTower'; floor: number}
 | {type: 'enterTower'; floor: number}
 | {type: 'startFacility'; facilityId: string; teamId?: string}
 | {type: 'startCampaignStage'; campaignId: string; stageId: string}
 | {type: 'resetCampaign'; campaignId: string}
 | {type: 'startTraining'; species?: number; level?: number; planetId?:string; regionId?:string}
 | {type: 'move'; skillId: number}
 | {type: 'switch'; uid: string}
 | {type: 'battleItem'; itemId: string; targetUid?: string}
 | {type: 'capture'; itemId: string}
 | {type: 'flee'} | {type: 'closeBattle'} | {type: 'heal'}
 | {type: 'party'; uid: string; add: boolean}
 | {type: 'rename'; uid: string; name: string}
 | {type: 'equip'; uid: string; skills: number[]}
 | {type: 'setEngraving'; uid: string; slot: 'ability' | 'skill'; engravingId: string | null; fromUid?:string}
 | {type: 'buyEngraving'; engravingId: string}
 | {type: 'train'; uid: string; stat: StatKey; amount: number}
 | {type: 'setEvs'; uid: string; evs: StatBlock}
 | {type: 'reorderParty'; uids: string[]}
 | {type: 'allocateExp'; uid: string; amount: number}
 | {type: 'evolve'; uid: string; toSpecies?:number}
 | {type: 'setSkin'; uid: string; species:number|null}
 | {type: 'fuse'; recipeId: string; primaryUid: string; secondaryUid: string}
 | {type: 'useItem'; uid: string; itemId: string}
 | {type: 'claimQuest'; questId: string}
 | {type: 'breed'; recipeId: string; firstUid: string; secondUid: string}
 | {type: 'buyItem'; itemId: string; quantity: number}
 | {type: 'cheatMonster'; uid: string; level?: number; iv?: number; nature?: string; evs?: Partial<StatBlock>; traitId?: string | null}
 | {type: 'cheatAcquire'; species: number; level?: number}
 | {type: 'cheatResources'; coins?: number; expPool?: number}
 | {type: 'dismissNotice'};
export interface GameController { snapshot(): GameSnapshot; subscribe(listener: () => void): () => void; dispatch(action: GameAction): DispatchResult; engravingOptions?(uid: string): EngravingView[]; exportSave(): string; importSave(json: string): void; reset(): void }

/** What a dispatch did: `notice` is the message the action added, if any. */
export type DispatchResult = { ok: true; notice?: string } | { ok: false; notice: string };
