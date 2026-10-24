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
  /**
   * A move's damage on its target: the type multiplier of its first attack hit (`damage.effectiveness`), the move's type against
   * the target's. The original's one `lostHP` per move carried one such rating (`effectName`). Undefined on the move's user, for
   * damage outside a move, and for a move whose damage the chart did not rate (fixed, percentage or true damage alone).
   */
  effectiveness?: number;
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
 * The counters of `events` (one dispatch's), each with the hit that drew it: damage on a move's user from the other side, or a
 * rule of the user stopping it (`damage_blocked`), that follows a hit of the move on its target with only other counters to that
 * hit between (a Boss's `reflect_damage`, an `on_hurt` reflection such as 反击风暴, or both).
 */
function counterHits(events: readonly BattleEvent[]): Map<BattleEvent, Damage> {
  const drawn = new Map<BattleEvent, Damage>();
  let user: 0 | 1 | undefined, hit: Damage | undefined;
  for (const event of events) {
    if (event.type === 'move_used' || MOVE_ENDS.has(event.type)) user = event.type === 'move_used' ? event.side : undefined;
    const onUser = user !== undefined && 'side' in event && event.side === user;
    const answers = event.type === 'damage' ? !event.status && event.sourceSide !== undefined && event.sourceSide !== user : event.type === 'damage_blocked';
    if (hit && onUser && answers) drawn.set(event, hit);
    else hit = event.type === 'damage' && user !== undefined && !event.status && event.side !== user ? event : undefined;
  }
  return drawn;
}

/**
 * Groups `events` (one dispatch's) into tallies. From a `move_used` until the move ends (`MOVE_ENDS`), every damage event without
 * a `status` joins the open tally of its creature: the move's hits and riders on its target, and its recoil and the counters it
 * draws on its user (`counterHits`, `drawnBy`). Status damage and damage outside a move (the turn's end, an entry, an item) are
 * tallies of their own.
 */
export function damageTallies(events: readonly BattleEvent[]): Map<Damage, TallyShare> {
  const shares = new Map<Damage, TallyShare>(), open = new Map<string, DamageTally>(), drawn = counterHits(events);
  let user: 0 | 1 | undefined;
  for (const event of events) {
    if (event.type === 'move_used' || MOVE_ENDS.has(event.type)) {
      open.clear();
      user = event.type === 'move_used' ? event.side : undefined;
    }
    // It ends its creature's tally, or every tally of its side when it names no slot (a transform).
    if (TALLY_ENDS.has(event.type) && 'side' in event) {
      for (const key of [...open.keys()]) if ('slot' in event ? key === `${event.side}:${event.slot}` : key.startsWith(`${event.side}:`)) open.delete(key);
    }
    if (event.type !== 'damage') continue;
    const key = `${event.side}:${event.slot}`, joins = user !== undefined && !event.status;
    let tally = joins ? open.get(key) : undefined;
    if (!tally) {
      tally = { events: [], shown: 0, critical: false };
      if (joins) open.set(key, tally);
    }
    tally.events.push(event);
    tally.shown += displayedDamage(event);
    tally.critical ||= event.crit;
    if (joins && event.side !== user) tally.effectiveness ??= event.effectiveness;
    shares.set(event, { tally, index: tally.events.length - 1, shown: tally.shown, drawnBy: drawn.get(event) });
  }
  return shares;
}

/** One block's place among its move's blocks on one creature, which show as one line. */
export interface BlockShare {
  /** It carries the line: the first of them, or the last when they are all counters, so that the line follows the move's last hit. */
  lined: boolean;
  /** Some of the move's damage to the creature went through, so the line must not say that all of it was stopped. */
  partial: boolean;
  /**
   * It carries the line of a move that was stopped on its target before any of the move's damage reached it, so the target has no
   * number of the move (`damageTallies`). A damaging move shows −0 there: the original drew its one `lostHP` per move, 0 here.
   */
  stopped: boolean;
  /** For `stopped`: the type multiplier of the move's first stopped attack hit (`damage_blocked.effectiveness`), if any. */
  effectiveness?: number;
  /** It stopped a counter to this hit (`counterHits`); the battle screen shows it with that hit. */
  drawnBy?: Damage;
}

/**
 * The blocks of `events` (one dispatch's), grouped like the tallies: from a `move_used` until the move ends (`MOVE_ENDS`), the
 * blocks on one side (a protection, or a Boss rule stopping each hit, rider or counter) are one line. A block outside a move
 * stands alone.
 */
export function damageBlocks(events: readonly BattleEvent[]): Map<Block, BlockShare> {
  /**
   * One line's blocks; `struck`: a damage event of the move reached the side, `damaged`: one did damage, `target`: the move's
   * target, `effectiveness`: the first stopped attack hit's multiplier.
   */
  const groups: { blocks: Block[]; struck: boolean; damaged: boolean; target: boolean; effectiveness?: number }[] = [], drawn = counterHits(events);
  let open: Map<0 | 1, (typeof groups)[number]> | undefined, user: 0 | 1 | undefined;
  for (const event of events) {
    if (event.type === 'move_used' || MOVE_ENDS.has(event.type)) {
      open = event.type === 'move_used' ? new Map() : undefined;
      user = event.type === 'move_used' ? event.side : undefined;
    }
    if (event.type !== 'damage' && event.type !== 'protected' && event.type !== 'damage_blocked') continue;
    let group = open?.get(event.side);
    if (!group) {
      groups.push(group = { blocks: [], struck: false, damaged: false, target: user !== undefined && event.side !== user });
      open?.set(event.side, group);
    }
    if (event.type !== 'damage') {
      group.blocks.push(event);
      if (event.type === 'damage_blocked') group.effectiveness ??= event.effectiveness;
    } else if (!event.status) {
      group.struck = true;
      group.damaged ||= displayedDamage(event) > 0;
    }
  }
  return new Map(groups.flatMap(({ blocks, struck, damaged, target, effectiveness }) => {
    const lined = blocks.every(block => drawn.has(block)) ? blocks.length - 1 : 0;
    return blocks.map((block, index) => {
      const stopped = index === lined && target && !struck;
      return [block, { lined: index === lined, partial: damaged, stopped, ...stopped && { effectiveness }, drawnBy: drawn.get(block) }] as const;
    });
  }));
}

/**
 * The `immune` events of `events` (one dispatch's) that stopped a move before any of its damage reached its target: the target's
 * type is immune to the move's (免疫了这次攻击。). The original drew that move's one `lostHP`, 0, with the rating 无效: 无效-0.
 */
export function immuneMoves(events: readonly BattleEvent[]): Set<BattleEvent> {
  const stopped = new Set<BattleEvent>();
  let struck: Set<0 | 1> | undefined;
  for (const event of events) {
    if (event.type === 'move_used' || MOVE_ENDS.has(event.type)) struck = event.type === 'move_used' ? new Set() : undefined;
    else if (event.type === 'damage' && !event.status) struck?.add(event.side);
    else if (event.type === 'immune' && struck && !struck.has(event.side)) stopped.add(event);
  }
  return stopped;
}
