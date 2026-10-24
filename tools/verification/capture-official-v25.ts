import assert from 'node:assert/strict';
import {createBattle} from './_battle.ts';
import { buildDataSet } from '../../battle/core/src/data.ts';
import { rollReconstructedCapture } from '../../battle/core/src/capture.ts';
import { loadCatalogNode } from '../catalog.mjs';

const data = buildDataSet(loadCatalogNode());
const capsule = 'item_capsule_master';
const make = (active: number, target: number, kind: 'wild' | 'boss' = 'wild', noCapture = false) => createBattle({
  data, seed: 25, sides: [
    { kind: 'player', items: { [capsule]: 2 }, team: [{ species: active, level: 50, skills: [10001] }] },
    { kind, rules: noCapture ? [{ rule: 'no_capture' }] : [], team: [{ species: target, level: 5, skills: [10001] }] },
  ],
});
const allows = (active: number, target: number, kind: 'wild' | 'boss' = 'wild', noCapture = false) =>
  make(active, target, kind, noCapture).legalActions(0).some(a => a.kind === 'capture');
// 尼奥 (416) flees from a capsule thrown while none of the official client's six partner forms is out (battle/RULES.md 9.1);
// with one out, a capsule is an ordinary capture. The partner list is the species data, the one source.
const NIAO = 416, partners = (data.species.get(NIAO)?.wild_flee as { unless_player_active?: number[] } | undefined)?.unless_player_active;
assert.deepEqual(partners, [77, 78, 79, 310, 311, 312]);
const throwAt = (active: number) => {
  const battle = make(active, NIAO);
  battle.submit(0, { kind: 'capture', item: capsule });
  return { battle, events: battle.resolveTurn() };
};
for (const id of partners) assert.equal(throwAt(id).battle.result?.reason, 'capture', `partner ${id}`);
const fled = throwAt(1);
assert.deepEqual([fled.battle.result?.reason, fled.battle.result?.captured, fled.battle.sides[0].items[capsule]], ['wild_fled', undefined, 1]);
assert(!fled.events.some(event => event.type === 'capture_attempt'), 'no capture roll');
assert(allows(1, NIAO) && allows(1, 22));
assert(!allows(77, NIAO, 'boss'));
assert(!allows(77, NIAO, 'wild', true));

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
console.log(JSON.stringify({ passed: ['Niao: the six partner forms catch it', 'Niao flees from another form\'s capsule, which is spent',
  'ordinary/boss/no_capture distinction', 'reconstructed probability boundary', 'master and saturation skip RNG', 'zero-rate failure consumes one RNG draw', 'control status takes precedence'], probabilityParity: 'unverified server-side formula' }));
