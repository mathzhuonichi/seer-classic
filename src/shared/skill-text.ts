// The words of a skill's detail card: its effect text and its facts (威力, 命中, PP, 连击, 先制, 致命一击).
import { CRIT_DENOMINATOR, DEFAULT_CRIT_RATE, multiHitRange } from '../../battle/core/src/constants.ts';
import type { EffectOp, Skill } from '../../battle/core/src/types.ts';
import type { SkillView } from './views.ts';

/** What a detail card says of a skill that has no effect besides its damage. */
export const NO_EFFECT_TEXT = '无附加效果';
const TARGETS: Record<string, string> = { self: '自身', foe: '对方' };

/** A count or a range of counts: 3, or 2～3. */
export const countRange = (min: number, max: number) => min === max ? String(min) : `${min}～${max}`;
const signed = (value: number) => value > 0 ? `+${value}` : String(value);

/** A multi-hit attack's hit counts, as the engine rolls them; undefined for a single hit. */
export function skillHits(skill: Pick<Skill, 'effects'>): { min: number; max: number } | undefined {
  const op = skill.effects?.find(effect => effect.op === 'multi_hit');
  return op && multiHitRange(op);
}

/** One op in words, for the skills the catalog leaves undescribed; '' for an op worded nowhere but in a description. */
function opText(op: EffectOp, conditionName: (id: string) => string | undefined): string {
  if (op.when) return '';
  const chance = typeof op.chance === 'number' && op.chance < 100 ? `${op.chance}%概率` : '';
  if (op.op === 'multi_hit') {
    const { min, max } = multiHitRange(op);
    return `${chance}连续攻击 ${countRange(min, max)} 次`;
  }
  if (op.op === 'add_condition') {
    const name = conditionName(op.condition);
    if (!name) return '';
    const turns = Array.isArray(op.turns) ? countRange(op.turns[0], op.turns[1]) : op.turns;
    return `${chance}${turns ? `${turns} 回合内` : ''}${TARGETS[op.target] ?? ''}${name}${op.charges ? `（${op.charges} 次）` : ''}`;
  }
  return '';
}

/**
 * The text of a skill's effect: the catalog's description, else its ops in words; '' for a skill without ops. An op this module
 * cannot word gives no text; skill-text.test.mjs checks that every catalog skill with ops reads some text.
 */
export function skillDescription(skill: Skill, conditionName: (id: string) => string | undefined): string {
  const official = (skill as { desc?: { zh?: string } }).desc?.zh?.trim();
  if (official) return official;
  return (skill.effects ?? []).map(op => opText(op, conditionName)).filter(Boolean).join('；');
}
/** A skill's effect on its detail card, NO_EFFECT_TEXT for a plain attack. */
export const effectText = (skill: Pick<SkillView, 'description'>) => skill.description || NO_EFFECT_TEXT;

/** 先制+1: the tag of a skill that moves before (or after) others. */
export const priorityTag = (priority: number) => `先制${signed(priority)}`;
/** The power on a skill card: 55, 55×2～3 for a multi-hit attack, or — without power. */
export function powerText(skill: Pick<SkillView, 'power' | 'hits'>): string {
  if (!skill.power) return '—';
  return skill.hits ? `${skill.power}×${countRange(skill.hits.min, skill.hits.max)}` : String(skill.power);
}

/** The facts of a skill's detail card as label and value; 连击, 先制 and 致命一击 only where they differ from a plain hit. */
export function skillFacts(skill: SkillView): [label: string, value: string][] {
  const facts: [string, string][] = [
    ['威力', skill.power ? String(skill.power) : '—'], ['命中', skill.accuracy === null ? '必中' : String(skill.accuracy)], ['PP', `${skill.pp}/${skill.maxPp}`],
  ];
  if (skill.hits) facts.push(['连击', `${countRange(skill.hits.min, skill.hits.max)} 次`]);
  if (skill.priority) facts.push(['先制', signed(skill.priority)]);
  if (skill.critRate !== DEFAULT_CRIT_RATE) facts.push(['致命一击', `${skill.critRate}/${CRIT_DENOMINATOR}`]);
  return facts;
}
