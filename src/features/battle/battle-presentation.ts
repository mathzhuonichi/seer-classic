// Pure battle presentation: replaying engine events into immutable display frames.
import type { BattleEvent, DataSet, RawData } from '../../../battle/core/src/index.ts';
import { battleEventText, displayedDamage } from './battle-log.ts';
import type { BattleMonsterView, BattlePresentationFrame } from '../../shared/views.ts';
import { portrait, statusLabel, typeLabel } from '../../shared/view-common.ts';

export interface BattlePresentationState { player: BattleMonsterView; enemy: BattleMonsterView; party: BattleMonsterView[]; enemyParty: BattleMonsterView[] }
type SpeciesSource = RawData['species'] | ReadonlyMap<number, NonNullable<RawData['species']>[number]>;

/** Trainer battles show the opposing HP bar but never its HP: keep only a whole-percent ratio that stays above 0 while alive and below 100 once damaged. */
export function concealHp(mon: BattleMonsterView): BattleMonsterView {
  const ratio = mon.hp <= 0 ? 0 : Math.min(mon.hp < mon.maxHp ? 99 : 100, Math.max(1, Math.round(mon.hp / mon.maxHp * 100)));
  return { ...mon, hp: ratio, maxHp: 100, hpHidden: true };
}

const presentationEvents = new Set([
  'damage', 'heal', 'revive', 'faint', 'switch_in', 'transform', 'max_hp_changed',
  'status_applied', 'condition_removed', 'stat_stage', 'stages_cleared', 'switch_out',
]);
const zeroStages = (stages: Record<string, number>) => Object.fromEntries(Object.keys(stages).map(stat => [stat, 0]));
const conditionLabel = (id: string) => statusLabel(id) ?? id;

/** Replay team changes using event data, never the already-resolved team HP. */
export function advanceBattlePresentation(state: BattlePresentationState, event: BattleEvent, species: SpeciesSource = []): BattlePresentationState {
  if (!presentationEvents.has(event.type)) return state;
  const side = event.side === 1 ? 1 : 0;
  const previousTeam = side === 1 ? state.enemyParty : state.party;
  const active = side === 1 ? state.enemy : state.player;
  const index = typeof event.slot === 'number'
    ? previousTeam.findIndex(mon => mon.slot === event.slot)
    : event.type !== 'transform' && event.name && event.name !== active.name
      ? previousTeam.findIndex(mon => mon.name === event.name)
      : previousTeam.findIndex(mon => mon.uid === active.uid);
  if (index < 0) return state;
  // Each historical frame is immutable. Copy only the member and fields this event changes.
  const member = { ...previousTeam[index] }, team = [...previousTeam];
  team[index] = member;
  const next = { ...state, ...(side === 1 ? { enemyParty: team } : { party: team }) };
  applyEvent(member, event, species);
  if (event.type === 'switch_in' || event.type === 'transform') {
    if (side === 1) next.enemy = member; else next.player = member;
  }
  // Bench recovery must not replace the currently displayed combatant.
  if (member.uid === next.player.uid && side === 0) next.player = member;
  if (member.uid === next.enemy.uid && side === 1) next.enemy = member;
  return next;
}

function applyEvent(member: BattleMonsterView, event: BattleEvent, species: SpeciesSource) {
  const updateHp = () => {
    if (typeof event.hp === 'number') member.hp = event.hp;
    if (typeof event.maxHp === 'number') member.maxHp = event.maxHp;
  };
  switch (event.type) {
    case 'damage': case 'heal': updateHp(); break;
    case 'revive':
      updateHp(); member.fainted = false; member.statuses = [];
      if (event.reason === 'lives') member.stages = zeroStages(member.stages);
      break;
    case 'faint': member.hp = 0; member.fainted = true; break;
    case 'switch_in': case 'transform': {
      updateHp();
      const previousSpecies = member.species;
      if (event.species !== undefined) member.species = event.species;
      if (event.type === 'transform' || member.species !== previousSpecies) member.appearanceSpecies = member.species;
      if (event.name) member.name = event.name;
      if (event.level !== undefined) member.level = event.level;
      member.portrait = portrait(member.appearanceSpecies ?? member.species);
      const definition = Array.isArray(species) ? species.find(mon => mon.id === member.species) : species?.get(member.species);
      if (event.types) member.types = event.types.map((type: string) => typeLabel(type));
      else if (definition) member.types = definition.types.map(type => typeLabel(type));
      member.fainted = member.hp <= 0;
      break;
    }
    case 'max_hp_changed': updateHp(); member.hp = Math.min(member.hp, member.maxHp); break;
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
  /** Receives `side:slot` keys of transformed combatants. */
  transformedSlots: Set<string>;
  nextFrameId(): number;
}

/** Presentation follows the engine's event order; it does not resolve combat a second time. */
export function eventFrames(events: readonly BattleEvent[], before: BattlePresentationState, options: FrameOptions): BattlePresentationFrame[] {
  const { data, hideEnemyHp } = options;
  const foe = (mon: BattleMonsterView) => hideEnemyHp ? concealHp(mon) : mon;
  const frames: BattlePresentationFrame[] = [];
  let shown = before;
  for (const e of events) {
    const side: 0 | 1 = e.type === 'capture_attempt' || e.side === 1 ? 1 : 0;
    const activeBefore = side === 1 ? shown.enemy : shown.player;
    if (e.type === 'transform') {
      const slot = e.slot ?? (e.side === 1 ? shown.enemy.slot : shown.player.slot) ?? 0;
      options.transformedSlots.add(`${e.side === 1 ? 1 : 0}:${slot}`);
    }
    shown = advanceBattlePresentation(shown, e, data.species);
    const text = battleEventText(e, { data, initialPlayer: shown.player, initialEnemy: shown.enemy, hideEnemyHp });
    const motion = frameMotion(e, side, activeBefore, data);
    if (!text && motion.kind === 'message') continue;
    const { player, party } = shown, enemy = foe(shown.enemy);
    frames.push({
      id: options.nextFrameId(), side, kind: motion.kind, text, amount: e.type === 'damage' ? displayedDamage(e) : e.amount, critical: !!e.crit,
      captureSuccess: e.type === 'capture_attempt' ? !!e.success : undefined,
      capsuleName: e.type === 'capture_attempt' ? data.items.get(e.item)?.name?.zh : undefined,
      skillType: motion.skillType, skillId: motion.skillId, targetSide: motion.targetSide,
      playerHp: player.hp, enemyHp: enemy.hp, player, enemy, party, enemyParty: shown.enemyParty.map(foe),
    });
  }
  return frames;
}

interface FrameMotion { kind: BattlePresentationFrame['kind']; skillType?: string; skillId?: number; targetSide?: 0 | 1 }

function frameMotion(e: BattleEvent, side: 0 | 1, activeBefore: BattleMonsterView, data: DataSet): FrameMotion {
  const onActive = e.slot === undefined || e.slot === activeBefore.slot;
  switch (e.type) {
    case 'switch_in': case 'transform': return { kind: 'switch' };
    case 'capture_attempt': return { kind: 'capture' };
    case 'move_used': {
      const skill = data.skills.get(e.skill)!;
      const kind = skill.category === 'physical' ? 'physical' : skill.category === 'special' ? 'special' : 'status';
      return { kind, skillType: skill.type, skillId: Number(skill.id), targetSide: skill.target === 'self' ? side : side === 0 ? 1 : 0 };
    }
    case 'damage': return { kind: onActive ? 'hit' : 'message' };
    case 'heal': case 'revive': return { kind: onActive ? 'heal' : 'message' };
    default: return { kind: 'message' };
  }
}
