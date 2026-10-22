import assert from 'node:assert/strict';
import {createBattle} from './_battle.ts';
import { buildDataSet } from '../../battle/core/src/data.ts';
import type { Battle } from '../../battle/core/src/index.ts';
import type { Mon } from '../../battle/core/src/engine/state.ts';
import type { BattleEvent } from '../../battle/core/src/events.ts';
import type { MonsterInput } from '../../battle/core/src/types.ts';
import { SEER_SCRIPTS } from '../../battle/core/src/scripts/index.ts';
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
    // Classic trait fixtures (design/notes/classic-traits-2026-10-21.md).
    { id: 5, name: { zh: '必暴攻击' }, type: 'normal', category: 'physical', power: 100, accuracy: null, pp: 10, crit_rate: 16 },
    {
      id: 6, name: { zh: '可闪避攻击' }, type: 'normal', category: 'physical', power: 100, accuracy: 95, pp: 10,
      effects: [{ op: 'stat_stage', target: 'foe', stats: { def: -1 } }],
    },
    { id: 7, name: { zh: '降攻' }, type: 'normal', category: 'status', target: 'foe', power: 0, accuracy: null, pp: 10, effects: [{ op: 'stat_stage', target: 'foe', stats: { atk: -1 } }] },
    { id: 8, name: { zh: '必失攻击' }, type: 'normal', category: 'physical', power: 100, accuracy: 0, pp: 10 },
    { id: 9, name: { zh: '秒杀' }, type: 'normal', category: 'status', target: 'foe', power: 0, accuracy: null, pp: 10, effects: [{ op: 'ohko' }] },
  ],
  conditions: [{ id: 'test_shield', name: { zh: '护盾' }, hooks: [] }, { id: 'test_protect', name: { zh: '守护' }, hooks: [{ on: 'block_move' }] }],
  items: [
    { id: 'potion', name: { zh: '测试体力药' }, battle_effects: [{ op: 'heal', target: 'self', amount: 40 }] },
    { id: 'capsule', name: { zh: '测试胶囊' }, capture_multiplier: null },
  ],
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

// A capture ends a wild battle as the player's win; the caught foe was not knocked out, so it has no defeated entry.
const caught = createBattle({ data, seed: 13, sides: [{ kind: 'player', items: { capsule: 1 }, team: [player()] }, { kind: 'wild', team: [foe()] }] });
caught.submit(0, { kind: 'capture', item: 'capsule' }); caught.resolveTurn();
assert.deepEqual([caught.result?.winner, caught.result?.reason, caught.result?.success, caught.result?.defeated], [0, 'capture', true, []]);

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
calibrated.active(0).conditions.push({ id: precision.id, def: { id: precision.id, hooks: precision.hooks }, turns: Infinity, appliedTurn: 0 });
assert.equal(precision.hooks[0].add, 1);
classicTraitChecks();
console.log(JSON.stringify({ passed: [
  'forced-replacement retreat', 'normal retreat without opposing input', 'empty-party defeat', 'validated bench item target', 'a capture is a successful win',
  'ordinary RNG critical hit and multiplier', 'grouped critical and residual logs', 'explicit critical-trait calibration',
  '免爆 zeroes a critical hit at 1/16 and leaves the crit rate', '反击类 rise when any foe move reaches the holder',
  '回神 only on foe-move damage, 0 HP included', '虚无 dodges non-必中 attacking skills only',
], ordinaryCriticalSeed: critSeed }));

/** A trait attached as battle-setup attaches it: a permanent condition `trait-<id>`. */
function withTrait(mon: Mon, id: string): void {
  const trait = traits.find(row => row.id === id)!;
  mon.conditions.push({ id: `trait-${id}`, def: { id: `trait-${id}`, hooks: trait.hooks, removed_on_switch: false }, turns: Infinity, appliedTurn: 0 });
}

/**
 * The player's partner holds trait `id` against a wild foe with `skills`; `use` makes the foe use one of them on the holder.
 * `chance` decides every uncertain percent draw (a 0% or 100% event keeps its outcome).
 */
function traitDuel(id: string, chance: boolean | undefined, skills: number[], seed = 31) {
  const b: Battle = createBattle({ data, scripts: { ...SEER_SCRIPTS, ...traitScripts }, seed, sides: [
    { kind: 'player', team: [player({ skills: [2] })] }, { kind: 'wild', team: [foe({ skills })] },
  ] });
  const holder = b.active(0), attacker = b.active(1);
  withTrait(holder, id);
  const draw = b.rng.chance.bind(b.rng);
  if (chance !== undefined) b.rng.chance = (pct: number) => (pct <= 0 || pct >= 100 ? draw(pct) : chance);
  const use = (skill: number): BattleEvent[] => {
    const mark = b.out.length;
    b.useMove(attacker, holder, data.skills.get(skill)!, true);
    return b.out.slice(mark);
  };
  return { b, holder, attacker, use };
}

