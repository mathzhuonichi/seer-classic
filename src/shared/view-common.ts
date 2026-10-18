// Small display rules shared by the controller's snapshot builders.
import { STRUGGLE_SKILL, type DataSet, type Skill as BattleSkill } from '../../battle/core/src/index.ts';
import { attackTypes } from '../../battle/core/src/typechart.ts';
import { SKILL_CATEGORY_LABELS, STATUS_LABELS, TYPE_LABELS } from './labels.ts';
import type { SkillView } from './views.ts';

export const portrait = (species: number) => `/portraits/${species}.png`;
export const typeLabel = (type: string) => TYPE_LABELS[type] ?? type;
export const statusLabel = (id: string) => STATUS_LABELS[id];

const STRUGGLE_VIEW = {
  name: STRUGGLE_SKILL.name.zh, type: '无', category: SKILL_CATEGORY_LABELS[STRUGGLE_SKILL.category],
  power: STRUGGLE_SKILL.power, pp: STRUGGLE_SKILL.pp, maxPp: STRUGGLE_SKILL.pp, description: '技能耗尽时使用。',
};

export function skillView(data: DataSet, id: number, pp?: Record<string, number>, engraved?: BattleSkill): SkillView {
  const skill = engraved ?? data.skills.get(id);
  if (!skill) return { id, ...STRUGGLE_VIEW };
  return {
    id, name: skill.name.zh, type: attackTypes(data.types, skill.type).map(typeLabel).join('·'),
    category: SKILL_CATEGORY_LABELS[skill.category as keyof typeof SKILL_CATEGORY_LABELS] ?? SKILL_CATEGORY_LABELS.status,
    power: skill.power + (skill.power_bonus ?? 0), pp: pp?.[id] ?? skill.pp, maxPp: skill.pp,
    description: String((skill as { desc?: { zh?: string } }).desc?.zh ?? ''),
  };
}
