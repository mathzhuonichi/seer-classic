import assert from 'node:assert/strict';
import test from 'node:test';
import {CRITICAL_HIT_MS, FRAME_MS, REDUCED_MOTION_MS, planBattleFrame} from './battle-playback.ts';

const frame = (kind, extra = {}) => ({id: 1, side: 0, kind, text: '', playerHp: 1, enemyHp: 1, ...extra});
const clip = {durationMs: 1500, hitMs: 600};
const plan = (current, following, context = {}) => planBattleFrame(frame(current), following && frame(following), {reducedMotion: false, ...context});

test('frames without a clip or effect keep their kind default', () => {
  for (const kind of ['physical', 'special', 'status', 'heal', 'switch', 'message'])
    assert.equal(plan(kind).delayMs, FRAME_MS[kind]);
  assert.equal(planBattleFrame(frame('hit', {critical: true}), undefined, {reducedMotion: false}).delayMs, CRITICAL_HIT_MS);
  assert.deepEqual(plan('heal'), {delayMs: FRAME_MS.heal, actionMs: null, awaitRunning: false}, 'no effect field: the current overlay stays');
});

test('a move hands over to its hit at the clip hit marker, otherwise plays the whole clip', () => {
  assert.deepEqual(plan('physical', 'hit', {timing: clip}), {delayMs: 600, effect: null, actionMs: 1500, awaitRunning: false});
  assert.deepEqual(plan('physical', 'message', {timing: clip}), {delayMs: 1500, effect: null, actionMs: 1500, awaitRunning: true});
  assert.equal(plan('special', 'hit', {timing: {durationMs: 900, hitMs: null}}).delayMs, 900);
  assert.equal(plan('hit').awaitRunning, true, 'a hit waits for the running clip and effect');
});

test('a skill effect starts at the clip hit marker and runs its source length', () => {
  assert.deepEqual(plan('status', 'hit', {timing: clip, effectMs: 920}).effect, {delayMs: 600, durationMs: 920});
  assert.deepEqual(plan('status', 'hit', {effectMs: 920}).effect, {delayMs: 0, durationMs: 920});
});

test('reduced motion collapses frames, effects and clips but never the capsule', () => {
  const reduced = plan('physical', 'hit', {reducedMotion: true, timing: clip, effectMs: 920});
  assert.deepEqual(reduced, {delayMs: REDUCED_MOTION_MS, effect: {delayMs: 0, durationMs: REDUCED_MOTION_MS}, actionMs: null, awaitRunning: false});
  assert.equal(plan('hit', undefined, {reducedMotion: true}).delayMs, REDUCED_MOTION_MS);
  assert.equal(plan('capture', undefined, {reducedMotion: true}).delayMs, FRAME_MS.capture);
});
