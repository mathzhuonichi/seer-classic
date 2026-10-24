import assert from 'node:assert/strict';
import test from 'node:test';
import {FORWARD_KEPT_SHARE, OFFSET_CREEP, OPEN_ROOM, containPath, limitRate, sequencePaths as eachPath} from './battle-animation-path.ts';
import {EMPTY_BOUNDS} from './battle-animation-registration.ts';

const box = (minX, maxX, minY, maxY) => ({minX, maxX, minY, maxY});
const HOME = box(-1, 1, -1, 1);
/** Home is 2 units across: the creep per frame in mesh units. */
const CREEP = OFFSET_CREEP * 2;
const FREE = {x: Infinity, y: Infinity}, STILL = {x: 0, y: 0};
/** Each sequence's path, by name. */
const sequencePaths = (...args) => new Map(eachPath(...args));
/** No limit on an offset; and bands that reach at least as far as each target in its direction (a zero target asks nothing). */
const ANY = {low: -Infinity, high: Infinity};
const reaching = targets => targets.map(target => ({low: target > 0 ? target : -Infinity, high: target < 0 ? target : Infinity}));
/**
 * A path whose frames are bodies of the creature's own sprites, without effects beyond them, and whose creature may move any
 * distance between frames.
 */
const path = (bodies, hitFrame = -1) => ({bodies, owned: bodies.map(() => true), motions: bodies.map(() => FREE), bodyMotions: bodies.map(() => STILL),
  extents: bodies, hitFrame});

/**
 * A frame of axis-aligned quads, each [region, minX, maxX, minY, maxY, alpha = 1], as two triangles. Each region letter
 * draws its own atlas rect, so copies of a letter are copies of one sprite.
 */
function frame(quads) {
  const positions = [], uvs = [], indices = [], mulColors = [];
  quads.forEach(([region, minX, maxX, minY, maxY, alpha = 1], q) => {
    const u = (region.charCodeAt(0) - 65) / 32;
    positions.push(minX, minY, maxX, minY, maxX, maxY, minX, maxY);
    uvs.push(u, 0, u + 1 / 32, 0, u + 1 / 32, 1 / 32, u, 1 / 32);
    indices.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
    for (let v = 0; v < 4; v++) mulColors.push(1, 1, 1, alpha);
  });
  return {mesh: {positions, uvs, indices, mulColors}};
}
/** The creature at home: a body A and a head B. */
const STANDING = [['A', -1, 1, -1, 0], ['B', -.5, .5, 0, 1]];
const moved = (quads, dx, dy) => quads.map(([region, minX, maxX, minY, maxY, alpha]) => [region, minX + dx, maxX + dx, minY + dy, maxY + dy, alpha]);
const clip = (...moves) => ({sequences: [{name: 'standby', frames: [frame(STANDING)]}, ...moves]});
/** Hit frames by sequence: none. */
const NO_HITS = new Map();

test('a sequence path holds each frame body, how far the creature moved into it, and the hit frame it is given', () => {
  const paths = sequencePaths(clip(
    {name: 'attack', frames: [frame(STANDING), frame(moved(STANDING, 3, 2)), frame([]), frame(STANDING)]},
    {name: 'cp', frames: []},
  ), HOME, new Map([['attack', 1], ['cp', 0]]));
  assert.deepEqual([...paths.keys()], ['standby', 'attack']);
  const bodies = [HOME, box(2, 4, 1, 3), EMPTY_BOUNDS, HOME];
  assert.deepEqual(paths.get('attack'), {bodies, owned: [true, true, false, true], motions: [STILL, {x: 3, y: 2}, FREE, FREE],
    bodyMotions: [STILL, {x: 3, y: 2}, STILL, FREE], extents: bodies, hitFrame: 1},
    'from rest into the first frame nothing moved; next to a frame that shows nothing the creature may be anywhere, and its body appears');
});

