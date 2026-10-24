/**
 * The browser package's release gate (status `release`), on releases/SeerClassic-<version>-browser.zip as a player gets it
 * (tools/distribution/pack_browser.mjs, design/notes/browser-package-2026-10-23.md):
 *
 * - The ZIP: fewer than 65,535 entries and under 4 GiB (no ZIP64), UTF-8 names under one SeerClassic-<version>/ folder, the
 *   .command and the node binaries executable and nothing else, game/payload.json last, no source map, .md or .DS_Store.
 * - Unzipped with ditto (Archive Utility's engine), statically, as this Mac cannot run Windows: the .bat has CRLF line ends,
 *   ASCII lines until it switches the console to UTF-8, quoted %~dp0 paths (folders with spaces or Chinese names, no cd for UNC
 *   folders) to runtime\win-x64\node.exe, which is a 64-bit Windows executable of the pinned SHA-256; the .command has LF line
 *   ends; the README has a BOM, CRLF and the asset notice; the notices name Node.js and Ruffle's crates; every runtime has its
 *   LICENSE; the macOS node binaries carry Node.js's Developer ID signature, and this Mac's runs and is the pinned version; every
 *   file of payload.json is present at its size (server.mjs's own startup check).
 * - Smoke, in Chrome and WebKit (when installed) through the package's own server.mjs and Node.js: the world map, a wild battle
 *   whose skill effect Ruffle draws, the save the battle wrote after a reload, the probe, a 404, a .gz file as raw bytes and a
 *   Range request.
 * - The needs-browser suites battle-skill-effects and browser-regressions against the package (SEER_PACKAGE).
 *
 * Every page is silent (_browser.mjs). The unzipped copy (artifacts/browser-package/unzipped/) is deleted unless --keep.
 *
 * Usage: node tools/verification/browser-package.mjs [--zip releases/SeerClassic-<version>-browser.zip] [--keep] [--skip-suites]
 */
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {root, suite} from './_harness.mjs';
import {readZipDirectory, MAX_BYTES, MAX_ENTRIES} from '../distribution/zip.mjs';

const NAME = 'browser-package';
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, folder = `SeerClassic-${version}`;
const {values: args} = parseArgs({options: {zip: {type: 'string', default: `releases/${folder}-browser.zip`},
  keep: {type: 'boolean', default: false}, 'skip-suites': {type: 'boolean', default: false}}});
const ZIP = path.resolve(root, args.zip), UNZIPPED = path.join(root, 'artifacts', NAME, 'unzipped'), PACKAGE = path.join(UNZIPPED, folder);
const pin = JSON.parse(fs.readFileSync(path.join(root, 'tools/distribution/browser/node-runtime.json'), 'utf8'));
const TOP_LEVEL = ['THIRD-PARTY-NOTICES.txt', 'game', 'runtime', 'server.mjs', '启动游戏-Windows.bat', '启动游戏-macOS.command', '请先阅读.txt'];
const EXECUTABLE = 0o755, UTF8_NAMES = 0x0800;
const SUITES = ['battle-skill-effects.mjs', 'browser-regressions.mjs'];
/** PE: the "PE\0\0" signature's offset is at 0x3c; the machine field follows it. AMD64 is 0x8664. */
const PE_OFFSET = 0x3c, PE_SIGNATURE = 0x00004550, AMD64 = 0x8664;
const NODE_SIGNER = 'Developer ID Application: Node.js Foundation';
const notice = fs.readFileSync(path.join(root, 'src/app/asset-notice.txt'), 'utf8').trim();
const read = relative => fs.readFileSync(path.join(PACKAGE, relative));
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

const t = suite(NAME);
const directory = readZipDirectory(ZIP);
t.check('the ZIP needs no ZIP64 and keeps UTF-8 names under one folder', () => {
  assert(directory.length < MAX_ENTRIES, `${directory.length} entries`);
  assert(fs.statSync(ZIP).size < MAX_BYTES, `${fs.statSync(ZIP).size} B`);
  assert.deepEqual(directory.filter(entry => !(entry.flags & UTF8_NAMES)).map(entry => entry.name), [], 'names without the UTF-8 flag');
  assert.deepEqual(directory.filter(entry => !entry.name.startsWith(`${folder}/`)).map(entry => entry.name), [], `entries outside ${folder}/`);
  assert.deepEqual([...new Set(directory.map(entry => entry.name.split('/')[1]))].sort(), TOP_LEVEL);
  assert.deepEqual(directory.filter(entry => /\.map$|\.md$|(^|\/)\.DS_Store$/.test(entry.name)).map(entry => entry.name), []);
  const executable = directory.filter(entry => entry.mode === EXECUTABLE).map(entry => entry.name.slice(folder.length + 1)).sort();
  assert.deepEqual(executable, ['runtime/darwin-arm64/node', 'runtime/darwin-x64/node', 'runtime/win-x64/node.exe', '启动游戏-macOS.command']);
  assert.equal(directory.at(-1).name, `${folder}/game/payload.json`, 'payload.json last: an extraction cut short lacks it');
  t.witness('zip', {entries: directory.length, bytes: fs.statSync(ZIP).size, gibibytes: +(fs.statSync(ZIP).size / 2 ** 30).toFixed(2)});
});

fs.rmSync(UNZIPPED, {recursive: true, force: true});
fs.mkdirSync(UNZIPPED, {recursive: true});
execFileSync('ditto', ['-x', '-k', ZIP, UNZIPPED]);
const {EXIT_EXPLAINED, checkFiles, readPayload} = await import(pathToFileURL(path.join(PACKAGE, 'server.mjs')).href);

