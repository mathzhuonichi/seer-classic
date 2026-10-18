import assert from 'node:assert/strict';
import {createBattle} from '../../battle/core/src/battle.ts';
import {buildDataSet} from '../../battle/core/src/data.ts';
import {attackTypes, effectiveness, hasAttackType, typeIdentity} from '../../battle/core/src/typechart.ts';
import type {BossRule, Objective, Skill, TypeData} from '../../battle/core/src/types.ts';
import {createGame} from '../../src/kernel/game.ts';
import type {CatalogData} from '../../src/domain/catalog/catalog.ts';
import {loadCatalogNode} from '../catalog.mjs';

const chart: TypeData = {chart: {fire: {grass: 2, flying: 1, ice: 2, normal: 1}, ground: {grass: .5, flying: 0, ice: 1, normal: 1}, electric: {ground: 0, flying: 2}, grass: {water: 2, ground: 2}}, composites: {fire_ground: ['fire', 'ground'], ground_fire: ['ground', 'fire']}};
assert.deepEqual(attackTypes(chart, 'fire_ground'), ['fire', 'ground']);
assert.deepEqual(attackTypes(chart, ['fire_ground', 'fire']), ['fire', 'ground']);
assert.equal(effectiveness(chart, 'fire_ground', ['grass', 'flying']), .75);
assert.equal(effectiveness(chart, ['fire', 'ground'], ['grass', 'flying']), .75);
assert.equal(effectiveness(chart, 'electric', ['ground', 'flying']), .5);
assert.equal(effectiveness(chart, 'ground', ['flying']), 0);
assert.equal(effectiveness(chart, 'grass', ['water', 'ground']), 4);
assert(hasAttackType(chart, 'fire_ground', 'ground'));
assert(hasAttackType(chart, 'fire_ground', 'ground_fire'));
assert(!hasAttackType(chart, 'fire_ground', 'water'));
assert.equal(typeIdentity(chart, 'fire_ground'), typeIdentity(chart, 'ground_fire'));

const stats = {hp: 2000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100};
const skills: Skill[] = [
  {id: 1, name: {zh: 'Dual'}, type: 'fire_ground', category: 'physical', power: 100, accuracy: null, pp: 20, crit_rate: 0},
  {id: 2, name: {zh: 'Single'}, type: 'fire', category: 'physical', power: 100, accuracy: null, pp: 20, crit_rate: 0},
  {id: 3, name: {zh: 'Reversed pair'}, type: 'ground_fire', category: 'physical', power: 100, accuracy: null, pp: 20, crit_rate: 0},
  {id: 4, name: {zh: 'Wait'}, type: 'normal', category: 'status', power: 0, accuracy: null, pp: 20, target: 'self'},
];
function fixture(types: string[], rules: BossRule[] = [], win: Objective[] = []) {
  const data = buildDataSet({species: [{id: 1, name: {zh: 'User'}, types, base: stats}, {id: 2, name: {zh: 'Foe'}, types: ['normal'], base: stats}], skills, types: chart});
  const battle = createBattle({data, seed: 17, sides: [{kind: 'player', team: [{species: 1, level: 50, skills: [1, 2, 3], stats: {...stats, spe: 200}}]}], encounter: {id: 'fixture', team: [{species: 2, level: 50, skills: [4], stats: {...stats, spe: 1}}], rules, win, ai: {kind: 'sequence', skills: [4]}}});
  return {battle, data, run: (skill = 1) => {battle.submit(0, {kind: 'move', skill}); return battle.resolveTurn();}};
}
const full = fixture(['fire', 'ground']), partial = fixture(['fire']), foreign = fixture(['water']);
const expected = (f: ReturnType<typeof fixture>, id = 1) => f.battle.calcAttack(f.battle.active(0), f.battle.active(1), f.data.skills.get(id)!, {}, {estimate: true}).damage;
assert(Math.abs(expected(full) - expected(partial) * 1.5) < 1e-10);
assert.equal(expected(partial), expected(foreign));
assert(Math.abs(expected(full, 2) - expected(foreign, 2) * 1.5) < 1e-10);
assert.equal(expected(partial, 2), expected(full, 2));
const boosted = fixture(['fire', 'ground']);
boosted.battle.addCondition(boosted.battle.active(0), {id: 'ground_bonus', hooks: [{on: 'modify_damage_dealt', when: {skill_type: 'ground'}, multiplier: 2}]});
const baseline = full.run().find(event => event.type === 'damage' && event.side === 1)!.amount;
const amplified = boosted.run().find(event => event.type === 'damage' && event.side === 1)!.amount;
assert(amplified >= baseline * 2 && amplified <= baseline * 2 + 1);
const gated = fixture(['fire', 'ground'], [{rule: 'damage_only_from', types: ['ground']}]);
assert(gated.run().some(event => event.type === 'damage' && event.side === 1 && event.amount > 0));
const repeated = fixture(['fire', 'ground'], [{rule: 'no_repeat_type'}]);
repeated.run(1);
assert(repeated.run(3).some(event => event.type === 'damage_blocked' && event.rule === 'no_repeat_type'));
const finished = fixture(['fire', 'ground'], [], [{kind: 'finish_with_type', type: 'ground'}]);
finished.battle.active(1).hp = 1; finished.run(); assert(finished.battle.result?.success);
const burnt = fixture(['fire', 'ground']);
burnt.battle.addCondition(burnt.battle.active(1), {id: 'type_reaction', hooks: [{on: 'on_hurt', inflict_on_type: {type: 'ground', status: 'burn'}}]});
assert(burnt.run().some(event => event.type === 'status_applied' && event.status === 'burn'));

