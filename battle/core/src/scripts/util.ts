import type { ConditionDef, StageKey } from '../types.ts';
import type { Battle, Mon } from '../battle.ts';

export const STATUS_BY_INDEX: Record<number, string> = {
  0: 'paralysis', 1: 'poison', 2: 'burn', 3: 'leech', 4: 'leech', 5: 'freeze', 6: 'fear',
  7: 'fatigue', 8: 'sleep', 9: 'petrify', 10: 'confusion', 11: 'weaken', 13: 'flammable', 15: 'frozen_solid',
};
export const STAT_BY_INDEX: StageKey[] = ['atk', 'def', 'spa', 'spd', 'spe', 'acc'];

export const status = (i: number) => STATUS_BY_INDEX[i] ?? 'paralysis';
export const stat = (i: number) => STAT_BY_INDEX[i] ?? 'atk';

export const hasAnyStatus = (m: Mon) => m.conditions.some((c) => c.def.kind === 'status');
export const hasStatus = (m: Mon, id: string) => m.conditions.some((c) => c.id === id);
export const hasStageUp = (m: Mon) => Object.values(m.stages).some((v) => v > 0);
export const hasStageDown = (m: Mon) => Object.values(m.stages).some((v) => v < 0);

/** Adds a timed condition whose hooks call back into script `opts.script` (default: the condition id). */
export function scriptCondition(
  battle: Battle, mon: Mon, id: string, name: string,
  hooks: { on: string; params?: unknown }[], turns?: number | [number, number],
  opts: Partial<ConditionDef> & { charges?: number; data?: Record<string, unknown>; script?: string } = {},
): boolean {
  const def: ConditionDef = {
    id, name: { zh: name }, kind: opts.kind ?? 'buff', stack: opts.stack ?? 'refresh',
    removed_on_switch: opts.removed_on_switch,
    hooks: hooks.map((h) => ({ on: h.on as any, script: opts.script ?? id, params: h.params })),
  };
  const ok = battle.addCondition(mon, def, turns, undefined, opts.charges);
  const c = mon.conditions.find((x) => x.id === id);
  if (c && opts.data) c.data = { ...(c.data ?? {}), ...opts.data };
  return ok;
}
