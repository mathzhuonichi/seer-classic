/**
 * Turn preparation (architecture-v2 §5): game battles of each kind, played with and without `battle.prepare`
 * at every turn open, give the same events, RNG state, battle state and result turn by turn.
 */
import assert from 'node:assert/strict';
import {memoryStorage, suite, withSsr} from './_harness.mjs';
import {gameBattleOptions} from './_game-battle.mjs';

memoryStorage();
/** Turns played per battle: enough for phases, replacements and planner draws, few enough for a gate. */
const MAX_TURNS = 12;
const KINDS = [
  {kind: 'wild, fleeing on turn 3', start: {type: 'startTraining', level: 100}, fleeAt: 3},
  {kind: 'boss with phases and RNG rules', start: {type: 'startBattle', bossId: 'boss_spt_pulante'}},
  {kind: 'trainer with the search AI', start: {type: 'startBattle', bossId: 'trainer_trained_core'}},
  {kind: 'campaign stage with rule scripts', start: {type: 'startCampaignStage', campaignId: 'qilin', stageId: 'wheel1'}},
  {kind: 'campaign chain of six', start: {type: 'startCampaignStage', campaignId: 'xuanwu', stageId: 'guardians'}},
  {kind: 'facility team', start: {type: 'startFacility', facilityId: 'random'}},
];

await withSsr('battle-prepare-replay', async load => {
  const [optionsFor, {Battle, Rng}] = await Promise.all([gameBattleOptions(load), load('/battle/core/src/index.ts')]);
  const t = suite('battle-prepare-replay');

  /** Seeded player moves, switches and items (a switch when it must replace), and a flee on turn `fleeAt`. */
  function play(options, prepared, fleeAt) {
    const battle = new Battle(options), player = new Rng(7), turns = [];
    let decided = 0;
    while (!battle.result && turns.length < MAX_TURNS) {
      if (prepared) for (const side of [0, 1]) if (battle.prepare(side)) decided++;
      const legal = battle.legalActions(0).filter(action => action.kind !== 'flee' && action.kind !== 'capture');
      battle.submit(0, battle.turn + 1 === fleeAt ? {kind: 'flee'} : player.pick(legal));
      const events = battle.resolveTurn();
      turns.push(JSON.stringify({events, rng: battle.rng.s, draws: battle.rng.draws, state: battle.state}));
    }
    return {turns, decided, result: battle.result};
  }

  for (const {kind, start, fleeAt} of KINDS) t.check(`${kind}: prepared turns replay the unprepared ones`, () => {
    const options = optionsFor(start), plain = play(options, false, fleeAt), prepared = play(options, true, fleeAt);
    assert.equal(prepared.turns.length, plain.turns.length, 'turns played');
    prepared.turns.forEach((turn, k) => assert.equal(turn, plain.turns[k], `turn ${k + 1}`));
    assert(prepared.decided > 0, 'preparation decided at least one turn');
    t.witness(kind, {encounter: options.encounter?.id ?? 'wild', turns: plain.turns.length, prepared: prepared.decided, result: plain.result?.reason ?? null});
  });
  t.finish();
});
