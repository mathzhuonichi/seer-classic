/**
 * Original skill effects in real battles, played from their SWFs by the page's one Ruffle host
 * (design/notes/skill-effects-seamless-2026-10-22.md). 丽莎布布 (303) meets the first wild creature of its scene, 皮皮 at Lv 5.
 * 缩头 (20001) lets 皮皮 move until it has used a damaging move (撞击 or 电光火石), whose effect is cast from the right and must be
 * mirrored onto 丽莎布布; then 叶绿光束 (11006) beams from 丽莎布布 to 皮皮 and tints the whole arena, under the HUD. A second
 * battle follows on the same page. Status `needs-browser`: Chrome at 1280x800@1 and 1920x1080@2 and Playwright WebKit at
 * 1280x800@1 (when installed); Chrome also under reduced motion, without Ruffle, leaving the first loading screen early and
 * with a request for Ruffle's WebAssembly that never answers; Chrome and WebKit also losing the host's WebGL context.
 * Screenshots of each effect are written to artifacts/battle-skill-effects/ for review.
 *
 * The host: nothing of Ruffle exists before the first battle; its one instance starts while the first loading screen shows,
 * waits no longer than the screen's own last pauses, is in the arena from each battle's first frame and waits parked and
 * suspended between battles. Ruffle's own "New Ruffle instance created" and "Ruffle instance destroyed" lines are counted.
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
/** The host's player element (src/features/battle/skill-effect-host.ts). */
const PLAYER = 'seer-skill-effect-player';
/** 皮皮's damaging moves at Lv 5; its third, 鸣叫, is a status move. */
const FOE_ATTACKS = ['撞击', '电光火石'];
/** 缩头 turns allowed for 皮皮 to pick a damaging move. */
const MAX_GUARD_TURNS = 8;
const RUNS = [
  {engine: 'chrome', viewport: {width: 1280, height: 800}, scale: 1},
  {engine: 'chrome', viewport: {width: 1920, height: 1080}, scale: 2, zoomOnly: {width: 1280, height: 720}},
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
/** The loading screen's own pauses once its art and animations are in (DEPLOY_MS + START_MS, src/app/useBattlePreparation.ts). */
const LAST_PAUSES_MS = 950;
/** Beyond those pauses, this much more counts as the effects holding the loading screen up. */
const WAIT_SLACK_MS = 250;
/** The longest a loading screen waits for the effects, from its 90 % step (SKILL_EFFECTS_WAIT_MS, src/features/battle/skill-effect-session.ts). */
const EFFECTS_WAIT_MS = 3000;
/**
 * The host's canvas takes the arena's size within this long of the battle's first frame, before the first move's effect can
 * start (its hit marker is 1.4 s or more into the move). Headless, Chrome resizes it within two frames and WebKit within about
 * 0.35 s of the host's resume.
 */
const SIZED_MS = 1000;
/** Under the full-arena tint the HUD may change this much (mean RGB, 0-255), while the arena between the creatures changes at least ARENA_TINT. */
const HUD_SLACK = 20, ARENA_TINT = 25;

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

/**
 * Init script: into window.__host, Ruffle's instance lines with what showed then, each loading screen's progress steps, and
 * each battle's first frame (whether the host is in the arena layer) and how long its canvas took to take the layer's size.
 */
function watchHost(tag) {
  const host = window.__host = {instances: [], steps: [], reveals: []}, log = console.log;
  console.log = function (...args) {
    const text = args.map(String).join(' ');
    const kind = /New Ruffle instance created/.test(text) ? 'created' : /Ruffle instance destroyed/.test(text) ? 'destroyed' : null;
    if (kind) host.instances.push({kind, loading: !!document.querySelector('.battle-loading'), battle: !!document.querySelector('.battle-layer')});
    return log.apply(this, args);
  };
  let step = null, reveal = null;
  const tick = now => {
    const progress = document.querySelector('.battle-loading .loading-progress')?.getAttribute('aria-valuenow') ?? null;
    if (progress !== null && progress !== step) host.steps.push({progress: Number(progress), t: now});
    step = progress;
    const layer = document.querySelector('.battle-layer .battle-skill-effects');
    if (!layer) reveal = null;
    else if (!reveal) host.reveals.push(reveal = {t: now, inLayer: !!layer.querySelector(`:scope > ${tag}`), sizedMs: null});
    const canvas = layer?.querySelector(`:scope > ${tag}`)?.shadowRoot?.querySelector('canvas');
    if (reveal && reveal.sizedMs === null && canvas && Math.abs(canvas.width - parseFloat(layer.style.width) * devicePixelRatio) <= 2) {
      reveal.sizedMs = now - reveal.t;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Runs in the page: samples the Ruffle canvas on every animation frame into window.__effectSamples. */
function sampleEffects({grid, drawnAlpha, tag}) {
  const samples = window.__effectSamples = [];
  const tick = now => {
    const player = document.querySelector(tag), canvas = player?.closest('.battle-skill-effects') && player.shadowRoot?.querySelector('canvas');
    const acting = document.querySelector('.classic-combatant-stage.is-acting')?.closest('.classic-combatant');
    const sample = {t: now, side: acting ? Number(acting.classList.contains('side-1')) : null, drawn: 0,
      line: document.querySelector('.classic-dialogue-lines p')?.textContent ?? '',
      ring: !!document.querySelector('.classic-combatant.side-0 .classic-status-ring'), panic: !!player?.shadowRoot?.getElementById('panic')};
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
  const [arena, canvas, creatures, pixels] = await Promise.all([box('.classic-arena'), box(`.battle-skill-effects ${PLAYER}`),
    Promise.all([0, 1].map(side => box(`.classic-combatant.side-${side}`))), page.evaluate(tag => {
      const canvas = document.querySelector(`.battle-skill-effects ${tag}`)?.shadowRoot?.querySelector('canvas');
      return {size: canvas ? [canvas.width, canvas.height] : null, dpr: devicePixelRatio};
    }, PLAYER)]);
  return {arena, canvas: canvas && {...canvas, pixels: pixels.size}, creatures, dpr: pixels.dpr};
}

/** The layer and its canvas cover the arena at the screen's density. */
function checkCover({arena, canvas, dpr}, label) {
  assert(canvas, `${label}: no effect canvas`);
  for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(canvas[key] - arena[key]) <= BOX_SLACK, `${label}: canvas ${key} ${canvas[key]} vs arena ${arena[key]}`);
  assert(Math.abs(canvas.pixels[0] - arena.width * dpr) <= BOX_SLACK, `${label}: canvas is ${canvas.pixels[0]} px wide for ${arena.width} CSS px at ${dpr}x`);
}

/** Where the HUD's player panel and caption are, and a patch of the arena between the creatures, as fractions of the arena. */
const hudRegions = page => page.evaluate(() => {
  const arena = document.querySelector('.classic-arena').getBoundingClientRect();
  const part = (selector, inset = .15) => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return {x: (r.left - arena.left + r.width * inset) / arena.width, y: (r.top - arena.top + r.height * inset) / arena.height,
      w: r.width * (1 - 2 * inset) / arena.width, h: r.height * (1 - 2 * inset) / arena.height};
  };
  return {playerPanel: part('.classic-health.ally'), caption: part('.classic-battle-caption'), arena: {x: .4, y: .55, w: .2, h: .15}};
});

/** Runs in the page: the mean RGB difference (0-255) of two PNG arena shots (base64) in each region. */
async function regionDiffs({before, after, regions}) {
  const decode = async base64 => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], {type: 'image/png'}));
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  };
  const [a, b] = await Promise.all([decode(before), decode(after)]), out = {};
  for (const [name, r] of Object.entries(regions)) {
    let sum = 0, n = 0;
    for (let y = Math.round(r.y * a.height); y < Math.round((r.y + r.h) * a.height); y++) {
      for (let x = Math.round(r.x * a.width); x < Math.round((r.x + r.w) * a.width); x++) {
        const i = (y * a.width + x) * 4;
        for (let c = 0; c < 3; c++) sum += Math.abs(a.data[i + c] - b.data[i + c]);
        n += 3;
      }
    }
    out[name] = n ? +(sum / n).toFixed(2) : null;
  }
  return out;
}

