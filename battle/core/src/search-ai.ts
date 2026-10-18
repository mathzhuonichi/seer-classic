// Engine-simulated trainer planner; see design/notes/trainer-search-ai-v58.md.
// Every candidate is scored by resolving real turns on isolated clones. The live
// battle, its RNG and the opponent's hidden build are never touched or read.
import type { Action, AiSpec, MonsterInput, Skill } from './types.ts';
import type { Battle, Mon, Side } from './battle.ts';
import { Rng } from './rng.ts';
import { RANDOM_MAX, RANDOM_MIN, accuracyStageMultiplier } from './constants.ts';
import { cloneBattle } from './clone.ts';
import { observeOpponent, revealedOpponentSlots, type ModeledFoe } from './observe.ts';

const SAMPLES = 8, HORIZON = 2, SACRIFICE_EXTRA = 2, BUDGET = 6000, MIN_SAMPLES = 2, MIN_SACRIFICE_SAMPLES = 4;
const TRIM = 0.05, SOLVER_ITERATIONS = 4000, ALIVE = 0.35, RACE = 0.5, HEAL_STREAK_LIMIT = 5;
/** Turns the active monster must have been in before a voluntary switch; 0 leaves switching to the search alone. */
const SWITCH_GAP = 0;
const MEAN_ROLL = (RANDOM_MIN + RANDOM_MAX) / 2;

type Style = NonNullable<AiSpec['style']>;
interface Weights { ownHp: number; race: number; control: number }
const STYLE: Record<Style, Weights> = {
  balanced: { ownHp: 1, race: RACE, control: 0 },
  offense: { ownHp: .85, race: RACE * 1.3, control: 0 },
  control: { ownHp: 1, race: RACE, control: .15 },
  attrition: { ownHp: 1.2, race: RACE, control: 0 },
};

export interface SearchDecision {
  turn: number; side: 0 | 1;
  opponent: ModeledFoe[]; modeledMoves: number[];
  actions: Action[]; responses: number[]; matrix: number[][];
  strategy: number[]; value: number; chosen: Action; samples: number; simulatedTurns: number;
  sacrifices: { action: number; successors: number[] }[];
}
const decisions = new WeakMap<Battle, Partial<Record<0 | 1, SearchDecision>>>();
export function lastSearchDecision(b: Battle, side: Side): SearchDecision | undefined { return decisions.get(b)?.[side.index]; }

// ---------- planning world ----------

interface World { world: Battle; me: 0 | 1; foe: 0 | 1; opponent: ModeledFoe[]; modeledMoves: number[] }

/** Observed moves are certain; the mode's conventional set fills the rest. */
function modeledMoves(b: Battle, model: ModeledFoe): number[] {
  const out = model.observedMoves.filter(id => b.data.skills.has(id)).slice(0, 4);
  for (const id of b.conventionalMoves?.(model.speciesId) ?? []) if (out.length < 4 && !out.includes(id) && b.data.skills.has(id)) out.push(id);
  return out;
}

/** An explicitly uncertain typed attack, for a species with no modeled move at all. */
function fallbackSkills(w: Battle, model: ModeledFoe): number[] {
  const species = w.data.species.get(model.speciesId)!;
  const category = species.base.atk >= species.base.spa ? 'physical' : 'special';
  const skills = new Map(w.data.skills);
  const ids = model.types.map((type, k) => {
    const id = -9000 - k;
    skills.set(id, { id, name: { zh: '推测攻击' }, type, category, power: 80, accuracy: 100, pp: 99, priority: 0, effects: [] } as unknown as Skill);
    return id;
  });
  w.data = { ...w.data, skills };
  return ids;
}

