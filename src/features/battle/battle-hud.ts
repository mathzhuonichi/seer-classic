// View rules of the battle screen: condition chips, command panes and settled messages.
import type { BattleMonsterView, BattlePresentationFrame, BattleView, BossEvidenceView, ItemView, SkillView } from '../../shared/views.ts';
import { STRUGGLE } from '../../../battle/core/src/constants.ts';
import { BATTLE_SUPPLY_CATEGORIES, type BattleSupplyCategory } from '../../shared/item-categories.ts';
import { SKILL_CATEGORY_LABELS, STAGE_LABELS, TYPE_LABELS, type StageKey } from '../../shared/labels.ts';

export interface StageChip { stat: string; label: string; value: number }

/** Non-zero stat stages, in snapshot order. */
export const stageChips = (stages: Record<string, number>): StageChip[] =>
  Object.entries(stages).filter(([, value]) => value !== 0).map(([stat, value]) => ({ stat, label: STAGE_LABELS[stat as StageKey] || stat, value }));

/** Spoken summary of a combatant's statuses and stage changes. */
export const conditionSummary = (monster: BattleMonsterView) =>
  [...monster.statuses, ...stageChips(monster.stages).map(chip => `${chip.label}${chip.value > 0 ? '提升' : '下降'} ${Math.abs(chip.value)} 级`)].join('，') || '无异常状态或能力变化';

export const evidenceButtonLabel = (evidence: BossEvidenceView) => evidence.incompleteRules ? '部分机制待还原' : evidence.hasInferredStats ? '含推定参数' : '资料依据';

export const roundStatus = (battle: BattleView, busy: boolean) =>
  busy ? '精灵行动中' : battle.finished ? '战斗结束' : battle.needsSwitch ? '选择出战精灵' : '等待你的指令';

/** The result panel's heading; the dialogue beside it shows the battle's result text. */
export const battleResultTitle = (battle: BattleView) =>
  battle.captured ? '捕捉成功！' : battle.won ? '战斗胜利！' : battle.resultReason === 'turn_cap' ? '本场平局' : '战斗结束';

/** Win or lose jingle once playback settles; captures, retreats and draws stay silent. */
export function battleEndSound(battle: BattleView): 'win' | 'lose' | null {
  if (!battle.finished || battle.captured || battle.resultReason === 'flee' || battle.resultReason === 'turn_cap') return null;
  return battle.won ? 'win' : 'lose';
}

/** Dialogue once a turn's frames have played. */
export function settledDialogue(battle: BattleView, lastFrame?: BattlePresentationFrame): string {
  if (battle.needsSwitch) return '精灵失去战斗能力，请选择下一位出战精灵。';
  if (battle.finished) return battle.result;
  return lastFrame?.text || '请选择下一回合的指令。';
}

/** The latest turn's last two entries, after its `第 N 回合` header. */
export function recentBattleLog(log: string[]): string[] {
  const header = log.reduce((last, line, index) => /^第 \d+ 回合$/.test(line) ? index : last, -1);
  return log.slice(header + 1).slice(-2);
}

/** Shown in place of the skills once every one is out of PP. */
const STRUGGLE_VIEW: SkillView = {
  id: STRUGGLE.id, name: '挣扎', type: TYPE_LABELS.normal, category: SKILL_CATEGORY_LABELS.physical, power: STRUGGLE.power, pp: 0, maxPp: 0,
  description: '技能 PP 全部耗尽时使用，会受到反作用伤害。',
};
export const BATTLE_SKILL_SLOTS = 4;
export const battleSkills = (player: BattleMonsterView): SkillView[] => player.skills.some(skill => skill.pp > 0) ? player.skills : [STRUGGLE_VIEW];

const EMPTY_SUPPLIES: Record<BattleSupplyCategory, string> = {
  recovery: '暂无体力或 PP 恢复道具。', capsule: '暂无精灵胶囊，请到道具管理补充。', status: '暂无异常解除道具。',
};

/** The item pane's own choices; the pane resolves them against the current battle. */
export interface BattleItemChoice { category: BattleSupplyCategory; selection: string; target: string }

export const hasStock = (item: ItemView) => item.unlimited || item.count > 0;

/** What a click on an item card does: throw the capsule at once, select the item, or nothing. */
export function itemCardAction(battle: BattleView, item: ItemView): { type: 'capture'; itemId: string } | { type: 'select'; itemId: string } | null {
  if (battle.needsSwitch || !hasStock(item)) return null;
  if (item.battleCategory !== 'capsule') return { type: 'select', itemId: item.id };
  return battle.canCapture ? { type: 'capture', itemId: item.id } : null;
}

/** Visible categories, the effective category, its items and the resolved selection and target. */
export function battleItemPane(battle: BattleView, inventory: ItemView[], choice: BattleItemChoice) {
  const categories = BATTLE_SUPPLY_CATEGORIES.filter(([id]) => id !== 'capsule' || battle.canCapture);
  const category = choice.category === 'capsule' && !battle.canCapture ? 'recovery' : choice.category;
  const items = inventory.filter(item => hasStock(item) && item.battleCategory === category);
  const selected = items.find(item => item.id === choice.selection) || items[0];
  const targets = battle.party.filter(mon => selected?.targetMode === 'fainted' ? mon.hp <= 0 : mon.hp > 0);
  const target = targets.find(mon => mon.uid === choice.target) || targets.find(mon => mon.uid === battle.player.uid) || targets[0];
  const helpsTarget = !!target && !!selected?.usableTargetUids?.includes(target.uid);
  return { categories, category, items, selected, targets, target, empty: EMPTY_SUPPLIES[category], helpsTarget };
}
