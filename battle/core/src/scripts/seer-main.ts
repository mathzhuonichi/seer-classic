// The 42 most used Seer effect templates (3+ skills each). Template text is
// quoted above each entry; `p` holds the original args {0}, {1}, ...
// Guide: SCRIPTS.md.

import type { ScriptRegistry } from '../types.ts';
import type { Battle } from '../engine/battle.ts';
import type { Mon } from '../engine/state.ts';
import type { ApplyCtx } from './context.ts';
import {
  BURN_DAMAGE_MULTIPLIER, PUNISH_MAX_POWER, PUNISH_POWER_PER_STAGE, REVERSAL_MIN_POWER, REVERSAL_POWER, REVERSAL_SCALE, STRANGE_STAGE_DEFAULT,
  STRANGE_STAGE_LIMIT, stageMultiplier,
} from '../constants.ts';
import { bonusDamageIf, drain, evade, hurtStatus, randomPower, selfStageIf, timedScripts, type Timed } from './builders.ts';
import { armBench, attach, disarm, hasStatus, hitFoe, landed, moveStages, scriptHooks, stat, status } from './util.ts';

type P = number[];

/** The move landed and knocked the foe out. */
const landedKo = (c: ApplyCtx) => c.ctx?.hit !== false && c.foe.fainted && c.ctx?.damageDealt > 0;

function lowerMaxHp(b: Battle, m: Mon, by: number): void {
  m.maxHp = Math.max(1, m.maxHp - by);
  m.hp = Math.min(m.hp, m.maxHp);
  b.emit({ type: 'max_hp_changed', side: m.side, maxHp: m.maxHp, hp: m.hp });
}

