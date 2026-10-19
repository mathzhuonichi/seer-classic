/**
 * Layout and clickability checks for browser-regressions.mjs: the styling fixes of the wave-3 D-styles unit, each something
 * only a rendered page shows, and the bundle-order audit (`_cascade.mjs`) over the screens that unit restyled. Every check
 * takes the suite's `{page, fixture}` and throws on failure.
 */
import assert from 'node:assert/strict';
import {
  BOOT_TIMEOUT_MS, SETTLE_MS, closeWindow, count, openTool, robot, talkToCreature, tool, wait, waitCommands, waitWorld,
} from './_browser.mjs';
import {orderDecided} from './_cascade.mjs';

/** How long Playwright may look for a control a player can hit before the check fails. */
const HIT_TIMEOUT_MS = 5_000;
/** WCAG AA contrast for normal-size text. */
const MIN_TEXT_CONTRAST = 4.5;
/** The smallest line box of `line-height: normal`, per pixel of font size (Chrome draws a select's text at normal height). */
const NORMAL_LINE = 1.2;
/** The container layouts below 780 and 620 pixels, where the battle and the bag rearrange. */
export const NARROW_VIEWPORTS = [{width: 760, height: 520}, {width: 600, height: 420}];

/** Starts a battle with the first wild creature of the scene. */
async function wildBattle(page) {
  await waitWorld(page);
  await talkToCreature(page);
  await page.click('.world-dialogue button.primary');
  await waitCommands(page);
}
/** Uses the lead's first damaging skill; the raised save's Lv.100 lead wins with it. */
const strike = page => page.locator('.classic-skill:not(:disabled):not(.category-属性)').first().click();
/** Starts the Boss battle of the challenge the SPT window offers first. */
async function sptBattle(page, fixture) {
  await waitWorld(page);
  await openTool(page, tool(fixture, 'challenge'));
  await page.click('.scene-window .management-confirm-row button.primary');
  await page.locator('.world-scene .world-boss').first().evaluate(element => element.click());
  await page.click('.world-dialogue button.primary');
  await waitCommands(page);
}

export async function evidenceButton({page, fixture}) {
  await sptBattle(page, fixture);
  const button = page.locator('.classic-boss-evidence-button');
  // Playwright's actionability check hit-tests the button's centre and fails while another element takes the click there.
  await button.click({trial: true, timeout: HIT_TIMEOUT_MS});
  await button.click({timeout: HIT_TIMEOUT_MS});
  await page.waitForSelector('.classic-boss-evidence-modal', {timeout: HIT_TIMEOUT_MS});
}

const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
export async function resultTitle({page}) {
  await wildBattle(page);
  await strike(page);
  await page.waitForSelector('.classic-battle-result strong', {timeout: BOOT_TIMEOUT_MS});
  const [title, panel] = await page.evaluate(() => ['.classic-battle-result strong', '.classic-dialogue'].map(selector => {
    const {left, right, top, bottom} = document.querySelector(selector).getBoundingClientRect();
    return {left, right, top, bottom};
  }));
  assert.equal(overlap(title, panel), 0, `the result title ${JSON.stringify(title)} overlaps the record panel ${JSON.stringify(panel)}`);
}

export async function toastClickThrough({page}) {
  await wildBattle(page);
  await strike(page);
  // The finished battle closes by itself, and its result shows as the notice toast over the scene.
  const toast = page.locator('.game-toast');
  await toast.waitFor({timeout: BOOT_TIMEOUT_MS});
  const before = await robot(page);
  await toast.click({force: true});
  await wait(SETTLE_MS);
  assert.equal(await count(page, '.game-toast'), 1, 'a click on the notice dismissed it');
  assert.notEqual(await robot(page), before, 'a click on the notice did not reach the scene under it');
}

export async function toolbarIcons({page}) {
  await waitWorld(page);
  const icons = await page.$$eval('.game-toolbar button:has(>.toolbar-label)', buttons => buttons.map(button => {
    const style = getComputedStyle(button), inner = button.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return {label: button.getAttribute('aria-label'), icon: button.querySelector(':scope>img').clientWidth, inner};
  }));
  assert(icons.length >= 3, `the toolbar has ${icons.length} labelled buttons`);
  assert.deepEqual(icons.filter(({icon, inner}) => icon < inner - 1), [], 'labelled toolbar icons narrower than their button');
}

