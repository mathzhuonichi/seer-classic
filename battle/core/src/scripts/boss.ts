// Boss rule scripts used by data/bosses. Rules `{ rule: 'script', id, params }`
// use `install`, which runs once per boss monster at battle start; phase ops
// `{ op: 'script', id, params }` use `apply`. Rules marked V56 were explicitly
// encoded but missing their execution path; their parameter fidelity is
// recorded in data/boss-rule-support-v56.json and the V56 audit note.

import type { Hook, HookPoint, ScriptEntry, ScriptRegistry, StageKey } from '../types.ts';
import type { Battle } from '../engine/battle.ts';
import type { Mon } from '../engine/state.ts';
import { ALWAYS_FIRST_PRIORITY, RANDOM_PRIORITY_FLOOR } from '../constants.ts';
import { ruleScripts, type HookFn, type RuleSpec } from './builders.ts';
import { attach, fromFoeAttack, raiseStagesTo, ruleCondition, scriptHooks } from './util.ts';

/** Attaches the permanent condition `boss_<id>`, whose hooks call script `id`, with `data` as its state.
 * Installing the same rule again refreshes that condition (field rules install once per boss member). */
const attachRule = (b: Battle, mon: Mon, id: string, on: HookPoint[], data: Record<string, unknown> = {}) =>
  ruleCondition(b, mon, `boss_${id}`, id, scriptHooks(on, id), data);

const foeId = (m: Mon) => m.uid ?? `slot${m.slot}`;

function fieldMembers(b: Battle, owner: Mon, sides: string): Mon[] {
  return (sides === 'both' ? b.sides : [b.sides[owner.side]]).flatMap((side) => side.team);
}

/** Attacking the holder can inflict `status` on the attacker (only `categories` of attacks, when listed). Shared with campaign rules. */
export const statusOnAttacker: HookFn = (c) => {
  const p = c.cond.data;
  if (!fromFoeAttack(c) || (p.categories && !p.categories.includes(c.info.skill?.category)) || !c.battle.rng.chance(p.chance ?? 100)) return;
  const turns = p.turns_min !== undefined ? [p.turns_min, p.turns_max ?? p.turns_min] : undefined;
  c.battle.applyStatus(c.source, p.status, { turns, source: c.holder });
};

