import source from '../../data/engravings.json';
import type { EffectOp, Skill, StatKey } from '../../battle/core/src/index.ts';

/** One 2013 ability (能力) or skill (技能) engraving; design/notes/engravings-2013.md. */
export interface EngravingDefinition {
  id: string;
  name: { zh: string };
  slot: 'ability' | 'skill';
  /** Ability engravings: flat stat bonus. */
  stats: Partial<Record<StatKey, number>>;
  /** Bound species; empty = any species. */
  species: number[];
  levelMin: number;
  maxOwned: number;
  /** Skill engravings: the engraved move. */
  moveIds?: number[];
  /** Original CountermarkXMLInfo Effect/Arg/EffectDes. */
  effect: { code: number | null; arg: string; desc: string };
  era: string;
  source: string;
  sourceMoveId?: number;
  notes?: string[];
  boundary?: boolean;
}

export type EngravingSlot = EngravingDefinition['slot'];
export const ENGRAVING_SLOTS: readonly EngravingSlot[] = ['ability', 'skill'];
export const engravings = source.engravings as EngravingDefinition[];
const byId = new Map(engravings.map((e) => [e.id, e]));
export const engravingById = (id: string) => byId.get(id);

/** The monster fields that decide whether an engraving applies. */
export interface EngravingHolder { species: number; level: number; skills: number[]; learned: number[] }

/** Why `def` cannot take effect on `mon`, or undefined when it applies. */
export function engravingBlockedReason(def: EngravingDefinition, mon: EngravingHolder): string | undefined {
  if (def.species.length && !def.species.includes(mon.species)) return '仅限专属精灵';
  if (mon.level < def.levelMin) return `需要 Lv.${def.levelMin}`;
  if (def.slot === 'skill' && !def.moveIds!.some((id) => mon.learned.includes(id) || mon.skills.includes(id))) return '尚未学会对应技能';
  return undefined;
}

/** Equipped engravings that currently apply, one per slot (2013 client: abilityMark + skillMark). */
export function activeEngravings(ids: readonly string[] | undefined, mon: EngravingHolder): EngravingDefinition[] {
  const out: EngravingDefinition[] = [];
  for (const slot of ENGRAVING_SLOTS) {
    const def = (ids ?? []).map(engravingById).find((e) => e?.slot === slot);
    if (def && !engravingBlockedReason(def, mon)) out.push(def);
  }
  return out;
}

/** Shop and PetBag classifier groups for skill engravings, by original Effect code. */
export const ENGRAVING_EFFECT_GROUPS = [
  ['power', '威力'], ['fixed', '固定伤害'], ['priority', '先制'], ['accuracy', '命中 / 必中'], ['hits', '连击'],
  ['duration', '回合数'], ['status', '异常 / 附加效果'], ['stages', '能力变化'], ['drawback', '移除副作用'], ['other', 'PP / 暴击 / 回复'],
] as const;
export type EngravingEffectGroup = typeof ENGRAVING_EFFECT_GROUPS[number][0];
const GROUP_BY_CODE: Record<number, EngravingEffectGroup> = {
  101: 'power', 113: 'power', 120: 'power', 102: 'fixed', 123: 'fixed', 103: 'priority', 112: 'priority', 104: 'accuracy', 106: 'accuracy',
  105: 'hits', 114: 'hits', 107: 'duration', 115: 'status', 117: 'status', 118: 'status', 116: 'stages', 127: 'stages',
  108: 'drawback', 109: 'drawback', 110: 'drawback', 121: 'drawback', 122: 'drawback',
};
export function engravingEffectGroup(def: EngravingDefinition): EngravingEffectGroup | undefined {
  return def.slot === 'skill' ? GROUP_BY_CODE[def.effect.code ?? 0] ?? 'other' : undefined;
}
/** The stats an ability engraving raises. */
export const engravingStatKeys = (def: EngravingDefinition) => (Object.keys(def.stats) as StatKey[]).filter((k) => def.stats[k]);

export function engravingStatBonus(active: readonly EngravingDefinition[]): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const def of active) for (const [k, v] of Object.entries(def.stats)) out[k as StatKey] = (out[k as StatKey] ?? 0) + (v as number);
  return out;
}

// Condition scripts whose first parameter is the duration (effect 107).
const TURN_SCRIPTS = new Set(['seer_eff_55', 'seer_eff_56', 'seer_eff_69', 'seer_eff_77', 'seer_eff_78', 'seer_eff_84', 'seer_eff_92', 'seer_eff_123',
  'seer_eff_150', 'seer_eff_153', 'seer_eff_163', 'seer_eff_187', 'seer_eff_189', 'seer_eff_191']);
// Scripts carrying a status chance in percent, by parameter index (effect 117).
const CHANCE_SCRIPTS: Record<string, number> = { seer_eff_121: 0, seer_eff_152: 1, seer_eff_176: 0 };
const isScript = (op: EffectOp, id: string) => op.op === 'script' && op.id === id && Array.isArray(op.params);

/**
 * The skill as modified by a skill engraving (CountermarkXMLInfo Effect codes 101–127).
 * Returns null when the engraving has no supported effect on this skill.
 */