/** Runs in the page: each element's text contrast against the nearest opaque background behind it. */
function textContrast(elements) {
  const channels = color => color.match(/[\d.]+/g).map(Number);
  const luminance = rgb => rgb.slice(0, 3).map(value => value / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const background = element => {
    for (let node = element; node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      if ((channels(color)[3] ?? 1) === 1) return color;
    }
    return 'rgb(255, 255, 255)';
  };
  return elements.map(element => {
    const [a, b] = [getComputedStyle(element).color, background(element)].map(color => luminance(channels(color)));
    return {text: element.textContent, contrast: Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2))};
  });
}

export async function profileHeadings({page, fixture}) {
  await waitWorld(page);
  await openTool(page, tool(fixture, 'monsters'));
  await page.click('.official-petbag .management-tabs button:text-is("资料")');
  const headings = await page.$$eval('.official-petbag .raising-forms h4', textContrast);
  assert(headings.some(({text}) => text === '放生精灵'), `the 资料 tab lacks the 放生精灵 heading: ${headings.map(({text}) => text).join(', ')}`);
  assert.deepEqual(headings.filter(({contrast}) => contrast < MIN_TEXT_CONTRAST), [], '资料 headings below the text contrast minimum');
}

const openLabShop = async page => { await waitWorld(page); await page.click('.world-scene button.world-lab-shop'); };
export async function engravingFilters({page}) {
  await openLabShop(page);
  await page.click('.shop-primary-categories button:text-is("刻印")');
  const fields = await page.$$eval('.engraving-filter-row>select', (list, normal) => list.map(select => {
    const style = getComputedStyle(select);
    return {label: select.getAttribute('aria-label'), content: select.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
      line: style.lineHeight === 'normal' ? parseFloat(style.fontSize) * normal : parseFloat(style.lineHeight)};
  }), NORMAL_LINE);
  assert(fields.length > 0, 'the engraving shop shows no filter fields');
  assert.deepEqual(fields.filter(({content, line}) => content < line), [], 'engraving filter fields lower than their text line');
}

export async function skillEditorRow({page, fixture}) {
  await waitWorld(page);
  await openTool(page, tool(fixture, 'monsters'));
  await page.click('.petbag-nav-skills');
  await page.waitForSelector('.learned-skill-list>button');
  const shown = await page.evaluate(() => {
    const rect = selector => document.querySelector(`.official-petbag .raising-scroll ${selector}`).getBoundingClientRect();
    const panel = document.querySelector('.official-petbag .raising-scroll'), {top, bottom} = panel.getBoundingClientRect();
    const list = rect('.learned-skill-list'), row = rect('.learned-skill-list>button'), confirm = rect('.management-confirm-row');
    const visible = Math.min(row.bottom, list.bottom, confirm.top, bottom) - Math.max(row.top, list.top, top);
    return {scrolled: panel.scrollTop, visible, row: row.height};
  });
  assert.equal(shown.scrolled, 0, 'the bag panel opened scrolled');
  assert(shown.visible >= shown.row - 1, `the first learned skill shows ${shown.visible.toFixed(1)} of ${shown.row.toFixed(1)} px above the confirm row`);
}

/** The control's computed filter and background, at rest and under the pointer (a 1px lift alone is no visible cue). */
async function hoverLooks(page, selector) {
  const look = () => page.$eval(selector, element => ['filter', 'backgroundColor'].map(key => getComputedStyle(element)[key]).join(' '));
  await page.mouse.move(2, 2);
  await wait(SETTLE_MS);
  const rest = await look();
  await page.hover(selector);
  await wait(SETTLE_MS);
  return {rest, hover: await look()};
}
export async function hoverCues({page}) {
  await waitWorld(page);
  await talkToCreature(page);
  const close = await hoverLooks(page, '.world-dialogue button.world-dialogue-close');
  assert.notEqual(close.hover, close.rest, 'the world dialogue × looks the same on hover');
  await page.click('.world-dialogue button.primary');
  await waitCommands(page);
  await page.click('.classic-command-tabs button[aria-label="道具"]');
  const tab = await hoverLooks(page, '.classic-item-category-tabs button:not(.active)');
  assert.notEqual(tab.hover, tab.rest, 'a battle item category tab looks the same on hover');
  await page.click('.classic-command-tabs button[aria-label="精灵"]');
  const member = await hoverLooks(page, '.classic-party-grid button:not(.current)');
  assert.notEqual(member.hover, member.rest, 'a battle party button looks the same on hover');
}

