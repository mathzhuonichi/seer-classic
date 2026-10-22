import originalTraits from '../../data/traits.json';
import type { Hook, HookPoint, ScriptRegistry } from '../../battle/core/src/index.ts';
import type { HookCtx } from '../../battle/core/src/scripts/context.ts';
import { STAT_BY_INDEX, STATUS_BY_INDEX, fromFoeAttack } from '../../battle/core/src/scripts/util.ts';

export interface TraitDefinition {
  id: string;
  name: string;
  description: string;
  hooks: Hook[];
  raw: { Eid: number; Args: string };
  implemented: boolean;
  limitation?: string;
  calibration?: string;
}

/** How one original effect id (Eid) behaves; `p` is the trait's zero-star Args. No later-star rates are substituted. */
interface TraitEffect {
  /** A script hook replacing the recovered declarative hooks. */
  script?: { on: HookPoint; hook: (c: HookCtx, p: number[]) => unknown };
  /** Declarative hooks replacing the recovered ones. */
  hooks?: (p: number[]) => Hook[];
  /** Appended to the Chinese description. */
  note?: string;
  calibration?: string;
  limitation?: string;
}

const TYPE_ALIASES: Record<string, string> = { steel: 'mechanical', dark: 'shadow', mystery: 'mystic' };
/** Eid 61: Args "1 0" is the client tier code; the original zero-star description specifies 3%. */
const EID61_CHANCE = 3;
/** Eid 64 zero star: 1/16 (6.25%), 赛学必修6; Args "1 0" is the client tier code. */
const EID64_CHANCE = 100 / 16;
/** Eid 30 remake calibration: one step on the engine's 16-point critical-rate scale. */
const CRIT_STEP = 1;

const chance = (c: HookCtx, percent: number) => c.battle.rng.chance(percent);
const outgoingAttack = (c: HookCtx) => c.info?.kind === 'attack' && c.foe && c.foe.side !== c.holder.side;
/** Damage from the foe's skill use (its hits and the move's own fixed or percent damage), not true damage such as ohko. */
const fromFoeMove = (c: HookCtx) => !!c.source && c.source.side !== c.holder.side && !!c.info?.skill && c.info.kind !== 'true';

/** Eid 62/63: chance of extra damage on the holder's attacks of `category`. */
const bonusDamage = (category: string): TraitEffect => ({ script: { on: 'modify_damage_outgoing', hook: (c, p) => {
  if (outgoingAttack(c) && c.skill?.category === category && chance(c, p[0])) return c.amount + p[1];
} } });
/** Eid 66/67: chance to inflict status index p[1] with damaging attacks of `category`. */
const statusOnHit = (category: string): TraitEffect => ({ script: { on: 'on_hit', hook: (c, p) => {
  if (c.skill?.category !== category || !(c.ctx?.damageDealt > 0) || c.foe.fainted || !chance(c, p[0])) return;
  c.battle.applyStatus(c.foe, STATUS_BY_INDEX[p[1]], { source: c.holder });
} } });

