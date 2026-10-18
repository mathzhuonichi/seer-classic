// A tiny hand-made Dex for the raising unit tests, so they never depend on the shipped catalog.
import {Rng} from '../../battle/core/src/rng.ts';
import {makeDex} from './index.ts';

const base = (n) => ({hp: n, atk: n, def: n, spa: n, spd: n, spe: n});
const sp = (id, extra = {}) => ({
  id, name: {zh: `精灵${id}`}, types: ['grass'], base: base(50), ev_yield: {}, exp_yield: 70, growth: 'medium',
  learnset: [{level: 1, skill: 1}], evolution: [], ...extra,
});

export const species = [
  // 1 -> 2 -> 3: a single-branch level chain with a learnset longer than four skills.
  sp(1, {ev_yield: {spa: 2}, learnset: [1, 2, 3, 4, 5].map((skill, i) => ({level: 1 + 3 * i, skill})), evolution: [{to: 2, method: 'level', level: 16}]}),
  sp(2, {base: base(70), learnset: [{level: 1, skill: 1}, {level: 20, skill: 6}], evolution: [{to: 3, method: 'level', level: 32}]}),
  sp(3, {base: base(90)}),
  // 10 branches into 11 or 12; 20 needs confirmation; 30 evolves with an item; 40 is a boss form.
  sp(10, {evolution: [{to: 11, method: 'level', level: 20}, {to: 12, method: 'level', level: 25}]}),
  sp(11), sp(12),
  sp(20, {evolution: [{to: 21, method: 'level', level: 10, automatic: false}]}),
  sp(21),
  sp(30, {evolution: [{to: 31, method: 'item', item: 'stone'}, {to: 32, method: 'special', script: 'moon'}]}),
  sp(31), sp(32),
  sp(40, {ev_yield: {atk: 3, spe: 1}, exp_yield: 140}),
];
export const skills = [1, 2, 3, 4, 5, 6].map((id) => ({id, name: {zh: `技能${id}`}, pp: 10 + id}));
export const natures = [
  {id: 'hardy', name: {zh: '实干'}, plus: 'atk', minus: 'atk'},
  {id: 'modest', name: {zh: '保守'}, plus: 'spa', minus: 'atk'},
];

export const dex = makeDex({species, skills, natures});
export const rng = (seed = 1) => new Rng(seed);

/** An empty version-1 save. */
export function emptySave(extra = {}) {
  return {
    version: 1, seed: 1, rng_state: null, party: [], storage: [], exp_pool: 0, boosts: [], items: {},
    progress: {bosses_cleared: [], boss_attempts: {}}, dex: {seen: [], owned: []}, ...extra,
  };
}
