// Display view types shared by the kernel snapshot, the features and their UI.
import type { StatBlock, StatKey } from '../../raising/core/types.ts';

export interface SkillView { id: number; name: string; type: string; category: string; power: number; pp: number; maxPp: number; description: string }
export interface SkinChoiceView {species:number;name:string}
export interface BoostView {name:string;/** Battles until the item effect ends. */battlesLeft:number}
export interface EvolutionChoiceView {species:number;name:string;level:number;blockedReason?:string}
/** A 2013 ability or skill engraving as it applies to one monster. */
export interface EngravingView {
  id: string; name: string; slot: 'ability' | 'skill'; effect: string; levelMin: number; bound: boolean; moveName?: string; moveIds?: number[];
  /** Skill engravings: classifier group (ENGRAVING_EFFECT_GROUPS). Ability engravings: raised stats. */
  group?: string; statKeys: StatKey[]; ready: boolean; reason?: string;
  /** Effective remake cap, preserved legacy stock, equipped copies and every holder. */
  maxOwned: number; stock: number; equipped: number; equippedHere: boolean; unlimited?: boolean; equippedHolders?:{uid:string;name:string}[];
  /** Equipping here needs no copy, takes one from stock, moves one from `transferFrom` (the first by default), or cannot (none, or held here). */
  equipMode: 'unlimited' | 'stock' | 'transfer' | 'blocked'; transferFrom?: {uid:string;name:string}[];
  /** Stock plus equipped copies, which count against `maxOwned`; `canBuy` while a finite one is below it. */
  owned: number; canBuy: boolean;
}
export interface MonsterEngravingsView { ability: EngravingView | null; skill: EngravingView | null; bonus: Partial<StatBlock> }
export interface MonsterView { uid: string; species: number; appearanceSpecies?:number; skinOptions:SkinChoiceView[]; name: string; speciesName: string; level: number; exp: number; expToNext: number; iv: number; nature: string; natureId: string; types: string[]; baseStats: StatBlock; stats: StatBlock; evs: StatBlock; hp: number; skills: SkillView[]; learned: SkillView[]; trait: string; traitId: string | null; engravings: MonsterEngravingsView; inParty: boolean; portrait: string; evolution: string | null; evolutionChoices:EvolutionChoiceView[]; gender: 0 | 1 | 2; generation: number; boosts: BoostView[] }
export type BossEvidenceStatus='official'|'observed'|'inferred'|'authored';
export interface BossEvidenceView {displayLevelUnknown?:boolean;sourceUrls?:string[];hasInferredStats:boolean;hasInferredLevel:boolean;incompleteRules?:number;fields:{key:string;label:string;value:string;status:BossEvidenceStatus}[];limitations:string[]}
export interface EncounterOpponentView {species:number;name:string;level:number;evidence?:BossEvidenceView}
/** An encounter's archive category; `CHALLENGE_CATEGORY` (domain/challenges) holds the labels. */
export type ChallengeCategoryId = 'spt' | 'legendary' | 'tower' | 'dark' | 'quest' | 'trainer';
export interface BossView { category: ChallengeCategoryId; id: string; name: string; description: string; location?: string; level: number; species: number; cleared: boolean; attempts: number; portrait: string; opponents?: EncounterOpponentView[]; rewardText?:string; evidence?:BossEvidenceView }
export interface BattleFacilityGroupView {id:string;name:string;description:string}
export interface NpcTrainingView {id:string;label:string;description:string;equivalentBaseTotal?:number;statBonus?:Partial<StatBlock>}
export interface BattleFacilityOpponentView {species:number;name:string;level:number;baseTotal:number;role?:string;training?:NpcTrainingView;skills?:{id:number;name:string;training?:string}[]}
export interface BattleFacilityTeamView {id:string;name:string;description:string;groupId?:string;opponents:BattleFacilityOpponentView[]}
export interface BattleFacilityView { id: string; name: string; description: string; opponentCount: 6; level: 100; poolSize?: number; groups?:BattleFacilityGroupView[];teams?:BattleFacilityTeamView[] }
export interface SpeciesView { id: number; name: string; types: string[]; baseStats: StatBlock; portrait: string; owned: boolean; wildCapture?: boolean }
export interface BattleMonsterView { uid: string; slot?: number; name: string; species: number; appearanceSpecies?:number; level: number; hp: number; maxHp: number; fainted: boolean; types: string[]; portrait: string; skills: SkillView[]; statuses: string[]; stages: Record<string, number>; evidence?:BossEvidenceView; /** Trainer foes: hp and maxHp hold only the bar ratio on a 0–100 scale. */ hpHidden?: boolean }
export interface BattlePresentationFrame { id: number; side: 0 | 1; kind: 'physical' | 'special' | 'status' | 'hit' | 'heal' | 'switch' | 'capture' | 'message'; text: string; amount?: number; critical?: boolean; captureSuccess?: boolean; capsuleName?: string; skillType?: string; skillId?: number; targetSide?: 0 | 1; playerHp: number; enemyHp: number; player: BattleMonsterView; enemy: BattleMonsterView; party: BattleMonsterView[]; enemyParty: BattleMonsterView[] }
export interface BattleView { name: string; turn: number; player: BattleMonsterView; enemy: BattleMonsterView; party: BattleMonsterView[]; enemyParty: BattleMonsterView[]; log: string[]; finished: boolean; won: boolean; result: string; resultReason?: string; canCapture: boolean; captureBlockedReason?: string; captured?: boolean; needsSwitch: boolean; animation: {revision: number; frames: BattlePresentationFrame[]} }
export interface ItemView { id: string; name: string; kind: string; count: number; unlimited?: boolean; description: string; battleUsable: boolean; battleCategory?: 'recovery' | 'capsule' | 'status'; targetMode?: 'living' | 'fainted'; usableTargetUids?: string[];
  /** What the bag does with it now, if anything; `use` applies it to one of `useTargets`. */
  useAction: 'use' | 'hatch' | 'capture' | null; useTargets?: string[] }
