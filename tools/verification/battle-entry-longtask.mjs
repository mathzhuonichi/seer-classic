/**
 * The battle mounts behind its loading screen (design/notes/battle-entry-longtask-2026-10-24.md). With a lead whose HD atlas is
 * among the largest, the layer that shows is the one mounted behind the screen, both creatures' clips are ready as it shows, and,
 * in Chrome, no task of 50 ms or more runs in the REVEAL_WINDOW_MS after it, on the first battle and on the next. Leaving during
 * the deploy step takes the hidden battle down with its clips, and the next battle still starts. Status `needs-browser`: Chrome,
 * and Playwright WebKit when installed (it has no Long Tasks API, so it checks the order only), in fresh, silent contexts.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {memoryStorage, root, suite, withSsr} from './_harness.mjs';
import {BOOT_TIMEOUT_MS, buildApp, count, openGame, talkToCreature, wait, waitCommands, waitWorld, withBrowser} from './_browser.mjs';

const NAME = 'battle-entry-longtask';
const DIST = path.join(root, 'artifacts', NAME, 'dist');
const ENGINES = ['chrome', 'webkit'];
const CHECK_TIMEOUT_MS = 180_000;
/** 502's HD atlas (256 MiB) is among the largest: mounted as the battle showed, it held a 96-103 ms task at 1280x800. */
const LEAD = 502;
const LEVEL = 100;
/** After the battle shows, no long task may run within this window. */
const REVEAL_WINDOW_MS = 1500;

/** The silent storage entries and a save whose only creature is LEAD at LEVEL. */
async function fixtures() {
  memoryStorage();
  return withSsr(NAME, async load => {
    const [{createGame}, {loadCatalog}, {newSave}, {LEGACY_SAVE_KEY}, {gameAudio}] = await Promise.all(['/src/kernel/game.ts',
      '/src/domain/catalog/catalog.ts', '/src/kernel/save.ts', '/src/kernel/persistence.ts', '/src/shared/audio/game-audio.ts'].map(load));
    const catalog = await loadCatalog();
    const entries = fill => { const memory = memoryStorage(); fill(); return Object.fromEntries(memory); };
    const silent = entries(() => gameAudio.updateSettings({muted: true, musicVolume: 0, sfxVolume: 0}));
    const save = entries(() => {
      const game = createGame(catalog, JSON.stringify(newSave(LEAD)));
      assert(game.dispatch({type: 'cheatAcquire', species: LEAD, level: LEVEL}).ok, `cheatAcquire ${LEAD}`);
      localStorage.setItem(LEGACY_SAVE_KEY, game.exportSave());
    });
    return {silent, save};
  });
}

/**
 * Init script: into window.__entry, the long tasks (null without the API) and, for each battle as its loading screen goes, the
 * time, whether its layer is the one mounted behind the screen and its clips' states. A mutation observer takes the time in the
 * task that removes the screen, before the battle's own effects run.
 */
function watchEntry() {
  const entry = window.__entry = {longTasks: null, reveals: []};
  if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    entry.longTasks = [];
    new PerformanceObserver(list => {
      for (const task of list.getEntries()) entry.longTasks.push({start: task.startTime, end: task.startTime + task.duration});
    }).observe({type: 'longtask'});
  }
  let behind = null, shown = null;
  new MutationObserver(() => {
    const layer = document.querySelector('.battle-layer'), loading = !!document.querySelector('.battle-loading');
    if (!layer) behind = shown = null;
    else if (loading) behind = layer;
    else if (shown !== layer) {
      shown = layer;
      entry.reveals.push({t: performance.now(), mountedBehind: behind === layer,
        clips: [...layer.querySelectorAll('.original-battle-creature')].map(element => element.dataset.originalAnimation)});
    }
  }).observe(document, {childList: true, subtree: true});
}

/** Starts a wild battle, waits for its commands and then for the window after it shows; returns its reveal and long tasks. */
async function enter(page) {
  await talkToCreature(page);
  await page.click('.world-dialogue button.primary');
  await waitCommands(page);
  await wait(REVEAL_WINDOW_MS);
  return page.evaluate(span => {
    const {reveals, longTasks} = window.__entry, reveal = reveals.at(-1);
    return {...reveal, longTasks: longTasks?.filter(task => task.end > reveal.t && task.start < reveal.t + span).map(task => ({
      start: Math.round(task.start - reveal.t), ms: Math.round(task.end - task.start)})) ?? null};
  }, REVEAL_WINDOW_MS);
}

async function flee(page) {
  await page.click('.classic-command-tabs button[aria-label="逃跑"]');
  await page.click('.classic-escape-panel button');
  await page.waitForSelector('.battle-layer', {state: 'detached', timeout: BOOT_TIMEOUT_MS});
  await waitWorld(page);
}

function assertShown(battle, label) {
  assert(battle.mountedBehind, `${label}: the battle mounted again as it showed`);
  assert.deepEqual(battle.clips, ['ready', 'ready'], `${label}: the clips as the battle showed`);
  if (battle.longTasks) assert.deepEqual(battle.longTasks, [], `${label}: long tasks within ${REVEAL_WINDOW_MS} ms of the battle showing`);
}

async function firstAndNext({page, errors}) {
  await waitWorld(page);
  assertShown(await enter(page), 'the first battle');
  await flee(page);
  assertShown(await enter(page), 'the next battle');
  assert.deepEqual(errors, [], 'page or console errors');
}

async function leaveWhileDeploying({page, errors}) {
  await waitWorld(page);
  await talkToCreature(page);
  await page.click('.world-dialogue button.primary');
  await page.waitForSelector('.battle-layer.is-deploying', {state: 'attached', timeout: BOOT_TIMEOUT_MS});
  await page.click('.battle-loading button');
  await page.waitForSelector('.battle-layer', {state: 'detached', timeout: BOOT_TIMEOUT_MS});
  await waitWorld(page);
  assert.equal(await count(page, '.original-battle-canvas canvas'), 0, 'a clip outlived the battle that was left');
  assertShown(await enter(page), 'the battle after leaving one');
  assert.deepEqual(errors, [], 'page or console errors');
}

const CHECKS = [
  {name: 'the first and the next battle show the layer mounted behind the loading screen, with both clips ready and no long task', run: firstAndNext},
  {name: 'leaving during the deploy step takes the hidden battle down with its clips, and the next battle starts', run: leaveWhileDeploying},
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
      const session = await openGame(browser, {dist: DIST, silent: fixture.silent, seed: fixture.save, motion: true});
      try {
        await session.context.addInitScript(watchEntry);
        await session.page.reload({waitUntil: 'load', timeout: BOOT_TIMEOUT_MS});
        await within(CHECK_TIMEOUT_MS, check.run(session));
      } finally {
        await session.context.close();
      }
    }));
    if (!skipped) continue;
    engines[engine] = `skipped: ${skipped}`;
    break;
  }
}
t.finish({engines});
