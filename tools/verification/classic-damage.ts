import assert from 'node:assert/strict';
import { createBattle } from '../../battle/core/src/battle.ts';
import { buildDataSet } from '../../battle/core/src/data.ts';
import type { Category } from '../../battle/core/src/types.ts';
import { battleEventText } from '../../src/features/battle/battle-log.ts';

const stats = { hp: 2000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
function fixture(category: Category = 'physical', options: { misses?: boolean; multi?: boolean; immuneCrit?: boolean; blockClear?: boolean; shield?: boolean } = {}) {
  const data = buildDataSet({
    species: [{ id: 1, name: { zh: 'Attacker' }, types: ['normal'], base: stats }, { id: 2, name: { zh: 'Defender' }, types: ['normal'], base: stats }],
    skills: [
      { id: 1, name: { zh: 'Critical attack' }, type: 'normal', category, power: 100, accuracy: options.misses ? 0 : null, pp: 20, crit_rate: 16, effects: options.multi ? [{ op: 'multi_hit', min: 3, max: 3 }] : [] },
      { id: 2, name: { zh: 'Wait' }, type: 'normal', category: 'status', target: 'self', power: 0, accuracy: null, pp: 20 },
    ],
    types: { chart: { normal: { normal: 1 } } },
  });
  const battle = createBattle({ data, seed: 17, scripts: { block_clear: { hook: c => c.clear ? false : undefined } }, sides: [
    { kind: 'player', team: [{ species: 1, level: 50, skills: [1], stats: { ...stats, spe: 200 } }] },
    { kind: 'wild', rules: options.immuneCrit ? [{ rule: 'immune_crit' }] : [], ai: { kind: 'sequence', skills: [2] }, team: [{ species: 2, level: 50, skills: [2], stats: { ...stats, spe: 1 } }] },
  ] });
  const user = battle.active(0), target = battle.active(1);
  user.stages.atk = user.stages.spa = -1;
  target.stages.def = 2; target.stages.spd = 3; target.stages.atk = 4;
  if (options.blockClear) target.conditions.push({ id: 'block', def: { id: 'block', hooks: [{ on: 'on_stage_incoming', script: 'block_clear' }] }, turns: Infinity, appliedTurn: 0 });
  if (options.shield) target.conditions.push({ id: 'shield', def: { id: 'shield', hooks: [{ on: 'modify_damage_taken', multiplier: 0 }] }, turns: Infinity, appliedTurn: 0 });
  return { battle, data, user, target, run: () => { battle.submit(0, { kind: 'move', skill: 1 }); return battle.resolveTurn(); } };
}

const checked: string[] = [];
for (const category of ['physical', 'special'] as const) {
  const f = fixture(category);
  const before = f.battle.calcAttack(f.user, f.target, f.data.skills.get(1)!, {}, { estimate: true });
  const events = f.run();
  const damage = events.find(e => e.type === 'damage' && e.side === 1)!;
  // Critical damage is still computed using the original boosted defence and
  // the attacker's negative stage. Clearing happens after the powered damage.
  assert(damage.crit && damage.amount <= Math.floor(before.base * 1.5 * 2));
  assert(damage.amount >= Math.floor(before.base * 1.5 * 2 * 217 / 255));
  const cleared = category === 'physical' ? 'def' : 'spd';
  const kept = category === 'physical' ? 'spd' : 'def';
  assert.equal(f.target.stages[cleared], 0);
  assert.equal(f.target.stages[kept], kept === 'def' ? 2 : 3);
  assert.equal(f.target.stages.atk, 4);
  assert.equal(f.user.stages.atk, -1); assert.equal(f.user.stages.spa, -1);
  const clear = events.find(e => e.type === 'stat_stage' && e.reason === 'critical')!;
  assert(events.indexOf(clear) > events.indexOf(damage));
  assert(battleEventText(clear, { data: f.data, initialPlayer: { name: 'Attacker', hp: 2000, maxHp: 2000 }, initialEnemy: { name: 'Defender', hp: 2000, maxHp: 2000 } }).includes('提升已清除'));
  checked.push(`${category}: boosted defence used before corresponding positive stage clear`);
}
const weakened = fixture(); weakened.target.stages.def = -2; weakened.run(); assert.equal(weakened.target.stages.def, -2);
checked.push('negative defence retained');
for (const option of ['misses', 'immuneCrit', 'blockClear', 'shield'] as const) {
  const f = fixture('physical', { [option]: true }); const events = f.run();
  assert.equal(f.target.stages.def, 2);
  assert(!events.some(e => e.type === 'stat_stage' && e.reason === 'critical'));
  if (option === 'immuneCrit') assert(events.filter(e => e.type === 'damage').every(e => !e.crit));
  checked.push(`${option}: no critical defence clear`);
}
const multi = fixture('physical', { multi: true });
const base = multi.battle.calcAttack(multi.user, multi.target, multi.data.skills.get(1)!, {}, { estimate: true }).base;
const multiEvents = multi.run(), hits = multiEvents.filter(e => e.type === 'damage' && e.side === 1);
assert.equal(hits.length, 3); assert(hits.every(e => e.amount <= Math.floor(base * 1.5 * 2)));
assert.equal(multiEvents.filter(e => e.reason === 'critical').length, 1);
assert(multiEvents.indexOf(multiEvents.find(e => e.reason === 'critical')!) > multiEvents.indexOf(hits[2]));
checked.push('documented multi-hit boundary: one clear after all powered hits');
console.log(JSON.stringify({ passed: checked }, null, 2));
