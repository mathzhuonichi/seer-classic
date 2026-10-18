import type { BattleEvent, DataSet } from '../../battle/core/src/types.ts';
import { STAGE_LABELS, STATUS_LABELS, type StageKey } from './labels.ts';

export interface BattleLogCreature { name: string; hp: number; maxHp: number }
export interface BattleLogContext {
  data: Pick<DataSet, 'species' | 'skills' | 'items'>;
  initialPlayer: BattleLogCreature;
  initialEnemy: BattleLogCreature;
  /** Trainer battles: lines about the opponent omit its remaining HP; amounts stay. */
  hideEnemyHp?: boolean;
}
const conditionName = (id: string) => STATUS_LABELS[id] || (id && !/^(seer_|boss_|trait-|\d)/.test(id) && /[一-鿿]/.test(id) ? id : '技能效果');
const conditionLabel = (event: BattleEvent) => event.conditionName || conditionName(event.condition);
const stageLabel = (stat: StageKey) => STAGE_LABELS[stat] || '能力';
const sideLabel = (event: BattleEvent) => event.side === 1 ? '对手' : '我方';
const lasting = (event: BattleEvent) => Number.isFinite(event.turns) ? `，持续 ${event.turns} 回合` : '';
const hidesHp = (event: BattleEvent, context: BattleLogContext) => event.side === 1 && !!context.hideEnemyHp;
const remaining = (event: BattleEvent, mon: BattleLogCreature, context: BattleLogContext, lead: string) =>
  hidesHp(event, context) ? '' : `${lead}剩余体力 ${event.hp ?? mon.hp}/${event.maxHp ?? mon.maxHp}`;
const speciesName = (event: BattleEvent, context: BattleLogContext): string | undefined => event.name || context.data.species.get(event.species)?.name.zh;

/** Display the complete hit; HP loss, drain and rewards retain the core's amount. */
export const displayedDamage = (event: BattleEvent): number => Math.max(0, Number(event.amount ?? event.damage ?? 0)) + Math.max(0, Number(event.overkill ?? 0));

function stageText(event: BattleEvent, name: string): string {
  if (event.reason === 'critical') return `致命一击破防，${name}的${stageLabel(event.stat)}提升已清除。`;
  const change = event.delta > 0 ? '提升' : event.delta < 0 ? '下降' : '不变';
  const current = typeof event.stage === 'number' ? `，当前 ${event.stage > 0 ? '+' : ''}${event.stage} 级` : '';
  return `${name}的${stageLabel(event.stat)}${change}${event.delta ? ` ${Math.abs(event.delta)} 级` : ''}${current}。`;
}

function captureText(event: BattleEvent, context: BattleLogContext): string {
  const target = event.side === 1 ? context.initialPlayer.name : context.initialEnemy.name;
  const capsule = context.data.items.get(event.item)?.name?.zh || '精灵胶囊';
  return `${sideLabel(event)}使用了${capsule}，${event.success ? `成功捕捉${target}！` : `${target}挣脱了胶囊，捕捉失败。`}`;
}

function battleEndText(event: BattleEvent): string {
  if (event.reason === 'capture') return '捕捉成功，战斗结束！';
  if (event.reason === 'flee') return '已撤离战斗，本次不发放战斗奖励。';
  if (event.reason === 'turn_cap') return '达到回合上限，本场平局。';
  return event.success ? '战斗胜利！' : '战斗结束。';
}

