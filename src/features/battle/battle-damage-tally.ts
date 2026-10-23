// Which damage events the battle screen shows as one number and one line (design/notes/damage-display-2026-10-23.md).
import type { BattleEvent } from '../../../battle/core/src/index.ts';

type Damage = Extract<BattleEvent, { type: 'damage' }>;
/** A hit or move that a protection or a Boss rule stopped before it did damage. */
export type Block = Extract<BattleEvent, { type: 'protected' | 'damage_blocked' }>;

/** Display the complete hit; HP loss, drain and rewards retain the core's amount. */
export const displayedDamage = (event: Damage): number => Math.max(0, event.amount) + Math.max(0, event.overkill);

/** One number and one line: a move's damage to one creature, or one damage event of its own. */
export interface DamageTally {
  /** Its damage events, in order. */
  events: Damage[];
  /** The displayed damage of all of them. */
  shown: number;
  /** One of them was a critical hit. */
  critical: boolean;
}

/** One damage event's place in its tally. */
export interface TallyShare {
  tally: DamageTally;
  /** Its index in the tally's events. */
  index: number;
  /** The tally's displayed damage up to and including this event. */
  shown: number;
  /**
   * A counter: damage the move's target dealt straight back to the move's user in answer to `drawnBy`, the hit just before it
   * (a Boss's `reflect_damage`, an `on_hurt` reflection such as 反击风暴). The battle screen shows it with that hit.
   */
  drawnBy?: Damage;
}

/** Events after which a damage event no longer belongs to the move before them: another action, an entry, a tick or the turn's end. */
const MOVE_ENDS: ReadonlySet<BattleEvent['type']> = new Set([
  'turn_start', 'turn_end', 'item_used', 'capture_attempt', 'switch_out', 'switch_in', 'condition_tick', 'cant_act', 'no_target', 'flee',
  'battle_end',
]);
/** Events that set a creature's HP anew, so the move's next damage to it starts a new number (a Boss's full heal, a life or a phase). */
const TALLY_ENDS: ReadonlySet<BattleEvent['type']> = new Set(['heal', 'revive', 'faint', 'transform', 'max_hp_changed']);

/**
 * Groups `events` (one dispatch's) into tallies. From a `move_used` until the move ends (`MOVE_ENDS`), every damage event without
 * a `status` joins the open tally of its creature: the move's hits and riders on its target, and its recoil and the counters it
 * draws on its user. Status damage and damage outside a move (the turn's end, an entry, an item) are tallies of their own. Damage
 * on the user from the other side that follows a hit on the target with nothing between is a counter to that hit (`drawnBy`).
 */
export function damageTallies(events: readonly BattleEvent[]): Map<Damage, TallyShare> {
  const shares = new Map<Damage, TallyShare>(), open = new Map<string, DamageTally>();
  let user: 0 | 1 | undefined, hit: Damage | undefined;
  for (const event of events) {
    if (event.type === 'move_used' || MOVE_ENDS.has(event.type)) {
      open.clear();
      user = event.type === 'move_used' ? event.side : undefined;
    }
    // It ends its creature's tally, or every tally of its side when it names no slot (a transform).
    if (TALLY_ENDS.has(event.type) && 'side' in event) {
      for (const key of [...open.keys()]) if ('slot' in event ? key === `${event.side}:${event.slot}` : key.startsWith(`${event.side}:`)) open.delete(key);
    }
    if (event.type !== 'damage') { hit = undefined; continue; }
    const key = `${event.side}:${event.slot}`, joins = user !== undefined && !event.status;
    const drawnBy = joins && event.side === user && event.sourceSide !== undefined && event.sourceSide !== user ? hit : undefined;
    let tally = joins ? open.get(key) : undefined;
    if (!tally) {
      tally = { events: [], shown: 0, critical: false };
      if (joins) open.set(key, tally);
    }
    tally.events.push(event);
    tally.shown += displayedDamage(event);
    tally.critical ||= event.crit;
    shares.set(event, { tally, index: tally.events.length - 1, shown: tally.shown, drawnBy });
    // A second counter to the same hit (a reflection and an on_hurt one) answers it too.
    if (!drawnBy) hit = joins && event.side !== user ? event : undefined;
  }
  return shares;
}

/** One block's place among its move's blocks on one creature, which show as one line. */
export interface BlockShare {
  /** It is the first of them, which carries the line. */
  first: boolean;
  /** Some of the move's damage to the creature went through, so the line must not say that all of it was stopped. */
  partial: boolean;
}

/**
 * The blocks of `events` (one dispatch's), grouped like the tallies: from a `move_used` until the move ends (`MOVE_ENDS`), the
 * blocks on one side (a protection, or a Boss rule stopping each hit or rider) are one line, the first's. A block outside a move
 * stands alone.
 */
export function damageBlocks(events: readonly BattleEvent[]): Map<Block, BlockShare> {
  const groups: { blocks: Block[]; damaged: boolean }[] = [];
  let open: Map<0 | 1, (typeof groups)[number]> | undefined;
  for (const event of events) {
    if (event.type === 'move_used' || MOVE_ENDS.has(event.type)) open = event.type === 'move_used' ? new Map() : undefined;
    if (event.type !== 'damage' && event.type !== 'protected' && event.type !== 'damage_blocked') continue;
    let group = open?.get(event.side);
    if (!group) {
      groups.push(group = { blocks: [], damaged: false });
      open?.set(event.side, group);
    }
    if (event.type !== 'damage') group.blocks.push(event);
    else group.damaged ||= !event.status && displayedDamage(event) > 0;
  }
  return new Map(groups.flatMap(({ blocks, damaged }) => blocks.map((block, index) => [block, { first: index === 0, partial: damaged }] as const)));
}
