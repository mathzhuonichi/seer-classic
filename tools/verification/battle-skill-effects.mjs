/**
 * Original skill effects in a real battle, played from their SWFs by Ruffle (design/notes/skill-effects-ruffle-2026-10-22.md).
 * 丽莎布布 (303) meets the first wild creature of its scene, 皮皮 at Lv 5. 缩头 (20001) lets 皮皮 move until it has used a
 * damaging move (撞击 or 电光火石), whose effect is cast from the right and must be mirrored onto 丽莎布布; then 叶绿光束 (11006)
 * beams from 丽莎布布 to 皮皮 and tints the whole arena, under the HUD. Status `needs-browser`: Chrome at 1280x800@1 and
 * 1920x1080@2 and Playwright WebKit at 1280x800@1 (when installed); Chrome also under reduced motion and without Ruffle.
 * Screenshots of each effect are written to artifacts/battle-skill-effects/ for review.
 *
 * Measurement: the page keeps WebGL drawing buffers (an init script of this suite only). On every animation frame the Ruffle
 * canvas is read back on a coarse grid: the share of the arena it draws on and the horizontal extent of what it draws, with the
 * creature acting and the dialogue line of that frame.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {memoryStorage, root, suite, withSsr} from './_harness.mjs';
import {BOOT_TIMEOUT_MS, buildApp, openGame, talkToCreature, wait, waitWorld, withBrowser} from './_browser.mjs';

const NAME = 'battle-skill-effects';
const OUT = path.join(root, 'artifacts', NAME);
const DIST = path.join(OUT, 'dist');
const SPECIES = 303, LEVEL = 100, FOE = '皮皮';
const GUARD = {id: 20001, name: '缩头'}, BEAM = {id: 11006, name: '叶绿光束'};
/** 皮皮's damaging moves at Lv 5; its third, 鸣叫, is a status move. */
const FOE_ATTACKS = ['撞击', '电光火石'];
/** 缩头 turns allowed for 皮皮 to pick a damaging move. */
const MAX_GUARD_TURNS = 8;
const RUNS = [
  {engine: 'chrome', viewport: {width: 1280, height: 800}, scale: 1},
  {engine: 'chrome', viewport: {width: 1920, height: 1080}, scale: 2},
  {engine: 'webkit', viewport: {width: 1280, height: 800}, scale: 1},
];
/** Read-back grid: one sample per this many canvas pixels in each direction. */
const GRID = 6;
/** Alpha above which a sampled pixel counts as drawn. */
const DRAWN_ALPHA = 8;
/** A frame drawing on more than this share of the arena is a full-arena tint; one under the lower share shows the effect's own shapes. */
const TINT_SHARE = .9, SHAPES_SHARE = .5;
/** CSS and canvas px the layer may differ from the arena by (rounding). */
const BOX_SLACK = 2;
const TURN_TIMEOUT_MS = 30_000;

/** The silent storage entries and a save whose only creature is 丽莎布布 at LEVEL with GUARD and BEAM. */
async function fixtures() {
  memoryStorage();
  return withSsr(NAME, async load => {
    const [{createGame}, {loadCatalog}, {newSave}, {writeLocalSave}, {gameAudio}]
      = await Promise.all(['/src/kernel/game.ts', '/src/domain/catalog/catalog.ts', '/src/kernel/save.ts', '/src/kernel/persistence.ts',
        '/src/shared/audio/game-audio.ts'].map(load));
    const catalog = await loadCatalog();
    const entries = fill => { const memory = memoryStorage(); fill(); return Object.fromEntries(memory); };
    const silent = entries(() => gameAudio.updateSettings({muted: true, musicVolume: 0, sfxVolume: 0}));
    const save = entries(() => {
      const game = createGame(structuredClone(catalog), JSON.stringify(newSave(SPECIES)));
      assert(game.dispatch({type: 'cheatAcquire', species: SPECIES, level: LEVEL}).ok, `cheatAcquire ${SPECIES}`);
      const [lead] = game.snapshot().monsters;
      assert(game.dispatch({type: 'equip', uid: lead.uid, skills: [GUARD.id, BEAM.id]}).ok, 'equip');
      writeLocalSave(game.exportSave());
    });
    return {silent, save};
  });
}