const settled = page => page.evaluate(() => !!document.querySelector('.classic-battle-result')
  || document.querySelector('.classic-command-deck')?.getAttribute('aria-busy') === 'false');

/**
 * Uses `skill` and follows its turn until the commands return or the battle ends; screenshots the first frame showing each
 * side's effect shapes and the first full-arena tint, and keeps the arena shots before the turn and at the tint. Returns the
 * turn's samples and those shots.
 */
async function playTurn(page, skill, label) {
  await page.evaluate(sampleEffects, {grid: GRID, drawnAlpha: DRAWN_ALPHA, tag: PLAYER});
  const arena = page.locator('.classic-arena'), shots = skill === BEAM ? {before: await arena.screenshot()} : {};
  await page.click(`.classic-skill:has(strong:text-is("${skill.name}"))`);
  await page.waitForFunction(() => document.querySelector('.classic-command-deck')?.getAttribute('aria-busy') === 'true', null, {timeout: 5000});
  const shot = new Set(), started = Date.now();
  while (!await settled(page)) {
    assert(Date.now() - started < TURN_TIMEOUT_MS, `${label}: the turn did not settle`);
    const latest = await page.evaluate(() => window.__effectSamples.at(-1));
    const name = latest?.drawn > TINT_SHARE ? 'tint' : latest?.side !== null && latest?.drawn > 0 && latest.drawn < SHAPES_SHARE ? `side${latest.side}` : null;
    if (name && !shot.has(name)) {
      shot.add(name);
      shots[name] = await arena.screenshot({path: path.join(OUT, `${label}-${skill.id}-${name}.png`)});
    }
    await wait(30);
  }
  await wait(300);
  return {shots, samples: await page.evaluate(() => { cancelAnimationFrame(window.__effectFrame); return window.__effectSamples; })};
}

