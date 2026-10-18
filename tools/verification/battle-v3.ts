import assert from 'node:assert/strict';
import {createBattle} from './_battle.ts';
import { buildDataSet } from '../../battle/core/src/data.ts';
import type { MonsterInput } from '../../battle/core/src/types.ts';
import { traits, traitScripts } from '../../src/domain/traits.ts';
import { groupedBattleLog } from '../../src/features/battle/battle-log.ts';

const stats = { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
const data = buildDataSet({
  species: [{ id: 1, name: { zh: '测试伙伴' }, types: ['normal'], base: stats }, { id: 2, name: { zh: '测试对手' }, types: ['normal'], base: stats }],
  skills: [
    { id: 1, name: { zh: '测试攻击' }, type: 'normal', category: 'physical', power: 300, accuracy: null, pp: 10 },
    { id: 2, name: { zh: '测试防守' }, type: 'normal', category: 'status', target: 'self', power: 0, accuracy: null, pp: 10 },
    { id: 3, name: { zh: '重击' }, type: 'normal', category: 'physical', power: 10000, accuracy: null, pp: 10 },
    {
      id: 4, name: { zh: '测试护盾' }, type: 'normal', category: 'status', target: 'self', power: 0, accuracy: null, pp: 10,
      effects: [{ op: 'add_condition', target: 'self', condition: 'test_shield', turns: 5 }],
    },
  ],
  conditions: [{ id: 'test_shield', name: { zh: '护盾' }, hooks: [] }],
  items: [{ id: 'potion', name: { zh: '测试体力药' }, battle_effects: [{ op: 'heal', target: 'self', amount: 40 }] }],
  types: { chart: { normal: { normal: 1 } } },
});
const player = (extra: Partial<MonsterInput> = {}): MonsterInput => ({ species: 1, uid: 'player', nickname: '伙伴', level: 50, skills: [1, 2], stats, ...extra });
const foe = (extra: Partial<MonsterInput> = {}): MonsterInput => ({ species: 2, nickname: '对手', level: 50, skills: [2], stats, ...extra });

const replacement = createBattle({ data, seed: 7, sides: [
  { kind: 'player', team: [player({ stats: { ...stats, spe: 200 } }), player({ uid: 'reserve', nickname: '替补' })] },
  { kind: 'wild', team: [foe({ hp: 1, stats: { ...stats, spe: 1 } }), foe({ skills: [3], stats: { ...stats, spe: 300 } })] },
] });
replacement.submit(0, { kind: 'move', skill: 1 }); replacement.resolveTurn();
assert.equal(replacement.defeated.length, 1);
replacement.submit(0, { kind: 'move', skill: 1 }); replacement.resolveTurn();
assert.equal(replacement.phase, 'replace');
assert.equal(replacement.active(0).hp, 0);
assert(replacement.legalActions(0).some(action => action.kind === 'flee'));
const retreatState = { turn: replacement.turn, rng: [...replacement.rng.s], reserveHp: replacement.sides[0].team[1].hp };
replacement.submit(0, { kind: 'flee' });
const retreatEvents = replacement.resolveTurn();
assert.deepEqual(retreatEvents.map(event => event.type), ['flee', 'battle_end']);
assert.equal(replacement.result?.reason, 'flee'); assert.equal(replacement.result?.success, false);
assert.deepEqual(replacement.result?.defeated, []);
assert.equal(replacement.turn, retreatState.turn); assert.deepEqual(replacement.rng.s, retreatState.rng);
assert.equal(replacement.sides[0].team[1].hp, retreatState.reserveHp);
assert(replacement.sides.every(side => !side.needsReplacement));
assert.deepEqual(replacement.resolveTurn(), []);

const normalRetreat = createBattle({ data, seed: 3, sides: [{ kind: 'player', team: [player()] }, { kind: 'player', team: [foe()] }] });
normalRetreat.submit(0, { kind: 'flee' }); normalRetreat.resolveTurn();
assert.equal(normalRetreat.result?.reason, 'flee'); assert.equal(normalRetreat.turn, 0);
const exhausted = createBattle({ data, seed: 3, sides: [{ kind: 'player', team: [player({ hp: 1 })] }, { kind: 'wild', team: [foe({ skills: [3], stats: { ...stats, spe: 300 } })] }] });
exhausted.submit(0, { kind: 'move', skill: 2 }); exhausted.resolveTurn();
assert.equal(exhausted.phase, 'ended'); assert.equal(exhausted.result?.reason, 'ko'); assert.equal(exhausted.result?.success, false);
assert.equal(exhausted.needsInput(0), false);

const itemBattle = createBattle({ data, seed: 11, sides: [{ kind: 'player', items: { potion: 2 }, team: [player({ hp: 110 }), player({ uid: 'reserve', nickname: '替补', hp: 50 })] }, { kind: 'wild', team: [foe()] }] });
assert.throws(() => itemBattle.submit(0, { kind: 'item', item: 'potion', target: 7 }), /illegal action/);
itemBattle.submit(0, { kind: 'item', item: 'potion', target: 1 });
const itemEvents = itemBattle.resolveTurn();
assert.equal(itemBattle.sides[0].team[1].hp, 90); assert.equal(itemBattle.active(0).hp, 110);
assert(itemEvents.some(event => event.type === 'heal' && event.slot === 1 && event.name === '替补'));
assert.equal(itemBattle.sides[0].items.potion, 1);

let critSeed = 0;
for (let seed = 1; seed <= 64; seed++) {
  const battle = createBattle({ data, seed, sides: [{ kind: 'player', team: [player()] }, { kind: 'wild', team: [foe()] }] });
  const attack = battle.calcAttack(battle.active(0), battle.active(1), data.skills.get(1)!);
  if (attack.crit) {
    const estimate = battle.calcAttack(battle.active(0), battle.active(1), data.skills.get(1)!, {}, { estimate: true });
    assert(attack.damage > estimate.damage * 1.7); critSeed = seed; break;
  }
}
assert(critSeed > 0, 'A deterministic ordinary RNG critical hit must occur.');
const critical = createBattle({ data, seed: critSeed, sides: [{ kind: 'player', team: [player()] }, { kind: 'wild', team: [foe()] }] });
// Lock speed ordering and enemy skill selection so a real resolved turn also supplies a crit event.
critical.active(0).stats.spe = 200;
critical.sides[1].ai = { kind: 'sequence', skills: [2] };
critical.submit(0, { kind: 'move', skill: 1 });
const actualCrit = critical.resolveTurn();
assert(actualCrit.some(event => event.type === 'damage' && event.crit === true));
const logContext = { data, initialPlayer: { name: '伙伴', hp: 200, maxHp: 200 }, initialEnemy: { name: '对手', hp: 200, maxHp: 200 } };
assert(groupedBattleLog(actualCrit, logContext).some(line => line.includes('测试攻击') && line.includes('致命一击') && line.includes('剩余体力')));
assert(groupedBattleLog(actualCrit, logContext).some(line => line.startsWith('伙伴使用了测试攻击。')), 'Move-event skill names must not replace the acting creature name.');
// The engine names the condition in its tick and refresh events, so the log can name it (no "技能效果" fallback).
// Poisoned, the partner uses the shield skill twice: the shield is added, then refreshed.
const residual = createBattle({ data, seed: 5, sides: [{ kind: 'player', team: [player({ skills: [4] })] }, { kind: 'wild', team: [foe()] }] });
assert(residual.applyStatus(residual.active(0), 'poison', {}));
const residualEvents = [1, 2].flatMap(() => { residual.submit(0, { kind: 'move', skill: 4 }); return residual.resolveTurn(); });
const residualLog = groupedBattleLog(residualEvents, logContext);
assert.deepEqual(residualEvents.find(event => event.type === 'condition_tick'),
  { type: 'condition_tick', side: 0, slot: 0, name: '伙伴', conditionName: '中毒', condition: 'poison' });
assert(residualLog.includes('伙伴的中毒在回合结束时生效。　伙伴因中毒受到 25 点伤害。剩余体力 175/200。'), residualLog.join('\n'));
assert.deepEqual(residualEvents.find(event => event.type === 'condition_refreshed'),
  { type: 'condition_refreshed', side: 0, slot: 0, name: '伙伴', conditionName: '护盾', condition: 'test_shield', turns: 5 });
assert(residualLog.includes('伙伴使用了测试护盾。　伙伴的护盾效果更新为 5 回合。'), residualLog.join('\n'));

const precision = traits.find(trait => trait.id === '1023')!;
const resistance = traits.find(trait => trait.id === '1063')!;
assert(precision.implemented && resistance.implemented && precision.calibration && resistance.calibration);
const calibrated = createBattle({ data, scripts: traitScripts, seed: 21, sides: [{ kind: 'player', team: [player()] }, { kind: 'wild', team: [foe()] }] });
calibrated.active(1).conditions.push({ id: resistance.id, def: { id: resistance.id, hooks: resistance.hooks }, turns: Infinity, appliedTurn: 0 });
for (let draw = 0; draw < 24; draw++) assert.equal(calibrated.calcAttack(calibrated.active(0), calibrated.active(1), data.skills.get(1)!).crit, false);
calibrated.active(0).conditions.push({ id: precision.id, def: { id: precision.id, hooks: precision.hooks }, turns: Infinity, appliedTurn: 0 });
assert.equal(precision.hooks[0].add, 1);
console.log(JSON.stringify({ passed: ['forced-replacement retreat', 'normal retreat without opposing input', 'empty-party defeat', 'validated bench item target', 'ordinary RNG critical hit and multiplier', 'grouped critical and residual logs', 'explicit critical-trait calibration'], ordinaryCriticalSeed: critSeed }));