/** Init script: keep every WebGL drawing buffer so the drawn frames can be read back. */
function keepDrawingBuffers() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    return getContext.call(this, type, /webgl/.test(type) ? {...attributes, preserveDrawingBuffer: true} : attributes);
  };
}

/** Runs in the page: samples the Ruffle canvas on every animation frame into window.__effectSamples. */
function sampleEffects({grid, drawnAlpha}) {
  const samples = window.__effectSamples = [];
  const tick = now => {
    const canvas = document.querySelector('.battle-skill-effects ruffle-player')?.shadowRoot?.querySelector('canvas');
    const acting = document.querySelector('.classic-combatant-stage.is-acting')?.closest('.classic-combatant');
    const sample = {t: now, side: acting ? Number(acting.classList.contains('side-1')) : null, drawn: 0,
      line: document.querySelector('.classic-dialogue-lines p')?.textContent ?? ''};
    if (canvas?.width) {
      const w = Math.floor(canvas.width / grid), h = Math.floor(canvas.height / grid), copy = new OffscreenCanvas(w, h).getContext('2d');
      copy.drawImage(canvas, 0, 0, w, h);
      const {data} = copy.getImageData(0, 0, w, h);
      let drawn = 0, sumX = 0, minX = w, maxX = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] <= drawnAlpha) continue;
        drawn++; sumX += x; minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      }
      if (drawn) Object.assign(sample, {drawn: drawn / (w * h), minX: minX / w, maxX: (maxX + 1) / w, meanX: (sumX / drawn + .5) / w});
    }
    samples.push(sample);
    window.__effectFrame = requestAnimationFrame(tick);
  };
  window.__effectFrame = requestAnimationFrame(tick);
}

/**
 * The effect canvas, the arena and the creature boxes in screen CSS px (Playwright's boxes: WebKit's getBoundingClientRect
 * leaves out a CSS zoom), and the canvas's own pixel size.
 */
async function layerBoxes(page) {
  const box = selector => page.locator(selector).first().boundingBox();
  const [arena, canvas, creatures, pixels] = await Promise.all([box('.classic-arena'), box('.battle-skill-effects ruffle-player'),
    Promise.all([0, 1].map(side => box(`.classic-combatant.side-${side}`))), page.evaluate(() => {
      const canvas = document.querySelector('.battle-skill-effects ruffle-player')?.shadowRoot?.querySelector('canvas');
      return {size: canvas ? [canvas.width, canvas.height] : null, dpr: devicePixelRatio};
    })]);
  return {arena, canvas: canvas && {...canvas, pixels: pixels.size}, creatures, dpr: pixels.dpr};
}

const settled = page => page.evaluate(() => !!document.querySelector('.classic-battle-result')
  || document.querySelector('.classic-command-deck')?.getAttribute('aria-busy') === 'false');

/**
 * Uses `skill` and follows its turn until the commands return or the battle ends; screenshots the first frame showing each
 * side's effect shapes and the first full-arena tint. Returns the turn's samples.
 */
async function playTurn(page, skill, label) {
  await page.evaluate(sampleEffects, {grid: GRID, drawnAlpha: DRAWN_ALPHA});
  await page.click(`.classic-skill:has(strong:text-is("${skill.name}"))`);
  await page.waitForFunction(() => document.querySelector('.classic-command-deck')?.getAttribute('aria-busy') === 'true', null, {timeout: 5000});
  const shot = new Set(), started = Date.now();
  while (!await settled(page)) {
    assert(Date.now() - started < TURN_TIMEOUT_MS, `${label}: the turn did not settle`);
    const latest = await page.evaluate(() => window.__effectSamples.at(-1));
    const name = latest?.drawn > TINT_SHARE ? 'tint' : latest?.side !== null && latest?.drawn > 0 && latest.drawn < SHAPES_SHARE ? `side${latest.side}` : null;
    if (name && !shot.has(name)) {
      shot.add(name);
      await page.locator('.classic-arena').screenshot({path: path.join(OUT, `${label}-${skill.id}-${name}.png`)});
    }
    await wait(30);
  }
  await wait(300);
  return page.evaluate(() => { cancelAnimationFrame(window.__effectFrame); return window.__effectSamples; });
}

