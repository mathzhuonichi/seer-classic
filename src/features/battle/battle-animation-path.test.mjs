import assert from 'node:assert/strict';
import test from 'node:test';
import {FORWARD_KEPT_SHARE, OPEN_ROOM, containPath, sequencePaths} from './battle-animation-path.ts';
import {EMPTY_BOUNDS} from './battle-animation-registration.ts';

const box = (minX, maxX, minY, maxY) => ({minX, maxX, minY, maxY});
const HOME = box(-1, 1, -1, 1);
/** A path whose frames are their bodies, without effects beyond them. */
const path = (bodies, hitFrame = -1) => ({bodies, extents: bodies, hitFrame});

/** A frame of axis-aligned quads, each [minX, maxX, minY, maxY, alpha = 1], as two triangles. */
function frame(quads, labels = []) {
  const positions = [], indices = [], mulColors = [];
  quads.forEach(([minX, maxX, minY, maxY, alpha = 1], q) => {
    positions.push(minX, minY, maxX, minY, maxX, maxY, minX, maxY);
    indices.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
    for (let v = 0; v < 4; v++) mulColors.push(1, 1, 1, alpha);
  });
  return {labels, mesh: {positions, indices, mulColors}};
}

test('a sequence path holds each frame body and the frame its hit label marks', () => {
  const paths = sequencePaths({sequences: [
    {name: 'attack', frames: [frame([[-1, 1, -1, 1]]), frame([[3, 5, 2, 4]], ['action_hit']), frame([])]},
    {name: 'cp', frames: []},
  ]}, HOME);
  assert.deepEqual([...paths.keys()], ['attack']);
  assert.deepEqual(paths.get('attack'), path([box(-1, 1, -1, 1), box(3, 5, 2, 4), EMPTY_BOUNDS], 1));
});

test('a frame body leaves out effects far from the creature and parts it hides', () => {
  // Three parts of the creature around (4, 0), a slash left at (-3, 3) and a hidden part at (4, 3); home is 2 units across.
  const body = frame([[3, 4, -1, 0], [4, 5, -1, 0], [3.5, 4.5, 0, 1], [-3.5, -2.5, 2, 4], [3.5, 4.5, 2.5, 3.5, 0]]);
  const [attack] = sequencePaths({sequences: [{name: 'attack', frames: [body]}]}, HOME).values();
  assert.deepEqual(attack.bodies, [box(3, 5, -1, 1)]);
  assert.deepEqual(attack.extents, [box(-3.5, 5, -1, 4)], 'the canvas still holds every vertex');
});

test('a path that fits the room keeps every frame where the clip puts it', () => {
  const frames = [HOME, box(3, 5, 2, 4), EMPTY_BOUNDS];
  for (const room of [OPEN_ROOM, box(-2, 6, -2, 5)]) {
    const contained = containPath(path(frames, 1), HOME, room);
    assert.deepEqual(contained.offsets, frames.map(() => ({x: 0, y: 0})));
    assert.deepEqual(contained.bounds, box(-1, 5, -1, 4));
  }
});

test('a climb above the room is compressed from home, so the highest frame touches the top and home frames stay', () => {
  // Reaches above home: 0, 1, 2, 0 (the climb), against 1 of room: each halves.
  const frames = [HOME, box(-1, 1, 0, 2), box(0, 2, 1, 3), box(-.5, .5, -1, .5)];
  const {offsets, bounds} = containPath(path(frames), HOME, box(-5, 9, -3, 2));
  assert.deepEqual(offsets.map(offset => offset.y), [0, -.5, -1, 0]);
  assert.deepEqual(offsets.map(offset => offset.x), [0, 0, 0, 0], 'the other axis keeps its travel');
  assert.deepEqual(bounds, box(-1, 2, -1, 2));
});

test('travel back and down past the room compresses linearly too', () => {
  const {offsets} = containPath(path([HOME, box(-5, -3, -4, -2)]), HOME, box(-3, 9, -2, 9));
  // Back: reach 4 into 2 of room; down: reach 3 into 1.
  assert.deepEqual(offsets[1], {x: 2, y: 2});
});

test('forward travel keeps the landing at the hit and compresses only the overshoot', () => {
  // Landing at reach 4 (the hit frame), overshoot to reach 8, room ahead 6: the overshoot halves into the last 2 units.
  const frames = [HOME, box(3, 5, -1, 1), box(7, 9, -1, 1)], room = box(-5, 7, -3, 3);
  assert(4 <= 6 * FORWARD_KEPT_SHARE, 'the landing lies within the kept share');
  const {offsets, bounds} = containPath(path(frames, 1), HOME, room);
  assert.deepEqual(offsets.map(offset => offset.x), [0, 0, -2]);
  assert.equal(bounds.maxX, 7);
  // Without a hit marker the whole forward travel compresses linearly.
  assert.deepEqual(containPath(path(frames), HOME, room).offsets.map(offset => offset.x), [0, -1, -2]);
});

test('a frame reaching past home both ways moves back inside once compression on one side has moved it', () => {
  // The climb compresses the up reach by 1/4; the tall frame (up 1, down .75) would then drop .75 and cross the floor.
  const {offsets, bounds} = containPath(path([HOME, box(-1, 1, 3, 5), box(-1, 1, -1.75, 2)]), HOME, box(-5, 5, -2, 2));
  assert.deepEqual(offsets.map(offset => offset.y), [0, -3, -.25]);
  assert.deepEqual(bounds, box(-1, 1, -2, 2));
  // A frame taller than the room (-1.5..3 in 4 of room) would drop 1.5 and leave the top empty: it moves only as far as covers the room.
  assert.deepEqual(containPath(path([HOME, box(-1, 1, 3, 5), box(-1, 1, -1.5, 3)]), HOME, box(-5, 5, -2, 2)).offsets.map(offset => offset.y), [0, -3, -1]);
  // Home itself may reach past the room: home frames stay where they are, and a frame past home there comes back to it.
  assert.deepEqual(containPath(path([HOME, box(-1, 1, -1.25, 1)]), HOME, box(-5, 5, -.5, 5)).offsets, [{x: 0, y: 0}, {x: 0, y: .25}]);
});

test('effects beyond the body do not move the creature, but the extent the canvas holds covers them where the body moved', () => {
  // The body climbs past the room's top 2 by 1 and halves; a slash it leaves at x 6..8 crosses the room's right edge 5.
  const climb = {bodies: [HOME, box(-1, 1, 1, 3)], extents: [box(-1, 8, -1, 1), box(-1, 8, 1, 3)], hitFrame: -1};
  const {offsets, bounds} = containPath(climb, HOME, box(-5, 5, -5, 2));
  assert.deepEqual(offsets, [{x: 0, y: 0}, {x: 0, y: -1}]);
  assert.deepEqual(bounds, box(-1, 8, -1, 2));
});

test('a room smaller than home holds the creature at home', () => {
  const {offsets} = containPath(path([HOME, box(-1, 1, 1, 3)]), HOME, box(-5, 5, -5, .5));
  assert.deepEqual(offsets[1], {x: 0, y: -2});
});
