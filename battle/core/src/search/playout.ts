// Simulated continuations on world clones: seeds, the cheap rollout policy and
// the playout itself (design note 5.2-5.3).
import type { Action, Skill } from '../types.ts';
import type { Battle } from '../engine/battle.ts';
import type { Mon, Side } from '../engine/state.ts';
import { Rng } from '../rng.ts';
import { RANDOM_MIN } from '../constants.ts';
import { cloneBattle } from '../clone.ts';
import type { World } from './world.ts';
import { evaluate, hitChance, race, type Weights } from './evaluate.ts';

function hash(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}
/** Common random numbers: every candidate faces the same draws per response and sample. Never the live RNG. */
export function seed(b: Battle, tag: string, response: number, sample: number): Rng {
  return new Rng(hash(`${b.rng.s.join(',')}|${b.turn}|${tag}|${response}|${sample}`));
}

export function moveActions(b: Battle, i: 0 | 1): Extract<Action, { kind: 'move' }>[] {
  return b.legalActions(i).filter((a): a is Extract<Action, { kind: 'move' }> => a.kind === 'move');
}
function actsFirst(b: Battle, user: Mon, target: Mon, skill: Skill): boolean {
  const own = b.priority(user, skill);
  const theirs = Math.max(0, ...target.skills.filter(id => target.pp[id] > 0).map(id => b.priority(target, b.skill(id, target))));
  return own > theirs || own === theirs && b.effStat(user, 'spe') > b.effStat(target, 'spe');
}

/** Greedy policy for both sides inside rollouts: a sure first-strike knockout, else the best expected damage. */
function rolloutAction(b: Battle, i: 0 | 1): Action {
  const user = b.active(i), target = b.active((1 - i) as 0 | 1), moves = moveActions(b, i);
  const forced = user.vol.forcedSkill;
  if (forced !== undefined && moves.some(a => a.skill === forced)) return { kind: 'move', skill: forced };
  if (!moves.length) return b.legalActions(i)[0];
  let best = moves[0], score = -1;
  for (const action of moves) {
    const skill = b.skill(action.skill, user);
    const mean = b.estimateDamage(user, target, skill);
    // Damage never falls as the roll rises, so only a mean-roll knockout can be one at the minimum roll.
    const sure = mean >= target.hp && hitChance(user, target, skill) >= 1 && b.probeDamage(user, target, skill, { roll: RANDOM_MIN, crit: false }) >= target.hp;
    if (sure && actsFirst(b, user, target, skill)) return action;
    const value = Math.min(target.hp, mean * hitChance(user, target, skill));
    if (value > score) { best = action; score = value; }
  }
  return best;
}

/** Faint replacement inside a world: a forced successor, else the best one-on-one race. */
export function rolloutReplacement(b: Battle, side: Side): Action | undefined {
  const forced = b.planning?.forcedReplacement?.[side.index];
  if (forced !== undefined) {
    delete b.planning!.forcedReplacement![side.index];
    if (!side.team[forced]?.fainted && forced !== side.active) return { kind: 'switch', slot: forced };
  }
  const foe = b.active((1 - side.index) as 0 | 1);
  const bench = side.team.filter(m => !m.fainted && m.slot !== side.active);
  if (!bench.length) return undefined;
  if (foe.fainted) return { kind: 'switch', slot: bench[0].slot };
  const ranked = bench.map(m => ({ slot: m.slot, value: race(b, m, foe) })).sort((a, z) => z.value - a.value || a.slot - z.slot);
  return { kind: 'switch', slot: ranked[0].slot };
}

/** A self-KO by the actor's own move: its own active fell to damage it caused. */
function selfKnockout(c: Battle, me: 0 | 1, slot: number): boolean {
  const fell = c.log.some(e => e.type === 'faint' && e.side === me && e.slot === slot);
  return fell && c.log.some(e => e.type === 'damage' && e.side === me && e.slot === slot && e.sourceSide !== (1 - me) && e.kind === 'true');
}

export interface Playout {
  rng: Rng;
  /** The AI's opening action; the rollout policy when omitted. */
  action?: Action;
  /** The opponent's opening move; the rollout policy when it is not legal. */
  response: number;
  /** Rollout turns after the opening turn. */
  turns: number;
  weights: Weights;
  /** Forced replacement for the AI's next faint (a sacrifice's successor). */
  successor?: number;
  /** Changes to the fresh clone before the opening turn. */
  prepare?: (c: Battle) => void;
}

/**
 * Resolves the opening turn on a clone of the world, rolls out until the horizon
 * or until the opponent's active monster faints (its replacement is unknown), and
 * scores the result for the AI.
 */
export function playout(w: World, p: Playout): { value: number; sacrifice: boolean } {
  const c = cloneBattle(w.world);
  c.rng = p.rng;
  if (p.successor !== undefined) c.planning = { forcedReplacement: { [w.me]: p.successor } };
  p.prepare?.(c);
  const slot = c.sides[w.me].active, foeSlot = c.sides[w.foe].active;
  c.submit(w.me, p.action ?? rolloutAction(c, w.me));
  c.submit(w.foe, moveActions(c, w.foe).some(a => a.skill === p.response) ? { kind: 'move', skill: p.response } : rolloutAction(c, w.foe));
  c.resolveTurn();
  const sacrifice = selfKnockout(c, w.me, slot);
  for (let t = 0; t < p.turns && !c.result && !c.sides[w.foe].team[foeSlot].fainted && c.phase === 'choose'; t++) {
    c.submit(w.me, rolloutAction(c, w.me));
    c.submit(w.foe, rolloutAction(c, w.foe));
    c.resolveTurn();
  }
  return { value: evaluate(c, w.me, p.weights), sacrifice };
}