/** Format one event for the centered dialogue; pass current displayed creature names. */
export function battleEventText(event: BattleEvent, context: BattleLogContext): string {
  const mon = event.side === 1 ? context.initialEnemy : context.initialPlayer;
  const name = event.type === 'move_used' ? (event.sourceName || mon.name) : event.name || mon.name;
  const skill = context.data.skills.get(event.skill)?.name.zh || '技能';
  switch (event.type) {
    case 'turn_start': return `第 ${event.turn} 回合`;
    case 'move_used': return `${name}使用了${skill}。`;
    case 'damage': {
      const cause = event.status ? `因${conditionName(event.status)}` : '';
      return `${name}${cause}受到 ${displayedDamage(event)} 点伤害${event.crit ? '，致命一击！' : '。'}${remaining(event, mon, context, '')}${hidesHp(event, context) ? '' : '。'}`;
    }
    case 'heal': return `${name}恢复 ${event.amount ?? 0} 点体力${remaining(event, mon, context, '，')}。`;
    case 'revive': return `${name}恢复了战斗能力${remaining(event, mon, context, '，')}。`;
    case 'miss': return `${name}的${skill}没有命中。`;
    case 'faint': return `${name}失去战斗能力。`;
    case 'switch_in': return `${sideLabel(event)}派出了${speciesName(event, context) || name}。`;
    case 'switch_out': return `${name}返回精灵胶囊。`;
    case 'transform': return `${name}变为${speciesName(event, context) || '新的形态'}。`;
    case 'status_applied': return `${name}陷入${conditionName(event.status)}${lasting(event)}。`;
    case 'condition_added': return `${name}获得${conditionLabel(event)}效果${lasting(event)}。`;
    case 'condition_refreshed': return `${name}的${conditionLabel(event)}效果更新${Number.isFinite(event.turns) ? `为 ${event.turns} 回合` : ''}。`;
    case 'condition_removed': return `${name}的${conditionLabel(event)}${event.reason === 'expired' ? '效果结束' : '已解除'}。`;
    case 'condition_tick': return `${name}的${conditionLabel(event)}在回合结束时生效。`;
    case 'stat_stage': return stageText(event, name);
    case 'stages_cleared': return `${name}的能力${event.which === 'up' ? '提升' : event.which === 'down' ? '下降' : '变化'}已清除。`;
    case 'stage_blocked': return `${name}的${stageLabel(event.stat)}变化被阻止。`;
    case 'status_blocked': return `${name}没有陷入${conditionName(event.status)}。`;
    case 'protected': case 'damage_blocked': return `${name}抵挡了这次伤害。`;
    case 'immune': return `${name}免疫了这次攻击。`;
    case 'cant_act': return `${name}无法行动。`;
    case 'move_failed': return `${name}的${skill}没有生效。`;
    case 'pp_restored': return `${name}的技能 PP ${event.amount === null ? '已恢复' : `恢复 ${event.amount} 点`}。`;
    case 'pp_drained': return `${name}的技能 PP 减少 ${event.amount ?? 1} 点。`;
    case 'item_used': return `${sideLabel(event)}${event.targetName ? `对${event.targetName}` : ''}使用了${context.data.items.get(event.item)?.name?.zh || '道具'}。`;
    case 'capture_attempt': return captureText(event, context);
    case 'flee': return `${sideLabel(event)}撤离了战斗。`;
    case 'boss_fled': return '对手撤离了战斗。';
    case 'battle_end': return battleEndText(event);
    case 'say': return String(event.text?.zh ?? event.text ?? '');
    default: return '';
  }
}

/** Events that open a new log entry. */
const GROUP_STARTS = new Set(['turn_start', 'move_used', 'item_used', 'capture_attempt', 'switch_in', 'condition_tick', 'flee', 'battle_end']);

/** Each entry is one action and its consequences, or one residual/end-of-turn group. */
export function groupedBattleLog(events: BattleEvent[], context: BattleLogContext): string[] {
  const shown = { ...context, initialPlayer: { ...context.initialPlayer }, initialEnemy: { ...context.initialEnemy } };
  const groups: string[] = [];
  let current: string[] = [];
  const flush = () => { if (current.length) groups.push(current.join('　')); current = []; };
  for (const event of events) {
    if (GROUP_STARTS.has(event.type)) flush();
    const mon = event.side === 1 ? shown.initialEnemy : shown.initialPlayer;
    if (event.type === 'switch_in' || event.type === 'transform') {
      mon.name = speciesName(event, context) || mon.name;
      mon.hp = event.hp ?? mon.hp;
      mon.maxHp = event.maxHp ?? mon.maxHp;
    }
    const text = battleEventText(event, shown);
    if (text) current.push(text);
    // Named bench recovery must not overwrite the active creature's context.
    const changesActiveHp = (event.type === 'damage' || event.type === 'heal' || event.type === 'revive') && (!event.name || event.name === mon.name);
    if (changesActiveHp) mon.hp = event.hp ?? mon.hp;
    if (event.type === 'turn_start' || event.type === 'battle_end') flush();
  }
  flush();
  return groups;
}