test('an effect, a sprite the standby never draws, is not the body even where it touches the creature, but the canvas holds it', () => {
  // 鲁斯王's special attack: a beam reaching from the creature down and ahead, within BODY_REACH, flickers on and off.
  const beam = ['E', 0, 2.5, -2.5, 0];
  const attack = sequencePaths(clip({name: 'sa', frames: [frame(STANDING), frame([...STANDING, beam]), frame(STANDING)]}), HOME, NO_HITS).get('sa');
  assert.deepEqual(attack.bodies, [HOME, HOME, HOME]);
  assert.deepEqual(attack.extents[1], box(-1, 2.5, -2.5, 1));
  assert.deepEqual(attack.motions[1], STILL, 'the creature did not move');
  const {offsets} = containPath(attack, HOME, box(-5, 9, -1.5, 5));
  assert.deepEqual(offsets, [STILL, STILL, STILL], 'a beam below the floor does not lift the creature');
});

test('copies of a part beyond what the standby draws are afterimages and clones: the creature is the copy that carries on', () => {
  // The creature stays while a translucent clone of it dashes ahead.
  const frames = [0, 2, 4].map(dx => frame([...STANDING, ...moved(STANDING, dx, 0).map(quad => [...quad.slice(0, 5), .5])]));
  const {bodies, motions} = sequencePaths(clip({name: 'attack', frames}), HOME, NO_HITS).get('attack');
  assert.deepEqual(bodies, [HOME, HOME, HOME]);
  assert.deepEqual(motions.slice(1), [STILL, STILL], 'paired with its nearest copy, every piece but the clone stayed');
});

test('a copy that appears beside the creature leaves the creature paired with itself', () => {
  // A second image of the creature is drawn first, ahead of it: the creature did not move.
  const frames = [frame(STANDING), frame([...moved(STANDING, 3, 0), ...STANDING])];
  assert.deepEqual(sequencePaths(clip({name: 'attack', frames}), HOME, NO_HITS).get('attack').motions[1], STILL);
});

test('a move that redraws the whole creature takes all it draws as the body, within reach of its middle', () => {
  // New sprites C (the creature, large) and a small spark D far away: neither is a standby sprite.
  const frames = [frame(STANDING), frame([['C', -1, 1, -1, 1], ['D', 6, 6.5, 0, .5]]), frame([['C', 0, 2, -1, 1], ['D', 6, 6.5, 0, .5]])];
  const {bodies, motions} = sequencePaths(clip({name: 'attack', frames}), HOME, NO_HITS).get('attack');
  assert.deepEqual(bodies, [HOME, HOME, box(0, 2, -1, 1)], 'the spark lies beyond BODY_REACH');
  assert.deepEqual(motions[1], {x: 0, y: .5}, 'no part carries on, but the drawing overlaps: it moved as its largest piece did, A to C');
  assert.deepEqual(motions[2], {x: 1, y: 0}, 'both sprites carry on: the creature moved and the spark stayed, and the creature covers more');
  const elsewhere = sequencePaths(clip({name: 'attack', frames: [frame(STANDING), frame([['C', 5, 7, -1, 1]])]}), HOME, NO_HITS).get('attack');
  assert.deepEqual(elsewhere.motions[1], FREE, 'a drawing elsewhere carries nothing visible on');
  const redrawn = sequencePaths(clip({name: 'attack', frames: [frame([['C', -1, 1, -1, 1]]), frame([['D', 0, 2, -1, 1]])]}), HOME, NO_HITS).get('attack');
  assert.deepEqual(redrawn.motions[1], {x: 1, y: 0});
});

test('a part thrown far from the creature is not its body', () => {
  const frames = [frame(STANDING), frame([STANDING[0], ['B', 5.5, 6.5, 0, 1]])];
  assert.deepEqual(sequencePaths(clip({name: 'attack', frames}), HOME, NO_HITS).get('attack').bodies[1], box(-1, 1, -1, 0));
});