/** Opens the game in `run`'s viewport and density, with the host watched. */
async function openPage(browser, fixture, {engine, viewport, scale, reducedMotion = 'no-preference', blockRuffle = false, hangWasm = false}) {
  const session = await openGame(browser, {dist: DIST, silent: fixture.silent, seed: fixture.save, viewport});
  const {context, page} = session;
  const resize = async size => {
    if (engine === 'chrome') await (await context.newCDPSession(page)).send('Emulation.setDeviceMetricsOverride', {...size, deviceScaleFactor: scale, mobile: false});
    else await page.setViewportSize(size);
  };
  await resize(viewport);
  if (blockRuffle) await page.route('**/ruffle/**', route => route.fulfill({status: 404, body: 'blocked by the suite'}));
  // Requests held without an answer until the page closes.
  const held = [];
  if (hangWasm) await page.route('**/*.wasm', route => { held.push(route); });
  const warnings = [];
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
  await page.addInitScript(keepDrawingBuffers);
  await page.addInitScript(watchHost, PLAYER);
  await page.emulateMedia({reducedMotion});
  await page.reload({waitUntil: 'load', timeout: BOOT_TIMEOUT_MS});
  await waitWorld(page);
  const close = async () => {
    for (const route of held) await route.abort().catch(() => {});
    await session.context.close();
  };
  return {...session, warnings, resize, close};
}

/** Nothing of Ruffle on the page: no player, no script, no global. */
const ruffleOnPage = page => page.evaluate(tag => ({players: document.querySelectorAll(tag).length,
  scripts: document.querySelectorAll('script[src*="ruffle/ruffle.js"]').length, global: 'RufflePlayer' in window}), PLAYER);
/** The host's player elements, where they are and whether the host is suspended. */
const hostState = page => page.evaluate(tag => {
  const players = [...document.querySelectorAll(tag)];
  return {players: players.length, parked: players.filter(player => player.closest('.skill-effect-parking')).length,
    suspended: players.map(player => player.ruffle().suspended), instances: window.__host.instances};
}, PLAYER);

/** Starts the wild battle and waits for its commands; the time from the fight click to the battle's first frame, and from the 90 % step. */
async function enterBattle(page) {
  await talkToCreature(page);
  const from = await page.evaluate(() => ({t: performance.now(), steps: window.__host.steps.length, reveals: window.__host.reveals.length}));
  await page.click('.world-dialogue button.primary');
  await page.waitForFunction(() => document.querySelector('.classic-command-deck')?.getAttribute('aria-busy') === 'false', null,
    {timeout: BOOT_TIMEOUT_MS});
  await wait(SIZED_MS);
  return page.evaluate(from => {
    const reveal = window.__host.reveals[from.reveals], last = window.__host.steps.slice(from.steps).find(step => step.progress === 90);
    return {...reveal, loadingMs: Math.round(reveal.t - from.t), afterArtMs: last ? Math.round(reveal.t - last.t) : null};
  }, from);
}

