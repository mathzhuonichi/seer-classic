// One number and one line per move and creature (design/notes/damage-display-2026-10-23.md), through the frames and the log.
import assert from 'node:assert/strict';
import test from 'node:test';
import {groupedBattleLog} from './battle-log.ts';
import {eventFrames} from './battle-presentation.ts';

const NAMES = ['巴鲁斯', '布布花'];
const MULTI = 1, RIDER = 2, FOE_MOVE = 3, SLEEP = 4;
const skill = (id, zh, category = 'physical') => [id, {id, name: {zh}, category, target: 'foe'}];
const data = {species: new Map(), items: new Map(), types: {chart: {}},
  skills: new Map([skill(MULTI, '三连击'), skill(RIDER, '龙之怒'), skill(FOE_MOVE, '撞击'), skill(SLEEP, '催眠粉', 'status')])};
const view = (side, maxHp) => ({
  uid: `${side}-0`, slot: 0, species: side + 1, name: NAMES[side], level: 50, hp: maxHp, maxHp, fainted: false, types: ['普通'], typeIds: ['normal'],
  portrait: '', skills: [], statuses: [], stages: {},
});

const used = (side, id) => ({type: 'move_used', side, skill: id, name: data.skills.get(id).name.zh});
/** `amount` lost by side `side`'s creature of `maxHp`, leaving `hp`. */
const hurt = (side, amount, hp, extra = {}) => ({
  type: 'damage', side, slot: 0, name: NAMES[side], amount, overkill: 0, hp, maxHp: 100, kind: 'attack', crit: false, ...extra,
});

/** The frames and the log of `events`; `hits` is what each hit frame shows: its number, the HP bar it hurts and its line. */
function show(events, maxHp = [100, 100]) {
  const player = view(0, maxHp[0]), enemy = view(1, maxHp[1]);
  let id = 0;
  const frames = eventFrames(events, {player, enemy, party: [player], enemyParty: [enemy]},
    {data, hideEnemyHp: false, challenge: true, transformedSlots: new Set(), nextFrameId: () => ++id});
  const hits = frames.filter(frame => frame.kind === 'hit').map(frame => ({
    id: frame.id, side: frame.side, amount: frame.amount, numberId: frame.numberId, hp: frame.side ? frame.enemyHp : frame.playerHp, text: frame.text,
  }));
  return {frames, hits, log: groupedBattleLog(events, {data, initialPlayer: player, initialEnemy: enemy})};
}

test('a multi-hit move is one number on its target that counts up with each hurt, and one line of the total', () => {
  const {hits, log} = show([used(0, MULTI), hurt(1, 30, 70), hurt(1, 31, 39), hurt(1, 32, 7), {type: 'multi_hit', side: 0, hits: 3}]);
  assert.deepEqual(hits, [
    {id: 2, side: 1, amount: 30, numberId: undefined, hp: 70, text: ''},
    {id: 3, side: 1, amount: 61, numberId: 2, hp: 39, text: ''},
    {id: 4, side: 1, amount: 93, numberId: 2, hp: 7, text: '布布花受到 93 点伤害。剩余体力 7/100。'},
  ]);
  assert.deepEqual(log, ['巴鲁斯使用了三连击。　布布花受到 93 点伤害。剩余体力 7/100。']);
});

test('a move\'s rider joins its hit, a critical hit makes the total critical, and a line between them keeps its place', () => {
  const {frames, hits, log} = show([
    used(0, RIDER), hurt(1, 40, 60, {crit: true}), {type: 'stat_stage', side: 1, stat: 'def', delta: -1, stage: 0, name: '布布花', reason: 'critical'},
    hurt(1, 40, 20, {kind: 'fixed', sourceSide: 0, skill: RIDER}),
  ]);
  assert.deepEqual(hits.map(({amount, numberId, text}) => [amount, numberId, text]),
    [[40, undefined, ''], [80, 2, '布布花受到 80 点伤害，致命一击！剩余体力 20/100。']]);
  assert.deepEqual(frames.filter(frame => frame.kind === 'hit').map(frame => frame.critical), [true, false], 'each hurt keeps its own impact');
  assert.deepEqual(log, ['巴鲁斯使用了龙之怒。　布布花受到 80 点伤害，致命一击！剩余体力 20/100。　致命一击破防，布布花的防御提升已清除。']);
});

