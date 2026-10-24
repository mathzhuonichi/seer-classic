/**
 * The browser package's smoke test, run by browser-package.mjs once SEER_PACKAGE names the unzipped package: in Chrome and
 * Playwright WebKit (when installed), every request is answered by the package's own server.mjs in its own Node.js. A journey
 * whose only creature is 丽莎布布 (303) at Lv 100 with 叶绿光束 opens on the world map; the page asks the server for its probe,
 * a missing file, a .gz file and a byte range; a wild battle starts, 叶绿光束 is used and Ruffle draws its effect; the battle
 * ends and writes the save, which is the same after a reload. No page error, console error or unexpected failed request.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {memoryStorage, withSsr} from './_harness.mjs';
import {BOOT_TIMEOUT_MS, keepDrawingBuffers, openGame, talkToCreature, wait, waitCommands, waitWorld, withBrowser} from './_browser.mjs';

const NAME = 'browser-package';
const ENGINES = ['chrome', 'webkit'];
const SPECIES = 303, LEVEL = 100, BEAM = {id: 11006, name: '叶绿光束'};
const SAVE_KEY = 'seer-classic-save-v1';
/** The skill effect host's player element (src/features/battle/skill-effect-host.ts). */
const PLAYER = 'seer-skill-effect-player';
/** A sampled pixel of the effect canvas counts as drawn above this alpha; one sample per this many canvas pixels each way. */
const DRAWN_ALPHA = 8, GRID = 8;
const POLL_MS = 30, TURN_TIMEOUT_MS = 30_000;
const MISSING = '/portraits/not-in-the-package.png';
/** The bytes the Range request asks for. */
const RANGE_END = 15;
const GZIP_MAGIC = [0x1f, 0x8b];

/** The silent storage entries and the journey, built with the game's own modules. */
function fixtures() {
  return withSsr(`${NAME}-smoke`, async load => {
    const [{createGame}, {loadCatalog}, {newSave}, {writeLocalSave}, {gameAudio}] = await Promise.all(['/src/kernel/game.ts',
      '/src/domain/catalog/catalog.ts', '/src/kernel/save.ts', '/src/kernel/persistence.ts', '/src/shared/audio/game-audio.ts'].map(load));
    const catalog = await loadCatalog();
    const entries = fill => { const memory = memoryStorage(); fill(); return Object.fromEntries(memory); };
    const silent = entries(() => gameAudio.updateSettings({muted: true, musicVolume: 0, sfxVolume: 0}));
    const save = entries(() => {
      const game = createGame(structuredClone(catalog), JSON.stringify(newSave(SPECIES)));
      assert(game.dispatch({type: 'cheatAcquire', species: SPECIES, level: LEVEL}).ok, `cheatAcquire ${SPECIES}`);
      assert(game.dispatch({type: 'equip', uid: game.snapshot().monsters[0].uid, skills: [BEAM.id]}).ok, 'equip');
      writeLocalSave(game.exportSave());
    });
    return {silent, save};
  });
}

/** Runs in the page: whether the effect host's canvas holds a drawn pixel. */
function effectDrawn({tag, alpha, grid}) {
  const canvas = document.querySelector(`.battle-skill-effects ${tag}`)?.shadowRoot?.querySelector('canvas');
  if (!canvas?.width) return false;
  const w = Math.max(1, Math.floor(canvas.width / grid)), h = Math.max(1, Math.floor(canvas.height / grid));
  const copy = new OffscreenCanvas(w, h).getContext('2d');
  copy.drawImage(canvas, 0, 0, w, h);
  return copy.getImageData(0, 0, w, h).data.some((value, index) => index % 4 === 3 && value > alpha);
}

