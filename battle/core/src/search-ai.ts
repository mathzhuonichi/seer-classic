// Engine-simulated trainer planner; see design/notes/trainer-search-ai-v58.md.
// Every candidate is scored by resolving real turns on isolated clones of a world
// in which the opponent is its public model (search/world.ts). The live battle is
// never changed, except for one RNG draw when the chosen strategy is mixed.
import type { Action, AiSpec } from './types.ts';
import type { Battle, Side } from './battle.ts';
import type { ModeledFoe } from './observe.ts';
import { buildWorld } from './search/world.ts';
import { styleWeights, worth } from './search/evaluate.ts';
import { moveActions, playout, seed } from './search/playout.ts';
import { drawAction, solveZeroSum } from './search/equilibrium.ts';

export { rolloutReplacement } from './search/playout.ts';

const SAMPLES = 8, HORIZON = 2, BUDGET = 6000, MIN_SAMPLES = 2;
/** Sacrifices roll out further so the successor spends its gift, with at least this many samples. */
const SACRIFICE_EXTRA = 2, MIN_SACRIFICE_SAMPLES = 4;
/** HP medicine is barred after this many consecutive turns of it (design note 5.1). */
const HEAL_STREAK_LIMIT = 5;
/** Turns the active monster must have been in before a voluntary switch (V47 gate; design note 13). */
const SWITCH_GAP = 2;
/** Self-KO scripts that leave a gift for the team; a pending gift is not laid again. */
const GIFT_SCRIPTS = new Set(['seer_eff_59', 'seer_eff_71']);

export interface SearchDecision {
  turn: number; side: 0 | 1;
  opponent: ModeledFoe[]; modeledMoves: number[];
  actions: Action[]; responses: number[]; matrix: number[][];
  strategy: number[]; value: number; chosen: Action; samples: number; simulatedTurns: number;
  sacrifices: { action: number; successors: number[] }[];
}
const decisions = new WeakMap<Battle, Partial<Record<0 | 1, SearchDecision>>>();
/** The explanation record of a side's last search decision (design note 5.5). */
export function lastSearchDecision(b: Battle, side: Side): SearchDecision | undefined { return decisions.get(b)?.[side.index]; }

// ---------- candidates ----------

const healsHp = (b: Battle, item: string) => !!b.data.items.get(item)?.battle_effects?.some(op => op.op === 'heal');

/** Turns in a row, ending with the last resolved turn, in which this side used HP medicine. */
function healStreak(b: Battle, me: 0 | 1): number {
  const turns = new Set<number>();
  let turn = 0;
  for (const e of b.log) {
    if (e.type === 'turn_start') turn = e.turn;
    if (e.type === 'item_used' && e.side === me && healsHp(b, e.item)) turns.add(turn);
  }
  let streak = 0;
  for (let t = b.turn; turns.has(t); t--) streak++;
  return streak;
}

function pendingGift(b: Battle, me: 0 | 1): boolean {
  return b.sides[me].team.some(m => !m.fainted && m.conditions.some(c => c.turns > 0 && GIFT_SCRIPTS.has(c.id) && (c.data?.pool?.left ?? 1) > 0));
}

function candidates(b: Battle, me: 0 | 1): Action[] {
  const self = b.active(me), healBlocked = healStreak(b, me) >= HEAL_STREAK_LIMIT, gift = pendingGift(b, me);
  const out = b.legalActions(me).filter(a => {
    switch (a.kind) {
      case 'switch': return self.turnsActive >= SWITCH_GAP;
      case 'item': return !(healBlocked && healsHp(b, a.item));
      case 'move': return !(gift && b.skill(a.skill, self).effects?.some(op => op.op === 'script' && GIFT_SCRIPTS.has(op.id)));
      default: return false;
    }
  });
  return out.length ? out : moveActions(b, me);
}

// ---------- decisions ----------

