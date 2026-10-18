import assert from 'node:assert/strict';
import test from 'node:test';
import {battleEndSound, battleItemPane, battleSkills, conditionSummary, recentBattleLog, settledDialogue, stageChips} from './battle-hud.ts';

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
});

test('the item pane falls back to recovery without capture and resolves its target', () => {
  const inventory = [
    {id: 'cap', battleCategory: 'capsule', count: 1}, {id: 'pot', battleCategory: 'recovery', count: 2, usableTargetUids: ['c']},
    {id: 'empty', battleCategory: 'recovery', count: 0},
    {id: 'revive', battleCategory: 'recovery', unlimited: true, count: 0, targetMode: 'fainted', usableTargetUids: ['b']},
  ];
  const open = battleItemPane(battle(), inventory, {category: 'recovery', selection: '', target: 'zzz'});
  assert.deepEqual(open.items.map(item => item.id), ['pot', 'revive']);
  assert.deepEqual([open.selected.id, open.target.uid, open.helpsTarget], ['pot', 'a', false]);
  const revive = battleItemPane(battle(), inventory, {category: 'recovery', selection: 'revive', target: 'a'});
  assert.deepEqual([revive.targets.map(m => m.uid), revive.target.uid, revive.helpsTarget], [['b'], 'b', true]);
  const blocked = battleItemPane(battle({canCapture: false}), inventory, {category: 'capsule', selection: '', target: 'a'});
  assert.deepEqual([blocked.category, blocked.categories.map(c => c.id)], ['recovery', ['recovery', 'status']]);
  assert.equal(battleItemPane(battle(), [], {category: 'status', selection: '', target: 'a'}).empty, '暂无异常解除道具。');
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