const TIMED: Record<string, Timed> = {
  // {0}回合若本方先手攻击，使得对方的技能失效
  seer_eff_52: {
    name: '先手无效', on: ['on_foe_move'],
    data: (c, p) => ({ from: c.battle.turn, until: c.battle.turn + p[0] - 1 }),
    hook: (c) => {
      const { battle, holder, cond } = c;
      const inWindow = battle.turn >= cond.data.from && battle.turn <= cond.data.until;
      return inWindow && holder.lastActedTurn === battle.turn ? 'negate' : undefined;
    },
  },

  // {0}%概率令对手在{1}回合内每回合受到{2}点固定伤害
  seer_eff_76: {
    name: '持续伤害', on: ['turn_end'], foe: true, turns: (p) => p[1],
    when: (c, p) => landed(c) && c.battle.rng.chance(p[0]),
    hook: (c, p: P) => { c.battle.dealDamage(c.holder, p[2], { kind: 'fixed' }); },
  },

  // 可以抵挡{0}点伤害 (a shield that absorbs that much damage in total)
  seer_eff_49: {
    name: '护盾', on: ['modify_damage_final'], turns: () => undefined, data: (_c, p) => ({ left: p[0] }),
    hook: (c) => {
      const { cond, amount, info, battle, holder } = c;
      if (info.kind === 'true' || !info.source) return;
      const absorbed = Math.min(cond.data.left, amount);
      cond.data.left -= absorbed;
      if (absorbed > 0) battle.emit({ type: 'shield_absorb', side: holder.side, amount: absorbed, left: cond.data.left });
      if (cond.data.left <= 0) battle.removeCondition(holder, cond.id);
      return amount - absorbed;
    },
  },

  // {0}回合内受到致死攻击时则余下1点体力
  seer_eff_68: {
    name: '不屈', on: ['modify_damage_final'],
    hook: (c) => {
      if (c.info.kind !== 'attack' || c.amount < c.holder.hp) return;
      c.battle.emit({ type: 'endure', side: c.holder.side });
      return c.holder.hp - 1;
    },
  },

  // {0}回合内若使用技能则恢复{1}点体力值
  seer_eff_77: { name: '技能回复', on: ['before_move'], hook: (c, p: P) => { c.battle.heal(c.holder, p[1]); } },

  // {0}回合内物理攻击对自身必定miss
  seer_eff_78: evade('物理闪避', 'physical'),

  // {0}回合内特殊攻击对自身必定miss
  seer_eff_106: evade('特殊闪避', 'special'),

  // {0}回合内受到物理攻击时有{1}%概率将对手麻痹
  seer_eff_84: hurtStatus('雷电护体', 'physical', 'paralysis'),

  // {0}回合内受到物理攻击时，有{1}%概率将对手冻伤
  seer_eff_92: hurtStatus('冰甲', 'physical', 'freeze'),

  // {0}回合内受到物理攻击时，有{1}%概率将对手烧伤
  seer_eff_108: hurtStatus('火焰战衣', 'physical', 'burn'),

  // {0}回合内若受到攻击则有{1}%概率令对手{2}
  seer_eff_164: hurtStatus('反击之阵'),

  // {0}回合内若对方使用属性技能，则{1}%使对方{2}
  seer_eff_152: {
    name: '属性反制', on: ['on_foe_move'],
    hook: (c, p: P) => {
      if (c.skill?.category !== 'status' || !c.battle.rng.chance(p[1])) return;
      c.battle.applyStatus(c.foe, status(p[2]), { source: c.holder });
    },
  },

  // {0}回合内对手的状态变化会同时作用在自己身上 (the foe's stage changes are mirrored onto the user)
  seer_eff_91: {
    name: '同步', on: ['on_stage_incoming'], foe: true, kind: 'other', data: (c) => ({ mirrorSide: c.user.side }),
    hook: (c) => {
      const mirror = c.battle.active(c.cond.data.mirrorSide);
      if (mirror && mirror !== c.holder && !mirror.fainted) c.battle.changeStage(mirror, c.stat, c.delta, false);
    },
  },

  // {0}回合内每次造成伤害的1/{1}会恢复自己的HP
  seer_eff_89: drain('吸血'),

  // {0}回合自身的防御力和对手相同
  seer_eff_45: {
    name: '模仿防御', on: ['modify_stat'],
    hook: (c) => {
      if (c.stat !== 'def') return;
      const foe: Mon = c.battle.foeOf(c.holder);
      return foe.stats.def * stageMultiplier(c.holder.stages.def);
    },
  },

  // {0}回合内受到任何伤害，自身{1}提高{2}个等级   (one skill can carry this twice, for two stats)
  seer_eff_123: {
    name: '受击强化', on: ['on_hurt'], key: (p) => p[1],
    hook: (c, p: P) => { if (c.source && c.source.side !== c.holder.side) c.battle.changeStage(c.holder, stat(p[1]), p[2], false); },
  },

  // (no template text) "陷入了奇怪的状态": approximated as {0} turns during which, each time
  // the foe uses a skill, {3}% chance its {1} stage changes by {2} (clamped, see constants.ts).
  seer_eff_174: {
    name: '奇怪的状态', on: ['before_move'], foe: true, key: (p) => p[1],
    hook: (c, p: P) => {
      const delta = Math.max(-STRANGE_STAGE_LIMIT, Math.min(STRANGE_STAGE_LIMIT, p[2] || STRANGE_STAGE_DEFAULT));
      if (c.battle.rng.chance(p[3])) c.battle.changeStage(c.holder, stat(p[1]), delta, true);
    },
  },

  // {0}回合内每回合被攻击所受到的伤害不超过{1}
  seer_eff_125: {
    name: '伤害上限', on: ['modify_damage_final'],
    hook: (c, p: P) => (c.info.kind === 'attack' ? Math.min(c.amount, p[1]) : undefined),
  },
};

