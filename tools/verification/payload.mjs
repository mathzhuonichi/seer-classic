/**
 * The browser package's release gate on its two inputs, before they become its game/ folder: the web build without public/ and
 * the staged payload (tools/distribution/stage_payload.py). `npm run package` (tools/distribution/pack_browser.mjs) runs it
 * before zipping.
 *
 * - The build holds only index.html, assets/ and ruffle/, and no source map.
 * - payload.json is of this version and matches the staged files (count, sizes and SHA-256); the payload holds every file of
 *   public/ except the exclusion list (tools/distribution/payload-exclusions.json), and no .DS_Store or .md file.
 * - Every path the minified build can request exists in the payload, and no excluded path is among them: the literal paths in
 *   its scripts, styles and page; its template paths (`/portraits/${…}.png`, a `<skillId>` placeholder), filled with every
 *   payload or public file they match whose filled-in parts are numbers or string literals of the build; and the paths that
 *   requested SVG, CSS and JSON files name in turn. A dynamic path the gate cannot read fails it: a concatenation or template
 *   with a known top folder after an expression, and a template to an asset file whose folder comes from an expression.
 *
 * Usage: node tools/verification/payload.mjs --dist <web build> --payload <staged payload>/public
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {parseSync} from 'vite';
import {LOCK, lockFrom, trackedPublic} from '../distribution/art-pack.mjs';
import {root, suite} from './_harness.mjs';

const {values: args} = parseArgs({options: {dist: {type: 'string'}, payload: {type: 'string'}}});
if (!args.dist || !args.payload) throw new Error('usage: --dist <web build> --payload <staged payload>/public');
const DIST = path.resolve(root, args.dist), PAYLOAD = path.resolve(root, args.payload), PUBLIC = path.join(root, 'public');
const DIST_ENTRIES = ['assets', 'index.html', 'ruffle'];
const MANIFEST = 'payload.json', NOTICES = 'THIRD-PARTY-NOTICES.txt';
/** Text assets whose references are followed, and the reference forms read in them. */
const TEXT_ASSET = /\.(svg|css|html|json)$/;
const ASSET_EXTENSIONS = 'png|webp|svg|jpg|jpeg|gif|json|gz|swf|m4a|mp3|woff2?|ttf';
const REFERENCE = new RegExp(`(?:href|src|url)\\s*=?\\s*\\(?\\s*["']?([^"')\\s>]+\\.(?:${ASSET_EXTENSIONS}))`, 'g');
/** A template part that ends a path at an asset file. */
const ASSET_END = new RegExp(`\\.(?:${ASSET_EXTENSIONS})$`);

/** Every file below `dir` as a POSIX path relative to it. */
const files = dir => fs.readdirSync(dir, {recursive: true, withFileTypes: true}).filter(entry => entry.isFile())
  .map(entry => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')).sort();
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function loadExclusions() {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'tools/distribution/payload-exclusions.json'), 'utf8'));
  const named = new Set(data.groups.flatMap(group => group.paths));
  return relative => named.has(relative) || data.names.includes(path.posix.basename(relative)) || data.suffixes.some(s => relative.endsWith(s));
}

/** Every node of an ESTree tree. */
function* nodes(node) {
  if (Array.isArray(node)) for (const item of node) yield* nodes(item);
  else if (node && typeof node === 'object') {
    if (typeof node.type === 'string') yield node;
    for (const [key, value] of Object.entries(node)) if (key !== 'type' && value && typeof value === 'object') yield* nodes(value);
  }
}

/** The strings of a JSON text (rolldown inlines large JSON as JSON.parse('…')). */
const jsonStrings = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(jsonStrings) : [];

/**
 * What the build's scripts hold, read from their syntax trees: every string (string literals, template parts without an
 * expression, the strings of inlined JSON), every template literal with expressions as its parts, and the string concatenations
 * that start with a string; the styles and the page as text; and every source, for the source map check.
 */
