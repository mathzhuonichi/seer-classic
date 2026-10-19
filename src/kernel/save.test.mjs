import assert from 'node:assert/strict';
import test from 'node:test';
import { deserialize, migrate, newSave, SAVE_VERSION, serialize } from './save.ts';

const context = {
  recruitments: [{ questId: 'quest-a', itemId: 'essence_a' }, { questId: 'quest-b', itemId: 'essence_b' }],
  introducedItems: { item_status_cure: 5 },
  replacedItems: { essence_retired: 'essence_kept' },
  firstClearItems: { boss_a: { suit_a: 1 } },
  allVariantTitles: { boss_titled: ['mon', 'tue'] },
};
const version1 = (game, items = {}) => ({ ...newSave(1), version: 1, items, game });
const version2 = (game, items = {}, cleared = []) => ({ ...newSave(1), version: 2, items, game, progress: { bosses_cleared: cleared, boss_attempts: {} } });
const version3 = (game, cleared = []) => ({ ...newSave(1), version: 3, game, progress: { bosses_cleared: cleared, boss_attempts: {} } });
const version4 = (cleared = [], attempts = {}) => ({
  ...newSave(1), version: 4, game: { quests: [] }, progress: { bosses_cleared: cleared, boss_attempts: attempts },
});

test('new saves are written at the current version', () => {
  assert.equal(SAVE_VERSION, 5);
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

test('version 2 retired items move their stock and shop listing to the replacement', () => {
  const moved = migrate(version2({ shopUnlocked: ['essence_retired', 'other'] }, { essence_retired: 2, essence_kept: 1 }), context);
  assert.deepEqual(moved.items, { essence_kept: 3 });
  assert.deepEqual(moved.game.shopUnlocked, ['essence_kept', 'other']);
  const listed = migrate(version2({ shopUnlocked: ['essence_kept', 'essence_retired'] }), context);
  assert.deepEqual([listed.items, listed.game.shopUnlocked], [{}, ['essence_kept']], 'a consumed essence keeps one listing');
  assert.throws(() => migrate(version2({ shopUnlocked: [] })), /version 2 saves need/);
});

test('version 2 saves that cleared an encounter receive its first-clear items once', () => {
  assert.equal(migrate(version2(undefined, {}, ['boss_a']), context).items.suit_a, 1);
  assert.equal(migrate(version2(undefined, { suit_a: 1 }, ['boss_a']), context).items.suit_a, 1, 'a held item is not paid again');
  assert.equal(migrate(version2(undefined, {}, ['boss_b']), context).items.suit_a, undefined, 'only a cleared encounter pays');
  const fromVersion1 = migrate({ ...version1(undefined), progress: { bosses_cleared: ['boss_a'], boss_attempts: {} } }, context);
  assert.deepEqual(fromVersion1.items, { item_status_cure: 5, suit_a: 1 }, 'a version-1 save passes through both steps');
});

test('version 3 saves start an empty variant record and keep their clears', () => {
  const migrated = migrate(version3({ quests: [] }, ['boss_gaia']), context);
  assert.deepEqual([migrated.version, migrated.game.bossVariants, migrated.progress.bosses_cleared], [SAVE_VERSION, {}, ['boss_gaia']]);
  assert.equal(migrate(version3(undefined), context).game, undefined, 'a save without game extras is left for the game to complete');
  assert.deepEqual(migrate(version1({ quests: [] }), context).game.bossVariants, {}, 'a version-1 save passes through every step');
  assert.throws(() => migrate(version3({ quests: [] })), /version 3 saves need/);
});

test('a version-3 clear of an encounter with an all-variant title records every variant, so the title it showed stays', () => {
  const migrated = migrate(version3({ quests: [] }, ['boss_gaia', 'boss_titled']), context);
  assert.deepEqual(migrated.game.bossVariants, { boss_titled: ['mon', 'tue'] });
  assert.deepEqual(migrate(version3({ quests: [] }, ['boss_gaia']), context).game.bossVariants, {}, 'only a cleared encounter records them');
  assert.deepEqual(migrate(structuredClone(migrated), context), migrated, 'a current save is not migrated again');
  const odd = migrate(version3({ quests: [], bossVariants: 'x' }, ['boss_titled']), context);
  assert.equal(odd.game.bossVariants, 'x', 'a malformed record is left as it is');
});

test('version 4 saves start a win record: none without a clear, and one win for each cleared encounter', () => {
  const fresh = migrate(version4(), context);
  assert.deepEqual([fresh.version, fresh.progress.boss_wins], [SAVE_VERSION, {}]);
  const attempted = migrate(version4([], { boss_spt_luolasike: 3 }));
  assert.deepEqual([attempted.progress.boss_wins, attempted.progress.boss_attempts], [{}, { boss_spt_luolasike: 3 }], 'attempts alone count no win');
  const cleared = migrate(version4(['boss_spt_luolasike', 'boss_gaia'], { boss_spt_luolasike: 3, boss_gaia: 1 }));
  assert.deepEqual(cleared.progress.boss_wins, { boss_spt_luolasike: 1, boss_gaia: 1 }, 'a clear is known to be a win; later ones were not recorded');
  assert.deepEqual(cleared.progress.boss_attempts, { boss_spt_luolasike: 3, boss_gaia: 1 }, 'the attempts are kept');
  assert.deepEqual(migrate(structuredClone(cleared)), cleared, 'a version-5 save is not migrated again and needs no context');
  assert.deepEqual(migrate(version3({ quests: [] }, ['boss_gaia']), context).progress.boss_wins, { boss_gaia: 1 }, 'a version-3 save passes through');
  const odd = migrate({ ...version4(['boss_gaia']), progress: { bosses_cleared: ['boss_gaia'], boss_attempts: {}, boss_wins: 'x' } });
  assert.equal(odd.progress.boss_wins, 'x', 'a malformed record is left as it is');
});

test('malformed version-1 fields are left for validation to report', () => {
  assert.equal(migrate({ ...version1({ quests: 'quest-a' }), items: undefined }, context).items, undefined);
  const odd = migrate(version1({ quests: ['quest-a'], shopUnlocked: 'x' }), context);
  assert.equal(odd.game.shopUnlocked, 'x');
});

test('unknown and newer saves are rejected', () => {
  assert.throws(() => migrate({}), /not a Seer Classic save/);
  assert.throws(() => migrate({ ...newSave(1), version: SAVE_VERSION + 1 }), /newer than this game/);
  assert.throws(() => deserialize(JSON.stringify({ version: SAVE_VERSION, party: ['x'], storage: [], items: {}, exp_pool: 0 })), /invalid save/);
});