/** Opens the game in `run`'s viewport and density, and starts the wild battle. */
async function startBattle(browser, fixture, {engine, viewport, scale, reducedMotion = 'no-preference', blockRuffle = false}) {
  const session = await openGame(browser, {dist: DIST, silent: fixture.silent, seed: fixture.save, viewport});
  const {context, page} = session;
  if (engine === 'chrome') {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', {...viewport, deviceScaleFactor: scale, mobile: false});
  }
  if (blockRuffle) await page.route('**/ruffle/**', route => route.fulfill({status: 404, body: 'blocked by the suite'}));
  const warnings = [];
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
  await page.addInitScript(keepDrawingBuffers);
  await page.emulateMedia({reducedMotion});
  await page.reload({waitUntil: 'load', timeout: BOOT_TIMEOUT_MS});
  await waitWorld(page);
  await talkToCreature(page);
  await page.click('.world-dialogue button.primary');
  await page.waitForFunction(() => document.querySelector('.classic-command-deck')?.getAttribute('aria-busy') === 'false', null,
    {timeout: BOOT_TIMEOUT_MS});
  return {...session, warnings};
}

/** 缩头 until 皮皮 has used a damaging move, then 叶绿光束; the samples of every turn, and the battle's close. */
async function fight(page, label) {
  const turns = [];
  for (let n = 0; n < MAX_GUARD_TURNS && !turns.some(turn => turn.foeAttack); n++) {
    const samples = await playTurn(page, GUARD, `${label}-turn${n + 1}`);
    turns.push({skill: GUARD.name, samples, foeAttack: samples.some(s => s.side === 1 && FOE_ATTACKS.some(move => s.line.includes(move)))});
  }
  turns.push({skill: BEAM.name, samples: await playTurn(page, BEAM, `${label}-turn${turns.length + 1}`)});
  await page.waitForSelector('.battle-layer', {state: 'detached', timeout: TURN_TIMEOUT_MS});
  const players = await page.evaluate(() => document.querySelectorAll('ruffle-player').length);
  return {turns, playersAfterClose: players};
}

/** The samples of one side's move: from the frame whose dialogue line names it while that side acts, until it stops acting. */
function moveSamples(turns, side, names) {
  const moves = [];
  for (const samples of turns.map(turn => turn.samples)) {
    let move = null;
    for (const sample of samples) {
      if (sample.side === side && !move && names.some(name => sample.line.includes(name))) moves.push(move = []);
      else if (sample.side !== side) move = null;
      move?.push(sample);
    }
  }
  return moves.flat();
}

function checkPlacement(result, label) {
  const {boxes, turns} = result, {arena, canvas, creatures, dpr} = boxes;
  assert(canvas, `${label}: no effect canvas`);
  for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(canvas[key] - arena[key]) <= BOX_SLACK, `${label}: canvas ${key} ${canvas[key]} vs arena ${arena[key]}`);
  assert(Math.abs(canvas.pixels[0] - arena.width * dpr) <= BOX_SLACK, `${label}: canvas is ${canvas.pixels[0]} px wide for ${arena.width} CSS px at ${dpr}x`);
  const fraction = (box, at) => (box.x + box.width * at - arena.x) / arena.width;
  const player = fraction(creatures[0], .5), foe = fraction(creatures[1], .5), foeLeft = fraction(creatures[1], 0);
  const foeShapes = moveSamples(turns, 1, FOE_ATTACKS).filter(s => s.drawn > 0 && s.drawn < SHAPES_SHARE);
  assert(foeShapes.length, `${label}: ${FOE}'s attack drew no effect`);
  const foeMean = foeShapes.reduce((sum, s) => sum + s.meanX, 0) / foeShapes.length;
  assert(foeMean < .5, `${label}: ${FOE}'s attack is drawn at ${foeMean.toFixed(2)} of the arena, not mirrored toward 丽莎布布`);
  const beam = moveSamples(turns, 0, [BEAM.name]), beamShapes = beam.filter(s => s.drawn > 0 && s.drawn < SHAPES_SHARE);
  assert(beam.some(s => s.drawn > TINT_SHARE), `${label}: ${BEAM.name} never tinted the arena (largest share ${Math.max(...beam.map(s => s.drawn))})`);
  assert(beamShapes.length, `${label}: ${BEAM.name} drew no beam`);
  const reach = [Math.min(...beamShapes.map(s => s.minX)), Math.max(...beamShapes.map(s => s.maxX))];
  assert(reach[0] < (player + foe) / 2 && reach[1] > foeLeft, `${label}: the beam spans ${reach.map(x => x.toFixed(2))}, not 丽莎布布 (${player.toFixed(2)}) to ${FOE} (${foe.toFixed(2)})`);
  return {foeMean, beamReach: reach, player, foe};
}

