// Turn flow (RULES.md sections 3 and 11): choosing actions, ordering them,
// executing them, switching, faint replacements and the end of the turn.

import type { Action } from '../types.ts';
import type { BattleEvent } from '../events.ts';
import type { Battle } from './battle.ts';
import { emptyCtx, zeroStages, type Mon, type Side } from './state.ts';
import { tryCapture, useItem } from './actions.ts';
import { journalOrder } from './journal.ts';
import { checkBossFlee, checkEnd, checkObjectivesAtTurnEnd, findRule, finish, hasRule } from './rules.ts';
import { runHookEffects } from './conditions.ts';

/** Sides that the injected policy decides for. */
export function isAuto(side: Side): boolean {
  return side.kind !== 'player' || !!side.ai;
}

function actionFor(b: Battle, side: Side): Action {
  if (side.pending) return side.pending;
  if (!isAuto(side)) throw new Error(`side ${side.index} has not submitted an action`);
  if (b.phase === 'replace') return b.policy!.chooseReplacement(b, side) ?? b.legalActions(side.index)[0];
  if (b.forcedExecution(b.active(side.index))) return b.legalActions(side.index).find(action => action.kind === 'move')!;
  for (const action of b.fire(b.active(side.index), 'choose_action', {side})) {
    if (action && b.isLegal(side.index, action as Action)) return action as Action;
  }
  return b.policy!.chooseAction(b, side);
}

/**
 * Turn preparation (architecture-v2 §5): when a turn opens, decide for automatic side `i` and store the
 * decision as its pending action, so it is ready when the player acts. It runs resolveTurn's own `actionFor`
 * at the same point of the RNG stream, so the action, the draws and the replay are the same:
 * - submitting an action consumes no random numbers, and the player's pending action is the only state that
 *   changes before resolveTurn. No decision reads it: the search planner plays a simultaneous-move
 *   equilibrium, and its planning world clears the opponent's pending (battle/ai search/world.ts);
 * - it must run before anything else consumes `b.rng` in that turn, and in resolveTurn's order, side 0 first.
 * It declines, returning null so that resolveTurn decides as it always has: outside the choose phase (in the
 * replacement phase an automatic side has nothing to decide, it replaced at once); for a side that is not
 * automatic or already has an action; for side 1 before an automatic side 0; when resolveTurn would end the
 * battle first; and for scripted decisions (a `script` AI or `choose_action` hooks), whose game code may change
 * state. A flee resolves before any decision is used, so resolveTurn then withdraws the prepared decisions.
 */
export function prepare(b: Battle, i: 0 | 1): Action | null {
  const side = b.sides[i], mon = b.active(i);
  if (b.phase !== 'choose' || !isAuto(side) || side.pending) return null;
  if (i === 1 && isAuto(b.sides[0]) && !b.sides[0].pending) return null;
  if (b.sides.some((s) => s.team.every((m) => m.fainted))) return null;
  if ((mon.ai ?? side.ai)?.kind === 'script' || b.hooks(mon, 'choose_action').length) return null;
  b.prepared ??= { s: [...b.rng.s], draws: b.rng.draws, mark: b.out.length };
  return side.pending = actionFor(b, side);
}

export function resolveTurn(b: Battle): BattleEvent[] {
  if (b.phase === 'ended') return [];
  const prepared = b.prepared;
  b.prepared = null;
  // Prepared decisions' events (warnings at most) open the turn, where the decisions would have emitted them.
  b.out = prepared ? b.out.slice(prepared.mark) : [];
  checkEnd(b);
  const retreat = b.sides.find((side) => side.pending?.kind === 'flee');
  if (!b.result && retreat) {
    // A flee ends the battle before any decision is used: withdraw the prepared ones with their draws and events.
    if (prepared) { b.rng.s = prepared.s; b.rng.draws = prepared.draws; b.out = []; }
    b.doAction(retreat.index, { kind: 'flee' }, true);
  } else if (!b.result && b.phase === 'replace') resolveReplacements(b);
  else if (!b.result) resolveFullTurn(b);
  for (const s of b.sides) s.pending = null;
  const events = b.out;
  b.log.push(...events);
  b.out = [];
  return events;
}

