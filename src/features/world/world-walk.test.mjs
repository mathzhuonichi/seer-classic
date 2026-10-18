import assert from 'node:assert/strict';
import test from 'node:test';
import {approachStop, clearOfName, towerClimbed, towerStage} from './world-walk.ts';

// A 1000x600 scene at the origin, a 60x100 robot standing at 95% of its height, and a contact at the scene centre
// whose 120x16 name hangs 4px below its feet.
const scene = {left: 0, top: 0, width: 1000, height: 600};
const robot = {width: 60, height: 100};
const contact = {x: 50, y: 50};
const name = {left: 440, top: 304, width: 120, height: 16};
const pixels = point => ({x: point.x * scene.width / 100, y: point.y * scene.height / 100});
/** The robot's box at a foot point clears the name box. */
function clear(stop, label = name) {
  const foot = pixels(stop), left = foot.x - robot.width / 2, right = foot.x + robot.width / 2;
  const top = foot.y - robot.height * .95, bottom = foot.y + robot.height * .05;
  return right <= label.left || left >= label.left + label.width || bottom <= label.top || top >= label.top + label.height;
}

test('a stop on the name moves out along the approach line', () => {
  const below = approachStop({x: 50, y: 90}, contact, scene, 100, robot, name);
  assert.ok(clear(below.stop) && below.stop.x === 50 && below.stop.y > 60, JSON.stringify(below));
  assert.equal(below.immediate, false);
  const side = approachStop({x: 10, y: 50}, contact, scene, 100, robot, name);
  assert.ok(clear(side.stop) && side.stop.y === 50 && side.stop.x < 44, JSON.stringify(side));
});

test('a stop clear of the name, or without a measured name, is the plain approach point', () => {
  const plain = approachStop({x: 50, y: 10}, contact, scene, 100);
  assert.deepEqual(approachStop({x: 50, y: 10}, contact, scene, 100, robot, name), plain);
  assert.ok(clear(plain.stop));
  // Already standing near the contact and clear of its name: the robot does not move, so the contact opens at once.
  const near = {x: 48, y: 42};
  assert.deepEqual(approachStop(near, contact, scene, 100, robot, name), {stop: near, immediate: true});
  // Coming from the side, the robot stops at the edge of the name, short of the plain approach point.
  const side = approachStop({x: 35, y: 52}, contact, scene, 100, robot, name);
  assert.ok(clear(side.stop) && side.stop.x > 35 && side.stop.x < 44.5, JSON.stringify(side));
});

test('at the scene edge the robot steps aside rather than leave the scene', () => {
  const low = {x: 50, y: 90}, label = {left: 440, top: 544, width: 120, height: 16};
  const stop = clearOfName({x: 50, y: 97}, low, scene, robot, label);
  assert.ok(clear(stop, label) && stop.y === 97, JSON.stringify(stop));
  assert.ok(pixels(stop).x - robot.width / 2 >= 0 && pixels(stop).x + robot.width / 2 <= scene.width);
});

test('a new Brave Tower floor or completion re-lands the robot, entering or leaving the tower does not', () => {
  const first = towerStage({floor: 1, complete: false}), second = towerStage({floor: 2, complete: false});
  const done = towerStage({floor: 2, complete: true}), outside = towerStage(undefined);
  assert.equal(outside, '');
  assert.equal(towerClimbed(first, second), true);
  assert.equal(towerClimbed(second, done), true);
  assert.equal(towerClimbed(done, first), true, 'choosing a new start after completion');
  assert.equal(towerClimbed(second, second), false);
  assert.equal(towerClimbed(outside, first), false, 'entering the tower keeps the landing it came by');
  assert.equal(towerClimbed(second, outside), false, 'leaving the tower');
});
