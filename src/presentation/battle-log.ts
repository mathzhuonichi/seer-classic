import type { BattleEvent, DataSet } from '../../battle/core/src/types.ts';

export interface BattleLogCreature { name: string; hp: number; maxHp: number }
export interface BattleLogContext {
  data: Pick<DataSet, 'species' | 'skills' | 'items'>;
  initialPlayer: BattleLogCreature;
  initialEnemy: BattleLogCreature;
  /** Trainer battles: lines about the opponent omit its remaining HP; amounts stay. */
  hideEnemyHp?: boolean;
}
const statNames: Record<string, string> = { atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度', acc: '命中', eva: '闪避' };
const statusNames: Record<string, string> = { poison: '中毒', burn: '烧伤', freeze: '冻伤', paralysis: '麻痹', sleep: '睡眠', fear: '害怕', flinch: '害怕', confusion: '混乱', leech: '寄生', fatigue: '疲惫', petrify: '石化', weaken: '衰弱', flammable: '易燃', frozen_solid: '冰封', protect: '保护' };
const conditionName = (id: string) => statusNames[id] || (id && !/^(seer_|boss_|trait-|\d)/.test(id) && /[\u4e00-\u9fff]/.test(id) ? id : '技能效果');
const remaining = (event: BattleEvent, mon: BattleLogCreature, context: BattleLogContext, lead: string) => event.side === 1 && context.hideEnemyHp ? '' : `${lead}剩余体力 ${event.hp ?? mon.hp}/${event.maxHp ?? mon.maxHp}`;

/** Display the complete hit; HP loss, drain and rewards retain the core's amount. */
export const displayedDamage = (event: BattleEvent): number => Math.max(0, Number(event.amount ?? event.damage ?? 0)) + Math.max(0, Number(event.overkill ?? 0));

/** Format one event for the centered dialogue; pass current displayed creature names. */
export function battleEventText(event: BattleEvent, context: BattleLogContext): string {
  const mon = event.side === 1 ? context.initialEnemy : context.initialPlayer;
  const name = event.type==='move_used'||event.type==='move' ? (event.sourceName||mon.name) : event.name || mon.name;
  const skill = context.data.skills.get(event.skill)?.name.zh || '技能';
  switch (event.type) {
    case 'turn_start': return `第 ${event.turn} 回合`;
    case 'move': case 'move_used': return `${name}使用了${skill}。`;
    case 'damage': return `${name}${event.status ? `因${conditionName(event.status)}` : ''}受到 ${displayedDamage(event)} 点伤害${event.crit ? '，致命一击！' : '。'}${remaining(event, mon, context, '')}${event.side === 1 && context.hideEnemyHp ? '' : '。'}`;
    case 'heal': return `${name}恢复 ${event.amount ?? 0} 点体力${remaining(event, mon, context, '，')}。`;
    case 'revive': return `${name}恢复了战斗能力${remaining(event, mon, context, '，')}。`;
    case 'miss': return `${name}的${skill}没有命中。`;
    case 'faint': return `${name}失去战斗能力。`;
    case 'switch': case 'switch_in': return `${event.side === 1 ? '对手' : '我方'}派出了${event.name || context.data.species.get(event.species)?.name.zh || name}。`;
    case 'switch_out': return `${name}返回精灵胶囊。`;
    case 'transform': return `${name}变为${event.name || context.data.species.get(event.species)?.name.zh || '新的形态'}。`;
    case 'status': case 'status_added': case 'status_applied': return `${name}陷入${conditionName(event.status)}${Number.isFinite(event.turns) ? `，持续 ${event.turns} 回合` : ''}。`;
    case 'condition_added': return `${name}获得${(event.conditionName||conditionName(event.condition))}效果${Number.isFinite(event.turns) ? `，持续 ${event.turns} 回合` : ''}。`;
    case 'condition_refreshed': return `${name}的${(event.conditionName||conditionName(event.condition))}效果更新${Number.isFinite(event.turns) ? `为 ${event.turns} 回合` : ''}。`;
    case 'condition_removed': return `${name}的${(event.conditionName||conditionName(event.condition))}${event.reason === 'expired' ? '效果结束' : '已解除'}。`;
    case 'condition_tick': return `${name}的${(event.conditionName||conditionName(event.condition))}在回合结束时生效。`;
    case 'stage': case 'stage_change': case 'stat_stage': return event.reason === 'critical' ? `致命一击破防，${name}的${statNames[event.stat] || '能力'}提升已清除。` : `${name}的${statNames[event.stat] || '能力'}${event.delta > 0 ? '提升' : event.delta < 0 ? '下降' : '不变'}${event.delta ? ` ${Math.abs(event.delta)} 级` : ''}${typeof event.stage === 'number' ? `，当前 ${event.stage > 0 ? '+' : ''}${event.stage} 级` : ''}。`;
    case 'stages_cleared': return `${name}的能力${event.which === 'up' ? '提升' : event.which === 'down' ? '下降' : '变化'}已清除。`;
    case 'stage_blocked': return `${name}的${statNames[event.stat] || '能力'}变化被阻止。`;
    case 'status_blocked': return `${name}没有陷入${conditionName(event.status)}。`;
    case 'protected': case 'damage_blocked': return `${name}抵挡了这次伤害。`;
    case 'immune': return `${name}免疫了这次攻击。`;
    case 'cant_act': return `${name}无法行动。`;
    case 'move_failed': return `${name}的${skill}没有生效。`;
    case 'pp_restored': return `${name}的技能 PP ${event.amount === null ? '已恢复' : `恢复 ${event.amount} 点`}。`;
    case 'pp_drained': return `${name}的技能 PP 减少 ${event.amount ?? 1} 点。`;
    case 'item_used': return `${event.side === 1 ? '对手' : '我方'}${event.targetName ? `对${event.targetName}` : ''}使用了${context.data.items.get(event.item)?.name?.zh || '道具'}。`;
    case 'capture_attempt': {
      const target = event.side === 1 ? context.initialPlayer.name : context.initialEnemy.name;
      const capsule = context.data.items.get(event.item)?.name?.zh || '精灵胶囊';
      return `${event.side === 1 ? '对手' : '我方'}使用了${capsule}，${event.success ? `成功捕捉${target}！` : `${target}挣脱了胶囊，捕捉失败。`}`;
    }
    case 'flee': return `${event.side === 1 ? '对手' : '我方'}撤离了战斗。`;
    case 'boss_fled': return '对手撤离了战斗。';
    case 'battle_end': return event.reason === 'capture' ? '捕捉成功，战斗结束！' : event.reason === 'flee' ? '已撤离战斗，本次不发放战斗奖励。' : event.reason==='turn_cap'?'达到回合上限，本场平局。':event.success ? '战斗胜利！' : '战斗结束。';
    case 'say': return String(event.text?.zh ?? event.text ?? '');
    default: return '';
  }
}

/** Each entry is one action and its consequences, or one residual/end-of-turn group. */
export function groupedBattleLog(events: BattleEvent[], context: BattleLogContext): string[] {
  const shown = { ...context, initialPlayer: { ...context.initialPlayer }, initialEnemy: { ...context.initialEnemy } };
  const groups: string[] = [];
  let current: string[] = [];
  const flush = () => { if (current.length) groups.push(current.join('　')); current = []; };
  for (const event of events) {
    if (['turn_start', 'move_used', 'item_used', 'capture_attempt', 'switch_in', 'condition_tick', 'flee', 'battle_end'].includes(event.type)) flush();
    if (event.type === 'switch_in' || event.type === 'transform') {
      const mon = event.side === 1 ? shown.initialEnemy : shown.initialPlayer;
      mon.name = event.name || context.data.species.get(event.species)?.name.zh || mon.name;
      mon.hp = event.hp ?? mon.hp;
      mon.maxHp = event.maxHp ?? mon.maxHp;
    }
    const text = battleEventText(event, shown);
    if (text) current.push(text);
    if (event.type === 'damage' || event.type === 'heal' || event.type === 'revive') {
      const mon = event.side === 1 ? shown.initialEnemy : shown.initialPlayer;
      // Named bench recovery must not overwrite the active creature's context.
      if (!event.name || event.name === mon.name) mon.hp = event.hp ?? mon.hp;
    }
    if (event.type === 'turn_start' || event.type === 'battle_end') flush();
  }
  flush();
  return groups;
}