export function searchAction(b: Battle, side: Side, ai: AiSpec): Action {
  const me = side.index, w = buildWorld(b, me), weights = styleWeights(ai);
  const actions = candidates(b, me);
  const responses = moveActions(w.world, w.foe).map(a => a.skill);
  if (actions.length === 1 || !responses.length) return actions[0];
  const reserves = side.team.filter(m => !m.fainted && m.slot !== side.active).map(m => m.slot);
  const turns = 1 + HORIZON;
  const k = Math.max(MIN_SAMPLES, Math.min(SAMPLES, Math.floor(BUDGET / (actions.length * responses.length * turns))));
  const cell = (action: Action, response: number, n: number, extra = 0, successor?: number) =>
    playout(w, { action, response, rng: seed(b, 'cell', response, n), turns: HORIZON + extra, weights, successor });
  let simulated = 0;
  const sacrifices: SearchDecision['sacrifices'] = [];
  const matrix = actions.map((action, row) => {
    // The first sample of every response also detects whether this action is a sacrifice.
    const first = responses.map(r => cell(action, r, 0));
    simulated += responses.length * turns;
    if (first.some(c => c.sacrifice) && reserves.length) {
      // A self-KO hands its successor a free entry and any gift: expand once per reserve.
      const ks = Math.max(MIN_SACRIFICE_SAMPLES, Math.min(k, Math.floor(BUDGET / (reserves.length * responses.length * (turns + SACRIFICE_EXTRA) * actions.length))));
      const successors: number[] = [];
      const cells = responses.map(r => {
        let top = -Infinity, pick = reserves[0];
        for (const s of reserves) {
          let total = 0;
          for (let n = 0; n < ks; n++) total += cell(action, r, n, SACRIFICE_EXTRA, s).value;
          simulated += ks * (turns + SACRIFICE_EXTRA);
          if (total / ks > top) { top = total / ks; pick = s; }
        }
        successors.push(pick);
        return top;
      });
      sacrifices.push({ action: row, successors });
      return cells;
    }
    return responses.map((r, j) => {
      let total = first[j].value;
      for (let n = 1; n < k; n++) total += cell(action, r, n).value;
      simulated += (k - 1) * turns;
      return total / k;
    });
  });
  const { strategy, value } = solveZeroSum(matrix);
  const { mix, index } = drawAction(strategy, b.rng);
  const chosen = actions[index];
  const planned = sacrifices.find(p => p.action === index);
  // A chosen sacrifice keeps the successor its expansion found best against each response.
  if (planned) b.sacrificePlans = { ...b.sacrificePlans, [me]: { turn: b.turn + 1, slot: side.active, responses, successors: planned.successors } };
  decisions.set(b, { ...decisions.get(b), [me]: { turn: b.turn + 1, side: me, opponent: w.opponent, modeledMoves: w.modeledMoves, actions, responses, matrix, strategy: mix, value, chosen, samples: k, simulatedTurns: simulated, sacrifices } });
  return chosen;
}

/** After this side's planned sacrifice, the successor planned against the opponent's public move this turn. */
function plannedSuccessor(b: Battle, side: Side, bench: number[]): number | undefined {
  const plan = b.sacrificePlans?.[side.index];
  if (!plan) return undefined;
  delete b.sacrificePlans![side.index];
  if (plan.turn !== b.turn || plan.slot !== side.active) return undefined;
  let turn = 0, used: number | undefined;
  for (const e of b.log) {
    if (e.type === 'turn_start') turn = e.turn;
    if (turn === b.turn && e.type === 'move_used' && e.side !== side.index) used = e.skill;
  }
  const j = used === undefined ? -1 : plan.responses.indexOf(used);
  const counts = new Map<number, number>();
  for (const s of plan.successors) counts.set(s, (counts.get(s) ?? 0) + 1);
  const ranked = j >= 0 ? [plan.successors[j]] : [...counts].sort((a, z) => z[1] - a[1] || a[0] - z[0]).map(([s]) => s);
  return ranked.find(s => bench.includes(s));
}

/** A faint replacement is free: choose the successor with the best guaranteed continuation. */
export function searchReplacement(b: Battle, side: Side): Action | undefined {
  const me = side.index, bench = side.team.filter(m => !m.fainted && m.slot !== side.active);
  if (!bench.length) return undefined;
  if (bench.length === 1) return { kind: 'switch', slot: bench[0].slot };
  const planned = plannedSuccessor(b, side, bench.map(m => m.slot));
  if (planned !== undefined) return { kind: 'switch', slot: planned };
  if (b.active((1 - me) as 0 | 1).fainted) return { kind: 'switch', slot: [...bench].sort((a, z) => worth(z) - worth(a) || a.slot - z.slot)[0].slot };
  const w = buildWorld(b, me), weights = styleWeights(b.active(me).ai ?? side.ai), foe = w.world.active(w.foe);
  const responses = foe.skills.filter(id => foe.pp[id] > 0);
  const rows = bench.map(member => {
    const values = (responses.length ? responses : [-1]).map(r => {
      let total = 0;
      for (let n = 0; n < SAMPLES; n++) total += playout(w, { response: r, rng: seed(b, `replace:${member.slot}`, r, n), turns: HORIZON, weights, prepare: c => {
        c.switchIn(c.sides[me], member.slot);
        c.sides[me].needsReplacement = false;
        c.phase = 'choose';
      } }).value;
      return total / SAMPLES;
    });
    return { slot: member.slot, value: Math.min(...values) };
  });
  return { kind: 'switch', slot: rows.sort((a, z) => z.value - a.value || a.slot - z.slot)[0].slot };
}
