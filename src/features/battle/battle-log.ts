import type { BattleEvent, DataSet } from '../../../battle/core/src/index.ts';
import { STAGE_LABELS, STATUS_LABELS, type StageKey } from '../../shared/labels.ts';

export type EventOf<T extends BattleEvent['type']> = Extract<BattleEvent, { type: T }>;

export interface BattleLogCreature { name: string; hp: number; maxHp: number }
export interface BattleLogContext {
  data: Pick<DataSet, 'species' | 'skills' | 'items'>;
  initialPlayer: BattleLogCreature;
  initialEnemy: BattleLogCreature;
  /** Trainer battles: lines about the opponent omit its remaining HP; amounts stay. */
  hideEnemyHp?: boolean;
}
type Sided = { side: 0 | 1 };
const CHINESE = /[一-鿿]/;
const conditionName = (id: string) => STATUS_LABELS[id] || (id && !/^(seer_|boss_|trait-|\d)/.test(id) && CHINESE.test(id) ? id : '技能效果');
type Named = { condition: string; conditionName?: string };
/** The condition's Chinese name; Boss rule conditions are named by their rule ids, which are not shown. */
const conditionLabel = (event: Named) => event.conditionName && CHINESE.test(event.conditionName) ? event.conditionName : conditionName(event.condition);
/** The condition as "…效果", without doubling the fallback's own 效果. */
const effectLabel = (event: Named) => { const label = conditionLabel(event); return label.endsWith('效果') ? label : `${label}效果`; };
const stageLabel = (stat: StageKey) => STAGE_LABELS[stat] || '能力';
/** The opposing side's events; events without a side belong to the player's line. */
const onFoe = (event: BattleEvent) => 'side' in event && event.side === 1;
const sideLabel = (event: Sided) => event.side === 1 ? '对手' : '我方';
const lasting = (event: { turns: number }) => Number.isFinite(event.turns) ? `，持续 ${event.turns} 回合` : '';
const hidesHp = (event: Sided, context: BattleLogContext) => event.side === 1 && !!context.hideEnemyHp;
const remaining = (event: Sided & { hp: number; maxHp: number }, context: BattleLogContext, lead: string) =>
  hidesHp(event, context) ? '' : `${lead}剩余体力 ${event.hp}/${event.maxHp}`;
const speciesName = (event: EventOf<'switch_in' | 'transform'>, context: BattleLogContext): string | undefined =>
  event.name || context.data.species.get(event.species)?.name.zh;

/** Display the complete hit; HP loss, drain and rewards retain the core's amount. */
export const displayedDamage = (event: EventOf<'damage'>): number => Math.max(0, event.amount) + Math.max(0, event.overkill);

function stageText(event: EventOf<'stat_stage'>, name: string): string {
  if (event.reason === 'critical') return `致命一击破防，${name}的${stageLabel(event.stat)}提升已清除。`;
  const change = event.delta > 0 ? '提升' : event.delta < 0 ? '下降' : '不变';
  return `${name}的${stageLabel(event.stat)}${change}${event.delta ? ` ${Math.abs(event.delta)} 级` : ''}，当前 ${event.stage > 0 ? '+' : ''}${event.stage} 级。`;
}

function captureText(event: EventOf<'capture_attempt'>, context: BattleLogContext): string {
  const target = event.side === 1 ? context.initialPlayer.name : context.initialEnemy.name;
  const capsule = context.data.items.get(event.item)?.name?.zh || '精灵胶囊';
  return `${sideLabel(event)}使用了${capsule}，${event.success ? `成功捕捉${target}！` : `${target}挣脱了胶囊，捕捉失败。`}`;
}

/** A capture's or a retreat's end needs no line: the capsule's or the flee's line already says how the battle ended. */
function battleEndText(event: EventOf<'battle_end'>): string {
  if (event.reason === 'capture' || event.reason === 'flee') return '';
  if (event.reason === 'turn_cap') return '达到回合上限，本场平局。';
  return event.success ? '战斗胜利！' : '战斗结束。';
}

