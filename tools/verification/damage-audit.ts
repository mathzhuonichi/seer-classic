import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBattle, type Battle } from '../../battle/core/src/battle.ts';
import { buildDataSet } from '../../battle/core/src/data.ts';
import { effectiveness } from '../../battle/core/src/typechart.ts';
import { SEER_SCRIPTS } from '../../battle/core/src/scripts/index.ts';
import type { BossRule, ConditionDef, ScriptRegistry, Skill, Stats } from '../../battle/core/src/types.ts';
import { traits, traitScripts } from '../../src/mechanics/traits.ts';

/** Focused damage audit. Run through Vite SSR; fixtures never load or modify a save. */
export function runDamageAudit(factory: typeof createBattle = createBattle, label = 'current') {
  const catalog = JSON.parse(fs.readFileSync('data/gamedata.json', 'utf8'));
  const stats: Stats = { hp: 1000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
  const skills: Skill[] = [
    { id: 1, name: { zh: '普通物攻' }, type: 'normal', category: 'physical', power: 100, accuracy: null, pp: 10 },
    { id: 2, name: { zh: '火系物攻' }, type: 'fire', category: 'physical', power: 100, accuracy: null, pp: 10 },
    { id: 3, name: { zh: '普通特攻' }, type: 'normal', category: 'special', power: 100, accuracy: null, pp: 10 },
    catalog.skills.find((s: Skill) => s.id === 20175),
  ];
  assert(skills[3], 'The actual self-sacrifice skill must be present in the catalog.');
  const data = buildDataSet({ types: catalog.types, conditions: catalog.conditions, skills, species: [
    { id: 1, name: { zh: '攻击方' }, types: ['normal'], base: stats },
    { id: 2, name: { zh: '防守方' }, types: ['normal'], base: stats },
  ] });
  const scripts: ScriptRegistry = {
    ...SEER_SCRIPTS, ...traitScripts,
    audit_half: { hook: c => c.amount / 2 },
    audit_minus: { hook: c => c.amount - 10 },
    audit_skill_half: { finalDamage: (_c, _p, amount) => amount / 2 },
  };
  const make = (rules: BossRule[] = [], playerRules: BossRule[] = []) => factory({ data, scripts, seed: 7, sides: [
    { kind: 'player', rules: playerRules, team: [
      { species: 1, level: 50, stats, skills: [1, 2, 3, 20175] },
      { species: 1, level: 50, stats, skills: [1] },
    ] },
    { kind: 'wild', rules, team: [{ species: 2, level: 50, stats, skills: [1] }] },
  ] });
  const damage = (b: Battle, amount: number) => b.dealDamage(b.active(1), amount, {
    kind: 'attack', source: b.active(0), skill: data.skills.get(1), effectiveness: 1,
  });
  const scriptCondition = (id: string, point: 'modify_damage_final' | 'modify_damage_outgoing'): ConditionDef => ({
    id, hooks: [{ on: point, script: id }],
  });
  const harden = (b: Battle, side: 0 | 1) => {
    const trait = traits.find(t => t.id === '1024')!;
    assert(trait?.implemented, 'The actual zero-star damage-reduction trait must be implemented.');
    b.addCondition(b.active(side), { id: 'audit_actual_harden', hooks: trait.hooks });
  };
  const maxRoll = (b: Battle) => { b.rng.int = (_min, max) => max; };
  const powered = (b: Battle, skill: Skill) => {
    const r = b.calcAttack(b.active(0), b.active(1), skill);
    return b.dealDamage(b.active(1), r.damage, { kind: 'attack', source: b.active(0), skill, crit: r.crit, effectiveness: r.effectiveness });
  };
  const rows: { name: string; expected: unknown; actual: unknown; passed: boolean }[] = [];
  const check = (name: string, expected: unknown, run: () => unknown) => {
    let actual: unknown;
    try { actual = run(); assert.deepEqual(actual, expected); rows.push({ name, expected, actual, passed: true }); }
    catch (error) { rows.push({ name, expected, actual: actual ?? String(error), passed: false }); }
  };

  check('last shield charge blocks the whole hit', 0, () => {
    const b = make(); b.addCondition(b.active(1), data.conditions.get('cond_block_attacks')!, undefined, undefined, 1);
    return damage(b, 100);
  });
  check('two shield charges block two hits and then expire', [0, 0, 100], () => {
    const b = make(); b.addCondition(b.active(1), data.conditions.get('cond_block_attacks')!, undefined, undefined, 2);
    return [damage(b, 100), damage(b, 100), damage(b, 100)];
  });
  check('inactive zero multiplier cannot suppress minimum damage', 1, () => {
    const b = make(); b.addCondition(b.active(1), { id: 'audit_inactive_zero', hooks: [{ on: 'modify_damage_taken', multiplier: 0, when: { skill_type: 'fire' } }] });
    return damage(b, 0.4);
  });
  check('active zero multiplier suppresses minimum damage', 0, () => {
    const b = make(); b.addCondition(b.active(1), { id: 'audit_active_zero', hooks: [{ on: 'modify_damage_taken', multiplier: 0 }] });
    return damage(b, 0.4);
  });
  check('AI ignores the catalog fire buff for a normal skill', 63, () => {
    const b = make(); b.addCondition(b.active(0), data.conditions.get('cond_fire_power_x2')!);
    return b.estimateDamage(b.active(0), b.active(1), skills[0]);
  });
  check('AI uses the active condition level', 127, () => {
    const b = make(); b.addCondition(b.active(0), { id: 'audit_leveled', hooks: [{ on: 'modify_damage_dealt', multiplier_by_level: [1.5, 2] }] }, undefined, 2);
    return b.estimateDamage(b.active(0), b.active(1), skills[0]);
  });
  check('AI estimate preserves RNG and condition charges', true, () => {
    const b = make(); b.addCondition(b.active(0), { id: 'audit_charged', hooks: [{ on: 'modify_damage_dealt', multiplier: 2, consume_charge: true }] }, undefined, undefined, 1);
    const before = JSON.stringify({ rng: b.rng.s, conditions: b.active(0).conditions });
    b.estimateDamage(b.active(0), b.active(1), skills[0]);
    return before === JSON.stringify({ rng: b.rng.s, conditions: b.active(0).conditions });
  });
  for (const point of ['modify_damage_outgoing', 'modify_damage_final'] as const) {
    check(`${point} scripts compose sequentially`, 40, () => {
      const b = make(), holder = b.active(point === 'modify_damage_outgoing' ? 0 : 1);
      b.addCondition(holder, scriptCondition('audit_half', point)); b.addCondition(holder, scriptCondition('audit_minus', point));
      return damage(b, 100);
    });
  }
  check('actual harden trait and shield budget compose', 15, () => {
    const b = make(); harden(b, 1);
    b.callScript('seer_eff_49', { user: b.active(1), foe: b.active(0) }, [80]);
    return damage(b, 100);
  });
  check('true damage bypasses condition scripts', 100, () => {
    const b = make(); b.addCondition(b.active(1), scriptCondition('audit_half', 'modify_damage_final'));
    return b.dealDamage(b.active(1), 100, { kind: 'true', source: b.active(0) });
  });
  check('true damage bypasses skill finalDamage scripts', 100, () => {
    const b = make(), skill = { ...skills[0], effects: [{ op: 'script', id: 'audit_skill_half' }] };
    return b.dealDamage(b.active(1), 100, { kind: 'true', source: b.active(0), skill });
  });
  check('actual self-sacrifice reaches zero through harden', { hp: 0, fainted: true }, () => {
    const b = make(); harden(b, 0);
    b.callScript('seer_eff_59', { user: b.active(0), foe: b.active(1) }, skills[3].effects![0].params);
    return { hp: b.active(0).hp, fainted: b.active(0).fainted };
  });
  check('true self-cost bypasses a boss HP floor', 0, () => {
    const b = make([], [{ rule: 'hp_floor_until', skills: [999] }]);
    b.dealDamage(b.active(0), 1000, { kind: 'true' }); return b.active(0).hp;
  });
  check('true foe OHKO still respects immunity', 0, () => {
    const b = make([{ rule: 'immune_ohko' }]);
    return b.dealDamage(b.active(1), 1000, { kind: 'true', ohko: true, source: b.active(0) });
  });
  check('true foe OHKO still respects an unbroken HP floor', 1, () => {
    const b = make([{ rule: 'hp_floor_until', skills: [999] }]);
    b.dealDamage(b.active(1), 1000, { kind: 'true', ohko: true, source: b.active(0) }); return b.active(1).hp;
  });
  check('fixed damage respects a per-hit cap', 30, () => {
    const b = make([{ rule: 'damage_cap_per_hit', amount: 30 }]); return b.dealDamage(b.active(1), 100, { kind: 'fixed' });
  });
  check('true damage bypasses a per-hit cap', 100, () => {
    const b = make([{ rule: 'damage_cap_per_hit', amount: 30 }]); return b.dealDamage(b.active(1), 100, { kind: 'true' });
  });
  check('damage events report HP-limited damage and overkill', [7, 93], () => {
    const b = make(); b.active(1).hp = 7;
    let observed: number[] | undefined;
    const emit = b.emit.bind(b);
    b.emit = event => { if (event.type === 'damage') observed = [event.amount, event.overkill]; emit(event); };
    damage(b, 100); return observed;
  });
  check('physical matching-type attack uses declared base and STAB', 69, () => { const b = make(); maxRoll(b); return powered(b, skills[0]); });
  check('special attack selects special attack and defence stats', 267, () => {
    const b = make(); maxRoll(b); b.active(0).stats.spa = 200; b.active(1).stats.spd = 50; return powered(b, skills[2]);
  });
  check('negative attack and positive defence stages affect base', 19, () => {
    const b = make(); maxRoll(b); b.active(0).stages.atk = -2; b.active(1).stages.def = 2; return powered(b, skills[0]);
  });
  check('critical multiplier doubles the declared damage', 138, () => { const b = make(); maxRoll(b); return powered(b, { ...skills[0], crit_rate: 16 }); });
  check('burn halves both powered attack categories', [34, 34], () => [skills[0], skills[2]].map(skill => {
    const b = make(); maxRoll(b); b.applyStatus(b.active(0), 'burn', {}); return powered(b, skill);
  }));
  check('burn does not halve fixed damage', 100, () => {
    const b = make(); b.applyStatus(b.active(0), 'burn', {}); return b.dealDamage(b.active(1), 100, { kind: 'fixed', source: b.active(0) });
  });
  check('type immunity preserves zero damage', 0, () => {
    const b = make(); maxRoll(b); b.active(1).types = ['flying']; return powered(b, { ...skills[0], type: 'ground' });
  });
  check('dual type aggregation remains unchanged', [0.5, 4, 0.75], () => [
    effectiveness(data.types, 'electric', ['ground', 'flying']), effectiveness(data.types, 'grass', ['water', 'ground']),
    effectiveness(data.types, ['fire', 'ground'], ['grass', 'flying']),
  ]);
  check('weakened levels use the declared damage multipliers', [125, 150, 200, 350, 600], () => [1, 2, 3, 4, 5].map(level => {
    const b = make(); b.applyStatus(b.active(1), 'weaken', { level }); return damage(b, 100);
  }));
  const result = { label, passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length, cases: rows };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
