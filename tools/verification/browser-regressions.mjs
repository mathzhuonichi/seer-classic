/**
 * Browser regressions: keyboard, focus and clickability behaviours that only a real browser shows, each fixed after the
 * 2026-10-18 playtest (design/notes/playtest-2026-10-18-wave3.md). Status `needs-browser`: it needs a local Google Chrome, and
 * runs every check in Playwright WebKit too when that is installed (otherwise WebKit is reported as skipped).
 *
 * The app is built with Vite and served by request interception (`_browser.mjs`); the saves are built headlessly and seeded into
 * localStorage. Every page is silent. Each entry of CHECKS is one named check in a fresh browser; add new ones there.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {memoryStorage, root, suite, withSsr} from './_harness.mjs';
import {BOOT_TIMEOUT_MS, buildApp, openGame, withBrowser} from './_browser.mjs';

const NAME = 'browser-regressions';
const DIST = path.join(root, 'artifacts', NAME, 'dist');
const ENGINES = ['chrome', 'webkit'];
const CHECK_TIMEOUT_MS = 60_000;
/** Time for a key press to take effect (or, for a check that nothing happened, to have taken effect). */
const SETTLE_MS = 250;
const SAVE_SEED = 20261018;
/** A repeatable species' essence, so hatching both copies stays within the six-copy allowance. */
const ESSENCE_ID = 'essence_recruit_14';
const ESSENCE_COPIES = 2;
/** Another item of the same pocket, which the bag must not select once the essence runs out. */
const NEIGHBOUR_ID = 'fusion_bead_301';
/** The raised save's lead can equip its owned ability engraving, so the slot picker lists a tile. */
const RAISED_LEVEL = 100;
const RAISED_COINS = 999_999;
const RAISED_ENGRAVING = '10001';
/** 玄武, whose encyclopedia entry leads to its campaign stage scene. */
const CAMPAIGN_SPECIES = 501;