/** 缩头 until 皮皮 has used a damaging move, then 叶绿光束; the turns, and the host once the battle has closed. */
async function fight(page, label) {
  const turns = [];
  for (let n = 0; n < MAX_GUARD_TURNS && !turns.some(turn => turn.foeAttack); n++) {
    const {samples} = await playTurn(page, GUARD, `${label}-turn${n + 1}`);
    turns.push({skill: GUARD.name, samples, foeAttack: samples.some(s => s.side === 1 && FOE_ATTACKS.some(move => s.line.includes(move)))});
  }
  const beam = await playTurn(page, BEAM, `${label}-turn${turns.length + 1}`);
  turns.push({skill: BEAM.name, samples: beam.samples});
  await page.waitForSelector('.battle-layer', {state: 'detached', timeout: TURN_TIMEOUT_MS});
  return {turns, afterClose: await hostState(page), beamShots: beam.shots};
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
  const {boxes, turns} = result, {arena, creatures} = boxes;
  checkCover(boxes, label);
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

/** Every turn's effects are gone once the turn has settled, and the host waits parked and suspended once the battle has closed. */
function checkCleared(result, label) {
  for (const [index, turn] of result.turns.entries()) assert.equal(turn.samples.at(-1).drawn, 0, `${label}: turn ${index + 1} left its effect on screen`);
  const {players, parked, suspended} = result.afterClose;
  assert.deepEqual({players, parked, suspended}, {players: 1, parked: 1, suspended: [true]}, `${label}: the host does not wait parked and suspended`);
}

/** The loading screen did not wait for the effects beyond its own last pauses. */
function checkEntryWait(entry, label) {
  assert(entry.afterArtMs <= LAST_PAUSES_MS + WAIT_SLACK_MS, `${label}: the loading screen waited ${entry.afterArtMs} ms after its art (pauses ${LAST_PAUSES_MS})`);
}

/** The battle's first frame has the host in the arena layer, its canvas sized at once, and the screen did not wait for the effects. */
function checkEntry(entry, label) {
  assert(entry.inLayer, `${label}: the host was not in the arena layer at the battle's first frame`);
  assert(entry.sizedMs !== null && entry.sizedMs <= SIZED_MS, `${label}: the host's canvas took ${entry.sizedMs} ms to cover the arena`);
  checkEntryWait(entry, label);
}

/** Two battles in a row on one page: placement and layering in the first, the same host in both, built only behind the loading screen. */
async function effectsRun(browser, fixture, run, label) {
  const session = await openPage(browser, fixture, run), {page} = session;
  try {
    await wait(1000);
    const world = await ruffleOnPage(page);
    const first = await enterBattle(page), boxes = await layerBoxes(page), regions = await hudRegions(page);
    const {beamShots, ...battle1} = await fight(page, label);
    const layering = beamShots.tint && await page.evaluate(regionDiffs,
      {before: beamShots.before.toString('base64'), after: beamShots.tint.toString('base64'), regions});
    const second = await enterBattle(page), resized = run.zoomOnly ? await zoomOnly(session, run) : null;
    const beam = await playTurn(page, BEAM, `${label}-battle2`);
    await page.waitForSelector('.battle-layer', {state: 'detached', timeout: TURN_TIMEOUT_MS});
    return {world, first, second, boxes, ...battle1, layering, resized, battle2: {samples: beam.samples, afterClose: await hostState(page)},
      errors: session.errors, warnings: session.warnings};
  } finally {
    await session.context.close();
  }
}

/** A resize that changes only the display zoom (1920x1080 to 1280x720 at DPR 2, and back): the layer follows the arena. */
async function zoomOnly({page, resize}, run) {
  const boxes = [];
  for (const size of [run.zoomOnly, run.viewport]) {
    await resize(size);
    await wait(500);
    boxes.push({size, ...await layerBoxes(page)});
  }
  return boxes;
}

function checkRun(result, label) {
  assert.deepEqual(result.errors, [], `${label}: page or console errors`);
  assert.deepEqual(result.world, {players: 0, scripts: 0, global: false}, `${label}: Ruffle was on the world map before the first battle`);
  checkEntry(result.first, `${label} first battle`);
  checkEntry(result.second, `${label} second battle`);
  const placement = checkPlacement(result, label);
  checkCleared(result, label);
  assert(result.layering, `${label}: no full-arena tint was shot`);
  const {playerPanel, caption, arena} = result.layering;
  assert(playerPanel <= HUD_SLACK && caption <= HUD_SLACK && arena >= ARENA_TINT, `${label}: the tint is not under the HUD ${JSON.stringify(result.layering)}`);
  for (const step of result.resized ?? []) checkCover(step, `${label} at ${step.size.width}x${step.size.height}`);
  assert(result.battle2.samples.some(s => s.drawn > TINT_SHARE), `${label}: the second battle's ${BEAM.name} drew nothing`);
  const {instances, ...after} = result.battle2.afterClose;
  assert.deepEqual(after, {players: 1, parked: 1, suspended: [true]}, `${label}: after the second battle`);
  assert.deepEqual(instances, [{kind: 'created', loading: true, battle: false}], `${label}: Ruffle instances over two battles`);
  return {...placement, firstAfterArtMs: result.first.afterArtMs, secondAfterArtMs: result.second.afterArtMs, layering: result.layering};
}

/**
 * The host's WebGL context is lost mid-battle (WEBGL_lose_context): the host ends at once without Ruffle's panic screen, the next
 * move plans no effect (the creatures' own status ring shows instead) and does not wait, and the next loading screen starts a host.
 */
async function lostContextRun(browser, fixture, run, label) {
  const session = await openPage(browser, fixture, run), {page} = session;
  try {
    await enterBattle(page);
    const before = await playTurn(page, GUARD, `${label}-before`);
    await page.evaluate(tag => {
      const canvas = document.querySelector(tag).shadowRoot.querySelector('canvas');
      (canvas.getContext('webgl2') ?? canvas.getContext('webgl')).getExtension('WEBGL_lose_context').loseContext();
    }, PLAYER);
    await wait(300);
    const lost = await hostState(page), after = await playTurn(page, GUARD, `${label}-after`);
    await playTurn(page, BEAM, `${label}-close`);
    await page.waitForSelector('.battle-layer', {state: 'detached', timeout: TURN_TIMEOUT_MS});
    const next = await enterBattle(page), beam = await playTurn(page, BEAM, `${label}-next`);
    return {before: before.samples, lost, after: after.samples, next, beam: beam.samples, instances: (await hostState(page)).instances,
      errors: session.errors, warnings: session.warnings.filter(text => text.includes('Original skill effects'))};
  } finally {
    await session.context.close();
  }
}

function checkLostContext(result, label) {
  assert.deepEqual(result.errors, [], `${label}: page or console errors`);
  assert(result.before.some(s => s.drawn > 0) && !result.before.some(s => s.ring), `${label}: ${GUARD.name} played no effect before the loss`);
  assert.equal(result.lost.players, 0, `${label}: the lost host stayed in the page`);
  assert(![...result.before, ...result.after].some(s => s.panic), `${label}: Ruffle's panic screen showed`);
  assert(result.after.some(s => s.ring) && result.after.every(s => s.drawn === 0), `${label}: a move after the loss still planned its effect`);
  assert.equal(result.warnings.length, 1, result.warnings.join('\n'));
  checkEntry(result.next, `${label} next battle`);
  assert(result.beam.some(s => s.drawn > TINT_SHARE), `${label}: the next battle's host drew nothing`);
  assert.deepEqual(result.instances.map(entry => [entry.kind, entry.loading]), [['created', true], ['destroyed', false], ['created', true]]);
}

/**
 * Ruffle's WebAssembly never answers: the first loading screen waits at most its limit, its battle plays on without effects, and
 * the next loading screen does not wait for that start again.
 */
async function hungWasmRun(browser, fixture, run) {
  const session = await openPage(browser, fixture, {...run, hangWasm: true}), {page} = session;
  try {
    const first = await enterBattle(page);
    const {samples} = await playTurn(page, GUARD, 'chrome-hung-wasm');
    await page.click('.classic-command-tabs button[aria-label="逃跑"]');
    await page.click('.classic-escape-panel button');
    await page.waitForSelector('.battle-layer', {state: 'detached', timeout: TURN_TIMEOUT_MS});
    const second = await enterBattle(page);
    return {first, second, samples, errors: [...session.errors], warnings: session.warnings.filter(text => text.includes('Original skill effects'))};
  } finally {
    await session.close();
  }
}

/** Leaving the first loading screen before its art is in starts nothing of Ruffle. */
async function leaveEarlyRun(browser, fixture, run) {
  const session = await openPage(browser, fixture, run), {page} = session;
  try {
    await talkToCreature(page);
    await page.click('.world-dialogue button.primary');
    await page.waitForSelector('.battle-loading', {timeout: BOOT_TIMEOUT_MS});
    await page.click('.battle-loading button');
    await page.waitForSelector('.battle-loading', {state: 'detached', timeout: BOOT_TIMEOUT_MS});
    await wait(1500);
    return {left: await ruffleOnPage(page), errors: session.errors};
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
      await t.checkAsync(`${label}: one host over two battles, in the arena from their first frame; ${FOE}'s attack mirrored, ${BEAM.name} under the HUD`, async () => {
        const result = await effectsRun(browser, fixture, run, label);
        write(label, result);
        summary[label] = checkRun(result, label);
      });
    }
    const base = RUNS.find(entry => entry.engine === engine), lost = `${engine}-lost-context`;
    await t.checkAsync(`${engine}: a host whose WebGL context is lost ends without a panic screen, and the next loading screen starts one`, async () => {
      const result = await lostContextRun(browser, fixture, base, lost);
      write(lost, result);
      checkLostContext(result, lost);
    });
    if (engine !== 'chrome') return;
    const reduced = 'chrome-reduced-motion';
    await t.checkAsync('chrome: under reduced motion each effect shows briefly and clears with its move', async () => {
      const session = await openPage(browser, fixture, {...base, reducedMotion: 'reduce'});
      try {
        await enterBattle(session.page);
        const {beamShots, ...fought} = await fight(session.page, reduced), result = {...fought, errors: session.errors};
        write(reduced, result);
        assert.deepEqual(result.errors, []);
        assert(moveSamples(result.turns, 0, [BEAM.name]).some(s => s.drawn > 0), `${BEAM.name} showed nothing`);
        checkCleared(result, reduced);
      } finally {
        await session.context.close();
      }
    });
    await t.checkAsync('chrome: without Ruffle the battle plays on, with one warning and no effect', async () => {
      const session = await openPage(browser, fixture, {...base, blockRuffle: true});
      try {
        await enterBattle(session.page);
        const result = await fight(session.page, 'chrome-no-ruffle');
        assert.deepEqual(session.errors.filter(error => !error.includes('404')), [], 'only the blocked Ruffle files failed');
        assert.equal(session.warnings.filter(text => text.includes('Original skill effects')).length, 1, session.warnings.join('\n'));
        assert(result.turns.every(turn => turn.samples.every(s => s.drawn === 0)));
        assert.equal(result.afterClose.players, 0);
      } finally {
        await session.context.close();
      }
    });
    await t.checkAsync('chrome: leaving the first loading screen early starts nothing of Ruffle', async () => {
      const result = await leaveEarlyRun(browser, fixture, base);
      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.left, {players: 0, scripts: 0, global: false});
    });
    await t.checkAsync('chrome: a WebAssembly request that never answers holds only the first loading screen, with one warning', async () => {
      const result = await hungWasmRun(browser, fixture, base);
      write('chrome-hung-wasm', result);
      assert.deepEqual(result.errors, []);
      assert(result.first.afterArtMs <= EFFECTS_WAIT_MS + WAIT_SLACK_MS, `the first loading screen waited ${result.first.afterArtMs} ms after its art`);
      checkEntryWait(result.second, 'the next loading screen');
      assert(result.samples.every(s => s.drawn === 0), `${GUARD.name} drew an effect without a host`);
      assert.equal(result.warnings.length, 1, result.warnings.join('\n'));
    });
  });
  engines[engine] = skipped ? `skipped: ${skipped}` : 'ran';
  if (skipped) console.log(`${engine} skipped: ${skipped}`);
}
t.finish({engines, summary});
