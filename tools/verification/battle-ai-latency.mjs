/**
 * Search AI decision latency (architecture-v2 §2): the trainer search decisions that turn preparation runs while
 * the player chooses stay at p95 ≤ 250 ms. Each decision is timed in this thread's CPU time
 * (`process.threadCpuUsage`), so suites running in parallel do not count against it.
 */
import assert from 'node:assert/strict';
import {memoryStorage, suite, withSsr} from './_harness.mjs';
import {gameBattleOptions} from './_game-battle.mjs';

memoryStorage();
const P95_BUDGET_MS = 250;
/** Turns played per battle, from the opening, where the planner has the most candidates and responses. */
const TURNS = 6;
/** Every authored trainer team (the classic facility's teams) and a team of the generated facilities. */
const STARTS = [
  ...['attrition', 'control', 'dragon_sanctuary', 'fast_pressure', 'fusion_specialists', 'legendary', 'offense', 'resilient_counter', 'shining_team', 'trained_core']
    .map(id => ({type: 'startBattle', bossId: `trainer_${id}`})),
  ...['random', 'elite'].map(facilityId => ({type: 'startFacility', facilityId})),
];

await withSsr('battle-ai-latency', async load => {
  const [optionsFor, {Battle, Rng}, {AI_POLICY}, {lastSearchDecision}] = await Promise.all([
    gameBattleOptions(load), ...['/battle/core/src/index.ts', '/battle/ai/src/index.ts', '/battle/ai/src/search-ai.ts'].map(load),
  ]);
  const t = suite('battle-ai-latency'), samples = [];
  // Only decisions that ran the search (a new explanation record) are samples; a single candidate is no search.
  const timed = {
    chooseAction(battle, side) {
      const before = lastSearchDecision(battle, side), start = process.threadCpuUsage();
      const action = AI_POLICY.chooseAction(battle, side), used = process.threadCpuUsage(start);
      if (side.kind === 'trainer' && lastSearchDecision(battle, side) !== before) samples.push((used.user + used.system) / 1000);
      return action;
    },
    chooseReplacement: AI_POLICY.chooseReplacement,
  };
  const player = new Rng(11);
  for (const start of STARTS) {
    const battle = new Battle({...optionsFor(start), policy: timed});
    for (let turn = 0; turn < TURNS && !battle.result; turn++) {
      battle.prepare(1);
      battle.submit(0, player.pick(battle.legalActions(0).filter(action => action.kind !== 'flee')));
      battle.resolveTurn();
    }
  }
  const sorted = [...samples].sort((a, z) => a - z), at = q => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  const round = ms => Math.round(ms * 10) / 10;
  t.witness('decisions', {count: sorted.length, p50: round(at(0.5)), p95: round(at(0.95)), max: round(sorted.at(-1))});
  t.check('the battles ran trainer search decisions', () => assert(sorted.length >= 20, `${sorted.length} decisions`));
  t.check(`trainer search decisions take p95 ≤ ${P95_BUDGET_MS} ms of thread CPU time`, () => {
    assert(at(0.95) <= P95_BUDGET_MS, `p95 ${round(at(0.95))} ms over ${sorted.length} decisions`);
  });
  t.finish();
});
