/**
 * Saves of released versions open with no notice. Fixtures: the 0.2 app's version-1 save (game state only) and a version-5 save
 * of 0.3.2 with a Chinese nickname. Each opens from local storage as a player's would, keeps its creatures, and the current one
 * exports unchanged. Add a fixture for every release that changes the format.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {memoryStorage, root, suite, withSsr} from './_harness.mjs';

const FIXTURES = path.join(root, 'tools/verification/fixtures');
const read = name => fs.readFileSync(path.join(FIXTURES, name), 'utf8').trim();
const GOLDEN = [
  {name: 'save-version-1-app-0.2.json', species: [1, 4, 7]},
  {name: 'save-version-5-0.3.2.json', species: [1, 4, 7, 303, 1], current: true},
];

const {check, finish} = suite('golden-saves');
await withSsr('golden-saves', async load => {
  const [{createGame}, {loadCatalog}, {SAVE_VERSION}, {writeLocalSave}] = await Promise.all(
    ['/src/kernel/game.ts', '/src/domain/catalog/catalog.ts', '/src/kernel/save.ts', '/src/kernel/persistence.ts'].map(load));
  const catalog = await loadCatalog();
  for (const {name, species, current} of GOLDEN) {
    check(`${name} opens with no notice`, () => {
      const text = read(name), stored = JSON.parse(text);
      memoryStorage();
      writeLocalSave(text);
      const game = createGame(catalog, undefined, {idle: () => {}});
      assert.deepEqual(game.snapshot().notices, [], 'no notice');
      const opened = JSON.parse(game.exportSave());
      assert.equal(opened.version, SAVE_VERSION);
      assert.equal(opened.seed, stored.seed, 'the same journey, not a new one');
      assert.deepEqual(opened.storage.map(mon => mon.species), species);
      if (current) assert.deepEqual(opened, stored, 'a current save exports unchanged');
    });
  }
});
finish();
