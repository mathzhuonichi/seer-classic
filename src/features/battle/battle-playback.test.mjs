import assert from 'node:assert/strict';
import test from 'node:test';
import {CRITICAL_HIT_MS, FOLLOW_UP_HIT_MS, FRAME_MS, REDUCED_MOTION_MS, isActing, planBattleFrame, shownDown, sideAction} from './battle-playback.ts';

const frame = (kind, extra = {}) => ({id: 1, side: 0, kind, text: '', playerHp: 1, enemyHp: 1, ...extra});
const clip = {durationMs: 1500, hitMs: 600};
/** An effect drawn from 27 ms after the hit marker, for 920 ms, that hurts the target 125 ms after the marker. */
const effect = {startMs: 27, durationMs: 920, hurtMs: 125};
const plan = (current, following, context = {}) => planBattleFrame(frame(current), following && frame(following), {reducedMotion: false, ...context});

test('frames without a clip or effect keep their kind default', () => {
  for (const kind of ['physical', 'special', 'status', 'heal', 'miss', 'switch', 'message'])
    assert.equal(plan(kind).delayMs, FRAME_MS[kind]);
  assert.equal(planBattleFrame(frame('hit', {critical: true}), undefined, {reducedMotion: false}).delayMs, CRITICAL_HIT_MS);
  assert.deepEqual(plan('heal'), {delayMs: FRAME_MS.heal, effect: 'keep', actionMs: null, awaitRunning: false, hurtDelayMs: 0});
});

test('a move hands over to its hit at the clip hit marker, otherwise plays the whole clip', () => {
  assert.deepEqual(plan('physical', 'hit', {timing: clip}), {delayMs: 600, effect: 'clear', actionMs: 1500, awaitRunning: false, hurtDelayMs: 0});
  assert.deepEqual(plan('physical', 'message', {timing: clip}), {delayMs: 1500, effect: 'clear', actionMs: 1500, awaitRunning: true, hurtDelayMs: 0});
  assert.equal(plan('special', 'hit', {timing: {durationMs: 900, hitMs: null}}).delayMs, 900);
  assert.equal(plan('hit').awaitRunning, true, 'a hit waits for the running clip and effect');
});

test('a move followed by its miss hands over at the hit marker or when its effect would hurt, and the miss waits like a hit', () => {
  assert.deepEqual(plan('physical', 'miss', {timing: clip}), {delayMs: 600, effect: 'clear', actionMs: 1500, awaitRunning: false, hurtDelayMs: 0});
  assert.deepEqual(plan('status', 'miss', {timing: clip, effect}),
    {delayMs: 725, effect: {delayMs: 627, durationMs: 920}, actionMs: 1500, awaitRunning: false, hurtDelayMs: 125}, 'a status move too');
  assert.deepEqual(plan('miss'), {delayMs: FRAME_MS.miss, effect: 'keep', actionMs: null, awaitRunning: true, hurtDelayMs: 0});
  assert.equal(plan('physical', 'miss').delayMs, FRAME_MS.physical, 'without a clip the move keeps its time');
});

test('a skill effect starts at its offset from the clip hit marker and runs its source length', () => {
  assert.deepEqual(plan('status', 'hit', {timing: clip, effect}).effect, {delayMs: 627, durationMs: 920});
  assert.deepEqual(plan('status', 'hit', {timing: clip, effect: {...effect, startMs: -15}}).effect, {delayMs: 585, durationMs: 920}, 'a start before the marker');
  assert.deepEqual(plan('status', 'hit', {effect}).effect, {delayMs: 27, durationMs: 920}, 'without a clip, from the move\'s start');
  assert.deepEqual(plan('status', 'hit', {effect: {...effect, startMs: -15}}).effect, {delayMs: 0, durationMs: 920});
});

test('with an effect, a move hands over to its hit when the effect hurts the target', () => {
  assert.deepEqual(plan('special', 'hit', {timing: clip, effect}),
    {delayMs: 725, effect: {delayMs: 627, durationMs: 920}, actionMs: 1500, awaitRunning: false, hurtDelayMs: 125});
  const whole = plan('special', 'message', {timing: clip, effect});
  assert.deepEqual([whole.delayMs, whole.hurtDelayMs, whole.awaitRunning], [1500, 0, true], 'without a hit the whole clip plays');
  assert.equal(plan('special', 'hit', {effect}).hurtDelayMs, 0, 'without a clip there is no hit marker to hand over at');
});

test('reduced motion collapses frames, effects and clips but never the capsule', () => {
  const reduced = plan('physical', 'hit', {reducedMotion: true, timing: clip, effect});
  assert.deepEqual(reduced, {delayMs: REDUCED_MOTION_MS, effect: {delayMs: 0, durationMs: REDUCED_MOTION_MS}, actionMs: null, awaitRunning: false, hurtDelayMs: 0});
  assert.equal(plan('hit', undefined, {reducedMotion: true}).delayMs, REDUCED_MOTION_MS);
  assert.equal(plan('capture', undefined, {reducedMotion: true}).delayMs, FRAME_MS.capture);
});

test('a hit followed by another on the same creature hands over quickly; the last one waits for the clip', () => {
  const quick = {delayMs: FOLLOW_UP_HIT_MS, effect: 'keep', actionMs: null, awaitRunning: false, hurtDelayMs: 0};
  assert.deepEqual(plan('hit', 'hit'), quick);
  assert.deepEqual(planBattleFrame(frame('hit', {critical: true}), frame('hit'), {reducedMotion: false}), quick, 'a critical hit too');
  assert.equal(plan('hit', 'hit', {reducedMotion: true}).delayMs, REDUCED_MOTION_MS);
  assert.deepEqual(planBattleFrame(frame('hit'), frame('hit', {side: 1}), {reducedMotion: false}),
    {delayMs: FRAME_MS.hit, effect: 'keep', actionMs: null, awaitRunning: true, hurtDelayMs: 0}, 'a hit on the other creature is another move\'s');
  assert.equal(plan('hit', 'message').awaitRunning, true);
});

test('a creature at 0 HP shows as down only once it is not acting its move, so a counter\'s knockout waits for its clip', () => {
  const move = frame('physical', {id: 1, side: 0}), hit = frame('hit', {id: 2, side: 1});
  assert.deepEqual([sideAction(0, hit, move), sideAction(1, hit, move), sideAction(1, null, move)], [move, hit, null]);
  assert.equal(isActing(0, hit, move), true, 'its clip plays on while the hit that drew the counter shows');
  assert.equal(shownDown(0, isActing(0, hit, move)), false, 'neither greyed nor counted out at the target');
  assert.equal(shownDown(0, isActing(0, hit, null)), true, 'down once its clip is home');
  assert.equal(isActing(0, move, null), true, 'a move without a clip acts while its frame shows');
  assert.equal(isActing(1, hit, move), false, 'the target of the hit is not acting');
  assert.equal(shownDown(5, false), false);
});