export interface AcquisitionAllowance {owned:number;reserved:number;remaining:number;limit:number}
export interface ShopItemView {id:string;name:string;kind:string;description:string;count:number;unlimited?:boolean;price:0;hatches?:number;maxQuantity:number;blockedReason?:string;allowance?:AcquisitionAllowance}
export interface QuestPrerequisiteView {kind:'species'|'boss';species?:number;bossId?:string;name:string;complete:boolean}
export interface QuestView {
  id: string; name: string; description: string; rewardSpecies: number; rewardName: string; progress: string; group: 'journey' | 'spt-recruitment';
  /** `claimable` is the one claim rule: complete, not claimed (or repeatable), and within the six-copy allowance. */
  complete: boolean; claimed: boolean; claimable: boolean; blockedReason?: string;
  /** Recruitment quests only; `rewardHeld`: the player holds the reward essence. */
  prerequisites?: readonly QuestPrerequisiteView[]; rewardItemId?: string; rewardHeld?: boolean;
  repeatable?: boolean; claimCount?: number; allowance?: AcquisitionAllowance;
}
export interface CampaignStageView { id: string; name: string; bossIds: string[]; description: string; kind: 'battle' | 'chain'; cleared: boolean; available: boolean; requiredSpecies?: number; requiredSpeciesName?: string; minLevel?: number; carry?: boolean; opponents: EncounterOpponentView[]; rewardText: string; blockedReason?: string; evidence?:BossEvidenceView }
export interface CampaignView {
  id: string; name: string; species: number; speciesName: string; location: string; stages: CampaignStageView[];
  /** The current stage's instruction: the next stage's, or the last stage's once every stage is cleared. */
  description: string;
  completed: number; nextStageId: string | null; finished: boolean; resetOnLoss: boolean;
  /** `skills`: each stage teaches a skill instead of the last stage granting the essence. */
  reward: 'essence' | 'skills';
}
/** Where the player stands in the Brave Tower: one rule for the tower scene, the entrance picker and the archive. */
export interface BraveTowerPosition {
  /** The tower scene's floor: the climb's next floor, or the top floor after a completed climb; `bossId` is its guardian. */
  floor:number;bossId:string;
  /** This climb reached the top, so a new one starts from a checkpoint; `conquered`: every floor was cleared at least once. */
  climbComplete:boolean;conquered:boolean;
  /** The checkpoint offered first: the segment of the saved floor, or floor 1 after a completed climb. */
  entrance:number;
}
export interface BraveTowerView {
  highestCleared: number; resumeFloor: number | null; totalFloors: number; position: BraveTowerPosition; checkpoints: {floor:number;unlocked:boolean}[];
  milestones:{floor:number;species?:number;name:string;description:string;cleared:boolean}[]; honors:string[];
}
