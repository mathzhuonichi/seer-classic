/**
 * Writes tools/distribution/ruffle-licenses.json: the third-party code inside the installed Ruffle (@ruffle-rs/ruffle), which
 * its npm package does not list. That is every Rust crate its WebAssembly links (cargo tree of ruffle_web for wasm32 with the
 * features of Ruffle's release build) and every npm package its ruffle.js bundles (the sources of ruffle.js.map), each with its
 * license texts, read from the crate sources and the npm tarballs (checked against package-lock.json's integrity). A license
 * that no package ships a text for gets the SPDX text. third-party-notices.mjs prints it; it refuses a file of another Ruffle.
 *
 * Needs git, cargo and the network (Node: NODE_USE_ENV_PROXY=1 behind a proxy). Everything is fetched into --work, outside the
 * repository: a sparse checkout of Ruffle's manifests at its release tag and a CARGO_HOME with the crate sources (about 0.5 GB).
 *
 * Usage: node tools/distribution/ruffle_licenses.mjs --work <scratch folder>
 */
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(root, 'tools/distribution/ruffle-licenses.json');
const RUFFLE = path.join(root, 'node_modules/@ruffle-rs/ruffle');
const REPOSITORY = 'https://github.com/ruffle-rs/ruffle.git';
/** Ruffle's release workflow builds the web package with these cargo features (CARGO_FEATURES in release.yml). */
const FEATURES = 'jpegxr';
const TARGET = 'wasm32-unknown-unknown';
/** The SPDX license list release whose texts stand in where no package ships one. */
const SPDX_TEXT = id => `https://raw.githubusercontent.com/spdx/license-list-data/v3.27.0/text/${id}.txt`;
const LICENSE_FILE = /^(licen[cs]e|copying|notice|unlicense)/i;
const SPARSE = ['/Cargo.toml', '/Cargo.lock', '**/Cargo.toml', '/web/package-lock.json'];

const {values: args} = parseArgs({options: {work: {type: 'string'}}});
if (!args.work) throw new Error('usage: ruffle_licenses.mjs --work <scratch folder>');
const work = path.resolve(args.work), checkout = path.join(work, 'ruffle'), cargoHome = path.join(work, 'cargo-home');
const run = (command, argv, options = {}) => execFileSync(command, argv, {encoding: 'utf8', maxBuffer: 1 << 28, ...options});

/** Ruffle's manifests at the release tag, with empty sources for the targets cargo looks for. Returns the commit. */
function fetchManifests(version) {
  if (!fs.existsSync(path.join(checkout, '.git'))) {
    run('git', ['init', '-q', checkout]);
    run('git', ['-C', checkout, 'remote', 'add', 'origin', REPOSITORY]);
  }
  run('git', ['-C', checkout, 'sparse-checkout', 'set', '--no-cone', ...SPARSE]);
  run('git', ['-C', checkout, 'fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', `refs/tags/v${version}`]);
  run('git', ['-C', checkout, 'checkout', '-q', 'FETCH_HEAD']);
  for (const manifest of fs.readdirSync(checkout, {recursive: true}).filter(file => path.basename(file) === 'Cargo.toml')) {
    const dir = path.join(checkout, path.dirname(manifest)), text = fs.readFileSync(path.join(dir, 'Cargo.toml'), 'utf8');
    const sources = [...text.matchAll(/^path = "([^"]+\.rs)"/gm)].map(match => match[1]);
    for (const source of dir === checkout ? [] : ['src/lib.rs', ...sources]) {
      fs.mkdirSync(path.dirname(path.join(dir, source)), {recursive: true});
      if (!fs.existsSync(path.join(dir, source))) fs.writeFileSync(path.join(dir, source), '');
    }
  }
  return run('git', ['-C', checkout, 'rev-parse', 'HEAD']).trim();
}

/** The license files of a folder, as {file, text}. */
const licenseTexts = dir => fs.readdirSync(dir).filter(file => LICENSE_FILE.test(file) && fs.statSync(path.join(dir, file)).isFile()).sort()
  .map(file => ({file, text: fs.readFileSync(path.join(dir, file), 'utf8').trim()}));

/** The crates the WebAssembly links, from cargo tree, described from cargo metadata (which also downloads their sources). */
function linkedCrates() {
  const env = {...process.env, CARGO_HOME: cargoHome}, manifest = path.join(checkout, 'web/Cargo.toml');
  const meta = JSON.parse(run('cargo', ['metadata', '--format-version', '1', '--locked', '--manifest-path', manifest,
    '--filter-platform', TARGET, '--features', FEATURES], {env}));
  const tree = run('cargo', ['tree', '--offline', '--locked', '--manifest-path', manifest, '-p', 'ruffle_web', '--target', TARGET,
    '-e', 'normal', '--features', FEATURES, '--prefix', 'none', '-f', '{p}'], {env});
  const linked = new Set(tree.split('\n').map(line => line.match(/^(\S+) v(\S+)/)).filter(Boolean).map(([, name, version]) => `${name}@${version}`));
  return meta.packages.filter(crate => crate.source && linked.has(`${crate.name}@${crate.version}`))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
    .map(crate => ({name: crate.name, version: crate.version, license: crate.license, authors: crate.authors ?? [],
      repository: crate.repository, texts: crateTexts(crate)}));
}