test('recoil shows on the user as its own number, apart from the target\'s', () => {
  const {hits, log} = show([used(0, MULTI), hurt(1, 50, 50), hurt(0, 12, 88, {kind: 'fixed'})]);
  assert.deepEqual(hits.map(({side, amount, numberId}) => [side, amount, numberId]), [[1, 50, undefined], [0, 12, undefined]]);
  assert.deepEqual(log, ['巴鲁斯使用了三连击。　布布花受到 50 点伤害。剩余体力 50/100。　巴鲁斯受到 12 点伤害。剩余体力 88/100。']);
});

test('counters to each hit are one number on the attacker that shows with the hits, while the hits are one on the target', () => {
  const counter = (amount, hp) => hurt(0, amount, hp, {kind: 'fixed', sourceSide: 1});
  const {frames, hits, log} = show([used(0, MULTI), hurt(1, 20, 80), counter(5, 95), hurt(1, 20, 60), counter(5, 90)]);
  assert.deepEqual(frames.map(frame => [frame.kind, frame.side]), [['physical', 0], ['hit', 1], ['hit', 1]], 'no frame of their own');
  assert.deepEqual(frames.slice(1).map(({id, amount, numberId, counter, playerHp, enemyHp}) => [id, amount, numberId, counter, playerHp, enemyHp]), [
    [2, 20, undefined, {id: 3, amount: 5, numberId: undefined}, 95, 80],
    [4, 40, 2, {id: 5, amount: 10, numberId: 3}, 90, 60],
  ], 'each hit carries the counter it drew: the attacker\'s number so far and both HP bars after it');
  assert.deepEqual(hits.map(hit => hit.text), ['', '布布花受到 40 点伤害。剩余体力 60/100。　巴鲁斯受到 10 点伤害。剩余体力 90/100。']);
  assert.deepEqual(log, ['巴鲁斯使用了三连击。　布布花受到 40 点伤害。剩余体力 60/100。　巴鲁斯受到 10 点伤害。剩余体力 90/100。']);
});

test('a counter needs the hit straight before it; recoil, a line between and the foe\'s own damage keep frames of their own', () => {
  const counter = (amount, hp) => hurt(0, amount, hp, {kind: 'fixed', sourceSide: 1});
  const cured = {type: 'condition_removed', side: 1, condition: 'sleep', reason: 'cured', name: '布布花'};
  const {frames} = show([used(0, MULTI), hurt(1, 20, 80), cured, counter(5, 95), hurt(1, 20, 60), counter(5, 90), counter(3, 87),
    hurt(0, 4, 83, {kind: 'fixed'}), used(1, FOE_MOVE), hurt(0, 9, 74, {sourceSide: 1, skill: FOE_MOVE})]);
  assert.deepEqual(frames.map(({id, kind, side, amount, numberId, counter}) => [id, kind, side, amount, numberId, counter?.amount]), [
    [1, 'physical', 0, undefined, undefined, undefined], [2, 'hit', 1, 20, undefined, undefined], [3, 'message', 1, undefined, undefined, undefined],
    [4, 'hit', 0, 5, undefined, undefined], [5, 'hit', 1, 40, 2, 13], [7, 'hit', 0, 17, 4, undefined],
    [8, 'physical', 1, undefined, undefined, undefined], [9, 'hit', 0, 9, undefined, undefined],
  ], 'after a line the counter is a hit of its own; two counters to one hit are one; recoil and the next move stand alone');
  assert.equal(frames[4].counter.numberId, 4, 'the folded counters count up the attacker\'s number that the first one started');
});

