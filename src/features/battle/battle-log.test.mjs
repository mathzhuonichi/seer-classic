import assert from 'node:assert/strict';
import test from 'node:test';
import {battleEventText, battleSteps, groupedBattleLog, openingEvents} from './battle-log.ts';

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

test('the opening log leaves out the rule conditions installed before the first switch-in and keeps real effects', () => {
  const foe = fields => at({side: 1, name: '布布花', ...fields});
  const opening = [
    {type: 'battle_start', sides: [{kind: 'player', name: 'player'}, {kind: 'boss', name: 'boss'}]},
    {type: 'condition_added', ...foe({condition: 'boss_drain_each_turn', conditionName: 'drain_each_turn'}), turns: Infinity},
    {type: 'condition_refreshed', ...foe({condition: 'campaign_always_moves_first', conditionName: '强制先手'}), turns: Infinity},
    {type: 'status_applied', ...foe({condition: 'poison'}), status: 'poison', turns: 3},
    {type: 'stat_stage', side: 1, stat: 'eva', delta: 3, stage: 3, capped: false},
    {type: 'switch_in', side: 0, slot: 0, species: 1, types: [], name: '巴鲁斯', level: 50, hp: 100, maxHp: 100},
    {type: 'switch_in', side: 1, slot: 0, species: 2, types: [], name: '布布花', level: 50, hp: 100, maxHp: 100},
    {type: 'condition_added', ...at({conditionName: '护盾'}), turns: 5},
  ];
  assert.deepEqual(groupedBattleLog(openingEvents(opening), context),
    ['布布花陷入中毒，持续 3 回合。　布布花的闪避提升 3 级，当前 +3 级。', '我方派出了巴鲁斯。', '对手派出了布布花。　巴鲁斯获得护盾效果，持续 5 回合。']);
});

