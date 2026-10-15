// Seer side-effect templates, tail of the list (1–2 skills each).
// Template text: data/scripts_needed.md. How scripts work: SCRIPTS.md.
//
// Interpretations used throughout:
// - 性别 (雌性/雄性) does not exist in our data: gender branches never match.
// - "属性相同" without a subject = user and foe share a type (as 401/403 spell out).
// - "属性技能/属性攻击" = status skills (category 'status').
// - "N回合内每回合…" effects fire once per counted turn (turn_end, skipping the
//   turn the condition was applied in, or turn_start for self boosts).
//
// ENGINE GAPS:
// seer_eff_113: Mon does not keep its IV; it is estimated from max HP assuming 0 EVs, power = 50 + 2*IV (formula guessed).
// seer_eff_111: the level → bonus damage formula is unknown; bonus fixed damage = user level.
// seer_eff_163: there is no hook after the foe's own move, so the status lands as its status skill is used (before its effects).
// seer_eff_156: accuracy/evasion boosts are read from stages directly by the engine (no hook), so only atk/def/spa/spd/spe boosts are neutralised.
// seer_eff_420: "受到消除强化类技能攻击" is detected from the foe's skill data (clear_stages op on the foe, or scripts 85/143) when the move is used.

import type { ConditionDef, HookPoint, ScriptEntry, ScriptRegistry, StageKey } from '../types.ts';
import type { ActiveCondition, Battle, Mon } from '../battle.ts';
import { stageMultiplier } from '../constants.ts';
import { STAT_BY_INDEX, hasAnyStatus, hasStageDown, hasStageUp, hasStatus, stat, status } from './util.ts';

// ---------- helpers ----------

const RANDOM6 = ['burn', 'freeze', 'poison', 'paralysis', 'fear', 'sleep'];
const CLEAR_SCRIPTS = new Set(['seer_eff_85', 'seer_eff_143']);
const isGender = (_m: Mon, _g: number) => false; // no gender in our data
const sameType = (a: Mon, b: Mon) => a.types.some((t) => b.types.includes(t));
let reflecting = false; // seer_eff_191 re-entrancy guard

/** Extra fixed damage from the move to the foe (only on a hit, foe still standing). */
function fixed(c: any, n: number): void {
  if (c.ctx?.hit === false || c.foe.fainted || n < 1) return;
  c.battle.dealDamage(c.foe, Math.floor(n), { kind: 'fixed', source: c.user, skill: c.ctx?.skill });
}
function pctDmg(c: any, n: number): void {
  if (c.ctx?.hit === false || c.foe.fainted || n < 1) return;
  c.battle.dealDamage(c.foe, Math.floor(n), { kind: 'percent', source: c.user, skill: c.ctx?.skill });
}
/** Self-inflicted HP cost (ignores damage modifiers). */
const selfLoss = (b: Battle, m: Mon, n: number) => (n >= 1 ? b.dealDamage(m, Math.floor(n), { kind: 'true' }) : 0);
const stages = (b: Battle, m: Mon, list: StageKey[], d: number, byFoe: boolean) => { for (const s of list) b.changeStage(m, s, d, byFoe); };
const pickN = <T>(b: Battle, xs: T[], n: number): T[] => {
  const pool = [...xs], out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(pool.indexOf(b.rng.pick(pool)), 1)[0]);
  return out;
};
/** The condition ticks this turn (it was not applied this turn). */
const counts = (c: any) => c.cond.appliedTurn !== c.battle.turn;
/** The condition ends at this turn's end. */
const expiring = (c: any) => counts(c) && c.cond.turns <= 1;
/** First time this condition reacts this turn. */
function once(c: any): boolean {
  const d = (c.cond.data ??= {});
  if (d.turn === c.battle.turn) return false;
  d.turn = c.battle.turn;
  return true;
}
const fromFoeAttack = (c: any) => c.info?.kind === 'attack' && !!c.source && c.source.side !== c.holder.side;
const koByMove = (c: any) => c.foe.fainted && c.battle.lastKo?.target === c.foe && c.battle.lastKo?.by === c.user;
const ignoreBoost = (foe: Mon, s: StageKey, D: number) =>
  foe.stages[s] > 0 && !foe.conditions.some((x) => x.id === 'seer_eff_156') ? D / stageMultiplier(foe.stages[s]) : D;

/** Adds a scripted condition; hooks call `o.script` (default: id) with `p`. */
function sc(
  b: Battle, mon: Mon, id: string, name: string, points: string[], p: unknown, turns?: number | [number, number],
  o: { script?: string; kind?: ConditionDef['kind']; persist?: boolean; data?: Record<string, any>; cover?: boolean } = {},
): ActiveCondition | undefined {
  const def: ConditionDef = {
    id, name: { zh: name }, kind: o.kind ?? 'buff', stack: 'refresh', removed_on_switch: o.persist ? false : undefined,
    hooks: points.map((on) => ({ on: on as HookPoint, script: o.script ?? id, params: p })),
  };
  if (!b.addCondition(mon, def, turns)) return undefined;
  const c = mon.conditions.find((x) => x.id === id)!;
  if (o.data) c.data = { ...o.data };
  if (o.cover) c.appliedTurn = b.turn - 1; // the current turn counts as the first one
  return c;
}
/** Plain (non-script) condition with fixed hooks. */
function plain(b: Battle, mon: Mon, id: string, name: string, hooks: ConditionDef['hooks'], turns: number): void {
  b.addCondition(mon, { id, name: { zh: name }, kind: 'buff', stack: 'refresh', hooks }, turns);
}
/** Marks every benched, conscious monster of `side`: the next one to switch in triggers `script`'s on_switch_in. */
function armBench(b: Battle, side: 0 | 1, id: string, script: string, name: string, p: unknown): void {
  const s = b.sides[side];
  for (const m of s.team) if (!m.fainted && m.slot !== s.active) sc(b, m, id, name, ['on_switch_in'], p, undefined, { script, kind: 'other', persist: true });
}
function disarm(b: Battle, side: 0 | 1, id: string): void {
  for (const m of b.sides[side].team) if (m.conditions.some((x) => x.id === id)) b.removeCondition(m, id);
}
function estimateIv(m: Mon): number {
  const base = m.species.base.hp, L = m.level;
  let iv = 0;
  for (let i = 0; i <= 31; i++) if (Math.floor(((2 * base + i) * L) / 100) + L + 10 <= m.maxHp) iv = i;
  return iv;
}
const NOOP: ScriptEntry = { apply() {} };