const ENTRIES: ScriptRegistry = {
  // 连续使用每次威力增加{0}，最高威力{1}
  seer_eff_9: {
    power: (c, p: P, power) => {
      const n = c.estimate ? 1 : c.user.streak.skill === c.skill.id ? c.user.streak.count : 1;
      return Math.min(p[1], power + p[0] * (n - 1));
    },
  },

  // 惩罚，对方能力等级越高，此技能威力越大
  seer_eff_35: {
    power: (c, _p, power) => {
      const ups = Object.values(c.foe.stages as Record<string, number>).reduce((a, v) => a + Math.max(0, v), 0);
      return Math.min(PUNISH_MAX_POWER, power + PUNISH_POWER_PER_STAGE * ups);
    },
  },

  // {0}%降低对手所有技能{1}点PP值，然后若对手所选择的技能PP值为0则当回合对手无法行动
  seer_eff_39: {
    apply: (c: ApplyCtx, p: P) => {
      const { battle, foe } = c;
      if (!landed(c) || !battle.rng.chance(p[0])) return;
      for (const id of foe.skills) foe.pp[id] = Math.max(0, foe.pp[id] - p[1]);
      battle.emit({ type: 'pp_drained', side: foe.side, amount: p[1] });
      if (foe.lastActedTurn !== battle.turn) attach(battle, foe, 'seer_eff_39', 'PP耗尽', scriptHooks(['before_move'], 'seer_eff_39'), 1, { kind: 'debuff' });
    },
    hook: (c) => (c.skill && c.holder.pp[c.skill.id] === 0 ? 'prevent' : undefined),
  },

  // 将能力下降状态反馈给对手
  seer_eff_63: (c) => { if (landed(c)) moveStages(c.battle, c.user, c.foe, (v) => v < 0); },

  // 当次攻击击败对方出战精灵时恢复自身最大体力的1/{0}
  seer_eff_66: (c, p: P) => { if (landedKo(c)) c.battle.heal(c.user, c.user.maxHp / p[0]); },

  // 降低对方{0}点战斗时的最高HP
  seer_eff_38: (c, p: P) => { if (landed(c)) lowerMaxHp(c.battle, c.foe, p[0]); },

  // 对方烧伤时，附加{0}点伤害
  seer_eff_133: bonusDamageIf((c) => hasStatus(c.foe, 'burn')),

  // 对方处于冻伤状态时，附加{0}点伤害
  seer_eff_141: bonusDamageIf((c) => hasStatus(c.foe, 'freeze')),

  // 消耗自身全部体力(体力降到0)，使下一只出战精灵的{0}和{1}能力提升1个等级
  seer_eff_59: {
    apply: (c: ApplyCtx, p: P) => {
      const { battle, user } = c;
      armBench(battle, user.side, 'seer_eff_59', '能量传递', [p[0], p[1]]);
      battle.dealDamage(user, user.hp, { kind: 'true' });
    },
    hook: (c, stats: P) => {
      for (const s of stats) c.battle.changeStage(c.holder, stat(s), 1, false);
      disarm(c.battle, c.holder.side, 'seer_eff_59', true);
    },
  },

  // 威力随机，随机范围50~150
  seer_eff_61: randomPower(50, 150),

  // 威力随机，随机范围150~220
  seer_eff_70: randomPower(150, 220),

  // 自身体力越少则威力越大 (classic reversal table)
  seer_eff_100: {
    power: (c) => {
      const r = (REVERSAL_SCALE * c.user.hp) / c.user.maxHp;
      return REVERSAL_POWER.find(([bound]) => r <= bound)?.[1] ?? REVERSAL_MIN_POWER;
    },
  },

  // 若本次攻击造成的伤害小于{0}，则自身{1}提升1个等级
  seer_eff_107: (c, p: P) => { if (c.ctx.hit && c.ctx.damageDealt < p[0]) c.battle.changeStage(c.user, stat(p[1]), 1, false); },

  // 若对手{0}，则对对方造成伤害的1/{1}恢复自身体力
  seer_eff_154: (c, p: P) => { if (hasStatus(c.foe, status(p[0]))) c.battle.heal(c.user, c.ctx.damageDealt / p[1]); },

  // 当次攻击击败对手，则{1}%改变自身{0}等级+{2}
  seer_eff_158: selfStageIf(landedKo),

  // 当次攻击击败对方时减少对方下次出战精灵的最大体力1/{0}
  seer_eff_67: {
    apply: (c: ApplyCtx, p: P) => { if (landedKo(c)) armBench(c.battle, c.foe.side, 'seer_eff_67', '体力削减', p[0]); },
    hook: (c, div: number) => {
      lowerMaxHp(c.battle, c.holder, Math.floor(c.holder.maxHp / div));
      disarm(c.battle, c.holder.side, 'seer_eff_67', true);
    },
  },

  // 降低对方1/{0}的hp (of max HP)
  seer_eff_28: (c, p: P) => hitFoe(c, Math.max(1, c.foe.maxHp / p[0]), 'percent'),

  // 将所受的伤害{0}倍反馈给对手 (counter: damage taken this turn × {0})
  seer_eff_34: (c, p: P) => {
    const lt = c.user.persist.lastTaken;
    if (c.ctx.hit === false || !lt || lt.turn !== c.battle.turn) {
      c.battle.emit({ type: 'move_failed', side: c.user.side, reason: 'nothing_to_counter' });
      return;
    }
    c.battle.dealDamage(c.foe, lt.amount * p[0], { kind: 'fixed', source: c.user, skill: c.ctx.skill });
  },

  // 自身在烧伤、冻伤、中毒状态下造成的伤害反而加倍
  seer_eff_64: {
    modifyDamage: (c, _p, dmg) => {
      const u: Mon = c.user;
      if (!['burn', 'freeze', 'poison'].some((s) => hasStatus(u, s))) return dmg;
      return dmg * 2 * (hasStatus(u, 'burn') ? 1 / BURN_DAMAGE_MULTIPLIER : 1); // also cancels burn's halving
    },
  },

  // 使对手的能力提升效果转化到自己身上
  seer_eff_85: (c) => { if (landed(c)) moveStages(c.battle, c.foe, c.user, (v) => v > 0); },

  // 若对手处于{0}状态，{2}%自身{1}等级+{3}
  seer_eff_182: (c, p: P) => {
    if (hasStatus(c.foe, status(p[0])) && c.battle.rng.chance(p[2])) c.battle.changeStage(c.user, stat(p[1]), p[3], false);
  },

  // {0}回合内自身与对方反转战斗时属性 (swap types; restored when it ends)
  seer_eff_55: {
    apply: (c: ApplyCtx, p: P) => {
      const { battle, user, foe } = c;
      const data = { userTypes: [...user.types], foeTypes: [...foe.types], foeSide: foe.side };
      [user.types, foe.types] = [foe.types, user.types];
      battle.emit({ type: 'types_changed', side: user.side, types: [...user.types], foeTypes: [...foe.types] });
      attach(battle, user, 'seer_eff_55', '属性反转', scriptHooks(['on_expire'], 'seer_eff_55', p), p[0], { data });
    },
    hook: (c) => {
      const { battle, holder, cond } = c;
      holder.types = cond.data.userTypes;
      const foe = battle.active(cond.data.foeSide);
      if (foe) foe.types = cond.data.foeTypes;
      battle.emit({ type: 'types_changed', side: holder.side, types: [...holder.types] });
    },
  },

  // 损失1/2的体力，提升自身的能力 (特攻+2, 速度+1, 命中+1 per the skill texts)
  seer_eff_79: (c) => {
    const { battle, user } = c;
    battle.dealDamage(user, Math.floor(user.hp / 2), { kind: 'true' });
    if (user.fainted) return;
    battle.changeStage(user, 'spa', 2, false);
    battle.changeStage(user, 'spe', 1, false);
    battle.changeStage(user, 'acc', 1, false);
  },

  // 对手{0}等级{1}，若对手处于{2}状态，则弱化效果翻倍
  seer_eff_414: (c, p: P) => {
    const doubled = hasStatus(c.foe, status(p[2]));
    c.battle.changeStage(c.foe, stat(p[0]), p[1] * (doubled ? 2 : 1), true);
  },
};

export const MAIN_SCRIPTS: ScriptRegistry = { ...ENTRIES, ...timedScripts(TIMED) };
