/**
 * Browser regressions: keyboard, focus and clickability behaviours that only a real browser shows, each fixed after the
 * 2026-10-18 playtest (design/notes/playtest-2026-10-18-wave3.md), and the Boss variant carried from the archive to the dialogue.
 * Status `needs-browser`: it needs a local Google Chrome, and runs every check in Playwright WebKit too when that is installed
 * (otherwise WebKit is reported as skipped).
 *
 * The app is built with Vite and served by request interception (`_browser.mjs`); the saves are built headlessly and seeded into
 * localStorage. Every page is silent. Each entry of CHECKS is one named check in a fresh browser; add new ones there.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {memoryStorage, root, suite, withSsr} from './_harness.mjs';
import {
  BOOT_TIMEOUT_MS, SETTLE_MS, buildApp, closeWindow, count, openGame, openTool, robot, talkToCreature, tool, wait, waitWorld, withBrowser,
} from './_browser.mjs';
import * as layout from './_layout-checks.mjs';

const NAME = 'browser-regressions';
const DIST = path.join(root, 'artifacts', NAME, 'dist');
const ENGINES = ['chrome', 'webkit'];
const CHECK_TIMEOUT_MS = 60_000;
const SAVE_SEED = 20261018;
/** The essence that sorts first in its pocket, so the bag shows it before any pick. */
const SHOWN_ESSENCE = {id: 'essence_recruit_200', copies: 1};
/** Picked in its content tab once the shown essence hatched; a repeatable species, so both copies stay within the six-copy allowance. */
const PICKED_ESSENCE = {id: 'essence_recruit_14', copies: 2};
/** An item of the essences' pocket in another content tab, which the bag must not select once an essence runs out. */
const NEIGHBOUR_ID = 'fusion_bead_301';
/** The raised save's lead can equip its owned ability engraving, so the slot picker lists a tile. */
const RAISED_LEVEL = 100;
const RAISED_COINS = 999_999;
const RAISED_ENGRAVING = '10001';
/** 玄武, whose encyclopedia entry leads to its campaign stage scene. */
const CAMPAIGN_SPECIES = 501;
/**
 * Bosses with variants, and the pick made in the archive: 厄尔塞拉's 周四, not its first, so the default pick does not stand in for it,
 * and 盖亚's practice fight (null), which the dialogue must not replace with a variant.
 */
const VARIANT_PICKS = [{id: 'boss_spt_eersaila', variant: 'thu'}, {id: 'boss_gaia', variant: null}];
const PRACTICE_LABEL = '练习战';
/** The laboratory save holds this essence (so the shop lists it) and stands where the explorer can use every lab facility. */
const LAB_ESSENCE = 'essence_recruit_14';
const LAB_POSITION = {x: 48, y: 62};
/** Copies of each breeding parent species, enough for the pairing to have a male and a female. */
const BREEDING_COPIES = 4;
/** The tower save has cleared these floors, so the Brave Tower window offers to resume the next one. */
const TOWER_CLEARED = 3;
/** The facilities save stands in the space-station hall at its 对战终端 (world-scene.ts), which opens the battle facilities. */
const FACILITY_HALL = {planetId: 'space-station', regionId: 'resources', x: 69, y: 44};