/** Runs in the page: the server's answers to the probe, a missing file, a .gz file and a byte range of a media file. */
async function serverAnswers({missing, gz, media, end}) {
  const probe = await (await fetch('/__seer-classic')).json(), absent = await fetch(missing);
  const packed = await fetch(gz), part = await fetch(media, {headers: {Range: `bytes=0-${end}`}});
  return {probe, missing: absent.status, gz: {encoding: packed.headers.get('content-encoding'), type: packed.headers.get('content-type'),
    head: [...new Uint8Array(await packed.arrayBuffer()).slice(0, 2)]},
    range: {status: part.status, contentRange: part.headers.get('content-range'), length: (await part.arrayBuffer()).byteLength}};
}

/** The smoke in one engine. */
async function smokeIn(browser, fixture, files) {
  const session = await openGame(browser, {silent: fixture.silent, seed: fixture.save}), {context, page, errors, failed} = session;
  try {
    await page.addInitScript(keepDrawingBuffers);
    await page.reload({waitUntil: 'load', timeout: BOOT_TIMEOUT_MS});
    await waitWorld(page);
    assert.deepEqual(errors, [], 'page and console errors on the world map');
    const answers = await page.evaluate(serverAnswers, {missing: MISSING, ...files, end: RANGE_END});
    // The missing file asked for on purpose logs its 404 as a console error.
    errors.splice(0, errors.length, ...errors.filter(error => !/status of 404/.test(error)));
    assert.deepEqual(answers.probe, {app: 'seer-classic', version: fixture.version}, 'the probe');
    assert.equal(answers.missing, 404, 'a missing file');
    assert.deepEqual(answers.gz, {encoding: null, type: 'application/gzip', head: GZIP_MAGIC}, 'a .gz file is served as its own bytes');
    assert.equal(answers.range.status, 206, 'a byte range');
    assert.match(answers.range.contentRange, new RegExp(`^bytes 0-${RANGE_END}/\\d+$`));
    assert.equal(answers.range.length, RANGE_END + 1);
    await talkToCreature(page);
    await page.click('.world-dialogue button.primary');
    await waitCommands(page);
    await page.click(`.classic-skill:has(strong:text-is("${BEAM.name}"))`);
    const started = Date.now();
    let drawn = false;
    while (!drawn && Date.now() - started < TURN_TIMEOUT_MS) {
      drawn = await page.evaluate(effectDrawn, {tag: PLAYER, alpha: DRAWN_ALPHA, grid: GRID});
      if (!drawn) await wait(POLL_MS);
    }
    assert(drawn, `Ruffle drew no ${BEAM.name} effect`);
    await page.waitForSelector('.battle-layer', {state: 'detached', timeout: TURN_TIMEOUT_MS});
    await waitWorld(page);
    const saved = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY);
    assert.notEqual(saved, fixture.save[SAVE_KEY], 'the battle wrote the save');
    await page.reload({waitUntil: 'load', timeout: BOOT_TIMEOUT_MS});
    await waitWorld(page);
    assert.deepEqual(JSON.parse(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY)), JSON.parse(saved), 'the save after a reload');
    assert.deepEqual(errors, [], 'page and console errors');
    assert.deepEqual(failed.filter(entry => !entry.includes(MISSING)), [], 'failed requests');
  } finally {
    await context.close();
  }
}

/** Runs the smoke as checks of `t` in every engine; resolves to {engine: 'ran' | 'skipped: …'}. */
export async function smoke(t, packageDir, version) {
  const fixture = {...await fixtures(), version};
  const entries = Object.keys(JSON.parse(fs.readFileSync(path.join(packageDir, 'game/payload.json'), 'utf8')).entries);
  const files = {gz: `/${entries.find(file => file.endsWith('.gz'))}`, media: `/${entries.find(file => file.endsWith('.m4a'))}`};
  const engines = {};
  for (const engine of ENGINES) {
    const skipped = await withBrowser(engine, browser => t.checkAsync(`${engine}: the world map, a wild battle with its skill effect, `
      + 'the server\'s answers, and the save after a reload, through the package\'s own server', () => smokeIn(browser, fixture, files)));
    engines[engine] = skipped ? `skipped: ${skipped}` : 'ran';
  }
  return engines;
}
