// The controller's mutable state and the small operations every action uses.
import type { Battle, BattleResult, BossEncounter, Rng } from '../../battle/core/src/index.ts';
import { putMon, type Monster, type Save } from '../../raising/core/index.ts';
import type { GameSave } from './save.ts';
import { sanitizeSkin } from '../domain/acquisition/skins.ts';
import type { Created, GameAction } from './contract.ts';
import type { BattlePresentationFrame } from '../shared/views.ts';
import type { GameContext } from './context.ts';

// Kernel types that feature code may use; features import nothing else from the kernel.
export type { CatalogContext, GameContext } from './context.ts';
export type { GameSave } from './save.ts';

export interface Appearance { species: number; appearanceSpecies: number }

/** What a victory pays besides experience: coins and reward items, and the result shown when the six-copy allowance blocks an essence. */
interface VictoryRewards { coins: number; items: readonly (readonly [string, number])[]; blocked: string }

/** A challenge's part in one battle session: features/challenges passes them when it starts the session. */
export interface SessionHooks {
  /**
   * A generated team (battle facilities) or a practice fight (盖亚 without a variant): no attempt or win count, first-clear record or
   * encounter reward items.
   */
  readonly unrecorded?: boolean;
  /** A victory's coins and reward items in place of the victory coins and the encounter's items (Brave Tower floors). */
  rewards?(encounter: BossEncounter, firstClear: boolean): VictoryRewards;
  /** After a victory's rewards or after a defeat: the challenge's progress and result message. */
  settled?(rt: Runtime, session: BattleSession, result: BattleResult): void;
}

/** One battle from its start until the player closes it. */
export interface BattleSession {
  readonly battle: Battle;
  readonly name: string;
  /** The prepared Boss, trainer or recruit encounter; null for a wild battle. */
  readonly encounter: BossEncounter | null;
  readonly hooks: SessionHooks;
  /** The wild monster, kept so a capture stores its raising record. */
  readonly wild: Monster | null;
  /** Skin appearance per player slot, valid until that slot changes species. */
  readonly appearances: ReadonlyMap<number, Appearance>;
  /** `side:slot` keys whose appearance follows a battle transform. */
  readonly transformedSlots: Set<string>;
  /** Foe slots that have been in battle: the others stay unknown on the battle screen. */
  readonly seenFoeSlots: Set<number>;
  resultMessage: string;
  /** What the settlement adds after the outcome: what the battle paid, then why the six-copy allowance kept back an automatic evolution. */
  resultNotes: string[];
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

/**
 * Raising operations return a new save that shares every part they do not change with the old one, the game extras included.
 * The runtime then changes the new save in place, so the old one is never used again.
 */
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

/**
 * One feature's registration (architecture-v2 §5); `kernel/features.ts` lists them, and dispatch and the snapshot fold over them.
 * `actions` has one handler per action type the feature owns; `inBattle` lists the ones that stay available while a battle is
 * unresolved; `slice`, required when the feature has a slice, creates its builder once per game, so it may keep catalogue caches.
 */
export type Feature<A extends { type: string }, S extends object = Record<never, never>> = {
  readonly actions: { readonly [T in A['type']]: (rt: Runtime, action: Extract<A, { type: T }>) => HandlerResult };
  readonly inBattle?: readonly A['type'][];
} & ([keyof S] extends [never] ? { readonly slice?: never } : { readonly slice: (ctx: GameContext) => (rt: Runtime) => S });
