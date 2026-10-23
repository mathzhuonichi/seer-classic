/**
 * Saves of released versions open with no notice. Fixtures: the 0.2 desktop app's version-1 save (copied out of its web view
 * storage, game state only) and a version-5 save of 0.3.2 with a Chinese nickname. Each opens from the save store as a player's
 * would, keeps its creatures, and the current one exports unchanged. Add a fixture for every release that changes the format.
 * On the desktop, the 0.2 save in local storage becomes the save file once: deleting the save files later starts a new journey.
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

/** A stand-in for the desktop shell's save commands (src-tauri/src/saves.rs): save.json's text, null while there is none. */
function standInShell() {
  const shell = {save: null};
  const commands = {
    read_save: () => ({save: shell.save, unreadable: []}),
    write_save: ({text}) => { shell.save = text; },
  };
  globalThis.window = {__TAURI__: {core: {invoke: async (command, args) => commands[command](args)}}};
  return shell;
}
const settled = () => new Promise(resolve => setTimeout(resolve, 0));

const {check, checkAsync, finish} = suite('golden-saves');
await withSsr('golden-saves', async load => {
  const [{createGame}, {loadCatalog}, {SAVE_VERSION}, persistence, {openDesktopSaveStore}] = await Promise.all(
    ['/src/kernel/game.ts', '/src/domain/catalog/catalog.ts', '/src/kernel/save.ts', '/src/kernel/persistence.ts', '/src/app/desktop-saves.ts'].map(load));
  const {IMPORTED_SAVE_KEY, localSaveStore, setSaveStore, writeLocalSave} = persistence;
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
  await checkAsync('on the desktop, the 0.2 save in local storage becomes the save file once', async () => {
    const text = read(GOLDEN[0].name), seed = JSON.parse(text).seed, memory = memoryStorage(), shell = standInShell();
    writeLocalSave(text);
    const open = async () => {
      setSaveStore(await openDesktopSaveStore());
      const game = createGame(catalog, undefined, {idle: () => {}});
      await settled();
      return game;
    };
    try {
      const imported = await open();
      assert.equal(shell.save, imported.exportSave(), 'its first write creates the save file');
      assert.equal(JSON.parse(shell.save).seed, seed, 'the 0.2 journey');
      assert(memory.has(IMPORTED_SAVE_KEY), 'local storage\'s save is marked imported');
      assert.equal(localSaveStore.read(), text, 'and kept as it was');
      shell.save = null;
      const fresh = await open();
      assert.notEqual(JSON.parse(fresh.exportSave()).seed, seed, 'with the save files deleted, a new journey starts');
      assert.equal(shell.save, fresh.exportSave(), 'and is written');
    } finally {
      setSaveStore(localSaveStore);
      delete globalThis.window;
    }
  });
});
finish();
