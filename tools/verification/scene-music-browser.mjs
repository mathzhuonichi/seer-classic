/**
 * World themes in a real browser (design/notes/bgm-2026-10-24.md): nothing loads before the first gesture; the gesture fetches
 * the theme of the scene on screen alone and loops it; a map sharing the theme keeps it playing; a map with another theme
 * fetches and loops that one and stops the old one; going back replays the previous theme without fetching it again. Status
 * `needs-browser`: it needs a local Google Chrome and the themes in public/audio/scene/ (tools/assets/download_scene_music.py),
 * and also runs in Playwright WebKit when that is installed.
 *
 * Silence: Chrome runs with --mute-audio, media elements are muted, and the harness keeps every AudioContext suspended, so no
 * context renders a sample. The game's own mute is off, or it would not ask for music; instead this suite's init script reports
 * the suspended contexts as running and records which file each started source plays. The last check asserts that every
 * context the page made is still suspended.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {memoryStorage, root, suite, withSsr} from './_harness.mjs';
import {BOOT_TIMEOUT_MS, SETTLE_MS, buildApp, openGame, wait, waitWorld, withBrowser} from './_browser.mjs';

const NAME = 'scene-music-browser';
const DIST = path.join(root, 'artifacts', NAME, 'dist');
const ENGINES = ['chrome', 'webkit'];
/** 克洛斯星林间: one exit leads to a map sharing its theme (沼泽), one to a map with another theme (地心). */
const START = {planetId: 'klose', regionId: 'forest', x: 50, y: 75};
const AUDIO_PATH = /\/audio\//;

/** The storage entries (the start scene, the audible settings; a new journey) and the exits and themes the walk expects. */
async function fixtures() {
  memoryStorage();
  return withSsr(NAME, async load => {
    const [{gameAudio}, world, {getSceneExits}] = await Promise.all(['/src/shared/audio/game-audio.ts', '/src/domain/world/world.ts',
      '/src/features/world/scene-exits.ts'].map(load));
    const entries = fill => { const memory = memoryStorage(); fill(); return Object.fromEntries(memory); };
    const {planet, region} = world.resolveWorldLocation(START.planetId, START.regionId);
    const theme = target => world.locationTrack({planetId: planet.id, regionId: target.id});
    const exits = getSceneExits(planet, region).map(exit => ({...exit, target: planet.regions.find(entry => entry.id === exit.targetRegionId)}));
    const same = exits.find(exit => theme(exit.target) === theme(region)), other = exits.find(exit => theme(exit.target) !== theme(region));
    assert(same && other, `${START.regionId} needs an exit to a map with its theme and one to a map with another`);
    const step = exit => {
      const back = getSceneExits(planet, exit.target).find(entry => entry.targetRegionId === region.id)?.ariaLabel;
      assert(back, `${exit.target.id} needs an exit back to ${START.regionId}`);
      return {label: exit.ariaLabel, mapId: exit.target.originalMapId, back, theme: `/audio/scene/${theme(exit.target)}.mp3`};
    };
    return {
      audible: entries(() => gameAudio.updateSettings({muted: false, musicVolume: 0.35, sfxVolume: 0})),
      seed: entries(() => world.writeWorldPreference({...START, visited: []})),
      start: {mapId: region.originalMapId, theme: `/audio/scene/${theme(region)}.mp3`}, same: step(same), other: step(other),
    };
  });
}

/** Init script: suspended contexts read as running, and each started source records the file its buffer was decoded from. */
function observeMusic() {
  const files = new WeakMap(), contexts = new Set(), sources = [];
  const state = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'state');
  Object.defineProperty(BaseAudioContext.prototype, 'state', {configurable: true, get() { contexts.add(this); return 'running'; }});
  const arrayBuffer = Response.prototype.arrayBuffer;
  Response.prototype.arrayBuffer = async function () {
    const bytes = await arrayBuffer.call(this);
    files.set(bytes, new URL(this.url).pathname);
    return bytes;
  };
  const decode = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = async function (bytes, ...rest) {
    const file = files.get(bytes), buffer = await decode.call(this, bytes, ...rest);
    files.set(buffer, file);
    return buffer;
  };
  const {start, stop} = AudioBufferSourceNode.prototype;
  AudioBufferSourceNode.prototype.start = function (...args) {
    sources.push({node: this, file: files.get(this.buffer), loop: this.loop, stopped: false});
    return start.apply(this, args);
  };
  AudioBufferSourceNode.prototype.stop = function (...args) {
    for (const source of sources) if (source.node === this) source.stopped = true;
    return stop.apply(this, args);
  };
  window.__sceneMusic = () => ({
    playing: sources.filter(source => source.loop && !source.stopped).map(source => source.file),
    contexts: contexts.size, rendering: [...contexts].filter(context => state.get.call(context) !== 'suspended').length,
  });
}

