import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {eventFrames} from './battle-presentation.ts';
import {matchupLabel, matchupRelation, multiplierText, typeMatchup} from './type-matchup.ts';

const chart = JSON.parse(fs.readFileSync(new URL('../../../data/types.json', import.meta.url), 'utf8'));
const mon = (...typeIds) => ({typeIds});
const rated = (mine, theirs) => {
  const {relation, mine: m, theirs: t} = typeMatchup(chart, mon(...mine), mon(...theirs));
  return [relation, multiplierText(m), multiplierText(t)];
};

test('grass against light (丽莎布布 against 厄尔塞拉) is 克制 at ×2, and light cannot hurt grass', () => {
  assert.deepEqual(rated(['grass'], ['light']), ['strong', '×2', '×0']);
  assert.deepEqual(rated(['light'], ['grass']), ['immune', '×0', '×2']);
});

test('a neutral pair is 均衡 at ×1 both ways', () => {
  assert.deepEqual(rated(['normal'], ['normal']), ['neutral', '×1', '×1']);
});

test('dual types attack and defend with the dual-type rule', () => {
  // grass+psychic attacking light: 2 and 0 average to 1, halved for the 0.
  assert.deepEqual(rated(['grass', 'psychic'], ['light']), ['weak', '×0.5', '×0.5']);
  // Both defending types weak to grass: 4.
  assert.deepEqual(rated(['grass'], ['water', 'ground']), ['strong', '×4', '×0.5']);
  // Dual against dual: (1.5 against grass + 0.75 against psychic) / 2.
  assert.deepEqual(rated(['fighting', 'fire'], ['grass', 'psychic']), ['strong', '×1.125', '×1.125']);
});

test('the relation follows my multiplier', () => {
  assert.deepEqual([0, 0.25, 0.5, 1, 1.125, 2, 4].map(matchupRelation), ['immune', 'weak', 'weak', 'neutral', 'strong', 'strong', 'strong']);
});

test('multipliers print without floating-point noise or trailing zeros', () => {
  assert.deepEqual([1.5, 0.25, 4, 0, 0.1 + 0.2, 0.6875].map(multiplierText), ['×1.5', '×0.25', '×4', '×0', '×0.3', '×0.6875']);
});

test('each frame carries the matchup of the monsters it shows, through a switch and a transform', () => {
  const view = (side, slot, typeIds) => ({
    uid: `${side}-${slot}`, slot, species: 1, name: `${side}-${slot}`, level: 50, hp: 100, maxHp: 100, fainted: false, types: [], typeIds,
    portrait: '', skills: [], statuses: [], stages: {},
  });
  const lead = view(0, 0, ['grass']), foe = view(1, 0, ['light']), bench = view(1, 1, ['normal']);
  const data = {species: new Map(), skills: new Map(), items: new Map(), types: chart};
  let id = 0;
  const frames = eventFrames([
    {type: 'switch_in', side: 1, slot: 1, species: 2, types: ['water'], name: '1-1', hp: 100, maxHp: 100, level: 50},
    {type: 'transform', side: 0, species: 3, types: ['fire'], name: '0-0', hp: 100, maxHp: 100},
  ], {player: lead, enemy: foe, party: [lead], enemyParty: [foe, bench]},
  {data, hideEnemyHp: false, challenge: false, transformedSlots: new Set(), nextFrameId: () => ++id});
  assert.deepEqual(frames.map(frame => frame.enemy.typeIds), [['water'], ['water']]);
  assert.deepEqual(frames.map(({matchup}) => [matchup.relation, matchup.mine, matchup.theirs]),
    [['strong', 2, 0.5], ['weak', 0.5, 2]], 'grass, then fire, attacking water');
});

test('the spoken text names the relation and both multipliers', () => {
  assert.equal(matchupLabel({relation: 'strong', mine: 2, theirs: 0}), '属性相克：我方对对方克制，我方 ×2，对方 ×0');
  assert.equal(matchupLabel({relation: 'weak', mine: 0.5, theirs: 2}), '属性相克：我方对对方微弱，我方 ×0.5，对方 ×2');
});