/** The silent storage entries, the saves (as storage entries) and the shell's toolbar, all from the game's own modules. */
async function fixtures() {
  return withSsr(NAME, async load => {
    const [{createGame}, {loadCatalog}, {newSave}, economy, {writeLocalSave}, {gameAudio}, shell, pockets, {writeWorldPreference}, locations, archive]
      = await Promise.all(['/src/kernel/game.ts', '/src/domain/catalog/catalog.ts', '/src/kernel/save.ts', '/src/domain/economy.ts',
        '/src/kernel/persistence.ts', '/src/shared/audio/game-audio.ts', '/src/app/shell-navigation.ts', '/src/shared/item-categories.ts',
        '/src/domain/world/preference.ts', '/src/domain/world/locations.ts', '/src/features/challenges/challenge-center.ts'].map(load));
    const catalog = await loadCatalog();
    /** The storage entries that `fill` writes. */
    const entries = fill => { const memory = memoryStorage(); fill(); return Object.fromEntries(memory); };
    const silent = entries(() => gameAudio.updateSettings({muted: true, musicVolume: 0, sfxVolume: 0}));
    assert(Object.values(silent).some(value => JSON.parse(value).muted === true), 'the game mute setting must be seeded');
    const dispatch = (game, action) => assert(game.dispatch(action).ok, `${action.type} failed`);
    /** A journey with the gift starters (and `items`, from a new save changed by `start`), changed by `build`; returns the game and its slot. */
    const journey = (items = {}, build = () => {}, start = () => {}) => {
      let game;
      const slot = entries(() => {
        const save = newSave(SAVE_SEED);
        Object.assign(save.items, items);
        start(save);
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
    const hatching = journey({[SHOWN_ESSENCE.id]: SHOWN_ESSENCE.copies, [PICKED_ESSENCE.id]: PICKED_ESSENCE.copies, [NEIGHBOUR_ID]: 1});
    const plain = journey(), lab = journey({[LAB_ESSENCE]: 1}, game => labParents(game, dispatch));
    const labPlace = entries(() => writeWorldPreference({...locations.LABORATORY_LOCATION, ...LAB_POSITION, visited: []}));
    const hallPlace = entries(() => writeWorldPreference({...FACILITY_HALL, visited: []}));
    // A new save has no game extras yet; the loader fills in the others.
    const tower = journey({}, () => {}, save => { save.game = {braveTower: {highestCleared: TOWER_CLEARED, resumeFloor: TOWER_CLEARED + 1}}; });
    const saves = {
      journey: plain.slot, raised: raised.slot, essence: hatching.slot, lab: {...lab.slot, ...labPlace}, tower: tower.slot,
      facilities: {...plain.slot, ...hallPlace},
    };
    const facilities = plain.game.snapshot().facilities.map(({name, teams}) => ({name, teams: !!teams?.length}));
    const {left, center, right} = shell.TOOLBAR;
    const tools = [...left, center, ...right].map(tool => ({id: tool.id, label: tool.label, title: shell.WINDOW_TITLES[tool.id]}));
    const variants = VARIANT_PICKS.map(({id, variant}) => {
      const boss = catalog.bosses.find(entry => entry.id === id), picked = variant && boss.variants.find(entry => entry.id === variant).label.zh;
      return {boss: boss.name.zh, label: picked ?? PRACTICE_LABEL, caption: picked ? `${boss.name.zh}（${picked}）` : boss.name.zh};
    });
    const allChallenges = archive.CHALLENGE_TABS.find(([tab]) => tab === 'all')[1];
    const labEssence = lab.game.snapshot().items.find(item => item.id === LAB_ESSENCE);
    const shopTab = pockets.ITEM_POCKETS.find(([pocket]) => pocket === pockets.itemPocket(labEssence.kind))[1];
    return {silent, saves, tools, essence: essenceLabels(hatching.game.snapshot().items, pockets), lab: {essence: labEssence.name, shopTab}, facilities,
      variants, allChallenges};
  });
}

/** Gives the laboratory save the parents of the first fusion and the first breeding recipe, so both can be confirmed. */
function labParents(game, dispatch) {
  const {fusion, breeding} = game.snapshot(), {recipe: fused} = fusion.recipes[0], {recipe: bred} = breeding.recipes[0];
  dispatch(game, {type: 'cheatAcquire', species: fused.primary[0], level: fused.minPrimaryLevel});
  dispatch(game, {type: 'cheatAcquire', species: fused.secondary[0], level: fused.minSecondaryLevel});
  for (let copy = 0; copy < BREEDING_COPIES; copy++) {
    for (const species of [bred.maleSpecies[0], bred.femaleSpecies[0]]) dispatch(game, {type: 'cheatAcquire', species, level: bred.minLevel});
  }
  const ready = game.snapshot();
  assert(ready.fusion.recipes[0].pairs.length && ready.breeding.recipes[0].pairs.length, 'the laboratory save cannot fuse or breed');
}

/** The essence save's bag labels: its pocket, the content tab that holds both essences and nothing else, and the essences. */
function essenceLabels(held, pockets) {
  const [shown, picked, neighbour] = [SHOWN_ESSENCE.id, PICKED_ESSENCE.id, NEIGHBOUR_ID].map(id => held.find(item => item.id === id));
  for (const [view, {id, copies}] of [[shown, SHOWN_ESSENCE], [picked, PICKED_ESSENCE]]) assert.equal(view?.count, copies, `the save lacks ${copies} ${id}`);
  const pocket = pockets.itemPocket(picked.kind), inPocket = held.filter(item => pockets.itemPocket(item.kind) === pocket);
  assert(neighbour && inPocket.includes(shown) && inPocket.includes(neighbour), `${NEIGHBOUR_ID} must share the essences' pocket`);
  const content = pockets.itemContentCategory(picked);
  const inTab = inPocket.filter(item => pockets.itemContentCategory(item) === content).map(item => item.id);
  assert.deepEqual(inTab.sort(), [SHOWN_ESSENCE.id, PICKED_ESSENCE.id].sort(), `the essences' content tab must hold them only`);
  const label = (options, id) => options.find(([option]) => option === id)[1];
  return {
    pocket: label(pockets.ITEM_POCKETS, pocket), tab: label(pockets.itemCategoryOptions(pocket, inPocket), content),
    shown: {name: shown.name, copies: shown.count}, picked: {name: picked.name, copies: picked.count},
  };
}

async function press(page, keys) { for (const key of keys) { await page.keyboard.press(key); await wait(SETTLE_MS); } }
const windows = page => page.$$eval('.scene-window', list => list.map(element => element.getAttribute('aria-label')));
/** Moves the mouse off every tile and lets a hover tooltip close (its Escape listener goes with it). */
const awayFromTiles = async page => { await page.mouse.move(2, 2); await wait(SETTLE_MS); };
const focusInside = (page, selector) => page.evaluate(selector => !!document.activeElement?.closest(selector), selector);
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
/** Opens the modifier from the settings window, which closes as the modifier opens. */
async function openModifier(page, fixture) {
  await openTool(page, tool(fixture, 'settings'));
  await page.click('.scene-window button:text-is("修改器")');
  await page.waitForSelector('.modifier-dialog');
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
  await openModifier(page, fixture);
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

const EXPLORATION_LAYER = '.exploration-layer';
/** What Enter on an exit or a creature would change: an open dialogue, the scene, the robot, the windows or the modifier. */
const sceneState = async page => ({
  dialogues: await count(page, '.world-dialogue'), scene: await page.$eval('.world-scene', element => element.getAttribute('aria-label')),
  robot: await robot(page), windows: await windows(page), modifier: await count(page, '.modifier-dialog'),
});

/** Behind the open `cover`, Tab cannot reach the scene, and Enter on an exit or a creature focused from script changes nothing. */
async function assertInertBehind(page, cover) {
  const reached = await tabStopsInside(page, EXPLORATION_LAYER, 'Tab', 30) + await tabStopsInside(page, EXPLORATION_LAYER, 'Shift+Tab', 30);
  assert.equal(reached, 0, `Tab reached the scene behind ${cover} ${reached} times`);
  for (const contact of ['.world-gate', '.world-roamer']) {
    const before = await sceneState(page);
    // Focus the contact from script, as the keyboard would if it could reach it, and press Enter.
    const focused = await page.evaluate(selector => {
      document.activeElement?.blur?.();
      const element = document.querySelector(selector);
      element?.focus();
      return element ? document.activeElement === element : null;
    }, contact);
    assert.notEqual(focused, null, `the scene has no ${contact}`);
    await press(page, ['Enter']);
    const after = await sceneState(page), changed = Object.keys(before).filter(key => !isDeepStrictEqual(after[key], before[key]));
    assert.deepEqual(changed, [], `Enter on ${contact} behind ${cover} changed the ${changed.join(', ')}`);
    assert.equal(focused, false, `${contact} took the focus behind ${cover}`);
  }
}

async function inertScene({page, fixture}) {
  await waitWorld(page);
  assert(await tabStopsInside(page, EXPLORATION_LAYER, 'Tab', 12) > 0, 'without a window, Tab must reach the scene (the control case)');
  const quests = tool(fixture, 'quests');
  await openTool(page, quests);
  await assertInertBehind(page, `the ${quests.title} window`);
  await closeWindow(page, quests.title);
  await openModifier(page, fixture);
  await assertInertBehind(page, 'the modifier');
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

const essenceTile = name => `.inventory-icon-scroll .item-tile[aria-label^="${name}"]`;
const contentTabs = 'nav[aria-label="道具用途"]';

/** Presses 确认孵化 once for each copy of the selected essence `name`, checking that it is enabled each time. */
async function hatchEvery(page, {name, copies}) {
  const confirm = page.locator('.inventory-detail-scroll button.primary');
  assert.equal(await confirm.textContent(), '确认孵化', `${name} is not ready to hatch`);
  for (let copy = 0; copy < copies; copy++) {
    assert(await confirm.isEnabled(), `确认孵化 is disabled with ${copies - copy} copies of ${name} left`);
    await confirm.click();
    await wait(SETTLE_MS);
  }
}

/** Once the last copy of `name` has hatched (`when`), the pocket lists other items only, selects none, and 确认孵化 is disabled. */
async function selectsNothing(page, name, when) {
  const left = await page.locator('.inventory-icon-scroll .item-tile').evaluateAll(list => list.map(tile => tile.getAttribute('aria-label')));
  assert(left.length && !left.some(label => label.startsWith(name)), `${when}, the pocket should list only the other items: ${left.join(', ')}`);
  assert.equal(await count(page, '.inventory-icon-scroll .item-tile[aria-pressed="true"]'), 0, `${when}, the bag selected another item`);
  assert.equal(await count(page, '.inventory-detail-scroll button:text-is("确认孵化"):enabled'), 0, `${when}, 确认孵化 stays enabled`);
}

async function lastEssence({page, fixture}) {
  const {pocket, tab, shown, picked} = fixture.essence;
  await waitWorld(page);
  await openTool(page, tool(fixture, 'bag'));
  await page.click(`.inventory-primary-categories button:text-is("${pocket}")`);
  // Hatching the essence the bag shows before any pick pins it, so the selection does not move on to the next item.
  assert.equal(await count(page, `${essenceTile(shown.name)}[aria-pressed="true"]`), 1, `the bag does not show ${shown.name} first`);
  await hatchEvery(page, shown);
  await selectsNothing(page, shown.name, `after hatching ${shown.name}, the essence the bag showed`);
  // The picked essence is the last of its content tab, so the filter falls back to 全部 as it runs out, and keeps the pick.
  await page.click(`${contentTabs} button:text-is("${tab}")`);
  await page.click(essenceTile(picked.name));
  await awayFromTiles(page);
  await hatchEvery(page, picked);
  assert.equal(await count(page, contentTabs), 0, `the ${tab} tab is still offered after its last essence hatched`);
  await selectsNothing(page, picked.name, `after hatching ${picked.name}, picked in the ${tab} tab`);
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

/** The variant (or practice fight) picked in the challenge archive is preselected in the Boss dialogue it travels to, and the battle starts with it. */
async function variantChoice({page, fixture}, {boss, label, caption: named}) {
  const picked = scope => page.$eval(`${scope} .boss-variant-choice input:checked`,
    input => input.closest('label').querySelector('strong').firstChild.textContent);
  await waitWorld(page);
  await openTool(page, tool(fixture, 'challenge'));
  await page.click(`.challenge-category-tabs button:text-is("${fixture.allChallenges}")`);
  await page.fill('input[aria-label="搜索挑战"]', boss);
  await page.click(`.challenge-index-scroll button:has(strong:text-is("${boss}"))`);
  await page.locator('.challenge-entry-scroll .boss-variant-option', {hasText: label}).click();
  assert.equal(await picked('.challenge-entry-scroll'), label, 'the archive did not pick the variant');
  await page.click('.challenge-management .management-confirm-row button.primary');
  await page.waitForSelector('.world-dialogue .boss-variant-choice');
  assert.equal(await picked('.world-dialogue'), label, 'the Boss dialogue lost the variant picked in the archive');
  await page.click('.world-dialogue-actions button.primary');
  await page.waitForSelector('.classic-battle');
  const caption = await page.$eval('.classic-battle-caption > span', element => element.textContent);
  assert(caption.startsWith(`${named} `), `the battle did not start with the pick: ${caption}`);
}

const size = ({width, height}) => `${width}x${height}`;
/** The styling fixes of the 2026-10-18 D-styles unit (_layout-checks.mjs); the narrow ones run at both container layouts. */
const LAYOUT_CHECKS = [
  {name: 'the battle result title is clear of the record panel, also once the record is opened', save: 'raised', run: layout.resultTitle},
  ...layout.NARROW_VIEWPORTS.slice(0, 1).map(viewport => ({
    name: `the battle result title is clear of the record panel, also once the record is opened, at ${size(viewport)}`,
    save: 'raised', viewport, run: layout.resultTitle,
  })),
  {name: 'a click on the notice toast reaches the scene under it, and the toast stays', save: 'raised', run: layout.toastClickThrough},
  {name: 'the labelled toolbar icons (图鉴, 恢复, 设置) fill their buttons', run: layout.toolbarIcons},
  {name: 'the PetBag 资料 headings, 放生精灵 among them, are legible on their section background', run: layout.profileHeadings},
  {name: 'the engraving shop filter fields are tall enough for their text', save: 'lab', run: layout.engravingFilters},
  ...layout.NARROW_VIEWPORTS.map(viewport => ({name: `the PetBag skill editor shows a learned skill without scrolling the panel at ${size(viewport)}`,
    viewport, run: layout.skillEditorRow})),
  {name: 'the battle party buttons, battle item category tabs and the world dialogue × change on hover', run: layout.hoverCues},
  {name: 'no property on the world, PetBag and battle screens is decided by the stylesheet bundle order', run: layout.journeyCascade},
  ...layout.NARROW_VIEWPORTS.map(viewport => ({name: `no property on the world, PetBag and battle screens is decided by the bundle order at ${size(viewport)}`,
    viewport, run: layout.journeyCascade})),
  {name: 'no property on the essence order form, engraving shop and fusion and breeding result cards is decided by the bundle order', save: 'lab',
    run: layout.labCascade},
  {name: 'no property on the SPT window and the Brave Tower resume row is decided by the bundle order', save: 'tower', run: layout.towerCascade},
  {name: 'no property on the battle facilities window\'s tabs is decided by the bundle order', save: 'facilities', run: layout.facilityCascade},
  // The smallest frame also gives the facilities panel its short, scrolling layout.
  {name: `no property on the battle facilities window's tabs is decided by the bundle order at ${size(layout.NARROW_VIEWPORTS.at(-1))}`,
    save: 'facilities', viewport: layout.NARROW_VIEWPORTS.at(-1), run: layout.facilityCascade},
];

/** Each check runs in every engine, in a fresh browser with its save (`journey` by default) and viewport (1280x800 by default). */
const CHECKS = [
  {name: 'boots and opens every toolbar window without page or console errors', run: bootAndWindows},
  {name: 'the arrows do not walk the robot behind a window or the modifier, and walk again after closing', run: arrowsBehindCovers},
  {name: 'the arrows do not walk the hidden robot during a campaign stage scene, and walk again after leaving it', run: arrowsBehindCampaign},
  {name: 'the scene is inert behind a window and the modifier: Tab cannot reach exits or creatures, and Enter does not use them', run: inertScene},
  {name: 'the world dialogue closes on Escape with the focus on any of its buttons', run: dialogueEscape},
  {name: 'Escape closes an item tooltip, then the engraving slot picker, then the window', save: 'raised', run: nestedEscape},
  {name: 'an item tile opens its tooltip on keyboard focus, not on the focus a click gives', run: tooltipFocus},
  {name: 'once the essence the bag shows, or one picked in its content tab, runs out, the bag selects nothing and 确认孵化 is disabled', save: 'essence',
    run: lastEssence},
  {name: 'the battle creature-details modal closes on Escape', run: battleDetailsEscape},
  {name: 'the Boss variant picked in the challenge archive is preselected in its dialogue and starts the battle',
    run: session => variantChoice(session, session.fixture.variants[0])},
  {name: 'the practice fight picked in the challenge archive is preselected in the Boss dialogue and starts the battle',
    run: session => variantChoice(session, session.fixture.variants[1])},
  ...LAYOUT_CHECKS,
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
    const session = await openGame(browser, {dist: DIST, silent: fixture.silent, seed: fixture.saves[check.save ?? 'journey'], viewport: check.viewport});
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
  for (const check of CHECKS) {
    const skipped = await runCheck(engine, check);
    if (!skipped) continue;
    engines[engine] = `skipped: ${skipped}`;
    console.log(`${engine} skipped: ${skipped}`);
    break;
  }
}
timings.total = seconds(started);
t.finish({engines, timings});
