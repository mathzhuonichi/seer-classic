import assert from 'node:assert/strict';
import test from 'node:test';
import {STRUGGLE_SKILL} from '../../../battle/core/src/index.ts';
import {groupedBattleLog} from './battle-log.ts';
import {eventFrames} from './battle-presentation.ts';

const view = (side, name) => ({
  uid: `${side}-0`, slot: 0, species: side + 1, name, level: 50, hp: 100, maxHp: 100, fainted: false, types: ['普通'], typeIds: ['normal'],
  portrait: '', skills: [], statuses: [], stages: {},
});
const player = view(0, '巴鲁斯'), enemy = view(1, '布布花');
const before = {player, enemy, party: [player], enemyParty: [enemy]};
/** A catalog as the game loads it: 挣扎 is the engine's own skill and never in it. */
const data = {species: new Map(), skills: new Map(), items: new Map(), types: {chart: {}}};
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

test('a wild monster\'s flee is one frame on its side, with its line, and the battle\'s end adds none', () => {
  const shown = frames([{type: 'wild_fled', side: 1, slot: 0, name: '布布花'},
    {type: 'battle_end', winner: null, reason: 'wild_fled', success: false, defeated: [], turns: 5}]);
  assert.deepEqual(shown.map(frame => [frame.kind, frame.side, frame.text, frame.enemy.name]), [['flee', 1, '布布花逃跑了！', '布布花']]);
});

test('one monster\'s stage changes at once are one frame that changes every chip, with the log\'s line', () => {
  const events = [
    {type: 'move_used', side: 1, skill: STRUGGLE_SKILL.id, name: '挣扎'},
    ...['atk', 'def', 'spa', 'spd', 'spe'].map(stat => ({type: 'stat_stage', side: 1, stat, delta: 1, stage: 1, capped: false})),
  ];
  const shown = frames(events);
  assert.equal(shown.length, 2);
  const [, stages] = shown;
  assert.deepEqual([stages.kind, stages.side, stages.enemy.stages, stages.player.stages],
    ['message', 1, {atk: 1, def: 1, spa: 1, spd: 1, spe: 1}, {}]);
  const [line] = groupedBattleLog(events, {data, initialPlayer: player, initialEnemy: enemy});
  assert.equal(line, `${shown[0].text}　${stages.text}`);
  assert.equal(stages.text, '布布花的所有能力提升 1 级，当前均为 +1 级。');
});
