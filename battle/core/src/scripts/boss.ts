// Boss rule scripts used by data/bosses (`{ rule: 'script', id, params }` and
// phase ops `{ op: 'script', id }`). Rules use `install`, which runs once per boss
// monster at battle start and usually attaches a permanent condition.

import type { ScriptEntry, ScriptRegistry } from '../types.ts';
import type { Battle, Mon } from '../battle.ts';
import { scriptCondition } from './util.ts';

/** Permanent boss condition whose hooks call this script's `hook`. */
const trait = (battle: Battle, mon: Mon, id: string, on: string[], data: Record<string, unknown> = {}) =>
  scriptCondition(battle, mon, `boss_${id}`, id, on.map((o) => ({ on: o })), undefined, { removed_on_switch: false, kind: 'other', script: id, data });

const foeId = (m: Mon) => m.uid ?? `slot${m.slot}`;

const rules: Record<string, ScriptEntry> = {
  // every turn the foe loses a flat amount and the boss heals; larger below a threshold
  drain_each_turn: {
    install: (c, p) => { trait(c.battle, c.mon, 'drain_each_turn', ['turn_end'], p); },
    hook: (c) => {
      const p = c.cond.data, low = (c.holder.hp / c.holder.maxHp) * 100 < (p.below_pct ?? 0);
      const foe: Mon = c.battle.foeOf(c.holder);
      if (!foe.fainted) c.battle.dealDamage(foe, low ? p.foe_loss_low ?? p.foe_loss : p.foe_loss, { kind: 'fixed', source: c.holder });
      c.battle.heal(c.holder, low ? p.self_heal_low ?? p.self_heal : p.self_heal);
    },
  },
  // the foe cannot clear the boss's stat boosts (optionally only some stats)
  stages_unclearable: {
    install: (c, p) => { trait(c.battle, c.mon, 'stages_unclearable', ['on_stage_incoming'], p); },
    hook: (c) => {
      const stats: string[] | undefined = c.cond.data.stats;
      if (c.byFoe && c.clear && (!stats || stats.includes(c.stat))) return false;
    },
  },
  // listed skills (by Chinese name) have no effect on the boss
  immune_skill_list: {
    install: (c, p) => { trait(c.battle, c.mon, 'immune_skill_list', ['on_foe_move'], p); },
    hook: (c) => (c.targetsHolder && c.cond.data.skills_zh?.includes(c.skill?.name?.zh) ? 'negate' : undefined),
  },
  // each turn end the foe's stages change
  foe_stage_each_turn: {
    install: (c, p) => { trait(c.battle, c.mon, 'foe_stage_each_turn', ['turn_end'], p); },
    hook: (c) => {
      const foe: Mon = c.battle.foeOf(c.holder);
      for (const [k, d] of Object.entries(c.cond.data.stats ?? {})) c.battle.changeStage(foe, k as any, d as number, true);
    },
  },
  // when a new foe comes in, the boss copies its stat boosts (checked at turn start)
  copy_foe_boosts_on_switch_in: {
    install: (c) => { trait(c.battle, c.mon, 'copy_foe_boosts_on_switch_in', ['turn_start']); },
    hook: (c) => {
      const foe: Mon = c.battle.foeOf(c.holder);
      if (c.cond.data.lastFoe === foeId(foe)) return;
      c.cond.data.lastFoe = foeId(foe);
      for (const [k, v] of Object.entries(foe.stages)) if (v > c.holder.stages[k as keyof Mon['stages']]) c.battle.changeStage(c.holder, k as any, v - c.holder.stages[k as keyof Mon['stages']], false);
    },
  },
  // statuses inflicted on the boss are also inflicted on the attacker
  mirror_status_to_attacker: {
    install: (c, p) => { trait(c.battle, c.mon, 'mirror_status_to_attacker', ['on_status_incoming'], p); },
    hook: (c) => {
      const list: string[] | undefined = c.cond.data.statuses;
      if (c.source && c.source !== c.holder && (!list || list.includes(c.status))) {
        c.battle.applyStatus(c.source, c.status, { turns: c.turns, fromFoe: true });
      }
    },
  },
  // the boss heals a share of the attack damage it deals
  lifesteal: {
    install: (c, p) => { trait(c.battle, c.mon, 'lifesteal', ['on_hit'], p); },
    hook: (c) => { if (c.ctx?.damageDealt > 0) c.battle.heal(c.holder, (c.ctx.damageDealt * c.cond.data.pct_damage_dealt) / 100); },
  },
  // the longer the same foe stays in, the stronger the boss gets
  escalate_vs_same_foe: {
    install: (c, p) => { trait(c.battle, c.mon, 'escalate_vs_same_foe', ['turn_end'], p); },
    hook: (c) => {
      const d = c.cond.data, foe: Mon = c.battle.foeOf(c.holder);
      if (d.lastFoe !== undefined && d.lastFoe !== foeId(foe) && d.reset_on_foe_switch) c.battle.clearStages(c.holder, 'up');
      if (d.lastFoe === foeId(foe)) for (const [k, v] of Object.entries(d.stats ?? {})) c.battle.changeStage(c.holder, k as any, v as number, false);
      d.lastFoe = foeId(foe);
    },
  },
  // attacking the boss can inflict a status on the attacker
  status_on_attacker: {
    install: (c, p) => { trait(c.battle, c.mon, 'status_on_attacker', ['on_hurt'], p); },
    hook: (c) => {
      const p = c.cond.data;
      if (!c.source || c.source.side === c.holder.side || c.info.kind !== 'attack' || !c.battle.rng.chance(p.chance ?? 100)) return;
      const turns = p.turns_min !== undefined ? [p.turns_min, p.turns_max ?? p.turns_min] : undefined;
      c.battle.applyStatus(c.source, p.status, { turns, source: c.holder });
    },
  },
  // chance to heal at turn end
  random_heal: {
    install: (c, p) => { trait(c.battle, c.mon, 'random_heal', ['turn_end'], p); },
    hook: (c) => { if (c.battle.rng.chance(c.cond.data.chance)) c.battle.heal(c.holder, (c.holder.maxHp * c.cond.data.pct_max_hp) / 100); },
  },
  // the boss's attacks ignore the player's damage reductions (all, or listed skills)
  ignore_player_damage_reduction: {
    install: (c, p) => { c.mon.persist.ignoreReduction = p.skills_zh ?? true; },
  },
  // the foe gets a status every turn end from a given turn
  foe_status_each_turn: {
    install: (c, p) => { trait(c.battle, c.mon, 'foe_status_each_turn', ['turn_end'], p); },
    hook: (c) => {
      if (c.battle.turn < (c.cond.data.from_turn ?? 1)) return;
      const foe: Mon = c.battle.foeOf(c.holder);
      if (!foe.conditions.some((x) => x.id === c.cond.data.status)) c.battle.applyStatus(foe, c.cond.data.status, { source: c.holder });
    },
  },
  // chance to move first regardless of priority
  random_priority: {
    install: (c, p) => { trait(c.battle, c.mon, 'random_priority', ['modify_priority'], p); },
    hook: (c) => (c.battle.rng.chance(c.cond.data.chance) ? Math.max(c.priority, 5) : undefined),
  },
  // one boss skill gets an extra status chance
  skill_effect_override: {
    install: (c, p) => { trait(c.battle, c.mon, 'skill_effect_override', ['on_hit'], p); },
    hook: (c) => {
      const p = c.cond.data;
      if (c.skill?.id === p.skill && c.battle.rng.chance(p.chance)) c.battle.applyStatus(c.battle.foeOf(c.holder), p.status, { source: c.holder });
    },
  },
  // the boss's per-hit damage cap may fail while it has one of these statuses
  damage_cap_breaks_on_dot: {
    install: (c, p) => { c.mon.persist.capBreak = { statuses: p.statuses ?? ['burn', 'freeze', 'poison'], chance: p.chance ?? 100 }; },
  },
  // the foe cannot raise its stats
  foe_cannot_boost: {
    install: (c) => { c.mon.persist.foeCannotBoost = true; },
  },
};

// phase ops `{ op: 'script', id, params }`
const phaseOps: Record<string, ScriptEntry> = {
  crit_rate_up: (c: any, p: any) => {
    const def = { id: 'boss_crit_rate_up', name: { zh: '致命一击率提升' }, kind: 'buff' as const, removed_on_switch: false, stack: 'add' as const, hooks: [{ on: 'modify_crit_rate' as const, add: p.stages ?? 1 }] };
    c.battle.addCondition(c.user, def);
  },
  heal_flat: (c: any, p: any) => { c.battle.heal(c.user, p.amount); },
  always_crit: (c: any) => { c.user.persist.always_crit_below_pct = true; c.battle.emit({ type: 'boss_trait', side: c.user.side, trait: 'always_crit' }); },
  damage_dealt_multiplier: (c: any, p: any) => {
    const def = { id: 'boss_damage_up', name: { zh: '伤害提升' }, kind: 'buff' as const, removed_on_switch: false, hooks: [{ on: 'modify_damage_dealt' as const, multiplier: p.multiplier }] };
    c.battle.addCondition(c.user, def);
  },
} as any;

export const BOSS_SCRIPTS: ScriptRegistry = { ...rules, ...phaseOps };