test('a path that fits the room keeps every frame where the clip puts it', () => {
  const frames = [HOME, box(3, 5, 2, 4), EMPTY_BOUNDS, HOME];
  for (const room of [OPEN_ROOM, box(-2, 6, -2, 5)]) {
    const contained = containPath(path(frames, 1), HOME, room);
    assert.deepEqual(contained.offsets, frames.map(() => STILL));
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
  const {offsets} = containPath(path([HOME, box(-5, -3, -4, -2), HOME]), HOME, box(-3, 9, -2, 9));
  // Back: reach 4 into 2 of room; down: reach 3 into 1.
  assert.deepEqual(offsets[1], {x: 2, y: 2});
});

test('forward travel keeps the landing at the hit and compresses only the overshoot', () => {
  // Landing at reach 4 (the hit frame), overshoot to reach 8, room ahead 6: the overshoot halves into the last 2 units.
  const frames = [HOME, box(3, 5, -1, 1), box(7, 9, -1, 1), HOME], room = box(-5, 7, -3, 3);
  assert(4 <= 6 * FORWARD_KEPT_SHARE, 'the landing lies within the kept share');
  const {offsets, bounds} = containPath(path(frames, 1), HOME, room);
  assert.deepEqual(offsets.map(offset => offset.x), [0, 0, -2, 0]);
  assert.equal(bounds.maxX, 7);
  // Without a hit marker the whole forward travel compresses linearly.
  assert.deepEqual(containPath(path(frames), HOME, room).offsets.map(offset => offset.x), [0, -1, -2, 0]);
});

test('a frame reaching past home both ways moves back inside once compression on one side has moved it', () => {
  // The climb compresses the up reach by 1/4; the tall frame (up 1, down .75) would then drop .75 and cross the floor.
  const {offsets, bounds} = containPath(path([HOME, box(-1, 1, 3, 5), box(-1, 1, -1.75, 2), HOME]), HOME, box(-5, 5, -2, 2));
  assert.deepEqual(offsets.map(offset => offset.y), [0, -3, -.25, 0]);
  assert.deepEqual(bounds, box(-1, 1, -2, 2));
  // A frame taller than the room (-1.5..3 in 4 of room) would drop 1.5 and leave the top empty: it moves only as far as covers the room.
  const tall = containPath(path([HOME, box(-1, 1, 3, 5), box(-1, 1, -1.5, 3), HOME]), HOME, box(-5, 5, -2, 2));
  assert.deepEqual(tall.offsets.map(offset => offset.y), [0, -3, -1, 0]);
  // Home itself may reach past the room: home frames stay where they are, and a frame past home there comes back to it.
  assert.deepEqual(containPath(path([HOME, box(-1, 1, -1.25, 1), HOME]), HOME, box(-5, 5, -.5, 5)).offsets[1], {x: 0, y: .25});
});

test('effects beyond the body do not move the creature, but the extent the canvas holds covers them where the body moved', () => {
  // The body climbs past the room's top 2 by 1 and halves; a slash it leaves at x 6..8 crosses the room's right edge 5.
  const climb = {...path([HOME, box(-1, 1, 1, 3), HOME]), extents: [box(-1, 8, -1, 1), box(-1, 8, 1, 3), HOME]};
  const {offsets, bounds} = containPath(climb, HOME, box(-5, 5, -5, 2));
  assert.deepEqual(offsets, [STILL, {x: 0, y: -1}, STILL]);
  assert.deepEqual(bounds, box(-1, 8, -1, 2));
});

test('a room smaller than home holds the creature at home', () => {
  const {offsets} = containPath(path([HOME, box(-1, 1, 1, 3), HOME]), HOME, box(-5, 5, -5, .5));
  assert.deepEqual(offsets[1], {x: 0, y: -2});
});

test('a body that changes shape at once while the creature stands still eases into its offset instead of jumping', () => {
  // A wing spreads above the room's top 1.5 in one frame: the climb needs -.5 there, yet the creature does not move.
  const bodies = [HOME, HOME, HOME, HOME, box(-1, 1, -1, 3), HOME, HOME, HOME];
  const still = {...path(bodies), motions: bodies.map(() => STILL)};
  const ys = containPath(still, HOME, box(-5, 5, -5, 2)).offsets.map(offset => offset.y);
  ys.forEach((y, i) => assert(Math.abs(y - (ys[i - 1] ?? 0)) <= CREEP + 1e-9, `frame ${i} moves by at most the creep`));
  assert.equal(ys[4], -Math.min(1, 4 * CREEP), 'the target is met as far as the steps from rest allow');
  // Where the creature itself climbs as far, the offset follows at once.
  const climbing = {...still, motions: bodies.map((_, i) => ({x: 0, y: i === 4 || i === 5 ? 2 : 0}))};
  assert.deepEqual(containPath(climbing, HOME, box(-5, 5, -5, 2)).offsets.map(offset => offset.y), [0, 0, 0, 0, -1, 0, 0, 0]);
});

test('offsets ease toward each target from both sides, the upward one wins where opposite targets meet, and they start and end at rest', () => {
  const steps = [1, 1, 1, 1, 1, 1, 1];
  assert.deepEqual(limitRate(reaching([0, 0, 3, 0, 0, 0]), steps), [1, 2, 3, 2, 1, 0]);
  assert.deepEqual(limitRate(reaching([0, 0, -2, 0, 0, 0]), steps), [0, -1, -2, -1, 0, 0]);
  assert.deepEqual(limitRate(reaching([0, 2, -2, 0]), [Infinity, 1, 1, 1, 1]), [1, 2, 1, 0], 'the lift is kept; the drop it leaves no room for is not');
  assert.deepEqual(limitRate(reaching([4, 4]), [Infinity, Infinity, 1]), [4, 1], 'no limit between frames, but the last comes back to rest');
  assert.deepEqual(limitRate(reaching([4, 0]), [1, Infinity, Infinity]), [1, 0], 'and the first leaves rest by one step');
  const held = [{low: 3, high: Infinity}, {low: -Infinity, high: 1}, ANY], lifted = [Infinity, 2, Infinity, Infinity], slow = [Infinity, .1, .1, Infinity];
  assert.deepEqual(limitRate(held, lifted, slow), [3, 1, .9], 'a band holds the offset on both sides: at most 1, where easing from 3 leaves 2.9');
  assert.deepEqual(limitRate(reaching([3, 0, 0]), lifted, slow), [3, 2.9, 2.8]);
});

test('where the eases fall short, the offset changes by up to its steps, but only as far as the bands make it', () => {
  const eases = [.1, .1, .1, .1, .1, .1, .1], lifted = [.1, .1, .1, Infinity, .1, Infinity, .1];
  const band = [ANY, ANY, ANY, {low: 3, high: Infinity}, ANY, ANY];
  const offsets = limitRate(band, lifted, eases);
  assert.deepEqual(offsets.map(offset => Math.round(offset * 10) / 10), [.1, .2, .3, 3, 2.9, .1],
    'it eases toward the band by the eases, steps the rest of the way where the step is lifted, and eases back');
  assert.deepEqual(limitRate(band, eases).map(offset => Math.round(offset * 10) / 10), [.1, .2, .3, .3, .2, .1],
    'with the eases alone the band is out of reach');
});

test('a creature that vanishes far ahead and reappears at home is kept inside: the offset changes at once where it reappears', () => {
  // An effect E stays drawn while the creature leaps beyond the room ahead (x up to 5), vanishes, and comes back at home,
  // where the room ends just behind it (x from -1.2).
  const effect = ['E', -1, 1, 2, 3], shown = [STANDING, moved(STANDING, 5, 0), moved(STANDING, 5, 0), [], [], STANDING, STANDING];
  const leap = sequencePaths(clip({name: 'attack', frames: shown.map(quads => frame([...quads, effect]))}), HOME, NO_HITS).get('attack');
  assert.deepEqual(leap.owned, [true, true, true, false, false, true, true], 'the frames of the effect alone have no body of its own');
  assert.deepEqual(leap.bodyMotions[5], FREE, 'its body appears');
  assert.deepEqual(leap.motions[5], STILL, 'while the effect carries on unmoved');
  const xs = containPath(leap, HOME, box(-1.2, 5, -5, 5)).offsets.map(offset => offset.x);
  assert.deepEqual(xs.slice(0, 5).map(x => Math.round(x * 100) / 100), [0, -1, -1, -.96, -.92], 'held where the leap needed it, easing');
  assert(xs[5] >= -.2 && xs[6] >= -.2, `back inside at home at once: ${xs}`);
});

test('a creature that dashes while copies of it stay is followed by the offset as fast as it moves itself', () => {
  // Two translucent copies wait at x 4 while the creature dashes there; the room ends at x 4.
  const copies = moved(STANDING, 4, 0).map(quad => [...quad.slice(0, 5), .5]);
  const frames = [STANDING, ...[0, 1, 2, 3, 4].map(dx => [...moved(STANDING, dx, 0), ...copies, ...copies]), STANDING].map(frame);
  const dash = sequencePaths(clip({name: 'attack', frames}), HOME, NO_HITS).get('attack');
  assert.deepEqual(dash.bodies.slice(2, 6).map(body => body.minX), [0, 1, 2, 3], 'the body is the creature, not its copies');
  assert.deepEqual(dash.motions.slice(2, 6).map(motion => motion.x), [0, 0, 0, 0], 'most of what it shows stays');
  assert.deepEqual(dash.bodyMotions.slice(2, 6).map(motion => motion.x), [1, 1, 1, 1]);
  const xs = containPath(dash, HOME, box(-5, 4, -5, 5)).offsets.map(offset => offset.x);
  assert.deepEqual(xs.slice(2, 6), [-.25, -.5, -.75, -1], 'the dash compresses into the room as any travel does');
});

test('a part thrown far from the creature does not take its body over, even once it outweighs the rest', () => {
  const orb = ['O', .8, 1.2, -.2, .2], thrown = [[...STANDING, orb], [...STANDING, ['O', 2.6, 3, -.2, .2]], [...STANDING, ['O', 2, 5, -1.5, 1.5]]];
  const paths = sequencePaths({sequences: [{name: 'standby', frames: [frame([...STANDING, orb])]}, {name: 'sa', frames: thrown.map(frame)}]}, HOME, NO_HITS);
  assert.deepEqual(paths.get('sa').bodies.slice(1), [HOME, HOME]);
});

test('where a copy of the creature takes its body over, the offset follows that copy; where another part does, it may change at once', () => {
  const twin = moved(STANDING, 3, 0);
  const pair = sequencePaths(clip({name: 'cp', frames: [STANDING, [...STANDING, ...twin], twin].map(frame)}), HOME, NO_HITS).get('cp');
  assert.deepEqual(pair.bodies[2], box(2, 4, -1, 1), 'the image at home vanished');
  assert.deepEqual(pair.bodyMotions[2], STILL, 'the copy that stays did not move');
  // The lower part A dashes ahead and vanishes; the upper part B, left at home, is the body after it.
  const low = [STANDING[0]], high = [STANDING[1]];
  const frames = [STANDING, [...moved(low, 2.5, 0), ...high], [...moved(low, 5, 0), ...high], high, STANDING].map(frame);
  const split = sequencePaths(clip({name: 'sa', frames}), HOME, NO_HITS).get('sa');
  assert.deepEqual(split.bodies[3], box(-.5, .5, 0, 1));
  assert.deepEqual(split.bodyMotions[3], FREE);
  const xs = containPath(split, HOME, box(-1.5, 4, -5, 5)).offsets.map(offset => offset.x);
  assert(xs[2] <= -2 + 1e-9 && xs[3] >= -1, `the part left at home comes back inside at once: ${xs}`);
});