test('status damage and other turn-end damage stand alone, also right after the creature\'s own move', () => {
  const {hits, log} = show([
    used(1, FOE_MOVE), hurt(0, 30, 70, {sourceSide: 1, skill: FOE_MOVE}),
    {type: 'turn_end', turn: 1},
    {type: 'condition_tick', side: 1, slot: 0, name: '布布花', conditionName: '中毒', condition: 'poison'},
    hurt(1, 12, 88, {kind: 'percent', status: 'poison'}),
    // A Boss's drain_each_turn: no tick and the Boss as its source, just like the move's damage before.
    hurt(0, 10, 60, {kind: 'fixed', sourceSide: 1}),
  ]);
  assert.deepEqual(hits.map(({side, amount, numberId}) => [side, amount, numberId]), [[0, 30, undefined], [1, 12, undefined], [0, 10, undefined]]);
  assert.deepEqual(log, [
    '布布花使用了撞击。　巴鲁斯受到 30 点伤害。剩余体力 70/100。',
    '布布花的中毒在回合结束时生效。　布布花因中毒受到 12 点伤害。剩余体力 88/100。　巴鲁斯受到 10 点伤害。剩余体力 60/100。',
  ]);
});

test('the turn\'s end opens no log entry: its damage before any tick joins the last move\'s entry, as its own number', () => {
  const {hits, log} = show([
    used(0, MULTI), hurt(1, 20, 80), used(1, FOE_MOVE), hurt(0, 30, 70, {sourceSide: 1, skill: FOE_MOVE}),
    {type: 'turn_end', turn: 1}, hurt(0, 10, 60, {kind: 'fixed', sourceSide: 1}),
  ]);
  assert.deepEqual(hits.map(({side, amount, numberId}) => [side, amount, numberId]), [[1, 20, undefined], [0, 30, undefined], [0, 10, undefined]]);
  assert.deepEqual(log, [
    '巴鲁斯使用了三连击。　布布花受到 20 点伤害。剩余体力 80/100。',
    '布布花使用了撞击。　巴鲁斯受到 30 点伤害。剩余体力 70/100。　巴鲁斯受到 10 点伤害。剩余体力 60/100。',
  ]);
});

test('a lethal multi-hit shows its total with the damage beyond the HP left, while the HP bar stops at 0', () => {
  const {hits, log} = show([
    used(0, MULTI), hurt(1, 260, 40, {maxHp: 300}), hurt(1, 40, 0, {maxHp: 300, overkill: 202}),
    {type: 'faint', side: 1, slot: 0, species: 2, by: {side: 0, skill: MULTI, crit: false}}, {type: 'multi_hit', side: 0, hits: 2},
  ], [100, 300]);
  assert.deepEqual(hits.map(({amount, hp, text}) => [amount, hp, text]), [[260, 40, ''], [502, 0, '布布花受到 502 点伤害。剩余体力 0/300。']]);
  assert.deepEqual(log, ['巴鲁斯使用了三连击。　布布花受到 502 点伤害。剩余体力 0/300。　布布花失去战斗能力。']);
});

test('a missed multi-hit shows MISS and no number, a blocked hit leaves the move\'s number counting, and the next move starts its own', () => {
  const missed = show([used(0, MULTI), {type: 'miss', side: 0, skill: MULTI}, used(1, FOE_MOVE), hurt(0, 9, 91)]);
  assert.deepEqual(missed.hits.map(({side, amount, numberId}) => [side, amount, numberId]), [[0, 9, undefined]]);
  assert.deepEqual(missed.frames.filter(frame => frame.kind === 'miss').map(({side, text, amount}) => [side, text, amount]),
    [[1, '巴鲁斯的三连击没有命中。', undefined]], 'on the target, with the line');
  assert.deepEqual(missed.log, ['巴鲁斯使用了三连击。　巴鲁斯的三连击没有命中。', '布布花使用了撞击。　巴鲁斯受到 9 点伤害。剩余体力 91/100。']);
  const blocked = show([used(0, MULTI), hurt(1, 30, 70), {type: 'damage_blocked', side: 1, rule: 'invulnerable'}, hurt(1, 31, 39),
    used(0, MULTI), hurt(1, 8, 31)]);
  assert.deepEqual(blocked.hits.map(({amount, numberId}) => [amount, numberId]), [[30, undefined], [61, 2], [8, undefined]]);
  assert.deepEqual(blocked.log, ['巴鲁斯使用了三连击。　布布花受到 61 点伤害。剩余体力 39/100。　布布花抵挡了部分伤害。',
    '巴鲁斯使用了三连击。　布布花受到 8 点伤害。剩余体力 31/100。']);
});

