import assert from 'node:assert/strict';
import test from 'node:test';
import {createBattlePlayer} from './battle-player.ts';
import {CRITICAL_HIT_MS, DAMAGE_NUMBER_MS, DAMAGE_NUMBER_ROWS, FRAME_MS, REDUCED_MOTION_MS} from './battle-playback.ts';

/** Timers that run only when the test advances the time, in due order. */
function manualClock() {
  let now = 0, nextId = 1;
  const timers = new Map();
  return {
    setTimeout: (run, ms) => { timers.set(nextId, {at: now + Math.max(0, ms), run}); return nextId++; },
    clearTimeout: id => { timers.delete(id); },
    now: () => now,
    /** Runs every timer due within `ms`, then sets the time `ms` later. */
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= until).sort(([a, x], [b, y]) => x.at - y.at || a - b)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].run();
      }
      now = until;
    },
    pending: () => timers.size,
  };
}

const frame = (id, kind, side, extra = {}) => ({id, side, kind, text: '', playerHp: 1, enemyHp: 1, ...extra});
const hit = (id, side, amount, extra) => frame(id, 'hit', side, {amount, ...extra});
const view = frames => ({log: [], finished: false, needsSwitch: false, animation: {revision: 1, frames}});

/** A player on a manual clock over the battle in `shown.battle`, which a test replaces for the next turn. */
function screen(frames, {reducedMotion = false} = {}) {
  const clock = manualClock(), shown = {battle: view(frames)};
  const player = createBattlePlayer({
    battle: () => shown.battle, dispatch: () => ({ok: true}), sound() {}, motion: () => ({reducedMotion}), clock,
    onStart() {}, onNeedsSwitch() {}, onReplaced() {}, holdIdle: () => () => {},
  });
  const numbers = () => player.state().numbers.map(({id, side, row}) => ({id, side, row}));
  return {player, clock, shown, numbers};
}

test('a hit number stays DAMAGE_NUMBER_MS from its frame, after its frame and its turn have moved on', () => {
  const ui = screen([hit(1, 1, 31), frame(2, 'message', 0, {text: '下一句'})]);
  ui.player.play(ui.shown.battle);
  assert.deepEqual(ui.player.state().numbers, [{id: 1, side: 1, amount: 31, healing: false, critical: false, row: 0}]);
  ui.clock.advance(FRAME_MS.hit + FRAME_MS.message);
  assert.deepEqual([ui.player.state().busy, ui.player.state().frame], [false, null], 'the turn has settled');
  // A new turn starts and its playback is cancelled by the next one, as the screen does on each revision.
  ui.shown.battle = view([frame(3, 'message', 0, {text: '新回合'})]);
  ui.player.play(ui.shown.battle)();
  ui.clock.advance(DAMAGE_NUMBER_MS - FRAME_MS.hit - FRAME_MS.message - 1);
  assert.deepEqual(ui.numbers(), [{id: 1, side: 1, row: 0}]);
  ui.clock.advance(1);
  assert.deepEqual(ui.numbers(), []);
});

test('numbers stack in rows per side, heals and critical hits among them, and one beyond the rows replaces the oldest', () => {
  const hits = Array.from({length: DAMAGE_NUMBER_ROWS + 1}, (_, index) => hit(index + 1, 1, 10 + index, {critical: index === 1}));
  const ui = screen([...hits, frame(99, 'heal', 0, {amount: 12})]);
  ui.player.play(ui.shown.battle);
  // The critical second hit stays longer than the others.
  const lastHitAt = FRAME_MS.hit * (DAMAGE_NUMBER_ROWS - 1) + CRITICAL_HIT_MS;
  assert.ok(lastHitAt < DAMAGE_NUMBER_MS, 'the first number is still due when the last hit shows');
  ui.clock.advance(lastHitAt);
  const rows = ui.numbers().filter(number => number.side === 1);
  assert.deepEqual(rows.map(number => number.id), [2, 3, 4, 5, 6], 'the oldest made way');
  assert.deepEqual(rows.map(number => number.row).sort(), [0, 1, 2, 3, 4], 'one row each');
  assert.equal(rows.find(number => number.id === hits.length).row, 0, 'the newest took the row the oldest left');
  assert.equal(ui.player.state().numbers.find(number => number.id === 2).critical, true);
  ui.clock.advance(FRAME_MS.hit);
  assert.deepEqual(ui.player.state().numbers.find(number => number.side === 0), {id: 99, side: 0, amount: 12, healing: true, critical: false, row: 0});
});

test('under reduced motion the frames hurry but the numbers keep their time', () => {
  const ui = screen([hit(1, 0, 5), hit(2, 0, 6)], {reducedMotion: true});
  ui.player.play(ui.shown.battle);
  ui.clock.advance(REDUCED_MOTION_MS * 3);
  assert.equal(ui.player.state().busy, false);
  assert.deepEqual(ui.numbers(), [{id: 1, side: 0, row: 0}, {id: 2, side: 0, row: 1}]);
  ui.clock.advance(DAMAGE_NUMBER_MS - REDUCED_MOTION_MS * 3);
  assert.deepEqual(ui.numbers(), [{id: 2, side: 0, row: 1}]);
});

test('a turn played again keeps the numbers its first playing showed', () => {
  const ui = screen([hit(1, 1, 8), frame(2, 'message', 0, {text: '下一句'})]);
  ui.player.play(ui.shown.battle)();
  ui.clock.advance(1000);
  ui.player.play(ui.shown.battle);
  assert.deepEqual(ui.numbers(), [{id: 1, side: 1, row: 0}]);
  ui.clock.advance(DAMAGE_NUMBER_MS - 1000);
  assert.deepEqual(ui.numbers(), [], 'still timed from its first showing');
});

test('disposing the screen clears the numbers and their timers', () => {
  const ui = screen([hit(1, 1, 8), frame(2, 'message', 0, {text: '下一句'})]);
  const cancel = ui.player.play(ui.shown.battle);
  cancel();
  ui.player.dispose();
  assert.deepEqual(ui.player.state().numbers, []);
  assert.equal(ui.clock.pending(), 0);
});
