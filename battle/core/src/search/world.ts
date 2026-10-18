// The planning world (design/notes/trainer-search-ai-v58.md sections 2-4). This
// module is the information boundary: the opponent's side is rebuilt from the
// public model only, so nothing hidden reaches a simulation.
import type { MonsterInput, Skill } from '../types.ts';
import type { Battle } from '../engine/battle.ts';
import type { Mon } from '../engine/state.ts';
import { MAX_SKILLS } from '../constants.ts';
import { cloneBattle } from '../clone.ts';
import { observeOpponent, revealedOpponentSlots, type ModeledFoe } from '../observe.ts';

export interface World { world: Battle; me: 0 | 1; foe: 0 | 1; opponent: ModeledFoe[]; modeledMoves: number[] }

/** The uncertain typed attack of a species with no modeled move; ids below FALLBACK_ID never collide with the catalog. */
const FALLBACK_ID = -9000, FALLBACK_POWER = 80, FALLBACK_ACCURACY = 100, FALLBACK_PP = 99;

/** Observed moves are certain; the mode's conventional set fills the rest. */
function modeledMoves(b: Battle, model: ModeledFoe): number[] {
  const out = model.observedMoves.filter(id => b.data.skills.has(id)).slice(0, MAX_SKILLS);
  for (const id of b.conventionalMoves?.(model.speciesId) ?? []) if (out.length < MAX_SKILLS && !out.includes(id) && b.data.skills.has(id)) out.push(id);
  return out;
}

/** An explicitly uncertain typed attack, for a species with no modeled move at all. */
function fallbackSkills(w: Battle, model: ModeledFoe): number[] {
  const species = w.data.species.get(model.speciesId)!;
  const category = species.base.atk >= species.base.spa ? 'physical' : 'special';
  const skills = new Map(w.data.skills);
  const ids = model.types.map((type, k) => {
    const id = FALLBACK_ID - k;
    const skill: Skill = {
      id, name: { zh: '推测攻击' }, type, category, power: FALLBACK_POWER, accuracy: FALLBACK_ACCURACY, pp: FALLBACK_PP, priority: 0, effects: [],
    };
    skills.set(id, skill);
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
  const mon = w.buildMon(model.side, model.slot, input, 0);
  // The world already holds independent copies of the visible conditions.
  const visible = new Set(model.conditions.map(c => c.id));
  const real = w.sides[model.side].team[model.slot];
  Object.assign(mon, {
    // A living monster keeps at least 1 HP; a sliver of bar must not round to a faint.
    types: [...model.types], hp: Math.min(mon.maxHp, model.hp > 0 ? Math.max(1, Math.round(model.hp)) : 0), stages: { ...model.stages },
    conditions: real.conditions.filter(c => visible.has(c.id)),
    turnsActive: real.turnsActive, lastActedTurn: real.lastActedTurn, facedBy: real.facedBy,
    usedSkills: new Set(model.observedMoves), skillUses: { ...model.moveUses },
  });
  mon.fainted = mon.hp <= 0;
  return mon;
}

/** A copy of the battle in which the opponent is its public model, ready for simulation. */
export function buildWorld(b: Battle, me: 0 | 1): World {
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
