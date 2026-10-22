import assert from 'node:assert/strict';
import { suite } from './_harness.mjs';
import type { Battle } from '../../battle/core/src/index.ts';
import { createBattle } from './_battle.ts';
import { buildDataSet } from '../../battle/core/src/data.ts';
import { effectiveness } from '../../battle/core/src/typechart.ts';
import { RANDOM_MAX } from '../../battle/core/src/constants.ts';
import { SEER_SCRIPTS } from '../../battle/core/src/scripts/index.ts';
import type { BossRule, ConditionDef, ScriptRegistry, Skill, Stats } from '../../battle/core/src/types.ts';
import { traits, traitScripts } from '../../src/domain/traits.ts';
import { loadCatalogNode } from '../catalog.mjs';

type Check = (name: string, expected: unknown, run: () => unknown) => void;

/** Two plain normal-type monsters at level 50 with stats 100, and helpers around one battle of them. */
function fixture() {
  const catalog = loadCatalogNode();
  const stats: Stats = { hp: 1000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
  const skills: Skill[] = [
    { id: 1, name: { zh: '普通物攻' }, type: 'normal', category: 'physical', power: 100, accuracy: null, pp: 10 },
    { id: 2, name: { zh: '火系物攻' }, type: 'fire', category: 'physical', power: 100, accuracy: null, pp: 10 },
    { id: 3, name: { zh: '普通特攻' }, type: 'normal', category: 'special', power: 100, accuracy: null, pp: 10 },
    catalog.skills.find((s: Skill) => s.id === 20175),
    // 疾风追击 (effect 40, 先出手) and 冲撞 (effect 30, 后出手); 刀叶 grass, 绿色幻影 grass_psychic, 暗影飞叶 grass_shadow, 念力射线 psychic.
    ...[10260, 10128, 10067, 11282, 12697, 10194].map(id => catalog.skills.find((s: Skill) => s.id === id)),
  ];
  assert(skills.every(Boolean), 'The actual catalog skills must be present.');
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
  const make = (rules: BossRule[] = [], playerRules: BossRule[] = []) => createBattle({ data, scripts, seed: 7, sides: [
    { kind: 'player', rules: playerRules, team: [
      { species: 1, level: 50, stats, skills: [1, 2, 3, 20175] },
      { species: 1, level: 50, stats, skills: [1] },
    ] },
    { kind: 'wild', rules, team: [{ species: 2, level: 50, stats, skills: [1] }] },
  ] });
  const shield = (b: Battle, charges: number) => b.addCondition(b.active(1), data.conditions.get('cond_block_attacks')!, undefined, undefined, charges);
  return {
    catalog, data, skills, make, shield,
    damage: (b: Battle, amount: number) => b.dealDamage(b.active(1), amount, {
      kind: 'attack', source: b.active(0), skill: data.skills.get(1), effectiveness: 1,
    }),
    scriptCondition: (id: string, point: 'modify_damage_final' | 'modify_damage_outgoing'): ConditionDef => ({
      id, hooks: [{ on: point, script: id }],
    }),
    harden: (b: Battle, side: 0 | 1) => {
      const trait = traits.find(t => t.id === '1024')!;
      assert(trait?.implemented, 'The actual zero-star damage-reduction trait must be implemented.');
      b.addCondition(b.active(side), { id: 'audit_actual_harden', hooks: trait.hooks });
    },
    maxRoll: (b: Battle) => { b.rng.int = (_min, max) => max; },
    powered: (b: Battle, skill: Skill) => {
      const r = b.calcAttack(b.active(0), b.active(1), skill);
      return b.dealDamage(b.active(1), r.damage, { kind: 'attack', source: b.active(0), skill, crit: r.crit, effectiveness: r.effectiveness });
    },
    estimate: (b: Battle, skill = skills[0]) => b.estimateDamage(b.active(0), b.active(1), skill),
    untouched: (b: Battle) => JSON.stringify({
      rng: b.rng.s, draws: b.rng.draws, conditions: b.sides.map(s => s.team.map(m => m.conditions)), out: b.turnEvents,
    }),
  };
}
type Fixture = ReturnType<typeof fixture>;

function shieldChecks({ make, shield, damage }: Fixture, check: Check) {
  check('last shield charge blocks the whole hit', 0, () => { const b = make(); shield(b, 1); return damage(b, 100); });
  check('two shield charges block two hits and then expire', [0, 0, 100], () => {
    const b = make(); shield(b, 2);
    return [damage(b, 100), damage(b, 100), damage(b, 100)];
  });
  check('inactive zero multiplier cannot suppress minimum damage', 1, () => {
    const b = make();
    b.addCondition(b.active(1), { id: 'audit_inactive_zero', hooks: [{ on: 'modify_damage_taken', multiplier: 0, when: { skill_type: 'fire' } }] });
    return damage(b, 0.4);
  });
  check('active zero multiplier suppresses minimum damage', 0, () => {
    const b = make(); b.addCondition(b.active(1), { id: 'audit_active_zero', hooks: [{ on: 'modify_damage_taken', multiplier: 0 }] });
    return damage(b, 0.4);
  });
}

/** The AI estimate is the damage pipeline at the mean roll without a crit (survey B4). */
function estimateChecks({ data, skills, make, shield, estimate, untouched }: Fixture, check: Check) {
  check('AI ignores the catalog fire buff for a normal skill', 63, () => {
    const b = make(); b.addCondition(b.active(0), data.conditions.get('cond_fire_power_x2')!);
    return estimate(b);
  });
  check('AI uses the active condition level', 127, () => {
    const b = make(); b.addCondition(b.active(0), { id: 'audit_leveled', hooks: [{ on: 'modify_damage_dealt', multiplier_by_level: [1.5, 2] }] }, undefined, 2);
    return estimate(b);
  });
  check('AI estimate preserves RNG, events and condition charges', true, () => {
    const b = make();
    b.addCondition(b.active(0), { id: 'audit_charged', hooks: [{ on: 'modify_damage_dealt', multiplier: 2, consume_charge: true }] }, undefined, undefined, 1);
    shield(b, 1);
    const before = untouched(b);
    estimate(b);
    return before === untouched(b);
  });
  check('AI estimate combines the attacker\'s burn with the defender\'s weakness', [47, 31, 47], () => {
    const b = make(); b.applyStatus(b.active(1), 'weaken', { level: 2 }); b.applyStatus(b.active(0), 'burn', {});
    return skills.slice(0, 3).map(skill => estimate(b, skill));
  });
  check('AI estimate applies the defender\'s taken multipliers', 79, () => {
    const b = make(); b.applyStatus(b.active(1), 'weaken', { level: 1 }); return estimate(b);
  });
  check('AI estimate sees a shield as no damage without spending its charge', [0, 1], () => {
    const b = make(); shield(b, 1);
    return [estimate(b), b.active(1).conditions.find(c => c.id === 'cond_block_attacks')!.charges];
  });
  check('AI estimate applies boss damage rules', [30, 0], () => [
    estimate(make([{ rule: 'damage_cap_per_hit', amount: 30 }])),
    estimate(make([{ rule: 'invulnerable_turns', turns: 3 }])),
  ]);
  check('AI estimate runs script power in estimate mode without drawing', [63, true], () => {
    const b = make(), before = untouched(b);
    return [estimate(b, { ...skills[0], power: 0, effects: [{ op: 'script', id: 'seer_eff_61' }] }), before === untouched(b)];
  });
  check('AI estimate of an unpowered skill is 0, even under an OHKO trait', [0, 0], () => {
    const b = make(), unpowered = { ...skills[0], power: 0, effects: [{ op: 'fixed_damage', amount: 30 }] };
    const plain = estimate(b, unpowered);
    b.active(0).persist.ohko_below_pct = true;
    return [plain, estimate(b, unpowered)];
  });
}

function pipelineChecks({ skills, make, damage, scriptCondition, harden }: Fixture, check: Check) {
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
}

function formulaChecks({ data, skills, make, damage, maxRoll, powered }: Fixture, check: Check) {
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
}

/** Effects 40/30 (先出手/后出手 ×2) double the damage, not the power (RULES.md 5): `damage_if`. */
function firstMoverChecks({ catalog, data, make }: Fixture, check: Check) {
  const probe = (b: Battle, id: number, actedFirst: boolean) =>
    b.probeDamage(b.active(0), b.active(1), data.skills.get(id)!, { roll: RANDOM_MAX, crit: false, actedFirst });
  const attack = (b: Battle, id: number, actedFirst: boolean) =>
    b.calcAttack(b.active(0), b.active(1), data.skills.get(id)!, { actedFirst }, { roll: RANDOM_MAX, crit: false });
  for (const [id, doubledWhenFirst, expected] of [[10260, true, [96, 48]], [10128, false, [63, 31]]] as const) {
    check(`${id} doubles the floored damage, not the power`, { expected, samePowerAndBase: true, doubledIsTwiceTheUnfloored: true }, () => {
      const b = make(), doubled = attack(b, id, doubledWhenFirst), plain = attack(b, id, !doubledWhenFirst);
      return {
        expected: [probe(b, id, doubledWhenFirst), probe(b, id, !doubledWhenFirst)],
        samePowerAndBase: doubled.power === plain.power && doubled.base === plain.base,
        doubledIsTwiceTheUnfloored: probe(b, id, doubledWhenFirst) === Math.floor(2 * plain.damage),
      };
    });
  }
  check('every effect 40/30 skill has exactly one damage_if and no acted_first power_if', 102, () => {
    const firstMovers = catalog.skills.filter((s: Skill) => (s as { seer_effects?: { eff: number }[] }).seer_effects?.some(e => e.eff === 40 || e.eff === 30));
    for (const s of firstMovers as Skill[]) {
      const first = (s as unknown as { seer_effects: { eff: number }[] }).seer_effects.some(e => e.eff === 40);
      assert.deepEqual(s.effects, [{ op: 'damage_if', when: { acted_first: first }, multiplier: 2 }], `skill ${s.id}`);
    }
    assert(!catalog.skills.some((s: Skill) => s.effects?.some(op => op.op === 'power_if' && op.when && 'acted_first' in op.when)));
    return firstMovers.length;
  });
}

/** 单属性增伤 traits (Eid 28) boost only skills of exactly their type, with the catalog's types. */
function singleTypeTraitChecks({ data, make }: Fixture, check: Check) {
  const dealt = (b: Battle, id: number) => b.dealDamage(b.active(1), 100, { kind: 'attack', source: b.active(0), skill: data.skills.get(id), effectiveness: 1 });
  check('叶绿 boosts a grass skill, not a grass_psychic or psychic one', [105, 100, 100], () => {
    const b = make(), trait = traits.find(t => t.id === '1006')!;
    b.addCondition(b.active(0), { id: 'audit_trait_1006', hooks: trait.hooks });
    return [10067, 11282, 10194].map(id => dealt(b, id));
  });
  check('skill_type_exact with a composite type matches that pair only', [200, 100, 100], () => {
    const b = make();
    b.addCondition(b.active(0), { id: 'audit_exact_pair', hooks: [{ on: 'modify_damage_dealt', multiplier: 2, when: { skill_type_exact: 'grass_psychic' } }] });
    return [11282, 10067, 12697].map(id => dealt(b, id));
  });
}

/** Focused damage audit. Run through Vite SSR; fixtures never load or modify a save. */
export function runDamageAudit() {
  const t = suite('damage-audit'), f = fixture();
  const check: Check = (name, expected, run) => t.check(name, () => assert.deepEqual(run(), expected));
  for (const group of [shieldChecks, estimateChecks, pipelineChecks, formulaChecks, firstMoverChecks, singleTypeTraitChecks]) group(f, check);
  return t.finish();
}
