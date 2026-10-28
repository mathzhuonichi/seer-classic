/**
 * Drives the built game in real browsers for the `needs-browser` suites.
 *
 * There is no dev server and no localhost: `buildApp` builds the app with Vite into artifacts/ without public/, and every
 * request to ORIGIN is answered by Playwright request interception, from that build and then from public/.
 * `SEER_PACKAGE=<unzipped browser package>` runs them against that package instead: nothing is built, and every request is
 * answered by the package's own server.mjs, run by its own Node.js for macOS (_package-server.mjs, over an IPC channel).
 * Every page is silent: the game's own mute setting, WebAudio contexts that never run and muted media elements, and Chrome
 * also runs with --mute-audio. Browsers are closed by `withBrowser`, also when a check fails or times out.
 *
 * Chrome is the system Google Chrome (Playwright's `chrome` channel) or the executable named by SEER_CHROME. Playwright
 * WebKit stands in for Safari and runs only when installed (`npx playwright-core install webkit`).
 */
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'vite';
import {chromium, webkit} from 'playwright-core';
import {root} from './_harness.mjs';

const ORIGIN = 'http://seer.test';
/** The asset folder served beside the build. */
const PUBLIC = path.join(root, 'public');
/** An unzipped browser package (tools/distribution/pack_browser.mjs) whose own server answers every request, or null. */
const PACKAGE = process.env.SEER_PACKAGE ? path.resolve(root, process.env.SEER_PACKAGE) : null;
const VIEWPORT = {width: 1280, height: 800};
/** The reasons engines give for a request the page cancels itself (a reload, an image dropped before it loaded): not a failed answer. */
const CANCELLED = /^net::ERR_ABORTED$|cancelled|NS_BINDING_ABORTED/i;
/** How long the page load, the first world scene or a battle's first command may take. */
export const BOOT_TIMEOUT_MS = 60_000;

/**
 * Builds the app with the project's Vite config into `outDir`, without copying public/, which is served from the checkout. The
 * config is imported natively: the default loader writes a bundled copy into node_modules/, which a worktree links.
 */
export async function buildApp(outDir) {
  if (PACKAGE) return;
  await build({root, configLoader: 'native', logLevel: 'error', build: {outDir, emptyOutDir: true, copyPublicDir: false}});
}

/** Launches an engine, or returns the reason it is skipped. Chrome is required, so a missing Chrome throws. */
async function launch(engine) {
  if (engine === 'chrome') {
    const executable = process.env.SEER_CHROME;
    // System Chrome otherwise wakes GoogleUpdater a few seconds after it starts. The updater inherits Chrome's stdio and outlives
    // it (its requests are blocked here), so browser.close() would wait for it to exit.
    const args = ['--mute-audio', '--disable-updater-scheduler'];
    return {browser: await chromium.launch({...(executable ? {executablePath: executable} : {channel: 'chrome'}), headless: true, args})};
  }
  if (!fs.existsSync(webkit.executablePath())) return {skipped: 'Playwright WebKit is not installed (npx playwright-core install webkit)'};
  return {browser: await webkit.launch({headless: true})};
}

/**
 * Runs `body(browser)` with the engine's browser and closes it afterwards, also when `body` throws; resolves to the skip reason
 * when the engine is not installed. Playwright's own signal handlers close the browser on Ctrl-C, SIGTERM and SIGHUP.
 */
export async function withBrowser(engine, body) {
  const {browser, skipped} = await launch(engine);
  if (skipped) return skipped;
  try {
    await body(browser);
  } finally {
    await browser.close().catch(() => {});
  }
  return null;
}

