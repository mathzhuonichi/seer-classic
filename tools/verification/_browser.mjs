/**
 * Drives the built game in real browsers for the `needs-browser` suites.
 *
 * There is no dev server and no localhost: `buildApp` builds the app with Vite into artifacts/ without public/, and every
 * request to ORIGIN is answered by Playwright request interception, from that build and then from public/.
 * Every page is silent: the game's own mute setting, WebAudio contexts that never run and muted media elements, and Chrome
 * also runs with --mute-audio. Browsers are closed by `withBrowser`, also when a check fails or times out.
 *
 * Chrome is the system Google Chrome (Playwright's `chrome` channel) or the executable named by SEER_CHROME. Playwright
 * WebKit stands in for the Tauri WKWebView and runs only when installed (`npx playwright-core install webkit`).
 */
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'vite';
import {chromium, webkit} from 'playwright-core';
import {root} from './_harness.mjs';

const ORIGIN = 'http://seer.test';
const PUBLIC = path.join(root, 'public');
const VIEWPORT = {width: 1280, height: 800};
/** How long the page load, the first world scene or a battle's first command may take. */
export const BOOT_TIMEOUT_MS = 60_000;

/**
 * Builds the app with the project's Vite config into `outDir`, without copying public/, which is served from the checkout. The
 * config is imported natively: the default loader writes a bundled copy into node_modules/, which a worktree links.
 */
export async function buildApp(outDir) {
  await build({root, configLoader: 'native', logLevel: 'error', build: {outDir, emptyOutDir: true, copyPublicDir: false}});
}

/** Launches an engine, or returns the reason it is skipped. Chrome is required, so a missing Chrome throws. */
async function launch(engine) {
  if (engine === 'chrome') {
    const executable = process.env.SEER_CHROME;
    return {browser: await chromium.launch({...(executable ? {executablePath: executable} : {channel: 'chrome'}), headless: true, args: ['--mute-audio']})};
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

/** Seeds storage entries (a save) before the first load only, so a reload keeps what the game wrote since. */
function seedOnce(entries) {
  if (sessionStorage.getItem('browser-suite-seeded')) return;
  for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  sessionStorage.setItem('browser-suite-seeded', '1');
}

/**
 * Opens the game in a fresh context and waits for the page load. `silent` holds the mute entries set on every load, `seed` the
 * entries set before the first load. Page errors and console errors are collected in `errors`, failed requests in `failed`.
 */
export async function openGame(browser, {dist, silent, seed}) {
  const context = await browser.newContext({viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'reduce'});
  const errors = [], failed = [];
  try {
    await context.route(`${ORIGIN}/**`, async route => {
      const file = fileFor(dist, new URL(route.request().url()).pathname);
      await (file ? route.fulfill({path: file}) : route.fulfill({status: 404, body: 'not found'}));
    });
    await context.addInitScript(silence, silent);
    if (seed) await context.addInitScript(seedOnce, seed);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    page.on('requestfailed', request => failed.push(request.url()));
    page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${ORIGIN}/`, {waitUntil: 'load', timeout: BOOT_TIMEOUT_MS});
    return {context, page, errors, failed};
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}
