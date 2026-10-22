import assert from 'node:assert/strict';
import test from 'node:test';
import {ORIGINAL_CREATURE_SEPARATION, skillEffectPlacement} from './skill-effect-placement.ts';

// The 1280x800 arena of the research geometry (CSS px): its box, and 289 px creature boxes centred at (338.5, 368.9) and (941.5, 368.9).
const layer = {left: 49.2, top: 0, width: 1181.6, height: 613.3};
const box = (x, y, size = 289) => ({left: x - size / 2, top: y - size / 2, width: size, height: size});
const creatures = [box(338.5, 368.9), box(941.5, 368.9)];
const close = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} is not ${expected}`);

test('an effect is anchored at the acting creature, one stage px being the separation over 600', () => {
  const scale = (941.5 - 338.5) / ORIGINAL_CREATURE_SEPARATION;
  const player = skillEffectPlacement(layer, creatures, 0);
  close(player.x, 338.5 - 49.2, 'x');
  close(player.y, 368.9, 'y');
  assert.deepEqual([player.scaleX, player.scaleY], [scale, scale]);
  const foe = skillEffectPlacement(layer, creatures, 1);
  close(foe.x, 941.5 - 49.2, 'x');
  assert.deepEqual([foe.scaleX, foe.scaleY], [-scale, scale], 'a right-hand attacker mirrors its effect, like the original scaleX = -1');
});

test("the SWF's target point (+600, 0) lands on the other creature from either side", () => {
  for (const side of [0, 1]) {
    const at = skillEffectPlacement(layer, creatures, side), target = creatures[1 - side];
    close(layer.left + at.x + ORIGINAL_CREATURE_SEPARATION * at.scaleX, target.left + target.width / 2, `side ${side} target x`);
    close(layer.top + at.y, target.top + target.height / 2, `side ${side} target y`);
  }
});

test('the placement depends on the creature boxes only, not on their size or the layer size', () => {
  const smaller = [box(338.5, 368.9, 200), box(941.5, 368.9, 120)];
  assert.deepEqual(skillEffectPlacement({...layer, width: 10, height: 10}, smaller, 1), skillEffectPlacement(layer, creatures, 1));
});

test('nothing is placed before the creatures are laid out', () => {
  assert.equal(skillEffectPlacement(layer, [box(0, 0, 0), box(0, 0, 0)], 0), null);
});