function fileFor(dist, pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
  for (const base of [dist, PUBLIC]) {
    const file = path.join(base, relative);
    if (file.startsWith(base + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

/** Response headers of one HTTP connection that a fulfilled route must not repeat. */
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'date']);
let packageServer = null;

/**
 * Starts the package's server in its own Node.js (Apple silicon or Intel) and returns `ask(request)`, which resolves to the
 * server's answer ({status, headers, body}). The child never keeps this process alive and is killed when it exits.
 */
function startPackageServer() {
  const node = path.join(PACKAGE, 'runtime', process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64', 'node');
  const child = spawn(node, [path.join(root, 'tools/verification/_package-server.mjs'), PACKAGE],
    {stdio: ['ignore', 'inherit', 'inherit', 'ipc'], serialization: 'advanced'});
  const pending = new Map();
  let next = 0, ready;
  const started = new Promise((resolve, reject) => { ready = {resolve, reject}; });
  child.on('message', ({id, ready: version, ...answer}) => {
    if (version) return ready.resolve(version);
    pending.get(id)?.resolve(answer);
    pending.delete(id);
  });
  child.on('exit', code => {
    const error = new Error(`the package server exited with ${code}`);
    ready.reject(error);
    for (const {reject} of pending.values()) reject(error);
    pending.clear();
  });
  child.unref();
  child.channel.unref();
  process.on('exit', () => child.kill());
  return async request => {
    await started;
    return new Promise((resolve, reject) => {
      const id = next++;
      pending.set(id, {resolve, reject});
      child.send({id, ...request});
    });
  };
}

/** The page's presence stream (server.mjs PRESENCE_PATH), which the server holds open and so never answers here in full. */
const PRESENCE_PATH = '/__seer-classic/presence';
/** Ends the stream at once, and the page's EventSource waits this long (an hour) before it asks again. */
const PRESENCE_ANSWER = {status: 200, contentType: 'text/event-stream', body: 'retry: 3600000\n\n'};

/** A route answered by the package's server, with the request's method, path, query and headers. */
async function packageRoute(route) {
  const request = route.request(), url = new URL(request.url());
  if (url.pathname === PRESENCE_PATH) return route.fulfill(PRESENCE_ANSWER);
  packageServer ??= startPackageServer();
  const {status, headers, body} = await packageServer({method: request.method(), path: url.pathname + url.search, headers: await request.allHeaders()});
  await route.fulfill({status, body: Buffer.from(body), headers: Object.fromEntries(Object.entries(headers).filter(([name]) => !HOP_BY_HOP.has(name)))});
}

/** Runs in every page before its scripts: storage entries (the game's mute setting), silent WebAudio and muted media. */
function silence(entries) {
  for (const [key, value] of Object.entries(entries)) try { localStorage.setItem(key, value); } catch { /* storage may be blocked */ }
  for (const name of ['AudioContext', 'webkitAudioContext']) {
    const Base = window[name];
    if (!Base) continue;
    const Silent = class extends Base {
      constructor(...args) { super(...args); super.suspend?.().catch?.(() => {}); }
      resume() { return Promise.resolve(); }
    };
    Object.defineProperty(window, name, {value: Silent, configurable: true, writable: true});
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) { this.muted = true; this.volume = 0; return play.apply(this, args); };
}

/** Init script: keep every WebGL drawing buffer so drawn frames can be read back after compositing. */
export function keepDrawingBuffers() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    return getContext.call(this, type, /webgl/.test(type) ? {...attributes, preserveDrawingBuffer: true} : attributes);
  };
}

/** Seeds storage entries (a save) before the first load only, so a reload keeps what the game wrote since. */
function seedOnce(entries) {
  if (sessionStorage.getItem('browser-suite-seeded')) return;
  for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  sessionStorage.setItem('browser-suite-seeded', '1');
}

/**
 * Opens the game in a fresh context and waits for the page load. `silent` holds the mute entries set on every load, `seed` the
 * entries set before the first load, `viewport` the page size (1280x800 by default); the page asks for reduced motion unless
 * `motion` is set, so that battles play their creatures' clips. Page errors and console errors are collected in `errors`, failed
 * requests with the engine's reason in `failed` (not those the page cancels itself).
 */
export async function openGame(browser, {dist, silent, seed, viewport = VIEWPORT, motion = false}) {
  const context = await browser.newContext({viewport, deviceScaleFactor: 1, reducedMotion: motion ? 'no-preference' : 'reduce'});
  const errors = [], failed = [];
  try {
    await context.route(`${ORIGIN}/**`, PACKAGE ? packageRoute : async route => {
      const file = fileFor(dist, new URL(route.request().url()).pathname);
      await (file ? route.fulfill({path: file}) : route.fulfill({status: 404, body: 'not found'}));
    });
    await context.addInitScript(silence, silent);
    if (seed) await context.addInitScript(seedOnce, seed);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    page.on('requestfailed', request => {
      const reason = request.failure()?.errorText ?? '';
      if (!CANCELLED.test(reason)) failed.push(`${request.url()} ${reason}`);
    });
    page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${ORIGIN}/`, {waitUntil: 'load', timeout: BOOT_TIMEOUT_MS});
    return {context, page, errors, failed};
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}

/** Runs in the page: what the save slot database holds (`layout` is SLOT_DATABASE of src/kernel/slot-backends.ts). */
async function slotDatabase({name, version, slots, documents, meta, activeKey}) {
  const db = await new Promise((resolve, reject) => {
    const opening = indexedDB.open(name, version);
    // Only the game creates the database: a check that runs before it did must not.
    opening.onupgradeneeded = () => opening.transaction.abort();
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(new Error(`no save slot database: ${opening.error}`));
  });
  const result = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const read = db.transaction([slots, documents, meta], 'readonly');
    const [records, active, keys] = await Promise.all([result(read.objectStore(slots).getAll()), result(read.objectStore(meta).get(activeKey)),
      result(read.objectStore(documents).getAllKeys())]);
    const texts = db.transaction(documents, 'readonly').objectStore(documents);
    const text = Object.fromEntries(await Promise.all(keys.map(async key => [key, await result(texts.get(key))])));
    return {records: records.sort((a, b) => a.id < b.id ? -1 : 1), active, text};
  } finally {
    db.close();
  }
}

/** The save slots of the game open in `page`: their records in creation order, the active slot's id and each slot's text. */
export const saveSlots = (page, layout) => page.evaluate(slotDatabase, layout);

/** Time for a key press or a click to take effect (or, for a check that nothing happened, to have taken effect). */
export const SETTLE_MS = 250;
export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export const count = (page, selector) => page.locator(selector).count();
/** The explorer robot's position in the scene. */
export const robot = page => page.$eval('.world-player', element => `${element.style.left} ${element.style.top}`);
export const waitWorld = page => page.waitForSelector('.world-scene .world-player', {timeout: BOOT_TIMEOUT_MS});
/** Waits until a battle has loaded and takes a command. */
export const waitCommands = page => page.waitForFunction(() => !document.querySelector('.battle-loading')
  && document.querySelector('.classic-command-deck')?.getAttribute('aria-busy') === 'false', null, {timeout: BOOT_TIMEOUT_MS});
/** A toolbar tool of the fixture (`{id, label, title}`). */
export const tool = (fixture, id) => fixture.tools.find(entry => entry.id === id);

export async function openTool(page, {label, title}) {
  await page.click(`.game-toolbar button[aria-label="${label}"]`);
  await page.waitForSelector(`.scene-window[aria-label="${title}"]`);
}
export async function closeWindow(page, title) {
  await page.keyboard.press('Escape');
  await page.waitForSelector(`.scene-window[aria-label="${title}"]`, {state: 'detached'});
}
/** Opens the world dialogue of the first wild creature (the robot walks up to it). */
export async function talkToCreature(page) {
  await page.locator('.world-roamer').first().evaluate(element => element.click());
  await page.waitForSelector('.world-dialogue');
}