function resolveReplacements(b: Battle): void {
  for (const side of b.sides) {
    if (!side.needsReplacement) continue;
    const a = actionFor(b, side);
    if (a.kind !== 'switch') throw new Error('replacement must be a switch');
    b.switchIn(side, a.slot);
    side.needsReplacement = false;
    if (b.result) return;
  }
  checkEnd(b);
  if (!b.result) { b.phase = 'choose'; queueReplacements(b); }
}

function resolveFullTurn(b: Battle): void {
  const actions: [Action, Action] = [actionFor(b, b.sides[0]), actionFor(b, b.sides[1])];
  b.turn++;
  b.emit({ type: 'turn_start', turn: b.turn });
  markFaced(b);
  for (const s of b.sides) {
    const m = b.active(s.index);
    m.turnsActive++;
    runHookEffects(b, m, 'turn_start');
    // Innate first-turn boosts and turn thresholds must apply before moves.
    b.checkPhases(m);
  }

  const order = orderActions(b, actions);
  b.turnOrder = order;
  const actors = order.map((i) => b.active(i));
  const orderEntry = b.lastOrder ? journalOrder(b, actions, order) : null;
  const executed = [false, false];
  for (let k = 0; k < order.length; k++) {
    if (b.result) break;
    const i = order[k];
    const action = actions[i];
    const mon = b.active(i);
    if (action.kind === 'move' && (mon !== actors[k] || mon.fainted)) continue;
    if (action.kind === 'move' && !b.active((1 - i) as 0 | 1).fainted) executed[i] = true;
    b.doAction(i, action, k === 0);
  }
  if (orderEntry && executed[0] && executed[1]) b.journal.push(orderEntry);

  if (!b.result) b.endOfTurn();
  if (!b.result) checkEnd(b);
  if (!b.result && b.turn >= b.maxTurns) finish(b, null, 'turn_cap');
  if (!b.result) queueReplacements(b);
}

function orderActions(b: Battle, actions: [Action, Action]): (0 | 1)[] {
  b.lastOrder = null;
  const rank = (i: 0 | 1) => {
    const a = actions[i];
    if (a.kind !== 'move') return { cls: 1, execution: false, pri: 0, spe: 0 };
    const mon = b.active(i);
    const skill = b.skill(a.skill, mon);
    return { cls: 0, execution: b.forcedExecution(mon), pri: b.priority(mon, skill), spe: b.effStat(mon, 'spe') };
  };
  const r0 = rank(0), r1 = rank(1);
  if (r0.cls !== r1.cls) return r0.cls > r1.cls ? [0, 1] : [1, 0];
  if (r0.cls === 1) return [0, 1];
  if (r0.execution !== r1.execution) return r0.execution ? [0, 1] : [1, 0];
  // Journal only ordinary priority/speed orderings; forced execution is not speed evidence.
  const note = r0.execution ? null : { tie: false, spe: [r0.spe, r1.spe] as [number, number] };
  b.lastOrder = note;
  if (r0.pri !== r1.pri) return r0.pri > r1.pri ? [0, 1] : [1, 0];
  if (r0.spe !== r1.spe) return r0.spe > r1.spe ? [0, 1] : [1, 0];
  if (note) note.tie = true;
  return b.rng.next() < 0.5 ? [0, 1] : [1, 0];
}

export function doAction(b: Battle, i: 0 | 1, action: Action, first: boolean): void {
  const side = b.sides[i];
  b.active(i).lastActedTurn = b.turn;
  const foe = b.sides[1 - i];
  switch (action.kind) {
    case 'flee':
      b.emit({ type: 'flee', side: i });
      finish(b, (1 - i) as 0 | 1, 'flee');
      return;
    case 'switch':
      b.switchIn(side, action.slot);
      return;
    case 'item':
      useItem(b, side, action.item, action.target ?? side.active);
      return;
    case 'capture':
      tryCapture(b, side, foe, action.item);
      return;
    case 'move':
      if (b.active(foe.index).fainted) {
        b.emit({ type: 'no_target', side: i });
        return;
      }
      b.useMove(b.active(i), b.active(foe.index), b.skill(action.skill, b.active(i)), first);
      if (!b.result) checkBossFlee(b, b.active(i), b.skill(action.skill, b.active(i)));
  }
}