/** Audits each screen that `steps` opens in turn ([name, open]) and fails with every property the bundle order decides. */
async function auditScreens(page, steps) {
  const found = [];
  for (const [screen, open] of steps) {
    await open();
    await page.mouse.move(2, 2);
    await wait(SETTLE_MS);
    for (const {state, property, element, sources} of await orderDecided(page)) {
      found.push(`${screen} (${state}) ${property} @ ${element}: ${sources.join(' vs ')}`);
    }
  }
  assert.deepEqual(found, [], 'properties decided by the stylesheet bundle order');
}
const tabStep = (page, label) => [`the PetBag ${label} tab`, () => page.click(`.official-petbag .management-tabs button:text-is("${label}")`)];
const commandStep = (page, label) => [`the battle ${label} commands`, () => page.click(`.classic-command-tabs button[aria-label="${label}"]`)];

/** Steps that open each toolbar window in turn, closing the one before; the PetBag (`last`) stays open. */
function windowSteps(page, tools, last) {
  const order = [...tools.filter(entry => entry !== last), last];
  return order.map((entry, i) => [`the ${entry.title} window`, async () => {
    if (i) await closeWindow(page, order[i - 1].title);
    await openTool(page, entry);
  }]);
}
export async function journeyCascade({page, fixture}) {
  const bag = tool(fixture, 'monsters');
  await auditScreens(page, [
    ['the world scene', () => waitWorld(page)],
    ...windowSteps(page, fixture.tools, bag), ...['能力', '道具', '资料'].map(label => tabStep(page, label)),
    ['the PetBag skill editor', () => page.click('.petbag-nav-skills')],
    ['the world dialogue', async () => { await closeWindow(page, bag.title); await talkToCreature(page); }],
    ['the battle', async () => { await page.click('.world-dialogue button.primary'); await waitCommands(page); }],
    ...['道具', '精灵', '捕捉', '逃跑'].map(label => commandStep(page, label)),
  ]);
}

/** Selects the first recipe whose parents the save holds, picks the first parent of every role and confirms. */
async function confirmRecipe(page, panel, action) {
  await page.locator(`${panel} .fusion-recipe-scroll button`).filter({hasText: /可融合|可繁殖/}).first().click();
  for (const select of await page.locator(`${panel} .fusion-detail-scroll select`).all()) {
    await select.selectOption(await select.evaluate(element => [...element.options].find(option => option.value).value));
  }
  await page.click(`${panel} .fusion-detail-scroll button.primary:text-is("${action}")`);
  await page.waitForSelector(`${panel} .fusion-obtained`);
}
export async function labCascade({page, fixture}) {
  const {essence, shopTab} = fixture.lab;
  await auditScreens(page, [
    ['the essence order form', async () => {
      await openLabShop(page);
      await page.click(`.shop-primary-categories button:text-is("${shopTab}")`);
      await page.click(`.shop-icon-scroll .item-tile[aria-label^="${essence}"]`);
      await page.waitForSelector('.shop-order input');
    }],
    ['the engraving shop', () => page.click('.shop-primary-categories button:text-is("刻印")')],
    ['the fusion result card', async () => {
      await page.keyboard.press('Escape');
      await page.click('.world-scene button.world-lab-fusion');
      await confirmRecipe(page, '.fusion-panel', '确认融合');
    }],
    ['the breeding result card', async () => {
      await page.keyboard.press('Escape');
      await page.click('.world-scene button.world-lab-breeding');
      await confirmRecipe(page, '.breeding-panel', '繁殖并孵化');
    }],
  ]);
}

export async function towerCascade({page, fixture}) {
  await auditScreens(page, [
    ['the SPT window', async () => { await waitWorld(page); await openTool(page, tool(fixture, 'challenge')); }],
    ['the Brave Tower scene', async () => {
      await page.click('.challenge-category-tabs button:has-text("勇者之塔")');
      await page.waitForSelector('.world-tower-choose', {timeout: BOOT_TIMEOUT_MS});
    }],
    ['the Brave Tower resume row', async () => { await page.click('.world-tower-choose'); await page.waitForSelector('.tower-resume'); }],
  ]);
}