function classicTraitChecks(): void {
  // 免爆 (Eid 64): 1/16 of the critical hits it takes deal 0; the zeroed hit clears no defence stage.
  const zeroed = traitDuel('1063', true, [5]);
  zeroed.holder.stages.def = 2;
  const zeroedHit = zeroed.use(5).find(event => event.type === 'damage');
  assert(zeroedHit?.type === 'damage' && zeroedHit.crit && zeroedHit.amount === 0, JSON.stringify(zeroedHit));
  assert.equal(zeroed.holder.stages.def, 2, 'a zeroed critical hit keeps the defence boost');
  const through = traitDuel('1063', false, [5]);
  through.holder.stages.def = 2;
  const throughHit = through.use(5).find(event => event.type === 'damage');
  assert(throughHit?.type === 'damage' && throughHit.crit && throughHit.amount > 0, JSON.stringify(throughHit));
  assert.equal(through.holder.stages.def, 0, 'an ordinary critical hit clears the defence boost');
  // The holder no longer lowers the crit rate: some seed crits a crit_rate 1 skill against it.
  const crits = Array.from({ length: 64 }, (_, seed) => traitDuel('1063', undefined, [1], seed + 1))
    .some(duel => duel.b.calcAttack(duel.attacker, duel.holder, data.skills.get(1)!).crit);
  assert(crits, '免爆 leaves the 1/16 crit rate');

  // 反击类 (Eid 35): any foe move that reaches the holder, before its damage and effects.
  const status = traitDuel('1041', true, [7]);
  const statusEvents = status.use(7).filter(event => event.type === 'stat_stage');
  assert.deepEqual(statusEvents.map(event => event.type === 'stat_stage' && event.delta), [1, -1], 'the raise comes before the move\'s effect');
  assert.equal(status.holder.stages.atk, 0);
  const snapshot = traitDuel('1042', true, [1]);
  snapshot.use(1);
  const hit = snapshot.b.journal.find(entry => entry.type === 'hit');
  assert(hit?.type === 'hit' && hit.defender.stages.def === 1, '抵抗 raises defence before the damage');
  for (const [name, setup, skill] of [
    ['a miss', () => {}, 8], ['a self-targeting status move', () => {}, 2],
    ['protection', (d: ReturnType<typeof traitDuel>) => { d.b.addCondition(d.holder, data.conditions.get('test_protect')!); }, 1],
    ['物理闪避', (d: ReturnType<typeof traitDuel>) => { d.b.callScript('seer_eff_78', { user: d.holder, foe: d.attacker }, [3]); }, 6],
  ] as const) {
    const duel = traitDuel('1041', true, [skill]);
    setup(duel);
    duel.use(skill);
    assert.equal(duel.holder.stages.atk, 0, `no raise after ${name}`);
  }

  // 回神 (Eid 33): from the foe's move only, and at 0 HP too; not from damage over time, recoil, self-costs or ohko.
  const knocked = traitDuel('1028', true, [3]);
  const knockedEvents = knocked.use(3);
  assert.equal(knocked.holder.hp, knocked.holder.maxHp);
  assert(!knockedEvents.some(event => event.type === 'faint') && knocked.b.result === null, 'a heal at 0 HP prevents the knockout');
  const ticks = traitDuel('1028', true, [2]);
  ticks.holder.hp = 40;
  ticks.b.applyStatus(ticks.holder, 'poison', {});
  ticks.b.submit(0, { kind: 'move', skill: 2 });
  ticks.b.resolveTurn();
  assert.equal(ticks.holder.hp, 15, 'a poison tick to 1/8 or below does not heal');
  const own = traitDuel('1028', true, [2]);
  own.holder.hp = 30;
  own.b.dealDamage(own.holder, 10, { kind: 'fixed' });
  own.b.dealDamage(own.holder, 3, { kind: 'fixed', source: own.holder, skill: data.skills.get(1) });
  own.b.dealDamage(own.holder, 2, { kind: 'true' });
  assert.equal(own.holder.hp, 15, 'recoil and self-costs do not heal');
  const ohko = traitDuel('1028', true, [9]);
  ohko.use(9);
  assert(ohko.holder.fainted, 'an ohko move is not undone');

  // 虚无 (Eid 61): dodges the foe's non-必中 attacking skills as a miss; damage over time is never blocked.
  const dodged = traitDuel('1060', true, [6]);
  const dodgedEvents = dodged.use(6);
  assert(dodgedEvents.some(event => event.type === 'miss') && !dodgedEvents.some(event => event.type === 'damage'));
  assert.equal(dodged.holder.stages.def, 0, 'a dodged attack applies none of its effects');
  const sure = traitDuel('1060', true, [1]);
  assert(sure.use(1).some(event => event.type === 'damage' && event.side === 0 && event.amount > 0), 'a 必中 attack lands');
  const statusMove = traitDuel('1060', true, [7]);
  statusMove.use(7);
  assert.equal(statusMove.holder.stages.atk, -1, 'a status move is not dodged');
  const poisoned = traitDuel('1060', true, [2]);
  poisoned.b.applyStatus(poisoned.holder, 'poison', {});
  poisoned.b.submit(0, { kind: 'move', skill: 2 });
  poisoned.b.resolveTurn();
  assert.equal(poisoned.holder.hp, poisoned.holder.maxHp - poisoned.holder.maxHp / 8, 'a poison tick deals its 1/8');
}