function readBuild() {
  const strings = new Set(), templates = [], concatenations = [], styles = [], sources = [];
  for (const file of files(DIST).filter(name => !name.startsWith('ruffle/'))) {
    const source = fs.readFileSync(path.join(DIST, file), 'utf8');
    sources.push(source);
    if (!file.endsWith('.js')) { if (/\.(css|html)$/.test(file)) styles.push(source); continue; }
    for (const node of nodes(parseSync(file, source).program)) {
      if (node.type === 'Literal' && typeof node.value === 'string') strings.add(node.value);
      else if (node.type === 'TemplateLiteral' && !node.expressions.length) strings.add(node.quasis[0].value.cooked);
      else if (node.type === 'TemplateLiteral') templates.push(node.quasis.map(quasi => quasi.value.cooked));
      else if (node.type === 'BinaryExpression' && node.operator === '+' && typeof node.left.value === 'string') concatenations.push(node.left.value);
      else if (node.type === 'CallExpression' && node.callee.property?.name === 'parse' && typeof node.arguments[0]?.value === 'string') {
        try { for (const value of jsonStrings(JSON.parse(node.arguments[0].value))) strings.add(value); } catch { /* not JSON */ }
      }
    }
  }
  return {strings, templates, concatenations, styles, sources};
}

/**
 * The paths the build can request: the paths in its strings and styles, its templates filled from the known files, and its
 * `<placeholder>` paths. Returns them with the dynamic paths the gate cannot read.
 */
function requestable({strings, templates, concatenations, styles}, known) {
  const tops = [...new Set(known.map(file => file.split('/')[0]))].map(escape).join('|');
  const publicPath = new RegExp(`/(?:${tops})(?:/(?:[^\\s"'\`()<>\\\\,;]|<\\w+>)*)?`, 'g'), found = new Set();
  const fill = pattern => {
    for (const file of known) if (file.match(pattern)?.slice(1).every(part => /^\d+$/.test(part) || strings.has(part))) found.add(file);
  };
  for (const text of [...strings, ...styles]) {
    for (const [literal] of text.matchAll(publicPath)) {
      const clean = literal.split(/[?#]/)[0].slice(1);
      if (/<\w+>/.test(clean)) fill(new RegExp(`^${escape(clean).replace(/<\w+>/g, '([^/]+)')}$`));
      else if (/\.\w+$/.test(clean)) found.add(clean);
    }
  }
  const prefix = new RegExp(`/(?:${tops})/`), unread = [];
  for (const parts of templates) {
    const at = parts[0].search(prefix);
    if (at >= 0) fill(new RegExp(`^${[parts[0].slice(at + 1), ...parts.slice(1)].map(escape).join('(.+?)')}$`));
    else if (parts.slice(1).some(part => prefix.test(part))) unread.push(parts.join('${…}'));
    // `/${folder}/${name}.png` names its folder through an expression; `/${name}.json`, with no slash after one, does not.
    else if (ASSET_END.test(parts.at(-1)) && parts.slice(1).some(part => part.includes('/'))) unread.push(parts.join('${…}'));
  }
  unread.push(...concatenations.filter(text => prefix.test(text) || new RegExp(`^/(?:${tops})$`).test(text)));
  return {found, unread};
}

/** Adds the files that requested SVG, CSS and JSON files reference, until nothing new is found. */
function followReferences(found, payload) {
  const missing = [], queue = [...found];
  while (queue.length) {
    const file = queue.pop();
    if (!TEXT_ASSET.test(file) || !payload.has(file)) continue;
    for (const [, reference] of fs.readFileSync(path.join(PAYLOAD, file), 'utf8').matchAll(REFERENCE)) {
      if (/^(data:|https?:)/.test(reference)) continue;
      const target = reference.startsWith('/') ? reference.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(file), reference));
      if (found.has(target)) continue;
      found.add(target);
      queue.push(target);
      if (!payload.has(target)) missing.push(`${target} (from ${file})`);
    }
  }
  return missing;
}