t.check('the Windows launcher: CRLF, ASCII until the console is UTF-8, quoted paths to the bundled node.exe', () => {
  const text = read('启动游戏-Windows.bat').toString('utf8'), lines = text.split('\r\n');
  assert.doesNotMatch(text, /[^\r]\n/, 'every line ends in CRLF');
  const utf8 = lines.findIndex(line => /^chcp 65001\b/.test(line)), firstWide = lines.findIndex(line => /[^\x00-\x7f]/.test(line));
  assert(utf8 >= 0 && firstWide > utf8, `the first non-ASCII line (${firstWide + 1}) comes after chcp 65001 (${utf8 + 1})`);
  assert(lines.slice(0, lines.findIndex(line => line.startsWith(':'))).every(line => !/[^\x00-\x7f]/.test(line)), 'ASCII before the first label');
  assert(lines.includes('set "NODE=%~dp0runtime\\win-x64\\node.exe"'), 'node.exe beside the launcher, quoted');
  assert(lines.includes('"%NODE%" "%~dp0server.mjs"'), 'server.mjs beside the launcher, quoted');
  assert(!lines.some(line => /^\s*(cd|pushd|chdir)\b/i.test(line)), 'no change of folder (a UNC folder cannot be one)');
  assert(!lines.some(line => /enabledelayedexpansion/i.test(line)), 'no delayed expansion (a ! in a folder name)');
  assert(lines.includes(`if "%errorlevel%"=="${EXIT_EXPLAINED}" exit /b ${EXIT_EXPLAINED}`), 'server.mjs\'s own messages need no second pause');
});
t.check('runtime\\win-x64\\node.exe is the pinned 64-bit Windows executable', () => {
  const exe = read('runtime/win-x64/node.exe'), at = exe.readUInt32LE(PE_OFFSET);
  assert.equal(exe.toString('latin1', 0, 2), 'MZ');
  assert.equal(exe.readUInt32LE(at), PE_SIGNATURE);
  assert.equal(exe.readUInt16LE(at + 4), AMD64);
  assert.equal(sha256(exe), pin.runtimes['win-x64'].sha256);
});
t.check('the macOS launcher: LF, a shell script that picks the node of this Mac', () => {
  const text = read('启动游戏-macOS.command').toString('utf8');
  assert(text.startsWith('#!/bin/sh\n'));
  assert.doesNotMatch(text, /\r/);
  assert.match(text, /platform=darwin-arm64; else platform=darwin-x64/);
  assert.match(text, /exec "\$node" "\$here\/server\.mjs"/);
  assert.equal(fs.statSync(path.join(PACKAGE, '启动游戏-macOS.command')).mode & EXECUTABLE, EXECUTABLE, 'executable after unzipping');
});
t.check('the README and the notices', () => {
  const readme = read('请先阅读.txt').toString('utf8');
  assert(readme.startsWith('﻿'), 'a BOM, for Notepad');
  assert.doesNotMatch(readme, /[^\r]\n/, 'CRLF');
  assert(readme.includes(notice), 'the asset notice');
  const notices = read('THIRD-PARTY-NOTICES.txt');
  assert.deepEqual(notices, read('game/THIRD-PARTY-NOTICES.txt'), 'the game serves the same notices in 关于');
  const parts = [notice, `Node.js ${pin.version}`, 'Rust crates in Ruffle\'s WebAssembly', 'symphonia-core 0.5.5', 'JavaScript packages in Ruffle\'s ruffle.js'];
  for (const part of parts) assert(notices.toString('utf8').includes(part), part);
  for (const platform of Object.keys(pin.runtimes)) assert(read(`runtime/${platform}/LICENSE`).toString('utf8').includes('Node.js is licensed'), platform);
});
t.check('the macOS node binaries are signed by the Node.js Foundation, and this Mac\'s is the pinned version', () => {
  for (const platform of ['darwin-arm64', 'darwin-x64']) {
    const binary = path.join(PACKAGE, 'runtime', platform, 'node');
    execFileSync('codesign', ['--verify', '--strict', binary]);
    const details = spawnSync('codesign', ['-dvv', binary], {encoding: 'utf8'}).stderr;
    assert(details.includes(`Authority=${NODE_SIGNER}`), `${platform}: ${details.split('\n').find(line => line.startsWith('Authority'))}`);
  }
  const own = path.join(PACKAGE, 'runtime', process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64', 'node');
  assert.equal(execFileSync(own, ['--version'], {encoding: 'utf8'}).trim(), `v${pin.version}`);
});
await t.checkAsync('every file of payload.json is present at its size, and the payload is of this version', async () => {
  const payload = readPayload(path.join(PACKAGE, 'game'));
  assert.equal(payload.version, version);
  assert.deepEqual(await checkFiles(path.join(PACKAGE, 'game'), payload.entries), []);
  t.witness('payload', {files: payload.files, gibibytes: +(payload.bytes / 2 ** 30).toFixed(2)});
});

// _browser.mjs reads SEER_PACKAGE when it is first imported.
process.env.SEER_PACKAGE = PACKAGE;
const {smoke} = await import('./_browser-package-smoke.mjs');
const engines = await smoke(t, PACKAGE, version);

const suites = {};
for (const file of args['skip-suites'] ? [] : SUITES) {
  await t.checkAsync(`${file} passes against the package`, async () => {
    const result = spawnSync(process.execPath, [path.join(root, 'tools/verification', file)], {cwd: root, stdio: 'inherit', env: process.env});
    suites[file] = result.status;
    assert.equal(result.status, 0, `${file} exited with ${result.status}`);
  });
}
if (!args.keep) fs.rmSync(UNZIPPED, {recursive: true, force: true});
t.finish({version, engines, suites, kept: args.keep ? path.relative(root, PACKAGE) : null});