/** The silent storage entries, the saves (as storage entries) and the shell's toolbar, all from the game's own modules. */
async function fixtures() {
  return withSsr(NAME, async load => {
    const [{createGame}, {loadCatalog}, {newSave}, economy, {writeLocalSave}, {gameAudio}, shell, pockets] = await Promise.all([
      '/src/kernel/game.ts', '/src/domain/catalog/catalog.ts', '/src/kernel/save.ts', '/src/domain/economy.ts', '/src/kernel/persistence.ts',
      '/src/shared/audio/game-audio.ts', '/src/app/shell-navigation.ts', '/src/shared/item-categories.ts'].map(load));
    const catalog = await loadCatalog();
    /** The storage entries that `fill` writes. */
    const entries = fill => { const memory = memoryStorage(); fill(); return Object.fromEntries(memory); };
    const silent = entries(() => gameAudio.updateSettings({muted: true, musicVolume: 0, sfxVolume: 0}));
    assert(Object.values(silent).some(value => JSON.parse(value).muted === true), 'the game mute setting must be seeded');
    const dispatch = (game, action) => assert(game.dispatch(action).ok, `${action.type} failed`);
    /** A journey with the gift starters (and `items`), changed by `build`; returns the game and its save slot. */
    const journey = (items = {}, build = () => {}) => {
      let game;
      const slot = entries(() => {
        const save = newSave(SAVE_SEED);
        Object.assign(save.items, items);
        game = createGame(structuredClone(catalog), JSON.stringify(save));
        for (const species of economy.STARTER_SPECIES) dispatch(game, {type: 'cheatAcquire', species, level: economy.STARTER_LEVEL});
        build(game);
        writeLocalSave(game.exportSave());
      });
      return {game, slot};
    };
    const raised = journey({}, game => {
      dispatch(game, {type: 'cheatMonster', uid: game.snapshot().party[0], level: RAISED_LEVEL});
      dispatch(game, {type: 'cheatResources', coins: RAISED_COINS});
      dispatch(game, {type: 'buyEngraving', engravingId: RAISED_ENGRAVING});
    });
    const hatching = journey({[ESSENCE_ID]: ESSENCE_COPIES, [NEIGHBOUR_ID]: 1}), held = hatching.game.snapshot().items;
    const essence = held.find(item => item.id === ESSENCE_ID), neighbour = held.find(item => item.id === NEIGHBOUR_ID);
    assert.equal(essence?.count, ESSENCE_COPIES, `the essence save must hold ${ESSENCE_COPIES} copies of ${ESSENCE_ID}`);
    const pocket = kind => pockets.ITEM_POCKETS.find(([id]) => id === pockets.itemPocket(kind))[1];
    assert.equal(neighbour && pocket(neighbour.kind), pocket(essence.kind), `${NEIGHBOUR_ID} must share the essence's pocket`);
    const saves = {journey: journey().slot, raised: raised.slot, essence: hatching.slot};
    const {left, center, right} = shell.TOOLBAR;
    const tools = [...left, center, ...right].map(tool => ({id: tool.id, label: tool.label, title: shell.WINDOW_TITLES[tool.id]}));
    return {silent, saves, tools, essence: {name: essence.name, pocket: pocket(essence.kind)}};
  });
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function press(page, keys) { for (const key of keys) { await page.keyboard.press(key); await wait(SETTLE_MS); } }
const robot = page => page.$eval('.world-player', element => `${element.style.left} ${element.style.top}`);
const windows = page => page.$$eval('.scene-window', list => list.map(element => element.getAttribute('aria-label')));
const count = (page, selector) => page.locator(selector).count();
/** Moves the mouse off every tile and lets a hover tooltip close (its Escape listener goes with it). */
const awayFromTiles = async page => { await page.mouse.move(2, 2); await wait(SETTLE_MS); };
const focusInside = (page, selector) => page.evaluate(selector => !!document.activeElement?.closest(selector), selector);
const waitWorld = page => page.waitForSelector('.world-scene .world-player', {timeout: BOOT_TIMEOUT_MS});
const tool = (fixture, id) => fixture.tools.find(entry => entry.id === id);

async function openTool(page, {label, title}) {
  await page.click(`.game-toolbar button[aria-label="${label}"]`);
  await page.waitForSelector(`.scene-window[aria-label="${title}"]`);
}
async function closeWindow(page, title) {
  await page.keyboard.press('Escape');
  await page.waitForSelector(`.scene-window[aria-label="${title}"]`, {state: 'detached'});
}
/** Presses `key` up to `times` times and counts the presses that left the focus inside `selector`. */
async function tabStopsInside(page, selector, key, times) {
  let inside = 0;
  for (let i = 0; i < times; i++) { await page.keyboard.press(key); if (await focusInside(page, selector)) inside++; }
  return inside;
}
/** Walks with the arrows until the robot moves (an edge can block one direction); returns whether it moved. */
async function walks(page) {
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    const before = await robot(page);
    await press(page, [key]);
    if (await robot(page) !== before) return true;
  }
  return false;
}
/** Opens the world dialogue of the first wild creature (the robot walks up to it). */
async function talkToCreature(page) {
  await page.locator('.world-roamer').first().evaluate(element => element.click());
  await page.waitForSelector('.world-dialogue');
}

async function bootAndWindows({page, errors, failed, fixture}) {
  await waitWorld(page);
  for (const entry of fixture.tools) { await openTool(page, entry); await wait(SETTLE_MS); await closeWindow(page, entry.title); }
  await wait(SETTLE_MS);
  assert.deepEqual(errors, [], `page or console errors: ${errors.slice(0, 5).join(' | ')}`);
  assert.deepEqual(failed, [], `failed requests: ${failed.slice(0, 5).join(' | ')}`);
}

/** Presses each arrow once and returns the robot positions after each press (they differ when it walks). */
async function arrowTrail(page) {
  const trail = [];
  for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) { await press(page, [key]); trail.push(await robot(page)); }
  return trail;
}

