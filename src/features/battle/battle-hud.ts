// View rules of the battle screen: condition chips, command panes and settled messages.
import type { BattleMonsterView, BattlePresentationFrame, BattleView, ItemView, SkillView } from '../../shared/views.ts';
import { BATTLE_SUPPLY_CATEGORIES, type BattleSupplyCategory } from '../../shared/item-categories.ts';
import { STAGE_LABELS, type StageKey } from '../../shared/labels.ts';
import { STRUGGLE_VIEW } from '../../shared/view-common.ts';

export interface StageChip { stat: string; label: string; value: number }

/** Non-zero stat stages, in snapshot order. */
export const stageChips = (stages: Record<string, number>): StageChip[] =>
  Object.entries(stages).filter(([, value]) => value !== 0).map(([stat, value]) => ({ stat, label: STAGE_LABELS[stat as StageKey] || stat, value }));

/** Spoken summary of a combatant's statuses and stage changes. */
export const conditionSummary = (monster: BattleMonsterView) =>
  [...monster.statuses, ...stageChips(monster.stages).map(chip => `${chip.label}${chip.value > 0 ? '提升' : '下降'} ${Math.abs(chip.value)} 级`)].join('，') || '无异常状态或能力变化';

/**
 * The turn the caption names. `battle.turn` counts the turns played so far: while commands are open the caption names the turn
 * being chosen (第 1 回合 before the first move), while a turn plays that turn, and once the battle is over its last turn.
 */
export const shownTurn = (battle: Pick<BattleView, 'turn' | 'finished'>, busy: boolean) =>
  busy || battle.finished ? Math.max(1, battle.turn) : battle.turn + 1;

export const roundStatus = (battle: BattleView, busy: boolean) =>
  busy ? '精灵行动中' : battle.finished ? '战斗结束' : battle.needsSwitch ? '选择出战精灵' : '等待你的指令';

/** The result panel's heading, which names the outcome (a challenge's loss as 挑战失败); the dialogue beside it shows the result text. */
export function battleResultTitle(battle: BattleView): string {
  if (battle.captured) return '捕捉成功！';
  if (battle.won) return '战斗胜利！';
  if (battle.resultReason === 'turn_cap') return '本场平局';
  if (battle.resultReason === 'flee') return '已撤离战斗';
  return battle.challenge ? '挑战失败' : '战斗失败';
}

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

export const BATTLE_SKILL_SLOTS = 4;
/** The skills, or 挣扎 in their place once every one is out of PP. */
export const battleSkills = (player: BattleMonsterView): SkillView[] => player.skills.some(skill => skill.pp > 0) ? player.skills : [STRUGGLE_VIEW];

const EMPTY_SUPPLIES: Record<BattleSupplyCategory, string> = {
  recovery: '暂无体力或 PP 恢复道具。', capsule: '暂无精灵胶囊，请到道具管理补充。', status: '暂无异常解除道具。',
};

/** The command deck's 道具 command opens the recovery supplies. */
export const OPENED_ITEM_CATEGORY: BattleSupplyCategory = 'recovery';

export const hasStock = (item: ItemView) => item.unlimited || item.count > 0;

/** Whether `item` does something for the creature in battle now, which is the only creature a battle item goes to. */
export const helpsActive = (battle: BattleView, item: ItemView) => !!item.useTargets?.includes(battle.player.uid);

/** What a click on an item card does: throw the capsule, use the item on the creature in battle, or nothing. */
export function itemCardAction(battle: BattleView, item: ItemView): { type: 'capture' | 'battleItem'; itemId: string } | null {
  if (battle.needsSwitch || !hasStock(item)) return null;
  if (item.battleCategory === 'capsule') return battle.canCapture ? { type: 'capture', itemId: item.id } : null;
  return helpsActive(battle, item) ? { type: 'battleItem', itemId: item.id } : null;
}

/**
 * Visible categories, the effective category and its items. Revival items are not listed: battle items go to the creature in
 * battle, which is never fainted while the pane takes a command.
 */
export function battleItemPane(battle: BattleView, inventory: ItemView[], category: BattleSupplyCategory) {
  const categories = BATTLE_SUPPLY_CATEGORIES.filter(([id]) => id !== 'capsule' || battle.canCapture);
  const shown = category === 'capsule' && !battle.canCapture ? 'recovery' : category;
  const items = inventory.filter(item => hasStock(item) && item.battleCategory === shown && item.targetMode !== 'fainted');
  return { categories, category: shown, items, empty: EMPTY_SUPPLIES[shown] };
}
