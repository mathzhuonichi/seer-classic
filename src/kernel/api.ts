// The controller's mutable state and the small operations every action uses.
import type { Battle, BossEncounter, Rng } from '../../battle/core/src/index.ts';
import { putMon, type Monster, type Save } from '../../raising/core/index.ts';
import type { GameSave } from './save.ts';
import { sanitizeSkin } from '../domain/acquisition/skins.ts';
import type { Created, GameAction } from './contract.ts';
import type { BattlePresentationFrame } from '../shared/views.ts';
import type { GameContext } from './context.ts';

// Kernel types that feature code may use; features import nothing else from the kernel.
export type { CatalogContext, GameContext } from './context.ts';
export type { GameSave } from './save.ts';

export interface CampaignContext { id: string; stageId: string }
export interface Appearance { species: number; appearanceSpecies: number }

/** One battle from its start until the player closes it. */
export interface BattleSession {
  readonly battle: Battle;
  readonly name: string;
  /** The prepared Boss, trainer or recruit encounter; null for a wild battle. */
  readonly encounter: BossEncounter | null;
  readonly campaign: CampaignContext | null;
  /** The wild monster, kept so a capture stores its raising record. */
  readonly wild: Monster | null;
  /** Skin appearance per player slot, valid until that slot changes species. */
  readonly appearances: ReadonlyMap<number, Appearance>;
  /** `side:slot` keys whose appearance follows a battle transform. */
  readonly transformedSlots: Set<string>;
  resultMessage: string;
  settled: boolean;
  logs: string[];
  frames: BattlePresentationFrame[];
}

export interface Runtime {
  readonly ctx: GameContext;
  save: GameSave;
  rng: Rng;
  session: BattleSession | null;
  notices: string[];
  /** Animation counters span battles so frame ids stay unique for the view. */
  animation: { revision: number; frameId: number };
}

const NOTICE_LIMIT = 5;

export function notice(rt: Runtime, text: string) {
  rt.notices = [text, ...rt.notices].slice(0, NOTICE_LIMIT);
}

/** Raising operations clone the whole save, so the game extras travel with the result. */
export function commit(rt: Runtime, next: Save) {
  rt.save = next as GameSave;
}

export function replaceMonster(rt: Runtime, mon: Monster) {
  sanitizeSkin(mon, rt.ctx.skinOptions);
  putMon(rt.save, mon);
}

/** True while a battle is open and unresolved. */
export const battleInProgress = (rt: Runtime) => !!rt.session && !rt.session.battle.result;

export function requireSession(rt: Runtime): BattleSession {
  if (!rt.session) throw new Error('尚未开始战斗。');
  return rt.session;
}

/** A handler returns nothing, or what it created; failures throw, and `dispatch` turns them into notices. */
export type HandlerResult = void | { created: Created };
export type ActionHandler<T extends GameAction['type']> = (rt: Runtime, action: Extract<GameAction, { type: T }>) => HandlerResult;

/** One feature's registration (architecture-v2 §5); `kernel/features.ts` lists them, and dispatch and the snapshot fold over them. */
export interface Feature<A extends { type: string }, S extends object = Record<never, never>> {
  /** One handler per action type the feature owns. */
  readonly actions: { readonly [T in A['type']]: (rt: Runtime, action: Extract<A, { type: T }>) => HandlerResult };
  /** Action types that stay available while a battle is unresolved. */
  readonly inBattle?: readonly A['type'][];
  /** Creates the feature's slice builder once per game, so it may keep catalogue caches. */
  readonly slice?: (ctx: GameContext) => (rt: Runtime) => S;
}