async function arrowsBehindCovers({page, fixture}) {
  await waitWorld(page);
  for (const entry of fixture.tools) {
    await openTool(page, entry);
    const before = await robot(page);
    // Also with the focus forced onto the scene: it is inert, so the focus stays where it was.
    await page.evaluate(() => document.querySelector('.world-scene')?.focus());
    assert.deepEqual(await arrowTrail(page), Array(4).fill(before), `the arrows walked the robot behind ${entry.title}`);
    await closeWindow(page, entry.title);
  }
  await openTool(page, tool(fixture, 'settings'));
  await page.click('.scene-window button:text-is("修改器")');
  await page.waitForSelector('.modifier-dialog');
  const before = await robot(page);
  assert.deepEqual(await arrowTrail(page), Array(4).fill(before), 'the arrows walked the robot behind the modifier');
  // The dialog itself takes the focus when its body is clicked; its form fields swallow the arrows anyway.
  await page.$eval('.modifier-dialog', dialog => dialog.focus());
  assert.deepEqual(await arrowTrail(page), Array(4).fill(before), 'the arrows walked the robot behind the focused modifier');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modifier-dialog', {state: 'detached'});
  assert(await walks(page), 'the arrows do not walk the robot once the modifier is closed');
}

async function arrowsBehindCampaign({page, fixture}) {
  await waitWorld(page);
  const before = await robot(page);
  await openTool(page, tool(fixture, 'dex'));
  await page.fill('[aria-label="搜索精灵图鉴"]', String(CAMPAIGN_SPECIES));
  await page.locator(`.scene-window button:has-text("#${String(CAMPAIGN_SPECIES).padStart(4, '0')}")`).first().click();
  await page.click('.management-locate-button');
  await page.waitForSelector('.campaign-scene');
  // The hidden robot is not redrawn during the scene, so the presses all lead away from the start and the robot is
  // compared once the world shows again.
  await press(page, ['ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp']);
  await page.click('.campaign-return');
  await page.waitForSelector('.campaign-scene', {state: 'detached'});
  await wait(SETTLE_MS);
  assert.equal(await robot(page), before, 'the arrows walked the hidden robot during the campaign stage scene');
  assert(await walks(page), 'the arrows do not walk the robot after leaving the campaign stage scene');
}

async function inertScene({page, fixture}) {
  await waitWorld(page);
  const layer = '.exploration-layer';
  assert(await tabStopsInside(page, layer, 'Tab', 12) > 0, 'without a window, Tab must reach the scene (the control case)');
  const quests = tool(fixture, 'quests');
  await openTool(page, quests);
  const reached = await tabStopsInside(page, layer, 'Tab', 30) + await tabStopsInside(page, layer, 'Shift+Tab', 30);
  assert.equal(reached, 0, `Tab reached the scene behind the window ${reached} times`);
  for (const contact of ['.world-gate', '.world-roamer']) {
    const scene = await page.$eval('.world-scene', element => element.getAttribute('aria-label')), before = await robot(page);
    // Focus the contact from script, as the keyboard would if it could reach it, and press Enter.
    const focused = await page.evaluate(selector => {
      document.activeElement?.blur?.();
      const element = document.querySelector(selector);
      element?.focus();
      return element ? document.activeElement === element : null;
    }, contact);
    assert.notEqual(focused, null, `the scene has no ${contact}`);
    await press(page, ['Enter']);
    assert.equal(await count(page, '.world-dialogue'), 0, `Enter on ${contact} opened a dialogue behind the window`);
    assert.equal(await page.$eval('.world-scene', element => element.getAttribute('aria-label')), scene, `Enter on ${contact} left the scene`);
    assert.equal(await robot(page), before, `Enter on ${contact} walked the robot`);
    assert.deepEqual(await windows(page), [quests.title], `Enter on ${contact} changed the window`);
    assert.equal(focused, false, `${contact} took the focus behind the window`);
  }
}

async function dialogueEscape({page}) {
  await waitWorld(page);
  await talkToCreature(page);
  const buttons = await count(page, '.world-dialogue button');
  assert(buttons > 1, 'the dialogue has buttons');
  for (let index = 0; index < buttons; index++) {
    if (index) await talkToCreature(page);
    const button = page.locator('.world-dialogue button').nth(index);
    const label = await button.evaluate(element => { element.focus(); return element.textContent || element.ariaLabel; });
    assert(await focusInside(page, '.world-dialogue'), `the dialogue's ${label} button takes the focus`);
    await press(page, ['Escape']);
    assert.equal(await count(page, '.world-dialogue'), 0, `Escape with the focus on ${label} left the dialogue open`);
  }
}

