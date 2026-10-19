/**
 * Runs verification suites and summarizes pass/fail.
 *
 * Usage: node tools/verification/run.mjs [--status gate|all|<status>] [--jobs N] [suite...]
 *
 * Suites and their status come from tools/verification/MANIFEST.json; the
 * default is every `gate` suite, and `all` is every suite except `tool` scripts. Naming suites runs exactly those. `.ts` suites
 * load through Vite SSR so extensionless imports resolve like the app, and every
 * exported `verify*`/`run*` function is called. A suite with `shards: N` runs through
 * parallel-shards.mjs on at most N cores, and never more than --jobs. Logs and SUMMARY.json are written
 * to artifacts/verification/. Exits non-zero if any suite fails.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'MANIFEST.json'), 'utf8')).suites;
const argv = process.argv.slice(2);
let status = 'gate', jobs = Math.max(1, Math.floor(os.availableParallelism() / 2));
const named = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--status') status = argv[++i];
  else if (argv[i] === '--jobs') jobs = Number(argv[++i]);
  else named.push(path.basename(argv[i]));
}
const selected = file => status === 'all' ? manifest[file].status !== 'tool' : manifest[file].status === status;
const suites = named.length ? named : Object.keys(manifest).filter(selected).sort();
const unknown = suites.filter(file => !manifest[file]);
if (unknown.length || !Number.isSafeInteger(jobs) || jobs < 1) {
  console.error(unknown.length ? `Not in MANIFEST.json: ${unknown.join(', ')}` : 'Usage: run.mjs [--status S] [--jobs N] [suite...]');
  process.exit(2);
}

const tsRunner = `
import { createServer } from 'vite';
const server = await createServer({
  root: process.cwd(), server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error',
});
let code = 0;
try {
  const mod = await server.ssrLoadModule('/tools/verification/' + process.argv[1]);
  for (const [name, fn] of Object.entries(mod)) if (typeof fn === 'function' && /^(verify|run)/.test(name)) await fn();
} catch (error) { if (error instanceof Error) server.ssrFixStacktrace(error); console.error(error?.stack ?? error); code = 1; }
await server.close();
process.exit(code);
`;

const logDir = path.join(root, 'artifacts/verification');
fs.mkdirSync(logDir, {recursive: true});
const timeoutMs = 900_000;
const run = file => new Promise(resolve => {
  const {shards} = manifest[file];
  const args = file.endsWith('.ts') ? ['--input-type=module', '-e', tsRunner, file]
    : shards ? [path.join(here, 'parallel-shards.mjs'), '--jobs', String(Math.min(shards, jobs)), path.join(here, file)] : [path.join(here, file)];
  const log = path.join(logDir, `${file}.log`), out = fs.openSync(log, 'w');
  const started = performance.now();
  const child = spawn(process.execPath, args, {cwd: root, stdio: ['ignore', out, out]});
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
  child.on('exit', (code, signal) => {
    clearTimeout(timer);
    fs.closeSync(out);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const result = code === 0 ? 'PASS' : signal ? `KILLED ${signal}` : `FAIL ${code}`;
    const lastError = result === 'PASS' ? '' : fs.readFileSync(log, 'utf8').split('\n').find(line => /Error|assert|FAIL/i.test(line) && !/WebSocket server error/.test(line))?.trim().slice(0, 240) ?? '';
    console.log(`${result.padEnd(10)} ${seconds.padStart(6)}s  ${file}  ${lastError.slice(0, 160)}`);
    resolve({file, status: result, seconds: Number(seconds), lastError});
  });
});

const queue = [...suites], results = [];
await Promise.all(Array.from({length: Math.min(jobs, queue.length)}, async () => {
  while (queue.length) results.push(await run(queue.shift()));
}));
results.sort((a, b) => a.file.localeCompare(b.file));
fs.writeFileSync(path.join(logDir, 'SUMMARY.json'), JSON.stringify(results, null, 2) + '\n');
const passed = results.filter(r => r.status === 'PASS').length;
console.log(`${passed}/${results.length} passed; logs in ${path.relative(root, logDir)}`);
process.exit(passed === results.length ? 0 : 1);
