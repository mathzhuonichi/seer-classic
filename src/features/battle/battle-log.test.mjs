import assert from 'node:assert/strict';
import test from 'node:test';
import {battleEventText} from './battle-log.ts';

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