/** The state of the window's layers: windows, the engraving picker and the item tooltip. */
const layers = async page => ({windows: await windows(page), picker: await count(page, '.engraving-picker'), tooltip: await count(page, '.item-tooltip')});

async function nestedEscape({page, fixture}) {
  await waitWorld(page);
  const monsters = tool(fixture, 'monsters'), slot = page.locator('.engraving-equipped-slot .item-tile').first();
  await openTool(page, monsters);
  await page.locator('.petbag-party-strip > *').first().click();
  await page.click('.scene-window button:text-is("能力")');
  await slot.click();
  await page.waitForSelector('.engraving-picker');
  await awayFromTiles(page);
  await press(page, ['Escape']);
  assert.deepEqual(await layers(page), {windows: [monsters.title], picker: 0, tooltip: 0}, 'Escape after a click closes the picker only');
  await slot.click();
  await page.waitForSelector('.engraving-picker');
  await awayFromTiles(page);
  await page.locator('.engraving-picker .item-tile').first().focus();
  await press(page, ['Tab', 'Shift+Tab']);
  assert.deepEqual(await layers(page), {windows: [monsters.title], picker: 1, tooltip: 1}, 'keyboard focus on a picker tile opens its tooltip');
  await press(page, ['Escape']);
  assert.deepEqual(await layers(page), {windows: [monsters.title], picker: 1, tooltip: 0}, 'the first Escape closes the tooltip only');
  await press(page, ['Escape']);
  assert.deepEqual(await layers(page), {windows: [monsters.title], picker: 0, tooltip: 0}, 'the second Escape closes the picker only');
  await press(page, ['Escape']);
  assert.deepEqual(await layers(page), {windows: [], picker: 0, tooltip: 0}, 'the third Escape closes the window');
  const bag = tool(fixture, 'bag');
  await openTool(page, bag);
  await page.locator('.scene-window .item-tile').first().hover();
  await page.waitForSelector('.item-tooltip');
  await press(page, ['Escape']);
  assert.deepEqual(await layers(page), {windows: [bag.title], picker: 0, tooltip: 0}, 'Escape on a hovered bag tile closes its tooltip only');
}

async function tooltipFocus({page, engine, fixture}) {
  await waitWorld(page);
  await openTool(page, tool(fixture, 'bag'));
  const tiles = page.locator('.inventory-icon-scroll .item-tile');
  assert(await tiles.count() > 1, 'the bag shows at least two tiles');
  await tiles.first().click();
  await awayFromTiles(page);
  // WebKit gives a clicked button no focus; Chrome does, and that focus is the case under test.
  if (engine === 'chrome') assert(await focusInside(page, '.inventory-icon-scroll .item-tile'), 'the click focuses the tile');
  assert.equal(await count(page, '.item-tooltip'), 0, 'the focus a click gives opened the tooltip');
  await press(page, ['Tab']);
  assert(await focusInside(page, '.inventory-icon-scroll .item-tile'), 'Tab moves to the next tile');
  assert.equal(await count(page, '.item-tooltip'), 1, 'keyboard focus did not open the tooltip');
}

async function lastEssence({page, fixture}) {
  const {name, pocket} = fixture.essence;
  await waitWorld(page);
  await openTool(page, tool(fixture, 'bag'));
  await page.click(`.inventory-primary-categories button:text-is("${pocket}")`);
  await page.click(`.inventory-icon-scroll .item-tile[aria-label^="${name}"]`);
  await awayFromTiles(page);
  const confirm = page.locator('.inventory-detail-scroll button.primary');
  assert.equal(await confirm.textContent(), '确认孵化');
  for (let copy = 0; copy < ESSENCE_COPIES; copy++) {
    assert(await confirm.isEnabled(), `确认孵化 is disabled with ${ESSENCE_COPIES - copy} copies left`);
    await confirm.click();
    await wait(SETTLE_MS);
  }
  const left = await page.locator('.inventory-icon-scroll .item-tile').evaluateAll(list => list.map(tile => tile.getAttribute('aria-label')));
  assert(left.length && !left.some(label => label.startsWith(name)), `the pocket should list only the other item: ${left.join(', ')}`);
  assert.equal(await count(page, '.inventory-icon-scroll .item-tile[aria-pressed="true"]'), 0, 'the bag selected another item');
  assert.equal(await count(page, '.inventory-detail-scroll button:text-is("确认孵化"):enabled'), 0, '确认孵化 stays enabled');
}