function modelMon(b: Battle, w: Battle, model: ModeledFoe): Mon {
  let skills = modeledMoves(b, model);
  if (!skills.length) skills = fallbackSkills(w, model);
  const pp: Record<number, number> = {};
  for (const id of skills) {
    const skill = w.data.skills.get(id)!;
    pp[id] = Math.max(0, skill.pp - (model.moveUses[id] ?? 0) * Math.max(1, skill.pp_cost ?? 1));
  }
  const input: MonsterInput = { species: model.speciesId, level: model.level, stats: { ...model.stats, hp: Math.max(1, Math.round(model.maxHp)) }, skills, pp };
  const mon: Mon = (w as any).buildMon(model.side, model.slot, input, 0);
  const visible = new Set(model.conditions.map(c => c.id));
  // The world already holds independent copies of the visible conditions.
  const copied = w.sides[model.side].team[model.slot].conditions.filter(c => visible.has(c.id));
  const real = w.sides[model.side].team[model.slot];
  Object.assign(mon, {
    types: [...model.types], hp: Math.max(0, Math.min(mon.maxHp, Math.round(model.hp))), stages: { ...model.stages }, conditions: copied,
    turnsActive: real.turnsActive, lastActedTurn: real.lastActedTurn, facedBy: real.facedBy,
    usedSkills: new Set(model.observedMoves), skillUses: { ...model.moveUses },
  });
  mon.fainted = mon.hp <= 0;
  return mon;
}

function buildWorld(b: Battle, me: 0 | 1): World {
  const foe = (1 - me) as 0 | 1, real = b.sides[foe];
  const w = cloneBattle(b);
  w.planning = {};
  delete w.sacrificePlans;
  w.journal = [];
  const slots = new Set([real.active, ...revealedOpponentSlots(b, me)].filter(slot => !real.team[slot].fainted));
  const opponent = [...slots].sort((a, z) => a - z).map(slot => observeOpponent(b, me, slot));
  const models = new Map(opponent.map(model => [model.slot, modelMon(b, w, model)]));
  const placeholder = models.get(real.active) ?? [...models.values()][0];
  const side = w.sides[foe];
  // Unrevealed or fainted members are inert placeholders; their species stays hidden.
  side.team = real.team.map((_, slot) => models.get(slot) ?? { ...placeholder, slot, hp: 0, fainted: true, conditions: [], stages: { ...placeholder.stages } });
  Object.assign(side, { items: {}, unlimitedItems: new Set(), rules: [], ai: { kind: 'smart' }, pending: null, needsReplacement: false });
  w.sides[me].pending = null;
  w.log = [];
  return { world: w, me, foe, opponent, modeledMoves: models.get(real.active)?.skills ?? [] };
}

// ---------- seeds ----------

function hash(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}
/** Common random numbers: every candidate faces the same draws per response and sample. */
function seed(b: Battle, tag: string, response: number, sample: number): Rng {
  return new Rng(hash(`${b.rng.s.join(',')}|${b.turn}|${tag}|${response}|${sample}`));
}

// ---------- rollout policy ----------

function hitChance(b: Battle, user: Mon, target: Mon, skill: Skill): number {
  if (skill.accuracy === null || skill.accuracy === undefined) return 1;
  return Math.max(0, Math.min(1, skill.accuracy * accuracyStageMultiplier(user.stages.acc - target.stages.eva) / 100));
}
function expectedDamage(b: Battle, user: Mon, target: Mon, skill: Skill): number {
  return skill.category === 'status' ? 0 : b.estimateDamage(user, target, skill) * hitChance(b, user, target, skill);
}
function movesOf(b: Battle, i: 0 | 1): Extract<Action, { kind: 'move' }>[] {
  return b.legalActions(i).filter((a): a is Extract<Action, { kind: 'move' }> => a.kind === 'move');
}
function actsFirst(b: Battle, user: Mon, target: Mon, skill: Skill): boolean {
  const own = b.priority(user, skill);
  const theirs = Math.max(0, ...target.skills.filter(id => target.pp[id] > 0).map(id => b.priority(target, b.skill(id, target))));
  return own > theirs || own === theirs && b.effStat(user, 'spe') > b.effStat(target, 'spe');
}

