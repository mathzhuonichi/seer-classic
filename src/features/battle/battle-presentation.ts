// Pure battle presentation: replaying engine events into immutable display frames.
import type { BattleEvent, DataSet } from '../../../battle/core/src/index.ts';
import { battleStepText, battleSteps, tallyText, type BattleLogContext, type EventOf } from './battle-log.ts';
import { damageTallies, type DamageTally, type TallyShare } from './battle-damage-tally.ts';
import type { BattleMonsterView, BattlePresentationFrame } from '../../shared/views.ts';
import { moveSkill, portrait, statusLabel, typeLabel } from '../../shared/view-common.ts';
import { typeMatchup } from './type-matchup.ts';

export interface BattlePresentationState { player: BattleMonsterView; enemy: BattleMonsterView; party: BattleMonsterView[]; enemyParty: BattleMonsterView[] }

/** Trainer battles show the opposing HP bar but never its HP: keep only a whole-percent ratio that stays above 0 while alive and below 100 once damaged. */
export function concealHp(mon: BattleMonsterView): BattleMonsterView {
  const ratio = mon.hp <= 0 ? 0 : Math.min(mon.hp < mon.maxHp ? 99 : 100, Math.max(1, Math.round(mon.hp / mon.maxHp * 100)));
  return { ...mon, hp: ratio, maxHp: 100, hpHidden: true };
}

/** The events that change a combatant on screen. */
const PRESENTATION_EVENTS = [
  'damage', 'heal', 'revive', 'faint', 'switch_in', 'transform', 'max_hp_changed',
  'status_applied', 'condition_removed', 'stat_stage', 'stages_cleared', 'switch_out',
] as const;
type PresentationEvent = EventOf<(typeof PRESENTATION_EVENTS)[number]>;
const presents = (event: BattleEvent): event is PresentationEvent => (PRESENTATION_EVENTS as readonly string[]).includes(event.type);
const zeroStages = (stages: Record<string, number>) => Object.fromEntries(Object.keys(stages).map(stat => [stat, 0]));
const conditionLabel = (id: string) => statusLabel(id) ?? id;

/** Replay team changes using event data, never the already-resolved team HP. */
export function advanceBattlePresentation(state: BattlePresentationState, event: BattleEvent): BattlePresentationState {
  if (!presents(event)) return state;
  const side = event.side === 1 ? 1 : 0;
  const previousTeam = side === 1 ? state.enemyParty : state.party;
  const active = side === 1 ? state.enemy : state.player;
  const index = 'slot' in event
    ? previousTeam.findIndex(mon => mon.slot === event.slot)
    : event.type !== 'transform' && 'name' in event && event.name && event.name !== active.name
      ? previousTeam.findIndex(mon => mon.name === event.name)
      : previousTeam.findIndex(mon => mon.uid === active.uid);
  if (index < 0) return state;
  // Each historical frame is immutable. Copy only the member and fields this event changes.
  const member = { ...previousTeam[index] }, team = [...previousTeam];
  team[index] = member;
  const next = { ...state, ...(side === 1 ? { enemyParty: team } : { party: team }) };
  applyEvent(member, event);
  if (event.type === 'switch_in' || event.type === 'transform') {
    if (side === 1) next.enemy = member; else next.player = member;
  }
  // Bench recovery must not replace the currently displayed combatant.
  if (member.uid === next.player.uid && side === 0) next.player = member;
  if (member.uid === next.enemy.uid && side === 1) next.enemy = member;
  return next;
}

const setHp = (member: BattleMonsterView, event: { hp: number; maxHp: number }) => { member.hp = event.hp; member.maxHp = event.maxHp; };

function applyEvent(member: BattleMonsterView, event: PresentationEvent) {
  switch (event.type) {
    case 'damage': case 'heal': setHp(member, event); break;
    case 'revive':
      setHp(member, event); member.fainted = false; member.statuses = [];
      if (event.reason === 'lives') member.stages = zeroStages(member.stages);
      break;
    case 'faint': member.hp = 0; member.fainted = true; break;
    case 'switch_in': case 'transform': {
      setHp(member, event);
      const previousSpecies = member.species;
      member.species = event.species;
      if (event.type === 'transform' || member.species !== previousSpecies) member.appearanceSpecies = member.species;
      member.name = event.name || member.name;
      if (event.type === 'switch_in') member.level = event.level;
      member.portrait = portrait(member.appearanceSpecies ?? member.species);
      member.types = event.types.map(typeLabel);
      member.typeIds = [...event.types];
      member.fainted = member.hp <= 0;
      break;
    }
    case 'max_hp_changed': setHp(member, event); member.hp = Math.min(member.hp, member.maxHp); break;
    case 'status_applied': member.statuses = [...new Set([...member.statuses, conditionLabel(event.status)])]; break;
    case 'condition_removed': member.statuses = member.statuses.filter(name => name !== conditionLabel(event.condition)); break;
    case 'stat_stage': member.stages = { ...member.stages, [event.stat]: event.stage }; break;
    case 'stages_cleared':
      member.stages = { ...member.stages };
      for (const stat of Object.keys(member.stages)) {
        const value = member.stages[stat];
        if (event.which === 'all' || event.which === 'up' && value > 0 || event.which === 'down' && value < 0) member.stages[stat] = 0;
      }
      break;
    case 'switch_out': member.stages = zeroStages(member.stages); member.statuses = []; break;
  }
}

