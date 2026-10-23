// Which damage events the battle screen shows as one number and one line (design/notes/damage-display-2026-10-23.md).
import type { BattleEvent } from '../../../battle/core/src/index.ts';

type Damage = Extract<BattleEvent, { type: 'damage' }>;

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
 * draws on its user. Status damage and damage outside a move (the turn's end, an entry, an item) are tallies of their own.
 */
export function damageTallies(events: readonly BattleEvent[]): Map<Damage, TallyShare> {
  const shares = new Map<Damage, TallyShare>(), open = new Map<string, DamageTally>();
  let inMove = false;
  for (const event of events) {
    if (event.type === 'move_used' || MOVE_ENDS.has(event.type)) {
      open.clear();
      inMove = event.type === 'move_used';
    }
    // It ends its creature's tally, or every tally of its side when it names no slot (a transform).
    if (TALLY_ENDS.has(event.type) && 'side' in event) {
      for (const key of [...open.keys()]) if ('slot' in event ? key === `${event.side}:${event.slot}` : key.startsWith(`${event.side}:`)) open.delete(key);
    }
    if (event.type !== 'damage') continue;
    const key = `${event.side}:${event.slot}`, joins = inMove && !event.status;
    let tally = joins ? open.get(key) : undefined;
    if (!tally) {
      tally = { events: [], shown: 0, critical: false };
      if (joins) open.set(key, tally);
    }
    tally.events.push(event);
    tally.shown += displayedDamage(event);
    tally.critical ||= event.crit;
    shares.set(event, { tally, index: tally.events.length - 1, shown: tally.shown });
  }
  return shares;
}