const catalog = loadCatalogNode();
const dualSkills = catalog.skills.filter((skill: Skill) => catalog.types.composites[skill.type]);
assert.equal(dualSkills.length, 294);
assert.equal(Object.keys(catalog.types.composites).length, 29);
assert.equal(catalog.skills.find((skill: Skill) => skill.id === 11146).type, 'mechanical_ground');
assert.equal(catalog.skills.find((skill: Skill) => skill.id === 11166).type, 'fighting_fire');
for (const skill of dualSkills) assert(catalog.types.composites[skill.type].every((type: string) => catalog.types.types.some((entry: {id: string}) => entry.id === type)));
let partialLearnsets = 0, retainedDualLearnsets = 0;
for (const species of catalog.species) for (const learned of species.learnset ?? []) {
  const skill = catalog.skills.find((entry: Skill) => entry.id === learned.skill), components = catalog.types.composites[skill.type];
  if (!components) continue;
  retainedDualLearnsets++;
  if (components.some((type: string) => species.types.includes(type)) && !components.every((type: string) => species.types.includes(type))) partialLearnsets++;
}
assert.equal(partialLearnsets, 0); assert.equal(retainedDualLearnsets, 383);
const realData = buildDataSet(catalog), realSkill = realData.skills.get(11161)!;
const realBattle = createBattle({data: realData, seed: 17, sides: [
  {kind: 'player', team: [{species: 431, level: 50, stats, skills: [11161]}]},
  {kind: 'wild', team: [{species: 426, level: 50, stats, skills: [11166]}]},
]});
const restoredAttack = realBattle.calcAttack(realBattle.active(0), realBattle.active(1), realSkill, {}, {estimate: true});
const flattenedAttack = realBattle.calcAttack(realBattle.active(0), realBattle.active(1), {...realSkill, type: 'water'}, {}, {estimate: true});
assert.equal(restoredAttack.effectiveness, 1.25);
assert.equal(flattenedAttack.effectiveness, 1.5);
assert(restoredAttack.damage < flattenedAttack.damage);
const game = createGame(catalog as CatalogData);
game.dispatch({type: 'cheatAcquire', species: 501, level: 100});
const uid = game.snapshot().monsters.find(mon => mon.species === 501)!.uid;
game.dispatch({type: 'equip', uid, skills: [11146]});
const learnedDual = game.snapshot().monsters.find(mon => mon.uid === uid)!.skills.find(skill => skill.id === 11146);
assert.equal(learnedDual?.type, '机械·地面');
console.log(JSON.stringify({passed: ['composite resolution and Seer averaging, including zero and four-times cases', 'full-pair and component STAB; no partial-overlap bonus', 'second-component damage hooks, eligibility, KO objective and status response', 'canonical repeat-type identity', 'all 294 restored skills and 29 composite mappings load correctly', 'actual restored water-shadow attack versus fighting-fire yields 1.25, differing from flattened water 1.5', 'actual controller Chinese dual-skill label', '383 retained dual-skill learnset entries; zero partial-overlap cases'], example: {skill: 11161, restoredCoefficient: restoredAttack.effectiveness, formerFlattenedCoefficient: flattenedAttack.effectiveness, expectedRawDamage: restoredAttack.damage, formerExpectedRawDamage: flattenedAttack.damage}, limitation: 'The partial-overlap dual-skill STAB rule is the declared remake model; an authenticated classic server calculation has not been recovered.'}, null, 2));