/** Every turn's effects are gone once the turn has settled. */
function checkCleared(result, label) {
  for (const [index, turn] of result.turns.entries()) assert.equal(turn.samples.at(-1).drawn, 0, `${label}: turn ${index + 1} left its effect on screen`);
  assert.equal(result.playersAfterClose, 0, `${label}: a Ruffle player outlived the battle`);
}

async function effectsRun(browser, fixture, run, label) {
  const session = await startBattle(browser, fixture, run);
  try {
    await session.page.waitForFunction(() => !!document.querySelector('.battle-skill-effects ruffle-player')?.shadowRoot?.querySelector('canvas')?.width,
      null, {timeout: BOOT_TIMEOUT_MS});
    const boxes = await layerBoxes(session.page);
    return {boxes, ...await fight(session.page, label), errors: session.errors, warnings: session.warnings};
  } finally {
    await session.context.close();
  }
}

const t = suite(NAME), engines = {}, summary = {};
fs.rmSync(OUT, {recursive: true, force: true});
fs.mkdirSync(OUT, {recursive: true});
await buildApp(DIST);
const fixture = await fixtures();
const write = (label, result) => fs.writeFileSync(path.join(OUT, `${label}.json`), JSON.stringify(result, null, 1) + '\n');
for (const engine of new Set(RUNS.map(run => run.engine))) {
  const skipped = await withBrowser(engine, async browser => {
    for (const run of RUNS.filter(entry => entry.engine === engine)) {
      const label = `${engine}-${run.viewport.width}x${run.viewport.height}@${run.scale}`;
      await t.checkAsync(`${label}: ${FOE}'s attack is mirrored onto 丽莎布布, ${BEAM.name} beams across and tints the arena`, async () => {
        const result = await effectsRun(browser, fixture, run, label);
        write(label, result);
        assert.deepEqual(result.errors, [], `${label}: page or console errors`);
        summary[label] = checkPlacement(result, label);
        checkCleared(result, label);
      });
    }
    if (engine !== 'chrome') return;
    const base = RUNS[0], reduced = 'chrome-reduced-motion';
    await t.checkAsync('chrome: under reduced motion each effect shows briefly and clears with its move', async () => {
      const result = await effectsRun(browser, fixture, {...base, reducedMotion: 'reduce'}, reduced);
      write(reduced, result);
      assert.deepEqual(result.errors, []);
      assert(moveSamples(result.turns, 0, [BEAM.name]).some(s => s.drawn > 0), `${BEAM.name} showed nothing`);
      checkCleared(result, reduced);
    });
    await t.checkAsync('chrome: without Ruffle the battle plays on, with one warning and no effect', async () => {
      const session = await startBattle(browser, fixture, {...base, blockRuffle: true});
      try {
        const result = await fight(session.page, 'chrome-no-ruffle');
        assert.deepEqual(session.errors.filter(error => !error.includes('404')), [], 'only the blocked Ruffle files failed');
        assert.equal(session.warnings.filter(text => text.includes('Original skill effects')).length, 1, session.warnings.join('\n'));
        assert(result.turns.every(turn => turn.samples.every(s => s.drawn === 0)));
      } finally {
        await session.context.close();
      }
    });
  });
  engines[engine] = skipped ? `skipped: ${skipped}` : 'ran';
  if (skipped) console.log(`${engine} skipped: ${skipped}`);
}
t.finish({engines, summary});