/** Format one event for the centered dialogue; pass current displayed creature names. */
export function battleEventText(event: BattleEvent, context: BattleLogContext): string {
  const foe = onFoe(event), mon = foe ? context.initialEnemy : context.initialPlayer, other = foe ? context.initialPlayer : context.initialEnemy;
  // A move's own `name` is its skill's.
  const bare = event.type !== 'move_used' && 'name' in event && event.name || mon.name;
  // Both sides can field the same species: then the side tells them apart.
  const name = 'side' in event && bare === other.name ? `${sideLabel(event)}${bare}` : bare;
  const skill = (id: number) => context.data.skills.get(id)?.name.zh || '技能';
  switch (event.type) {
    case 'turn_start': return `第 ${event.turn} 回合`;
    case 'move_used': return `${name}使用了${skill(event.skill)}。`;
    case 'damage': {
      const cause = event.status ? `因${conditionName(event.status)}` : '', end = hidesHp(event, context) ? '' : '。';
      return `${name}${cause}受到 ${displayedDamage(event)} 点伤害${event.crit ? '，致命一击！' : '。'}${remaining(event, context, '')}${end}`;
    }
    case 'heal': return `${name}恢复 ${event.amount} 点体力${remaining(event, context, '，')}。`;
    case 'revive': return `${name}恢复了战斗能力${remaining(event, context, '，')}。`;
    case 'miss': return `${name}的${skill(event.skill)}没有命中。`;
    case 'faint': return `${name}失去战斗能力。`;
    case 'switch_in': return `${sideLabel(event)}派出了${speciesName(event, context) || bare}。`;
    case 'switch_out': return `${name}返回精灵胶囊。`;
    case 'transform': return `${name}变为${speciesName(event, context) || '新的形态'}。`;
    case 'status_applied': return `${name}陷入${conditionName(event.status)}${lasting(event)}。`;
    case 'condition_added': return `${name}获得${effectLabel(event)}${lasting(event)}。`;
    case 'condition_refreshed': return `${name}的${effectLabel(event)}更新${Number.isFinite(event.turns) ? `为 ${event.turns} 回合` : ''}。`;
    case 'condition_removed': return `${name}的${event.reason === 'expired' ? `${effectLabel(event)}结束` : `${conditionLabel(event)}已解除`}。`;
    case 'condition_tick': return `${name}的${conditionLabel(event)}在回合结束时生效。`;
    case 'stat_stage': return stageText(event, name);
    case 'stages_cleared': return `${name}的能力${event.which === 'up' ? '提升' : event.which === 'down' ? '下降' : '变化'}已清除。`;
    case 'stage_blocked': return `${name}的${stageLabel(event.stat)}变化被阻止。`;
    case 'status_blocked': return `${name}没有陷入${conditionName(event.status)}。`;
    case 'protected': case 'damage_blocked': return `${name}抵挡了这次伤害。`;
    case 'immune': return `${name}免疫了这次攻击。`;
    case 'cant_act': return `${name}无法行动。`;
    case 'move_failed': return `${name}的技能没有生效。`;
    case 'pp_restored': return `${name}的技能 PP ${event.amount === null ? '已恢复' : `恢复 ${event.amount} 点`}。`;
    case 'pp_drained': return `${name}的技能 PP 减少 ${event.amount} 点。`;
    case 'item_used': return `${sideLabel(event)}${event.targetName ? `对${event.targetName}` : ''}使用了${context.data.items.get(event.item)?.name?.zh || '道具'}。`;
    case 'capture_attempt': return captureText(event, context);
    case 'flee': return `${sideLabel(event)}撤离了战斗。`;
    case 'boss_fled': return '对手撤离了战斗。';
    case 'battle_end': return battleEndText(event);
    case 'say': return event.text.zh;
    default: return '';
  }
}

/**
 * A battle's opening events as the log shows them. The Battle constructor installs the encounter rules between `battle_start`
 * and the first switch-in; the conditions they attach are Boss mechanics, shown in the evidence dialog, so they get no line.
 */
export function openingEvents(events: BattleEvent[]): BattleEvent[] {
  const fielded = events.findIndex(event => event.type === 'switch_in');
  return events.filter((event, index) => index >= fielded || (event.type !== 'condition_added' && event.type !== 'condition_refreshed'));
}

/** Events that open a new log entry; a switch_in continues the switch_out of its side just before it (one switch). */
const GROUP_STARTS: ReadonlySet<BattleEvent['type']> =
  new Set(['turn_start', 'move_used', 'item_used', 'capture_attempt', 'switch_out', 'switch_in', 'condition_tick', 'flee', 'battle_end']);
const continuesSwitch = (event: BattleEvent, previous: BattleEvent | undefined) =>
  event.type === 'switch_in' && previous?.type === 'switch_out' && previous.side === event.side;

/** Each entry is one action and its consequences, or one residual/end-of-turn group. */
export function groupedBattleLog(events: BattleEvent[], context: BattleLogContext): string[] {
  const shown = { ...context, initialPlayer: { ...context.initialPlayer }, initialEnemy: { ...context.initialEnemy } };
  const groups: string[] = [];
  let current: string[] = [];
  const flush = () => { if (current.length) groups.push(current.join('　')); current = []; };
  let previous: BattleEvent | undefined;
  for (const event of events) {
    if (GROUP_STARTS.has(event.type) && !continuesSwitch(event, previous)) flush();
    previous = event;
    const mon = onFoe(event) ? shown.initialEnemy : shown.initialPlayer;
    if (event.type === 'switch_in' || event.type === 'transform') {
      mon.name = speciesName(event, context) || mon.name;
      mon.hp = event.hp;
      mon.maxHp = event.maxHp;
    }
    const text = battleEventText(event, shown);
    if (text) current.push(text);
    // Named bench recovery must not overwrite the active creature's context.
    if ((event.type === 'damage' || event.type === 'heal' || event.type === 'revive') && (!event.name || event.name === mon.name)) mon.hp = event.hp;
    if (event.type === 'turn_start' || event.type === 'battle_end') flush();
  }
  flush();
  return groups;
}