const {check, witness, finish} = suite('payload');
check('the build holds only the page, its assets and Ruffle, with no source map', () => {
  assert.deepEqual(fs.readdirSync(DIST).sort(), DIST_ENTRIES, 'the build\'s top level');
  const maps = files(DIST).filter(file => file.endsWith('.map'));
  assert.deepEqual(maps, [], 'source maps');
  assert.doesNotMatch(readBuild().sources.join('\n'), /sourceMappingURL/, 'source map references');
});
const staged = files(PAYLOAD), payload = new Set(staged), excluded = loadExclusions();
check('payload.json is of this version and matches the staged files', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PAYLOAD, MANIFEST), 'utf8'));
  assert.equal(manifest.version, JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version);
  const listed = Object.keys(manifest.entries).sort(), present = staged.filter(file => file !== MANIFEST);
  assert.deepEqual(present.filter(file => !manifest.entries[file]), [], 'staged files missing from payload.json');
  assert.deepEqual(listed.filter(file => !payload.has(file)), [], 'listed files missing from the payload');
  assert.equal(manifest.files, listed.length);
  assert.equal(manifest.bytes, listed.reduce((sum, file) => sum + manifest.entries[file][0], 0));
  const wrong = listed.filter(file => {
    const [size, digest] = manifest.entries[file], full = path.join(PAYLOAD, file);
    return fs.statSync(full).size !== size || sha256(full) !== digest;
  });
  assert.deepEqual(wrong, [], 'files whose size or SHA-256 differs from payload.json');
  witness('payload', {files: manifest.files, mebibytes: +(manifest.bytes / 2 ** 20).toFixed(1)});
});
check('the payload is public/ without the exclusion list, with no .DS_Store or .md', () => {
  assert.deepEqual(staged.filter(file => /(^|\/)\.DS_Store$|\.md$/.test(file)), []);
  const expected = files(PUBLIC).filter(file => !excluded(file));
  assert.deepEqual(expected.filter(file => !payload.has(file)), [], 'public files left out');
  assert.deepEqual(staged.filter(file => !expected.includes(file) && ![MANIFEST, NOTICES].includes(file)), [], 'unexpected payload files');
});
check('the payload\'s art (what Git does not track) is the frozen art pack of tools/distribution/art-pack.json', () => {
  const pack = JSON.parse(fs.readFileSync(LOCK, 'utf8')).entries;
  const art = lockFrom(JSON.parse(fs.readFileSync(path.join(PAYLOAD, MANIFEST), 'utf8')), trackedPublic()).entries;
  assert.deepEqual(Object.keys(art).filter(file => !pack[file]), [], 'art outside the pack (a new art version is the user\'s decision: ART.md)');
  assert.deepEqual(Object.keys(pack).filter(file => !art[file]), [], 'pack files missing from the payload');
  assert.deepEqual(Object.keys(art).filter(file => pack[file] && art[file].join() !== pack[file].join()), [], 'art that differs from the pack');
});
check('every path the build can request is in the payload, and none is excluded', () => {
  const known = [...new Set([...staged, ...files(PUBLIC)])], {found, unread} = requestable(readBuild(), known);
  const references = followReferences(found, payload);
  assert.deepEqual(unread, [], 'dynamic paths the gate cannot read');
  assert.deepEqual([...found].filter(file => excluded(file)).sort(), [], 'excluded paths the build can request');
  assert.deepEqual([...found].filter(file => !payload.has(file)).sort(), [], 'requestable paths missing from the payload');
  assert.deepEqual(references, [], 'references missing from the payload');
  const unrequested = staged.filter(file => !found.has(file));
  witness('requestable', {files: found.size, stagedButNotRequestable: unrequested.length, examples: unrequested.slice(0, 20)});
});
finish();
