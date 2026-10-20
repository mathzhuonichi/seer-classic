import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {BUILTIN_CONDITIONS} from '../../battle/core/src/builtin-conditions.ts';
import {NO_EFFECT_TEXT,countRange,effectText,powerText,priorityTag,skillDescription,skillFacts,skillHits} from './skill-text.ts';

const read = file => JSON.parse(fs.readFileSync(new URL(`../../data/${file}`, import.meta.url), 'utf8'));
const skills = read('skills.json');
const conditions = new Map([...BUILTIN_CONDITIONS, ...read('conditions.json')].map(row => [row.id, row.name?.zh]));
const conditionName = id => conditions.get(id);
const skill = id => skills.find(row => row.id === id);
const describe = row => skillDescription(row, conditionName);

test('counts, power, priority and the facts of a detail card', () => {
  assert.deepEqual([countRange(2, 3), countRange(5, 5)], ['2～3', '5']);
  assert.deepEqual([powerText({power: 55, hits: {min: 2, max: 3}}), powerText({power: 90}), powerText({power: 0})], ['55×2～3', '90', '—']);
  assert.deepEqual([priorityTag(1), priorityTag(-6)], ['先制+1', '先制-6']);
  const plain = {id: 1, name: '撞击', type: '普通', category: '物理', power: 35, pp: 30, maxPp: 35, accuracy: 95, priority: 0, critRate: 1, description: ''};
  assert.deepEqual(skillFacts(plain), [['威力', '35'], ['命中', '95'], ['PP', '30/35']]);
  assert.deepEqual(skillFacts({...plain, power: 0, accuracy: null, priority: 2, critRate: 4, hits: {min: 2, max: 5}}),
    [['威力', '—'], ['命中', '必中'], ['PP', '30/35'], ['连击', '2～5 次'], ['先制', '+2'], ['致命一击', '4/16']]);
});

test('a skill the catalog leaves undescribed reads its effects in words', () => {
  assert.deepEqual(skillHits(skill(10238)), {min: 2, max: 3}, '千叶斩 hits two or three times');
  assert.equal(skillHits(skill(10001)), undefined);
  assert.equal(describe(skill(10238)), '连续攻击 2～3 次');
  assert.equal(describe(skill(12062)), '3 回合内自身火系伤害减半', '水冰决');
  assert.equal(describe(skill(20295)), '4～5 回合内自身反弹1/3伤害', '心灵共鸣');
  assert.equal(describe(skill(10001)), '', '撞击 has no effect besides its damage');
  assert.deepEqual([effectText({description: ''}), effectText({description: '连续攻击 2 次'})], [NO_EFFECT_TEXT, '连续攻击 2 次']);
  const described = skills.find(row => row.desc.zh && row.effects.some(op => op.op === 'multi_hit'));
  assert.equal(describe(described), described.desc.zh, 'the catalog description stands as it is');
  assert.equal(describe({effects: [{op: 'multi_hit', min: 2, max: 2}, {op: 'add_condition', target: 'foe', condition: 'cond_sure_hit', chance: 30}]}),
    '连续攻击 2 次；30%概率对方攻击必定命中');
});

test('every catalog skill with an effect has a description, and each op of an undescribed skill is worded', () => {
  const missing = skills.filter(row => row.effects.length && !describe(row)).map(row => row.id);
  assert.deepEqual(missing, [], 'skills with effects but no text');
  const unworded = skills.filter(row => !row.desc?.zh?.trim())
    .flatMap(row => row.effects.filter(op => !describe({effects: [op]})).map(op => `${row.id}:${op.op}`));
  assert.deepEqual(unworded, [], 'ops of undescribed skills that no sentence states');
});