/** Rules that attach their condition (params as its state) and react through `hook`. */
const CONDITION_RULES: Record<string, RuleSpec> = {
  // every turn the foe loses a flat amount and the boss heals; larger below a threshold
  drain_each_turn: {
    on: ['turn_end'],
    hook: (c) => {
      const p = c.cond.data, low = (c.holder.hp / c.holder.maxHp) * 100 < (p.below_pct ?? 0);
      const foe: Mon = c.battle.foeOf(c.holder);
      if (!foe.fainted) c.battle.dealDamage(foe, low ? p.foe_loss_low ?? p.foe_loss : p.foe_loss, { kind: 'fixed', source: c.holder });
      c.battle.heal(c.holder, low ? p.self_heal_low ?? p.self_heal : p.self_heal);
    },
  },
  // the foe cannot clear the boss's stat boosts (optionally only some stats)
  stages_unclearable: {
    on: ['on_stage_incoming'],
    hook: (c) => {
      const stats: string[] | undefined = c.cond.data.stats;
      if (c.byFoe && c.clear && (!stats || stats.includes(c.stat))) return false;
    },
  },
  // listed skills (by Chinese name) have no effect on the boss
  immune_skill_list: {
    on: ['on_foe_move'],
    hook: (c) => (c.targetsHolder && c.cond.data.skills_zh?.includes(c.skill?.name?.zh) ? 'negate' : undefined),
  },
  // each turn end the foe's stages change
  foe_stage_each_turn: {
    on: ['turn_end'],
    hook: (c) => {
      const foe: Mon = c.battle.foeOf(c.holder);
      for (const [k, d] of Object.entries(c.cond.data.stats ?? {})) c.battle.changeStage(foe, k as StageKey, d as number, true);
    },
  },
  // when a new foe comes in, the boss copies its stat boosts (checked at turn start)
  copy_foe_boosts_on_switch_in: {
    on: ['turn_start'],
    hook: (c) => {
      const foe: Mon = c.battle.foeOf(c.holder);
      if (c.cond.data.lastFoe === foeId(foe)) return;
      c.cond.data.lastFoe = foeId(foe);
      raiseStagesTo(c.battle, c.holder, foe.stages);
    },
  },
  // statuses inflicted on the boss are also inflicted on the attacker
  mirror_status_to_attacker: {
    on: ['on_status_incoming'],
    hook: (c) => {
      const list: string[] | undefined = c.cond.data.statuses;
      if (c.source && c.source !== c.holder && (!list || list.includes(c.status))) {
        c.battle.applyStatus(c.source, c.status, { turns: c.turns, fromFoe: true });
      }
    },
  },
  // the boss heals a share of the attack damage it deals
  lifesteal: {
    on: ['on_hit'],
    hook: (c) => { if (c.ctx?.damageDealt > 0) c.battle.heal(c.holder, (c.ctx.damageDealt * c.cond.data.pct_damage_dealt) / 100); },
  },
  // the longer the same foe stays in, the stronger the boss gets
  escalate_vs_same_foe: {
    on: ['turn_end'],
    hook: (c) => {
      const d = c.cond.data, foe: Mon = c.battle.foeOf(c.holder);
      if (d.lastFoe !== undefined && d.lastFoe !== foeId(foe) && d.reset_on_foe_switch) c.battle.clearStages(c.holder, 'up');
      if (d.lastFoe === foeId(foe)) for (const [k, v] of Object.entries(d.stats ?? {})) c.battle.changeStage(c.holder, k as StageKey, v as number, false);
      d.lastFoe = foeId(foe);
    },
  },
  status_on_attacker: { on: ['on_hurt'], hook: statusOnAttacker },
  // chance to heal at turn end
  random_heal: {
    on: ['turn_end'],
    hook: (c) => { if (c.battle.rng.chance(c.cond.data.chance)) c.battle.heal(c.holder, (c.holder.maxHp * c.cond.data.pct_max_hp) / 100); },
  },
  // the foe gets a status every turn end from a given turn
  foe_status_each_turn: {
    on: ['turn_end'],
    hook: (c) => {
      if (c.battle.turn < (c.cond.data.from_turn ?? 1)) return;
      const foe: Mon = c.battle.foeOf(c.holder);
      if (!foe.conditions.some((x) => x.id === c.cond.data.status)) c.battle.applyStatus(foe, c.cond.data.status, { source: c.holder });
    },
  },
  // chance to move first regardless of priority
  random_priority: {
    on: ['modify_priority'],
    hook: (c) => (c.battle.rng.chance(c.cond.data.chance) ? Math.max(c.priority, RANDOM_PRIORITY_FLOOR) : undefined),
  },
  // one boss skill gets an extra status chance
  skill_effect_override: {
    on: ['on_hit'],
    hook: (c) => {
      const p = c.cond.data;
      if (c.skill?.id === p.skill && c.battle.rng.chance(p.chance)) c.battle.applyStatus(c.battle.foeOf(c.holder), p.status, { source: c.holder });
    },
  },
  // V56
  always_move_first: { on: ['modify_priority'], hook: () => ALWAYS_FIRST_PRIORITY },
  always_crit_after_turn: { on: ['modify_crit_rate'], hook: (c) => (c.battle.turn > c.cond.data.turn ? { force: true } : undefined) },
  unlimited_pp_skill: { on: ['pp_cost'], hook: (c) => (c.skill.id === c.cond.data.skill ? 0 : undefined) },
};

