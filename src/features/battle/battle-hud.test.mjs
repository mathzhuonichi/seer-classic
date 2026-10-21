import assert from 'node:assert/strict';
import test from 'node:test';
import {
  battleEndSound, battleItemPane, battleResultTitle, battleSkills, conditionSummary, itemCardAction, recentBattleLog, settledDialogue, shownTurn,
  stageChips,
} from './battle-hud.ts';
import {skillView} from '../../shared/view-common.ts';

const mon = (uid, hp, extra = {}) => ({uid, name: uid, hp, maxHp: 100, statuses: [], stages: {}, skills: [], ...extra});
const battle = (extra = {}) => ({player: mon('a', 50), party: [mon('a', 50), mon('b', 0), mon('c', 80)], canCapture: true, finished: false, needsSwitch: false,
  ...extra});

test('stage chips and the spoken condition summary', () => {
  assert.deepEqual(stageChips({atk: 2, def: 0, eva: -1, xyz: 1}),
    [{stat: 'atk', label: '攻击', value: 2}, {stat: 'eva', label: '闪避', value: -1}, {stat: 'xyz', label: 'xyz', value: 1}]);
  assert.equal(conditionSummary(mon('a', 1, {statuses: ['中毒'], stages: {spe: -2}})), '中毒，速度下降 2 级');
  assert.equal(conditionSummary(mon('a', 1)), '无异常状态或能力变化');
});

test('Struggle replaces the skills only when every one is out of PP', () => {
  const skills = [{id: 1, pp: 0}, {id: 2, pp: 3}];
  assert.equal(battleSkills(mon('a', 1, {skills})), skills);
  const [struggle] = battleSkills(mon('a', 1, {skills: [{id: 1, pp: 0}]}));
  assert.deepEqual([struggle.id, struggle.name, struggle.power, struggle.type, struggle.category], [0, '挣扎', 50, '普通', '物理']);
  assert.deepEqual(skillView({skills: new Map()}, struggle.id), struggle, 'a snapshot names 挣扎 as the command deck does');
});

test('the item pane falls back to recovery without capture and lists no revival items', () => {
  const inventory = [
    {id: 'cap', battleCategory: 'capsule', count: 1}, {id: 'pot', battleCategory: 'recovery', count: 2, useAction: 'use', useTargets: ['c']},
    {id: 'empty', battleCategory: 'recovery', count: 0},
    {id: 'revive', battleCategory: 'recovery', unlimited: true, count: 0, targetMode: 'fainted', useAction: 'use', useTargets: ['b']},
  ];
  const open = battleItemPane(battle(), inventory, 'recovery');
  assert.deepEqual([open.category, open.items.map(item => item.id)], ['recovery', ['pot']]);
  const blocked = battleItemPane(battle({canCapture: false}), inventory, 'capsule');
  assert.deepEqual([blocked.category, blocked.categories.map(([id]) => id)], ['recovery', ['recovery', 'status']]);
  assert.equal(battleItemPane(battle(), [], 'status').empty, '暂无异常解除道具。');
});

test('the result title names the outcome once, and a challenge\'s loss as a challenge\'s', () => {
  const title = extra => battleResultTitle(battle({finished: true, won: false, challenge: false, ...extra}));
  const outcomes = [{captured: true}, {won: true}, {resultReason: 'turn_cap'}, {resultReason: 'flee'}, {resultReason: 'ko'},
    {resultReason: 'ko', challenge: true}, {resultReason: 'lose_condition', challenge: true}];
  assert.deepEqual(outcomes.map(title), ['捕捉成功！', '战斗胜利！', '本场平局', '已撤离战斗', '战斗失败', '挑战失败', '挑战失败']);
});

test('settled dialogue, end sounds and the latest turn log', () => {
  assert.equal(settledDialogue(battle({needsSwitch: true})), '精灵失去战斗能力，请选择下一位出战精灵。');
  assert.equal(settledDialogue(battle({finished: true, result: '胜利'})), '胜利');
  assert.equal(settledDialogue(battle(), {text: '最后'}), '最后');
  assert.equal(settledDialogue(battle()), '请选择下一回合的指令。');
  assert.equal(battleEndSound(battle({finished: true, won: true})), 'win');
  assert.equal(battleEndSound(battle({finished: true, won: false})), 'lose');
  for (const quiet of [{captured: true}, {resultReason: 'flee'}, {resultReason: 'turn_cap'}, {finished: false}])
    assert.equal(battleEndSound(battle({finished: true, ...quiet})), null);
  assert.deepEqual(recentBattleLog(['第 1 回合', 'x', '第 2 回合', 'a', 'b', 'c']), ['b', 'c']);
  assert.deepEqual(recentBattleLog(['a']), ['a']);
});

test('an item card throws a capsule or uses the item on the creature in battle at once, and ignores useless, empty or blocked cards', () => {
  const capsule = {id: 'cap', battleCategory: 'capsule', count: 1};
  const potion = {id: 'pot', battleCategory: 'recovery', count: 1, useAction: 'use', useTargets: ['a', 'c']};
  assert.deepEqual(itemCardAction(battle(), capsule), {type: 'capture', itemId: 'cap'});
  assert.deepEqual(itemCardAction(battle(), potion), {type: 'battleItem', itemId: 'pot'}, 'no target: the creature in battle');
  assert.deepEqual(itemCardAction(battle(), {...potion, count: 0, unlimited: true}), {type: 'battleItem', itemId: 'pot'});
  assert.equal(itemCardAction(battle(), {...potion, useTargets: ['c']}), null, 'the creature in battle does not need it');
  assert.equal(itemCardAction(battle({canCapture: false}), capsule), null);
  assert.equal(itemCardAction(battle({needsSwitch: true}), potion), null);
  assert.equal(itemCardAction(battle(), {...capsule, count: 0}), null);
});

test('the caption names the turn being chosen, the turn playing, and the last turn once the battle is over', () => {
  assert.equal(shownTurn({turn: 0, finished: false}, false), 1, 'before the first move');
  assert.equal(shownTurn({turn: 0, finished: false}, true), 1, 'the opening switch-in plays before any turn');
  assert.equal(shownTurn({turn: 1, finished: false}, true), 1, 'the first turn plays');
  assert.equal(shownTurn({turn: 1, finished: false}, false), 2, 'the second turn is being chosen');
  assert.equal(shownTurn({turn: 4, finished: true}, false), 4, 'the result names the last turn');
});