/** Cheap greedy policy for both sides inside rollouts; it runs no search. */
function rolloutAction(b: Battle, i: 0 | 1): Action {
  const user = b.active(i), target = b.active((1 - i) as 0 | 1), moves = movesOf(b, i);
  const forced = user.vol.forcedSkill;
  if (forced !== undefined && moves.some(a => a.skill === forced)) return { kind: 'move', skill: forced };
  if (!moves.length) return b.legalActions(i)[0];
  let best = moves[0], score = -1;
  for (const action of moves) {
    const skill = b.skill(action.skill, user);
    const mean = skill.category === 'status' ? 0 : b.estimateDamage(user, target, skill);
    if (mean * RANDOM_MIN / MEAN_ROLL >= target.hp && hitChance(b, user, target, skill) >= 1 && actsFirst(b, user, target, skill)) return action;
    const value = Math.min(target.hp, mean * hitChance(b, user, target, skill));
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
  return bench.map(m => ({ slot: m.slot, value: race(b, m, foe) })).sort((a, z) => z.value - a.value || a.slot - z.slot).map(r => ({ kind: 'switch' as const, slot: r.slot }))[0];
}

// ---------- evaluation ----------

const alive = (m: Mon) => !m.fainted && m.hp > 0;
const worth = (m: Mon, hpWeight = 1) => ALIVE + (1 - ALIVE) * hpWeight * m.hp / Math.max(1, m.maxHp);
function bestExpected(b: Battle, user: Mon, target: Mon): number {
  return Math.max(0, ...user.skills.filter(id => user.pp[id] > 0).map(id => expectedDamage(b, user, target, b.skill(id, user))));
}

/** Projected material swing of the one-on-one exchange that continues from here. */
function race(b: Battle, x: Mon, y: Mon): number {
  const dx = bestExpected(b, x, y), dy = bestExpected(b, y, x);
  const tx = dx > 0 ? Math.ceil(y.hp / dx) : Infinity, ty = dy > 0 ? Math.ceil(x.hp / dy) : Infinity;
  if (tx === Infinity && ty === Infinity) return 0;
  const outcome = (xFirst: boolean) => {
    if (xFirst ? tx <= ty : tx < ty) {
      const taken = Math.min(x.hp, (xFirst ? tx - 1 : tx) * dy);
      return worth(y) - (1 - ALIVE) * taken / x.maxHp;
    }
    const dealt = Math.min(y.hp, (xFirst ? ty : ty - 1) * dx);
    return -worth(x) + (1 - ALIVE) * dealt / y.maxHp;
  };
  const sx = b.effStat(x, 'spe'), sy = b.effStat(y, 'spe');
  return sx === sy ? (outcome(true) + outcome(false)) / 2 : outcome(sx > sy);
}

/** Shared critical charges that the horizon has not yet spent. */
function giftResidual(b: Battle, me: 0 | 1): number {
  const holders = b.sides[me].team.filter(m => alive(m) && m.conditions.some(c => c.id === 'seer_eff_71' && (c.data?.pool?.left ?? 0) > 0));
  if (!holders.length) return 0;
  const left = holders[0].conditions.find(c => c.id === 'seer_eff_71')!.data!.pool.left as number;
  const foe = b.active((1 - me) as 0 | 1);
  if (!alive(foe)) return left * .15;
  const extra = Math.max(...holders.map(m => bestExpected(b, m, foe)));
  return left * (1 - ALIVE) * Math.min(foe.hp, extra) / foe.maxHp;
}

function evaluate(b: Battle, me: 0 | 1, weights: Weights): number {
  const foe = (1 - me) as 0 | 1;
  let value = 0;
  for (const m of b.sides[me].team) if (alive(m)) value += worth(m, weights.ownHp);
  for (const m of b.sides[foe].team) if (alive(m)) value -= worth(m);
  const mine = b.active(me), theirs = b.active(foe);
  if (alive(mine) && alive(theirs)) {
    value += weights.race * race(b, mine, theirs);
    if (weights.control) {
      const held = theirs.conditions.filter(c => c.def.control && c.turns > 0).reduce((n, c) => Math.max(n, Math.min(2, c.turns)), 0);
      value += Math.min(.3, weights.control * held);
    }
  }
  return value + giftResidual(b, me);
}

// ---------- simulation ----------

interface Cell { value: number; sacrifice: boolean }

/** A self-KO by the actor's own move: its own active fell to damage it caused. */
function selfKnockout(c: Battle, me: 0 | 1, slot: number, from: number): boolean {
  const events = c.log.slice(from);
  const fell = events.some(e => e.type === 'faint' && e.side === me && e.slot === slot);
  return fell && events.some(e => e.type === 'damage' && e.side === me && e.slot === slot && e.sourceSide !== (1 - me) && e.kind === 'true');
}

function simulate(w: World, action: Action, response: number, rng: Rng, turns: number, weights: Weights, successor?: number): Cell {
  const c = cloneBattle(w.world);
  c.rng = rng;
  if (successor !== undefined) c.planning = { forcedReplacement: { [w.me]: successor } };
  const slot = c.sides[w.me].active, foeSlot = c.sides[w.foe].active;
  c.submit(w.me, action);
  c.submit(w.foe, { kind: 'move', skill: response });
  c.resolveTurn();
  const sacrifice = selfKnockout(c, w.me, slot, 0);
  for (let t = 0; t < turns && !c.result && !c.sides[w.foe].team[foeSlot].fainted && c.phase === 'choose'; t++) {
    c.submit(w.me, rolloutAction(c, w.me));
    c.submit(w.foe, rolloutAction(c, w.foe));
    c.resolveTurn();
  }
  return { value: evaluate(c, w.me, weights), sacrifice };
}

// ---------- equilibrium ----------

/** Regret matching+ with linear averaging: the row player's maximin mixed strategy. */
export function solveZeroSum(m: number[][]): { strategy: number[]; value: number } {
  const rows = m.length, cols = m[0]?.length ?? 0;
  if (!rows || !cols) return { strategy: rows ? [1, ...Array(rows - 1).fill(0)] : [], value: 0 };
  const rr = Array(rows).fill(0), rc = Array(cols).fill(0), sum = Array(rows).fill(0);
  const norm = (r: number[]) => { const t = r.reduce((a, v) => a + v, 0); return t > 0 ? r.map(v => v / t) : r.map(() => 1 / r.length); };
  for (let it = 1; it <= SOLVER_ITERATIONS; it++) {
    const x = norm(rr), y = norm(rc);
    const ux = m.map(row => row.reduce((a, v, j) => a + v * y[j], 0));
    const uy = Array.from({ length: cols }, (_, j) => m.reduce((a, row, i) => a + row[j] * x[i], 0));
    const v = ux.reduce((a, u, i) => a + u * x[i], 0);
    for (let i = 0; i < rows; i++) rr[i] = Math.max(0, rr[i] + ux[i] - v);
    for (let j = 0; j < cols; j++) rc[j] = Math.max(0, rc[j] + v - uy[j]);
    for (let i = 0; i < rows; i++) sum[i] += it * x[i];
  }
  const strategy = norm(sum);
  const value = Math.min(...Array.from({ length: cols }, (_, j) => m.reduce((a, row, i) => a + row[j] * strategy[i], 0)));
  return { strategy, value };
}

// ---------- candidates ----------

function healsHp(b: Battle, action: Action): boolean {
  return action.kind === 'item' && !!b.data.items.get(action.item)?.battle_effects?.some(op => op.op === 'heal');
}
/** Turns in a row, ending with the last resolved turn, in which this side used HP medicine. */
function healStreak(b: Battle, me: 0 | 1): number {
  const turns = new Set<number>();
  let turn = 0;
  for (const e of b.log) {
    if (e.type === 'turn_start') turn = e.turn;
    if (e.type === 'item_used' && e.side === me && b.data.items.get(e.item)?.battle_effects?.some(op => op.op === 'heal')) turns.add(turn);
  }
  let streak = 0;
  for (let t = b.turn; turns.has(t); t--) streak++;
  return streak;
}
const GIFTS = new Set(['seer_eff_59', 'seer_eff_71']);
function pendingGift(b: Battle, me: 0 | 1): boolean {
  return b.sides[me].team.some(m => !m.fainted && m.conditions.some(c => c.turns > 0 && (c.id === 'seer_eff_59' || c.id === 'seer_eff_71' && (c.data?.pool?.left ?? 1) > 0)));
}

function candidates(b: Battle, me: 0 | 1): Action[] {
  const self = b.active(me), healBlocked = healStreak(b, me) >= HEAL_STREAK_LIMIT, gift = pendingGift(b, me);
  const out = b.legalActions(me).filter(a => {
    if (!['move', 'switch', 'item'].includes(a.kind)) return false;
    if (a.kind === 'switch' && self.turnsActive < SWITCH_GAP) return false;
    if (healBlocked && healsHp(b, a)) return false;
    if (a.kind === 'move' && gift && b.skill(a.skill, self).effects?.some(op => op.op === 'script' && GIFTS.has(op.id))) return false;
    return true;
  });
  return out.length ? out : b.legalActions(me).filter(a => a.kind === 'move');
}

// ---------- decisions ----------

export function searchAction(b: Battle, side: Side, ai: AiSpec): Action {
  const me = side.index, w = buildWorld(b, me), weights = STYLE[ai.style ?? 'balanced'];
  const actions = candidates(b, me);
  const responses = movesOf(w.world, w.foe).map(a => a.skill);
  if (actions.length === 1 || !responses.length) return actions[0];
  const reserves = side.team.filter(m => !m.fainted && m.slot !== side.active).map(m => m.slot);
  const turns = 1 + HORIZON;
  const k = Math.max(MIN_SAMPLES, Math.min(SAMPLES, Math.floor(BUDGET / (actions.length * responses.length * turns))));
  let simulated = 0;
  const sacrifices: SearchDecision['sacrifices'] = [];
  const matrix = actions.map((action, row) => {
    // The first sample of every response also detects whether this action is a sacrifice.
    const first = responses.map(r => simulate(w, action, r, seed(b, 'cell', r, 0), HORIZON, weights));
    simulated += responses.length * turns;
    if (first.some(cell => cell.sacrifice) && reserves.length) {
      // A self-KO hands its successor a free entry and any gift: expand once per reserve.
      const ks = Math.max(MIN_SACRIFICE_SAMPLES, Math.min(k, Math.floor(BUDGET / (reserves.length * responses.length * (turns + SACRIFICE_EXTRA) * actions.length))));
      const best: number[] = [];
      const cells = responses.map(r => {
        let top = -Infinity, pick = reserves[0];
        for (const s of reserves) {
          let total = 0;
          for (let n = 0; n < ks; n++) total += simulate(w, action, r, seed(b, 'cell', r, n), HORIZON + SACRIFICE_EXTRA, weights, s).value;
          simulated += ks * (turns + SACRIFICE_EXTRA);
          if (total / ks > top) { top = total / ks; pick = s; }
        }
        best.push(pick);
        return top;
      });
      sacrifices.push({ action: row, successors: best });
      return cells;
    }
    return responses.map((r, j) => {
      let total = first[j].value;
      for (let n = 1; n < k; n++) total += simulate(w, action, r, seed(b, 'cell', r, n), HORIZON, weights).value;
      simulated += (k - 1) * turns;
      return total / k;
    });
  });
  const { strategy, value } = solveZeroSum(matrix);
  const kept = strategy.map(p => p >= TRIM ? p : 0);
  const total = kept.reduce((a, p) => a + p, 0);
  const mix = total > 0 ? kept.map(p => p / total) : strategy;
  let index = mix.indexOf(Math.max(...mix));
  if (mix[index] < .95) {
    // One draw from the live RNG keeps replays deterministic.
    let r = b.rng.next();
    for (let i = 0; i < mix.length; i++) { r -= mix[i]; if (r < 0) { index = i; break; } }
  }
  const chosen = actions[index];
  const planned = sacrifices.find(p => p.action === index);
  // A chosen sacrifice keeps the successor its expansion found best against each response.
  if (planned) b.sacrificePlans = { ...b.sacrificePlans, [me]: { turn: b.turn + 1, slot: side.active, responses, successors: planned.successors } };
  decisions.set(b, { ...decisions.get(b), [me]: { turn: b.turn + 1, side: me, opponent: w.opponent, modeledMoves: w.modeledMoves, actions, responses, matrix, strategy: mix, value, chosen, samples: k, simulatedTurns: simulated, sacrifices } });
  return chosen;
}

/** A faint replacement is free: choose the successor with the best guaranteed continuation. */
export function searchReplacement(b: Battle, side: Side): Action | undefined {
  const me = side.index, bench = side.team.filter(m => !m.fainted && m.slot !== side.active);
  if (!bench.length) return undefined;
  if (bench.length === 1) return { kind: 'switch', slot: bench[0].slot };
  const plan = b.sacrificePlans?.[me];
  if (plan) {
    delete b.sacrificePlans![me];
    if (plan.turn === b.turn && plan.slot === side.active) {
      // The foe's move this turn is public; follow the successor planned against it.
      let turn = 0, used: number | undefined;
      for (const e of b.log) {
        if (e.type === 'turn_start') turn = e.turn;
        if (turn === b.turn && e.type === 'move_used' && e.side !== me) used = e.skill;
      }
      const j = used === undefined ? -1 : plan.responses.indexOf(used);
      const counts = new Map<number, number>();
      for (const s of plan.successors) counts.set(s, (counts.get(s) ?? 0) + 1);
      const ranked = j >= 0 ? [plan.successors[j]] : [...counts].sort((a, z) => z[1] - a[1] || a[0] - z[0]).map(([s]) => s);
      const slot = ranked.find(s => bench.some(m => m.slot === s));
      if (slot !== undefined) return { kind: 'switch', slot };
    }
  }
  const ai = b.active(me).ai ?? side.ai, weights = STYLE[ai?.style ?? 'balanced'];
  const foeSide = b.sides[1 - me];
  if (b.active(foeSide.index).fainted) return { kind: 'switch', slot: bench.map(m => m).sort((a, z) => worth(z) - worth(a) || a.slot - z.slot)[0].slot };
  const w = buildWorld(b, me);
  const responses = w.world.active(w.foe).skills.filter(id => w.world.active(w.foe).pp[id] > 0);
  const rows = bench.map(member => {
    const values = (responses.length ? responses : [-1]).map(r => {
      let total = 0;
      for (let n = 0; n < SAMPLES; n++) {
        const c = cloneBattle(w.world);
        c.rng = seed(b, `replace:${member.slot}`, r, n);
        c.switchIn(c.sides[me], member.slot);
        c.sides[me].needsReplacement = false;
        c.phase = 'choose';
        for (let t = 0; t < 1 + HORIZON && !c.result && alive(c.active(w.foe)) && c.phase === 'choose'; t++) {
          c.submit(me, rolloutAction(c, me));
          c.submit(w.foe, t === 0 && r >= 0 && c.legalActions(w.foe).some(a => a.kind === 'move' && a.skill === r) ? { kind: 'move', skill: r } : rolloutAction(c, w.foe));
          c.resolveTurn();
        }
        total += evaluate(c, me, weights);
      }
      return total / SAMPLES;
    });
    return { slot: member.slot, value: Math.min(...values) };
  });
  return { kind: 'switch', slot: rows.sort((a, z) => z.value - a.value || a.slot - z.slot)[0].slot };
}
