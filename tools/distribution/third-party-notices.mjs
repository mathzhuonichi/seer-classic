/**
 * Writes THIRD-PARTY-NOTICES.txt for the desktop package: the asset notice, then every npm package whose code is in the
 * desktop build (the modules Rolldown actually bundles, not `npm ls`: @seer-pet-anim/swf-bundle's AGPL dependency, for one, is
 * never bundled), Ruffle (emitted as files), and every Rust crate the app executable links for the target, each with its
 * license texts. Identical texts are printed once.
 *
 * Usage: node tools/distribution/third-party-notices.mjs [--target aarch64-apple-darwin] [--out releases/desktop-notices/THIRD-PARTY-NOTICES.txt]
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {build} from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const {values: args} = parseArgs({options: {target: {type: 'string', default: 'aarch64-apple-darwin'},
  out: {type: 'string', default: 'releases/desktop-notices/THIRD-PARTY-NOTICES.txt'}}});
const {target} = args, out = path.resolve(root, args.out);
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

/** The npm packages with code in the desktop build: an in-memory build with the project's desktop configuration. */
async function bundledPackages() {
  const output = await build({root, mode: 'desktop', configLoader: 'native', logLevel: 'error', build: {write: false}});
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

/** The crates the executable links for `target`: those reachable from the shell through normal dependencies. */
function linkedCrates() {
  const manifest = path.join(root, 'src-tauri/Cargo.toml');
  const meta = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1', '--manifest-path', manifest, '--filter-platform', target],
    {maxBuffer: 1 << 28, encoding: 'utf8'}));
  const packages = new Map(meta.packages.map(entry => [entry.id, entry])), nodes = new Map(meta.resolve.nodes.map(node => [node.id, node]));
  const reached = new Set(), stack = [meta.resolve.root];
  while (stack.length) {
    const id = stack.pop();
    if (reached.has(id)) continue;
    reached.add(id);
    for (const dep of nodes.get(id).deps) if (dep.dep_kinds.some(kind => kind.kind === null)) stack.push(dep.pkg);
  }
  reached.delete(meta.resolve.root);
  return [...reached].map(id => packages.get(id)).sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
    .map(crate => ({name: crate.name, version: crate.version, license: crate.license, authors: crate.authors ?? [],
      repository: crate.repository, texts: licenseFiles(path.dirname(crate.manifest_path), crate.name)}));
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

const sections = [['JavaScript packages in the game code', fillMissing(await bundledPackages())],
  [`Rust crates in the app executable (${target})`, fillMissing(linkedCrates())]];
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, render(sections));
console.log(`${path.relative(root, out)}: ${sections.map(([title, entries]) => `${entries.length} ${title.split(' ')[0]}`).join(', ')}, `
  + `${(fs.statSync(out).size / 1024).toFixed(0)} KiB`);