/** Automatic sides replace a fainted active at once; a player side makes the battle wait in `replace`. */
function queueReplacements(b: Battle): void {
  let playerWaits = false;
  for (const side of b.sides) {
    if (!b.active(side.index).fainted) continue;
    if (!side.team.some((m) => !m.fainted)) continue;
    side.needsReplacement = true;
    if (isAuto(side)) {
      const replacement = b.policy!.chooseReplacement(b, side);
      const slot = replacement?.kind === 'switch' ? replacement.slot : side.team.find((m) => !m.fainted)!.slot;
      b.switchIn(side, slot);
      side.needsReplacement = false;
    } else playerWaits = true;
  }
  if (playerWaits) b.phase = 'replace';
}

// ---------- switching ----------

export function switchIn(b: Battle, side: Side, slot: number): void {
  const prev = side.team[side.active];
  if (prev && prev.slot !== slot && !prev.fainted && b.turn > 0) {
    b.emit({ type: 'switch_out', side: side.index, slot: prev.slot });
  }
  if (prev && prev.slot !== slot) resetOnSwitch(prev);
  side.active = slot;
  const mon = side.team[slot];
  mon.turnsActive = 0;
  b.emit({
    type: 'switch_in', side: side.index, slot, species: mon.species.id, types: [...mon.types], name: mon.name, hp: mon.hp, maxHp: mon.maxHp, level: mon.level,
  });
  runHookEffects(b, mon, 'on_switch_in');
  if (mon.side === 1 && mon.phases.length) b.checkPhases(mon);
  if (b.sides.every((x) => x.team[x.active])) markFaced(b);
}

function markFaced(b: Battle): void {
  const p = b.active(0), f = b.active(1);
  if (!p.fainted && !f.fainted) f.facedBy.add(p.uid ?? `slot${p.slot}`);
}

function resetOnSwitch(mon: Mon): void {
  mon.stages = zeroStages();
  mon.vol = {};
  mon.conditions = mon.conditions.filter((c) => c.def.removed_on_switch === false);
}

// ---------- turn end ----------

export function endOfTurn(b: Battle): void {
  for (const i of [0, 1] as const) {
    if (b.result) return;
    const mon = b.active(i);
    if (mon.fainted) continue;
    turnEndHooks(b, mon);
    if (mon.fainted || b.result) continue;
    const side = b.sides[i];
    const regen = findRule(side, mon, (r) => r.rule === 'heal_each_turn');
    if (regen) b.heal(mon, regen.amount ?? (mon.maxHp * regen.pct_max_hp) / 100);
    if (hasRule(side, 'clear_debuffs_each_turn')) b.clearStages(mon, 'down');
    if (hasRule(side, 'strip_player_boosts_each_turn')) b.clearStages(b.foeOf(mon), 'up');
  }
  for (const i of [0, 1] as const) {
    const mon = b.active(i);
    for (const c of [...mon.conditions]) {
      if (c.appliedTurn === b.turn || c.turns === Infinity) continue;
      c.turns--;
      if (c.turns <= 0) b.removeCondition(mon, c.id, true);
    }
  }
  for (const i of [0, 1] as const) if (!b.active(i).fainted) b.checkPhases(b.active(i));
  checkObjectivesAtTurnEnd(b);
}

/** Damage-over-time ticks and the other `turn_end` hooks of one active monster. */
function turnEndHooks(b: Battle, mon: Mon): void {
  for (const { cond, hook } of b.hooksWithCond(mon, 'turn_end')) {
    if (mon.fainted || b.result) break;
    if (cond.appliedTurn === b.turn && cond.def.kind === 'status') continue;
    if (hook.when && !b.evalWhen(hook.when, { self: mon, foe: b.foeOf(mon) })) continue;
    if (hook.damage_pct_max_hp) {
      const amount = Math.max(1, Math.floor((mon.maxHp * hook.damage_pct_max_hp) / 100));
      b.emit({ type: 'condition_tick', side: mon.side, condition: cond.id });
      const lost = b.dealDamage(mon, amount, { kind: 'percent', status: cond.id });
      if (hook.drain_to_foe) b.heal(b.foeOf(mon), lost);
    }
    if (hook.effects) b.runEffects(hook.effects, mon, b.foeOf(mon), emptyCtx());
  }
  if (!mon.fainted && !b.result) b.fire(mon, 'turn_end', {});
}
