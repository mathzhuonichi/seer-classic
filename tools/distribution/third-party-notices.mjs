/**
 * Writes THIRD-PARTY-NOTICES.txt for the browser package: the asset notice, then every npm package whose code is in the web build
 * (the modules Rolldown actually bundles, not `npm ls`: @seer-pet-anim/swf-bundle's AGPL dependency, for one, is never bundled),
 * Ruffle (emitted as files) with the Rust crates of its WebAssembly and the npm packages of its ruffle.js
 * (tools/distribution/ruffle-licenses.json), and the Node.js runtime with its LICENSE. Each license text is printed once.
 *
 * Usage: node tools/distribution/third-party-notices.mjs --node-license <Node's LICENSE> --out <file>
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {build} from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const {values: args} = parseArgs({options: {out: {type: 'string'}, 'node-license': {type: 'string'}}});
if (!args.out || !args['node-license']) throw new Error('usage: --node-license <file> --out <file>');
const out = path.resolve(root, args.out);
const LICENSE_FILE = /^(licen[cs]e|copying|notice|unlicense)/i;
/** Packages whose code the bundler injects through virtual modules, and Ruffle, which the build copies as files. */
const VIRTUAL = [[/^\0vite\//, 'vite'], [/^\0rolldown\//, 'rolldown']];
const EMITTED = ['@ruffle-rs/ruffle'];
/** Vite's LICENSE.md goes on with its own bundled dependencies, none of which reach the game. */
const OWN_PART = {vite: text => text.split('\n# Licenses of bundled dependencies')[0]};
const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy,
modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

/** The license files in a package folder, as {name, text}. */
function licenseFiles(dir, name) {
  return fs.readdirSync(dir).filter(file => LICENSE_FILE.test(file) && fs.statSync(path.join(dir, file)).isFile()).sort()
    .map(file => ({file, text: (OWN_PART[name] ?? (text => text))(fs.readFileSync(path.join(dir, file), 'utf8')).trim()}));
}

/** The npm packages with code in the web build: an in-memory build with the project's configuration. */
async function bundledPackages() {
  const output = await build({root, configLoader: 'native', logLevel: 'error', build: {write: false, copyPublicDir: false}});
  const names = new Set(EMITTED);
  for (const chunk of [output].flat().flatMap(result => result.output)) {
    for (const id of chunk.type === 'chunk' ? chunk.moduleIds : []) {
      const name = id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1] ?? VIRTUAL.find(([pattern]) => pattern.test(id))?.[1];
      if (name) names.add(name);
    }
  }
  return [...names].sort().map(name => {
    const dir = path.join(root, 'node_modules', name), meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const author = typeof meta.author === 'string' ? meta.author : meta.author?.name;
    return {name, version: meta.version, license: meta.license, authors: author ? [author] : [], texts: licenseFiles(dir, name)};
  });
}

/** Ruffle's crates and bundled packages, as recorded for the installed Ruffle by tools/distribution/ruffle_licenses.mjs. */
function ruffleThirdParty() {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'tools/distribution/ruffle-licenses.json'), 'utf8'));
  const installed = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/@ruffle-rs/ruffle/package.json'), 'utf8')).version;
  if (data.ruffle !== installed) throw new Error(`ruffle-licenses.json is of Ruffle ${data.ruffle}, not ${installed}: run ruffle_licenses.mjs`);
  const unpack = entries => entries.map(entry => ({...entry, texts: entry.texts.map(([file, index]) => ({file, text: data.texts[index]}))}));
  return {crates: unpack(data.crates), packages: unpack(data.packages), target: data.target};
}

/** The Node.js runtime of the browser package (tools/distribution/browser/node-runtime.json) with its LICENSE. */
function nodeRuntime() {
  const {version} = JSON.parse(fs.readFileSync(path.join(root, 'tools/distribution/browser/node-runtime.json'), 'utf8'));
  return [{name: 'Node.js', version, license: 'MIT, with the licenses of the components it bundles (in its LICENSE)',
    repository: 'https://github.com/nodejs/node', authors: [], texts: [{file: 'LICENSE', text: fs.readFileSync(args['node-license'], 'utf8').trim()}]}];
}

/**
 * A package that ships no license file gets the MIT text with its authors when MIT is one of its licenses, else the text of a
 * package in the same set under the same single license.
 */
function fillMissing(entries) {
  for (const entry of entries.filter(item => !item.texts.length)) {
    if (/\bMIT\b/.test(entry.license ?? '')) {
      const holders = entry.authors.length ? entry.authors.join(', ') : `the ${entry.name} authors`;
      entry.texts = [{file: 'MIT (no license file in the package)', text: `MIT License\n\nCopyright (c) ${holders}\n\n${MIT_TEXT}`}];
      continue;
    }
    const donor = entries.find(item => item.texts.length && item.license === entry.license);
    if (!donor) throw new Error(`${entry.name} ${entry.version} (${entry.license}) ships no license text and none can stand in`);
    entry.texts = donor.texts.map(text => ({...text, file: `${entry.license} text as shipped by ${donor.name}; copyright ${entry.authors.join(', ')}`}));
  }
  return entries;
}

function render(sections) {
  const notice = fs.readFileSync(path.join(root, 'src/app/asset-notice.txt'), 'utf8').trim();
  const lines = ['赛尔经典 · Seer Classic — 第三方声明 / Third-party notices', '', notice, '',
    'The game\'s code uses the open-source packages below under the licenses named. Their license texts follow, each printed once',
    'with the packages it covers.', ''];
  const texts = new Map();
  for (const [title, entries] of sections) {
    lines.push(`== ${title} (${entries.length}) ==`, '');
    for (const entry of entries) {
      lines.push(`${entry.name} ${entry.version} — ${entry.license ?? 'see its license text'}${entry.repository ? ` — ${entry.repository}` : ''}`);
      for (const {file, text} of entry.texts) {
        if (!texts.has(text)) texts.set(text, []);
        texts.get(text).push(`${entry.name} ${entry.version} (${file})`);
      }
    }
    lines.push('');
  }
  lines.push('== License texts ==', '');
  for (const [text, users] of texts) lines.push('-'.repeat(100), `For: ${users.join('; ')}`, '', text, '');
  return lines.join('\n') + '\n';
}

const ruffle = ruffleThirdParty();
const sections = [['JavaScript packages in the game code', fillMissing(await bundledPackages())],
  [`Rust crates in Ruffle's WebAssembly (${ruffle.target})`, fillMissing(ruffle.crates)],
  ['JavaScript packages in Ruffle\'s ruffle.js', fillMissing(ruffle.packages)],
  ['Node.js runtime (runtime/, runs server.mjs)', nodeRuntime()]];
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, render(sections));
console.log(`${path.relative(root, out)}: ${sections.map(([title, entries]) => `${entries.length} ${title.split(' ')[0]}`).join(', ')}, `
  + `${(fs.statSync(out).size / 1024).toFixed(0)} KiB`);