async function battleDetailsEscape({page}) {
  await waitWorld(page);
  await talkToCreature(page);
  await page.click('.world-dialogue button.primary');
  await page.waitForFunction(() => document.querySelector('.classic-command-deck')?.getAttribute('aria-busy') === 'false', null, {timeout: BOOT_TIMEOUT_MS});
  await page.click('.classic-command-tabs button[aria-label="精灵"]');
  await page.click('.classic-party-actions button:text-is("详情")');
  await page.waitForSelector('.classic-creature-details');
  await press(page, ['Escape']);
  assert.equal(await count(page, '.classic-creature-details'), 0, 'Escape left the creature details open');
  assert.equal(await count(page, '.classic-battle'), 1, 'Escape left the battle');
}

/** Each check runs in a fresh browser with its save (`journey` by default), in every engine of `engines` (default: all). */
const CHECKS = [
  {name: 'boots and opens every toolbar window without page or console errors', run: bootAndWindows},
  {name: 'the arrows do not walk the robot behind a window or the modifier, and walk again after closing', run: arrowsBehindCovers},
  {name: 'the arrows do not walk the hidden robot during a campaign stage scene, and walk again after leaving it', run: arrowsBehindCampaign},
  {name: 'the scene is inert behind a window: Tab cannot reach exits or creatures, and Enter does not use them', run: inertScene},
  {name: 'the world dialogue closes on Escape with the focus on any of its buttons', run: dialogueEscape},
  {name: 'Escape closes an item tooltip, then the engraving slot picker, then the window', save: 'raised', run: nestedEscape},
  {name: 'an item tile opens its tooltip on keyboard focus, not on the focus a click gives', run: tooltipFocus},
  {name: 'after the last copy of a picked essence hatches, the bag selects nothing and 确认孵化 is disabled', save: 'essence', run: lastEssence},
  {name: 'the battle creature-details modal closes on Escape', run: battleDetailsEscape},
];

function within(ms, promise) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const seconds = since => Number(((performance.now() - since) / 1000).toFixed(1));

/**
 * Runs `check` in a browser of its own, which also keeps the checks apart: a Chrome that had run every check took minutes
 * to close. Resolves to the skip reason when the engine is not installed.
 */
function runCheck(engine, check) {
  const label = `${engine}: ${check.name}`, began = performance.now();
  return withBrowser(engine, browser => t.checkAsync(label, async () => {
    const session = await openGame(browser, {dist: DIST, silent: fixture.silent, seed: fixture.saves[check.save ?? 'journey']});
    try { await within(CHECK_TIMEOUT_MS, check.run({...session, engine, fixture})); } finally { await session.context.close(); }
  })).then(skipped => { if (!skipped) timings[label] = seconds(began); return skipped; });
}

const started = performance.now(), t = suite(NAME), timings = {};
await buildApp(DIST);
timings.build = seconds(started);
const built = performance.now(), fixture = await fixtures();
timings.saves = seconds(built);
const engines = {};
for (const engine of ENGINES) {
  engines[engine] = 'ran';
  for (const check of CHECKS.filter(entry => !entry.engines || entry.engines.includes(engine))) {
    const skipped = await runCheck(engine, check);
    if (!skipped) continue;
    engines[engine] = `skipped: ${skipped}`;
    console.log(`${engine} skipped: ${skipped}`);
    break;
  }
}
timings.total = seconds(started);
t.finish({engines, timings});
