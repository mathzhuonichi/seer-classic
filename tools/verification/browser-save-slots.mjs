/**
 * Save slots in real browsers (design/notes/save-slots-2026-10-24.md): the pre-slot save in local storage is adopted unchanged as
 * the active 存档 1 and the pre-slot key is deleted; 设置 > 航行存档 starts a new save in a second slot, loads the first again, and
 * a reload opens the slot loaded last; a slot that is not active is deleted after its confirmation. Status `needs-browser`:
 * Chrome, and Playwright WebKit when installed. Every check runs in a fresh, silent, temporary browser context (`_browser.mjs`).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {memoryStorage, root, suite, withSsr} from './_harness.mjs';
import {BOOT_TIMEOUT_MS, buildApp, closeWindow, openGame, openTool, saveSlots, waitWorld, withBrowser} from './_browser.mjs';

const NAME = 'browser-save-slots';
const DIST = path.join(root, 'artifacts', NAME, 'dist');
const ENGINES = ['chrome', 'webkit'];
const CHECK_TIMEOUT_MS = 90_000;
const SAVE_SEED = 20261024;
/** The pre-slot save's coins, which a new journey does not start with. */
const SAVED_COINS = 424_242;

/** The silent storage entries, the pre-slot save (as storage entries), the toolbar tools and the slot database layout. */
async function fixtures() {
  return withSsr(NAME, async load => {
    const [{createGame}, {loadCatalog}, {newSave}, economy, {LEGACY_SAVE_KEY}, {SLOT_DATABASE}, {gameAudio}, shell] = await Promise.all([
      '/src/kernel/game.ts', '/src/domain/catalog/catalog.ts', '/src/kernel/save.ts', '/src/domain/economy.ts', '/src/kernel/persistence.ts',
      '/src/kernel/slot-backends.ts', '/src/shared/audio/game-audio.ts', '/src/app/shell-navigation.ts'].map(load));
    const catalog = await loadCatalog();
    const entries = fill => { const memory = memoryStorage(); fill(); return Object.fromEntries(memory); };
    const silent = entries(() => gameAudio.updateSettings({muted: true, musicVolume: 0, sfxVolume: 0}));
    const game = createGame(catalog, JSON.stringify(newSave(SAVE_SEED)));
    for (const species of economy.STARTER_SPECIES) assert(game.dispatch({type: 'cheatAcquire', species, level: economy.STARTER_LEVEL}).ok);
    assert(game.dispatch({type: 'cheatResources', coins: SAVED_COINS}).ok);
    const text = game.exportSave(), tools = [...shell.TOOLBAR.left, shell.TOOLBAR.center, ...shell.TOOLBAR.right];
    const tool = id => ({label: tools.find(entry => entry.id === id).label, title: shell.WINDOW_TITLES[id]});
    return {silent, legacyKey: LEGACY_SAVE_KEY, legacy: {[LEGACY_SAVE_KEY]: text}, text, layout: {...SLOT_DATABASE},
      startingCoins: economy.STARTING_COINS, settings: tool('settings'), bag: tool('bag')};
  });
}

/** The slot rows of the open settings window: name, whether active, and the summary line. */
const slotRows = page => page.$$eval('.save-slot', rows => rows.map(row => ({
  name: row.querySelector('strong').textContent, active: row.classList.contains('is-active'), summary: row.querySelector('.save-slot-summary').textContent,
})));

/** The coins the bag shows. */
async function coins(page, fixture) {
  await openTool(page, fixture.bag);
  const shown = await page.$eval('.inventory-resources b', element => element.textContent);
  await closeWindow(page, fixture.bag.title);
  return Number(shown.replace(/\D/g, ''));
}

/** Waits for the notice of the game a slot switch opened: the switch closes every window. */
const switched = (page, notice) => page.waitForSelector(`.game-toast:text-is("${notice}")`, {timeout: BOOT_TIMEOUT_MS});

async function adoption({page, fixture}) {
  await waitWorld(page);
  const {records, active, text} = await saveSlots(page, fixture.layout);
  assert.deepEqual(records.map(record => [record.name, record.unreadable]), [['存档 1', null]]);
  assert.equal(active, records[0].id, '存档 1 is the active slot');
  assert.deepEqual(JSON.parse(text[active]), JSON.parse(fixture.text), 'the slot holds the pre-slot save unchanged');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), fixture.legacyKey), null, 'the pre-slot key is deleted once 存档 1 is stored');
  assert.equal(await coins(page, fixture), SAVED_COINS);
  await openTool(page, fixture.settings);
  assert.deepEqual((await slotRows(page)).map(({name, active}) => [name, active]), [['存档 1', true]]);
}

async function newLoadReloadDelete({page, fixture}) {
  await waitWorld(page);
  await openTool(page, fixture.settings);
  await page.click('.save-slots .save-slot-new');
  await page.click('.save-slots .save-slot-prompt .save-slot-confirm');
  await switched(page, '新存档「存档 2」已开始。');
  assert.equal(await coins(page, fixture), fixture.startingCoins, 'the new save is a new journey');
  await openTool(page, fixture.settings);
  assert.deepEqual((await slotRows(page)).map(({name, active}) => [name, active]), [['存档 1', false], ['存档 2', true]]);
  await page.click('.save-slot:not(.is-active) .save-slot-load');
  await switched(page, '已读取「存档 1」。');
  assert.equal(await coins(page, fixture), SAVED_COINS, 'loading 存档 1 opens its save');
  await page.reload({waitUntil: 'load', timeout: BOOT_TIMEOUT_MS});
  await waitWorld(page);
  assert.equal(await coins(page, fixture), SAVED_COINS, 'a reload opens the slot loaded last');
  await openTool(page, fixture.settings);
  assert.deepEqual((await slotRows(page)).map(({name, active}) => [name, active]), [['存档 1', true], ['存档 2', false]]);
  await page.click('.save-slot:not(.is-active) .save-slot-delete');
  await page.click('.save-slot .save-slot-prompt .save-slot-confirm');
  await page.waitForFunction(() => document.querySelectorAll('.save-slot').length === 1);
  const {records} = await saveSlots(page, fixture.layout);
  assert.deepEqual(records.map(record => record.name), ['存档 1'], 'the deleted slot is gone from storage');
}

const CHECKS = [
  {name: 'the pre-slot save is adopted unchanged as the active 存档 1, and its local storage key is deleted', run: adoption},
  {name: 'a new save opens in 存档 2, loading 存档 1 switches back, a reload opens 存档 1, and 存档 2 is deleted', run: newLoadReloadDelete},
];

function within(ms, promise) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const t = suite(NAME);
await buildApp(DIST);
const fixture = await fixtures(), engines = {};
for (const engine of ENGINES) {
  engines[engine] = 'ran';
  for (const check of CHECKS) {
    const skipped = await withBrowser(engine, browser => t.checkAsync(`${engine}: ${check.name}`, async () => {
      const session = await openGame(browser, {dist: DIST, silent: fixture.silent, seed: fixture.legacy});
      try { await within(CHECK_TIMEOUT_MS, check.run({...session, fixture})); } finally { await session.context.close(); }
    }));
    if (!skipped) continue;
    engines[engine] = `skipped: ${skipped}`;
    break;
  }
}
t.finish({engines});
