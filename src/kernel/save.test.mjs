import assert from 'node:assert/strict';
import test from 'node:test';
import { deserialize, migrate, newSave, SAVE_VERSION, serialize } from './save.ts';

const context = {
  recruitments: [{ questId: 'quest-a', itemId: 'essence_a' }, { questId: 'quest-b', itemId: 'essence_b' }],
  introducedItems: { item_status_cure: 5 },
};
const version1 = (game, items = {}) => ({ ...newSave(1), version: 1, items, game });

test('new saves are written at the current version', () => {
  assert.equal(SAVE_VERSION, 2);
  assert.equal(newSave(7).version, SAVE_VERSION);
  assert.equal(deserialize(serialize(newSave(7))).version, SAVE_VERSION);
});

test('version 1 saves gain introduced items once, keeping existing stock', () => {
  assert.equal(migrate(version1(undefined), context).items.item_status_cure, 5);
  assert.equal(migrate(version1(undefined, { item_status_cure: 0 }), context).items.item_status_cure, 0);
  assert.equal(migrate(version1(undefined, { item_status_cure: 2 }), context).version, SAVE_VERSION);
});

test('version 1 recruitment quests recover their claim count and shop listing', () => {
  const migrated = migrate(version1({ quests: ['quest-a'], shopUnlocked: ['other'] }), context);
  assert.deepEqual(migrated.game.recruitmentClaims, { 'quest-a': 1 });
  assert.deepEqual(migrated.game.shopUnlocked, ['other', 'essence_a']);
  const counted = migrate(version1({ quests: ['quest-a', 'quest-b'], recruitmentClaims: { 'quest-a': 3 }, shopUnlocked: ['essence_b'] }), context);
  assert.deepEqual(counted.game.recruitmentClaims, { 'quest-a': 3, 'quest-b': 1 });
  assert.deepEqual(counted.game.shopUnlocked, ['essence_b', 'essence_a']);
  assert.equal(counted.items.essence_a, undefined, 'a repaired claim grants no new item');
});

test('current saves are not repaired again', () => {
  const current = { ...newSave(1), game: { quests: ['quest-a'], recruitmentClaims: {}, shopUnlocked: [] } };
  const loaded = migrate(structuredClone(current), context);
  assert.deepEqual(loaded, current);
});

test('a version-1 migration needs the game context; current saves do not', () => {
  assert.throws(() => migrate(version1({ quests: ['quest-a'] })), /migration context/);
  assert.equal(migrate(newSave(1)).version, SAVE_VERSION);
});

test('malformed version-1 fields are left for validation to report', () => {
  assert.equal(migrate({ ...version1({ quests: 'quest-a' }), items: undefined }, context).items, undefined);
  const odd = migrate(version1({ quests: ['quest-a'], shopUnlocked: 'x' }), context);
  assert.equal(odd.game.shopUnlocked, 'x');
});

test('unknown and newer saves are rejected', () => {
  assert.throws(() => migrate({}), /not a Seer Classic save/);
  assert.throws(() => migrate({ ...newSave(1), version: SAVE_VERSION + 1 }), /newer than this game/);
  assert.throws(() => deserialize('{"version":2,"party":["x"],"storage":[],"items":{},"exp_pool":0}'), /invalid save/);
});