const music = page => page.evaluate(() => window.__sceneMusic());
const waitPlaying = (page, file) => page.waitForFunction(expected => {
  const {playing} = window.__sceneMusic();
  return playing.length === 1 && playing[0] === expected;
}, file, {timeout: BOOT_TIMEOUT_MS});
async function walkThrough(page, label, mapId) {
  await page.click(`.world-gate[aria-label="${label}"]`);
  await page.waitForSelector(`.world-scene[data-map-id="${mapId}"]`, {timeout: BOOT_TIMEOUT_MS});
}

/** The walk: the gesture, the exit to the shared theme and back, the exit to the other theme and back. */
async function walk(browser, fixture, engine) {
  const session = await openGame(browser, {dist: DIST, silent: fixture.audible, seed: fixture.seed});
  const {context, page, errors, failed} = session, requests = [];
  try {
    await page.addInitScript(observeMusic);
    page.on('request', request => { const {pathname} = new URL(request.url()); if (AUDIO_PATH.test(pathname)) requests.push(pathname); });
    await page.reload({waitUntil: 'load', timeout: BOOT_TIMEOUT_MS});
    await waitWorld(page);
    await page.waitForSelector(`.world-scene[data-map-id="${fixture.start.mapId}"]`);
    await wait(SETTLE_MS);
    assert.deepEqual(requests, [], `${engine}: audio requested before the first gesture`);
    await page.keyboard.press('Shift');
    await waitPlaying(page, fixture.start.theme);
    const themes = () => requests.filter(file => file.startsWith('/audio/scene/'));
    assert.deepEqual(themes(), [fixture.start.theme], `${engine}: the gesture fetches the scene's theme alone`);
    await walkThrough(page, fixture.same.label, fixture.same.mapId);
    await wait(SETTLE_MS);
    assert.deepEqual((await music(page)).playing, [fixture.start.theme], `${engine}: a map sharing the theme keeps it playing`);
    await walkThrough(page, fixture.same.back, fixture.start.mapId);
    await walkThrough(page, fixture.other.label, fixture.other.mapId);
    await waitPlaying(page, fixture.other.theme);
    assert.deepEqual(themes(), [fixture.start.theme, fixture.other.theme], `${engine}: another map fetches its own theme`);
    await walkThrough(page, fixture.other.back, fixture.start.mapId);
    await waitPlaying(page, fixture.start.theme);
    assert.deepEqual(themes(), [fixture.start.theme, fixture.other.theme], `${engine}: the previous theme is still decoded`);
    const {contexts, rendering} = await music(page);
    assert(contexts >= 1 && rendering === 0, `${engine}: ${rendering} of ${contexts} audio contexts render sound`);
    assert.deepEqual([...errors, ...failed], [], `${engine}: page errors or failed requests`);
  } finally {
    await context.close();
  }
}

const t = suite(NAME), engines = {};
await buildApp(DIST);
const fixture = await fixtures();
t.witness('walk', {start: fixture.start, same: fixture.same, other: fixture.other});
for (const engine of ENGINES) {
  const skipped = await withBrowser(engine, browser => t.checkAsync(`${engine}: the world theme follows the map, silently`,
    () => walk(browser, fixture, engine)));
  engines[engine] = skipped ? `skipped: ${skipped}` : 'ran';
  if (skipped) console.log(`${engine} skipped: ${skipped}`);
}
t.finish({engines});
