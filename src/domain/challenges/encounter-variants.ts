// Encounter variants: the source's weekday objectives and fields, which the player picks before a Boss fight
// (no real-time clock), the practice fight some encounters offer without one, and the rules and objectives as the player reads them.
import { DOT_STATUSES, type BossEncounter, type BossRule, type EncounterVariant, type Objective, type Phase } from '../../../battle/core/src/index.ts';
import type { StatKey } from '../../../raising/core/stats.ts';
import { STAT_LABELS, STATUS_LABELS } from '../../shared/labels.ts';
import type { EncounterVariantView } from '../../shared/views.ts';

/**
 * Whether a fight without a variant is offered as practice: no attempt, clear record or reward items (盖亚's free practice fight).
 * Without it, every fight of an encounter with variants takes one, as every source day or time window had its rules.
 */
export const offersPractice = (encounter: BossEncounter) => !!encounter.variants?.length && encounter.practice_fight === true;

/** The variant chosen for `encounter`, or null for a fight without one; throws the reason when the choice does not fit it. */
export function chosenVariant(encounter: BossEncounter, id: string | undefined): EncounterVariant | null {
  const variants = encounter.variants ?? [], name = encounter.name?.zh ?? encounter.id;
  if (id === undefined) {
    if (variants.length && !offersPractice(encounter)) throw new Error(`请先选择${name}的挑战规则。`);
    return null;
  }
  const variant = variants.find(entry => entry.id === id);
  if (!variant) throw new Error(variants.length ? `${name}没有这项挑战规则，请重新选择。` : `${name}没有可选的挑战规则。`);
  return variant;
}

type Params = Record<string, any>;
const sides = (p: Params) => p.sides === 'both' ? '双方' : '首领';
const stages = (stats: Record<string, number>) =>
  Object.entries(stats).map(([key, value]) => `${STAT_LABELS[key as StatKey]}${value > 0 ? '+' : ''}${value}`).join('、');
const statuses = (ids: readonly string[]) => ids.map(id => STATUS_LABELS[id]).join('、');

/** The added rules, by native rule or script id. Every rule of a catalogue variant needs one: building the encounter rows throws otherwise. */
const RULE_TEXTS: Record<string, (p: Params) => string> = {
  immune_status: () => '首领免疫所有异常状态',
  hp_multiplier: p => `首领体力上限变为 ${p.multiplier} 倍`,
  evasion_bonus: p => `首领闪避等级 +${p.stages}`,
  reflect_damage: p => `首领单次受到 ${p.min_damage} 点及以上的伤害时，反弹其中 ${p.pct}% 给攻击者`,
  heal_flat_each_turn: p => `首领每回合结束时回复 ${p.amount} 体力`,
  revive_unless_status_ko: p => `首领被直接攻击打倒时回满体力（最多 ${p.max_revives} 次）`,
  crit_rate_scales_with_hp_lost: () => '资料记载体力越低越容易出现致命一击；当前规则不加入随体力变化的额外致命一击率',
  always_moves_first: () => '首领总是先手行动',
  field_heal_each_turn: p => `${sides(p)}每回合结束时回复 ${p.pct_max_hp}% 体力`,
  field_damage_each_turn: p => `${sides(p)}每回合结束时损失 ${p.amount} 体力`,
  field_damage_multiplier: p => `${sides(p)}造成的伤害变为 ${p.multiplier} 倍`,
};
const WHEN_TEXTS: Record<string, (value: any) => string> = {
  first_turn: () => '开场时',
  self_hp_below_pct: value => `体力低于 ${value}% 后`,
};
const OP_TEXTS: Record<string, (op: Params) => string> = {
  stat_stage: op => `首领${stages(op.stats)}`,
  script: op => ({ ohko_attacks: '首领的攻击直接击倒对手' } as Record<string, string>)[op.id],
};

function ruleText(rule: BossRule): string {
  const id = rule.rule === 'script' ? rule.id : rule.rule, text = RULE_TEXTS[id];
  if (!text) throw new Error(`no player text for the variant rule ${id}`);
  return text(rule.rule === 'script' ? rule.params ?? {} : rule);
}

function phaseText(phase: Phase): string {
  const when = Object.entries(phase.when).map(([key, value]) => WHEN_TEXTS[key]?.(value));
  const effects = phase.do.map(op => OP_TEXTS[op.op]?.(op));
  if ([...when, ...effects].some(text => !text)) throw new Error(`no player text for the variant phase ${JSON.stringify(phase)}`);
  return `${when.join('、')}，${effects.join('，')}`;
}

const WIN_TEXTS: Record<string, (o: Objective) => string> = {
  ko_all: () => '击败全部对手',
  turn_limit: o => `在 ${o.turns} 回合内获胜`,
  finish_with_crit: () => '最后一击须为致命一击',
  ko_after_turn: o => `第 ${o.turns} 回合之后才能击倒首领，提前击倒算作失败`,
  finish_with_status_damage: o => `最后一击须为${statuses(o.statuses ?? DOT_STATUSES)}的异常状态伤害`,
};
const LOSE_TEXTS: Record<string, (o: Objective) => string> = { turn_limit: o => `第 ${o.turns} 回合结束时仍未获胜` };
/** Every fight is lost when the player's whole team faints. */
const TEAM_FAINTED = '我方精灵全部倒下';

function objectivesText(objectives: readonly Objective[], texts: Record<string, (o: Objective) => string>): string[] {
  return objectives.map(objective => {
    const text = texts[objective.kind];
    if (!text) throw new Error(`no player text for the variant objective ${objective.kind}`);
    return text(objective);
  });
}

/** The variants as the player picks them: the rules each adds, its objectives, and whether it was cleared. */
export function variantViews(encounter: BossEncounter, cleared: readonly string[]): EncounterVariantView[] {
  return (encounter.variants ?? []).map(variant => ({
    id: variant.id, label: variant.label.zh, cleared: cleared.includes(variant.id),
    rules: [...(variant.rules ?? []).map(ruleText), ...(variant.phases ?? []).map(phaseText)],
    win: objectivesText(variant.win ?? encounter.win ?? [], WIN_TEXTS).join('，'),
    lose: [TEAM_FAINTED, ...objectivesText(variant.lose ?? encounter.lose ?? [], LOSE_TEXTS)].join('，或'),
  }));
}
