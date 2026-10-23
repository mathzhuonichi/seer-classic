import assert from 'node:assert/strict';
import test from 'node:test';
import {createBattlePlayer} from './battle-player.ts';
import {DAMAGE_NUMBER_MS, DAMAGE_NUMBER_ROWS, FOLLOW_UP_HIT_MS, FRAME_MS, REDUCED_MOTION_MS} from './battle-playback.ts';

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

/**
 * A player on a manual clock over the battle in `shown.battle`, which a test replaces for the next turn; `timing` is every move's
 * clip and `effect` every move's skill effect.
 */
function screen(frames, {reducedMotion = false, timing, effect} = {}) {
  const clock = manualClock(), shown = {battle: view(frames)};
  const move = shownFrame => ['physical', 'special', 'status'].includes(shownFrame.kind);
  const player = createBattlePlayer({
    battle: () => shown.battle, dispatch: () => ({ok: true}), sound() {}, clock,
    motion: shownFrame => ({reducedMotion, timing: move(shownFrame) ? timing : undefined, effect: move(shownFrame) ? effect : undefined}),
    onStart() {}, onNeedsSwitch() {}, holdIdle: () => () => {},
  });
  const numbers = () => player.state().numbers.map(({id, side, row}) => ({id, side, row}));
  return {player, clock, shown, numbers};
}

test('a hit number stays DAMAGE_NUMBER_MS from its frame, after its frame and its turn have moved on', () => {
  const ui = screen([hit(1, 1, 31), frame(2, 'message', 0, {text: '下一句'})]);
  ui.player.play(ui.shown.battle);
  assert.deepEqual(ui.player.state().numbers, [{id: 1, frame: 1, side: 1, amount: 31, healing: false, critical: false, row: 0}]);
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
  // Numbers of their own on one creature (none adds to another), each following the one before quickly.
  const lastHitAt = FOLLOW_UP_HIT_MS * DAMAGE_NUMBER_ROWS;
  assert.ok(lastHitAt < DAMAGE_NUMBER_MS, 'the first number is still due when the last hit shows');
  ui.clock.advance(lastHitAt);
  const rows = ui.numbers().filter(number => number.side === 1);
  assert.deepEqual(rows.map(number => number.id), [2, 3, 4, 5, 6], 'the oldest made way');
  assert.deepEqual(rows.map(number => number.row).sort(), [0, 1, 2, 3, 4], 'one row each');
  assert.equal(rows.find(number => number.id === hits.length).row, 0, 'the newest took the row the oldest left');
  assert.equal(ui.player.state().numbers.find(number => number.id === 2).critical, true);
  ui.clock.advance(FRAME_MS.hit);
  assert.deepEqual(ui.player.state().numbers.find(number => number.side === 0),
    {id: 99, frame: 99, side: 0, amount: 12, healing: true, critical: false, row: 0});
});

/** A move whose clip hits at 600 ms and walks home until 2000 ms lands three hits (30 + 31 + 32), then the turn says one more line. */
function threeHits() {
  const frames = [frame(1, 'physical', 0, {targetSide: 1}), hit(2, 1, 30), hit(3, 1, 61, {numberId: 2}), hit(4, 1, 93, {numberId: 2, critical: true}),
    frame(5, 'message', 0, {text: '下一句'})];
  const ui = screen(frames, {timing: {durationMs: 2000, hitMs: 600}}), shownAt = {};
  ui.player.subscribe(() => { const id = ui.player.state().frame?.id; if (id && !(id in shownAt)) shownAt[id] = ui.clock.now(); });
  return {...ui, shownAt};
}
const lastHitAt = 600 + 2 * FOLLOW_UP_HIT_MS;

test('a move\'s hits land in quick succession at the target, and the turn goes on once its clip has ended', () => {
  const ui = threeHits();
  ui.player.play(ui.shown.battle);
  ui.clock.advance(3000);
  assert.deepEqual(ui.shownAt, {1: 0, 2: 600, 3: 600 + FOLLOW_UP_HIT_MS, 4: lastHitAt, 5: 2000});
});

test('a move\'s hits on one creature are one number that counts up in its row and holds DAMAGE_NUMBER_MS from the last hit', () => {
  const ui = threeHits(), amounts = [];
  ui.player.subscribe(() => { const [number] = ui.player.state().numbers; if (number && amounts.at(-1) !== number.amount) amounts.push(number.amount); });
  ui.player.play(ui.shown.battle);
  ui.clock.advance(lastHitAt);
  assert.deepEqual(amounts, [30, 61, 93]);
  assert.deepEqual(ui.player.state().numbers, [{id: 2, frame: 4, side: 1, amount: 93, healing: false, critical: true, row: 0}]);
  ui.clock.advance(DAMAGE_NUMBER_MS - 1);
  assert.deepEqual(ui.numbers(), [{id: 2, side: 1, row: 0}], 'timed from the last hit, not the first');
  ui.clock.advance(1);
  assert.deepEqual(ui.numbers(), []);
});

