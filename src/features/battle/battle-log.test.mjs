import assert from 'node:assert/strict';
import test from 'node:test';
import {battleEventText, groupedBattleLog, openingEvents} from './battle-log.ts';

const context = {data: {species: new Map(), skills: new Map(), items: new Map()},
  initialPlayer: {name: '巴鲁斯', hp: 100, maxHp: 100}, initialEnemy: {name: '布布花', hp: 100, maxHp: 100}};
const text = event => battleEventText(event, context);
const at = (fields = {}) => ({side: 0, slot: 0, name: '巴鲁斯', condition: 'seer_eff_49', ...fields});

test('condition lines name the condition, and an unnamed one once as 技能效果', () => {
  assert.equal(text({type: 'condition_refreshed', ...at({conditionName: '护盾'}), turns: 5}), '巴鲁斯的护盾效果更新为 5 回合。');
  assert.equal(text({type: 'condition_refreshed', ...at(), turns: 5}), '巴鲁斯的技能效果更新为 5 回合。');
  assert.equal(text({type: 'condition_added', ...at(), turns: Infinity}), '巴鲁斯获得技能效果。');
  assert.equal(text({type: 'condition_removed', ...at({conditionName: '护盾'}), reason: 'expired'}), '巴鲁斯的护盾效果结束。');
  assert.equal(text({type: 'condition_removed', ...at({conditionName: '护盾'}), reason: 'removed'}), '巴鲁斯的护盾已解除。');
  assert.equal(text({type: 'condition_tick', ...at({condition: 'poison', conditionName: '中毒'})}), '巴鲁斯的中毒在回合结束时生效。');
});

test('Boss rule conditions, named by their rule ids, are not shown by id', () => {
  const rule = at({side: 1, name: '布布花', condition: 'boss_drain_each_turn', conditionName: 'drain_each_turn'});
  assert.equal(text({type: 'condition_added', ...rule, turns: Infinity}), '布布花获得技能效果。');
});

test('the opening log leaves out the rule conditions installed before the first switch-in and keeps real conditions', () => {
  const foe = fields => at({side: 1, name: '布布花', ...fields});
  const opening = [
    {type: 'battle_start', sides: [{kind: 'player', name: 'player'}, {kind: 'boss', name: 'boss'}]},
    {type: 'condition_added', ...foe({condition: 'boss_drain_each_turn', conditionName: 'drain_each_turn'}), turns: Infinity},
    {type: 'condition_refreshed', ...foe({condition: 'campaign_always_moves_first', conditionName: '强制先手'}), turns: Infinity},
    {type: 'status_applied', ...foe({condition: 'poison'}), status: 'poison', turns: 3},
    {type: 'switch_in', side: 0, slot: 0, species: 1, types: [], name: '巴鲁斯', level: 50, hp: 100, maxHp: 100},
    {type: 'switch_in', side: 1, slot: 0, species: 2, types: [], name: '布布花', level: 50, hp: 100, maxHp: 100},
    {type: 'condition_added', ...at({conditionName: '护盾'}), turns: 5},
  ];
  assert.deepEqual(groupedBattleLog(openingEvents(opening), context),
    ['布布花陷入中毒，持续 3 回合。', '我方派出了巴鲁斯。', '对手派出了布布花。　巴鲁斯获得护盾效果，持续 5 回合。']);
});

test('a retreat is said once, by the flee line; a turn cap\'s end names the draw', () => {
  const end = fields => ({type: 'battle_end', winner: 1, success: false, defeated: [], turns: 3, ...fields});
  assert.deepEqual(groupedBattleLog([{type: 'flee', side: 0}, end({reason: 'flee'})], context), ['我方撤离了战斗。']);
  assert.equal(text(end({reason: 'turn_cap', winner: null})), '达到回合上限，本场平局。');
  assert.equal(text(end({reason: 'ko'})), '战斗结束。');
});

test('the side is named when both sides field a monster of the same name', () => {
  const mirror = {...context, initialEnemy: {name: '巴鲁斯', hp: 100, maxHp: 100}};
  const lines = groupedBattleLog([
    {type: 'move_used', side: 1, skill: 1, name: '瞬雷天闪'},
    {type: 'damage', side: 0, slot: 0, name: '巴鲁斯', amount: 37, overkill: 0, hp: 63, maxHp: 100, kind: 'attack', crit: false},
  ], mirror);
  assert.deepEqual(lines, ['对手巴鲁斯使用了技能。　我方巴鲁斯受到 37 点伤害。剩余体力 63/100。']);
  assert.equal(text({type: 'faint', side: 1, slot: 0, species: 1, by: null}), '布布花失去战斗能力。');
});

test('a switch opens its own entry: the switch_out with the switch_in that follows it', () => {
  const lines = groupedBattleLog([
    {type: 'item_used', side: 0, item: 'potion', slot: 0, targetName: '巴鲁斯'},
    {type: 'heal', side: 0, slot: 0, name: '巴鲁斯', amount: 20, hp: 100, maxHp: 100},
    {type: 'switch_out', side: 1, slot: 0},
    {type: 'switch_in', side: 1, slot: 1, species: 2, types: [], name: '巴鲁斯', level: 50, hp: 90, maxHp: 90},
    {type: 'move_used', side: 1, skill: 1, name: '瞬雷天闪'},
  ], context);
  assert.deepEqual(lines, [
    '我方对巴鲁斯使用了道具。　巴鲁斯恢复 20 点体力，剩余体力 100/100。',
    '布布花返回精灵胶囊。　对手派出了巴鲁斯。',
    '对手巴鲁斯使用了技能。',
  ]);
});
