/** The battle screen's commands against real controllers: the capture rule the view and the capture action share. */
import assert from 'node:assert/strict';
import {memoryStorage, suite, withSsr} from './_harness.mjs';

memoryStorage();
await withSsr('battle-commands', async load => {
  const [{createGame}, {loadCatalog}] = await Promise.all(['/src/kernel/game.ts', '/src/domain/catalog/catalog.ts'].map(load));
  const catalog = await loadCatalog(), t = suite('battle-commands');
  const base = JSON.parse(createGame(catalog, '', {idle: () => {}}).exportSave());
  base.rng_state = [101, 202, 303, 404];
  /** A controller on the seeded journey that has started `start`; its turn preparation never runs. */
  const started = (start, input = catalog, save = base) => {
    const game = createGame(input, JSON.stringify(save), {idle: () => {}}), result = game.dispatch(start);
    assert(result.ok && game.snapshot().battle, `${start.type}: ${result.notice}`);
    return game;
  };

  t.check('A capture the view blocks is refused with the reason the view shows, and changes nothing', () => {
    const blocked = {
      boss: {type: 'startBattle', bossId: catalog.bosses[0].id}, trainer: {type: 'startFacility', facilityId: 'random'},
      niao: {type: 'startTraining', species: 416, level: 5},
    };
    for (const [name, start] of Object.entries(blocked)) {
      const game = started(start), view = game.snapshot().battle, save = game.exportSave();
      assert.equal(view.canCapture, false, name);
      assert.ok(view.captureBlockedReason, name);
      assert.deepEqual(game.dispatch({type: 'capture', itemId: 'item_capsule_master'}), {ok: false, notice: view.captureBlockedReason}, name);
      assert.equal(game.exportSave(), save, name);
    }
  });

  t.finish();
});