/** A crate's license files; a crate of a git repository may keep them at the repository's root (git/checkouts/<repo>/<rev>/). */
function crateTexts(crate) {
  const dir = path.dirname(crate.manifest_path), own = licenseTexts(dir), checkouts = path.join(cargoHome, 'git', 'checkouts');
  if (own.length || !crate.source.startsWith('git+')) return own;
  const [repository, revision] = path.relative(checkouts, dir).split(path.sep);
  return licenseTexts(path.join(checkouts, repository, revision));
}

/** The npm packages ruffle.js bundles: the node_modules folders among its source map's sources, with their license files. */
async function bundledPackages() {
  const sources = JSON.parse(fs.readFileSync(path.join(RUFFLE, 'ruffle.js.map'), 'utf8')).sources;
  const names = [...new Set(sources.map(source => source.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1]).filter(Boolean))].sort();
  const lock = JSON.parse(fs.readFileSync(path.join(checkout, 'web/package-lock.json'), 'utf8')).packages;
  const packages = [];
  for (const name of names) {
    const entry = lock[`node_modules/${name}`];
    const tarball = Buffer.from(await (await fetch(entry.resolved)).arrayBuffer());
    const [algorithm, digest] = entry.integrity.split('-');
    if (crypto.createHash(algorithm).update(tarball).digest('base64') !== digest) throw new Error(`${name}: integrity differs from package-lock.json`);
    const dir = path.join(work, 'npm', name.replace('/', '__'));
    fs.rmSync(dir, {recursive: true, force: true});
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'package.tgz'), tarball);
    run('tar', ['-xzf', path.join(dir, 'package.tgz'), '-C', dir]);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'package/package.json'), 'utf8'));
    const author = typeof meta.author === 'string' ? meta.author : meta.author?.name;
    packages.push({name, version: entry.version, license: entry.license, authors: author ? [author] : [],
      repository: typeof meta.repository === 'string' ? meta.repository : meta.repository?.url, texts: licenseTexts(path.join(dir, 'package'))});
  }
  return packages;
}

/**
 * Gives the SPDX text to a package that ships no license text, when its license is not MIT (third-party-notices.mjs writes the
 * MIT text with its authors) and no package of the set ships a text under the same license.
 */
async function fillFromSpdx(entries) {
  const fetched = new Map();
  for (const entry of entries.filter(item => !item.texts.length && item.license && !/\bMIT\b/.test(item.license))) {
    if (entries.some(item => item.texts.length && item.license === entry.license)) continue;
    if (!fetched.has(entry.license)) {
      const response = await fetch(SPDX_TEXT(entry.license));
      if (!response.ok) throw new Error(`no SPDX text for ${entry.license} (${entry.name})`);
      fetched.set(entry.license, (await response.text()).trim());
    }
    entry.texts = [{file: `${entry.license} text from the SPDX license list (the package ships none)`, text: fetched.get(entry.license)}];
  }
}

/** Stores each distinct text once: entries name texts by their index. */
function pack(entries, texts) {
  return entries.map(({texts: own, ...entry}) => ({...entry, texts: own.map(({file, text}) => {
    if (!texts.includes(text)) texts.push(text);
    return [file, texts.indexOf(text)];
  })}));
}

const version = JSON.parse(fs.readFileSync(path.join(RUFFLE, 'package.json'), 'utf8')).version;
fs.mkdirSync(work, {recursive: true});
const commit = fetchManifests(version), crates = linkedCrates(), packages = await bundledPackages(), texts = [];
await fillFromSpdx([...crates, ...packages]);
const output = {
  about: 'Generated by tools/distribution/ruffle_licenses.mjs for tools/distribution/third-party-notices.mjs; regenerate it when Ruffle changes.',
  ruffle: version, commit, target: TARGET, features: FEATURES, crates: pack(crates, texts), packages: pack(packages, texts), texts,
};
fs.writeFileSync(OUT, JSON.stringify(output, null, 1) + '\n');
console.log(`${path.relative(root, OUT)}: Ruffle ${version} (${commit.slice(0, 9)}), ${crates.length} crates, ${packages.length} npm packages, `
  + `${texts.length} texts, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KiB`);
