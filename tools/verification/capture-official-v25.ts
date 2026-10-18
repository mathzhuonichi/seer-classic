import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBattle} from './_battle.ts';
import { buildDataSet } from '../../battle/core/src/data.ts';
import { rollReconstructedCapture } from '../../battle/core/src/capture.ts';

const catalog = JSON.parse(fs.readFileSync('data/gamedata.json', 'utf8'));
const data = buildDataSet(catalog);
const capsule = 'item_capsule_master';
const make = (active: number, target: number, kind: 'wild' | 'boss' = 'wild', noCapture = false) => createBattle({
  data, seed: 25, sides: [
    { kind: 'player', items: { [capsule]: 2 }, team: [{ species: active, level: 50, skills: [10001] }] },
    { kind, rules: noCapture ? [{ rule: 'no_capture' }] : [], team: [{ species: target, level: 5, skills: [10001] }] },
  ],
});
const allows = (active: number, target: number, kind: 'wild' | 'boss' = 'wild', noCapture = false) =>
  make(active, target, kind, noCapture).legalActions(0).some(a => a.kind === 'capture');
for (const id of [77, 78, 79, 310, 311, 312]) assert(allows(id, 416));
assert(!allows(1, 416));
assert(allows(1, 22));
assert(!allows(77, 416, 'boss'));
assert(!allows(77, 416, 'wild', true));
const rejected = make(1, 416), drawsBefore = rejected.rng.draws;
assert.throws(() => rejected.submit(0, { kind: 'capture', item: capsule }), /illegal action/);
assert.equal(rejected.sides[0].items[capsule], 2);
assert.equal(rejected.rng.draws, drawsBefore);

const input = { maxHp: 100, hp: 100, catchRate: 45, multiplier: 1, controlStatus: false, anyStatus: false };
let draws = 0;
const draw = (value: number) => () => { draws++; return value; };
const boundary = 15 / 255;
assert(rollReconstructedCapture(input, draw(boundary - 1e-10)));
assert(!rollReconstructedCapture(input, draw(boundary + 1e-10)));
assert.equal(draws, 2);
draws = 0;
assert(rollReconstructedCapture({ ...input, multiplier: null, catchRate: 0 }, draw(0.99)));
assert(rollReconstructedCapture({ ...input, hp: 1, catchRate: 255, multiplier: 4 }, draw(0.99)));
assert.equal(draws, 0);
assert(!rollReconstructedCapture({ ...input, catchRate: 0 }, draw(0)));
assert.equal(draws, 1);
assert(rollReconstructedCapture({ ...input, controlStatus: true, anyStatus: true }, () => 0.1));
assert(!rollReconstructedCapture({ ...input, anyStatus: true }, () => 0.1));
console.log(JSON.stringify({ passed: ['official Niao prerequisite: six accepted forms', 'ordinary/boss/no_capture distinction', 'rejection preserves capsule and RNG', 'reconstructed probability boundary', 'master and saturation skip RNG', 'zero-rate failure consumes one RNG draw', 'control status takes precedence'], probabilityParity: 'unverified server-side formula' }));
