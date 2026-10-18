// What a side may do this turn (RULES.md section 3), and the item and capture actions.

import type { Action, EffectOp } from '../types.ts';
import type { Battle } from './battle.ts';
import { emptyCtx, type Mon, type Side } from './state.ts';
import * as C from '../constants.ts';
import { STRUGGLE_SKILL } from '../constants.ts';
import { meetsWildCapturePrerequisite, rollReconstructedCapture } from '../capture.ts';
import { isAttackSkill } from './move.ts';
import { finish, hasRule } from './rules.ts';

export function legalActions(b: Battle, sideIndex: 0 | 1): Action[] {
  if (b.phase === 'ended') return [];
  const side = b.sides[sideIndex];
  const foeSide = b.sides[1 - sideIndex];
  const bench = side.team.filter((m) => !m.fainted && m.slot !== side.active).map((m) => ({ kind: 'switch' as const, slot: m.slot }));
  if (b.phase === 'replace') return side.needsReplacement
    ? [...bench, { kind: 'flee' }] : side.kind === 'player' ? [{ kind: 'flee' }] : [];

  const mon = b.active(sideIndex);
  const actions: Action[] = moveActions(b, side, mon);
  const switchBlocked = hasRule(foeSide, 'no_switch') || b.hooks(mon, 'block_switch').length > 0;
  if (!switchBlocked) actions.push(...bench);
  if (!hasRule(foeSide, 'no_items')) actions.push(...itemActions(b, side));
  if (foeSide.kind === 'wild' && !hasRule(foeSide, 'no_capture') &&
    meetsWildCapturePrerequisite(b.active(foeSide.index).species.id, mon.species.id)) {
    for (const id of available(side)) if ('capture_multiplier' in (b.data.items.get(id) ?? {})) actions.push({ kind: 'capture', item: id });
  }
  actions.push({ kind: 'flee' });
  return actions;
}

function moveActions(b: Battle, side: Side, mon: Mon): Action[] {
  const execution = b.forcedExecution(mon);
  const usable = mon.skills.filter((id) => mon.pp[id] > 0 && (!execution || isAttackSkill(b, mon, id)));
  if (!usable.length) return [{ kind: 'move', skill: STRUGGLE_SKILL.id }];
  const actions: Action[] = usable.map((id) => ({ kind: 'move', skill: id }));
  // A smart trainer left with only self-KO moves may Struggle instead; its planner weighs both.
  const selfKo = (id: number) => b.skill(id, mon).effects?.some((op) => op.op === 'script' && C.SELF_KO_SCRIPTS.has(op.id));
  const smartTrainer = side.kind === 'trainer' && ((mon.ai ?? side.ai)?.kind ?? 'smart') === 'smart';
  if (smartTrainer && usable.every(selfKo)) actions.push({ kind: 'move', skill: STRUGGLE_SKILL.id });
  return actions;
}

/** Item ids the side holds or may use without limit. */
function available(side: Side): string[] {
  return [...new Set([...Object.keys(side.items), ...side.unlimitedItems])].filter((id) => (side.items[id] ?? 0) > 0 || side.unlimitedItems.has(id));
}

/** Battle items, once per member they would change (a revive targets fainted members). */
function itemActions(b: Battle, side: Side): Action[] {
  const actions: Action[] = [];
  for (const id of available(side)) {
    const effects = b.data.items.get(id)?.battle_effects;
    if (!effects?.length) continue;
    const revives = effects.some((effect) => effect.op === 'revive');
    for (const target of side.team.filter((member) => revives ? member.fainted : !member.fainted)) {
      if (effects.some((effect) => itemEffectUseful(effect, target))) actions.push({ kind: 'item', item: id, target: target.slot });
    }
  }
  return actions;
}

function itemEffectUseful(effect: EffectOp, target: Mon): boolean {
  if (effect.target === 'foe') return true;
  if (effect.op === 'heal') return target.hp < target.maxHp;
  if (effect.op === 'restore_pp') return (effect.skill ? [effect.skill] : target.skills).some(skill => target.pp[skill] < target.maxPp[skill]);
  if (effect.op === 'cure_status') {
    return target.conditions.some(condition => condition.def.kind === 'status' && (!effect.statuses || effect.statuses.includes(condition.id)));
  }
  return true;
}

export function isLegal(b: Battle, sideIndex: 0 | 1, action: Action): boolean {
  const normalized = action.kind === 'item' && action.target === undefined
    ? { ...action, target: b.sides[sideIndex].active } : action;
  return b.legalActions(sideIndex).some((a) => sameAction(a, normalized));
}

function sameAction(a: Action, b: Action): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'move': return a.skill === (b as typeof a).skill;
    case 'switch': return a.slot === (b as typeof a).slot;
    case 'item': return a.item === (b as typeof a).item && a.target === (b as typeof a).target;
    case 'capture': return a.item === (b as typeof a).item;
    default: return true;
  }
}

export function useItem(b: Battle, side: Side, itemId: string, slot: number): void {
  const item = b.data.items.get(itemId)!;
  if (!side.unlimitedItems.has(itemId)) side.items[itemId]--;
  const mon = side.team[slot];
  b.emit({ type: 'item_used', side: side.index, item: itemId, slot, targetName: mon.name });
  b.usingItem = true;
  try {
    b.runEffects(item.battle_effects ?? [], mon, b.active((1 - side.index) as 0 | 1), emptyCtx());
  } finally {
    b.usingItem = false;
  }
}

export function tryCapture(b: Battle, side: Side, foe: Side, itemId: string): void {
  const item = b.data.items.get(itemId)!;
  if (!side.unlimitedItems.has(itemId)) side.items[itemId]--;
  const target = b.active(foe.index);
  const statuses = target.conditions.filter((c) => c.def.kind === 'status');
  const ok = rollReconstructedCapture({ maxHp: target.maxHp, hp: target.hp,
    catchRate: target.species.catch_rate ?? C.DEFAULT_CATCH_RATE, multiplier: item.capture_multiplier === null ? null : (item.capture_multiplier ?? 1),
    controlStatus: statuses.some((c) => c.def.control), anyStatus: statuses.length > 0,
  }, () => b.rng.next());
  b.emit({ type: 'capture_attempt', side: side.index, item: itemId, success: ok });
  if (ok) {
    b.capturedMon = target;
    finish(b, side.index, 'capture');
  }
}