test('a missed status move shows MISS on its target too, and so does the foe\'s miss on the player', () => {
  const {frames, log} = show([used(0, SLEEP), {type: 'miss', side: 0, skill: SLEEP}, used(1, FOE_MOVE), {type: 'miss', side: 1, skill: FOE_MOVE}]);
  assert.deepEqual(frames.map(({kind, side}) => [kind, side]), [['status', 0], ['miss', 1], ['physical', 1], ['miss', 0]]);
  assert.deepEqual(log, ['巴鲁斯使用了催眠粉。　巴鲁斯的催眠粉没有命中。', '布布花使用了撞击。　布布花的撞击没有命中。']);
});

test('a move\'s blocked hits on one creature are one line: all of them stopped, or a part when some damage got through', () => {
  const block = side => ({type: 'damage_blocked', side, rule: 'no_repeat_type'});
  const lines = ({frames}) => frames.map(frame => frame.text).filter(Boolean);
  const all = show([used(0, MULTI), block(1), block(1), block(1), {type: 'multi_hit', side: 0, hits: 3}]);
  assert.deepEqual(lines(all), ['巴鲁斯使用了三连击。', '布布花抵挡了这次伤害。'], 'one line and one frame for the three');
  assert.deepEqual(all.log, ['巴鲁斯使用了三连击。　布布花抵挡了这次伤害。']);
  const some = show([used(0, MULTI), hurt(1, 30, 70), block(1), block(1), used(1, FOE_MOVE), {type: 'protected', side: 0}]);
  assert.deepEqual(lines(some), ['巴鲁斯使用了三连击。', '布布花受到 30 点伤害。剩余体力 70/100。', '布布花抵挡了部分伤害。', '布布花使用了撞击。', '巴鲁斯抵挡了这次伤害。']);
  assert.deepEqual(some.log, ['巴鲁斯使用了三连击。　布布花受到 30 点伤害。剩余体力 70/100。　布布花抵挡了部分伤害。', '布布花使用了撞击。　巴鲁斯抵挡了这次伤害。']);
  const rider = show([used(0, RIDER), block(1), hurt(1, 40, 60, {kind: 'fixed', sourceSide: 0, skill: RIDER})]);
  assert.deepEqual(rider.log, ['巴鲁斯使用了龙之怒。　布布花抵挡了部分伤害。　布布花受到 40 点伤害。剩余体力 60/100。'], 'a rider after the block');
  const apart = show([{type: 'turn_end', turn: 1}, block(1), block(1)]);
  assert.deepEqual(apart.log, ['布布花抵挡了这次伤害。　布布花抵挡了这次伤害。'], 'outside a move each block stands alone');
});

test('a heal or a life between the hits starts a new number, so the number never runs past what the HP bar shows', () => {
  const {hits} = show([used(0, MULTI), hurt(1, 100, 0, {overkill: 20}),
    {type: 'revive', side: 1, slot: 0, name: '布布花', hp: 100, maxHp: 100, reason: 'lives', livesLeft: 0}, hurt(1, 30, 70),
    {type: 'heal', side: 1, slot: 0, name: '布布花', amount: 30, hp: 100, maxHp: 100, reason: 'heal_full_below'}, hurt(1, 25, 75)]);
  assert.deepEqual(hits.map(({id, amount, numberId, hp}) => [id, amount, numberId, hp]),
    [[2, 120, undefined, 0], [4, 30, undefined, 70], [6, 25, undefined, 75]]);
});