test('a retreat is said once, by the flee line; a turn cap\'s end names the cap, and only a wild win\'s end names the win', () => {
  const end = fields => ({type: 'battle_end', winner: 1, success: false, defeated: [], turns: 3, ...fields});
  assert.deepEqual(groupedBattleLog([{type: 'flee', side: 0}, end({reason: 'flee'})], context), ['我方撤离了战斗。']);
  assert.equal(text(end({reason: 'turn_cap', winner: null})), '已达到 3 回合上限。');
  assert.equal(text(end({reason: 'ko'})), '战斗结束。');
  const won = end({reason: 'ko', winner: 0, success: true});
  assert.equal(text(won), '战斗胜利！');
  // A challenge's result text names its win as 挑战成功.
  assert.equal(battleEventText(won, {...context, challenge: true}), '战斗结束。');
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

test('挣扎, which only the engine defines, is named by the log', () => {
  const lines = groupedBattleLog([
    {type: 'move_used', side: 1, skill: 0, name: '挣扎'},
    {type: 'damage', side: 0, slot: 0, name: '巴鲁斯', amount: 12, overkill: 0, hp: 88, maxHp: 100, kind: 'attack', crit: false},
  ], context);
  assert.deepEqual(lines, ['布布花使用了挣扎。　巴鲁斯受到 12 点伤害。剩余体力 88/100。']);
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

const stage = (side, stat, delta, reached = delta, fields = {}) => ({type: 'stat_stage', side, stat, delta, stage: reached, capped: false, ...fields});
const each = (side, stats, delta, reached) => stats.map(stat => stage(side, stat, delta, reached));
const FIVE = ['atk', 'def', 'spa', 'spd', 'spe'];
const used = side => ({type: 'move_used', side, skill: 1, name: '光芒附体'});

test('one monster\'s stage changes at once are one line: the five battle stats alike are 全部能力', () => {
  assert.deepEqual(groupedBattleLog([used(1), ...each(1, FIVE, 1, 1)], context), ['布布花使用了技能。　布布花的全部能力提升 1 级，当前均为 +1 级。']);
  // The stage reached is said only when it is the same for all.
  assert.deepEqual(groupedBattleLog([used(1), ...each(1, FIVE, 1, 2).map((event, index) => index ? event : {...event, stage: 3})], context),
    ['布布花使用了技能。　布布花的全部能力提升 1 级。']);
  assert.deepEqual(groupedBattleLog([used(0), ...each(1, [...FIVE, 'acc'], -1, -1)], context), ['巴鲁斯使用了技能。　布布花的全部能力和命中下降 1 级，当前均为 -1 级。']);
  assert.deepEqual(groupedBattleLog([used(1), ...each(1, FIVE, 0, 6)], context), ['布布花使用了技能。　布布花的全部能力不变，当前均为 +6 级。']);
});

test('other stage changes at once name their stats per change, and each monster has its own line', () => {
  const lines = groupedBattleLog([
    used(0), stage(0, 'atk', 2), stage(0, 'def', 1, 1), stage(0, 'spa', 2), stage(0, 'spd', 1, 1), stage(0, 'spe', -1),
    used(1), stage(1, 'atk', 2), stage(1, 'spa', 2), stage(0, 'spe', -1, -2),
  ], context);
  assert.deepEqual(lines, [
    '巴鲁斯使用了技能。　巴鲁斯的攻击、特攻提升 2 级，防御、特防提升 1 级，速度下降 1 级。',
    '布布花使用了技能。　布布花的攻击、特攻提升 2 级，当前均为 +2 级。　巴鲁斯的速度下降 1 级，当前 -2 级。',
  ]);
  const blocked = stat => ({type: 'stage_blocked', side: 1, stat});
  assert.deepEqual(groupedBattleLog([used(0), blocked('atk'), blocked('def')], context), ['巴鲁斯使用了技能。　布布花的攻击、防御变化被阻止。']);
  assert.deepEqual(groupedBattleLog([used(0), stage(1, 'atk', -1), blocked('def')], context), ['巴鲁斯使用了技能。　布布花的攻击下降 1 级，防御变化被阻止。']);
});

test('changes from another cause keep their own line: after another event, on a stat changed again, or a critical hit\'s clearing', () => {
  const tick = {type: 'condition_tick', side: 1, slot: 0, name: '布布花', condition: 'seer_eff_1', conditionName: '蓄力'};
  const hit = {type: 'damage', side: 1, slot: 0, name: '布布花', amount: 10, overkill: 0, hp: 90, maxHp: 100, kind: 'attack', crit: true};
  const critical = stage(1, 'def', -2, 0, {name: '布布花', reason: 'critical'});
  assert.deepEqual(groupedBattleLog([tick, stage(1, 'atk', 1), stage(1, 'atk', 1, 2), stage(1, 'def', 1, 2)], context),
    ['布布花的蓄力在回合结束时生效。　布布花的攻击提升 1 级，当前 +1 级。　布布花的攻击、防御提升 1 级，当前均为 +2 级。']);
  assert.deepEqual(groupedBattleLog([used(0), hit, critical, stage(1, 'atk', -1, -1), stage(1, 'spe', -1, -1)], context), [
    '巴鲁斯使用了技能。　布布花受到 10 点伤害，致命一击！剩余体力 90/100。　致命一击破防，布布花的防御提升已清除。　布布花的攻击、速度下降 1 级，当前均为 -1 级。',
  ]);
});

test('a run of stage changes to both monsters, as a 同步 mirror makes them, is one step per monster', () => {
  const run = [stage(0, 'atk', 1), stage(1, 'atk', 1), stage(0, 'def', 1), stage(1, 'def', 1)];
  assert.deepEqual(battleSteps(run), [[run[0], run[2]], [run[1], run[3]]]);
  assert.deepEqual(battleSteps([stage(0, 'atk', 1), used(0), stage(0, 'def', 1)]).map(step => step.length), [1, 1, 1]);
});