const EFFECTS: Record<number, TraitEffect> = {
  // "Any damage": final hook also covers fixed, percentage and residual damage.
  3: { script: { on: 'modify_damage_final', hook: (c, p) => Math.floor(c.amount * (1 - p[0] / 100)) } },
  6: { script: { on: 'on_hurt', hook: (c, p) => {
    if (fromFoeAttack(c) && c.skill?.category === 'physical' && chance(c, p[1])) c.battle.applyStatus(c.source, STATUS_BY_INDEX[p[0]], { source: c.holder });
  } } },
  7: { hooks: (p) => [{ on: 'modify_accuracy_taken', add_percent: p[0] }] },
  // Single-type damage traits keep their recovered hooks; aliasTypes matches the exact type, so dual-type skills get no bonus.
  28: { note: '（双属性技能不加成）' },
  // Explicit remake calibration: the client tier code does not establish a probability.
  30: {
    hooks: () => [{ on: 'modify_crit_rate', add: CRIT_STEP }],
    note: '（重制规则：致命一击率增加 1/16）',
    calibration: 'Remake calibration: add one step on the engine 16-point critical-rate scale; the historical trait tier mapping is unverified.',
  },
  31: { script: { on: 'modify_damage_final', hook: (c, p) => {
    if (c.info?.kind === 'attack' && c.amount >= c.holder.hp && chance(c, p[0])) return Math.max(0, c.holder.hp - p[1]);
  } } },
  32: { script: { on: 'modify_damage_outgoing', hook: (c, p) => {
    if (!outgoingAttack(c) || !chance(c, p[0])) return;
    // Respect the encounter's immunity; do not turn a blocked instant KO into a blocked ordinary hit.
    if (c.battle.sides[c.foe.side].rules.some((r) => r.rule === 'immune_ohko')) return;
    c.info.ohko = true;
    return c.foe.hp;
  } } },
  // 回神: on_hurt runs before the faint check, so a heal at 0 HP prevents the knockout.
  33: {
    script: { on: 'on_hurt', hook: (c, p) => {
      if (fromFoeMove(c) && c.holder.hp <= c.holder.maxHp / p[0] && chance(c, p[1])) c.battle.heal(c.holder, c.holder.maxHp);
    } },
    note: '（对手出招造成的伤害才会触发，体力降为 0 也可触发）',
  },
  34: { script: { on: 'on_hurt', hook: (c, p) => {
    if (fromFoeAttack(c) && c.skill?.category === 'special' && chance(c, p[1])) c.battle.changeStage(c.source, STAT_BY_INDEX[p[0]], -1, true);
  } } },
  // 反击类: any foe move that reaches the holder, status moves included; the raise lands before the move's damage and effects.
  35: { script: { on: 'on_foe_hit', hook: (c, p) => { if (chance(c, p[1])) c.battle.changeStage(c.holder, STAT_BY_INDEX[p[0]], 1, false); } } },
  60: { script: { on: 'modify_damage_final', hook: (c, p) => { if (fromFoeAttack(c) && chance(c, p[0])) return Math.max(0, c.amount - p[1]); } } },
  // 虚无 dodges the foe's attacking skills as a miss; 必中 attacks land, and damage over time is never blocked.
  61: {
    script: { on: 'before_hit', hook: (c) => { if (c.skill?.category !== 'status' && !c.ctx?.sureHit && chance(c, EID61_CHANCE)) return 'evade'; } },
    note: '（闪避对手的攻击技能，必中技能除外）',
  },
  62: bonusDamage('physical'),
  63: bonusDamage('special'),
  // 免爆: a critical hit from the foe's attack deals no damage at the zero-star rate; ordinary crit rates are unchanged.
  64: {
    script: { on: 'modify_damage_final', hook: (c) => {
      if (fromFoeAttack(c) && c.info.crit && c.amount > 0 && chance(c, EID64_CHANCE)) return 0;
    } },
    note: '（实际效果：受到致命一击时有 1/16 几率不受这次攻击的伤害）',
    calibration: 'The zero-star 1/16 (6.25%) comes from the 2024 赛学必修6 table of star rates; the original client tier mapping is unverified.',
  },
  66: statusOnHit('physical'),
  67: statusOnHit('special'),
  503: { limitation: 'The original effect requires a group attack and another target; classic PvE uses one active opponent.' },
};

const scriptId = (id: string) => `classic_trait_${id}`;
/**
 * Recovered hook with the catalog's type ids. Its `skill_type` becomes `skill_type_exact`: a single-type trait (Eid 28,
 * 「对指定单属性有效，双属性无效」) boosts only skills of exactly that type, not dual-type skills containing it.
 */
function aliasTypes(h: Hook): Hook {
  const hook = { ...h } as Hook;
  const { skill_type, ...when } = (hook.when ?? {}) as Record<string, unknown>;
  if (skill_type) hook.when = { ...when, skill_type_exact: TYPE_ALIASES[String(skill_type)] ?? skill_type };
  return hook;
}

export const traitScripts: ScriptRegistry = {};

/** All 48 original definitions with their zero-star client parameters. */
export const traits: TraitDefinition[] = originalTraits.map((original) => {
  const p = original.raw.Args.trim().split(/\s+/).map(Number);
  const effect: TraitEffect = EFFECTS[original.raw.Eid] ?? {};
  let hooks = effect.hooks ? effect.hooks(p) : original.hooks.map((h) => aliasTypes(h as Hook));
  if (effect.script) {
    traitScripts[scriptId(original.id)] = { hook: effect.script.hook };
    hooks = [{ on: effect.script.on, script: scriptId(original.id), params: p }];
  }
  return {
    id: original.id, name: original.name.zh, description: original.description.zh + (effect.note ?? ''),
    raw: { Eid: original.raw.Eid, Args: original.raw.Args }, implemented: !effect.limitation, hooks,
    ...(effect.limitation ? { limitation: effect.limitation } : {}),
    ...(effect.calibration ? { calibration: effect.calibration } : {}),
  };
});
