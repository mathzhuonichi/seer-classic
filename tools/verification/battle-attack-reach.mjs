/**
 * An attacker stays inside the arena that clips it. 闪光波克尔's attack clip climbs well above the arena before it dives onto
 * the opponent (the 2026-10-20 playtest: the creature vanished mid-move); the mount compresses that travel. Status
 * `needs-browser`: Chrome at DPR 2 in the smallest and largest supported viewports, and Playwright WebKit when installed.
 *
 * Measurement: the page keeps its WebGL drawing buffers (an init script of this suite only), and on every animation frame of
 * the lead's move the opaque pixels of its canvas are mapped to the page and counted against the arena's box.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {memoryStorage, root, suite, withSsr} from './_harness.mjs';
import {BOOT_TIMEOUT_MS, buildApp, keepDrawingBuffers, openGame, talkToCreature, wait, waitCommands, waitWorld, withBrowser} from './_browser.mjs';

const NAME = 'battle-attack-reach';
const DIST = path.join(root, 'artifacts', NAME, 'dist');
const SPECIES = 166, LEVEL = 100;
/** 手下留情, a physical move that plays the attack clip and leaves the wild creature on 1 HP, so the battle goes on. */
const SKILL = {id: 10057, name: '手下留情'};
const RUNS = [
  {engine: 'chrome', viewport: {width: 1000, height: 650}, scale: 2},
  {engine: 'chrome', viewport: {width: 1920, height: 1080}, scale: 2},
  {engine: 'webkit', viewport: {width: 1280, height: 800}, scale: 1},
];
/** Alpha below which a pixel counts as transparent. */
const VISIBLE_ALPHA = 40;
/**
 * Share of the attacker's opaque pixels that must lie inside the arena on every frame. Only the creature's own sprites are
 * kept inside (battle-move-clips.mjs checks them), so effects may cross the edge: when 闪光波克尔 reappears behind home
 * (frames 69 to 71 of its attack), the flash it draws over itself reaches past the creature, and as few as 0.83 stay inside.
 */
const MIN_INSIDE_SHARE = 0.8;
/** A move's clip lasts seconds; fewer sampled frames mean the clip did not play. */
const MIN_FRAMES = 20;

/** The silent storage entries and a save whose only creature is the species at LEVEL with SKILL equipped. */
async function fixtures() {
  memoryStorage();
  return withSsr(NAME, async load => {
    const [{createGame}, {loadCatalog}, {newSave}, {LEGACY_SAVE_KEY}, {gameAudio}]
      = await Promise.all(['/src/kernel/game.ts', '/src/domain/catalog/catalog.ts', '/src/kernel/save.ts', '/src/kernel/persistence.ts',
        '/src/shared/audio/game-audio.ts'].map(load));
    const catalog = await loadCatalog();
    const entries = fill => { const memory = memoryStorage(); fill(); return Object.fromEntries(memory); };
    const silent = entries(() => gameAudio.updateSettings({muted: true, musicVolume: 0, sfxVolume: 0}));
    const save = entries(() => {
      const game = createGame(structuredClone(catalog), JSON.stringify(newSave(SPECIES)));
      assert(game.dispatch({type: 'cheatAcquire', species: SPECIES, level: LEVEL}).ok, `cheatAcquire ${SPECIES}`);
      const [lead] = game.snapshot().monsters;
      assert(game.dispatch({type: 'equip', uid: lead.uid, skills: [SKILL.id]}).ok, `equip ${SKILL.name}`);
      localStorage.setItem(LEGACY_SAVE_KEY, game.exportSave());
    });
    return {silent, save};
  });
}

