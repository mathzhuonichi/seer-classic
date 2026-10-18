/**
 * Battle turn latency (architecture-v2 §2): once turn preparation has run, a player's move in a trainer battle against the
 * search AI gives the new snapshot with its frames in p95 ≤ 50 ms. The controller's dispatch (turn, frames and snapshot; the
 * save write follows the frame) is timed in this thread's CPU time (`process.threadCpuUsage`), so suites running in parallel do not count.
 */
import assert from 'node:assert/strict';
import {memoryStorage, suite, withSsr} from './_harness.mjs';
import {levelledGames} from './_game-battle.mjs';

memoryStorage();
const P95_BUDGET_MS = 50;
/** Player moves per battle, from the opening, where the planner has the most candidates and responses. */
const TURNS = 8;
const TRAINERS = ['attrition', 'control', 'dragon_sanctuary', 'fast_pressure', 'fusion_specialists', 'legendary', 'offense',
  'resilient_counter', 'shining_team', 'trained_core'];

await withSsr('battle-turn-latency', async load => {
  const [levelled, {Battle}] = await Promise.all([levelledGames(load), load('/battle/core/src/index.ts')]);
  const t = suite('battle-turn-latency'), tasks = [], samples = [];
  let battle, prepared = 0;
  const game = levelled({createBattle: options => battle = new Battle(options), idle: task => tasks.push(task)});
  const runIdle = () => { while (tasks.length) tasks.shift()(); };
  for (const id of TRAINERS) {
    game.dispatch({type: 'heal'});
    const start = game.dispatch({type: 'startBattle', bossId: `trainer_${id}`});
    t.check(`trainer_${id} starts`, () => assert(start.ok, start.notice));
    for (let moves = 0; moves < TURNS && !game.snapshot().battle?.finished;) {
      const view = game.snapshot().battle;
      runIdle();
      if (view.needsSwitch) { game.dispatch({type: 'switch', uid: view.party.find(mon => mon.hp > 0 && mon.uid !== view.player.uid).uid}); continue; }
      if (battle.sides[1].pending) prepared++;
      const skill = view.player.skills.find(entry => entry.pp > 0), before = process.threadCpuUsage();
      const result = game.dispatch({type: 'move', skillId: skill.id}), frames = game.snapshot().battle.animation.frames;
      const used = process.threadCpuUsage(before);
      assert(result.ok && frames.length, `trainer_${id}: ${result.notice}`);
      samples.push((used.user + used.system) / 1000);
      moves++;
    }
    if (!game.snapshot().battle.finished) game.dispatch({type: 'flee'});
    game.dispatch({type: 'closeBattle'});
  }
  const sorted = [...samples].sort((a, z) => a - z), at = q => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  const round = ms => Math.round(ms * 10) / 10;
  t.witness('moves', {count: sorted.length, prepared, p50: round(at(0.5)), p95: round(at(0.95)), max: round(sorted.at(-1))});
  t.check('the trainer battles played prepared moves', () => assert(sorted.length >= 40 && prepared === sorted.length, `${prepared}/${sorted.length}`));
  t.check(`a prepared move gives its snapshot in p95 ≤ ${P95_BUDGET_MS} ms of thread CPU time`, () => {
    assert(at(0.95) <= P95_BUDGET_MS, `p95 ${round(at(0.95))} ms over ${sorted.length} moves`);
  });
  t.finish();
});
