/**
 * Runs a sharded verification script on several cores.
 *
 * Usage: node tools/verification/parallel-shards.mjs [--jobs N] <script.mjs> [script args...]
 *
 * Shard k of N is started as `node <script> [args...] --shard k/N`; the script
 * must skip work whose index is not k modulo N. Each shard's output is kept in
 * artifacts/parallel-shards/<script>/shard-k.log. Exits non-zero if any shard fails.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
let jobs = os.availableParallelism();
if (argv[0] === '--jobs') { jobs = Number(argv[1]); argv.splice(0, 2); }
if (!argv.length || !Number.isSafeInteger(jobs) || jobs < 1) {
  console.error('Usage: parallel-shards.mjs [--jobs N] <script.mjs> [script args...]');
  process.exit(2);
}
const [script, ...args] = argv;
const dir = path.join(root, 'artifacts/parallel-shards', path.basename(script, path.extname(script)));
fs.mkdirSync(dir, {recursive: true});
const started = performance.now();
const results = await Promise.all(Array.from({length: jobs}, (_, k) => new Promise(resolve => {
  const file = path.join(dir, `shard-${k}.log`), out = fs.openSync(file, 'w');
  const child = spawn(process.execPath, [script, ...args, '--shard', `${k}/${jobs}`], {cwd: root, stdio: ['ignore', out, out]});
  child.on('exit', code => { fs.closeSync(out); resolve({k, code, file}); });
})));
for (const {k, code, file} of results) {
  const tail = fs.readFileSync(file, 'utf8').trimEnd().split('\n').slice(-2).join('\n  ');
  console.log(`shard ${k}/${jobs} exit ${code}\n  ${tail}`);
}
console.log(`${jobs} shards in ${((performance.now() - started) / 1000).toFixed(1)}s; logs in ${path.relative(root, dir)}`);
process.exit(results.some(r => r.code !== 0) ? 1 : 0);
