// Seer's abnormal statuses (异常状态) as ordinary conditions. RULES.md section 7.
// data/conditions.json may override any of these by id.

import type { ConditionDef } from './types.ts';
import { STATUS_DEFAULT_TURNS as T } from './constants.ts';

const cannotAct = { on: 'before_move' as const, prevent: true };
const dot = { on: 'turn_end' as const, damage_pct_max_hp: 12.5 };

export const BUILTIN_CONDITIONS: ConditionDef[] = [
  { id: 'paralysis', name: { zh: '麻痹' }, kind: 'status', control: true, default_turns: T, stack: 'fail', hooks: [cannotAct] },
  { id: 'poison', name: { zh: '中毒' }, kind: 'status', default_turns: T, stack: 'fail', hooks: [dot] },
  {
    id: 'burn', name: { zh: '烧伤' }, kind: 'status', default_turns: T, stack: 'fail',
    hooks: [dot, { on: 'modify_damage_dealt', multiplier: 0.5, kinds: ['attack'] }],
  },
  {
    id: 'leech', name: { zh: '寄生' }, kind: 'status', default_turns: 5, stack: 'fail',
    hooks: [{ on: 'turn_end', damage_pct_max_hp: 12.5, drain_to_foe: true }],
  },
  { id: 'freeze', name: { zh: '冻伤' }, kind: 'status', default_turns: T, stack: 'fail', hooks: [dot] },
  { id: 'fear', name: { zh: '害怕' }, kind: 'status', control: true, default_turns: T, stack: 'fail', hooks: [cannotAct] },
  { id: 'fatigue', name: { zh: '疲惫' }, kind: 'status', control: true, default_turns: T, stack: 'fail', hooks: [cannotAct] },
  {
    id: 'sleep', name: { zh: '睡眠' }, kind: 'status', control: true, default_turns: T, stack: 'fail',
    hooks: [cannotAct, { on: 'on_hurt', cure_on_attack_hit: true }],
  },
  { id: 'petrify', name: { zh: '石化' }, kind: 'status', control: true, default_turns: T, stack: 'fail', hooks: [cannotAct] },
  {
    id: 'confusion', name: { zh: '混乱' }, kind: 'status', default_turns: T, stack: 'fail',
    hooks: [{ on: 'before_move', fail_chance: 80, self_damage: { chance: 5, amount: 50 } }],
  },
  {
    id: 'weaken', name: { zh: '衰弱' }, kind: 'status', default_turns: T, stack: 'fail',
    hooks: [{ on: 'modify_damage_taken', multiplier_by_level: [1.25, 1.5, 2, 3.5, 6], kinds: ['attack'] }],
  },
  {
    id: 'flammable', name: { zh: '易燃' }, kind: 'status', default_turns: T, stack: 'fail',
    hooks: [
      { on: 'modify_accuracy', multiplier: 0.7 },
      { on: 'on_hurt', inflict_on_type: { type: 'fire', status: 'burn' } },
    ],
  },
  {
    id: 'frozen_solid', name: { zh: '冰封' }, kind: 'status', control: true, default_turns: T, stack: 'fail',
    hooks: [
      cannotAct,
      { on: 'on_expire', effects: [{ op: 'status', target: 'self', status: 'freeze' }, { op: 'stat_stage', target: 'self', stats: { spe: -1 } }] },
    ],
  },
  // Not statuses: engine conditions used by effect ops.
  { id: 'protect', name: { zh: '保护' }, kind: 'buff', default_turns: 1, stack: 'refresh', hooks: [{ on: 'block_move' }] },
];

export const CONTROL_STATUSES = BUILTIN_CONDITIONS.filter((c) => c.control).map((c) => c.id);
export const DOT_STATUSES = ['poison', 'burn', 'freeze', 'leech'];