/** Runs in the page: on every animation frame of the lead's move, its opaque pixels in all and inside the arena. */
function sampleLead(visibleAlpha) {
  const samples = window.__attackReach = [];
  const tick = () => {
    const stage = document.querySelector('.classic-combatant.side-0 .classic-combatant-stage.is-acting');
    const canvas = stage?.querySelector('.original-battle-creature.is-ready canvas'), arena = document.querySelector('.classic-arena');
    if (canvas?.width && arena) {
      const box = arena.getBoundingClientRect(), rect = canvas.getBoundingClientRect(), k = 4;
      const w = Math.max(1, Math.floor(canvas.width / k)), h = Math.max(1, Math.floor(canvas.height / k));
      const copy = new OffscreenCanvas(w, h), context = copy.getContext('2d');
      context.drawImage(canvas, 0, 0, w, h);
      const {data} = context.getImageData(0, 0, w, h);
      let total = 0, inside = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] < visibleAlpha) continue;
        total++;
        // The lead faces right: the canvas is not mirrored.
        const px = rect.left + (x + .5) / w * rect.width, py = rect.top + (y + .5) / h * rect.height;
        if (px >= box.left && px <= box.right && py >= box.top && py <= box.bottom) inside++;
      }
      samples.push({total, inside});
    }
    window.__attackReachFrame = requestAnimationFrame(tick);
  };
  tick();
}

/** A wild battle in `viewport`; plays SKILL once and returns the lead's samples. */
async function attack(browser, fixture, {engine, viewport, scale}) {
  const session = await openGame(browser, {dist: DIST, silent: fixture.silent, seed: fixture.save, viewport});
  const {context, page} = session;
  try {
    if (engine === 'chrome') {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setDeviceMetricsOverride', {...viewport, deviceScaleFactor: scale, mobile: false});
    }
    await page.addInitScript(keepDrawingBuffers);
    await page.emulateMedia({reducedMotion: 'no-preference'});
    await page.reload({waitUntil: 'load', timeout: BOOT_TIMEOUT_MS});
    await waitWorld(page);
    await talkToCreature(page);
    await page.click('.world-dialogue button.primary');
    await waitCommands(page);
    await page.waitForSelector('.classic-combatant.side-0 .original-battle-creature.is-ready', {timeout: BOOT_TIMEOUT_MS});
    await page.evaluate(sampleLead, VISIBLE_ALPHA);
    await page.click(`.classic-skill:has(strong:text-is("${SKILL.name}"))`);
    await page.waitForFunction(() => document.querySelector('.classic-command-deck')?.getAttribute('aria-busy') === 'true', null, {timeout: 5000});
    await waitCommands(page);
    await wait(100);
    const samples = await page.evaluate(() => { cancelAnimationFrame(window.__attackReachFrame); return window.__attackReach; });
    return {samples, errors: session.errors};
  } finally {
    await context.close();
  }
}

const t = suite(NAME), engines = {};
await buildApp(DIST);
const fixture = await fixtures();
for (const engine of new Set(RUNS.map(run => run.engine))) {
  const skipped = await withBrowser(engine, async browser => {
    for (const run of RUNS.filter(entry => entry.engine === engine)) {
      const label = `${engine} ${run.viewport.width}x${run.viewport.height}@${run.scale}x`;
      await t.checkAsync(`${label}: ${SKILL.name} keeps 闪光波克尔 inside the arena on every frame`, async () => {
        const {samples, errors} = await attack(browser, fixture, run);
        assert.deepEqual(errors, [], `${label}: page or console errors`);
        assert(samples.length >= MIN_FRAMES, `${label}: only ${samples.length} frames of the move were drawn`);
        samples.forEach(({total, inside}, index) => {
          assert(total > 0, `${label}: frame ${index} of the move draws nothing on screen`);
          assert(inside / total >= MIN_INSIDE_SHARE, `${label}: frame ${index} has ${inside} of ${total} opaque pixels inside the arena`);
        });
      });
    }
  });
  engines[engine] = skipped ? `skipped: ${skipped}` : 'ran';
  if (skipped) console.log(`${engine} skipped: ${skipped}`);
}
t.finish({engines});