export function engraveSkill(base: Skill, def: EngravingDefinition): Skill | null {
  const skill: Skill = structuredClone(base);
  const ops: EffectOp[] = (skill.effects ??= []);
  const n = Number(def.effect.arg) || 0;
  const selfStages = () => ops.filter((op) => op.op === 'stat_stage' && op.target === 'self');
  switch (def.effect.code) {
    case 101: skill.power_bonus = (skill.power_bonus ?? 0) + n; break;
    case 102: {
      const fixed = ops.find((op) => op.op === 'fixed_damage' && op.chance === undefined && !op.when);
      if (fixed) fixed.amount += n; else ops.push({ op: 'fixed_damage', amount: n });
      break;
    }
    case 103: skill.priority = (skill.priority ?? 0) + n; for (const op of ops) if (op.op === 'priority_if') op.priority += n; break;
    // Original value, not capped at 100: the surplus offsets the user's lowered accuracy stages.
    // Seer has no evasion stat (no catalog skill changes `eva`); rng.chance treats >= 100 as a hit.
    case 104: if (skill.accuracy !== null) skill.accuracy += n; break;
    case 105:
      for (const op of ops) if (op.op === 'multi_hit') { const min = op.min ?? 2, max = op.max ?? min; op.min = min + n; op.max = max + n; }
      break;
    case 106: skill.accuracy = null; break;
    case 107:
      for (const op of ops) {
        if ((op.op === 'add_condition' || op.op === 'status') && typeof op.turns === 'number') op.turns += n;
        else if (op.op === 'script' && TURN_SCRIPTS.has(op.id) && typeof op.params?.[0] === 'number') op.params[0] += n;
      }
      break;
    case 108: {
      skill.effects = ops.filter((op) => op.op !== 'recoil');
      for (const op of skill.effects) if (isScript(op, 'seer_eff_80')) op.params = [1];
      break;
    }
    case 109:
      for (const op of selfStages()) for (const [k, v] of Object.entries(op.stats)) if ((v as number) < 0) delete op.stats[k];
      skill.effects = ops.filter((op) => op.op !== 'stat_stage' || Object.keys(op.stats).length);
      break;
    case 110: skill.effects = ops.filter((op) => !(op.op === 'status' && op.target === 'self' && op.status === 'fatigue')); break;
    case 111: skill.pp += n; break;
    case 112: skill.priority = (skill.priority ?? 0) + n; skill.pp_cost = 2; break;
    case 113: skill.effects = ops.filter((op) => !isScript(op, 'seer_eff_70')); skill.power = n; break;
    case 114: for (const op of ops) if (op.op === 'multi_hit') op.min = op.max; skill.power = n; break;
    case 115: ops.push({ op: 'clear_stages', target: 'foe', which: 'up' }); break;
    case 116: for (const op of ops) if (op.op === 'stat_stage') for (const k of Object.keys(op.stats)) op.stats[k] *= 2; break;
    case 117:
      for (const op of ops) {
        if (typeof op.chance === 'number' && op.chance < 100) op.chance = Math.min(100, op.chance + n);
        else if (op.op === 'script' && op.id in CHANCE_SCRIPTS && typeof op.params?.[CHANCE_SCRIPTS[op.id]] === 'number') {
          const at = CHANCE_SCRIPTS[op.id];
          op.params[at] = Math.min(100, op.params[at] + n);
        }
      }
      break;
    case 118: ops.push({ op: 'status', target: 'foe', status: 'fatigue', turns: 2 }); break;
    case 119: skill.crit_rate = (skill.crit_rate ?? 1) + n; break;
    case 120: for (const op of ops) if (isScript(op, 'seer_eff_9')) op.params[1] = n; break;
    case 121: skill.effects = ops.filter((op) => !isScript(op, 'seer_eff_161')); break;
    case 122: for (const op of ops) if (isScript(op, 'seer_eff_142')) op.params[0] = n; break;
    case 123: for (const op of ops) if (isScript(op, 'seer_eff_419')) op.params[1] += n; break;
    case 124: for (const op of ops) if (isScript(op, 'seer_eff_154')) op.params[1] = n; break;
    case 125: for (const op of ops) if (op.op === 'heal' && op.target === 'self' && op.pct_max_hp) op.pct_max_hp = 100 / n; break;
    case 126: for (const op of ops) if (isScript(op, 'seer_eff_125')) op.params[1] -= n; break;
    case 127: for (const op of selfStages()) if ((op.stats.atk ?? 0) > 0) op.stats.atk += n; break;
    default: return null;
  }
  return JSON.stringify(skill) === JSON.stringify(base) ? null : skill;
}

/** Battle overrides for the equipped skill engraving, keyed by the engraved skill ids. */
export function engravingSkillOverrides(active: readonly EngravingDefinition[], skillOf: (id: number) => Skill | undefined): Record<number, Skill> | undefined {
  const def = active.find((e) => e.slot === 'skill');
  if (!def) return undefined;
  const out: Record<number, Skill> = {};
  for (const id of def.moveIds!) {
    const base = skillOf(id);
    const engraved = base && engraveSkill(base, def);
    if (engraved) out[id] = engraved;
  }
  return Object.keys(out).length ? out : undefined;
}
