// Small display rules shared by the controller's snapshot builders.
import { DEFAULT_CRIT_RATE, STRUGGLE_SKILL, type DataSet, type Skill as BattleSkill } from '../../battle/core/src/index.ts';
import { attackTypes } from '../../battle/core/src/typechart.ts';
import { SKILL_CATEGORY_LABELS, STATUS_LABELS, TYPE_LABELS } from './labels.ts';
import { skillDescription, skillHits } from './skill-text.ts';
import type { SkillView } from './views.ts';

export const portrait = (species: number) => `/portraits/${species}.png`;
export const typeLabel = (type: string) => TYPE_LABELS[type] ?? type;
export const statusLabel = (id: string) => STATUS_LABELS[id];

/** 挣扎, which only the engine defines; the command deck offers it once every skill is out of PP. Its damage has no type; it is labelled 普通. */
export const STRUGGLE_VIEW: SkillView = {
  id: STRUGGLE_SKILL.id, name: STRUGGLE_SKILL.name.zh, type: TYPE_LABELS.normal, category: SKILL_CATEGORY_LABELS[STRUGGLE_SKILL.category],
  power: STRUGGLE_SKILL.power, pp: STRUGGLE_SKILL.pp, maxPp: STRUGGLE_SKILL.pp, accuracy: STRUGGLE_SKILL.accuracy,
  priority: STRUGGLE_SKILL.priority ?? 0, critRate: DEFAULT_CRIT_RATE, description: '技能 PP 全部耗尽时使用，会受到反作用伤害。',
};

/** The skill a battle event names: a catalog skill, or 挣扎, which only the engine defines. */
export const moveSkill = (data: Pick<DataSet, 'skills'>, id: number): BattleSkill | undefined =>
  id === STRUGGLE_SKILL.id ? STRUGGLE_SKILL : data.skills.get(id);

export function skillView(data: DataSet, id: number, pp?: Record<string, number>, engraved?: BattleSkill): SkillView {
  const skill = engraved ?? data.skills.get(id);
  if (!skill) return { ...STRUGGLE_VIEW, id };
  const hits = skillHits(skill);
  return {
    id, name: skill.name.zh, type: attackTypes(data.types, skill.type).map(typeLabel).join('·'),
    category: SKILL_CATEGORY_LABELS[skill.category as keyof typeof SKILL_CATEGORY_LABELS] ?? SKILL_CATEGORY_LABELS.status,
    power: skill.power + (skill.power_bonus ?? 0), pp: pp?.[id] ?? skill.pp, maxPp: skill.pp, accuracy: skill.accuracy,
    priority: skill.priority ?? 0, critRate: skill.crit_rate ?? DEFAULT_CRIT_RATE, ...(hits ? { hits } : {}),
    description: skillDescription(skill, condition => data.conditions.get(condition)?.name?.zh),
  };
}