export interface FrameOptions {
  data: DataSet;
  /** Trainer battles conceal the opposing HP. */
  hideEnemyHp: boolean;
  /** Encounters word their outcome as a challenge's (`BattleLogContext.challenge`). */
  challenge: boolean;
  /** Receives `side:slot` keys of transformed combatants. */
  transformedSlots: Set<string>;
  nextFrameId(): number;
}

/**
 * Presentation follows the engine's event order; it does not resolve combat a second time. Each step (`battleSteps`) is one
 * frame, so one monster's stage changes at once change all its chips together. A move's hits and riders on one creature keep a
 * frame each, with its hurt and its HP, and count up one number (`damageTallies`); the last of them carries the line of the total.
 */
export function eventFrames(events: readonly BattleEvent[], before: BattlePresentationState, options: FrameOptions): BattlePresentationFrame[] {
  const { data, hideEnemyHp, challenge } = options;
  const foe = (mon: BattleMonsterView) => hideEnemyHp ? concealHp(mon) : mon;
  const frames: BattlePresentationFrame[] = [], tallies = damageTallies(events), numberIds = new Map<DamageTally, number>();
  let shown = before;
  for (const step of battleSteps(events)) {
    const [e] = step;
    const side: 0 | 1 = e.type === 'capture_attempt' || 'side' in e && e.side === 1 ? 1 : 0;
    const activeBefore = side === 1 ? shown.enemy : shown.player;
    if (e.type === 'transform') options.transformedSlots.add(`${side}:${activeBefore.slot}`);
    for (const event of step) shown = advanceBattlePresentation(shown, event);
    const share = e.type === 'damage' ? tallies.get(e) : undefined;
    const text = stepText(step, share, { data, initialPlayer: shown.player, initialEnemy: shown.enemy, hideEnemyHp, challenge });
    const motion = frameMotion(e, side, activeBefore, data);
    if (!text && motion.kind === 'message') continue;
    const { player, party } = shown, enemy = foe(shown.enemy), capture = e.type === 'capture_attempt' ? e : undefined, id = options.nextFrameId();
    const numberId = share && numberIds.get(share.tally);
    if (share && numberId === undefined) numberIds.set(share.tally, id);
    frames.push({
      id, side, kind: motion.kind, text, numberId,
      amount: share ? share.shown : e.type === 'heal' ? e.amount : undefined, critical: e.type === 'damage' && e.crit,
      captureSuccess: capture?.success, capsuleName: capture && data.items.get(capture.item)?.name?.zh,
      skillId: motion.skillId, targetSide: motion.targetSide,
      playerHp: player.hp, enemyHp: enemy.hp, player, enemy, party, enemyParty: shown.enemyParty.map(foe), matchup: typeMatchup(data.types, player, enemy),
    });
  }
  return frames;
}

/** A step's line; a damage event's is its tally's, on the tally's last frame, so earlier hits keep the move's line on screen. */
const stepText = (step: readonly BattleEvent[], share: TallyShare | undefined, context: BattleLogContext) => !share ? battleStepText(step, context)
  : share.index === share.tally.events.length - 1 ? tallyText(share.tally, context) : '';

interface FrameMotion { kind: BattlePresentationFrame['kind']; skillId?: number; targetSide?: 0 | 1 }

function frameMotion(e: BattleEvent, side: 0 | 1, activeBefore: BattleMonsterView, data: DataSet): FrameMotion {
  switch (e.type) {
    case 'switch_in': case 'transform': return { kind: 'switch' };
    case 'capture_attempt': return { kind: 'capture' };
    case 'move_used': {
      const skill = moveSkill(data, e.skill)!;
      const kind = skill.category === 'physical' ? 'physical' : skill.category === 'special' ? 'special' : 'status';
      return { kind, skillId: Number(skill.id), targetSide: skill.target === 'self' ? side : side === 0 ? 1 : 0 };
    }
    case 'damage': return { kind: e.slot === activeBefore.slot ? 'hit' : 'message' };
    case 'heal': case 'revive': return { kind: e.slot === activeBefore.slot ? 'heal' : 'message' };
    default: return { kind: 'message' };
  }
}
