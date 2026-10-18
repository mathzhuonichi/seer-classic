import assert from 'node:assert/strict';
import test from 'node:test';
import {holdIdle, whenIdle} from './idle.ts';

const later = () => new Promise(resolve => setTimeout(resolve, 5));

test('idle work waits for every hold, and running a release twice counts once', async () => {
  const ran = [], first = holdIdle(), second = holdIdle();
  whenIdle(() => ran.push('held'));
  first();
  first();
  await later();
  assert.deepEqual(ran, [], 'one hold is still kept');
  second();
  await later();
  assert.deepEqual(ran, ['held']);
  whenIdle(() => ran.push('free'));
  await later();
  assert.deepEqual(ran, ['held', 'free']);
});