// ---------- templates ----------

const TAIL: Record<string, ScriptEntry> = {
  // 消除对手回合类效果
  seer_eff_180: {
    apply(c) {
      for (const x of [...c.foe.conditions] as ActiveCondition[]) {
        if (x.def.kind === 'buff' && (x.turns !== Infinity || x.charges !== undefined)) c.battle.removeCondition(c.foe, x.id);
      }
    },
  },
  // 附加所造成伤害值{0}%的固定伤害
  seer_eff_422: { apply(c, p) { fixed(c, (c.ctx.damageDealt * p[0]) / 100); } },
  // 对手处于睡眠状态时，致命一击率提升{0}%   (arg is x/16: 4 = 25%)
  seer_eff_95: { crit(c, p) { return hasStatus(c.foe, 'sleep') ? { add: p[0] } : undefined; } },
  // 对方为{0}则附加{1}点伤害   (gender: never matches)
  seer_eff_130: { apply(c, p) { if (isGender(c.foe, p[0])) fixed(c, p[1]); } },
  // 若对手处于能力下降状态则附加{0}点伤害
  seer_eff_167: { apply(c, p) { if (hasStageDown(c.foe)) fixed(c, p[0]); } },
  // 若对手处于异常状态，则{1}%自身{0}等级{2}
  seer_eff_175: { apply(c, p) { if (hasAnyStatus(c.foe) && c.battle.rng.chance(p[1])) c.battle.changeStage(c.user, stat(p[0]), p[2], false); } },
  // 若对手处于能力提升状态，则{1}%自身{0}等级+{2}
  seer_eff_184: { apply(c, p) { if (hasStageUp(c.foe) && c.battle.rng.chance(p[1])) c.battle.changeStage(c.user, stat(p[0]), p[2], false); } },
  // 无视对手双防能力提升状态
  seer_eff_195: { defense(c, _p, D) { return ignoreBoost(c.foe, c.skill.category === 'physical' ? 'def' : 'spd', D); } },
  // 若对手处于能力提升状态则附加{0}点固定伤害
  seer_eff_413: { apply(c, p) { if (hasStageUp(c.foe)) fixed(c, p[0]); } },
  // 若对手处于能力提升状态则对方{0}等级{1}
  seer_eff_418: { apply(c, p) { if (hasStageUp(c.foe)) c.battle.changeStage(c.foe, stat(p[0]), p[1], true); } },
  // {0}回合自身的攻击力和对手相同   (copies the foe's attack stat; own stages still apply)
  seer_eff_51: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_51', '攻击力复制', ['modify_stat'], p, p[0]); },
    hook(c) { if (c.stat === 'atk') return c.foe.stats.atk * stageMultiplier(c.holder.stages.atk); },
  },
  // {0}回合内使自身的属性和对方的属性相同
  seer_eff_56: {
    apply(c, p) {
      const { battle: b, user, foe } = c;
      const orig = user.conditions.find((x: ActiveCondition) => x.id === 'seer_eff_56')?.data?.orig ?? [...user.types];
      if (!sc(b, user, 'seer_eff_56', '属性复制', ['on_expire', 'on_switch_in'], p, p[0], { persist: true, data: { orig } })) return;
      user.types = [...foe.types];
      b.emit({ type: 'types_changed', side: user.side, types: [...user.types] });
    },
    hook(c) {
      // persists through switch-out so the types can be restored when it comes back
      if (c.point === 'on_switch_in') return c.battle.removeCondition(c.holder, 'seer_eff_56');
      c.holder.types = [...c.cond.data.orig]; // on_expire: expired, cured or removed
      c.battle.emit({ type: 'types_changed', side: c.holder.side, types: [...c.holder.types] });
    },
  },
  // 消耗自身全部体力，己方下2次攻击技能必定打出致命一击   (2 charges shared by the team)
  seer_eff_71: {
    apply(c) {
      const { battle: b, user } = c;
      const pool = { left: 2 };
      for (const m of b.sides[user.side].team) {
        if (m !== user && !m.fainted) sc(b, m, 'seer_eff_71', '必定致命一击', ['modify_crit_rate', 'on_hit'], [], undefined, { persist: true, data: { pool } });
      }
      selfLoss(b, user, user.hp);
    },
    hook(c) {
      const pool = c.cond.data.pool;
      if (c.skill?.category === 'status' || pool.left <= 0) return;
      if (c.point === 'modify_crit_rate') return { force: true };
      if (c.point === 'on_hit' && --pool.left <= 0) disarm(c.battle, c.holder.side, 'seer_eff_71');
    },
  },
  // 自身雄性，下两回合必定先手；自身雌性，下两回合必定致命一击   (gender: never matches)
  seer_eff_83: NOOP,
  // {0}回合内自身造成的伤害为{1}倍
  seer_eff_90: { apply(c, p) { plain(c.battle, c.user, 'seer_eff_90', '伤害加倍', [{ on: 'modify_damage_dealt', multiplier: p[1] }], p[0]); } },
  // {0}回合内给对手造成伤害时，有{1}%概率令对手冻伤
  seer_eff_109: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_109', '寒冷叠加', ['on_hit'], p, p[0]); },
    hook(c, p) { if (c.ctx.damageDealt > 0 && c.battle.rng.chance(p[1])) c.battle.applyStatus(c.foe, 'freeze', { source: c.holder }); },
  },
  // 对方为{0}则免疫当前回合伤害   (gender: never matches)
  seer_eff_131: NOOP,
  // 使对手的能力提升效果反转成能力下降效果
  seer_eff_143: {
    apply(c) { for (const [k, v] of Object.entries(c.foe.stages) as [StageKey, number][]) if (v > 0) c.battle.changeStage(c.foe, k, -2 * v, true); },
  },
  // {0}回合内每回合对对方造成伤害的1/{1}恢复自身体力
  seer_eff_153: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_153', '吸血', ['on_hit'], p, p[0]); },
    hook(c, p) { if (c.ctx.damageDealt > 0) c.battle.heal(c.holder, c.ctx.damageDealt / p[1]); },
  },
  // {0}回合内每回合额外附加{1}%概率令对手{2}
  seer_eff_169: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_169', '附加异常', ['on_hit'], p, p[0]); },
    hook(c, p) { if (c.skill.category !== 'status' && c.battle.rng.chance(p[1])) c.battle.applyStatus(c.foe, status(p[2]), { source: c.holder }); },
  },
  // {0}回合内免疫并反弹{1}伤害   ({1}: 1 物理, 2 特殊)
  seer_eff_183: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_183', p[1] === 1 ? '物理反射' : '特殊反射', ['modify_damage_final'], p, p[0]); },
    hook(c, p) {
      if (!fromFoeAttack(c) || c.skill?.category !== (p[1] === 1 ? 'physical' : 'special')) return;
      if (c.amount > 0) c.battle.dealDamage(c.source, c.amount, { kind: 'fixed', source: c.holder, noReflect: true });
      return 0;
    },
  },
  // 对方体力高于自己时才能命中，将对方体力减到和自己相同
  seer_eff_7: {
    accuracy(c) { return c.foe.hp > c.user.hp ? undefined : false; },
    apply(c) { fixed(c, c.foe.hp - c.user.hp); },
  },
  // 伤害大于对方体力时，对方会余下1体力
  seer_eff_8: { finalDamage(c, _p, d) { return c.info.kind === 'attack' ? Math.min(d, Math.max(0, c.foe.hp - 1)) : undefined; } },
  // 若没有命中对手则自己失去全部体力
  seer_eff_72: { onMiss(c) { selfLoss(c.battle, c.user, c.user.hp); } },
  // 目标为雄性，伤害为200%；目标为雌性，伤害为50%   (gender: never matches)
  seer_eff_82: NOOP,
  // 附加额外伤害，自身等级越高，附加的伤害越高   (bonus = level, see ENGINE GAPS)
  seer_eff_111: { apply(c) { fixed(c, c.user.level); } },
  // 牺牲全部体力给对手造成250~300点伤害，造成致命伤害时，对手剩下1点体力
  seer_eff_112: {
    apply(c) { fixed(c, Math.min(c.battle.rng.int(250, 300), c.foe.hp - 1)); selfLoss(c.battle, c.user, c.user.hp); },
    onMiss(c) { selfLoss(c.battle, c.user, c.user.hp); },
  },
  // 个体越高，威力越大   (see ENGINE GAPS)
  seer_eff_113: { power(c) { return 50 + 2 * (c.user.persist.iv ??= estimateIv(c.user)); } },
  // 威力随机，随机范围150~220
  seer_eff_118: { power(c) { return c.estimate ? 185 : c.battle.rng.int(150, 220); } },
  // {0}%概率附加速度的1/{1}伤害
  seer_eff_115: { apply(c, p) { if (c.battle.rng.chance(p[0])) fixed(c, c.battle.effStat(c.user, 'spe') / p[1]); } },
  // 若伤害为奇数，30%对手疲惫1回合；若为偶数，30%速度+1
  seer_eff_119: {
    apply(c) {
      const b = c.battle;
      if (c.ctx.damageDealt % 2 === 1) { if (b.rng.chance(30)) b.applyStatus(c.foe, 'fatigue', { turns: 1, source: c.user }); }
      else if (b.rng.chance(30)) b.changeStage(c.user, 'spe', 1, false);
    },
  },
  // 属性相同时，{0}%概率让对方麻痹
  seer_eff_121: { apply(c, p) { if (sameType(c.user, c.foe) && c.battle.rng.chance(p[0])) c.battle.applyStatus(c.foe, 'paralysis', { source: c.user }); } },
  // 命中后，{0}%概率随机对方一个属性{1}个等级
  seer_eff_124: { apply(c, p) { if (c.battle.rng.chance(p[0])) c.battle.changeStage(c.foe, c.battle.rng.pick(STAT_BY_INDEX), p[1], true); } },
  // 若当前HP低于对手，则技能威力翻倍
  seer_eff_132: { power(c, _p, pw) { return c.user.hp < c.foe.hp ? pw * 2 : pw; } },
  // 若造成的伤害低于{0}，则所有技能的PP值恢复{1}点
  seer_eff_134: {
    apply(c, p) {
      if (c.ctx.damageDealt >= p[0]) return;
      for (const id of c.user.skills) c.user.pp[id] = Math.min(c.user.maxPp[id], c.user.pp[id] + p[1]);
      c.battle.emit({ type: 'pp_restored', side: c.user.side, amount: p[1] });
    },
  },
  // 造成的伤害不会低于{0}
  seer_eff_135: { finalDamage(c, p, d) { return c.info.kind === 'attack' ? Math.max(d, p[0]) : undefined; } },
  // 若Miss则自己恢复1/{0}体力
  seer_eff_136: { onMiss(c, p) { c.battle.heal(c.user, c.user.maxHp / p[0]); } },
  // 50%威力301-350、30%威力101-300,20%威力5-100
  seer_eff_139: {
    power(c) {
      if (c.estimate) return 233; // 0.5*325.5 + 0.3*200.5 + 0.2*52.5
      const r = c.battle.rng, roll = r.int(1, 100);
      return roll <= 50 ? r.int(301, 350) : roll <= 80 ? r.int(101, 300) : r.int(5, 100);
    },
  },
  // 攻击中毒的对手时，自身回复1/{0}最大体力值
  seer_eff_145: { apply(c, p) { if (hasStatus(c.foe, 'poison')) c.battle.heal(c.user, c.user.maxHp / p[0]); } },
  // 对手烧伤时，{0}%对方疲惫1回合；对手未烧伤时，{1}%对方疲惫1回合
  seer_eff_151: {
    apply(c, p) { if (c.battle.rng.chance(hasStatus(c.foe, 'burn') ? p[0] : p[1])) c.battle.applyStatus(c.foe, 'fatigue', { turns: 1, source: c.user }); },
  },
  // 自身体力小于最大值的1/{0}时，{1}%概率令对方{2}
  seer_eff_159: {
    apply(c, p) { if (c.user.hp < c.user.maxHp / p[0] && c.battle.rng.chance(p[1])) c.battle.applyStatus(c.foe, status(p[2]), { source: c.user }); },
  },
  // 若对手处于异常状态，则附加{0}点伤害
  seer_eff_162: { apply(c, p) { if (hasAnyStatus(c.foe)) fixed(c, p[0]); } },
  // 若后出手，则给予对方损伤的1/{0}会回复自己的体力
  seer_eff_172: { apply(c, p) { if (!c.ctx.actedFirst) c.battle.heal(c.user, c.ctx.damageDealt / p[0]); } },
  // 造成伤害的1/{0}回复自身体力，若属性相同则造成伤害的1/{1}回复自身体力
  seer_eff_178: { apply(c, p) { c.battle.heal(c.user, c.ctx.damageDealt / (sameType(c.user, c.foe) ? p[1] : p[0])); } },
  // 若属性相同则技能威力提升{0}
  seer_eff_179: { power(c, p, pw) { return sameType(c.user, c.foe) ? pw + p[0] : pw; } },
  // {0}%概率令对手{1}，连续攻击每次提高{2}%概率，最多提高{3}%
  seer_eff_181: {
    apply(c, p) {
      const pct = p[0] + Math.min(p[3], p[2] * (c.user.streak.count - 1));
      if (c.battle.rng.chance(pct)) c.battle.applyStatus(c.foe, status(p[1]), { source: c.user });
    },
  },
  // 若击败{0}的对手，则下一个出场的对手也进入{0}状态
  seer_eff_185: {
    // a fainted monster loses its statuses, so remember them when the hit lands
    modifyDamage(c, p, d) { c.ctx.seer185 ||= hasStatus(c.foe, status(p[0])); return d; },
    apply(c, p) { if (koByMove(c) && (c.ctx.seer185 || hasStatus(c.foe, status(p[0])))) armBench(c.battle, c.foe.side, 'seer_eff_185', 'seer_eff_185', '永恒圣焰', p); },
    hook(c, p) { disarm(c.battle, c.holder.side, 'seer_eff_185'); c.battle.applyStatus(c.holder, status(p[0]), {}); },
  },
  // 若对手处于异常状态，则威力翻倍并消除对手相应的防御能力提升效果
  seer_eff_188: {
    power(c, _p, pw) {
      const on = hasAnyStatus(c.foe);
      if (!c.estimate) c.ctx.seer188 = on;
      return on ? pw * 2 : pw;
    },
    defense(c, _p, D) { return hasAnyStatus(c.foe) ? ignoreBoost(c.foe, c.skill.category === 'physical' ? 'def' : 'spd', D) : D; },
    apply(c) {
      const k: StageKey = c.ctx.skill.category === 'physical' ? 'def' : 'spd', v = c.foe.stages[k];
      if (!c.ctx.seer188 || v <= 0) return;
      c.foe.stages[k] = 0;
      c.battle.emit({ type: 'stat_stage', side: c.foe.side, stat: k, delta: -v, stage: 0, capped: false });
    },
  },
  // 附加{0}%当前体力值的伤害   (the foe's current HP)
  seer_eff_192: { apply(c, p) { pctDmg(c, (c.foe.hp * p[0]) / 100); } },
  // 若对手{0}，则必定造成双倍伤害
  seer_eff_193: { modifyDamage(c, p, d) { return hasStatus(c.foe, status(p[0])) ? d * 2 : d; } },
  // 造成伤害的1/{0}回复自身体力，若对手{1}，则造成伤害的1/{2}回复自身体力
  seer_eff_194: { apply(c, p) { c.battle.heal(c.user, c.ctx.damageDealt / (hasStatus(c.foe, status(p[1])) ? p[2] : p[0])); } },
  // {1}%令对方{0}等级{2}；若先出手，则{4}%使对方{3}等级{5}
  seer_eff_196: {
    apply(c, p) {
      const [s, pct, d] = c.ctx.actedFirst ? [p[3], p[4], p[5]] : [p[0], p[1], p[2]];
      if (c.battle.rng.chance(pct)) c.battle.changeStage(c.foe, stat(s), d, true);
    },
  },
  // 若和对手属性相同，则技能威力翻倍
  seer_eff_401: { power(c, _p, pw) { return sameType(c.user, c.foe) ? pw * 2 : pw; } },
  // {0}%回复自身1/{1}体力值
  seer_eff_410: { apply(c, p) { if (c.battle.rng.chance(p[0])) c.battle.heal(c.user, c.user.maxHp / p[1]); } },
  // 附加对手当前体力值{0}%的百分比伤害，连续使用每次增加{1}%，最高{2}%
  seer_eff_411: { apply(c, p) { pctDmg(c, (c.foe.hp * Math.min(p[2], p[0] + p[1] * (c.user.streak.count - 1))) / 100); } },
  // 若自身体力小于1/{0}，则每次攻击不消耗PP值
  seer_eff_412: { ppCost(c, p) { return c.user.hp < c.user.maxHp / p[0] ? 0 : undefined; } },
  // 若造成的伤害大于{0}点，则自身恢复{1}点生命值
  seer_eff_415: { apply(c, p) { if (c.ctx.damageDealt > p[0]) c.battle.heal(c.user, p[1]); } },
  // 当次攻击击败对方出战精灵时，则对手的能力提升效果转化到自己身上
  seer_eff_421: {
    // a fainted monster loses its stages, so remember them when the hit lands
    modifyDamage(c, _p, d) { c.ctx.seer421 ??= { ...c.foe.stages }; return d; },
    apply(c) {
      if (!koByMove(c)) return;
      for (const [k, v] of Object.entries(c.ctx.seer421 ?? c.foe.stages) as [StageKey, number][]) {
        if (v <= 0) continue;
        c.foe.stages[k] = 0;
        c.battle.changeStage(c.user, k, v, false);
      }
    },
  },
  // 每损失{0}点体力则额外附加{1}点固定伤害
  seer_eff_455: { apply(c, p) { fixed(c, Math.floor((c.user.maxHp - c.user.hp) / p[0]) * p[1]); } },
  // 命中后{0}%随机令对手进入烧伤，冻伤，中毒中的{1}种
  seer_eff_451: {
    apply(c, p) {
      if (!c.battle.rng.chance(p[0])) return;
      for (const s of pickN(c.battle, ['burn', 'freeze', 'poison'], p[1])) c.battle.applyStatus(c.foe, s, { source: c.user });
    },
  },
  // 对选中对象或本方全体恢复1/{1}的体力   ({0}: 0 = the selected monster (self), else the whole team)
  seer_eff_201: {
    apply(c, p) {
      const team: Mon[] = p[0] === 0 ? [c.user] : c.battle.sides[c.user.side].team;
      for (const m of team) if (!m.fainted) c.battle.heal(m, m.maxHp / p[1]);
    },
  },
  // {0}回合后若对方没有将自己击败，则对方死亡
  seer_eff_62: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_62', '镇魂歌', ['turn_end'], p, p[0]); },
    hook(c) { if (expiring(c) && !c.foe.fainted) c.battle.dealDamage(c.foe, c.foe.hp, { kind: 'true', source: c.holder, ohko: true }); },
  },
  // 下{0}回合对手使用体力药剂时效果变成减少相应的体力
  seer_eff_69: {
    apply(c, p) { sc(c.battle, c.foe, 'seer_eff_69', '药剂反噬', ['on_heal_incoming'], p, p[0], { kind: 'debuff' }); },
    hook(c) { if (c.item) return -c.amount; },
  },
  // 损失1/2的体力，给予对手同等的伤害   (1/2 of max HP, capped by current HP)
  // p[0] truthy: the 敌我同伤刻印 removes the user's own loss.
  seer_eff_80: {
    apply(c, p) {
      const n = Math.min(c.user.hp, Math.floor(c.user.maxHp / 2));
      fixed(c, n);
      if (!c.battle.result && !p?.[0]) selfLoss(c.battle, c.user, n);
    },
  },
  // 若先手攻击，则将所受伤害2倍反击给对手   (for the rest of this turn)
  seer_eff_73: {
    apply(c, p) { if (c.ctx.actedFirst) sc(c.battle, c.user, 'seer_eff_73', '思维干涉', ['on_hurt'], p, 1, { cover: true }); },
    hook(c) { if (fromFoeAttack(c) && !c.source.fainted) c.battle.dealDamage(c.source, c.amount * 2, { kind: 'fixed', source: c.holder, noReflect: true }); },
  },
  // {0}回合内属性攻击对自身必定miss
  seer_eff_86: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_86', '圣洁', ['before_hit'], p, p[0]); },
    hook(c) { if (c.skill.category === 'status') return 'evade'; },
  },
  // {0}回合内对雄性精灵的伤害为{1}倍   (gender: never matches)
  seer_eff_98: NOOP,
  // {0}回合内每次直接攻击都有{1}%概率附带衰弱效果
  seer_eff_104: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_104', '浩劫之力', ['on_hit'], p, p[0]); },
    hook(c, p) { if (c.skill.category !== 'status' && c.battle.rng.chance(p[1])) c.battle.applyStatus(c.foe, 'weaken', { source: c.holder }); },
  },
  // {0}回合内每次躲避攻击都有{1}%概率使自身{2}提升1个等级
  seer_eff_110: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_110', '天然防御', ['on_foe_miss'], p, p[0]); },
    hook(c, p) { if (c.battle.rng.chance(p[1])) c.battle.changeStage(c.holder, stat(p[2]), 1, false); },
  },
  // 3回合内如果先出手，伤害的20%恢复体力
  seer_eff_116: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_116', '疾风之翼', ['on_hit'], p, 3); },
    hook(c) { if (c.ctx.actedFirst && c.ctx.damageDealt > 0) c.battle.heal(c.holder, c.ctx.damageDealt * 0.2); },
  },
  // 5回合内如果先出手，50%概率对手害怕1到3回合
  seer_eff_117: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_117', '致盲飓风', ['on_hit'], p, 5); },
    hook(c) { if (c.ctx.actedFirst && c.battle.rng.chance(50)) c.battle.applyStatus(c.foe, 'fear', { turns: [1, 3], source: c.holder }); },
  },
  // 50%概率对方减血1/{0}，50%概率自己减血1/{0}
  seer_eff_120: {
    apply(c, p) {
      if (c.battle.rng.chance(50)) pctDmg(c, c.foe.maxHp / p[0]);
      else c.battle.dealDamage(c.user, Math.floor(c.user.maxHp / p[0]), { kind: 'percent' });
    },
  },
  // {0}回合内每回合自身攻击和速度提高{1}个等级
  seer_eff_126: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_126', '斗志高昂', ['turn_start'], p, p[0]); },
    hook(c, p) { stages(c.battle, c.holder, ['atk', 'spe'], p[1], false); },
  },
  // {0}回合内将受到的攻击伤害转化为自身体力
  seer_eff_128: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_128', '异界之光', ['modify_damage_final'], p, p[0]); },
    hook(c) {
      if (c.info.kind !== 'attack' || c.amount <= 0) return;
      c.battle.heal(c.holder, c.amount);
      return 0;
    },
  },
  // 损失一半当前体力值，自身攻击和速度提升2个等级
  seer_eff_137: { apply(c) { selfLoss(c.battle, c.user, c.user.hp / 2); stages(c.battle, c.user, ['atk', 'spe'], 2, false); } },
  // 先出手时，{0}回合自己不会受到对手攻击性技能伤害并反弹对手造成伤害的1/{1}   (this turn counts)
  seer_eff_138: {
    apply(c, p) { if (c.ctx.actedFirst) sc(c.battle, c.user, 'seer_eff_138', '光之盾', ['modify_damage_final'], p, p[0], { cover: true }); },
    hook(c, p) {
      if (!fromFoeAttack(c)) return;
      if (c.amount >= p[1]) c.battle.dealDamage(c.source, Math.floor(c.amount / p[1]), { kind: 'fixed', source: c.holder, noReflect: true });
      return 0;
    },
  },
  // 随机降低对手1/{0}至1/{1}的当前体力值
  seer_eff_140: { apply(c, p) { pctDmg(c, c.foe.hp / c.battle.rng.int(Math.min(p[0], p[1]), Math.max(p[0], p[1]))); } },
  // 损失1/{0}的体力值，下回合能较快出手   (1/{0} of max HP; priority +1 next turn)
  seer_eff_142: {
    apply(c, p) {
      sc(c.battle, c.user, 'seer_eff_142', '血之狂躁', ['modify_priority'], p, 1);
      selfLoss(c.battle, c.user, c.user.maxHp / p[0]);
    },
    hook(c) { return c.priority + 1; },
  },
  // 消耗自己所有体力，使下一个出战的精灵{0}回合免疫异常状态
  seer_eff_144: {
    apply(c, p) { armBench(c.battle, c.user.side, 'seer_eff_144', 'seer_eff_144', '绿色庇佑', p); selfLoss(c.battle, c.user, c.user.hp); },
    hook(c, p) {
      disarm(c.battle, c.holder.side, 'seer_eff_144');
      plain(c.battle, c.holder, 'seer_eff_144_immune', '免疫异常状态', [{ on: 'block_status' }], p[0]);
    },
  },
  // {0}回合内受到物理攻击时有{1}%概率使对方中毒
  seer_eff_146: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_146', '毒性体质', ['on_hurt'], p, p[0]); },
    hook(c, p) {
      if (fromFoeAttack(c) && c.skill?.category === 'physical' && once(c) && c.battle.rng.chance(p[1])) c.battle.applyStatus(c.source, 'poison', { source: c.holder });
    },
  },
  // {0}回合内对手每回合防御和特防等级{1}
  seer_eff_150: {
    apply(c, p) { sc(c.battle, c.foe, 'seer_eff_150', '魔界之种', ['turn_end'], p, p[0], { kind: 'debuff' }); },
    hook(c, p) { if (counts(c)) stages(c.battle, c.holder, ['def', 'spd'], p[1], true); },
  },
  // 恢复全部体力，消除所有能力下降，使自己进入睡眠{0}回合
  seer_eff_155: {
    apply(c, p) {
      c.battle.heal(c.user, c.user.maxHp);
      c.battle.clearStages(c.user, 'down');
      c.battle.applyStatus(c.user, 'sleep', { turns: p[0], fromFoe: false });
    },
  },
  // {0}回合内使得对手所有能力增强效果失效
  seer_eff_156: {
    apply(c, p) { sc(c.battle, c.foe, 'seer_eff_156', '禁制领域', ['modify_stat'], p, p[0], { kind: 'debuff' }); },
    hook(c) { const s = c.holder.stages[c.stat]; if (s > 0) return c.value / stageMultiplier(s); },
  },
  // {0}回合内若受到攻击，对手防御等级-1、特防等级-1、命中等级-1
  seer_eff_157: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_157', '龙族印记', ['on_hurt'], p, p[0]); },
    hook(c) { if (fromFoeAttack(c) && once(c)) stages(c.battle, c.source, ['def', 'spd', 'acc'], -1, true); },
  },
  // {0}回合内若对手MISS则下回合自身必定致命一击
  seer_eff_160: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_160', '急速闪现', ['on_foe_miss'], p, p[0]); },
    hook(c) {
      const b = c.battle;
      if (c.point === 'modify_crit_rate') return b.turn > c.cond.data.from ? { force: true } : undefined;
      const turns = c.holder.lastActedTurn === b.turn ? 1 : 2; // must last through next turn
      sc(b, c.holder, 'seer_eff_160_crit', '必定致命一击', ['modify_crit_rate'], [], turns, { script: 'seer_eff_160', data: { from: b.turn } });
    },
  },
  // {0}%降低自身当前体力值的1/{1}
  seer_eff_161: { apply(c, p) { if (c.battle.rng.chance(p[0])) selfLoss(c.battle, c.user, c.user.hp / p[1]); } },
  // {0}回合内若对手使用属性技能则对手随机进入烧伤、冻伤、中毒、麻痹、害怕、睡眠中的一种异常状态
  seer_eff_163: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_163', '奇幻孢子', ['on_foe_move'], p, p[0]); },
    hook(c) { if (c.skill.category === 'status') c.battle.applyStatus(c.foe, c.battle.rng.pick(RANDOM6), { source: c.holder }); },
  },
  // {0}回合内每回合防御和特防等级+{1}
  seer_eff_165: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_165', '藤蔓生长', ['turn_start'], p, p[0]); },
    hook(c, p) { stages(c.battle, c.holder, ['def', 'spd'], p[1], false); },
  },
  // {0}回合内若对手使用属性攻击则{2}%对手{1}等级{3}
  seer_eff_166: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_166', '眩光屏障', ['on_foe_move'], p, p[0]); },
    hook(c, p) { if (c.skill.category === 'status' && c.battle.rng.chance(p[2])) c.battle.changeStage(c.foe, stat(p[1]), p[3], true); },
  },
  // 若先出手，则免疫当回合伤害并回复1/{0}的最大体力值
  seer_eff_170: {
    apply(c, p) {
      if (!c.ctx.actedFirst) return;
      c.battle.heal(c.user, c.user.maxHp / p[0]);
      sc(c.battle, c.user, 'seer_eff_170', '圣光门', ['modify_damage_final'], p, 1, { cover: true });
    },
    hook(c) { if (c.source && c.source !== c.holder) return 0; },
  },
  // {0}回合内自身使用属性技能时能较快出手
  seer_eff_171: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_171', '圣光觉醒', ['modify_priority'], p, p[0]); },
    hook(c) { if (c.skill.category === 'status') return c.priority + 1; },
  },
  // {0}%概率令对手随机进入烧伤、冻伤、中毒、麻痹、害怕、睡眠中的一种异常状态
  seer_eff_176: { apply(c, p) { if (c.battle.rng.chance(p[0])) c.battle.applyStatus(c.foe, c.battle.rng.pick(RANDOM6), { source: c.user }); } },
  // {0}回合内若对手MISS则自身恢复1/{1}的最大体力值
  seer_eff_177: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_177', '光佑守护', ['on_foe_miss'], p, p[0]); },
    hook(c, p) { c.battle.heal(c.holder, c.holder.maxHp / p[1]); },
  },
  // {0}回合内若对手使用属性技能，则自身恢复1/{1}最大体力值
  seer_eff_187: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_187', '地魂护体', ['on_foe_move'], p, p[0]); },
    hook(c, p) { if (c.skill.category === 'status') c.battle.heal(c.holder, c.holder.maxHp / p[1]); },
  },
  // {0}回合内若受到攻击，对手攻击等级-1、特攻等级-1
  seer_eff_189: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_189', '倔强', ['on_hurt'], p, p[0]); },
    hook(c) { if (fromFoeAttack(c) && once(c)) stages(c.battle, c.source, ['atk', 'spa'], -1, true); },
  },
  // {0}回合内若受到攻击，消除对手能力提升状态
  seer_eff_190: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_190', '强磁光环', ['on_hurt'], p, p[0]); },
    hook(c) { if (fromFoeAttack(c)) c.battle.clearStages(c.source, 'up'); },
  },
  // {0}回合内免疫并反弹所有受到的异常状态
  seer_eff_191: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_191', '机械战甲', ['on_status_incoming'], p, p[0]); },
    hook(c) {
      if (!c.fromFoe) return;
      const src: Mon = c.source ?? c.foe;
      if (!reflecting && src && src !== c.holder && !src.fainted) {
        reflecting = true; // two mirrors must not bounce forever
        try { c.battle.applyStatus(src, c.status, { turns: c.turns, source: c.holder }); } finally { reflecting = false; }
      }
      return false;
    },
  },
  // {0}回合内若被对方击败，则对手所有能力加强状态消失
  seer_eff_197: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_197', '虚影倒置', ['on_faint'], p, p[0]); },
    hook(c) {
      const ko = c.battle.lastKo;
      if (ko?.target === c.holder && ko.by && ko.by.side !== c.holder.side) c.battle.clearStages(ko.by, 'up');
    },
  },
  // 随机使对手{0}种能力等级-{1}
  seer_eff_198: { apply(c, p) { for (const s of pickN(c.battle, STAT_BY_INDEX, p[0])) c.battle.changeStage(c.foe, s, -p[1], true); } },
  // 下次被击败后，下一个出场的精灵{0}等级+{1}
  seer_eff_199: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_199', '月之恩赐', ['on_faint'], p); },
    hook(c, p) {
      if (c.point === 'on_faint') return armBench(c.battle, c.holder.side, 'seer_eff_199_next', 'seer_eff_199', '月之恩赐', p);
      disarm(c.battle, c.holder.side, 'seer_eff_199_next');
      c.battle.changeStage(c.holder, stat(p[0]), p[1], false);
    },
  },
  // 若对手处于能力提升状态，{0}%概率令对手{1}
  seer_eff_200: { apply(c, p) { if (hasStageUp(c.foe) && c.battle.rng.chance(p[0])) c.battle.applyStatus(c.foe, status(p[1]), { source: c.user }); } },
  // 技能使用成功时，{0}%令自身特攻和速度等级+{1}。若和对手属性相同，则技能效果翻倍
  seer_eff_403: {
    apply(c, p) { if (c.battle.rng.chance(p[0])) stages(c.battle, c.user, ['spa', 'spe'], p[1] * (sameType(c.user, c.foe) ? 2 : 1), false); },
  },
  // 恢复双方所有体力
  seer_eff_404: { apply(c) { c.battle.heal(c.user, c.user.maxHp); c.battle.heal(c.foe, c.foe.maxHp); } },
  // {0}回合内受到攻击{1}%概率回复{2}点体力
  seer_eff_406: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_406', '金刚罩', ['on_hurt'], p, p[0]); },
    hook(c, p) { if (fromFoeAttack(c) && once(c) && c.battle.rng.chance(p[1])) c.battle.heal(c.holder, p[2]); },
  },
  // 下回合起，每回合{0}等级+{1}，持续{2}回合
  seer_eff_407: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_407', '战争旋律', ['turn_start'], p, p[2]); },
    hook(c, p) { c.battle.changeStage(c.holder, stat(p[0]), p[1], false); },
  },
  // {0}回合内每回合所受的伤害减少{1}
  seer_eff_408: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_408', '大气护盾', ['modify_damage_final'], p, p[0]); },
    hook(c, p) { if (fromFoeAttack(c)) return Math.max(0, c.amount - p[1]); },
  },
  // {0}回合内对手每回合速度和命中等级{1}
  seer_eff_409: {
    apply(c, p) { sc(c.battle, c.foe, 'seer_eff_409', '黑暗漩涡', ['turn_end'], p, p[0], { kind: 'debuff' }); },
    hook(c, p) { if (counts(c)) stages(c.battle, c.holder, ['spe', 'acc'], p[1], true); },
  },
  // {0}回合内受到任何伤害，对手{1}降低{2}个等级
  seer_eff_416: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_416', '潜龙迷踪', ['on_hurt'], p, p[0]); },
    hook(c, p) { if (c.source !== c.holder && (c.source || c.info?.status)) c.battle.changeStage(c.foe, stat(p[1]), p[2], true); },
  },
  // {0}%的概率，{1}回合内受到的伤害减半
  seer_eff_127: {
    apply(c, p) { if (c.battle.rng.chance(p[0])) plain(c.battle, c.user, 'seer_eff_127', '伤害减半', [{ on: 'modify_damage_taken', multiplier: 0.5 }], p[1]); },
  },
  // {0}回合内自身攻击技能造成伤害的{1}%会恢复自身体力
  seer_eff_417: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_417', '落叶飞天', ['on_hit'], p, p[0]); },
    hook(c, p) { if (c.skill.category !== 'status' && c.ctx.damageDealt > 0) c.battle.heal(c.holder, (c.ctx.damageDealt * p[1]) / 100); },
  },
  // {0}回合内若对手处于能力提升状态，则每回合都会受到{1}点固定伤害
  seer_eff_419: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_419', '黑水吸附', ['turn_end'], p, p[0]); },
    hook(c, p) { if (counts(c) && !c.foe.fainted && hasStageUp(c.foe)) c.battle.dealDamage(c.foe, p[1], { kind: 'fixed', source: c.holder }); },
  },
  // 使用了该技能后，若受到消除强化类技能攻击，则对方攻击和特攻等级{0}
  seer_eff_420: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_420', '岩石之躯', ['on_foe_move'], p); },
    hook(c, p) {
      const clears = (c.skill.effects ?? []).some((op: any) =>
        (op.op === 'clear_stages' && (op.target ?? 'foe') === 'foe' && op.which !== 'down') || (op.op === 'script' && CLEAR_SCRIPTS.has(op.id)));
      if (clears && c.targetsHolder) stages(c.battle, c.foe, ['atk', 'spa'], p[0], true);
    },
  },
  // 直接造成等同于对手防御值的固定伤害
  seer_eff_423: { apply(c) { fixed(c, c.foe.stats.def); } },
  // {0}回合内令对手使用的属性技能无效
  seer_eff_478: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_478', '退魔封灵', ['on_foe_move'], p, p[0]); },
    hook(c) { if (c.skill.category === 'status') return 'negate'; },
  },
  // 减少{0}点下回合所受的伤害   (a budget of {0} for the whole next turn)
  seer_eff_508: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_508', '魂之再生', ['modify_damage_final'], p, 1, { data: { from: c.battle.turn, left: p[0] } }); },
    hook(c) {
      const d = c.cond.data;
      if (c.battle.turn <= d.from || !c.source || c.source === c.holder || d.left <= 0) return;
      const r = Math.min(d.left, c.amount);
      d.left -= r;
      return c.amount - r;
    },
  },
  // {0}%的概率恢复自身体力的1/{1}
  seer_eff_438: { apply(c, p) { if (c.battle.rng.chance(p[0])) c.battle.heal(c.user, c.user.maxHp / p[1]); } },
  // {0}回合内若自身处于能力下降或异常状态，则对手每回合受到{1}点固定伤害
  seer_eff_439: {
    apply(c, p) { sc(c.battle, c.user, 'seer_eff_439', '森罗万象', ['turn_end'], p, p[0]); },
    hook(c, p) {
      if (counts(c) && !c.foe.fainted && (hasStageDown(c.holder) || hasAnyStatus(c.holder))) c.battle.dealDamage(c.foe, p[1], { kind: 'fixed', source: c.holder });
    },
  },
};

export const TAIL_SCRIPTS: ScriptRegistry = TAIL;
