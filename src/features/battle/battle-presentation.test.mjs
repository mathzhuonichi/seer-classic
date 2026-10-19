import assert from 'node:assert/strict';
import test from 'node:test';
import {STRUGGLE_SKILL} from '../../../battle/core/src/index.ts';
import {eventFrames} from './battle-presentation.ts';

const view = (side, name) => ({
  uid: `${side}-0`, slot: 0, species: side + 1, name, level: 50, hp: 100, maxHp: 100, fainted: false, types: ['普通'],
  portrait: '', skills: [], statuses: [], stages: {},
});
const player = view(0, '巴鲁斯'), enemy = view(1, '布布花');
const before = {player, enemy, party: [player], enemyParty: [enemy]};
/** A catalog as the game loads it: 挣扎 is the engine's own skill and never in it. */
const data = {species: new Map(), skills: new Map(), items: new Map()};
const frames = events => {
  let id = 0;
  return eventFrames(events, before, {data, hideEnemyHp: false, challenge: true, transformedSlots: new Set(), nextFrameId: () => ++id});
};

test('a 挣扎 move plays as a physical move at the foe, then its hit and the user\'s recoil', () => {
  const [move, hit, recoil] = frames([
    {type: 'move_used', side: 1, skill: STRUGGLE_SKILL.id, name: '挣扎'},
    {type: 'damage', side: 0, slot: 0, name: '巴鲁斯', amount: 12, overkill: 0, hp: 88, maxHp: 100, kind: 'attack', crit: false},
    {type: 'damage', side: 1, slot: 0, name: '布布花', amount: 25, overkill: 0, hp: 75, maxHp: 100, kind: 'percent', crit: false},
  ]);
  assert.deepEqual([move.kind, move.side, move.skillId, move.targetSide, move.text], ['physical', 1, STRUGGLE_SKILL.id, 0, '布布花使用了挣扎。']);
  assert.deepEqual([hit.kind, hit.side, hit.playerHp], ['hit', 0, 88]);
  assert.deepEqual([recoil.kind, recoil.side, recoil.enemyHp], ['hit', 1, 75]);
});
