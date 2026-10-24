import type { BattleEvent, DataSet } from '../../../battle/core/src/index.ts';
import { STAGE_LABELS, STATUS_LABELS, type StageKey } from '../../shared/labels.ts';
import { moveSkill } from '../../shared/view-common.ts';
import {
  damageBlocks, damageTallies, displayedDamage, type Block, type BlockShare, type DamageTally, type TallyShare,
} from './battle-damage-tally.ts';

export type EventOf<T extends BattleEvent['type']> = Extract<BattleEvent, { type: T }>;

export interface BattleLogCreature { name: string; hp: number; maxHp: number }
export interface BattleLogContext {
  data: Pick<DataSet, 'species' | 'skills' | 'items'>;
  initialPlayer: BattleLogCreature;
  initialEnemy: BattleLogCreature;
  /** Trainer battles: lines about the opponent omit its remaining HP; amounts stay. */
  hideEnemyHp?: boolean;
  /** Challenges (encounters): the result text names a win as 挑战成功, so a won battle's end line does not name it too. */
  challenge?: boolean;
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

const signed = (stage: number) => `${stage > 0 ? '+' : ''}${stage}`;
const changeText = (delta: number) => delta > 0 ? `提升 ${delta} 级` : delta < 0 ? `下降 ${-delta} 级` : '不变';

function stageText(event: EventOf<'stat_stage'>, name: string): string {
  if (event.reason === 'critical') return `致命一击破防，${name}的${stageLabel(event.stat)}提升已清除。`;
  return `${name}的${stageLabel(event.stat)}${changeText(event.delta)}，当前 ${signed(event.stage)} 级。`;
}

/** The five battle stats; changed alike, they are named together as the original skill texts do, with 命中 included. */
const BATTLE_STATS: readonly StageKey[] = ['atk', 'def', 'spa', 'spd', 'spe'];
const ALL_STATS: readonly StageKey[] = [...BATTLE_STATS, 'acc'];
const ALL_STATS_LABEL = '所有能力';

function statNames(stats: readonly StageKey[]): string {
  if (!BATTLE_STATS.every(stat => stats.includes(stat))) return stats.map(stageLabel).join('、');
  const others = stats.filter(stat => !ALL_STATS.includes(stat)).map(stageLabel);
  return others.length ? `${ALL_STATS_LABEL}和${others.join('、')}` : ALL_STATS_LABEL;
}

/** Stage events that one step gathers (`battleSteps`); a critical hit's clearing keeps its own line. */
type StageEvent = EventOf<'stat_stage' | 'stage_blocked'>;
const gathers = (event: BattleEvent): event is StageEvent =>
  event.type === 'stage_blocked' || event.type === 'stat_stage' && event.reason !== 'critical';

/** One monster's stage changes at once: the stats named per change in the order they came, then the stage they all reached. */
function stagesText(events: readonly StageEvent[], name: string): string {
  const changes = new Map<number | 'blocked', StageKey[]>();
  for (const event of events) {
    const change = event.type === 'stat_stage' ? event.delta : 'blocked';
    changes.set(change, [...changes.get(change) ?? [], event.stat]);
  }
  const parts = [...changes].map(([change, stats]) => `${statNames(stats)}${change === 'blocked' ? '变化被阻止' : changeText(change)}`);
  const stages = events.map(event => event.type === 'stat_stage' ? event.stage : undefined);
  const [reached] = stages;
  const alike = reached !== undefined && stages.every(stage => stage === reached);
  return `${name}的${parts.join('，')}${alike ? `，当前均为 ${signed(reached)} 级` : ''}。`;
}

function captureText(event: EventOf<'capture_attempt'>, context: BattleLogContext): string {
  const target = event.side === 1 ? context.initialPlayer.name : context.initialEnemy.name;
  const capsule = context.data.items.get(event.item)?.name?.zh || '精灵胶囊';
  return `${sideLabel(event)}使用了${capsule}，${event.success ? `成功捕捉${target}！` : `${target}挣脱了胶囊，捕捉失败。`}`;
}

/**
 * How the battle ended. The result text after it names a loss, a draw or a challenge's win; a wild win's names only the reward,
 * so this line names that win. A capture's, a retreat's or a wild monster's flee's end needs no line: the capsule's or the flee's
 * line already says how the battle ended. A turn cap ends on the turn the cap allows.
 */
function battleEndText(event: EventOf<'battle_end'>, context: BattleLogContext): string {
  if (event.reason === 'capture' || event.reason === 'flee' || event.reason === 'wild_fled') return '';
  if (event.reason === 'turn_cap') return `已达到 ${event.turns} 回合上限。`;
  return event.success && !context.challenge ? '战斗胜利！' : '战斗结束。';
}

/** The event's monster; a move's own `name` is its skill's. */
const bareName = (event: BattleEvent, context: BattleLogContext): string =>
  event.type !== 'move_used' && 'name' in event && event.name || (onFoe(event) ? context.initialEnemy : context.initialPlayer).name;

/** The event's monster as a line names it: both sides can field the same species, and then the side tells them apart. */
function subjectName(event: BattleEvent, context: BattleLogContext): string {
  const bare = bareName(event, context), other = onFoe(event) ? context.initialPlayer : context.initialEnemy;
  return 'side' in event && bare === other.name ? `${sideLabel(event)}${bare}` : bare;
}

/** A damage line: `shown` damage in all, 致命一击 when any of it was critical, and the HP left after `event`, the last of it. */
function damageText(event: EventOf<'damage'>, { shown, critical }: Pick<DamageTally, 'shown' | 'critical'>, context: BattleLogContext): string {
  const cause = event.status ? `因${conditionName(event.status)}` : '', end = hidesHp(event, context) ? '' : '。';
  return `${subjectName(event, context)}${cause}受到 ${shown} 点伤害${critical ? '，致命一击！' : '。'}${remaining(event, context, '')}${end}`;
}

/** The one line of a tally (`damageTallies`): a move's hits and riders on one creature together. */
const tallyText = (tally: DamageTally, context: BattleLogContext) => damageText(tally.events.at(-1)!, tally, context);

/**
 * The one line of a move's blocks on one creature (`damageBlocks`), on the one that carries it: 抵挡了这次伤害 when nothing of
 * the move got through to it, 抵挡了部分伤害 when some did, so that it agrees with the move's damage line.
 */
const blockText = (event: Block, { lined, partial }: BlockShare, context: BattleLogContext) =>
  lined ? `${subjectName(event, context)}抵挡了${partial ? '部分' : '这次'}伤害。` : '';

/**
 * A step's line, the same in the dialogue and the log. A damage event's is its tally's (`tallyText`), on the tally's last event:
 * the line names the total and the HP left after the last hurt, so it comes with the number's and the HP bar's last change, and
 * a line between the hits (a rider's condition, 致命一击破防, a block) reads before it, as the dialogue shows it while the number
 * counts up. A move's blocks on one creature say theirs once (`blockText`).
 */
export function shownStepText(step: readonly BattleEvent[], tallies: ReadonlyMap<BattleEvent, TallyShare>,
  blocks: ReadonlyMap<BattleEvent, BlockShare>, context: BattleLogContext): string {
  const [event] = step, share = tallies.get(event), block = blocks.get(event);
  if (share) return share.index === share.tally.events.length - 1 ? tallyText(share.tally, context) : '';
  return block ? blockText(event as Block, block, context) : battleStepText(step, context);
}

/** Format one event for the centered dialogue; pass current displayed creature names. */
export function battleEventText(event: BattleEvent, context: BattleLogContext): string {
  const bare = bareName(event, context), name = subjectName(event, context);
  const skill = (id: number) => moveSkill(context.data, id)?.name.zh || '技能';
  switch (event.type) {
    case 'turn_start': return `第 ${event.turn} 回合`;
    case 'move_used': return `${name}使用了${skill(event.skill)}。`;
    case 'damage': return damageText(event, { shown: displayedDamage(event), critical: event.crit }, context);
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
    case 'wild_fled': return `${name}逃跑了！`;
    case 'boss_trait': return event.trait === 'barrier_broken' ? `${name}的屏障被打破了，攻击恢复有效。` : '';
    case 'battle_end': return battleEndText(event, context);
    case 'say': return event.text.zh;
    default: return '';
  }
}

/**
 * A battle's opening events as the log shows them. The Battle constructor installs the encounter rules between `battle_start`
 * and the first switch-in; the conditions they attach are encounter mechanics, so they get no line: a Boss's rules, and an NPC
 * trainer's passives (嗜血之力, 邪气凛然), shown on the facility roster. A rule's real effect keeps its line: a status, or a stage
 * change such as 厄尔塞拉 周二's evasion.
 */
export function openingEvents(events: BattleEvent[]): BattleEvent[] {
  const fielded = events.findIndex(event => event.type === 'switch_in');
  return events.filter((event, index) => index >= fielded || (event.type !== 'condition_added' && event.type !== 'condition_refreshed'));
}

/**
 * The steps a battle shows, one line and one frame each: every event alone, except that consecutive stage changes of one monster
 * are one step. The engine emits a cause's changes one stat at a time with nothing between them (光芒附体's five `stat_stage`
 * events right after its `move_used`) and names no cause, so any other event, or a stat changing a second time, starts a new
 * step. Changes to the other side in the same run (袭天舞's lowering of the foe, a 同步 mirror) gather in a step of their own.
 */
export function battleSteps(events: readonly BattleEvent[]): BattleEvent[][] {
  const steps: BattleEvent[][] = [];
  const gathering = new Map<0 | 1, StageEvent[]>();
  for (const event of events) {
    if (!gathers(event)) {
      gathering.clear();
      steps.push([event]);
      continue;
    }
    const step = gathering.get(event.side);
    if (step && !step.some(other => other.stat === event.stat)) step.push(event);
    else {
      const opened = [event];
      gathering.set(event.side, opened);
      steps.push(opened);
    }
  }
  return steps;
}

/** A step's line (`battleSteps`): its event's, or one monster's stage changes together. */
function battleStepText(step: readonly BattleEvent[], context: BattleLogContext): string {
  const [event] = step;
  return step.length > 1 && step.every(gathers) ? stagesText(step, subjectName(event, context)) : battleEventText(event, context);
}

/**
 * Events that open a new log entry; a switch_in continues the switch_out of its side just before it (one switch). `turn_end`
 * opens none: the turn end's lines before any tick (a condition running out, a Boss's drain) join the last move's entry, so they
 * do not push the turn's first move out of the recent log (`recentBattleLog`, the last two entries).
 */
const GROUP_STARTS: ReadonlySet<BattleEvent['type']> =
  new Set(['turn_start', 'move_used', 'item_used', 'capture_attempt', 'switch_out', 'switch_in', 'condition_tick', 'flee', 'wild_fled', 'battle_end']);
const continuesSwitch = (event: BattleEvent, previous: BattleEvent | undefined) =>
  event.type === 'switch_in' && previous?.type === 'switch_out' && previous.side === event.side;

/** Lines shown together, in one log entry or one frame's dialogue, follow each other with this gap. */
export const LINE_SEPARATOR = '　';

/**
 * Each entry is one action and its consequences, or one residual/end-of-turn group. A move's damage to one creature is one line
 * (`damageTallies`), where its last hit came, with the total and the HP left after it; its blocks on one creature are one line
 * too (`damageBlocks`). The lines follow each other as the dialogue showed them (`shownStepText`).
 */
export function groupedBattleLog(events: BattleEvent[], context: BattleLogContext): string[] {
  const shown = { ...context, initialPlayer: { ...context.initialPlayer }, initialEnemy: { ...context.initialEnemy } };
  const tallies = damageTallies(events), blocks = damageBlocks(events);
  const groups: string[] = [];
  let current: string[] = [];
  const flush = () => { if (current.length) groups.push(current.join(LINE_SEPARATOR)); current = []; };
  let previous: BattleEvent | undefined;
  // A step of several events is one monster's stage changes, so its first event stands for it here.
  for (const step of battleSteps(events)) {
    const [event] = step;
    if (GROUP_STARTS.has(event.type) && !continuesSwitch(event, previous)) flush();
    previous = event;
    const mon = onFoe(event) ? shown.initialEnemy : shown.initialPlayer;
    if (event.type === 'switch_in' || event.type === 'transform') {
      mon.name = speciesName(event, context) || mon.name;
      mon.hp = event.hp;
      mon.maxHp = event.maxHp;
    }
    const text = shownStepText(step, tallies, blocks, shown);
    if (text) current.push(text);
    // Named bench recovery must not overwrite the active creature's context.
    if ((event.type === 'damage' || event.type === 'heal' || event.type === 'revive') && (!event.name || event.name === mon.name)) mon.hp = event.hp;
    if (event.type === 'turn_start' || event.type === 'battle_end') flush();
  }
  flush();
  return groups;
}