/** Rules with their own install: one-off changes, plain conditions, and conditions on every field member. */
const INSTALL_RULES: Record<string, ScriptEntry> = {
  // the boss's attacks ignore the player's damage reductions (all, or listed skills)
  ignore_player_damage_reduction: { install: (c, p) => { c.mon.persist.ignoreReduction = p.skills_zh ?? true; } },
  // the boss's per-hit damage cap may fail while it has one of these statuses
  damage_cap_breaks_on_dot: {
    install: (c, p) => { c.mon.persist.capBreak = { statuses: p.statuses ?? ['burn', 'freeze', 'poison'], chance: p.chance ?? 100 }; },
  },
  // the foe cannot raise its stats
  foe_cannot_boost: { install: (c) => { c.mon.persist.foeCannotBoost = true; } },
  // V56. Explicitly waived by the user in V57: keep the historical declaration,
  // but do not invent or silently claim to implement its probability curve.
  crit_rate_scales_with_hp_lost: {
    install: (c) => { c.battle.emit({ type: 'mechanic_waived', side: c.mon.side, policy: 'v57-eersaila-critical-curve' }); },
  },
  // V56. The game applies this before construction, where the saved attempt
  // counter is available (src/domain/challenges/boss-encounter.ts); the battle must not apply it twice.
  level_drops_per_attempt: { install: () => {} },
  crit_rate_bonus: {
    install: (c, p) => {
      attach(c.battle, c.mon, 'boss_crit_rate_bonus', '致命一击率提升', [{ on: 'modify_crit_rate', add: p.stages }], undefined, { kind: 'other', persist: true });
    },
  },
  hp_multiplier: {
    install: (c, p) => {
      const ratio = c.mon.hp / c.mon.maxHp;
      c.mon.maxHp = Math.max(1, Math.floor(c.mon.maxHp * p.multiplier));
      c.mon.stats.hp = c.mon.maxHp; c.mon.hp = Math.max(1, Math.floor(c.mon.maxHp * ratio));
    },
  },
  evasion_bonus: { install: (c, p) => { c.battle.changeStage(c.mon, 'eva', p.stages, false); } },
  damage_only_from_own_type_normal_or_status: {
    install: (c) => { c.mon.rules.push({ rule: 'damage_only_from', types: [...c.mon.types, 'normal'], allow_categories: ['status'] }); },
  },
  type_rotation: { install: (c, p) => { c.mon.rules.push({ rule: 'type_rotation', order: [...p.order] }); } },
  field_heal_each_turn: {
    install: (c, p) => { for (const mon of fieldMembers(c.battle, c.mon, p.sides)) attachRule(c.battle, mon, 'field_heal_each_turn', ['turn_end'], p); },
    hook: (c) => { c.battle.heal(c.holder, (c.holder.maxHp * c.cond.data.pct_max_hp) / 100); },
  },
  field_damage_each_turn: {
    install: (c, p) => { for (const mon of fieldMembers(c.battle, c.mon, p.sides)) attachRule(c.battle, mon, 'field_damage_each_turn', ['turn_end'], p); },
    hook: (c) => { c.battle.dealDamage(c.holder, c.cond.data.amount, { kind: 'fixed' }); },
  },
  field_damage_multiplier: {
    install: (c, p) => {
      for (const mon of fieldMembers(c.battle, c.mon, p.sides)) {
        const hooks: Hook[] = [{ on: 'modify_damage_dealt', multiplier: p.multiplier, kinds: ['attack'] }];
        attach(c.battle, mon, 'boss_field_damage_multiplier', '能量领域', hooks, undefined, { kind: 'other', persist: true });
      }
    },
  },
  revive_unless_status_ko: {
    install: (c, p) => {
      c.mon.persist.reviveUnlessStatusKo = { maxRevives: p.max_revives, ...(p.through_turn === undefined ? {} : { throughTurn: p.through_turn }) };
    },
  },
};

/** Phase ops `{ op: 'script', id, params }`. */
const PHASE_OPS: ScriptRegistry = {
  crit_rate_up: (c, p) => {
    c.battle.addCondition(c.user, {
      id: 'boss_crit_rate_up', name: { zh: '致命一击率提升' }, kind: 'buff', removed_on_switch: false, stack: 'add',
      hooks: [{ on: 'modify_crit_rate', add: p.stages ?? 1 }],
    });
  },
  heal_flat: (c, p) => { c.battle.heal(c.user, p.amount); },
  always_crit: (c) => { c.user.persist.always_crit_below_pct = true; c.battle.emit({ type: 'boss_trait', side: c.user.side, trait: 'always_crit' }); },
  damage_dealt_multiplier: (c, p) => {
    attach(c.battle, c.user, 'boss_damage_up', '伤害提升', [{ on: 'modify_damage_dealt', multiplier: p.multiplier }], undefined, { persist: true });
  },
  // V56
  ohko_attacks: {
    apply: (c: any, p: any) => {
      c.user.persist.ohko_below_pct = true;
      if (p?.ignore_speed) attachRule(c.battle, c.user, 'always_move_first', ['modify_priority']);
      c.battle.emit({ type: 'boss_trait', side: c.user.side, trait: 'ohko_attacks' });
    },
  },
  block_new_status: {
    apply: (c) => {
      c.user.rules.push({ rule: 'immune_status' });
      c.battle.emit({ type: 'boss_trait', side: c.user.side, trait: 'block_new_status' });
    },
  },
  // The normal flee_after_skill path resolves this outcome immediately. This
  // predicate also makes the catalog's explicit loss objective well-defined.
  boss_fled: { apply: (c) => c.battle.result?.reason === 'boss_fled' },
};

export const BOSS_SCRIPTS: ScriptRegistry = {
  ...ruleScripts(CONDITION_RULES, (c, p, id, rule) => { attachRule(c.battle, c.mon, id, rule.on, p); }),
  ...INSTALL_RULES,
  ...PHASE_OPS,
};
