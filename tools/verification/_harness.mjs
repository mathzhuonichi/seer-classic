/**
 * Shared verification harness. A suite looks like:
 *
 *   import {withSsr, suite, memoryStorage} from './_harness.mjs';
 *   memoryStorage();
 *   await withSsr('my-suite', async load => {
 *     const {createGame} = await load('/src/kernel/game.ts');
 *     const t = suite('my-suite');
 *     t.check('does the thing', () => assert.equal(...));
 *     t.finish({extra: 'report fields'});
 *   });
 *
 * `finish` writes artifacts/<name>/regression.json and throws if any check failed.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Runs `body(load)` with a Vite SSR server rooted at the repository; `load` is `ssrLoadModule`. */
export async function withSsr(name, body, {plugins = []} = {}) {
  const server = await createServer({
    root, configFile: false, plugins, cacheDir: `artifacts/.validation-cache/${name}`, appType: 'custom', logLevel: 'error',
    server: {middlewareMode: true, watch: null, hmr: false, ws: false}, optimizeDeps: {noDiscovery: true, include: []},
  });
  try {
    return await body(id => server.ssrLoadModule(id));
  } catch (error) {
    if (error instanceof Error) server.ssrFixStacktrace(error);
    throw error;
  } finally {
    await server.close();
  }
}

/** Named checks that keep running after a failure, plus witnesses recorded in the report. */
export function suite(name) {
  const checks = [], failures = [], witnesses = {};
  const fail = (label, error) => {
    failures.push({name: label, error: String(error?.stack ?? error).slice(0, 3500)});
    console.error(`FAIL ${label}: ${String(error?.message ?? error).split('\n')[0]}`);
  };
  return {
    checks, failures, witnesses,
    check(label, run) {
      try { run(); checks.push(label); } catch (error) { fail(label, error); }
    },
    async checkAsync(label, run) {
      try { await run(); checks.push(label); } catch (error) { fail(label, error); }
    },
    witness(key, value) { witnesses[key] = value; },
    finish(extra = {}) {
      const dir = path.join(root, 'artifacts', name);
      fs.mkdirSync(dir, {recursive: true});
      const report = {passed: checks.length, checks, failures, witnesses, ...extra};
      fs.writeFileSync(path.join(dir, 'regression.json'), JSON.stringify(report, null, 2) + '\n');
      console.log(`${name}: ${checks.length} passed, ${failures.length} failed`);
      if (failures.length) throw new Error(`${failures.length} ${name} check(s) failed`);
      return report;
    },
  };
}

/** Installs a Map-backed `globalThis.localStorage` and returns the map. */
export function memoryStorage(initial = {}) {
  const memory = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key),
    clear: () => memory.clear(),
    key: index => [...memory.keys()][index] ?? null,
    get length() { return memory.size; },
  };
  return memory;
}

/** Serves fetches of repository files (for example `/data/...` or `/public/...` paths) from disk. */
export function offlineFetch() {
  globalThis.fetch = async url => {
    const pathname = decodeURIComponent(new URL(String(url), 'http://local').pathname);
    const file = [path.join(root, 'public', pathname), path.join(root, pathname)].find(candidate => fs.existsSync(candidate));
    if (!file) return new Response(null, {status: 404});
    return new Response(fs.readFileSync(file), {status: 200});
  };
}

export const sha256File = file => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root, file))).digest('hex');

/**
 * The raw `data/gamedata.json` aggregate, whose `bosses` list is stale. New code loads the catalog with
 * `loadCatalog()` (`src/domain/catalog/catalog.ts`) inside Vite or `loadCatalogNode()` (`tools/catalog.mjs`) in
 * plain Node. Delete this once the remaining gamedata.json readers have moved.
 */
export const readGameData = () => JSON.parse(fs.readFileSync(path.join(root, 'data/gamedata.json'), 'utf8'));