test('a critical hit keeps its number critical through the later hits, and another number on the creature takes the next row', () => {
  const ui = screen([hit(1, 1, 30, {critical: true}), hit(2, 1, 61, {numberId: 1}), frame(3, 'message', 0, {text: '中毒'}), hit(4, 1, 12)]);
  ui.player.play(ui.shown.battle);
  ui.clock.advance(FOLLOW_UP_HIT_MS + FRAME_MS.hit + FRAME_MS.message);
  assert.deepEqual(ui.player.state().numbers.map(({id, amount, critical, row}) => ({id, amount, critical, row})),
    [{id: 1, amount: 61, critical: true, row: 0}, {id: 4, amount: 12, critical: false, row: 1}]);
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

test('a turn played again leaves a number that counted up as its first playing left it', () => {
  const ui = screen([hit(1, 1, 30), hit(2, 1, 61, {numberId: 1}), frame(3, 'message', 0, {text: '下一句'})]);
  const cancel = ui.player.play(ui.shown.battle);
  ui.clock.advance(FOLLOW_UP_HIT_MS);
  cancel();
  ui.player.play(ui.shown.battle);
  assert.deepEqual(ui.player.state().numbers.map(({id, frame, amount}) => ({id, frame, amount})), [{id: 1, frame: 2, amount: 61}]);
  ui.clock.advance(FOLLOW_UP_HIT_MS);
  assert.equal(ui.player.state().numbers[0].amount, 61, 'its later hit, shown again, changes nothing');
  ui.clock.advance(DAMAGE_NUMBER_MS - FOLLOW_UP_HIT_MS - 1);
  assert.equal(ui.player.state().numbers.length, 1);
  ui.clock.advance(1);
  assert.deepEqual(ui.numbers(), [], 'still timed from the last hit of its first playing');
});

test('disposing the screen clears the numbers and their timers', () => {
  const ui = screen([hit(1, 1, 8), frame(2, 'message', 0, {text: '下一句'})]);
  const cancel = ui.player.play(ui.shown.battle);
  cancel();
  ui.player.dispose();
  assert.deepEqual(ui.player.state().numbers, []);
  assert.equal(ui.clock.pending(), 0);
});

/** The attacker's clip hits at 600 ms and ends at 1500 ms; its effect is drawn from 627 ms for 2000 ms and hurts at 725 ms. */
function effectTurn() {
  const frames = [frame(1, 'special', 0, {targetSide: 1, skillId: 11006}), hit(2, 1, 30), frame(3, 'message', 0, {text: '下一句'})];
  const ui = screen(frames, {timing: {durationMs: 1500, hitMs: 600}, effect: {startMs: 27, durationMs: 2000, hurtMs: 125}}), shownAt = {};
  ui.player.subscribe(() => { const id = ui.player.state().frame?.id; if (id && !(id in shownAt)) shownAt[id] = ui.clock.now(); });
  const cancel = ui.player.play(ui.shown.battle);
  return {...ui, shownAt, cancel};
}

test('a move with a skill effect hands over when the effect hurts its target, and the hit waits for the effect to end', () => {
  const ui = effectTurn();
  assert.deepEqual(ui.player.state().skillEffect && {delay: ui.player.state().skillEffect.delay, duration: ui.player.state().skillEffect.duration},
    {delay: 627, duration: 2000});
  ui.clock.advance(3000);
  assert.deepEqual(ui.shownAt, {1: 0, 2: 725, 3: 2627});
});

test('a skill effect\'s cue stays while its move is on screen after it has played, and goes with the next move or the turn', () => {
  const frames = [frame(1, 'status', 0, {skillId: 20001}), frame(2, 'status', 1, {skillId: 20002}), frame(3, 'message', 0, {text: '下一句'})];
  const ui = screen(frames, {timing: {durationMs: 3000, hitMs: 1400}, effect: {startMs: -15, durationMs: 958, hurtMs: 83}});
  ui.player.play(ui.shown.battle);
  ui.clock.advance(2900);
  assert.equal(ui.player.state().skillEffect?.move.id, 1, 'the effect has played, its move has not');
  ui.clock.advance(100);
  assert.equal(ui.player.state().skillEffect?.move.id, 2, 'the next move\'s own');
  ui.clock.advance(3000);
  assert.equal(ui.player.state().skillEffect?.move.id, 2, 'through the turn\'s last line');
  ui.clock.advance(FRAME_MS.message);
  assert.equal(ui.player.state().skillEffect, null, 'the turn has settled');
});

test('a skill effect skipped at its start hands the move over at the hit marker and holds nothing for it', () => {
  const ui = effectTurn();
  ui.clock.advance(627);
  ui.player.state().skillEffect.skip();
  assert.equal(ui.player.state().skillEffect, null);
  ui.clock.advance(0);
  assert.equal(ui.player.state().frame.id, 2, 'the hit shows at once: the marker has passed');
  ui.clock.advance(3000);
  assert.deepEqual(ui.shownAt, {1: 0, 2: 627, 3: 1500}, 'the hit waits for the clip only');
});

test('a skill effect skipped while its hit shows stops holding the hit; a stale or cancelled cue changes nothing', () => {
  const ui = effectTurn();
  ui.clock.advance(1000);
  const cue = ui.player.state().skillEffect;
  cue.skip();
  ui.clock.advance(3000);
  assert.deepEqual(ui.shownAt, {1: 0, 2: 725, 3: 1500});
  cue.skip();
  assert.equal(ui.player.state().busy, false, 'the turn stays settled');
  const again = effectTurn(), stale = again.player.state().skillEffect;
  again.clock.advance(3000);
  stale.skip();
  assert.deepEqual(again.shownAt, {1: 0, 2: 725, 3: 2627});
  const cancelled = effectTurn(), late = cancelled.player.state().skillEffect;
  cancelled.cancel();
  const pending = cancelled.clock.pending();
  late.skip();
  assert.equal(cancelled.clock.pending(), pending, 'a cancelled playback schedules nothing');
});
