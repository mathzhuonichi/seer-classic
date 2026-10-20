import assert from 'node:assert/strict';
import test from 'node:test';
import {EMPTY_BOUNDS, canvasMargins, fixedAnimationTransform, frameMeshBounds, standbyMeshBounds} from './battle-animation-registration.ts';

const frame = positions => ({mesh: {positions}});
/** A standby within one unit of the origin, and an attack that travels to (3..5, 2..4): forward and up. */
const clip = {sequences: [
  {name: 'standby', frames: [frame([-1, -1, 1, 1]), frame([-.5, -1, .5, 1.5])]},
  {name: 'attack', frames: [frame([-1, -1, 1, 1]), frame([3, 2, 5, 4])]},
]};
const UNLIMITED = {x: Infinity, y: Infinity};

test('a frame covers its vertices, and the standby extent every standby frame', () => {
  assert.deepEqual(frameMeshBounds(frame([3, 2, 5, 4, 4, 1])), {minX: 3, maxX: 5, minY: 1, maxY: 4});
  assert.deepEqual(frameMeshBounds(frame([])), EMPTY_BOUNDS);
  assert.deepEqual(standbyMeshBounds(clip), {minX: -1, maxX: 1, minY: -1, maxY: 1.5});
});

test('a canvas reaches beyond its host only where the sequence travels, and at most the limit', () => {
  // 170 / 1.7 * .85 / 2 = 42.5 pixels per unit, the origin at the centre (85, 85), y up.
  const transform = fixedAnimationTransform({minX: -1, maxX: 1, minY: -1, maxY: 1}, 170, 170, .85), attack = {minX: -1, maxX: 5, minY: -1, maxY: 4};
  assert.deepEqual(canvasMargins({minX: -1, maxX: 1, minY: -1, maxY: 1}, transform, 170, 170, UNLIMITED), {left: 0, right: 0, top: 0, bottom: 0});
  // x 5 lies at 85 + 212.5, 127.5 beyond the right edge; y 4 at 85 - 170, 85 above the top.
  assert.deepEqual(canvasMargins(attack, transform, 170, 170, UNLIMITED), {left: 0, right: 128, top: 85, bottom: 0});
  assert.deepEqual(canvasMargins(attack, transform, 170, 170, {x: 100.6, y: 40}), {left: 0, right: 100, top: 40, bottom: 0});
});
