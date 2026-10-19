import assert from 'node:assert/strict';
import test from 'node:test';
import {validateEncounter} from '../../../battle/core/src/index.ts';
import {partyRefusalText} from './party-rules.ts';

const names = {70: '雷伊', 72: '盖亚'};
const speciesName = id => names[id];
const encounter = {id: 'party-rules-fixture', team: [], rules: [
  {rule: 'player_team_size', max: 2, min: 1, min_level: 30}, {rule: 'player_level_cap', level: 60},
  {rule: 'script', id: 'require_player_species', params: {species: [70, 72]}}, {rule: 'no_items'},
]};
const member = (species, level) => ({species, level, skills: [1]});

test('the refusal names each broken rule with what the team has against it, then where to adjust it', () => {
  const team = [member(70, 20), member(1, 80), member(72, 40)];
  assert.equal(partyRefusalText(validateEncounter(encounter, {kind: 'player', team}), speciesName),
    '本挑战只能派 2 只精灵出战（当前队伍 3 只）；出战精灵等级至少 30 级（1 只未达到）；出战精灵等级不超过 60 级（1 只超过）；'
    + '只能派雷伊或盖亚出战（1 只不符合）。请在精灵背包中调整出战精灵后再挑战。');
  const small = {rules: [{rule: 'player_team_size', min: 6}]};
  assert.equal(partyRefusalText(validateEncounter(small, {kind: 'player', team}), speciesName),
    '本挑战至少要派 6 只精灵出战（当前队伍 3 只）。请在精灵背包中调整出战精灵后再挑战。');
});
