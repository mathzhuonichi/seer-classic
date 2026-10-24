/**
 * Builds the browser package, one folder that runs on Windows 10/11 x64 and on macOS (Apple silicon and Intel) in the player's
 * own browser, and zips it as releases/SeerClassic-<version>-browser.zip (design/notes/browser-package-2026-10-23.md):
 *
 *   SeerClassic-<version>/
 *     启动游戏-Windows.bat, 启动游戏-macOS.command   tools/distribution/browser/launch-*: CRLF; LF and executable
 *     runtime/<platform>/node[.exe], LICENSE        the official Node.js pinned in tools/distribution/browser/node-runtime.json
 *     server.mjs                                    tools/distribution/browser/server.mjs
 *     game/                                         the web build (index.html, assets/, ruffle/) and the payload
 *     运行说明.md, THIRD-PARTY-NOTICES.txt           the player guide (tools/distribution/browser/运行说明.md) and the notices
 *
 * Steps: the web build without public/ (no source maps); THIRD-PARTY-NOTICES.txt (third-party-notices.mjs);
 * the payload of stage_payload.py (the requestable files of public/, APFS clones) and the payload gate on this build and
 * payload; Node.js from .cache/node-runtime/, downloaded when missing and checked against the pinned SHA-256; the
 * folder; the ZIP (zip.mjs, without ZIP64); the guide again beside the ZIP, to send along. The staging folder
 * releases/browser-stage/ is deleted unless --keep is given.
 *
 * Usage: node tools/distribution/pack_browser.mjs [--out releases] [--keep]   (NODE_USE_ENV_PROXY=1 behind a proxy)
 */
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {build} from 'vite';
import {MAX_ENTRIES, writeZip} from './zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const here = path.join(root, 'tools/distribution'), browser = path.join(here, 'browser');
const {values: args} = parseArgs({options: {out: {type: 'string', default: 'releases'}, keep: {type: 'boolean', default: false}}});
const out = path.resolve(root, args.out), stage = path.join(out, 'browser-stage');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, name = `SeerClassic-${version}`;
const pin = JSON.parse(fs.readFileSync(path.join(browser, 'node-runtime.json'), 'utf8'));
const cache = path.join(root, '.cache/node-runtime', `v${pin.version}`);
const BUILD_ENTRIES = ['assets', 'index.html', 'ruffle'];
const EXECUTABLE = 0o755, READABLE = 0o644, EXECUTE_BITS = 0o111;
/** The player guide, at the package root and beside the ZIP: UTF-8 without a BOM, with CRLF line ends for Notepad. */
const GUIDE = '运行说明.md';
/** Longest path inside the ZIP that still extracts below a folder like C:\Users\<name>\Downloads\ within Windows' 260. */
const MAX_WINDOWS_PATH = 180;
/** Names Windows cannot create: reserved devices, characters it forbids, trailing dots or spaces. */
const WINDOWS_INVALID = /(^|\/)(con|prn|aux|nul|com\d|lpt\d)(\.[^/]*)?(\/|$)|[<>:"|?*\\\x00-\x1f]|[. ](\/|$)/i;

const mkdir = dir => { fs.mkdirSync(dir, {recursive: true}); return dir; };
const run = (command, argv) => execFileSync(command, argv, {cwd: root, stdio: 'inherit'});
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const clone = (source, target) => {
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(source, target, fs.constants.COPYFILE_FICLONE);
};
const files = dir => fs.readdirSync(dir, {recursive: true, withFileTypes: true}).filter(entry => entry.isFile())
  .map(entry => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')).sort();

/** A pinned file in the cache: downloaded when missing, refused when its SHA-256 differs from the pin. */
async function pinned({file, sha256: expected}) {
  const target = path.join(cache, file.replaceAll('/', '-'));
  if (!fs.existsSync(target)) {
    const response = await fetch(new URL(file, pin.base));
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
    fs.mkdirSync(cache, {recursive: true});
    fs.writeFileSync(`${target}.part`, Buffer.from(await response.arrayBuffer()));
    fs.renameSync(`${target}.part`, target);
  }
  const actual = sha256(target);
  if (actual !== expected) throw new Error(`${file}: SHA-256 ${actual}, pinned ${expected}; delete ${target} to download it again`);
  return target;
}

/** The Node.js binaries and LICENSE, by platform: {binaries: {platform: file}, license: file}. */
async function nodeRuntime() {
  const binaries = {}, extracted = path.join(cache, 'extracted');
  for (const [platform, entry] of Object.entries(pin.runtimes)) {
    const archive = await pinned(entry);
    if (!entry.member) { binaries[platform] = archive; continue; }
    const members = [entry.member, ...(pin.license.runtime === platform ? [pin.license.member] : [])];
    if (!members.every(member => fs.existsSync(path.join(extracted, member)))) run('tar', ['-xzf', archive, '-C', mkdir(extracted), ...members]);
    binaries[platform] = path.join(extracted, entry.member);
  }
  return {binaries, license: path.join(extracted, pin.license.member)};
}

/** The web build without public/, into stage/build; refuses source maps. */
async function buildGame() {
  const outDir = path.join(stage, 'build');
  await build({root, configLoader: 'native', logLevel: 'warn', build: {outDir, emptyOutDir: true, copyPublicDir: false, sourcemap: false}});
  if (files(outDir).some(file => file.endsWith('.map'))) throw new Error('the web build wrote source maps');
  return outDir;
}

/** The text of a launcher or the guide in the line ends of its system. */
const withLineEnds = (text, crlf) => (crlf ? text.replace(/\r?\n/g, '\r\n') : text);
const guide = () => withLineEnds(fs.readFileSync(path.join(browser, GUIDE), 'utf8'), true);

/** Assembles stage/<name>/ from the build, the payload and the runtime; moves the build and the payload into game/. */
function assemble(buildDir, payloadDir, runtime, notices) {
  const target = path.join(stage, name), game = path.join(target, 'game');
  fs.mkdirSync(target);
  fs.renameSync(payloadDir, game);
  for (const entry of BUILD_ENTRIES) {
    if (fs.existsSync(path.join(game, entry))) throw new Error(`public/ holds ${entry}, which the build owns`);
    fs.renameSync(path.join(buildDir, entry), path.join(game, entry));
  }
  for (const [platform, binary] of Object.entries(runtime.binaries)) {
    const folder = path.join(target, 'runtime', platform), file = path.join(folder, pin.runtimes[platform].binary);
    clone(binary, file);
    fs.chmodSync(file, EXECUTABLE);
    clone(runtime.license, path.join(folder, 'LICENSE'));
  }
  clone(path.join(browser, 'server.mjs'), path.join(target, 'server.mjs'));
  clone(notices, path.join(target, 'THIRD-PARTY-NOTICES.txt'));
  const text = file => fs.readFileSync(path.join(browser, file), 'utf8');
  fs.writeFileSync(path.join(target, '启动游戏-Windows.bat'), withLineEnds(text('launch-windows.bat'), true));
  fs.writeFileSync(path.join(target, '启动游戏-macOS.command'), text('launch-macos.command'), {mode: EXECUTABLE});
  fs.chmodSync(path.join(target, '启动游戏-macOS.command'), EXECUTABLE);
  fs.writeFileSync(path.join(target, GUIDE), guide());
  return target;
}

/**
 * The ZIP's entries: the launchers and texts first and game/payload.json last, so an extraction cut short lacks payload.json and
 * server.mjs says the files are incomplete. Refuses names Windows cannot create or that differ only in case.
 */
function zipEntries(folder) {
  const all = files(folder), first = all.filter(file => !file.includes('/')), last = 'game/payload.json';
  const ordered = [...first, ...all.filter(file => file.includes('/') && file !== last), last];
  const seen = new Map(), problems = [];
  for (const file of ordered) {
    const lower = file.toLowerCase();
    if (seen.has(lower)) problems.push(`${file} and ${seen.get(lower)} differ only in case`);
    seen.set(lower, file);
    if (WINDOWS_INVALID.test(file)) problems.push(`${file}: not a valid Windows name`);
    if (`${name}/${file}`.length > MAX_WINDOWS_PATH) problems.push(`${file}: path too long for Windows`);
  }
  if (problems.length) throw new Error(problems.join('\n'));
  return ordered.map(file => {
    const source = path.join(folder, file), mode = fs.statSync(source).mode & EXECUTE_BITS ? EXECUTABLE : READABLE;
    return {name: `${name}/${file}`, source, mode};
  });
}

fs.rmSync(stage, {recursive: true, force: true});
fs.mkdirSync(stage, {recursive: true});
const runtime = await nodeRuntime(), buildDir = await buildGame(), notices = path.join(stage, 'THIRD-PARTY-NOTICES.txt');
run(process.execPath, [path.join(here, 'third-party-notices.mjs'), '--node-license', runtime.license, '--out', notices]);
run('python3', [path.join(here, 'stage_payload.py'), '--out', path.join(stage, 'payload'), '--notices', notices]);
run(process.execPath, [path.join(root, 'tools/verification/payload.mjs'), '--dist', buildDir, '--payload', path.join(stage, 'payload/public')]);
const folder = assemble(buildDir, path.join(stage, 'payload/public'), runtime, notices), entries = zipEntries(folder);
const zip = path.join(out, `${name}-browser.zip`), started = performance.now();
const written = writeZip(`${zip}.part`, entries);
fs.renameSync(`${zip}.part`, zip);
fs.writeFileSync(path.join(out, GUIDE), guide());
const unpacked = entries.reduce((sum, entry) => sum + fs.statSync(entry.source).size, 0);
console.log(`${path.relative(root, zip)}: ${written.entries} of at most ${MAX_ENTRIES} entries (${written.deflated} deflated), `
  + `${(written.bytes / 2 ** 30).toFixed(2)} GiB (${written.bytes} B) for ${(unpacked / 2 ** 30).toFixed(2)} GiB unpacked, `
  + `zipped in ${((performance.now() - started) / 1000).toFixed(0)} s; no ZIP64`);
if (!args.keep) fs.rmSync(stage, {recursive: true, force: true});
