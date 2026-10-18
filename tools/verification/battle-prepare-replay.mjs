/**
 * Turn preparation (architecture-v2 §5): game battles of each kind, played with and without `battle.prepare`
 * at every turn open, give the same events, RNG state, battle state and result turn by turn. A controller playing
 * the same script gives the same dispatch results, saves and battle views whether its idle tasks never run, run
 * as they are queued, or run late, after later turns, closed battles and new ones.
 */
import assert from 'node:assert/strict';
import {memoryStorage, suite, withSsr} from './_harness.mjs';
import {gameBattleOptions, levelledGames} from './_game-battle.mjs';

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
/** Player commands per battle in the controller script, and how often the late scheduler runs its queue (before every third dispatch). */
const SCRIPT_TURNS = 6;
const FLUSH_EVERY = 3;

await withSsr('battle-prepare-replay', async load => {
  const [optionsFor, levelled, {Battle, Rng}] = await Promise.all([gameBattleOptions(load), levelledGames(load), load('/battle/core/src/index.ts')]);
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

  /**
   * Plays every KINDS start on one controller under `schedule` ('never', 'immediate' or 'late'): heal, start, a rejected start,
   * seeded commands, then flee and close. Returns each dispatch's result, save and battle view, the commands whose opposing
   * decision was ready, and the late tasks that ran after their battle closed or their turn passed.
   */
  function script(schedule) {
    const queue = [], player = new Rng(7), records = [], counts = {prepared: 0, closed: 0, passed: 0, stalePrepares: 0};
    let current, prepares = 0;
    const idle = task => {
      const owner = current, turn = owner.turn;
      const run = () => {
        const closed = owner !== current, passed = !closed && owner.turn !== turn, before = prepares;
        if (closed) counts.closed++;
        if (passed) counts.passed++;
        task();
        if ((closed || passed) && prepares !== before) counts.stalePrepares++;
      };
      if (schedule === 'immediate') run(); else if (schedule === 'late') queue.push(run);
    };
    const createBattle = options => {
      const battle = current = new Battle(options), prepare = battle.prepare.bind(battle);
      battle.prepare = side => { prepares++; return prepare(side); };
      return battle;
    };
    const game = levelled({createBattle, idle});
    const dispatch = action => {
      if (schedule === 'late' && (records.length + 1) % FLUSH_EVERY === 0) while (queue.length) queue.shift()();
      const result = game.dispatch(action);
      const save = game.exportSave().replace(/"at":"[^"]*"/g, '"at":""');  // acquisition times differ between controllers
      records.push({action, result: JSON.stringify(result), save, battle: JSON.stringify(game.snapshot().battle)});
      return result;
    };
    for (const {start, fleeAt} of KINDS) {
      dispatch({type: 'heal'});
      assert(dispatch(start).ok, `${start.type} starts`);
      assert(!dispatch({type: 'startBattle', bossId: 'trainer_trained_core'}).ok, 'a start inside a battle is rejected');
      for (let turn = 1; turn <= SCRIPT_TURNS && !game.snapshot().battle.finished; turn++) {
        const view = game.snapshot().battle, skills = view.player.skills.filter(skill => skill.pp > 0);
        if (current.sides[1].pending) counts.prepared++;
        if (view.needsSwitch) dispatch({type: 'switch', uid: view.party.find(mon => mon.hp > 0 && mon.uid !== view.player.uid).uid});
        else dispatch(turn === fleeAt || !skills.length ? {type: 'flee'} : {type: 'move', skillId: player.pick(skills).id});
      }
      if (!game.snapshot().battle.finished) dispatch({type: 'flee'});
      dispatch({type: 'closeBattle'});
      current = null;
    }
    return {records, ...counts};
  }

  const runs = Object.fromEntries(['never', 'immediate', 'late'].map(schedule => [schedule, script(schedule)]));
  for (const schedule of ['immediate', 'late']) t.check(`controller idle tasks run ${schedule === 'late' ? 'late' : 'at once'}: same dispatches`, () => {
    const {records} = runs[schedule], plain = runs.never.records;
    assert.equal(records.length, plain.length, 'dispatches');
    records.forEach((record, k) => {
      for (const part of ['result', 'save', 'battle']) assert.equal(record[part], plain[k][part], `dispatch ${k + 1} (${record.action.type}): ${part}`);
    });
  });
  t.check('the controller script prepared turns, and late tasks after closed battles and passed turns prepared nothing', () => {
    assert.equal(runs.never.prepared, 0, 'no decision is ready when idle tasks never run');
    assert(runs.immediate.prepared > 0 && runs.late.prepared > 0, `prepared ${runs.immediate.prepared} at once, ${runs.late.prepared} late`);
    assert(runs.late.closed > 0 && runs.late.passed > 0, `late tasks: ${runs.late.closed} closed, ${runs.late.passed} passed`);
    assert.equal(runs.late.stalePrepares, 0, 'a task whose battle closed or whose turn passed prepares nothing');
  });
  t.witness('controller script', Object.fromEntries(Object.entries(runs).map(([schedule, {records, prepared, closed, passed}]) =>
    [schedule, {dispatches: records.length, prepared, closed, passed}])));
  t.finish();
});
